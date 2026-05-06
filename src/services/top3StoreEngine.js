import { supabase } from '../../lib/supabase';
import { readActiveCart } from './cartStorage';

const EMPTY_TOTALS = {
  retail_total_cents: 0,
  sale_savings_cents: 0,
  coupon_savings_cents: 0,
  bogo_savings_cents: 0,
  stack_savings_cents: 0,
  final_estimated_total_cents: 0,
  remaining_budget_cents: 0,
  savings_percentage: 0,
};

function toCents(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n > 1000 ? n : n * 100);
}

function normalizeCartItem(item) {
  const name = item.product_name || item.name || item.item_name || '';
  const regular = item.reg_cents ?? toCents(item.regular_price ?? item.reg_price ?? item.base_price, 0);
  const sale = item.sale_cents ?? toCents(item.sale_price ?? item.pay_price ?? item.final_price, regular);
  return {
    id: item.id || item.product_id || name,
    product_name: name,
    brand: item.brand || null,
    category: item.category || item.store_area || null,
    retailer_key: item.retailer_key || item.retailer || item.store || null,
    normalized_key: item.normalized_key || null,
    quantity: Number(item.quantity) || 1,
    regular_price_cents: regular,
    sale_price_cents: sale || regular,
    deal_type: item.deal_type || null,
  };
}

function fallbackTotals(items, weeklyBudgetCents = 0) {
  const retail = items.reduce((sum, item) => sum + (item.regular_price_cents || item.sale_price_cents || 0) * item.quantity, 0);
  const saleFinal = items.reduce((sum, item) => sum + (item.sale_price_cents || item.regular_price_cents || 0) * item.quantity, 0);
  const saleSavings = Math.max(0, retail - saleFinal);
  return {
    ...EMPTY_TOTALS,
    retail_total_cents: retail,
    sale_savings_cents: saleSavings,
    stack_savings_cents: saleSavings,
    final_estimated_total_cents: saleFinal,
    remaining_budget_cents: weeklyBudgetCents ? weeklyBudgetCents - saleFinal : 0,
    savings_percentage: retail > 0 ? Math.round((saleSavings / retail) * 1000) / 10 : 0,
  };
}

export function normalizeEnginePayload(payload, items = [], weeklyBudgetCents = 0) {
  if (!payload) {
    const totals = fallbackTotals(items, weeklyBudgetCents);
    return {
      status: 'fallback',
      computed_at: new Date().toISOString(),
      totals,
      best_store: null,
      split_cart_recommendation: null,
      verified_coupon_ids: [],
      exact_coupon_urls: [],
      confidence_score: 0,
      expiration_risk: 'unknown',
      explanation: 'Backend engine unavailable; showing non-coupon item totals only.',
      store_options: [],
      top_stores: [],
    };
  }

  const totals = payload.totals || payload.best_store?.totals || payload || EMPTY_TOTALS;
  return {
    status: payload.status || 'ok',
    computed_at: payload.computed_at || new Date().toISOString(),
    totals: { ...EMPTY_TOTALS, ...totals },
    best_store: payload.best_store || null,
    split_cart_recommendation: payload.split_cart_recommendation || null,
    verified_coupon_ids: payload.verified_coupon_ids || payload.best_store?.verified_coupon_ids || [],
    exact_coupon_urls: payload.exact_coupon_urls || payload.best_store?.exact_coupon_urls || [],
    confidence_score: Number(payload.confidence_score ?? payload.best_store?.confidence_score ?? 0),
    expiration_risk: payload.expiration_risk || payload.best_store?.expiration_risk || 'unknown',
    explanation: payload.explanation || payload.best_store?.explanation || '',
    store_options: payload.store_options || payload.stores || [],
    top_stores: payload.top_stores || [],
  };
}

export async function fetchTop3StoreEngine({ items, forceRefresh = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return normalizeEnginePayload(null);

  const cartItems = (items || (await readActiveCart()).items || []).map(normalizeCartItem);
  const { data: profile } = await supabase
    .from('profiles')
    .select('weekly_budget, preferred_stores')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const weeklyBudgetCents = Number(profile?.weekly_budget || 15000);
  if (cartItems.length === 0 && !forceRefresh) {
    return normalizeEnginePayload(null, cartItems, weeklyBudgetCents);
  }

  try {
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-omni-store-comparison`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: cartItems,
        preferred_stores: profile?.preferred_stores || [],
        weekly_budget_cents: weeklyBudgetCents,
        force_refresh: forceRefresh,
      }),
    });
    if (!res.ok) throw new Error(`Top 3 engine failed: ${res.status}`);
    const payload = await res.json();
    return normalizeEnginePayload(payload, cartItems, weeklyBudgetCents);
  } catch {
    return normalizeEnginePayload(null, cartItems, weeklyBudgetCents);
  }
}

export function engineTotalsForDisplay(enginePayload) {
  return enginePayload?.totals || EMPTY_TOTALS;
}
