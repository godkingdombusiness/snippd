/**
 * CouponStackingEngine — orchestrates validation + calculation
 *
 * Usage:
 *   const engine = new CouponStackingEngine(supabase);
 *   const result = await engine.compute(basketId, items, 'publix');
 *
 * For testing (no Supabase):
 *   const result = await engine.computeWithPolicy(basketId, items, policy);
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_POLICY,
  RetailerPolicy,
  StackEngineConfig,
  StackExplanation,
  StackItem,
  StackResult,
} from '../../types/stacking';
import { loadRetailerPolicy } from './policyLoader';
import { validateOfferSet } from './stackValidator';
import { calculateStackLine } from './stackCalculator';

const MODEL_VERSION = process.env['MODEL_VERSION'] ?? 'v1.0.0';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildExplanation(result: Omit<StackResult, 'explanation'>): StackExplanation {
  const orderApplied = [...new Set(
    result.appliedOffers.map((a) => a.offerType),
  )];

  const lineBreakdown = result.lines.map((line) => ({
    itemName:     line.itemName ?? line.itemId,
    regularTotal: formatCents(line.lineTotalRegularCents),
    finalTotal:   formatCents(line.lineTotalFinalCents),
    savings:      formatCents(line.lineSavingsCents),
    rebate:       line.lineRebateCents > 0 ? formatCents(line.lineRebateCents) : undefined,
  }));

  const pctSaved = result.basketRegularCents > 0
    ? ((result.inStackSavingsCents / result.basketRegularCents) * 100).toFixed(1)
    : '0.0';

  const rebatePart = result.rebateCents > 0
    ? ` + ${formatCents(result.rebateCents)} rebate`
    : '';

  const warnPart = result.warnings.length > 0
    ? ` (${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''})`
    : '';

  return {
    summary: `Stack saves ${formatCents(result.inStackSavingsCents)} (${pctSaved}%) on ${result.lines.length} item(s) at ${result.retailerKey}${rebatePart}${warnPart}.`,
    orderApplied,
    lineBreakdown,
  };
}

// ─────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────

export class CouponStackingEngine {
  private readonly supabase: SupabaseClient | null;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase ?? null;
  }

  /**
   * Full pipeline: load policy from DB → validate → calculate → (optionally persist)
   * Requires a SupabaseClient.
   */
  async compute(
    basketId: string,
    items: StackItem[],
    retailerKey: string,
    config: StackEngineConfig = {},
  ): Promise<StackResult> {
    if (!this.supabase) {
      throw new Error('CouponStackingEngine.compute() requires a SupabaseClient. Use computeWithPolicy() for testing.');
    }
    const policy = await loadRetailerPolicy(this.supabase, retailerKey);
    return this.run(basketId, items, retailerKey, policy, config);
  }

  /**
   * Bypasses Supabase policy loading — for testing or when policy is already known.
   */
  async computeWithPolicy(
    basketId: string,
    items: StackItem[],
    policy: RetailerPolicy,
    config: StackEngineConfig = {},
  ): Promise<StackResult> {
    return this.run(basketId, items, policy.retailerKey, policy, config);
  }

  // ── Private orchestration ────────────────────────────────

  private async run(
    basketId: string,
    items: StackItem[],
    retailerKey: string,
    policy: RetailerPolicy,
    config: StackEngineConfig,
  ): Promise<StackResult> {
    const modelVersion = config.modelVersion ?? MODEL_VERSION;

    // 1. Validate
    const { validItems, rejectedOfferIds, warnings: validationWarnings } = validateOfferSet(items, policy);

    // 2. Calculate each line
    const lines = validItems.map((item) => {
      const line = calculateStackLine(item, policy);
      // Attach per-item rejected IDs (already handled in validItems)
      return line;
    });

    // 3. Aggregate
    const basketRegularCents  = lines.reduce((s, l) => s + l.lineTotalRegularCents, 0);
    const basketFinalCents    = lines.reduce((s, l) => s + l.lineTotalFinalCents, 0);
    const inStackSavingsCents = lines.reduce((s, l) => s + l.lineSavingsCents, 0);
    const rebateCents         = lines.reduce((s, l) => s + l.lineRebateCents, 0);
    const allApplied          = lines.flatMap((l) => l.appliedOffers);
    const allWarnings         = [
      ...validationWarnings,
      ...lines.flatMap((l) => l.warnings),
    ];

    const partial: Omit<StackResult, 'explanation'> = {
      basketId,
      retailerKey,
      lines,
      basketRegularCents,
      basketFinalCents,
      totalSavingsCents:   inStackSavingsCents + rebateCents,
      inStackSavingsCents,
      rebateCents,
      appliedOffers:      allApplied,
      warnings:           allWarnings,
      rejectedOfferIds:   [...new Set(rejectedOfferIds)],
      computedAt:         new Date().toISOString(),
      modelVersion,
    };

    const explanation = buildExplanation(partial);
    const result: StackResult = { ...partial, explanation };

    // 4. Optionally persist
    if (config.persistResults && config.userId && this.supabase) {
      await this.supabase.from('stack_results').insert([{
        user_id:          config.userId,
        retailer_key:     retailerKey,
        model_version:    modelVersion,
        variant_type:     'computed',
        candidate:        result,
        budget_fit:       0,
        preference_fit:   0,
        simplicity_score: 0,
        score:            0,
      }]);
    }

    return result;
  }
}

// Convenience factory (uses env-configured Supabase if available)
export function createEngine(supabase?: SupabaseClient): CouponStackingEngine {
  return new CouponStackingEngine(supabase);
}

// Re-export policy fallback for consumers that want to skip DB
export { DEFAULT_POLICY };
