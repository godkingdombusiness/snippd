import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tracker } from '../src/lib/eventTracker';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var MINT   = '#E8F5E9';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var AMBER  = '#F59E0B';

var SEEDED_OPTIONS = [
  {
    id: 'eo1',
    name: 'Chick-fil-A',
    deal_label: 'Family meals under $35',
    estimated_household_cents: 3200,
    cost_per_person_cents: 800,
    time_label: '15-20 min',
    goal_fit: 'High protein',
    budget_fit: 'Under budget',
    type: 'uber_eats_pickup',
    distance_label: '0.9 miles',
  },
  {
    id: 'eo2',
    name: 'Chipotle',
    deal_label: 'Build your bowl — great for groups',
    estimated_household_cents: 4400,
    cost_per_person_cents: 1100,
    time_label: '20-30 min',
    goal_fit: 'Higher protein',
    budget_fit: 'Moderate',
    type: 'uber_eats_pickup',
    distance_label: '1.4 miles',
  },
  {
    id: 'eo3',
    name: 'Panda Express',
    deal_label: 'Family feast — feeds 4',
    estimated_household_cents: 3600,
    cost_per_person_cents: 900,
    time_label: '15-25 min',
    goal_fit: 'Family-friendly',
    budget_fit: 'Under budget',
    type: 'uber_eats_pickup',
    distance_label: '2.0 miles',
  },
  {
    id: 'eo4',
    name: "Chili's",
    deal_label: '3 for $10.99 deal available',
    estimated_household_cents: 5200,
    cost_per_person_cents: 1300,
    time_label: '25-40 min delivery',
    goal_fit: 'Comfort food',
    budget_fit: 'Watch budget',
    type: 'uber_eats_delivery',
    distance_label: '1.8 miles',
  },
];

var FILTERS = ['All', 'Pickup', 'Delivery', 'Under budget', 'High protein', 'Kid-friendly', 'Fastest'];

var BUDGET_FIT_COLORS = {
  'Under budget': GREEN,
  'Moderate':     '#3B82F6',
  'Watch budget': AMBER,
};

