/**
 * QuickDealsScreen — Explore Mode (Screen E).
 * Dual-stream: preference-matched stacks sorted by Lowest OOP.
 * Tags: "Within Plan" (green) when OOP ≤ weekly budget; "Budget Stretch" (yellow) when over.
 * Toggle: Lowest OOP ↔ Highest Savings %.
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
import { loadVerifiedStacks } from '../src/lib/generateStacks';

// ── Brand ─────────────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const FOREST     = '#004D40';
const NAVY       = '#1A237E';
const WHITE      = '#FFFFFF';
const MINT       = '#F0FBF0';
const SLATE      = '#64748B';
const BORDER     = '#E2E8F0';
const LIGHT_GRN  = '#DCFCE7';
const AMBER      = '#F59E0B';
const AMBER_SOFT = '#FEF3C7';
const AMBER_TEXT = '#92400E';

// ── Store filter options ───────────────────────────────────────────────────────
const ALL_STORE_FILTERS = [
  { key: 'all',              label: 'All' },
  { key: 'Dollar General',   label: 'Dollar General' },
  { key: 'Publix',           label: 'Publix' },
  { key: 'Walmart',          label: 'Walmart' },
  { key: 'Aldi',             label: 'Aldi' },
  { key: 'Target',           label: 'Target' },
  { key: "BJ's Wholesale",   label: "BJ's" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCents(cents) {
  if (cents == null || isNaN(cents)) return '$—';
  return '$' + (Math.max(0, cents) / 100).toFixed(2);
}

function getOopCents(stack) {
  return stack.final_out_of_pocket_cents
    || Math.round((parseFloat(stack.pay_price) || 0) * 100);
}

function getSavingsCents(stack) {
  return stack.total_discounts_cents
    || Math.round((parseFloat(stack.savings_amount) || 0) * 100);
}

function capitalize(str) {
  if (!str) return 'Store';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase().replace(/_/g, ' ');
}

function storeInitials(name) {
  if (!name) return '??';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getUrgencyLabel(stack) {
  if (!stack.valid_until) return null;
  try {
    const diffDays = Math.ceil((new Date(stack.valid_until) - new Date()) / 86400000);
    if (diffDays <= 1) return 'Today Only';
    if (new Date(stack.valid_until).getDay() === 6 || diffDays <= 2) return 'Sat Only';
  } catch {}
  return null;
}

// ── Budget status tag ─────────────────────────────────────────────────────────
function BudgetTag({ isWithinPlan }) {
  if (isWithinPlan) {
    return (
      <View style={s.tagGreen}>
        <Feather name="check-circle" size={10} color={GREEN} />
        <Text style={s.tagGreenTxt}>Within Plan</Text>
      </View>
    );
  }
  return (
    <View style={s.tagAmber}>
      <Feather name="alert-triangle" size={10} color={AMBER_TEXT} />
      <Text style={s.tagAmberTxt}>Budget Stretch</Text>
    </View>
  );
}

// ── Stack Card ────────────────────────────────────────────────────────────────
function StackCard({ stack, weeklyBudgetCents, onPress }) {
  const oopCents      = getOopCents(stack);
  const savingsCents  = getSavingsCents(stack);
  const savingsPct    = stack.savings_percent || 0;
  const isWithinPlan  = weeklyBudgetCents > 0 && oopCents <= weeklyBudgetCents;
  const isOverBudget  = weeklyBudgetCents > 0 && oopCents > weeklyBudgetCents;
  const storeName     = capitalize(stack.retailer || stack.store || 'Store');
  const urgency       = getUrgencyLabel(stack);
  const initials      = storeInitials(storeName);

  return (
    <TouchableOpacity style={s.card} activeOpacity={0.88} onPress={onPress}>
      {/* ── Top row: title + store logo ── */}
      <View style={s.cardTop}>
        <View style={{ flex: 1, gap: 6 }}>
          {/* Budget tag */}
          {weeklyBudgetCents > 0 && (
            <BudgetTag isWithinPlan={isWithinPlan} />
          )}
          <Text style={s.cardTitle} numberOfLines={2}>{stack.title}</Text>
          {urgency && (
            <View style={s.urgencyBadge}>
              <Text style={s.urgencyTxt}>{urgency}</Text>
            </View>
          )}
        </View>
        {/* Store logo circle */}
        <View style={s.storeLogo}>
          <Text style={s.storeLogoTxt}>{initials}</Text>
          <Text style={s.storeLogoName} numberOfLines={1}>{storeName.split(' ')[0]}</Text>
        </View>
      </View>

      {/* ── Bottom bar: Pay / Save split ── */}
      <View style={s.cardBar}>
        <View style={s.cardBarLeft}>
          <Text style={s.payLabel}>PAY</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={s.payAmt}>{fmtCents(oopCents)}</Text>
            {isOverBudget && (
              <Feather name="alert-triangle" size={13} color={AMBER} />
            )}
          </View>
        </View>
        <View style={s.cardBarDivider} />
        <View style={s.cardBarRight}>
          <Text style={s.saveLabel}>SAVE</Text>
          <Text style={s.saveAmt}>
            {savingsCents > 0 ? fmtCents(savingsCents) : savingsPct > 0 ? `${savingsPct}%` : '—'}
          </Text>
        </View>
        <Feather name="chevron-right" size={16} color={SLATE} style={{ marginLeft: 4 }} />
      </View>
    </TouchableOpacity>
  );
}

