import React, { useState, useEffect } from 'react';
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
var CORAL  = '#fb5b5b';

var SEEDED_STORES = [
  {
    store_id: 'aldi',
    store_name: 'Aldi',
    estimated_total_cents: 3240,
    item_count: 8,
    meals_supported: 3,
    estimated_savings_cents: 890,
    pickup_available: true,
    distance_label: '1.2 miles',
    icon: 'shopping-bag',
    pickup_url: 'https://www.aldi.us',
  },
  {
    store_id: 'publix',
    store_name: 'Publix',
    estimated_total_cents: 4180,
    item_count: 8,
    meals_supported: 3,
    estimated_savings_cents: 420,
    pickup_available: true,
    distance_label: '0.8 miles',
    icon: 'shopping-cart',
    pickup_url: 'https://www.publix.com/shop-online',
  },
  {
    store_id: 'walmart',
    store_name: 'Walmart',
    estimated_total_cents: 3580,
    item_count: 8,
    meals_supported: 3,
    estimated_savings_cents: 650,
    pickup_available: true,
    distance_label: '2.1 miles',
    icon: 'package',
    pickup_url: 'https://www.walmart.com/grocery/pickup',
  },
];

var BEST_VALUE_ID = (function () {
  var min = SEEDED_STORES[0];
  for (var i = 1; i < SEEDED_STORES.length; i++) {
    if (SEEDED_STORES[i].estimated_total_cents < min.estimated_total_cents) {
      min = SEEDED_STORES[i];
    }
  }
  return min.store_id;
})();

