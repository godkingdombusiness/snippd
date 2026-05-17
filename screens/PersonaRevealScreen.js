// screens/PersonaRevealScreen.js
// Persona milestone reveal — all data derived dynamically from onboarding params.
// No hardcoded fallback values. Formulas: monthly = (budget * 4.333) * 0.15, yearly = monthly * 12.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, ScrollView, Platform, StatusBar,
} from 'react-native';
import PropTypes from 'prop-types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const MINT       = '#E8F5E9';
const CREAM      = '#F7FAF8';
const NAVY       = '#172250';
const WHITE      = '#FFFFFF';
const GRAY       = '#6B7280';
const SLATE_BLUE = '#CBD5E1';
const AMBER      = '#F59E0B';
const CORAL      = '#FF7043';

// ── Persona definitions ───────────────────────────────────────────────────────
const PERSONAS = {
  wellness_optimizer: {
    name: 'The Wellness Optimizer',
    tagline: "Eating clean doesn't have to cost more.",
    description: "You're health-conscious and precise. I'll find the cleanest products at the best prices and filter out everything on your avoid list automatically.",
    traits: ['Label Reader', 'Quality-First', 'Health-Conscious'],
    color: GREEN,
  },
  performance_athlete: {
    name: 'The Performance Athlete',
    tagline: 'Fuel your goals at grocery store prices.',
    description: "You train hard and eat with intention. I'll stack deals on your proteins, track your macros budget, and alert you when your performance staples go on sale.",
    traits: ['Macro-Tracker', 'Protein Hunter', 'Prep Master'],
    color: '#7C3AED',
  },
  family_cfo: {
    name: 'The Family CFO',
    tagline: 'Feed your household without the financial stress.',
    description: "You're the one making sure everyone is fed, happy, and on budget. I'll optimize for variety, bulk deals, and make sure nothing goes to waste.",
    traits: ['Household Optimizer', 'Bulk Buyer', 'Variety Seeker'],
    color: AMBER,
  },
  savings_hunter: {
    name: 'The Savings Hunter',
    tagline: 'Every dollar counts. You find the deals others miss.',
    description: "Maximum recovery, minimum spend. I'll stack every coupon, every sale, and every rebate available so your cart always hits the floor price.",
    traits: ['Deal Stacker', 'Budget-First', 'Brand-Flexible'],
    color: CORAL,
  },
  meal_planner: {
    name: 'The Meal Planner',
    tagline: "You plan it. I find every deal in the plan.",
    description: "You cook from scratch and prep ahead. I'll sync deals to your weekly menu, flag your fresh ingredients on sale, and build your shopping list automatically.",
    traits: ['Batch Cooker', 'Recipe Follower', 'Fresh Buyer'],
    color: '#0891B2',
  },
  convenience_seeker: {
    name: 'The Speed Shopper',
    tagline: 'Quick meals, smart prices, no compromises.',
    description: "Time is your scarcest resource. I'll find the best deals on ready-made and convenience items, and make sure delivery and pickup options are always stacked.",
    traits: ['Time Optimizer', 'Convenience Buyer', 'Multi-Store'],
    color: '#0284C7',
  },
  smart_stacker: {
    name: 'The Smart Stacker',
    tagline: "You know what you want. I find it at the best price.",
    description: "You're strategic and flexible. I'll layer every applicable deal — sale, loyalty, coupon, rebate — so your cart is always optimized before checkout.",
    traits: ['Multi-Store', 'Comparison Buyer', 'Coupon Stacker'],
    color: GREEN,
  },
};

