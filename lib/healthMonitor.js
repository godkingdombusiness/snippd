/**
 * lib/healthMonitor.js — Self-Healing Memory: Engine
 *
 * Runs on EVERY app load. Executes 6 diagnostic checks, auto-heals what it
 * can, and uses its own historical log to detect recurring patterns and
 * escalate proactively — before the user ever sees an error.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  PHASE 1 (parallel, pre-auth)                                    │
 * │    ├─ secure_store        — write/read/delete test key           │
 * │    ├─ async_storage       — JSON integrity + stale cache sweep   │
 * │    └─ cache_staleness     — clear expired weekly-plan / cart     │
 * │                                                                   │
 * │  PHASE 2 (sequential, post-phase-1)                              │
 * │    └─ supabase_connectivity — HEAD ping with 5s timeout          │
 * │                                                                   │
 * │  PHASE 3 (depends on Supabase being reachable)                   │
 * │    └─ session_integrity   — JWT expiry check + auto-refresh      │
 * │                                                                   │
 * │  PHASE 4 (post-login, called separately)                         │
 * │    └─ user_persona        — persona row existence check          │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Healing actions never throw. Every result is written to HealingLog.
 *
 * Usage in App.js:
 *   import { HealthMonitor } from './lib/healthMonitor';
 *
 *   const health = await HealthMonitor.runStartupChecks();
 *   if (health.forcedSignOut) { ... route to Auth }
 *
 *   // After login:
 *   await HealthMonitor.runAuthChecks(userId, health.sessionId);
 */

import AsyncStorage  from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase, SUPABASE_URL } from './supabase';
import { HealingLog } from './healingLog';

// ── Constants ──────────────────────────────────────────────────
export const CHECK = {
  SECURE_STORE:    'secure_store',
  ASYNC_STORAGE:   'async_storage',
  CACHE_STALENESS: 'cache_staleness',
  SUPABASE:        'supabase_connectivity',
  SESSION:         'session_integrity',
  USER_PERSONA:    'user_persona',
};

export const STATUS = {
  OK:       'ok',
  WARNING:  'warning',
  CRITICAL: 'critical',
};

// SecureStore keys Supabase uses for auth tokens
const SUPABASE_SECURE_KEYS = [
  'supabase.auth.token',
  'supabase-anon-key-storage-item',
  'snippd-auth-token',
];

// AsyncStorage keys whose JSON must stay valid
const CRITICAL_ASYNC_KEYS = ['snippd_cart', 'snippd_weekly_plan', 'snippd_user_prefs'];

// AsyncStorage caches that expire (key → max age in days)
const STALEABLE_CACHES = {
  snippd_weekly_plan: 7,
  snippd_cart:        14,
  snippd_stack_cache: 3,
};

// ── Utility ────────────────────────────────────────────────────

function stamp() {
  return Date.now();
}

function elapsed(start) {
  return Date.now() - start;
}

