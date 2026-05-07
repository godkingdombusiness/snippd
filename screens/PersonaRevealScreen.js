// screens/PersonaRevealScreen.js
// Animated persona reveal — calculates user archetype from all collected data
// Navigation: DeepPersonalization → PersonaReveal → HowItWorks

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, ScrollView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const GREEN_SOFT = 'rgba(12,158,84,0.12)';
const MINT       = '#F0FBF0';
const MINT_DEEP  = '#E8F5E9';
const NAVY       = '#172250';
const NAVY_DEEP  = '#0E1634';
const WHITE      = '#FFFFFF';
const SLATE      = '#64748B';
const CORAL      = '#FF7043';
const AMBER      = '#F59E0B';
const MINT_POP   = '#C5FFBC';

// ── Persona definitions ───────────────────────────────────────────────────────
const PERSONAS = {
  wellness_optimizer: {
    name: 'The Wellness Optimizer',
    emoji: '🌿',
    tagline: 'Eating clean doesn\'t have to cost more.',
    description: 'You\'re health-conscious and precise. I\'ll find the cleanest products at the best prices and filter out everything on your avoid list automatically.',
    traits: ['Label Reader', 'Quality-First', 'Health-Conscious'],
    color: '#16A34A',
    lightColor: 'rgba(22,163,74,0.12)',
    icon: 'heart',
  },
  performance_athlete: {
    name: 'The Performance Athlete',
    emoji: '💪',
    tagline: 'Fuel your goals at grocery store prices.',
    description: 'You train hard and eat with intention. I\'ll stack deals on your proteins, track your macros budget, and alert you when your performance staples go on sale.',
    traits: ['Macro-Tracker', 'Protein Hunter', 'Prep Master'],
    color: '#7C3AED',
    lightColor: 'rgba(124,58,237,0.12)',
    icon: 'trending-up',
  },
  family_cfo: {
    name: 'The Family CFO',
    emoji: '👨‍👩‍👧‍👦',
    tagline: 'Feed your household without the financial stress.',
    description: 'You\'re the one making sure everyone is fed, happy, and on budget. I\'ll optimize for variety, bulk deals, and make sure nothing goes to waste.',
    traits: ['Household Optimizer', 'Bulk Buyer', 'Variety Seeker'],
    color: AMBER,
    lightColor: 'rgba(245,158,11,0.12)',
    icon: 'users',
  },
  savings_hunter: {
    name: 'The Savings Hunter',
    emoji: '🎯',
    tagline: 'Every dollar counts. You find the deals others miss.',
    description: 'Maximum recovery, minimum spend. I\'ll stack every coupon, every sale, and every rebate available so your cart always hits the floor price.',
    traits: ['Deal Stacker', 'Budget-First', 'Brand-Flexible'],
    color: CORAL,
    lightColor: 'rgba(255,112,67,0.12)',
    icon: 'target',
  },
  meal_planner: {
    name: 'The Meal Planner',
    emoji: '📋',
    tagline: 'You plan it. I find every deal in the plan.',
    description: 'You cook from scratch and prep ahead. I\'ll sync deals to your weekly menu, flag your fresh ingredients on sale, and build your shopping list automatically.',
    traits: ['Batch Cooker', 'Recipe Follower', 'Fresh Buyer'],
    color: '#0891B2',
    lightColor: 'rgba(8,145,178,0.12)',
    icon: 'book-open',
  },
  convenience_seeker: {
    name: 'The Speed Shopper',
    emoji: '⚡',
    tagline: 'Quick meals, smart prices, no compromises.',
    description: 'Time is your scarcest resource. I\'ll find the best deals on ready-made and convenience items, and make sure delivery and pickup options are always stacked.',
    traits: ['Time Optimizer', 'Convenience Buyer', 'Multi-Store'],
    color: '#0284C7',
    lightColor: 'rgba(2,132,199,0.12)',
    icon: 'zap',
  },
  smart_stacker: {
    name: 'The Smart Stacker',
    emoji: '🧠',
    tagline: 'You know what you want. I find it at the best price.',
    description: 'You\'re strategic and flexible. I\'ll layer every applicable deal — sale, loyalty, coupon, rebate — so your cart is always optimized before checkout.',
    traits: ['Multi-Store', 'Comparison Buyer', 'Coupon Stacker'],
    color: GREEN,
    lightColor: GREEN_SOFT,
    icon: 'layers',
  },
};

