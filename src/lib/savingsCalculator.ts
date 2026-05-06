// Pure savings calculation helpers — no side effects, no imports.
// All monetary values in DOLLARS unless the parameter name ends in _cents.

export interface SavingsComparison {
  baseline_without_snippd_total: number;
  planned_snippd_total:          number;
  actual_receipt_total:          number;
  planned_savings:               number;
  actual_savings:                number;
  plan_accuracy_percent:         number;
  budget_result:                 number;
  was_under_budget:              boolean;
  baseline_is_estimated:         boolean;
}

export interface BonusSavings {
  fetch_available:     number;
  fetch_claimed:       number;
  ibotta_available:    number;
  ibotta_claimed:      number;
  total_bonus_available: number;
  total_bonus_claimed:   number;
  missed_bonus_savings:  number;
}

export function computeSavings(params: {
  baseline:              number;
  planned:               number;
  actual:                number;
  budget_target:         number;
  baseline_is_estimated?: boolean;
}): SavingsComparison {
  const { baseline, planned, actual, budget_target, baseline_is_estimated = false } = params;

  const planned_savings = Math.max(0, parseFloat((baseline - planned).toFixed(2)));
  const actual_savings  = Math.max(0, parseFloat((baseline - actual).toFixed(2)));
  const budget_result   = parseFloat((budget_target - actual).toFixed(2));

  // Accuracy: 100% when planned === actual; degrades proportionally with deviation
  const plan_accuracy_percent = planned > 0
    ? Math.max(0, Math.round((1 - Math.abs(actual - planned) / planned) * 100))
    : 100;

  return {
    baseline_without_snippd_total: baseline,
    planned_snippd_total:          planned,
    actual_receipt_total:          actual,
    planned_savings,
    actual_savings,
    plan_accuracy_percent,
    budget_result,
    was_under_budget:  budget_result >= 0,
    baseline_is_estimated,
  };
}

export function computeBonusSavings(params: {
  fetch_available?:  number;
  fetch_claimed?:    number;
  ibotta_available?: number;
  ibotta_claimed?:   number;
}): BonusSavings {
  const fa = params.fetch_available  ?? 0;
  const fc = params.fetch_claimed    ?? 0;
  const ia = params.ibotta_available ?? 0;
  const ic = params.ibotta_claimed   ?? 0;
  return {
    fetch_available:       fa,
    fetch_claimed:         fc,
    ibotta_available:      ia,
    ibotta_claimed:        ic,
    total_bonus_available: fa + ia,
    total_bonus_claimed:   fc + ic,
    missed_bonus_savings:  Math.max(0, (fa + ia) - (fc + ic)),
  };
}

export function hasBonusSavings(b: Partial<BonusSavings>): boolean {
  return (b.total_bonus_available ?? 0) > 0 || (b.total_bonus_claimed ?? 0) > 0;
}

export function formatDollars(amount: number): string {
  return '$' + Math.abs(amount).toFixed(2);
}