// ── Persona calculation — reads new archetype IDs + legacy mission signals ─────
function calculatePersona(data) {
  const {
    household      = {},
    missions       = [],
    cookingStyle   = [],
    foodsAvoided   = [],
    weeklyBudget   = 0,
    preferred_stores = [],
  } = data;

  const totalPeople = Object.values(household).reduce((s, v) => s + v, 0);
  const hasKids     = ((household.infant ?? 0) + (household.toddler ?? 0)
    + (household.school_age ?? 0) + (household.teenager ?? 0)) > 0;

  const hasOrganic     = cookingStyle.includes('clean_organic') || cookingStyle.includes('plant_based');
  const hasHighProtein = cookingStyle.includes('high_protein_macro') || missions.includes('athletic_fuel');
  const hasFamily      = cookingStyle.includes('family_favorites') || (hasKids && totalPeople >= 3);
  const hasConvenience = cookingStyle.includes('quick_convenient') || cookingStyle.includes('frozen') || cookingStyle.includes('takeout');
  const hasMedical     = missions.includes('clinical_guardrails') || foodsAvoided.length >= 3;
  const hasPureSave    = missions.includes('pure_savings');

  if (hasOrganic || hasMedical || missions.includes('program_tracking')) return PERSONAS.wellness_optimizer;
  if (hasHighProtein)                                                      return PERSONAS.performance_athlete;
  if (hasFamily)                                                           return PERSONAS.family_cfo;
  if (hasPureSave && weeklyBudget > 0 && weeklyBudget < 120)               return PERSONAS.savings_hunter;
  if (hasConvenience)                                                      return PERSONAS.convenience_seeker;
  if (cookingStyle.includes('from_scratch') || cookingStyle.includes('meal_prep')) return PERSONAS.meal_planner;
  if (missions.length >= 2 || preferred_stores.length >= 3)               return PERSONAS.smart_stacker;
  return PERSONAS.smart_stacker;
}

// ── Static content ────────────────────────────────────────────────────────────
const TRAIT_ICONS = ['tag', 'medal', 'heart'];

const CHECKLIST = [
  'Tailored deal stacks match your specific needs.',
  'Weekly plans focus only on your exact goals.',
  'Price drop alerts tracked on your priority items.',
  'Auto-filtering blocks everything on your avoid list.',
];

