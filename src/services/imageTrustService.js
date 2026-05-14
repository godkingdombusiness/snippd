/**
 * imageTrustService.js
 *
 * Prevents misleading AI-generated images from being shown as proof
 * of what the user will buy. Always returns a verified image or a
 * neutral placeholder — never a random food photo that conflicts
 * with the actual ingredient list.
 *
 * UI copy when image is placeholder:
 * "Image is illustrative. Actual items may vary by store."
 */

const IMAGE_DISCLAIMER = 'Image is illustrative. Actual items may vary by store.';

const MEAL_TYPE_PLACEHOLDERS = {
  breakfast: { color: '#FEF3C7', icon: 'sun',       label: 'Breakfast' },
  lunch:     { color: '#EFF6FF', icon: 'coffee',    label: 'Lunch'     },
  dinner:    { color: '#E8F5E9', icon: 'moon',      label: 'Dinner'    },
  snack:     { color: '#FAF5FF', icon: 'star',      label: 'Snack'     },
  default:   { color: '#F9FAFB', icon: 'package',   label: 'Meal'      },
};

/**
 * Get a trusted image URI for a meal.
 * For demo: returns null (caller should use getFallbackMealIllustration).
 * For production: check a verified SKU image database.
 *
 * @param {object} meal
 * @returns {string|null} uri or null
 */
function getTrustedMealImage(meal) {
  if (!meal) return null;
  // Production: return meal.verified_image_uri if it comes from a
  // verified store product database, not an AI generation pipeline.
  return meal.verified_image_uri || null;
}

/**
 * Get a verified product image from store data.
 * Returns null if no verified image is available.
 */
function getStoreProductImage(product) {
  if (!product) return null;
  return product.product_image_uri || null;
}

/**
 * Return a safe illustrated placeholder for a meal type.
 * Use this whenever no verified image exists.
 */
function getFallbackMealIllustration(mealType) {
  const key     = (mealType || '').toLowerCase();
  const meta    = MEAL_TYPE_PLACEHOLDERS[key] || MEAL_TYPE_PLACEHOLDERS.default;
  return {
    type:        'illustration',
    color:       meta.color,
    icon:        meta.icon,
    label:       meta.label,
    disclaimer:  IMAGE_DISCLAIMER,
  };
}

/**
 * Validate that an image's metadata is consistent with the ingredient list.
 * For demo: always returns valid (no real CV comparison available).
 * For production: compare image classification tags against ingredient names.
 *
 * @param {object} imageMetadata — { tags: string[], source: string }
 * @param {string[]} ingredients
 * @returns {{ valid, conflicts, confidence }}
 */
function validateImageMatchesIngredients(imageMetadata, ingredients = []) {
  if (!imageMetadata || !imageMetadata.tags) {
    return { valid: false, conflicts: [], confidence: 0, reason: 'no_metadata' };
  }
  const tags   = (imageMetadata.tags || []).map(t => t.toLowerCase());
  const ings   = ingredients.map(i => i.toLowerCase());
  const conflicts = tags.filter(t => ings.some(i => !i.includes(t) && !t.includes(i)));
  return {
    valid:      conflicts.length === 0,
    conflicts,
    confidence: conflicts.length === 0 ? 1.0 : Math.max(0, 1 - conflicts.length * 0.25),
    disclaimer: IMAGE_DISCLAIMER,
  };
}

module.exports = {
  IMAGE_DISCLAIMER,
  getTrustedMealImage,
  getStoreProductImage,
  getFallbackMealIllustration,
  validateImageMatchesIngredients,
};
