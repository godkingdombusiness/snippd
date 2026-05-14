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

var SEEDED_DELIVERY = [
  {
    id: 'ud1',
    restaurant: 'Chick-fil-A',
    item: 'Family Meals',
    food_total_cents: 3200,
    delivery_fee_cents: 499,
    service_fee_cents: 350,
    estimated_total_cents: 4049,
    cost_per_person_cents: 1012,
    eta_label: '30-45 min',
    budget_impact_label: 'Uses about 51% of remaining weekly budget',
  },
  {
    id: 'ud2',
    restaurant: 'Chipotle',
    item: 'Burrito Bowls for 4',
    food_total_cents: 4400,
    delivery_fee_cents: 399,
    service_fee_cents: 440,
    estimated_total_cents: 5239,
    cost_per_person_cents: 1310,
    eta_label: '35-50 min',
    budget_impact_label: 'Uses about 65% of remaining weekly budget',
  },
];

function formatDollars(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function FeeRow(props) {
  return (
    <View style={styles.feeRow}>
      <Text style={styles.feeLabel}>{props.label}</Text>
      <Text style={[styles.feeValue, props.total && styles.feeTotalValue]}>{props.value}</Text>
    </View>
  );
}

function DeliveryCard(props) {
  var option  = props.option;
  var onPress = props.onPress;

  return (
    <View style={styles.card}>
      {/* Top row */}
      <View style={styles.cardTopRow}>
        <Text style={styles.cardRestaurant}>{option.restaurant}</Text>
        <View style={styles.etaBadge}>
          <Feather name="clock" size={11} color={GRAY} />
          <Text style={styles.etaBadgeText}>{option.eta_label}</Text>
        </View>
      </View>

      {/* Item description */}
      <Text style={styles.cardItem}>{option.item}</Text>

      {/* Fee breakdown */}
      <View style={styles.feeBreakdown}>
        <FeeRow label="Food total" value={formatDollars(option.food_total_cents)} />
        <View style={styles.feeDivider} />
        <FeeRow label="Delivery fee" value={formatDollars(option.delivery_fee_cents)} />
        <View style={styles.feeDivider} />
        <FeeRow label="Service fee" value={formatDollars(option.service_fee_cents)} />
        <View style={[styles.feeDivider, { backgroundColor: BORDER }]} />
        <FeeRow label="Total (before tip)" value={formatDollars(option.estimated_total_cents)} total />
      </View>

      {/* Per person */}
      <View style={styles.perPersonRow}>
        <Text style={styles.perPersonLabel}>Per person</Text>
        <Text style={styles.perPersonValue}>{formatDollars(option.cost_per_person_cents)}</Text>
      </View>

      {/* Budget impact */}
      <View style={styles.amberRow}>
        <Feather name="alert-circle" size={13} color={AMBER} />
        <Text style={styles.amberText}>{option.budget_impact_label}</Text>
      </View>

      {/* CTA */}
      <TouchableOpacity style={styles.primaryBtn} onPress={onPress} activeOpacity={0.88}>
        <Feather name="external-link" size={14} color={WHITE} />
        <Text style={styles.primaryBtnText}>Open in Uber Eats</Text>
      </TouchableOpacity>
    </View>
  );
}

function StashNote(props) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}>
        <Text style={styles.stashIconText}>S</Text>
      </View>
      <Text style={styles.stashText}>{props.message}</Text>
    </View>
  );
}

export default function UberEatsDeliveryScreen(props) {
  var navigation = props.navigation;
  var params     = props.route ? props.route.params : {};
  var score      = params.score || null;

  useEffect(function () {
    tracker.track('uber_eats_delivery_viewed', { score: score });
  }, []);

  function handleDeliveryPress(option) {
    tracker.track('uber_eats_delivery_opened', {
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
        <Text style={styles.navTitle}>Uber Eats Delivery</Text>

        {/* Headline */}
        <Text style={styles.headline}>Uber Eats delivery options.</Text>
        <Text style={styles.sub}>
          Delivery is convenient, but Snippd shows the total budget impact before you order.
        </Text>

        {/* Score pill */}
        {score !== null && (
          <View style={styles.scorePillRow}>
            <View style={styles.scorePill}>
              <Feather name="bar-chart-2" size={12} color={GREEN} />
              <Text style={styles.scorePillText}>{'Snippd fit score: ' + score + ' / 100'}</Text>
            </View>
          </View>
        )}

        {/* Cards */}
        <View style={styles.cardList}>
          {SEEDED_DELIVERY.map(function (option) {
            return (
              <DeliveryCard
                key={option.id}
                option={option}
                onPress={function () { handleDeliveryPress(option); }}
              />
            );
          })}
        </View>

        {/* Stash note */}
        <StashNote message="Delivery fees and tips can add 25-40% to your food total. Pickup is usually the smarter budget move." />

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

  scorePillRow: { marginBottom: 20 },
  scorePill: {
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
  },
  scorePillText: { fontSize: 12, fontWeight: '700', color: GREEN },

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

  cardItem: { fontSize: 13, color: GRAY, marginBottom: 12 },

  feeBreakdown: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
    overflow: 'hidden',
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  feeLabel:      { fontSize: 13, color: GRAY },
  feeValue:      { fontSize: 13, fontWeight: '600', color: NAVY },
  feeTotalValue: { fontSize: 15, fontWeight: '800', color: GREEN },
  feeDivider:    { height: 1, backgroundColor: '#F0F0F0' },

  perPersonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  perPersonLabel: { fontSize: 13, color: GRAY },
  perPersonValue: { fontSize: 15, fontWeight: '800', color: NAVY },

  amberRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  amberText: { fontSize: 12, color: AMBER, fontWeight: '600', flex: 1 },

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

  disclaimer: {
    fontSize: 11,
    color: GRAY,
    lineHeight: 17,
    textAlign: 'center',
  },
});
