import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatCents } from '../../utils/weeklyPlan/formatMoney';
import { getBestStoreForMeal } from '../../utils/weeklyPlan/getBestStoreForMeal';

var NAVY = '#172250';
var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var BORDER = '#E5E7EB';
var WHITE = '#FFFFFF';
var CORAL = '#fb5b5b';
var MINT = '#E8F5E9';

var SCORE_COLORS = {
  'Best Match': '#0C9E54',
  'Strong Match': '#2D9E4F',
  'Good Match': '#E9A23B',
  'Needs Review': '#fb5b5b',
};

function NutritionComplianceCard(props) {
  var meal = props.meal;
  var nutrition = props.nutrition;
  var complianceResult = props.complianceResult;
  var onViewMeal = props.onViewMeal;
  var stores = props.stores || [];

  var score = complianceResult ? complianceResult.score : 0;
  var label = complianceResult ? complianceResult.label : '';
  var matchedGoals = complianceResult ? (complianceResult.matched_goals || []) : [];
  var watchItems = complianceResult ? (complianceResult.watch_items || []) : [];
  var reasonText = complianceResult ? complianceResult.reason_text : '';

  var scoreColor = SCORE_COLORS[label] || GREEN;
  var barPercent = Math.min(100, Math.max(0, score));

  var storeInfo = getBestStoreForMeal(meal, stores, {});

  return (
    <View style={styles.card}>
      {/* Meal name + meal type */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.mealTypeLabel}>{(meal.meal_type || '').toUpperCase()}</Text>
          <Text style={styles.mealName}>{meal.meal_name}</Text>
        </View>
        <View style={[styles.scoreBadge, { backgroundColor: scoreColor + '18' }]}>
          <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
        </View>
      </View>

      {/* Compliance bar */}
      <View style={styles.barContainer}>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: barPercent + '%', backgroundColor: scoreColor }]} />
        </View>
        <Text style={[styles.barLabel, { color: scoreColor }]}>{label}</Text>
      </View>

      {/* Matched goals */}
      {matchedGoals.length > 0 && (
        <View style={styles.matchedRow}>
          <Text style={styles.matchedTitle}>Matches</Text>
          <View style={styles.tagRow}>
            {matchedGoals.map(function (goal) {
              return (
                <View key={goal} style={styles.goalTag}>
                  <Text style={styles.goalTagText}>{goal}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Watch items */}
      {watchItems.length > 0 && (
        <View style={styles.watchBlock}>
          <Text style={styles.watchTitle}>Watch</Text>
          {watchItems.map(function (item, i) {
            return (
              <Text key={i} style={styles.watchItem}>{item}</Text>
            );
          })}
        </View>
      )}

      {/* Nutrition numbers */}
      {nutrition && (
        <View style={styles.nutritionRow}>
          <View style={styles.nutritionItem}>
            <Text style={styles.nutritionLabel}>Estimated Calories</Text>
            <Text style={styles.nutritionValue}>{nutrition.estimated_calories}</Text>
          </View>
          <View style={styles.nutritionDivider} />
          <View style={styles.nutritionItem}>
            <Text style={styles.nutritionLabel}>Protein</Text>
            <Text style={styles.nutritionValue}>{nutrition.estimated_protein_g + 'g'}</Text>
          </View>
        </View>
      )}

      {/* Cost + store */}
      <View style={styles.costRow}>
        <Text style={styles.costText}>{formatCents(meal.estimated_total_cents)}</Text>
        <Text style={styles.storeText}>{storeInfo.store_label}</Text>
      </View>

      {/* Why it ranks here */}
      {reasonText ? (
        <View style={styles.reasonBlock}>
          <Text style={styles.reasonLabel}>Why it ranks here</Text>
          <Text style={styles.reasonText}>{reasonText}</Text>
        </View>
      ) : null}

      {/* View Meal button */}
      <TouchableOpacity style={styles.viewBtn} onPress={onViewMeal} activeOpacity={0.75}>
        <Text style={styles.viewBtnText}>View Meal</Text>
      </TouchableOpacity>
    </View>
  );
}

var styles = StyleSheet.create({
  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerText: {
    flex: 1,
    marginRight: 8,
  },
  mealTypeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: GRAY,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  mealName: {
    fontSize: 16,
    fontWeight: '700',
    color: NAVY,
  },
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 18,
    fontWeight: '800',
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  barTrack: {
    flex: 1,
    height: 7,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 80,
    textAlign: 'right',
  },
  matchedRow: {
    marginBottom: 8,
  },
  matchedTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  goalTag: {
    backgroundColor: MINT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  goalTagText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0C9E54',
  },
  watchBlock: {
    backgroundColor: '#FFF5F5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  watchTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: CORAL,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  watchItem: {
    fontSize: 12,
    color: CORAL,
    marginBottom: 2,
  },
  nutritionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAF5',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  nutritionItem: {
    flex: 1,
    alignItems: 'center',
  },
  nutritionLabel: {
    fontSize: 10,
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  nutritionValue: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
  },
  nutritionDivider: {
    width: 1,
    height: 24,
    backgroundColor: BORDER,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  costText: {
    fontSize: 14,
    fontWeight: '600',
    color: NAVY,
  },
  storeText: {
    fontSize: 13,
    color: GRAY,
  },
  reasonBlock: {
    backgroundColor: '#F9FAF5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  reasonText: {
    fontSize: 13,
    color: NAVY,
    lineHeight: 18,
  },
  viewBtn: {
    borderWidth: 1.5,
    borderColor: '#0C9E54',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  viewBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0C9E54',
  },
});

export default NutritionComplianceCard;
