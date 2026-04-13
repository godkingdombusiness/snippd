/**
 * get-cart-options — Edge Function
 *
 * GET /functions/v1/get-cart-options?retailer_key=publix&week_of=2026-04-14
 *
 * Auth: Bearer JWT (required — reads authenticated user's data)
 * Response time target: under 2 seconds
 *
 * Returns 3 cart options for the authenticated user:
 *   max_savings | balanced | convenience
 *
 * Strategy:
 *   1. Resolve user_id from JWT
 *   2. Load user state + preferences + budget in parallel
 *   3. Load stack_candidates (limit 40)
 *   4. Run inline stacking engine on each candidate
 *   5. Score each candidate by preferences (category 40%, retailer 30%, brand 20%, deal_type 10%)
 *   6. Build 3 cart options using selection strategies
 *   7. Log recommendation_exposures for all 3 carts
 *   8. Return sorted: max_savings → balanced → convenience
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────
// CORS + response helpers
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ─────────────────────────────────────────────────────────────
// Inline stacking engine (Deno cannot import from src/)
// ─────────────────────────────────────────────────────────────

type OfferType =
  | 'SALE' | 'BOGO' | 'MULTI' | 'BUY_X_GET_Y' | 'LOYALTY_PRICE'
  | 'STORE_COUPON' | 'MANUFACTURER_COUPON' | 'DIGITAL_COUPON' | 'REBATE';

interface StackOffer {
  id: string;
  offerType: OfferType;
  description?: string;
  discountCents?: number;
  discountPct?: number;
  finalPriceCents?: number;
  bogoModel?: string;
  buyQty?: number;
  getQty?: number;
  requiredQty?: number;
  maxRedemptions?: number;
  stackable: boolean;
  exclusionGroup?: string;
  priority?: number;
  expiresAt?: string;
  couponType?: string;
  rebateCents?: number;
}

interface StackItem {
  id: string;
  name?: string;
  regularPriceCents: number;
  quantity: number;
  category?: string;
  brand?: string;
  offers: StackOffer[];
}

interface RetailerPolicy {
  maxManufacturerCoupons: number;
  maxStoreCoupons: number;
  allowedCouponTypes: string[];
  blockSaleAndDigital: boolean;
  blockSaleAndLoyalty: boolean;
  blockBogoAndCoupon: boolean;
  roundingMode: 'floor' | 'round' | 'ceil';
}

const DEFAULT_POLICY: RetailerPolicy = {
  maxManufacturerCoupons: 1,
  maxStoreCoupons: 1,
  allowedCouponTypes: [],
  blockSaleAndDigital: false,
  blockSaleAndLoyalty: false,
  blockBogoAndCoupon: false,
  roundingMode: 'floor',
};

const OFFER_ORDER: OfferType[] = [
  'SALE', 'BOGO', 'MULTI', 'BUY_X_GET_Y', 'LOYALTY_PRICE',
  'STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON', 'REBATE',
];

function applyRounding(v: number, mode: RetailerPolicy['roundingMode']): number {
  if (mode === 'ceil')  return Math.ceil(v);
  if (mode === 'round') return Math.round(v);
  return Math.floor(v);
}

function computeStackSavings(items: StackItem[], policy: RetailerPolicy): number {
  let totalRegular = 0;
  let totalFinal   = 0;

  for (const item of items) {
    const qty = item.quantity;
    const now = new Date().toISOString();
    totalRegular += item.regularPriceCents * qty;

    // Filter + sort offers
    let candidates = item.offers.filter((o) => !o.expiresAt || o.expiresAt >= now);
    if (policy.allowedCouponTypes.length > 0) {
      candidates = candidates.filter(
        (o) => !o.couponType || policy.allowedCouponTypes.includes(o.couponType.toLowerCase()),
      );
    }
    const hasSale    = candidates.some((o) => o.offerType === 'SALE');
    const hasBogo    = candidates.some((o) => o.offerType === 'BOGO');
    const hasDigital = candidates.some((o) => o.offerType === 'DIGITAL_COUPON');
    const hasLoyalty = candidates.some((o) => o.offerType === 'LOYALTY_PRICE');
    const hasCoupon  = candidates.some((o) =>
      ['STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON'].includes(o.offerType),
    );
    if (policy.blockSaleAndDigital && hasSale && hasDigital) {
      candidates = candidates.filter((o) => o.offerType !== 'DIGITAL_COUPON');
    }
    if (policy.blockSaleAndLoyalty && hasSale && hasLoyalty) {
      candidates = candidates.filter((o) => o.offerType !== 'LOYALTY_PRICE');
    }
    if (policy.blockBogoAndCoupon && hasBogo && hasCoupon) {
      candidates = candidates.filter(
        (o) => !['STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON'].includes(o.offerType),
      );
    }

    candidates.sort((a, b) => OFFER_ORDER.indexOf(a.offerType) - OFFER_ORDER.indexOf(b.offerType));

    let runningPrice = item.regularPriceCents;
    for (const offer of candidates) {
      if (offer.offerType === 'SALE') {
        if (offer.discountPct !== undefined) runningPrice = applyRounding(runningPrice * (1 - offer.discountPct), policy.roundingMode);
        else if (offer.discountCents !== undefined) runningPrice -= offer.discountCents;
      } else if (offer.offerType === 'BOGO') {
        if (qty >= 2) {
          const pairs = Math.floor(qty / 2);
          if (offer.bogoModel === 'half_off_both') {
            runningPrice = applyRounding(runningPrice * 0.5, policy.roundingMode);
          } else {
            runningPrice = applyRounding(((qty - pairs) * runningPrice) / qty, policy.roundingMode);
          }
        }
      } else if (['STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON', 'LOYALTY_PRICE'].includes(offer.offerType)) {
        if (offer.discountCents !== undefined) runningPrice -= offer.discountCents;
        else if (offer.discountPct !== undefined) runningPrice = applyRounding(runningPrice * (1 - offer.discountPct), policy.roundingMode);
        else if (offer.finalPriceCents !== undefined) runningPrice = Math.min(runningPrice, offer.finalPriceCents);
      }
      // REBATE: no price change
      runningPrice = Math.max(0, runningPrice);
    }

    totalFinal += runningPrice * qty;
  }

  return totalRegular - totalFinal;
}

// ─────────────────────────────────────────────────────────────
// Preference scoring helpers
// ─────────────────────────────────────────────────────────────

interface PreferenceRow {
  preference_key: string;
  category: string;
  brand: string;
  retailer_key: string;
  normalized_score: number;
}

function buildPreferenceMap(rows: PreferenceRow[]): Map<string, number> {
  const map = new Map<string, number>();
  const DEAL_MAP: Record<string, string> = {
    stack_applied: 'deal::bogo', stack_viewed: 'deal::bogo',
    coupon_clipped: 'deal::coupon', coupon_redeemed: 'deal::coupon',
  };
  for (const r of rows) {
    if (r.category) {
      const k = `cat::${r.category}`;
      map.set(k, Math.max(map.get(k) ?? 0, r.normalized_score));
    }
    if (r.retailer_key) {
      const k = `ret::${r.retailer_key}`;
      map.set(k, Math.max(map.get(k) ?? 0, r.normalized_score));
    }
    if (r.brand) {
      const k = `brd::${r.brand}`;
      map.set(k, Math.max(map.get(k) ?? 0, r.normalized_score));
    }
    const dk = DEAL_MAP[r.preference_key];
    if (dk) map.set(dk, Math.max(map.get(dk) ?? 0, r.normalized_score));
  }
  return map;
}

function prefScore(candidate: {
  primary_category?: string;
  primary_brand?: string;
  retailer_key: string;
  items: StackItem[];
}, prefMap: Map<string, number>): number {
  const cat  = prefMap.get(`cat::${candidate.primary_category ?? ''}`) ?? 0;
  const ret  = prefMap.get(`ret::${candidate.retailer_key}`) ?? 0;
  const brd  = prefMap.get(`brd::${candidate.primary_brand ?? ''}`) ?? 0;
  const hasBogo = candidate.items.some((i) => i.offers.some((o) => o.offerType === 'BOGO'));
  const hasCoupon = candidate.items.some((i) =>
    i.offers.some((o) => ['MANUFACTURER_COUPON', 'DIGITAL_COUPON'].includes(o.offerType)),
  );
  let deal = 0;
  if (hasBogo) deal = Math.max(deal, prefMap.get('deal::bogo') ?? 0);
  if (hasCoupon) deal = Math.max(deal, prefMap.get('deal::coupon') ?? 0);
  return cat * 0.40 + ret * 0.30 + brd * 0.20 + deal * 0.10;
}

// ─────────────────────────────────────────────────────────────
// Cart types
// ─────────────────────────────────────────────────────────────

type CartType = 'max_savings' | 'balanced' | 'convenience';

interface CartCandidate {
  id: string;
  retailer_key: string;
  items: StackItem[];
  primary_category?: string;
  primary_brand?: string;
  savingsCents: number;
  regularCents: number;
  savingsPct: number;
  prefScore: number;
  compositeScore: number;
}

interface CartItemOut {
  product_id: string;
  name?: string;
  qty: number;
  regular_price_cents: number;
  final_price_cents: number;
  savings_cents: number;
  retailer_key: string;
  category?: string;
  brand?: string;
}

interface CartOut {
  cart_id: string;
  cart_type: CartType;
  retailer_set: string[];
  items: CartItemOut[];
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

function buildCartOut(
  cartType: CartType,
  selected: CartCandidate[],
  weeklyBudget: number | null,
  policy: RetailerPolicy,
): CartOut {
  const items: CartItemOut[] = [];

  for (const c of selected) {
    const totalRegular = c.items.reduce((s, i) => s + i.regularPriceCents * i.quantity, 0);
    const savings = computeStackSavings(c.items, policy);
    const totalFinal = totalRegular - savings;

    for (const item of c.items) {
      const lineRegular = item.regularPriceCents * item.quantity;
      const ratio = totalRegular > 0 ? lineRegular / totalRegular : 0;
      const lineFinal = Math.round(totalFinal * ratio);
      items.push({
        product_id:          item.id,
        name:                item.name,
        qty:                 item.quantity,
        regular_price_cents: lineRegular,
        final_price_cents:   Math.max(0, lineFinal),
        savings_cents:       Math.max(0, lineRegular - lineFinal),
        retailer_key:        c.retailer_key,
        category:            item.category,
        brand:               item.brand,
      });
    }
  }

  const subtotalBefore = items.reduce((s, i) => s + i.regular_price_cents, 0);
  const subtotalAfter  = items.reduce((s, i) => s + i.final_price_cents, 0);
  const totalSavings   = items.reduce((s, i) => s + i.savings_cents, 0);
  const savingsPct     = subtotalBefore > 0
    ? Math.round((totalSavings / subtotalBefore) * 1000) / 10
    : 0;
  const budgetFit = weeklyBudget !== null ? subtotalAfter <= weeklyBudget : true;
  const retailerSet = [...new Set(items.map((i) => i.retailer_key))];

  const explanation: string[] = [];
  const reason_codes: string[] = [];

  const topSavers = [...items].sort((a, b) => b.savings_cents - a.savings_cents).slice(0, 3);
  for (const i of topSavers) {
    if (i.savings_cents > 0) {
      explanation.push(`Saves $${(i.savings_cents / 100).toFixed(2)} on ${i.name ?? i.product_id}`);
    }
  }
  if (cartType === 'balanced') { explanation.push('Based on your shopping history'); reason_codes.push('preference_weighted'); }
  if (cartType === 'convenience') { explanation.push('Quick trip — minimum items'); reason_codes.push('convenience_optimised'); }
  if (cartType === 'max_savings') { reason_codes.push('savings_optimised'); }
  if (weeklyBudget !== null && budgetFit) {
    explanation.push(`Stays $${((weeklyBudget - subtotalAfter) / 100).toFixed(2)} under your weekly budget`);
    reason_codes.push('within_budget');
  } else if (weeklyBudget !== null && !budgetFit) {
    reason_codes.push('over_budget');
  }
  if (totalSavings > 0) reason_codes.push('has_savings');

  return {
    cart_id: crypto.randomUUID(),
    cart_type: cartType,
    retailer_set: retailerSet,
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
    model_version:                 'v1.0.0',
    cart_acceptance_probability:   0.5, // populated below
  };
}

// ─────────────────────────────────────────────────────────────
// Edge Function handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET')    return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  // ── Auth ────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const jwt = authHeader.slice(7);

  const anonDb = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey);
  const { data: userData, error: authErr } = await anonDb.auth.getUser(jwt);
  if (authErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);

  const userId = userData.user.id;
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── Query params ─────────────────────────────────────────────
  const url         = new URL(req.url);
  const retailerKey = url.searchParams.get('retailer_key') ?? '';
  const weekOf      = url.searchParams.get('week_of') ?? new Date().toISOString().split('T')[0];

  if (!retailerKey) return json({ error: 'retailer_key query param required' }, 400);

  const startMs = Date.now();

  try {
    // ── 1. Load user state, preferences, budget in parallel ────
    const [snapshotRes, prefRes, budgetRes] = await Promise.all([
      db.from('user_state_snapshots').select('snapshot').eq('user_id', userId).single(),
      db.from('user_preference_scores')
        .select('preference_key, category, brand, retailer_key, normalized_score')
        .eq('user_id', userId)
        .order('normalized_score', { ascending: false })
        .limit(200),
      db.from('budgets').select('weekly_budget_cents').eq('user_id', userId).maybeSingle(),
    ]);

    const prefMap = buildPreferenceMap((prefRes.data ?? []) as PreferenceRow[]);
    const weeklyBudget = (budgetRes.data as { weekly_budget_cents: number | null } | null)?.weekly_budget_cents ?? null;

    // ── 2. Load retailer policy ────────────────────────────────
    const [paramsRes, rulesRes] = await Promise.all([
      db.from('retailer_coupon_parameters').select('policy_key, policy_value').eq('retailer_key', retailerKey),
      db.from('retailer_rules').select('rule_key, rule_value').eq('retailer_key', retailerKey),
    ]);

    const policy: RetailerPolicy = { ...DEFAULT_POLICY };
    for (const row of (paramsRes.data ?? []) as Array<{ policy_key: string; policy_value: { value: unknown } }>) {
      if (row.policy_key === 'allowed_coupon_types') policy.allowedCouponTypes = row.policy_value.value as string[];
      if (row.policy_key === 'max_manufacturer_coupons') policy.maxManufacturerCoupons = row.policy_value.value as number;
      if (row.policy_key === 'max_store_coupons') policy.maxStoreCoupons = row.policy_value.value as number;
      if (row.policy_key === 'rounding_mode') policy.roundingMode = row.policy_value.value as RetailerPolicy['roundingMode'];
    }
    for (const row of (rulesRes.data ?? []) as Array<{ rule_key: string; rule_value: { value: boolean } }>) {
      if (row.rule_key === 'block_sale_and_digital') policy.blockSaleAndDigital = row.rule_value.value;
      if (row.rule_key === 'block_sale_and_loyalty') policy.blockSaleAndLoyalty = row.rule_value.value;
      if (row.rule_key === 'block_bogo_and_coupon')  policy.blockBogoAndCoupon  = row.rule_value.value;
    }

    // ── 3. Load stack candidates ───────────────────────────────
    const { data: candidateData, error: candidateErr } = await db
      .from('stack_candidates')
      .select('id, retailer_key, week_of, stack_rank_score, items, primary_category, primary_brand')
      .eq('retailer_key', retailerKey)
      .eq('week_of', weekOf)
      .order('stack_rank_score', { ascending: false })
      .limit(40);

    if (candidateErr) return json({ error: candidateErr.message }, 500);

    const rawCandidates = (candidateData ?? []) as Array<{
      id: string;
      retailer_key: string;
      week_of: string;
      stack_rank_score: number;
      items: StackItem[];
      primary_category?: string;
      primary_brand?: string;
    }>;

    if (rawCandidates.length === 0) {
      return json({ status: 'ok', carts: [], computed_at: new Date().toISOString() });
    }

    // ── 4–5. Score candidates ──────────────────────────────────
    const scored: CartCandidate[] = rawCandidates.map((c) => {
      const regularCents = c.items.reduce((s, i) => s + i.regularPriceCents * i.quantity, 0);
      const savingsCents = computeStackSavings(c.items, policy);
      const savingsPct   = regularCents > 0 ? savingsCents / regularCents : 0;
      const pScore       = prefScore(c, prefMap);
      return {
        id:               c.id,
        retailer_key:     c.retailer_key,
        items:            c.items,
        primary_category: c.primary_category,
        primary_brand:    c.primary_brand,
        savingsCents,
        regularCents,
        savingsPct,
        prefScore:        pScore,
        compositeScore:   savingsPct * 0.50 + pScore * 0.50,
      };
    });

    // ── 6. Build 3 carts ───────────────────────────────────────
    const maxSavingsSelected  = [...scored].sort((a, b) => b.savingsPct - a.savingsPct).slice(0, 25);
    const balancedSelected    = (() => {
      const singleStore = scored.filter((s) => s.retailer_key === retailerKey);
      return (singleStore.length > 0 ? singleStore : scored)
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .slice(0, 18);
    })();
    const convenienceSelected = [...scored]
      .filter((s) => s.retailer_key === retailerKey)
      .sort((a, b) => b.prefScore - a.prefScore)
      .slice(0, 12);

    const maxSavingsCart  = buildCartOut('max_savings',  maxSavingsSelected,  weeklyBudget, policy);
    const balancedCart    = buildCartOut('balanced',      balancedSelected,    weeklyBudget, policy);
    const convenienceCart = buildCartOut('convenience',   convenienceSelected, weeklyBudget, policy);

    // ── 7. Acceptance probability (heuristic) ─────────────────
    const snapshot = snapshotRes.data as { budget_stress_level?: number; coupon_responsiveness?: number } | null;
    const budgetStress = snapshot?.budget_stress_level ?? 0.3;
    const couponResp   = snapshot?.coupon_responsiveness ?? 0.5;

    function cartProb(cart: CartOut): number {
      const base = Math.min(1, (cart.savings_pct / 100) * 0.40 + couponResp * 0.35 + (1 - budgetStress) * 0.25);
      return Math.round(base * 1000) / 1000;
    }

    maxSavingsCart.cart_acceptance_probability  = cartProb(maxSavingsCart);
    balancedCart.cart_acceptance_probability    = cartProb(balancedCart);
    convenienceCart.cart_acceptance_probability = cartProb(convenienceCart);

    const carts = [maxSavingsCart, balancedCart, convenienceCart];

    // ── 8. Log recommendation exposures ───────────────────────
    const sessionId = crypto.randomUUID();
    await db.from('recommendation_exposures').insert(
      carts.map((cart, idx) => ({
        user_id:             userId,
        session_id:          sessionId,
        recommendation_type: 'cart',
        object_type:         'cart',
        object_id:           cart.cart_id,
        rank_position:       idx + 1,
        score:               cart.cart_acceptance_probability,
        model_version:       'v1.0.0',
        explanation:         cart.explanation.join(' | '),
        reason_codes:        cart.reason_codes,
        outcome_status:      'shown',
      })),
    );

    const elapsedMs = Date.now() - startMs;

    return json({
      status:       'ok',
      carts,
      computed_at:  new Date().toISOString(),
      retailer_key: retailerKey,
      week_of:      weekOf,
      elapsed_ms:   elapsedMs,
    });

  } catch (err) {
    console.error('[get-cart-options] Error:', err);
    return json({ error: String(err) }, 500);
  }
});
