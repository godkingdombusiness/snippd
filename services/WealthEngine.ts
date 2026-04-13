export interface OfferItem {
  id?: string;
  category?: string;
  brand?: string;
  retailer_key?: string;
  price_cents?: number;
  savings_cents?: number;
  coupon_type?: string;
  quantity?: number;
  on_stack?: boolean;
}

export interface OfferCandidate {
  id: string;
  title?: string;
  total_spent_cents: number;
  total_saved_cents: number;
  budget_cents?: number;
  items: OfferItem[];
  metadata?: Record<string, unknown>;
}

export interface RetailerPolicyRow {
  retailer_key: string;
  policy_key: string;
  policy_value: Record<string, unknown>;
}

export interface PreferenceScoreRow {
  preference_key: string;
  category?: string;
  brand?: string;
  retailer_key?: string;
  score: number;
}

export interface WealthSnapshotMetrics {
  realized_savings: number;
  inflation_offset: number;
  waste_reduction_score: number;
  velocity_score: number;
  projected_annual_wealth: number;
  math_version: string;
  usda_cpi_reference_date: string;
}

export interface StackVariant {
  variant_type: 'max_savings' | 'balanced' | 'convenience';
  candidate: OfferCandidate;
  budget_fit: number;
  preference_fit: number;
  simplicity_score: number;
  score: number;
  feature_vector: Record<string, unknown>;
}

const ANNUAL_USDA_CPI = 0.032;
const MATH_VERSION = 'wealth-1.0';

function round(value: number, decimals = 2) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function flattenPolicy(rows: RetailerPolicyRow[]) {
  return rows.reduce<Record<string, unknown>>((acc, row) => {
    acc[row.policy_key] = row.policy_value;
    return acc;
  }, {});
}

function getItemPreferenceScore(item: OfferItem, preferences: PreferenceScoreRow[]) {
  let score = 0;
  let weight = 0;

  const matches = preferences.filter((p) => {
    if (p.retailer_key && item.retailer_key !== p.retailer_key) return false;
    if (p.category && item.category !== p.category) return false;
    if (p.brand && item.brand !== p.brand) return false;
    return true;
  });

  for (const match of matches) {
    score += normalizeNumber(match.score);
    weight += 1;
  }

  return weight > 0 ? score / weight : 0;
}

function buildFeatureVector(candidate: OfferCandidate, preferences: PreferenceScoreRow[]) {
  const totalItems = candidate.items.length || 1;
  const avgItemScore = candidate.items.reduce((sum, item) => sum + getItemPreferenceScore(item, preferences), 0) / totalItems;

  const totalSaved = normalizeNumber(candidate.total_saved_cents) / 100;
  const totalSpent = normalizeNumber(candidate.total_spent_cents) / 100;
  const savingsRatio = totalSpent > 0 ? totalSaved / totalSpent : 0;

  const uniqueCategories = new Set(candidate.items.map((item) => (item.category || '').toLowerCase())).size;
  const uniqueBrands = new Set(candidate.items.map((item) => (item.brand || '').toLowerCase())).size;

  return {
    candidate_id: candidate.id,
    retailer_key: candidate.items[0]?.retailer_key || null,
    item_count: candidate.items.length,
    unique_categories: uniqueCategories,
    unique_brands: uniqueBrands,
    avg_item_preference: round(avgItemScore, 4),
    savings_ratio: round(savingsRatio, 4),
    budget_cents: normalizeNumber(candidate.budget_cents),
  };
}

function getBudgetFit(candidate: OfferCandidate) {
  const budget = normalizeNumber(candidate.budget_cents, 0);
  const spent = normalizeNumber(candidate.total_spent_cents, 0);
  if (budget <= 0) return 0.5;
  return clamp(1 - Math.abs(budget - spent) / Math.max(budget, 1), 0, 1);
}

function getSimplicityScore(candidate: OfferCandidate) {
  const itemCount = candidate.items.length;
  return clamp(1 - (itemCount - 1) / 15, 0, 1);
}

function getPreferenceFit(candidate: OfferCandidate, preferences: PreferenceScoreRow[]) {
  if (!preferences.length || !candidate.items.length) return 0.25;
  const total = candidate.items.reduce((sum, item) => sum + getItemPreferenceScore(item, preferences), 0);
  return clamp(total / Math.max(candidate.items.length * 5, 1), 0, 1);
}