// ── Persona calculation ───────────────────────────────────────────────────────
function calculatePersona(data) {
  const {
    household = {},
    missions  = [],
    cookingStyle = [],
    foodsAvoided = [],
    weeklyBudget = 0,
    preferred_stores = [],
  } = data;

  const totalPeople = Object.values(household).reduce((s, v) => s + v, 0);
  const hasKids = (household.infant ?? 0) + (household.toddler ?? 0)
    + (household.school_age ?? 0) + (household.teenager ?? 0) > 0;

  const hasMedical   = missions.includes('clinical_guardrails') || foodsAvoided.length >= 3;
  const hasAthletic  = missions.includes('athletic_fuel');
  const hasPureSave  = missions.includes('pure_savings');
  const hasProgramTr = missions.includes('program_tracking');

  if (hasMedical || hasProgramTr) return PERSONAS.wellness_optimizer;
  if (hasAthletic) return PERSONAS.performance_athlete;
  if (hasKids && totalPeople >= 3) return PERSONAS.family_cfo;
  if (hasPureSave && weeklyBudget > 0 && weeklyBudget < 120) return PERSONAS.savings_hunter;
  if (cookingStyle.includes('from_scratch') || cookingStyle.includes('meal_prep')) return PERSONAS.meal_planner;
  if (cookingStyle.includes('frozen') || cookingStyle.includes('takeout')) return PERSONAS.convenience_seeker;
  if (missions.length >= 2 || preferred_stores.length >= 3) return PERSONAS.smart_stacker;
  return PERSONAS.smart_stacker;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PersonaRevealScreen({ route, navigation }) {
  const params = route?.params ?? {};
  const persona = calculatePersona(params);

  const [showTraits, setShowTraits] = useState(false);

  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const scaleAnim   = useRef(new Animated.Value(0.84)).current;
  const slideAnim   = useRef(new Animated.Value(32)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const trait1Anim  = useRef(new Animated.Value(0)).current;
  const trait2Anim  = useRef(new Animated.Value(0)).current;
  const trait3Anim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Hero entrance
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 55, friction: 8, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => {
      // Pulse the emoji once
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 260, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.00, duration: 260, useNativeDriver: true }),
      ]).start();

      // Stagger trait badges
      setTimeout(() => {
        setShowTraits(true);
        Animated.stagger(120, [
          Animated.spring(trait1Anim, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
          Animated.spring(trait2Anim, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
          Animated.spring(trait3Anim, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
        ]).start();
      }, 400);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const traitAnims = [trait1Anim, trait2Anim, trait3Anim];

  const weeklyBudget = params.weeklyBudget ?? (params.weekly_budget_cents ? params.weekly_budget_cents / 100 : 0);
  const monthlyEst   = params.projected_monthly_recovery_cents
    ? Math.round(params.projected_monthly_recovery_cents / 100)
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY_DEEP} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Eyebrow ────────────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={styles.eyebrowRow}>
            <View style={styles.aiBadge}>
              <Feather name="cpu" size={12} color={MINT_POP} />
              <Text style={styles.aiBadgeText}>AI Persona Generated</Text>
            </View>
          </View>

          <Text style={styles.revealLabel}>Your shopping persona</Text>
        </Animated.View>

        {/* ── Persona card ───────────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.personaCard,
            { borderColor: persona.color },
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Colored top bar */}
          <View style={[styles.personaTopBar, { backgroundColor: persona.color }]} />

          {/* Emoji */}
          <Animated.Text style={[styles.personaEmoji, { transform: [{ scale: pulseAnim }] }]}>
            {persona.emoji}
          </Animated.Text>

          {/* Name */}
          <Text style={[styles.personaName, { color: persona.color }]}>
            {persona.name}
          </Text>

          {/* Tagline */}
          <Text style={styles.personaTagline}>{persona.tagline}</Text>

          {/* Divider */}
          <View style={[styles.personaDivider, { backgroundColor: persona.lightColor }]} />

          {/* Description */}
          <Text style={styles.personaDesc}>{persona.description}</Text>

          {/* Trait badges */}
          {showTraits && (
            <View style={styles.traitRow}>
              {persona.traits.map((trait, i) => (
                <Animated.View
                  key={trait}
                  style={[
                    styles.traitBadge,
                    { backgroundColor: persona.lightColor, borderColor: persona.color },
                    {
                      opacity: traitAnims[i],
                      transform: [{ scale: traitAnims[i] }],
                    },
                  ]}
                >
                  <Text style={[styles.traitText, { color: persona.color }]}>{trait}</Text>
                </Animated.View>
              ))}
            </View>
          )}
        </Animated.View>

        {/* ── Summary stats ──────────────────────────────────────────────── */}
        <Animated.View
          style={[styles.statsCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          {monthlyEst != null && monthlyEst > 0 && (
            <View style={styles.statRow}>
              <View style={styles.statIconWrap}>
                <Feather name="trending-up" size={16} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statLabel}>Projected monthly recovery</Text>
                <Text style={styles.statValue}>${monthlyEst.toLocaleString()}/mo</Text>
              </View>
            </View>
          )}
          {weeklyBudget > 0 && (
            <View style={styles.statRow}>
              <View style={styles.statIconWrap}>
                <Feather name="dollar-sign" size={16} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statLabel}>Your weekly budget</Text>
                <Text style={styles.statValue}>${weeklyBudget.toFixed(0)}/week</Text>
              </View>
            </View>
          )}
          {(params.preferred_stores ?? []).length > 0 && (
            <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
              <View style={styles.statIconWrap}>
                <Feather name="map-pin" size={16} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statLabel}>Stores I'm watching for you</Text>
                <Text style={styles.statValue}>
                  {(params.preferred_stores ?? []).length} store{(params.preferred_stores ?? []).length > 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* ── What I'll do next ──────────────────────────────────────────── */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={styles.nextTitle}>What I'm building for you</Text>
          {[
            { icon: 'layers',      text: 'Personalized stacks based on your goals, stores, and budget' },
            { icon: 'bell',        text: 'Alerts when your favorite items hit deal prices at your stores' },
            { icon: 'shield',      text: 'Auto-filtering for everything on your avoid list' },
            { icon: 'calendar',    text: 'A weekly plan sized to your exact budget' },
          ].map(({ icon, text }) => (
            <View key={icon} style={styles.nextRow}>
              <View style={styles.nextIconWrap}>
                <Feather name={icon} size={15} color={GREEN} />
              </View>
              <Text style={styles.nextText}>{text}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── CTA ────────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => navigation.navigate('HowItWorks', { persona: persona.name })}
          activeOpacity={0.88}
        >
          <Text style={styles.ctaBtnText}>See How It Works</Text>
          <Feather name="arrow-right" size={18} color={WHITE} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: NAVY_DEEP },

  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
    maxWidth: 540,
    alignSelf: 'center',
    width: '100%',
  },

  // ── Eyebrow ───────────────────────────────────────────────────────────────
  eyebrowRow: { alignItems: 'center', marginBottom: 12 },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(197,255,188,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(197,255,188,0.30)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  aiBadgeText: { fontSize: 11, fontWeight: '700', color: MINT_POP, letterSpacing: 0.8 },
  revealLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.3,
  },

  // ── Persona card ──────────────────────────────────────────────────────────
  personaCard: {
    backgroundColor: WHITE,
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
    marginBottom: 20,
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.35)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
    }),
  },
  personaTopBar: { height: 6 },
  personaEmoji: {
    fontSize: 52,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  personaName: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 6,
    paddingHorizontal: 20,
  },
  personaTagline: {
    fontSize: 14,
    color: SLATE,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 20,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  personaDivider: { height: 1, marginHorizontal: 20, marginBottom: 16 },
  personaDesc: {
    fontSize: 14,
    color: NAVY,
    lineHeight: 22,
    paddingHorizontal: 20,
    marginBottom: 18,
    textAlign: 'center',
  },
  traitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  traitBadge: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  traitText: { fontSize: 12, fontWeight: '700' },

  // ── Stats card ────────────────────────────────────────────────────────────
  statsCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: 24,
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '500', marginBottom: 2 },
  statValue: { fontSize: 16, fontWeight: '800', color: WHITE },

  // ── Next steps ────────────────────────────────────────────────────────────
  nextTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  nextIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  nextText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 21,
  },

  // ── CTA ───────────────────────────────────────────────────────────────────
  ctaBtn: {
    backgroundColor: GREEN,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
    ...Platform.select({
      web: { boxShadow: '0 4px 20px rgba(12,158,84,0.45)' },
      default: { shadowColor: GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
    }),
  },
  ctaBtnText: { fontSize: 17, fontWeight: '800', color: WHITE },
});
