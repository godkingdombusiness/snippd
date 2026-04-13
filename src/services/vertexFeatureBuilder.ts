/**
 * vertexFeatureBuilder — builds Vertex AI feature vectors from user state
 *
 * buildFeatureVector(userId, supabase)
 *   Reads user_state_snapshots + user_preference_scores
 *   Returns VertexFeatureVector
 *
 * scoreStackForUser(userId, stack, supabase)
 *   Enriches with item context, calls Vertex AI endpoint
 *   Falls back to heuristic scoring if Vertex is unavailable
 *
 * checkWealthAttrition(userId, supabase)
 *   Predicts wealth loss probability
 *   Creates smart_alert in Supabase if probability > 0.7
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { VertexFeatureVector, ShoppingMode } from '../types/events';
import type { StackResult } from '../types/stacking';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function round(value: number, d = 4): number {
  const m = 10 ** d;
  return Math.round(value * m) / m;
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

// ─────────────────────────────────────────────────────────────
// Snapshot types (DB row shape)
// ─────────────────────────────────────────────────────────────

interface SnapshotRow {
  user_id: string;
  snapshot: {
    updated_at?: string;
    budget_stress_level?: number;
    shopping_mode?: ShoppingMode;
    coupon_responsiveness?: number;
    bogo_responsiveness?: number;
    multi_store_responsiveness?: number;
    substitution_responsiveness?: number;
    preferences?: Array<{
      preference_key: string;
      category: string;
      brand: string;
      retailer_key: string;
      score: number;
      normalized_score: number;
    }>;
  };
  snapshot_at: string;
}

interface PreferenceRow {
  preference_key: string;
  category: string;
  brand: string;
  retailer_key: string;
  score: number;
  normalized_score: number;
}

// ─────────────────────────────────────────────────────────────
// buildFeatureVector
// ─────────────────────────────────────────────────────────────

export async function buildFeatureVector(
  userId: string,
  supabase: SupabaseClient,
): Promise<VertexFeatureVector> {
  const [snapshotResult, prefResult] = await Promise.all([
    supabase
      .from('user_state_snapshots')
      .select('user_id, snapshot, snapshot_at')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('user_preference_scores')
      .select('preference_key, category, brand, retailer_key, score, normalized_score')
      .eq('user_id', userId)
      .order('score', { ascending: false })
      .limit(100),
  ]);

  const snap = snapshotResult.data as SnapshotRow | null;
  const prefs = (prefResult.data ?? []) as PreferenceRow[];

  // Derive top categories / brands / retailers from preference scores
  const topCategories = [...new Set(
    prefs.filter((p) => p.category && p.score > 0).map((p) => p.category),
  )].slice(0, 5);

  const topBrands = [...new Set(
    prefs.filter((p) => p.brand && p.score > 0).map((p) => p.brand),
  )].slice(0, 5);

  const topRetailers = [...new Set(
    prefs.filter((p) => p.retailer_key && p.score > 0).map((p) => p.retailer_key),
  )].slice(0, 5);

  // Weekly spend / savings estimates from wealth snapshots (heuristic)
  const wealthResult = await supabase
    .from('wealth_momentum_snapshots')
    .select('realized_savings')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(4);

  const recentSavings = (wealthResult.data ?? []) as Array<{ realized_savings: number | null }>;
  const avgWeeklySavingsCents = recentSavings.length > 0
    ? Math.round(
        recentSavings.reduce((s, r) => s + (r.realized_savings ?? 0), 0) /
        recentSavings.length * 100,
      )
    : 0;

  const snapshot = snap?.snapshot ?? {};

  return {
    user_id:                     userId,
    budget_stress_level:         clamp(snapshot.budget_stress_level ?? 0),
    shopping_mode:               snapshot.shopping_mode ?? 'unknown',
    coupon_responsiveness:       clamp(snapshot.coupon_responsiveness ?? 0),
    bogo_responsiveness:         clamp(snapshot.bogo_responsiveness ?? 0),
    multi_store_responsiveness:  clamp(snapshot.multi_store_responsiveness ?? 0),
    substitution_responsiveness: clamp(snapshot.substitution_responsiveness ?? 0),
    avg_weekly_spend_cents:      0, // requires purchase history — populated by a separate pipeline
    avg_weekly_savings_cents:    avgWeeklySavingsCents,
    preferred_categories:        topCategories,
    preferred_brands:            topBrands,
    preferred_retailers:         topRetailers,
    snapshot_at:                 snap?.snapshot_at ?? new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Heuristic stack scorer (fallback when Vertex is unavailable)
// ─────────────────────────────────────────────────────────────

function heuristicStackScore(
  vector: VertexFeatureVector,
  stack: StackResult,
): number {
  const savingsRatio = stack.basketRegularCents > 0
    ? stack.inStackSavingsCents / stack.basketRegularCents
    : 0;

  const relevanceBoost = stack.lines.some((l) =>
    vector.preferred_categories.includes(l.itemName ?? '') ||
    vector.preferred_retailers.includes(stack.retailerKey),
  ) ? 0.1 : 0;

  const score = round(
    savingsRatio * 0.4 +
    vector.coupon_responsiveness * 0.25 +
    vector.bogo_responsiveness * 0.15 +
    (1 - vector.budget_stress_level) * 0.1 +
    relevanceBoost +
    clamp(1 - stack.warnings.length * 0.05) * 0.1,
  );

  return clamp(score);
}

// ─────────────────────────────────────────────────────────────
// scoreStackForUser
// ─────────────────────────────────────────────────────────────

export async function scoreStackForUser(
  userId: string,
  stack: StackResult,
  supabase: SupabaseClient,
): Promise<number> {
  const vector = await buildFeatureVector(userId, supabase);

  const vertexEndpoint = process.env['VERTEX_ENDPOINT_URL'];
  if (!vertexEndpoint) {
    return heuristicStackScore(vector, stack);
  }

  try {
    const res = await fetch(vertexEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{
          user_features: vector,
          stack_features: {
            basket_regular_cents:   stack.basketRegularCents,
            basket_final_cents:     stack.basketFinalCents,
            in_stack_savings_cents: stack.inStackSavingsCents,
            rebate_cents:           stack.rebateCents,
            warning_count:          stack.warnings.length,
            item_count:             stack.lines.length,
            retailer_key:           stack.retailerKey,
          },
        }],
      }),
    });

    if (!res.ok) throw new Error(`Vertex returned ${res.status}`);

    const json = await res.json() as { predictions?: Array<{ score?: number }> };
    const rawScore = json.predictions?.[0]?.score;
    return typeof rawScore === 'number' ? clamp(rawScore) : heuristicStackScore(vector, stack);
  } catch (err) {
    console.warn('[vertexFeatureBuilder] Vertex unavailable, using heuristic fallback:', err);
    return heuristicStackScore(vector, stack);
  }
}

// ─────────────────────────────────────────────────────────────
// checkWealthAttrition
// ─────────────────────────────────────────────────────────────

export interface WealthAttritionResult {
  probability: number;
  alert_created: boolean;
  alert_id?: string;
}

export async function checkWealthAttrition(
  userId: string,
  supabase: SupabaseClient,
): Promise<WealthAttritionResult> {
  // Load last 4 wealth snapshots
  const { data: snapshots } = await supabase
    .from('wealth_momentum_snapshots')
    .select('realized_savings, velocity_score, budget_stress_score, budget_stress_alert')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(4);

  const rows = (snapshots ?? []) as Array<{
    realized_savings: number | null;
    velocity_score: number | null;
    budget_stress_score: number | null;
    budget_stress_alert: boolean;
  }>;

  if (rows.length < 2) {
    return { probability: 0, alert_created: false };
  }

  // Heuristic: compute attrition probability from declining savings + rising stress
  const avgStress    = round(rows.reduce((s, r) => s + (r.budget_stress_score ?? 0), 0) / rows.length / 100);
  const avgVelocity  = round(rows.reduce((s, r) => s + (r.velocity_score ?? 0), 0) / rows.length / 100);
  const stressAlert  = rows.filter((r) => r.budget_stress_alert).length;

  const savingsArr = rows.map((r) => r.realized_savings ?? 0);
  const savingsTrend = savingsArr.length > 1
    ? (savingsArr[0] - savingsArr[savingsArr.length - 1]) / Math.max(savingsArr[savingsArr.length - 1], 1)
    : 0;

  const probability = clamp(
    avgStress * 0.4 +
    (1 - avgVelocity) * 0.3 +
    (stressAlert / rows.length) * 0.2 +
    (savingsTrend < 0 ? Math.abs(savingsTrend) * 0.1 : 0),
  );

  if (probability < 0.7) {
    return { probability, alert_created: false };
  }

  // Create smart alert
  const { data: alert, error } = await supabase
    .from('smart_alerts')
    .insert([{
      user_id:    userId,
      alert_type: 'wealth_attrition',
      message:    'Your savings momentum is declining. Review your active stacks to stay on track.',
      metadata:   { probability, avg_stress: avgStress, avg_velocity: avgVelocity },
    }])
    .select('id')
    .single();

  if (error) {
    console.error('[vertexFeatureBuilder] Failed to create smart alert:', error.message);
    return { probability, alert_created: false };
  }

  return { probability, alert_created: true, alert_id: (alert as { id: string }).id };
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const url    = process.env['SUPABASE_URL'];
  const key    = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const userId = process.argv[2];

  if (!url || !key || !userId) {
    console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx ts-node vertexFeatureBuilder.ts <user_id>');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const vector = await buildFeatureVector(userId, db);
  console.log('Feature vector:', JSON.stringify(vector, null, 2));

  const attrition = await checkWealthAttrition(userId, db);
  console.log('Wealth attrition check:', attrition);
}

if (require.main === module) {
  void main();
}
