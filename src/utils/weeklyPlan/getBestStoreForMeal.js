/**
 * Determines the best and secondary stores for a given meal.
 * Returns { primary_store, secondary_stores, store_label }
 *
 * If meal.store_ids_used has 1 entry: store_label = store name (e.g. "Publix")
 * If multiple: store_label = "Publix + Aldi"
 */
export function getBestStoreForMeal(meal, stores, userPreferences) {
  var storeMap = {};
  stores.forEach(function (s) {
    storeMap[s.store_id] = s;
  });

  var primaryId = meal.best_store_id;
  var allIds = meal.store_ids_used && meal.store_ids_used.length > 0
    ? meal.store_ids_used
    : [primaryId];

  var primaryStore = storeMap[primaryId] || null;
  var secondaryStores = allIds
    .filter(function (id) { return id !== primaryId; })
    .map(function (id) { return storeMap[id] || null; })
    .filter(Boolean);

  var storeLabel;
  if (allIds.length === 1) {
    storeLabel = primaryStore ? primaryStore.store_name : primaryId;
  } else {
    var names = allIds.map(function (id) {
      return storeMap[id] ? storeMap[id].store_name : id;
    });
    storeLabel = names.join(' + ');
  }

  return {
    primary_store: primaryStore,
    secondary_stores: secondaryStores,
    store_label: storeLabel,
  };
}
