import { supabase, SUPABASE_URL } from './supabase';

export interface WealthEngineCandidate {
  id: string;
  title?: string;
  total_spent_cents: number;
  total_saved_cents: number;
  budget_cents?: number;
  items: Array<{
    id?: string;
    category?: string;
    brand?: string;
    retailer_key?: string;
    price_cents?: number;
    savings_cents?: number;
    coupon_type?: string;
    quantity?: number;
    on_stack?: boolean;
  }>;
  metadata?: Record<string, unknown>;
}

export interface WealthEngineResponse {
  variants: Array<Record<string, unknown>>;
  stack_results?: Array<Record<string, unknown>>;
  wealth_snapshot?: Record<string, unknown>;
}

export async function fetchWealthVariants(options: {
  candidates: WealthEngineCandidate[];
  retailerKey: string;
  modelVersion?: string;
  budgetCents?: number;
  offerMatchId?: string;
}) {
  if (!SUPABASE_URL) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be configured to call the wealth engine');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('User must be authenticated to call the wealth engine');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/wealth-engine`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      offer_match_id: options.offerMatchId,
      retailer_key: options.retailerKey,
      model_version: options.modelVersion ?? 'wealth-v1',
      candidates: options.candidates,
      budget_cents: options.budgetCents,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Wealth engine request failed: ${response.status} ${body}`);
  }

  return (await response.json()) as WealthEngineResponse;
}

export async function fetchWealthSnapshots() {
  if (!SUPABASE_URL) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be configured to fetch wealth snapshots');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('User must be authenticated to fetch wealth snapshots');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/wealth-momentum`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Wealth momentum request failed: ${response.status} ${body}`);
  }

  return (await response.json()) as { snapshots: Array<Record<string, unknown>> };
}
