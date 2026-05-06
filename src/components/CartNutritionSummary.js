/**
 * CartNutritionSummary
 *
 * Reads nutrition from local cache (product_nutrition_map + nutrition_cache)
 * for items in the cart. Non-blocking — renders nothing while loading,
 * renders partial data if only some items are enriched.
 *
 * Props:
 *   items: CartItem[]  — from CartScreen.personalItems
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';

const GREEN  = '#0C9E54';
const NAVY   = '#0D1B4B';
const CORAL  = '#FF7043';
const AMBER  = '#F59E0B';
const GRAY   = '#64748B';
const WHITE  = '#FFFFFF';

const COMMON_ALLERGENS = ['dairy', 'gluten', 'peanuts', 'tree_nuts', 'soy', 'eggs', 'shellfish', 'fish'];

function Stat({ label, value, unit, color }) {
  if (value == null) return null;
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, color && { color }]}>{value}</Text>
      <Text style={s.statUnit}>{unit}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function CartNutritionSummary({ items = [], userAllergies = [] }) {
  const [summary,  setSummary]  = useState(null);
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    if (!items.length) { setSummary(null); setWarnings([]); return; }

    let cancelled = false;

    async function loadNutrition() {
      const names = [...new Set(
        items.map(i => (i.product_name || i.name || '').trim()).filter(Boolean)
      )].slice(0, 20);

      if (!names.length) return;

      // Single query: get cached nutrition for any matching product names
      const { data: maps } = await supabase
        .from('product_nutrition_map')
        .select('product_name, usda_food_id, confidence_score')
        .in('product_name', names)
        .not('usda_food_id', 'is', null)
        .gte('confidence_score', 0.5)
        .order('confidence_score', { ascending: false });

      if (cancelled || !maps?.length) return;

      const foodIds = [...new Set(maps.map(m => m.usda_food_id).filter(Boolean))];

      const { data: nutrition } = await supabase
        .from('nutrition_cache')
        .select('usda_food_id, calories, protein, carbs, fat, fiber, sodium')
        .in('usda_food_id', foodIds);

      if (cancelled || !nutrition?.length) return;

      const nutritionById = Object.fromEntries(nutrition.map(n => [n.usda_food_id, n]));

      // Build a map: product_name → nutrition
      const nutritionByName = {};
      for (const map of maps) {
        const n = nutritionById[map.usda_food_id];
        if (n && !nutritionByName[map.product_name]) {
          nutritionByName[map.product_name] = n;
        }
      }

      // Aggregate across cart items (treating each item as ~1 serving ~150g)
      const SERVING_G = 150;
      let totCalories = 0, totProtein = 0, totCarbs = 0, totFat = 0;
      let enrichedCount = 0;

      for (const item of items) {
        const name = (item.product_name || item.name || '').trim();
        const n = nutritionByName[name];
        if (!n) continue;
        enrichedCount++;
        const mult = SERVING_G / 100; // scale from per-100g to per-serving
        totCalories += (n.calories ?? 0) * mult;
        totProtein  += (n.protein  ?? 0) * mult;
        totCarbs    += (n.carbs    ?? 0) * mult;
        totFat      += (n.fat      ?? 0) * mult;
      }

      if (!enrichedCount) return;

      const round0 = v => Math.round(v);

      setSummary({
        calories:      round0(totCalories),
        protein:       round0(totProtein),
        carbs:         round0(totCarbs),
        fat:           round0(totFat),
        enrichedCount,
        totalCount:    items.length,
      });

      // Allergen warning: check scanned_products for allergens in cart items
      if (userAllergies.length > 0) {
        const barcodeItems = items.filter(i => i.barcode);
        if (barcodeItems.length > 0) {
          const barcodes = barcodeItems.map(i => i.barcode);
          const { data: scanned } = await supabase
            .from('scanned_products')
            .select('name, allergens')
            .in('barcode', barcodes);

          if (!cancelled && scanned?.length) {
            const found = [];
            for (const sp of scanned) {
              for (const allergen of (sp.allergens ?? [])) {
                const aLow = allergen.toLowerCase();
                if (userAllergies.some(ua => aLow.includes(ua.replace('_', ' '))) && !found.includes(allergen)) {
                  found.push(`${sp.name} contains ${allergen}`);
                }
              }
            }
            if (!cancelled) setWarnings(found);
          }
        }
      }
    }

    loadNutrition();
    return () => { cancelled = true; };
  }, [items, userAllergies]);

  if (!summary) return null;

  const coveragePct = Math.round((summary.enrichedCount / summary.totalCount) * 100);

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={s.cardTitle}>Cart Nutrition</Text>
        <Text style={s.coverage}>{summary.enrichedCount}/{summary.totalCount} items enriched</Text>
      </View>

      <View style={s.statsRow}>
        <Stat label="Calories" value={summary.calories} unit=" kcal" />
        <View style={s.statDivider} />
        <Stat label="Protein"  value={summary.protein}  unit="g" color={GREEN} />
        <View style={s.statDivider} />
        <Stat label="Carbs"    value={summary.carbs}    unit="g" />
        <View style={s.statDivider} />
        <Stat label="Fat"      value={summary.fat}      unit="g" />
      </View>

      {coveragePct < 100 && (
        <Text style={s.note}>
          Estimates based on ~150g per item for {summary.enrichedCount} product{summary.enrichedCount !== 1 ? 's' : ''}.
        </Text>
      )}

      {warnings.map((w, i) => (
        <View key={i} style={s.warningRow}>
          <Text style={s.warningIcon}>⚠️</Text>
          <Text style={s.warningText}>{w}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: NAVY },
  coverage:  { fontSize: 11, color: GRAY },

  statsRow: {
    flexDirection: 'row', alignItems: 'stretch',
  },
  stat: {
    flex: 1, alignItems: 'center', gap: 2,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: NAVY },
  statUnit:  { fontSize: 10, color: GRAY, marginTop: -2 },
  statLabel: { fontSize: 11, color: GRAY },
  statDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 4 },

  note: { fontSize: 11, color: GRAY, fontStyle: 'italic' },

  warningRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFF7ED', borderRadius: 10, padding: 10,
  },
  warningIcon: { fontSize: 14 },
  warningText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
});
