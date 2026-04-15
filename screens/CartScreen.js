/**
 * CartScreen — Personal cart + optional shared household cart.
 *
 * Primary: items from AsyncStorage key 'snippd_cart'
 *   (written by WeeklyPlanScreen "Lock in" and DiscoverScreen "Add to cart").
 *
 * Secondary: household_cart_items from Supabase (if household exists).
 *
 * "Verify Receipt" → ReceiptUpload screen.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
  StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';

// ── Constants ──────────────────────────────────────────────────────
const CART_KEY    = 'snippd_cart';

const GREEN       = '#0C9E54';
const FOREST      = '#0C7A3D';
const NAVY        = '#0D1B4B';
const WHITE       = '#FFFFFF';
const GRAY        = '#8A8F9E';
const OFF_WHITE   = '#F8F9FA';
const PALE_GREEN  = '#F0FDF4';
const LIGHT_GREEN = '#E8F8F0';
const BORDER      = '#E2E8F0';
const RED         = '#EF4444';
const AMBER       = '#F59E0B';
const PURPLE      = '#A855F7';

const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

// ── Deal-type badge colours ────────────────────────────────────────
const DEAL_BADGE = {
  BOGO:                { bg: '#DCFCE7', text: '#15803D', label: 'BOGO' },
  SALE:                { bg: '#DBEAFE', text: '#1D4ED8', label: 'SALE' },
  DIGITAL_COUPON:      { bg: '#EDE9FE', text: '#6D28D9', label: 'DIGITAL' },
  LOYALTY_PRICE:       { bg: '#FEF3C7', text: '#92400E', label: 'LOYALTY' },
  MANUFACTURER_COUPON: { bg: '#FCE7F3', text: '#9D174D', label: 'MFR' },
  MULTI:               { bg: '#FEE2E2', text: '#B91C1C', label: 'MULTI' },
};

function DealBadge({ dealType }) {
  if (!dealType) return null;
  const cfg = DEAL_BADGE[dealType];
  if (!cfg) return null;
  return (
    <View style={[s.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[s.badgeTxt, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Cart math helpers ──────────────────────────────────────────────
function computeBogoPrice(item) {
  // BOGO: customer pays for one, gets two.
  // sale_cents should already be the per-unit price; we display qty=2.
  const unitCents = item.sale_cents || item.reg_cents || 0;
  return {
    quantity:     2,
    youPayCents:  unitCents,                         // pay for 1
    regTotalCents: (item.reg_cents || unitCents) * 2, // would cost 2× regular
    savingsCents:  item.reg_cents || unitCents,       // save 1 unit
    savingsPct:    50,                               // always 50%
  };
}

function computeItemTotals(item) {
  if (item.deal_type === 'BOGO') return computeBogoPrice(item);
  const qty         = Math.max(1, item.quantity || 1);
  const saleCents   = item.sale_cents || item.reg_cents || 0;
  const regCents    = item.reg_cents  || item.sale_cents || 0;
  return {
    quantity:      qty,
    youPayCents:   saleCents * qty,
    regTotalCents: regCents  * qty,
    savingsCents:  Math.max(0, regCents - saleCents) * qty,
    savingsPct:    regCents > 0
      ? Math.round(((regCents - saleCents) / regCents) * 100)
      : 0,
  };
}

// ── Personal cart item row ─────────────────────────────────────────
function PersonalItemRow({ item, onRemove }) {
  const totals = computeItemTotals(item);
  const isBogo = item.deal_type === 'BOGO';

  return (
    <View style={s.itemRow}>
      <View style={s.itemMain}>
        <View style={s.itemTopRow}>
          <Text style={s.itemName} numberOfLines={2}>
            {item.product_name || item.name}
            {totals.quantity > 1 ? `  ×${totals.quantity}` : ''}
          </Text>
          <TouchableOpacity
            style={s.removeBtn}
            onPress={() => onRemove(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={13} color={GRAY} />
          </TouchableOpacity>
        </View>

        <View style={s.itemMeta}>
          {item.retailer || item.retailer_key ? (
            <Text style={s.retailerTxt}>{item.retailer || item.retailer_key}</Text>
          ) : null}
          <DealBadge dealType={item.deal_type} />
          {item.day ? (
            <Text style={s.dayTxt}>{item.day}</Text>
          ) : null}
        </View>

        {isBogo && (
          <Text style={s.bogoNote}>Buy 2 — second is free</Text>
        )}
      </View>

      <View style={s.itemPricing}>
        {totals.regTotalCents > totals.youPayCents ? (
          <Text style={s.strikePrice}>{fmt(totals.regTotalCents)}</Text>
        ) : null}
        <Text style={s.salePrice}>{fmt(totals.youPayCents)}</Text>
        {totals.savingsCents > 0 ? (
          <View style={s.saveBadge}>
            <Text style={s.saveTxt}>save {fmt(totals.savingsCents)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── Cart totals ────────────────────────────────────────────────────
function computeCartTotals(items) {
  let regularTotal  = 0;
  let youPay        = 0;
  let atRegisterSav = 0;

  for (const item of items) {
    const t = computeItemTotals(item);
    regularTotal  += t.regTotalCents;
    youPay        += t.youPayCents;
    atRegisterSav += t.savingsCents;
  }

  const trueFinal    = youPay; // no rebates modelled yet
  const totalSavings = Math.max(0, regularTotal - trueFinal);
  const savingsPct   = regularTotal > 0
    ? ((totalSavings / regularTotal) * 100).toFixed(1)
    : '0.0';

  return {
    regularTotal,
    atRegisterSavings: atRegisterSav,
    youPay,
    trueFinal,
    totalSavings,
    savingsPct,
  };
}

// ── Coupon checklist ───────────────────────────────────────────────
function CouponChecklist({ items }) {
  const couponItems = items.filter(i =>
    i.deal_type === 'DIGITAL_COUPON' || i.deal_type === 'MANUFACTURER_COUPON'
  );
  if (couponItems.length === 0) return null;

  return (
    <View style={s.checklistCard}>
      <Text style={s.checklistTitle}>BEFORE YOU CHECKOUT</Text>
      {couponItems.map((item, i) => {
        const totals = computeItemTotals(item);
        return (
          <View key={i} style={s.checklistRow}>
            <Feather name="square" size={14} color={FOREST} />
            <Text style={s.checklistTxt}>
              Clip coupon for {item.product_name || item.name}
              {totals.savingsCents > 0 ? ` — saves ${fmt(totals.savingsCents)}` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────
export default function CartScreen({ navigation }) {
  const [personalItems, setPersonalItems] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  // ── Load cart from AsyncStorage ──────────────────────────────────
  const loadCart = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(CART_KEY);
      const items = raw ? JSON.parse(raw) : [];
      setPersonalItems(Array.isArray(items) ? items : []);
    } catch {
      setPersonalItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadCart(); }, [loadCart]);

  const onRefresh = () => { setRefreshing(true); loadCart(); };

  // ── Remove single item ───────────────────────────────────────────
  const removeItem = useCallback(async (item) => {
    const updated = personalItems.filter(i => i.id !== item.id);
    setPersonalItems(updated);
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(updated));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        tracker.trackItemRemovedFromCart({
          user_id: session.user.id,
          session_id: session.access_token || String(Date.now()),
          screen_name: 'CartScreen',
          product_name: item.product_name || item.name,
          item_id: item.id,
          quantity: item.quantity || 1,
          price_cents: item.sale_cents || 0,
          retailer: item.retailer || item.retailer_key,
        });
      }
    } catch { /* tracking failure is non-critical */ }
  }, [personalItems]);

  // ── Clear entire cart ────────────────────────────────────────────
  const clearCart = () => {
    Alert.alert(
      'Clear Cart',
      'Remove all items from your cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setPersonalItems([]);
            await AsyncStorage.removeItem(CART_KEY);
          },
        },
      ]
    );
  };

  const totals = computeCartTotals(personalItems);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  // ── Empty state ──────────────────────────────────────────────────
  if (personalItems.length === 0) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={s.header}>
          <Text style={s.headerTitle}>Your Cart</Text>
          <View style={s.headerRight} />
        </View>
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}>
            <Feather name="shopping-cart" size={32} color={GREEN} />
          </View>
          <Text style={s.emptyTitle}>Cart is empty</Text>
          <Text style={s.emptySub}>
            Lock in your weekly plan or add deals from Explore to fill your cart.
          </Text>
          <TouchableOpacity
            style={s.emptyBtn}
            onPress={() => navigation.getParent()?.navigate('PlanTab')}
          >
            <Text style={s.emptyBtnTxt}>View Weekly Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.emptyBtn, { backgroundColor: WHITE, borderWidth: 1.5, borderColor: GREEN, marginTop: 10 }]}
            onPress={() => navigation.getParent()?.navigate('DiscoverTab')}
          >
            <Text style={[s.emptyBtnTxt, { color: GREEN }]}>Browse Deals</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loaded state ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Your Cart</Text>
          <Text style={s.headerSub}>{personalItems.length} item{personalItems.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.clearBtn} onPress={clearCart}>
            <Text style={s.clearBtnTxt}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => navigation.getParent()?.navigate('DiscoverTab')}
          >
            <Feather name="plus" size={18} color={WHITE} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary bar */}
      <View style={s.summaryBar}>
        <View style={s.summaryItem}>
          <Text style={s.summaryVal}>{fmt(totals.youPay)}</Text>
          <Text style={s.summaryLabel}>YOU PAY</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: '#4ADE80' }]}>{fmt(totals.totalSavings)}</Text>
          <Text style={s.summaryLabel}>SAVING</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryVal}>{totals.savingsPct}%</Text>
          <Text style={s.summaryLabel}>OFF REGULAR</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
      >

        {/* Item list */}
        <View style={s.sectionCard}>
          {personalItems.map((item, i) => (
            <View key={item.id || i}>
              <PersonalItemRow item={item} onRemove={removeItem} />
              {i < personalItems.length - 1 && <View style={s.itemSep} />}
            </View>
          ))}
        </View>

        {/* Coupon checklist */}
        <CouponChecklist items={personalItems} />

        {/* Totals receipt */}
        <View style={s.receiptCard}>
          <Text style={s.receiptTitle}>ORDER SUMMARY</Text>

          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>Regular total</Text>
            <Text style={[s.receiptVal, s.strikeVal]}>{fmt(totals.regularTotal)}</Text>
          </View>

          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>At-register savings</Text>
            <Text style={[s.receiptVal, { color: GREEN }]}>−{fmt(totals.atRegisterSavings)}</Text>
          </View>

          <View style={[s.receiptRow, s.receiptRowBig]}>
            <Text style={s.receiptLabelBig}>You pay at register</Text>
            <Text style={s.receiptValBig}>{fmt(totals.youPay)}</Text>
          </View>

          <View style={s.receiptDivider} />

          <View style={[s.receiptRow, s.receiptRowTotal]}>
            <Text style={s.receiptTotalLabel}>True cost</Text>
            <Text style={s.receiptTotalVal}>{fmt(totals.trueFinal)}</Text>
          </View>

          <Text style={s.withoutSnippd}>
            Without Snippd: <Text style={s.withoutSnippdStrike}>{fmt(totals.regularTotal)}</Text>
          </Text>
        </View>

        {/* Verify receipt button */}
        <TouchableOpacity
          style={s.verifyBtn}
          onPress={() =>
            navigation.navigate('ReceiptUpload', {
              cartItems: personalItems,
              totals: {
                regular_total_cents:       totals.regularTotal,
                at_register_savings_cents: totals.atRegisterSavings,
                you_pay_cents:             totals.youPay,
                rebate_total_cents:        0,
                true_final_cents:          totals.trueFinal,
              },
            })
          }
          activeOpacity={0.88}
        >
          <Feather name="camera" size={17} color={WHITE} style={{ marginRight: 8 }} />
          <Text style={s.verifyBtnTxt}>Verify Receipt</Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: OFF_WHITE },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:     { padding: 16, gap: 12 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: NAVY },
  headerSub:   { fontSize: 11, color: GRAY, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearBtn:    { paddingHorizontal: 10, paddingVertical: 5 },
  clearBtnTxt: { fontSize: 12, fontWeight: '600', color: RED },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },

  // Summary bar
  summaryBar: {
    flexDirection: 'row', backgroundColor: NAVY,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryVal:     { fontSize: 17, fontWeight: '800', color: WHITE, marginBottom: 2 },
  summaryLabel:   { fontSize: 8, color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: 0.8 },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 },

  // Item rows
  sectionCard: {
    backgroundColor: WHITE, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  itemSep: { height: 1, backgroundColor: BORDER, marginHorizontal: 16 },
  itemMain:   { flex: 1 },
  itemTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 5 },
  itemName: {
    flex: 1, fontSize: 14, fontWeight: '700', color: NAVY, lineHeight: 19,
  },
  removeBtn: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: OFF_WHITE, flexShrink: 0,
  },
  itemMeta:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  retailerTxt: { fontSize: 11, color: GRAY },
  dayTxt:      { fontSize: 10, color: GRAY, fontWeight: '600', textTransform: 'uppercase' },
  badge: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  badgeTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  bogoNote: { fontSize: 11, color: GREEN, fontWeight: '500', marginTop: 4 },

  // Pricing column
  itemPricing: { alignItems: 'flex-end', gap: 2, minWidth: 72 },
  strikePrice: { fontSize: 11, color: GRAY, textDecorationLine: 'line-through' },
  salePrice:   { fontSize: 15, fontWeight: '800', color: NAVY },
  saveBadge:   { backgroundColor: PALE_GREEN, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  saveTxt:     { fontSize: 9, fontWeight: '700', color: GREEN },

  // Coupon checklist
  checklistCard: {
    backgroundColor: '#FFFBEB', borderRadius: 16,
    borderWidth: 1, borderColor: '#FDE68A',
    padding: 16, gap: 10,
  },
  checklistTitle: {
    fontSize: 9, fontWeight: '800', color: '#92400E',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2,
  },
  checklistRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checklistTxt:   { flex: 1, fontSize: 13, color: NAVY, lineHeight: 18 },

  // Receipt totals
  receiptCard: {
    backgroundColor: WHITE, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    padding: 16,
  },
  receiptTitle: {
    fontSize: 9, fontWeight: '800', color: GRAY,
    letterSpacing: 1.5, marginBottom: 12,
  },
  receiptRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  receiptRowBig:   { marginTop: 4 },
  receiptRowTotal: { marginTop: 2 },
  receiptLabel:    { fontSize: 13, color: NAVY },
  receiptVal:      { fontSize: 13, fontWeight: '600', color: NAVY },
  strikeVal:       { textDecorationLine: 'line-through', color: GRAY },
  receiptLabelBig: { fontSize: 14, fontWeight: '700', color: NAVY },
  receiptValBig:   { fontSize: 16, fontWeight: '800', color: NAVY },
  receiptDivider:  { height: 1, backgroundColor: BORDER, marginVertical: 10 },
  receiptTotalLabel: { fontSize: 15, fontWeight: '800', color: FOREST },
  receiptTotalVal:   { fontSize: 20, fontWeight: '900', color: FOREST },
  withoutSnippd:     { fontSize: 11, color: GRAY, marginTop: 8, textAlign: 'center' },
  withoutSnippdStrike: { textDecorationLine: 'line-through' },

  // Verify button
  verifyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: FOREST, borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 24,
    shadowColor: FOREST,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  verifyBtnTxt: { fontSize: 16, fontWeight: '800', color: WHITE },

  // Empty state
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: LIGHT_GREEN, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: NAVY, marginBottom: 8 },
  emptySub: { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  emptyBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 14,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  emptyBtnTxt: { color: WHITE, fontSize: 15, fontWeight: '700' },
});
