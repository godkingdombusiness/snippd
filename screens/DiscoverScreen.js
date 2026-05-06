import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { FEATURE_IDS, isFeatureEnabled } from '../src/features/registry';
import { addItemsToActiveCart, readActiveCart } from '../src/services/cartStorage';
import { fetchTop3StoreEngine } from '../src/services/top3StoreEngine';

const COLORS = {
  green:  '#0C9E54',
  forest: '#0C7A3D',
  navy:   '#04361D',
  blue:   '#0071CE',
  grey:   '#64748B',
  bg:     '#F8FAFC',
  white:  '#FFF',
  border: '#E2E8F0',
  amber:  '#F59E0B',
};

// ── Add-to-cart helper ─────────────────────────────────────────────
async function addBundleToCart(bundle) {
  try {
    const { items: existing } = await readActiveCart();

    const alreadyIn = existing.some(i => i.bundle_id === bundle.id || i.id === bundle.id);
    if (alreadyIn) return 'already_added';

    // Flatten bundle items into cart format
    const newItems = (bundle.items || []).slice(0, 20).map((item, idx) => ({
      id:           `explore_${bundle.id}_${idx}`,
      bundle_id:    bundle.id,
      product_name: item.name || item.item || `Item ${idx + 1}`,
      sale_price:   item.sale_price || item.pay_price || 0,
      regular_price: item.regular_price || item.reg_price || item.sale_price || 0,
      deal_type:    (item.deal_type || null),
      quantity:     1,
      source:       'explore',
      retailer:     bundle.retailer,
    }));

    if (newItems.length === 0) {
      // Fallback: add the bundle itself as a single item
      newItems.push({
        id:           bundle.id,
        bundle_id:    bundle.id,
        product_name: bundle.title,
        sale_price:   bundle.pay_price || 0,
        regular_price: (bundle.pay_price || 0) + (bundle.save_price || 0),
        deal_type:    null,
        quantity:     1,
        source:       'explore',
        retailer:     bundle.retailer,
      });
    }

    await addItemsToActiveCart(newItems);
    return 'added';
  } catch {
    return 'error';
  }
}

