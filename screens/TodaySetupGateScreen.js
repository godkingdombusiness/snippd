// screens/TodaySetupGateScreen.js
// "Today's Setup" questionnaire — collects session context, saves to Supabase,
// then routes based on shoppingStatus:
//   not_yet  → TodayOptionsRanked with mode:'live_stacks'
//   yes | partially → TodayOptionsRanked with mode:'plan_tonight'

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const NAVY       = '#0A192F';
const WHITE      = '#FFFFFF';
const CREAM      = '#FAF8F1';
const SLATE      = '#475569';
const GRAY       = '#6B7280';
const BORDER     = '#E5E7EB';
const MINT       = '#E8F5E9';
const MINT_SOFT  = '#F0FDF4';

// ── Static options ─────────────────────────────────────────────────────────────
const GROCERY_OPTIONS = [
  { value: 'yes',       label: 'Yes' },
  { value: 'not_yet',   label: 'Not yet' },
  { value: 'partially', label: 'Partially' },
];

const TIME_OPTIONS = [
  { value: 'under_15', label: 'Under 15 min' },
  { value: '15_30',    label: '15–30 min' },
  { value: '30_45',    label: '30–45 min' },
  { value: 'over_45',  label: 'Over 45 min' },
];

const PANTRY_OPTIONS = [
  { value: 'use_first',     label: 'Yes, use what I have' },
  { value: 'shop_or_order', label: 'No, I can shop or order' },
  { value: 'not_sure',      label: 'Not sure' },
];

// behaviorProfile multi-select — maps to user.behaviorProfile[]
const BEHAVIOR_OPTIONS = [
  { value: 'spend_least',   label: 'Spend the least',  icon: 'dollar-sign' },
  { value: 'high_protein',  label: 'High protein',     icon: 'dumbbell'    },
  { value: 'lower_calorie', label: 'Lower calorie',    icon: 'heart'       },
  { value: 'kid_friendly',  label: 'Kid-friendly',     icon: 'child'       },
  { value: 'fastest',       label: 'Fastest option',   icon: 'bolt'        },
  { value: 'healthier',     label: 'Healthier',        icon: 'leaf'        },
  { value: 'comfort',       label: 'Comfort food',     icon: 'home'        },
  { value: 'batch_freeze',  label: 'Batch & freeze',   icon: 'snowflake'   },
];

const FALLBACK_CONTEXT = {
  weeklyBudgetCents:    20000,
  remainingBudgetCents: 12000,
  householdSize:        2,
  tonightEatersCount:   2,
  shoppingStatus:       'not_yet',
  timeWindow:           '30_45',
  checkPantryFirst:     false,
  behaviorProfile:      ['spend_least'],
  mode:                 'live_stacks',
};

// ── Module-scope helpers ───────────────────────────────────────────────────────

function SectionLabel({ text, prefilled }) {
  return (
    <View style={s.sectionLabelRow}>
      <Text style={s.sectionLabel}>{text}</Text>
      {prefilled ? (
        <View style={s.prefilledBadge}>
          <Feather name="check" size={10} color={GREEN} />
        </View>
      ) : null}
    </View>
  );
}

function Stepper({ value, onDecrement, onIncrement, min, max }) {
  return (
    <View style={s.stepperRow}>
      <TouchableOpacity
        style={[s.stepperBtn, value <= min && s.stepperBtnDisabled]}
        onPress={onDecrement}
        disabled={value <= min}
        activeOpacity={0.7}
      >
        <Feather name="minus" size={16} color={value <= min ? BORDER : NAVY} />
      </TouchableOpacity>
      <Text style={s.stepperValue}>{value}</Text>
      <TouchableOpacity
        style={[s.stepperBtn, value >= max && s.stepperBtnDisabled]}
        onPress={onIncrement}
        disabled={value >= max}
        activeOpacity={0.7}
      >
        <Feather name="plus" size={16} color={value >= max ? BORDER : NAVY} />
      </TouchableOpacity>
    </View>
  );
}

