/**
 * huntGuard.ts
 * Bot Shield: Honey-token SKU detection + Hunt API rate limiting.
 *
 * Honey tokens: deal IDs with the prefix "honey_" are decoy SKUs seeded into
 * stack_candidates.  A real user never adds them to cart — only a scraper
 * following the data model would.  Checking for the prefix requires no DB
 * lookup and fires synchronously.
 *
 * Rate limiting: 5 hunts per 5-minute window per user.  Timestamps are stored
 * in AsyncStorage.  Fail-open on read errors so a crashed AsyncStorage never
 * blocks a legitimate user.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Constants ──────────────────────────────────────────────────────────────

const HONEY_PREFIX    = 'honey_';
const RATE_LIMIT_KEY  = 'hunt_rate_timestamps';
const MAX_HUNTS       = 5;
const WINDOW_MS       = 5 * 60 * 1000; // 5 minutes

// ── Honey-token detection ──────────────────────────────────────────────────

/**
 * Returns true if the given deal ID is a honey-token decoy SKU.
 * No DB lookup required — prefix check is O(1).
 */
export function isHoneyToken(dealId: string): boolean {
  return dealId.startsWith(HONEY_PREFIX);
}

// ── Hunt rate limiting ─────────────────────────────────────────────────────

/**
 * Returns true if the user is within the allowed hunt rate (5 hunts / 5 min).
 * Prunes expired timestamps before checking.
 * Fail-open: returns true (allow) on AsyncStorage errors.
 *
 * Call this BEFORE running a hunt; if it returns false, show a rate-limit
 * message and abort the hunt.
 *
 * @param record - pass true to record this hunt attempt after the check passes
 */
export async function checkHuntRateLimit(record = true): Promise<boolean> {
  try {
    const raw  = await AsyncStorage.getItem(RATE_LIMIT_KEY);
    const now  = Date.now();
    const cutoff = now - WINDOW_MS;

    // Parse and prune expired entries
    let timestamps: number[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          timestamps = (parsed as unknown[])
            .filter((t): t is number => typeof t === 'number' && t > cutoff);
        }
      } catch {
        timestamps = [];
      }
    }

    if (timestamps.length >= MAX_HUNTS) {
      // Still within the window but over the limit
      return false;
    }

    if (record) {
      timestamps.push(now);
      await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(timestamps)).catch(() => {});
    }

    return true;
  } catch {
    // Fail-open: AsyncStorage unavailable
    return true;
  }
}

/**
 * Returns the number of hunts remaining in the current 5-minute window.
 * Returns MAX_HUNTS on read errors (fail-open).
 */
export async function huntsRemaining(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return MAX_HUNTS;
    const cutoff = Date.now() - WINDOW_MS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return MAX_HUNTS;
    const active = (parsed as unknown[]).filter(
      (t): t is number => typeof t === 'number' && t > cutoff,
    );
    return Math.max(0, MAX_HUNTS - active.length);
  } catch {
    return MAX_HUNTS;
  }
}