// ── Sort toggle ───────────────────────────────────────────────────────────────
function SortToggle({ sortBy, onToggle }) {
  return (
    <TouchableOpacity style={s.sortToggle} onPress={onToggle} activeOpacity={0.8}>
      <Feather name="sliders" size={13} color={NAVY} />
      <Text style={s.sortToggleTxt}>
        {sortBy === 'oop' ? 'Lowest OOP' : 'Highest Savings %'}
      </Text>
      <Feather name="chevron-down" size={13} color={NAVY} />
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function QuickDealsScreen({ navigation }) {
  const [stacks,           setStacks]           = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [activeStore,      setActiveStore]      = useState('all');
  const [sortBy,           setSortBy]           = useState('oop'); // 'oop' | 'savings'
  const [weeklyBudgetCents,setWeeklyBudgetCents]= useState(0);
  const [refreshing,       setRefreshing]       = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch user profile for budget + store prefs
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('weekly_budget_cents, selected_stores')
          .eq('id', user.id)
          .single();
        if (profile?.weekly_budget_cents) {
          setWeeklyBudgetCents(profile.weekly_budget_cents);
        }
      }

      const raw = await loadVerifiedStacks({ limit: 50 });
      setStacks(raw || []);
    } catch {
      setStacks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const toggleSort = () => setSortBy(prev => prev === 'oop' ? 'savings' : 'oop');

  // Filter by store tab
  const byStore = activeStore === 'all'
    ? stacks
    : stacks.filter(s => (s.retailer || s.store || '').toLowerCase() === activeStore.toLowerCase());

  // Sort
  const sorted = [...byStore].sort((a, b) => {
    if (sortBy === 'oop') {
      return getOopCents(a) - getOopCents(b);
    }
    return (b.savings_percent || 0) - (a.savings_percent || 0);
  });

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Persistent header + filter bar ──────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={s.headerShell}>
        <View style={s.navRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={20} color={NAVY} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Explore Deals</Text>
            <Text style={s.headerSub}>Sorted by lowest out-of-pocket cost</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh} disabled={refreshing}>
            <Feather name={refreshing ? 'loader' : 'refresh-cw'} size={15} color={NAVY} />
          </TouchableOpacity>
        </View>

        {/* Store tab filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterRow}
        >
          {ALL_STORE_FILTERS.map(store => (
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

        {/* Sort toggle + count */}
        <View style={s.sortRow}>
          <Text style={s.resultCount}>
            {sorted.length} deal{sorted.length !== 1 ? 's' : ''}
            {weeklyBudgetCents > 0 && ` · Budget ${fmtCents(weeklyBudgetCents)}/wk`}
          </Text>
          <SortToggle sortBy={sortBy} onToggle={toggleSort} />
        </View>
      </SafeAreaView>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={GREEN} size="large" />
          <Text style={s.loadingTxt}>Finding best deals…</Text>
        </View>
      ) : sorted.length === 0 ? (
        <View style={s.center}>
          <Feather name="inbox" size={40} color={SLATE} />
          <Text style={s.emptyTitle}>No deals found</Text>
          <Text style={s.emptySub}>Check back after store circulars are processed.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {sorted.map((stack, i) => (
            <StackCard
              key={stack.id || i}
              stack={stack}
              weeklyBudgetCents={weeklyBudgetCents}
              onPress={() => navigation.navigate('StackDetail', { stack })}
            />
          ))}

          <TouchableOpacity
            style={s.addCustomBtn}
            onPress={() => navigation.navigate('ShoppingList', { stack: null })}
            activeOpacity={0.8}
          >
            <Feather name="plus-circle" size={16} color={FOREST} />
            <Text style={s.addCustomTxt}>Add a custom deal</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: MINT },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  loadingTxt: { fontSize: 13, color: SLATE },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: NAVY, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: SLATE, textAlign: 'center', lineHeight: 20 },

  headerShell: { backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 10 },
  navRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  backBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  refreshBtn:  { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: NAVY },
  headerSub:   { fontSize: 11, color: SLATE, marginTop: 1 },

  filterScroll: { marginTop: 10 },
  filterRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  filterPill:   { borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: WHITE },
  filterPillActive:    { backgroundColor: FOREST, borderColor: FOREST },
  filterPillTxt:       { fontSize: 13, fontWeight: '600', color: SLATE },
  filterPillTxtActive: { color: WHITE },

  sortRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 10 },
  resultCount:  { fontSize: 12, color: SLATE, fontWeight: '600' },
  sortToggle:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  sortToggleTxt:{ fontSize: 12, fontWeight: '700', color: NAVY },

  scroll: { padding: 16, gap: 12 },

  // Card
  card:     { backgroundColor: WHITE, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16, paddingBottom: 12 },
  cardTitle:{ fontSize: 15, fontWeight: '800', color: NAVY, lineHeight: 21, flex: 1 },

  storeLogo:     { alignItems: 'center', gap: 3, minWidth: 52 },
  storeLogoTxt:  { width: 44, height: 44, borderRadius: 12, backgroundColor: FOREST, textAlign: 'center', lineHeight: 44, fontSize: 14, fontWeight: '900', color: WHITE },
  storeLogoName: { fontSize: 9, fontWeight: '700', color: SLATE, textAlign: 'center' },

  urgencyBadge: { alignSelf: 'flex-start', backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  urgencyTxt:   { fontSize: 10, fontWeight: '800', color: AMBER_TEXT },

  // Budget tags
  tagGreen:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: LIGHT_GRN, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagGreenTxt: { fontSize: 10, fontWeight: '800', color: GREEN },
  tagAmber:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: AMBER_SOFT, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagAmberTxt: { fontSize: 10, fontWeight: '800', color: AMBER_TEXT },

  // Card bottom bar
  cardBar:       { flexDirection: 'row', alignItems: 'center', backgroundColor: FOREST, paddingHorizontal: 16, paddingVertical: 12 },
  cardBarLeft:   { flex: 1 },
  cardBarDivider:{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 14 },
  cardBarRight:  { flex: 1 },
  payLabel:      { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, marginBottom: 2 },
  payAmt:        { fontSize: 20, fontWeight: '900', color: WHITE },
  saveLabel:     { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, marginBottom: 2 },
  saveAmt:       { fontSize: 16, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },

  addCustomBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: WHITE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingVertical: 14, marginTop: 4 },
  addCustomTxt:  { fontSize: 14, fontWeight: '700', color: FOREST },
});
