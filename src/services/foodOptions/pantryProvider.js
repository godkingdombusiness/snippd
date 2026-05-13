/**
 * pantryProvider.js
 *
 * Returns the cook_from_pantry option with a pantry coverage estimate.
 * Scores highest when remaining budget is tight and pantry count is high.
 *
 * Snippd decides. Providers fulfill.
 */

const { OPTION_TYPES, scoreOption } = require('./decisionEngineService');

/**
 * @param {object} context — see decisionEngineService for shape
 * @returns {{ optionType, estimatedCoverageItems, requiresShop, score } | null}
 *   Returns null when pantryCount === 0 (nothing to cook from).
 */
function getPantryOption(context) {
  const { pantryCount = 0 } = context;
  if (pantryCount === 0) return null;

  const scored = scoreOption(OPTION_TYPES.COOK_FROM_PANTRY, context);

  const coveragePct = Math.min(1, pantryCount / 12);
  const requiresShop = coveragePct < 0.6;

  return {
    optionType:             OPTION_TYPES.COOK_FROM_PANTRY,
    estimatedCoverageItems: pantryCount,
    coveragePct:            Math.round(coveragePct * 100),
    requiresShop,
    supplementNote: requiresShop
      ? 'You may need a few extra items from the store.'
      : 'Your pantry covers tonight.',
    ...scored,
  };
}

module.exports = { getPantryOption };
