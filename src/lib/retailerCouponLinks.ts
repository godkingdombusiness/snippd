export type CouponLinkStatus = 'evidence_exact' | 'official_hub' | 'unsupported';

export interface CouponActivationLink {
  url: string | null;
  label: string;
  status: CouponLinkStatus;
  retailerKey: string;
}

const RETAILER_COUPON_HUBS: Record<string, string> = {
  dollar_general: 'https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0',
  publix: 'https://www.publix.com/savings/digital-coupons',
};

const RETAILER_LABELS: Record<string, string> = {
  dollar_general: 'Dollar General',
  publix: 'Publix',
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
      retailerKey,
    };
  }

  const hub = RETAILER_COUPON_HUBS[retailerKey] ?? null;
  return {
    url: hub,
    label: hub ? `Open ${getRetailerDisplayName(retailerKey)} Coupons` : 'Coupon Link Unavailable',
    status: hub ? 'official_hub' : 'unsupported',
    retailerKey,
  };
}
