/**
 * Client-side credit rewards (profiles.credits_balance).
 * Assumes RLS allows the authenticated user to update their own profile row.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const CREDIT_PROFILE_COMPLETE = 50;
export const CREDIT_RECEIPT_VERIFY = 10;

/** One-time +50 when onboarding profile is fully saved (flag prevents double-award). */
export async function applyProfileCompletionCredits(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await client
    .from('profiles')
    .select('profile_completion_credits_awarded, credits_balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data || data.profile_completion_credits_awarded) return 0;

  const bal = Number(data.credits_balance) || 0;
  const { error: upErr } = await client
    .from('profiles')
    .update({
      credits_balance:                    bal + CREDIT_PROFILE_COMPLETE,
      profile_completion_credits_awarded: true,
    })
    .eq('user_id', userId);

  if (upErr) return 0;
  return CREDIT_PROFILE_COMPLETE;
}

/** +10 each time a receipt is verified in-app (count tracked; adjust caps server-side if needed). */
export async function applyReceiptVerifyCredits(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await client
    .from('profiles')
    .select('credits_balance, receipt_credit_award_count')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return 0;

  const bal = Number(data.credits_balance) || 0;
  const cnt = Number(data.receipt_credit_award_count) || 0;

  const { error: upErr } = await client
    .from('profiles')
    .update({
      credits_balance:           bal + CREDIT_RECEIPT_VERIFY,
      receipt_credit_award_count: cnt + 1,
    })
    .eq('user_id', userId);

  if (upErr) return 0;
  return CREDIT_RECEIPT_VERIFY;
}
