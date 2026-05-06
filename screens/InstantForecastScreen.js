// screens/InstantForecastScreen.js
// Step 2 of the new onboarding flow.
// Computes forecast locally (no network call needed) and shows it immediately.
// Fires forecast_viewed memory event + saves forecast_completed to user_persona.

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { recordMemoryEvent } from '../src/lib/memoryEvents';

const GREEN      = '#0C9E54';
const GREEN_SOFT = 'rgba(12,158,84,0.10)';
const NAVY       = '#1A237E';
const NAVY_DEEP  = '#04361D';
const MINT       = '#F0FBF0';
const MINT_DEEP  = '#E8F5E9';
const WHITE      = '#FFFFFF';
const SLATE      = '#64748B';
const BORDER     = '#E2E8F0';
const CORAL      = '#FF7043';
const AMBER      = '#F59E0B';

// ── Forecast math ─────────────────────────────────────────────────────────────
// All amounts in CENTS.

const BUDGET_MIDPOINTS = {
  '<75':     5500,   // $55/week × 4.33 ≈ $238/mo
  '75-125':  10000,  // $100/week
  '125-200': 15500,  // $155/week
  '200+':    24000,  // $240/week
};

const GOAL_SAVINGS_BOOST = {
  save_money:        0.07,
  eat_healthier:     0.04,
  save_time:         0.03,
  manage_allergies:  0.05,
  nutrition_program: 0.04,
  athletic_fuel:     0.05,
};

const BASE_SAVINGS_RATE = 0.16;

function computeForecast(budgetRange, primaryGoal) {
  const weeklyBudget  = BUDGET_MIDPOINTS[budgetRange] ?? 10000;
  const monthlyBudget = Math.round(weeklyBudget * 4.33);
  const rate          = BASE_SAVINGS_RATE + (GOAL_SAVINGS_BOOST[primaryGoal] ?? 0);
  const monthly       = Math.round(monthlyBudget * rate);
  const annual        = monthly * 12;
  const withSnippd    = monthlyBudget - monthly;
  return {
    monthlyBudget,
    monthly,
    annual,
    withSnippd,
    pct: Math.round(rate * 100),
  };
}

// ── Example meals per goal ─────────────────────────────────────────────────────

const SAMPLE_STACKS = {
  save_money:       ['Chicken thighs + rice + broccoli', 'Pasta marinara + garlic bread', 'Bean & veggie stir-fry'],
  eat_healthier:    ['Grilled salmon + quinoa + asparagus', 'Greek chicken wrap + side salad', 'Lentil soup + whole grain toast'],
  save_time:        ['Rotisserie chicken + frozen veg + rice', 'Deli turkey wrap + apple', 'Sheet pan sausage + potatoes'],
  manage_allergies: ['GF pasta + turkey bolognese', 'Rice bowl + grilled veg + avocado', 'Chicken + sweet potato + green beans'],
  nutrition_program:['Lean beef + sweet potato + spinach', 'Turkey meatballs + zucchini pasta', 'Egg white frittata + peppers'],
  athletic_fuel:    ['Chicken breast + brown rice + broccoli', 'Salmon + quinoa + kale salad', 'Eggs + oatmeal + banana'],
};

