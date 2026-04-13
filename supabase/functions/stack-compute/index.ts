/**
 * stack-compute — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stack-compute
 *
 * Loads retailer policy from retailer_coupon_parameters + retailer_rules,
 * validates offer combinations, applies offers in canonical order:
 *   SALE → BOGO → MULTI/BUY_X_GET_Y → LOYALTY_PRICE →
 *   STORE_COUPON → MANUFACTURER_COUPON → DIGITAL_COUPON → REBATE
 * Returns full StackResult with warnings, explanation, and savings breakdown.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────
// Types (inline — cannot import from src/ in Deno)
// ─────────────────────────────────────────────────────────────

type OfferType =
  | 'SALE' | 'BOGO' | 'MULTI' | 'BUY_X_GET_Y'
  | 'LOYALTY_PRICE' | 'STORE_COUPON' | 'MANUFACTURER_COUPON'
  | 'DIGITAL_COUPON' | 'REBATE';

type BogoModel = 'cheapest_free' | 'half_off_both' | 'second_free';
type RoundingMode = 'floor' | 'round' | 'ceil';

interface StackOffer {
  id: string;
  offerType: OfferType;
  description?: string;
  discountCents?: number;
  discountPct?: number;
  finalPriceCents?: number;
  bogoModel?: BogoModel;
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
  retailerKey: string;
  maxStackItems: number;
  allowedCouponTypes: string[];
  maxTotalCouponValueCents: number;
  maxManufacturerCoupons: number;
  maxStoreCoupons: number;
  roundingMode: RoundingMode;
  blockSaleAndDigital: boolean;
  blockSaleAndLoyalty: boolean;
  blockBogoAndCoupon: boolean;
  blockCouponAndLoyalty: boolean;
}

interface AppliedOffer {
  offerId: string;
  offerType: OfferType;
  description?: string;
  savingsCents: number;
  appliedToQty: number;
  runningPriceBeforeCents: number;
  runningPriceAfterCents: number;
}

interface StackWarning {
  code: string;
  offerId?: string;
  itemId?: string;
  message: string;
}

interface StackLineResult {
  itemId: string;
  itemName?: string;
  quantity: number;
  regularPriceCents: number;
  salePriceCents: number;
  finalPriceCents: number;
  lineTotalRegularCents: number;
  lineTotalFinalCents: number;
  lineSavingsCents: number;
  lineRebateCents: number;
  appliedOffers: AppliedOffer[];
  rejectedOfferIds: string[];
  warnings: StackWarning[];
}

interface StackResult {
  basketId: string;
  retailerKey: string;
  lines: StackLineResult[];
  basketRegularCents: number;
  basketFinalCents: number;
  totalSavingsCents: number;
  inStackSavingsCents: number;
  rebateCents: number;
  appliedOffers: AppliedOffer[];
  warnings: StackWarning[];
  rejectedOfferIds: string[];
  explanationSummary: string;
  computedAt: string;
  modelVersion: string;
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

const DEFAULT_POLICY: RetailerPolicy = {
  retailerKey: 'default',
  maxStackItems: 10,
  allowedCouponTypes: ['manufacturer', 'store', 'digital'],
  maxTotalCouponValueCents: 99_999,
  maxManufacturerCoupons: 1,
  maxStoreCoupons: 1,
  roundingMode: 'floor',
  blockSaleAndDigital: false,
  blockSaleAndLoyalty: false,
  blockBogoAndCoupon: false,
  blockCouponAndLoyalty: false,
};

function applyRounding(value: number, mode: RoundingMode): number {
  switch (mode) {
    case 'floor': return Math.floor(value);
    case 'ceil':  return Math.ceil(value);
    default:      return Math.round(value);
  }
}

function policyNum(pv: Record<string, unknown>, fallback: number): number {
  const v = pv?.value;
  return typeof v === 'number' ? v : fallback;
}

function policyArr(pv: Record<string, unknown>, fallback: string[]): string[] {
  const v = pv?.value;
  return Array.isArray(v) ? v.map(String) : fallback;
}

function policyBool(pv: Record<string, unknown>, fallback: boolean): boolean {
  const v = pv?.value;
  return typeof v === 'boolean' ? v : fallback;
}

// ─────────────────────────────────────────────────────────────
// Policy loader
// ─────────────────────────────────────────────────────────────

async function loadPolicy(
  db: ReturnType<typeof createClient>,
  retailerKey: string,
): Promise<RetailerPolicy> {
  const [{ data: params }, { data: rules }] = await Promise.all([
    db.from('retailer_coupon_parameters')
      .select('policy_key, policy_value')
      .eq('retailer_key', retailerKey)
      .or(`effective_to.is.null,effective_to.gte.${new Date().toISOString().split('T')[0]}`),
    db.from('retailer_rules')
      .select('rule_key, rule_value')
      .eq('retailer_key', retailerKey)
      .or(`effective_to.is.null,effective_to.gte.${new Date().toISOString().split('T')[0]}`),
  ]);

  const p: Record<string, Record<string, unknown>> = {};
  for (const row of (params ?? []) as Array<{ policy_key: string; policy_value: Record<string, unknown> }>) {
    p[row.policy_key] = row.policy_value;
  }

  const r: Record<string, Record<string, unknown>> = {};
  for (const row of (rules ?? []) as Array<{ rule_key: string; rule_value: Record<string, unknown> }>) {
    r[row.rule_key] = row.rule_value;
  }

  return {
    retailerKey,
    maxStackItems:          policyNum(p['max_stack_items'],          DEFAULT_POLICY.maxStackItems),
    allowedCouponTypes:     policyArr(p['allowed_coupon_types'],     DEFAULT_POLICY.allowedCouponTypes),
    maxTotalCouponValueCents: policyNum(p['max_total_coupon_value'], DEFAULT_POLICY.maxTotalCouponValueCents),
    maxManufacturerCoupons: policyNum(p['max_manufacturer_coupons'], DEFAULT_POLICY.maxManufacturerCoupons),
    maxStoreCoupons:        policyNum(p['max_store_coupons'],        DEFAULT_POLICY.maxStoreCoupons),
    roundingMode:           (p['rounding_mode']?.value as RoundingMode) ?? DEFAULT_POLICY.roundingMode,
    blockSaleAndDigital:    policyBool(r['block_sale_and_digital'],  DEFAULT_POLICY.blockSaleAndDigital),
    blockSaleAndLoyalty:    policyBool(r['block_sale_and_loyalty'],  DEFAULT_POLICY.blockSaleAndLoyalty),
    blockBogoAndCoupon:     policyBool(r['block_bogo_and_coupon'],   DEFAULT_POLICY.blockBogoAndCoupon),
    blockCouponAndLoyalty:  false,
  };
}

// ─────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────

type OfferGroup = { hasSale: boolean; hasBogo: boolean; hasLoyalty: boolean; hasCoupon: boolean; hasDigital: boolean };

function validateItem(
  item: StackItem,
  policy: RetailerPolicy,
  basketManufacturerCount: { n: number },
  basketStoreCount: { n: number },
): { validOffers: StackOffer[]; rejectedIds: string[]; warnings: StackWarning[] } {
  const warnings: StackWarning[] = [];
  const rejectedIds: string[] = [];
  let candidates = [...item.offers];
  const now = new Date().toISOString();

  // 1. Expired offers
  candidates = candidates.filter((o) => {
    if (o.expiresAt && o.expiresAt < now) {
      warnings.push({ code: 'OFFER_EXPIRED', offerId: o.id, itemId: item.id, message: `Offer ${o.id} expired at ${o.expiresAt}` });
      rejectedIds.push(o.id);
      return false;
    }
    return true;
  });

  // 2. Quantity requirements
  candidates = candidates.filter((o) => {
    if (o.requiredQty && item.quantity < o.requiredQty) {
      warnings.push({ code: 'QUANTITY_REQUIRED', offerId: o.id, itemId: item.id, message: `Offer ${o.id} requires qty ${o.requiredQty}, have ${item.quantity}` });
      rejectedIds.push(o.id);
      return false;
    }
    return true;
  });

  // 3. Non-stackable: keep only the first non-stackable, reject rest
  const nonStackable = candidates.filter((o) => !o.stackable);
  if (nonStackable.length > 1) {
    const keep = nonStackable[0];
    for (const o of nonStackable.slice(1)) {
      warnings.push({ code: 'NON_STACKABLE', offerId: o.id, itemId: item.id, message: `Offer ${o.id} is non-stackable; kept ${keep.id} instead` });
      rejectedIds.push(o.id);
    }
    candidates = candidates.filter((o) => o.stackable || o.id === keep.id);
  }

  // 4. Mutual exclusion groups
  const groups = new Map<string, StackOffer[]>();
  for (const o of candidates) {
    if (o.exclusionGroup) {
      const g = groups.get(o.exclusionGroup) ?? [];
      g.push(o);
      groups.set(o.exclusionGroup, g);
    }
  }
  for (const [, group] of groups) {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      const winner = sorted[0];
      for (const loser of sorted.slice(1)) {
        warnings.push({ code: 'MUTUAL_EXCLUSION', offerId: loser.id, itemId: item.id, message: `Offer ${loser.id} excluded by higher-priority ${winner.id} in group ${loser.exclusionGroup}` });
        rejectedIds.push(loser.id);
        candidates = candidates.filter((c) => c.id !== loser.id);
      }
    }
  }

  // 5. Allowed coupon types
  candidates = candidates.filter((o) => {
    if (o.couponType && policy.allowedCouponTypes.length > 0) {
      const allowed = policy.allowedCouponTypes.map((t) => t.toLowerCase());
      if (!allowed.includes(o.couponType.toLowerCase())) {
        warnings.push({ code: 'COUPON_TYPE_NOT_ALLOWED', offerId: o.id, itemId: item.id, message: `Coupon type ${o.couponType} not allowed at ${policy.retailerKey}` });
        rejectedIds.push(o.id);
        return false;
      }
    }
    return true;
  });

  // 6. Policy-based combination rules
  const flags = candidates.reduce<OfferGroup>(
    (acc, o) => {
      if (o.offerType === 'SALE') acc.hasSale = true;
      if (o.offerType === 'BOGO') acc.hasBogo = true;
      if (o.offerType === 'LOYALTY_PRICE') acc.hasLoyalty = true;
      if (o.offerType === 'DIGITAL_COUPON') acc.hasDigital = true;
      if (['STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON'].includes(o.offerType)) acc.hasCoupon = true;
      return acc;
    },
    { hasSale: false, hasBogo: false, hasLoyalty: false, hasCoupon: false, hasDigital: false },
  );

  if (policy.blockSaleAndDigital && flags.hasSale && flags.hasDigital) {
    candidates = candidates.filter((o) => {
      if (o.offerType === 'DIGITAL_COUPON') {
        warnings.push({ code: 'SALE_DIGITAL_BLOCKED', offerId: o.id, itemId: item.id, message: `${policy.retailerKey} does not allow DIGITAL_COUPON with SALE` });
        rejectedIds.push(o.id);
        return false;
      }
      return true;
    });
  }

  if (policy.blockBogoAndCoupon && flags.hasBogo && flags.hasCoupon) {
    candidates = candidates.filter((o) => {
      if (['STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON'].includes(o.offerType)) {
        warnings.push({ code: 'BOGO_COUPON_BLOCKED', offerId: o.id, itemId: item.id, message: `${policy.retailerKey} does not allow coupons with BOGO` });
        rejectedIds.push(o.id);
        return false;
      }
      return true;
    });
  }

  if (policy.blockSaleAndLoyalty && flags.hasSale && flags.hasLoyalty) {
    candidates = candidates.filter((o) => {
      if (o.offerType === 'LOYALTY_PRICE') {
        warnings.push({ code: 'SALE_LOYALTY_BLOCKED', offerId: o.id, itemId: item.id, message: `${policy.retailerKey} does not allow LOYALTY_PRICE with SALE` });
        rejectedIds.push(o.id);
        return false;
      }
      return true;
    });
  }

  // 7. Manufacturer coupon limit (keep highest value)
  const mfr = candidates.filter((o) => o.offerType === 'MANUFACTURER_COUPON');
  if (mfr.length > policy.maxManufacturerCoupons) {
    const sorted = [...mfr].sort((a, b) => (b.discountCents ?? 0) - (a.discountCents ?? 0));
    const keep = sorted.slice(0, policy.maxManufacturerCoupons);
    const reject = sorted.slice(policy.maxManufacturerCoupons);
    for (const o of reject) {
      warnings.push({ code: 'MANUFACTURER_LIMIT', offerId: o.id, itemId: item.id, message: `Manufacturer coupon limit (${policy.maxManufacturerCoupons}) reached; rejected ${o.id}` });
      rejectedIds.push(o.id);
      candidates = candidates.filter((c) => c.id !== o.id);
    }
    basketManufacturerCount.n += keep.length;
  } else {
    basketManufacturerCount.n += mfr.length;
  }

  // 8. Store coupon limit (keep highest value)
  const storeCoupons = candidates.filter((o) => o.offerType === 'STORE_COUPON');
  if (storeCoupons.length > policy.maxStoreCoupons) {
    const sorted = [...storeCoupons].sort((a, b) => (b.discountCents ?? 0) - (a.discountCents ?? 0));
    const reject = sorted.slice(policy.maxStoreCoupons);
    for (const o of reject) {
      warnings.push({ code: 'STORE_LIMIT', offerId: o.id, itemId: item.id, message: `Store coupon limit (${policy.maxStoreCoupons}) reached; rejected ${o.id}` });
      rejectedIds.push(o.id);
      candidates = candidates.filter((c) => c.id !== o.id);
    }
    basketStoreCount.n += policy.maxStoreCoupons;
  } else {
    basketStoreCount.n += storeCoupons.length;
  }

  return { validOffers: candidates, rejectedIds, warnings };
}

// ─────────────────────────────────────────────────────────────
// Calculator
// ─────────────────────────────────────────────────────────────

const OFFER_ORDER: OfferType[] = [
  'SALE', 'BOGO', 'MULTI', 'BUY_X_GET_Y',
  'LOYALTY_PRICE', 'STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON', 'REBATE',
];

function calculateLine(
  item: StackItem,
  validOffers: StackOffer[],
  policy: RetailerPolicy,
): StackLineResult {
  const ordered = OFFER_ORDER.flatMap((t) => validOffers.filter((o) => o.offerType === t));
  const qty = item.quantity;
  const regular = item.regularPriceCents;
  let running = regular;
  let salePriceCents = regular;
  const appliedOffers: AppliedOffer[] = [];
  let lineRebateCents = 0;
  const R = policy.roundingMode;

  for (const offer of ordered) {
    const before = running;

    if (offer.offerType === 'SALE') {
      if (offer.discountPct !== undefined) {
        running = applyRounding(running * (1 - offer.discountPct), R);
      } else if (offer.discountCents !== undefined) {
        running = Math.max(0, running - offer.discountCents);
      }
      salePriceCents = running;
    }

    else if (offer.offerType === 'BOGO') {
      if (qty < 2) { continue; }
      const pairs = Math.floor(qty / 2);
      const model = offer.bogoModel ?? 'second_free';
      if (model === 'half_off_both') {
        running = applyRounding(running * 0.5, R);
      } else {
        // second_free / cheapest_free: effective per-unit price = (2*price) / 2 = price — but 1 of each 2 is free
        // We reduce per-unit price proportionally: savings = pairs * running / qty
        const savingsPerUnit = applyRounding((pairs * running) / qty, R);
        running = Math.max(0, running - savingsPerUnit);
      }
      salePriceCents = running;
    }

    else if (offer.offerType === 'MULTI' || offer.offerType === 'BUY_X_GET_Y') {
      const buyQ = offer.buyQty ?? 1;
      const getQ = offer.getQty ?? 1;
      if (qty >= buyQ + getQ) {
        const freeSets = Math.floor(qty / (buyQ + getQ));
        const freeUnits = freeSets * getQ;
        const savingsPerUnit = applyRounding((freeUnits * running) / qty, R);
        running = Math.max(0, running - savingsPerUnit);
      } else { continue; }
    }

    else if (offer.offerType === 'LOYALTY_PRICE') {
      if (offer.finalPriceCents !== undefined) {
        running = Math.min(running, offer.finalPriceCents);
      } else if (offer.discountPct !== undefined) {
        running = applyRounding(running * (1 - offer.discountPct), R);
      } else if (offer.discountCents !== undefined) {
        running = Math.max(0, running - offer.discountCents);
      }
    }

    else if (['STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON'].includes(offer.offerType)) {
      if (offer.discountCents !== undefined) {
        running = Math.max(0, running - offer.discountCents);
      } else if (offer.discountPct !== undefined) {
        running = Math.max(0, applyRounding(running * (1 - offer.discountPct), R));
      }
    }

    else if (offer.offerType === 'REBATE') {
      lineRebateCents += (offer.rebateCents ?? 0) * qty;
      continue; // rebate does not affect running price
    }

    const after = Math.max(0, running);
    running = after;
    const saved = Math.max(0, before - after);
    if (saved > 0 || offer.offerType === 'REBATE') {
      appliedOffers.push({
        offerId: offer.id,
        offerType: offer.offerType,
        description: offer.description,
        savingsCents: saved,
        appliedToQty: qty,
        runningPriceBeforeCents: before,
        runningPriceAfterCents: after,
      });
    }
  }

  const finalPriceCents = Math.max(0, running);
  const lineTotalRegular = regular * qty;
  const lineTotalFinal   = finalPriceCents * qty;

  return {
    itemId:              item.id,
    itemName:            item.name,
    quantity:            qty,
    regularPriceCents:   regular,
    salePriceCents,
    finalPriceCents,
    lineTotalRegularCents: lineTotalRegular,
    lineTotalFinalCents:   lineTotalFinal,
    lineSavingsCents:      lineTotalRegular - lineTotalFinal,
    lineRebateCents,
    appliedOffers,
    rejectedOfferIds:    [],
    warnings:            [],
  };
}

// ─────────────────────────────────────────────────────────────
// CORS + response helpers
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const modelVersion = Deno.env.get('MODEL_VERSION') ?? 'v1.0.0';

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  // Auth — JWT or service key header
  const authHeader = req.headers.get('authorization') ?? '';
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const jwt = authHeader.slice(7);
  const { data: userData, error: authErr } = await db.auth.getUser(jwt);
  if (authErr || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const retailerKey = typeof body.retailer_key === 'string' ? body.retailer_key.toLowerCase() : '';
  const basketId    = typeof body.basket_id    === 'string' ? body.basket_id    : crypto.randomUUID();

  if (!retailerKey) return json({ error: 'retailer_key is required' }, 400);

  const rawItems = Array.isArray(body.items) ? body.items as unknown[] : [];
  if (!rawItems.length) return json({ error: 'items array is required and must be non-empty' }, 400);

  // Coerce raw items → StackItem
  const items: StackItem[] = rawItems.map((raw: unknown) => {
    const r = raw as Record<string, unknown>;
    const rawOffers = Array.isArray(r.offers) ? r.offers as unknown[] : [];
    return {
      id:                 String(r.id ?? crypto.randomUUID()),
      name:               typeof r.name === 'string' ? r.name : undefined,
      regularPriceCents:  typeof r.regular_price_cents === 'number' ? r.regular_price_cents : 0,
      quantity:           typeof r.quantity === 'number' ? r.quantity : 1,
      category:           typeof r.category === 'string' ? r.category : undefined,
      brand:              typeof r.brand    === 'string' ? r.brand    : undefined,
      offers: rawOffers.map((o: unknown) => {
        const oo = o as Record<string, unknown>;
        return {
          id:             String(oo.id ?? crypto.randomUUID()),
          offerType:      String(oo.offer_type ?? 'SALE') as OfferType,
          description:    typeof oo.description     === 'string' ? oo.description     : undefined,
          discountCents:  typeof oo.discount_cents  === 'number' ? oo.discount_cents  : undefined,
          discountPct:    typeof oo.discount_pct    === 'number' ? oo.discount_pct    : undefined,
          finalPriceCents:typeof oo.final_price_cents === 'number' ? oo.final_price_cents : undefined,
          bogoModel:      typeof oo.bogo_model      === 'string' ? oo.bogo_model as BogoModel : undefined,
          buyQty:         typeof oo.buy_qty         === 'number' ? oo.buy_qty         : undefined,
          getQty:         typeof oo.get_qty         === 'number' ? oo.get_qty         : undefined,
          requiredQty:    typeof oo.required_qty    === 'number' ? oo.required_qty    : undefined,
          maxRedemptions: typeof oo.max_redemptions === 'number' ? oo.max_redemptions : undefined,
          stackable:      typeof oo.stackable       === 'boolean' ? oo.stackable      : true,
          exclusionGroup: typeof oo.exclusion_group === 'string' ? oo.exclusion_group : undefined,
          priority:       typeof oo.priority        === 'number' ? oo.priority        : undefined,
          expiresAt:      typeof oo.expires_at      === 'string' ? oo.expires_at      : undefined,
          couponType:     typeof oo.coupon_type     === 'string' ? oo.coupon_type     : undefined,
          rebateCents:    typeof oo.rebate_cents    === 'number' ? oo.rebate_cents    : undefined,
        } as StackOffer;
      }),
    };
  });

  // Load policy
  const policy = await loadPolicy(db, retailerKey);

  // Run validation + calculation per item
  const allWarnings:   StackWarning[] = [];
  const allRejected:   string[]       = [];
  const allApplied:    AppliedOffer[] = [];
  const lines:         StackLineResult[] = [];
  const mfrCount = { n: 0 };
  const storeCount = { n: 0 };

  for (const item of items) {
    const { validOffers, rejectedIds, warnings } = validateItem(item, policy, mfrCount, storeCount);
    const line = calculateLine({ ...item, offers: validOffers }, validOffers, policy);
    line.rejectedOfferIds = rejectedIds;
    line.warnings         = warnings;
    allWarnings.push(...warnings);
    allRejected.push(...rejectedIds);
    allApplied.push(...line.appliedOffers);
    lines.push(line);
  }

  const basketRegularCents = lines.reduce((s, l) => s + l.lineTotalRegularCents, 0);
  const basketFinalCents   = lines.reduce((s, l) => s + l.lineTotalFinalCents,   0);
  const inStackSavings     = lines.reduce((s, l) => s + l.lineSavingsCents,      0);
  const rebateCents        = lines.reduce((s, l) => s + l.lineRebateCents,       0);

  // Explanation summary
  const pctSaved = basketRegularCents > 0
    ? ((inStackSavings / basketRegularCents) * 100).toFixed(1)
    : '0.0';
  const explanationSummary =
    `Stack saves $${(inStackSavings / 100).toFixed(2)} (${pctSaved}%) on ${lines.length} item(s) at ${retailerKey}` +
    (rebateCents > 0 ? ` + $${(rebateCents / 100).toFixed(2)} rebate` : '') +
    (allWarnings.length > 0 ? `. ${allWarnings.length} warning(s).` : '.');

  const result: StackResult = {
    basketId,
    retailerKey,
    lines,
    basketRegularCents,
    basketFinalCents,
    totalSavingsCents:     inStackSavings + rebateCents,
    inStackSavingsCents:   inStackSavings,
    rebateCents,
    appliedOffers:  allApplied,
    warnings:       allWarnings,
    rejectedOfferIds: [...new Set(allRejected)],
    explanationSummary,
    computedAt:     new Date().toISOString(),
    modelVersion,
  };

  // Optionally persist to stack_results
  const shouldPersist = body.persist === true;
  if (shouldPersist) {
    await db.from('stack_results').insert([{
      user_id:         userData.user.id,
      retailer_key:    retailerKey,
      model_version:   modelVersion,
      variant_type:    'computed',
      candidate:       result,
      budget_fit:      0,
      preference_fit:  0,
      simplicity_score: 0,
      score:           0,
    }]);
  }

  return json({ status: 'ok', result });
});
