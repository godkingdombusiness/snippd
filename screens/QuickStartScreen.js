// screens/QuickStartScreen.js
// Step 1 of the new lightweight onboarding flow.
// Asks only 3 questions: budget range, household size, primary goal.
// On submit → saves to user_persona + navigates to InstantForecastScreen.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { recordMemoryEvent } from '../src/lib/memoryEvents';

const GREEN  = '#0C9E54';
const NAVY   = '#1A237E';
const MINT   = '#F0FBF0';
const WHITE  = '#FFFFFF';
const SLATE  = '#64748B';
const BORDER = '#E2E8F0';
const CORAL  = '#FF7043';

// ── Data definitions ──────────────────────────────────────────────────────────

const BUDGET_OPTIONS = [
  { key: '<75',     label: 'Under $75',    sub: 'per week' },
  { key: '75-125',  label: '$75 – $125',   sub: 'per week' },
  { key: '125-200', label: '$125 – $200',  sub: 'per week' },
  { key: '200+',    label: '$200+',        sub: 'per week' },
];

const HOUSEHOLD_OPTIONS = [
  { key: 1, label: 'Just me',    icon: 'user' },
  { key: 2, label: '2 people',   icon: 'users' },
  { key: 4, label: '3 – 4',      icon: 'users' },
  { key: 6, label: '5 or more',  icon: 'users' },
];

const GOAL_OPTIONS = [
  { key: 'save_money',         label: 'Save money',                    icon: 'dollar-sign', color: GREEN },
  { key: 'eat_healthier',      label: 'Eat healthier',                 icon: 'heart',       color: '#E53E3E' },
  { key: 'save_time',          label: 'Save time',                     icon: 'clock',       color: '#805AD5' },
  { key: 'manage_allergies',   label: 'Manage allergies / guardrails', icon: 'shield',      color: CORAL },
  { key: 'nutrition_program',  label: 'Follow a nutrition program',    icon: 'activity',    color: '#DD6B20' },
  { key: 'athletic_fuel',      label: 'Athletic fuel',                 icon: 'zap',         color: '#2B6CB0' },
];

const STEPS = ['budget', 'household', 'goal'];

// ── Chip components — defined outside to avoid remount ────────────────────────

function BudgetChip({ option, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.budgetChip, selected && styles.chipSelected]}
      onPress={() => onPress(option.key)}
      activeOpacity={0.75}
    >
      <Text style={[styles.budgetChipLabel, selected && styles.chipLabelSelected]}>
        {option.label}
      </Text>
      <Text style={[styles.budgetChipSub, selected && styles.chipSubSelected]}>
        {option.sub}
      </Text>
    </TouchableOpacity>
  );
}

function HouseholdChip({ option, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.householdChip, selected && styles.chipSelected]}
      onPress={() => onPress(option.key)}
      activeOpacity={0.75}
    >
      <Feather
        name={option.icon}
        size={20}
        color={selected ? WHITE : NAVY}
        style={{ marginBottom: 6 }}
      />
      <Text style={[styles.householdChipLabel, selected && styles.chipLabelSelected]}>
        {option.label}
      </Text>
    </TouchableOpacity>
  );
}

