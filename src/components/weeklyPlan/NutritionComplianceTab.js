import React from 'react';
import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import NutritionFilterBar from './NutritionFilterBar';
import NutritionComplianceCard from './NutritionComplianceCard';
import { calculateNutritionCompliance, sortByCompliance } from '../../utils/weeklyPlan/calculateNutritionCompliance';

var NAVY = '#172250';
var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var BORDER = '#E5E7EB';
var WHITE = '#FFFFFF';
var CREAM = '#FAF8F1';
var CORAL = '#fb5b5b';

var FILTER_OPTIONS = [
  'All Goals',
  'High Protein',
  'Budget Meals',
  'Lower Sugar',
  'Lower Sodium',
  'Kid-Friendly',
  'Quick Meals',
  'Under 600 Cal',
  '800-1,000 Cal',
  '1,000+ Cal',
];

function applyCalorieFilter(meals, nutrition, filter) {
  if (filter === 'All Goals') return meals;

  var nutritionMap = {};
  (nutrition || []).forEach(function (n) {
    nutritionMap[n.meal_id] = n;
  });

  return meals.filter(function (meal) {
    var n = nutritionMap[meal.meal_id];
    var cal = n ? n.estimated_calories : 0;
    var protein = n ? n.estimated_protein_g : 0;
    var sodium = n ? n.estimated_sodium_mg : 0;
    var sugar = n ? n.estimated_sugar_g : 0;

    if (filter === 'Under 600 Cal') return cal < 600;
    if (filter === '800-1,000 Cal') return cal >= 800 && cal <= 1000;
    if (filter === '1,000+ Cal') return cal > 1000;
    if (filter === 'High Protein') return protein >= 30;
    if (filter === 'Lower Sodium') return sodium <= 600;
    if (filter === 'Lower Sugar') return sugar <= 10;
    if (filter === 'Quick Meals') return meal.prep_time_minutes <= 15;
    if (filter === 'Budget Meals') return meal.estimated_per_serving_cents <= 300;
    return true;
  });
}

function renderSection(sectionLabel, mealList, nutrition, userProfile, stores, navigation) {
  if (mealList.length === 0) return null;

  var nutritionMap = {};
  (nutrition || []).forEach(function (n) {
    nutritionMap[n.meal_id] = n;
  });

  return (
    <View key={sectionLabel} style={styles.section}>
      <Text style={styles.sectionTitle}>{sectionLabel}</Text>
      {mealList.map(function (meal) {
        var n = nutritionMap[meal.meal_id];
        var result = calculateNutritionCompliance(meal, n, userProfile);
        return (
          <NutritionComplianceCard
            key={meal.meal_id}
            meal={meal}
            nutrition={n}
            complianceResult={result}
            stores={stores}
            onViewMeal={function () {
              // Future: navigate to meal detail
            }}
          />
        );
      })}
    </View>
  );
}

function NutritionComplianceTab(props) {
  var meals = props.meals || [];
  var nutrition = props.nutrition || [];
  var userProfile = props.userProfile || {};
  var stores = props.stores || [];
  var navigation = props.navigation;

  var [activeFilter, setActiveFilter] = useState('All Goals');

  var nutritionMap = {};
  nutrition.forEach(function (n) {
    nutritionMap[n.meal_id] = n;
  });

  var filteredMeals = applyCalorieFilter(meals, nutrition, activeFilter);
  var sorted = sortByCompliance(filteredMeals, nutrition, userProfile);

  var bestMatches = sorted.filter(function (m) {
    var r = calculateNutritionCompliance(m, nutritionMap[m.meal_id], userProfile);
    return r.score >= 90;
  });
  var strongMatches = sorted.filter(function (m) {
    var r = calculateNutritionCompliance(m, nutritionMap[m.meal_id], userProfile);
    return r.score >= 75 && r.score < 90;
  });
  var goodMatches = sorted.filter(function (m) {
    var r = calculateNutritionCompliance(m, nutritionMap[m.meal_id], userProfile);
    return r.score >= 60 && r.score < 75;
  });
  var needsReview = sorted.filter(function (m) {
    var r = calculateNutritionCompliance(m, nutritionMap[m.meal_id], userProfile);
    return r.score < 60;
  });

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nutrition match</Text>
        <Text style={styles.headerSubtitle}>
          {'Meals ranked by how well they match your selected goals.'}
        </Text>
      </View>

      {/* Filter bar */}
      <View style={styles.filterWrap}>
        <NutritionFilterBar
          filters={FILTER_OPTIONS}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      </View>

      {/* Sections */}
      {renderSection('Best Matches', bestMatches, nutrition, userProfile, stores, navigation)}
      {renderSection('Strong Match', strongMatches, nutrition, userProfile, stores, navigation)}
      {renderSection('Good Match', goodMatches, nutrition, userProfile, stores, navigation)}
      {renderSection('Needs Review', needsReview, nutrition, userProfile, stores, navigation)}

      {sorted.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No meals match this filter.</Text>
        </View>
      )}

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          {'Nutrition estimates may vary by brand, serving size, and store availability. Not a medical guide.'}
        </Text>
      </View>

      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: CREAM,
  },
  content: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: NAVY,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: GRAY,
    lineHeight: 18,
  },
  filterWrap: {
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginBottom: 8,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: NAVY,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginBottom: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: GRAY,
  },
  disclaimer: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    backgroundColor: WHITE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  disclaimerText: {
    fontSize: 12,
    color: GRAY,
    lineHeight: 17,
    textAlign: 'center',
  },
  bottomPad: {
    height: 24,
  },
});

export default NutritionComplianceTab;
