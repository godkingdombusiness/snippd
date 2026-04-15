/**
 * WeeklyPlanPersonalizationScreen
 *
 * Appears before WeeklyPlanScreen on every open.
 * Exception: skipped if answered within the last 7 days (checked via AsyncStorage).
 *
 * Flow: headcount (0) → nights (1) → focus (2) → WeeklyPlanScreen
 * Animation: react-native Animated (not Reanimated) — translateY 30→0, opacity 0→1
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Easing, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';

// ── Colors ────────────────────────────────────────────────────────
const FOREST     = '#0C7A3D';
const DARK_GREEN = '#085041';
const MID_GREEN  = '#1D9E75';
const SEL_BG     = '#E1F5EE';
const SEL_LABEL  = '#085041';
const SEL_SUB    = '#0F6E56';
const NAVY       = '#0D1B4B';
const GRAY       = '#64748B';
const GRAY_MID   = '#94A3B8';
const BORDER     = '#E2E8F0';
const WHITE      = '#FFFFFF';
const OFF_WHITE  = '#F8F9FA';
const GREEN_CTA  = '#2E7D32';

// ── Haptic helper ─────────────────────────────────────────────────
const hapticLight = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

// ── Resolve helpers ───────────────────────────────────────────────

function resolveSize(str, fallback) {
  const map = { '1': 1, '2': 2, '3-4': 3, '5-6': 5, '7+': 7, 'varies': fallback ?? 4 };
  return map[str] ?? 4;
}

function resolveNights(str) {
  const map = { '2-3': 3, '4-5': 5, '6-7': 7, 'meal-prep': 6 };
  return map[str] ?? 5;
}

// ── Question definitions ─────────────────────────────────────────

const QUESTIONS = [
  {
    key: 'headcount',
    text: 'How many people are you feeding this week?',
    hint: 'We scale every ingredient quantity and cost to match exactly who you are feeding. Change this anytime.',
    options: [
      { value: '1',      label: 'Just me',         sub: '1 person' },
      { value: '2',      label: 'Us two',           sub: '2 people' },
      { value: '3-4',    label: 'Small family',     sub: '3–4 people' },
      { value: '5-6',    label: 'Bigger crew',      sub: '5–6 people' },
      { value: '7+',     label: 'Large household',  sub: '7+ people' },
      { value: 'varies', label: 'It varies',        sub: 'Depends on the week' },
    ],
    autoAdvance: true,
  },
  {
    key: 'nights',
    text: 'How many nights do you want dinner covered?',
    hint: 'We only build the nights you ask for. No wasted groceries from over-planning.',
    options: [
      { value: '2-3',       label: '2–3 nights',     sub: 'I cook a few times' },
      { value: '4-5',       label: '4–5 nights',     sub: 'Most weeknights' },
      { value: '6-7',       label: '6–7 nights',     sub: 'Full week covered' },
      { value: 'meal-prep', label: 'Meal prep only', sub: 'Batch cook Sunday' },
    ],
    autoAdvance: true,
  },
  {
    key: 'focus',
    text: 'Anything this week you want to avoid or focus on?',
    hint: 'This stacks on top of your saved preferences — it nudges this week only.',
    options: [
      { value: 'simple',  label: 'Keep it simple',   sub: '30 min or less' },
      { value: 'savings', label: 'Maximize savings',  sub: 'Best deals first' },
      { value: 'protein', label: 'High protein',      sub: 'Lean and filling' },
      { value: 'none',    label: 'No preference',     sub: 'Surprise me' },
    ],
    autoAdvance: false,
  },
];

// ── Progress Dots ─────────────────────────────────────────────────

function ProgressDots({ step }) {
  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map(i => {
        const isDone   = i < step;
        const isActive = i === step;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              isDone   && styles.dotDone,
              isActive && styles.dotActive,
            ]}
          />
        );
      })}
    </View>
  );
}

// ── Option Tile ───────────────────────────────────────────────────

function OptionTile({ option, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[
        styles.optionTile,
        selected && styles.optionTileSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
        {option.label}
      </Text>
      <Text style={[styles.optionSub, selected && styles.optionSubSelected]}>
        {option.sub}
      </Text>
    </TouchableOpacity>
  );
}

// ── Main Component ────────────────────────────────────────────────

export default function WeeklyPlanPersonalizationScreen({ navigation }) {
  const [answers, setAnswers] = useState({
    headcount: null,
    nights:    null,
    focus:     null,
  });
  const [step,    setStep]    = useState(0);
  const [loading, setLoading] = useState(true); // true while checking AsyncStorage
  const [skipping, setSkipping] = useState(false);

  // Card slide-in animation
  const cardAnim = useRef(new Animated.Value(0)).current;

  // Animate card in whenever step changes
  useEffect(() => {
    cardAnim.setValue(0);
    Animated.timing(cardAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [step]);

  // ── Mount: check AsyncStorage skip condition ─────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('plan_personalization');
        if (raw) {
          const { answered_at, ...savedAnswers } = JSON.parse(raw);
          const daysSince =
            (Date.now() - new Date(answered_at).getTime()) / (1000 * 60 * 60 * 24);

          if (daysSince < 7) {
            // Resolve size using profile fallback if needed
            let fallback = 4;
            if (savedAnswers.headcount === 'varies') {
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  const { data: p } = await supabase
                    .from('profiles')
                    .select('household_size')
                    .eq('user_id', user.id)
                    .single();
                  fallback = p?.household_size ?? 4;
                }
              } catch (_) {}
            }

            navigation.replace('WeeklyPlan', {
              headcount:    resolveSize(savedAnswers.headcount, fallback),
              nights:       resolveNights(savedAnswers.nights),
              focus:        savedAnswers.focus ?? 'none',
              personalized: true,
            });
            return;
          }
        }
      } catch (_) {
        // AsyncStorage failure → show the screen normally
      }
      setLoading(false);
    })();
  }, []);

  // ── Handlers ─────────────────────────────────────────────────

  const handleSelect = (questionKey, value) => {
    hapticLight();
    setAnswers(prev => ({ ...prev, [questionKey]: value }));

    const q = QUESTIONS[step];
    if (q.autoAdvance) {
      setTimeout(() => {
        setStep(s => s + 1);
      }, 400);
    }
  };

  const handleBuildPlan = async () => {
    hapticLight();
    try {
      await AsyncStorage.setItem(
        'plan_personalization',
        JSON.stringify({ ...answers, answered_at: new Date().toISOString() }),
      );
    } catch (_) {}

    let fallback = 4;
    if (answers.headcount === 'varies') {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: p } = await supabase
            .from('profiles')
            .select('household_size')
            .eq('user_id', user.id)
            .single();
          fallback = p?.household_size ?? 4;
        }
      } catch (_) {}
    }

    navigation.navigate('WeeklyPlan', {
      headcount:    resolveSize(answers.headcount, fallback),
      nights:       resolveNights(answers.nights),
      focus:        answers.focus ?? 'none',
      personalized: true,
    });
  };

  const handleSkip = async () => {
    setSkipping(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let headcount = 4;
      let focusPref = 'none';

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('household_size, preferences, weekly_budget')
          .eq('id', user.id)
          .single();
        headcount = profile?.household_size ?? 4;
        focusPref = profile?.preferences?.week_focus ?? 'none';
      }

      navigation.navigate('WeeklyPlan', {
        headcount,
        nights:       5,
        focus:        focusPref,
        personalized: false,
      });
    } catch (_) {
      navigation.navigate('WeeklyPlan', {
        headcount: 4, nights: 5, focus: 'none', personalized: false,
      });
    } finally {
      setSkipping(false);
    }
  };

  // ── Render guard ─────────────────────────────────────────────

  if (loading) {
    // Render nothing while checking skip condition (avoid flash)
    return <View style={styles.blankBg} />;
  }

  const q             = QUESTIONS[step];
  const currentAnswer = answers[q.key];
  const canBuild      = step === 2 && currentAnswer !== null;

  const cardTranslateY = cardAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [30, 0],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── HEADER ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>BEFORE WE BUILD YOUR PLAN</Text>
          <Text style={styles.headerTitle}>Quick check — takes 10 seconds.</Text>
          <Text style={styles.headerSub}>
            This keeps your plan from feeling like it was built for someone else's household.
          </Text>
        </View>

        {/* ── QUESTION CARD ──────────────────────────────────── */}
        <Animated.View
          style={[
            styles.card,
            { opacity: cardAnim, transform: [{ translateY: cardTranslateY }] },
          ]}
        >
          {/* Progress dots */}
          <ProgressDots step={step} />

          {/* Step counter */}
          <Text style={styles.stepCounter}>QUESTION {step + 1} OF 3</Text>

          {/* Question text */}
          <Text style={styles.questionText}>{q.text}</Text>

          {/* Option grid */}
          <View style={styles.optionGrid}>
            {q.options.map(opt => (
              <OptionTile
                key={opt.value}
                option={opt}
                selected={currentAnswer === opt.value}
                onPress={() => handleSelect(q.key, opt.value)}
              />
            ))}
          </View>

          {/* Hint text */}
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>{q.hint}</Text>
          </View>
        </Animated.View>

        {/* ── BUTTONS ────────────────────────────────────────── */}
        <View style={styles.buttonArea}>

          {/* Primary: Build my plan — only on step 2 after selection */}
          {canBuild && (
            <TouchableOpacity
              style={styles.buildBtn}
              onPress={handleBuildPlan}
              activeOpacity={0.88}
            >
              <Text style={styles.buildBtnTxt}>Build my plan</Text>
            </TouchableOpacity>
          )}

          {/* Ghost: Skip */}
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            activeOpacity={0.75}
            disabled={skipping}
          >
            <Text style={styles.skipBtnTxt}>
              {skipping ? 'Loading…' : 'Skip — use my saved settings'}
            </Text>
          </TouchableOpacity>

        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  blankBg:   { flex: 1, backgroundColor: OFF_WHITE },
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll:    { paddingHorizontal: 16, paddingBottom: 40 },

  // Header
  header: {
    backgroundColor: FOREST,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 22,
    marginTop: 16,
    marginBottom: 20,
  },
  headerEyebrow: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 22, fontWeight: '700', color: WHITE,
    lineHeight: 30, marginBottom: 10,
  },
  headerSub: {
    fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 19,
  },

  // Question card
  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },

  // Progress dots
  dotsRow: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: WHITE,
  },
  dotDone: {
    backgroundColor: GREEN_CTA, borderColor: GREEN_CTA,
  },
  dotActive: {
    backgroundColor: DARK_GREEN, borderColor: DARK_GREEN,
  },

  // Step counter
  stepCounter: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
    color: GRAY_MID, textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Question text
  questionText: {
    fontSize: 15, fontWeight: '700', color: NAVY,
    lineHeight: 22, marginBottom: 18,
  },

  // Option grid — 2 columns
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  optionTile: {
    width: '47.5%',
    backgroundColor: WHITE,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionTileSelected: {
    backgroundColor: SEL_BG,
    borderWidth: 1.5,
    borderColor: MID_GREEN,
  },
  optionLabel: {
    fontSize: 13, fontWeight: '700', color: NAVY,
    marginBottom: 3,
  },
  optionLabelSelected: {
    color: SEL_LABEL,
  },
  optionSub: {
    fontSize: 11, color: GRAY, lineHeight: 15,
  },
  optionSubSelected: {
    color: SEL_SUB,
  },

  // Hint
  hintContainer: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    borderStyle: 'dashed',
    paddingTop: 14,
  },
  hintText: {
    fontSize: 11, color: GRAY_MID, lineHeight: 16,
  },

  // Buttons
  buttonArea: {
    gap: 12,
  },
  buildBtn: {
    backgroundColor: GREEN_CTA,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: GREEN_CTA,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  buildBtnTxt: {
    color: WHITE, fontSize: 16, fontWeight: '800',
  },
  skipBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: WHITE,
  },
  skipBtnTxt: {
    color: GRAY, fontSize: 13, fontWeight: '500',
  },
});
