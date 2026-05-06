/**
 * get-omni-store-comparison
 *
 * Server-owned comparison payload for the Omni Store Comparison feature.
 * The frontend displays this response only; it does not calculate savings.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function centsToDollars(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value) / 100;
}

const COUPON_TYPES = new Set(['STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON']);

function toCents(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n > 1000 ? n : n * 100);
}

function normalizeKey(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\b\d+(ct|oz|fl oz|lb|lbs|g|kg|pk|pack|count)\b/gi, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function matchCoupon(coupons: any[], item: any, retailerKey: string): any | null {
  const haystack = [
    item?.name,
    item?.item,
    item?.item_name,
    item?.product_name,
    item?.brand,
    item?.normalized_key,
  ].filter(Boolean).join(' ').toLowerCase();
  const normalized = normalizeKey(haystack);
  return coupons.find((coupon) => {
    if (String(coupon.retailer_key || '').toLowerCase() !== retailerKey) return false;
    const couponHaystack = [
      coupon.normalized_key,
      coupon.product_name,
      coupon.brand,
      coupon.coupon_title,
    ].filter(Boolean).join(' ').toLowerCase();
    return coupon.normalized_key && coupon.normalized_key === normalized
      || normalized.includes(normalizeKey(coupon.product_name))
      || couponHaystack.includes(normalized.split('-')[0] || normalized);
  }) ?? null;
}

function candidateItems(row: any): any[] {
  if (Array.isArray(row.items)) return row.items;
  if (typeof row.items === 'string') {
    try {
      const parsed = JSON.parse(row.items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function computeStoreOption({
  retailerKey,
  candidates,
  coupons,
  cartItems,
  weeklyBudgetCents,
}: {
  retailerKey: string;
  candidates: any[];
  coupons: any[];
  cartItems: any[];
  weeklyBudgetCents: number;
}) {
  const selected = candidates.slice(0, 20);
  const sourceItems = cartItems.length > 0
    ? cartItems
    : selected.flatMap(candidateItems).slice(0, 20);

  let retailTotal = 0;
  let finalTotalBeforeCoupons = 0;
  let saleSavings = 0;
  let bogoSavings = 0;
  let couponSavings = 0;
  let confidenceTotal = 0;
  let confidenceCount = 0;
  const verifiedCouponIds: string[] = [];
  const exactCouponUrls: string[] = [];
  let nearestExpirationDays = 999;

  for (const item of sourceItems) {
    const qty = Math.max(1, Number(item.quantity ?? item.qty ?? 1));
    const regular = item.regular_price_cents
      ?? item.reg_cents
      ?? toCents(item.regular_price ?? item.reg_price ?? item.base_price, 0);
    const sale = item.sale_price_cents
      ?? item.sale_cents
      ?? toCents(item.sale_price ?? item.pay_price ?? item.final_price, regular);
    const dealType = String(item.deal_type || item.offerType || '').toUpperCase();

    retailTotal += regular * qty;
    finalTotalBeforeCoupons += Math.max(0, sale || regular) * qty;

    if (dealType === 'BOGO' && qty >= 2) {
      bogoSavings += Math.max(0, regular);
    } else {
      saleSavings += Math.max(0, regular - (sale || regular)) * qty;
    }

    const coupon = matchCoupon(coupons, item, retailerKey);
    if (coupon) {
      const value = Number(coupon.coupon_value_cents || 0);
      couponSavings += value;
      if (coupon.id) verifiedCouponIds.push(coupon.id);
      if (coupon.exact_coupon_url) exactCouponUrls.push(coupon.exact_coupon_url);
      if (coupon.expiration_date) {
        const days = Math.ceil((new Date(coupon.expiration_date).getTime() - Date.now()) / 86400000);
        nearestExpirationDays = Math.min(nearestExpirationDays, days);
      }
    }
  }

  for (const candidate of selected) {
    const score = Number(candidate.confidence_score ?? candidate.stack_rank_score ?? 0);
    if (Number.isFinite(score)) {
      confidenceTotal += score > 1 ? score / 100 : score;
      confidenceCount += 1;
    }
  }

  const stackSavings = Math.min(retailTotal, saleSavings + bogoSavings + couponSavings);
  const finalTotal = Math.max(0, retailTotal - stackSavings);
  const confidence = confidenceCount > 0 ? Math.round((confidenceTotal / confidenceCount) * 1000) / 1000 : 0.5;
  const expirationRisk = nearestExpirationDays <= 1 ? 'high' : nearestExpirationDays <= 3 ? 'medium' : 'low';

  return {
    retailer_key: retailerKey,
    totals: {
      retail_total_cents: retailTotal,
      sale_savings_cents: saleSavings,
      coupon_savings_cents: couponSavings,
      bogo_savings_cents: bogoSavings,
      stack_savings_cents: stackSavings,
      final_estimated_total_cents: finalTotal,
      remaining_budget_cents: weeklyBudgetCents - finalTotal,
      savings_percentage: retailTotal > 0 ? Math.round((stackSavings / retailTotal) * 1000) / 10 : 0,
    },
    verified_coupon_ids: [...new Set(verifiedCouponIds)],
    exact_coupon_urls: [...new Set(exactCouponUrls)],
    confidence_score: confidence,
    expiration_risk: expirationRisk,
    item_count: sourceItems.length,
  };
}

async function handleTop3Engine(req: Request, user: any, adminDb: ReturnType<typeof createClient>) {
  const body = await req.json().catch(() => ({}));
  const cartItems = Array.isArray(body.items) ? body.items : [];
  const preferredStores = Array.isArray(body.preferred_stores) ? body.preferred_stores : [];

  const [profileRes, prefRes, fallbackStoreRes] = await Promise.all([
    adminDb.from('profiles').select('weekly_budget, preferred_stores').eq('user_id', user.id).maybeSingle(),
    adminDb.from('user_preference_scores')
      .select('retailer_key, normalized_score')
      .eq('user_id', user.id)
      .not('retailer_key', 'is', null)
      .order('normalized_score', { ascending: false })
      .limit(8),
    adminDb.from('stack_candidates').select('retailer_key').limit(30),
  ]);

  const weeklyBudgetCents = Number(body.weekly_budget_cents || profileRes.data?.weekly_budget || 15000);
  const learnedStores = (prefRes.data ?? []).map((row: any) => row.retailer_key).filter(Boolean);
  const fallbackStores = (fallbackStoreRes.data ?? []).map((row: any) => row.retailer_key).filter(Boolean);
  const topStores = [...new Set([
    ...preferredStores,
    ...(profileRes.data?.preferred_stores || []),
    ...learnedStores,
    ...fallbackStores,
  ].map((s) => String(s).toLowerCase()).filter(Boolean))].slice(0, 3);

  if (topStores.length === 0) {
    return json({
      status: 'NO_STORES',
      computed_at: new Date().toISOString(),
      top_stores: [],
      store_options: [],
      totals: {
        retail_total_cents: 0,
        sale_savings_cents: 0,
        coupon_savings_cents: 0,
        bogo_savings_cents: 0,
        stack_savings_cents: 0,
        final_estimated_total_cents: 0,
        remaining_budget_cents: weeklyBudgetCents,
        savings_percentage: 0,
      },
      verified_coupon_ids: [],
      exact_coupon_urls: [],
      confidence_score: 0,
      expiration_risk: 'unknown',
      explanation: 'Add preferred stores or live store deals to compare your cart.',
    });
  }

  const [candidateRes, couponRes] = await Promise.all([
    adminDb.from('v_coupon_verified_stack_candidates')
      .select('id, retailer_key, normalized_key, item_name, primary_category, primary_brand, category, brand, items, stack_rank_score, confidence_score, has_coupon')
      .in('retailer_key', topStores)
      .order('stack_rank_score', { ascending: false })
      .limit(120),
    adminDb.from('v_live_verified_digital_coupons')
      .select('id, retailer_key, exact_coupon_url, source_page_url, product_name, brand, normalized_key, coupon_title, coupon_value_cents, expiration_date, verified_at, evidence_hash')
      .in('retailer_key', topStores),
  ]);

  if (candidateRes.error) return json({ error: candidateRes.error.message }, 500);
  if (couponRes.error) return json({ error: couponRes.error.message }, 500);

  const candidates = candidateRes.data ?? [];
  const coupons = couponRes.data ?? [];
  const storeOptions = topStores.map((retailerKey) => computeStoreOption({
    retailerKey,
    candidates: candidates.filter((row: any) => String(row.retailer_key).toLowerCase() === retailerKey),
    coupons,
    cartItems,
    weeklyBudgetCents,
  })).sort((a, b) => {
    const savingsDelta = b.totals.stack_savings_cents - a.totals.stack_savings_cents;
    if (savingsDelta !== 0) return savingsDelta;
    return a.totals.final_estimated_total_cents - b.totals.final_estimated_total_cents;
  });

  const bestStore = storeOptions[0] ?? null;
  const splitSavings = storeOptions.reduce((sum, option) => sum + option.totals.stack_savings_cents, 0);
  const bestSavings = bestStore?.totals.stack_savings_cents ?? 0;
  const splitCartRecommendation = storeOptions.length > 1 && splitSavings > bestSavings * 1.15
    ? {
      mode: 'split',
      store_count: storeOptions.length,
      estimated_extra_savings_cents: splitSavings - bestSavings,
      explanation: `Split shopping can unlock about $${((splitSavings - bestSavings) / 100).toFixed(2)} more than the best single store.`,
    }
    : {
      mode: 'single_store',
      store_count: bestStore ? 1 : 0,
      estimated_extra_savings_cents: 0,
      explanation: bestStore ? `${bestStore.retailer_key} is the cleanest trip for this cart.` : 'No store recommendation available yet.',
    };

  const allCouponIds = [...new Set(storeOptions.flatMap((option) => option.verified_coupon_ids))];
  const allCouponUrls = [...new Set(storeOptions.flatMap((option) => option.exact_coupon_urls))];

  return json({
    status: 'ok',
    computed_at: new Date().toISOString(),
    top_stores: topStores.map((retailerKey, index) => ({ retailer_key: retailerKey, rank: index + 1 })),
    store_options: storeOptions,
    best_store: bestStore,
    split_cart_recommendation: splitCartRecommendation,
    totals: bestStore?.totals,
    retail_total_cents: bestStore?.totals.retail_total_cents ?? 0,
    sale_savings_cents: bestStore?.totals.sale_savings_cents ?? 0,
    coupon_savings_cents: bestStore?.totals.coupon_savings_cents ?? 0,
    bogo_savings_cents: bestStore?.totals.bogo_savings_cents ?? 0,
    stack_savings_cents: bestStore?.totals.stack_savings_cents ?? 0,
    final_estimated_total_cents: bestStore?.totals.final_estimated_total_cents ?? 0,
    remaining_budget_cents: bestStore?.totals.remaining_budget_cents ?? weeklyBudgetCents,
    savings_percentage: bestStore?.totals.savings_percentage ?? 0,
    verified_coupon_ids: allCouponIds,
    exact_coupon_urls: allCouponUrls,
    confidence_score: bestStore?.confidence_score ?? 0,
    expiration_risk: bestStore?.expiration_risk ?? 'unknown',
    explanation: bestStore
      ? `${bestStore.retailer_key} wins on verified savings for this cart. Coupon claims include exact source URLs only.`
      : 'No eligible store option found.',
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Server configuration missing' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminDb = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: userError } = await userDb.auth.getUser();
  if (userError || !user) return json({ error: 'Unauthorized' }, 401);

  if (req.method === 'POST') {
    return handleTop3Engine(req, user, adminDb);
  }

  const { data: plan, error } = await adminDb
    .from('weekly_lifecycle_plans')
    .select('plan_id,status,retailer_node,actual_oop_cents,savings_percentage,lifecycle_payload,generated_at,stack_expires_at')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!plan) {
    return json({
      comparison_id: null,
      status: 'NO_PLAN',
      winner: null,
      stores: [],
    });
  }

  const payload = plan.lifecycle_payload ?? {};
  const comparison = payload.omni_store_comparison ?? payload.store_comparison ?? null;
  const comparisonStores = Array.isArray(comparison?.stores) ? comparison.stores : null;

  const stores = comparisonStores ?? [
    {
      retailer_node: plan.retailer_node,
      retailer: plan.retailer_node,
      oop: centsToDollars(plan.actual_oop_cents),
      savings_percentage: Number(plan.savings_percentage ?? 0),
    },
  ];

  return json({
    comparison_id: comparison?.comparison_id ?? plan.plan_id,
    status: comparison?.status ?? plan.status,
    winner: comparison?.winner ?? plan.retailer_node,
    generated_at: plan.generated_at,
    stack_expires_at: plan.stack_expires_at,
    stores,
  });
});
