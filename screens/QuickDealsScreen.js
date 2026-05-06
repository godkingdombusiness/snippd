/**
 * QuickDealsScreen — Saturday Mode + store filter.
 * Reads live stack cards from app_home_feed where stack_type IS NOT NULL.
 * Tapping a card opens StackDetailScreen.
 * No frontend math — all totals are backend-provided.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { generateStacks, loadVerifiedStacks } from '../src/lib/generateStacks';

// ── Brand ─────────────────────────────────────────────────────────────────────
const GREEN     = '#0C9E54';
const FOREST    = '#04361D';
const NAVY      = '#1A237E';
const WHITE     = '#FFFFFF';
const MINT      = '#F0FBF0';
const SLATE     = '#64748B';
const BORDER    = '#E2E8F0';
const LIGHT_GRN = '#DCFCE7';

// ── Store filter options ───────────────────────────────────────────────────────
const STORE_FILTERS = [
  { key: 'all',        label: 'All Stores' },
  { key: 'Publix',     label: 'Publix' },
  { key: 'Walmart',    label: 'Walmart' },
  { key: 'Aldi',       label: 'Aldi' },
  { key: 'Target',     label: 'Target' },
  { key: "BJ's Wholesale", label: "BJ's" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCents(cents) {
  if (cents == null || isNaN(cents)) return '$—';
  return '$' + (Math.max(0, cents) / 100).toFixed(2);
}

function getUrgencyLabel(stack) {
  if (!stack.valid_until) return 'This Week';
  try {
    const expiry   = new Date(stack.valid_until);
    const now      = new Date();
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    const dow      = expiry.getDay(); // 0=Sun, 6=Sat
    if (diffDays <= 1)            return 'Today Only';
    if (dow === 6 || diffDays <= 2) return 'Saturday Only';
  } catch { /* ignore bad dates */ }
  return 'This Week';
}

function urgencyColors(label) {
  if (label === 'Today Only')    return { bg: '#FEE2E2', text: '#B91C1C' };
  if (label === 'Saturday Only') return { bg: '#FEF3C7', text: '#92400E' };
  return { bg: LIGHT_GRN, text: GREEN };
}