function formatDollars(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function StoreCard(props) {
  var store      = props.store;
  var isSelected = props.isSelected;
  var onSelect   = props.onSelect;

  return (
    <TouchableOpacity
      style={[styles.storeCard, isSelected && styles.storeCardSelected]}
      onPress={onSelect}
      activeOpacity={0.78}
    >
      {/* Top row */}
      <View style={styles.storeCardTop}>
        <View style={styles.storeNameRow}>
          <View style={styles.storeIconWrap}>
            <Feather name={store.icon} size={18} color={GREEN} />
          </View>
          <Text style={styles.storeName}>{store.store_name}</Text>
        </View>
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceBadgeText}>{store.distance_label}</Text>
        </View>
      </View>

      {/* Price */}
      <Text style={styles.storePrice}>{'~' + formatDollars(store.estimated_total_cents)}</Text>

      {/* Details */}
      <Text style={styles.storeDetails}>
        {store.item_count + ' items  |  ' + store.meals_supported + ' meals covered'}
      </Text>

      {/* Savings */}
      {store.estimated_savings_cents > 0 && (
        <Text style={styles.storeSavings}>
          {'Save ~' + formatDollars(store.estimated_savings_cents) + ' vs list price'}
        </Text>
      )}

      {/* Pickup badge */}
      {store.pickup_available && (
        <View style={styles.pickupBadge}>
          <View style={styles.pickupDot} />
          <Text style={styles.pickupBadgeText}>Pickup available</Text>
        </View>
      )}

      {/* Select button */}
      {isSelected ? (
        <View style={styles.selectedBtn}>
          <Feather name="check" size={14} color={WHITE} />
          <Text style={styles.selectedBtnText}>Selected</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.outlineBtn} onPress={onSelect} activeOpacity={0.82}>
          <Text style={styles.outlineBtnText}>{'Continue with ' + store.store_name}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function CtaPanel(props) {
  var store    = props.store;
  var onOpen   = props.onOpen;
  var onCopy   = props.onCopy;

  return (
    <View style={styles.ctaPanel}>
      <Text style={styles.ctaPanelHeadline}>
        {'Your list is ready for ' + store.store_name + '.'}
      </Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={onOpen} activeOpacity={0.88}>
        <Feather name="external-link" size={15} color={WHITE} />
        <Text style={styles.primaryBtnText}>Open Store App</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.outlineBtn} onPress={onCopy} activeOpacity={0.82}>
        <Feather name="copy" size={14} color={GREEN} />
        <Text style={styles.outlineBtnText}>Copy Shopping List</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function StorePickupHandoffScreen(props) {
  var navigation = props.navigation;

  var [selectedStore, setSelectedStore] = useState(null);

  useEffect(function () {
    tracker.track('store_pickup_handoff_viewed', {});
  }, []);

  function handleSelectStore(store) {
    setSelectedStore(store);
    tracker.track('store_pickup_store_selected', {
      store_id: store.store_id,
      estimated_total_cents: store.estimated_total_cents,
    });
  }

  function handleOpenStore() {
    if (!selectedStore) return;
    tracker.track('store_pickup_opened', { store_id: selectedStore.store_id });
    Linking.openURL(selectedStore.pickup_url).catch(function (err) {
      console.log('Could not open store URL', err);
    });
  }

  function handleCopyList() {
    tracker.track('store_list_copied', { store_id: selectedStore ? selectedStore.store_id : null });
    var itemList = 'Snippd Shopping List\n' +
      SEEDED_STORES.map(function (s) { return '- ' + s.store_name + ' (' + s.item_count + ' items)'; }).join('\n');
    try {
      var Clipboard = require('@react-native-clipboard/clipboard').default;
      Clipboard.setString(itemList);
    } catch (e) {
      console.log('Clipboard not available — list text:\n' + itemList);
    }
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

        {/* Back + title */}
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Choose Pickup Store</Text>

        {/* Headline */}
        <Text style={styles.headline}>Choose your pickup store.</Text>
        <Text style={styles.sub}>
          Snippd grouped your items by store so you can complete pickup faster.
        </Text>

        {/* Store cards */}
        {SEEDED_STORES.map(function (store) {
          var isBest = store.store_id === BEST_VALUE_ID;
          return (
            <View key={store.store_id} style={styles.storeCardWrap}>
              {isBest && (
                <View style={styles.bestValueBadge}>
                  <Text style={styles.bestValueBadgeText}>Best value</Text>
                </View>
              )}
              <StoreCard
                store={store}
                isSelected={selectedStore && selectedStore.store_id === store.store_id}
                onSelect={function () { handleSelectStore(store); }}
              />
            </View>
          );
        })}

        {/* CTA panel */}
        {selectedStore && (
          <CtaPanel
            store={selectedStore}
            onOpen={handleOpenStore}
            onCopy={handleCopyList}
          />
        )}

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
    marginBottom: 24,
  },

  storeCardWrap:   { marginBottom: 16 },
  bestValueBadge:  {
    alignSelf: 'flex-start',
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
  bestValueBadgeText: { fontSize: 11, fontWeight: '800', color: WHITE },

  storeCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 16,
  },
  storeCardSelected: { borderColor: GREEN },

  storeCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  storeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  storeIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: MINT,
    alignItems: 'center', justifyContent: 'center',
  },
  storeName: { fontSize: 16, fontWeight: '700', color: NAVY },

  distanceBadge: {
    backgroundColor: MINT,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  distanceBadgeText: { fontSize: 11, color: GREEN, fontWeight: '600' },

  storePrice:   { fontSize: 20, fontWeight: '800', color: NAVY, marginBottom: 4 },
  storeDetails: { fontSize: 13, color: GRAY, marginBottom: 6 },
  storeSavings: { fontSize: 13, fontWeight: '700', color: GREEN, marginBottom: 8 },

  pickupBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  pickupDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  pickupBadgeText: { fontSize: 12, color: GREEN, fontWeight: '600' },

  selectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 12,
  },
  selectedBtnText: { fontSize: 14, fontWeight: '700', color: WHITE },

  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: GREEN,
    paddingVertical: 12,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700', color: GREEN },

  ctaPanel: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    marginTop: 4,
  },
  ctaPanelHeadline: {
    fontSize: 16,
    fontWeight: '700',
    color: NAVY,
    marginBottom: 16,
    textAlign: 'center',
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 10,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },
});
