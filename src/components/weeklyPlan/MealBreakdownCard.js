import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatCents } from '../../utils/weeklyPlan/formatMoney';
import { getBestStoreForMeal } from '../../utils/weeklyPlan/getBestStoreForMeal';

var NAVY = '#172250';
var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var BORDER = '#E5E7EB';
var WHITE = '#FFFFFF';
var MINT = '#E8F5E9';

function MealBreakdownCard(props) {
  var meal = props.meal;
  var nutrition = props.nutrition;
  var stores = props.stores || [];

  var storeInfo = getBestStoreForMeal(meal, stores, {});
  var hasSavings = meal.estimated_savings_cents > 0;

  return (
    <View style={styles.card}>
      {/* Meal type label */}
      <Text style={styles.mealTypeLabel}>{(meal.meal_type || '').toUpperCase()}</Text>

      {/* Meal name */}
      <Text style={styles.mealName}>{meal.meal_name}</Text>

      {/* Cost + servings */}
      <Text style={styles.costText}>
        {formatCents(meal.estimated_total_cents) + ' for ' + (meal.servings || 4)}
      </Text>

      {/* Store */}
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Store</Text>
        <Text style={styles.infoValue}>{storeInfo.store_label}</Text>
      </View>

      {/* Savings */}
      {hasSavings && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Savings</Text>
          <Text style={styles.savingsValue}>{formatCents(meal.estimated_savings_cents)}</Text>
        </View>
      )}

      {/* Prep time */}
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Prep time</Text>
        <Text style={styles.infoValue}>{meal.prep_time_minutes + ' min'}</Text>
      </View>

      {/* Why picked */}
      {meal.why_picked ? (
        <View style={styles.whyBlock}>
          <Text style={styles.whyLabel}>Why this was picked</Text>
          <Text style={styles.whyText}>{meal.why_picked}</Text>
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.btnOutlineGreen} activeOpacity={0.75}>
          <Text style={styles.btnOutlineGreenText}>Add to Cart</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnOutlineGray} activeOpacity={0.75}>
          <Text style={styles.btnOutlineGrayText}>Swap Meal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

var styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  mealTypeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: GRAY,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  mealName: {
    fontSize: 18,
    fontWeight: '700',
    color: NAVY,
    marginBottom: 6,
  },
  costText: {
    fontSize: 15,
    fontWeight: '600',
    color: NAVY,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 13,
    color: GRAY,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '500',
    color: NAVY,
  },
  savingsValue: {
    fontSize: 13,
    fontWeight: '600',
    color: GREEN,
  },
  whyBlock: {
    backgroundColor: '#F9FAF5',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  whyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  whyText: {
    fontSize: 13,
    color: NAVY,
    lineHeight: 19,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  btnOutlineGreen: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnOutlineGreenText: {
    fontSize: 14,
    fontWeight: '600',
    color: GREEN,
  },
  btnOutlineGray: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnOutlineGrayText: {
    fontSize: 14,
    fontWeight: '500',
    color: GRAY,
  },
});

export default MealBreakdownCard;
