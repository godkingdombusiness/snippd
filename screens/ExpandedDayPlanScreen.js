import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import MealBreakdownCard from '../src/components/weeklyPlan/MealBreakdownCard';
import { formatCents } from '../src/utils/weeklyPlan/formatMoney';
import { SEEDED_NUTRITION } from '../src/utils/weeklyPlan/seededPlanData';

var CREAM = '#FAF8F1';
var NAVY = '#172250';
var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var WHITE = '#FFFFFF';
var BORDER = '#E5E7EB';

var MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

var MEAL_ORDER = { Breakfast: 0, Lunch: 1, Dinner: 2 };

function formatDayHeader(dayPlan) {
  if (!dayPlan) return '';
  var dateParts = (dayPlan.date || '').split('-');
  var month = dateParts[1] ? MONTH_NAMES[parseInt(dateParts[1], 10) - 1] : '';
  var day = dateParts[2] ? parseInt(dateParts[2], 10).toString() : '';
  return (dayPlan.day_of_week || '') + ', ' + month + ' ' + day;
}

function ExpandedDayPlanScreen(props) {
  var navigation = props.navigation;
  var params = props.route ? props.route.params : {};
  var dayPlan = params.dayPlan || {};
  var meals = params.meals || [];
  var stores = params.stores || [];

  var sortedMeals = meals.slice().sort(function (a, b) {
    var oa = MEAL_ORDER[a.meal_type] !== undefined ? MEAL_ORDER[a.meal_type] : 99;
    var ob = MEAL_ORDER[b.meal_type] !== undefined ? MEAL_ORDER[b.meal_type] : 99;
    return oa - ob;
  });

  var nutritionMap = {};
  SEEDED_NUTRITION.forEach(function (n) {
    nutritionMap[n.meal_id] = n;
  });

  var mealCount = sortedMeals.length;
  var householdSize = 4;
  var hasSavings = dayPlan.daily_savings_cents > 0;

  function handleBack() {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{formatDayHeader(dayPlan)}</Text>
        <View style={styles.navPlaceholder} />
      </View>

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Daily Total</Text>
          <Text style={styles.summaryValue}>{formatCents(dayPlan.daily_total_cents)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Meals</Text>
          <Text style={styles.summaryValue}>{mealCount}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Feeds</Text>
          <Text style={styles.summaryValue}>{householdSize}</Text>
        </View>
        {hasSavings && (
          <>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Save</Text>
              <Text style={[styles.summaryValue, styles.savingsValue]}>
                {formatCents(dayPlan.daily_savings_cents)}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Meal cards scroll */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {sortedMeals.map(function (meal) {
          return (
            <MealBreakdownCard
              key={meal.meal_id}
              meal={meal}
              nutrition={nutritionMap[meal.meal_id] || null}
              stores={stores}
            />
          );
        })}

        {/* CTA buttons */}
        <View style={styles.ctaSection}>
          <TouchableOpacity style={styles.ctaPrimary} activeOpacity={0.8}>
            <Text style={styles.ctaPrimaryText}>Add Today to Cart</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctaSecondary} activeOpacity={0.8}>
            <Text style={styles.ctaSecondaryText}>Swap a Meal</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CREAM,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CREAM,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: NAVY,
  },
  navPlaceholder: {
    width: 40,
  },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
  },
  savingsValue: {
    color: GREEN,
  },
  summaryDivider: {
    width: 1,
    height: 26,
    backgroundColor: BORDER,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  ctaSection: {
    gap: 10,
    marginTop: 8,
  },
  ctaPrimary: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
  },
  ctaSecondary: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: WHITE,
  },
  ctaSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: NAVY,
  },
  bottomPad: {
    height: 24,
  },
});

export default ExpandedDayPlanScreen;
