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

import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView,
  StatusBar, PanResponder, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
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
  { id: 'pure_savings',        label: 'Save Money',     sub: 'Find deals, coupons, and stack savings.',          icon: 'dollar-sign' },
  { id: 'meal_planning',       label: 'Plan My Meals',  sub: 'Shop smarter with weekly meal planning.',           icon: 'calendar' },
  { id: 'athletic_fuel',       label: 'Eat Healthier',  sub: 'High-protein & nutrition-focused choices.',         icon: 'heart' },
  { id: 'clinical_guardrails', label: 'Manage Health',  sub: 'Dietary needs, allergens & health goals.',          icon: 'shield' },
  { id: 'family_optimization', label: 'Feed My Family', sub: 'Stretch your budget for everyone at home.',         icon: 'users' },
  { id: 'convenience',         label: 'Keep It Simple', sub: 'Quick picks, minimal effort, less stress.',         icon: 'zap' },
];

var BUDGET_PRESETS = ['75', '100', '150', '200', '250', '300', '400'];

var ADULT_OPTIONS   = [1, 2, 3, 4];
var CHILD_OPTIONS   = [0, 1, 2, 3, 4];

var FOODS_AVOIDED = [
  { id: 'gluten',       label: 'Gluten-free' },
  { id: 'dairy',        label: 'Dairy-free' },
  { id: 'nuts',         label: 'Nut allergy' },
  { id: 'peanuts',      label: 'Peanut allergy' },
  { id: 'shellfish',    label: 'Shellfish allergy' },
  { id: 'pork',         label: 'Pork-free' },
  { id: 'beef',         label: 'Beef-free' },
  { id: 'soy',          label: 'Soy-free' },
  { id: 'eggs',         label: 'Egg-free' },
  { id: 'high_sugar',   label: 'Low sugar' },
  { id: 'high_sodium',  label: 'Low sodium' },
];

