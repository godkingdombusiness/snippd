/**
 * QuickOnboardingModal
 *
 * Lightweight 5-screen modal shown once when user has no profile preferences.
 * Saves to user_preferences table. Skippable at any step.
 *
 * Screens:
 *   0  Budget     — weekly grocery budget
 *   1  Household  — number of people
 *   2  Stores     — preferred stores
 *   3  Goal       — save money / eat healthier / save time
 *   4  Dietary    — dietary preferences + allergy multi-select
 *
 * Usage:
 *   <QuickOnboardingModal userId={userId} onDone={() => setShowModal(false)} />
 */

import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const GREEN  = '#0C9E54';
const NAVY   = '#0D1B4B';
const CORAL  = '#FF7043';
const GRAY   = '#64748B';
const WHITE  = '#FFFFFF';
const MINT   = '#F0FBF0';
const BORDER = '#C8E6C9';

const TOTAL_STEPS = 5;

const BUDGET_OPTIONS = [
  { label: 'Under $75',    value: 75  },
  { label: '$75 – $150',   value: 150 },
  { label: '$150 – $250',  value: 250 },
  { label: '$250 – $400',  value: 400 },
  { label: '$400+',        value: 500 },
];

const HOUSEHOLD_OPTIONS = [
  { label: 'Just me',     value: 1 },
  { label: '2 people',    value: 2 },
  { label: '3 – 4',       value: 3 },
  { label: '5 or more',   value: 5 },
];

const STORE_OPTIONS = [
  'Publix', 'Walmart', 'Target', 'Aldi', 'Kroger',
  'Whole Foods', 'Trader Joe\'s', 'Winn-Dixie', "Sam's Club", 'Costco',
];

const GOAL_OPTIONS = [
  { label: 'Save money',    value: 'save_money',      icon: '💰' },
  { label: 'Eat healthier', value: 'eat_healthier',   icon: '🥗' },
  { label: 'Save time',     value: 'save_time',       icon: '⏱️' },
];

const DIETARY_OPTIONS = [
  { label: 'Vegetarian',  value: 'vegetarian' },
  { label: 'Vegan',       value: 'vegan'       },
  { label: 'Keto',        value: 'keto'        },
  { label: 'Gluten-free', value: 'gluten_free' },
  { label: 'Dairy-free',  value: 'dairy_free'  },
  { label: 'Halal',       value: 'halal'       },
  { label: 'Kosher',      value: 'kosher'      },
  { label: 'No preference', value: '' },
];

const ALLERGY_OPTIONS = [
  { label: 'Dairy',     value: 'dairy'   },
  { label: 'Gluten',    value: 'gluten'  },
  { label: 'Peanuts',   value: 'peanuts' },
  { label: 'Tree nuts', value: 'tree_nuts' },
  { label: 'Soy',       value: 'soy'    },
  { label: 'Eggs',      value: 'eggs'   },
  { label: 'Shellfish', value: 'shellfish' },
  { label: 'Fish',      value: 'fish'   },
];

function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.chip, selected && s.chipSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ProgressBar({ step }) {
  return (
    <View style={s.progressWrap}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View key={i} style={[s.progressDot, i <= step && s.progressDotActive]} />
      ))}
    </View>
  );
}

