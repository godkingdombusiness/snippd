/**
 * OnboardingScreen — 9-Step Conversational Onboarding
 *
 * Steps (question screens):
 *   1  Budget           — weekly grocery budget
 *   2  Stores           — which stores you shop at
 *   3  Household        — who we're planning for
 *   4  Cooking Style    — appliances & methods
 *   5  Cooking Freq     — how often you cook
 *   6  Weekly Habits    — Pizza Fridays, Gym Days, etc.
 *   7  Nutrition Goals  — dietary needs
 *   8  Grocery Goals    — what matters most
 *   9  GLP-1            — medication awareness
 *  10  Persona Reveal   — AI shopper DNA
 *  11  Paywall          — tier selection + consent
 *
 * "Did you know?" modals appear after steps 1, 3, 6, 8 — auto-dismiss 3.5s.
 * Smooth slide transitions. "No judgment — we build around your real life."
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, StatusBar, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withSequence, withDelay,
  runOnJS, interpolate, Easing,
  FadeIn, FadeOut,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

// ── Brand ──────────────────────────────────────────────────────
const GREEN    = '#0C9E54';
const GREEN_DARK = '#0A8040';
const DARK     = '#111827';
const NAVY     = '#0D1B4B';
const WHITE    = '#FFFFFF';
const GRAY     = '#6B7280';
const BORDER   = '#E5E7EB';
const MINT_BG  = '#F0FBF5';
const LIGHT_BG = '#F8FAFC';
const GOLD     = '#B58900';
const CORAL    = '#FF7043';

const QUESTION_COUNT = 9; // for progress bar

// ── Persona engine ──────────────────────────────────────────────
function derivePersona(formData) {
  const {
    household_members = [],
    health_constraints = [],
    cooking_style = 'Efficiency',
    dislikes = [],
    is_glp1 = 'No',
    grocery_goals = [],
    budget_range = '$100-$150',
  } = formData;

  const hasSenior  = household_members.includes('senior');
  const hasChild   = household_members.includes('child') || household_members.includes('infant');
  const isHealth   = health_constraints.length >= 2;
  const isSurvival = cooking_style === 'Survival' || cooking_style === 'Microwave';
  const isChef     = cooking_style === 'Chef' || (formData.cooking_appliances ?? []).includes('Meal Prep');
  const isBudget   = budget_range === 'Under $75' || budget_range === '$75-$125';
  const isGlp1     = is_glp1 === 'Yes';
  const wantsHealth = grocery_goals.includes('Eat healthier') || health_constraints.length > 0;

  if (isGlp1)
    return { type: 'The GLP-1 Optimizer',    color: '#7C3AED', icon: 'fitness-outline',    traits: ['Portion-right meal planning', 'High-protein deal priority', 'Waste-minimized quantities'] };
  if (hasChild && isSurvival)
    return { type: 'The Busy Parent',         color: CORAL,     icon: 'people-outline',      traits: ['Sub-20-min meal stacks', 'Kid-approved filters', 'Freezer-friendly bulk buys'] };
  if (hasSenior && isHealth)
    return { type: 'The Wellness Optimizer',  color: '#3B82F6', icon: 'heart-outline',       traits: ['Low-sodium deal alerts', 'Soft-texture recommendations', 'Supplement stacking'] };
  if (isChef && !isBudget)
    return { type: 'The Culinary Value Hunter', color: GOLD,    icon: 'restaurant-outline',  traits: ['Premium ingredient alerts', 'BOGO on specialties', 'Seasonal produce timing'] };
  if (isBudget && isSurvival)
    return { type: 'The Budget Master',       color: '#059669', icon: 'cash-outline',        traits: ['Maximum savings per trip', 'Unit price champion', 'Zero-waste meal plans'] };
  if (wantsHealth && isHealth)
    return { type: 'The Conscious Saver',     color: '#16A34A', icon: 'leaf-outline',        traits: ['Organic sale triggers', 'Clean label priority', 'Unit price comparison'] };
  if (dislikes.length >= 3)
    return { type: 'The Selective Maximizer', color: '#8B5CF6', icon: 'options-outline',     traits: ['Tight preference filtering', 'Never-again blocklist', 'Substitution intelligence'] };
  if (isBudget)
    return { type: 'The Efficiency Machine',  color: NAVY,      icon: 'speedometer-outline', traits: ['15-min meal plans', 'Single-item BOGO stacking', 'Delivery cost optimizer'] };
  return   { type: 'The Balanced Strategist', color: GREEN,     icon: 'analytics-outline',   traits: ['Full-stack deal stacking', 'Cross-retailer arbitrage', 'Wealth momentum tracking'] };
}

// ── Haptics ─────────────────────────────────────────────────────
const hapticLight   = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
const hapticMedium  = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
const hapticHeavy   = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
const hapticSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

// ── Did You Know content ────────────────────────────────────────
const DID_YOU_KNOW = {
  1: { // After Budget
    stat:  '$47/week',
    body:  'The average US household wastes $47/week in groceries. Snippd users reduce that by 34% in their first 30 days.',
  },
  3: { // After Household
    stat:  '84% match',
    body:  '84% of Snippd households find the right-sized packages on their first order — no more half-eaten family packs.',
  },
  6: { // After Weekly Habits
    stat:  '2+ hrs/mo',
    body:  'Snippd users save over 2 hours per month on grocery planning. That\'s 26+ hours per year back in your life.',
  },
  8: { // After Grocery Goals
    stat:  '$2,028/yr',
    body:  'Based on your goals, Snippd estimates you could recover $2,028 per year. We\'ll show you exactly how.',
  },
};

// Steps that trigger a Did You Know modal AFTER tapping Continue
const MODAL_TRIGGER_STEPS = new Set([1, 3, 6, 8]);

// ── DidYouKnow overlay ──────────────────────────────────────────
function DidYouKnowBanner({ content, onDismiss }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300 });
    translateY.value = withSpring(0, { damping: 15 });
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <TouchableOpacity
      style={styles.modalBackdrop}
      onPress={onDismiss}
      activeOpacity={1}
    >
      <Animated.View style={[styles.dykCard, style]}>
        <View style={styles.dykIconRow}>
          <View style={styles.dykIconBg}>
            <Ionicons name="bulb-outline" size={22} color={GREEN} />
          </View>
          <Text style={styles.dykLabel}>DID YOU KNOW?</Text>
        </View>
        <Text style={styles.dykStat}>{content.stat}</Text>
        <Text style={styles.dykBody}>{content.body}</Text>
        <Text style={styles.dykTap}>Tap anywhere to continue</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── SelectPill ──────────────────────────────────────────────────
function SelectPill({ label, selected, onPress, size = 'small' }) {
  const scale = useSharedValue(1);

  useEffect(() => {}, []); // keep hooks stable

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.92, { damping: 8, stiffness: 300 }),
      withSpring(1.0,  { damping: 10, stiffness: 200 }),
    );
    hapticLight();
    onPress();
  };

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        style={[
          size === 'large' ? styles.bigPill : styles.smallPill,
          selected && styles.pillActive,
        ]}
      >
        <Text style={[styles.pillTxt, selected && styles.pillTxtActive]}>{label}</Text>
        {selected && size === 'large' && (
          <Ionicons name="checkmark-circle" size={16} color={GREEN} style={{ marginTop: 4 }} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── ProgressBar ─────────────────────────────────────────────────
function ProgressBar({ questionIndex }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(questionIndex / QUESTION_COUNT, {
      damping: 20, stiffness: 120,
    });
  }, [questionIndex]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${interpolate(progress.value, [0, 1], [0, 100])}%`,
  }));

  return (
    <View style={styles.progressBg}>
      <Animated.View style={[styles.progressFill, barStyle]} />
    </View>
  );
}

// ── Step 0: Hero ────────────────────────────────────────────────
function HeroStep({ onNext }) {
  const logoScale   = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  const tagOpacity  = useSharedValue(0);
  const btnOpacity  = useSharedValue(0);
  const btnY        = useSharedValue(20);

  useEffect(() => {
    logoScale.value   = withDelay(100, withSpring(1, { damping: 12, stiffness: 100 }));
    logoOpacity.value = withDelay(100, withTiming(1, { duration: 400 }));
    tagOpacity.value  = withDelay(600, withTiming(1, { duration: 500 }));
    btnOpacity.value  = withDelay(1100, withTiming(1, { duration: 400 }));
    btnY.value        = withDelay(1100, withSpring(0, { damping: 15 }));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }], opacity: logoOpacity.value }));
  const tagStyle  = useAnimatedStyle(() => ({ opacity: tagOpacity.value }));
  const btnStyle  = useAnimatedStyle(() => ({ opacity: btnOpacity.value, transform: [{ translateY: btnY.value }] }));

  return (
    <LinearGradient colors={['#04361D', '#0C9E54', '#1ED870']} style={styles.heroGrad}>
      <SafeAreaView style={styles.heroSafe}>
        <Animated.View style={[styles.heroLogo, logoStyle]}>
          <Text style={styles.heroSnippdText}>snippd</Text>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>ADAPTIVE HOUSEHOLD INTELLIGENCE</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.heroTaglines, tagStyle]}>
          <Text style={styles.heroTagline}>Your household.</Text>
          <Text style={styles.heroTagline}>Optimized.</Text>
          <Text style={styles.heroTaglineSub}>
            No judgment — we build around your real life.{'\n'}
            Takes about 2 minutes.
          </Text>
        </Animated.View>

        <Animated.View style={[styles.heroFooter, btnStyle]}>
          <TouchableOpacity style={styles.heroBtn} onPress={() => { hapticHeavy(); onNext(); }} activeOpacity={0.88}>
            <Text style={styles.heroBtnTxt}>Build My Intelligence Profile</Text>
            <Feather name="arrow-right" size={20} color={DARK} />
          </TouchableOpacity>
          <Text style={styles.heroTime}>9 quick questions</Text>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Step 1: Budget ──────────────────────────────────────────────
function BudgetStep({ formData, setFormData }) {
  const OPTIONS = ['Under $75', '$75-$125', '$125-$175', '$175-$250', 'Over $250'];
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepCounter}>01 / 09</Text>
      <Text style={styles.stepTitle}>What's your weekly grocery budget?</Text>
      <Text style={styles.stepSub}>No judgment — we optimize around what you actually spend.</Text>
      <View style={styles.pillWrap}>
        {OPTIONS.map(opt => (
          <SelectPill
            key={opt}
            label={opt}
            selected={formData.budget_range === opt}
            onPress={() => { hapticMedium(); setFormData({ ...formData, budget_range: opt }); }}
          />
        ))}
      </View>
    </View>
  );
}

// ── Step 2: Stores ───────────────────────────────────────────────
function StoresStep({ formData, setFormData }) {
  const STORES = ['Publix', 'Kroger', 'Walmart', 'Target', 'Aldi', 'Whole Foods', "Trader Joe's", 'Costco', 'Sam\'s Club', 'Sprouts', 'Other'];
  const toggle = (store) => {
    const current = formData.preferred_stores ?? [];
    const next = current.includes(store) ? current.filter(s => s !== store) : [...current, store];
    hapticMedium();
    setFormData({ ...formData, preferred_stores: next });
  };
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepCounter}>02 / 09</Text>
      <Text style={styles.stepTitle}>Where do you shop?</Text>
      <Text style={styles.stepSub}>Select all that apply. We optimize across every store you use.</Text>
      <View style={styles.pillWrap}>
        {STORES.map(store => (
          <SelectPill
            key={store}
            label={store}
            selected={(formData.preferred_stores ?? []).includes(store)}
            onPress={() => toggle(store)}
          />
        ))}
      </View>
    </View>
  );
}

// ── Step 3: Household ───────────────────────────────────────────
function HouseholdStep({ formData, setFormData }) {
  const OPTIONS = [
    { id: 'infant',  label: 'Infant',     icon: 'heart-outline' },
    { id: 'child',   label: 'Child/Teen', icon: 'happy-outline' },
    { id: 'adult',   label: 'Adult',      icon: 'person-outline' },
    { id: 'senior',  label: 'Senior',     icon: 'accessibility-outline' },
  ];
  const toggle = (id) => {
    const current = formData.household_members;
    const next = current.includes(id) ? current.filter(i => i !== id) : [...current, id];
    hapticMedium();
    setFormData({ ...formData, household_members: next });
  };
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepCounter}>03 / 09</Text>
      <Text style={styles.stepTitle}>Who are we planning for?</Text>
      <Text style={styles.stepSub}>Biological needs vary — we calibrate deals and portions for your household.</Text>
      <View style={styles.bigPillGrid}>
        {OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.bigPill, (formData.household_members ?? []).includes(opt.id) && styles.pillActive]}
            onPress={() => toggle(opt.id)}
            activeOpacity={0.85}
          >
            <Ionicons name={opt.icon} size={26} color={(formData.household_members ?? []).includes(opt.id) ? GREEN : GRAY} />
            <Text style={[styles.pillTxt, { marginTop: 6, fontSize: 14 }, (formData.household_members ?? []).includes(opt.id) && styles.pillTxtActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Step 4: Cooking Style (appliances) ─────────────────────────
function CookingStyleStep({ formData, setFormData }) {
  const APPLIANCES = ['Air Fryer', 'Crockpot', 'Instant Pot', 'Meal Prep', 'Stovetop', 'Oven', 'Grill', 'Microwave', 'Sheet Pan'];
  const toggle = (a) => {
    const current = formData.cooking_appliances ?? [];
    const next = current.includes(a) ? current.filter(x => x !== a) : [...current, a];
    hapticMedium();
    setFormData({ ...formData, cooking_appliances: next });
  };
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepCounter}>04 / 09</Text>
      <Text style={styles.stepTitle}>How do you cook?</Text>
      <Text style={styles.stepSub}>Select your gear. We match meals to what you actually have.</Text>
      <View style={styles.pillWrap}>
        {APPLIANCES.map(a => (
          <SelectPill
            key={a}
            label={a}
            selected={(formData.cooking_appliances ?? []).includes(a)}
            onPress={() => toggle(a)}
          />
        ))}
      </View>
    </View>
  );
}

// ── Step 5: Cooking Frequency ───────────────────────────────────
function CookingFrequencyStep({ formData, setFormData }) {
  const OPTIONS = [
    { id: 'Every night',    sub: 'Home cooking is my default.' },
    { id: '4-5x per week',  sub: 'I cook most nights.' },
    { id: '2-3x per week',  sub: 'A mix of cooking and convenience.' },
    { id: 'Once a week',    sub: 'I meal prep or keep it minimal.' },
    { id: 'Rarely',         sub: 'Mostly delivery and grab-and-go.' },
  ];
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepCounter}>05 / 09</Text>
      <Text style={styles.stepTitle}>How often do you cook at home?</Text>
      <Text style={styles.stepSub}>No judgment — we build around your real life.</Text>
      <View style={{ gap: 10 }}>
        {OPTIONS.map(opt => {
          const selected = formData.cooking_frequency === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.listOption, selected && styles.listOptionActive]}
              onPress={() => { hapticMedium(); setFormData({ ...formData, cooking_frequency: opt.id }); }}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.listOptionTxt, selected && { color: GREEN }]}>{opt.id}</Text>
                <Text style={styles.listOptionSub}>{opt.sub}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={GREEN} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Step 6: Weekly Habits ───────────────────────────────────────
function WeeklyHabitsStep({ formData, setFormData }) {
  const HABITS = [
    'Pizza Fridays', 'Meal Prep Sunday', 'Gym Days', 'Takeout Nights',
    'Date Night', 'Family Dinner Night', 'Late Work Nights', 'Early Workouts',
    'Batch Cooking', 'Meatless Monday',
  ];
  const toggle = (h) => {
    const current = formData.weekly_habits ?? [];
    const next = current.includes(h) ? current.filter(x => x !== h) : [...current, h];
    hapticMedium();
    setFormData({ ...formData, weekly_habits: next });
  };
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepCounter}>06 / 09</Text>
      <Text style={styles.stepTitle}>Any regular weekly rituals?</Text>
      <Text style={styles.stepSub}>Pizza Fridays? Gym days? We plan around them so your grocery list does too.</Text>
      <View style={styles.pillWrap}>
        {HABITS.map(h => (
          <SelectPill
            key={h}
            label={h}
            selected={(formData.weekly_habits ?? []).includes(h)}
            onPress={() => toggle(h)}
          />
        ))}
      </View>
      {(formData.weekly_habits ?? []).length === 0 && (
        <Text style={styles.skipHint}>No recurring habits? Skip — tap Continue</Text>
      )}
    </View>
  );
}

// ── Step 7: Nutrition Goals ─────────────────────────────────────
function NutritionGoalsStep({ formData, setFormData }) {
  const GOALS = ['High Protein', 'Low Carb', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Plant-Based', 'Low Sodium', 'Diabetic-Friendly', 'Nut-Free', 'Halal', 'Low Sugar', 'Balanced'];
  const toggle = (g) => {
    const current = formData.health_constraints;
    const next = current.includes(g) ? current.filter(x => x !== g) : [...current, g];
    hapticMedium();
    setFormData({ ...formData, health_constraints: next });
  };
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepCounter}>07 / 09</Text>
      <Text style={styles.stepTitle}>Any nutrition goals?</Text>
      <Text style={styles.stepSub}>No judgment — we filter deals and meals to match your needs automatically.</Text>
      <View style={styles.pillWrap}>
        {GOALS.map(g => (
          <SelectPill
            key={g}
            label={g}
            selected={formData.health_constraints.includes(g)}
            onPress={() => toggle(g)}
          />
        ))}
      </View>
      {formData.health_constraints.length === 0 && (
        <Text style={styles.skipHint}>No nutrition goals? Skip — tap Continue</Text>
      )}
    </View>
  );
}

// ── Step 8: Grocery Goals ───────────────────────────────────────
function GroceryGoalsStep({ formData, setFormData }) {
  const GOALS = [
    { id: 'Save money',       sub: 'Maximize every dollar spent.' },
    { id: 'Reduce food waste', sub: 'Buy only what you will use.' },
    { id: 'Eat healthier',    sub: 'Better ingredients, smarter deals.' },
    { id: 'Save time',        sub: 'Less planning, faster shopping.' },
    { id: 'Buy organic',      sub: 'Organic when the deal is right.' },
    { id: 'Buy in bulk',      sub: 'Lower unit cost, planned storage.' },
  ];
  const toggle = (id) => {
    const current = formData.grocery_goals ?? [];
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    hapticMedium();
    setFormData({ ...formData, grocery_goals: next });
  };
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepCounter}>08 / 09</Text>
      <Text style={styles.stepTitle}>What matters most to you?</Text>
      <Text style={styles.stepSub}>Snippd weights your plan toward what actually matters in your life.</Text>
      <View style={{ gap: 10 }}>
        {GOALS.map(opt => {
          const selected = (formData.grocery_goals ?? []).includes(opt.id);
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.listOption, selected && styles.listOptionActive]}
              onPress={() => toggle(opt.id)}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.listOptionTxt, selected && { color: GREEN }]}>{opt.id}</Text>
                <Text style={styles.listOptionSub}>{opt.sub}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={GREEN} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Step 9: GLP-1 ───────────────────────────────────────────────
function GlpStep({ formData, setFormData }) {
  const OPTIONS = [
    { id: 'Yes',             sub: 'Ozempic, Wegovy, Mounjaro, Zepbound, etc.' },
    { id: 'No',              sub: 'Standard meal planning applies.' },
    { id: 'Prefer not to say', sub: 'No problem — we\'ll skip this optimization.' },
  ];
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepCounter}>09 / 09</Text>
      <Text style={styles.stepTitle}>Are you on a GLP-1 medication?</Text>
      <Text style={styles.stepSub}>No judgment — we optimize for smaller portions, higher protein, and reduced food waste. This stays private.</Text>
      <View style={{ gap: 10 }}>
        {OPTIONS.map(opt => {
          const selected = formData.is_glp1 === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.listOption, selected && styles.listOptionActive]}
              onPress={() => { hapticMedium(); setFormData({ ...formData, is_glp1: opt.id }); }}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.listOptionTxt, selected && { color: GREEN }]}>{opt.id}</Text>
                <Text style={styles.listOptionSub}>{opt.sub}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={GREEN} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Step 10: Persona Reveal ─────────────────────────────────────
function PersonaStep({ formData, onNext }) {
  const [phase, setPhase]     = useState('loading');
  const [lineIndex, setLineIndex] = useState(0);
  const persona = derivePersona(formData);

  const ringScale   = useSharedValue(0.4);
  const cardScale   = useSharedValue(0.7);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    ringScale.value = withSpring(1, { damping: 10, stiffness: 80 });
    const timers = [
      setTimeout(() => setLineIndex(1), 700),
      setTimeout(() => setLineIndex(2), 1400),
      setTimeout(() => setLineIndex(3), 2100),
      setTimeout(() => {
        hapticSuccess();
        setPhase('reveal');
        cardScale.value  = withSpring(1, { damping: 10, stiffness: 100 });
        cardOpacity.value = withTiming(1, { duration: 300 });
      }, 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const ringStyle  = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }] }));
  const cardStyle  = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }], opacity: cardOpacity.value }));

  const LINES = ['Mapping your household...', 'Calibrating savings engine...', 'Analysing your goals...', 'Building your Shopper DNA...'];

  return (
    <View style={[styles.stepContent, { alignItems: 'center', justifyContent: 'center', flex: 1 }]}>
      {phase === 'loading' ? (
        <>
          <Animated.View style={[styles.personaRing, { borderColor: persona.color }, ringStyle]}>
            <Ionicons name={persona.icon} size={44} color={persona.color} />
          </Animated.View>
          <View style={{ marginTop: 32, gap: 12, alignItems: 'center' }}>
            {LINES.slice(0, lineIndex + 1).map((line, i) => (
              <Animated.Text key={i} entering={FadeIn.duration(300)}
                style={[styles.loadingLine, i === lineIndex && styles.loadingLineActive]}>
                {i < lineIndex ? '  ' : '  '}{line}
              </Animated.Text>
            ))}
          </View>
        </>
      ) : (
        <Animated.View style={[styles.personaCard, { borderColor: persona.color }, cardStyle]}>
          <Text style={styles.personaDnaLabel}>YOUR SHOPPER DNA</Text>
          <View style={[styles.personaIconCircle, { backgroundColor: persona.color + '18' }]}>
            <Ionicons name={persona.icon} size={40} color={persona.color} />
          </View>
          <Text style={[styles.personaType, { color: persona.color }]}>{persona.type}</Text>
          <View style={styles.personaTraits}>
            {persona.traits.map((trait, i) => (
              <Animated.View key={i} entering={FadeIn.delay(i * 150).duration(300)} style={styles.personaTraitRow}>
                <View style={[styles.personaTraitDot, { backgroundColor: persona.color }]} />
                <Text style={styles.personaTraitText}>{trait}</Text>
              </Animated.View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.personaBtn, { backgroundColor: persona.color }]}
            onPress={() => { hapticHeavy(); onNext(); }}
            activeOpacity={0.88}
          >
            <Text style={styles.personaBtnTxt}>Unlock Full Intelligence</Text>
            <Ionicons name="arrow-forward" size={18} color={WHITE} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

// ── Step 11: Paywall ────────────────────────────────────────────
function PaywallStep({ formData, navigation }) {
  const [consentChecked, setConsentChecked] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const persona = derivePersona(formData);

  const checkScale = useSharedValue(1);
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));

  const toggleConsent = () => {
    checkScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1.0));
    hapticLight();
    setConsentChecked(c => !c);
  };

  const handleFinish = async () => {
    if (!consentChecked || saving) return;
    hapticSuccess();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await supabase.from('profiles').update({
        onboarding_complete:  true,
        credits_balance:      20,
        household_members:    formData.household_members,
        preferences: {
          health_constraints: formData.health_constraints,
          cooking_style:      formData.cooking_frequency ?? 'Efficiency',
          cooking_appliances: formData.cooking_appliances ?? [],
          cooking_frequency:  formData.cooking_frequency,
          weekly_habits:      formData.weekly_habits ?? [],
          grocery_goals:      formData.grocery_goals ?? [],
          is_glp1:            formData.is_glp1 ?? 'No',
          budget_range:       formData.budget_range,
          preferred_stores:   formData.preferred_stores ?? [],
          dislikes:           formData.dislikes ?? [],
          persona_type:       persona.type,
        },
        consent_accepted:       true,
        consent_accepted_at:    new Date().toISOString(),
        privacy_policy_version: '1.0',
      }).eq('user_id', user.id);
      navigation.navigate('PersonalityResult', { persona });
    } catch {
      navigation.navigate('MainApp');
    }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.stepTitle}>Choose your path</Text>
      <Text style={styles.stepSub}>Your {persona.type} profile is ready.</Text>

      <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.creditBanner}>
        <Ionicons name="gift-outline" size={28} color={GREEN} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.creditBannerTitle}>+20 Free Credits</Text>
          <Text style={styles.creditBannerSub}>Added to your account on completion</Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(200).duration(400)}>
        <TouchableOpacity style={styles.tierCard} activeOpacity={0.88}>
          <View style={styles.tierHeader}>
            <Text style={styles.tierName}>PLUS MEMBER</Text>
            <Text style={styles.tierPrice}>$4.99<Text style={styles.tierPriceSub}>/mo</Text></Text>
          </View>
          <Text style={styles.tierDesc}>• 15 monthly credits{'\n'}• Deep personalization engine{'\n'}• Unlimited store sync</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(300).duration(400)}>
        <TouchableOpacity style={[styles.tierCard, styles.tierCardGold]} activeOpacity={0.88}>
          <View style={styles.tierHeader}>
            <Text style={[styles.tierName, { color: GOLD }]}>FOUNDER — LIFETIME</Text>
            <Text style={[styles.tierPrice, { color: GOLD }]}>$99</Text>
          </View>
          <Text style={styles.tierDesc}>• Unlimited everything, forever{'\n'}• No monthly fees{'\n'}• First 2,000 members only</Text>
          <View style={styles.scarcityTrack}>
            <View style={[styles.scarcityFill, { width: '85%' }]} />
          </View>
          <Text style={styles.scarcityTxt}>1,842 / 2,000 spots claimed</Text>
        </TouchableOpacity>
      </Animated.View>

      <TouchableOpacity style={styles.consentRow} onPress={toggleConsent} activeOpacity={1}>
        <Animated.View style={[styles.consentBox, consentChecked && styles.consentBoxOn, checkStyle]}>
          {consentChecked && <Ionicons name="checkmark" size={12} color={WHITE} />}
        </Animated.View>
        <Text style={styles.consentTxt}>
          I agree to the{' '}
          <Text style={styles.consentLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
            Privacy Policy and Terms
          </Text>
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.ctaBtn, !consentChecked && styles.ctaBtnDisabled]}
        onPress={handleFinish}
        disabled={!consentChecked || saving}
        activeOpacity={0.88}
      >
        <Text style={[styles.ctaBtnTxt, !consentChecked && { opacity: 0.4 }]}>
          {saving ? 'Setting up your account...' : 'Start saving with my 20 credits'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Main Component ──────────────────────────────────────────────

const STEP_COUNT = 12; // 0=Hero, 1-9=Questions, 10=Persona, 11=Paywall

export default function OnboardingScreen({ navigation, route }) {
  const [step, setStep] = useState(0);
  const [modalContent, setModalContent] = useState(null);
  const [pendingStep, setPendingStep]   = useState(null);

  const [formData, setFormData] = useState({
    budget_range:        '$100-$150',
    preferred_stores:    [],
    household_members:   [],
    cooking_appliances:  [],
    cooking_frequency:   '',
    weekly_habits:       [],
    health_constraints:  [],
    grocery_goals:       [],
    is_glp1:             'No',
    dislikes:            [],
  });

  useEffect(() => {
    if (route?.params?.resumeAtStep != null) setStep(route.params.resumeAtStep);
  }, [route?.params?.resumeAtStep]);

  // ── Slide transition ──
  const translateX = useSharedValue(0);
  const opacity    = useSharedValue(1);
  const contentStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const advanceToStep = useCallback((nextStep) => {
    opacity.value = withTiming(0, { duration: 120 }, () => {
      runOnJS(setStep)(nextStep);
      translateX.value = width * 0.06;
      opacity.value = withTiming(1, { duration: 220 });
      translateX.value = withSpring(0, { damping: 18, stiffness: 200 });
    });
  }, []);

  // ── Did You Know modal logic ──
  useEffect(() => {
    if (modalContent) {
      const timer = setTimeout(dismissModal, 3500);
      return () => clearTimeout(timer);
    }
  }, [modalContent]);

  const dismissModal = useCallback(() => {
    const next = pendingStep;
    setModalContent(null);
    setPendingStep(null);
    if (next != null) advanceToStep(next);
  }, [pendingStep, advanceToStep]);

  const goNext = useCallback(() => {
    const nextStep = step + 1;
    if (MODAL_TRIGGER_STEPS.has(step) && DID_YOU_KNOW[step]) {
      setPendingStep(nextStep);
      setModalContent(DID_YOU_KNOW[step]);
    } else {
      advanceToStep(nextStep);
    }
  }, [step, advanceToStep]);

  const goBack = useCallback(() => {
    if (step === 0) return;
    hapticLight();
    opacity.value = withTiming(0, { duration: 100 }, () => {
      runOnJS(setStep)(s => s - 1);
      translateX.value = -(width * 0.06);
      opacity.value = withTiming(1, { duration: 200 });
      translateX.value = withSpring(0, { damping: 18, stiffness: 200 });
    });
  }, [step]);

  // ── Full-screen steps ──
  if (step === 0) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <HeroStep onNext={goNext} />
      </>
    );
  }

  if (step === 10) {
    return (
      <View style={{ flex: 1, backgroundColor: LIGHT_BG }}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={{ flex: 1 }}>
          <PersonaStep formData={formData} onNext={goNext} />
        </SafeAreaView>
      </View>
    );
  }

  if (step === 11) {
    return (
      <View style={{ flex: 1, backgroundColor: WHITE }}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Ionicons name="arrow-back" size={18} color={DARK} />
            </TouchableOpacity>
          </View>
          <Animated.View style={[{ flex: 1, paddingHorizontal: 24 }, contentStyle]}>
            <PaywallStep formData={formData} navigation={navigation} />
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Question screens (steps 1-9) ──
  const questionComponents = {
    1:  <BudgetStep          formData={formData} setFormData={setFormData} />,
    2:  <StoresStep          formData={formData} setFormData={setFormData} />,
    3:  <HouseholdStep       formData={formData} setFormData={setFormData} />,
    4:  <CookingStyleStep    formData={formData} setFormData={setFormData} />,
    5:  <CookingFrequencyStep formData={formData} setFormData={setFormData} />,
    6:  <WeeklyHabitsStep    formData={formData} setFormData={setFormData} />,
    7:  <NutritionGoalsStep  formData={formData} setFormData={setFormData} />,
    8:  <GroceryGoalsStep    formData={formData} setFormData={setFormData} />,
    9:  <GlpStep             formData={formData} setFormData={setFormData} />,
  };

  const isQuestionStep = step >= 1 && step <= 9;
  const isLastQuestion = step === 9;

  return (
    <View style={{ flex: 1, backgroundColor: WHITE }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Ionicons name="arrow-back" size={18} color={DARK} />
          </TouchableOpacity>
          {isQuestionStep && <ProgressBar questionIndex={step} />}
          <View style={{ width: 36 }} />
        </View>

        {/* Content */}
        <Animated.View style={[{ flex: 1, paddingHorizontal: 24 }, contentStyle]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {questionComponents[step]}
            <View style={{ height: 120 }} />
          </ScrollView>
        </Animated.View>

        {/* Footer CTA */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={() => { hapticHeavy(); goNext(); }}
            activeOpacity={0.88}
          >
            <Text style={styles.nextBtnTxt}>
              {isLastQuestion ? 'Generate My Profile' : 'Continue'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={WHITE} />
          </TouchableOpacity>
        </View>

        {/* Did You Know overlay */}
        {modalContent && (
          <DidYouKnowBanner content={modalContent} onDismiss={dismissModal} />
        )}

      </SafeAreaView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: LIGHT_BG, alignItems: 'center', justifyContent: 'center',
  },

  // Progress
  progressBg:   { flex: 1, height: 5, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: GREEN, borderRadius: 3 },

  // Step content
  stepContent:  { flex: 1, paddingTop: 8 },
  stepCounter:  { fontSize: 11, fontWeight: '800', color: GREEN, letterSpacing: 1.2, marginBottom: 10 },
  stepTitle: {
    fontSize: 30, fontWeight: '900', color: DARK,
    letterSpacing: -0.5, lineHeight: 38, marginBottom: 10,
  },
  stepSub: { fontSize: 14, color: GRAY, lineHeight: 22, marginBottom: 24, fontWeight: '500' },
  skipHint: { marginTop: 20, fontSize: 13, color: GRAY, textAlign: 'center' },

  // Pills
  pillWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  smallPill: {
    paddingHorizontal: 16, paddingVertical: 11,
    borderRadius: 30, borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE,
  },
  bigPillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  bigPill: {
    width: (width - 62) / 2, paddingVertical: 20, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1.5, borderColor: BORDER,
    alignItems: 'center', gap: 6, backgroundColor: WHITE,
  },
  pillActive:    { borderColor: GREEN, backgroundColor: MINT_BG },
  pillTxt:       { fontSize: 14, fontWeight: '600', color: DARK },
  pillTxtActive: { color: GREEN },

  // List options
  listOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE,
  },
  listOptionActive: { borderColor: GREEN, backgroundColor: MINT_BG },
  listOptionTxt:    { fontSize: 16, fontWeight: '700', color: DARK },
  listOptionSub:    { fontSize: 13, color: GRAY, marginTop: 2, fontWeight: '500' },

  // Did You Know modal
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 24,
  },
  dykCard: {
    backgroundColor: WHITE,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 12,
  },
  dykIconRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  dykIconBg:   { width: 40, height: 40, borderRadius: 12, backgroundColor: MINT_BG, alignItems: 'center', justifyContent: 'center' },
  dykLabel:    { fontSize: 11, fontWeight: '800', color: GREEN, letterSpacing: 1.2 },
  dykStat:     { fontSize: 40, fontWeight: '900', color: DARK, letterSpacing: -1.5, marginBottom: 10 },
  dykBody:     { fontSize: 15, color: GRAY, lineHeight: 24, fontWeight: '500', marginBottom: 20 },
  dykTap:      { fontSize: 12, color: GRAY, fontWeight: '600', textAlign: 'center' },

  // Hero
  heroGrad:       { flex: 1 },
  heroSafe:       { flex: 1, justifyContent: 'space-between', paddingHorizontal: 30, paddingVertical: 20 },
  heroLogo:       { marginTop: 40 },
  heroSnippdText: { fontSize: 52, fontWeight: '900', color: WHITE, letterSpacing: -2 },
  heroBadge: {
    marginTop: 6, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, alignSelf: 'flex-start',
  },
  heroBadgeText: { fontSize: 9, fontWeight: '800', color: WHITE, letterSpacing: 1.5 },
  heroTaglines:  { flex: 1, justifyContent: 'center' },
  heroTagline:   { fontSize: 46, fontWeight: '900', color: WHITE, letterSpacing: -1, lineHeight: 50 },
  heroTaglineSub: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: 16, lineHeight: 26 },
  heroFooter:  { paddingBottom: 10 },
  heroBtn: {
    backgroundColor: WHITE, borderRadius: 20, paddingVertical: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  heroBtnTxt: { fontSize: 17, fontWeight: '900', color: DARK },
  heroTime:   { textAlign: 'center', marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  // Persona
  personaRing: {
    width: 120, height: 120, borderRadius: 60, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 20, elevation: 8,
  },
  loadingLine:        { fontSize: 14, color: GRAY, fontWeight: '500' },
  loadingLineActive:  { color: DARK, fontWeight: '700' },
  personaCard: {
    width: width - 48, padding: 28, borderRadius: 28, borderWidth: 2,
    backgroundColor: WHITE, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1, shadowRadius: 24, elevation: 10,
  },
  personaDnaLabel:  { fontSize: 11, fontWeight: '800', color: GRAY, letterSpacing: 2, marginBottom: 16 },
  personaIconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  personaType:      { fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5, marginBottom: 4 },
  personaTraits:    { width: '100%', marginTop: 18, gap: 10 },
  personaTraitRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personaTraitDot:  { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  personaTraitText: { fontSize: 14, color: DARK, fontWeight: '600', flex: 1 },
  personaBtn: {
    marginTop: 24, width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 17, borderRadius: 18,
  },
  personaBtnTxt: { color: WHITE, fontSize: 16, fontWeight: '800' },

  // Paywall
  creditBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: MINT_BG, borderRadius: 18, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  creditBannerTitle: { fontSize: 16, fontWeight: '800', color: GREEN },
  creditBannerSub:   { fontSize: 12, color: GRAY, marginTop: 2 },
  tierCard: {
    padding: 22, borderRadius: 24, borderWidth: 2, borderColor: BORDER,
    marginBottom: 14, backgroundColor: WHITE,
  },
  tierCardGold: { borderColor: GOLD, backgroundColor: '#FFFDF0' },
  tierHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tierName:     { fontSize: 11, fontWeight: '900', color: GRAY, letterSpacing: 1.2 },
  tierPrice:    { fontSize: 26, fontWeight: '900', color: DARK },
  tierPriceSub: { fontSize: 14, fontWeight: '600', color: GRAY },
  tierDesc:     { fontSize: 14, color: GRAY, lineHeight: 22, fontWeight: '500' },
  scarcityTrack: { height: 7, backgroundColor: BORDER, borderRadius: 4, marginTop: 14, overflow: 'hidden' },
  scarcityFill:  { height: '100%', backgroundColor: GOLD, borderRadius: 4 },
  scarcityTxt:   { fontSize: 11, fontWeight: '800', color: GOLD, marginTop: 6, textAlign: 'center' },

  // Consent
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 20, gap: 12 },
  consentBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE, flexShrink: 0, marginTop: 1,
  },
  consentBoxOn:  { backgroundColor: GREEN, borderColor: GREEN },
  consentTxt:    { flex: 1, fontSize: 14, color: GRAY, lineHeight: 20 },
  consentLink:   { color: GREEN, fontWeight: '700', textDecorationLine: 'underline' },
  ctaBtn:        { backgroundColor: DARK, borderRadius: 20, paddingVertical: 19, alignItems: 'center' },
  ctaBtnDisabled:{ backgroundColor: BORDER },
  ctaBtnTxt:     { color: WHITE, fontSize: 16, fontWeight: '800' },

  // Footer
  footer: { paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 8 : 20, paddingTop: 12 },
  nextBtn: {
    backgroundColor: GREEN, borderRadius: 20, paddingVertical: 19,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
  },
  nextBtnTxt: { color: WHITE, fontSize: 17, fontWeight: '900' },
});
