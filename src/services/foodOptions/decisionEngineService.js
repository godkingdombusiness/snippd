/**
 * decisionEngineService.js
 *
 * Core food decision ranking engine. Scores each option 0-100 across six
 * independent factors. Providers must call rankOptions() before surfacing
 * any fulfillment option to the user.
 *
 * Snippd decides. Providers fulfill.
 */

const OPTION_TYPES = {
  COOK_FROM_PANTRY:  'cook_from_pantry',
  QUICK_GROCERY_RUN: 'quick_grocery_run',
  GROCERY_PICKUP:    'grocery_pickup',
  UBER_EATS_PICKUP:  'uber_eats_pickup',
  UBER_EATS_DELIVERY:'uber_eats_delivery',
  EAT_OUT_SMART:     'eat_out_smart',
};

// Scoring weights — must sum to 100
const WEIGHTS = {
  budget_fit:       25,
  time_fit:         20,
  nutrition_fit:    20,
  pantry_fit:       15,
  household_fit:    10,
  preference_score: 10,
};

// Estimated cost multiplier vs baseline weekly grocery cost per person per day
const COST_MULTIPLIER = {
  cook_from_pantry:   0.0,   // uses existing pantry, no new spend
  quick_grocery_run:  0.25,  // partial shop
  grocery_pickup:     0.30,  // similar to quick run + pickup fee
  uber_eats_pickup:   0.55,  // restaurant markup
  uber_eats_delivery: 0.80,  // restaurant + delivery fee + tip
  eat_out_smart:      0.60,  // sit-down or fast casual
};

// Estimated total-time-to-eat (minutes) per option
const TIME_TO_EAT = {
  cook_from_pantry:   45,
  quick_grocery_run:  60,
  grocery_pickup:     50,
  uber_eats_pickup:   30,
  uber_eats_delivery: 50,
  eat_out_smart:      60,
};

/**
 * Score a single option against the user's current context.
 *
 * @param {string} optionType — one of OPTION_TYPES values
 * @param {object} context
 *   remainingBudgetCents  {number} — what's left this week
 *   weeklyBudgetCents     {number} — total weekly budget
 *   householdSize         {number} — number of people
 *   cookingTimeMin        {number} — user's preferred cook time
 *   foodGoals             {string[]} — e.g. ['high-protein', 'lower-sugar']
 *   pantryCount           {number} — estimated pantry item count
 *   hasKids               {boolean}
 *   preferenceStyle       {string} — 'saver' | 'convenience' | 'explorer'
 * @returns {{ optionType, totalScore, factors }}
 */
