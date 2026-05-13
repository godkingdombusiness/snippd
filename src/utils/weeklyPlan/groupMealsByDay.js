/**
 * Groups meals by day plan.
 * Returns a Map<day_plan_id, { dayPlan, meals[] }>
 * Meals within each day are sorted Breakfast -> Lunch -> Dinner.
 */
const MEAL_ORDER = { Breakfast: 0, Lunch: 1, Dinner: 2 };

export function groupMealsByDay(dayPlans, meals) {
  const map = new Map();

  dayPlans.forEach(function (dayPlan) {
    map.set(dayPlan.day_plan_id, { dayPlan: dayPlan, meals: [] });
  });

  meals.forEach(function (meal) {
    if (map.has(meal.day_plan_id)) {
      map.get(meal.day_plan_id).meals.push(meal);
    }
  });

  map.forEach(function (entry) {
    entry.meals.sort(function (a, b) {
      var orderA = MEAL_ORDER[a.meal_type] !== undefined ? MEAL_ORDER[a.meal_type] : 99;
      var orderB = MEAL_ORDER[b.meal_type] !== undefined ? MEAL_ORDER[b.meal_type] : 99;
      return orderA - orderB;
    });
  });

  return map;
}
