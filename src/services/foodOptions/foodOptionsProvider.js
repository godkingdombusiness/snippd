/**
 * foodOptionsProvider.js
 *
 * Provider-agnostic orchestrator for Snippd's food decision layer.
 * Collects options from all sub-providers, runs them through the decision
 * engine, and returns a ranked list ready for TodayDecisionScreen.
 *
 * Rule: Snippd decides. Providers fulfill.
 *
 * Usage:
 *   const { rankOptions } = require('./foodOptionsProvider');
 *   const options = await rankOptions(userId, context);
 *   // options[0] is always the Snippd-recommended choice
 */

const { OPTION_TYPES, rankOptions: engineRank } = require('./decisionEngineService');
const { getPantryOption }    = require('./pantryProvider');
const { getGroceryOptions }  = require('./snippdGroceryProvider');
const { getUberEatsOptions } = require('./uberEatsProvider');

const ALL_OPTION_TYPES = Object.values(OPTION_TYPES);

/**
 * Build the ranked food options list for a user's current context.
 *
 * @param {string} userId
 * @param {object} context
 *   remainingBudgetCents  {number}
 *   weeklyBudgetCents     {number}
 *   householdSize         {number}
 *   cookingTimeMin        {number}
 *   foodGoals             {string[]}
 *   pantryCount           {number}
 *   hasKids               {boolean}
 *   preferenceStyle       {string}
 *   availableStores       {object[]}
 * @returns {Promise<Array<RankedOption>>}
 */
async function getFoodOptions(userId, context = {}) {
  // Run all providers in parallel. Each returns its options independently.
  // Uber Eats is filtered by its own SCORE_THRESHOLD internally.
  const [pantryOpt, groceryOpts, uberOpts] = await Promise.all([
    Promise.resolve(getPantryOption(context)),
    Promise.resolve(getGroceryOptions(context, context.availableStores || [])),
    Promise.resolve(getUberEatsOptions(context)),
  ]);

  // Collect which option types are available for this context
  const availableTypes = [];
  if (pantryOpt)                 availableTypes.push(OPTION_TYPES.COOK_FROM_PANTRY);
  availableTypes.push(OPTION_TYPES.QUICK_GROCERY_RUN);
  availableTypes.push(OPTION_TYPES.GROCERY_PICKUP);
  availableTypes.push(OPTION_TYPES.EAT_OUT_SMART);
  uberOpts.forEach(o => availableTypes.push(o.optionType));

  // Run through the decision engine to get final ranked list
  const ranked = engineRank(availableTypes, context);

  // Attach provider metadata to each ranked option
  return ranked.map(option => {
    if (option.optionType === OPTION_TYPES.COOK_FROM_PANTRY && pantryOpt) {
      return { ...option, providerMeta: pantryOpt };
    }
    const groceryMatch = groceryOpts.find(g => g.optionType === option.optionType);
    if (groceryMatch) {
      return { ...option, providerMeta: groceryMatch };
    }
    const uberMatch = uberOpts.find(u => u.optionType === option.optionType);
    if (uberMatch) {
      return { ...option, providerMeta: uberMatch };
    }
    return option;
  });
}

/**
 * Build context from a Supabase user profile row.
 * Falls back to sensible defaults so the engine always has something to work with.
 */
function buildContextFromProfile(profile = {}, cartData = {}) {
  return {
    remainingBudgetCents: cartData.remainingCents ?? (profile.weekly_budget ? Math.round(profile.weekly_budget * 100 * 0.6) : 8000),
    weeklyBudgetCents:    profile.weekly_budget   ? Math.round(profile.weekly_budget * 100) : 20000,
    householdSize:        profile.household_size  ?? 2,
    cookingTimeMin:       parseInt(profile.cooking_time ?? '30', 10),
    foodGoals:            Array.isArray(profile.food_goals) ? profile.food_goals : [],
    pantryCount:          profile.pantry_item_count ?? 5,
    hasKids:              profile.has_kids ?? false,
    preferenceStyle:      profile.stash_style === 'smart' ? 'saver' : profile.stash_style ?? 'saver',
    availableStores:      Array.isArray(profile.stores) ? profile.stores.map(s => ({ store_name: s })) : [],
  };
}

module.exports = { getFoodOptions, buildContextFromProfile, ALL_OPTION_TYPES };
