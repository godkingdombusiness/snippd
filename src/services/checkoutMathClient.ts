import { supabase } from '../../lib/supabase';

export interface CheckoutMathResponse {
  ok: boolean;
  plan_id: string;
  status: 'APPROVED' | 'REJECTED';
  validation_errors: string[];
  regular_total_cents: number;
  you_pay_cents: number;
  savings_cents: number;
  savings_pct: number;
  stack_expires_at?: string;
  math_source: 'cloud_run_checkout_math';
  computed_at: string;
  signature: string;
  snapshot_persisted?: boolean;
}

export async function fetchCheckoutMath(
  planId: string,
  itemIds: string[],
): Promise<CheckoutMathResponse> {
  const baseUrl = process.env.EXPO_PUBLIC_CHECKOUT_MATH_URL;
  if (!baseUrl) throw new Error('EXPO_PUBLIC_CHECKOUT_MATH_URL is not configured');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in required for checkout math');

  const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/checkout-math`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ plan_id: planId, cart_items: itemIds }),
  });

  const json = await resp.json();
  if (!resp.ok || !json?.ok) {
    throw new Error(json?.error || 'Checkout math unavailable');
  }
  return json as CheckoutMathResponse;
}
