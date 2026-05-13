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
import { supabase } from '../lib/supabase';
import { getFoodOptions, buildContextFromProfile } from '../src/services/foodOptions/foodOptionsProvider';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';
var CORAL  = '#fb5b5b';
var AMBER  = '#F59E0B';

// Score badge colors from the decision engine (mirrors scoreColor in decisionEngineService)
var SCORE_COLORS = {
  'Best fit':  GREEN,
  'Good fit':  '#3B82F6',
  'Possible':  AMBER,
  'Not ideal': '#9CA3AF',
};

// Seeded fallback context when profile load fails
var FALLBACK_CONTEXT = {
  remainingBudgetCents: 8000,
  weeklyBudgetCents:    20000,
  householdSize:        4,
  cookingTimeMin:       30,
  foodGoals:            ['high-protein', 'lower-sugar'],
  pantryCount:          8,
  hasKids:              false,
  preferenceStyle:      'saver',
  availableStores:      [{ store_name: 'Publix' }, { store_name: 'Aldi' }],
};

function StashBubble(props) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}>
        <Text style={styles.stashIconText}>S</Text>
      </View>
      <Text style={styles.stashText}>{props.message}</Text>
    </View>
  );
}

function ScoreBadge(props) {
  var color = SCORE_COLORS[props.label] || GRAY;
  return (
    <View style={[styles.scoreBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Text style={[styles.scoreBadgeText, { color: color }]}>{props.label}</Text>
    </View>
  );
}

function OptionCard(props) {
  var option      = props.option;
  var isTop       = props.isTop;
  var onPress     = props.onPress;

  return (
    <TouchableOpacity
      style={[styles.optionCard, isTop && styles.optionCardTop]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      {/* Score bar */}
      <View style={styles.scoreBarTrack}>
        <View
          style={[
            styles.scoreBarFill,
            {
              width: option.totalScore + '%',
              backgroundColor: SCORE_COLORS[option.scoreLabel] || GRAY,
            },
          ]}
        />
      </View>

      <View style={styles.optionRow}>
        {/* Icon */}
        <View style={[styles.optionIcon, isTop && styles.optionIconTop]}>
          <Feather
            name={option.icon}
            size={20}
            color={isTop ? WHITE : GREEN}
          />
        </View>

        {/* Text */}
        <View style={styles.optionText}>
          <View style={styles.optionLabelRow}>
            <Text style={[styles.optionLabel, isTop && styles.optionLabelTop]}>
              {option.label}
            </Text>
            {isTop && (
              <View style={styles.topBadge}>
                <Text style={styles.topBadgeText}>Recommended</Text>
              </View>
            )}
          </View>
          <Text style={[styles.optionWhy, isTop && styles.optionWhyTop]}>
            {option.why}
          </Text>
        </View>

        {/* Score + chevron */}
        <View style={styles.optionRight}>
          <ScoreBadge label={option.scoreLabel} />
          <Feather
            name="chevron-right"
            size={16}
            color={isTop ? 'rgba(255,255,255,0.6)' : BORDER}
            style={{ marginTop: 4 }}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function BudgetPill(props) {
  return (
    <View style={styles.budgetPill}>
      <Feather name="dollar-sign" size={13} color={GREEN} />
      <Text style={styles.budgetPillText}>
        {'$' + (props.remainingCents / 100).toFixed(0) + ' left this week'}
      </Text>
    </View>
  );
}

export default function TodayDecisionScreen(props) {
  var navigation = props.navigation;

  var [loading, setLoading]   = useState(true);
  var [options, setOptions]   = useState([]);
  var [context, setContext]   = useState(FALLBACK_CONTEXT);
  var [firstName, setFirstName] = useState('');

  useEffect(function () {
    (async function () {
      try {
        var authResult = await supabase.auth.getUser();
        var user = authResult.data && authResult.data.user;
        if (!user) {
          var ranked = await getFoodOptions(null, FALLBACK_CONTEXT);
          setOptions(ranked);
          setLoading(false);
          return;
        }

        var profileResult = await supabase
          .from('profiles')
          .select('full_name, weekly_budget, household_size, cooking_time, food_goals, pantry_item_count, has_kids, stash_style, stores')
          .eq('user_id', user.id)
          .single();

        var profile = profileResult.data || {};
        var name = profile.full_name || '';
        setFirstName(name.split(' ')[0] || '');

        var ctx = buildContextFromProfile(profile);
        setContext(ctx);

        var ranked = await getFoodOptions(user.id, ctx);
        setOptions(ranked);
      } catch (e) {
        // Fallback to seeded context on any error
        var fallbackRanked = await getFoodOptions(null, FALLBACK_CONTEXT);
        setOptions(fallbackRanked);
      }
      setLoading(false);
    })();
  }, []);

  function handleOptionPress(option) {
    switch (option.optionType) {
      case 'cook_from_pantry':
        navigation.navigate('WeeklyDinnerPlan');
        break;
      case 'quick_grocery_run':
      case 'grocery_pickup':
        navigation.navigate('WeeklyDinnerPlan');
        break;
      case 'uber_eats_pickup':
      case 'uber_eats_delivery':
        // Deep-links to Uber Eats sandbox handoff when available
        navigation.navigate('MainApp');
        break;
      case 'eat_out_smart':
        navigation.navigate('MainApp');
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

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GREEN} size="large" />
          <Text style={styles.loadingText}>Calculating your best options...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Header */}
        <Text style={styles.headline}>
          {firstName ? 'What should you do today, ' + firstName + '?' : "What's your best option today?"}
        </Text>
        <Text style={styles.sub}>
          Ranked by budget fit, time, nutrition, and what you already have.
        </Text>

        {/* Budget remaining pill */}
        <BudgetPill remainingCents={context.remainingBudgetCents} />

        {/* Decision label */}
        <Text style={styles.sectionLabel}>YOUR OPTIONS — RANKED BY SNIPPD</Text>

        {/* Option list */}
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

        {/* Stash */}
        <StashBubble
          message="Snippd compares cooking, pickup, delivery, and eat-out options against your real weekly budget — so you make the decision that's actually right for today."
        />

        {/* Footer note */}
        <Text style={styles.footerNote}>
          Scores reflect your current budget, pantry, household size, and food goals. Updated each time you open this screen.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: CREAM },
  loadingWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:  { fontSize: 14, color: GRAY },
  scroll:       { padding: 24, paddingBottom: 48 },

  backBtn: { marginBottom: 20, alignSelf: 'flex-start' },

  headline: {
    fontSize: 26,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.5,
    lineHeight: 32,
    marginBottom: 8,
  },
  sub: {
    fontSize: 14,
    color: GRAY,
    lineHeight: 20,
    marginBottom: 16,
  },

  budgetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: MINT,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    marginBottom: 24,
  },
  budgetPillText: { fontSize: 13, fontWeight: '700', color: GREEN },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: GRAY,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  optionList: { gap: 10, marginBottom: 24 },

  optionCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  optionCardTop: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },

  scoreBarTrack: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  scoreBarFill: {
    height: '100%',
  },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },

  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionIconTop: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  optionText: { flex: 1 },
  optionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 3,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
  },
  optionLabelTop: { color: WHITE },

  topBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  topBadgeText: { fontSize: 10, fontWeight: '800', color: WHITE },

  optionWhy: { fontSize: 12, color: GRAY, lineHeight: 16 },
  optionWhyTop: { color: 'rgba(255,255,255,0.75)' },

  optionRight: { alignItems: 'center' },

  scoreBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  scoreBadgeText: { fontSize: 10, fontWeight: '800' },

  stash: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: MINT,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    marginBottom: 16,
  },
  stashIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stashIconText: { color: WHITE, fontSize: 14, fontWeight: '900' },
  stashText: { flex: 1, fontSize: 13, color: NAVY, lineHeight: 20 },

  footerNote: {
    fontSize: 11,
    color: GRAY,
    lineHeight: 17,
    textAlign: 'center',
  },
});
