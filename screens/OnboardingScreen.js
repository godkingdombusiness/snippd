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
  StatusBar, PanResponder, Image, Modal, LayoutAnimation, UIManager,
} from 'react-native';
import PropTypes from 'prop-types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const GREEN      = '#0C9E54';
const DARK_GREEN = '#0A5C2B';
const NAVY       = '#172250';
const CREAM      = '#FAF8F1';
const WHITE      = '#FFFFFF';
const GRAY       = '#6B7280';
const BORDER     = '#E5E7EB';
const MINT       = '#E8F5E9';
const CORAL      = '#fb5b5b';
const AMBER      = '#F59E0B';

const TOTAL_STEPS   = 8;  // 0–7
const CONTENT_STEPS = 7;  // steps 1–7 show progress

// ── Demo profile (no Supabase writes) ────────────────────────────────────────

const DEMO_PROFILE = {
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

const MISSIONS = [
  { id: 'pure_savings',        label: 'Save Money',     sub: 'Find deals, coupons, and stack savings.',          icon: 'dollar-sign' },
  { id: 'meal_planning',       label: 'Plan My Meals',  sub: 'Shop smarter with weekly meal planning.',           icon: 'calendar-alt' },
  { id: 'athletic_fuel',       label: 'Eat Healthier',  sub: 'High-protein & nutrition-focused choices.',         icon: 'heart' },
  { id: 'clinical_guardrails', label: 'Manage Health',  sub: 'Dietary needs, allergens & health goals.',          icon: 'shield-alt' },
  { id: 'family_optimization', label: 'Feed My Family', sub: 'Stretch your budget for everyone at home.',         icon: 'users' },
  { id: 'convenience',         label: 'Keep It Simple', sub: 'Quick picks, minimal effort, less stress.',         icon: 'bolt' },
];

const BUDGET_PRESETS = ['75', '100', '150', '200', '250', '300', '400'];

const ADULT_OPTIONS   = [1, 2, 3, 4];
const CHILD_OPTIONS   = [0, 1, 2, 3, 4];

const FOODS_AVOIDED = [
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

const DIET_PREFS = [
  { id: 'low_carb',         label: 'Low carb' },
  { id: 'high_protein',     label: 'High protein' },
  { id: 'vegetarian',       label: 'Vegetarian' },
  { id: 'vegan',            label: 'Vegan' },
  { id: 'budget_friendly',  label: 'Budget-friendly' },
  { id: 'kid_friendly',     label: 'Kid-friendly' },
];

const COOKING_STYLES = [
  { id: 'from_scratch', label: 'Cook from scratch',    desc: 'I enjoy cooking with raw, fresh ingredients.',          icon: 'utensils' },
  { id: 'meal_prep',    label: 'Meal prep weekly',     desc: 'Batch cooking meals for the week.',                    icon: 'box-open' },
  { id: 'quick_meals',  label: 'Quick 30-min meals',   desc: 'Fast, easy recipes with minimal steps.',               icon: 'clock' },
  { id: 'frozen',       label: 'Frozen & convenience', desc: 'Pre-made, easy-assembly options.',                     icon: 'snowflake' },
  { id: 'takeout',      label: 'Mostly takeout',       desc: 'Relying heavily on delivery or eating out.',           icon: 'shopping-bag' },
  { id: 'variety',      label: 'Mix of everything',    desc: 'A flexible routine depending on the day.',             icon: 'random' },
];

const DINNER_FREQ_OPTS = [
  { id: '1_2_days',  label: '1–2 days' },
  { id: '3_4_days',  label: '3–4 days' },
  { id: '5_6_days',  label: '5–6 days' },
  { id: 'every_day', label: 'Every day' },
];

const MEAL_PRIORITIES = [
  { id: 'family_friendly', label: 'Family-friendly' },
  { id: 'budget_friendly',  label: 'Budget-friendly' },
  { id: 'low_waste',        label: 'Low food waste' },
];

const STORES = [
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

const DEAL_PREFS = [
  { id: 'weekly_ads',       label: 'Weekly Ads',       icon: 'file-alt' },
  { id: 'digital_coupons',  label: 'Digital Coupons',  icon: 'tag' },
  { id: 'bogos',            label: 'BOGOs',             icon: 'gift' },
  { id: 'loyalty_offers',   label: 'Loyalty Offers',   icon: 'star' },
  { id: 'health_savings',   label: 'Healthy Savings',  icon: 'heart' },
  { id: 'lowest_total',     label: 'Lowest Total',     icon: 'dollar-sign' },
];

const HOUSEHOLD_TYPES = [
  { id: 'adults',   label: 'Adults',           sub: 'Ages 23–64',          icon: 'user' },
  { id: 'college',  label: 'College-aged',      sub: 'Ages 18–22',          icon: 'graduation-cap' },
  { id: 'teens',    label: 'Teens',             sub: 'Ages 13–17',          icon: 'running' },
  { id: 'children', label: 'Children',          sub: 'Ages 2–12',           icon: 'child' },
  { id: 'seniors',  label: 'Seniors',           sub: 'Ages 65+',            icon: 'walking' },
  { id: 'guests',   label: 'Guests / Roommates',sub: 'Others in household', icon: 'users' },
];

const TAKEOUT_OPTS = [
  { id: 'rarely',     label: 'Rarely' },
  { id: '1_2x_week',  label: '1–2x / week' },
  { id: '3_4x_week',  label: '3–4x / week' },
  { id: '5plus_week', label: '5+ times / week' },
];

const PET_OPTS = [
  { id: 'dog',  label: 'Dog' },
  { id: 'cat',  label: 'Cat' },
  { id: 'both', label: 'Both' },
  { id: 'none', label: 'None' },
];

const MEAL_FREQ_OPTS = [
  { id: 'daily',      label: 'Daily suggestions'   },
  { id: 'few_week',   label: 'A few times a week'  },
  { id: 'weekly',     label: 'Weekly plan only'     },
  { id: 'on_demand',  label: 'Only when I ask'      },
];

// ── Atom components (always at module scope) ──────────────────────────────────

function ProgressHeader({ step = 1, onBack = null }) {
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
          {Array.from({ length: CONTENT_STEPS }, function (_, i) { return 'seg-' + i; }).map(function (key, i) {
            return <View key={key} style={[s.seg, i < step && s.segDone]} />;
          })}
        </View>
        <Text style={s.stepLabel}>{step} of {CONTENT_STEPS}</Text>
      </View>

      {/* Snippd wordmark */}
      <Text style={s.headerWordmark}>Snippd</Text>
    </View>
  );
}
ProgressHeader.propTypes = { step: PropTypes.number, onBack: PropTypes.func };

function BigBtn({ label = '', onPress = null, loading = false, variant = 'fill' }) {
  const btnStyle = variant === 'outline'
    ? [s.bigBtn, s.bigBtnOutline]
    : [s.bigBtn, s.bigBtnFill];
  const txtStyle = variant === 'outline' ? [s.bigBtnText, { color: WHITE }] : s.bigBtnText;
  return (
    <TouchableOpacity style={btnStyle} onPress={onPress} activeOpacity={0.85} disabled={!!loading}>
      {loading
        ? <ActivityIndicator color={variant === 'outline' ? WHITE : WHITE} size="small" />
        : <Text style={txtStyle}>{label}</Text>
      }
    </TouchableOpacity>
  );
}
BigBtn.propTypes = { label: PropTypes.string, onPress: PropTypes.func, loading: PropTypes.bool, variant: PropTypes.string };

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
          <FontAwesome5 name={icon} size={18} color={selected ? WHITE : GREEN} solid />
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

function StoreCard({ label, selected, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[s.storeCard, selected && s.storeCardOn, disabled && s.storeCardDisabled]}
      onPress={onPress}
      activeOpacity={disabled ? 1 : 0.72}
      disabled={disabled}
    >
      {selected && (
        <View style={s.storeCheck}>
          <Feather name="check" size={10} color={WHITE} />
        </View>
      )}
      <Text style={[s.storeLabel, selected && s.storeLabelOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CookTile({ label, desc, icon, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.cTile, selected && s.cTileOn]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {selected && (
        <View style={s.cTileCheck}>
          <Feather name="check" size={10} color={WHITE} />
        </View>
      )}
      <View style={[s.cTileIconWrap, selected && s.cTileIconWrapOn]}>
        <FontAwesome5 name={icon} size={20} color={selected ? WHITE : GREEN} solid />
      </View>
      <Text style={[s.cTileTitle, selected && s.cTileTitleOn]}>{label}</Text>
      <Text style={[s.cTileDesc, selected && s.cTileDescOn]}>{desc}</Text>
    </TouchableOpacity>
  );
}

const SLIDER_MIN  = 75;
const SLIDER_MAX  = 500;
const SLIDER_STEP = 25;

function getCookingFact(householdSize, dinnerFreq, cookingStyle) {
  if (cookingStyle.includes('frozen') || cookingStyle.includes('takeout')) {
    return "You don't have to cook completely from scratch to stack massive savings. Convenience and frozen aisles actually feature the highest volume of grocery coupon stacks! Snippd has pre-filtered the top quick-prep deals at your local stores to hit your exact budget target.";
  }
  const highFreq = dinnerFreq === '5_6_days' || dinnerFreq === 'every_day';
  if (householdSize >= 3 && highFreq) {
    return 'Cooking nearly every night for a larger household means you are managing a massive grocery list. By automatically grouping family-pack ingredient deals and matching bulk store coupons, Snippd is optimizing your weekly plan to save you up to $45 and 3 hours in the kitchen this week!';
  }
  return 'Smaller households face a hidden enemy: food waste from leftover ingredients. By prioritizing cross-utilization recipes, using the exact same fresh ingredients across different quick meals, Snippd ensures your trash stays empty and your wallet stays full!';
}

function getBudgetFact(size) {
  if (size >= 5) return ‘Feeding a large house averages $350+ every week. We’ll hunt down steep bulk-buy grocery deals to keep your family completely covered.’;
  if (size >= 3) return ‘A mid-size family typically averages $230–$330 a week. Keeping things optimized is key—we’ll prioritize family-pack bundle discounts first.’;
  if (size === 2) return ‘Most couples average between $130–$180 a week. We’ll focus heavily on matching bulk deals and cross-recipe savings at your favorite stores to hit your goal.’;
  return ‘For a single adult, average weekly grocery spending sits around $60–$95. Your target is locked in! Let’s track down store coupons to stretch that budget further.’;
}

function getDefaultWeeklyBudget(counts) {
  const total = Object.values(counts).reduce(function (a, b) { return a + b; }, 0);
  if (total >= 5) return 325;
  if (total === 4) return 250;
  if (total === 3) return 200;
  if (total === 2) return 150;
  return 75;
}

function BudgetSlider({ value, onChange, onRelease }) {
  const trackViewRef = useRef(null);
  const trackW       = useRef(0);
  const trackLeft    = useRef(0);
  const onChangeRef  = useRef(onChange);
  const onReleaseRef = useRef(onRelease);
  onChangeRef.current  = onChange;
  onReleaseRef.current = onRelease;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: function () { return true; },
      onMoveShouldSetPanResponder:  function () { return true; },
      onPanResponderGrant: function (e) {
        if (!trackW.current) return;
        const x   = e.nativeEvent.pageX - trackLeft.current;
        const raw = SLIDER_MIN + (x / trackW.current) * (SLIDER_MAX - SLIDER_MIN);
        const snapped = Math.round(raw / SLIDER_STEP) * SLIDER_STEP;
        onChangeRef.current(Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, snapped)));
      },
      onPanResponderMove: function (e) {
        if (!trackW.current) return;
        const x   = e.nativeEvent.pageX - trackLeft.current;
        const raw = SLIDER_MIN + (x / trackW.current) * (SLIDER_MAX - SLIDER_MIN);
        const snapped = Math.round(raw / SLIDER_STEP) * SLIDER_STEP;
        onChangeRef.current(Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, snapped)));
      },
      onPanResponderRelease: function () {
        if (onReleaseRef.current) onReleaseRef.current();
      },
    })
  ).current;

  const pct = Math.max(0, Math.min(1, (value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)));

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
  const active = count > 0;
  return (
    <TouchableOpacity
      style={[s.hCard, active && s.hCardOn]}
      onPress={active ? undefined : onIncrement}
      activeOpacity={active ? 1 : 0.72}
    >
      <View style={[s.hCardIconWrap, active && s.hCardIconWrapOn]}>
        <FontAwesome5 name={icon} size={17} color={active ? WHITE : GREEN} solid />
      </View>
      <Text style={[s.hCardLabel, active && s.hCardLabelOn]}>{label}</Text>
      <Text style={[s.hCardSub, active && s.hCardSubOn]}>{sub}</Text>
      {active && (
        <View style={s.hStepper}>
          <TouchableOpacity style={s.hStepBtn} onPress={onDecrement} activeOpacity={0.7}>
            <Text style={s.hStepBtnTxt}>−</Text>
          </TouchableOpacity>
          <Text style={[s.hStepCount, s.hStepCountOn]}>{count}</Text>
          <TouchableOpacity style={s.hStepBtn} onPress={onIncrement} activeOpacity={0.7}>
            <Text style={s.hStepBtnTxt}>+</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
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
      <View style={[s.mIconWrap, selected && s.mIconWrapOn]}>
        <FontAwesome5 name={icon} size={22} color={selected ? WHITE : NAVY} solid />
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
  const [step, setStep]              = useState(0);
  const [saving, setSaving]          = useState(false);
  const [budgetWarn, setBWarn]       = useState('');
  const [showFact, setShowFact]      = useState(false);
  const [showCookingModal, setShowCookingModal] = useState(false);
  const [processing, setProcessing]  = useState({ show: false, title: '', sub: '' });

  const [data, setData] = useState({
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
    dinnerFrequency:     '',
    mealPriorities:      [],
  });

  function upd(key, value) {
    setData(function (p) { return Object.assign({}, p, { [key]: value }); });
  }

  function toggleArr(key, id) {
    setData(function (p) {
      const arr = p[key];
      return Object.assign({}, p, {
        [key]: arr.includes(id)
          ? arr.filter(function (v) { return v !== id; })
          : arr.concat([id]),
      });
    });
  }

  function adjustCount(key, delta) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData(function (p) {
      const counts = Object.assign({}, p.householdCounts);
      counts[key] = Math.max(0, (counts[key] || 0) + delta);
      return Object.assign({}, p, { householdCounts: counts });
    });
  }

  function togglePet(id) {
    setData(function (p) {
      if (id === 'none') return Object.assign({}, p, { pets: ['none'] });
      const arr = p.pets.filter(function (v) { return v !== 'none'; });
      return Object.assign({}, p, {
        pets: arr.includes(id) ? arr.filter(function (v) { return v !== id; }) : arr.concat([id]),
      });
    });
  }

  function next() { setStep(function (n) { return Math.min(n + 1, TOTAL_STEPS - 1); }); }
  function back() { setStep(function (n) { return Math.max(n - 1, 0); }); }

  function runProcessing(title, sub, callback) {
    setProcessing({ show: true, title, sub });
    setTimeout(function () {
      setProcessing({ show: false, title: '', sub: '' });
      callback();
    }, 2500);
  }

  function buildPersonaParams(d, extra) {
    const adults   = (d.householdCounts && d.householdCounts.adults) || 2;
    const children = (d.householdCounts && d.householdCounts.children) || 0;
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
      const { data: authData } = await supabase.auth.getUser();
      const user = authData && authData.user;
      if (user) {
        const budget  = parseFloat(data.weeklyBudget) || 0;
        const allGoals = data.missions.concat(data.dietPreferences);
        await supabase.from('profiles').upsert({
          user_id:              user.id,
          weekly_budget:        budget,
          grocery_pct:          data.grocery_pct,
          household_size:       Object.values(data.householdCounts).reduce(function (a, b) { return a + b; }, 0) || 2,
          household:            { adults: data.householdCounts.adults || 0, children: data.householdCounts.children || 0 },
          missions:             data.missions,
          food_goals:           allGoals,
          preferred_stores:     data.preferred_stores,
          cookingStyle:         data.cookingStyle,
          foodsAvoided:         data.foodsAvoided,
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
        <TouchableOpacity
          style={s.mContinueBtn}
          onPress={function () { runProcessing('Analyzing your goals...', 'Building your personalized Snippd profile.', next); }}
          activeOpacity={0.88}
        >
          <Text style={s.mContinueTxt}>Continue</Text>
          <Feather name="arrow-right" size={18} color={WHITE} style={s.mContinueArrow} />
        </TouchableOpacity>
      </ScrollView>
    );
  }

  function renderStep2() {
    const sliderVal = parseInt(data.weeklyBudget, 10) || SLIDER_MIN;

    const householdSize = Object.values(data.householdCounts).reduce(function (a, b) { return a + b; }, 0);

    function handleSlider(v) {
      upd('weeklyBudget', String(v));
      upd('weekly_budget_cents', v * 100);
      setBWarn('');
    }

    function handleSliderRelease() {
      setShowFact(true);
    }

    function handleText(text) {
      const cleaned = text.replace(/[^0-9]/g, '');
      upd('weeklyBudget', cleaned);
      upd('weekly_budget_cents', Math.round((parseFloat(cleaned) || 0) * 100));
      const val = parseInt(cleaned, 10);
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

            {/* Household recommendation chip */}
            {!!data.weeklyBudget && (
              <View style={s.b2RecoChip}>
                <Feather name="check-circle" size={13} color={GREEN} />
                <Text style={s.b2RecoTxt}>Estimated for your household size</Text>
              </View>
            )}

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
            const count = data.householdCounts[ht.id] || 0;
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
              const sel = data.pets.includes(opt.id);
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
        <TouchableOpacity
          style={s.h3ContinueBtn}
          onPress={function () {
            if (!data.weeklyBudget) {
              const suggested = getDefaultWeeklyBudget(data.householdCounts);
              upd('weeklyBudget', String(suggested));
              upd('weekly_budget_cents', suggested * 100);
              setShowFact(true);
            }
            runProcessing('Calculating your household profile...', 'Estimating the right budget range for your family.', next);
          }}
          activeOpacity={0.88}
        >
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
      const arr = data.foodsAvoided.filter(function (v) { return v !== 'none'; });
      upd('foodsAvoided', arr.includes(id) ? arr.filter(function (v) { return v !== id; }) : arr.concat([id]));
    }
    function toggleDiet(id) {
      const arr = data.dietPreferences.filter(function (v) { return v !== 'no_diet'; });
      upd('dietPreferences', arr.includes(id) ? arr.filter(function (v) { return v !== id; }) : arr.concat([id]));
    }
    const foodsClear = data.foodsAvoided.length === 0 || data.foodsAvoided.includes('none');
    const dietClear  = data.dietPreferences.length === 0 || data.dietPreferences.includes('no_diet');

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
    const mealPrioritiesClear = data.mealPriorities.length === 0 || data.mealPriorities.includes('no_meal_pref');
    function toggleMealPriority(id) {
      const arr = data.mealPriorities.filter(function (v) { return v !== 'no_meal_pref'; });
      upd('mealPriorities', arr.includes(id) ? arr.filter(function (v) { return v !== id; }) : arr.concat([id]));
    }
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.f4Headline}>What's your cooking{'\n'}& meal style?</Text>
        <Text style={s.f4Sub}>Pick all that match your typical week. No wrong answers.</Text>

        {/* Card 1 — Cooking style + dinner frequency */}
        <View style={s.f4Card}>
          <Text style={s.f4CardTitle}>How do you usually cook?</Text>
          <View style={s.f4Grid}>
            {COOKING_STYLES.map(function (c) {
              return (
                <View key={c.id} style={s.f4GridCell}>
                  <CookTile
                    label={c.label}
                    desc={c.desc}
                    icon={c.icon}
                    selected={data.cookingStyle.includes(c.id)}
                    onPress={function () { toggleArr('cookingStyle', c.id); }}
                  />
                </View>
              );
            })}
          </View>
          <Text style={[s.f4CardTitle, { marginTop: 20 }]}>How many dinners do you cook a week?</Text>
          <View style={s.f4Grid}>
            {DINNER_FREQ_OPTS.map(function (d) {
              const sel = data.dinnerFrequency === d.id;
              return (
                <View key={d.id} style={s.f4GridCell}>
                  <Pill
                    label={d.label}
                    selected={sel}
                    onPress={function () { upd('dinnerFrequency', d.id); }}
                    style={s.f4GridPill}
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* Card 2 — Meal priorities */}
        <View style={s.f4Card}>
          <Text style={s.f4CardTitle}>Meal priorities</Text>
          <View style={s.f4Grid}>
            {MEAL_PRIORITIES.map(function (m) {
              return (
                <View key={m.id} style={s.f4GridCell}>
                  <Pill
                    label={m.label}
                    selected={data.mealPriorities.includes(m.id)}
                    onPress={function () { toggleMealPriority(m.id); }}
                    style={s.f4GridPill}
                  />
                </View>
              );
            })}
            <View style={s.f4GridCell}>
              <Pill
                label="No preference"
                selected={mealPrioritiesClear}
                onPress={function () { upd('mealPriorities', []); }}
                style={s.f4GridPill}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={s.f4ContinueBtn}
          onPress={function () { setShowCookingModal(true); }}
          activeOpacity={0.88}
        >
          <Text style={s.f4ContinueTxt}>Continue</Text>
          <Feather name="arrow-right" size={18} color={WHITE} style={{ position: 'absolute', right: 24 }} />
        </TouchableOpacity>
      </ScrollView>
    );
  }

  function renderStep6() {
    const atLimit = data.preferred_stores.length >= 3;
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>Choose your{'\n'}favorite stores</Text>
        <Text style={s.sub}>Pick up to 3 stores you shop at regularly — I'll track deals at each one.</Text>
        <View style={s.storeGrid}>
          {STORES.map(function (st) {
            const selected = data.preferred_stores.includes(st.id);
            return (
              <StoreCard
                key={st.id}
                label={st.label}
                selected={selected}
                disabled={atLimit && !selected}
                onPress={function () { toggleArr('preferred_stores', st.id); }}
              />
            );
          })}
        </View>
        <TouchableOpacity
          style={s.f4ContinueBtn}
          onPress={function () { runProcessing('Scouting deals at your stores...', 'Connecting to live savings at your favorite retailers.', next); }}
          activeOpacity={0.88}
        >
          <Text style={s.f4ContinueTxt}>Continue</Text>
          <Feather name="arrow-right" size={18} color={WHITE} style={{ position: 'absolute', right: 24 }} />
        </TouchableOpacity>
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
            const selected = data.mealIdeaFrequency === opt.id;
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

  if (processing.show) {
    return (
      <SafeAreaView style={s.processingRoot} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={s.processingCenter}>
          <ActivityIndicator size="large" color={GREEN} style={s.processingSpinner} />
          <Text style={s.processingTitle}>{processing.title}</Text>
          <Text style={s.processingSub}>{processing.sub}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stepRenders = [null, renderStep1, renderStep3, renderStep2, renderStep4, renderStep5, renderStep6, renderStep7];

  return (
    <SafeAreaView style={[s.root, (step === 1 || step === 2 || step === 3) && s.rootWhite]} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={(step === 1 || step === 2 || step === 3) ? WHITE : CREAM} />
      <ProgressHeader step={step} onBack={back} />
      {stepRenders[step]()}

      {/* Cooking step intercept — Snippd Fact modal */}
      <Modal
        visible={showCookingModal}
        transparent
        animationType="slide"
        onRequestClose={function () { setShowCookingModal(false); }}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalEmoji}>💡</Text>
            <Text style={s.modalLabel}>Snippd Fact</Text>
            <Text style={s.modalBody}>
              {getCookingFact(
                Object.values(data.householdCounts).reduce(function (a, b) { return a + b; }, 0),
                data.dinnerFrequency,
                data.cookingStyle,
              )}
            </Text>
            <TouchableOpacity
              style={s.modalBtn}
              onPress={function () { setShowCookingModal(false); next(); }}
              activeOpacity={0.88}
            >
              <Text style={s.modalBtnTxt}>Got it, let's go</Text>
              <Feather name="arrow-right" size={18} color={WHITE} style={{ position: 'absolute', right: 24 }} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
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
  hCardOn:         { borderColor: GREEN, backgroundColor: GREEN },
  hCardIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8, alignSelf: 'flex-start',
  },
  hCardIconWrapOn: { backgroundColor: 'rgba(255,255,255,0.2)' },
  hCardLabel:      { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 2 },
  hCardLabelOn:    { color: WHITE },
  hCardSub:        { fontSize: 11, color: GRAY, lineHeight: 15, flex: 1 },
  hCardSubOn:      { color: 'rgba(255,255,255,0.8)' },
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
  toPillOn:      { borderColor: GREEN, backgroundColor: GREEN },
  toPillTxt:     { fontSize: 13, fontWeight: '500', color: NAVY },
  toPillTxtOn:   { color: WHITE, fontWeight: '600' },
  toPillCheck: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginLeft: 4,
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
  h3FreqPillOn: { borderColor: GREEN, backgroundColor: GREEN },
  h3FreqTxt:  { fontSize: 13, fontWeight: '500', color: NAVY },
  h3FreqTxtOn: { color: WHITE, fontWeight: '700' },

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
  mCardOn:      { borderColor: GREEN, backgroundColor: GREEN },
  mCheckWrap:   { position: 'absolute', top: 10, right: 10 },
  mCheck: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: WHITE,
  },
  mCheckOn:     { backgroundColor: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.5)' },
  mIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  mIconWrapOn:  { backgroundColor: 'rgba(255,255,255,0.2)' },
  mLabel:       { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 4 },
  mLabelOn:     { color: WHITE },
  mSub:         { fontSize: 11, color: GRAY, lineHeight: 15 },
  mSubOn:       { color: 'rgba(255,255,255,0.8)' },
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
  pillOn:      { borderColor: GREEN, backgroundColor: GREEN },
  pillText:    { fontSize: 13, fontWeight: '400', color: '#374151' },
  pillTextOn:  { color: WHITE, fontWeight: '600' },
  pillCheck:   { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginLeft: 6 },

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

  // ── Cooking step 2-col tiles ──
  cTile:          { flex: 1, backgroundColor: WHITE, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', padding: 14, minHeight: 128, position: 'relative' },
  cTileOn:        { borderColor: GREEN, backgroundColor: GREEN },
  cTileCheck:     { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  cTileIconWrap:  { width: 46, height: 46, borderRadius: 23, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  cTileIconWrapOn:{ backgroundColor: 'rgba(255,255,255,0.2)' },
  cTileTitle:     { fontSize: 13, fontWeight: '700', color: NAVY, marginBottom: 4, lineHeight: 18 },
  cTileTitleOn:   { color: WHITE },
  cTileDesc:      { fontSize: 11, color: GRAY, lineHeight: 15 },
  cTileDescOn:    { color: 'rgba(255,255,255,0.8)' },

  // ── Snippd Fact intercept modal ──
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:     { backgroundColor: '#FAFDF9', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48, borderWidth: 1, borderColor: '#D4EDDA' },
  modalEmoji:    { fontSize: 32, marginBottom: 10 },
  modalLabel:    { fontSize: 11, fontWeight: '700', color: GREEN, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  modalBody:     { fontSize: 15, color: '#374151', lineHeight: 25, marginBottom: 28 },
  modalBtn:      { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 17, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', position: 'relative' },
  modalBtnTxt:   { fontSize: 16, fontWeight: '700', color: WHITE },

  // ── Store grid ──
  storeGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  storeCard:        { width: '47%', backgroundColor: WHITE, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, paddingVertical: 18, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 64 },
  storeCardOn:      { backgroundColor: GREEN, borderColor: GREEN },
  storeCardDisabled:{ opacity: 0.38 },
  storeLabel:       { fontSize: 13, fontWeight: '600', color: NAVY, textAlign: 'center' },
  storeLabelOn:     { color: WHITE },
  storeCheck:       { position: 'absolute', top: 7, right: 7, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },

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

  // ── Budget recommendation chip ──
  b2RecoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: MINT, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    marginBottom: 20,
  },
  b2RecoTxt: { fontSize: 12, color: GREEN, fontWeight: '600' },

  // ── Processing intermission screen ──
  processingRoot:   { flex: 1, backgroundColor: WHITE },
  processingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  processingSpinner:{ marginBottom: 28 },
  processingTitle:  { fontSize: 20, fontWeight: '700', color: NAVY, textAlign: 'center', marginBottom: 10 },
  processingSub:    { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 21 },
});
