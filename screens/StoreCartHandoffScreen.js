import React, { useEffect } from 'react';
import {
  View,
  Text,
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
var CORAL  = '#fb5b5b';

var SEEDED_ITEMS = [
  { id: 'i1', name: 'Chicken breast', qty: '1.5 lbs', price_cents: 874, aisle: 'Meat', missing: false },
  { id: 'i2', name: 'Soy sauce', qty: '1 bottle', price_cents: 249, aisle: 'International', missing: false },
  { id: 'i3', name: 'Sesame oil', qty: '1 small bottle', price_cents: 399, aisle: 'International', missing: false },
  { id: 'i4', name: 'Green onions', qty: '1 bunch', price_cents: 150, aisle: 'Produce', missing: false },
];

function formatDollars(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function ItemRow(props) {
  var item = props.item;
  return (
    <View style={[styles.itemRow, item.missing && styles.itemRowMissing]}>
      <View style={styles.itemLeft}>
        <Text style={[styles.itemName, item.missing && styles.itemNameMissing]}>
          {item.name}
        </Text>
        <Text style={styles.itemQty}>{item.qty + '  |  ' + item.aisle}</Text>
      </View>
      <Text style={[styles.itemPrice, item.missing && styles.itemPriceMissing]}>
        {item.missing ? 'Not found' : formatDollars(item.price_cents)}
      </Text>
    </View>
  );
}

function SummaryStrip(props) {
  return (
    <View style={styles.summaryStrip}>
      <View style={styles.summaryPill}>
        <Feather name="list" size={13} color={GREEN} />
        <Text style={styles.summaryPillText}>{props.itemCount + ' items'}</Text>
      </View>
      <View style={styles.summaryPill}>
        <Feather name="dollar-sign" size={13} color={GREEN} />
        <Text style={styles.summaryPillText}>{'~' + formatDollars(props.totalCents) + ' total'}</Text>
      </View>
    </View>
  );
}

export default function StoreCartHandoffScreen(props) {
  var navigation = props.navigation;
  var params     = props.route ? props.route.params : {};
  var storeName  = params.storeName || 'Your Store';
  var routeItems = (params.items && params.items.length > 0) ? params.items : SEEDED_ITEMS;

  var missingItems  = routeItems.filter(function (it) { return it.missing; });
  var presentItems  = routeItems.filter(function (it) { return !it.missing; });
  var totalCents    = routeItems.reduce(function (acc, it) { return acc + (it.missing ? 0 : it.price_cents); }, 0);

  useEffect(function () {
    tracker.track('store_cart_handoff_viewed', { store_name: storeName, item_count: routeItems.length });
  }, []);

  function handleOpenStore() {
    tracker.track('store_app_opened', { store_name: storeName });
    var urls = { Aldi: 'https://www.aldi.us', Publix: 'https://www.publix.com/shop-online', Walmart: 'https://www.walmart.com/grocery/pickup' };
    var url = urls[storeName] || 'https://www.google.com/search?q=' + encodeURIComponent(storeName + ' grocery pickup');
    Linking.openURL(url).catch(function (err) {
      console.log('Could not open store URL', err);
    });
  }

  function handleCopyList() {
    tracker.track('store_list_copied', { store_name: storeName });
    var text = storeName + ' Pickup List\n' +
      routeItems.map(function (it) { return '- ' + it.name + ' (' + it.qty + ')'; }).join('\n');
    try {
      var Clipboard = require('@react-native-clipboard/clipboard').default;
      Clipboard.setString(text);
    } catch (e) {
      console.log('Clipboard not available — list text:\n' + text);
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

      <FlatList
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        data={routeItems}
        keyExtractor={function (item) { return item.id; }}
        ListHeaderComponent={
          <View>
            {/* Back + nav title */}
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
              <Feather name="arrow-left" size={20} color={NAVY} />
            </TouchableOpacity>
            <Text style={styles.navTitle}>Pickup List Ready</Text>

            {/* Headline */}
            <Text style={styles.headline}>Your pickup list is ready.</Text>
            <Text style={styles.sub}>
              {'Bring this to ' + storeName + ' or open their app to complete your order.'}
            </Text>

            <SummaryStrip itemCount={routeItems.length} totalCents={totalCents} />

            <Text style={styles.sectionLabel}>ITEMS</Text>
          </View>
        }
        renderItem={function (info) {
          return <ItemRow item={info.item} />;
        }}
        ItemSeparatorComponent={function () { return <View style={styles.itemDivider} />; }}
        ListFooterComponent={
          <View>
            {/* Missing items section */}
            {missingItems.length > 0 && (
              <View style={styles.missingSection}>
                <Text style={styles.missingSectionLabel}>MISSING ITEMS</Text>
                {missingItems.map(function (item) {
                  return <ItemRow key={item.id} item={item} />;
                })}
              </View>
            )}

            {/* Bottom actions */}
            <View style={styles.bottomActions}>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleOpenStore} activeOpacity={0.88}>
                <Feather name="external-link" size={15} color={WHITE} />
                <Text style={styles.primaryBtnText}>Open Store App</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.outlineBtn} onPress={handleCopyList} activeOpacity={0.82}>
                <Feather name="copy" size={14} color={GREEN} />
                <Text style={styles.outlineBtnText}>Copy List</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={function () { navigation.navigate('ShoppingList'); }}
                activeOpacity={0.75}
              >
                <Text style={styles.linkBtnText}>Shopping list in Snippd</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
      />
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

  summaryStrip: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  summaryPill: {
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
  summaryPillText: { fontSize: 13, fontWeight: '700', color: GREEN },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: GRAY,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WHITE,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  itemRowMissing: { backgroundColor: '#FFF5F5' },
  itemLeft:  { flex: 1, marginRight: 12 },
  itemName:  { fontSize: 14, fontWeight: '600', color: NAVY, marginBottom: 2 },
  itemNameMissing: { color: CORAL },
  itemQty:   { fontSize: 12, color: GRAY },
  itemPrice: { fontSize: 14, fontWeight: '700', color: NAVY },
  itemPriceMissing: { fontSize: 12, fontWeight: '700', color: CORAL },

  itemDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 4, marginVertical: 2 },

  missingSection: { marginTop: 24 },
  missingSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: CORAL,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  bottomActions: { marginTop: 28, gap: 10 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 15,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },

  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: GREEN,
    paddingVertical: 13,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700', color: GREEN },

  linkBtn: { alignItems: 'center', paddingVertical: 10 },
  linkBtnText: { fontSize: 13, color: GRAY, textDecorationLine: 'underline' },
});