var DIET_PREFS = [
  { id: 'low_carb',         label: 'Low carb' },
  { id: 'high_protein',     label: 'High protein' },
  { id: 'vegetarian',       label: 'Vegetarian' },
  { id: 'vegan',            label: 'Vegan' },
  { id: 'budget_friendly',  label: 'Budget-friendly' },
  { id: 'kid_friendly',     label: 'Kid-friendly' },
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

var HOUSEHOLD_TYPES = [
  { id: 'adults',   label: 'Adults',           sub: 'Ages 23–64',          icon: 'user' },
  { id: 'college',  label: 'College-aged',      sub: 'Ages 18–22',          icon: 'graduation-cap' },
  { id: 'teens',    label: 'Teens',             sub: 'Ages 13–17',          icon: 'running' },
  { id: 'children', label: 'Children',          sub: 'Ages 2–12',           icon: 'child' },
  { id: 'seniors',  label: 'Seniors',           sub: 'Ages 65+',            icon: 'walking' },
  { id: 'guests',   label: 'Guests / Roommates',sub: 'Others in household', icon: 'users' },
];

var TAKEOUT_OPTS = [
  { id: 'rarely',     label: 'Rarely' },
  { id: '1_2x_week',  label: '1–2x / week' },
  { id: '3_4x_week',  label: '3–4x / week' },
  { id: '5plus_week', label: '5+ times / week' },
];

var PET_OPTS = [
  { id: 'dog',  label: 'Dog' },
  { id: 'cat',  label: 'Cat' },
  { id: 'both', label: 'Both' },
  { id: 'none', label: 'None' },
];

var MEAL_FREQ_OPTS = [
  { id: 'daily',      label: 'Daily suggestions'   },
  { id: 'few_week',   label: 'A few times a week'  },
  { id: 'weekly',     label: 'Weekly plan only'     },
  { id: 'on_demand',  label: 'Only when I ask'      },
];

// ── Atom components (always at module scope) ──────────────────────────────────

function ProgressHeader({ step, onBack }) {
  return (
    <View style={s.header}>
      {/* Back — outlined circle button */}
      <TouchableOpacity
        style={s.backCircle}
        onPress={onBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="arrow-left" size={18} color={NAVY} />
      </TouchableOpacity>

      {/* Segmented progress + "X of Y" */}
      <View style={s.progressCenter}>
        <View style={s.segRow}>
          {Array.from({ length: CONTENT_STEPS }).map(function (_, i) {
            return <View key={i} style={[s.seg, i < step && s.segDone]} />;
          })}
        </View>
        <Text style={s.stepLabel}>{step} of {CONTENT_STEPS}</Text>
      </View>

      {/* Snippd wordmark */}
      <Text style={s.headerWordmark}>Snippd</Text>
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

function Pill({ label, selected, onPress, style }) {
  return (
    <TouchableOpacity
      style={[s.pill, selected && s.pillOn, style]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[s.pillText, selected && s.pillTextOn]}>{label}</Text>
      {selected && (
        <View style={s.pillCheck}>
          <Feather name="check" size={8} color={WHITE} />
        </View>
      )}
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

var SLIDER_MIN  = 75;
var SLIDER_MAX  = 500;
var SLIDER_STEP = 25;

function getBudgetFact(size) {
  if (size >= 5) return 'Feeding a large house averages $350+ every week. We’ll hunt down steep bulk-buy grocery deals to keep your family completely covered.';
  if (size >= 3) return 'A mid-size family typically averages $230–$330 a week. Keeping things optimized is key—we’ll prioritize family-pack bundle discounts first.';
  if (size === 2) return 'Most couples average between $130–$180 a week. We’ll focus heavily on matching bulk deals and cross-recipe savings at your favorite stores to hit your goal.';
  return 'For a single adult, average weekly grocery spending sits around $60–$95. Your target is locked in! Let’s track down store coupons to stretch that budget further.';
}

function BudgetSlider({ value, onChange, onRelease }) {
  var trackViewRef = useRef(null);
  var trackW       = useRef(0);
  var trackLeft    = useRef(0);
  var onChangeRef  = useRef(onChange);
  var onReleaseRef = useRef(onRelease);
  onChangeRef.current  = onChange;
  onReleaseRef.current = onRelease;

  var panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: function () { return true; },
      onMoveShouldSetPanResponder:  function () { return true; },
      onPanResponderGrant: function (e) {
        if (!trackW.current) return;
        var x   = e.nativeEvent.pageX - trackLeft.current;
        var raw = SLIDER_MIN + (x / trackW.current) * (SLIDER_MAX - SLIDER_MIN);
        var snapped = Math.round(raw / SLIDER_STEP) * SLIDER_STEP;
        onChangeRef.current(Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, snapped)));
      },
      onPanResponderMove: function (e) {
        if (!trackW.current) return;
        var x   = e.nativeEvent.pageX - trackLeft.current;
        var raw = SLIDER_MIN + (x / trackW.current) * (SLIDER_MAX - SLIDER_MIN);
        var snapped = Math.round(raw / SLIDER_STEP) * SLIDER_STEP;
        onChangeRef.current(Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, snapped)));
      },
      onPanResponderRelease: function () {
        if (onReleaseRef.current) onReleaseRef.current();
      },
    })
  ).current;

  var pct = Math.max(0, Math.min(1, (value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)));

  return (
    <View
      ref={trackViewRef}
      style={s.sliderTrack}
      onLayout={function () {
        if (trackViewRef.current) {
          trackViewRef.current.measure(function (fx, fy, w, h, px) {
            trackW.current    = w;
            trackLeft.current = px;
          });
        }
      }}
      {...panResponder.panHandlers}
    >
      <View style={[s.sliderFilled, { width: (pct * 100) + '%' }]} />
      <View style={s.sliderEmpty} />
      <View style={[s.sliderThumb, { left: (pct * 100) + '%' }]} />
    </View>
  );
}

