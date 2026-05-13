import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { formatCents } from '../src/utils/weeklyPlan/formatMoney';

var CREAM = '#FAF8F1';
var NAVY = '#172250';
var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var WHITE = '#FFFFFF';
var BORDER = '#E5E7EB';
var MINT = '#E8F5E9';
var CORAL = '#fb5b5b';

// Seeded item data — one entry per store
var SEEDED_ITEMS = {
  publix: [
    { item_id: 'px_01', product_name: 'Publix Pasta Sauce (24oz)', meal_association: 'Monday Dinner', estimated_price_cents: 329, coupon_info: 'BOGO — Buy one get one free', has_coupon: true },
    { item_id: 'px_02', product_name: 'Deli Turkey Breast (1 lb)', meal_association: 'Monday Lunch', estimated_price_cents: 699, coupon_info: 'BOGO this week', has_coupon: true },
    { item_id: 'px_03', product_name: 'Chicken Breast (2 lb pack)', meal_association: 'Tuesday Dinner', estimated_price_cents: 799, coupon_info: null, has_coupon: false },
    { item_id: 'px_04', product_name: 'Penne Pasta (16oz)', meal_association: 'Monday Dinner', estimated_price_cents: 189, coupon_info: 'BOGO — Buy one get one free', has_coupon: true },
    { item_id: 'px_05', product_name: 'Feta Cheese (6oz)', meal_association: 'Thursday Lunch', estimated_price_cents: 399, coupon_info: '$1.00 off coupon', has_coupon: true },
    { item_id: 'px_06', product_name: 'Atlantic Salmon Fillets (1.5 lb)', meal_association: 'Thursday Dinner', estimated_price_cents: 1099, coupon_info: null, has_coupon: false },
    { item_id: 'px_07', product_name: 'Tikka Masala Sauce (15oz)', meal_association: 'Friday Dinner', estimated_price_cents: 399, coupon_info: '$0.75 off this week', has_coupon: true },
    { item_id: 'px_08', product_name: 'Pork Spare Ribs (3 lb)', meal_association: 'Saturday Dinner', estimated_price_cents: 1199, coupon_info: 'BOGO Weekend Special', has_coupon: true },
    { item_id: 'px_09', product_name: 'Romaine Lettuce (3-pack)', meal_association: 'Monday Lunch, Sunday Lunch', estimated_price_cents: 349, coupon_info: null, has_coupon: false },
    { item_id: 'px_10', product_name: 'Deli Ham (1 lb)', meal_association: 'Saturday Lunch', estimated_price_cents: 599, coupon_info: 'BOGO this week', has_coupon: true },
    { item_id: 'px_11', product_name: 'Kalamata Olives (8oz)', meal_association: 'Thursday Lunch', estimated_price_cents: 349, coupon_info: '$0.50 off', has_coupon: true },
    { item_id: 'px_12', product_name: 'Asparagus (1 bunch)', meal_association: 'Thursday Dinner', estimated_price_cents: 299, coupon_info: null, has_coupon: false },
    { item_id: 'px_13', product_name: 'Cherry Tomatoes (1 pint)', meal_association: 'Thursday Dinner', estimated_price_cents: 349, coupon_info: null, has_coupon: false },
    { item_id: 'px_14', product_name: 'Baby Potatoes (2 lb)', meal_association: 'Thursday Dinner', estimated_price_cents: 299, coupon_info: null, has_coupon: false },
    { item_id: 'px_15', product_name: 'Naan Bread (pack of 4)', meal_association: 'Friday Dinner', estimated_price_cents: 389, coupon_info: null, has_coupon: false },
    { item_id: 'px_16', product_name: 'Basmati Rice (2 lb)', meal_association: 'Tuesday Dinner, Friday Dinner', estimated_price_cents: 349, coupon_info: null, has_coupon: false },
    { item_id: 'px_17', product_name: 'BBQ Sauce (18oz)', meal_association: 'Saturday Dinner', estimated_price_cents: 269, coupon_info: null, has_coupon: false },
    { item_id: 'px_18', product_name: 'Corn on the Cob (4-pack)', meal_association: 'Saturday Dinner', estimated_price_cents: 299, coupon_info: null, has_coupon: false },
  ],
  aldi: [
    { item_id: 'al_01', product_name: 'Steel Cut Oats (2 lb)', meal_association: 'Monday Breakfast', estimated_price_cents: 249, coupon_info: null, has_coupon: false },
    { item_id: 'al_02', product_name: 'Bananas (bunch)', meal_association: 'Monday Breakfast', estimated_price_cents: 69, coupon_info: null, has_coupon: false },
    { item_id: 'al_03', product_name: 'Plain Whole Milk Yogurt (32oz)', meal_association: 'Monday Breakfast, Wednesday Breakfast', estimated_price_cents: 349, coupon_info: null, has_coupon: false },
    { item_id: 'al_04', product_name: 'Large Eggs (dozen)', meal_association: 'Tuesday Breakfast, Saturday Breakfast', estimated_price_cents: 299, coupon_info: null, has_coupon: false },
    { item_id: 'al_05', product_name: 'Whole Wheat Bread (20oz)', meal_association: 'Tuesday Breakfast, Friday Breakfast', estimated_price_cents: 189, coupon_info: null, has_coupon: false },
    { item_id: 'al_06', product_name: 'Sliced American Cheese (12oz)', meal_association: 'Tuesday Lunch', estimated_price_cents: 219, coupon_info: null, has_coupon: false },
    { item_id: 'al_07', product_name: 'Canned Tomato Soup (10.75oz x2)', meal_association: 'Tuesday Lunch, Saturday Lunch', estimated_price_cents: 179, coupon_info: null, has_coupon: false },
    { item_id: 'al_08', product_name: 'Greek Yogurt Plain (32oz)', meal_association: 'Wednesday Breakfast', estimated_price_cents: 379, coupon_info: null, has_coupon: false },
    { item_id: 'al_09', product_name: 'Granola (12oz)', meal_association: 'Wednesday Breakfast', estimated_price_cents: 299, coupon_info: null, has_coupon: false },
    { item_id: 'al_10', product_name: 'Mixed Berries Frozen (12oz)', meal_association: 'Wednesday Breakfast', estimated_price_cents: 279, coupon_info: null, has_coupon: false },
    { item_id: 'al_11', product_name: 'Ground Beef 80/20 (2 lb)', meal_association: 'Monday Dinner', estimated_price_cents: 799, coupon_info: null, has_coupon: false },
    { item_id: 'al_12', product_name: 'Spinach (5oz bag)', meal_association: 'Saturday Breakfast', estimated_price_cents: 199, coupon_info: null, has_coupon: false },
    { item_id: 'al_13', product_name: 'Mushrooms (8oz)', meal_association: 'Saturday Breakfast', estimated_price_cents: 179, coupon_info: null, has_coupon: false },
    { item_id: 'al_14', product_name: 'Caesar Salad Kit', meal_association: 'Sunday Lunch', estimated_price_cents: 349, coupon_info: null, has_coupon: false },
  ],
  walmart: [
    { item_id: 'wm_01', product_name: 'Great Value Canned Tuna (5oz x3)', meal_association: 'Wednesday Lunch', estimated_price_cents: 399, coupon_info: null, has_coupon: false },
    { item_id: 'wm_02', product_name: 'Flour Tortillas (10-pack)', meal_association: 'Wednesday Lunch, Monday Lunch', estimated_price_cents: 249, coupon_info: null, has_coupon: false },
    { item_id: 'wm_03', product_name: 'Thick-Cut Bacon (16oz)', meal_association: 'Friday Lunch', estimated_price_cents: 599, coupon_info: null, has_coupon: false },
    { item_id: 'wm_04', product_name: 'Kettle Chips (8oz)', meal_association: 'Friday Lunch', estimated_price_cents: 319, coupon_info: null, has_coupon: false },
    { item_id: 'wm_05', product_name: 'Sourdough Bread (24oz)', meal_association: 'Friday Lunch, Sunday Breakfast', estimated_price_cents: 349, coupon_info: null, has_coupon: false },
    { item_id: 'wm_06', product_name: 'Hass Avocados (4-pack)', meal_association: 'Sunday Breakfast', estimated_price_cents: 499, coupon_info: null, has_coupon: false },
    { item_id: 'wm_07', product_name: 'Chuck Roast (3 lb)', meal_association: 'Sunday Dinner', estimated_price_cents: 1099, coupon_info: null, has_coupon: false },
    { item_id: 'wm_08', product_name: 'Baby Carrots (2 lb)', meal_association: 'Sunday Dinner', estimated_price_cents: 199, coupon_info: null, has_coupon: false },
  ],
};

