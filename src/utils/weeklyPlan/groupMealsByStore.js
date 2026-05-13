/**
 * Groups meals by store.
 * Returns a Map<store_id, { store, meals[] }> where each meal entry
 * also includes the dayPlan it belongs to (for display context).
 *
 * A meal appears in every store that it uses (store_ids_used array),
 * but is tagged with its primary/best_store_id.
 */
export function groupMealsByStore(meals, stores, dayPlans) {
  const dayPlanMap = {};
  dayPlans.forEach(function (dp) {
    dayPlanMap[dp.day_plan_id] = dp;
  });

  const map = new Map();

  stores.forEach(function (store) {
    map.set(store.store_id, { store: store, meals: [] });
  });

  meals.forEach(function (meal) {
    var storeIds = meal.store_ids_used && meal.store_ids_used.length > 0
      ? meal.store_ids_used
      : [meal.best_store_id];

    var dayPlan = dayPlanMap[meal.day_plan_id] || null;

    storeIds.forEach(function (storeId) {
      if (map.has(storeId)) {
        map.get(storeId).meals.push({
          meal: meal,
          dayPlan: dayPlan,
          is_primary: meal.best_store_id === storeId,
        });
      }
    });
  });

  return map;
}
