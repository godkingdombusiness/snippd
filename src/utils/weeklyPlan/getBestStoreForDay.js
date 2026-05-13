/**
 * Determines the best and secondary stores for a given day.
 * Returns { best_store, secondary_stores, store_label }
 *
 * Priority: dayPlan.best_store_id. Secondary stores are all other unique
 * stores used across the day's meals.
 */
export function getBestStoreForDay(dayPlan, meals, stores) {
  var storeMap = {};
  stores.forEach(function (s) {
    storeMap[s.store_id] = s;
  });

  var bestId = dayPlan.best_store_id;
  var bestStore = storeMap[bestId] || null;

  // Collect all store IDs used in this day's meals
  var allStoreIds = new Set();
  meals.forEach(function (meal) {
    var ids = meal.store_ids_used && meal.store_ids_used.length > 0
      ? meal.store_ids_used
      : [meal.best_store_id];
    ids.forEach(function (id) { allStoreIds.add(id); });
  });

  var secondaryStores = Array.from(allStoreIds)
    .filter(function (id) { return id !== bestId; })
    .map(function (id) { return storeMap[id] || null; })
    .filter(Boolean);

  var storeLabel;
  if (secondaryStores.length === 0) {
    storeLabel = bestStore ? bestStore.store_name : bestId;
  } else {
    var allNames = [bestStore ? bestStore.store_name : bestId].concat(
      secondaryStores.map(function (s) { return s.store_name; })
    );
    storeLabel = allNames.join(' + ');
  }

  return {
    best_store: bestStore,
    secondary_stores: secondaryStores,
    store_label: storeLabel,
  };
}
