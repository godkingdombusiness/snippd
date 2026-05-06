/**
 * MealDetailScreen — spec D layout.
 * White header, meal title + metadata, food image, horizontal nutrition row,
 * side-by-side pricing, ingredient checklist with search terms, CTA button.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Image, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

// ── Brand ─────────────────────────────────────────────────────────────────────
const GREEN  = '#0C9E54';
const FOREST = '#04361D';
const NAVY   = '#1A237E';
const WHITE  = '#FFFFFF';
const MINT   = '#F0FBF0';
const SLATE  = '#64748B';
const BORDER = '#E2E8F0';
const LIGHT_GRN = '#DCFCE7';

// ── Image map (by meal name keywords) ────────────────────────────────────────
const MEAL_IMAGES = {
  protein:   require('../assets/stack-protein.png.png'),
  produce:   require('../assets/stack-produce.png.png'),
  default:   require('../assets/stack-protein.png.png'),
};

function getMealImage(name = '') {
  const n = name.toLowerCase();
  if (n.match(/chicken|beef|pork|salmon|fish|turkey|sausage|meat|tuna/)) return MEAL_IMAGES.protein;
  if (n.match(/veggie|vegetable|salad|pasta|noodle|stir.?fry|bean|lentil/)) return MEAL_IMAGES.produce;
  return MEAL_IMAGES.default;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCents(cents) {
  if (!cents) return '$0.00';
  return '$' + (Math.max(0, cents) / 100).toFixed(2);
}

function getCouponSearchName(ing) {
  if (ing.coupon_search_name) return ing.coupon_search_name;
  return String(ing.display_name || ing.name || '').split(' ').slice(0, 3).join(' ');
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function MealDetailScreen({ route, navigation }) {
  const meal         = route?.params?.meal;
  const householdSize = route?.params?.householdSize ?? 4;
  const [checked, setChecked] = useState({});

  if (!meal) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']}>
          <View style={s.navRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
              <Feather name="arrow-left" size={20} color={NAVY} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: SLATE }}>No meal data.</Text>
        </View>
      </View>
    );
  }

  const ingredients       = meal.ingredients || [];
  const totalSaleCents    = ingredients.reduce((a, i) => a + (i.sale_cents || 0), 0);
  const totalRegCents     = ingredients.reduce((a, i) => a + (i.reg_cents  || 0), 0);
  const totalSavedCents   = Math.max(0, totalRegCents - totalSaleCents);
  const mealImage         = getMealImage(meal.name);
  const dayLabel          = meal.day ? `${meal.day} ${meal.mealSlot || 'Dinner'}` : (meal.mealSlot || 'Meal');

  const handleShare = () => {
    Share.share({ message: `${meal.name} — ${fmtCents(totalSaleCents)} with Snippd` }).catch(() => {});
  };

  const handleAddToList = () => {
    const stackForList = {
      store:  meal.store || 'Store',
      title:  meal.name,
      final_out_of_pocket_cents:  totalSaleCents,
      subtotal_cents:             totalRegCents,
      total_discounts_cents:      totalSavedCents,
      savings_percent: totalRegCents > 0
        ? Math.round((totalSavedCents / totalRegCents) * 100) : 0,
      stack_items: ingredients.map(ing => ({
        display_name:            ing.display_name || ing.name || 'Item',
        coupon_search_name:      getCouponSearchName(ing),
        coupon_clip_instruction: ing.coupon_clip_instruction || null,
        coupon_status:           ing.deal_type ? 'verified' : 'needs_user_verification',
        price_cents:             ing.reg_cents  || 0,
        coupon_value_cents:      Math.max(0, (ing.reg_cents || 0) - (ing.sale_cents || 0)),
        final_price_cents:       ing.sale_cents || 0,
        qty: 1,
      })),
    };
    navigation.navigate('ShoppingList', { stack: stackForList });
  };

  const toggleCheck = (i) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ──────────────────────────────────────────────── */}
      <SafeAreaView style={s.header} edges={['top']}>
        <View style={s.navRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={20} color={NAVY} />
          </TouchableOpacity>
          <Text style={s.navTitle}>{dayLabel}</Text>
          <TouchableOpacity style={s.backBtn} onPress={handleShare}>
            <Feather name="share-2" size={18} color={NAVY} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Meal title + metadata ──────────────────────────────── */}
        <Text style={s.mealTitle}>{meal.name}</Text>
        <Text style={s.mealMeta}>
          Serves {householdSize}{meal.prep_min > 0 ? `  ·  ${meal.prep_min}min prep` : ''}{meal.cook_min > 0 ? `  ·  ${meal.cook_min}min cook` : ''}
        </Text>

        {/* ── Food image ────────────────────────────────────────── */}
        <View style={s.imageCard}>
          <Image source={mealImage} style={s.mealImage} resizeMode="cover" />
        </View>

        {/* ── Nutrition row ─────────────────────────────────────── */}
        {meal.cal > 0 && (
          <View style={s.nutritionRow}>
            {[
              { val: `${meal.cal}`,               label: 'cal'     },
              { val: `${meal.protein_g ?? Math.round(meal.cal * 0.25 / 4)}g`, label: 'Protein' },
              { val: `${meal.carbs_g   ?? Math.round(meal.cal * 0.50 / 4)}g`, label: 'Carbs'   },
              { val: `${meal.fat_g     ?? Math.round(meal.cal * 0.25 / 9)}g`, label: 'Fat'     },
            ].map(({ val, label }, i, arr) => (
              <React.Fragment key={label}>
                <View style={s.nutriItem}>
                  <Text style={s.nutriVal}>{val}</Text>
                  <Text style={s.nutriLabel}>{label}</Text>
                </View>
                {i < arr.length - 1 && <View style={s.nutriDivider} />}
              </React.Fragment>
            ))}
          </View>
        )}

        {/* ── Pricing ───────────────────────────────────────────── */}
        <View style={s.pricingCard}>
          <View style={s.pricingLeft}>
            <Text style={s.pricingYourLabel}>Your price</Text>
            <Text style={s.pricingYourValue}>{fmtCents(totalSaleCents)}</Text>
          </View>
          <View style={s.pricingRight}>
            <Text style={s.pricingRegular}>Regular {fmtCents(totalRegCents)}</Text>
            {totalSavedCents > 0 && (
              <Text style={s.pricingSavings}>You save {fmtCents(totalSavedCents)}</Text>
            )}
          </View>
        </View>

        {/* ── Ingredients ───────────────────────────────────────── */}
        <Text style={s.sectionLabel}>Ingredients (what you need)</Text>
        <View style={s.ingredientsCard}>
          {ingredients.map((ing, i) => {
            const isLast     = i === ingredients.length - 1;
            const searchName = getCouponSearchName(ing);
            const isChecked  = !!checked[i];
            return (
              <TouchableOpacity
                key={i}
                style={[s.ingRow, !isLast && s.ingBorder]}
                onPress={() => toggleCheck(i)}
                activeOpacity={0.7}
              >
                <View style={[s.checkbox, isChecked && s.checkboxChecked]}>
                  {isChecked && <Feather name="check" size={12} color={WHITE} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.ingName, isChecked && s.ingNameChecked]}>
                    {ing.display_name || ing.name}
                  </Text>
                  <Text style={s.ingSearch}>Search: "{searchName}"</Text>
                </View>
                {(ing.sale_cents || 0) > 0 && (
                  <Text style={s.ingPrice}>{fmtCents(ing.sale_cents)}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── Footer CTA ───────────────────────────────────────────── */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.ctaBtn, ingredients.length === 0 && { opacity: 0.4 }]}
          onPress={handleAddToList}
          disabled={ingredients.length === 0}
          activeOpacity={0.85}
        >
          <Text style={s.ctaBtnTxt}>View Coupons & Details</Text>
          <Feather name="chevron-right" size={18} color={WHITE} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: MINT },

  // Header
  header:  { backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  navRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  navTitle:{ fontSize: 15, fontWeight: '700', color: NAVY },

  scroll: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 },

  // Title
  mealTitle: { fontSize: 24, fontWeight: '900', color: NAVY, lineHeight: 30, marginBottom: 6 },
  mealMeta:  { fontSize: 13, color: SLATE, marginBottom: 16, lineHeight: 18 },

  // Image
  imageCard:  { borderRadius: 16, overflow: 'hidden', marginBottom: 16, backgroundColor: '#E8F0EC' },
  mealImage:  { width: '100%', height: 200 },

  // Nutrition
  nutritionRow: {
    flexDirection: 'row', backgroundColor: WHITE,
    borderRadius: 14, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: BORDER, alignItems: 'center',
  },
  nutriItem:    { flex: 1, alignItems: 'center' },
  nutriVal:     { fontSize: 16, fontWeight: '900', color: NAVY },
  nutriLabel:   { fontSize: 11, color: SLATE, marginTop: 2 },
  nutriDivider: { width: 1, height: 30, backgroundColor: BORDER },

  // Pricing
  pricingCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: WHITE, borderRadius: 14, padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: BORDER,
  },
  pricingLeft:      { flex: 1 },
  pricingYourLabel: { fontSize: 12, color: SLATE, marginBottom: 2 },
  pricingYourValue: { fontSize: 32, fontWeight: '900', color: GREEN },
  pricingRight:     { alignItems: 'flex-end' },
  pricingRegular:   { fontSize: 13, color: SLATE, textDecorationLine: 'line-through' },
  pricingSavings:   { fontSize: 14, fontWeight: '800', color: GREEN, marginTop: 3 },

  // Section label
  sectionLabel: { fontSize: 14, fontWeight: '800', color: NAVY, marginBottom: 10 },

  // Ingredients
  ingredientsCard: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
  },
  ingRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  ingBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  checkbox:  {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: GREEN, borderColor: GREEN },
  ingName:         { fontSize: 14, fontWeight: '700', color: NAVY, lineHeight: 20 },
  ingNameChecked:  { textDecorationLine: 'line-through', color: SLATE },
  ingSearch:       { fontSize: 11, color: SLATE, marginTop: 2 },
  ingPrice:        { fontSize: 14, fontWeight: '800', color: NAVY, flexShrink: 0 },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: WHITE, borderTopWidth: 1, borderTopColor: BORDER,
    padding: 16, paddingBottom: 32,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: FOREST, borderRadius: 14, paddingVertical: 17,
  },
  ctaBtnTxt: { fontSize: 16, fontWeight: '800', color: WHITE },
});
