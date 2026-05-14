/**
 * safetyScrubService.js
 *
 * Safety filter: run before any recipe, meal, grocery item, or eat-out
 * option is surfaced. Checks user avoids, allergy flags, and preference list.
 *
 * IMPORTANT DISCLAIMERS (must appear in any UI using this service):
 * - Snippd does not verify allergens, ingredients, cross-contact, or
 *   medical suitability.
 * - Always read labels, review restaurant information, and consult a
 *   qualified medical professional for any dietary health decisions.
 * - Do NOT make medical claims. Do NOT say Snippd verifies allergens.
 */

const REQUIRED_DISCLAIMER =
  'Snippd does not verify allergens, ingredients, cross-contact, or medical suitability. ' +
  'Always read labels, review restaurant information, and consult a qualified medical professional.';

const SEVERITY = {
  ALLERGY:     'allergy',      // Hard block — do not recommend as Best Match
  PREFERENCE:  'preference',   // Soft flag — show caution, still display
  INCOMPLETE:  'incomplete',   // Data missing — show caution note
};

/**
 * Run safety scrub against a user profile.
 *
 * @param {object} option       — { ingredients: string[], name: string, meal_id? }
 * @param {object} userProfile  — { avoids: string[], food_goals: string[], allergies?: string[] }
 * @returns {{ safe_to_display, caution_flags, blocked_reasons, disclaimer_required }}
 */
function runSafetyScrub(option, userProfile = {}) {
  const avoids      = normalise(userProfile.avoids || []);
  const allergies   = normalise(userProfile.allergies || []);
  const ingredients = normalise(option.ingredients || []);

  const cautionFlags   = [];
  const blockedReasons = [];

  if (ingredients.length === 0) {
    cautionFlags.push({
      severity: SEVERITY.INCOMPLETE,
      message:  'Ingredient details may be incomplete. Please verify labels or restaurant information.',
    });
  }

  allergies.forEach(allergen => {
    const hit = ingredients.find(ing => ing.includes(allergen));
    if (hit) {
      blockedReasons.push({
        severity: SEVERITY.ALLERGY,
        flag:     allergen,
        message:  `Contains a flagged item (${allergen}). Moved to Needs Review.`,
      });
    }
  });

  avoids.forEach(avoid => {
    const hit = ingredients.find(ing => ing.includes(avoid));
    if (hit) {
      cautionFlags.push({
        severity: SEVERITY.PREFERENCE,
        flag:     avoid,
        message:  `Contains an item you typically avoid (${avoid}).`,
      });
    }
  });

  return {
    safe_to_display:    blockedReasons.length === 0,
    can_be_best_match:  blockedReasons.length === 0 && cautionFlags.filter(f => f.severity === SEVERITY.ALLERGY).length === 0,
    caution_flags:      cautionFlags,
    blocked_reasons:    blockedReasons,
    disclaimer_required: true,
    disclaimer:         REQUIRED_DISCLAIMER,
    scrub_id:           'scrub_' + Date.now(),
  };
}

/**
 * Quick check — returns true if the option passes basic safety.
 * Use this for filtering lists before calling the full scrub.
 */
function quickPass(option, userProfile = {}) {
  const result = runSafetyScrub(option, userProfile);
  return result.safe_to_display;
}

/**
 * Filter an array of options against user profile.
 * Returns { safe: [], needsReview: [], blocked: [] }
 */
function scrubOptionList(options = [], userProfile = {}) {
  const safe        = [];
  const needsReview = [];
  const blocked     = [];

  options.forEach(option => {
    const result = runSafetyScrub(option, userProfile);
    if (!result.safe_to_display) {
      blocked.push({ ...option, scrub_result: result });
    } else if (result.caution_flags.length > 0) {
      needsReview.push({ ...option, scrub_result: result });
    } else {
      safe.push({ ...option, scrub_result: result });
    }
  });

  return { safe, needsReview, blocked, disclaimer: REQUIRED_DISCLAIMER };
}

function normalise(arr) {
  return arr.map(s => (s || '').toLowerCase().trim()).filter(Boolean);
}

module.exports = {
  REQUIRED_DISCLAIMER,
  SEVERITY,
  runSafetyScrub,
  quickPass,
  scrubOptionList,
};
