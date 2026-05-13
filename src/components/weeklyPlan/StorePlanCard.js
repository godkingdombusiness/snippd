import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatCents } from '../../utils/weeklyPlan/formatMoney';

var NAVY = '#172250';
var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var BORDER = '#E5E7EB';
var WHITE = '#FFFFFF';
var MINT = '#E8F5E9';

function StorePlanCard(props) {
  var store = props.store;
  var meals = props.meals || [];
  var onViewItems = props.onViewItems;

  var hasSavings = store.store_savings_cents > 0;
  var mealsSupported = store.meals_supported || [];
  var displayMeals = mealsSupported.slice(0, 3);
  var extraCount = mealsSupported.length - 3;

  return (
    <View style={styles.card}>
      {/* Store header */}
      <View style={styles.headerRow}>
        <View style={styles.initialBadge}>
          <Text style={styles.initialText}>{store.store_initial}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.storeName}>{store.store_name}</Text>
          <Text style={styles.itemsCount}>{store.items_count + ' items this week'}</Text>
        </View>
      </View>

      {/* Role */}
      {store.store_role ? (
        <View style={styles.roleBlock}>
          <Text style={styles.roleLabel}>Best for</Text>
          <Text style={styles.roleText}>{store.store_role}</Text>
        </View>
      ) : null}

      {/* Cost row */}
      <View style={styles.costRow}>
        <View style={styles.costItem}>
          <Text style={styles.costLabel}>Estimated total</Text>
          <Text style={styles.costValue}>{formatCents(store.store_total_cents)}</Text>
        </View>
        {hasSavings && (
          <View style={styles.costItem}>
            <Text style={styles.costLabel}>Savings</Text>
            <Text style={styles.savingsValue}>{formatCents(store.store_savings_cents)}</Text>
          </View>
        )}
      </View>

      {/* Meals supported */}
      {displayMeals.length > 0 && (
        <View style={styles.mealsBlock}>
          <Text style={styles.mealsLabel}>Meals supported</Text>
          {displayMeals.map(function (m, i) {
            return (
              <View key={i} style={styles.mealRow}>
                <View style={styles.bullet} />
                <Text style={styles.mealText}>{m}</Text>
              </View>
            );
          })}
          {extraCount > 0 && (
            <Text style={styles.moreText}>{'+ ' + extraCount + ' more'}</Text>
          )}
        </View>
      )}

      {/* Deal valid */}
      {store.deal_valid_until ? (
        <Text style={styles.dealText}>{'Deal valid until ' + store.deal_valid_until}</Text>
      ) : null}

      {/* CTA */}
      <TouchableOpacity style={styles.ctaButton} onPress={onViewItems} activeOpacity={0.8}>
        <Text style={styles.ctaText}>{'View ' + store.store_name + ' Items'}</Text>
      </TouchableOpacity>
    </View>
  );
}

var styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  initialBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    fontSize: 14,
    fontWeight: '800',
    color: GREEN,
  },
  headerInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 18,
    fontWeight: '700',
    color: NAVY,
  },
  itemsCount: {
    fontSize: 13,
    color: GRAY,
    marginTop: 2,
  },
  roleBlock: {
    backgroundColor: '#F9FAF5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  roleText: {
    fontSize: 13,
    color: NAVY,
    lineHeight: 18,
  },
  costRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  costItem: {
    flex: 1,
  },
  costLabel: {
    fontSize: 11,
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  costValue: {
    fontSize: 16,
    fontWeight: '700',
    color: NAVY,
  },
  savingsValue: {
    fontSize: 16,
    fontWeight: '700',
    color: GREEN,
  },
  mealsBlock: {
    marginBottom: 10,
  },
  mealsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: GREEN,
  },
  mealText: {
    fontSize: 13,
    color: NAVY,
  },
  moreText: {
    fontSize: 12,
    color: GRAY,
    marginTop: 2,
  },
  dealText: {
    fontSize: 12,
    color: GRAY,
    marginBottom: 14,
  },
  ctaButton: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default StorePlanCard;
