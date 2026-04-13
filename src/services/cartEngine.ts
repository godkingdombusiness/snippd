/**
 * cartEngine — generates 3 personalised cart options for a user at a retailer
 *
 * buildCartOptions(userId, retailerKey, weekOf, db)
 *   1. Loads user state snapshot (budget, shopping_mode, responsiveness)
 *   2. Loads stack_candidates for retailerKey × weekOf (limit 40)
 *   3. Runs CouponStackingEngine.compute() on each candidate
 *   4. Scores each candidate against user preference scores
 *      (category 40%, retailer 30%, brand 20%, deal_type 10%)
 *   5. Generates 3 cart options: MAX_SAVINGS, BALANCED, CONVENIENCE
 *   6. Scores each cart with vertexFeatureBuilder (Vertex or heuristic)
 *   7. Logs a recommendation_exposure for each cart
 *   8. Returns all 3 carts sorted: max_savings → balanced → convenience
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { StackItem, StackResult, AppliedOffer } from '../types/stacking';
import { CouponStackingEngine } from './stacking/stackingEngine';
import { scoreStackForUser } from './vertexFeatureBuilder';
import { getUserGraphContext, UserGraphContext } from './graph/graphRetrieval';

// ─────────────────────────────────────────────────────────────
// Cart types
// ─────────────────────────────────────────────────────────────

export type CartType = 'max_savings' | 'balanced' | 'convenience';

export interface CartItem {
  product_id: string;
  name?: string;
  qty: number;
  regular_price_cents: number;
  final_price_cents: number;
  savings_cents: number;
  applied_offers: AppliedOffer[];
  retailer_key: string;
  category?: string;
  brand?: string;
}

export interface CartOption {
  cart_id: string;
  cart_type: CartType;
  retailer_set: string[];
  items: CartItem[];
  subtotal_before_savings_cents: number;
  subtotal_after_savings_cents: number;
  total_savings_cents: number;
  savings_pct: number;
  store_count: number;
  item_count: number;
  explanation: string[];
  reason_codes: string[];
  budget_fit: boolean;
  model_version: string;
  cart_acceptance_probability: number;
}

export interface BuildCartOptionsResult {
  carts: CartOption[];
  computed_at: string;
  retailer_key: string;
  week_of: string;
}

// ─────────────────────────────────────────────────────────────
// DB row types
// ─────────────────────────────────────────────────────────────

interface UserSnapshotRow {
  user_id: string;
  snapshot: {
    budget_stress_level?: number;
    shopping_mode?: string;
    coupon_responsiveness?: number;
    bogo_responsiveness?: number;
    multi_store_responsiveness?: number;
    substitution_responsiveness?: number;
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

interface BudgetRow {
  weekly_budget_cents: number | null;
}

interface StackCandidateRow {
  id: string;
  retailer_key: string;
  week_of: string;
  stack_rank_score: number;
  items: StackItem[];              // stored as JSONB matching StackItem shape
  primary_category?: string;
  primary_brand?: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const MODEL_VERSION = process.env['MODEL_VERSION'] ?? 'v1.0.0';

function round(v: number, d = 2): number {
  const m = 10 ** d;
  return Math.round(v * m) / m;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─────────────────────────────────────────────────────────────
// Preference scoring (per candidate)
// ─────────────────────────────────────────────────────────────

interface ScoredCandidate {
  candidate: StackCandidateRow;
  stackResult: StackResult;
  preferenceScore: number;       // 0–1 weighted by dimensions
  savingsPct: number;            // inStackSavingsCents / basketRegularCents
  compositeScore: number;        // used to select items for each cart type
}

function scoreCandidate(
  candidate: StackCandidateRow,
  stackResult: StackResult,
  preferencesByKey: Map<string, number>,
  graphCtx?: UserGraphContext,
): ScoredCandidate {
  const category = candidate.primary_category ?? '';

  // Category score: normalized_score for this category
  const categoryKey = `category::${category}`;
  let categoryScore = preferencesByKey.get(categoryKey) ?? 0;

  // Graph boost: +15% if this category is in user's preferred graph categories
  if (graphCtx && category) {
    const graphPref = graphCtx.preferredCategories.find((p) => p.name === category);
    if (graphPref) {
      categoryScore = Math.min(1, categoryScore * 1.15);
    }
  }

  // Retailer score
  const retailerKey = `retailer::${candidate.retailer_key}`;
  const retailerScore = preferencesByKey.get(retailerKey) ?? 0;

  // Brand score
  const brandKey = `brand::${candidate.primary_brand ?? ''}`;
  const brandScore = preferencesByKey.get(brandKey) ?? 0;

  // Deal type score — based on offer types present in the stack
  const offerTypes = new Set(stackResult.appliedOffers.map((a) => a.offerType));
  let dealTypeScore = 0;
  if (offerTypes.has('BOGO')) dealTypeScore = Math.max(dealTypeScore, preferencesByKey.get('deal::bogo') ?? 0);
  if (offerTypes.has('SALE')) dealTypeScore = Math.max(dealTypeScore, preferencesByKey.get('deal::sale') ?? 0);
  if (offerTypes.has('MANUFACTURER_COUPON') || offerTypes.has('DIGITAL_COUPON')) {
    dealTypeScore = Math.max(dealTypeScore, preferencesByKey.get('deal::coupon') ?? 0);
  }

  // Weighted preference score: category 40%, retailer 30%, brand 20%, deal_type 10%
  let preferenceScore = round(
    categoryScore * 0.40 +
    retailerScore * 0.30 +
    brandScore    * 0.20 +
    dealTypeScore * 0.10,
    4,
  );

  // Graph boost: +20% if any line item is in user's buy history
  if (graphCtx && graphCtx.buyHistory.size > 0) {
    const hasBuyHistory = stackResult.lines.some((l) => graphCtx.buyHistory.has(l.itemId));
    if (hasBuyHistory) {
      preferenceScore = Math.min(1, preferenceScore + 0.20);
    }
  }

  // Graph boost: +10% bundle bonus if any line item co-occurs with other cart items
  if (graphCtx && graphCtx.coOccurrenceKeys.size > 0) {
    const hasCoOccurrence = stackResult.lines.some((l) => graphCtx.coOccurrenceKeys.has(l.itemId));
    if (hasCoOccurrence) {
      preferenceScore = Math.min(1, preferenceScore + 0.10);
    }
  }

  // Graph boost: +8% cohort boost if category matches what similar users prefer
  if (graphCtx && category && graphCtx.cohortCategories.has(category)) {
    preferenceScore = Math.min(1, preferenceScore + 0.08);
  }

  // Graph boost: +6% brand cohort boost if brand matches what similar users prefer
  const brand = candidate.primary_brand ?? '';
  if (graphCtx && brand && graphCtx.cohortBrands.has(brand)) {
    preferenceScore = Math.min(1, preferenceScore + 0.06);
  }

  const savingsPct = stackResult.basketRegularCents > 0
    ? round(stackResult.inStackSavingsCents / stackResult.basketRegularCents, 4)
    : 0;

  return { candidate, stackResult, preferenceScore, savingsPct, compositeScore: 0 };
}

// ─────────────────────────────────────────────────────────────
// Preference lookup map builder
// ─────────────────────────────────────────────────────────────

function buildPreferenceLookup(rows: PreferenceRow[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const row of rows) {
    // Category dimension
    if (row.category) {
      const k = `category::${row.category}`;
      map.set(k, Math.max(map.get(k) ?? 0, row.normalized_score));
    }
    // Retailer dimension
    if (row.retailer_key) {
      const k = `retailer::${row.retailer_key}`;
      map.set(k, Math.max(map.get(k) ?? 0, row.normalized_score));
    }
    // Brand dimension
    if (row.brand) {
      const k = `brand::${row.brand}`;
      map.set(k, Math.max(map.get(k) ?? 0, row.normalized_score));
    }
    // Deal type — map event names to deal types
    const dealMap: Record<string, string> = {
      stack_applied: 'deal::bogo',
      stack_viewed:  'deal::bogo',
      coupon_clipped: 'deal::coupon',
      coupon_redeemed: 'deal::coupon',
    };
    const dealKey = dealMap[row.preference_key];
    if (dealKey) {
      map.set(dealKey, Math.max(map.get(dealKey) ?? 0, row.normalized_score));
    }
  }

  return map;
}

// ─────────────────────────────────────────────────────────────
// Cart builder
// ─────────────────────────────────────────────────────────────

function buildCartItems(
  scored: ScoredCandidate[],
  retailerKey: string,
): CartItem[] {
  const items: CartItem[] = [];

  for (const s of scored) {
    for (const line of s.stackResult.lines) {
      items.push({
        product_id:          line.itemId,
        name:                line.itemName,
        qty:                 line.quantity,
        regular_price_cents: line.lineTotalRegularCents,
        final_price_cents:   line.lineTotalFinalCents,
        savings_cents:       line.lineSavingsCents + line.lineRebateCents,
        applied_offers:      line.appliedOffers,
        retailer_key:        s.candidate.retailer_key ?? retailerKey,
        category:            s.candidate.primary_category,
        brand:               s.candidate.primary_brand,
      });
    }
  }

  return items;
}

function buildExplanation(
  items: CartItem[],
  cartType: CartType,
  weeklyBudgetCents: number | null,
  totalSavings: number,
  subtotalAfter: number,
): { explanation: string[]; reason_codes: string[] } {
  const explanation: string[] = [];
  const reason_codes: string[] = [];

  // Top 3 savings items
  const topSavers = [...items]
    .sort((a, b) => b.savings_cents - a.savings_cents)
    .slice(0, 3);

  for (const item of topSavers) {
    if (item.savings_cents > 0) {
      explanation.push(`Saves ${formatCents(item.savings_cents)} on ${item.name ?? item.product_id}`);
    }
  }

  if (cartType === 'balanced') {
    explanation.push('Based on your shopping history');
    reason_codes.push('preference_weighted');
  } else if (cartType === 'convenience') {
    explanation.push('Quick trip — minimum items, preferred products');
    reason_codes.push('convenience_optimised');
  } else {
    reason_codes.push('savings_optimised');
  }

  if (weeklyBudgetCents && subtotalAfter <= weeklyBudgetCents) {
    explanation.push(`Stays ${formatCents(weeklyBudgetCents - subtotalAfter)} under your weekly budget`);
    reason_codes.push('within_budget');
  } else if (weeklyBudgetCents && subtotalAfter > weeklyBudgetCents) {
    reason_codes.push('over_budget');
  }

  if (totalSavings > 0) {
    reason_codes.push('has_savings');
  }

  return { explanation, reason_codes };
}

function buildCart(
  cartType: CartType,
  selected: ScoredCandidate[],
  retailerKey: string,
  weeklyBudgetCents: number | null,
): Omit<CartOption, 'cart_acceptance_probability'> {
  const items = buildCartItems(selected, retailerKey);
  const retailerSet = [...new Set(items.map((i) => i.retailer_key))];

  const subtotalBefore = items.reduce((s, i) => s + i.regular_price_cents, 0);
  const subtotalAfter  = items.reduce((s, i) => s + i.final_price_cents, 0);
  const totalSavings   = items.reduce((s, i) => s + i.savings_cents, 0);
  const savingsPct     = subtotalBefore > 0 ? round((totalSavings / subtotalBefore) * 100, 1) : 0;
  const budgetFit      = weeklyBudgetCents !== null ? subtotalAfter <= weeklyBudgetCents : true;

  const { explanation, reason_codes } = buildExplanation(
    items, cartType, weeklyBudgetCents, totalSavings, subtotalAfter,
  );

  return {
    cart_id:                      crypto.randomUUID(),
    cart_type:                    cartType,
    retailer_set:                 retailerSet,
    items,
    subtotal_before_savings_cents: subtotalBefore,
    subtotal_after_savings_cents:  subtotalAfter,
    total_savings_cents:           totalSavings,
    savings_pct:                   savingsPct,
    store_count:                   retailerSet.length,
    item_count:                    items.length,
    explanation,
    reason_codes,
    budget_fit:                    budgetFit,
    model_version:                 MODEL_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────
// Cart selection strategies
// ─────────────────────────────────────────────────────────────

function selectMaxSavings(scored: ScoredCandidate[]): ScoredCandidate[] {
  // Sort by savingsPct DESC — ignore convenience, allow multiple stores
  const sorted = [...scored].sort((a, b) => b.savingsPct - a.savingsPct);
  return sorted.slice(0, 25); // target 15–25 items
}

function selectBalanced(scored: ScoredCandidate[]): ScoredCandidate[] {
  // Composite: 50% savings + 50% preference; prefer single store
  const withComposite = scored.map((s) => ({
    ...s,
    compositeScore: round(s.savingsPct * 0.50 + s.preferenceScore * 0.50, 4),
  }));

  // Group by retailer, prefer the primary retailer
  const byRetailer = new Map<string, typeof withComposite>();
  for (const s of withComposite) {
    const rk = s.candidate.retailer_key;
    if (!byRetailer.has(rk)) byRetailer.set(rk, []);
    byRetailer.get(rk)!.push(s);
  }

  // Pick the retailer with the highest average composite score
  let bestRetailer = withComposite[0]?.candidate.retailer_key ?? '';
  let bestAvg = -1;
  for (const [rk, group] of byRetailer) {
    const avg = group.reduce((s, c) => s + c.compositeScore, 0) / group.length;
    if (avg > bestAvg) { bestAvg = avg; bestRetailer = rk; }
  }

  const singleStore = (byRetailer.get(bestRetailer) ?? withComposite)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  return singleStore.slice(0, 18); // target 12–18 items
}

function selectConvenience(scored: ScoredCandidate[]): ScoredCandidate[] {
  // Highest preference score only, single store, minimum items
  const sorted = [...scored].sort((a, b) => b.preferenceScore - a.preferenceScore);

  // Find the single dominant retailer
  const topRetailer = sorted[0]?.candidate.retailer_key ?? '';
  const singleStore = sorted.filter((s) => s.candidate.retailer_key === topRetailer);

  return singleStore.slice(0, 12); // target 8–12 items
}

// ─────────────────────────────────────────────────────────────
// Recommendation exposure logger
// ─────────────────────────────────────────────────────────────

async function logRecommendationExposures(
  userId: string,
  sessionId: string,
  carts: CartOption[],
  db: SupabaseClient,
): Promise<void> {
  const exposures = carts.map((cart, idx) => ({
    user_id:              userId,
    session_id:           sessionId,
    recommendation_type:  'cart',
    object_type:          'cart',
    object_id:            cart.cart_id,
    rank_position:        idx + 1,
    score:                cart.cart_acceptance_probability,
    model_version:        MODEL_VERSION,
    explanation:          cart.explanation.join(' | '),
    reason_codes:         cart.reason_codes,
    outcome_status:       'shown',
  }));

  const { error } = await db.from('recommendation_exposures').insert(exposures);
  if (error) {
    console.warn('[cartEngine] Failed to log recommendation exposures:', error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export async function buildCartOptions(
  userId: string,
  retailerKey: string,
  weekOf: string,
  db: SupabaseClient,
  sessionId?: string,
): Promise<BuildCartOptionsResult> {
  const resolvedSessionId = sessionId ?? crypto.randomUUID();

  // ── 1. Load user state snapshot ──────────────────────────────
  const [snapshotResult, preferenceResult, budgetResult] = await Promise.all([
    db
      .from('user_state_snapshots')
      .select('user_id, snapshot, snapshot_at')
      .eq('user_id', userId)
      .single(),
    db
      .from('user_preference_scores')
      .select('preference_key, category, brand, retailer_key, score, normalized_score')
      .eq('user_id', userId)
      .order('normalized_score', { ascending: false })
      .limit(200),
    db
      .from('budgets')
      .select('weekly_budget_cents')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const snapshot = snapshotResult.data as UserSnapshotRow | null;
  const preferences = (preferenceResult.data ?? []) as PreferenceRow[];
  const budget = budgetResult.data as BudgetRow | null;
  const weeklyBudgetCents = budget?.weekly_budget_cents ?? null;

  // Load Neo4j graph context (gracefully degrades to empty defaults if unavailable)
  const graphCtx = await getUserGraphContext(userId);

  // ── 2. Load stack candidates ──────────────────────────────────
  const { data: candidateRows, error: candidateErr } = await db
    .from('stack_candidates')
    .select('id, retailer_key, week_of, stack_rank_score, items, primary_category, primary_brand')
    .eq('retailer_key', retailerKey)
    .eq('week_of', weekOf)
    .order('stack_rank_score', { ascending: false })
    .limit(40);

  if (candidateErr) {
    throw new Error(`[cartEngine] Failed to load stack_candidates: ${candidateErr.message}`);
  }

  const candidates = (candidateRows ?? []) as StackCandidateRow[];

  if (candidates.length === 0) {
    return {
      carts: [],
      computed_at: new Date().toISOString(),
      retailer_key: retailerKey,
      week_of: weekOf,
    };
  }

  // ── 3. Run stacking engine on each candidate ──────────────────
  const engine = new CouponStackingEngine(db);
  const preferenceMap = buildPreferenceLookup(preferences);

  const scoredCandidates: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    // Skip candidates whose primary category is in the user's graph reject list
    if (
      graphCtx.rejectedCategories.length > 0 &&
      candidate.primary_category &&
      graphCtx.rejectedCategories.includes(candidate.primary_category)
    ) {
      continue;
    }

    try {
      const stackResult = await engine.compute(
        candidate.id,
        candidate.items,
        candidate.retailer_key ?? retailerKey,
        { persistResults: false },
      );
      const scored = scoreCandidate(candidate, stackResult, preferenceMap, graphCtx);
      scoredCandidates.push(scored);
    } catch (err) {
      console.warn(`[cartEngine] Skipping candidate ${candidate.id}:`, err);
    }
  }

  if (scoredCandidates.length === 0) {
    return {
      carts: [],
      computed_at: new Date().toISOString(),
      retailer_key: retailerKey,
      week_of: weekOf,
    };
  }

  // ── 4–6. Generate 3 cart options ──────────────────────────────
  const maxSavingsItems  = selectMaxSavings(scoredCandidates);
  const balancedItems    = selectBalanced(scoredCandidates);
  const convenienceItems = selectConvenience(scoredCandidates);

  const maxSavingsCart  = buildCart('max_savings',  maxSavingsItems,  retailerKey, weeklyBudgetCents);
  const balancedCart    = buildCart('balanced',      balancedItems,    retailerKey, weeklyBudgetCents);
  const convenienceCart = buildCart('convenience',   convenienceItems, retailerKey, weeklyBudgetCents);

  // ── 7. Score carts with Vertex / heuristic ────────────────────
  // Build a representative StackResult for each cart for scoring
  async function scoreCart(cart: Omit<CartOption, 'cart_acceptance_probability'>): Promise<number> {
    // Use the first scored candidate's stackResult as a proxy for scoring
    const repr = scoredCandidates.find(
      (s) => cart.items.some((i) => i.product_id === s.stackResult.basketId || s.stackResult.lines.some((l) => l.itemId === i.product_id))
    );
    if (!repr) return 0.5;

    try {
      return await scoreStackForUser(userId, repr.stackResult, db);
    } catch {
      return 0.5;
    }
  }

  const [maxSavingsProb, balancedProb, convenienceProb] = await Promise.all([
    scoreCart(maxSavingsCart),
    scoreCart(balancedCart),
    scoreCart(convenienceCart),
  ]);

  const carts: CartOption[] = [
    { ...maxSavingsCart,  cart_acceptance_probability: maxSavingsProb  },
    { ...balancedCart,    cart_acceptance_probability: balancedProb    },
    { ...convenienceCart, cart_acceptance_probability: convenienceProb },
  ];

  // ── 8. Log recommendation exposures ───────────────────────────
  await logRecommendationExposures(userId, resolvedSessionId, carts, db);

  return {
    carts,
    computed_at: new Date().toISOString(),
    retailer_key: retailerKey,
    week_of: weekOf,
  };
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const url    = process.env['SUPABASE_URL'];
  const key    = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const userId = process.argv[2];
  const retailer = process.argv[3] ?? 'publix';
  const weekOf = process.argv[4] ?? new Date().toISOString().split('T')[0];

  if (!url || !key || !userId) {
    console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx ts-node cartEngine.ts <user_id> [retailer_key] [week_of]');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  console.log(`[cartEngine] Building carts for user=${userId} retailer=${retailer} week=${weekOf}`);

  try {
    const result = await buildCartOptions(userId, retailer, weekOf, db);
    console.log('[cartEngine] Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('[cartEngine] Failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