function formatDollars(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function BudgetFitBadge(props) {
  var color = BUDGET_FIT_COLORS[props.label] || GRAY;
  return (
    <View style={[styles.budgetFitBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Text style={[styles.budgetFitBadgeText, { color: color }]}>{props.label}</Text>
    </View>
  );
}

function EatOutCard(props) {
  var option  = props.option;
  var onPress = props.onPress;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.78}>
      {/* Top row */}
      <View style={styles.cardTopRow}>
        <Text style={styles.cardName}>{option.name}</Text>
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceBadgeText}>{option.distance_label}</Text>
        </View>
      </View>

      {/* Deal label */}
      <Text style={styles.cardDealLabel}>{option.deal_label}</Text>

      {/* Price row */}
      <View style={styles.cardPriceRow}>
        <Text style={styles.cardHouseholdPrice}>{'~' + formatDollars(option.estimated_household_cents) + ' household'}</Text>
        <Text style={styles.cardPerPerson}>{formatDollars(option.cost_per_person_cents) + ' per person'}</Text>
      </View>

      {/* Badges row */}
      <View style={styles.cardBadgeRow}>
        <View style={styles.timeBadge}>
          <Feather name="clock" size={11} color={GRAY} />
          <Text style={styles.timeBadgeText}>{option.time_label}</Text>
        </View>
        <View style={styles.goalBadge}>
          <Text style={styles.goalBadgeText}>{option.goal_fit}</Text>
        </View>
        <BudgetFitBadge label={option.budget_fit} />
      </View>

      {/* CTA */}
      <TouchableOpacity style={styles.ctaOutlineBtn} onPress={onPress} activeOpacity={0.82}>
        <Feather name="external-link" size={13} color={GREEN} />
        <Text style={styles.ctaOutlineBtnText}>Open in Uber Eats</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function applyFilters(options, activeFilters) {
  if (activeFilters.indexOf('All') !== -1 || activeFilters.length === 0) return options;
  return options.filter(function (opt) {
    var pass = true;
    if (activeFilters.indexOf('Pickup') !== -1 && opt.type !== 'uber_eats_pickup') pass = false;
    if (activeFilters.indexOf('Delivery') !== -1 && opt.type !== 'uber_eats_delivery') pass = false;
    if (activeFilters.indexOf('Under budget') !== -1 && opt.budget_fit !== 'Under budget') pass = false;
    if (activeFilters.indexOf('High protein') !== -1 && opt.goal_fit.toLowerCase().indexOf('protein') === -1) pass = false;
    if (activeFilters.indexOf('Kid-friendly') !== -1 && opt.goal_fit.toLowerCase().indexOf('family') === -1) pass = false;
    if (activeFilters.indexOf('Fastest') !== -1 && opt.cost_per_person_cents > 1000) pass = false;
    return pass;
  });
}

export default function EatOutSmartScreen(props) {
  var navigation = props.navigation;
  var params     = props.route ? props.route.params : {};
  var context    = params.context || {};

  var remainingBudgetCents = context.remainingBudgetCents || 8000;
  var peopleEatingToday    = context.peopleEatingToday    || 4;
  var todayGoal            = context.todayGoal            || 'Any';
  var timeBeforeDinner     = context.timeBeforeDinner     || '45 min';

  var maxPerPersonCents = Math.floor(remainingBudgetCents / peopleEatingToday);

  var [activeFilters, setActiveFilters] = useState(['All']);
  var [filteredOptions, setFilteredOptions] = useState(SEEDED_OPTIONS);

  useEffect(function () {
    tracker.track('eat_out_smart_viewed', {
      option_count: SEEDED_OPTIONS.length,
      remaining_budget_cents: remainingBudgetCents,
    });
  }, []);

  useEffect(function () {
    setFilteredOptions(applyFilters(SEEDED_OPTIONS, activeFilters));
  }, [activeFilters]);

  function toggleFilter(filter) {
    if (filter === 'All') {
      setActiveFilters(['All']);
      return;
    }
    var next = activeFilters.filter(function (f) { return f !== 'All'; });
    var idx  = next.indexOf(filter);
    if (idx !== -1) {
      next = next.filter(function (f) { return f !== filter; });
    } else {
      next = next.concat([filter]);
    }
    setActiveFilters(next.length === 0 ? ['All'] : next);
  }

  function handleOptionPress(option) {
    tracker.track('eat_out_option_selected', {
      restaurant_name: option.name,
      type: option.type,
    });
    Linking.openURL('https://www.ubereats.com').catch(function (err) {
      console.log('Could not open Uber Eats', err);
    });
  }

  function handleBack() {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back + nav title */}
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Eat Out Smart</Text>

        {/* Headline */}
        <Text style={styles.headline}>Local options for tonight.</Text>
        <Text style={styles.sub}>
          Ranked by your remaining budget and how many people are eating.
        </Text>

        {/* Budget context pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
          style={{ marginBottom: 20 }}
        >
          <View style={styles.contextPill}>
            <Feather name="dollar-sign" size={12} color={GREEN} />
            <Text style={styles.contextPillText}>{'$' + (remainingBudgetCents / 100).toFixed(0) + ' remaining'}</Text>
          </View>
          <View style={styles.contextPill}>
            <Feather name="users" size={12} color={GREEN} />
            <Text style={styles.contextPillText}>{peopleEatingToday + ' people'}</Text>
          </View>
          <View style={styles.contextPill}>
            <Feather name="divide-circle" size={12} color={GREEN} />
            <Text style={styles.contextPillText}>{'Max ' + formatDollars(maxPerPersonCents) + '/person'}</Text>
          </View>
        </ScrollView>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={{ marginBottom: 20 }}
        >
          {FILTERS.map(function (filter) {
            var isActive = activeFilters.indexOf(filter) !== -1;
            return (
              <TouchableOpacity
                key={filter}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={function () { toggleFilter(filter); }}
                activeOpacity={0.78}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Options */}
        {filteredOptions.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="search" size={28} color={GRAY} />
            <Text style={styles.emptyStateText}>No options match your filters. Try clearing a filter.</Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            {filteredOptions.map(function (option) {
              return (
                <EatOutCard
                  key={option.id}
                  option={option}
                  onPress={function () { handleOptionPress(option); }}
                />
              );
            })}
          </View>
        )}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Estimated options. Prices, availability, and fees may vary by location and time.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: CREAM },
  scroll: { padding: 24, paddingBottom: 48 },

  backBtn:  { marginBottom: 4, alignSelf: 'flex-start' },
  navTitle: { fontSize: 12, fontWeight: '800', color: GRAY, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 },

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

  pillRow:   { gap: 8 },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: MINT,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    marginRight: 8,
  },
  contextPillText: { fontSize: 12, fontWeight: '700', color: GREEN },

  filterRow: { gap: 8 },
  filterChip: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: WHITE,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterChipText:   { fontSize: 13, fontWeight: '600', color: GRAY },
  filterChipTextActive: { color: WHITE },

  cardList: { gap: 14, marginBottom: 24 },

  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },

  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardName:   { fontSize: 16, fontWeight: '700', color: NAVY },

  distanceBadge: {
    backgroundColor: MINT,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  distanceBadgeText: { fontSize: 11, color: GREEN, fontWeight: '600' },

  cardDealLabel: { fontSize: 13, color: GRAY, fontStyle: 'italic', marginBottom: 10 },

  cardPriceRow:     { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 10 },
  cardHouseholdPrice: { fontSize: 18, fontWeight: '800', color: NAVY },
  cardPerPerson:    { fontSize: 13, color: GRAY },

  cardBadgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },

  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  timeBadgeText: { fontSize: 11, color: GRAY, fontWeight: '600' },

  goalBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  goalBadgeText: { fontSize: 11, color: '#3B82F6', fontWeight: '600' },

  budgetFitBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  budgetFitBadgeText: { fontSize: 11, fontWeight: '700' },

  ctaOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: GREEN,
    paddingVertical: 11,
  },
  ctaOutlineBtnText: { fontSize: 13, fontWeight: '700', color: GREEN },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyStateText: { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20 },

  disclaimer: {
    fontSize: 11,
    color: GRAY,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 8,
  },
});
