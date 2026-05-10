import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { addItemsToActiveCart, readActiveCart } from '../src/services/cartStorage';
import { fetchWeeklyBudgetCents } from '../lib/weeklyBudget';

const COLORS = {
  forest: '#004D40',
  green: '#0C9E54',
  navy: '#0D1B4B',
  grey: '#64748B',
  bg: '#F8FAFC',
  white: '#FFFFFF',
  border: '#E2E8F0',
  amber: '#F59E0B',
  amberBg: '#FEF3C7',
  mint: '#ECFDF3',
};

const FONT = Platform.OS === 'ios' ? 'System' : undefined;

function cents(value, mode = 'auto') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (mode === 'cents') return Math.round(n);
  if (mode === 'dollars') return Math.round(n * 100);
  return n >= 1000 ? Math.round(n) : Math.round(n * 100);
}

function fmt(centsValue) {
  return '$' + (Math.max(0, Math.round(Number(centsValue) || 0)) / 100).toFixed(2);
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function storeLabel(value) {
  const key = storeKey(value);
  if (key === 'dollar_general') return 'Dollar General';
  if (key === 'publix') return 'Publix';
  if (key === 'walmart') return 'Walmart';
  if (key === 'target') return 'Target';
  return String(value || 'Store').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function itemName(item) {
  return String(item?.display_name || item?.name || item?.item || item?.product_name || 'Item');
}

function normalizeStack(row) {
  const retailer = row.retailer || row.retailer_key || row.store || 'Store';
  const items = parseList(row.breakdown_list ?? row.items ?? row.stack_items ?? row.metadata?.items);
  const itemRegularCents = items.reduce((sum, item) => {
    const regular = item.regular_price_cents != null
      ? cents(item.regular_price_cents, 'cents')
      : cents(item.regular_price ?? item.reg_price ?? item.price ?? item.sale_price, 'auto');
    return sum + regular * (Number(item.quantity || item.qty || 1) || 1);
  }, 0);
  const itemFinalCents = items.reduce((sum, item) => {
    const final = item.final_price_cents != null
      ? cents(item.final_price_cents, 'cents')
      : item.sale_price_cents != null
        ? cents(item.sale_price_cents, 'cents')
        : cents(item.final_price ?? item.sale_price ?? item.pay_price ?? item.price, 'auto');
    return sum + final * (Number(item.quantity || item.qty || 1) || 1);
  }, 0);

  const payCents = cents(row.final_out_of_pocket_cents ?? row.final_estimated_total_cents, 'cents')
    || cents(row.pay_price ?? row.final_out_of_pocket, 'auto')
    || itemFinalCents;
  const subtotalCents = cents(row.subtotal_cents ?? row.regular_total_cents, 'cents')
    || cents(row.regular_total ?? row.subtotal, 'auto')
    || itemRegularCents
    || payCents;
  const saveCents = cents(row.total_discounts_cents ?? row.savings_cents, 'cents')
    || cents(row.save_price ?? row.savings, 'auto')
    || Math.max(0, subtotalCents - payCents);

  return {
    id: String(row.id || row.stack_id || row.title || `${retailer}_${payCents}`),
    title: row.title || row.stack_title || row.name || 'Snippd Stack',
    retailer: storeLabel(retailer),
    retailerKey: storeKey(retailer),
    payCents,
    saveCents,
    subtotalCents,
    savingsPercent: Number(row.savings_percent || (subtotalCents > 0 ? Math.round((saveCents / subtotalCents) * 100) : 0)),
    items,
    itemNames: items.map(itemName),
    householdSize: Number(row.household_size || row.servings || row.serving_count || 0),
    dietText: `${row.dietary_tags || ''} ${row.meal_type || ''} ${row.stack_type || ''} ${items.map(item => `${item.category || ''} ${itemName(item)}`).join(' ')}`.toLowerCase(),
    raw: row,
  };
}

function profileStores(profile) {
  const raw = profile?.selected_stores || profile?.preferred_stores || profile?.preferences?.preferred_stores || [];
  return new Set((Array.isArray(raw) ? raw : []).map(storeKey).filter(Boolean));
}

function profileAllergies(profile) {
  const raw = profile?.allergies || profile?.preferences?.allergies || [];
  return (Array.isArray(raw) ? raw : []).map(v => String(v).toLowerCase()).filter(Boolean);
}

function profileDiet(profile) {
  const raw = [
    profile?.dietary_tags,
    profile?.dietary_modes,
    profile?.nutrition_goals,
    profile?.lifestyle_concierge?.dietary_preference,
    profile?.preferences?.dietary_preference,
  ].flat();
  return raw.map(v => String(v || '').toLowerCase()).filter(Boolean);
}

function matchesProfile(stack, profile) {
  const stores = profileStores(profile);
  if (stores.size && !stores.has(stack.retailerKey)) return false;

  const allergies = profileAllergies(profile);
  if (allergies.some(allergy => stack.dietText.includes(allergy))) return false;

  const household = Number(profile?.household_size || profile?.household_members || 0);
  if (household > 0 && stack.householdSize > 0 && stack.householdSize < household) return false;

  const diet = profileDiet(profile).filter(tag => tag !== 'none');
  if (diet.length && !diet.some(tag => stack.dietText.includes(tag))) {
    return true; // Do not hide general grocery stacks when dietary tags are absent.
  }
  return true;
}

async function addStackToCart(stack) {
  const { items: existing } = await readActiveCart();
  const alreadyIn = existing.some(item => item.bundle_id === stack.id || item.stack_id === stack.id);
  if (alreadyIn) return 'already_added';
  const cartItems = (stack.items.length ? stack.items : [{ name: stack.title }]).slice(0, 30).map((item, idx) => ({
    id: `explore_${stack.id}_${idx}`,
    bundle_id: stack.id,
    stack_id: stack.id,
    product_name: itemName(item),
    sale_cents: item.final_price_cents ?? item.sale_price_cents ?? cents(item.final_price ?? item.sale_price ?? item.price, 'auto'),
    reg_cents: item.regular_price_cents ?? cents(item.regular_price ?? item.reg_price ?? item.price, 'auto'),
    deal_type: item.deal_type || item.coupon_status || null,
    quantity: Number(item.quantity || item.qty || 1) || 1,
    source: 'explore',
    retailer: stack.retailer,
  }));
  await addItemsToActiveCart(cartItems);
  return 'added';
}

export default function DiscoverScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [weeklyBudgetCents, setWeeklyBudgetCents] = useState(15000);
  const [stacks, setStacks] = useState([]);
  const [selectedStore, setSelectedStore] = useState('all');
  const [sortMode, setSortMode] = useState('oop');
  const [addedIds, setAddedIds] = useState(new Set());
  const [dataStatus, setDataStatus] = useState('waiting');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const budget = await fetchWeeklyBudgetCents();
      setWeeklyBudgetCents(budget);

      let prof = null;
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        prof = data;
        setProfile(data);
      }

      let source = 'app_home_feed';
      const { data: homeRows, error } = await supabase
        .from('app_home_feed')
        .select('*')
        .eq('status', 'active')
        .limit(100);
      if (error) throw error;

      let rows = homeRows || [];
      if (!rows.length) {
        const { data: candidateRows, error: candidateError } = await supabase
          .from('stack_candidates')
          .select('*')
          .in('status', ['approved', 'active', 'ready'])
          .limit(100);
        if (!candidateError && candidateRows?.length) {
          rows = candidateRows;
          source = 'stack_candidates';
        }
      }

      if (!rows.length) {
        console.info('[DiscoverScreen] no discoverable stacks found', {
          tables: ['app_home_feed', 'stack_candidates'],
          hasProfile: Boolean(prof),
        });
        setDataStatus('waiting');
      } else {
        setDataStatus('live');
      }

      const normalized = (rows || [])
        .map(normalizeStack)
        .filter(stack => stack.payCents > 0)
        .filter(stack => matchesProfile(stack, prof));

      if (rows.length && !normalized.length) {
        console.info('[DiscoverScreen] stack rows filtered out by profile or missing price', {
          source,
          rowCount: rows.length,
          hasProfile: Boolean(prof),
        });
        setDataStatus('waiting');
      }

      setStacks(normalized);

      const { items } = await readActiveCart();
      setAddedIds(new Set((items || []).map(item => item.bundle_id || item.stack_id || item.id)));
    } catch (error) {
      console.error('[DiscoverScreen] load failed', error);
      setStacks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const openProfile = useCallback(() => {
    const parent = navigation.getParent?.();
    if (parent?.navigate) parent.navigate('ProfileTab');
  }, [navigation]);

  const openBudget = useCallback(() => {
    const parent = navigation.getParent?.();
    if (parent?.navigate) parent.navigate('ProfileTab', { screen: 'BudgetPreferences' });
  }, [navigation]);

  const stores = useMemo(() => {
    const unique = [...new Map(stacks.map(stack => [stack.retailerKey, stack.retailer])).entries()];
    return [{ key: 'all', label: 'All' }, ...unique.map(([key, label]) => ({ key, label }))];
  }, [stacks]);

  const filteredStacks = useMemo(() => {
    const byStore = selectedStore === 'all'
      ? stacks
      : stacks.filter(stack => stack.retailerKey === selectedStore);
    return [...byStore].sort((a, b) => {
      if (sortMode === 'savings') return b.savingsPercent - a.savingsPercent || a.payCents - b.payCents;
      return a.payCents - b.payCents || b.savingsPercent - a.savingsPercent;
    });
  }, [selectedStore, sortMode, stacks]);

  const streams = useMemo(() => ({
    within_plan: filteredStacks.filter(stack => stack.payCents <= weeklyBudgetCents),
    budget_stretch: filteredStacks.filter(stack => stack.payCents > weeklyBudgetCents),
  }), [filteredStacks, weeklyBudgetCents]);

  const handleAdd = useCallback(async (stack) => {
    try {
      const result = await addStackToCart(stack);
      if (result === 'already_added') {
        Alert.alert('Already in cart', `${stack.title} is already in your cart.`);
        return;
      }
      setAddedIds(prev => new Set([...prev, stack.id]));

      // Persist to shopping_list_items so ListScreen realtime subscription picks it up
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const raw = stack.raw;
        const listRows = (stack.items.length ? stack.items : [{ name: stack.title }]).map((item, idx) => ({
          id: `discover_${stack.id}_${idx}`,
          name: itemName(item),
          store: stack.retailer,
          stack_candidate_id: raw.stack_candidate_id ?? raw.id ?? null,
          stack_title: stack.title,
          retailer_key: stack.retailerKey,
          final_out_of_pocket_cents: item.final_price_cents ?? item.sale_price_cents ?? cents(item.final_price ?? item.sale_price ?? item.price, 'auto'),
          regular_price_cents: item.regular_price_cents ?? cents(item.regular_price ?? item.reg_price ?? item.price, 'auto'),
          total_discounts_cents: raw.total_discounts_cents ?? raw.savings_cents ?? null,
          coupon_value_cents: item.coupon_value_cents ?? raw.coupon_value_cents ?? null,
          rebate_value_cents: item.rebate_value_cents ?? raw.rebate_value_cents ?? null,
          savings_percent: stack.savingsPercent,
          confidence_score: raw.confidence_score ?? null,
          validation_status: raw.validation_status ?? null,
          coupon_code: item.coupon_code ?? raw.coupon_code ?? null,
          rebate_app: item.rebate_app ?? raw.rebate_app ?? null,
          customer_instructions: item.customer_instructions ?? raw.customer_instructions ?? null,
          deal_type: item.deal_type ?? raw.deal_type ?? null,
          quantity: Number(item.quantity || item.qty || 1) || 1,
          source: 'discover',
        }));
        await supabase.rpc('upsert_shopping_list_items', { p_user_id: user.id, p_items: listRows });
      }

      Alert.alert('Added', `${stack.title} was added to your list.`);
    } catch {
      Alert.alert('Could not add stack', 'Please try again.');
    }
  }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.green} /></View>;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView edges={['top']} style={styles.header}>
        <Text style={styles.headerLabel}>QUICK DEALS</Text>
        <Text style={styles.title}>Explore stacks</Text>
        <Text style={styles.subtitle}>
          {streams.within_plan.length} within plan / {streams.budget_stretch.length} budget stretch
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {stores.map(store => (
            <TouchableOpacity
              key={store.key}
              style={[styles.filterPill, selectedStore === store.key && styles.filterPillOn]}
              onPress={() => setSelectedStore(store.key)}
            >
              <Text style={[styles.filterTxt, selectedStore === store.key && styles.filterTxtOn]}>{store.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={styles.sortToggle}
          onPress={() => setSortMode(prev => prev === 'oop' ? 'savings' : 'oop')}
          activeOpacity={0.85}
        >
          <Feather name="sliders" size={15} color={COLORS.forest} />
          <Text style={styles.sortTxt}>{sortMode === 'oop' ? 'Lowest OOP' : 'Highest Savings %'}</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {filteredStacks.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.dataBadge, dataStatus === 'live' ? styles.dataBadgeLive : styles.dataBadgeWaiting]}>
              <Text style={[styles.dataBadgeTxt, dataStatus === 'live' ? styles.dataBadgeTxtLive : styles.dataBadgeTxtWaiting]}>
                {dataStatus === 'live' ? 'Live' : 'Waiting for weekly deals'}
              </Text>
            </View>
            <Feather name="inbox" size={34} color={COLORS.grey} />
            <Text style={styles.emptyTitle}>No verified stacks match your profile yet.</Text>
            <Text style={styles.emptySub}>
              Snippd checked app_home_feed and stack_candidates, but there are no active cards for your stores, budget, or food preferences. This usually clears after the weekly deals refresh or after you finish your profile.
            </Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity style={styles.emptyPrimaryBtn} onPress={openProfile} activeOpacity={0.86}>
                <Text style={styles.emptyPrimaryTxt}>Build profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emptyGhostBtn} onPress={openBudget} activeOpacity={0.86}>
                <Text style={styles.emptyGhostTxt}>Add grocery budget</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.emptyWideBtn} onPress={fetchData} activeOpacity={0.86}>
              <Text style={styles.emptyWideTxt}>Check back after weekly deals refresh</Text>
            </TouchableOpacity>
          </View>
        ) : filteredStacks.map(stack => {
          const withinPlan = stack.payCents <= weeklyBudgetCents;
          const isAdded = addedIds.has(stack.id);
          return (
            <TouchableOpacity
              key={stack.id}
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('StackDetail', { stack: stack.raw, deal: stack.raw })}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardEyebrow}>{stack.items.length || 1} items</Text>
                  <Text style={styles.cardTitle} numberOfLines={2}>{stack.title}</Text>
                </View>
                <View style={styles.storeLogo}>
                  <Text style={styles.storeLogoTxt}>{stack.retailer === 'Dollar General' ? 'DG' : stack.retailer.charAt(0)}</Text>
                </View>
              </View>

              <View style={styles.tagRow}>
                <View style={[styles.planTag, withinPlan ? styles.planTagOk : styles.planTagStretch]}>
                  <Feather name={withinPlan ? 'check-circle' : 'alert-triangle'} size={13} color={withinPlan ? COLORS.green : '#92400E'} />
                  <Text style={[styles.planTagTxt, !withinPlan && { color: '#92400E' }]}>
                    {withinPlan ? 'Within Plan' : 'Budget Stretch'}
                  </Text>
                </View>
                {stack.savingsPercent > 0 && <Text style={styles.percentTag}>Save {stack.savingsPercent}%</Text>}
              </View>

              <View style={styles.itemPreview}>
                {stack.itemNames.slice(0, 4).map(name => <Text key={name} style={styles.itemChip}>{name}</Text>)}
              </View>

              <View style={styles.cardBottom}>
                <View style={styles.payBlock}>
                  <View style={styles.payLabelRow}>
                    {!withinPlan && <Feather name="alert-circle" size={12} color={COLORS.amber} />}
                    <Text style={styles.bottomLabel}>PAY</Text>
                  </View>
                  <Text style={styles.payValue}>{fmt(stack.payCents)}</Text>
                </View>
                <View style={styles.saveBlock}>
                  <Text style={styles.saveLabel}>SAVE</Text>
                  <Text style={styles.saveValue}>{fmt(stack.saveCents)}</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.viewBtn} onPress={() => navigation.navigate('StackDetail', { stack: stack.raw, deal: stack.raw })}>
                  <Text style={styles.viewBtnTxt}>View Stack</Text>
                  <Feather name="chevron-right" size={16} color={COLORS.white} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cartBtn, isAdded && styles.cartBtnOn]} onPress={() => !isAdded && handleAdd(stack)}>
                  <Feather name={isAdded ? 'check' : 'shopping-cart'} size={15} color={isAdded ? COLORS.green : COLORS.forest} />
                  <Text style={[styles.cartTxt, isAdded && { color: COLORS.green }]}>{isAdded ? 'Added' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  header: { backgroundColor: COLORS.white, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerLabel: { fontFamily: FONT, color: COLORS.green, fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginTop: 8 },
  title: { fontFamily: FONT, color: COLORS.navy, fontSize: 28, fontWeight: '900', marginTop: 4 },
  subtitle: { fontFamily: FONT, color: COLORS.grey, fontSize: 13, marginTop: 4 },
  filterRow: { gap: 8, paddingTop: 14, paddingRight: 16 },
  filterPill: { height: 38, paddingHorizontal: 15, borderRadius: 999, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  filterPillOn: { backgroundColor: COLORS.forest, borderColor: COLORS.forest },
  filterTxt: { fontFamily: FONT, color: COLORS.navy, fontWeight: '800', fontSize: 12 },
  filterTxtOn: { color: COLORS.white },
  sortToggle: { marginTop: 12, height: 36, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: COLORS.mint, borderWidth: 1, borderColor: '#BDF3CD' },
  sortTxt: { fontFamily: FONT, color: COLORS.forest, fontSize: 12, fontWeight: '900' },
  scroll: { padding: 16 },
  emptyWrap: { alignItems: 'center', gap: 8, paddingTop: 48, paddingHorizontal: 10 },
  emptyTitle: { fontFamily: FONT, color: COLORS.navy, fontSize: 16, fontWeight: '900' },
  emptySub: { fontFamily: FONT, color: COLORS.grey, textAlign: 'center', lineHeight: 19 },
  dataBadge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 4 },
  dataBadgeLive: { backgroundColor: COLORS.mint, borderColor: '#BDF3CD' },
  dataBadgeWaiting: { backgroundColor: COLORS.amberBg, borderColor: '#FDE68A' },
  dataBadgeTxt: { fontFamily: FONT, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  dataBadgeTxtLive: { color: COLORS.green },
  dataBadgeTxtWaiting: { color: '#92400E' },
  emptyActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  emptyPrimaryBtn: { backgroundColor: COLORS.green, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  emptyPrimaryTxt: { fontFamily: FONT, color: COLORS.white, fontSize: 12, fontWeight: '900' },
  emptyGhostBtn: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  emptyGhostTxt: { fontFamily: FONT, color: COLORS.forest, fontSize: 12, fontWeight: '900' },
  emptyWideBtn: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 4 },
  emptyWideTxt: { fontFamily: FONT, color: COLORS.navy, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, shadowColor: '#0D1B4B', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardEyebrow: { fontFamily: FONT, color: COLORS.green, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase' },
  cardTitle: { fontFamily: FONT, flex: 1, color: COLORS.navy, fontSize: 19, fontWeight: '900', lineHeight: 24, marginTop: 3 },
  storeLogo: { width: 46, height: 46, borderRadius: 14, backgroundColor: COLORS.forest, alignItems: 'center', justifyContent: 'center' },
  storeLogoTxt: { fontFamily: FONT, color: COLORS.white, fontWeight: '900', fontSize: 14 },
  tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  planTag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  planTagOk: { backgroundColor: COLORS.mint },
  planTagStretch: { backgroundColor: COLORS.amberBg },
  planTagTxt: { fontFamily: FONT, color: COLORS.green, fontSize: 11, fontWeight: '900' },
  percentTag: { fontFamily: FONT, color: COLORS.forest, fontSize: 11, fontWeight: '900', backgroundColor: '#F1F5F9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  itemPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  itemChip: { fontFamily: FONT, color: COLORS.navy, backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', overflow: 'hidden', borderRadius: 14, marginTop: 16, minHeight: 74 },
  payBlock: { flex: 1, backgroundColor: COLORS.green, padding: 14, justifyContent: 'center' },
  saveBlock: { flex: 1, backgroundColor: COLORS.forest, padding: 14, justifyContent: 'center', alignItems: 'flex-end' },
  payLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bottomLabel: { fontFamily: FONT, color: 'rgba(255,255,255,0.74)', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  payValue: { fontFamily: FONT, color: COLORS.white, fontSize: 26, fontWeight: '900', marginTop: 3 },
  saveLabel: { fontFamily: FONT, color: 'rgba(255,255,255,0.74)', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  saveValue: { fontFamily: FONT, color: COLORS.white, fontSize: 26, fontWeight: '900', marginTop: 3 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  viewBtn: { flex: 1, backgroundColor: COLORS.forest, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  viewBtnTxt: { fontFamily: FONT, color: COLORS.white, fontSize: 13, fontWeight: '900' },
  cartBtn: { width: 82, height: 46, borderRadius: 13, borderWidth: 1, borderColor: '#BDF3CD', backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  cartBtnOn: { backgroundColor: COLORS.mint, borderColor: '#86EFAC' },
  cartTxt: { fontFamily: FONT, color: COLORS.forest, fontSize: 12, fontWeight: '900' },
});
