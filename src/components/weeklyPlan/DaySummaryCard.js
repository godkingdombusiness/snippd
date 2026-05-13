import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatCents } from '../../utils/weeklyPlan/formatMoney';
import { getBestStoreForDay } from '../../utils/weeklyPlan/getBestStoreForDay';

var NAVY = '#172250';
var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var BORDER = '#E5E7EB';
var WHITE = '#FFFFFF';
var MINT = '#E8F5E9';
var CORAL = '#fb5b5b';

var MEAL_ORDER = { Breakfast: 0, Lunch: 1, Dinner: 2 };

function DaySummaryCard(props) {
  var dayPlan = props.dayPlan;
  var meals = props.meals || [];
  var stores = props.stores || [];
  var onPress = props.onPress;

  var sortedMeals = meals.slice().sort(function (a, b) {
    var oa = MEAL_ORDER[a.meal_type] !== undefined ? MEAL_ORDER[a.meal_type] : 99;
    var ob = MEAL_ORDER[b.meal_type] !== undefined ? MEAL_ORDER[b.meal_type] : 99;
    return oa - ob;
  });

  var storeInfo = getBestStoreForDay(dayPlan, meals, stores);
  var hasSavings = dayPlan.daily_savings_cents > 0;

  // Format date: "2026-05-11" -> "May 11"
  var dateParts = (dayPlan.date || '').split('-');
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var monthLabel = dateParts[1] ? monthNames[parseInt(dateParts[1], 10) - 1] : '';
  var dayNum = dateParts[2] ? parseInt(dateParts[2], 10).toString() : '';
  var dateLabel = monthLabel + ' ' + dayNum;

  var displayMeals = sortedMeals.slice(0, 3);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.dayInfo}>
          <Text style={styles.dayOfWeek}>{(dayPlan.day_of_week || '').toUpperCase()}</Text>
          <Text style={styles.dateText}>{dateLabel}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.dailyTotal}>{formatCents(dayPlan.daily_total_cents)}</Text>
          {hasSavings && (
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsBadgeText}>
                {'-' + formatCents(dayPlan.daily_savings_cents)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Meal rows */}
      <View style={styles.mealsSection}>
        {displayMeals.map(function (meal) {
          return (
            <View key={meal.meal_id} style={styles.mealRow}>
              <Text style={styles.mealTypeLabel}>{meal.meal_type + ':'}</Text>
              <Text style={styles.mealName} numberOfLines={1}>{meal.meal_name}</Text>
            </View>
          );
        })}
      </View>

      {/* Store info */}
      <View style={styles.storeRow}>
        <View style={styles.storeInitialBadge}>
          <Text style={styles.storeInitialText}>
            {storeInfo.best_store ? storeInfo.best_store.store_initial : 'ST'}
          </Text>
        </View>
        <View style={styles.storeDetails}>
          <Text style={styles.bestStoreText}>
            {'Best store: ' + (storeInfo.best_store ? storeInfo.best_store.store_name : '')}
          </Text>
          {storeInfo.secondary_stores.length > 0 && (
            <Text style={styles.alsoUsesText}>
              {'Also uses: ' + storeInfo.secondary_stores.map(function (s) { return s.store_name; }).join(', ')}
            </Text>
          )}
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {hasSavings && (
          <Text style={styles.saveText}>{'Save ' + formatCents(dayPlan.daily_savings_cents) + ' today'}</Text>
        )}
        <Text style={styles.tapHint}>Tap to view meal breakdown</Text>
      </View>
    </TouchableOpacity>
  );
}

var styles = StyleSheet.create({
  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
    marginHorizontal: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  dayOfWeek: {
    fontSize: 15,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 14,
    color: GRAY,
    fontWeight: '400',
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  dailyTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: NAVY,
  },
  savingsBadge: {
    backgroundColor: '#E6F7EE',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  savingsBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: GREEN,
  },
  mealsSection: {
    marginBottom: 12,
    gap: 4,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mealTypeLabel: {
    fontSize: 13,
    color: GRAY,
    fontWeight: '500',
    minWidth: 68,
  },
  mealName: {
    fontSize: 13,
    color: NAVY,
    fontWeight: '500',
    flex: 1,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  storeInitialBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeInitialText: {
    fontSize: 10,
    fontWeight: '700',
    color: GREEN,
  },
  storeDetails: {
    flex: 1,
    gap: 2,
  },
  bestStoreText: {
    fontSize: 13,
    color: NAVY,
    fontWeight: '500',
  },
  alsoUsesText: {
    fontSize: 12,
    color: GRAY,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  saveText: {
    fontSize: 13,
    fontWeight: '600',
    color: GREEN,
  },
  tapHint: {
    fontSize: 12,
    color: GRAY,
  },
});

export default DaySummaryCard;
