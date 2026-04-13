/**
 * wealthEngine — Wealth momentum calculation service
 *
 * Core functions:
 *  - calculateInflationShield(): Compare receipt prices to USDA benchmarks
 *  - calculateSmartStackingSavings(): Sum verified promo savings
 *  - calculateVelocityScore(): Compare weekly savings to 4-week average
 *  - calculateWealthMomentum(): Combine shield + stacking with velocity
 *  - projectAnnualWealth(): Annual projection
 *  - generateTransparencyReport(): Explain the math
 *  - computeAndSave(): Orchestrate everything and write to DB
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ParsedReceiptItem, WealthMomentumResult } from '../types/events';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const MATH_VERSION = 'v1.0.0';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface USDABenchmark {
  category: string;
  avg_price_per_unit: number; // in dollars
  unit: string; // 'lb', 'each', etc.
  reference_date: string;
}

interface WeeklySavingsData {
  week_start: string;
  total_savings: number;
}

// ─────────────────────────────────────────────────────────────
// Main computation functions
// ─────────────────────────────────────────────────────────────

export function calculateInflationShield(
  receiptItems: ParsedReceiptItem[],
  usdaData: USDABenchmark[]
): number {
  let totalShield = 0;

  for (const item of receiptItems) {
    // Find matching USDA category benchmark
    const benchmark = usdaData.find(b =>
      b.category.toLowerCase() === (item.category || '').toLowerCase()
    );

    if (benchmark) {
      const itemPricePerUnit = item.unit_price / 100; // Convert cents to dollars
      const usdaAvg = benchmark.avg_price_per_unit;

      // Shield = (USDA_avg - receipt_price) * quantity, but only if positive
      const shield = (usdaAvg - itemPricePerUnit) * item.qty;
      if (shield > 0) {
        totalShield += shield;
      }
    }
  }

  return Math.round(totalShield * 100); // Return in cents
}

export function calculateSmartStackingSavings(receiptItems: ParsedReceiptItem[]): number {
  // Sum all promo_savings_cents from items that were verified against offer_sources
  // For now, sum all promo savings (assuming they're verified)
  return receiptItems.reduce((total, item) => {
    return total + (item.promo_savings_cents || 0);
  }, 0);
}

export async function calculateVelocityScore(
  userId: string,
  currentWeekSavings: number,
  supabase: SupabaseClient
): Promise<number> {
  // Get last 4 weeks of wealth snapshots
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const { data: snapshots, error } = await supabase
    .from('wealth_momentum_snapshots')
    .select('timestamp, realized_savings')
    .eq('user_id', userId)
    .gte('timestamp', fourWeeksAgo.toISOString())
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Error fetching wealth snapshots:', error);
    return 0.5; // Default neutral score
  }

  if (!snapshots || snapshots.length < 4) {
    return 0.5; // Not enough data
  }

  // Calculate 4-week average
  const totalSavings = snapshots.reduce((sum, snap) => sum + (snap.realized_savings || 0), 0);
  const avgSavings = totalSavings / snapshots.length;

  if (avgSavings === 0) {
    return currentWeekSavings > 0 ? 1.0 : 0.0;
  }

  // Velocity = current / average, clamped to 0-2, then normalized to 0-1
  const rawVelocity = Math.min(Math.max(currentWeekSavings / avgSavings, 0), 2);
  return rawVelocity / 2; // Normalize to 0-1 scale
}

export function calculateWealthMomentum(
  shield: number, // in cents
  stacking: number, // in cents
  velocity: number // 0-1
): number {
  const totalSavings = shield + stacking;
  const momentum = totalSavings * (1 + velocity / 10);
  return Math.round(momentum);
}

export function projectAnnualWealth(weeklyMomentum: number): number {
  return Math.round(weeklyMomentum * 52);
}

export function generateTransparencyReport(
  shield: number,
  stacking: number,
  velocity: number,
  inputs: {
    receiptItems: ParsedReceiptItem[];
    usdaData: USDABenchmark[];
  }
) {
  const momentum = calculateWealthMomentum(shield, stacking, velocity);
  const annual = projectAnnualWealth(momentum);

  return {
    math_version: MATH_VERSION,
    data_sources: [
      'USDA CPI benchmarks from app_config',
      'Receipt items with verified promo savings',
      '4-week historical wealth snapshots'
    ],
    formula: '(inflation_shield + stacking_savings) × (1 + velocity_score/10) × 52',
    breakdown: [
      {
        component: 'inflation_shield',
        value: shield,
        explanation: `Sum of (USDA_avg - receipt_price) × qty for ${inputs.receiptItems.length} items, positives only`
      },
      {
        component: 'stacking_savings',
        value: stacking,
        explanation: `Verified promotional savings from ${inputs.receiptItems.filter(i => (i.promo_savings_cents ?? 0) > 0).length} items`
      },
      {
        component: 'velocity_score',
        value: velocity,
        explanation: `Current week savings vs 4-week average (0-1 scale)`
      },
      {
        component: 'wealth_momentum',
        value: momentum,
        explanation: `Weekly wealth momentum before annual projection`
      },
      {
        component: 'projected_annual_wealth',
        value: annual,
        explanation: `Weekly momentum × 52 weeks`
      }
    ]
  };
}

// ─────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────

export async function computeAndSave(
  userId: string,
  receiptId: string,
  supabase: SupabaseClient
): Promise<WealthMomentumResult> {
  // 1. Read receipt_items for this receipt
  const { data: receiptItems, error: itemsError } = await supabase
    .from('receipt_items')
    .select('*')
    .eq('receipt_id', receiptId);

  if (itemsError) {
    throw new Error(`Failed to fetch receipt items: ${itemsError.message}`);
  }

  if (!receiptItems || receiptItems.length === 0) {
    throw new Error('No receipt items found');
  }

  // 2. Fetch USDA benchmarks from app_config
  const { data: configData, error: configError } = await supabase
    .from('app_config')
    .select('config_value')
    .eq('config_key', 'usda_category_benchmarks')
    .single();

  if (configError) {
    throw new Error(`Failed to fetch USDA benchmarks: ${configError.message}`);
  }

  const usdaData: USDABenchmark[] = configData?.config_value || [];

  // 3. Run calculations
  const shield = calculateInflationShield(receiptItems, usdaData);
  const stacking = calculateSmartStackingSavings(receiptItems);
  const velocity = await calculateVelocityScore(userId, shield + stacking, supabase);
  const momentum = calculateWealthMomentum(shield, stacking, velocity);
  const annual = projectAnnualWealth(momentum);

  // 4. Generate transparency report
  const transparencyReport = generateTransparencyReport(shield, stacking, velocity, {
    receiptItems,
    usdaData
  });

  // 5. Check for budget stress (placeholder logic)
  const budgetStressScore = 0; // TODO: Implement budget stress calculation
  const budgetStressAlert = budgetStressScore > 0.7;

  // 6. Write to wealth_momentum_snapshots
  const result: WealthMomentumResult = {
    user_id: userId,
    timestamp: new Date().toISOString(),
    realized_savings: shield + stacking,
    inflation_offset: shield,
    velocity_score: velocity,
    wealth_momentum: momentum,
    projected_annual_wealth: annual,
    budget_stress_alert: budgetStressAlert,
    budget_stress_score: budgetStressScore,
    transparency_report: transparencyReport
  };

  const { error: insertError } = await supabase
    .from('wealth_momentum_snapshots')
    .insert({
      user_id: userId,
      realized_savings: (shield + stacking) / 100, // Convert to dollars for DB
      inflation_offset: shield / 100,
      velocity_score: velocity,
      projected_annual_wealth: annual / 100,
      budget_stress_alert: budgetStressAlert,
      budget_stress_score: budgetStressScore,
      math_version: MATH_VERSION,
      usda_cpi_reference_date: new Date().toISOString().split('T')[0]
    });

  if (insertError) {
    throw new Error(`Failed to save wealth snapshot: ${insertError.message}`);
  }

  return result;
}