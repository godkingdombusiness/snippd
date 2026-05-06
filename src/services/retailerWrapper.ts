/**
 * RetailerWrapper — three-tier failover for deal data.
 *
 * Priority:
 *   1. Instacart API  (live pricing + availability)
 *   2. Walmart API    (secondary live source)
 *   3. Direct         (stack_candidates table — always available)
 *
 * Each tier is tried in order. The first successful response wins.
 * Failures are soft (caught, logged to console) — the wrapper never throws
 * to the caller; it always returns a result object indicating which tier
 * served the data.
 *
 * To activate Tiers 1 or 2, set the corresponding env vars in
 * supabase/functions/.env (server) or app.config.js (client):
 *   INSTACART_API_KEY, INSTACART_API_URL
 *   WALMART_API_KEY,   WALMART_API_URL
 */

import { supabase } from '../../lib/supabase';

export type RetailerTier = 'instacart' | 'walmart' | 'direct';

export interface RetailerDeal {
  id: string;
  retailer_key: string;
  item_name: string;
  final_price: number;   // dollars
  base_price: number;    // dollars
  sale_savings: number;  // dollars
  is_bogo: boolean;
  has_coupon: boolean;
  deal_type: string;
  stack_rank_score: number;
  category: string | null;
}

export interface RetailerResult {
  tier: RetailerTier;
  deals: RetailerDeal[];
  latency_ms: number;
  error?: string;
}

// ── Tier 1: Instacart ────────────────────────────────────────────────────────

async function fetchInstacart(query?: string): Promise<RetailerDeal[] | null> {
  const apiKey = process.env.INSTACART_API_KEY;
  const apiUrl = process.env.INSTACART_API_URL;
  if (!apiKey || !apiUrl) return null; // not configured

  const url = query
    ? `${apiUrl}/products/search?q=${encodeURIComponent(query)}&limit=40`
    : `${apiUrl}/products/deals?limit=80`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!resp.ok) return null;

  const json = await resp.json();
  // Map Instacart product shape → RetailerDeal (adjust field names to Instacart's actual API)
  return (json.products ?? []).map((p: any): RetailerDeal => ({
    id:              String(p.id),
    retailer_key:    'instacart',
    item_name:       p.name ?? 'Item',
    final_price:     parseFloat(p.price ?? 0),
    base_price:      parseFloat(p.original_price ?? p.price ?? 0),
    sale_savings:    parseFloat(p.savings ?? 0),
    is_bogo:         p.promo_type === 'bogo',
    has_coupon:      !!p.coupon_available,
    deal_type:       p.promo_type?.toUpperCase() ?? 'SALE',
    stack_rank_score: p.relevance_score ?? 0,
    category:        p.category ?? null,
  }));
}

// ── Tier 2: Walmart ──────────────────────────────────────────────────────────

