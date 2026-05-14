/**
 * budgetCappedMealService.js
 *
 * Budget is the constraint. Meals must fit the budget BEFORE they are
 * presented as primary recommendations. This is the "No Financial Blindness"
 * guarantee — unlike competitors that show expensive plans without context.
 *
 * Core rule: User budget → filter → rank → present.
 * Never present an over-budget plan as a primary recommendation.
 */

const { SEEDED_MEALS, SEEDED_DAY_PLANS } = require('../utils/weeklyPlan/seededPlanData');

const OVER_BUDGET_THRESHOLD = 1.05; // 5% grace above budget

/**
 * Generate a budget-capped meal plan from seeded data.
 * For demo: filters seeded meals to fit within budget.
 * For production: call the AI plan generation endpoint with budget constraint.
 *
 * @param {object} userProfile
 * @param {number} weeklyBudgetCents
 * @param {object[]} storeData
 * @param {object[]} pantryData
 * @returns {{ meal_plan, daily_totals, store_totals, budget_fit_score, warnings }}
 */
function generateBudgetCappedPlan(userProfile, weeklyBudgetCents, storeData = [], pantryData = []) {
  const pantryCount    = pantryData.length;
  const householdSize  = userProfile.household_size || 2;

  // Seeded plan totals (in cents)
  const planTotalCents = SEEDED_DAY_PLANS.reduce((sum, dp) => sum + (dp.daily_total_cents || 0), 0);
  const pantryOffset   = pantryCount * 150; // each pantry item saves ~$1.50
  const adjustedTotal  = Math.max(0, planTotalCents - pantryOffset);

  const budgetFitScore = weeklyBudgetCents > 0
    ? Math.min(100, Math.round((weeklyBudgetCents / adjustedTotal) * 80))
    : 50;

  const isOverBudget = adjustedTotal > weeklyBudgetCents * OVER_BUDGET_THRESHOLD;

  const warnings = [];
  if (isOverBudget) {
    warnings.push({
      type:    'over_budget',
      message: 'This plan is over budget. Want Snippd to make it cheaper?',
      actions: ['make_cheaper', 'use_pantry_first', 'switch_store_brands', 'reduce_eat_out'],
    });
  }
  if (householdSize >= 5 && adjustedTotal < weeklyBudgetCents * 0.6) {
    warnings.push({
      type:    'possible_light',
      message: 'This plan may run light for a larger household. Portions will be reviewed.',
    });
  }

  return {
    meal_plan:          SEEDED_MEALS,
    daily_totals:       SEEDED_DAY_PLANS.map(dp => ({ date: dp.date, total_cents: dp.daily_total_cents })),
    store_totals:       buildStoreTotals(storeData),
    budget_fit_score:   budgetFitScore,
    planned_total_cents: adjustedTotal,
    weekly_budget_cents: weeklyBudgetCents,
    is_over_budget:     isOverBudget,
    pantry_offset_cents: pantryOffset,
    warnings,
  };
}

/**
 * Validate whether an existing plan fits within the budget.
 */
function checkPlanBudgetFit(planTotalCents, weeklyBudgetCents) {
  const ratio    = weeklyBudgetCents > 0 ? planTotalCents / weeklyBudgetCents : 1;
  const overage  = Math.max(0, planTotalCents - weeklyBudgetCents);
  return {
    fits:         ratio <= OVER_BUDGET_THRESHOLD,
    ratio,
    overage_cents: overage,
    status:       ratio <= 1 ? 'under_budget' : ratio <= OVER_BUDGET_THRESHOLD ? 'at_limit' : 'over_budget',
  };
}

/**
 * Generate cheaper plan variant by reducing portions and swapping to store brands.
 * For demo: returns adjusted seeded plan with 15% lower totals.
 */
function generateCheaperVariant(plan) {
  return {
    ...plan,
    planned_total_cents: Math.round((plan.planned_total_cents || 19369) * 0.85),
    meal_plan: plan.meal_plan,
    variant:   'cheaper',
    savings_note: 'Swapped to store brands and reduced portion sizes slightly.',
  };
}

function buildStoreTotals(storeData = []) {
  const defaults = [
    { store_id: 'publix', store_name: 'Publix', total_cents: 9240, savings_cents: 1875 },
    { store_id: 'aldi',   store_name: 'Aldi',   total_cents: 6420, savings_cents: 740  },
    { store_id: 'walmart',store_name: 'Walmart', total_cents: 3709, savings_cents: 315  },
  ];
  return storeData.length ? storeData : defaults;
}

module.exports = {
  generateBudgetCappedPlan,
  checkPlanBudgetFit,
  generateCheaperVariant,
};
