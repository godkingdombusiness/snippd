/**
 * fatSecretNutritionService.js
 *
 * Frontend nutrition service. Never calls FatSecret directly — all requests
 * go through Snippd's Supabase Edge Functions. Falls back to seeded demo
 * data when the network is unavailable or the edge function fails.
 *
 * Snippd decides. Providers fulfill.
 */

import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Seeded fallback data — used when edge function is unreachable
// ---------------------------------------------------------------------------
var SEEDED_NUTRITION = {
  'Chicken Rice Bowls': {
    calories: 520,
    protein_g: 38,
    carbs_g: 45,
    fat_g: 14,
    sodium_mg: 680,
    sugar_g: 4,
    source: 'Estimated by Snippd demo data',
  },
  'Pasta with Garlic and Olive Oil': {
    calories: 480,
    protein_g: 14,
    carbs_g: 72,
    fat_g: 16,
    sodium_mg: 320,
    sugar_g: 3,
    source: 'Estimated by Snippd demo data',
  },
  'Egg Fried Rice': {
    calories: 420,
    protein_g: 18,
    carbs_g: 52,
    fat_g: 14,
    sodium_mg: 890,
    sugar_g: 6,
    source: 'Estimated by Snippd demo data',
  },
  default: {
    calories: 450,
    protein_g: 25,
    carbs_g: 40,
    fat_g: 15,
    sodium_mg: 600,
    sugar_g: 5,
    source: 'Estimated by Snippd demo data',
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search FatSecret food database by name.
 *
 * @param {string} query — food name or keyword
 * @returns {{ results: object[], source: string }}
 */
async function searchNutritionFood(query) {
  try {
    const { data, error } = await supabase.functions.invoke('fatsecret-search', {
      body: { query, max_results: 5 },
    });
    if (error) throw error;
    return data;
  } catch (_err) {
    return { results: [], source: 'unavailable' };
  }
}

/**
 * Fetch a specific FatSecret food item by its food_id.
 *
 * @param {string|number} foodId — FatSecret food_id
 * @returns {object|null} — food detail object, or null on failure
 */
async function getNutritionFood(foodId) {
  try {
    const { data, error } = await supabase.functions.invoke('fatsecret-get', {
      body: { food_id: foodId },
    });
    if (error) throw error;
    return data;
  } catch (_err) {
    return null;
  }
}

/**
 * Estimate nutrition for a named meal from its ingredient list.
 * Falls back to seeded demo data when the edge function fails.
 *
 * @param {string}   mealName    — e.g. "Chicken Rice Bowls"
 * @param {string[]} ingredients — ingredient names or descriptions
 * @returns {object} — nutrition object with `source` field
 */
async function estimateMealNutrition(mealName, ingredients) {
  try {
    const { data, error } = await supabase.functions.invoke('fatsecret-estimate', {
      body: { meal_name: mealName, ingredients },
    });
    if (error) throw error;
    return { ...data, source: 'FatSecret' };
  } catch (_err) {
    return SEEDED_NUTRITION[mealName] || SEEDED_NUTRITION['default'];
  }
}

/**
 * Check FatSecret provider health via edge function.
 *
 * @returns {object} — status object from edge function, or degraded fallback
 */
async function getNutritionProviderStatus() {
  try {
    const { data, error } = await supabase.functions.invoke('fatsecret-health', {
      body: {},
    });
    if (error) throw error;
    return data;
  } catch (_err) {
    return {
      status: 'unavailable',
      provider: 'FatSecret',
      message: 'Nutrition provider is currently unreachable. Seeded data in use.',
    };
  }
}

export {
  searchNutritionFood,
  getNutritionFood,
  estimateMealNutrition,
  getNutritionProviderStatus,
  SEEDED_NUTRITION,
};