async function fetchWalmart(query?: string): Promise<RetailerDeal[] | null> {
  const apiKey = process.env.WALMART_API_KEY;
  const apiUrl = process.env.WALMART_API_URL;
  if (!apiKey || !apiUrl) return null;

  const url = query
    ? `${apiUrl}/v3/items/search?query=${encodeURIComponent(query)}&numItems=40`
    : `${apiUrl}/v3/items/deals?numItems=80`;

  const resp = await fetch(url, {
    headers: { 'WM_SEC.KEY_VERSION': '1', 'WM_CONSUMER.ID': apiKey, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!resp.ok) return null;

  const json = await resp.json();
  return (json.items ?? []).map((i: any): RetailerDeal => ({
    id:              String(i.itemId),
    retailer_key:    'walmart',
    item_name:       i.name ?? 'Item',
    final_price:     parseFloat(i.salePrice ?? i.msrp ?? 0),
    base_price:      parseFloat(i.msrp ?? i.salePrice ?? 0),
    sale_savings:    Math.max(0, parseFloat(i.msrp ?? 0) - parseFloat(i.salePrice ?? 0)),
    is_bogo:         false,
    has_coupon:      !!i.clearance,
    deal_type:       i.clearance ? 'SALE' : 'LOYALTY_PRICE',
    stack_rank_score: i.customerRating ?? 0,
    category:        i.categoryPath?.split('/')?.pop() ?? null,
  }));
}

// ── Tier 3: Direct (stack_candidates) ────────────────────────────────────────

async function fetchDirect(query?: string): Promise<RetailerDeal[]> {
  let qb = supabase
    .from('stack_candidates')
    .select('id, retailer_key, items, primary_category, primary_brand, stack_rank_score, has_coupon, is_active')
    .eq('is_active', true)
    .order('stack_rank_score', { ascending: false })
    .limit(80);

  const { data, error } = await qb;
  if (error || !data) return [];

  const deals: RetailerDeal[] = data.flatMap((row: any) => {
    const items: any[] = Array.isArray(row.items) ? row.items : [];
    if (!items.length) {
      return [{
        id:              String(row.id),
        retailer_key:    (row.retailer_key ?? 'direct').toLowerCase(),
        item_name:       row.primary_brand ?? row.normalized_key ?? 'Deal',
        final_price:     0,
        base_price:      0,
        sale_savings:    0,
        is_bogo:         false,
        has_coupon:      !!row.has_coupon,
        deal_type:       '',
        stack_rank_score: row.stack_rank_score ?? 0,
        category:        row.primary_category ?? null,
      }];
    }
    return items.map((item: any, i: number) => {
      const regular = parseFloat(item.regular_price) || 0;
      const sale    = parseFloat(item.sale_price) || regular;
      const dt      = (item.deal_type ?? '').toUpperCase();
      return {
        id:              `${row.id}_${i}`,
        retailer_key:    (row.retailer_key ?? 'direct').toLowerCase(),
        item_name:       item.product_name ?? item.brand ?? 'Item',
        final_price:     sale,
        base_price:      regular,
        sale_savings:    Math.max(0, parseFloat((regular - sale).toFixed(2))),
        is_bogo:         !!item.is_bogo || dt === 'BOGO' || dt === 'B1G1',
        has_coupon:      !!row.has_coupon || ['DIGITAL_COUPON', 'DIGITAL', 'MFR', 'MANUFACTURER_COUPON'].includes(dt),
        deal_type:       dt,
        stack_rank_score: row.stack_rank_score ?? 0,
        category:        item.category ?? row.primary_category ?? null,
      };
    });
  });

  // Apply query filter on the direct tier if requested
  if (query) {
    const q = query.toLowerCase();
    return deals.filter(d =>
      (d.item_name ?? '').toLowerCase().includes(q) ||
      (d.category  ?? '').toLowerCase().includes(q)
    );
  }
  return deals;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch deals with automatic failover.
 * @param query  Optional search term (for Hunt mode)
 */
export async function fetchDealsWithFailover(query?: string): Promise<RetailerResult> {
  const tiers: Array<{ name: RetailerTier; fn: () => Promise<RetailerDeal[] | null> }> = [
    { name: 'instacart', fn: () => fetchInstacart(query) },
    { name: 'walmart',   fn: () => fetchWalmart(query)   },
    { name: 'direct',    fn: () => fetchDirect(query)    },
  ];

  for (const tier of tiers) {
    const t0 = Date.now();
    try {
      const deals = await tier.fn();
      if (deals && deals.length > 0) {
        return { tier: tier.name, deals, latency_ms: Date.now() - t0 };
      }
    } catch (err: any) {
      console.warn(`[RetailerWrapper] ${tier.name} failed:`, err?.message ?? err);
    }
  }

  // All tiers exhausted — return empty result (graceful degradation)
  return { tier: 'direct', deals: [], latency_ms: 0, error: 'All retailer tiers exhausted' };
}