function validateCandidate(candidate: OfferCandidate, policy: Record<string, unknown>) {
  const issues: string[] = [];
  const maxItems = normalizeNumber(policy.max_stack_items, 999);
  const allowedCouponTypes = Array.isArray(policy.allowed_coupon_types)
    ? policy.allowed_coupon_types.map((v) => String(v).toUpperCase())
    : [];
  const maxCouponValue = normalizeNumber(policy.max_total_coupon_value, 99999);

  if (candidate.items.length > maxItems) {
    issues.push(`too_many_items (${candidate.items.length} > ${maxItems})`);
  }

  const couponTotal = candidate.items.reduce((sum, item) => sum + normalizeNumber(item.savings_cents, 0) - normalizeNumber(item.price_cents, 0), 0);
  if (couponTotal > maxCouponValue) {
    issues.push(`coupon_value_exceeds_policy (${couponTotal})`);
  }

  if (allowedCouponTypes.length > 0) {
    const invalidItem = candidate.items.find((item) => item.coupon_type && !allowedCouponTypes.includes(String(item.coupon_type).toUpperCase()));
    if (invalidItem) {
      issues.push(`invalid_coupon_type:${invalidItem.coupon_type}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export class WealthEngine {
  public static buildWealthSnapshotFromVariant(candidate: OfferCandidate): WealthSnapshotMetrics {
    return buildWealthSnapshot({
      totalSpentCents: candidate.total_spent_cents,
      totalSavedCents: candidate.total_saved_cents,
      tripItems: candidate.items.map((item) => ({
        category: item.category,
        on_stack: item.on_stack,
        price: item.price_cents ? item.price_cents / 100 : undefined,
        quantity: item.quantity,
      })),
    });
  }

  public static buildVariants(
    candidates: OfferCandidate[],
    preferences: PreferenceScoreRow[],
    policyRows: RetailerPolicyRow[],
  ): StackVariant[] {
    const policy = flattenPolicy(policyRows);

    type CandidateScore = {
      candidate: OfferCandidate;
      featureVector: Record<string, unknown>;
      budgetFit: number;
      preferenceFit: number;
      simplicityScore: number;
      score: number;
      validation: { valid: boolean; issues: string[] };
    };

    const scored = candidates.map((candidate) => {
      const featureVector = buildFeatureVector(candidate, preferences);
      const budgetFit = getBudgetFit(candidate);
      const preferenceFit = getPreferenceFit(candidate, preferences);
      const simplicityScore = getSimplicityScore(candidate);
      const savingsScore = clamp((normalizeNumber(candidate.total_saved_cents) / Math.max(normalizeNumber(candidate.total_spent_cents), 1)) * 2, 0, 1);
      const score = round(
        budgetFit * 0.25 + preferenceFit * 0.35 + simplicityScore * 0.15 + savingsScore * 0.25,
        4,
      );
      return {
        candidate,
        featureVector,
        budgetFit,
        preferenceFit,
        simplicityScore,
        score,
        validation: validateCandidate(candidate, policy),
      } as CandidateScore;
    });

    const validCandidates = scored.filter((item) => item.validation.valid);
    if (!validCandidates.length) {
      return [];
    }

    const ranked = validCandidates.sort((a, b) => b.score - a.score);

    const chooseBest = (selector: (item: CandidateScore) => number) =>
      ranked.reduce((best, current) => (selector(current) > selector(best) ? current : best), ranked[0]);

    const maxSavings = chooseBest((item) =>
      normalizeNumber(item.candidate.total_saved_cents) / Math.max(normalizeNumber(item.candidate.total_spent_cents), 1),
    );

    const balanced = chooseBest((item) =>
      (item.budgetFit + item.preferenceFit + item.simplicityScore) / 3,
    );

    const convenience = chooseBest((item) =>
      item.simplicityScore * 0.7 + item.preferenceFit * 0.2 + item.budgetFit * 0.1,
    );

    const buildVariant = (variantType: StackVariant['variant_type'], source: CandidateScore): StackVariant => ({
      variant_type: variantType,
      candidate: source.candidate,
      budget_fit: source.budgetFit,
      preference_fit: source.preferenceFit,
      simplicity_score: source.simplicityScore,
      score: source.score,
      feature_vector: source.featureVector,
    });

    const variants = [
      buildVariant('max_savings', maxSavings),
      buildVariant('balanced', balanced),
      buildVariant('convenience', convenience),
    ];

    return variants.filter((variant, index, self) =>
      index === self.findIndex((other) => other.candidate.id === variant.candidate.id),
    );
  }
}

export interface WealthSnapshotInput {
  totalSpentCents: number;
  totalSavedCents: number;
  tripItems?: OfferItem[];
}

export function buildWealthSnapshot(input: WealthSnapshotInput): WealthSnapshotMetrics {
  const totalSpent = Math.max(0, input.totalSpentCents) / 100;
  const totalSaved = Math.max(0, input.totalSavedCents) / 100;
  const baselineSpend = totalSpent + totalSaved;
  const savingsRate = baselineSpend > 0 ? totalSaved / baselineSpend : 0;
  const tripItems = Array.isArray(input.tripItems) ? input.tripItems : [];

  const stackCoverage = tripItems.length > 0
    ? tripItems.filter((item) => item.on_stack).length / tripItems.length
    : 0;
  const categoryDiversity = Math.min(1, new Set(tripItems.map((item) => (item.category || '').toLowerCase())).size / 6);

  const inflationOffset = round(totalSpent * (ANNUAL_USDA_CPI / 12));
  const wasteReductionScore = round(Math.min(100, (savingsRate * 1.25 + stackCoverage * 0.35) * 100));
  const velocityScore = round(Math.min(100, (stackCoverage * 0.6 + categoryDiversity * 0.4) * 100));

  const momentumMultiplier = 1 + Math.min(0.65, velocityScore * 0.004 + wasteReductionScore * 0.0025);
  const projectedAnnualWealth = round((totalSaved + inflationOffset) * 12 * momentumMultiplier);

  const budgetStressScore = round(Math.max(0, 1 - (savingsRate * 1.5 + stackCoverage * 0.35)) * 100, 2);
  const budgetStressAlert = budgetStressScore >= 65 || projectedAnnualWealth < 1000;

  const today = new Date();
  const usdaCpiReferenceDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    .toISOString()
    .split('T')[0];

  return {
    realized_savings: totalSaved,
    inflation_offset: inflationOffset,
    waste_reduction_score: wasteReductionScore,
    velocity_score: velocityScore,
    projected_annual_wealth: projectedAnnualWealth,
    budget_stress_alert: budgetStressAlert,
    budget_stress_score: budgetStressScore,
    math_version: MATH_VERSION,
    usda_cpi_reference_date: usdaCpiReferenceDate,
  };
}
