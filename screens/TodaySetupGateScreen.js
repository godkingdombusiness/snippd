/**
 * TodaySetupGateScreen.js
 *
 * Before Snippd ranks dinner options, collect the minimum decision profile.
 * If data already exists in the profile (passed as route.params.existingProfile
 * or loaded from Supabase), pre-fill and skip fields that are already answered.
 *
 * All state written to Supabase profiles table on submit.
 * On skip, navigates to TodayOptionsRanked with demo/fallback context.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var MINT   = '#E8F5E9';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var CORAL  = '#fb5b5b';
var AMBER  = '#F59E0B';

var GROCERY_OPTIONS = [
  { value: 'yes',       label: 'Yes' },
  { value: 'no',        label: 'Not yet' },
  { value: 'partially', label: 'Partially' },
];

var TIME_OPTIONS = [
  { value: 'under_15', label: 'Under 15 min' },
  { value: '15_30',    label: '15–30 min' },
  { value: '30_45',    label: '30–45 min' },
  { value: 'over_45',  label: 'Over 45 min' },
];

var PANTRY_OPTIONS = [
  { value: 'use_first',     label: 'Yes, use what I have' },
  { value: 'shop_or_order', label: 'No, I can shop or order' },
  { value: 'not_sure',      label: 'Not sure' },
];

var GOAL_OPTIONS = [
  { value: 'spend_least',   label: 'Spend the least' },
  { value: 'high_protein',  label: 'High protein' },
  { value: 'lower_calorie', label: 'Lower calorie' },
  { value: 'kid_friendly',  label: 'Kid-friendly' },
  { value: 'fastest',       label: 'Fastest option' },
  { value: 'healthier',     label: 'Healthier' },
  { value: 'comfort',       label: 'Comfort food' },
  { value: 'family_meal',   label: 'Family meal' },
];

var FALLBACK_CONTEXT = {
  weeklyBudgetCents:     20000,
  remainingBudgetCents:  12000,
  householdSize:         2,
  peopleEatingToday:     2,
  groceryStatus:         'no',
  timeBeforeDinner:      '30_45',
  pantryPreference:      'not_sure',
  todayGoal:             'spend_least',
};

// ── Module-scope render helpers ───────────────────────────────────────────────

function renderSectionLabel(text, prefilled) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{text}</Text>
      {prefilled ? (
        <View style={styles.prefilledBadge}>
          <Feather name="check" size={10} color={GREEN} />
        </View>
      ) : null}
    </View>
  );
}

function renderCounter(value, onDecrement, onIncrement, min, max) {
  return (
    <View style={styles.counterRow}>
      <TouchableOpacity
        style={[styles.counterBtn, value <= min && styles.counterBtnDisabled]}
        onPress={onDecrement}
        disabled={value <= min}
        activeOpacity={0.7}
      >
        <Feather name="minus" size={16} color={value <= min ? BORDER : NAVY} />
      </TouchableOpacity>
      <Text style={styles.counterValue}>{value}</Text>
      <TouchableOpacity
        style={[styles.counterBtn, value >= max && styles.counterBtnDisabled]}
        onPress={onIncrement}
        disabled={value >= max}
        activeOpacity={0.7}
      >
        <Feather name="plus" size={16} color={value >= max ? BORDER : NAVY} />
      </TouchableOpacity>
    </View>
  );
}

function renderPillRow(options, selected, onSelect) {
  return (
    <View style={styles.pillRow}>
      {options.map(function (opt) {
        var isSelected = selected === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.pill, isSelected ? styles.pillSelected : styles.pillUnselected]}
            onPress={function () { onSelect(opt.value); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.pillText, isSelected ? styles.pillTextSelected : styles.pillTextUnselected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function renderPillGrid(options, selected, onSelect) {
  var rows = [];
  for (var i = 0; i < options.length; i += 2) {
    var pair = options.slice(i, i + 2);
    rows.push(
      <View key={i} style={styles.pillGridRow}>
        {pair.map(function (opt) {
          var isSelected = selected === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.pillGridItem, isSelected ? styles.pillSelected : styles.pillUnselected]}
              onPress={function () { onSelect(opt.value); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, isSelected ? styles.pillTextSelected : styles.pillTextUnselected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }
  return <View style={styles.pillGrid}>{rows}</View>;
}

function renderPillWrap(options, selected, onSelect) {
  return (
    <View style={styles.pillWrap}>
      {options.map(function (opt) {
        var isSelected = selected === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.pill, isSelected ? styles.pillSelected : styles.pillUnselected]}
            onPress={function () { onSelect(opt.value); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.pillText, isSelected ? styles.pillTextSelected : styles.pillTextUnselected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TodaySetupGateScreen(props) {
  var navigation = props.navigation;
  var route      = props.route;
  var params     = (route && route.params) || {};
  var existingProfile = params.existingProfile || null;

  var [weeklyBudget,       setWeeklyBudget]       = useState('');
  var [householdSize,      setHouseholdSize]       = useState(2);
  var [peopleEatingToday,  setPeopleEatingToday]   = useState(2);
  var [groceryStatus,      setGroceryStatus]       = useState(null);
  var [timeBeforeDinner,   setTimeBeforeDinner]    = useState(null);
  var [pantryPreference,   setPantryPreference]    = useState(null);
  var [todayGoal,          setTodayGoal]           = useState(null);
  var [allergyAcknowledged, setAllergyAcknowledged] = useState(false);
  var [saving,             setSaving]              = useState(false);
  var [loading,            setLoading]             = useState(true);

  // Track which fields were pre-filled from profile
  var [prefilledBudget,    setPrefilledBudget]     = useState(false);
  var [prefilledHousehold, setPrefilledHousehold]  = useState(false);

  useEffect(function () {
    loadProfile();
  }, []);

  function loadProfile() {
    (async function () {
      try {
        // If existingProfile was passed via params, use it directly
        if (existingProfile) {
          applyProfile(existingProfile);
          setLoading(false);
          return;
        }

        var authResult = await supabase.auth.getUser();
        var user = authResult.data && authResult.data.user;
        if (!user) {
          setLoading(false);
          return;
        }

        var result = await supabase
          .from('profiles')
          .select('weekly_budget, household_size, grocery_status, time_before_dinner, pantry_preference, today_goal, nutrition_profile_set')
          .eq('user_id', user.id)
          .single();

        if (result.data) {
          applyProfile(result.data);
        }
      } catch (_e) {
        // Non-blocking — user can fill in manually
      }
      setLoading(false);
    })();
  }

  function applyProfile(profile) {
    if (profile.weekly_budget && Number(profile.weekly_budget) > 0) {
      setWeeklyBudget(String(Math.round(profile.weekly_budget)));
      setPrefilledBudget(true);
    }
    if (profile.household_size && Number(profile.household_size) > 0) {
      var hs = Math.min(12, Math.max(1, Number(profile.household_size)));
      setHouseholdSize(hs);
      setPeopleEatingToday(hs);
      setPrefilledHousehold(true);
    }
    if (profile.grocery_status) {
      setGroceryStatus(profile.grocery_status);
    }
    if (profile.time_before_dinner) {
      setTimeBeforeDinner(profile.time_before_dinner);
    }
    if (profile.pantry_preference) {
      setPantryPreference(profile.pantry_preference);
    }
    if (profile.today_goal) {
      setTodayGoal(profile.today_goal);
    }
    if (profile.nutrition_profile_set) {
      setAllergyAcknowledged(true);
    }
  }

  function buildContext() {
    var budgetCents    = weeklyBudget ? Math.round(parseFloat(weeklyBudget) * 100) : 0;
    var remainingCents = weeklyBudget ? Math.round(parseFloat(weeklyBudget) * 100 * 0.6) : 0;
    return {
      weeklyBudgetCents:    budgetCents,
      remainingBudgetCents: remainingCents,
      householdSize:        householdSize,
      peopleEatingToday:    peopleEatingToday,
      groceryStatus:        groceryStatus,
      timeBeforeDinner:     timeBeforeDinner,
      pantryPreference:     pantryPreference,
      todayGoal:            todayGoal,
    };
  }

  function handleSubmit() {
    var budgetVal = parseFloat(weeklyBudget);
    var hasBudget = weeklyBudget && budgetVal > 0;

    if (!hasBudget) {
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

  function saveAndNavigate() {
    (async function () {
      setSaving(true);
      try {
        var authResult = await supabase.auth.getUser();
        var user = authResult.data && authResult.data.user;

        var budgetVal  = parseFloat(weeklyBudget) || 0;
        var hasBudget  = budgetVal > 0;

        if (user) {
          var upsertData = {
            user_id:           user.id,
            weekly_budget:     hasBudget ? budgetVal : null,
            household_size:    householdSize,
            grocery_status:    groceryStatus,
            time_before_dinner: timeBeforeDinner,
            pantry_preference: pantryPreference,
            today_goal:        todayGoal,
            updated_at:        new Date().toISOString(),
          };
          await supabase
            .from('profiles')
            .upsert(upsertData, { onConflict: 'user_id' });
        }

        tracker.track('today_setup_completed', {
          has_budget:         hasBudget,
          has_household:      householdSize > 0,
          has_goal:           !!todayGoal,
          has_grocery_status: !!groceryStatus,
        });

        navigation.navigate('TodayOptionsRanked', { context: buildContext() });
      } catch (_e) {
        // Even on save error, navigate forward
        navigation.navigate('TodayOptionsRanked', { context: buildContext() });
      }
      setSaving(false);
    })();
  }

  function handleSkip() {
    tracker.track('today_setup_skipped', {});
    navigation.navigate('TodayOptionsRanked', { context: FALLBACK_CONTEXT });
  }

  function handleBack() {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  function handleDecrementHousehold() {
    var next = Math.max(1, householdSize - 1);
    setHouseholdSize(next);
    if (peopleEatingToday > next) {
      setPeopleEatingToday(next);
    }
  }

  function handleIncrementHousehold() {
    var next = Math.min(12, householdSize + 1);
    setHouseholdSize(next);
  }

  function handleDecrementPeople() {
    setPeopleEatingToday(Math.max(1, peopleEatingToday - 1));
  }

  function handleIncrementPeople() {
    setPeopleEatingToday(Math.min(12, peopleEatingToday + 1));
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GREEN} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      {/* NavBar */}
      <View style={styles.navbar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.navBackBtn}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Today's Setup</Text>
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.7} style={styles.navSkipBtn}>
          <Text style={styles.navSkipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Section: Budget */}
        <View style={styles.section}>
          {renderSectionLabel('Weekly food budget', prefilledBudget)}
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              value={weeklyBudget}
              onChangeText={setWeeklyBudget}
              placeholder="$0"
              placeholderTextColor={GRAY}
              keyboardType="numeric"
              returnKeyType="done"
            />
          </View>
          <Text style={styles.inputHint}>What you plan to spend on food this week</Text>
        </View>

        {/* Section: Household */}
        <View style={styles.section}>
          {renderSectionLabel('How many people are in your household?', prefilledHousehold)}
          {renderCounter(householdSize, handleDecrementHousehold, handleIncrementHousehold, 1, 12)}
        </View>

        {/* Section: People eating today */}
        <View style={styles.section}>
          {renderSectionLabel('How many people are eating today?', false)}
          {renderCounter(peopleEatingToday, handleDecrementPeople, handleIncrementPeople, 1, 12)}
        </View>

        {/* Section: Grocery status */}
        <View style={styles.section}>
          {renderSectionLabel('Have you grocery shopped this week?', false)}
          {renderPillRow(GROCERY_OPTIONS, groceryStatus, setGroceryStatus)}
        </View>

        {/* Section: Time before dinner */}
        <View style={styles.section}>
          {renderSectionLabel('How much time before dinner?', false)}
          {renderPillGrid(TIME_OPTIONS, timeBeforeDinner, setTimeBeforeDinner)}
        </View>

        {/* Section: Pantry preference */}
        <View style={styles.section}>
          {renderSectionLabel('Should Snippd check pantry options first?', false)}
          {renderPillRow(PANTRY_OPTIONS, pantryPreference, setPantryPreference)}
        </View>

        {/* Section: Today's goal */}
        <View style={styles.section}>
          {renderSectionLabel("What matters most today?", false)}
          {renderPillWrap(GOAL_OPTIONS, todayGoal, setTodayGoal)}
        </View>

        {/* Section: Food preferences */}
        <View style={styles.section}>
          {renderSectionLabel('Food preferences and allergy settings', false)}
          <Text style={styles.prefBody}>
            Snippd uses saved preferences to avoid poor recommendations. You can add or update these at any time.
          </Text>
          {allergyAcknowledged ? (
            <View style={styles.prefOnFile}>
              <Feather name="check-circle" size={16} color={GREEN} />
              <Text style={styles.prefOnFileText}>Preferences on file</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.prefAddBtn}
              onPress={function () { navigation.navigate('NutritionProfile'); }}
              activeOpacity={0.75}
            >
              <Text style={styles.prefAddBtnText}>Add food preferences</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bottom CTA */}
        <TouchableOpacity
          style={[styles.ctaBtn, saving && styles.ctaBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={WHITE} size="small" />
          ) : (
            <Text style={styles.ctaBtnText}>Show My Best Options</Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: CREAM },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Navbar
  navbar: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 20,
    paddingVertical:   14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor:   CREAM,
  },
  navBackBtn:  { padding: 4, marginRight: 8 },
  navTitle: {
    flex:       1,
    fontSize:   17,
    fontWeight: '700',
    color:      NAVY,
    textAlign:  'center',
  },
  navSkipBtn:  { padding: 4, marginLeft: 8 },
  navSkipText: { fontSize: 14, color: GRAY, fontWeight: '500' },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  // Sections
  section: { marginBottom: 28 },

  sectionLabelRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    marginBottom:   10,
  },
  sectionLabel: {
    fontSize:      11,
    fontWeight:    '700',
    color:         GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  prefilledBadge: {
    width:           18,
    height:          18,
    borderRadius:    9,
    backgroundColor: MINT,
    borderWidth:     1,
    borderColor:     GREEN,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Input
  inputCard: {
    backgroundColor: WHITE,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     BORDER,
    paddingHorizontal: 14,
    paddingVertical:   12,
  },
  input: {
    fontSize:  16,
    color:     NAVY,
    padding:   0,
    margin:    0,
  },
  inputHint: {
    marginTop:  6,
    fontSize:   12,
    color:      GRAY,
    lineHeight: 16,
  },

  // Counter
  counterRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           16,
  },
  counterBtn: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: WHITE,
    borderWidth:     1,
    borderColor:     BORDER,
    alignItems:      'center',
    justifyContent:  'center',
  },
  counterBtnDisabled: { opacity: 0.4 },
  counterValue: {
    fontSize:   22,
    fontWeight: '700',
    color:      NAVY,
    minWidth:   32,
    textAlign:  'center',
  },

  // Pills — inline row
  pillRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },

  // Pills — 2-column grid
  pillGrid:    { gap: 8 },
  pillGridRow: { flexDirection: 'row', gap: 8 },
  pillGridItem: {
    flex:             1,
    borderRadius:     20,
    paddingVertical:  9,
    paddingHorizontal: 16,
    borderWidth:      1,
    alignItems:       'center',
  },

  // Pills — wrap (for goals)
  pillWrap: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },

  // Pill base
  pill: {
    borderRadius:      20,
    paddingVertical:   9,
    paddingHorizontal: 16,
    borderWidth:       1,
  },
  pillSelected: {
    backgroundColor: GREEN,
    borderColor:     GREEN,
  },
  pillUnselected: {
    backgroundColor: WHITE,
    borderColor:     BORDER,
  },
  pillText:         { fontSize: 13, fontWeight: '600' },
  pillTextSelected: { color: WHITE },
  pillTextUnselected: { color: NAVY },

  // Food preferences
  prefBody: {
    fontSize:   13,
    color:      GRAY,
    lineHeight: 19,
    marginBottom: 12,
  },
  prefOnFile: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  prefOnFileText: {
    fontSize:   14,
    fontWeight: '600',
    color:      GREEN,
  },
  prefAddBtn: {
    alignSelf:       'flex-start',
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     GREEN,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  prefAddBtnText: {
    fontSize:   14,
    fontWeight: '600',
    color:      GREEN,
  },

  // CTA
  ctaBtn: {
    backgroundColor: GREEN,
    borderRadius:    16,
    paddingVertical: 16,
    alignItems:      'center',
    marginTop:       8,
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: {
    fontSize:   16,
    fontWeight: '700',
    color:      WHITE,
  },

  bottomSpacer: { height: 20 },
});