function scoreOption(optionType, context) {
  const {
    remainingBudgetCents = 0,
    weeklyBudgetCents    = 20000,
    householdSize        = 2,
    cookingTimeMin       = 30,
    foodGoals            = [],
    pantryCount          = 0,
    hasKids              = false,
    preferenceStyle      = 'saver',
  } = context;

  const remainingPct = weeklyBudgetCents > 0
    ? remainingBudgetCents / weeklyBudgetCents
    : 0;

  // ── 1. Budget fit (0–25) ───────────────────────────────────────────────────
  // How well does the option cost fit within what's left?
  const estimatedCostCents = (weeklyBudgetCents / 7) * COST_MULTIPLIER[optionType];
  const budgetRatio = remainingBudgetCents > 0
    ? Math.min(1, (remainingBudgetCents - estimatedCostCents) / remainingBudgetCents)
    : 0;
  const budget_fit = Math.max(0, Math.round(budgetRatio * WEIGHTS.budget_fit));

  // ── 2. Time fit (0–20) ────────────────────────────────────────────────────
  // Does the option's time-to-eat fit the user's cooking time preference?
  const optionTime = TIME_TO_EAT[optionType];
  const timeDelta  = Math.abs(optionTime - cookingTimeMin);
  const time_fit   = Math.max(0, Math.round((1 - Math.min(timeDelta / 60, 1)) * WEIGHTS.time_fit));

  // ── 3. Nutrition fit (0–20) ───────────────────────────────────────────────
  // Cook-from-pantry and grocery options score higher for health goals;
  // delivery/delivery scores lower for sugar/sodium goals.
  const healthGoals    = ['high-protein', 'lower-sugar', 'lower-sodium', 'under-600-cal'];
  const hasHealthGoal  = foodGoals.some(g => healthGoals.includes(g));
  const NUTRITION_SCORE = {
    cook_from_pantry:   hasHealthGoal ? 1.0 : 0.8,
    quick_grocery_run:  hasHealthGoal ? 0.85 : 0.75,
    grocery_pickup:     hasHealthGoal ? 0.85 : 0.75,
    uber_eats_pickup:   hasHealthGoal ? 0.45 : 0.6,
    uber_eats_delivery: hasHealthGoal ? 0.35 : 0.55,
    eat_out_smart:      hasHealthGoal ? 0.4  : 0.65,
  };
  const nutrition_fit = Math.round(NUTRITION_SCORE[optionType] * WEIGHTS.nutrition_fit);

  // ── 4. Pantry fit (0–15) ──────────────────────────────────────────────────
  // Cook-from-pantry benefits most; grocery options benefit moderately.
  const pantryScore = pantryCount >= 10 ? 1.0
    : pantryCount >= 5  ? 0.7
    : pantryCount >= 2  ? 0.4
    : 0.1;
  const PANTRY_WEIGHT = {
    cook_from_pantry:   1.0,
    quick_grocery_run:  0.5,
    grocery_pickup:     0.4,
    uber_eats_pickup:   0.1,
    uber_eats_delivery: 0.0,
    eat_out_smart:      0.05,
  };
  const pantry_fit = Math.round(pantryScore * PANTRY_WEIGHT[optionType] * WEIGHTS.pantry_fit);

  // ── 5. Household fit (0–10) ───────────────────────────────────────────────
  // Larger households favor cooking; delivery costs scale poorly.
  const HOUSEHOLD_SCORE = {
    cook_from_pantry:   householdSize >= 3 ? 1.0 : 0.8,
    quick_grocery_run:  0.85,
    grocery_pickup:     0.9,
    uber_eats_pickup:   householdSize >= 4 ? 0.4 : 0.7,
    uber_eats_delivery: householdSize >= 4 ? 0.3 : 0.6,
    eat_out_smart:      hasKids ? 0.5 : 0.75,
  };
  const household_fit = Math.round(HOUSEHOLD_SCORE[optionType] * WEIGHTS.household_fit);

  // ── 6. Preference score (0–10) ────────────────────────────────────────────
  const PREF_SCORE = {
    saver: {
      cook_from_pantry:   1.0,
      quick_grocery_run:  0.85,
      grocery_pickup:     0.75,
      uber_eats_pickup:   0.35,
      uber_eats_delivery: 0.2,
      eat_out_smart:      0.4,
    },
    convenience: {
      cook_from_pantry:   0.5,
      quick_grocery_run:  0.7,
      grocery_pickup:     0.85,
      uber_eats_pickup:   0.9,
      uber_eats_delivery: 1.0,
      eat_out_smart:      0.75,
    },
    explorer: {
      cook_from_pantry:   0.65,
      quick_grocery_run:  0.75,
      grocery_pickup:     0.7,
      uber_eats_pickup:   0.75,
      uber_eats_delivery: 0.8,
      eat_out_smart:      1.0,
    },
  };
  const prefMap        = PREF_SCORE[preferenceStyle] || PREF_SCORE.saver;
  const preference_score = Math.round((prefMap[optionType] ?? 0.5) * WEIGHTS.preference_score);

  const totalScore = budget_fit + time_fit + nutrition_fit + pantry_fit + household_fit + preference_score;

  return {
    optionType,
    totalScore,
    factors: { budget_fit, time_fit, nutrition_fit, pantry_fit, household_fit, preference_score },
  };
}

/**
 * Rank a list of options by score, highest first.
 *
 * @param {string[]} optionTypes — subset of OPTION_TYPES values to score
 * @param {object}   context     — same shape as scoreOption context
 * @returns {Array<{ optionType, totalScore, factors, label, why }>}
 */
function rankOptions(optionTypes, context) {
  return optionTypes
    .map(type => {
      const result = scoreOption(type, context);
      return { ...result, ...getOptionMeta(type, result.totalScore) };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}

function getOptionMeta(optionType, score) {
  const labels = {
    cook_from_pantry:   'Cook from pantry',
    quick_grocery_run:  'Quick grocery run',
    grocery_pickup:     'Grocery pickup',
    uber_eats_pickup:   'Uber Eats pickup',
    uber_eats_delivery: 'Uber Eats delivery',
    eat_out_smart:      'Eat out smart',
  };
  const icons = {
    cook_from_pantry:   'home',
    quick_grocery_run:  'shopping-cart',
    grocery_pickup:     'package',
    uber_eats_pickup:   'map-pin',
    uber_eats_delivery: 'truck',
    eat_out_smart:      'star',
  };
  const whyMap = {
    cook_from_pantry:   'Uses what you have · Zero extra spend',
    quick_grocery_run:  'Fast shop · Budget-friendly',
    grocery_pickup:     'No browsing · Order ahead',
    uber_eats_pickup:   'Skip the wait · Ready in 20 min',
    uber_eats_delivery: 'Door-to-door · Premium cost',
    eat_out_smart:      'Budget-conscious dining options nearby',
  };
  return {
    label:       labels[optionType]  ?? optionType,
    icon:        icons[optionType]   ?? 'circle',
    why:         whyMap[optionType]  ?? '',
    scoreLabel:  score >= 75 ? 'Best fit' : score >= 60 ? 'Good fit' : score >= 45 ? 'Possible' : 'Not ideal',
    scoreColor:  score >= 75 ? '#0C9E54' : score >= 60 ? '#3B82F6' : score >= 45 ? '#F59E0B' : '#9CA3AF',
  };
}

module.exports = {
  OPTION_TYPES,
  WEIGHTS,
  scoreOption,
  rankOptions,
};
