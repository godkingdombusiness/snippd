/**
 * QuickGroceryRunScreen.js
 *
 * "Quick grocery run for tonight."
 * Shown when user picks "Quick grocery run" from TodayOptionsRanked.
 *
 * Flow:
 *   TodayOptionsRanked → QuickGroceryRun → ShoppingList
 *
 * Shows 3-4 seeded meal options that require ≤5 items from the store.
 * Each card shows: meal name, estimated cost, items needed, time, CTA.
 * Budget context is passed from TodayOptionsRanked via route params.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tracker } from '../src/lib/eventTracker';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var MINT   = '#E8F5E9';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var CORAL  = '#fb5b5b';
var AMBER  = '#F59E0B';

// ── Seeded meal options ───────────────────────────────────────────────────────

var QUICK_MEALS = [
  {
    id: 'qm1',
    name: 'Chicken stir fry',
    description: 'Simple, high protein, ready in 30 minutes.',
    items_needed: ['Chicken breast', 'Broccoli', 'Soy sauce'],
    items_count: 3,
    household_cost_cents_per_person: 425,
    total_cents_for_2: 850,
    time_label: '~30 min',
    goal_fit: 'High protein',
    budget_fit: 'under_budget',
  },
  {
    id: 'qm2',
    name: 'Pasta marinara',
    description: 'Crowd-pleasing comfort meal with minimal effort.',
    items_needed: ['Ground beef or turkey', 'Marinara sauce'],
    items_count: 2,
    household_cost_cents_per_person: 310,
    total_cents_for_2: 620,
    time_label: '~25 min',
    goal_fit: 'Budget-friendly',
    budget_fit: 'under_budget',
  },
  {
    id: 'qm3',
    name: 'Ground beef tacos',
    description: 'Fast, flexible, and easy to scale for any household.',
    items_needed: ['Ground beef', 'Taco shells', 'Shredded cheese', 'Salsa'],
    items_count: 4,
    household_cost_cents_per_person: 380,
    total_cents_for_2: 760,
    time_label: '~20 min',
    goal_fit: 'Kid-friendly',
    budget_fit: 'under_budget',
  },
  {
    id: 'qm4',
    name: 'Salmon with roasted veggies',
    description: 'Healthy and filling — pairs well with pantry rice or pasta.',
    items_needed: ['Salmon fillets', 'Zucchini', 'Lemon', 'Olive oil'],
    items_count: 4,
    household_cost_cents_per_person: 680,
    total_cents_for_2: 1360,
    time_label: '~35 min',
    goal_fit: 'Heart-healthy',
    budget_fit: 'moderate',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDollars(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function scaleCost(baseCentsForTwo, householdSize) {
  return Math.round(baseCentsForTwo * (householdSize / 2));
}

function budgetFitColor(fit) {
  if (fit === 'under_budget') return GREEN;
  if (fit === 'moderate')     return '#3B82F6';
  return AMBER;
}

function budgetFitLabel(fit) {
  if (fit === 'under_budget') return 'Under budget';
  if (fit === 'moderate')     return 'Moderate';
  return 'Watch budget';
}

// ── Module-scope components ───────────────────────────────────────────────────

function ContextPill(props) {
  return (
    <View style={styles.contextPill}>
      <Feather name={props.icon} size={12} color={GREEN} />
      <Text style={styles.contextPillText}>{props.label}</Text>
    </View>
  );
}

function ItemTag(props) {
  return (
    <View style={styles.itemTag}>
      <Text style={styles.itemTagText}>{props.text}</Text>
    </View>
  );
}

function MealCard(props) {
  var meal         = props.meal;
  var householdSize = props.householdSize || 2;
  var isTop        = props.isTop;
  var onPress      = props.onPress;

  var totalCents  = scaleCost(meal.total_cents_for_2, householdSize);
  var perPerson   = meal.household_cost_cents_per_person;
  var fitColor    = budgetFitColor(meal.budget_fit);
  var fitLabel    = budgetFitLabel(meal.budget_fit);

  return (
    <View style={[styles.card, isTop && styles.cardTop]}>

      {/* Top row */}
      <View style={styles.cardTopRow}>
        <View style={[styles.fitBadge, { backgroundColor: fitColor + '18', borderColor: fitColor + '44' }]}>
          <Text style={[styles.fitBadgeText, { color: fitColor }]}>{fitLabel}</Text>
        </View>
        {isTop && (
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommendedBadgeText}>Recommended</Text>
          </View>
        )}
      </View>

      {/* Name + description */}
      <Text style={[styles.mealName, isTop && styles.mealNameTop]}>{meal.name}</Text>
      <Text style={[styles.mealDesc, isTop && styles.mealDescTop]}>{meal.description}</Text>

      {/* Price */}
      <Text style={[styles.mealPrice, isTop && styles.mealPriceTop]}>
        {'~' + formatDollars(totalCents) + ' total'}
      </Text>
      <Text style={[styles.mealPerPerson, isTop && styles.mealPerPersonTop]}>
        {'~' + formatDollars(perPerson) + ' per person · ' + meal.time_label}
      </Text>

      {/* Items needed */}
      <View style={styles.itemsRow}>
        <Text style={[styles.itemsLabel, isTop && styles.itemsLabelTop]}>
          {meal.items_count + ' item' + (meal.items_count !== 1 ? 's' : '') + ' from the store:'}
        </Text>
        <View style={styles.itemTagRow}>
          {meal.items_needed.map(function (item) {
            return <ItemTag key={item} text={item} />;
          })}
        </View>
      </View>

      {/* Goal fit */}
      <View style={styles.goalRow}>
        <Feather name="target" size={12} color={isTop ? 'rgba(255,255,255,0.65)' : GRAY} />
        <Text style={[styles.goalText, isTop && styles.goalTextTop]}>{meal.goal_fit}</Text>
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={[styles.ctaBtn, isTop ? styles.ctaBtnTop : styles.ctaBtnOther]}
        onPress={onPress}
        activeOpacity={0.82}
      >
        <Feather
          name="shopping-cart"
          size={15}
          color={isTop ? GREEN : GREEN}
        />
        <Text style={[styles.ctaBtnText, isTop ? styles.ctaBtnTextTop : styles.ctaBtnTextOther]}>
          Build quick cart
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function QuickGroceryRunScreen(props) {
  var navigation = props.navigation;
  var route      = props.route;
  var params     = (route && route.params) || {};
  var context    = params.context || {};

  var remainingBudgetCents = context.remainingBudgetCents || 12000;
  var householdSize        = context.householdSize        || 2;
  var todayGoal            = context.todayGoal            || null;

  useEffect(function () {
    tracker.track('quick_grocery_run_viewed', {
      remaining_budget_cents: remainingBudgetCents,
      household_size:         householdSize,
    });
  }, []);

  function handleMealPress(meal) {
    tracker.track('quick_grocery_meal_selected', {
      meal_id:   meal.id,
      meal_name: meal.name,
    });

    // Build a shopping list item set for this meal
    var listItems = meal.items_needed.map(function (item) {
      return { name: item, checked: false };
    });

    navigation.navigate('ShoppingList', {
      prefillItems: listItems,
      mealName:     meal.name,
      sourceScreen: 'QuickGroceryRun',
    });
  }

  function handleSeeWeeklyPlan() {
    navigation.navigate('WeeklyDinnerPlan');
  }

  function handleBack() {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainApp');
    }
  }

  // Sort meals: recommended first (cheapest per person for household)
  var sorted = QUICK_MEALS.slice().sort(function (a, b) {
    return scaleCost(a.total_cents_for_2, householdSize) - scaleCost(b.total_cents_for_2, householdSize);
  });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Context pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
          contentContainerStyle={styles.pillScrollContent}
        >
          <ContextPill icon="dollar-sign" label={'$' + Math.round(remainingBudgetCents / 100) + ' remaining'} />
          <ContextPill icon="users"       label={householdSize + (householdSize === 1 ? ' person' : ' people')} />
          <ContextPill icon="clock"       label="~60 min total" />
          <ContextPill icon="shopping-bag" label="5 items or less" />
        </ScrollView>

        {/* Headline */}
        <Text style={styles.headline}>Quick grocery run.</Text>
        <Text style={styles.sub}>
          Get dinner on the table tonight with a short stop at the store. These options need 5 items or less.
        </Text>

        {/* Meal cards */}
        <View style={styles.cardList}>
          {sorted.map(function (meal, idx) {
            return (
              <MealCard
                key={meal.id}
                meal={meal}
                isTop={idx === 0}
                householdSize={householdSize}
                onPress={function () { handleMealPress(meal); }}
              />
            );
          })}
        </View>

        {/* See full week plan */}
        <TouchableOpacity style={styles.weekPlanRow} onPress={handleSeeWeeklyPlan} activeOpacity={0.8}>
          <View style={styles.weekPlanLeft}>
            <Feather name="calendar" size={18} color={GREEN} />
            <View>
              <Text style={styles.weekPlanTitle}>See your full week plan</Text>
              <Text style={styles.weekPlanSub}>Budget-optimized meals, grouped by day and store</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={18} color={GRAY} />
        </TouchableOpacity>

        {/* Snippd insight */}
        <View style={styles.stash}>
          <View style={styles.stashBubble}>
            <Text style={styles.stashBubbleText}>S</Text>
          </View>
          <Text style={styles.stashText}>
            Quick run options are matched to your remaining budget and household size. Items shown are estimated — prices vary by store.
          </Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: CREAM },
  scroll:      { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  backBtn: {
    alignSelf:    'flex-start',
    padding:      20,
    paddingBottom: 8,
  },

  // Context pills
  pillScroll:        { flexGrow: 0, marginBottom: 20 },
  pillScrollContent: { paddingHorizontal: 20, gap: 8 },
  contextPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             5,
    backgroundColor: MINT,
    borderRadius:    20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth:     1,
    borderColor:     '#C8E6C9',
    marginRight:     8,
  },
  contextPillText: { fontSize: 12, fontWeight: '700', color: GREEN },

  // Headline
  headline: {
    fontSize:      26,
    fontWeight:    '800',
    color:         NAVY,
    letterSpacing: -0.5,
    lineHeight:    32,
    paddingHorizontal: 20,
    marginBottom:  8,
  },
  sub: {
    fontSize:  14,
    color:     GRAY,
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 24,
  },

  // Meal cards
  cardList: { paddingHorizontal: 20, gap: 12, marginBottom: 20 },

  card: {
    backgroundColor: WHITE,
    borderRadius:    22,
    padding:         18,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       2,
    borderWidth:     1,
    borderColor:     BORDER,
  },
  cardTop: {
    backgroundColor: GREEN,
    borderColor:     GREEN,
  },

  // Card top row (badges)
  cardTopRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  12,
    flexWrap:      'wrap',
  },
  fitBadge: {
    borderRadius:      20,
    paddingHorizontal: 9,
    paddingVertical:   3,
    borderWidth:       1,
  },
  fitBadgeText: { fontSize: 10, fontWeight: '800' },
  recommendedBadge: {
    borderRadius:      20,
    paddingHorizontal: 9,
    paddingVertical:   3,
    backgroundColor:   'rgba(255,255,255,0.22)',
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.45)',
  },
  recommendedBadgeText: { fontSize: 10, fontWeight: '800', color: WHITE },

  // Meal name
  mealName:    { fontSize: 18, fontWeight: '800', color: NAVY,  marginBottom: 4 },
  mealNameTop: { color: WHITE },
  mealDesc:    { fontSize: 13, color: GRAY,  lineHeight: 18, marginBottom: 12 },
  mealDescTop: { color: 'rgba(255,255,255,0.8)' },

  // Price
  mealPrice:      { fontSize: 22, fontWeight: '800', color: NAVY,  marginBottom: 2 },
  mealPriceTop:   { color: WHITE },
  mealPerPerson:  { fontSize: 13, color: GRAY,  marginBottom: 14 },
  mealPerPersonTop: { color: 'rgba(255,255,255,0.75)' },

  // Items needed
  itemsRow:   { marginBottom: 10 },
  itemsLabel: { fontSize: 11, fontWeight: '700', color: GRAY,  textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  itemsLabelTop: { color: 'rgba(255,255,255,0.65)' },
  itemTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  itemTag: {
    backgroundColor: '#F3F4F6',
    borderRadius:    8,
    paddingHorizontal: 8,
    paddingVertical:   4,
  },
  itemTagText: { fontSize: 12, fontWeight: '600', color: NAVY },

  // Goal row
  goalRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    marginBottom:  14,
  },
  goalText:    { fontSize: 12, color: GRAY },
  goalTextTop: { color: 'rgba(255,255,255,0.65)' },

  // CTA button
  ctaBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    borderRadius:    12,
    paddingVertical: 13,
  },
  ctaBtnTop: {
    backgroundColor: WHITE,
  },
  ctaBtnOther: {
    borderWidth:  1.5,
    borderColor:  GREEN,
  },
  ctaBtnText:      { fontSize: 14, fontWeight: '700' },
  ctaBtnTextTop:   { color: GREEN },
  ctaBtnTextOther: { color: GREEN },

  // See weekly plan row
  weekPlanRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: WHITE,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     BORDER,
    padding:         16,
    marginHorizontal: 20,
    marginBottom:    20,
  },
  weekPlanLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  weekPlanTitle: { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 2 },
  weekPlanSub:   { fontSize: 12, color: GRAY, lineHeight: 16 },

  // Snippd insight
  stash: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
    backgroundColor: MINT,
    borderRadius:  16,
    padding:       16,
    marginHorizontal: 20,
    borderWidth:   1,
    borderColor:   '#C8E6C9',
  },
  stashBubble: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: GREEN,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  stashBubbleText: { color: WHITE, fontSize: 14, fontWeight: '900' },
  stashText: { flex: 1, fontSize: 13, color: NAVY, lineHeight: 20 },

  bottomSpacer: { height: 24 },
});
