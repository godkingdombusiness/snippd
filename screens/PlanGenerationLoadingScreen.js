/**
 * PlanGenerationLoadingScreen — Shown after onboarding while the first grocery
 * plan is being assembled. Animates through a checklist, then navigates to SmartStart.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

const GREEN  = '#0C9E54';
const NAVY   = '#172250';
const CREAM  = '#FAF8F1';
const WHITE  = '#FFFFFF';
const GRAY   = '#6B7280';
const BORDER = '#E5E7EB';
const MINT   = '#E8F5E9';

const LOADING_STEPS = [
  'Checking your stores for the best prices...',
  'Matching deals to your food goals...',
  'Building your weekly meal structure...',
  'Calculating savings opportunities...',
  'Assembling your smart cart...',
  'Your plan is ready.',
];

const MONEY_FACTS = [
  'Without a weekly system, small grocery leaks can add up to $1,500+ a year in duplicate buys, unused food, and missed discounts.',
  'Families often overspend most when dinner decisions happen late. Snippd plans the cheaper path before stress turns into takeout.',
  'A few missed coupons, BOGOs, and store-brand swaps each week can quietly become hundreds of dollars lost every year.',
  'The goal is not just saving on one trip. It is building a repeatable guardrail around every food decision.',
  'Every optimized cart protects money you already earned before it disappears into impulse spending.',
  'Your first system is ready.',
];

export default function PlanGenerationLoadingScreen({ navigation }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      idx += 1;
      if (idx < LOADING_STEPS.length) {
        setCurrentStep(idx);
      } else {
        clearInterval(interval);
        setDone(true);
        setTimeout(() => {
          navigation.reset({ index: 0, routes: [{ name: 'SmartStart' }] });
        }, 900);
      }
    }, 1100);
    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>S</Text>
        </View>

        <Text style={styles.headline}>Building your plan...</Text>
        <Text style={styles.sub}>This takes about 15 seconds. I'll get it right.</Text>
        <View style={styles.factCard}>
          <Text style={styles.factLabel}>Why this matters</Text>
          <Text style={styles.factText}>{MONEY_FACTS[currentStep] || MONEY_FACTS[0]}</Text>
        </View>

        <View style={styles.checklist}>
          {LOADING_STEPS.map((item, idx) => {
            const completed = idx < currentStep || done;
            const active = idx === currentStep && !done;
            return (
              <View key={idx} style={styles.checkItem}>
                <View style={[
                  styles.checkIcon,
                  completed && styles.checkIconDone,
                  active && styles.checkIconActive,
                ]}>
                  {completed
                    ? <Feather name="check" size={12} color={WHITE} />
                    : active
                      ? <ActivityIndicator size="small" color={GREEN} />
                      : null
                  }
                </View>
                <Text style={[
                  styles.checkText,
                  completed && styles.checkTextDone,
                  active && styles.checkTextActive,
                  !completed && !active && styles.checkTextFuture,
                ]}>
                  {item}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },

  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: WHITE, letterSpacing: -1 },

  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 24,
    color: NAVY,
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  sub: { fontSize: 14, color: GRAY, textAlign: 'center', marginBottom: 16, lineHeight: 21 },

  factCard: {
    width: '100%',
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 24,
  },
  factLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: GREEN,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  factText: { fontSize: 13, color: NAVY, textAlign: 'center', lineHeight: 19, fontWeight: '600' },

  checklist: { width: '100%', gap: 12 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  checkIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: BORDER,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkIconDone: { backgroundColor: GREEN },
  checkIconActive: { backgroundColor: MINT, borderWidth: 1.5, borderColor: GREEN },

  checkText: { fontSize: 14, color: GRAY, flex: 1, lineHeight: 20 },
  checkTextDone: { color: GRAY, textDecorationLine: 'line-through' },
  checkTextActive: { color: NAVY, fontWeight: '600' },
  checkTextFuture: { color: BORDER },
});
