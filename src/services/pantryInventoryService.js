/**
 * pantryInventoryService.js
 *
 * Manage the user's pantry — load from Supabase, add, remove, and confirm
 * items. Falls back to seeded demo data when Supabase is unavailable or
 * the table is empty.
 *
 * Also provides getMealOptionsFromPantry() — a pure function that matches
 * pantry contents against known meal templates without any DB call.
 *
 * Snippd decides. Providers fulfill.
 */

import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Seeded fallback pantry items
// ---------------------------------------------------------------------------
var SEEDED_ITEMS = [
  { id: 'p1', item_name: 'White rice',      quantity: '2 cups',           confidence: 'confirmed',    category: 'Grains'   },
  { id: 'p2', item_name: 'Broccoli',        quantity: '2 cups',           confidence: 'confirmed',    category: 'Produce'  },
  { id: 'p3', item_name: 'Eggs',            quantity: '6',                confidence: 'confirmed',    category: 'Protein'  },
  { id: 'p4', item_name: 'Pasta',           quantity: '1 box',            confidence: 'confirmed',    category: 'Grains'   },
  { id: 'p5', item_name: 'Garlic',          quantity: 'several cloves',   confidence: 'likely',       category: 'Produce'  },
  { id: 'p6', item_name: 'Olive oil',       quantity: 'partial bottle',   confidence: 'likely',       category: 'Pantry'   },
  { id: 'p7', item_name: 'Soy sauce',       quantity: 'partial bottle',   confidence: 'likely',       category: 'Pantry'   },
  { id: 'p8', item_name: 'Canned tomatoes', quantity: '1 can',            confidence: 'needs_review', category: 'Pantry'   },
];

// ---------------------------------------------------------------------------
// Seeded meal templates for getMealOptionsFromPantry()
// Each entry lists required items and nice-to-have items.
// ---------------------------------------------------------------------------
var MEAL_TEMPLATES = [
  {
    meal_id:      'meal_chicken_rice',
    meal_name:    'Chicken Rice Bowls',
    required:     ['White rice'],
    nice_to_have: ['Soy sauce', 'Garlic', 'Broccoli'],
  },
  {
    meal_id:      'meal_pasta_garlic',
    meal_name:    'Pasta with Garlic and Olive Oil',
    required:     ['Pasta', 'Garlic', 'Olive oil'],
    nice_to_have: ['Canned tomatoes'],
  },
  {
    meal_id:      'meal_egg_fried_rice',
    meal_name:    'Egg Fried Rice',
    required:     ['White rice', 'Eggs'],
    nice_to_have: ['Soy sauce', 'Garlic', 'Broccoli'],
  },
  {
    meal_id:      'meal_pasta_tomato',
    meal_name:    'Pasta with Tomato Sauce',
    required:     ['Pasta', 'Canned tomatoes'],
    nice_to_have: ['Garlic', 'Olive oil'],
  },
  {
    meal_id:      'meal_scrambled_eggs',
    meal_name:    'Scrambled Eggs',
    required:     ['Eggs'],
    nice_to_have: ['Garlic'],
  },
];

// ---------------------------------------------------------------------------
// Public API — Supabase-backed
// ---------------------------------------------------------------------------

/**
 * Load pantry items for a user from Supabase.
 * Falls back to seeded data on error or if the pantry is empty.
 *
 * @param {string} userId
 * @returns {object[]}
 */
async function getPantryItems(userId) {
  try {
    const { data, error } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return SEEDED_ITEMS;
    return data;
  } catch (_err) {
    return SEEDED_ITEMS;
  }
}

/**
 * Add or upsert a pantry item for a user.
 *
 * @param {string} userId
 * @param {object} item — { item_name, quantity, category, confidence? }
 * @returns {object|null} — the upserted row, or null on failure
 */
async function addPantryItem(userId, item) {
  try {
    const payload = {
      user_id:    userId,
      item_name:  item.item_name,
      quantity:   item.quantity   ?? null,
      category:   item.category   ?? 'Pantry',
      confidence: item.confidence ?? 'needs_review',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('pantry_items')
      .upsert(payload, { onConflict: 'user_id,item_name' })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (_err) {
    return null;
  }
}

/**
 * Remove a pantry item for a user.
 *
 * @param {string} userId
 * @param {string} itemId
 * @returns {boolean} — true on success, false on failure
 */
async function removePantryItem(userId, itemId) {
  try {
    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Mark a pantry item as 'confirmed'.
 *
 * @param {string} userId
 * @param {string} itemId
 * @returns {object|null} — updated row, or null on failure
 */
async function confirmPantryItem(userId, itemId) {
  try {
    const { data, error } = await supabase
      .from('pantry_items')
      .update({ confidence: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (_err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pure function — no DB call
// ---------------------------------------------------------------------------

/**
 * Match available pantry items against meal templates and return which meals
 * the user can make (fully or partially) from what they have.
 *
 * @param {object[]} pantryItems — array of pantry item objects (must have item_name)
 * @returns {Array<{
 *   meal_id: string,
 *   meal_name: string,
 *   have_items: string[],
 *   missing_items: string[],
 *   score: number,        // 0–100, higher = more covered
 * }>}
 */
function getMealOptionsFromPantry(pantryItems) {
  const pantryNames = new Set(
    (pantryItems || []).map(p => (p.item_name || '').trim().toLowerCase())
  );

  return MEAL_TEMPLATES
    .map(template => {
      const have_required = template.required.filter(
        r => pantryNames.has(r.toLowerCase())
      );
      const missing_required = template.required.filter(
        r => !pantryNames.has(r.toLowerCase())
      );
      const have_optional = template.nice_to_have.filter(
        r => pantryNames.has(r.toLowerCase())
      );

      // Must have all required items to be a viable option
      if (missing_required.length > 0) {
        return null;
      }

      const totalItems = template.required.length + template.nice_to_have.length;
      const haveCount  = have_required.length + have_optional.length;
      const score      = totalItems > 0 ? Math.round((haveCount / totalItems) * 100) : 0;

      return {
        meal_id:       template.meal_id,
        meal_name:     template.meal_name,
        have_items:    [...have_required, ...have_optional],
        missing_items: template.nice_to_have.filter(
          r => !pantryNames.has(r.toLowerCase())
        ),
        score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

export {
  getPantryItems,
  addPantryItem,
  removePantryItem,
  confirmPantryItem,
  getMealOptionsFromPantry,
  SEEDED_ITEMS,
};