function PillRow({ options, selected, onSelect }) {
  return (
    <View style={s.pillRow}>
      {options.map((opt) => {
        const isOn = selected === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[s.pill, isOn ? s.pillOn : s.pillOff]}
            onPress={() => onSelect(opt.value)}
            activeOpacity={0.75}
          >
            <Text style={[s.pillText, isOn ? s.pillTextOn : s.pillTextOff]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function BehaviorTag({ value, label, icon, selected, onToggle }) {
  return (
    <TouchableOpacity
      style={[s.bTag, selected && s.bTagOn]}
      onPress={() => onToggle(value)}
      activeOpacity={0.78}
    >
      <FontAwesome5 name={icon} size={13} color={selected ? WHITE : GREEN} solid style={{ marginRight: 6 }} />
      <Text style={[s.bTagText, selected && s.bTagTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function TodaySetupGateScreen({ navigation, route }) {
  const params          = route?.params ?? {};
  const existingProfile = params.existingProfile ?? null;

  const [weeklyBudget,      setWeeklyBudget]      = useState('');
  const [householdSize,     setHouseholdSize]      = useState(2);
  const [tonightEaters,     setTonightEaters]      = useState(2);
  const [shoppingStatus,    setShoppingStatus]     = useState(null);
  const [timeWindow,        setTimeWindow]         = useState(null);
  const [checkPantryFirst,  setCheckPantryFirst]   = useState(null);
  const [behaviorProfile,   setBehaviorProfile]    = useState([]);
  const [loading,           setLoading]            = useState(true);
  const [saving,            setSaving]             = useState(false);
  const [prefilledBudget,   setPrefilledBudget]    = useState(false);
  const [prefilledHousehold,setPrefilledHousehold] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      if (existingProfile) {
        applyProfile(existingProfile);
        setLoading(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('weekly_budget, household_size, grocery_status, time_before_dinner, pantry_preference, today_goal, nutrition_profile_set')
          .eq('user_id', user.id)
          .single();
        if (data) applyProfile(data);
      }
    } catch (_) {}
    setLoading(false);
  }

  function applyProfile(p) {
    if (p.weekly_budget && Number(p.weekly_budget) > 0) {
      setWeeklyBudget(String(Math.round(p.weekly_budget)));
      setPrefilledBudget(true);
    }
    if (p.household_size && Number(p.household_size) > 0) {
      const hs = Math.min(12, Math.max(1, Number(p.household_size)));
      setHouseholdSize(hs);
      setTonightEaters(hs);
      setPrefilledHousehold(true);
    }
    if (p.grocery_status)      setShoppingStatus(p.grocery_status);
    if (p.time_before_dinner)  setTimeWindow(p.time_before_dinner);
    if (p.pantry_preference)   setCheckPantryFirst(p.pantry_preference);
    if (p.today_goal)          setBehaviorProfile([p.today_goal]);
  }

  function toggleBehavior(value) {
    setBehaviorProfile((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : prev.concat([value])
    );
  }

  function buildContext() {
    const weekly = parseFloat(weeklyBudget) || 0;
    return {
      weeklyBudgetCents:    Math.round(weekly * 100),
      remainingBudgetCents: Math.round(weekly * 100 * 0.6),
      weeklyGroceryBudget:  weekly,
      householdSize,
      tonightEatersCount:   tonightEaters,
      shoppingStatus,
      timeWindow,
      checkPantryFirst,
      behaviorProfile,
      mode: shoppingStatus === 'not_yet' ? 'live_stacks' : 'plan_tonight',
    };
  }

  function handleSubmit() {
    const budgetVal = parseFloat(weeklyBudget);
    if (!weeklyBudget || budgetVal <= 0) {
      Alert.alert(
        'No budget entered',
        'Snippd works best with a weekly budget. Continue without one?',
        [
          { text: 'Add budget', style: 'cancel' },
          { text: 'Continue anyway', onPress: saveAndNavigate },
        ]
      );
      return;
    }
    saveAndNavigate();
  }

  async function saveAndNavigate() {
    setSaving(true);
    const context = buildContext();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').upsert({
          user_id:            user.id,
          weekly_budget:      context.weeklyGroceryBudget || null,
          household_size:     householdSize,
          grocery_status:     shoppingStatus,
          time_before_dinner: timeWindow,
          pantry_preference:  checkPantryFirst,
          today_goal:         behaviorProfile[0] ?? null,
          updated_at:         new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }
      tracker.track('today_setup_completed', {
        has_budget:          context.weeklyGroceryBudget > 0,
        shopping_status:     shoppingStatus,
        behavior_profile:    behaviorProfile,
        route_mode:          context.mode,
      });
    } catch (_) {}
    setSaving(false);
    navigation.navigate('TodayOptionsRanked', { context });
  }

  function handleSkip() {
    tracker.track('today_setup_skipped', {});
    navigation.navigate('TodayOptionsRanked', { context: FALLBACK_CONTEXT });
  }

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.loadingWrap}>
          <ActivityIndicator color={GREEN} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      {/* ── Logo header ───────────────────────────────────────────────── */}
      <View style={s.logoRow}>
        <Text style={s.logoText}>snippd</Text>
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.7} style={s.skipBtn}>
          <Text style={s.skipTxt}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.screenTitle}>Today's Setup</Text>
        <Text style={s.screenSub}>Tell Snippd what you're working with and it will handle the rest.</Text>

        {/* ── 1. Weekly Budget ──────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionLabel text="Weekly food budget" prefilled={prefilledBudget} />
          <View style={s.inputCard}>
            <Text style={s.inputPrefix}>$</Text>
            <TextInput
              style={s.input}
              value={weeklyBudget}
              onChangeText={setWeeklyBudget}
              placeholder="0"
              placeholderTextColor={GRAY}
              selectionColor={GREEN}
              keyboardType="numeric"
              returnKeyType="done"
            />
          </View>
          <Text style={s.inputHint}>Maps to your weekly grocery budget — remaining balance shown in your wallet.</Text>
        </View>

        {/* ── 2. Household size ─────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionLabel text="How many people are in your household?" prefilled={prefilledHousehold} />
          <Stepper
            value={householdSize}
            onDecrement={() => {
              const next = Math.max(1, householdSize - 1);
              setHouseholdSize(next);
              if (tonightEaters > next) setTonightEaters(next);
            }}
            onIncrement={() => setHouseholdSize(Math.min(12, householdSize + 1))}
            min={1}
            max={12}
          />
        </View>

        {/* ── 3. Tonight eaters ─────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionLabel text="How many people are eating tonight?" prefilled={false} />
          <Stepper
            value={tonightEaters}
            onDecrement={() => setTonightEaters(Math.max(1, tonightEaters - 1))}
            onIncrement={() => setTonightEaters(Math.min(householdSize, tonightEaters + 1))}
            min={1}
            max={householdSize}
          />
          <Text style={s.inputHint}>Drives portion sizing and per-person cost breakdowns.</Text>
        </View>

        {/* ── 4. Have you shopped? ──────────────────────────────────────── */}
        <View style={s.section}>
          <SectionLabel text="Have you grocery shopped this week?" prefilled={false} />
          <PillRow options={GROCERY_OPTIONS} selected={shoppingStatus} onSelect={setShoppingStatus} />
          {shoppingStatus === 'not_yet' && (
            <View style={s.routeHint}>
              <Feather name="map-pin" size={12} color={GREEN} style={{ marginRight: 6 }} />
              <Text style={s.routeHintText}>We'll load your live deal stacks and shopping route.</Text>
            </View>
          )}
          {(shoppingStatus === 'yes' || shoppingStatus === 'partially') && (
            <View style={s.routeHint}>
              <Feather name="check-circle" size={12} color={GREEN} style={{ marginRight: 6 }} />
              <Text style={s.routeHintText}>We'll focus on tonight's dinner and what you already have.</Text>
            </View>
          )}
        </View>

        {/* ── 5. Time before dinner ─────────────────────────────────────── */}
        <View style={s.section}>
          <SectionLabel text="How much time before dinner?" prefilled={false} />
          <View style={s.pillGrid}>
            {TIME_OPTIONS.map((opt) => {
              const isOn = timeWindow === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.pillGridItem, isOn ? s.pillOn : s.pillOff]}
                  onPress={() => setTimeWindow(opt.value)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.pillText, isOn ? s.pillTextOn : s.pillTextOff]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={s.inputHint}>Filters recipes to your exact time window — under 15 min = quick-cook only.</Text>
        </View>

        {/* ── 6. Check pantry first? ────────────────────────────────────── */}
        <View style={s.section}>
          <SectionLabel text="Should Snippd check pantry options first?" prefilled={false} />
          <PillRow options={PANTRY_OPTIONS} selected={checkPantryFirst} onSelect={setCheckPantryFirst} />
        </View>

        {/* ── 7. What matters most today? ───────────────────────────────── */}
        <View style={s.section}>
          <SectionLabel text="What matters most to you today?" prefilled={false} />
          <Text style={s.inputHint} style={{ marginBottom: 12 }}>
            Select all that apply — this powers your behavioral deal stack.
          </Text>
          <View style={s.bTagWrap}>
            {BEHAVIOR_OPTIONS.map((opt) => (
              <BehaviorTag
                key={opt.value}
                value={opt.value}
                label={opt.label}
                icon={opt.icon}
                selected={behaviorProfile.includes(opt.value)}
                onToggle={toggleBehavior}
              />
            ))}
          </View>
        </View>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.ctaBtn, saving && s.ctaBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={WHITE} size="small" />
          ) : (
            <>
              <Text style={s.ctaBtnText}>Show My Best Options</Text>
              <Feather name="arrow-right" size={18} color={WHITE} style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: CREAM },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Logo header
  logoRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    position: 'relative',
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: CREAM,
  },
  logoText: { fontSize: 22, fontWeight: '800', color: GREEN, letterSpacing: -0.5 },
  skipBtn:  { position: 'absolute', right: 20, padding: 4 },
  skipTxt:  { fontSize: 14, color: GRAY, fontWeight: '500' },

  // Screen title
  screenTitle: {
    fontSize: 22, fontWeight: '800', color: NAVY,
    letterSpacing: -0.4, marginBottom: 6,
  },
  screenSub: {
    fontSize: 14, color: GRAY, lineHeight: 20, marginBottom: 28,
  },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  // Sections
  section: { marginBottom: 28 },

  sectionLabelRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: GRAY,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  prefilledBadge: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: MINT,
    borderWidth: 1, borderColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },

  // Budget input
  inputCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: WHITE, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  inputPrefix: { fontSize: 18, fontWeight: '700', color: NAVY, marginRight: 4 },
  input: {
    flex: 1, fontSize: 18, fontWeight: '700', color: NAVY,
    padding: 0, margin: 0,
  },
  inputHint: { marginTop: 6, fontSize: 12, color: GRAY, lineHeight: 16 },

  // Stepper
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperValue: {
    fontSize: 24, fontWeight: '800', color: NAVY,
    minWidth: 36, textAlign: 'center',
  },

  // Pills
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  pillGridItem: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1, minWidth: '45%', alignItems: 'center',
  },
  pill: {
    borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1,
  },
  pillOn:      { backgroundColor: GREEN, borderColor: GREEN },
  pillOff:     { backgroundColor: WHITE, borderColor: BORDER },
  pillText:    { fontSize: 13, fontWeight: '600' },
  pillTextOn:  { color: WHITE },
  pillTextOff: { color: NAVY },

  // Route hint
  routeHint: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: MINT_SOFT, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    marginTop: 10,
  },
  routeHintText: { fontSize: 12, color: GREEN, fontWeight: '600', flex: 1 },

  // Behavioral profile tag cloud
  bTagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bTag: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1.5, borderColor: GREEN,
    backgroundColor: MINT_SOFT,
  },
  bTagOn:      { backgroundColor: GREEN, borderColor: GREEN },
  bTagText:    { fontSize: 13, fontWeight: '600', color: GREEN },
  bTagTextOn:  { color: WHITE },

  // CTA
  ctaBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, marginTop: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: { fontSize: 16, fontWeight: '800', color: WHITE },
});
