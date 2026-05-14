/**
 * OnboardingScreen — 8-step onboarding flow.
 * Step 0:   Welcome  (dark-green hero, demo mode button)
 * Steps 1-7: content steps (cream BG, progress bar)
 * Finish: writes onboardingProfile to Supabase → navigate PersonaReveal
 * Demo mode: skips Supabase, navigates PersonaReveal with DEMO_PROFILE.
 *
 * Navigation order:
 *   Welcome → Missions → Budget → Household → Food Prefs → Cooking →
 *   Stores → Deal Prefs → PersonaReveal → MainApp
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

var GREEN      = '#0C9E54';
var DARK_GREEN = '#0A5C2B';
var NAVY       = '#172250';
var CREAM      = '#FAF8F1';
var WHITE      = '#FFFFFF';
var GRAY       = '#6B7280';
var BORDER     = '#E5E7EB';
var MINT       = '#E8F5E9';
var CORAL      = '#fb5b5b';
var AMBER      = '#F59E0B';

var TOTAL_STEPS   = 8;  // 0–7
var CONTENT_STEPS = 7;  // steps 1–7 show progress

// ── Demo profile (no Supabase writes) ────────────────────────────────────────

var DEMO_PROFILE = {
  isDemoMode:                     true,
  missions:                       ['pure_savings', 'meal_planning', 'clinical_guardrails'],
  weeklyBudget:                   250,
  weekly_budget_cents:            25000,
  household: {
    adults: 2, children: 2,
    infant: 0, toddler: 0, school_age: 1, teenager: 1,
  },
  cookingStyle:                   ['meal_prep', 'from_scratch'],
  foodsAvoided:                   ['high_sugar', 'high_sodium'],
  dietPreferences:                ['budget_friendly', 'family_friendly'],
  preferred_stores:               ['publix', 'aldi', 'walmart'],
  dealPreferences:                ['weekly_ads', 'digital_coupons', 'bogos', 'loyalty_offers'],
  projected_monthly_recovery_cents: 7400,
};

// ── Static data (module scope to avoid re-creation on render) ─────────────────

var MISSIONS = [
  { id: 'pure_savings',       label: 'Save as much as possible', icon: 'trending-up' },
  { id: 'meal_planning',      label: 'Plan weekly meals',         icon: 'calendar' },
  { id: 'athletic_fuel',      label: 'Fuel my fitness goals',     icon: 'activity' },
  { id: 'clinical_guardrails',label: 'Manage health conditions',  icon: 'shield' },
  { id: 'family_optimization',label: 'Feed my whole family',      icon: 'users' },
  { id: 'convenience',        label: 'Quick and easy meals',      icon: 'zap' },
];

var BUDGET_PRESETS = ['75', '100', '150', '200', '250', '300', '400'];

var ADULT_OPTIONS   = [1, 2, 3, 4];
var CHILD_OPTIONS   = [0, 1, 2, 3, 4];

var FOODS_AVOIDED = [
  { id: 'gluten',       label: 'Gluten' },
  { id: 'dairy',        label: 'Dairy' },
  { id: 'nuts',         label: 'Tree Nuts' },
  { id: 'peanuts',      label: 'Peanuts' },
  { id: 'shellfish',    label: 'Shellfish' },
  { id: 'pork',         label: 'Pork' },
  { id: 'beef',         label: 'Beef' },
  { id: 'soy',          label: 'Soy' },
  { id: 'eggs',         label: 'Eggs' },
  { id: 'high_sugar',   label: 'High Sugar' },
  { id: 'high_sodium',  label: 'High Sodium' },
];

var DIET_PREFS = [
  { id: 'budget_friendly',  label: 'Budget-friendly' },
  { id: 'family_friendly',  label: 'Family-friendly' },
  { id: 'high_protein',     label: 'High protein' },
  { id: 'low_carb',         label: 'Low carb' },
  { id: 'plant_based',      label: 'Plant-based' },
  { id: 'low_waste',        label: 'Low food waste' },
];

var COOKING_STYLES = [
  { id: 'from_scratch',  label: 'Cook from scratch',   icon: 'book-open' },
  { id: 'meal_prep',     label: 'Meal prep weekly',    icon: 'package' },
  { id: 'quick_meals',   label: 'Quick 30-min meals',  icon: 'clock' },
  { id: 'frozen',        label: 'Frozen / convenience',icon: 'box' },
  { id: 'takeout',       label: 'Mostly takeout',      icon: 'map-pin' },
  { id: 'variety',       label: 'Mix of everything',   icon: 'shuffle' },
];

var STORES = [
  { id: 'publix',         label: 'Publix' },
  { id: 'aldi',           label: 'Aldi' },
  { id: 'walmart',        label: 'Walmart' },
  { id: 'target',         label: 'Target' },
  { id: 'dollar_general', label: 'Dollar General' },
  { id: 'kroger',         label: 'Kroger' },
  { id: 'trader_joes',    label: "Trader Joe's" },
  { id: 'whole_foods',    label: 'Whole Foods' },
  { id: 'costco',         label: 'Costco' },
  { id: 'food_lion',      label: 'Food Lion' },
];

var DEAL_PREFS = [
  { id: 'weekly_ads',       label: 'Weekly Ads',       icon: 'file-text' },
  { id: 'digital_coupons',  label: 'Digital Coupons',  icon: 'tag' },
  { id: 'bogos',            label: 'BOGOs',             icon: 'gift' },
  { id: 'loyalty_offers',   label: 'Loyalty Offers',   icon: 'star' },
  { id: 'health_savings',   label: 'Healthy Savings',  icon: 'heart' },
  { id: 'lowest_total',     label: 'Lowest Total',     icon: 'dollar-sign' },
];

// ── Atom components (always at module scope) ──────────────────────────────────

function ProgressHeader({ step, onBack }) {
  var pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <View style={s.header}>
      <TouchableOpacity
        style={s.backBtn}
        onPress={onBack}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Feather name="arrow-left" size={24} color={NAVY} />
      </TouchableOpacity>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: pct + '%' }]} />
      </View>
      <Text style={s.stepCount}>{step}/{CONTENT_STEPS}</Text>
    </View>
  );
}

function BigBtn({ label, onPress, loading, variant }) {
  var btnStyle = variant === 'outline'
    ? [s.bigBtn, s.bigBtnOutline]
    : [s.bigBtn, s.bigBtnFill];
  var txtStyle = variant === 'outline' ? [s.bigBtnText, { color: WHITE }] : s.bigBtnText;
  return (
    <TouchableOpacity style={btnStyle} onPress={onPress} activeOpacity={0.85} disabled={!!loading}>
      {loading
        ? <ActivityIndicator color={variant === 'outline' ? WHITE : WHITE} size="small" />
        : <Text style={txtStyle}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

function OptionTile({ label, icon, selected, onPress, sublabel }) {
  return (
    <TouchableOpacity
      style={[s.optTile, selected && s.optTileOn]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {icon ? (
        <View style={[s.optIcon, selected && s.optIconOn]}>
          <Feather name={icon} size={20} color={selected ? WHITE : GREEN} />
        </View>
      ) : null}
      <View style={s.optBody}>
        <Text style={[s.optLabel, selected && s.optLabelOn]}>{label}</Text>
        {sublabel ? <Text style={[s.optSub, selected && s.optSubOn]}>{sublabel}</Text> : null}
      </View>
      {selected ? <Feather name="check-circle" size={18} color={WHITE} /> : null}
    </TouchableOpacity>
  );
}

function GridTile({ label, icon, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.gridTile, selected && s.gridTileOn]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {icon ? (
        <View style={[s.gridIcon, selected && s.gridIconOn]}>
          <Feather name={icon} size={20} color={selected ? WHITE : GREEN} />
        </View>
      ) : null}
      <Text style={[s.gridLabel, selected && s.gridLabelOn]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

function HChip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.hChip, selected && s.hChipOn]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[s.hChipText, selected && s.hChipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Pill({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.pill, selected && s.pillOn]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[s.pillText, selected && s.pillTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StoreCard({ label, selected, onPress }) {
  var initials = label.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  return (
    <TouchableOpacity
      style={[s.storeCard, selected && s.storeCardOn]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[s.storeAvatar, selected && s.storeAvatarOn]}>
        <Text style={[s.storeInitials, selected && s.storeInitialsOn]}>{initials}</Text>
      </View>
      <Text style={[s.storeLabel, selected && s.storeLabelOn]} numberOfLines={2}>{label}</Text>
      {selected ? (
        <View style={s.storeCheck}>
          <Feather name="check" size={10} color={WHITE} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingScreen({ navigation }) {
  var [step, setStep]          = useState(0);
  var [saving, setSaving]      = useState(false);
  var [budgetWarn, setBWarn]   = useState('');

  var [data, setData] = useState({
    missions:            [],
    weeklyBudget:        '',
    weekly_budget_cents: 0,
    household:           { adults: 2, children: 0 },
    cookingStyle:        [],
    foodsAvoided:        [],
    dietPreferences:     [],
    preferred_stores:    [],
    dealPreferences:     [],
    // Compat fields for existing Supabase schema
    grocery_pct:         70,
    brand_swap:          'sometimes',
    stash_style:         'smart',
  });

  function upd(key, value) {
    setData(function (p) { return Object.assign({}, p, { [key]: value }); });
  }

  function toggleArr(key, id) {
    setData(function (p) {
      var arr = p[key];
      return Object.assign({}, p, {
        [key]: arr.includes(id)
          ? arr.filter(function (v) { return v !== id; })
          : arr.concat([id]),
      });
    });
  }

  function updHousehold(key, value) {
    setData(function (p) {
      return Object.assign({}, p, {
        household: Object.assign({}, p.household, { [key]: value }),
      });
    });
  }

  function next() { setStep(function (n) { return Math.min(n + 1, TOTAL_STEPS - 1); }); }
  function back() { setStep(function (n) { return Math.max(n - 1, 0); }); }

  function buildPersonaParams(d, extra) {
    var adults   = d.household.adults || 2;
    var children = d.household.children || 0;
    return Object.assign({
      isDemoMode:     false,
      missions:       d.missions,
      weeklyBudget:   parseFloat(d.weeklyBudget) || 0,
      weekly_budget_cents: Math.round((parseFloat(d.weeklyBudget) || 0) * 100),
      household: {
        adults:     adults,
        children:   children,
        school_age: children,
        infant:     0, toddler: 0, teenager: 0,
      },
      cookingStyle:    d.cookingStyle,
      foodsAvoided:    d.foodsAvoided,
      dietPreferences: d.dietPreferences,
      preferred_stores: d.preferred_stores,
      dealPreferences: d.dealPreferences,
    }, extra || {});
  }

  function tryDemoMode() {
    navigation.navigate('PersonaReveal', DEMO_PROFILE);
  }

  async function finishOnboarding() {
    setSaving(true);
    try {
      var { data: authData } = await supabase.auth.getUser();
      var user = authData && authData.user;
      if (user) {
        var budget  = parseFloat(data.weeklyBudget) || 0;
        var allGoals = data.missions.concat(data.dietPreferences);
        await supabase.from('profiles').upsert({
          user_id:              user.id,
          weekly_budget:        budget,
          grocery_pct:          data.grocery_pct,
          household_size:       (data.household.adults || 2) + (data.household.children || 0),
          food_goals:           allGoals,
          preferred_stores:     data.preferred_stores,
          avoids:               data.foodsAvoided,
          cooking_days:         3,
          cooking_time:         '30',
          cooking_skill:        'medium',
          eat_out_days:         2,
          eat_out_types:        [],
          brand_swap:           data.brand_swap,
          stash_style:          data.stash_style,
          onboarding_completed: true,
        }, { onConflict: 'user_id' });
        await supabase.from('user_persona').upsert({
          user_id:              user.id,
          status:               'onboarded',
          onboarding_completed: true,
        }, { onConflict: 'user_id' });
      }
    } catch (e) {
      console.warn('[Onboarding] save error', e);
    }
    setSaving(false);
    navigation.navigate('PersonaReveal', buildPersonaParams(data));
  }

  // ── Step 0: Welcome ────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <SafeAreaView style={s.darkRoot} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor={DARK_GREEN} />
        <View style={s.heroBody}>
          <View style={s.heroLogoWrap}>
            <Feather name="shopping-bag" size={44} color={DARK_GREEN} />
          </View>
          <Text style={s.heroTitle}>Welcome to Snippd</Text>
          <Text style={s.heroSub}>
            Your personal grocery concierge.{'\n'}Smarter meals. Real savings — built around your life.
          </Text>
          <View style={s.heroBtns}>
            <TouchableOpacity style={s.heroMainBtn} onPress={next} activeOpacity={0.85}>
              <Text style={s.heroMainBtnText}>Get Started</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.heroDemoBtn} onPress={tryDemoMode} activeOpacity={0.8}>
              <Feather name="play" size={16} color={WHITE} style={{ marginRight: 8 }} />
              <Text style={s.heroDemoBtnText}>Try Demo Mode</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={function () { navigation.navigate('Auth'); }} activeOpacity={0.7}>
              <Text style={s.signInRow}>
                Already have an account?{'  '}
                <Text style={s.signInBold}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Steps 1-7 render functions ─────────────────────────────────────────────

  function renderStep1() {
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>What matters most{'\n'}to you?</Text>
        <Text style={s.sub}>Choose all that apply. I'll build your plan around these goals.</Text>
        <View style={s.cardList}>
          {MISSIONS.map(function (m) {
            return (
              <OptionTile
                key={m.id}
                label={m.label}
                icon={m.icon}
                selected={data.missions.includes(m.id)}
                onPress={function () { toggleArr('missions', m.id); }}
              />
            );
          })}
        </View>
        <BigBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  function renderStep2() {
    function handleChange(text) {
      var cleaned = text.replace(/[^0-9]/g, '');
      upd('weeklyBudget', cleaned);
      upd('weekly_budget_cents', Math.round((parseFloat(cleaned) || 0) * 100));
      var val = parseInt(cleaned, 10);
      if (!cleaned)  { setBWarn(''); return; }
      if (val < 25)  { setBWarn('Plans work best with at least $25 a week.'); return; }
      if (val > 800) { setBWarn('That seems high — double-check your weekly amount.'); return; }
      setBWarn('');
    }

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.headline}>What's your weekly{'\n'}grocery budget?</Text>
          <Text style={s.sub}>I'll keep every plan and recommendation inside your number.</Text>
          <View style={s.budgetDisplay}>
            <Text style={s.budgetSym}>$</Text>
            <TextInput
              style={s.budgetInput}
              keyboardType="number-pad"
              value={data.weeklyBudget}
              onChangeText={handleChange}
              placeholder="0"
              placeholderTextColor={BORDER}
              maxLength={4}
              autoFocus
              selectionColor={GREEN}
            />
            <Text style={s.budgetUnit}>/wk</Text>
          </View>
          {budgetWarn ? <Text style={s.budgetWarn}>{budgetWarn}</Text> : null}
          <Text style={s.fieldLabel}>Common budgets</Text>
          <View style={s.pillRow}>
            {BUDGET_PRESETS.map(function (q) {
              return (
                <Pill
                  key={q}
                  label={'$' + q}
                  selected={data.weeklyBudget === q}
                  onPress={function () { upd('weeklyBudget', q); upd('weekly_budget_cents', parseInt(q, 10) * 100); setBWarn(''); }}
                />
              );
            })}
          </View>
          <Text style={s.hint}>You can update this any time from your profile.</Text>
          <BigBtn label="Continue" onPress={next} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderStep3() {
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>Tell us about{'\n'}your household</Text>
        <Text style={s.sub}>I'll scale portions, quantities, and budget to fit your family.</Text>

        <Text style={s.fieldLabel}>Adults in your household</Text>
        <View style={s.hChipRow}>
          {ADULT_OPTIONS.map(function (n) {
            return (
              <HChip
                key={n}
                label={n === 4 ? '4+' : String(n)}
                selected={data.household.adults === n}
                onPress={function () { updHousehold('adults', n); }}
              />
            );
          })}
        </View>

        <Text style={[s.fieldLabel, { marginTop: 24 }]}>Children (under 18)</Text>
        <View style={s.hChipRow}>
          {CHILD_OPTIONS.map(function (n) {
            return (
              <HChip
                key={n}
                label={n === 4 ? '4+' : String(n)}
                selected={data.household.children === n}
                onPress={function () { updHousehold('children', n); }}
              />
            );
          })}
        </View>

        <View style={{ height: 24 }} />
        <BigBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  function renderStep4() {
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>Food preferences{'\n'}&amp; restrictions</Text>
        <Text style={s.sub}>I'll filter these out of every meal and deal recommendation.</Text>

        <Text style={s.fieldLabel}>Foods to avoid</Text>
        <View style={s.pillRow}>
          {FOODS_AVOIDED.map(function (f) {
            return (
              <Pill
                key={f.id}
                label={f.label}
                selected={data.foodsAvoided.includes(f.id)}
                onPress={function () { toggleArr('foodsAvoided', f.id); }}
              />
            );
          })}
        </View>

        <Text style={[s.fieldLabel, { marginTop: 24 }]}>Diet preferences</Text>
        <View style={s.pillRow}>
          {DIET_PREFS.map(function (d) {
            return (
              <Pill
                key={d.id}
                label={d.label}
                selected={data.dietPreferences.includes(d.id)}
                onPress={function () { toggleArr('dietPreferences', d.id); }}
              />
            );
          })}
        </View>

        <Text style={s.disclaimer}>
          Snippd is a planning tool, not a medical guide. Always verify ingredient labels for severe allergies.
        </Text>
        <BigBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  function renderStep5() {
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>How do you{'\n'}cook at home?</Text>
        <Text style={s.sub}>Pick all that match your typical week. No wrong answers.</Text>
        <View style={s.cardList}>
          {COOKING_STYLES.map(function (c) {
            return (
              <OptionTile
                key={c.id}
                label={c.label}
                icon={c.icon}
                selected={data.cookingStyle.includes(c.id)}
                onPress={function () { toggleArr('cookingStyle', c.id); }}
              />
            );
          })}
        </View>
        <BigBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  function renderStep6() {
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>Choose your{'\n'}favorite stores</Text>
        <Text style={s.sub}>Select all the stores you shop at regularly — I'll track deals at each one.</Text>
        <View style={s.storeGrid}>
          {STORES.map(function (st) {
            return (
              <StoreCard
                key={st.id}
                label={st.label}
                selected={data.preferred_stores.includes(st.id)}
                onPress={function () { toggleArr('preferred_stores', st.id); }}
              />
            );
          })}
        </View>
        <BigBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  function renderStep7() {
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>Choose how Snippd{'\n'}finds your savings</Text>
        <Text style={s.sub}>
          I'll use your stores, budget, and preferences to surface the best weekly deals first.
        </Text>
        <View style={s.dealGrid}>
          {DEAL_PREFS.map(function (d) {
            return (
              <GridTile
                key={d.id}
                label={d.label}
                icon={d.icon}
                selected={data.dealPreferences.includes(d.id)}
                onPress={function () { toggleArr('dealPreferences', d.id); }}
              />
            );
          })}
        </View>
        <BigBtn label="Build My Plan" onPress={finishOnboarding} loading={saving} />
      </ScrollView>
    );
  }

  var stepRenders = [null, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7];

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />
      <ProgressHeader step={step} onBack={back} />
      {stepRenders[step]()}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

var s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: CREAM },
  darkRoot: { flex: 1, backgroundColor: DARK_GREEN },

  // ── Dark hero (step 0) ──
  heroBody: {
    flex: 1, paddingHorizontal: 28,
    justifyContent: 'center', alignItems: 'center', paddingBottom: 32,
  },
  heroLogoWrap: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 8,
  },
  heroTitle: {
    fontSize: 36, fontWeight: '800', color: WHITE,
    textAlign: 'center', letterSpacing: -0.8, lineHeight: 42, marginBottom: 12,
  },
  heroSub: {
    fontSize: 16, color: 'rgba(255,255,255,0.72)',
    textAlign: 'center', lineHeight: 24, marginBottom: 40, fontWeight: '300',
  },
  heroBtns: { width: '100%', gap: 12, alignItems: 'center' },
  heroMainBtn: {
    width: '100%', backgroundColor: WHITE, borderRadius: 14,
    paddingVertical: 17, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  heroMainBtnText: { fontSize: 16, fontWeight: '700', color: DARK_GREEN },
  heroDemoBtn: {
    width: '100%', borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
  },
  heroDemoBtnText: { fontSize: 15, fontWeight: '600', color: WHITE },
  signInRow:  { fontSize: 14, color: 'rgba(255,255,255,0.62)', textAlign: 'center', marginTop: 4 },
  signInBold: { color: WHITE, fontWeight: '700' },

  // ── Progress header ──
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, gap: 14,
  },
  backBtn:       { width: 32, alignItems: 'flex-start' },
  progressTrack: { flex: 1, height: 5, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: GREEN, borderRadius: 3 },
  stepCount:     { fontSize: 12, color: GRAY, fontWeight: '600', width: 28, textAlign: 'right' },

  // ── Content layout ──
  scroll:     { paddingHorizontal: 24, paddingBottom: 56, paddingTop: 4 },
  headline:   { fontSize: 30, fontWeight: '800', color: NAVY, letterSpacing: -0.5, lineHeight: 36, marginBottom: 10 },
  sub:        { fontSize: 16, color: GRAY, lineHeight: 24, fontWeight: '300', marginBottom: 28 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 12 },
  hint:       { fontSize: 13, color: GRAY, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 18 },
  disclaimer: { fontSize: 13, color: CORAL, lineHeight: 19, marginBottom: 24, marginTop: 8 },

  // ── Option tile (full-width card row) ──
  cardList: { gap: 10, marginBottom: 28 },
  optTile: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  optTileOn:   { backgroundColor: GREEN, borderColor: GREEN },
  optIcon:     { width: 42, height: 42, borderRadius: 12, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optIconOn:   { backgroundColor: 'rgba(255,255,255,0.25)' },
  optBody:     { flex: 1 },
  optLabel:    { fontSize: 16, fontWeight: '600', color: NAVY },
  optLabelOn:  { color: WHITE },
  optSub:      { fontSize: 13, color: GRAY, marginTop: 2 },
  optSubOn:    { color: 'rgba(255,255,255,0.8)' },

  // ── 2-col grid tiles (goals, deal prefs, cooking) ──
  dealGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  gridTile: {
    width: '47%', backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER, padding: 16,
    alignItems: 'flex-start', gap: 10, minHeight: 90,
  },
  gridTileOn:  { backgroundColor: GREEN, borderColor: GREEN },
  gridIcon:    { width: 40, height: 40, borderRadius: 10, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' },
  gridIconOn:  { backgroundColor: 'rgba(255,255,255,0.25)' },
  gridLabel:   { fontSize: 14, fontWeight: '600', color: NAVY, lineHeight: 20 },
  gridLabelOn: { color: WHITE },

  // ── Budget display ──
  budgetDisplay: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginVertical: 8 },
  budgetSym:  { fontSize: 36, fontWeight: '300', color: NAVY, lineHeight: 60 },
  budgetInput: {
    fontSize: 72, fontWeight: '700', color: NAVY,
    minWidth: 80, textAlign: 'center', letterSpacing: -2,
    padding: 0, margin: 0, backgroundColor: 'transparent',
  },
  budgetUnit: { fontSize: 20, color: GRAY, fontWeight: '300', marginBottom: 8 },
  budgetWarn: { fontSize: 14, color: CORAL, textAlign: 'center', marginBottom: 12 },

  // ── Household chips ──
  hChipRow:     { flexDirection: 'row', gap: 8, marginBottom: 8 },
  hChip:        { flex: 1, paddingVertical: 16, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE, alignItems: 'center' },
  hChipOn:      { backgroundColor: GREEN, borderColor: GREEN },
  hChipText:    { fontSize: 16, fontWeight: '600', color: NAVY },
  hChipTextOn:  { color: WHITE },

  // ── Pills ──
  pillRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  pill:        { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE },
  pillOn:      { backgroundColor: GREEN, borderColor: GREEN },
  pillText:    { fontSize: 15, fontWeight: '500', color: NAVY },
  pillTextOn:  { color: WHITE },

  // ── Store grid ──
  storeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  storeCard: {
    width: '47%', backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    padding: 14, alignItems: 'center', gap: 8, position: 'relative',
  },
  storeCardOn:     { backgroundColor: MINT, borderColor: GREEN },
  storeAvatar:     { width: 52, height: 52, borderRadius: 14, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  storeAvatarOn:   { backgroundColor: GREEN },
  storeInitials:   { fontSize: 18, fontWeight: '800', color: GRAY },
  storeInitialsOn: { color: WHITE },
  storeLabel:      { fontSize: 12, fontWeight: '600', color: NAVY, textAlign: 'center' },
  storeLabelOn:    { color: NAVY },
  storeCheck: {
    position: 'absolute', top: 6, right: 6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
  },

  // ── Primary button ──
  bigBtn: {
    borderRadius: 14, paddingVertical: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, marginTop: 4,
  },
  bigBtnFill: {
    backgroundColor: GREEN,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  bigBtnOutline: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
  },
  bigBtnText: { fontSize: 16, fontWeight: '700', color: WHITE },
});
