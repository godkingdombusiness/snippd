/**
 * TodayOptionsRankedScreen.js
 *
 * Shows ranked food options after TodaySetupGateScreen.
 *
 * Route params: { context } — shape from TodaySetupGateScreen.buildContext()
 *   weeklyBudgetCents, remainingBudgetCents, householdSize,
 *   tonightEatersCount, shoppingStatus, timeWindow, checkPantryFirst, behaviorProfile
 *
 * Scoring and cost estimation delegated entirely to decisionEngineService.
 * generateTodayOptions() returns ranked options already enriched with
 * costRangeLabel, perPersonLabel, budgetImpactLabel, etc.
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

var { generateTodayOptions } = require('../src/services/foodOptions/decisionEngineService');

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var MINT   = '#E8F5E9';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var CORAL  = '#fb5b5b';
var AMBER  = '#F59E0B';

// ── Time labels displayed on each card ───────────────────────────────────────

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

// ── Score pill colour map ─────────────────────────────────────────────────────

var SCORE_PILL_COLORS = {
  'Best fit':  GREEN,
  'Good fit':  '#3B82F6',
  'Possible':  AMBER,
  'Not ideal': CORAL,
};

// ── Translate TodaySetupGate context → decisionEngine context ─────────────────
// Handles both naming conventions: the gate uses timeWindow/shoppingStatus/
// checkPantryFirst/behaviorProfile/tonightEatersCount, while older callers
// may use timeBeforeDinner/groceryStatus/pantryPreference/todayGoal.

var TIME_MIN_MAP = {
  under_15: 12,
  '15_30':  22,
  '30_45':  37,
  over_45:  60,
};

var GOAL_TO_FOOD_GOAL = {
  spend_least:   'lower-sugar',
  high_protein:  'high-protein',
  lower_calorie: 'under-600-cal',
  kid_friendly:  'kid-friendly',
  fastest:       'lower-sugar',
  healthier:     'lower-sodium',
  comfort:       'lower-sugar',
  family_meal:   'lower-sugar',
  batch_freeze:  'lower-sugar',
};

var GOAL_TO_PREF = {
  spend_least:   'saver',
  high_protein:  'saver',
  lower_calorie: 'saver',
  kid_friendly:  'saver',
  fastest:       'convenience',
  healthier:     'saver',
  comfort:       'explorer',
  family_meal:   'saver',
  batch_freeze:  'saver',
};

function buildEngineContext(ctx) {
  // Resolve field name aliases
  var timeKey       = ctx.timeBeforeDinner  || ctx.timeWindow;
  var pantryPref    = ctx.pantryPreference  || ctx.checkPantryFirst;
  var grocery       = ctx.groceryStatus     || ctx.shoppingStatus;
  // behaviorProfile is an array; todayGoal is a single legacy string
  var goals         = Array.isArray(ctx.behaviorProfile) && ctx.behaviorProfile.length > 0
                        ? ctx.behaviorProfile
                        : (ctx.todayGoal ? [ctx.todayGoal] : []);
  var peopleEating  = ctx.peopleEatingToday || ctx.tonightEatersCount || ctx.householdSize || 2;

  var cookingTimeMin = (timeKey && TIME_MIN_MAP[timeKey]) || 30;

  // All selected goals contribute to foodGoals
  var foodGoals = goals.map(function (g) { return GOAL_TO_FOOD_GOAL[g]; }).filter(Boolean);

  // Derive preferenceStyle — fastest/convenience wins, otherwise use first match
  var prefStyle = 'saver';
  if (goals.includes('fastest')) {
    prefStyle = 'convenience';
  } else if (goals.includes('comfort')) {
    prefStyle = 'explorer';
  } else {
    for (var i = 0; i < goals.length; i++) {
      if (GOAL_TO_PREF[goals[i]]) { prefStyle = GOAL_TO_PREF[goals[i]]; break; }
    }
  }

  // Estimate pantry fullness from grocery + pantry preference answers
  // 'not_yet' and 'no' both mean the user hasn't shopped → sparse pantry
  var pantryCount = 8;
  if (grocery === 'yes')                                  pantryCount = 15;
  if (grocery === 'no'    || grocery === 'not_yet')       pantryCount = 4;
  if (grocery === 'partially')                            pantryCount = 9;
  if (pantryPref === 'use_first') pantryCount = Math.max(pantryCount, 10);

  var hasKids = goals.includes('kid_friendly') || goals.includes('family_meal');

  return {
    remainingBudgetCents: ctx.remainingBudgetCents || 0,
    weeklyBudgetCents:    ctx.weeklyBudgetCents    || 20000,
    householdSize:        ctx.householdSize        || 2,
    peopleEatingToday:    peopleEating,
    cookingTimeMin:       cookingTimeMin,
    foodGoals:            foodGoals,
    pantryCount:          pantryCount,
    hasKids:              hasKids,
    preferenceStyle:      prefStyle,
  };
}

// ── Context pill builder ──────────────────────────────────────────────────────

var TIME_DISPLAY = {
  under_15: 'Under 15 min',
  '15_30':  '15-30 min',
  '30_45':  '30-45 min',
  over_45:  'Over 45 min',
};

var GROCERY_DISPLAY = {
  yes:       'Shopped',
  no:        'Not shopped',
  not_yet:   'Not shopped',
  partially: 'Partial shop',
};

function buildContextPills(context) {
  var pills = [];
  var ctx   = context || {};

  // Budget
  if (ctx.remainingBudgetCents > 0) {
    pills.push({
      id:        'budget',
      label:     '$' + Math.round(ctx.remainingBudgetCents / 100) + ' left',
      estimated: !ctx.weeklyBudgetCents,
    });
  } else {
    pills.push({ id: 'budget', label: 'No budget set', estimated: true });
  }

  // People — handle both naming conventions
  var people = ctx.peopleEatingToday || ctx.tonightEatersCount || ctx.householdSize || 2;
  pills.push({ id: 'people', label: people + (people === 1 ? ' person' : ' people'), estimated: false });

  // Time — handle both naming conventions
  var timeKey = ctx.timeBeforeDinner || ctx.timeWindow;
  if (timeKey && TIME_DISPLAY[timeKey]) {
    pills.push({ id: 'time', label: TIME_DISPLAY[timeKey], estimated: false });
  } else {
    pills.push({ id: 'time', label: '30 min', estimated: true });
  }

  // Grocery status — handle both naming conventions
  var grocery = ctx.groceryStatus || ctx.shoppingStatus;
  if (grocery && GROCERY_DISPLAY[grocery]) {
    pills.push({ id: 'grocery', label: GROCERY_DISPLAY[grocery], estimated: false });
  } else {
    pills.push({ id: 'grocery', label: 'Shop status unknown', estimated: true });
  }

  return pills;
}

// ── Context pill renderer ─────────────────────────────────────────────────────

function renderContextPill(pill) {
  return (
    <View
      key={pill.id}
      style={[styles.contextPill, pill.estimated && styles.contextPillEstimated]}
    >
      <Text style={styles.contextPillText}>
        {pill.label}{pill.estimated ? ' (est)' : ''}
      </Text>
    </View>
  );
}

// ── OptionCard ────────────────────────────────────────────────────────────────

function OptionCard(props) {
  var option    = props.option;
  var isTop     = props.isTop;
  var onPress   = props.onPress;

  var scoreColor = SCORE_PILL_COLORS[option.scoreLabel] || GRAY;
  var timeLabel  = TIME_LABELS[option.optionType]       || '';
  var ctaLabel   = CTA_LABELS[option.optionType]        || 'View options';

  // Cost data comes from the engine's estimateCosts() via generateTodayOptions()
  var costLabel  = option.costRangeLabel  || '';
  var perPerson  = option.perPersonLabel  || '';

  return (
    <View style={[styles.optionCard, isTop && styles.optionCardTop]}>

      <View style={styles.optionTopRow}>
        <View style={[styles.scorePill, { backgroundColor: scoreColor + '22', borderColor: scoreColor + '55' }]}>
          <Text style={[styles.scorePillText, { color: scoreColor }]}>{option.scoreLabel}</Text>
        </View>
        <Text style={[styles.optionLabel, isTop && styles.optionLabelTop]} numberOfLines={1}>
          {option.label}
        </Text>
      </View>

      <Text style={[styles.priceText, isTop && styles.priceTextTop]}>
        {costLabel}
      </Text>
      <Text style={[styles.perPersonText, isTop && styles.perPersonTextTop]}>
        {perPerson}
      </Text>

      <View style={styles.timeRow}>
        <Feather name="clock" size={13} color={isTop ? 'rgba(255,255,255,0.7)' : GRAY} />
        <Text style={[styles.timeText, isTop && styles.timeTextTop]}>{timeLabel}</Text>
      </View>

      <Text style={[styles.whyText, isTop && styles.whyTextTop]}>
        {option.why}
      </Text>

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

// ── Default context when nothing is passed ────────────────────────────────────

var DEFAULT_CONTEXT = {
  weeklyBudgetCents:    20000,
  remainingBudgetCents: 12000,
  householdSize:        2,
  tonightEatersCount:   2,
  shoppingStatus:       'not_yet',
  timeWindow:           '30_45',
  checkPantryFirst:     'not_sure',
  behaviorProfile:      ['spend_least'],
};

// ── Main component ────────────────────────────────────────────────────────────

export default function TodayOptionsRankedScreen(props) {
  var navigation = props.navigation;
  var route      = props.route;
  var params     = (route && route.params) || {};
  var context    = params.context || DEFAULT_CONTEXT;

  var [options, setOptions] = useState([]);
  var [loading, setLoading] = useState(true);

  useEffect(function () {
    var engineCtx = buildEngineContext(context);
    // generateTodayOptions returns ranked options already enriched with cost estimates
    var ranked    = generateTodayOptions(engineCtx);
    setOptions(ranked);
    setLoading(false);

    tracker.track('today_options_viewed', {
      option_count:    ranked.length,
      has_budget:      (context.weeklyBudgetCents || 0) > 0,
      shopping_status: context.shoppingStatus || context.groceryStatus || null,
      time_window:     context.timeWindow || context.timeBeforeDinner  || null,
      top_option:      ranked[0] ? ranked[0].optionType : null,
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
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  function handleHome() {
    navigation.navigate('MainApp');
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

      {/* Nav bar — back on left, home on right */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>What's the plan?</Text>
        <TouchableOpacity style={styles.navBtn} onPress={handleHome} activeOpacity={0.7}>
          <Feather name="home" size={20} color={NAVY} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Context pills — show what the ranking was based on */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.contextRow}
          contentContainerStyle={styles.contextRowContent}
        >
          {contextPills.map(function (pill) { return renderContextPill(pill); })}
        </ScrollView>

        <Text style={styles.headline}>What's your best move today?</Text>
        <Text style={styles.sub}>
          Ranked by your budget, time, pantry, stores, and food goals.
        </Text>

        <View style={styles.optionList}>
          {options.map(function (option, idx) {
            return (
              <OptionCard
                key={option.optionType}
                option={option}
                isTop={idx === 0}
                onPress={function () { handleOptionPress(option); }}
              />
            );
          })}
        </View>

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

  navBar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor:   CREAM,
  },
  navBtn: {
    width:           40,
    height:          40,
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    10,
    backgroundColor: WHITE,
    borderWidth:     1,
    borderColor:     BORDER,
  },
  navTitle: { fontSize: 15, fontWeight: '700', color: NAVY },

  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 24, paddingTop: 12 },

  contextRow:        { flexGrow: 0, marginBottom: 12 },
  contextRowContent: { paddingHorizontal: 14, gap: 6 },
  contextPill: {
    backgroundColor:   WHITE,
    borderRadius:      20,
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderWidth:       1,
    borderColor:       BORDER,
  },
  contextPillEstimated: { borderColor: AMBER },
  contextPillText: { fontSize: 11, fontWeight: '600', color: NAVY },

  headline: {
    fontSize:          22,
    fontWeight:        '800',
    color:             NAVY,
    letterSpacing:     -0.5,
    lineHeight:        27,
    paddingHorizontal: 14,
    marginBottom:      6,
  },
  sub: {
    fontSize:          12,
    color:             GRAY,
    lineHeight:        17,
    paddingHorizontal: 14,
    marginBottom:      14,
  },

  optionList: { paddingHorizontal: 14, gap: 9, marginBottom: 16 },

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
  optionCardTop: { backgroundColor: GREEN },

  optionTopRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    marginBottom:  8,
    flexWrap:      'wrap',
  },
  scorePill: {
    borderRadius:      20,
    paddingHorizontal: 9,
    paddingVertical:   3,
    borderWidth:       1,
  },
  scorePillText:  { fontSize: 10, fontWeight: '800' },
  optionLabel:    { flex: 1, fontSize: 15, fontWeight: '700', color: NAVY },
  optionLabelTop: { color: WHITE },

  priceText:        { fontSize: 19, fontWeight: '800', color: NAVY, marginBottom: 2 },
  priceTextTop:     { color: WHITE },
  perPersonText:    { fontSize: 13, color: GRAY, marginBottom: 7 },
  perPersonTextTop: { color: 'rgba(255,255,255,0.7)' },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  timeText:    { fontSize: 13, color: GRAY },
  timeTextTop: { color: 'rgba(255,255,255,0.75)' },

  whyText: {
    fontSize:     13,
    color:        GRAY,
    fontStyle:    'italic',
    lineHeight:   17,
    marginBottom: 10,
  },
  whyTextTop: { color: 'rgba(255,255,255,0.85)', fontStyle: 'normal' },

  ctaBtn:          { borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  ctaBtnTop:       { backgroundColor: WHITE },
  ctaBtnOther:     { borderWidth: 1.5, borderColor: GREEN },
  ctaBtnText:      { fontSize: 14, fontWeight: '700' },
  ctaBtnTopText:   { color: GREEN },
  ctaBtnOtherText: { color: GREEN },

  stash: {
    flexDirection:    'row',
    alignItems:       'flex-start',
    gap:              12,
    backgroundColor:  MINT,
    borderRadius:     16,
    padding:          16,
    marginHorizontal: 20,
    borderWidth:      1,
    borderColor:      '#C8E6C9',
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
  stashBubbleText: { color: WHITE, fontSize: 14, fontWeight: '900' },
  stashText:       { flex: 1, fontSize: 13, color: NAVY, lineHeight: 20 },

  bottomSpacer: { height: 24 },
});
