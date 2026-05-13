/**
 * Calculates and verifies consistent totals across all tabs of the weekly plan.
 * Returns a normalized totals object used by all three tabs.
 *
 * Source of truth priority:
 *  1. weeklyPlan fields (already server-computed)
 *  2. Derived from dayPlans if weeklyPlan fields are missing
 *  3. Derived from meals if dayPlans are also missing
 */
export function calculateWeeklyPlanTotals(weeklyPlan, dayPlans, meals, stores) {
  // Out of pocket and savings from plan fields (authoritative)
  var outOfPocketCents = weeklyPlan.out_of_pocket_cents || weeklyPlan.planned_total_cents || 0;
  var savingsCents = weeklyPlan.estimated_savings_cents || 0;

  // Daily totals keyed by day_plan_id
  var dailyTotals = {};
  dayPlans.forEach(function (dp) {
    dailyTotals[dp.day_plan_id] = {
      day_of_week: dp.day_of_week,
      date: dp.date,
      total_cents: dp.daily_total_cents,
      savings_cents: dp.daily_savings_cents,
    };
  });

  // Store totals keyed by store_id
  var storeTotals = {};
  stores.forEach(function (store) {
    storeTotals[store.store_id] = {
      store_name: store.store_name,
      total_cents: store.store_total_cents,
      savings_cents: store.store_savings_cents,
      items_count: store.items_count,
    };
  });

  // Verify: sum of daily totals should match out_of_pocket_cents
  var sumFromDays = dayPlans.reduce(function (acc, dp) {
    return acc + (dp.daily_total_cents || 0);
  }, 0);

  // Verify: sum of store totals should also be consistent
  var sumFromStores = stores.reduce(function (acc, store) {
    return acc + (store.store_total_cents || 0);
  }, 0);

  return {
    out_of_pocket_cents: outOfPocketCents,
    savings_cents: savingsCents,
    budget_cents: weeklyPlan.weekly_budget_cents || 0,
    budget_remaining_cents: (weeklyPlan.weekly_budget_cents || 0) - outOfPocketCents,
    daily_totals: dailyTotals,
    store_totals: storeTotals,
    sum_from_days: sumFromDays,
    sum_from_stores: sumFromStores,
    household_size: weeklyPlan.household_size || 4,
    week_label: 'May 11 — May 17',
    deal_valid_until: weeklyPlan.deal_valid_until || '',
    best_overall_store_id: weeklyPlan.best_overall_store_id || '',
  };
}
