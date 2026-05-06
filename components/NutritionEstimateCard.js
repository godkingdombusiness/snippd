/**
 * Register-style cart nutrition estimate (heuristic, not medical advice).
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const NAVY = '#1A237E';
const MINT = '#E8F5E9';
const GREEN = '#2E7D32';
const GRAY = '#64748B';

function estimateLine(item) {
  const name = String(item.product_name || item.name || '').toLowerCase();
  const qty = item.deal_type === 'BOGO'
    ? 2
    : Math.max(1, item.quantity || 1);
  let cal = 180, protein = 9, carbs = 22, fat = 6;
  if (/milk|yogurt|cheese|cream|dairy/.test(name)) {
    cal = 140; protein = 10; carbs = 12; fat = 5;
  } else if (/chicken|beef|pork|turkey|fish|salmon|protein|meat/.test(name)) {
    cal = 220; protein = 28; carbs = 2; fat = 10;
  } else if (/bread|cereal|pasta|rice|oat|tortilla|chip/.test(name)) {
    cal = 200; protein = 5; carbs = 38; fat = 3;
  } else if (/vegetable|broccoli|spinach|salad|carrot|lettuce|produce|fruit|apple|banana/.test(name)) {
    cal = 60; protein = 2; carbs = 14; fat = 0.5;
  } else if (/soda|juice|drink|water|coffee|tea|beer|wine/.test(name)) {
    cal = 90; protein = 0; carbs = 22; fat = 0;
  } else if (/oil|butter|nut|peanut|almond/.test(name)) {
    cal = 190; protein = 4; carbs = 4; fat = 18;
  }
  return {
    cal: cal * qty,
    protein: protein * qty,
    carbs: carbs * qty,
    fat: fat * qty,
  };
}

export default function NutritionEstimateCard({ items = [] }) {
  const totals = useMemo(() => {
    let cal = 0, protein = 0, carbs = 0, fat = 0;
    for (const it of items) {
      const t = estimateLine(it);
      cal += t.cal;
      protein += t.protein;
      carbs += t.carbs;
      fat += t.fat;
    }
    return {
      calories: Math.round(cal),
      protein_g: Math.round(protein),
      carbs_g: Math.round(carbs),
      fat_g: Math.round(fat * 10) / 10,
    };
  }, [items]);

  if (!items.length) return null;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>Nutrition estimate</Text>
      <Text style={styles.sub}>
        Rough totals from your cart lines — the Intelligence Layer uses category heuristics, not laboratory analysis.
      </Text>
      <View style={styles.grid}>
        <View style={styles.cell}>
          <Text style={styles.val}>{totals.calories}</Text>
          <Text style={styles.lbl}>Calories</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.val}>{totals.protein_g}g</Text>
          <Text style={styles.lbl}>Protein</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.val}>{totals.carbs_g}g</Text>
          <Text style={styles.lbl}>Carbs</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.val}>{totals.fat_g}g</Text>
          <Text style={styles.lbl}>Fat</Text>
        </View>
      </View>
      <Text style={styles.disclaimer}>
        Not medical advice. For dietary conditions, follow your clinician&apos;s guidance.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: MINT,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(26, 35, 126, 0.12)',
    marginBottom: 12,
  },
  title: { fontSize: 15, fontWeight: '800', color: NAVY, marginBottom: 6 },
  sub:   { fontSize: 12, color: GRAY, lineHeight: 17, marginBottom: 14 },
  grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell:  { width: '22%', minWidth: 72 },
  val:   { fontSize: 18, fontWeight: '800', color: GREEN },
  lbl:   { fontSize: 10, fontWeight: '700', color: NAVY, marginTop: 2 },
  disclaimer: {
    marginTop: 14,
    fontSize: 11,
    color: GRAY,
    fontStyle: 'italic',
    lineHeight: 16,
  },
});