function capitalize(str) {
  if (!str) return 'Store';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase().replace(/_/g, ' ');
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function QuickDealsScreen({ navigation }) {
  const [stacks,        setStacks]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [activeStore,   setActiveStore]   = useState('all');
  const [refreshing,    setRefreshing]    = useState(false);

  const today      = new Date();
  const isSaturday = today.getDay() === 6;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await generateStacks({ userId: user.id });
      const newStacks = await loadVerifiedStacks({ limit: 30 });
      setStacks(newStacks);
    } catch { setStacks([]); } finally { setRefreshing(false); }
  }, []);

  const loadStacks = useCallback(async () => {
    setLoading(true);
    try {
      const stacks = await loadVerifiedStacks({ limit: 30 });
      setStacks(stacks);
    } catch {
      setStacks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadStacks(); }, [loadStacks]));

  const filtered = activeStore === 'all'
    ? stacks
    : stacks.filter(s => (s.retailer || '').toLowerCase() === activeStore.toLowerCase());

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={s.headerShell}>
        <View style={s.navRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={20} color={NAVY} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>
              {isSaturday ? 'Saturday Deals' : 'Quick Deals'}
            </Text>
            <Text style={s.headerSub}>
              {isSaturday
                ? 'Best deals expiring this weekend'
                : 'Live stack deals from verified stores'}
            </Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh} disabled={refreshing}>
            <Feather name="refresh-cw" size={16} color={NAVY} />
          </TouchableOpacity>
        </View>

        {/* Store filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterRow}
        >
          {STORE_FILTERS.map(store => (
            <TouchableOpacity
              key={store.key}
              style={[s.filterPill, activeStore === store.key && s.filterPillActive]}
              onPress={() => setActiveStore(store.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterPillTxt, activeStore === store.key && s.filterPillTxtActive]}>
                {store.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={GREEN} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Feather name="inbox" size={40} color={SLATE} />
          <Text style={s.emptyTitle}>Waiting for live store feed.</Text>
          <Text style={s.emptySub}>Check back after store circulars are processed.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {filtered.map((stack, i) => {
            const urgency      = getUrgencyLabel(stack);
            const urgencyStyle = urgencyColors(urgency);
            const finalCents   = stack.final_out_of_pocket_cents
              || Math.round((parseFloat(stack.pay_price) || 0) * 100);
            const savingsPct   = stack.savings_percent || 0;
            const itemCount    = stack.item_count || 0;
            const storeName    = capitalize(stack.retailer);

            return (
              <TouchableOpacity
                key={stack.id || i}
                style={s.card}
                activeOpacity={0.88}
                onPress={() => navigation.navigate('StackDetail', { stack })}
              >
                {/* Store badge + urgency */}
                <View style={s.cardHeader}>
                  <View style={s.storeBadge}>
                    <Text style={s.storeBadgeTxt}>{storeName.toUpperCase()}</Text>
                  </View>
                  <View style={[s.urgencyBadge, { backgroundColor: urgencyStyle.bg }]}>
                    <Text style={[s.urgencyTxt, { color: urgencyStyle.text }]}>{urgency}</Text>
                  </View>
                  {stack.stack_type && (
                    <View style={s.typeBadge}>
                      <Text style={s.typeBadgeTxt}>
                        {stack.stack_type.replace(/_/g, ' ').replace('STACK', '').trim()}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Title */}
                <Text style={s.cardTitle} numberOfLines={2}>{stack.title}</Text>

                {/* Metrics row */}
                <View style={s.metricsRow}>
                  <View style={s.metric}>
                    <Text style={s.metricLabel}>YOU PAY</Text>
                    <Text style={s.metricVal}>{fmtCents(finalCents)}</Text>
                  </View>
                  {savingsPct > 0 && (
                    <View style={s.metric}>
                      <Text style={s.metricLabel}>YOU SAVE</Text>
                      <Text style={[s.metricVal, { color: GREEN }]}>{savingsPct}%</Text>
                    </View>
                  )}
                  {itemCount > 0 && (
                    <View style={s.metric}>
                      <Text style={s.metricLabel}>ITEMS</Text>
                      <Text style={s.metricVal}>{itemCount}</Text>
                    </View>
                  )}
                </View>

                {/* Shop window */}
                {stack.best_shop_window ? (
                  <View style={s.shopWindow}>
                    <Feather name="calendar" size={11} color={GREEN} />
                    <Text style={s.shopWindowTxt}>{stack.best_shop_window}</Text>
                  </View>
                ) : null}

                {/* CTA row */}
                <View style={s.cardFooter}>
                  <Text style={s.ctaLabel}>Start Stack</Text>
                  <Feather name="arrow-right" size={14} color={FOREST} />
                </View>
              </TouchableOpacity>
            );
          })}
          {/* Custom deal footer */}
          <View style={s.customDealCard}>
            <Text style={s.customDealQ}>Need something else?</Text>
            <TouchableOpacity
              style={s.customDealBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('ShoppingList', { stack: null })}
            >
              <Feather name="plus" size={14} color={WHITE} />
              <Text style={s.customDealBtnTxt}>Add a Custom Deal</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: MINT },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitle:{ fontSize: 16, fontWeight: '700', color: NAVY, textAlign: 'center' },
  emptySub:  { fontSize: 13, color: SLATE, textAlign: 'center', lineHeight: 20 },

  headerShell: { backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 12, paddingHorizontal: 16 },
  navRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  backBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  refreshBtn:  { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: NAVY },
  headerSub:   { fontSize: 12, color: SLATE, marginTop: 1 },

  filterScroll: { marginTop: 12 },
  filterRow:    { flexDirection: 'row', gap: 8 },
  filterPill:   { borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: WHITE },
  filterPillActive:   { backgroundColor: FOREST, borderColor: FOREST },
  filterPillTxt:      { fontSize: 13, fontWeight: '600', color: SLATE },
  filterPillTxtActive:{ color: WHITE },

  scroll: { padding: 16, gap: 12 },
  card:   { backgroundColor: WHITE, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: BORDER },

  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  storeBadge:    { backgroundColor: FOREST, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  storeBadgeTxt: { fontSize: 10, fontWeight: '800', color: WHITE, letterSpacing: 1 },
  urgencyBadge:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  urgencyTxt:    { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  typeBadge:     { backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeTxt:  { fontSize: 9, fontWeight: '700', color: SLATE, letterSpacing: 0.5 },

  cardTitle:  { fontSize: 16, fontWeight: '800', color: NAVY, lineHeight: 22 },

  metricsRow: { flexDirection: 'row', gap: 20 },
  metric:     { alignItems: 'flex-start' },
  metricLabel:{ fontSize: 9, fontWeight: '800', color: SLATE, letterSpacing: 1.5, marginBottom: 1 },
  metricVal:  { fontSize: 22, fontWeight: '900', color: NAVY },

  shopWindow:    { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: LIGHT_GRN, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  shopWindowTxt: { fontSize: 10, fontWeight: '700', color: GREEN },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10 },
  ctaLabel:   { fontSize: 14, fontWeight: '800', color: FOREST },

  customDealCard: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER,
    padding: 16, alignItems: 'center', gap: 10, marginTop: 4,
  },
  customDealQ:   { fontSize: 13, color: SLATE },
  customDealBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: FOREST, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  customDealBtnTxt: { fontSize: 13, fontWeight: '700', color: WHITE },
});
