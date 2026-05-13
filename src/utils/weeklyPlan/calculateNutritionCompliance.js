/**
 * Nutrition compliance scoring for WeeklyDinnerPlanScreen.
 *
 * Score breakdown (0–100 total):
 *  - goal_match_score:        40 pts max  (user goals matched by meal goal_tags)
 *  - budget_fit_score:        20 pts max  (per-serving cost; under 700 cents = full)
 *  - nutrition_filter_score:  25 pts max  (protein >= target, calories in range)
 *  - time_fit_score:          10 pts max  (prep time)
 *  - preference_safety_score:  5 pts      (no allergy flags)
 *
 * Labels:
 *  90–100 = 'Best Match'
 *  75–89  = 'Strong Match'
 *  60–74  = 'Good Match'
 *  below 60 = 'Needs Review'
 */

var GOAL_TAG_MAP = {
  high_protein: 'protein',
  budget: 'budget',
  quick_meals: 'quick',
  family: 'family',
  protein: 'protein',
  quick: 'quick',
};

function normalizeGoal(goal) {
  return GOAL_TAG_MAP[goal] || goal;
}

function goalMatchScore(meal, userProfile) {
  var userGoals = (userProfile.selected_goals || []).map(normalizeGoal);
  var mealTags = meal.goal_tags || [];
  if (userGoals.length === 0) return 20;
  var matched = mealTags.filter(function (tag) {
    return userGoals.indexOf(tag) !== -1;
  });
  return Math.round((matched.length / userGoals.length) * 40);
}

function budgetFitScore(meal) {
  var perServing = meal.estimated_per_serving_cents || 0;
  if (perServing <= 100) return 20;
  if (perServing <= 200) return 18;
  if (perServing <= 350) return 15;
  if (perServing <= 500) return 12;
  if (perServing <= 700) return 20; // full points under 700
  if (perServing <= 900) return 10;
  return 6;
}

function nutritionFilterScore(meal, nutrition, userProfile) {
  if (!nutrition) return 12;
  var score = 0;
  var proteinTarget = userProfile.protein_target || 30;
  var calorieTarget = userProfile.calorie_target || '600-1000';

  // Protein check — 15 pts
  if (nutrition.estimated_protein_g >= proteinTarget) {
    score += 15;
  } else if (nutrition.estimated_protein_g >= proteinTarget * 0.7) {
    score += 8;
  } else {
    score += 3;
  }

  // Calorie range check — 10 pts
  var cal = nutrition.estimated_calories || 0;
  var parts = calorieTarget.split('-');
  var calMin = parseInt(parts[0], 10) || 0;
  var calMax = parseInt(parts[1], 10) || 9999;
  if (cal >= calMin && cal <= calMax) {
    score += 10;
  } else if (cal < calMin * 0.8 || cal > calMax * 1.2) {
    score += 2;
  } else {
    score += 5;
  }

  return Math.min(score, 25);
}

function timeFitScore(meal) {
  var prep = meal.prep_time_minutes || 30;
  if (prep < 15) return 10;
  if (prep < 30) return 7;
  if (prep < 45) return 5;
  return 3;
}

function preferenceSafetyScore(meal, userProfile) {
  var allergyFlags = userProfile.allergy_flags || [];
  if (allergyFlags.length === 0) return 5;
  // Basic check: if any allergy flag appears in meal name or description
  var mealText = ((meal.meal_name || '') + ' ' + (meal.meal_description || '')).toLowerCase();
  var hasConflict = allergyFlags.some(function (flag) {
    return mealText.indexOf(flag.toLowerCase()) !== -1;
  });
  return hasConflict ? 0 : 5;
}

function getMatchedGoals(meal, userProfile) {
  var userGoals = (userProfile.selected_goals || []).map(normalizeGoal);
  var mealTags = meal.goal_tags || [];
  return mealTags.filter(function (tag) {
    return userGoals.indexOf(tag) !== -1;
  });
}

function getWatchItems(meal, nutrition, userProfile) {
  var watch = [];
  if (!nutrition) return watch;
  if (nutrition.estimated_sodium_mg > 800) {
    watch.push('High sodium (' + nutrition.estimated_sodium_mg + 'mg estimated)');
  }
  if (nutrition.estimated_sugar_g > 20) {
    watch.push('Higher sugar (' + nutrition.estimated_sugar_g + 'g estimated)');
  }
  var proteinTarget = userProfile.protein_target || 30;
  if (nutrition.estimated_protein_g < proteinTarget) {
    watch.push('Protein below your target (' + nutrition.estimated_protein_g + 'g vs ' + proteinTarget + 'g)');
  }
  return watch;
}

export function scoreLabel(score) {
  if (score >= 90) return 'Best Match';
  if (score >= 75) return 'Strong Match';
  if (score >= 60) return 'Good Match';
  return 'Needs Review';
}

export function calculateNutritionCompliance(meal, nutrition, userProfile) {
  var profile = userProfile || {};
  var g = goalMatchScore(meal, profile);
  var b = budgetFitScore(meal);
  var n = nutritionFilterScore(meal, nutrition, profile);
  var t = timeFitScore(meal);
  var p = preferenceSafetyScore(meal, profile);

  var score = Math.min(100, g + b + n + t + p);
  var label = scoreLabel(score);
  var matchedGoals = getMatchedGoals(meal, profile);
  var watchItems = getWatchItems(meal, nutrition, profile);

  var reasonParts = [];
  if (matchedGoals.length > 0) {
    reasonParts.push('Matches your ' + matchedGoals.join(' and ') + ' goals');
  }
  if (g >= 30) {
    reasonParts.push('strong goal alignment');
  }
  if (n >= 20) {
    reasonParts.push('hits your nutrition targets');
  }
  if (t === 10) {
    reasonParts.push('ready in under 15 minutes');
  }
  var reasonText = reasonParts.length > 0
    ? reasonParts.join(', ') + '.'
    : 'Ranked based on your saved goals and nutrition preferences.';

  return {
    score: score,
    label: label,
    matched_goals: matchedGoals,
    watch_items: watchItems,
    reason_text: reasonText,
  };
}

export function sortByCompliance(meals, nutritionArray, userProfile) {
  var nutritionMap = {};
  (nutritionArray || []).forEach(function (n) {
    nutritionMap[n.meal_id] = n;
  });

  return meals.slice().sort(function (a, b) {
    var resultA = calculateNutritionCompliance(a, nutritionMap[a.meal_id], userProfile);
    var resultB = calculateNutritionCompliance(b, nutritionMap[b.meal_id], userProfile);
    return resultB.score - resultA.score;
  });
}
