/**
 * policyLoader — loads RetailerPolicy from Supabase
 *
 * Reads:
 *   - retailer_coupon_parameters (max_stack_items, allowed_coupon_types, etc.)
 *   - retailer_rules             (block_bogo_and_coupon, block_sale_and_digital, etc.)
 *
 * Merges with DEFAULT_POLICY for any missing rows.
 * Caches in-process for 15 minutes (TTL_MS).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_POLICY, RetailerPolicy, RoundingMode } from '../../types/stacking';

// ─────────────────────────────────────────────────────────────
// In-process cache
// ─────────────────────────────────────────────────────────────

interface CacheEntry {
  policy: RetailerPolicy;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 15 * 60 * 1000; // 15 minutes

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function pv<T>(row: Record<string, unknown> | undefined, fallback: T): T {
  if (!row) return fallback;
  const v = (row as Record<string, unknown>)['value'];
  return v !== undefined ? (v as T) : fallback;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────
// Main loader
// ─────────────────────────────────────────────────────────────

export async function loadRetailerPolicy(
  supabase: SupabaseClient,
  retailerKey: string,
): Promise<RetailerPolicy> {
  const key = retailerKey.toLowerCase();
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.policy;
  }

  const todayStr = today();

  const [paramsResult, rulesResult] = await Promise.all([
    supabase
      .from('retailer_coupon_parameters')
      .select('policy_key, policy_value')
      .eq('retailer_key', key)
      .or(`effective_to.is.null,effective_to.gte.${todayStr}`),
    supabase
      .from('retailer_rules')
      .select('rule_key, rule_value')
      .eq('retailer_key', key)
      .or(`effective_to.is.null,effective_to.gte.${todayStr}`),
  ]);

  // Flatten policy_key → policy_value
  const p: Record<string, Record<string, unknown>> = {};
  for (const row of (paramsResult.data ?? []) as Array<{ policy_key: string; policy_value: Record<string, unknown> }>) {
    p[row.policy_key] = row.policy_value;
  }

  // Flatten rule_key → rule_value
  const r: Record<string, Record<string, unknown>> = {};
  for (const row of (rulesResult.data ?? []) as Array<{ rule_key: string; rule_value: Record<string, unknown> }>) {
    r[row.rule_key] = row.rule_value;
  }

  const policy: RetailerPolicy = {
    retailerKey: key,
    maxStackItems:            pv<number>(p['max_stack_items'],          DEFAULT_POLICY.maxStackItems),
    allowedCouponTypes:       pv<string[]>(p['allowed_coupon_types'],   DEFAULT_POLICY.allowedCouponTypes),
    maxTotalCouponValueCents: pv<number>(p['max_total_coupon_value'],   DEFAULT_POLICY.maxTotalCouponValueCents),
    maxManufacturerCoupons:   pv<number>(p['max_manufacturer_coupons'], DEFAULT_POLICY.maxManufacturerCoupons),
    maxStoreCoupons:          pv<number>(p['max_store_coupons'],        DEFAULT_POLICY.maxStoreCoupons),
    roundingMode:             pv<RoundingMode>(p['rounding_mode'],      DEFAULT_POLICY.roundingMode),
    blockSaleAndDigital:      pv<boolean>(r['block_sale_and_digital'],  DEFAULT_POLICY.blockSaleAndDigital),
    blockSaleAndLoyalty:      pv<boolean>(r['block_sale_and_loyalty'],  DEFAULT_POLICY.blockSaleAndLoyalty),
    blockBogoAndCoupon:       pv<boolean>(r['block_bogo_and_coupon'],   DEFAULT_POLICY.blockBogoAndCoupon),
    blockCouponAndLoyalty:    pv<boolean>(r['block_coupon_and_loyalty'],DEFAULT_POLICY.blockCouponAndLoyalty),
  };

  cache.set(key, { policy, expiresAt: now + TTL_MS });
  return policy;
}

/** Force-invalidate cached policy for a retailer (useful after policy updates) */
export function invalidatePolicy(retailerKey: string): void {
  cache.delete(retailerKey.toLowerCase());
}

/** Clear all cached policies */
export function clearPolicyCache(): void {
  cache.clear();
}
