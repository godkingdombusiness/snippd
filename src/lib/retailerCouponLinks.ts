export type CouponLinkStatus = 'evidence_exact' | 'retailer_search' | 'official_hub' | 'unsupported';
export type CouponLinkType = 'item' | 'search' | 'hub' | 'unavailable';

export interface CouponActivationLink {
  url: string | null;
  label: string;
  status: CouponLinkStatus;
  linkType: CouponLinkType;
  source: string;
  confidence: number;
  retailerKey: string;
}

const RETAILER_COUPON_HUBS: Record<string, string> = {
  dollar_general: 'https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0',
  publix: 'https://www.publix.com/savings/digital-coupons',
  kroger: 'https://www.kroger.com/savings/cl/coupons',
  walmart: 'https://www.walmart.com/coupons',
  target: 'https://www.target.com/circle',
};

const RETAILER_COUPON_SEARCH: Record<string, string> = {
  dollar_general: 'https://www.dollargeneral.com/deals/coupons?search={query}',
  publix: 'https://www.publix.com/savings/digital-coupons?search={query}',
  kroger: 'https://www.kroger.com/savings/cl/coupons?searchTerm={query}',
  walmart: 'https://www.walmart.com/coupons?query={query}',
  target: 'https://www.target.com/circle/offers?keyword={query}',
};

const RETAILER_LABELS: Record<string, string> = {
  dollar_general: 'Dollar General',
  publix: 'Publix',
  kroger: 'Kroger',
  walmart: 'Walmart',
  target: 'Target',
};

export function normalizeRetailerKey(retailer: unknown): string {
  return String(retailer ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanUrl(value: unknown): string | null {
  const url = String(value ?? '').trim();
  if (!/^https:\/\/[^ ]+/i.test(url)) return null;
  return url;
}

export function getRetailerCouponHub(retailer: unknown): string | null {
  return RETAILER_COUPON_HUBS[normalizeRetailerKey(retailer)] ?? null;
}

export function getRetailerCouponSearchUrl(retailer: unknown, query: unknown): string | null {
  const template = RETAILER_COUPON_SEARCH[normalizeRetailerKey(retailer)];
  const term = String(query ?? '').trim();
  if (!template || !term) return null;
  return template.replace('{query}', encodeURIComponent(term));
}

export function getRetailerDisplayName(retailer: unknown): string {
  const key = normalizeRetailerKey(retailer);
  return RETAILER_LABELS[key] ?? (String(retailer ?? 'Retailer').replace(/_/g, ' ').trim() || 'Retailer');
}

export function resolveCouponActivationLink(item: Record<string, unknown> = {}, retailer: unknown): CouponActivationLink {
  const retailerKey = normalizeRetailerKey(retailer);
  const exact = cleanUrl(
    item.official_coupon_url ??
    item.exact_coupon_url ??
    item.coupon_url ??
    item.retailer_coupon_url
  );

  if (exact) {
    return {
      url: exact,
      label: 'Open Official Coupon',
      status: 'evidence_exact',
      linkType: 'item',
      source: 'item_level',
      confidence: 0.95,
      retailerKey,
    };
  }

  const productName = item.product_name ?? item.name ?? item.title;
  const search = getRetailerCouponSearchUrl(retailerKey, productName);
  if (search) {
    return {
      url: search,
      label: `Search ${getRetailerDisplayName(retailerKey)} Coupons`,
      status: 'retailer_search',
      linkType: 'search',
      source: 'retailer_search',
      confidence: 0.7,
      retailerKey,
    };
  }

  const hub = RETAILER_COUPON_HUBS[retailerKey] ?? null;
  return {
    url: hub,
    label: hub ? `Open ${getRetailerDisplayName(retailerKey)} Coupons` : 'Coupon Link Unavailable',
    status: hub ? 'official_hub' : 'unsupported',
    linkType: hub ? 'hub' : 'unavailable',
    source: hub ? 'retailer_hub' : 'none',
    confidence: hub ? 0.45 : 0,
    retailerKey,
  };
}
