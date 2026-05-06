/**
 * RecipeDetailScreen — Full meal detail for one dinner night.
 *
 * Receives via route.params:
 *   meal          — { id, day, name, ingredients[], prep_min, cook_min, cal, coupon }
 *   householdSize — number
 *
 * Sections (top to bottom):
 *   1. Nav header (back + Share)
 *   2. Hero card  (night name, meal name, stat row)
 *   3. Deal items (ingredient rows with price + deal badge)
 *   4. Pantry items (hardcoded per night)
 *   5. Meal total card
 *   6. Coupon note (if any)
 *   7. Add all to cart button
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { addItemsToActiveCart } from '../src/services/cartStorage';

// ── Colors (brand palette) ──────────────────────────────────────
const FOREST    = '#0C7A3D';
const GREEN     = '#0C9E54';
const NAVY      = '#0D1B4B';
const WHITE     = '#FFFFFF';
const OFF_WHITE = '#F0FAF5';
const BORDER    = '#E2E8F0';
const GRAY      = '#64748B';
const LIGHT_BG  = '#F0FAF5';
const BLUE_TEXT = '#1D4ED8';
const BLUE_BG   = '#EFF6FF';

// ── Deal chip palette ───────────────────────────────────────────
const DEAL_COLORS = {
  BOGO:                { bg: '#DCFCE7', text: '#15803D' },
  SALE:                { bg: '#DBEAFE', text: '#1D4ED8' },
  DIGITAL_COUPON:      { bg: '#EDE9FE', text: '#6D28D9' },
  LOYALTY_PRICE:       { bg: '#FEF3C7', text: '#92400E' },
  MANUFACTURER_COUPON: { bg: '#FCE7F3', text: '#9D174D' },
  MULTI:               { bg: '#FEE2E2', text: '#B91C1C' },
};

function chipStyle(dealType) {
  return DEAL_COLORS[dealType] || { bg: '#F1F5F9', text: GRAY };
}

// ── Pantry items by day abbrev (matches WeeklyPlanScreen DAY_ABBREV) ──
const NIGHT_PANTRY_BY_DAY = {
  Mon: ['Olive oil', 'Garlic', 'Herbs'],
  Tue: ['Rice', 'Seasoning', 'Hot sauce'],
  Wed: ['Bread', 'Condiments'],
  Thu: ['Chicken broth', 'Bay leaves', 'Butter'],
  Fri: ['Lemon', 'Butter', 'Capers'],
  Sat: ['Sesame oil', 'Ginger', 'Chili paste'],
  Sun: ['Mustard', 'Pickles', 'Hot dog relish'],
};

// ── Helpers ─────────────────────────────────────────────────────
const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

function computeTotalCents(ingredients) {
  return ingredients.reduce((s, i) => s + (i.sale_cents || 0), 0);
}

function computeRegularCents(ingredients) {
  return ingredients.reduce((s, i) => s + (i.reg_cents || i.sale_cents || 0), 0);
}

// ── Component ───────────────────────────────────────────────────
export default function RecipeDetailScreen({ navigation, route }) {
  const { meal, householdSize = 2 } = route?.params ?? {};

  const [addedToCart, setAddedToCart] = useState(false);

  // If navigation lands here without params, go back safely
  if (!meal) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={18} color={NAVY} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Meal Detail</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorTxt}>No meal data — please go back and try again.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const ingredients = meal.ingredients ?? [];
  const pantryItems = NIGHT_PANTRY_BY_DAY[meal.day] ?? [];
  const totalCents  = computeTotalCents(ingredients);
  const regularCents = computeRegularCents(ingredients);
  const savedCents   = Math.max(0, regularCents - totalCents);
  const nightLabel   = meal.day || '';

  const dealIngredients   = ingredients.filter(i => i.deal_type);
  const pantryIngredients = ingredients.filter(i => !i.deal_type && i.name);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out this meal I'm making this week with Snippd!\n\n${meal.name}\n${fmt(totalCents)} for ${householdSize} people\n\nDownload Snippd to build your own weekly dinner plan.`,
        title: meal.name,
      });
    } catch { /* share cancelled */ }
  }, [meal.name, totalCents, householdSize]);

  const handleAddToCart = useCallback(async () => {
    try {
      const newItems = ingredients
        .filter(i => i.name)
        .map(i => ({
          id:           `recipe_${meal.id}_${(i.name).replace(/\s+/g, '_')}`,
          product_name: i.name,
          sale_cents:   i.sale_cents || 0,
          reg_cents:    i.reg_cents  || i.sale_cents || 0,
          deal_type:    i.deal_type  || null,
          quantity:     i.deal_type === 'BOGO' ? 2 : 1,
          source:       'recipe_detail',
          meal_name:    meal.name,
        }));

      await addItemsToActiveCart(newItems);
      setAddedToCart(true);
    } catch {
      Alert.alert('Could not add to cart', 'Please try again.');
    }
  }, [ingredients, meal.id, meal.name]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── NAV HEADER ─────────────────────────────────────────── */}
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{meal.day} Dinner</Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleShare}>
          <Feather name="share-2" size={17} color={NAVY} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── 1. HERO CARD ───────────────────────────────────────── */}
        <View style={styles.heroPad}>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>{nightLabel.toUpperCase()} DINNER</Text>
            <Text style={styles.heroTitle}>{meal.name}</Text>

            <View style={styles.heroStatRow}>
              {/* Serves */}
              <View style={styles.heroStat}>
                <Feather name="users" size={13} color="rgba(255,255,255,0.7)" />
                <Text style={styles.heroStatTxt}>Serves {householdSize}</Text>
              </View>

              <View style={styles.heroStatDot} />

              {/* Prep + cook */}
              <View style={styles.heroStat}>
                <Feather name="clock" size={13} color="rgba(255,255,255,0.7)" />
                <Text style={styles.heroStatTxt}>
                  {meal.prep_min}m prep · {meal.cook_min}m cook
                </Text>
              </View>

              {/* Cal (only if non-zero) */}
              {meal.cal > 0 && (
                <>
                  <View style={styles.heroStatDot} />
                  <View style={styles.heroStat}>
                    <Feather name="zap" size={13} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.heroStatTxt}>{meal.cal} cal</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ── 2. DEAL INGREDIENTS ────────────────────────────────── */}
        {dealIngredients.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>This week's deals</Text>
            <View style={styles.card}>
              {dealIngredients.map((ing, idx) => {
                const cs        = chipStyle(ing.deal_type);
                const isBogo    = ing.deal_type === 'BOGO';
                const hasSaving = (ing.reg_cents || 0) > (ing.sale_cents || 0);
                const isLast    = idx === dealIngredients.length - 1;

                return (
                  <View
                    key={idx}
                    style={[styles.ingRow, !isLast && styles.ingRowBorder]}
                  >
                    {/* Name + deal badge */}
                    <View style={styles.ingLeft}>
                      <Text style={styles.ingName}>{ing.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <View style={[styles.dealBadge, { backgroundColor: cs.bg }]}>
                          <Text style={[styles.dealBadgeTxt, { color: cs.text }]}>
                            {isBogo ? 'BOGO FREE' : ing.deal_type}
                          </Text>
                        </View>
                        {isBogo && (
                          <View style={[styles.dealBadge, { backgroundColor: '#F0FDF4' }]}>
                            <Text style={[styles.dealBadgeTxt, { color: '#166534' }]}>Buy 1, get 1 free</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Price column */}
                    <View style={styles.ingRight}>
                      <Text style={styles.salePrice}>{fmt(ing.sale_cents)}</Text>
                      {hasSaving && (
                        <Text style={styles.regPrice}>{fmt(ing.reg_cents)}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── 3. PANTRY / NO-DEAL INGREDIENTS ───────────────────── */}
        {(pantryIngredients.length > 0 || pantryItems.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Pantry items needed</Text>
            <View style={styles.card}>
              {/* Deal ingredients that have no discount (pantry role) */}
              {pantryIngredients.map((ing, idx) => (
                <View
                  key={`ing_${idx}`}
                  style={[
                    styles.pantryRow,
                    (idx < pantryIngredients.length - 1 || pantryItems.length > 0) && styles.ingRowBorder,
                  ]}
                >
                  <Feather name="check-circle" size={14} color={GREEN} style={{ marginRight: 8 }} />
                  <Text style={styles.pantryName}>{ing.name}</Text>
                </View>
              ))}
              {/* Hardcoded pantry items from NIGHT_PANTRY */}
              {pantryItems.map((item, idx) => (
                <View
                  key={`pantry_${idx}`}
                  style={[styles.pantryRow, idx < pantryItems.length - 1 && styles.ingRowBorder]}
                >
                  <Feather name="package" size={14} color={GRAY} style={{ marginRight: 8 }} />
                  <Text style={styles.pantryNameGray}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── 4. COUPON NOTE ─────────────────────────────────────── */}
        {meal.coupon && (
          <View style={styles.section}>
            <View style={styles.couponCard}>
              <Feather name="tag" size={14} color={BLUE_TEXT} style={{ marginRight: 8 }} />
              <Text style={styles.couponTxt}>{meal.coupon}</Text>
            </View>
          </View>
        )}

        {/* ── 5. MEAL TOTAL CARD ──────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.totalCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Regular price</Text>
              <Text style={styles.totalRegular}>{fmt(regularCents)}</Text>
            </View>
            {savedCents > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>You save</Text>
                <Text style={styles.totalSaving}>−{fmt(savedCents)}</Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.totalFooterRow]}>
              <Text style={styles.totalFooterLabel}>
                Your price · {householdSize} {householdSize === 1 ? 'person' : 'people'}
              </Text>
              <Text style={styles.totalFooterValue}>{fmt(totalCents)}</Text>
            </View>
          </View>
        </View>

        {/* ── 7. ADD ALL TO CART ──────────────────────────────────── */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.cartBtn, addedToCart && styles.cartBtnDone]}
            onPress={handleAddToCart}
            activeOpacity={0.85}
            disabled={addedToCart}
          >
            {addedToCart ? (
              <View style={styles.cartBtnInner}>
                <Feather name="check-circle" size={17} color={WHITE} style={{ marginRight: 8 }} />
                <Text style={styles.cartBtnTxt}>Added to cart</Text>
              </View>
            ) : (
              <View style={styles.cartBtnInner}>
                <Feather name="shopping-cart" size={17} color={WHITE} style={{ marginRight: 8 }} />
                <Text style={styles.cartBtnTxt}>Add all ingredients to cart</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: OFF_WHITE },
  scroll:     { paddingBottom: 32 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorTxt:   { fontSize: 14, color: GRAY, textAlign: 'center' },

  // Nav header
  navHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center',
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: NAVY, flex: 1, textAlign: 'center' },

  // Hero
  heroPad:  { paddingHorizontal: 16, marginTop: 16 },
  heroCard: {
    backgroundColor: FOREST, borderRadius: 14, padding: 20,
  },
  heroEyebrow: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.2, marginBottom: 8,
  },
  heroTitle: {
    fontSize: 20, fontWeight: '700', color: WHITE, lineHeight: 28, marginBottom: 16,
  },
  heroStatRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6,
  },
  heroStat:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroStatTxt: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  heroStatDot: {
    width: 3, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  // Section
  section:      { paddingHorizontal: 16, marginTop: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: GRAY, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },

  // Card shell
  card: { backgroundColor: WHITE, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },

  // Ingredient rows
  ingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 14 },
  ingRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  ingLeft:  { flex: 1, paddingRight: 12 },
  ingRight: { alignItems: 'flex-end', justifyContent: 'center' },
  ingName:  { fontSize: 14, fontWeight: '600', color: NAVY },
  dealBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  dealBadgeTxt: { fontSize: 11, fontWeight: '700' },
  salePrice: { fontSize: 15, fontWeight: '800', color: GREEN },
  regPrice:  { fontSize: 12, color: GRAY, textDecorationLine: 'line-through', marginTop: 2 },

  // Pantry rows
  pantryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  pantryName:     { fontSize: 14, color: NAVY },
  pantryNameGray: { fontSize: 14, color: GRAY },

  // Coupon
  couponCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: BLUE_BG, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  couponTxt: { flex: 1, fontSize: 13, color: BLUE_TEXT, lineHeight: 19 },

  // Total card
  totalCard: {
    backgroundColor: WHITE, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
  },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  totalLabel:   { fontSize: 14, color: GRAY },
  totalRegular: { fontSize: 14, color: NAVY, fontWeight: '600' },
  totalSaving:  { fontSize: 14, color: GREEN, fontWeight: '700' },
  totalFooterRow: {
    backgroundColor: LIGHT_BG,
    borderBottomWidth: 0,
  },
  totalFooterLabel: { fontSize: 14, fontWeight: '700', color: NAVY },
  totalFooterValue: { fontSize: 18, fontWeight: '800', color: FOREST },

  // Cart button
  cartBtn: {
    backgroundColor: FOREST, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  cartBtnDone: { backgroundColor: GREEN },
  cartBtnInner: { flexDirection: 'row', alignItems: 'center' },
  cartBtnTxt: { color: WHITE, fontWeight: '700', fontSize: 15 },

  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
    borderRadius: 12,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: FOREST,
  },
  recordBtnTxt: { color: FOREST, fontWeight: '700', fontSize: 15 },
});
