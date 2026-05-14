import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tracker } from '../src/lib/eventTracker';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';
var CORAL  = '#fb5b5b';

var SEEDED_RECIPES = [
  {
    id: 'r001',
    name: 'Chicken Rice Bowls',
    meal_type: 'Dinner',
    cook_time: '25 min',
    servings: 4,
    cost_per_serving_cents: 285,
    tags: ['high-protein', 'meal-prep'],
    saved: true,
  },
  {
    id: 'r002',
    name: 'Sheet Pan Salmon',
    meal_type: 'Dinner',
    cook_time: '30 min',
    servings: 4,
    cost_per_serving_cents: 420,
    tags: ['omega-3', 'low-carb'],
    saved: true,
  },
  {
    id: 'r003',
    name: 'Pasta Primavera',
    meal_type: 'Dinner',
    cook_time: '20 min',
    servings: 6,
    cost_per_serving_cents: 190,
    tags: ['budget', 'vegetarian'],
    saved: true,
  },
  {
    id: 'r004',
    name: 'Overnight Oats',
    meal_type: 'Breakfast',
    cook_time: '5 min',
    servings: 2,
    cost_per_serving_cents: 95,
    tags: ['no-cook', 'fiber'],
    saved: true,
  },
  {
    id: 'r005',
    name: 'Black Bean Tacos',
    meal_type: 'Lunch',
    cook_time: '15 min',
    servings: 4,
    cost_per_serving_cents: 155,
    tags: ['vegetarian', 'quick'],
    saved: true,
  },
  {
    id: 'r006',
    name: 'Greek Yogurt Parfait',
    meal_type: 'Breakfast',
    cook_time: '5 min',
    servings: 2,
    cost_per_serving_cents: 180,
    tags: ['high-protein', 'no-cook'],
    saved: true,
  },
];

var MEAL_TYPE_COLORS = {
  Breakfast: { bg: '#FEF3C7', text: '#92400E' },
  Lunch:     { bg: '#DBEAFE', text: '#1E40AF' },
  Dinner:    { bg: MINT,      text: GREEN      },
  Snack:     { bg: '#FEE2E2', text: '#991B1B'  },
};

function RecipeCard(recipe, onCook) {
  var typeColor = MEAL_TYPE_COLORS[recipe.meal_type] || MEAL_TYPE_COLORS.Dinner;
  return (
    <View style={recipeStyles.card}>
      {/* Image placeholder */}
      <View style={recipeStyles.imagePlaceholder}>
        <Feather name="book-open" size={22} color={GRAY} />
      </View>

      <View style={recipeStyles.info}>
        <View style={recipeStyles.topRow}>
          <View style={[recipeStyles.typePill, { backgroundColor: typeColor.bg }]}>
            <Text style={[recipeStyles.typeText, { color: typeColor.text }]}>{recipe.meal_type}</Text>
          </View>
          <Text style={recipeStyles.cost}>
            {'$' + (recipe.cost_per_serving_cents / 100).toFixed(2) + '/serving'}
          </Text>
        </View>
        <Text style={recipeStyles.name}>{recipe.name}</Text>
        <View style={recipeStyles.metaRow}>
          <View style={recipeStyles.metaItem}>
            <Feather name="clock" size={11} color={GRAY} />
            <Text style={recipeStyles.metaText}>{recipe.cook_time}</Text>
          </View>
          <View style={recipeStyles.metaItem}>
            <Feather name="users" size={11} color={GRAY} />
            <Text style={recipeStyles.metaText}>Serves {recipe.servings}</Text>
          </View>
        </View>
        <View style={recipeStyles.tagRow}>
          {recipe.tags.map(function (tag) {
            return (
              <View key={tag} style={recipeStyles.tag}>
                <Text style={recipeStyles.tagText}>{tag}</Text>
              </View>
            );
          })}
        </View>
        <TouchableOpacity
          style={recipeStyles.cookBtn}
          onPress={function () { onCook(recipe); }}
          activeOpacity={0.8}
        >
          <Feather name="book-open" size={13} color={GREEN} />
          <Text style={recipeStyles.cookBtnText}>How to cook this</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function RecipeVaultScreen(props) {
  var navigation = props.navigation;
  var [activeFilter, setActiveFilter] = useState('All');
  var FILTERS = ['All', 'Breakfast', 'Lunch', 'Dinner'];

  useEffect(function () {
    tracker.track('recipe_vault_opened', { recipe_count: SEEDED_RECIPES.length });
  }, []);

  function handleBack() {
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  function handleCook(recipe) {
    navigation.navigate('ContextualCooking', {
      meal: {
        meal_id:     recipe.id,
        meal_name:   recipe.name,
        ingredients: [],
      },
    });
  }

  var filtered = activeFilter === 'All'
    ? SEEDED_RECIPES
    : SEEDED_RECIPES.filter(function (r) { return r.meal_type === activeFilter; });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Recipe Vault</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Ownership note */}
      <View style={styles.ownershipBanner}>
        <Feather name="shield" size={14} color={GREEN} />
        <Text style={styles.ownershipText}>
          Your saved recipes stay yours — no subscription required to access them.
        </Text>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map(function (f) {
          var isActive = activeFilter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={function () { setActiveFilter(f); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={function (r) { return r.id; }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={function ({ item }) { return RecipeCard(item, handleCook); }}
        ItemSeparatorComponent={function () { return <View style={{ height: 12 }} />; }}
        ListEmptyComponent={function () {
          return (
            <View style={styles.emptyState}>
              <Feather name="book" size={32} color={BORDER} />
              <Text style={styles.emptyText}>No saved recipes yet</Text>
            </View>
          );
        }}
        ListFooterComponent={function () { return <View style={{ height: 40 }} />; }}
      />
    </SafeAreaView>
  );
}

var recipeStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    width: 80,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  info: { flex: 1, padding: 14, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typePill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  typeText:  { fontSize: 10, fontWeight: '700' },
  cost:      { fontSize: 11, color: GRAY },
  name:      { fontSize: 15, fontWeight: '700', color: NAVY },
  metaRow:   { flexDirection: 'row', gap: 12 },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:  { fontSize: 12, color: GRAY },
  tagRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: MINT,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: { fontSize: 10, color: GREEN, fontWeight: '600' },
  cookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  cookBtnText: { fontSize: 12, color: GREEN, fontWeight: '700' },
});

var styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: CREAM },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: WHITE,
    borderWidth: 1, borderColor: BORDER,
  },
  navTitle: { fontSize: 17, fontWeight: '700', color: NAVY },
  ownershipBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: MINT,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  ownershipText: { flex: 1, fontSize: 13, color: NAVY, fontWeight: '500', lineHeight: 18 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterText:       { fontSize: 13, fontWeight: '600', color: GRAY },
  filterTextActive: { color: WHITE },
  list: { paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyText:  { fontSize: 15, color: GRAY },
});

export default RecipeVaultScreen;
