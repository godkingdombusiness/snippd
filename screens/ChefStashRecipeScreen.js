import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tracker } from '../src/lib/eventTracker';

// ── Brand colors ──────────────────────────────────────────────────────────────

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var MINT   = '#E8F5E9';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var CORAL  = '#fb5b5b';
var AMBER  = '#F59E0B';

// ── Seeded demo recipe ────────────────────────────────────────────────────────

var DEMO_RECIPE = {
  meal_id: 'demo_001',
  meal_name: 'Chicken Rice Bowls',
  why_picked: 'Uses rice and broccoli you may already have. Only one item is missing. Keeps you under budget. Ready in about 25 minutes.',
  estimated_total_cents: 874,
  estimated_additional_cents: 874,
  cost_per_serving_cents: 219,
  servings: 4,
  prep_time_minutes: 10,
  cook_time_minutes: 20,
  total_time_minutes: 30,
  estimated_calories: 520,
  estimated_protein_g: 38,
  store: 'Aldi',
  pantry_items_used: ['Rice', 'Broccoli', 'Garlic', 'Olive oil'],
  missing_items: ['Chicken breast — $8.74 at Aldi'],
  ingredients: [
    { name: 'Chicken breast', amount: '1.5 lbs', pantry: false },
    { name: 'White rice', amount: '2 cups', pantry: true },
    { name: 'Broccoli', amount: '2 cups', pantry: true },
    { name: 'Garlic', amount: '3 cloves', pantry: true },
    { name: 'Olive oil', amount: '2 tbsp', pantry: true },
    { name: 'Soy sauce', amount: '2 tbsp', pantry: false },
    { name: 'Sesame oil', amount: '1 tsp', pantry: false },
  ],
  instructions: [
    'Cook rice according to package directions.',
    'Slice chicken breast into strips. Season with salt and pepper.',
    'Heat olive oil in a large skillet over medium-high heat.',
    'Cook chicken 5-7 minutes per side until cooked through. Internal temp must reach 165F.',
    'Steam or stir-fry broccoli until tender-crisp, about 4 minutes.',
    'Mix soy sauce, sesame oil, and minced garlic in a small bowl.',
    'Combine rice, chicken, and broccoli. Drizzle sauce over top. Serve immediately.',
  ],
  cooking_method: 'Stovetop',
  nutrition_source: 'Estimated by Snippd demo data',
};

var COOKING_METHODS = ['Air Fryer', 'Oven', 'Stovetop', 'Grill', 'Slow Cooker', 'Microwave', 'No-cook'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCents(cents) {
  if (cents == null) return '$0.00';
  return '$' + (cents / 100).toFixed(2);
}

// ── Module-scope render helpers ───────────────────────────────────────────────

function renderNavBar(navigation) {
  return (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
        <Feather name="chevron-left" size={24} color={NAVY} />
      </TouchableOpacity>
      <Text style={styles.navTitle}>Chef Stash</Text>
      <View style={styles.navSpacer} />
    </View>
  );
}

function renderWhyCard(whyText) {
  return (
    <View style={styles.whyCard}>
      <Text style={styles.whyText}>{whyText}</Text>
    </View>
  );
}

function renderCostRow(recipe) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoCell}>
        <Text style={styles.infoCellLabel}>Additional spend</Text>
        <Text style={[styles.infoCellValue, { color: GREEN }]}>{fmtCents(recipe.estimated_additional_cents)}</Text>
      </View>
      <View style={styles.infoDivider} />
      <View style={styles.infoCell}>
        <Text style={styles.infoCellLabel}>Per serving</Text>
        <Text style={styles.infoCellValue}>{fmtCents(recipe.cost_per_serving_cents)}</Text>
      </View>
      <View style={styles.infoDivider} />
      <View style={styles.infoCell}>
        <Text style={styles.infoCellLabel}>Serves</Text>
        <Text style={styles.infoCellValue}>{recipe.servings}</Text>
      </View>
    </View>
  );
}

function renderTimeRow(recipe) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoCell}>
        <Text style={styles.infoCellLabel}>Prep</Text>
        <Text style={styles.infoCellValue}>{recipe.prep_time_minutes} min</Text>
      </View>
      <View style={styles.infoDivider} />
      <View style={styles.infoCell}>
        <Text style={styles.infoCellLabel}>Cook</Text>
        <Text style={styles.infoCellValue}>{recipe.cook_time_minutes} min</Text>
      </View>
      <View style={styles.infoDivider} />
      <View style={styles.infoCell}>
        <Text style={styles.infoCellLabel}>Total</Text>
        <Text style={styles.infoCellValue}>{recipe.total_time_minutes} min</Text>
      </View>
    </View>
  );
}