function GoalChip({ option, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.goalChip, selected && { borderColor: option.color, backgroundColor: option.color + '14' }]}
      onPress={() => onPress(option.key)}
      activeOpacity={0.75}
    >
      <View style={[styles.goalIconWrap, { backgroundColor: option.color + '20' }]}>
        <Feather name={option.icon} size={18} color={selected ? option.color : SLATE} />
      </View>
      <Text style={[styles.goalChipLabel, selected && { color: option.color, fontWeight: '700' }]}>
        {option.label}
      </Text>
      {selected && <Feather name="check" size={14} color={option.color} style={{ marginLeft: 'auto' }} />}
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function QuickStartScreen({ navigation }) {
  const [step, setStep]           = useState(0);
  const [budgetRange, setBudget]  = useState(null);
  const [household,   setHousehold] = useState(null);
  const [goal,        setGoal]    = useState(null);
  const [saving,      setSaving]  = useState(false);

  const currentKey = STEPS[step];
  const canNext =
    (currentKey === 'budget'    && budgetRange != null) ||
    (currentKey === 'household' && household   != null) ||
    (currentKey === 'goal'      && goal        != null);

  async function handleContinue() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
      return;
    }
    // All 3 answered — save and proceed
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('user_persona').upsert({
          user_id:                user.id,
          quick_start_completed:  true,
          quick_start_budget_range: budgetRange,
          quick_start_goal:       goal,
          quick_start_household:  household,
          status:                 'new',
        }, { onConflict: 'user_id' });

        recordMemoryEvent({
          event_type: 'quick_start_completed',
          metadata: { budget_range: budgetRange, household, goal },
        });
      }
    } catch (_) {
      // Non-fatal — proceed anyway
    }
    setSaving(false);
    navigation.replace('InstantForecast', { budgetRange, household, goal });
  }

  function handleBack() {
    if (step === 0) {
      navigation.goBack?.();
      return;
    }
    setStep(s => s - 1);
  }

  // ── Step content ─────────────────────────────────────────────────────────────

  function renderBudgetStep() {
    return (
      <>
        <Text style={styles.stepTitle}>What's your weekly{'\n'}grocery budget?</Text>
        <Text style={styles.stepSub}>We use this to find your floor price.</Text>
        <View style={styles.budgetGrid}>
          {BUDGET_OPTIONS.map(opt => (
            <BudgetChip
              key={opt.key}
              option={opt}
              selected={budgetRange === opt.key}
              onPress={setBudget}
            />
          ))}
        </View>
      </>
    );
  }

  function renderHouseholdStep() {
    return (
      <>
        <Text style={styles.stepTitle}>How many people{'\n'}are you shopping for?</Text>
        <Text style={styles.stepSub}>Helps us size your plan correctly.</Text>
        <View style={styles.householdGrid}>
          {HOUSEHOLD_OPTIONS.map(opt => (
            <HouseholdChip
              key={opt.key}
              option={opt}
              selected={household === opt.key}
              onPress={setHousehold}
            />
          ))}
        </View>
      </>
    );
  }

  function renderGoalStep() {
    return (
      <>
        <Text style={styles.stepTitle}>What matters most{'\n'}to you right now?</Text>
        <Text style={styles.stepSub}>Your forecast adjusts based on this.</Text>
        <View style={styles.goalList}>
          {GOAL_OPTIONS.map(opt => (
            <GoalChip
              key={opt.key}
              option={opt}
              selected={goal === opt.key}
              onPress={setGoal}
            />
          ))}
        </View>
      </>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <View style={styles.progressRow}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.progressDot, i <= step && styles.progressDotActive]}
            />
          ))}
        </View>
        <Text style={styles.stepCounter}>{step + 1} / {STEPS.length}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.eyebrowRow}>
          <Feather name="zap" size={14} color={GREEN} />
          <Text style={styles.eyebrow}>Your forecast appears right after this</Text>
        </View>

        {currentKey === 'budget'    && renderBudgetStep()}
        {currentKey === 'household' && renderHouseholdStep()}
        {currentKey === 'goal'      && renderGoalStep()}
      </ScrollView>

      {/* CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.ctaBtn, !canNext && styles.ctaBtnDisabled]}
          onPress={handleContinue}
          disabled={!canNext || saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color={WHITE} />
            : (
              <>
                <Text style={styles.ctaBtnText}>
                  {step < STEPS.length - 1 ? 'Continue' : 'Show my forecast'}
                </Text>
                <Feather name="arrow-right" size={16} color={WHITE} />
              </>
            )
          }
        </TouchableOpacity>
        <Text style={styles.disclaimer}>
          No credit card. No commitment. Just your numbers.
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MINT },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 12,
  },
  progressRow: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  progressDot: {
    width: 28, height: 5, borderRadius: 3,
    backgroundColor: BORDER,
  },
  progressDotActive: { backgroundColor: GREEN },
  stepCounter: { fontSize: 13, color: SLATE, fontWeight: '500', minWidth: 32, textAlign: 'right' },

  body: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 },

  eyebrowRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(12,158,84,0.10)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
    alignSelf: 'flex-start', marginBottom: 28,
  },
  eyebrow: { fontSize: 12, color: GREEN, fontWeight: '600' },

  stepTitle: {
    fontSize: 28, fontWeight: '800', color: NAVY,
    lineHeight: 36, marginBottom: 8,
  },
  stepSub: { fontSize: 15, color: SLATE, lineHeight: 22, marginBottom: 28 },

  // Budget chips — 2 per row
  budgetGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  budgetChip: {
    width: '47%', backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    paddingVertical: 18, paddingHorizontal: 16,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.06)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
    }),
  },
  budgetChipLabel: { fontSize: 17, fontWeight: '800', color: NAVY },
  budgetChipSub:   { fontSize: 12, color: SLATE, marginTop: 2 },

  // Household chips — 2 per row
  householdGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  householdChip: {
    width: '47%', backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    paddingVertical: 20, paddingHorizontal: 16,
    alignItems: 'center', gap: 0,
  },
  householdChipLabel: { fontSize: 15, fontWeight: '700', color: NAVY },

  chipSelected:      { borderColor: GREEN, backgroundColor: GREEN },
  chipLabelSelected: { color: WHITE },
  chipSubSelected:   { color: 'rgba(255,255,255,0.8)' },

  // Goal chips — full-width rows
  goalList: { gap: 10 },
  goalChip: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    paddingVertical: 16, paddingHorizontal: 16,
  },
  goalIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  goalChipLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: NAVY },

  // Footer
  footer: {
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 16 : 24, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: MINT,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 17,
  },
  ctaBtnDisabled: { backgroundColor: '#94A3B8' },
  ctaBtnText: { fontSize: 17, fontWeight: '800', color: WHITE },
  disclaimer: {
    textAlign: 'center', fontSize: 12, color: SLATE,
    marginTop: 10,
  },
});
