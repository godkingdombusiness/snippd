import { supabase } from '../../lib/supabase';

const EMPTY_AUTHORITY = {
  available: false,
  plan_id: null,
  status: 'UNAVAILABLE',
  validation_errors: [],
  regular_total_cents: null,
  you_pay_cents: null,
  savings_cents: null,
  savings_pct: null,
  at_register_savings_cents: null,
  rebate_total_cents: 0,
  true_final_cents: null,
  math_source: 'cloud_run_checkout_math',
};

function itemIdentity(item) {
  return item?.item_id || item?.plan_item_id || item?.source_row_id || null;
}

export function checkoutItemIds(items = []) {
  return [...new Set(items.map(itemIdentity).filter(Boolean).map(String))];
}

export function displayQuantity(item) {
  return Math.max(1, Number(item?.quantity || 1));
}

export async function latestLifecyclePlanId() {
  try {
    const { data, error } = await supabase
      .from('weekly_lifecycle_plans')
      .select('plan_id')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return null; // table may not exist yet — return null, caller handles
    return data?.plan_id || null;
  } catch {
    return null;
  }
}

export async function fetchAuthorizedCheckoutMath({ planId, items = [] } = {}) {
  const resolvedPlanId = planId || items.find(item => item?.plan_id)?.plan_id || await latestLifecyclePlanId();
  if (!resolvedPlanId) return { ...EMPTY_AUTHORITY, validation_errors: ['PLAN_ID_REQUIRED'] };

  const baseUrl = process.env.EXPO_PUBLIC_CHECKOUT_MATH_URL;
  if (!baseUrl) return { ...EMPTY_AUTHORITY, plan_id: resolvedPlanId, validation_errors: ['CHECKOUT_MATH_URL_MISSING'] };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ...EMPTY_AUTHORITY, plan_id: resolvedPlanId, validation_errors: ['SIGN_IN_REQUIRED'] };

  const itemIds = checkoutItemIds(items);
  let response, payload;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}/checkout-math`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ plan_id: resolvedPlanId, cart_items: itemIds }),
    });
    payload = await response.json();
  } catch {
    return { ...EMPTY_AUTHORITY, plan_id: resolvedPlanId, validation_errors: ['CHECKOUT_MATH_NETWORK_ERROR'] };
  }

  if (!response.ok || !payload?.ok) {
    return {
      ...EMPTY_AUTHORITY,
      plan_id: resolvedPlanId,
      validation_errors: [payload?.code || payload?.error || 'CHECKOUT_MATH_UNAVAILABLE'],
    };
  }

  return {
    available: true,
    ...payload,
    at_register_savings_cents: payload.savings_cents,
    rebate_total_cents: 0,
    true_final_cents: payload.you_pay_cents,
  };
}

export function authorizedTotalsForRoute(authority) {
  if (!authority?.available) return null;
  return {
    plan_id: authority.plan_id,
    status: authority.status,
    validation_errors: authority.validation_errors || [],
    regular_total_cents: authority.regular_total_cents,
    at_register_savings_cents: authority.at_register_savings_cents ?? authority.savings_cents,
    you_pay_cents: authority.you_pay_cents,
    rebate_total_cents: authority.rebate_total_cents ?? 0,
    true_final_cents: authority.true_final_cents ?? authority.you_pay_cents,
    total_savings_cents: authority.savings_cents,
    savings_pct: authority.savings_pct,
    signature: authority.signature,
    math_source: authority.math_source,
    computed_at: authority.computed_at,
  };
}
