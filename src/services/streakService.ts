/**
 * streakService — weekly savings streak tracking.
 *
 * A "saved week" = at least one receipt verified in that ISO week.
 * Call updateStreakOnVerify() immediately after a receipt is confirmed.
 *
 * Streak rules:
 *   - last_streak_week == this week  → no-op (already counted)
 *   - last_streak_week == last week  → streak extends +1
 *   - last_streak_week is older, shield available → shield consumed, streak extends +1
 *   - last_streak_week is older, no shield → streak resets to 1
 *   - null last_streak_week (first ever verify) → streak starts at 1
 *
 * Badges are awarded the first time a streak milestone is crossed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreakResult {
  streakWeeks: number;
  longestStreak: number;
  wasExtended: boolean;          // true if streak count increased this call
  shieldUsed: boolean;           // true if a shield was consumed
  badgesEarned: string[];        // badge_key values newly unlocked
  alreadyCountedThisWeek: boolean;
}

export interface StreakState {
  savings_streak_weeks: number;
  longest_streak_weeks: number;
  last_streak_week: string | null;
  streak_shield_count: number;
}

// ── ISO week helpers ──────────────────────────────────────────────────────────

/**
 * Returns the ISO week string 'YYYY-Www' for a given date (defaults to today).
 * Uses UTC dates to avoid timezone edge cases around week boundaries.
 */
export function getISOWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayOfWeek = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek); // shift to Thursday of ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Returns the ISO week immediately preceding the given 'YYYY-Www' string.
 * Handles year boundaries correctly.
 */
export function getPrevISOWeek(weekStr: string): string {
  const [yearStr, wStr] = weekStr.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(wStr, 10);
  if (week === 1) {
    // Last ISO week of the previous year — find it by checking Dec 28
    // (Dec 28 is always in the last ISO week of its year)
    const dec28 = new Date(Date.UTC(year - 1, 11, 28));
    return getISOWeek(dec28);
  }
  return `${year}-W${String(week - 1).padStart(2, '0')}`;
}

// ── Badge milestones ──────────────────────────────────────────────────────────

const STREAK_MILESTONES: Array<{ weeks: number; key: string }> = [
  { weeks: 4,  key: 'STREAK_4'  },
  { weeks: 8,  key: 'STREAK_8'  },
  { weeks: 26, key: 'STREAK_26' },
  { weeks: 52, key: 'STREAK_52' },
];

// Amount milestones (checked against lifetime checkout_math_snapshots total)
export const SAVINGS_MILESTONES: Array<{ cents: number; key: string; label: string }> = [
  { cents:  5_000, key: 'CENTURY',     label: 'First $50'     },
  { cents: 10_000, key: 'FIRST_100',   label: 'First $100'    },
  { cents: 50_000, key: 'HALF_GRAND',  label: 'Half Grand'    },
  { cents: 100_000, key: 'FOUR_FIGURES', label: 'Four Figures' },
  { cents: 500_000, key: 'FIVE_GRAND', label: 'Wealth Builder' },
];

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Updates the user's savings streak after a receipt is verified.
 * Idempotent within the same ISO week — calling twice in the same week is a no-op.
 *
 * @param userId  Supabase auth UUID
 * @param client  Supabase client (user JWT or service role)
 */
