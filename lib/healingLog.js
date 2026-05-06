/**
 * lib/healingLog.js — Self-Healing Memory: Persistent Log
 *
 * Two-tier storage:
 *   Tier 1 — AsyncStorage (local, always available, survives offline)
 *   Tier 2 — Supabase `healing_events` table (cloud sync, queryable for patterns)
 *
 * Every time the health monitor detects or fixes something, it calls this log.
 * The log is what gives the system its "memory" — it reads past entries to
 * detect patterns and escalate recurring issues.
 *
 * Usage (called by healthMonitor.js — you should not need to call this directly):
 *   await HealingLog.batchRecord(results, sessionId, appVersion, userId);
 *   const recent = await HealingLog.getRecentByCheck('session_integrity', 30);
 *   const score  = await HealingLog.getHealthScore();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ── Config ─────────────────────────────────────────────────────
const LOCAL_KEY     = 'snippd_healing_log_v1';
const MAX_LOCAL     = 300;   // keep last 300 entries locally (~30 days at 10/day)
const SYNC_TIMEOUT  = 4000;  // ms before aborting cloud sync attempt

// ── Helpers ────────────────────────────────────────────────────

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso() {
  return new Date().toISOString();
}

async function readLocal() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeLocal(entries) {
  try {
    // Always newest-first; trim to MAX_LOCAL
    const trimmed = entries.slice(0, MAX_LOCAL);
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage write failed — non-fatal, log is best-effort
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

// ── Entry factory ──────────────────────────────────────────────

function makeEntry(result, sessionId, appVersion, userId) {
  return {
    id:          makeId(),
    session_id:  sessionId,
    user_id:     userId ?? null,
    check_name:  result.check,
    status:      result.status,
    issue:       result.issue    ?? null,
    healed:      result.healed   ?? false,
    heal_action: result.healAction ?? null,
    duration_ms: result.duration_ms ?? 0,
    app_version: appVersion ?? '0.0.0',
    created_at:  nowIso(),
    synced:      false,
  };
}

// ── Cloud sync helpers ─────────────────────────────────────────

async function pushToSupabase(entries) {
  if (!entries.length) return [];

  const rows = entries.map(e => ({
    user_id:     e.user_id,
    session_id:  e.session_id,
    check_name:  e.check_name,
    status:      e.status,
    issue:       e.issue,
    healed:      e.healed,
    heal_action: e.heal_action,
    duration_ms: e.duration_ms,
    app_version: e.app_version,
  }));

  const { error } = await withTimeout(
    supabase.from('healing_events').insert(rows),
    SYNC_TIMEOUT
  );

  return error ? [] : entries.map(e => e.id);
}

async function markSynced(ids) {
  if (!ids.length) return;
  const entries = await readLocal();
  const updated = entries.map(e =>
    ids.includes(e.id) ? { ...e, synced: true } : e
  );
  await writeLocal(updated);
}

// ── Public API ─────────────────────────────────────────────────

export const HealingLog = {

  /**
   * Record a batch of health check results for a single startup session.
   * This is the primary write path — called by HealthMonitor after each run.
   */
  batchRecord: async (results, sessionId, appVersion = '0.0.0', userId = null) => {
    const entries = results.map(r =>
      makeEntry(r, sessionId, appVersion, userId)
    );

    // Write to local store immediately (synchronous path, always works)
    const existing = await readLocal();
    await writeLocal([...entries, ...existing]);

    // Non-blocking cloud sync — doesn't delay app startup
    pushToSupabase(entries)
      .then(syncedIds => markSynced(syncedIds))
      .catch(() => { /* will be retried via syncPending */ });

    return entries;
  },

  /**
   * Get log entries from the last N days.
   */
  getRecent: async (days = 7) => {
    const entries = await readLocal();
    const cutoff  = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return entries.filter(e => e.created_at >= cutoff);
  },

  /**
   * Get recent entries filtered to a specific check name.
   * Used by the pattern analyser in healthMonitor.js.
   */
  getRecentByCheck: async (checkName, days = 30) => {
    const recent = await HealingLog.getRecent(days);
    return recent.filter(e => e.check_name === checkName);
  },

  /**
   * Return the full local log (for admin / debug screens).
   */
  getAll: async () => readLocal(),

  /**
   * Compute an aggregate health score (0–100) from recent log.
   * 100 = pristine. Deduct 3 per critical event, 1 per warning (last 7 days).
   */
  getHealthScore: async () => {
    const recent = await HealingLog.getRecent(7);
    if (!recent.length) return 100;

    const penalty = recent.reduce((acc, e) => {
      if (e.status === 'critical') return acc + 3;
      if (e.status === 'warning')  return acc + 1;
      return acc;
    }, 0);

    return Math.max(0, Math.min(100, 100 - penalty));
  },

  /**
   * Detect whether a given check is "chronic" — failing repeatedly.
   * Returns { isChronic, failureCount, healRate, lastFailureAt }.
   */
  getPattern: async (checkName, days = 30) => {
    const history  = await HealingLog.getRecentByCheck(checkName, days);
    const failures = history.filter(e => e.status !== 'ok');
    const heals    = history.filter(e => e.healed);

    return {
      isChronic:    failures.length >= 5,
      failureCount: failures.length,
      totalChecks:  history.length,
      healRate:     failures.length > 0 ? heals.length / failures.length : 1,
      lastFailureAt: failures[0]?.created_at ?? null,
    };
  },

  /**
   * Push all locally-unsynced entries to Supabase.
   * Call this when app comes back online (AppState → active after offline).
   */
  syncPending: async () => {
    const entries  = await readLocal();
    const unsynced = entries.filter(e => !e.synced);
    if (!unsynced.length) return;

    const syncedIds = await pushToSupabase(unsynced).catch(() => []);
    await markSynced(syncedIds);
  },

  /**
   * Clear the local log. Only call from the admin debug screen.
   */
  clearLocal: async () => {
    await AsyncStorage.removeItem(LOCAL_KEY).catch(() => {});
  },
};
