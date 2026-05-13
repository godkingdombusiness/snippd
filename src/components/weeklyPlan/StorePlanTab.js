import React from 'react';
import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import StoreFilterBar from './StoreFilterBar';
import StorePlanCard from './StorePlanCard';
import { groupMealsByStore } from '../../utils/weeklyPlan/groupMealsByStore';
import { formatCents } from '../../utils/weeklyPlan/formatMoney';

var NAVY = '#172250';
var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var BORDER = '#E5E7EB';
var WHITE = '#FFFFFF';
var CREAM = '#FAF8F1';
var MINT = '#E8F5E9';

function StorePlanTab(props) {
  var stores = props.stores || [];
  var meals = props.meals || [];
  var dayPlans = props.dayPlans || [];
  var navigation = props.navigation;
  var weeklyPlan = props.weeklyPlan;

  var [activeStoreId, setActiveStoreId] = useState('all');

  var grouped = groupMealsByStore(meals, stores, dayPlans);

  var filteredStores = activeStoreId === 'all'
    ? stores
    : stores.filter(function (s) { return s.store_id === activeStoreId; });

  var totalOOP = weeklyPlan ? weeklyPlan.out_of_pocket_cents : 0;
  var totalSavings = weeklyPlan ? weeklyPlan.estimated_savings_cents : 0;
  var bestStore = stores.find(function (s) {
    return weeklyPlan && s.store_id === weeklyPlan.best_overall_store_id;
  });
  var bestStoreName = bestStore ? bestStore.store_name : '';
  var storeCount = stores.length;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Best stores for this plan</Text>
        <Text style={styles.sectionSubtitle}>
          {'Deals split across ' + storeCount + ' stores for maximum savings.'}
        </Text>
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Out of pocket</Text>
          <Text style={styles.summaryValue}>{formatCents(totalOOP)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Savings</Text>
          <Text style={[styles.summaryValue, { color: GREEN }]}>{formatCents(totalSavings)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Best Overall</Text>
          <Text style={styles.summaryValue}>{bestStoreName}</Text>
        </View>
      </View>

      {/* Filter bar */}
      <View style={styles.filterContainer}>
        <StoreFilterBar
          stores={stores}
          activeStoreId={activeStoreId}
          onFilterChange={setActiveStoreId}
        />
      </View>

      {/* Store cards */}
      {filteredStores.map(function (store) {
        var entry = grouped.get(store.store_id);
        var storeMeals = entry ? entry.meals.map(function (e) { return e.meal; }) : [];
        return (
          <StorePlanCard
            key={store.store_id}
            store={store}
            meals={storeMeals}
            onViewItems={function () {
              if (navigation) {
                navigation.navigate('StoreItemBreakdown', {
                  store: store,
                  meals: storeMeals,
                });
              }
            }}
          />
        );
      })}

      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: CREAM,
  },
  content: {
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: NAVY,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: GRAY,
    lineHeight: 18,
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: WHITE,
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: BORDER,
  },
  filterContainer: {
    marginBottom: 8,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  bottomPad: {
    height: 24,
  },
});

export default StorePlanTab;
