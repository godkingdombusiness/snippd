/**
 * mealShiftService.js
 *
 * Shift logic: when the user eats out, skips, or swaps tonight's dinner,
 * move remaining meals forward by one day so groceries still make sense.
 *
 * All functions are pure and work on plan data objects.
 * No Supabase writes here — caller decides whether to persist.
 */

const PERISHABLE_INGREDIENTS = [
  'chicken', 'ground beef', 'salmon', 'shrimp', 'salad', 'lettuce',
  'spinach', 'berries', 'strawberries', 'avocado', 'fresh herbs',
  'tomatoes', 'fresh fish', 'dairy', 'mozzarella',
];

const SHIFT_REASONS = {
  EATING_OUT:    'eating_out',
  SKIP_MEAL:     'skip_meal',
  PIZZA_NIGHT:   'pizza_night',
  SWAP_DINNER:   'swap_dinner',
  MOVE_MEAL:     'move_meal',
};

/**
 * Shift all meals from fromDate onwards forward by one day.
 *
 * @param {object[]} dayPlans  — SEEDED_DAY_PLANS array
 * @param {object[]} meals     — SEEDED_MEALS array
 * @param {string}   fromDate  — ISO date string 'YYYY-MM-DD'
 * @param {string}   reason    — one of SHIFT_REASONS
 * @returns {{ shiftedDayPlans, shiftedMeals, affectedDays, shiftEvent }}
 */
function shiftMealPlan(dayPlans, meals, fromDate, reason) {
  const fromIndex = dayPlans.findIndex(dp => dp.date === fromDate);
  if (fromIndex === -1) {
    return { shiftedDayPlans: dayPlans, shiftedMeals: meals, affectedDays: [], shiftEvent: null };
  }

  const affectedDays = dayPlans.slice(fromIndex);
  const shiftedDayPlans = dayPlans.map((dp, idx) => {
    if (idx < fromIndex) return dp;
    // Shift date by one calendar day
    const d = new Date(dp.date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return {
      ...dp,
      date:         d.toISOString().split('T')[0],
      day_of_week:  getDayOfWeek(d),
    };
  });

  const affectedPlanIds = new Set(affectedDays.map(dp => dp.day_plan_id));
  const shiftedMeals = meals.map(m => {
    if (!affectedPlanIds.has(m.day_plan_id)) return m;
    const newPlan = shiftedDayPlans.find(dp => {
      const original = dayPlans.find(o => o.day_plan_id === m.day_plan_id);
      return original && dp.date !== original.date && shiftedDayPlans.indexOf(dp) === dayPlans.indexOf(original);
    });
    return newPlan ? { ...m, day_plan_id: newPlan.day_plan_id } : m;
  });

  const shiftEvent = {
    shift_event_id:  'shift_' + Date.now(),
    original_date:   fromDate,
    new_date:        shiftedDayPlans[fromIndex]?.date,
    reason,
    affected_count:  affectedDays.length,
    created_at:      new Date().toISOString(),
  };

  return { shiftedDayPlans, shiftedMeals, affectedDays: affectedDays.map(d => d.date), shiftEvent };
}

/**
 * Check which confirmed pantry items may spoil if the plan shifts.
 * Returns items with their risk level.
 */
function calculateWasteRiskAfterShift(pantryItems = [], daysShifted = 1) {
  return pantryItems
    .filter(item => {
      const name = (item.name || '').toLowerCase();
      return PERISHABLE_INGREDIENTS.some(p => name.includes(p));
    })
    .map(item => ({
      ...item,
      waste_risk: daysShifted >= 2 ? 'high' : 'moderate',
    }));
}

/**
 * Recalculate daily totals after a shift (adjusts date references only;
 * per-meal costs stay the same).
 */
function recalculatePlanAfterShift(shiftedDayPlans, meals) {
  return shiftedDayPlans.map(dp => {
    const dayMeals = meals.filter(m => m.day_plan_id === dp.day_plan_id);
    const total = dayMeals.reduce((sum, m) => sum + (m.meal_total_cents || 0), 0);
    return { ...dp, daily_total_cents: total };
  });
}

/**
 * Calculate budget impact: difference between original and shifted plan totals.
 * Shifting itself doesn't change total cost, but eat-out substitution does.
 */
function calculateBudgetImpactAfterShift(originalPlan, eatOutCostCents = 0) {
  const plannedMealCost = originalPlan?.daily_total_cents || 0;
  return {
    original_meal_cents:  plannedMealCost,
    eat_out_cents:        eatOutCostCents,
    delta_cents:          eatOutCostCents - plannedMealCost,
    over_budget:          eatOutCostCents > plannedMealCost,
  };
}

function getDayOfWeek(dateObj) {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dateObj.getUTCDay()];
}

module.exports = {
  SHIFT_REASONS,
  shiftMealPlan,
  calculateWasteRiskAfterShift,
  recalculatePlanAfterShift,
  calculateBudgetImpactAfterShift,
};