// ─────────────────────────────────────────────────────────────────────────────
export default function PersonaRevealScreen({ route, navigation }) {
  const params  = route?.params ?? {};
  const persona = calculatePersona(params);

  const [showTraits, setShowTraits] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 560, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 55, friction: 8, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 480, useNativeDriver: true }),
    ]).start(() => setTimeout(() => setShowTraits(true), 220));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core state calculations ───────────────────────────────────────────────
  const weeklyBudget   = params.weeklyBudget ?? (params.weekly_budget_cents ? params.weekly_budget_cents / 100 : 0);
  const storeCount     = (params.preferred_stores ?? []).length;
  const monthlySavings = Math.round((weeklyBudget * 4.333) * 0.15);
  const yearlySavings  = Math.round(monthlySavings * 12);
  const sectionLabel   = 'HOW SNIPPD CAN HELP ' + persona.name.toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Block 1: Header ─────────────────────────────────────────── */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={styles.aiBadgeWrap}>
            <View style={styles.aiBadge}>
              <Feather name="cpu" size={12} color={GREEN} />
              <Text style={styles.aiBadgeText}>AI Persona Generated</Text>
            </View>
          </View>
          <Text style={styles.screenTitle}>Your Snippd Shopping Persona</Text>
        </Animated.View>

        {/* ── Block 1: Identity Card — solid persona color ─────────────── */}
        <Animated.View
          style={[
            styles.identityCard,
            { backgroundColor: persona.color },
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* White circle + leaf icon */}
          <View style={styles.leafCircle}>
            <FontAwesome5 name="leaf" size={26} color={persona.color} solid />
          </View>

          <Text style={styles.personaName}>{persona.name}</Text>
          <Text style={styles.personaTagline}>{persona.tagline}</Text>
          <View style={styles.personaDivider} />
          <Text style={styles.personaDesc}>{persona.description}</Text>

          {/* White capsule trait pills with filled icons */}
          {showTraits && (
            <View style={styles.traitRow}>
              {persona.traits.map((trait, i) => (
                <View key={trait} style={styles.traitPill}>
                  <FontAwesome5
                    name={TRAIT_ICONS[i] ?? 'tag'}
                    size={11}
                    color={persona.color}
                    solid
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[styles.traitPillText, { color: persona.color }]}>{trait}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Adjust preferences link */}
          <TouchableOpacity
            style={styles.adjustLink}
            onPress={() => navigation.navigate('Onboarding')}
            activeOpacity={0.7}
          >
            <Text style={styles.adjustLinkText}>Adjust My Preferences</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Block 2: Status Tracking Rows ────────────────────────────── */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <View style={styles.statusIconWrap}>
                <Feather name="dollar-sign" size={16} color={GREEN} />
              </View>
              <Text style={styles.statusLabel}>Weekly Budget</Text>
            </View>
            <Text style={styles.statusValue}>
              {weeklyBudget > 0 ? `$${Math.round(weeklyBudget)} / week` : '—'}
            </Text>
          </View>

          <View style={[styles.statusRow, { marginTop: 10 }]}>
            <View style={styles.statusLeft}>
              <View style={styles.statusIconWrap}>
                <Feather name="map-pin" size={16} color={GREEN} />
              </View>
              <Text style={styles.statusLabel}>Stores Watched</Text>
            </View>
            <Text style={styles.statusValue}>
              {storeCount > 0 ? `${storeCount} store${storeCount !== 1 ? 's' : ''}` : '—'}
            </Text>
          </View>
        </Animated.View>

        {/* ── Block 3: Financial Outlook Split-Grid ────────────────────── */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={styles.sectionLabel}>{sectionLabel}</Text>

          <View style={styles.savingsGrid}>
            {/* Monthly savings card */}
            <View style={[styles.savingsCard, { borderColor: persona.color }]}>
              <View style={styles.savingsIconCircle}>
                <FontAwesome5 name="dollar-sign" size={18} color={GREEN} solid />
              </View>
              <Text style={styles.savingsValue}>
                ${monthlySavings}
                <Text style={styles.savingsPer}> /mo</Text>
              </Text>
              <Text style={styles.savingsSub}>
                Estimated value derived based on your unique profile analysis.
              </Text>
            </View>

            {/* Yearly savings card */}
            <View style={[styles.savingsCard, styles.savingsCardAmber]}>
              <View style={styles.savingsIconCircleAmber}>
                <FontAwesome5 name="chart-bar" size={18} color={AMBER} solid />
              </View>
              <Text style={[styles.savingsValue, styles.savingsValueAmber]}>
                ${yearlySavings.toLocaleString()}
                <Text style={styles.savingsPer}> /yr</Text>
              </Text>
              <Text style={styles.savingsSub}>
                Equivalent to 2 months of free groceries.
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Block 4: Game Plan Checklist Card ────────────────────────── */}
        <Animated.View style={[styles.gamePlanCard, { opacity: fadeAnim }]}>
          <View style={styles.gamePlanHeader}>
            <FontAwesome5 name="shield-alt" size={18} color={GREEN} solid />
            <Text style={styles.gamePlanTitle}>Engineered For Your Game Plan</Text>
          </View>
          {CHECKLIST.map((item) => (
            <View key={item} style={styles.checkRow}>
              <View style={styles.checkIconWrap}>
                <Feather name="check" size={13} color={GREEN} />
              </View>
              <Text style={styles.checkText}>{item}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── Disclaimer ────────────────────────────────────────────────── */}
        <Text style={styles.disclaimer}>
          We will update this persona periodically based on usage and behavioral data to perfectly align with your current goals.
        </Text>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => navigation.navigate('TodayDecision')}
          activeOpacity={0.88}
        >
          <Text style={styles.ctaBtnText}>See What's For Today</Text>
          <Feather name="arrow-right" size={18} color={WHITE} style={{ marginLeft: 8 }} />
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

PersonaRevealScreen.propTypes = {
  route:      PropTypes.shape({ params: PropTypes.object }),
  navigation: PropTypes.shape({ navigate: PropTypes.func.isRequired }).isRequired,
};

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: CREAM },
  content: {
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 56,
    maxWidth: 540, alignSelf: 'center', width: '100%',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  aiBadgeWrap: { alignItems: 'center', marginBottom: 12 },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(12,158,84,0.10)',
    borderWidth: 1, borderColor: 'rgba(12,158,84,0.22)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  aiBadgeText: { fontSize: 12, fontWeight: '700', color: GREEN, letterSpacing: 0.4 },
  screenTitle: {
    fontSize: 22, fontWeight: '800', color: NAVY,
    textAlign: 'center', letterSpacing: -0.4, marginBottom: 20,
  },

  // ── Identity Card ─────────────────────────────────────────────────────────
  identityCard: {
    borderRadius: 24, padding: 24, marginBottom: 18, alignItems: 'center',
    ...Platform.select({
      web:     { boxShadow: '0 8px 32px rgba(0,0,0,0.14)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 20, elevation: 8 },
    }),
  },
  leafCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: WHITE,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
    ...Platform.select({
      web:     { boxShadow: '0 2px 10px rgba(0,0,0,0.10)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 },
    }),
  },
  personaName: {
    fontSize: 26, fontWeight: '800', color: WHITE,
    textAlign: 'center', letterSpacing: -0.5, marginBottom: 6,
  },
  personaTagline: {
    fontSize: 15, color: 'rgba(255,255,255,0.82)',
    textAlign: 'center', lineHeight: 22,
    paddingHorizontal: 12, marginBottom: 16, fontStyle: 'italic',
  },
  personaDivider: {
    height: 1, width: '80%',
    backgroundColor: 'rgba(255,255,255,0.22)', marginBottom: 16,
  },
  personaDesc: {
    fontSize: 14, color: 'rgba(255,255,255,0.88)',
    lineHeight: 22, textAlign: 'center', marginBottom: 20,
  },
  traitRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    justifyContent: 'center', paddingHorizontal: 8, marginBottom: 20,
  },
  traitPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: WHITE, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  traitPillText: { fontSize: 13, fontWeight: '700' },
  adjustLink:     { paddingVertical: 8 },
  adjustLinkText: {
    fontSize: 14, color: WHITE, fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // ── Status rows ───────────────────────────────────────────────────────────
  statusRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1.5, borderColor: SLATE_BLUE,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  statusLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
  },
  statusLabel: { fontSize: 14, fontWeight: '600', color: NAVY },
  statusValue: { fontSize: 17, fontWeight: '800', color: GREEN },

  // ── Financial split-grid ──────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: GRAY,
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: 28, marginBottom: 14, textAlign: 'center',
  },
  savingsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  savingsCard: {
    flex: 1, backgroundColor: WHITE, borderRadius: 16,
    borderWidth: 2, borderColor: GREEN,
    padding: 16, alignItems: 'center',
  },
  savingsCardAmber: { borderColor: '#FDE68A' },
  savingsIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  savingsIconCircleAmber: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  savingsValue: {
    fontSize: 26, fontWeight: '900', color: GREEN,
    letterSpacing: -0.5, textAlign: 'center', marginBottom: 6,
  },
  savingsValueAmber: { color: AMBER },
  savingsPer: { fontSize: 13, fontWeight: '500', color: GRAY },
  savingsSub: { fontSize: 11, color: GRAY, lineHeight: 16, textAlign: 'center' },

  // ── Game Plan card ────────────────────────────────────────────────────────
  gamePlanCard: {
    backgroundColor: WHITE, borderRadius: 18,
    borderWidth: 2, borderColor: GREEN,
    padding: 20, marginBottom: 16,
  },
  gamePlanHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18,
  },
  gamePlanTitle: { fontSize: 16, fontWeight: '800', color: NAVY, flex: 1 },
  checkRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  checkIconWrap: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  checkText: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 21 },

  // ── Disclaimer ────────────────────────────────────────────────────────────
  disclaimer: {
    fontSize: 12, color: GRAY, lineHeight: 18,
    textAlign: 'center', paddingHorizontal: 16, marginBottom: 8,
  },

  // ── CTA ───────────────────────────────────────────────────────────────────
  ctaBtn: {
    backgroundColor: GREEN, borderRadius: 16, paddingVertical: 20,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
    marginTop: 20,
    ...Platform.select({
      web:     { boxShadow: '0 4px 20px rgba(12,158,84,0.40)' },
      default: { shadowColor: GREEN, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 7 },
    }),
  },
  ctaBtnText: { fontSize: 18, fontWeight: '800', color: WHITE },
});
