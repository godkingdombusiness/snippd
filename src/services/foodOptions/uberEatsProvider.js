/**
 * uberEatsProvider.js
 *
 * Uber Eats is ONE fulfillment option inside Snippd's provider-neutral
 * decision layer. Snippd calculates a recommendation_score BEFORE
 * surfacing Uber Eats options. Uber does not define the plan.
 *
 * Integration status: sandbox testing underway for approved eat-out
 * and grocery handoff workflows.
 *
 * Do NOT:
 *   - Call this provider before decisionEngineService has scored all options
 *   - Show Uber Eats options when totalScore < SCORE_THRESHOLD
 *   - Label Snippd as "powered by Uber Eats" anywhere in user-facing copy
 */

const { OPTION_TYPES, scoreOption } = require('./decisionEngineService');

// Snippd requires a minimum decision score before surfacing Uber as an option.
// This ensures Uber is never the default — it earns its place in the ranking.
const SCORE_THRESHOLD = 35;

const UBER_EATS_OPTION_TYPES = [
  OPTION_TYPES.UBER_EATS_PICKUP,
  OPTION_TYPES.UBER_EATS_DELIVERY,
];

const UBER_META = {
  [OPTION_TYPES.UBER_EATS_PICKUP]: {
    etaMin:           20,
    etaMax:           30,
    feeNote:          'Pickup — no delivery fee',
    sandboxAvailable: true,
  },
  [OPTION_TYPES.UBER_EATS_DELIVERY]: {
    etaMin:           35,
    etaMax:           55,
    feeNote:          'Delivery fee + tip applies',
    sandboxAvailable: true,
  },
};

/**
 * Returns Uber Eats options only when the decision engine score meets the
 * threshold. Options below the threshold are excluded from the ranked list.
 *
 * @param {object} context — see decisionEngineService for shape
 * @returns {Array<{ optionType, etaMin, etaMax, feeNote, totalScore }>}
 */
function getUberEatsOptions(context) {
  return UBER_EATS_OPTION_TYPES
    .map(type => {
      const scored = scoreOption(type, context);
      if (scored.totalScore < SCORE_THRESHOLD) return null;
      return {
        optionType: type,
        ...UBER_META[type],
        ...scored,
        provider:   'uber_eats',
        disclaimer: 'Uber Eats integration testing is underway for approved eat-out and grocery handoff workflows.',
      };
    })
    .filter(Boolean);
}

module.exports = { getUberEatsOptions, SCORE_THRESHOLD };