function renderItemRow(item, cartItems, onToggle) {
  var inCart = cartItems[item.item_id] || false;
  return (
    <View key={item.item_id} style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <Text style={styles.productName}>{item.product_name}</Text>
        <Text style={styles.mealAssoc}>{item.meal_association}</Text>
        {item.has_coupon && item.coupon_info ? (
          <View style={styles.couponBadge}>
            <Text style={styles.couponText}>{item.coupon_info}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.itemPrice}>{formatCents(item.estimated_price_cents)}</Text>
        <TouchableOpacity
          style={[styles.itemToggle, inCart && styles.itemToggleActive]}
          onPress={function () { onToggle(item.item_id); }}
          activeOpacity={0.75}
        >
          <Feather name={inCart ? 'check' : 'plus'} size={16} color={inCart ? WHITE : GREEN} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StoreItemBreakdownScreen(props) {
  var navigation = props.navigation;
  var params = props.route ? props.route.params : {};
  var store = params.store || {};
  var passedMeals = params.meals || [];

  var [cartItems, setCartItems] = useState({});

  var storeId = store.store_id || 'publix';
  var items = SEEDED_ITEMS[storeId] || [];

  function handleBack() {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  function handleToggle(itemId) {
    setCartItems(function (prev) {
      var next = Object.assign({}, prev);
      next[itemId] = !prev[itemId];
      return next;
    });
  }

  var addedCount = Object.values(cartItems).filter(Boolean).length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{(store.store_name || 'Store') + ' Items'}</Text>
        <View style={styles.navPlaceholder} />
      </View>

      {/* Store summary */}
      <View style={styles.storeSummary}>
        <View style={styles.summaryLeft}>
          <View style={styles.initialBadge}>
            <Text style={styles.initialText}>{store.store_initial || 'ST'}</Text>
          </View>
          <View style={styles.summaryInfo}>
            <Text style={styles.storeRole} numberOfLines={2}>{store.store_role || ''}</Text>
            <Text style={styles.summaryMeta}>
              {items.length + ' items  |  Est. ' + formatCents(store.store_total_cents || 0)}
            </Text>
          </View>
        </View>
        {(store.store_savings_cents || 0) > 0 && (
          <View style={styles.savingsChip}>
            <Text style={styles.savingsChipText}>{'Save ' + formatCents(store.store_savings_cents)}</Text>
          </View>
        )}
      </View>

      {/* Items list */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.listHeader}>
          {items.length + ' items for this week'}
        </Text>

        {items.map(function (item) {
          return renderItemRow(item, cartItems, handleToggle);
        })}

        {/* Add all button */}
        <View style={styles.ctaSection}>
          <TouchableOpacity
            style={styles.ctaPrimary}
            activeOpacity={0.8}
            onPress={function () {
              var next = {};
              items.forEach(function (item) { next[item.item_id] = true; });
              setCartItems(next);
            }}
          >
            <Text style={styles.ctaPrimaryText}>
              {addedCount > 0
                ? addedCount + ' of ' + items.length + ' added'
                : 'Add All ' + items.length + ' Items'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CREAM,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CREAM,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: NAVY,
  },
  navPlaceholder: {
    width: 40,
  },
  storeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WHITE,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
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
    fontSize: 13,
    fontWeight: '800',
    color: GREEN,
  },
  summaryInfo: {
    flex: 1,
  },
  storeRole: {
    fontSize: 13,
    color: NAVY,
    fontWeight: '500',
    lineHeight: 17,
    marginBottom: 2,
  },
  summaryMeta: {
    fontSize: 12,
    color: GRAY,
  },
  savingsChip: {
    backgroundColor: '#E6F7EE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
  },
  savingsChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: GREEN,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  listHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: NAVY,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginBottom: 8,
  },
  itemInfo: {
    flex: 1,
    marginRight: 10,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: NAVY,
    marginBottom: 2,
  },
  mealAssoc: {
    fontSize: 12,
    color: GRAY,
    marginBottom: 4,
  },
  couponBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  couponText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E65100',
  },
  itemRight: {
    alignItems: 'center',
    gap: 6,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: NAVY,
  },
  itemToggle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
  },
  itemToggleActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  ctaSection: {
    marginTop: 12,
  },
  ctaPrimary: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  bottomPad: {
    height: 24,
  },
});

export default StoreItemBreakdownScreen;
