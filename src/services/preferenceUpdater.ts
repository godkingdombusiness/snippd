/**
 * preferenceUpdater — Node.js background service
 *
 * runPreferenceUpdater():
 *  1. Loads event_stream + existing user_preference_scores
 *  2. Applies temporal decay with 30-day half-life to stale scores
 *  3. Accumulates weighted event scores per (user, preference_key, category, brand, retailer)
 *  4. Normalizes scores 0–1 per user+dimension
 *  5. Writes daily user_state_snapshots including:
 *       budget_stress_level, shopping_mode, responsiveness scores
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ShoppingMode, UserStateSnapshot } from '../types/events';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const HALF_LIFE_DAYS = 30;
// Decay per day: 0.5^(1/30) ≈ 0.9772
const DECAY_PER_DAY = Math.pow(0.5, 1 / HALF_LIFE_DAYS);

function round(value: number, decimals = 4): number {
  const m = 10 ** decimals;
  return Math.round(value * m) / m;
}

// ─────────────────────────────────────────────────────────────
// DB row types
// ─────────────────────────────────────────────────────────────

interface EventRow {
  user_id: string;
  event_name: string;
  category: string | null;
  brand: string | null;
  retailer_key: string | null;
  timestamp: string | null;
}

interface PreferenceRow {
  user_id: string;
  preference_key: string;
  category: string;
  brand: string;
  retailer_key: string;
  score: number;
  normalized_score: number;
  last_updated: string;
}

interface WeightRow {
  event_name: string;
  weight: number;
}

// ─────────────────────────────────────────────────────────────
// Temporal decay
// ─────────────────────────────────────────────────────────────

function decayScore(score: number, lastUpdated: string): number {
  const ageDays = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
  return round(score * Math.pow(DECAY_PER_DAY, ageDays));
}

// ─────────────────────────────────────────────────────────────
// Shopping mode inference
// ─────────────────────────────────────────────────────────────

function inferShoppingMode(
  scores: PreferenceRow[],
): ShoppingMode {
  const sum = (keys: string[]) =>
    scores
      .filter((s) => keys.includes(s.preference_key))
      .reduce((acc, s) => acc + s.score, 0);

  const dealScore   = sum(['coupon_clipped', 'coupon_redeemed', 'stack_applied', 'stack_viewed']);
  const convScore   = sum(['cart_accepted', 'checkout_completed', 'purchase_completed']);
  const budgetScore = sum(['budget_set', 'item_removed_from_cart', 'budget_exceeded']);
  const loyalScore  = scores.filter((s) => s.brand !== '' && s.score > 1).length;
  const variedScore = new Set(scores.filter((s) => s.category !== '').map((s) => s.category)).size;

  const ranked: [ShoppingMode, number][] = [
    ['deal_hunter',       dealScore],
    ['convenience',       convScore * 0.8],
    ['budget_conscious',  budgetScore],
    ['loyal_brand',       loyalScore * 0.5],
    ['variety_seeker',    variedScore * 0.3],
  ];

  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : 'unknown';
}

// ─────────────────────────────────────────────────────────────
// Responsiveness scores
// ─────────────────────────────────────────────────────────────

function computeResponsiveness(scores: PreferenceRow[], keys: string[]): number {
  const relevant = scores.filter((s) => keys.includes(s.preference_key));
  if (!relevant.length) return 0;
  const total = relevant.reduce((acc, s) => acc + s.score, 0);
  const max   = relevant.reduce((acc, s) => Math.max(acc, Math.abs(s.score)), 0);
  return max > 0 ? round(Math.min(1, total / (max * 5))) : 0;
}

// ─────────────────────────────────────────────────────────────
// Main function
// ─────────────────────────────────────────────────────────────

export interface PreferenceUpdaterResult {
  users: number;
  rows: number;
  snapshots: number;
}

export async function runPreferenceUpdater(
  db: SupabaseClient,
): Promise<PreferenceUpdaterResult> {
  // 1. Load weight config
  const { data: weightRows, error: weightErr } = await db
    .from('event_weight_config')
    .select('event_name, weight');
  if (weightErr) throw new Error(`Failed to load weight config: ${weightErr.message}`);

  const weights = new Map<string, number>(
    (weightRows as WeightRow[]).map((r) => [r.event_name, r.weight]),
  );

  // 2. Load recent events
  const { data: eventRows, error: eventErr } = await db
    .from('event_stream')
    .select('user_id, event_name, category, brand, retailer_key, timestamp')
    .not('user_id', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(50_000);
  if (eventErr) throw new Error(`Failed to load events: ${eventErr.message}`);

  const events = (eventRows ?? []) as EventRow[];
  const userIds = [...new Set(events.map((e) => e.user_id).filter(Boolean))];

  // 3. Load existing preference scores
  const { data: existingRows, error: scoreErr } = await db
    .from('user_preference_scores')
    .select('user_id, preference_key, category, brand, retailer_key, score, normalized_score, last_updated')
    .in('user_id', userIds);
  if (scoreErr) throw new Error(`Failed to load preference scores: ${scoreErr.message}`);

  // 4. Apply temporal decay to existing scores
  const decayed = new Map<string, PreferenceRow>();
  for (const row of (existingRows ?? []) as PreferenceRow[]) {
    const key = `${row.user_id}||${row.preference_key}||${row.category}||${row.brand}||${row.retailer_key}`;
    decayed.set(key, { ...row, score: decayScore(row.score, row.last_updated) });
  }

  // 5. Accumulate new event weights
  for (const event of events) {
    const normalizedName = event.event_name.toLowerCase();
    const weight = weights.get(normalizedName) ?? 0;
    const category    = event.category    ?? '';
    const brand       = event.brand       ?? '';
    const retailerKey = event.retailer_key ?? '';
    const key = `${event.user_id}||${normalizedName}||${category}||${brand}||${retailerKey}`;

    const existing = decayed.get(key);
    if (existing) {
      decayed.set(key, { ...existing, score: round(existing.score + weight) });
    } else {
      decayed.set(key, {
        user_id:          event.user_id,
        preference_key:   normalizedName,
        category,
        brand,
        retailer_key:     retailerKey,
        score:            round(weight),
        normalized_score: 0,
        last_updated:     new Date().toISOString(),
      });
    }
  }

  // 6. Normalize per user
  const byUser = new Map<string, PreferenceRow[]>();
  for (const row of decayed.values()) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  const upserts: (PreferenceRow & { last_updated: string })[] = [];

  for (const [userId, rows] of byUser) {
    const maxAbs = Math.max(...rows.map((r) => Math.abs(r.score)), 0);
    for (const row of rows) {
      upserts.push({
        ...row,
        normalized_score: maxAbs > 0 ? round(row.score / maxAbs) : 0,
        last_updated:     new Date().toISOString(),
      });
    }
  }

  // 7. Upsert preference scores
  if (upserts.length > 0) {
    const { error: upsertErr } = await db
      .from('user_preference_scores')
      .upsert(upserts, { onConflict: 'user_id, preference_key, category, brand, retailer_key' });
    if (upsertErr) throw new Error(`Failed to upsert preference scores: ${upsertErr.message}`);
  }

  // 8. Build and upsert user_state_snapshots
  let snapshotCount = 0;
  for (const [userId, rows] of byUser) {
    const budgetEvents   = rows.filter((r) => ['budget_exceeded', 'item_removed_from_cart'].includes(r.preference_key));
    const budgetStress   = budgetEvents.length > 0
      ? round(Math.min(1, budgetEvents.reduce((s, r) => s + Math.abs(r.score), 0) / 5))
      : 0;

    const shoppingMode = inferShoppingMode(rows);

    const couponResponsiveness     = computeResponsiveness(rows, ['coupon_clipped', 'coupon_redeemed', 'coupon_viewed']);
    const bogoResponsiveness       = computeResponsiveness(rows, ['stack_applied', 'stack_viewed', 'item_added_to_cart']);
    const multiStoreResponsiveness = computeResponsiveness(rows, ['store_selected']);
    const substitutionResponsiveness = computeResponsiveness(rows, ['item_substituted']);

    const snapshot: UserStateSnapshot = {
      user_id: userId,
      snapshot: {
        updated_at:                  new Date().toISOString(),
        preferences:                 rows.map((r) => ({
          user_id:          r.user_id,
          preference_key:   r.preference_key,
          category:         r.category,
          brand:            r.brand,
          retailer_key:     r.retailer_key,
          score:            r.score,
          normalized_score: r.normalized_score,
          last_updated:     r.last_updated,
        })),
        budget_stress_level:          budgetStress,
        shopping_mode:                shoppingMode,
        coupon_responsiveness:        couponResponsiveness,
        bogo_responsiveness:          bogoResponsiveness,
        multi_store_responsiveness:   multiStoreResponsiveness,
        substitution_responsiveness:  substitutionResponsiveness,
      },
      snapshot_at: new Date().toISOString(),
    };

    const { error: snapErr } = await db
      .from('user_state_snapshots')
      .upsert([{ user_id: userId, snapshot: snapshot.snapshot, snapshot_at: snapshot.snapshot_at }], {
        onConflict: 'user_id',
      });
    if (snapErr) throw new Error(`Failed to upsert snapshot for ${userId}: ${snapErr.message}`);
    snapshotCount++;
  }

  return { users: byUser.size, rows: upserts.length, snapshots: snapshotCount };
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  console.log('[preferenceUpdater] starting...');
  try {
    const result = await runPreferenceUpdater(db);
    console.log('[preferenceUpdater] complete:', result);
    process.exit(0);
  } catch (err) {
    console.error('[preferenceUpdater] failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