function fmtDollars(cents) {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

// ── Sub-components (defined outside to avoid remount) ─────────────────────────

function MetricCard({ label, value, sub, accent }) {
  return (
    <View style={[styles.metricCard, accent && styles.metricCardAccent]}>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
      <Text style={[styles.metricLabel, accent && styles.metricLabelAccent]}>{label}</Text>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  );
}

function MealRow({ meal, index }) {
  return (
    <View style={styles.mealRow}>
      <View style={styles.mealNum}>
        <Text style={styles.mealNumText}>{index + 1}</Text>
      </View>
      <Text style={styles.mealText}>{meal}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function InstantForecastScreen({ route, navigation }) {
  const { budgetRange, household, goal } = route?.params ?? {};
  const forecast = computeForecast(budgetRange ?? '75-125', goal ?? 'save_money');
  const meals    = SAMPLE_STACKS[goal] ?? SAMPLE_STACKS.save_money;

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();

    // Persist forecast_completed + projected savings — fire and forget
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('user_persona').upsert({
        user_id:                          user.id,
        forecast_completed:               true,
        projected_monthly_recovery_cents: forecast.monthly,
      }, { onConflict: 'user_id' }).catch(() => {});

      recordMemoryEvent({
        event_type: 'forecast_viewed',
        metadata: {
          budget_range:       budgetRange,
          household,
          goal,
          monthly_recovery:   forecast.monthly,
          savings_pct:        forecast.pct,
        },
      });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function goPersonalize() {
    recordMemoryEvent({ event_type: 'personalization_started', metadata: { source: 'forecast_cta' } });
    navigation.navigate('SoftPersonalization', { budgetRange, household, goal });
  }

  function goUnlock() {
    navigation.replace('MainApp');
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Dark hero header */}
      <View style={styles.hero}>
        <View style={styles.heroEyebrowRow}>
          <View style={styles.liveDot} />
          <Text style={styles.heroEyebrow}>ESTIMATED RECOVERY OPPORTUNITY</Text>
        </View>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Text style={styles.heroAmount}>{fmtDollars(forecast.monthly)}</Text>
          <Text style={styles.heroAmountSub}>per month · possible</Text>

          <View style={styles.annualPill}>
            <Feather name="trending-up" size={13} color={GREEN} />
            <Text style={styles.annualPillText}>
              {fmtDollars(forecast.annual)} possible per year
            </Text>
          </View>
        </Animated.View>

        <Text style={styles.heroDisclaimer}>
          Based on your answers. Actual savings vary. Snippd finds verified deals — we never guarantee a number.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Monthly comparison ──────────────────────────────────────────── */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Estimated monthly spend</Text>
            <View style={styles.metricsRow}>
              <MetricCard
                label="Without Snippd"
                value={fmtDollars(forecast.monthlyBudget)}
                sub="full price"
              />
              <View style={styles.metricDivider}>
                <Feather name="arrow-right" size={16} color={SLATE} />
              </View>
              <MetricCard
                label="With Snippd"
                value={fmtDollars(forecast.withSnippd)}
                sub={`~${forecast.pct}% recovered`}
                accent
              />
            </View>
            <View style={styles.savingsBar}>
              <View style={[styles.savingsBarFill, { width: `${Math.min(forecast.pct, 100)}%` }]} />
            </View>
            <Text style={styles.savingsBarLabel}>Estimated {forecast.pct}% recovery rate</Text>
          </View>

          {/* ── Example weekly stack ────────────────────────────────────────── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Example weekly stack</Text>
              <View style={styles.dinnersBadge}>
                <Text style={styles.dinnersBadgeText}>3 dinners covered</Text>
              </View>
            </View>
            <Text style={styles.sectionSub}>Based on your goal: {(goal ?? '').replace(/_/g, ' ')}</Text>
            {meals.map((meal, i) => (
              <MealRow key={meal} meal={meal} index={i} />
            ))}
            <Text style={styles.mealDisclaimer}>
              Snippd matches these meals to live store deals and verified coupons.
            </Text>
          </View>

          {/* ── How Snippd works ────────────────────────────────────────────── */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>How Snippd finds your floor price</Text>
            {[
              { icon: 'search',       text: 'Scans 1,000+ verified deals across your preferred stores' },
              { icon: 'layers',       text: 'Stacks sales, coupons, and rebates — in the right order' },
              { icon: 'cpu',          text: 'Builds your weekly plan around the lowest total basket cost' },
              { icon: 'check-circle', text: 'Confirms prices before you shop — no surprises at checkout' },
            ].map(({ icon, text }) => (
              <View key={icon} style={styles.howRow}>
                <View style={styles.howIcon}>
                  <Feather name={icon} size={15} color={GREEN} />
                </View>
                <Text style={styles.howText}>{text}</Text>
              </View>
            ))}
          </View>

        </Animated.View>
      </ScrollView>

      {/* ── CTA footer ──────────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.ctaPrimary} onPress={goPersonalize} activeOpacity={0.85}>
          <Text style={styles.ctaPrimaryText}>Personalize my plan</Text>
          <Feather name="arrow-right" size={16} color={WHITE} />
        </TouchableOpacity>

        <View style={styles.ctaSecondaryRow}>
          <TouchableOpacity style={styles.ctaSecondary} onPress={() => goUnlock(false)} activeOpacity={0.8}>
            <Feather name="unlock" size={14} color={NAVY} />
            <Text style={styles.ctaSecondaryText}>Unlock full beta</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.ctaSecondary} onPress={() => goUnlock(true)} activeOpacity={0.8}>
            <Feather name="tag" size={14} color={CORAL} />
            <Text style={[styles.ctaSecondaryText, { color: CORAL }]}>Enter promo code</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: NAVY_DEEP },

  // Hero
  hero: {
    backgroundColor: NAVY_DEEP,
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24,
  },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  heroEyebrow: {
    fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  heroAmount: {
    fontSize: 60, fontWeight: '900', color: WHITE,
    letterSpacing: -2, lineHeight: 66,
  },
  heroAmountSub: {
    fontSize: 14, color: 'rgba(255,255,255,0.5)',
    fontWeight: '500', marginTop: 2, marginBottom: 12,
  },
  annualPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: GREEN_SOFT, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'flex-start', marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(12,158,84,0.3)',
  },
  annualPillText: { fontSize: 13, fontWeight: '700', color: '#C5FFBC' },
  heroDisclaimer: {
    fontSize: 11, color: 'rgba(255,255,255,0.35)',
    lineHeight: 16, fontStyle: 'italic',
  },

  // Body
  body: {
    backgroundColor: MINT,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24, gap: 16,
  },

  // Section cards
  sectionCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 20, gap: 12,
    ...Platform.select({
      web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
    }),
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionSub: { fontSize: 13, color: SLATE, textTransform: 'capitalize' },

  // Metrics
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricCard: {
    flex: 1, backgroundColor: MINT_DEEP, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', gap: 2,
  },
  metricCardAccent: { backgroundColor: GREEN, },
  metricValue: { fontSize: 20, fontWeight: '900', color: NAVY },
  metricValueAccent: { color: WHITE },
  metricLabel: { fontSize: 11, color: SLATE, fontWeight: '600', textAlign: 'center' },
  metricLabelAccent: { color: 'rgba(255,255,255,0.8)' },
  metricSub: { fontSize: 11, color: GREEN, fontWeight: '600' },
  metricDivider: { alignItems: 'center', paddingHorizontal: 4 },

  // Savings bar
  savingsBar: {
    height: 6, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden',
  },
  savingsBarFill: { height: '100%', backgroundColor: GREEN, borderRadius: 3 },
  savingsBarLabel: { fontSize: 12, color: GREEN, fontWeight: '600' },

  // Meals
  dinnersBadge: {
    backgroundColor: GREEN_SOFT, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  dinnersBadgeText: { fontSize: 11, fontWeight: '700', color: GREEN },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mealNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: GREEN_SOFT, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  mealNumText: { fontSize: 12, fontWeight: '800', color: GREEN },
  mealText: { flex: 1, fontSize: 14, color: NAVY, fontWeight: '500', lineHeight: 20 },
  mealDisclaimer: { fontSize: 12, color: SLATE, lineHeight: 18, fontStyle: 'italic' },

  // How it works
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  howIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: GREEN_SOFT, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  howText: { flex: 1, fontSize: 14, color: SLATE, lineHeight: 20 },

  // Footer CTAs
  footer: {
    backgroundColor: MINT, borderTopWidth: 1, borderTopColor: BORDER,
    paddingHorizontal: 20, paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 16 : 24, gap: 10,
  },
  ctaPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 17,
  },
  ctaPrimaryText: { fontSize: 17, fontWeight: '800', color: WHITE },
  ctaSecondaryRow: { flexDirection: 'row', gap: 10 },
  ctaSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingVertical: 13, backgroundColor: WHITE,
  },
  ctaSecondaryText: { fontSize: 13, fontWeight: '700', color: NAVY },
});
