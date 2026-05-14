import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tracker } from '../src/lib/eventTracker';

// ── Brand colors ──────────────────────────────────────────────────────────────

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var CORAL  = '#fb5b5b';

// ── Seeded meals ──────────────────────────────────────────────────────────────

var SEEDED_MEALS = [
  {
    id: 'pm001',
    meal_name: 'Chicken Rice Bowls',
    have_items: ['Rice', 'Broccoli', 'Garlic', 'Olive oil'],
    missing_items: [{ name: 'Chicken breast', estimated_cost_cents: 874 }],
    estimated_additional_cents: 874,
    prep_time_minutes: 30,
    servings: 4,
    score: 92,
  },
  {
    id: 'pm002',
    meal_name: 'Pasta with Garlic and Olive Oil',
    have_items: ['Pasta', 'Garlic', 'Olive oil'],
    missing_items: [],
    estimated_additional_cents: 0,
    prep_time_minutes: 20,
    servings: 4,
    score: 98,
  },
  {
    id: 'pm003',
    meal_name: 'Egg Fried Rice',
    have_items: ['Rice', 'Eggs', 'Garlic', 'Soy sauce'],
    missing_items: [{ name: 'Green onions', estimated_cost_cents: 150 }],
    estimated_additional_cents: 150,
    prep_time_minutes: 20,
    servings: 3,
    score: 88,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCents(cents) {
  if (cents == null) return '$0.00';
  return '$' + (cents / 100).toFixed(2);
}

function scoreBadgeColor(score) {
  if (score >= 90) return { bg: '#D1FAE5', text: GREEN };
  if (score >= 75) return { bg: '#FEF3C7', text: '#92400E' };
  return { bg: '#F3F4F6', text: GRAY };
}

// ── Module-scope render helpers ───────────────────────────────────────────────

function renderNavBar(navigation) {
  return (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={function() { navigation.goBack(); }} style={styles.backBtn} activeOpacity={0.7}>
        <Feather name="chevron-left" size={24} color={NAVY} />
      </TouchableOpacity>
      <Text style={styles.navTitle}>Meals from Your Pantry</Text>
      <View style={styles.navSpacer} />
    </View>
  );
}

function renderListHeader() {
  return (
    <View style={styles.headerBlock}>
      <Text style={styles.headline}>What can we make today?</Text>
      <Text style={styles.subText}>
        Snippd found meals you may be able to make or complete with a small add-on.
      </Text>
    </View>
  );
}

function renderEmptyState(navigation) {
  return (
    <View style={styles.emptyState}>
      <Feather name="inbox" size={44} color={BORDER} />
      <Text style={styles.emptyTitle}>Scan your pantry to see what Snippd can make.</Text>
      <TouchableOpacity
        style={styles.emptyBtn}
        activeOpacity={0.85}
        onPress={function() { navigation.navigate('PantryScan'); }}
      >
        <Text style={styles.emptyBtnText}>Scan Pantry</Text>
      </TouchableOpacity>
    </View>
  );
}

function MealOptionCard(meal, onViewMeal) {
  var badge = scoreBadgeColor(meal.score);
  var hasMissing = meal.missing_items && meal.missing_items.length > 0;
  var missingNames = hasMissing
    ? meal.missing_items.map(function(m) { return m.name; }).join(', ')
    : '';
  var addedCost = hasMissing
    ? fmtCents(meal.estimated_additional_cents)
    : null;

  return (
    <View style={styles.mealCard}>
      {/* Top row: name + score */}
      <View style={styles.mealCardHeader}>
        <Text style={styles.mealName} numberOfLines={2}>{meal.meal_name}</Text>
        <View style={[styles.scoreBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.scoreText, { color: badge.text }]}>{meal.score}</Text>
        </View>
      </View>

      {/* Have items */}
      <Text style={styles.haveLabel}>You have:</Text>
      <Text style={styles.haveItems}>{meal.have_items.join(', ')}</Text>

      {/* Missing items */}
      {hasMissing ? (
        <View style={styles.missingRow}>
          <Text style={styles.missingLabel}>Missing: </Text>
          <Text style={styles.missingNames}>{missingNames}</Text>
          <Text style={styles.missingCost}> ~{addedCost} added</Text>
        </View>
      ) : (
        <Text style={styles.noMissing}>No missing items</Text>
      )}

      {/* Meta row */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Feather name="clock" size={13} color={GRAY} />
          <Text style={styles.metaText}>{meal.prep_time_minutes} min</Text>
        </View>
        <View style={styles.metaItem}>
          <Feather name="users" size={13} color={GRAY} />
          <Text style={styles.metaText}>{meal.servings} servings</Text>
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={styles.viewMealBtn}
        activeOpacity={0.85}
        onPress={function() { onViewMeal(meal); }}
      >
        <Text style={styles.viewMealBtnText}>View Meal</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PantryCookOptionsScreen({ navigation, route }) {
  var params = route && route.params ? route.params : {};
  var pantryItems = params.pantryItems || [];
  var meals = SEEDED_MEALS;

  useEffect(function() {
    tracker.track('pantry_cook_options_viewed', { meal_count: meals.length });
  }, []);

  function handleViewMeal(meal) {
    navigation.navigate('ChefStashRecipe', {
      meal: {
        meal_id:   meal.id,
        meal_name: meal.meal_name,
        estimated_additional_cents: meal.estimated_additional_cents,
        servings:  meal.servings,
        prep_time_minutes: meal.prep_time_minutes,
      },
    });
  }

  var showEmpty = pantryItems.length === 0 && meals.length === 0;

  function renderItem(info) {
    return MealOptionCard(info.item, handleViewMeal);
  }

  function keyExtractor(item) {
    return item.id;
  }

  function renderListHeaderComponent() {
    return renderListHeader();
  }

  function renderListEmptyComponent() {
    return renderEmptyState(navigation);
  }

  if (showEmpty) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {renderNavBar(navigation)}
        {renderEmptyState(navigation)}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderNavBar(navigation)}
      <FlatList
        data={meals}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={renderListHeaderComponent}
        ListEmptyComponent={renderListEmptyComponent}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

var styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: CREAM },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },

  // NavBar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: NAVY },
  navSpacer: { width: 32 },

  // Header block
  headerBlock: { paddingTop: 20, paddingBottom: 14 },
  headline: { fontSize: 22, fontWeight: '800', color: NAVY, marginBottom: 6, lineHeight: 28 },
  subText: { fontSize: 14, color: GRAY, lineHeight: 20 },

  // Meal card
  mealCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  mealName: { flex: 1, fontSize: 16, fontWeight: '800', color: NAVY, lineHeight: 22 },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 38,
  },
  scoreText: { fontSize: 13, fontWeight: '800' },

  // Have / missing items
  haveLabel: { fontSize: 12, fontWeight: '700', color: GREEN, marginBottom: 2 },
  haveItems: { fontSize: 13, color: NAVY, marginBottom: 8, lineHeight: 18 },
  missingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8 },
  missingLabel: { fontSize: 12, fontWeight: '700', color: CORAL },
  missingNames: { fontSize: 13, color: CORAL },
  missingCost: { fontSize: 12, color: GRAY },
  noMissing: { fontSize: 13, color: GREEN, fontWeight: '700', marginBottom: 8 },

  // Meta row
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: GRAY, fontWeight: '600' },

  // View Meal CTA
  viewMealBtn: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  viewMealBtnText: { fontSize: 14, fontWeight: '800', color: WHITE },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, color: GRAY, textAlign: 'center', marginTop: 14, marginBottom: 20, lineHeight: 22 },
  emptyBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '800', color: WHITE },
});