function HouseholdCard({ label, sub, icon, count, onDecrement, onIncrement }) {
  var active = count > 0;
  return (
    <View style={[s.hCard, active && s.hCardOn]}>
      <View style={s.hCardIconWrap}>
        <FontAwesome5 name={icon} size={17} color={GREEN} solid />
      </View>
      <Text style={s.hCardLabel}>{label}</Text>
      <Text style={s.hCardSub}>{sub}</Text>
      <View style={s.hStepper}>
        <TouchableOpacity style={s.hStepBtn} onPress={onDecrement} activeOpacity={0.7}>
          <Text style={s.hStepBtnTxt}>−</Text>
        </TouchableOpacity>
        <Text style={[s.hStepCount, active && s.hStepCountOn]}>{count}</Text>
        <TouchableOpacity style={s.hStepBtn} onPress={onIncrement} activeOpacity={0.7}>
          <Text style={s.hStepBtnTxt}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MissionCard({ label, sub, icon, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.mCard, selected && s.mCardOn]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      {/* Top-right circle checkbox */}
      <View style={s.mCheckWrap}>
        <View style={[s.mCheck, selected && s.mCheckOn]}>
          {selected && <Feather name="check" size={10} color={WHITE} />}
        </View>
      </View>
      {/* Icon */}
      <View style={s.mIconWrap}>
        <Feather name={icon} size={24} color={selected ? GREEN : NAVY} />
      </View>
      {/* Title */}
      <Text style={[s.mLabel, selected && s.mLabelOn]}>{label}</Text>
      {/* Description */}
      <Text style={[s.mSub, selected && s.mSubOn]}>{sub}</Text>
    </TouchableOpacity>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingScreen({ navigation }) {
  var [step, setStep]          = useState(0);
  var [saving, setSaving]      = useState(false);
  var [budgetWarn, setBWarn]   = useState('');
  var [showFact, setShowFact]  = useState(false);

  var [data, setData] = useState({
    missions:            [],
    weeklyBudget:        '',
    weekly_budget_cents: 0,
    householdCounts:     { adults: 0, college: 0, teens: 0, children: 0, seniors: 0, guests: 0 },
    pets:                [],
    cookingStyle:        [],
    foodsAvoided:        [],
    dietPreferences:     [],
    preferred_stores:    [],
    dealPreferences:     [],
    grocery_pct:         70,
    brand_swap:          'sometimes',
    stash_style:         'smart',
    takeoutFrequency:    '',
    mealIdeaFrequency:   '',
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

  function adjustCount(key, delta) {
    setData(function (p) {
      var counts = Object.assign({}, p.householdCounts);
      counts[key] = Math.max(0, (counts[key] || 0) + delta);
      return Object.assign({}, p, { householdCounts: counts });
    });
  }

  function togglePet(id) {
    setData(function (p) {
      if (id === 'none') return Object.assign({}, p, { pets: ['none'] });
      var arr = p.pets.filter(function (v) { return v !== 'none'; });
      return Object.assign({}, p, {
        pets: arr.includes(id) ? arr.filter(function (v) { return v !== id; }) : arr.concat([id]),
      });
    });
  }

  function next() { setStep(function (n) { return Math.min(n + 1, TOTAL_STEPS - 1); }); }
  function back() { setStep(function (n) { return Math.max(n - 1, 0); }); }

  function buildPersonaParams(d, extra) {
    var adults   = (d.householdCounts && d.householdCounts.adults) || 2;
    var children = (d.householdCounts && d.householdCounts.children) || 0;
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
          household_size:       Object.values(data.householdCounts).reduce(function (a, b) { return a + b; }, 0) || 2,
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
          takeout_frequency:    data.takeoutFrequency,
          meal_idea_frequency:  data.mealIdeaFrequency,
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
      <LinearGradient
        colors={['#050F08', '#071910', '#0A2E18', '#0D3E1F', '#0A2E18']}
        locations={[0, 0.22, 0.52, 0.76, 1]}
        style={s.darkRoot}
      >
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <StatusBar barStyle="light-content" />
          <ScrollView
            contentContainerStyle={s.heroScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Snippd Green Logo */}
            <View style={s.heroLogoBlock}>
              <Image
                source={require('../assets/Snippd-logo-green-large.png')}
                style={s.heroLogoImg}
                resizeMode="contain"
              />
            </View>

            {/* Headlines — forced two-line stacked headline */}
            <Text style={s.heroTitle}>{'Welcome to\nSnippd'}</Text>
            <Text style={s.heroSub}>
              Smarter grocery planning,{'\n'}less waste, more time for you.
            </Text>

            {/* Hero grocery bag — full-width wrapper guarantees true horizontal center */}
            <View style={s.heroBagWrap}>
              <Image
                source={require('../assets/grocery-bag-tall-hero.png')}
                style={s.heroBagImg}
                resizeMode="contain"
              />
            </View>

            {/* CTAs */}
            <View style={s.heroBtns}>
              <TouchableOpacity style={s.heroMainBtn} onPress={next} activeOpacity={0.85}>
                <Text style={s.heroMainBtnText}>Get Started</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.heroDemoBtn} onPress={tryDemoMode} activeOpacity={0.8}>
                <Feather name="play-circle" size={16} color={WHITE} style={{ marginRight: 8 }} />
                <Text style={s.heroDemoBtnText}>Try Demo Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={function () { navigation.navigate('Auth', { openForm: 'signin' }); }} activeOpacity={0.7} style={s.heroSignInLink}>
                <Text style={s.heroSignInTxt}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Steps 1-7 render functions ─────────────────────────────────────────────

  function renderStep1() {
    return (
      <ScrollView contentContainerStyle={s.step1Scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.step1Headline}>What matters most{'\n'}to you?</Text>
        <Text style={s.step1Sub}>Choose everything that applies.</Text>
        <View style={s.mList}>
          {MISSIONS.map(function (m) {
            return (
              <MissionCard
                key={m.id}
                label={m.label}
                sub={m.sub}
                icon={m.icon}
                selected={data.missions.includes(m.id)}
                onPress={function () { toggleArr('missions', m.id); }}
              />
            );
          })}
        </View>
        <TouchableOpacity style={s.mContinueBtn} onPress={next} activeOpacity={0.88}>
          <Text style={s.mContinueTxt}>Continue</Text>
          <Feather name="arrow-right" size={18} color={WHITE} style={s.mContinueArrow} />
        </TouchableOpacity>
      </ScrollView>
    );
  }

  function renderStep2() {
    var sliderVal = parseInt(data.weeklyBudget, 10) || SLIDER_MIN;

    var householdSize = Object.values(data.householdCounts).reduce(function (a, b) { return a + b; }, 0);

    function handleSlider(v) {
      upd('weeklyBudget', String(v));
      upd('weekly_budget_cents', v * 100);
      setBWarn('');
    }

    function handleSliderRelease() {
      setShowFact(true);
    }

    function handleText(text) {
      var cleaned = text.replace(/[^0-9]/g, '');
      upd('weeklyBudget', cleaned);
      upd('weekly_budget_cents', Math.round((parseFloat(cleaned) || 0) * 100));
      var val = parseInt(cleaned, 10);
      if (!cleaned)         { setBWarn(''); return; }
      if (val < 25)         { setBWarn('Plans work best with at least $25/week.'); return; }
      if (val > 800)        { setBWarn('Double-check your weekly amount.'); return; }
      setBWarn('');
    }

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.b2Scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Headline */}
          <Text style={s.b2Headline}>What is your weekly{'\n'}grocery budget?</Text>
          <Text style={s.b2Sub}>Set a weekly target so Snippd can help you plan smarter, save more, and stay on track.</Text>

          {/* Budget card */}
          <View style={s.b2Card}>
            {/* Plant icon */}
            <View style={s.b2IconWrap}>
              <Feather name="shopping-bag" size={26} color={GREEN} />
            </View>

            {/* Big amount display */}
            <View style={s.b2AmountRow}>
              <Text style={s.b2DollarSym}>$</Text>
              <Text style={s.b2Amount}>{sliderVal >= SLIDER_MAX ? '500+' : sliderVal}</Text>
              <Text style={s.b2PerWeek}> / week</Text>
            </View>

            {/* Slider */}
            <View style={s.b2SliderWrap}>
              <BudgetSlider value={sliderVal} onChange={handleSlider} onRelease={handleSliderRelease} />
              <View style={s.b2SliderLabels}>
                <Text style={s.b2SliderLabel}>${SLIDER_MIN}</Text>
                <Text style={s.b2SliderLabel}>${SLIDER_MAX}+</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={s.b2Divider} />

            {/* Manual input */}
            <Text style={s.b2ManualLabel}>Enter amount manually</Text>
            <View style={s.b2InputRow}>
              <Text style={s.b2InputPrefix}>$</Text>
              <TextInput
                style={s.b2Input}
                keyboardType="number-pad"
                value={data.weeklyBudget}
                onChangeText={handleText}
                onBlur={function () { if (data.weeklyBudget) setShowFact(true); }}
                placeholder="225"
                placeholderTextColor={BORDER}
                maxLength={4}
                selectionColor={GREEN}
              />
            </View>
            {!!budgetWarn && <Text style={s.budgetWarn}>{budgetWarn}</Text>}
            <Text style={s.b2Hint}>You can drag the slider or type your amount.</Text>
          </View>

          {/* Snippd Fact card — appears after slider release or input blur */}
          {showFact && (
            <View style={s.b2FactCard}>
              <Text style={s.b2FactBulb}>💡</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.b2FactLabel}>Snippd Fact</Text>
                <Text style={s.b2FactTxt}>{getBudgetFact(householdSize)}</Text>
              </View>
            </View>
          )}

          {/* Continue */}
          <TouchableOpacity style={s.b2ContinueBtn} onPress={next} activeOpacity={0.88}>
            <Text style={s.b2ContinueTxt}>Continue</Text>
            <Feather name="arrow-right" size={18} color={WHITE} style={{ position: 'absolute', right: 24 }} />
          </TouchableOpacity>

          {/* I'm not sure yet */}
          <TouchableOpacity style={s.b2SkipWrap} onPress={next} activeOpacity={0.7}>
            <Text style={s.b2SkipTxt}>I'm not sure yet</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderStep3() {
    return (
      <ScrollView contentContainerStyle={s.h3Scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.h3Headline}>Tell us about{'\n'}your household</Text>
        <Text style={s.h3Sub}>We'll use this to personalize meal sizes, deal suggestions, and your weekly plan.</Text>

        {/* 2-col stepper grid */}
        <View style={s.hGrid}>
          {HOUSEHOLD_TYPES.map(function (ht) {
            var count = data.householdCounts[ht.id] || 0;
            return (
              <HouseholdCard
                key={ht.id}
                label={ht.label}
                sub={ht.sub}
                icon={ht.icon}
                count={count}
                onDecrement={function () { adjustCount(ht.id, -1); }}
                onIncrement={function () { adjustCount(ht.id, 1); }}
              />
            );
          })}
        </View>

        {/* Takeout Frequency Card */}
        <View style={s.toCard}>
          <View style={s.toCardHeader}>
            <View style={s.toCardIconWrap}>
              <FontAwesome5 name="utensils" size={13} color={GREEN} solid />
            </View>
            <Text style={s.toCardTitle}>How often do you get takeout?</Text>
          </View>
          <View style={s.toPillGrid}>
            {TAKEOUT_OPTS.map(function (opt) {
              var sel = data.takeoutFrequency === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.toPill, sel && s.toPillOn]}
                  onPress={function () { upd('takeoutFrequency', opt.id); }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.toPillTxt, sel && s.toPillTxtOn]}>{opt.label}</Text>
                  {sel && (
                    <View style={s.toPillCheck}>
                      <Feather name="check" size={8} color={WHITE} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Pet Profile Card */}
        <View style={s.toCard}>
          <View style={s.toCardHeader}>
            <View style={s.toCardIconWrap}>
              <FontAwesome5 name="paw" size={13} color={GREEN} solid />
            </View>
            <Text style={s.toCardTitle}>What kind of pets do you have?</Text>
          </View>
          <View style={s.petRow}>
            {PET_OPTS.map(function (opt) {
              var sel = data.pets.includes(opt.id);
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.toPill, sel && s.toPillOn]}
                  onPress={function () { togglePet(opt.id); }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.toPillTxt, sel && s.toPillTxtOn]}>{opt.label}</Text>
                  {sel && (
                    <View style={s.toPillCheck}>
                      <Feather name="check" size={8} color={WHITE} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Info Banner */}
        <View style={s.h3WhyCard}>
          <Feather name="info" size={18} color={GREEN} />
          <Text style={s.h3WhySub}>
            <Text style={s.h3WhyTitle}>Why we ask: </Text>
            This helps us suggest the right meal ideas, serving sizes, and savings for your household.
          </Text>
        </View>

        {/* Continue CTA */}
        <TouchableOpacity style={s.h3ContinueBtn} onPress={next} activeOpacity={0.88}>
          <Text style={s.h3ContinueTxt}>Continue</Text>
          <Feather name="arrow-right" size={18} color={WHITE} style={{ position: 'absolute', right: 24 }} />
        </TouchableOpacity>

        {/* Privacy */}
        <View style={s.h3Privacy}>
          <Feather name="lock" size={12} color={GRAY} />
          <Text style={s.h3PrivacyTxt}>Your info is private and never shared</Text>
        </View>
      </ScrollView>
    );
  }

  function renderStep4() {
    function toggleFood(id) {
      var arr = data.foodsAvoided.filter(function (v) { return v !== 'none'; });
      upd('foodsAvoided', arr.includes(id) ? arr.filter(function (v) { return v !== id; }) : arr.concat([id]));
    }
    function toggleDiet(id) {
      var arr = data.dietPreferences.filter(function (v) { return v !== 'no_diet'; });
      upd('dietPreferences', arr.includes(id) ? arr.filter(function (v) { return v !== id; }) : arr.concat([id]));
    }
    var foodsClear = data.foodsAvoided.length === 0 || data.foodsAvoided.includes('none');
    var dietClear  = data.dietPreferences.length === 0 || data.dietPreferences.includes('no_diet');

    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.f4Headline}>Food preferences{'\n'}& restrictions</Text>
        <Text style={s.f4Sub}>Choose anything that fits your household so Snippd can recommend better meals and deals.</Text>

        {/* Card 1 — Preferences */}
        <View style={s.f4Card}>
          <Text style={s.f4CardTitle}>Preferences</Text>
          <View style={s.f4Grid}>
            {DIET_PREFS.map(function (d) {
              return (
                <View key={d.id} style={s.f4GridCell}>
                  <Pill
                    label={d.label}
                    selected={data.dietPreferences.includes(d.id)}
                    onPress={function () { toggleDiet(d.id); }}
                    style={s.f4GridPill}
                  />
                </View>
              );
            })}
            <View style={s.f4GridCell}>
              <Pill
                label="No preference"
                selected={dietClear}
                onPress={function () { upd('dietPreferences', []); }}
                style={s.f4GridPill}
              />
            </View>
          </View>
        </View>

        {/* Card 2 — Allergies & restrictions */}
        <View style={s.f4Card}>
          <Text style={s.f4CardTitle}>Allergies & restrictions</Text>
          <View style={s.f4Grid}>
            {FOODS_AVOIDED.map(function (f) {
              return (
                <View key={f.id} style={s.f4GridCell}>
                  <Pill
                    label={f.label}
                    selected={data.foodsAvoided.includes(f.id)}
                    onPress={function () { toggleFood(f.id); }}
                    style={s.f4GridPill}
                  />
                </View>
              );
            })}
            <View style={s.f4GridCell}>
              <Pill
                label="None"
                selected={foodsClear}
                onPress={function () { upd('foodsAvoided', []); }}
                style={s.f4GridPill}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity style={s.f4ContinueBtn} onPress={next} activeOpacity={0.88}>
          <Text style={s.f4ContinueTxt}>Continue</Text>
          <Feather name="arrow-right" size={18} color={WHITE} style={{ position: 'absolute', right: 24 }} />
        </TouchableOpacity>
      </ScrollView>
    );
  }

  function renderStep5() {
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>What's your cooking{'\n'}and meal style?</Text>
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
        <Text style={s.headline}>Customize your{'\n'}Snippd experience</Text>
        <Text style={s.sub}>
          Choose how you want Snippd to find deals and how often you want meal ideas.
        </Text>

        {/* Deal preferences */}
        <Text style={s.fieldLabel}>How should Snippd find your savings?</Text>
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

        {/* Meal idea frequency */}
        <Text style={[s.fieldLabel, { marginTop: 24 }]}>How often do you want meal ideas?</Text>
        <View style={s.h3FreqRow}>
          {MEAL_FREQ_OPTS.map(function (opt) {
            var selected = data.mealIdeaFrequency === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[s.h3FreqPill, selected && s.h3FreqPillOn]}
                onPress={function () { upd('mealIdeaFrequency', opt.id); }}
                activeOpacity={0.8}
              >
                <Text style={[s.h3FreqTxt, selected && s.h3FreqTxtOn]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <BigBtn label="Find Out My Shopping Persona" onPress={finishOnboarding} loading={saving} />
      </ScrollView>
    );
  }

  var stepRenders = [null, renderStep1, renderStep3, renderStep2, renderStep4, renderStep5, renderStep6, renderStep7];

  return (
    <SafeAreaView style={[s.root, (step === 1 || step === 2 || step === 3) && s.rootWhite]} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={(step === 1 || step === 2 || step === 3) ? WHITE : CREAM} />
      <ProgressHeader step={step} onBack={back} />
      {stepRenders[step]()}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

var s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: CREAM },
  darkRoot: { flex: 1 },

  // ── Dark hero (step 0) content ──
  heroScroll: {
    flexGrow: 1,
    paddingTop: 32, paddingBottom: 28,
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: '100%',
  },
  heroLogoBlock: { alignItems: 'center', paddingHorizontal: 24, marginBottom: 18, alignSelf: 'stretch' },
  heroLogoImg:   { width: 290, height: 104 },
  heroTitle: {
    fontSize: 38, fontWeight: '700', color: WHITE,
    textAlign: 'center', letterSpacing: -0.5, lineHeight: 46, marginBottom: 12,
    paddingHorizontal: 24, alignSelf: 'stretch',
  },
  heroSub: {
    fontSize: 15, color: 'rgba(255,255,255,0.80)',
    textAlign: 'center', lineHeight: 23, fontWeight: '400',
    paddingHorizontal: 8, alignSelf: 'stretch',
  },
  heroBagWrap: { width: '100%', paddingHorizontal: 0, alignItems: 'center', marginTop: 'auto', marginBottom: 16 },
  heroBagImg:  { width: '74%', height: 410 },
  heroBtns: { gap: 12, paddingHorizontal: 24, alignSelf: 'stretch' },
  heroMainBtn: {
    width: '100%', backgroundColor: WHITE, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  heroMainBtnText: { fontSize: 16, fontWeight: '600', color: '#1B3A2D' },
  heroDemoBtn: {
    width: '100%', borderRadius: 12, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  heroDemoBtnText: { fontSize: 16, fontWeight: '600', color: WHITE },
  heroSignInLink:  { alignItems: 'center', paddingVertical: 8 },
  heroSignInTxt:   { fontSize: 15, color: WHITE, fontWeight: '500', textDecorationLine: 'underline' },

  // ── Root variants ──
  rootWhite: { backgroundColor: WHITE },

  // ── Progress header ──
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, gap: 12,
  },
  backCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: WHITE, borderWidth: 1.5, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  progressCenter: { flex: 1, alignItems: 'center' },
  segRow:         { flexDirection: 'row', gap: 4, width: '100%' },
  seg:            { flex: 1, height: 4, borderRadius: 2, backgroundColor: BORDER },
  segDone:        { backgroundColor: GREEN },
  stepLabel:      { fontSize: 11, color: GRAY, marginTop: 5, fontWeight: '500' },
  headerWordmark: { fontSize: 18, fontWeight: '800', color: GREEN, letterSpacing: 0.3 },

  // ── Step 2: budget ──
  b2Scroll:    { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 0 },
  b2Headline:  { fontSize: 44, fontWeight: '800', color: NAVY, letterSpacing: -0.5, lineHeight: 48, marginBottom: 10, textAlign: 'center' },
  b2Sub:       { fontSize: 14, color: GRAY, lineHeight: 21, textAlign: 'center', marginBottom: 24, paddingHorizontal: 8 },
  b2Card: {
    backgroundColor: WHITE, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER,
    padding: 24, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    alignItems: 'center',
  },
  b2IconWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  b2AmountRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 24 },
  b2DollarSym: { fontSize: 32, fontWeight: '700', color: GREEN, lineHeight: 52 },
  b2Amount:    { fontSize: 64, fontWeight: '800', color: GREEN, letterSpacing: -2, lineHeight: 70 },
  b2PerWeek:   { fontSize: 18, color: GRAY, fontWeight: '400', marginBottom: 8 },
  b2SliderWrap:   { width: '100%', marginBottom: 12 },
  b2SliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  b2SliderLabel:  { fontSize: 12, color: GRAY },
  b2Divider: { width: '100%', height: 1, backgroundColor: BORDER, marginVertical: 20 },
  b2ManualLabel:  { fontSize: 14, fontWeight: '700', color: NAVY, alignSelf: 'flex-start', marginBottom: 10 },
  b2InputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    width: '100%', backgroundColor: WHITE, marginBottom: 8,
  },
  b2InputPrefix: { fontSize: 18, color: NAVY, fontWeight: '500', marginRight: 8 },
  b2Input: {
    flex: 1, fontSize: 18, color: NAVY, fontWeight: '600',
    backgroundColor: WHITE, padding: 0,
    ...Platform.select({ web: { outline: 'none' } }),
  },
  b2Hint:    { fontSize: 12, color: GRAY, alignSelf: 'flex-start' },
  b2FactCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FEFCE8', borderRadius: 14,
    borderWidth: 1, borderColor: '#FDE68A',
    padding: 14, marginBottom: 20,
  },
  b2FactBulb:  { fontSize: 20, lineHeight: 24 },
  b2FactLabel: { fontSize: 12, fontWeight: '700', color: '#92400E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  b2FactTxt:   { fontSize: 13, color: '#78350F', lineHeight: 19 },
  b2ContinueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: GREEN, borderRadius: 30,
    paddingVertical: 18, marginBottom: 16, position: 'relative',
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  b2ContinueTxt: { fontSize: 17, fontWeight: '700', color: WHITE },
  b2SkipWrap:    { alignItems: 'center', paddingVertical: 4 },
  b2SkipTxt:     { fontSize: 15, color: GREEN, fontWeight: '600' },

  // ── Budget slider track ──
  sliderTrack: {
    width: '100%', height: 28,
    justifyContent: 'center', flexDirection: 'row',
    alignItems: 'center', position: 'relative',
  },
  sliderFilled: { height: 6, backgroundColor: GREEN, borderRadius: 3, position: 'absolute', left: 0 },
  sliderEmpty:  { height: 6, backgroundColor: BORDER, borderRadius: 3, position: 'absolute', left: 0, right: 0, zIndex: -1 },
  sliderThumb: {
    position: 'absolute',
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: GREEN,
    marginLeft: -13,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
  },

  // ── Step 3: household ──
  h3Scroll:    { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 0 },
  h3Headline:  { fontSize: 44, fontWeight: '800', color: NAVY, letterSpacing: -0.5, lineHeight: 48, marginBottom: 8, textAlign: 'center' },
  h3Sub:       { fontSize: 14, color: GRAY, lineHeight: 21, textAlign: 'center', marginBottom: 24, paddingHorizontal: 8 },
  hGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  hCard: {
    width: '47.5%', backgroundColor: WHITE,
    borderRadius: 16, borderWidth: 1.5, borderColor: BORDER,
    padding: 14, minHeight: 155,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  hCardOn:      { borderColor: GREEN },
  hCardIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8, alignSelf: 'flex-start',
  },
  hCardLabel:   { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 2 },
  hCardSub:     { fontSize: 11, color: GRAY, lineHeight: 15, flex: 1 },
  hStepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, backgroundColor: '#F3F4F6', borderRadius: 10, padding: 4,
  },
  hStepBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: WHITE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  hStepBtnTxt:   { fontSize: 18, fontWeight: '600', color: NAVY, lineHeight: 22 },
  hStepCount:    { fontSize: 16, fontWeight: '700', color: '#9CA3AF', minWidth: 28, textAlign: 'center' },
  hStepCountOn:  { color: GREEN },
  toCard: {
    backgroundColor: WHITE, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  toCardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  toCardIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
  },
  toCardTitle:   { fontSize: 15, fontWeight: '700', color: NAVY, flex: 1 },
  toPillGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  petRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    flex: 1, paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 24, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: WHITE, minWidth: '44%',
  },
  toPillOn:      { borderColor: GREEN, backgroundColor: '#F0FBF5' },
  toPillTxt:     { fontSize: 13, fontWeight: '500', color: NAVY },
  toPillTxtOn:   { color: GREEN, fontWeight: '600' },
  toPillCheck: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  h3WhyCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: MINT, borderRadius: 14, padding: 14, marginBottom: 20,
  },
  h3WhyTitle: { fontSize: 13, fontWeight: '700', color: NAVY },
  h3WhySub:   { fontSize: 13, color: GRAY, lineHeight: 19, flex: 1 },
  h3ContinueBtn: {
    backgroundColor: GREEN, borderRadius: 30,
    paddingVertical: 18, alignItems: 'center', marginBottom: 14,
    flexDirection: 'row', justifyContent: 'center', position: 'relative',
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  h3ContinueTxt: { fontSize: 17, fontWeight: '700', color: WHITE },
  h3Privacy:     { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  h3PrivacyTxt:  { fontSize: 11, color: GRAY },
  h3SectionLabel: { fontSize: 14, fontWeight: '700', color: NAVY, marginTop: 28, marginBottom: 12 },
  h3FreqRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  h3FreqPill: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE },
  h3FreqPillOn: { borderColor: GREEN, backgroundColor: '#F0FBF5' },
  h3FreqTxt:  { fontSize: 13, fontWeight: '500', color: NAVY },
  h3FreqTxtOn: { color: GREEN, fontWeight: '700' },

  // ── Step 1 specific layout (white bg, card rows) ──
  step1Scroll:    { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 16 },
  step1Headline:  { fontSize: 44, fontWeight: '800', color: NAVY, letterSpacing: -0.5, lineHeight: 48, marginBottom: 10, textAlign: 'center' },
  step1Sub:       { fontSize: 13, color: '#9CA3AF', lineHeight: 20, fontWeight: '400', marginBottom: 28, textAlign: 'center' },
  mList:          { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  mCard: {
    width: '47.5%', backgroundColor: WHITE,
    borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB',
    padding: 14, minHeight: 130, position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  mCardOn:      { borderColor: GREEN },
  mCheckWrap:   { position: 'absolute', top: 10, right: 10 },
  mCheck: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: WHITE,
  },
  mCheckOn:     { backgroundColor: GREEN, borderColor: GREEN },
  mIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  mLabel:       { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 4 },
  mLabelOn:     { color: GREEN },
  mSub:         { fontSize: 11, color: GRAY, lineHeight: 15 },
  mSubOn:       { color: GREEN },
  mContinueBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  mContinueTxt:   { fontSize: 16, fontWeight: '600', color: WHITE },
  mContinueArrow: { position: 'absolute', right: 20 },

  // ── Content layout ──
  scroll:     { paddingHorizontal: 24, paddingBottom: 56, paddingTop: 4 },
  headline:   { fontSize: 44, fontWeight: '800', color: NAVY, letterSpacing: -0.5, lineHeight: 48, marginBottom: 10, textAlign: 'center' },
  sub:        { fontSize: 16, color: GRAY, lineHeight: 24, fontWeight: '300', marginBottom: 28 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 12 },
  hint:       { fontSize: 13, color: GRAY, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 18 },
  disclaimer:     { fontSize: 13, color: CORAL, lineHeight: 19, marginBottom: 24, marginTop: 8 },
  f4InfoBanner:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: MINT, borderRadius: 14, borderWidth: 1, borderColor: '#A7F3D0', padding: 14, marginBottom: 20, marginTop: 8 },
  f4InfoIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#C8E6C9', alignItems: 'center', justifyContent: 'center' },
  f4InfoTxt:      { fontSize: 12, color: GRAY, lineHeight: 18, flex: 1 },

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
  pill:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: WHITE },
  pillOn:      { borderColor: GREEN, backgroundColor: '#F0FBF5' },
  pillText:    { fontSize: 13, fontWeight: '400', color: '#374151' },
  pillTextOn:  { color: GREEN, fontWeight: '600' },
  pillCheck:   { width: 18, height: 18, borderRadius: 9, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },

  // ── Food preferences step (step 4) ──
  f4Headline:    { fontSize: 40, fontWeight: '800', color: NAVY, letterSpacing: -0.5, lineHeight: 44, marginBottom: 10, textAlign: 'left' },
  f4Sub:         { fontSize: 15, color: GRAY, lineHeight: 23, fontWeight: '400', marginBottom: 24 },
  f4Card:        { backgroundColor: WHITE, borderRadius: 18, padding: 18, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  f4CardTitle:   { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 14 },
  f4Grid:        { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  f4GridCell:    { width: '50%', padding: 4 },
  f4GridPill:    { flex: 1 },
  f4ContinueBtn: { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 8, marginBottom: 24, position: 'relative' },
  f4ContinueTxt: { fontSize: 17, fontWeight: '700', color: WHITE },

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
