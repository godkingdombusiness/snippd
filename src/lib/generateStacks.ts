import { supabase } from '../../lib/supabase';

const GENERATE_URL = (process.env.EXPO_PUBLIC_GENERATE_STACKS_URL ?? '').replace(/\/$/, '');

export interface GenerateStacksParams {
  userId: string;
  region?: string;
  stores?: string[];
  savingsThreshold?: number;
  mode?: string;
}

/**
 * Calls the Cloud Run /generate-stacks endpoint to populate app_home_feed
 * with fresh verified stacks. Non-fatal if the endpoint is not configured.
 */
export async function generateStacks(params: GenerateStacksParams): Promise<void> {
  if (!GENERATE_URL) return;
  try {
    const res = await fetch(`${GENERATE_URL}/generate-stacks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:           params.userId,
        region:            params.region           ?? 'US-Southeast',
        stores:            params.stores            ?? ['publix', 'dollar_general', 'walmart'],
        savings_threshold: params.savingsThreshold  ?? 40,
        mode:              params.mode              ?? 'stack_first_curated',
      }),
    });
    if (!res.ok) {
      // Non-fatal — endpoint may not be deployed yet
    }
  } catch {
    // Non-fatal — network error or endpoint not configured
  }
}

/**
 * Loads verified stacks from app_home_feed.
 *
 * Tries the new triple-gate columns (validation_status + source_type + is_active)
 * first. If those columns don't exist yet (pre-migration), falls back to the
 * existing verification_status = 'verified_live' filter.
 *
 * Optionally filters by retailer (case-insensitive partial match).
 */
export async function loadVerifiedStacks(options: {
  retailer?: string;
  limit?: number;
  orderBy?: 'savings_percent' | 'confidence';
} = {}) {
  const order = options.orderBy ?? 'savings_percent';
  const lim   = options.limit ?? 20;

  // Try new columns (post-migration)
  try {
    let q = supabase
      .from('app_home_feed')
      .select('*')
      .eq('is_active', true)
      .eq('validation_status', 'system_generated_verified')
      .eq('source_type', 'SNIPPD_GENERATED')
      .not('stack_type', 'is', null)
      .order(order, { ascending: false })
      .limit(lim);

    if (options.retailer && options.retailer !== 'best_overall') {
      q = q.ilike('retailer', `%${options.retailer}%`);
    }

    const { data, error } = await q;
    // If new columns exist and query succeeded, return data
    if (!error && data != null) return data;
  } catch { /* fall through to legacy query */ }

  // Legacy fallback: verification_status = 'verified_live'
  let q = supabase
    .from('app_home_feed')
    .select('*')
    .eq('status', 'active')
    .eq('verification_status', 'verified_live')
    .not('stack_type', 'is', null)
    .order(order, { ascending: false })
    .limit(lim);

  if (options.retailer && options.retailer !== 'best_overall') {
    q = q.ilike('retailer', `%${options.retailer}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