function makeSessionId() {
  return `hm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getAppVersion() {
  try {
    // expo-constants is a standard Expo SDK dep — safe to require
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    return (
      Constants?.expoConfig?.version ??
      Constants?.manifest?.version ??
      '0.0.0'
    );
  } catch {
    return '0.0.0';
  }
}

/**
 * Decode a JWT payload without a library.
 * Base64url → base64 → JSON. Returns null on any error.
 */
function decodeJwt(token) {
  try {
    const [, part] = token.split('.');
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/**
 * Returns true if the token is expired or within 90 seconds of expiring.
 * Treats unparseable tokens as expired.
 */
function isTokenExpired(token) {
  const payload = decodeJwt(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 > payload.exp - 90;
}

// ── Result builder ─────────────────────────────────────────────

function ok(check, start, extra = {}) {
  return { check, status: STATUS.OK, issue: null, healed: false, healAction: null, duration_ms: elapsed(start), ...extra };
}

function warn(check, start, issue, healed = false, healAction = null, extra = {}) {
  return { check, status: STATUS.WARNING, issue, healed, healAction, duration_ms: elapsed(start), ...extra };
}

function critical(check, start, issue, healed = false, healAction = null, extra = {}) {
  return { check, status: STATUS.CRITICAL, issue, healed, healAction, duration_ms: elapsed(start), ...extra };
}

// ── Pattern-aware escalation ───────────────────────────────────
//
// If a check has failed 5+ times in the last 30 days, we treat a current
// 'warning' as 'critical' — the system has learned this is a real problem.

async function maybeEscalate(result) {
  if (result.status === STATUS.OK) return result;

  const pattern = await HealingLog.getPattern(result.check, 30);
  if (pattern.isChronic) {
    return {
      ...result,
      status: STATUS.CRITICAL,
      issue: `${result.issue} [CHRONIC — ${pattern.failureCount} failures in 30 days]`,
    };
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// CHECKS
// ─────────────────────────────────────────────────────────────

// ── 1. SecureStore ─────────────────────────────────────────────
async function checkSecureStore() {
  const t = stamp();
  const TEST_KEY = 'snippd_health_test_v1';
  const TEST_VAL = `ok_${Date.now()}`;

  try {
    await SecureStore.setItemAsync(TEST_KEY, TEST_VAL);
    const read = await SecureStore.getItemAsync(TEST_KEY);
    await SecureStore.deleteItemAsync(TEST_KEY);

    if (read !== TEST_VAL) {
      // Read/write mismatch — SecureStore is corrupted
      // Healing: clear all known Supabase auth keys to unblock startup
      let healed = false;
      const healAction = 'Cleared auth SecureStore keys (read/write mismatch)';
      for (const key of SUPABASE_SECURE_KEYS) {
        await SecureStore.deleteItemAsync(key).catch(() => {});
      }
      healed = true;

      return await maybeEscalate(
        critical(CHECK.SECURE_STORE, t, 'SecureStore read/write mismatch', healed, healAction, { forcedSignOut: healed })
      );
    }

    return ok(CHECK.SECURE_STORE, t);
  } catch (err) {
    // SecureStore is fully broken — try to clear auth keys anyway
    let healed = false;
    let healAction = null;
    try {
      for (const key of SUPABASE_SECURE_KEYS) {
        await SecureStore.deleteItemAsync(key).catch(() => {});
      }
      healed = true;
      healAction = 'Cleared auth SecureStore keys after failure';
    } catch {
      // Can't clear — device-level issue, not our fault
    }

    return await maybeEscalate(
      critical(CHECK.SECURE_STORE, t,
        `SecureStore error: ${err?.message ?? 'unknown'}`,
        healed, healAction,
        { forcedSignOut: healed }
      )
    );
  }
}

// ── 2. AsyncStorage ────────────────────────────────────────────
async function checkAsyncStorage() {
  const t = stamp();
  const TEST_KEY = 'snippd_async_health_test_v1';
  const TEST_VAL = JSON.stringify({ ok: true, ts: Date.now() });

  try {
    // Functional test
    await AsyncStorage.setItem(TEST_KEY, TEST_VAL);
    const read = await AsyncStorage.getItem(TEST_KEY);
    await AsyncStorage.removeItem(TEST_KEY);

    if (!read || !JSON.parse(read)?.ok) {
      return await maybeEscalate(
        warn(CHECK.ASYNC_STORAGE, t, 'AsyncStorage integrity test returned wrong value')
      );
    }

    // Scan critical keys for invalid JSON
    const corrupted = [];
    for (const key of CRITICAL_ASYNC_KEYS) {
      const val = await AsyncStorage.getItem(key).catch(() => null);
      if (val !== null) {
        try {
          JSON.parse(val);
        } catch {
          corrupted.push(key);
          await AsyncStorage.removeItem(key).catch(() => {});
        }
      }
    }

    if (corrupted.length > 0) {
      return await maybeEscalate(
        warn(CHECK.ASYNC_STORAGE, t,
          `Corrupted cache keys cleared: ${corrupted.join(', ')}`,
          true,
          `Auto-cleared ${corrupted.length} invalid JSON key(s): ${corrupted.join(', ')}`
        )
      );
    }

    return ok(CHECK.ASYNC_STORAGE, t);
  } catch (err) {
    return await maybeEscalate(
      critical(CHECK.ASYNC_STORAGE, t, `AsyncStorage error: ${err?.message ?? 'unknown'}`)
    );
  }
}

// ── 3. Cache Staleness ─────────────────────────────────────────
async function checkCacheStaleness() {
  const t = stamp();
  const cleared = [];

  for (const [key, maxDays] of Object.entries(STALEABLE_CACHES)) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      // Accept any of these timestamp fields
      const ts =
        parsed?.cached_at ??
        parsed?.generated_at ??
        parsed?.created_at ??
        parsed?.timestamp ??
        null;

      if (!ts) continue;

      const ageDays = (Date.now() - new Date(ts).getTime()) / 86_400_000;
      if (ageDays > maxDays) {
        await AsyncStorage.removeItem(key).catch(() => {});
        cleared.push(key);
      }
    } catch {
      // Can't read this key — skip it
    }
  }

  if (cleared.length > 0) {
    return warn(
      CHECK.CACHE_STALENESS, t,
      `Stale caches cleared: ${cleared.join(', ')}`,
      true,
      `Auto-cleared ${cleared.length} stale cache key(s) (exceeded max age)`
    );
  }

  return ok(CHECK.CACHE_STALENESS, t);
}

// ── 4. Supabase Connectivity ───────────────────────────────────
async function checkSupabase() {
  const t = stamp();

  if (!SUPABASE_URL) {
    return critical(CHECK.SUPABASE, t, 'SUPABASE_URL is not configured');
  }

  // On web the unauthenticated HEAD ping always produces a 401 in the browser
  // network panel (which can't be suppressed). Skip the raw fetch on web and
  // use the Supabase JS client instead — same signal, no console noise.
  if (Platform.OS === 'web') {
    try {
      await supabase.from('snippd_integrations').select('key').limit(1);
      return ok(CHECK.SUPABASE, stamp());
    } catch (_) {
      return warn(CHECK.SUPABASE, stamp(), 'Supabase unreachable on web');
    }
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method:  'HEAD',
      signal:  controller.signal,
      headers: {
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
    });
    clearTimeout(timeout);

    // 200, 400, or 401 all mean Supabase is responding
    const reachable = [200, 400, 401].includes(res.status);
    if (!reachable) {
      return await maybeEscalate(
        warn(CHECK.SUPABASE, t, `Supabase returned unexpected HTTP ${res.status}`)
      );
    }

    const ms = elapsed(t);
    if (ms > 3000) {
      return warn(CHECK.SUPABASE, t, `Supabase is slow (${ms}ms response time)`);
    }

    return ok(CHECK.SUPABASE, t);
  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = err?.name === 'AbortError';
    return await maybeEscalate(
      critical(CHECK.SUPABASE, t,
        isTimeout
          ? 'Supabase unreachable — timed out after 5s'
          : `Supabase unreachable: ${err?.message ?? 'network error'}`
      )
    );
  }
}

// ── 5. Session Integrity ───────────────────────────────────────
async function checkSession() {
  const t = stamp();

  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      // Broken session state — sign out locally to unblock the app
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      return await maybeEscalate(
        critical(CHECK.SESSION, t,
          `Session load error: ${error.message}`,
          true, 'Signed out locally to clear broken session state',
          { forcedSignOut: true }
        )
      );
    }

    // No session — user is logged out. Normal state, not an error.
    if (!session) {
      return ok(CHECK.SESSION, t);
    }

    // Check JWT expiry
    if (isTokenExpired(session.access_token)) {
      // Attempt to refresh before concluding it's broken
      const { error: refreshErr } = await supabase.auth.refreshSession();

      if (refreshErr) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        return await maybeEscalate(
          critical(CHECK.SESSION, t,
            'Session expired — refresh failed. User must sign in again.',
            true, 'Cleared expired session (refresh token rejected)',
            { forcedSignOut: true }
          )
        );
      }

      // Refresh succeeded
      return warn(CHECK.SESSION, t,
        'Session was near expiry',
        true, 'Pre-emptively refreshed session token'
      );
    }

    return ok(CHECK.SESSION, t);
  } catch (err) {
    return warn(CHECK.SESSION, t, `Session check failed: ${err?.message ?? 'unknown'}`);
  }
}

// ── 6. User Persona (post-login only) ─────────────────────────
async function checkUserPersona(userId) {
  const t = stamp();

  try {
    const { data, error } = await supabase
      .from('user_persona')
      .select('user_id, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return warn(CHECK.USER_PERSONA, t,
        `Persona query error: ${error.message}`
      );
    }

    if (!data) {
      return warn(CHECK.USER_PERSONA, t,
        'user_persona row missing for this user',
        false, null,
        { redirectTo: 'ConciergeOnboarding' }
      );
    }

    return ok(CHECK.USER_PERSONA, t);
  } catch (err) {
    return warn(CHECK.USER_PERSONA, t,
      `Persona check threw: ${err?.message ?? 'unknown'}`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

export const HealthMonitor = {

  /**
   * runStartupChecks()
   *
   * Call this on every app load, BEFORE auth. Runs all 5 pre-auth checks
   * in the most efficient order, logs everything, and returns a summary.
   *
   * Returns:
   *   {
   *     sessionId:    string,   — identifies this startup run in the log
   *     results:      Result[], — one per check
   *     healthy:      boolean,  — true if no criticals
   *     criticals:    Result[], — checks that are STATUS.CRITICAL
   *     healed:       Result[], — checks that were auto-fixed
   *     patterns:     object,   — chronic pattern data per failing check
   *     forcedSignOut: boolean, — true if session was cleared (app must go to Auth)
   *   }
   */
  runStartupChecks: async () => {
    const sessionId  = makeSessionId();
    const appVersion = getAppVersion();

    // Phase 1 — Infrastructure (fully parallel)
    const [secureStoreResult, asyncStorageResult, cacheResult] = await Promise.all([
      checkSecureStore(),
      checkAsyncStorage(),
      checkCacheStaleness(),
    ]);

    // Phase 2 — Network (sequential after phase 1 to avoid masking errors)
    const supabaseResult = await checkSupabase();

    // Phase 3 — Session (only meaningful if Supabase is reachable)
    const sessionResult =
      supabaseResult.status !== STATUS.CRITICAL
        ? await checkSession()
        : warn(CHECK.SESSION, stamp(),
            'Session check skipped — Supabase unreachable',
            false, null
          );

    const results = [
      secureStoreResult,
      asyncStorageResult,
      cacheResult,
      supabaseResult,
      sessionResult,
    ];

    // Analyse patterns (reads from the PREVIOUS log, so do this before writing)
    const patterns = {};
    for (const r of results.filter(r => r.status !== STATUS.OK)) {
      patterns[r.check] = await HealingLog.getPattern(r.check, 30);
    }

    // Persist to log (local + non-blocking cloud sync)
    await HealingLog.batchRecord(results, sessionId, appVersion, null);

    const criticals    = results.filter(r => r.status === STATUS.CRITICAL);
    const healed       = results.filter(r => r.healed);
    const forcedSignOut = results.some(r => r.forcedSignOut);

    return {
      sessionId,
      results,
      healthy: criticals.length === 0,
      criticals,
      healed,
      patterns,
      forcedSignOut,
    };
  },

  /**
   * runAuthChecks(userId, parentSessionId)
   *
   * Call this AFTER a successful login/session restore, with the user's ID.
   * Checks the user_persona row and logs against the same startup sessionId.
   *
   * Returns the user_persona check result.
   * If result.redirectTo is set, navigate there instead of resolveUserStatus.
   */
  runAuthChecks: async (userId, parentSessionId) => {
    const result     = await checkUserPersona(userId);
    const appVersion = getAppVersion();
    await HealingLog.batchRecord([result], parentSessionId, appVersion, userId);
    return result;
  },

  /**
   * getHealthScore()
   * Convenience proxy to HealingLog.getHealthScore().
   * Returns 0–100. Use on admin screens or FounderDashboard.
   */
  getHealthScore: () => HealingLog.getHealthScore(),

  /**
   * getLog(days?)
   * Return recent log entries. Default: last 7 days.
   * Use on admin screens to render the healing history.
   */
  getLog: (days = 7) => HealingLog.getRecent(days),

  /**
   * syncPendingLogs()
   * Push any offline-queued healing events to Supabase.
   * Call when the app detects a transition from offline → online.
   */
  syncPendingLogs: () => HealingLog.syncPending(),
};