export default function DiscoverScreen({ navigation }) {
  const omniComparisonEnabled = isFeatureEnabled(FEATURE_IDS.OMNI_STORE_COMPARISON);
  const [loading,    setLoading]    = useState(true);
  const [rawStacks,  setRawStacks]  = useState([]);
  const [profile,    setProfile]    = useState(null);
  const [addedIds,   setAddedIds]   = useState(new Set());
  const [enginePayload, setEnginePayload] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('user_id', user.id).single();
      setProfile(prof);
      fetchTop3StoreEngine({ forceRefresh: true }).then(setEnginePayload).catch(() => {});

      const { data: stackData } = await supabase
        .from('app_home_feed').select('*').eq('status', 'active');

      const sanitized = (stackData || []).map(s => ({
        ...s,
        retailer:       s.retailer
          ? s.retailer.charAt(0).toUpperCase() + s.retailer.slice(1).toLowerCase()
          : 'Other',
        pay_price:      parseFloat(s.pay_price  || 0),
        save_price:     parseFloat(s.save_price || 0),
        breakdown_list: typeof s.breakdown_list === 'string'
          ? JSON.parse(s.breakdown_list)
          : (s.breakdown_list || []),
        // Normalize confidence field (DB uses confidence_score, badge uses confidence_pct)
        confidence_pct: s.confidence_pct ?? s.confidence_score ?? null,
      }));
      setRawStacks(sanitized);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load which bundles are already in cart
  const refreshAddedIds = useCallback(async () => {
    try {
      const { items } = await readActiveCart();
      const ids   = new Set(items.map(i => {
        // Explore items have id format explore_<bundleId>_<idx>
        const match = (i.id || '').match(/^explore_(.+)_\d+$/);
        return i.bundle_id || (match ? match[1] : i.id);
      }));
      setAddedIds(ids);
    } catch { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData();
    refreshAddedIds();
  }, [fetchData, refreshAddedIds]));

  const sevenDayStrategies = useMemo(() => {
    const stores  = [...new Set(rawStacks.map(s => s.retailer))].filter(Boolean);
    const members = profile?.household_members || 1;

    return stores.map(storeName => {
      const storeStacks = rawStacks.filter(s => s.retailer === storeName);
      const allItems    = storeStacks.flatMap(s => s.breakdown_list);

      const breakfastItems = allItems.filter(i =>
        (i.name || i.item || '').toLowerCase().match(
          /egg|oat|milk|cereal|yogurt|fruit|pancake|bacon|sausage/
        )
      );

      const mealVolume  = allItems.length;
      const coverageDays = Math.floor(mealVolume / (members * 3));
      if (coverageDays < 5) return null;

      const hasProtein = allItems.some(i =>
        (i.category || '').toLowerCase().includes('protein')
      );
      const hasProduce = allItems.some(i =>
        (i.category || '').toLowerCase().includes('produce')
      );

      const totalSavePrice = storeStacks.reduce((sum, s) => sum + s.save_price, 0);
      const totalPayPrice  = storeStacks.reduce((sum, s) => sum + s.pay_price,  0);

      return {
        id:           `7day_${storeName}`,
        retailer:     storeName,
        title:        `Complete 7-Day ${storeName} Haul`,
        pay_price:    totalPayPrice,
        save_price:   totalSavePrice,
        items:        allItems,
        days:         coverageDays,
        hasBreakfast: breakfastItems.length >= members * 2,
        hasProtein,
        hasProduce,
      };
    }).filter(Boolean).sort((a, b) => b.days - a.days);
  }, [rawStacks, profile]);

  const handleAddToCart = useCallback(async (bundle) => {
    const result = await addBundleToCart(bundle);
    if (result === 'already_added') {
      Alert.alert('Already in cart', `${bundle.title} is already in your cart.`);
    } else if (result === 'added') {
      setAddedIds(prev => new Set([...prev, bundle.id]));
      Alert.alert('Added to cart', `${bundle.retailer} bundle added. Tap the Snippd tab to view your cart.`);
    } else {
      Alert.alert('Error', 'Could not add to cart. Please try again.');
    }
  }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.green} /></View>;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerLabel}>SAVINGS STRATEGY</Text>
          <Feather name="info" size={16} color={COLORS.grey} />
        </View>
        <Text style={styles.budgetAmount}>
          ${(profile?.weekly_budget / 100 || 150).toFixed(0)} Weekly Budget Target
        </Text>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Trending Bundles</Text>
        <Text style={styles.subtitle}>
          Explore all available deals, bundles, and weekly foundations.
        </Text>

        {omniComparisonEnabled && (
          <TouchableOpacity
            style={styles.compareCard}
            activeOpacity={0.88}
            onPress={() => navigation.navigate('OmniStoreComparison')}
          >
            <View style={styles.compareIcon}>
              <Feather name="git-compare" size={18} color={COLORS.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.compareTitle}>Compare Same Items</Text>
              <Text style={styles.compareSub}>
                {enginePayload?.top_stores?.length
                  ? enginePayload.top_stores.map(store => store.retailer_key).join(', ')
                  : 'Top stores sync from the verified engine'}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={COLORS.grey} />
          </TouchableOpacity>
        )}

        {sevenDayStrategies.length === 0 && (
          <View style={styles.emptyWrap}>
            <Feather name="inbox" size={32} color={COLORS.grey} />
            <Text style={styles.emptyTxt}>No bundles available yet.</Text>
            <Text style={styles.emptySub}>
              Check back after circulars are uploaded for this week.
            </Text>
          </View>
        )}

        {sevenDayStrategies.map(bundle => {
          const isAdded = addedIds.has(bundle.id);
          return (
            <TouchableOpacity
              key={bundle.id}
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('StackDetail', { stack: bundle })}
            >
              {/* CARD HEADER */}
              <View style={styles.cardHeader}>
                <View style={[
                  styles.badge,
                  { backgroundColor: bundle.retailer === 'Publix' ? COLORS.blue : COLORS.navy },
                ]}>
                  <Text style={styles.badgeTxt}>{bundle.retailer.toUpperCase()}</Text>
                </View>
                <View style={styles.coverageRow}>
                  <MaterialCommunityIcons name="calendar-check" size={14} color={COLORS.green} />
                  <Text style={styles.coverageTxt}>{bundle.days} DAYS OF FOOD</Text>
                </View>
              </View>

              <Text style={styles.cardTitle}>{bundle.title}</Text>

              {/* TEASER TAGS */}
              <View style={styles.teaserRow}>
                <Text style={styles.teaserLabel}>Includes: </Text>
                {bundle.hasProtein  && <View style={styles.tag}><Text style={styles.tagText}>🍗 Protein</Text></View>}
                {bundle.hasProduce  && <View style={styles.tag}><Text style={styles.tagText}>🥦 Produce</Text></View>}
                {bundle.hasBreakfast && <View style={styles.tag}><Text style={styles.tagText}>🍳 Breakfast</Text></View>}
                <Text style={styles.plusMore}>
                  {bundle.items.length > 3 ? `+${bundle.items.length - 3} more` : ''}
                </Text>
              </View>

              {/* Confidence badge */}
              {bundle.confidence_pct != null && (
                <View style={[
                  styles.confidenceBadge,
                  bundle.confidence_pct >= 85 ? styles.confHigh :
                  bundle.confidence_pct >= 70 ? styles.confMed  : styles.confLow,
                ]}>
                  <Feather
                    name={bundle.confidence_pct >= 85 ? 'shield' : bundle.confidence_pct >= 70 ? 'info' : 'alert-circle'}
                    size={11}
                    color={bundle.confidence_pct >= 85 ? '#0C7A3D' : bundle.confidence_pct >= 70 ? '#92400E' : '#991B1B'}
                  />
                  <Text style={[
                    styles.confidenceTxt,
                    bundle.confidence_pct >= 85 ? { color: '#0C7A3D' } :
                    bundle.confidence_pct >= 70 ? { color: '#92400E' } : { color: '#991B1B' },
                  ]}>
                    {bundle.user_badge === 'confirmed'       ? 'Confirmed'          :
                     bundle.user_badge === 'likely'          ? 'Likely'             :
                     bundle.user_badge === 'verify_locally'  ? 'Verify Locally'     :
                     bundle.user_badge === 'price_may_vary'  ? 'Price May Vary'     :
                     bundle.confidence_pct >= 85             ? 'Confirmed'          :
                     bundle.confidence_pct >= 70             ? 'Likely'             : 'Verify Locally'}
                  </Text>
                </View>
              )}

              {/* FOOTER: savings + price + buttons */}
              <View style={styles.cardFooter}>
                <View style={styles.savingsBox}>
                  <Text style={styles.footerLabel}>YOU SAVE</Text>
                  <Text style={[styles.footerPrice, { color: COLORS.green }]}>
                    ${bundle.save_price.toFixed(0)}
                  </Text>
                </View>

                <View style={styles.priceBox}>
                  <Text style={styles.footerLabel}>AT TILL</Text>
                  <Text style={styles.footerPrice}>${bundle.pay_price.toFixed(0)}</Text>
                </View>

                <View style={styles.btnCol}>
                  <TouchableOpacity
                    style={styles.selectBtn}
                    onPress={() => navigation.navigate('StackDetail', { stack: bundle })}
                  >
                    <Text style={styles.selectBtnTxt}>View Meals</Text>
                    <Feather name="chevron-right" size={15} color={COLORS.white} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cartBtn, isAdded && styles.cartBtnDone]}
                    onPress={() => !isAdded && handleAddToCart(bundle)}
                    activeOpacity={isAdded ? 1 : 0.8}
                  >
                    <Feather
                      name={isAdded ? 'check' : 'shopping-cart'}
                      size={14}
                      color={isAdded ? COLORS.green : COLORS.grey}
                    />
                    <Text style={[styles.cartBtnTxt, isAdded && styles.cartBtnTxtDone]}>
                      {isAdded ? 'Added' : 'Add to cart'}
                    </Text>
                  </TouchableOpacity>
                </View>
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
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    padding: 25, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerLabel: {
    fontSize: 10, fontWeight: '900', color: COLORS.grey, letterSpacing: 1.5,
  },
  budgetAmount: {
    fontSize: 18, fontWeight: '800', color: COLORS.green, marginTop: 4,
  },

  scroll: { padding: 20 },
  title: { fontSize: 28, fontWeight: '900', color: COLORS.navy },
  subtitle: { fontSize: 15, color: COLORS.grey, marginBottom: 25, lineHeight: 22 },

  compareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  compareIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compareTitle: { fontSize: 15, fontWeight: '900', color: COLORS.navy },
  compareSub: { fontSize: 11, color: COLORS.grey, marginTop: 3, lineHeight: 16 },

  emptyWrap: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyTxt:  { fontSize: 16, fontWeight: '700', color: COLORS.navy },
  emptySub:  { fontSize: 13, color: COLORS.grey, textAlign: 'center', lineHeight: 19 },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 28, padding: 20, marginBottom: 20,
    elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 15,
  },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  badgeTxt: { color: COLORS.white, fontWeight: '900', fontSize: 10, letterSpacing: 0.5 },
  coverageRow: { flexDirection: 'row', alignItems: 'center' },
  coverageTxt: { color: COLORS.green, fontWeight: '900', fontSize: 11, marginLeft: 5 },

  cardTitle: { fontSize: 20, fontWeight: '900', color: COLORS.navy, marginBottom: 12 },

  teaserRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 20, flexWrap: 'wrap',
  },
  teaserLabel: { fontSize: 12, fontWeight: '700', color: COLORS.grey },
  tag: {
    backgroundColor: COLORS.bg, paddingHorizontal: 8,
    paddingVertical: 4, borderRadius: 6, marginRight: 6,
  },
  tagText: { fontSize: 11, fontWeight: '700', color: COLORS.navy },
  plusMore: { fontSize: 11, color: COLORS.grey, fontWeight: '600' },

  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16,
  },
  footerLabel: { fontSize: 9, fontWeight: '900', color: COLORS.grey, marginBottom: 2 },
  footerPrice: { fontSize: 22, fontWeight: '900', color: COLORS.navy },
  savingsBox:  { flex: 1 },
  priceBox: {
    flex: 1, alignItems: 'center',
    borderLeftWidth: 1, borderLeftColor: COLORS.border,
    borderRightWidth: 1, borderRightColor: COLORS.border,
  },

  btnCol: { flexDirection: 'column', gap: 8, alignItems: 'flex-end', marginLeft: 12 },

  selectBtn: {
    backgroundColor: COLORS.green, paddingHorizontal: 14,
    paddingVertical: 10, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  selectBtnTxt: { color: COLORS.white, fontWeight: '900', fontSize: 12 },

  cartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  cartBtnDone:    { borderColor: COLORS.green, backgroundColor: '#F0FDF4' },
  cartBtnTxt:     { fontSize: 11, fontWeight: '700', color: COLORS.grey },
  cartBtnTxtDone: { color: COLORS.green },
  // Confidence badges
  confidenceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 10 },
  confHigh: { backgroundColor: '#F0FDF4' },
  confMed:  { backgroundColor: '#FFFBEB' },
  confLow:  { backgroundColor: '#FEF2F2' },
  confidenceTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});
