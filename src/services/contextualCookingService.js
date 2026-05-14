/**
 * contextualCookingService.js
 *
 * Adjusts cooking instructions based on the user's chosen method.
 * For demo/beta: returns seeded instructions.
 * Real implementation: pass meal + method to an AI or recipe API.
 *
 * Safety note: always append cooking temperature disclaimer.
 */

const COOKING_METHODS = [
  { id: 'air_fryer',    label: 'Air Fryer',         icon: 'wind',         time_note: 'Saves 20–30% time vs oven' },
  { id: 'oven',         label: 'Oven',               icon: 'box',          time_note: 'Consistent results' },
  { id: 'stovetop',     label: 'Stovetop',           icon: 'thermometer',  time_note: 'Quickest for most proteins' },
  { id: 'grill',        label: 'Grill',              icon: 'sun',          time_note: 'Best flavor development' },
  { id: 'slow_cooker',  label: 'Slow Cooker',        icon: 'clock',        time_note: 'Set it and forget it' },
  { id: 'microwave',    label: 'Microwave-friendly', icon: 'zap',          time_note: 'Fastest option' },
  { id: 'low_effort',   label: 'Low Effort',         icon: 'minus-circle', time_note: 'Minimal prep required' },
];

const SAFETY_NOTE = 'Cooking times may vary by appliance. Always cook food to safe internal temperatures.';

const SEEDED_INSTRUCTIONS = {
  default: {
    air_fryer: [
      'Season protein with salt, pepper, and garlic powder.',
      'Air fry at 375F for 18-20 minutes, flipping halfway through.',
      'Warm pre-cooked grains in microwave for 90 seconds.',
      'Steam or microwave vegetables until tender, about 4-5 minutes.',
      'Slice protein, assemble bowls or plates, and serve.',
    ],
    oven: [
      'Preheat oven to 400F. Season protein and place on a lined baking sheet.',
      'Bake for 22-25 minutes or until fully cooked through.',
      'While protein bakes, cook grains on stovetop per package instructions.',
      'Roast vegetables alongside protein in the last 15 minutes.',
      'Rest protein for 3 minutes before slicing. Assemble and serve.',
    ],
    stovetop: [
      'Heat oil in a skillet over medium-high heat.',
      'Season and cook protein 5-7 minutes per side until done.',
      'Remove protein and rest. Cook vegetables in the same pan, 4-5 minutes.',
      'Warm pre-cooked grains separately.',
      'Assemble and serve immediately.',
    ],
    grill: [
      'Preheat grill to medium-high. Season protein with your preferred spices.',
      'Grill protein 5-6 minutes per side until fully cooked.',
      'Grill vegetables in a grill basket for 6-8 minutes.',
      'Warm grains separately.',
      'Rest protein, then slice. Plate and serve.',
    ],
    slow_cooker: [
      'Place protein in slow cooker. Add broth, garlic, and seasoning.',
      'Cook on low for 6-8 hours or high for 3-4 hours.',
      'Shred or slice protein when done.',
      'Prepare grains and vegetables separately before serving.',
      'Serve protein over grains with vegetables on the side.',
    ],
    microwave: [
      'Use pre-cooked or rotisserie protein if available to save time.',
      'Microwave protein at 70% power for 2-3 minutes if reheating.',
      'Microwave vegetables with a splash of water, covered, 3-4 minutes.',
      'Microwave grains per package instructions (usually 90 seconds).',
      'Assemble and serve. Drizzle with sauce if desired.',
    ],
    low_effort: [
      'Purchase pre-marinated or rotisserie protein from your store.',
      'Use frozen steam-in-bag vegetables for minimal prep.',
      'Use instant or microwaveable grains.',
      'Assemble directly from packaging. Minimal dishes required.',
      'Add a simple sauce or dressing to finish.',
    ],
  },
};

/**
 * Get adjusted cooking instructions for a meal and method.
 *
 * @param {object} meal   — meal object (needs meal_id, meal_name)
 * @param {string} method — cooking method id (e.g. 'air_fryer')
 * @returns {{ steps, method, safety_note, time_note, adjustment_id }}
 */
function adjustCookingInstructions(meal, method) {
  const steps = getSeededInstructions(meal?.meal_id, method);
  const methodMeta = COOKING_METHODS.find(m => m.id === method) || COOKING_METHODS[0];
  return {
    adjustment_id: 'adj_' + Date.now(),
    meal_id:       meal?.meal_id,
    meal_name:     meal?.meal_name || 'This meal',
    method,
    method_label:  methodMeta.label,
    steps,
    safety_note:   SAFETY_NOTE,
    time_note:     methodMeta.time_note,
    created_at:    new Date().toISOString(),
  };
}

/**
 * Return seeded instructions for a meal + method combo.
 * Falls back to default instructions for all methods.
 */
function getSeededInstructions(mealId, method) {
  const mealKey = mealId || 'default';
  const byMeal  = SEEDED_INSTRUCTIONS[mealKey] || SEEDED_INSTRUCTIONS.default;
  return byMeal[method] || byMeal.stovetop || SEEDED_INSTRUCTIONS.default.stovetop;
}

module.exports = {
  COOKING_METHODS,
  SAFETY_NOTE,
  adjustCookingInstructions,
  getSeededInstructions,
};
