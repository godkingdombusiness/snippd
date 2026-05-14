/**
 * pantryVisionService.js
 *
 * Pantry photo scan and ingredient detection.
 * For demo/beta: returns seeded results. Architecture is ready for real CV API.
 *
 * Real CV hookup: replace returnSeededPantryScan() body with API call to
 * Google Vision, AWS Rekognition, or a custom food-detection model.
 */

const { supabase } = require('../../lib/supabase');

const SEEDED_SCAN_RESULTS = [
  { item_id: 'pi_01', name: 'Rice',               confidence: 'Likely',      category: 'Grains',   perishable: false },
  { item_id: 'pi_02', name: 'Pasta',              confidence: 'Likely',      category: 'Grains',   perishable: false },
  { item_id: 'pi_03', name: 'Broccoli',           confidence: 'Maybe',       category: 'Produce',  perishable: true  },
  { item_id: 'pi_04', name: 'Eggs',               confidence: 'Likely',      category: 'Protein',  perishable: true  },
  { item_id: 'pi_05', name: 'Greek yogurt',       confidence: 'Maybe',       category: 'Dairy',    perishable: true  },
  { item_id: 'pi_06', name: 'Frozen vegetables',  confidence: 'Likely',      category: 'Produce',  perishable: false },
  { item_id: 'pi_07', name: 'Chicken broth',      confidence: 'Needs review',category: 'Pantry',   perishable: false },
  { item_id: 'pi_08', name: 'Tortillas',          confidence: 'Maybe',       category: 'Grains',   perishable: false },
];

const CONFIDENCE_ORDER = { 'Likely': 0, 'Maybe': 1, 'Needs review': 2 };

/**
 * Simulate scanning a pantry image. For demo, returns seeded results.
 * A real implementation would POST imageUri to a CV endpoint.
 *
 * @param {string} imageUri
 * @returns {Promise<{ pantry_scan_id, detected_items, scanned_at }>}
 */
async function scanPantryImage(imageUri) {
  await simulateDelay(1200);
  return {
    pantry_scan_id: 'scan_' + Date.now(),
    image_uri: imageUri || 'demo://pantry_scan',
    detected_items: [...SEEDED_SCAN_RESULTS].sort((a, b) =>
      CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]
    ),
    scanned_at: new Date().toISOString(),
    source: 'demo_seeded',
  };
}

/**
 * Return seeded pantry scan without requiring an image.
 */
function returnSeededPantryScan() {
  return {
    pantry_scan_id: 'scan_seeded_001',
    image_uri: null,
    detected_items: [...SEEDED_SCAN_RESULTS],
    scanned_at: new Date().toISOString(),
    source: 'demo_seeded',
  };
}

/**
 * Validate user-confirmed pantry items before syncing.
 * Strips duplicates, normalises names.
 */
function confirmPantryItems(items = []) {
  const seen = new Set();
  return items
    .filter(item => item && item.name && !seen.has(item.name.toLowerCase()) && seen.add(item.name.toLowerCase()))
    .map(item => ({
      ...item,
      user_confirmed: true,
      confirmed_at: new Date().toISOString(),
    }));
}

/**
 * Write confirmed pantry items to Supabase profiles.pantry_item_count
 * and optionally to a pantry_items table if it exists.
 */
async function syncPantryToProfile(userId, confirmedItems = []) {
  if (!userId || !confirmedItems.length) return { success: false, reason: 'no_data' };

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ pantry_item_count: confirmedItems.length })
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true, synced_count: confirmedItems.length };
  } catch (err) {
    console.warn('[pantryVisionService] syncPantryToProfile error:', err);
    return { success: false, reason: err.message };
  }
}

/**
 * Identify perishable items in a confirmed list — used by mealShiftService
 * to warn about waste risk when the week is shifted.
 */
function getPerishableItems(items = []) {
  return items.filter(item => item.perishable === true);
}

function simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  scanPantryImage,
  returnSeededPantryScan,
  confirmPantryItems,
  syncPantryToProfile,
  getPerishableItems,
  SEEDED_SCAN_RESULTS,
};