function renderNutritionCard(recipe) {
  return (
    <View style={styles.card}>
      <Text style={styles.nutritionLabel}>
        {'ESTIMATED NUTRITION — ' + recipe.nutrition_source}
      </Text>
      <View style={styles.nutritionRow}>
        <View style={styles.nutritionCell}>
          <Text style={styles.nutritionValue}>{recipe.estimated_calories}</Text>
          <Text style={styles.nutritionUnit}>cal</Text>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.nutritionCell}>
          <Text style={styles.nutritionValue}>{recipe.estimated_protein_g}g</Text>
          <Text style={styles.nutritionUnit}>protein</Text>
        </View>
      </View>
      <Text style={styles.nutritionDisclaimer}>Nutrition may vary by brand and preparation</Text>
    </View>
  );
}

function renderPantrySection(recipe) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardSectionTitle}>Best store: {recipe.store}</Text>

      {recipe.pantry_items_used && recipe.pantry_items_used.length > 0 && (
        <View style={styles.pantryGroup}>
          <Text style={styles.pantryGroupLabel}>Items you may already have</Text>
          {recipe.pantry_items_used.map(function(item, i) {
            return (
              <View key={i} style={styles.pantryRow}>
                <Feather name="check-circle" size={14} color={GREEN} />
                <Text style={styles.pantryItemText}>{item}</Text>
              </View>
            );
          })}
        </View>
      )}

      {recipe.missing_items && recipe.missing_items.length > 0 && (
        <View style={styles.pantryGroup}>
          <Text style={styles.missingGroupLabel}>Missing items</Text>
          {recipe.missing_items.map(function(item, i) {
            return (
              <View key={i} style={styles.pantryRow}>
                <Feather name="x-circle" size={14} color={CORAL} />
                <Text style={styles.missingItemText}>{item}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function renderMethodSwitcher(selectedMethod, onSelect) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodScroll} contentContainerStyle={styles.methodScrollContent}>
      {COOKING_METHODS.map(function(method) {
        var active = selectedMethod === method;
        return (
          <TouchableOpacity
            key={method}
            style={[styles.methodChip, active && styles.methodChipActive]}
            onPress={function() { onSelect(method); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.methodChipText, active && styles.methodChipTextActive]}>{method}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function renderIngredientsList(ingredients) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Ingredients</Text>
      {ingredients.map(function(ing, i) {
        return (
          <View key={i} style={styles.ingredientRow}>
            {ing.pantry
              ? <Feather name="check-circle" size={14} color={GREEN} style={styles.ingredientIcon} />
              : <Feather name="circle" size={14} color={GRAY} style={styles.ingredientIcon} />
            }
            <Text style={styles.ingredientName}>{ing.name}</Text>
            <Text style={styles.ingredientAmount}>{ing.amount}</Text>
          </View>
        );
      })}
    </View>
  );
}

function renderInstructions(instructions) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Instructions</Text>
      {instructions.map(function(step, i) {
        return (
          <View key={i} style={styles.instructionRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNumber}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        );
      })}
    </View>
  );
}

function renderDisclaimer() {
  return (
    <View style={styles.disclaimerBox}>
      <Text style={styles.disclaimerText}>
        Nutrition may vary by brand, serving size, recipe preparation, and store availability. Snippd does not verify allergens or medical suitability. Always review labels and ingredient information.
      </Text>
    </View>
  );
}

function renderBottomCTA(recipe, navigation, onSwap, onMethod) {
  return (
    <View style={styles.ctaContainer}>
      <TouchableOpacity
        style={styles.primaryCTA}
        activeOpacity={0.85}
        onPress={function() {
          tracker.track('chef_stash_add_to_cart', { meal_id: recipe.meal_id });
          navigation.navigate('ShoppingList');
        }}
      >
        <Text style={styles.primaryCTAText}>Add Missing Items</Text>
      </TouchableOpacity>

      <View style={styles.secondaryCTARow}>
        <TouchableOpacity style={styles.outlineBtn} activeOpacity={0.75} onPress={onSwap}>
          <Text style={styles.outlineBtnText}>Swap Meal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} activeOpacity={0.75} onPress={onMethod}>
          <Text style={styles.outlineBtnText}>Change Method</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.outlineBtn}
          activeOpacity={0.75}
          onPress={function() { navigation.navigate('TodayOptionsRanked'); }}
        >
          <Text style={styles.outlineBtnText}>Eat Out Instead</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChefStashRecipeScreen({ navigation, route }) {
  var params = route && route.params ? route.params : {};
  var recipe = params.meal || DEMO_RECIPE;

  var [selectedMethod, setSelectedMethod] = useState(recipe.cooking_method || 'Stovetop');

  useEffect(function() {
    tracker.track('chef_stash_recipe_viewed', {
      meal_id: recipe.meal_id,
      meal_name: recipe.meal_name,
      source: 'today_flow',
    });
  }, []);

  function handleSwap() {
    navigation.goBack();
  }

  function handleChangeMethod() {
    // Scroll to method switcher — no-op for now, switcher always visible
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderNavBar(navigation)}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Eyebrow + title */}
        <Text style={styles.eyebrow}>CHEF STASH</Text>
        <Text style={styles.mealName}>{recipe.meal_name}</Text>

        {/* Why this works */}
        {renderWhyCard(recipe.why_picked)}

        {/* Cost + servings */}
        {renderCostRow(recipe)}

        {/* Time */}
        {renderTimeRow(recipe)}

        {/* Nutrition */}
        {renderNutritionCard(recipe)}

        {/* Store + pantry */}
        {renderPantrySection(recipe)}

        {/* Cooking method switcher */}
        <Text style={styles.sectionLabel}>Cooking Method</Text>
        {renderMethodSwitcher(selectedMethod, setSelectedMethod)}

        {/* Ingredients */}
        {renderIngredientsList(recipe.ingredients || [])}

        {/* Instructions */}
        {renderInstructions(recipe.instructions || [])}

        {/* Safety disclaimer */}
        {renderDisclaimer()}

        {/* Bottom CTA */}
        {renderBottomCTA(recipe, navigation, handleSwap, handleChangeMethod)}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

var styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: CREAM },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },

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

  // Title area
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: GREEN,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 4,
  },
  mealName: {
    fontSize: 24,
    fontWeight: '800',
    color: NAVY,
    marginBottom: 16,
    lineHeight: 30,
  },

  // Why card
  whyCard: {
    backgroundColor: MINT,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: GREEN,
    padding: 16,
    marginBottom: 14,
  },
  whyText: { fontSize: 14, color: NAVY, lineHeight: 22 },

  // Info cards (cost, time)
  infoCard: {
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 14,
  },
  infoCell: { flex: 1, alignItems: 'center' },
  infoCellLabel: { fontSize: 11, color: GRAY, fontWeight: '600', marginBottom: 4 },
  infoCellValue: { fontSize: 18, fontWeight: '800', color: NAVY },
  infoDivider: { width: 1, height: 36, backgroundColor: BORDER, marginHorizontal: 4 },

  // Card (generic white card)
  card: {
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: NAVY, marginBottom: 12 },
  cardSectionTitle: { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 10 },

  // Nutrition
  nutritionLabel: { fontSize: 9, fontWeight: '700', color: GRAY, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  nutritionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  nutritionCell: { flex: 1, alignItems: 'center' },
  nutritionValue: { fontSize: 22, fontWeight: '800', color: NAVY },
  nutritionUnit: { fontSize: 11, color: GRAY, fontWeight: '600' },
  nutritionDisclaimer: { fontSize: 11, color: GRAY, fontStyle: 'italic' },

  // Section label (above method switcher)
  sectionLabel: { fontSize: 13, fontWeight: '700', color: NAVY, marginBottom: 8, marginTop: 2 },

  // Pantry
  pantryGroup: { marginBottom: 10 },
  pantryGroupLabel: { fontSize: 12, fontWeight: '600', color: GREEN, marginBottom: 6 },
  missingGroupLabel: { fontSize: 12, fontWeight: '600', color: CORAL, marginBottom: 6 },
  pantryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  pantryItemText: { fontSize: 13, color: NAVY, marginLeft: 8 },
  missingItemText: { fontSize: 13, color: CORAL, marginLeft: 8 },

  // Method switcher
  methodScroll: { marginBottom: 14 },
  methodScrollContent: { paddingRight: 8, gap: 8 },
  methodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: NAVY,
    backgroundColor: WHITE,
    marginRight: 8,
  },
  methodChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  methodChipText: { fontSize: 13, fontWeight: '600', color: NAVY },
  methodChipTextActive: { color: WHITE },

  // Ingredients
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  ingredientIcon: { marginRight: 8 },
  ingredientName: { flex: 1, fontSize: 14, color: NAVY },
  ingredientAmount: { fontSize: 13, color: GRAY },

  // Instructions
  instructionRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumber: { fontSize: 12, fontWeight: '800', color: WHITE },
  stepText: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 22 },

  // Disclaimer
  disclaimerBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  disclaimerText: { fontSize: 12, color: GRAY, lineHeight: 18 },

  // CTA
  ctaContainer: { marginTop: 4 },
  primaryCTA: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryCTAText: { fontSize: 16, fontWeight: '800', color: WHITE },
  secondaryCTARow: { flexDirection: 'row', gap: 8 },
  outlineBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: NAVY,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  outlineBtnText: { fontSize: 11, fontWeight: '700', color: NAVY },
});
