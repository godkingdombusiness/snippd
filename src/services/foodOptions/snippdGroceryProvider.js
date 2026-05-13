/**
 * snippdGroceryProvider.js
 *
 * Returns grocery fulfillment options (quick_grocery_run, grocery_pickup)
 * ranked by budget fit, pantry fit, and user time preference.
 *
 * Snippd decides. Providers fulfill.
 */

const { OPTION_TYPES, scoreOption } = require('./decisionEngineService');

const GROCERY_OPTION_TYPES = [
  OPTION_TYPES.QUICK_GROCERY_RUN,
  OPTION_TYPES.GROCERY_PICKUP,
];

/**
 * @param {object} context — see decisionEngineService for shape
 * @param {object[]} [availableStores] — store objects from user profile
 * @returns {Array<{ optionType, stores, estimatedTripMin, score }>}
 */
function getGroceryOptions(context, availableStores = []) {
  const storeNames = availableStores.map(s => s.store_name || s.name).filter(Boolean);

  return GROCERY_OPTION_TYPES.map(type => {
    const scored = scoreOption(type, context);
    return {
      optionType:       type,
      stores:           storeNames,
      estimatedTripMin: type === OPTION_TYPES.QUICK_GROCERY_RUN ? 45 : 30,
      pickupAvailable:  type === OPTION_TYPES.GROCERY_PICKUP,
      ...scored,
    };
  });
}

module.exports = { getGroceryOptions };
