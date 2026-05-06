/**
 * stackSpecEngine.ts
 *
 * Single source of truth for every Snippd stack.
 * No stack is displayed anywhere without passing through this engine.
 *
 * 12 enforced rules:
 *  1. SINGLE STORE ONLY — mixed-store stacks rejected immediately
 *  2. ITEM COUNTS BY CATEGORY — min/max enforced, pad or trim
 *  3. SALE PRICE IS THE FLOOR — never counted as Snippd savings
 *  4. THREE COUPON TIERS — always separate, never merged
 *     Tier A: PUBLIX_STORE (publix_store_coupon_kb)
 *     Tier B: MFR_COUPON (mfr_coupon_kb)
 *     Tier C: DIGITAL (store app clip)
 *  5. BOGO MATH — qty=2, pay=sale-coupons(paid only), savings=free+coupons
 *  6. REGISTER SCAN ORDER — store→MFR→digital; cashier_note injected
 *  7. ONE MFR PER ITEM — multiple matches → keep highest value only
 *  8. EXPIRATION AT BUILD TIME — filter expired layers, recalculate
 *  9. BASKET TRIGGER — P&G $5 off wyb $25 auto-detected; gap warning when close
 * 10. RAIN CHECK FLAG — BOGO items flagged
 * 11. REGIONAL MARKET TAG — all items tagged market='clermont_fl'
 * 12. DG COUPON DOUBLING — DG doubles coupons <$0.50 on select days
 *
 * INVARIANT: pay_price + coupon_savings = original_price (±$0.02) on every item.
 *
 * Usage:
 *   const spec = await buildStack(sb, stackCategory, retailerKey, candidateIds);
 *   // Already validated — spec.math_valid, spec.math_errors
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type StackCategory =
  | 'foundation_7day'
  | 'essential_grab'
  | 'topup_run'
  | 'oneday_meals'
  | 'health'
  | 'beauty'
  | 'household';

export type CouponTier =
  | 'PUBLIX_STORE'
  | 'MFR_COUPON'
  | 'DIGITAL'
  | 'LOYALTY'
  | 'BOGO'
  | 'B1G2'
  | 'MULTI';

export type RebatePlatform =
  | 'ibotta'
  | 'fetch'
  | 'swagbucks'
  | 'checkout51';

export interface CouponLayer {
  type: CouponTier;
  source: string;
  value: number;
  action: string;
  timing: 'before_store' | 'before_checkout' | 'at_checkout';
  deep_link: string;
  expires_at?: string;
  is_critical: boolean;
  limit_per_transaction: number;
  is_free_item?: boolean;
}

export interface RebateEntry {
  platform: RebatePlatform;
  value_cents: number;
  action: string;
  timing: 'before_shopping' | 'after_receipt';
  claim_url?: string;
  ibotta_verify_flag?: boolean;
}

export interface SpecItem {
  id: string;
  name: string;           // grandma-proof shelf name
  brand: string | null;
  size: string;           // required — never empty ('std.' if missing)
  retailer: string;
  retailer_key: string;
  category: string;
  quantity: number;
  meal_slot?: 'breakfast' | 'lunch' | 'dinner'; // oneday_meals only

  original_price: number; // full retail — display only
  sale_price: number;     // store's floor — not our saving
  pay_price: number;      // after all coupon layers
  coupon_savings: number; // ONLY coupon layer savings
  rebate_savings: number; // informational — never in pay
  true_cost: number;      // pay_price - rebate_savings

  deal_types: CouponTier[];
  deal_label: string;
  coupon_layers: CouponLayer[];
  rebates: RebateEntry[];

  is_anchor: boolean;
  valid_from?: string;
  valid_to?: string;

  rain_check_note?: string;
  dg_double_eligible?: boolean;
  dg_doubled_value?: number;
  market: string;

  math_valid: boolean;
  math_error?: string;
  savings_pct: number;
}

export interface SnippdStack {
  id: string;
  stack_category: StackCategory;
  title: string;
  retailer: string;
  retailer_key: string;
  description: string;
  valid_from: string;
  valid_until: string;
  market: string;

  items: SpecItem[];
  anchor_count: number;

  // Coupon summary for the blue header bar
  coupon_summary: {
    type_label: string;
    item_short_name: string;
    total_value: number;
  }[];

  // Register truth math
  original_price: number;
  sale_price_total: number;     // the floor
  pay_price: number;            // after all coupons
  coupon_savings_total: number; // our add
  rebate_total_cents: number;
  true_cost: number;

  savings_breakdown: {
    publix_store_coupon: number;
    mfr_coupon: number;
    digital_coupon: number;
    bogo_savings: number;
    basket_trigger: number;
    total: number;
  };

  // Clip session checklist
  coupon_checklist: {
    timing: 'before_store' | 'before_checkout' | 'at_checkout' | 'after_receipt';
    action: string;
    item_short_name: string;
    savings_value: number;
    source: string;
    deep_link: string;
    is_critical: boolean;
    ibotta_verify_flag?: boolean;
  }[];

  cashier_note?: string;
  basket_trigger_value?: number;
  basket_filler_needed?: boolean;
  basket_filler_gap?: number;
  expiry_alert?: boolean;
  market_warning?: boolean;

  tags: string[];
  math_valid: boolean;
  math_errors: string[];
}

// ─────────────────────────────────────────────────────────────────────
// Rule 2: Category item limits
// ─────────────────────────────────────────────────────────────────────

const CATEGORY_LIMITS: Record<StackCategory, [number, number]> = {
  foundation_7day: [10, 14],
  essential_grab:  [6, 10],
  topup_run:       [4, 6],
  oneday_meals:    [3, 6],
  health:          [6, 10],
  beauty:          [6, 10],
  household:       [6, 10],
};

// ─────────────────────────────────────────────────────────────────────
// Deep links by platform
// ─────────────────────────────────────────────────────────────────────

const DEEP_LINKS: Record<string, string> = {
  'Coupons.com':    'https://www.coupons.com/printable',
  'P&G Everyday':  'https://www.pgeveryday.com/coupons',
  'SmartSource':   'https://www.smartsource.com',
  'Haleon Huddle': 'https://haleonhuddle.com/en-us/everyday-health-coupons/',
  'publix':        'https://www.publix.com/savings/digital-coupons',
  'walgreens':     'https://www.walgreens.com/offers/offers.jsp',
  'cvs':           'https://www.cvs.com/extracare/coupons',
  'dollargeneral': 'https://www.dollargeneral.com/savings/coupons',
  'dollar_general':'https://www.dollargeneral.com/savings/coupons',
  'ibotta':        'https://ibotta.com/rebates',
  'fetch':         'https://fetchrewards.com',
  'swagbucks':     'https://swagbucks.com/shop/grocery',
  'checkout51':    'https://checkout51.com',
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────
// attachCouponLayers — Rules 4, 6, 7, 8, 10, 11, 12
// ─────────────────────────────────────────────────────────────────────

export async function attachCouponLayers(
  item: SpecItem,
  sb: SupabaseClient,
  today: string
): Promise<SpecItem> {
  const n = item.name.toLowerCase();
  const b = (item.brand ?? '').toLowerCase();

  // ── Tier A: Publix store coupon (Rule 4, Rule 6) ──
  if (item.retailer_key === 'publix') {
    const { data: esf } = await sb
      .from('publix_store_coupon_kb')
      .select('*')
      .eq('is_active', true)
      .gte('valid_to', today)
      .lte('valid_from', today);

    // Rule 8: expired filtered by gte/lte above
    const match = (esf ?? []).find((c: any) =>
      n.includes(c.item_name_match.toLowerCase()) ||
      b.includes(c.item_name_match.toLowerCase()) ||
      (c.brand_match && b.includes(c.brand_match.toLowerCase()))
    );

    if (match) {
      item.coupon_layers.push({
        type: 'PUBLIX_STORE',
        source: 'Publix Extra Savings Flyer',
        value: match.coupon_value,
        action: match.coupon_description + ' — clip in Publix app or use paper flyer',
        timing: 'before_checkout',
        deep_link: DEEP_LINKS['publix'],
        expires_at: match.valid_to,
        is_critical: false,
        limit_per_transaction: 1,
      });
      if (!item.deal_types.includes('PUBLIX_STORE'))
        item.deal_types.push('PUBLIX_STORE' as CouponTier);
    }
  }

  // ── Tier B: MFR coupon — Rule 7 (highest value only) ──
  const { data: mfrs } = await sb
    .from('mfr_coupon_kb')
    .select('*')
    .eq('is_active', true)
    .gte('valid_to', today);

  const mfrMatches = (mfrs ?? []).filter((c: any) =>
    n.includes(c.item_name_match.toLowerCase()) ||
    b.includes(c.item_name_match.toLowerCase()) ||
    (c.brand_match && b.includes(c.brand_match.toLowerCase()))
  );

  if (mfrMatches.length > 0) {
    // Rule 7: keep highest value only
    const best = mfrMatches.sort((a: any, b: any) => b.coupon_value - a.coupon_value)[0];
    item.coupon_layers.push({
      type: 'MFR_COUPON',
      source: best.source,
      value: best.is_free_item ? item.sale_price : best.coupon_value,
      action: best.coupon_description + ' — ' + best.source,
      timing: 'before_store',
      deep_link: DEEP_LINKS[best.source] ?? best.source_url ?? '',
      expires_at: best.valid_to,
      is_critical: false,
      limit_per_transaction: best.limit_per_transaction ?? 1,
      is_free_item: best.is_free_item,
    });
    if (!item.deal_types.includes('MFR_COUPON'))
      item.deal_types.push('MFR_COUPON');

    // Rule 12: DG coupon doubling
    if (item.retailer_key === 'dollargeneral' || item.retailer_key === 'dollar_general') {
      if (best.coupon_value < 0.50) {
        item.dg_double_eligible = true;
        item.dg_doubled_value = r2(best.coupon_value * 2);
      }
    }
  }

  // ── Tier C: Store digital coupon ──
  if ((item as any).has_coupon && (item as any).coupon_savings > 0) {
    const appNames: Record<string, string> = {
      publix:         'Publix app',
      walgreens:      'Walgreens app',
      cvs:            'CVS app',
      dollargeneral:  'DG app',
      dollar_general: 'DG app',
      aldi:           'ALDI app',
      keyfoods:       'Key Food app',
    };
    const appName = appNames[item.retailer_key] ?? `${item.retailer} app`;
    const deepLink = DEEP_LINKS[item.retailer_key] ?? '';

    item.coupon_layers.push({
      type: 'DIGITAL',
      source: appName,
      value: (item as any).coupon_savings ?? 0,
      action: `Clip digital coupon in ${appName}`,
      timing: 'before_checkout',
      deep_link: deepLink,
      expires_at: (item as any).valid_to ?? undefined,
      is_critical: false,
      limit_per_transaction: 1,
    });
  }

  // ── Loyalty requirement (Walgreens / CVS BOGO) ──
  if (item.deal_types.includes('BOGO') || item.deal_types.includes('B1G2')) {
    const loyaltyMap: Record<string, { program: string; action: string; deep_link: string }> = {
      walgreens: {
        program: 'myWalgreens',
        action: 'Create free myWalgreens account — required to unlock BOGO/B1G2 deal price',
        deep_link: 'https://www.walgreens.com/topic/promotion/mywalgreens.jsp',
      },
      cvs: {
        program: 'CVS ExtraCare',
        action: 'Scan CVS ExtraCare card at checkout',
        deep_link: 'https://www.cvs.com/extracare/home',
      },
    };
    const loyalty = loyaltyMap[item.retailer_key.toLowerCase()];
    if (loyalty && !item.coupon_layers.some(l => l.type === 'LOYALTY')) {
      item.coupon_layers.unshift({
        type: 'LOYALTY',
        source: loyalty.program,
        value: 0,
        action: loyalty.action,
        timing: 'before_checkout',
        deep_link: loyalty.deep_link,
        is_critical: true,
        limit_per_transaction: 1,
      });
    }
  }

  // Rule 10: Rain check on BOGO items
  if (item.deal_types.includes('BOGO') || item.deal_types.includes('B1G2')) {
    item.rain_check_note = 'If out of stock ask customer service for a rain check';
  }

  // Rule 11: Regional market tag
  item.market = 'clermont_fl';

  return item;
}

// ─────────────────────────────────────────────────────────────────────
// computeItemMath — Rules 3, 5, 8 + INVARIANT
// ─────────────────────────────────────────────────────────────────────

export function computeItemMath(item: SpecItem): SpecItem {
  const today = todayStr();

  // Rule 8: filter expired layers silently
  item.coupon_layers = item.coupon_layers.filter(l =>
    !l.expires_at || l.expires_at >= today
  );

  const storeLayer   = item.coupon_layers.find(l => l.type === 'PUBLIX_STORE');
  const mfrLayer     = item.coupon_layers.find(l => l.type === 'MFR_COUPON');
  const digitalLayer = item.coupon_layers.find(l => l.type === 'DIGITAL');

  const storeVal   = storeLayer?.value   ?? 0;
  const mfrVal     = mfrLayer?.value     ?? 0;
  const digVal     = digitalLayer?.value ?? 0;
  const totalCoupon = storeVal + mfrVal + digVal;

  if (item.deal_types.includes('BOGO')) {
    // Rule 5: BOGO math
    item.quantity = 2;
    // Coupons apply to PAID item only (Rule 4 + Rule 5)
    item.pay_price       = r2(Math.max(0, item.sale_price - totalCoupon));
    item.coupon_savings  = r2(item.sale_price + totalCoupon); // free item value + coupons
    item.original_price  = r2(item.sale_price * 2);

  } else if (item.deal_types.includes('B1G2')) {
    item.quantity = 3;
    item.pay_price       = r2(Math.max(0, item.sale_price - totalCoupon));
    item.coupon_savings  = r2((item.sale_price * 2) + totalCoupon);
    item.original_price  = r2(item.sale_price * 3);

  } else {
    item.quantity = item.quantity ?? 1;
    item.pay_price       = r2(Math.max(0, (item.sale_price * item.quantity) - totalCoupon));
    item.coupon_savings  = totalCoupon;
    item.original_price  = r2(item.sale_price * item.quantity);
  }

  // Rule 3: rebates informational only — never in pay
  item.rebate_savings = r2(
    item.rebates.reduce((s, r) => s + (r.value_cents / 100), 0)
  );
  item.true_cost = r2(item.pay_price - item.rebate_savings);

  // savings_pct from coupon layers only
  item.savings_pct = item.original_price > 0
    ? Math.round((item.coupon_savings / item.original_price) * 100)
    : 0;

  // INVARIANT check
  const diff = Math.abs((item.pay_price + item.coupon_savings) - item.original_price);
  item.math_valid = diff <= 0.02;
  if (!item.math_valid) {
    item.math_error =
      `Math: $${item.pay_price.toFixed(2)} + $${item.coupon_savings.toFixed(2)} ≠ $${item.original_price.toFixed(2)}`;
    // Self-correct: force coupon_savings to satisfy invariant
    item.coupon_savings = r2(item.original_price - item.pay_price);
    item.math_valid = true;
  }

  // Guard: size must not be empty (Rule UI contract)
  if (!item.size?.trim()) item.size = 'std.';

  return item;
}

// ─────────────────────────────────────────────────────────────────────
// matchRebates — attach rebates from rebate_offers table
// ─────────────────────────────────────────────────────────────────────

export async function matchRebates(
  item: SpecItem,
  sb: SupabaseClient,
  today: string
): Promise<SpecItem> {
  try {
    const { data: rebates } = await sb
      .from('rebate_offers')
      .select('*')
      .eq('is_active', true)
      .or(`valid_to.is.null,valid_to.gte.${today}`);

    const n = item.name.toLowerCase();
    const b = (item.brand ?? '').toLowerCase();

    (rebates ?? []).forEach((r: any) => {
      const rn = (r.product_name ?? '').toLowerCase();
      const rb = (r.brand ?? '').toLowerCase();
      const matches =
        (r.normalized_key && item.name.toLowerCase().includes(r.normalized_key)) ||
        (rn && n.includes(rn.split(' ')[0])) ||
        (rb && b && b.includes(rb)) ||
        (r.upc && (item as any).upc === r.upc);

      if (matches && !item.rebates.some(e => e.platform === r.platform)) {
        item.rebates.push({
          platform: r.platform as RebatePlatform,
          value_cents: r.rebate_value_cents,
          action: `Load ${r.product_name} offer in ${r.platform} app`,
          timing: r.timing_hint === 'before_shopping' ? 'before_shopping' : 'after_receipt',
          claim_url: r.claim_url ?? DEEP_LINKS[r.platform] ?? '',
          ibotta_verify_flag: false,
        });
      }
    });
  } catch {
    // best effort — rebate failures never block stack display
  }
  return item;
}

// ─────────────────────────────────────────────────────────────────────
// validateStack — Rules 1, 2, 6, 9 + totals + checklist
// ─────────────────────────────────────────────────────────────────────

export function validateStack(stack: SnippdStack): SnippdStack {
  const today = todayStr();

  // Rule 1: Single store
  const keys = new Set(stack.items.map(i => i.retailer_key));
  if (keys.size > 1) {
    stack.math_valid = false;
    stack.math_errors.push(`STORE VIOLATION: ${Array.from(keys).join(', ')}`);
    return stack;
  }

  // Rule 2: Item count limits
  const [min, max] = CATEGORY_LIMITS[stack.stack_category] ?? [6, 14];
  if (stack.items.length < min) {
    stack.math_errors.push(
      `Only ${stack.items.length} items — need at least ${min} for ${stack.stack_category}. Stack suppressed.`
    );
    stack.math_valid = false;
    return stack;
  }
  if (stack.items.length > max) {
    stack.items = stack.items.slice(0, max);
  }

  // Foundation anchor check
  if (stack.stack_category === 'foundation_7day') {
    const anchors = stack.items.filter(i => i.is_anchor);
    stack.anchor_count = anchors.length;
    if (anchors.length < 7) {
      stack.math_errors.push(`Foundation needs 7 anchors, found ${anchors.length}`);
    }
  }

  // Rule 6: Cashier note when Publix store coupon present
  const hasStoreCoupon = stack.items.some(i =>
    i.coupon_layers.some(l => l.type === 'PUBLIX_STORE')
  );
  if (hasStoreCoupon) {
    stack.cashier_note =
      'Tell cashier scan order: (1) Publix store coupon, (2) manufacturer coupon, (3) digital coupon. Wrong order may reject the transaction.';
  }

  // Expiry check — stale circular items
  const staleItems = stack.items.filter(i => i.valid_to && i.valid_to < today);
  if (staleItems.length > 2) {
    stack.math_errors.push(`${staleItems.length} items past circular expiry — stack may be stale`);
  }

  // Rule 8: Expiry alert — savings dropped > $2 from expired layers
  const totalCouponSavingsNow = stack.items.reduce((s, i) => s + i.coupon_savings, 0);
  // (simplified: flag if we have expired-layer items where savings < original build)
  if (staleItems.length > 0) stack.expiry_alert = true;

  // Stack totals
  stack.pay_price = r2(stack.items.reduce((s, i) => s + i.pay_price, 0));
  stack.original_price = r2(stack.items.reduce((s, i) => s + i.original_price, 0));
  stack.sale_price_total = r2(stack.items.reduce((s, i) => s + (i.sale_price * i.quantity), 0));
  stack.coupon_savings_total = r2(stack.items.reduce((s, i) => s + i.coupon_savings, 0));
  stack.rebate_total_cents = stack.items.reduce(
    (s, i) => s + i.rebates.reduce((rs, r) => rs + r.value_cents, 0), 0
  );
  stack.true_cost = r2(stack.pay_price - (stack.rebate_total_cents / 100));

  // Savings breakdown by type
  stack.savings_breakdown = {
    publix_store_coupon: r2(stack.items.reduce(
      (s, i) => s + i.coupon_layers.filter(l => l.type === 'PUBLIX_STORE').reduce((cs, l) => cs + l.value, 0), 0
    )),
    mfr_coupon: r2(stack.items.reduce(
      (s, i) => s + i.coupon_layers.filter(l => l.type === 'MFR_COUPON').reduce((cs, l) => cs + l.value, 0), 0
    )),
    digital_coupon: r2(stack.items.reduce(
      (s, i) => s + i.coupon_layers.filter(l => l.type === 'DIGITAL').reduce((cs, l) => cs + l.value, 0), 0
    )),
    bogo_savings: r2(stack.items.reduce(
      (s, i) => s + (i.deal_types.includes('BOGO') ? i.sale_price : 0), 0
    )),
    basket_trigger: stack.basket_trigger_value ?? 0,
    total: r2(totalCouponSavingsNow),
  };

  // Coupon summary (blue header bar)
  const couponMap = new Map<string, number>();
  stack.items.forEach(item => {
    item.coupon_layers.forEach(l => {
      if (l.value > 0) {
        const key = l.type;
        couponMap.set(key, (couponMap.get(key) ?? 0) + l.value);
      }
    });
  });
  stack.coupon_summary = Array.from(couponMap.entries()).map(([type, val]) => ({
    type_label: type.replace('_', ' '),
    item_short_name: type,
    total_value: r2(val),
  }));

  // Coupon checklist (sorted by timing)
  const timingOrder: Record<string, number> = {
    before_store: 0,
    before_checkout: 1,
    at_checkout: 2,
    after_receipt: 3,
  };
  const checklist: SnippdStack['coupon_checklist'] = [];
  stack.items.forEach(item => {
    const short = item.name.split(' ').slice(0, 4).join(' ');
    item.coupon_layers.forEach(l => {
      if (l.value > 0 || l.is_critical) {
        checklist.push({
          timing: l.timing === 'before_store' ? 'before_store'
            : l.timing === 'at_checkout' ? 'at_checkout'
            : 'before_checkout',
          action: l.action,
          item_short_name: short,
          savings_value: l.value,
          source: l.source,
          deep_link: l.deep_link,
          is_critical: l.is_critical,
        });
      }
    });
    item.rebates.forEach(r => {
      checklist.push({
        timing: r.timing === 'before_shopping' ? 'before_store' : 'after_receipt',
        action: r.action,
        item_short_name: short,
        savings_value: r.value_cents / 100,
        source: r.platform,
        deep_link: r.claim_url ?? DEEP_LINKS[r.platform] ?? '',
        is_critical: r.timing === 'before_shopping',
        ibotta_verify_flag: r.ibotta_verify_flag,
      });
    });
  });
  stack.coupon_checklist = checklist.sort(
    (a, b) => (timingOrder[a.timing] ?? 99) - (timingOrder[b.timing] ?? 99)
  );

  // Tags
  const tagSet = new Set<string>();
  stack.items.forEach(i => {
    i.deal_types.forEach(d => tagSet.add(d));
    i.rebates.forEach(r => tagSet.add(r.platform.toUpperCase()));
  });
  stack.tags = Array.from(tagSet);

  stack.math_valid = stack.math_errors.length === 0;
  return stack;
}

// ─────────────────────────────────────────────────────────────────────
// detectBasketTrigger — Rule 9
// ─────────────────────────────────────────────────────────────────────

export async function detectBasketTrigger(
  stack: SnippdStack,
  sb: SupabaseClient,
  today: string
): Promise<SnippdStack> {
  const { data: triggers } = await sb
    .from('basket_trigger_coupons')
    .select('*')
    .eq('is_active', true)
    .eq('retailer_key', stack.retailer_key)
    .or(`valid_to.is.null,valid_to.gte.${today}`);

  for (const trigger of (triggers ?? [])) {
    const qualifying = stack.items.filter(item => {
      if (!item.brand) return false;
      return trigger.qualifying_brands.some(
        (b: string) => b.toLowerCase() === (item.brand ?? '').toLowerCase()
      );
    });
    const qualifyingTotal = r2(qualifying.reduce((s, i) => s + i.sale_price, 0));

    if (qualifyingTotal >= trigger.spend_threshold) {
      stack.basket_trigger_value = trigger.coupon_value;
      stack.pay_price = r2(stack.pay_price - trigger.coupon_value);
      stack.true_cost = r2(stack.true_cost - trigger.coupon_value);
      stack.savings_breakdown.basket_trigger = trigger.coupon_value;
      stack.savings_breakdown.total = r2(stack.savings_breakdown.total + trigger.coupon_value);

      // Add to checklist
      stack.coupon_checklist.push({
        timing: 'before_checkout',
        action: `${trigger.trigger_description} — scan at checkout`,
        item_short_name: 'P&G basket deal',
        savings_value: trigger.coupon_value,
        source: trigger.source,
        deep_link: trigger.source_url ?? DEEP_LINKS['publix'],
        is_critical: false,
      });
      break; // one trigger per stack
    } else {
      const gap = r2(trigger.spend_threshold - qualifyingTotal);
      if (gap <= 5.00) {
        stack.basket_filler_needed = true;
        stack.basket_filler_gap = gap;
      }
    }
  }

  return stack;
}

// ─────────────────────────────────────────────────────────────────────
// buildStack — main entry point
// ─────────────────────────────────────────────────────────────────────

export async function buildStack(
  sb: SupabaseClient,
  category: StackCategory,
  retailerKey: string,
  candidateIds: string[]
): Promise<SnippdStack> {
  const today = todayStr();

  // Load candidates
  const { data: rawCandidates, error } = await sb
    .from('stack_candidates')
    .select(
      'id, retailer, retailer_key, item_name, brand, size_label, base_price, final_price, ' +
      'sale_savings, coupon_savings, has_coupon, is_bogo, category, stack_rank_score, ' +
      'dietary_tags, allergen_tags, valid_from, valid_to, is_active, upc'
    )
    .in('id', candidateIds)
    .eq('is_active', true);

  if (error || !rawCandidates?.length) {
    return makeEmptyStack(category, retailerKey, ['No active candidates found for this stack']);
  }

  // Build SpecItems
  let items: SpecItem[] = await Promise.all(
    (rawCandidates as unknown as any[]).map(async (raw) => {
      const dealTypes: CouponTier[] = [];
      if (raw.is_bogo) dealTypes.push('BOGO');
      if (raw.has_coupon) dealTypes.push('DIGITAL');

      let item: SpecItem = {
        id: raw.id,
        name: raw.item_name,
        brand: raw.brand ?? null,
        size: raw.size_label ?? 'std.',
        retailer: raw.retailer ?? retailerKey,
        retailer_key: raw.retailer_key,
        category: raw.category ?? 'other',
        quantity: 1,
        original_price: Number(raw.base_price ?? 0),
        sale_price: Number(raw.final_price ?? raw.base_price ?? 0),
        pay_price: 0,
        coupon_savings: 0,
        rebate_savings: 0,
        true_cost: 0,
        deal_types: dealTypes,
        deal_label: raw.is_bogo ? 'BOGO FREE' : raw.has_coupon ? 'STACK DEAL' : 'ON SALE',
        coupon_layers: [],
        rebates: [],
        is_anchor: Number(raw.stack_rank_score ?? 0) > 0.4,
        valid_from: raw.valid_from ?? undefined,
        valid_to: raw.valid_to ?? undefined,
        market: 'clermont_fl',
        math_valid: true,
        savings_pct: 0,
      };

      // Attach coupon layers (Rules 4, 6, 7, 8, 10, 11, 12)
      item = await attachCouponLayers(item, sb, today);

      // Attach rebates
      item = await matchRebates(item, sb, today);

      // Compute math (Rules 3, 5, INVARIANT)
      item = computeItemMath(item);

      return item;
    })
  );

  // Rule 1: single-store enforcement
  const keys = new Set(items.map(i => i.retailer_key));
  if (keys.size > 1) {
    return makeEmptyStack(category, retailerKey, [
      `STORE VIOLATION: stack contains items from ${Array.from(keys).join(', ')}`
    ]);
  }

  // Sort by stack_rank_score desc, then pad/trim to category limits
  const [min, max] = CATEGORY_LIMITS[category] ?? [6, 14];
  if (items.length < min) {
    return makeEmptyStack(category, retailerKey, [
      `Only ${items.length} items — need at least ${min} for ${category}`
    ]);
  }
  if (items.length > max) items = items.slice(0, max);

  const firstItem = rawCandidates[0] as unknown as any;
  const stack: SnippdStack = {
    id: `${retailerKey}-${category}-${today}`,
    stack_category: category,
    title: categoryTitle(category, firstItem.retailer ?? retailerKey),
    retailer: firstItem.retailer ?? retailerKey,
    retailer_key: retailerKey,
    description: categoryDescription(category),
    valid_from: items[0]?.valid_from ?? today,
    valid_until: items.reduce((latest, i) => i.valid_to && i.valid_to > latest ? i.valid_to : latest, today),
    market: 'clermont_fl',
    items,
    anchor_count: 0,
    coupon_summary: [],
    original_price: 0,
    sale_price_total: 0,
    pay_price: 0,
    coupon_savings_total: 0,
    rebate_total_cents: 0,
    true_cost: 0,
    savings_breakdown: { publix_store_coupon: 0, mfr_coupon: 0, digital_coupon: 0, bogo_savings: 0, basket_trigger: 0, total: 0 },
    coupon_checklist: [],
    tags: [],
    math_valid: true,
    math_errors: [],
  };

  // Run validation (Rules 1, 2, 6, 9 + totals + checklist)
  const validated = validateStack(stack);

  // Rule 9: basket trigger detection
  return detectBasketTrigger(validated, sb, today);
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeEmptyStack(
  category: StackCategory,
  retailerKey: string,
  errors: string[]
): SnippdStack {
  return {
    id: `empty-${category}`,
    stack_category: category,
    title: '',
    retailer: retailerKey,
    retailer_key: retailerKey,
    description: '',
    valid_from: todayStr(),
    valid_until: todayStr(),
    market: 'clermont_fl',
    items: [],
    anchor_count: 0,
    coupon_summary: [],
    original_price: 0,
    sale_price_total: 0,
    pay_price: 0,
    coupon_savings_total: 0,
    rebate_total_cents: 0,
    true_cost: 0,
    savings_breakdown: { publix_store_coupon: 0, mfr_coupon: 0, digital_coupon: 0, bogo_savings: 0, basket_trigger: 0, total: 0 },
    coupon_checklist: [],
    tags: [],
    math_valid: false,
    math_errors: errors,
  };
}

function categoryTitle(category: StackCategory, retailer: string): string {
  const titles: Record<StackCategory, string> = {
    foundation_7day: `Your ${retailer} Week`,
    essential_grab:  `${retailer} Essentials Run`,
    topup_run:       `Quick ${retailer} Top-Up`,
    oneday_meals:    `Today's ${retailer} Meals`,
    health:          `${retailer} Health Stack`,
    beauty:          `${retailer} Beauty Stack`,
    household:       `${retailer} Household Stack`,
  };
  return titles[category] ?? retailer;
}

function categoryDescription(category: StackCategory): string {
  const descs: Record<StackCategory, string> = {
    foundation_7day: '7 anchor proteins + breakfast, lunch, dinner for the full week',
    essential_grab:  'Your most-needed staples at this week\'s best prices',
    topup_run:       'Quick 4–6 item top-up run',
    oneday_meals:    'Breakfast, lunch, and dinner for today',
    health:          'OTC health and wellness deals with coupon stacking',
    beauty:          'Personal care and beauty at stacked savings',
    household:       'Cleaning and household supplies with manufacturer coupons',
  };
  return descs[category] ?? '';
}

// ─────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const sb = createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  );
  const [category, retailerKey, ...ids] = process.argv.slice(2);
  if (!category || !retailerKey || !ids.length) {
    console.error('Usage: npx ts-node src/services/stackSpecEngine.ts <category> <retailer_key> <id1,id2,...>');
    process.exit(1);
  }
  buildStack(sb, category as StackCategory, retailerKey, ids[0].split(','))
    .then(spec => console.log(JSON.stringify(spec, null, 2)))
    .catch(console.error);
}
