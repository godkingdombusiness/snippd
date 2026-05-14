/**
 * portionIntelligenceService.js
 *
 * Prevents unrealistic serving logic (too little or too much food for
 * household size). This is the "No-Hallucination" guarantee for portions.
 *
 * Instead of abstract "1.5 lbs chicken", Snippd validates against actual
 * household size and available store package sizes.
 *
 * Applied to: WeeklyFoodPlanScreen, TodayRecommendationScreen,
 * CartBuilderScreen, NutritionComplianceTab.
 */

// Baseline protein grams per meal per person (conservative)
const PROTEIN_G_PER_PERSON = 120;

// Baseline calorie target per meal per person
const CALORIES_PER_PERSON = 550;

// Standard store package sizes (grams) — used for real-world anchoring
const STORE_PACKAGE_SIZES = {
  chicken_breast:  { label: 'Family Pack Chicken', grams: 1360, serves: 4, price_note: '$9.99 at Aldi' },
  ground_beef:     { label: 'Ground Beef 1lb',     grams: 454,  serves: 3, price_note: '$4.99 at Aldi' },
  salmon:          { label: 'Salmon Fillet 1lb',   grams: 454,  serves: 3, price_note: '$7.99 at Publix' },
  pasta:           { label: 'Pasta 1lb Box',        grams: 454,  serves: 8, price_note: '$1.29 at Aldi' },
  rice:            { label: 'Rice 2lb Bag',         grams: 908,  serves: 12,price_note: '$2.49 at Aldi' },
  eggs:            { label: 'Eggs 12ct',            grams: 600,  serves: 6, price_note: '$3.49 at Aldi' },
};

/**
 * Validate meal portions against household profile.
 *
 * @param {object} meal             — { meal_name, servings, protein_grams, calories_per_serving, ingredients }
 * @param {object} householdProfile — { household_size, adults, children, toddlers }
 * @returns {{ portion_status, recommended_adjustments, warning_message, store_anchor }}
 */
function validateMealPortions(meal, householdProfile = {}) {
  const {
    household_size = 2,
    adults         = 2,
    children       = 0,
    toddlers       = 0,
  } = householdProfile;

  const effectivePeople = adults + (children * 0.75) + (toddlers * 0.4);
  const totalPeople     = Math.max(household_size, effectivePeople);

  const mealServings       = meal.servings || 4;
  const proteinGrams       = meal.protein_grams || 0;
  const caloriesPerServing = meal.calories_per_serving || 0;

  const expectedProtein  = totalPeople * PROTEIN_G_PER_PERSON;
  const expectedCalories = totalPeople * CALORIES_PER_PERSON;

  const adjustments = [];
  let status        = 'adequate';
  let warning       = null;

  if (mealServings < totalPeople * 0.8) {
    status  = 'too_low';
    warning = `This may be too light for your household of ${household_size}. Want Snippd to increase portions?`;
    adjustments.push(`Increase servings to ${Math.ceil(totalPeople)} (currently ${mealServings})`);
  } else if (proteinGrams > 0 && proteinGrams < expectedProtein * 0.7) {
    status  = 'light';
    warning = `Protein may be light for your household. Consider adding a side.`;
    adjustments.push(`Add approximately ${Math.round(expectedProtein - proteinGrams)}g more protein`);
  } else if (mealServings > totalPeople * 1.5) {
    status  = 'too_high';
    adjustments.push(`This makes ${mealServings - Math.ceil(totalPeople)} extra servings — great for leftovers or lunch tomorrow.`);
  }

  const storeAnchor = getStoreAnchorForMeal(meal);

  return {
    portion_status:           status,
    recommended_adjustments:  adjustments,
    warning_message:          warning,
    store_anchor:             storeAnchor,
    effective_people:         Math.round(effectivePeople * 10) / 10,
    validation_id:            'pv_' + Date.now(),
  };
}

/**
 * Map meal ingredients to real store package sizes.
 * This is the "No-Hallucination" anchor — showing "Family Pack Chicken at
 * Aldi for $9.99" instead of abstract "1.5 lbs chicken breast".
 */
function getStoreAnchorForMeal(meal) {
  if (!meal || !meal.ingredients) return null;
  const ings = (meal.ingredients || []).map(i => i.toLowerCase());

  for (const [key, pkg] of Object.entries(STORE_PACKAGE_SIZES)) {
    const keyword = key.replace(/_/g, ' ');
    if (ings.some(i => i.includes(keyword.split('_')[0]))) {
      return {
        package_label: pkg.label,
        price_note:    pkg.price_note,
        serves:        pkg.serves,
        usage_note:    pkg.serves > 4 ? `Use half for tonight, save the rest for another meal.` : null,
      };
    }
  }
  return null;
}

/**
 * Batch validate a list of meals.
 */
function validateMealList(meals = [], householdProfile = {}) {
  return meals.map(meal => ({
    meal_id:    meal.meal_id,
    meal_name:  meal.meal_name,
    validation: validateMealPortions(meal, householdProfile),
  }));
}

module.exports = {
  STORE_PACKAGE_SIZES,
  validateMealPortions,
  getStoreAnchorForMeal,
  validateMealList,
};
