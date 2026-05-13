import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatCents } from '../../utils/weeklyPlan/formatMoney';

var GREEN = '#0C9E54';
var WHITE = '#FFFFFF';
var LIGHT_GREEN = 'rgba(255,255,255,0.18)';

function WeeklyPlanHeroCard(props) {
  var plan = props.plan;
  var stores = props.stores || [];

  var bestStore = stores.find(function (s) { return s.store_id === plan.best_overall_store_id; });
  var bestStoreName = bestStore ? bestStore.store_name : 'Publix';

  var dinnerCount = 7;
  var householdSize = plan.household_size || 4;

  return (
    <View style={styles.card}>
      <Text style={styles.weekLabel}>
        {'Week of May 11 — May 17'}
      </Text>
      <Text style={styles.planSubtitle}>
        {dinnerCount + ' dinners for ' + householdSize}
      </Text>

      <View style={styles.mainNumbers}>
        <View style={styles.numberBlock}>
          <Text style={styles.numberLabel}>Out of pocket</Text>
          <Text style={styles.numberValue}>{formatCents(plan.out_of_pocket_cents)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.numberBlock}>
          <Text style={styles.numberLabel}>You save</Text>
          <Text style={styles.numberValue}>{formatCents(plan.estimated_savings_cents)}</Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.bottomItem}>
          <Text style={styles.bottomLabel}>Best Overall</Text>
          <Text style={styles.bottomValue}>{bestStoreName}</Text>
        </View>
        <View style={styles.bottomDivider} />
        <View style={styles.bottomItem}>
          <Text style={styles.bottomLabel}>Deals valid through</Text>
          <Text style={styles.bottomValue}>{plan.deal_valid_until}</Text>
        </View>
      </View>
    </View>
  );
}

var styles = StyleSheet.create({
  card: {
    backgroundColor: GREEN,
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  weekLabel: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.85,
    marginBottom: 4,
  },
  planSubtitle: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  mainNumbers: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT_GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  numberBlock: {
    flex: 1,
    alignItems: 'center',
  },
  numberLabel: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.8,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  numberValue: {
    color: WHITE,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT_GREEN,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bottomItem: {
    flex: 1,
    alignItems: 'center',
  },
  bottomLabel: {
    color: WHITE,
    fontSize: 11,
    opacity: 0.75,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  bottomValue: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  bottomDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 8,
  },
});

export default WeeklyPlanHeroCard;