export default function QuickOnboardingModal({ userId, onDone }) {
  const [step,             setStep]             = useState(0);
  const [budget,           setBudget]           = useState(null);
  const [householdSize,    setHouseholdSize]    = useState(null);
  const [selectedStores,   setSelectedStores]   = useState([]);
  const [goal,             setGoal]             = useState(null);
  const [dietaryPrefs,     setDietaryPrefs]     = useState([]);
  const [allergies,        setAllergies]        = useState([]);
  const [saving,           setSaving]           = useState(false);

  function toggleStore(s) {
    setSelectedStores(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  function toggleDietary(val) {
    if (val === '') {
      setDietaryPrefs([]);
      return;
    }
    setDietaryPrefs(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
  }

  function toggleAllergy(val) {
    setAllergies(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
  }

  async function finish() {
    if (!userId || saving) return;
    setSaving(true);

    const payload = {
      user_id:               userId,
      budget_range:          budget ?? 150,
      household_size:        householdSize ?? 2,
      preferred_stores:      selectedStores,
      primary_goal:          goal ?? 'save_money',
      dietary_preferences:   dietaryPrefs,
      allergies,
      quick_onboarding_done: true,
    };

    await supabase.from('user_preferences').upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    onDone();
  }

  function skip() {
    // Mark done without saving answers — don't show again this session
    onDone();
  }

  function next() {
    if (step < TOTAL_STEPS - 1) setStep(s => s + 1);
    else finish();
  }

  function canContinue() {
    if (step === 0) return budget != null;
    if (step === 1) return householdSize != null;
    if (step === 2) return true; // stores are optional
    if (step === 3) return goal != null;
    return true; // dietary is optional
  }

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <>
            <Text style={s.stepTitle}>What's your weekly grocery budget?</Text>
            <View style={s.chipGrid}>
              {BUDGET_OPTIONS.map(opt => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={budget === opt.value}
                  onPress={() => setBudget(opt.value)}
                />
              ))}
            </View>
          </>
        );

      case 1:
        return (
          <>
            <Text style={s.stepTitle}>How many people are you shopping for?</Text>
            <View style={s.chipGrid}>
              {HOUSEHOLD_OPTIONS.map(opt => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={householdSize === opt.value}
                  onPress={() => setHouseholdSize(opt.value)}
                />
              ))}
            </View>
          </>
        );

      case 2:
        return (
          <>
            <Text style={s.stepTitle}>Which stores do you shop at?</Text>
            <Text style={s.stepSub}>Pick as many as you like — skip if you're not sure.</Text>
            <View style={s.chipGrid}>
              {STORE_OPTIONS.map(store => (
                <Chip
                  key={store}
                  label={store}
                  selected={selectedStores.includes(store)}
                  onPress={() => toggleStore(store)}
                />
              ))}
            </View>
          </>
        );

      case 3:
        return (
          <>
            <Text style={s.stepTitle}>What's your main shopping goal?</Text>
            <View style={s.goalGrid}>
              {GOAL_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.goalCard, goal === opt.value && s.goalCardSelected]}
                  onPress={() => setGoal(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={s.goalIcon}>{opt.icon}</Text>
                  <Text style={[s.goalLabel, goal === opt.value && s.goalLabelSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        );

      case 4:
        return (
          <>
            <Text style={s.stepTitle}>Any dietary preferences or allergies?</Text>
            <Text style={s.stepSub}>Snippd will filter out unsafe items automatically.</Text>
            <Text style={s.sectionLabel}>Dietary preference</Text>
            <View style={s.chipGrid}>
              {DIETARY_OPTIONS.map(opt => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={opt.value === '' ? dietaryPrefs.length === 0 : dietaryPrefs.includes(opt.value)}
                  onPress={() => toggleDietary(opt.value)}
                />
              ))}
            </View>
            <Text style={[s.sectionLabel, { marginTop: 16 }]}>Allergies</Text>
            <View style={s.chipGrid}>
              {ALLERGY_OPTIONS.map(opt => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={allergies.includes(opt.value)}
                  onPress={() => toggleAllergy(opt.value)}
                />
              ))}
            </View>
          </>
        );
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={skip}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.modalHeader}>
          <Text style={s.modalHeaderTitle}>Quick Setup</Text>
          <TouchableOpacity onPress={skip} style={s.skipBtn}>
            <Text style={s.skipTxt}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ProgressBar step={step} />

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderStep()}
        </ScrollView>

        <View style={s.footer}>
          {step > 0 && (
            <TouchableOpacity style={s.backBtn} onPress={() => setStep(s => s - 1)}>
              <Text style={s.backTxt}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.nextBtn, !canContinue() && s.nextBtnDisabled, step === 0 && { marginLeft: 0 }]}
            onPress={next}
            disabled={!canContinue() || saving}
            activeOpacity={0.82}
          >
            <Text style={s.nextTxt}>
              {step === TOTAL_STEPS - 1 ? (saving ? 'Saving…' : 'Done') : 'Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    backgroundColor: WHITE,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  modalHeaderTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  skipBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  skipTxt: { fontSize: 13, color: GRAY, fontWeight: '500' },

  progressWrap: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: WHITE,
  },
  progressDot: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0',
  },
  progressDotActive: { backgroundColor: GREEN },

  scroll:        { flex: 1, backgroundColor: MINT },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 40 },

  stepTitle: { fontSize: 20, fontWeight: '800', color: NAVY, lineHeight: 28 },
  stepSub:   { fontSize: 13, color: GRAY, lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5 },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE,
  },
  chipSelected: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { fontSize: 14, color: NAVY, fontWeight: '500' },
  chipTextSelected: { color: WHITE, fontWeight: '700' },

  goalGrid: { flexDirection: 'row', gap: 12 },
  goalCard: {
    flex: 1, borderRadius: 16, padding: 16, borderWidth: 1.5,
    borderColor: BORDER, backgroundColor: WHITE,
    alignItems: 'center', gap: 8,
  },
  goalCardSelected: { borderColor: GREEN, backgroundColor: '#F0FDF4' },
  goalIcon:  { fontSize: 28 },
  goalLabel: { fontSize: 13, fontWeight: '600', color: NAVY, textAlign: 'center' },
  goalLabelSelected: { color: GREEN },

  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingVertical: 20,
    backgroundColor: WHITE,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  backBtn: {
    flex: 0.4, paddingVertical: 15, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    alignItems: 'center',
  },
  backTxt: { color: NAVY, fontWeight: '600', fontSize: 14 },
  nextBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 14,
    backgroundColor: GREEN, alignItems: 'center',
  },
  nextBtnDisabled: { backgroundColor: '#A7D7B8' },
  nextTxt: { color: WHITE, fontWeight: '700', fontSize: 15 },
});
