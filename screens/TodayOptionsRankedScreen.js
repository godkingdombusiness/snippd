/**
 * TodayOptionsRankedScreen.js
 *
 * Premium ranked options screen shown after TodaySetupGateScreen is complete.
 * Replaces the visual design of TodayDecisionScreen while reusing the same
 * decisionEngineService scoring logic.
 *
 * Route params: { context: { weeklyBudgetCents, remainingBudgetCents,
 *   householdSize, peopleEatingToday, groceryStatus, timeBeforeDinner,
 *   pantryPreference, todayGoal } }
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tracker } from '../src/lib/eventTracker';

var { rankOptions, OPTION_TYPES } = require('../src/services/foodOptions/decisionEngineService');

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var MINT   = '#E8F5E9';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var CORAL  = '#fb5b5b';
var AMBER  = '#F59E0B';

// ── Cost estimation helpers ───────────────────────────────────────────────────

var COST_RANGES = {
  cook_from_pantry:   function (hs) { return { low: 0,                             high: Math.round(hs * 250) }; },
  quick_grocery_run:  function (hs) { return { low: Math.round(hs * 350),          high: Math.round(hs * 550) }; },
  grocery_pickup:     function (hs) { return { low: Math.round(hs * 450),          high: Math.round(hs * 750) }; },
  uber_eats_pickup:   function (hs) { return { low: Math.round(hs * 900),          high: Math.round(hs * 1200) }; },
  eat_out_smart:      function (hs) { return { low: Math.round(hs * 800),          high: Math.round(hs * 1400) }; },
  uber_eats_delivery: function (hs) { return { low: Math.round(hs * 1100),         high: Math.round(hs * 1600) }; },
};

var PER_PERSON_CENTS = {
  cook_from_pantry:   250,
  quick_grocery_run:  450,
  grocery_pickup:     600,
  uber_eats_pickup:   1050,
  eat_out_smart:      1100,
  uber_eats_delivery: 1350,
};

function getCostRange(optionType, householdSize) {
  var hs = householdSize || 2;
  var fn = COST_RANGES[optionType];
  return fn ? fn(hs) : { low: 0, high: 0 };
}

function formatDollars(cents) {
  return '$' + Math.round(cents / 100);
}

function formatCostRange(optionType, householdSize) {
  var range = getCostRange(optionType, householdSize);
  if (range.low === 0 && range.high === 0) return '$0';
  if (range.low === 0) return formatDollars(range.high);
  return formatDollars(range.low) + '-' + formatDollars(range.high);
}

function formatPerPerson(optionType) {
  var cents = PER_PERSON_CENTS[optionType] || 0;
  return '~' + formatDollars(cents) + ' per person';
}

// ── Time estimate labels ──────────────────────────────────────────────────────

var TIME_LABELS = {
  cook_from_pantry:   '~45 min total',
  quick_grocery_run:  '~60 min total',
  grocery_pickup:     '~50 min total',
  uber_eats_pickup:   '~30 min total',
  eat_out_smart:      '~60 min total',
  uber_eats_delivery: '~50 min total',
};

// ── CTA labels per option ─────────────────────────────────────────────────────

var CTA_LABELS = {
  cook_from_pantry:   'View pantry meals',
  quick_grocery_run:  'Build quick cart',
  grocery_pickup:     'Choose store',
  uber_eats_pickup:   'Open in Uber Eats',
  eat_out_smart:      'Find local options',
  uber_eats_delivery: 'Compare delivery options',
};

// ── Context pill helpers ──────────────────────────────────────────────────────

function buildContextPills(context) {
  var pills = [];
  var ctx = context || {};

  // Budget
  if (ctx.remainingBudgetCents > 0) {
    pills.push({ id: 'budget', label: '$' + Math.round(ctx.remainingBudgetCents / 100) + ' left', estimated: !ctx.weeklyBudgetCents });
  } else {
    pills.push({ id: 'budget', label: 'No budget set', estimated: true });
  }

  // People
  var people = ctx.peopleEatingToday || ctx.householdSize || 2;
  pills.push({ id: 'people', label: people + (people === 1 ? ' person' : ' people'), estimated: false });

  // Time
  var timeMap = {
    under_15: 'Under 15 min',
    '15_30':  '15-30 min',
    '30_45':  '30-45 min',
    over_45:  'Over 45 min',
  };
  if (ctx.timeBeforeDinner && timeMap[ctx.timeBeforeDinner]) {
    pills.push({ id: 'time', label: timeMap[ctx.timeBeforeDinner], estimated: false });
  } else {
    pills.push({ id: 'time', label: '30 min', estimated: true });
  }

  // Grocery status
  var groceryMap = {
    yes:       'Shopped',
    no:        'Not shopped',
    partially: 'Partial shop',
  };
  if (ctx.groceryStatus && groceryMap[ctx.groceryStatus]) {
    pills.push({ id: 'grocery', label: groceryMap[ctx.groceryStatus], estimated: false });
  } else {
    pills.push({ id: 'grocery', label: 'Shop status unknown', estimated: true });
  }

  return pills;
}

// ── Score pill label → bg color ───────────────────────────────────────────────

var SCORE_PILL_COLORS = {
  'Best fit':  GREEN,
  'Good fit':  '#3B82F6',
  'Possible':  AMBER,
  'Not ideal': CORAL,
};

// ── Module-scope component functions ─────────────────────────────────────────

function renderContextPill(pill) {
  var isEstimated = pill.estimated;
  return (
    <View
      key={pill.id}
      style={[styles.contextPill, isEstimated && styles.contextPillEstimated]}
    >
      <Text style={styles.contextPillText}>
        {pill.label}{isEstimated ? ' (est)' : ''}
      </Text>
    </View>
  );
}

function OptionCard(props) {
  var option      = props.option;
  var isTop       = props.isTop;
  var onPress     = props.onPress;
  var householdSize = props.householdSize || 2;

  var scoreColor  = SCORE_PILL_COLORS[option.scoreLabel] || GRAY;
  var costRange   = formatCostRange(option.optionType, householdSize);
  var perPerson   = formatPerPerson(option.optionType);
  var timeLabel   = TIME_LABELS[option.optionType] || '';
  var ctaLabel    = CTA_LABELS[option.optionType] || 'View options';

  return (
    <View style={[styles.optionCard, isTop && styles.optionCardTop]}>

      {/* Top row: score pill + label */}
      <View style={styles.optionTopRow}>
        <View style={[styles.scorePill, { backgroundColor: scoreColor + '22', borderColor: scoreColor + '55' }]}>
          <Text style={[styles.scorePillText, { color: scoreColor }]}>{option.scoreLabel}</Text>
        </View>
        <Text style={[styles.optionLabel, isTop && styles.optionLabelTop]} numberOfLines={1}>
          {option.label}
        </Text>
      </View>

      {/* Price */}
      <Text style={[styles.priceText, isTop && styles.priceTextTop]}>
        ~{costRange}
      </Text>
      <Text style={[styles.perPersonText, isTop && styles.perPersonTextTop]}>
        {perPerson}
      </Text>

      {/* Time */}
      <View style={styles.timeRow}>
        <Feather name="clock" size={13} color={isTop ? 'rgba(255,255,255,0.7)' : GRAY} />
        <Text style={[styles.timeText, isTop && styles.timeTextTop]}>{timeLabel}</Text>
      </View>

      {/* Why */}
      <Text style={[styles.whyText, isTop && styles.whyTextTop]}>
        {option.why}
      </Text>

      {/* CTA */}
      <TouchableOpacity
        style={[styles.ctaBtn, isTop ? styles.ctaBtnTop : styles.ctaBtnOther]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Text style={[styles.ctaBtnText, isTop ? styles.ctaBtnTopText : styles.ctaBtnOtherText]}>
          {ctaLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Default context used when nothing is passed ───────────────────────────────

var DEFAULT_CONTEXT = {
  weeklyBudgetCents:    20000,
  remainingBudgetCents: 12000,
  householdSize:        2,
  peopleEatingToday:    2,
  groceryStatus:        'no',
  timeBeforeDinner:     '30_45',
  pantryPreference:     'not_sure',
  todayGoal:            'spend_least',
};

// ── Translate TodaySetupGate context → decisionEngine context ─────────────────

function buildEngineContext(ctx) {
  var timeMap = {
    under_15: 12,
    '15_30':  22,
    '30_45':  37,
    over_45:  60,
  };

  var goalGoalMap = {
    spend_least:   'lower-sugar',
    high_protein:  'high-protein',
    lower_calorie: 'under-600-cal',
    kid_friendly:  'kid-friendly',
    fastest:       'lower-sugar',
    healthier:     'lower-sodium',
    comfort:       'lower-sugar',
    family_meal:   'lower-sugar',
  };

  var prefMap = {
    spend_least:   'saver',
    high_protein:  'saver',
    lower_calorie: 'saver',
    kid_friendly:  'saver',
    fastest:       'convenience',
    healthier:     'saver',
    comfort:       'explorer',
    family_meal:   'saver',
  };

  var cookingTimeMin = (ctx.timeBeforeDinner && timeMap[ctx.timeBeforeDinner]) || 30;
  var foodGoal       = ctx.todayGoal ? [goalGoalMap[ctx.todayGoal] || 'lower-sugar'] : [];
  var prefStyle      = ctx.todayGoal ? (prefMap[ctx.todayGoal] || 'saver') : 'saver';

  // Estimate pantry based on groceryStatus
  var pantryCount = 8;
  if (ctx.groceryStatus === 'yes')       pantryCount = 15;
  if (ctx.groceryStatus === 'no')        pantryCount = 4;
  if (ctx.groceryStatus === 'partially') pantryCount = 9;
  if (ctx.pantryPreference === 'use_first') pantryCount = Math.max(pantryCount, 10);

  return {
    remainingBudgetCents: ctx.remainingBudgetCents || 0,
    weeklyBudgetCents:    ctx.weeklyBudgetCents    || 20000,
    householdSize:        ctx.householdSize        || 2,
    cookingTimeMin:       cookingTimeMin,
    foodGoals:            foodGoal,
    pantryCount:          pantryCount,
    hasKids:              ctx.todayGoal === 'kid_friendly' || ctx.todayGoal === 'family_meal',
    preferenceStyle:      prefStyle,
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TodayOptionsRankedScreen(props) {
  var navigation = props.navigation;
  var route      = props.route;
  var params     = (route && route.params) || {};
  var context    = params.context || DEFAULT_CONTEXT;

  var [options, setOptions] = useState([]);
  var [loading, setLoading] = useState(true);

  var householdSize = context.householdSize || 2;

  useEffect(function () {
    var engineCtx = buildEngineContext(context);
    var allTypes  = Object.values(OPTION_TYPES);
    var ranked    = rankOptions(allTypes, engineCtx);
    setOptions(ranked);
    setLoading(false);

    tracker.track('today_options_viewed', {
      option_count: ranked.length,
      has_budget:   (context.weeklyBudgetCents || 0) > 0,
    });
  }, []);

  function handleOptionPress(option) {
    switch (option.optionType) {
      case 'cook_from_pantry':
        navigation.navigate('PantryInventory');
        break;
      case 'quick_grocery_run':
        navigation.navigate('QuickGroceryRun', { context: context });
        break;
      case 'grocery_pickup':
        navigation.navigate('StorePickupHandoff');
        break;
      case 'uber_eats_pickup':
        navigation.navigate('UberEatsPickupHandoff', { score: option.totalScore });
        break;
      case 'eat_out_smart':
        navigation.navigate('EatOutSmart', { context: context });
        break;
      case 'uber_eats_delivery':
        navigation.navigate('UberEatsDelivery', { score: option.totalScore });
        break;
      default:
        navigation.navigate('MainApp');
    }
  }

  function handleBack() {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  var contextPills = buildContextPills(context);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GREEN} size="large" />
          <Text style={styles.loadingText}>Ranking your options...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Context pill row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.contextRow}
          contentContainerStyle={styles.contextRowContent}
        >
          {contextPills.map(function (pill) { return renderContextPill(pill); })}
        </ScrollView>

        {/* Headline */}
        <Text style={styles.headline}>What's your best move today?</Text>
        <Text style={styles.sub}>
          Ranked by your budget, time, pantry, stores, and food goals.
        </Text>

        {/* Options list */}
        <View style={styles.optionList}>
          {options.map(function (option, idx) {
            return (
              <OptionCard
                key={option.optionType}
                option={option}
                isTop={idx === 0}
                householdSize={householdSize}
                onPress={function () { handleOptionPress(option); }}
              />
            );
          })}
        </View>

        {/* Bottom Stash message */}
        <View style={styles.stash}>
          <View style={styles.stashBubble}>
            <Text style={styles.stashBubbleText}>S</Text>
          </View>
          <Text style={styles.stashText}>
            Snippd compares cooking, pickup, delivery, and grocery options against your real weekly budget so the choice is clear before you spend.
          </Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: CREAM },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: GRAY },

  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  backBtn: {
    alignSelf:   'flex-start',
    padding:     14,
    paddingBottom: 6,
  },

  // Context pills
  contextRow:        { flexGrow: 0, marginBottom: 12 },
  contextRowContent: { paddingHorizontal: 14, gap: 6 },
  contextPill: {
    backgroundColor: WHITE,
    borderRadius:    20,
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderWidth:     1,
    borderColor:     BORDER,
  },
  contextPillEstimated: {
    borderColor: AMBER,
  },
  contextPillText: {
    fontSize:   11,
    fontWeight: '600',
    color:      NAVY,
  },

  // Headline
  headline: {
    fontSize:      22,
    fontWeight:    '800',
    color:         NAVY,
    letterSpacing: -0.5,
    lineHeight:    27,
    paddingHorizontal: 14,
    marginBottom:  6,
  },
  sub: {
    fontSize:  12,
    color:     GRAY,
    lineHeight: 17,
    paddingHorizontal: 14,
    marginBottom: 14,
  },

  // Option list
  optionList: { paddingHorizontal: 14, gap: 9, marginBottom: 16 },

  // Option card
  optionCard: {
    backgroundColor: WHITE,
    borderRadius:    16,
    padding:         13,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       2,
  },
  optionCardTop: {
    backgroundColor: GREEN,
  },

  // Top row
  optionTopRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    marginBottom:   8,
    flexWrap:       'wrap',
  },
  scorePill: {
    borderRadius:      20,
    paddingHorizontal: 9,
    paddingVertical:   3,
    borderWidth:       1,
  },
  scorePillText: {
    fontSize:   10,
    fontWeight: '800',
  },
  optionLabel: {
    flex:       1,
    fontSize:   15,
    fontWeight: '700',
    color:      NAVY,
  },
  optionLabelTop: { color: WHITE },

  // Price
  priceText: {
    fontSize:     19,
    fontWeight:   '800',
    color:        NAVY,
    marginBottom: 2,
  },
  priceTextTop: { color: WHITE },
  perPersonText: {
    fontSize:     13,
    color:        GRAY,
    marginBottom: 7,
  },
  perPersonTextTop: { color: 'rgba(255,255,255,0.7)' },

  // Time
  timeRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  7,
  },
  timeText:    { fontSize: 13, color: GRAY },
  timeTextTop: { color: 'rgba(255,255,255,0.75)' },

  // Why text
  whyText: {
    fontSize:     13,
    color:        GRAY,
    fontStyle:    'italic',
    lineHeight:   17,
    marginBottom: 10,
  },
  whyTextTop: {
    color:     'rgba(255,255,255,0.85)',
    fontStyle: 'normal',
  },

  // CTA button
  ctaBtn: {
    borderRadius:    12,
    paddingVertical: 10,
    alignItems:      'center',
  },
  ctaBtnTop: {
    backgroundColor: WHITE,
  },
  ctaBtnOther: {
    borderWidth:  1.5,
    borderColor:  GREEN,
  },
  ctaBtnText:      { fontSize: 14, fontWeight: '700' },
  ctaBtnTopText:   { color: GREEN },
  ctaBtnOtherText: { color: GREEN },

  // Stash
  stash: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
    backgroundColor: MINT,
    borderRadius:  16,
    padding:       16,
    marginHorizontal: 20,
    borderWidth:   1,
    borderColor:   '#C8E6C9',
  },
  stashBubble: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: GREEN,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  stashBubbleText: {
    color:      WHITE,
    fontSize:   14,
    fontWeight: '900',
  },
  stashText: {
    flex:       1,
    fontSize:   13,
    color:      NAVY,
    lineHeight: 20,
  },

  bottomSpacer: { height: 24 },
});
