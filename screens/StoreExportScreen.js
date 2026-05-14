import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import StoreHandoffCard from '../src/components/store/StoreHandoffCard';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';

var SEEDED_STORES = [
  {
    store_id:               'aldi_001',
    store_name:             'Aldi',
    item_count:             14,
    estimated_total_cents:  4820,
    savings_cents:          760,
    supports_label:         'Pickup available. Estimated ready in 2 hours.',
  },
  {
    store_id:               'publix_001',
    store_name:             'Publix',
    item_count:             8,
    estimated_total_cents:  3140,
    savings_cents:          290,
    supports_label:         'Pickup and delivery available via Publix app.',
  },
  {
    store_id:               'walmart_001',
    store_name:             'Walmart',
    item_count:             6,
    estimated_total_cents:  2280,
    savings_cents:          0,
    supports_label:         'Grocery pickup ready in 1 hour.',
  },
];

var UBER_EATS_STORE = {
  store_id:   'uber_sandbox',
  store_name: 'Uber Eats',
};

function StoreExportScreen(props) {
  var navigation = props.navigation;

  function handleBack() {
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  function handleViewList(store) {
    navigation.navigate('ShoppingList', { storeId: store.store_id, storeName: store.store_name });
  }

  function handleUberEats() {
    navigation.navigate('UberEatsHandoff', { optionType: 'uber_eats_pickup', score: 62 });
  }

  var totalItems  = SEEDED_STORES.reduce(function (s, st) { return s + st.item_count; }, 0);
  var totalSaving = SEEDED_STORES.reduce(function (s, st) { return s + st.savings_cents; }, 0);
  var totalCost   = SEEDED_STORES.reduce(function (s, st) { return s + st.estimated_total_cents; }, 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Your Store Lists</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalItems}</Text>
          <Text style={styles.summaryLabel}>Total items</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{'$' + (totalCost / 100).toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Est. total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, styles.savingsValue]}>
            {'$' + (totalSaving / 100).toFixed(2)}
          </Text>
          <Text style={styles.summaryLabel}>Saved</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.sectionLabel}>Grocery stores</Text>

        {SEEDED_STORES.map(function (store) {
          return (
            <StoreHandoffCard
              key={store.store_id}
              store={store}
              isUberEats={false}
              onViewList={function () { handleViewList(store); }}
            />
          );
        })}

        <Text style={styles.sectionLabel}>Eat out options</Text>

        <StoreHandoffCard
          store={UBER_EATS_STORE}
          isUberEats={true}
          onViewList={handleUberEats}
        />

        <View style={styles.infoCard}>
          <Feather name="info" size={14} color={GRAY} style={{ marginTop: 1 }} />
          <Text style={styles.infoText}>
            Lists are synced with your weekly plan. Snippd routes each item to the store with the best price after clipping.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: CREAM },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: WHITE,
    borderWidth: 1, borderColor: BORDER,
  },
  navTitle: { fontSize: 17, fontWeight: '700', color: NAVY },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: WHITE,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: BORDER, marginVertical: 4 },
  summaryValue:   { fontSize: 18, fontWeight: '800', color: NAVY, marginBottom: 2 },
  savingsValue:   { color: GREEN },
  summaryLabel:   { fontSize: 11, color: GRAY, fontWeight: '500' },
  scroll: { paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 4,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginTop: 6,
  },
  infoText: { flex: 1, fontSize: 13, color: GRAY, lineHeight: 18 },
});

export default StoreExportScreen;