export async function updateStreakOnVerify(
  userId: string,
  client: SupabaseClient,
): Promise<StreakResult> {
  const thisWeek = getISOWeek();
  const prevWeek = getPrevISOWeek(thisWeek);

  // ── Load current state ────────────────────────────────────────────────────
  const { data, error } = await client
    .from('profiles')
    .select('savings_streak_weeks, longest_streak_weeks, last_streak_week, streak_shield_count')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.warn('[streakService] could not load profile:', error?.message);
    return {
      streakWeeks: 0, longestStreak: 0, wasExtended: false,
      shieldUsed: false, badgesEarned: [], alreadyCountedThisWeek: false,
    };
  }

  const current = data.savings_streak_weeks ?? 0;
  const longest  = data.longest_streak_weeks  ?? 0;
  const lastWeek = data.last_streak_week       ?? null;
  const shields  = data.streak_shield_count    ?? 0;

  // ── Already counted this week ─────────────────────────────────────────────
  if (lastWeek === thisWeek) {
    return {
      streakWeeks: current, longestStreak: longest, wasExtended: false,
      shieldUsed: false, badgesEarned: [], alreadyCountedThisWeek: true,
    };
  }

  // ── Calculate new streak ─────────────────────────────────────────────────
  let newStreak = 1;
  let shieldUsed = false;

  if (lastWeek === prevWeek) {
    // Perfect continuation — no gap
    newStreak = current + 1;
  } else if (lastWeek !== null && shields > 0) {
    // Missed one or more weeks but has a shield — protect the streak
    newStreak = current + 1;
    shieldUsed = true;
  } else {
    // Streak broken, no protection — reset
    newStreak = 1;
  }

  const newLongest  = Math.max(longest, newStreak);
  const newShields  = shieldUsed ? Math.max(0, shields - 1) : shields;

  // ── Detect newly crossed badge milestones ─────────────────────────────────
  const badgesEarned: string[] = [];
  for (const m of STREAK_MILESTONES) {
    if (newStreak >= m.weeks && current < m.weeks) {
      badgesEarned.push(m.key);
    }
  }

  // ── Write streak update to profiles ──────────────────────────────────────
  const { error: updateErr } = await client
    .from('profiles')
    .update({
      savings_streak_weeks: newStreak,
      longest_streak_weeks: newLongest,
      last_streak_week:     thisWeek,
      streak_shield_count:  newShields,
      streak_updated_at:    new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateErr) {
    console.warn('[streakService] profile update failed:', updateErr.message);
  }

  // ── Award new badges ──────────────────────────────────────────────────────
  if (badgesEarned.length > 0) {
    const rows = badgesEarned.map((badge_key) => ({
      user_id:  userId,
      badge_key,
      metadata: { streak_weeks: newStreak },
    }));
    const { error: badgeErr } = await client
      .from('user_achievements')
      .upsert(rows, { onConflict: 'user_id,badge_key', ignoreDuplicates: true });
    if (badgeErr) {
      console.warn('[streakService] badge upsert failed:', badgeErr.message);
    }
  }

  return {
    streakWeeks: newStreak,
    longestStreak: newLongest,
    wasExtended: true,
    shieldUsed,
    badgesEarned,
    alreadyCountedThisWeek: false,
  };
}

/**
 * Checks savings milestones and awards any newly crossed amount badges.
 * Call after checkout_math_snapshots are updated.
 *
 * @param userId          Supabase auth UUID
 * @param client          Supabase client
 * @param lifetimeCents   Total verified savings in cents (caller computes this)
 */
export async function checkSavingsMilestones(
  userId: string,
  client: SupabaseClient,
  lifetimeCents: number,
): Promise<string[]> {
  // Load already-earned amount badges for this user
  const { data: existing } = await client
    .from('user_achievements')
    .select('badge_key')
    .eq('user_id', userId);

  const earned = new Set((existing ?? []).map((r: { badge_key: string }) => r.badge_key));
  const newBadges: string[] = [];

  for (const m of SAVINGS_MILESTONES) {
    if (lifetimeCents >= m.cents && !earned.has(m.key)) {
      newBadges.push(m.key);
    }
  }

  if (newBadges.length > 0) {
    const rows = newBadges.map((badge_key) => ({
      user_id:  userId,
      badge_key,
      metadata: { lifetime_cents: lifetimeCents },
    }));
    await client
      .from('user_achievements')
      .upsert(rows, { onConflict: 'user_id,badge_key', ignoreDuplicates: true });
  }

  return newBadges;
}

/**
 * Loads the user's current streak state. Returns zeros on error.
 */
export async function loadStreakState(
  userId: string,
  client: SupabaseClient,
): Promise<StreakState> {
  const { data } = await client
    .from('profiles')
    .select('savings_streak_weeks, longest_streak_weeks, last_streak_week, streak_shield_count')
    .eq('user_id', userId)
    .single();
  return {
    savings_streak_weeks: data?.savings_streak_weeks ?? 0,
    longest_streak_weeks: data?.longest_streak_weeks ?? 0,
    last_streak_week:     data?.last_streak_week     ?? null,
    streak_shield_count:  data?.streak_shield_count  ?? 0,
  };
}
