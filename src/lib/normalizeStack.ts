// Converts raw app_home_feed / stack_candidates rows into a consistent shape
// used by StackDetail, ShoppingList, QuickDeals, and HomeScreen.

export interface NormalizedItem {
  id: string;
  displayName: string;
  couponSearchName: string | null;
  couponInstruction: string | null;
  couponValueCents: number;
  officialCouponUrl: string | null;
  retailerCouponHubUrl: string | null;
  couponLinkStatus: string | null;
  regularPriceCents: number;
  finalPriceCents: number;
  dealType: string | null;
  couponStatus: 'verified' | 'needs_user_verification' | null;
}

export interface NormalizedStack {
  id: string;
  title: string;
  retailer: string;
  stackType: string;
  finalCents: number;
  subtotalCents: number;
  discountsCents: number;
  savingsPct: number;
  itemCount: number;
  bestShopWindow: string | null;
  confidence: number;
  instructions: string[];
  items: NormalizedItem[];
}

function toCents(dollars: unknown): number {
  const n = Number(dollars);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function parseBreakdown(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter(x => typeof x === 'object' && x !== null);
  if (typeof raw === 'string') {
    try { return parseBreakdown(JSON.parse(raw)); } catch { return []; }
  }
  return [];
}

function normalizeItem(item: Record<string, unknown>, idx: number): NormalizedItem {
  const name = String(item.display_name ?? item.name ?? item.item ?? `Item ${idx + 1}`);
  const couponSearch = item.coupon_search_name
    ? String(item.coupon_search_name)
    : (item.name ? String(item.name) : null);
  const couponInstruction = item.coupon_clip_instruction
    ? String(item.coupon_clip_instruction)
    : null;

  const regularCents = toCents(item.regular_price) || toCents(item.reg_price) || 0;
  const finalCents   = toCents(item.final_price)   || toCents(item.price)     || 0;
  const couponCents  = toCents(item.coupon)         || toCents(item.coupon_value_cents ? Number(item.coupon_value_cents) / 100 : 0);

  const status = item.coupon_status === 'verified'
    ? 'verified'
    : item.coupon_status === 'needs_user_verification'
      ? 'needs_user_verification'
      : null;

  return {
    id:               `item_${idx}_${name.slice(0, 12).replace(/\s/g, '_')}`,
    displayName:      name,
    couponSearchName: couponSearch,
    couponInstruction,
    couponValueCents: couponCents,
    officialCouponUrl: item.official_coupon_url ? String(item.official_coupon_url) : null,
    retailerCouponHubUrl: item.retailer_coupon_hub_url ? String(item.retailer_coupon_hub_url) : null,
    couponLinkStatus: item.coupon_link_status ? String(item.coupon_link_status) : null,
    regularPriceCents: regularCents || finalCents,
    finalPriceCents:   finalCents,
    dealType:          item.deal_type ? String(item.deal_type) : null,
    couponStatus:      status,
  };
}

export function normalizeStack(raw: Record<string, unknown>): NormalizedStack {
  const breakdown = parseBreakdown(raw.breakdown_list ?? raw.items);
  const items = breakdown.map((item, i) => normalizeItem(item as Record<string, unknown>, i));

  const finalCents    = toNum(raw.final_out_of_pocket_cents) || toCents(raw.pay_price);
  const subtotalCents = toNum(raw.subtotal_cents)            || (finalCents + toNum(raw.total_discounts_cents));
  const discountsCents= toNum(raw.total_discounts_cents)     || toCents(raw.save_price);
  const savingsPct    = toNum(raw.savings_percent)           ||
    (subtotalCents > 0 ? Math.round((discountsCents / subtotalCents) * 100) : 0);

  return {
    id:            String(raw.id ?? ''),
    title:         String(raw.title ?? raw.product_name ?? 'Stack'),
    retailer:      String(raw.retailer ?? raw.retailer_key ?? 'Store'),
    stackType:     String(raw.stack_type ?? 'BASKET_ENGINEERED_STACK'),
    finalCents,
    subtotalCents,
    discountsCents,
    savingsPct,
    itemCount:     toNum(raw.item_count) || items.length,
    bestShopWindow: raw.best_shop_window ? String(raw.best_shop_window) : null,
    confidence:    toNum(raw.confidence) || toNum(raw.confidence_score) || 75,
    instructions:  Array.isArray(raw.instructions) ? (raw.instructions as unknown[]).map(String) : [],
    items,
  };
}

/** Formats cents as "$X.XX" */
export function fmtCents(cents: number): string {
  return '$' + (Math.max(0, cents) / 100).toFixed(2);
}
