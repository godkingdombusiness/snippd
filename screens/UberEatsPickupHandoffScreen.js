import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
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

var SEEDED_PICKUP = [
  {
    id: 'up1',
    restaurant: 'Chick-fil-A',
    item: 'Family Meals',
    estimated_total_cents: 3200,
    cost_per_person_cents: 800,
    eta_label: '15-20 min',
    nutrition_label: 'High protein option available',
    budget_impact_label: 'Uses 40% of remaining weekly budget',
  },
  {
    id: 'up2',
    restaurant: 'Chipotle',
    item: 'Burrito Bowls for 4',
    estimated_total_cents: 4400,
    cost_per_person_cents: 1100,
    eta_label: '20-25 min',
    nutrition_label: 'Customizable — skip sour cream to reduce fat',
    budget_impact_label: 'Uses 55% of remaining weekly budget',
  },
];

function formatDollars(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function EtaBadge(props) {
  return (
    <View style={styles.etaBadge}>
      <Feather name="clock" size={11} color={GRAY} />
      <Text style={styles.etaBadgeText}>{props.label}</Text>
    </View>
  );
}

function PickupCard(props) {
  var option  = props.option;
  var onPress = props.onPress;

  return (
    <View style={styles.card}>
      {/* Top row */}
      <View style={styles.cardTopRow}>
        <Text style={styles.cardRestaurant}>{option.restaurant}</Text>
        <EtaBadge label={option.eta_label} />
      </View>

      {/* Item description */}
      <Text style={styles.cardItem}>{option.item}</Text>

      {/* Price row */}
      <View style={styles.cardPriceRow}>
        <Text style={styles.cardHouseholdPrice}>{'~' + formatDollars(option.estimated_total_cents) + ' household'}</Text>
        <Text style={styles.cardPerPerson}>{formatDollars(option.cost_per_person_cents) + ' per person'}</Text>
      </View>

      {/* Budget impact */}
      <View style={styles.amberRow}>
        <Feather name="alert-circle" size={13} color={AMBER} />
        <Text style={styles.amberText}>{option.budget_impact_label}</Text>
      </View>

      {/* Nutrition note */}
      <Text style={styles.nutritionNote}>{option.nutrition_label}</Text>

      {/* CTA */}
      <TouchableOpacity style={styles.primaryBtn} onPress={onPress} activeOpacity={0.88}>
        <Feather name="external-link" size={14} color={WHITE} />
        <Text style={styles.primaryBtnText}>Open in Uber Eats</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function UberEatsPickupHandoffScreen(props) {
  var navigation = props.navigation;
  var params     = props.route ? props.route.params : {};
  var score      = params.score || null;
  var context    = params.context || {};

  var remainingBudgetCents = context.remainingBudgetCents || 8000;
  var peopleEatingToday    = context.peopleEatingToday    || 4;

  useEffect(function () {
    tracker.track('uber_eats_pickup_handoff_viewed', { score: score });
  }, []);

  function handlePickupPress(option) {
    tracker.track('uber_eats_pickup_opened', {
      restaurant: option.restaurant,
      estimated_total_cents: option.estimated_total_cents,
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
        <Text style={styles.navTitle}>Uber Eats Pickup</Text>

        {/* Headline */}
        <Text style={styles.headline}>Uber Eats pickup options.</Text>
        <Text style={styles.sub}>
          Pickup may help you save on delivery fees while still keeping dinner simple.
        </Text>

        {/* Budget context pill */}
        <View style={styles.contextPillRow}>
          <View style={styles.contextPill}>
            <Feather name="dollar-sign" size={12} color={GREEN} />
            <Text style={styles.contextPillText}>{'$' + (remainingBudgetCents / 100).toFixed(0) + ' remaining budget'}</Text>
          </View>
          <View style={styles.contextPill}>
            <Feather name="users" size={12} color={GREEN} />
            <Text style={styles.contextPillText}>{peopleEatingToday + ' people'}</Text>
          </View>
          {score !== null && (
            <View style={styles.contextPill}>
              <Feather name="bar-chart-2" size={12} color={GREEN} />
              <Text style={styles.contextPillText}>{'Fit score: ' + score}</Text>
            </View>
          )}
        </View>

        {/* Cards */}
        <View style={styles.cardList}>
          {SEEDED_PICKUP.map(function (option) {
            return (
              <PickupCard
                key={option.id}
                option={option}
                onPress={function () { handlePickupPress(option); }}
              />
            );
          })}
        </View>

        {/* Sandbox note */}
        <Text style={styles.sandboxNote}>Uber Eats data is in sandbox testing mode.</Text>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Prices, fees, availability, and nutrition may vary by location, app, restaurant, and time.
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
    marginBottom: 18,
  },

  contextPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
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
  },
  contextPillText: { fontSize: 12, fontWeight: '700', color: GREEN },

  cardList: { gap: 14, marginBottom: 20 },

  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },

  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardRestaurant: { fontSize: 16, fontWeight: '700', color: NAVY },

  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  etaBadgeText: { fontSize: 11, color: GRAY, fontWeight: '600' },

  cardItem: { fontSize: 13, color: GRAY, marginBottom: 10 },

  cardPriceRow:     { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 10 },
  cardHouseholdPrice: { fontSize: 18, fontWeight: '800', color: NAVY },
  cardPerPerson:    { fontSize: 13, color: GRAY },

  amberRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  amberText: { fontSize: 12, color: AMBER, fontWeight: '600', flex: 1 },

  nutritionNote: { fontSize: 12, color: GRAY, fontStyle: 'italic', marginBottom: 14, lineHeight: 18 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 13,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: WHITE },

  sandboxNote: {
    fontSize: 11,
    color: GRAY,
    textAlign: 'center',
    marginBottom: 6,
  },
  disclaimer: {
    fontSize: 11,
    color: GRAY,
    lineHeight: 17,
    textAlign: 'center',
  },
});
