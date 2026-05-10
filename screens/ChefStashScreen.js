import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { buildBundles, findSwaps } from '../src/lib/bundleBuilder';

// ── Brand colors ──────────────────────────────────────────────────────────────

const C = {
  primaryGreen: '#0C9E54',
  deepGreen:    '#004B28',
  darkSection:  '#04361D',
  darkNavy:     '#172250',
  softGreen:    '#C5FFBC',
  alertCoral:   '#FB5B5B',
  bg:           '#F7FAF8',
  white:        '#FFFFFF',
  border:       '#E2E8F0',
  grey:         '#64748B',
  lightGrey:    '#F1F5F9',
  amber:        '#F59E0B',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCents(cents) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function confidenceColor(label) {
  if (label === 'High')   return { bg: '#DCFCE7', text: '#166534' };
  if (label === 'Medium') return { bg: '#FEF9C3', text: '#854D0E' };
  return                         { bg: '#F1F5F9', text: '#475569' };
}

function dealTypeBadge(dealType) {
  switch (dealType) {
    case 'bogo':     return { label: 'BOGO',     bg: '#EFF6FF', text: '#1E40AF' };
    case 'multibuy': return { label: 'MULTI',    bg: '#FDF4FF', text: '#7E22CE' };
    case 'coupon':   return { label: 'COUPON',   bg: '#FFF7ED', text: '#9A3412' };
    case 'sale':     return { label: 'SALE',     bg: '#F0FDF4', text: '#166534' };
    default:         return { label: 'DEAL',     bg: '#F8FAFC', text: '#475569' };
  }
}

// ── Sub-component render helpers (plain functions, not React components) ──────

function renderNutritionRow(nutrition) {
  if (!nutrition) return null;
  const { calories, protein, carbs, fat } = nutrition;
  if (calories == null && protein == null) return null;
  return (
    <View style={styles.nutritionRow}>
      {calories != null && (
        <View style={styles.nutritionPill}>
          <Text style={styles.nutritionVal}>{calories}</Text>
          <Text style={styles.nutritionLbl}>cal</Text>
        </View>
      )}
      {protein != null && (
        <View style={styles.nutritionPill}>
          <Text style={styles.nutritionVal}>{protein}g</Text>
          <Text style={styles.nutritionLbl}>protein</Text>
        </View>
      )}
      {carbs != null && (
        <View style={styles.nutritionPill}>
          <Text style={styles.nutritionVal}>{carbs}g</Text>
          <Text style={styles.nutritionLbl}>carbs</Text>
        </View>
      )}
      {fat != null && (
        <View style={styles.nutritionPill}>
          <Text style={styles.nutritionVal}>{fat}g</Text>
          <Text style={styles.nutritionLbl}>fat</Text>
        </View>
      )}
    </View>
  );
}

function renderBundleCard(bundle, isSelected, nutritionMap, onSelect) {
  const confColor = confidenceColor(bundle.confidence);
  const nutrition = bundle.items.length > 0
    ? nutritionMap[bundle.items[0].product_name]
    : null;
  return (
    <TouchableOpacity
      key={bundle.id}
      style={[styles.bundleCard, isSelected && styles.bundleCardSelected]}
      onPress={() => onSelect(bundle.id)}
      activeOpacity={0.88}
    >
      {/* Header row */}
      <View style={styles.bundleCardHeader}>
        <View style={styles.retailerPill}>
          <Text style={styles.retailerPillTxt}>{bundle.retailer.toUpperCase()}</Text>
        </View>
        <View style={[styles.confidencePill, { backgroundColor: confColor.bg }]}>
          <Text style={[styles.confidenceTxt, { color: confColor.text }]}>
            {bundle.confidence} Confidence
          </Text>
        </View>
      </View>

      <Text style={styles.bundleTitle}>{bundle.title}</Text>

      {/* Items preview */}
      <View style={styles.itemsPreview}>
        {bundle.items.slice(0, 4).map((item, i) => (
          <Text key={`${item.id}-${i}`} style={styles.itemPreviewTxt} numberOfLines={1}>
            · {item.product_name}{item.brand ? ` (${item.brand})` : ''}
          </Text>
        ))}
        {bundle.items.length > 4 && (
          <Text style={styles.itemPreviewMore}>+{bundle.items.length - 4} more</Text>
        )}
      </View>

      {/* Nutrition (USDA enrichment — optional) */}
      {renderNutritionRow(nutrition)}

      {/* Price row */}
      <View style={styles.bundlePriceRow}>
        <View>
          <Text style={styles.priceLabel}>YOU PAY</Text>
          <Text style={styles.priceValue}>{fmtCents(bundle.totalCents)}</Text>
        </View>
        {bundle.savingsCents != null && bundle.savingsCents > 0 && (
          <View style={styles.savingsBadge}>
            <Feather name="tag" size={11} color={C.primaryGreen} />
            <Text style={styles.savingsBadgeTxt}>
              Save {fmtCents(bundle.savingsCents)}
            </Text>
          </View>
        )}
        <View style={styles.itemCountBadge}>
          <Text style={styles.itemCountTxt}>{bundle.items.length} items</Text>
        </View>
      </View>

      {isSelected && (
        <View style={styles.selectedIndicator}>
          <Feather name="check-circle" size={14} color={C.primaryGreen} />
          <Text style={styles.selectedTxt}>Selected for cart</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function renderSwapCard(swap, index) {
  return (
    <View key={`swap-${index}`} style={styles.swapCard}>
      <View style={styles.swapLeft}>
        <Feather name="refresh-cw" size={16} color={C.amber} />
      </View>
      <View style={styles.swapBody}>
        <Text style={styles.swapHeading} numberOfLines={1}>
          Swap at {swap.swapItem.retailer} and save {fmtCents(swap.savingsCents)}
        </Text>
        <View style={styles.swapRow}>
          <View style={styles.swapItem}>
            <Text style={styles.swapStore}>{swap.currentItem.retailer}</Text>
            <Text style={styles.swapPriceStrike}>
              {fmtCents(swap.currentItem.final_unit_price_cents ?? swap.currentItem.price_cents)}
            </Text>
          </View>
          <Feather name="arrow-right" size={14} color={C.grey} style={{ marginHorizontal: 8 }} />
          <View style={styles.swapItem}>
            <Text style={styles.swapStore}>{swap.swapItem.retailer}</Text>
            <Text style={styles.swapPriceBetter}>
              {fmtCents(swap.swapItem.final_unit_price_cents ?? swap.swapItem.price_cents)}
            </Text>
          </View>
        </View>
        <Text style={styles.swapProductName} numberOfLines={1}>
          {swap.currentItem.product_name}
        </Text>
      </View>
    </View>
  );
}

function renderDealCard(offer) {
  const badge = dealTypeBadge(offer.deal_type);
  return (
    <View key={offer.id} style={styles.dealCard}>
      <View style={styles.dealCardLeft}>
        <Text style={styles.dealProductName} numberOfLines={2}>
          {offer.product_name}
        </Text>
        {offer.brand && (
          <Text style={styles.dealBrand}>{offer.brand}</Text>
        )}
        <View style={styles.dealMeta}>
          <Text style={styles.dealRetailer}>{offer.retailer}</Text>
          <View style={[styles.dealTypePill, { backgroundColor: badge.bg }]}>
            <Text style={[styles.dealTypeTxt, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
      </View>
      <View style={styles.dealCardRight}>
        <Text style={styles.dealPrice}>
          {fmtCents(offer.final_unit_price_cents ?? offer.price_cents)}
        </Text>
        {offer.savings_cents != null && offer.savings_cents > 0 && (
          <View style={styles.dealSavingsBadge}>
            <Text style={styles.dealSavingsTxt}>Save {fmtCents(offer.savings_cents)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChefStashScreen({ navigation }) {
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState(null);
  const [prefs, setPrefs]               = useState(null);
  const [offers, setOffers]             = useState([]);
  const [nutritionMap, setNutritionMap] = useState({});
  const [selectedId, setSelectedId]     = useState(null);

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); setRefreshing(false); return; }

      // Fetch user preferences (non-fatal if missing)
      const { data: prefsData } = await supabase
        .from('user_preferences')
        .select('budget_range, preferred_stores, category_clicks, experience_type')
        .eq('user_id', user.id)
        .maybeSingle();
      setPrefs(prefsData || null);

      // Fetch normalized offers
      const { data: offersData, error: offersError } = await supabase
        .from('normalized_offers')
        .select('id, product_name, brand, retailer, price_cents, final_unit_price_cents, regular_price_cents, savings_cents, confidence_score, category, deal_type')
        .gte('confidence_score', 0.5)
        .not('price_cents', 'is', null)
        .order('savings_cents', { ascending: false, nullsFirst: false })
        .limit(60);

      if (offersError) throw offersError;
      if (!offersData?.length) {
        console.info('[ChefStashScreen] normalized_offers empty; showing deals zero-state', {
          table: 'normalized_offers',
          minConfidence: 0.5,
        });
      }
      setOffers(offersData || []);
    } catch (e) {
      setError('Unable to load deals. Pull down to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // USDA nutrition enrichment — fires after offers load, never blocks UI
  useEffect(() => {
    if (!offers.length) return;
    const names = [...new Set(offers.map(o => o.product_name))].slice(0, 10);
    supabase.functions
      .invoke('enrich-nutrition', { body: { products: names } })
      .then(({ data }) => {
        if (data?.nutrition) setNutritionMap(data.nutrition);
      })
      .catch(() => {}); // Nutrition is optional; silent fail
  }, [offers]);

  // ── Computed values ────────────────────────────────────────────────────────

  const prefs_budget = prefs?.budget_range ?? null;
  const prefs_stores = prefs?.preferred_stores ?? [];
  const prefs_clicks = prefs?.category_clicks ?? {};
  const expType      = prefs?.experience_type ?? 'saver';

  const bundles = useMemo(() => buildBundles(offers, {
    budgetCents:     prefs_budget != null ? prefs_budget * 100 : null,
    preferredStores: prefs_stores,
    categoryClicks:  prefs_clicks,
    experienceType:  expType,
    maxBundles:      3,
  }), [offers, prefs_budget, prefs_stores, prefs_clicks, expType]);

  const swaps = useMemo(() => findSwaps(offers, 3), [offers]);

  const bestDeals = useMemo(() => {
    if (!offers.length) return [];
    const topCats = Object.entries(prefs_clicks)
      .sort(([, a], [, b]) => b - a)
      .map(([k]) => k.toLowerCase());
    const prefStoresLower = prefs_stores.map(s => s.toLowerCase());

    return [...offers]
      .filter(o => o.savings_cents != null && o.savings_cents > 0)
      .sort((a, b) => {
        const ap = prefStoresLower.some(s => a.retailer.toLowerCase().includes(s)) ? 1 : 0;
        const bp = prefStoresLower.some(s => b.retailer.toLowerCase().includes(s)) ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const ac = topCats.some(c => (a.category || '').toLowerCase().includes(c)) ? 1 : 0;
        const bc = topCats.some(c => (b.category || '').toLowerCase().includes(c)) ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return (b.savings_cents || 0) - (a.savings_cents || 0);
      })
      .slice(0, 5);
  }, [offers, prefs_stores, prefs_clicks]);

  const selectedBundle = useMemo(
    () => bundles.find(b => b.id === selectedId) || null,
    [bundles, selectedId],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSelectBundle(bundleId) {
    setSelectedId(prev => prev === bundleId ? null : bundleId);
  }

  function handleAddToCart() {
    if (!selectedBundle) return;
    console.info('[ChefStashScreen] add-to-cart requested', {
      bundle_id: selectedBundle.id,
      item_count: selectedBundle.items?.length || 0,
    });
    // TODO: wire to addItemsToActiveCart when cart integration is ready
  }

  function handleRefresh() {
    setRefreshing(true);
    loadData();
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.primaryGreen} />
        <Text style={styles.loadingTxt}>Building your meal plan...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Feather name="alert-circle" size={32} color={C.alertCoral} />
        <Text style={styles.errorTxt}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
          <Text style={styles.retryBtnTxt}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasContent = bundles.length > 0 || bestDeals.length > 0;

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="chevron-left" size={24} color={C.softGreen} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>ChefStash</Text>
            <Text style={styles.headerSub}>Personalized meals built from real savings.</Text>
          </View>
          {prefs && (
            <View style={styles.personalizedBadge}>
              <Feather name="user-check" size={12} color={C.softGreen} />
              <Text style={styles.personalizedBadgeTxt}>For You</Text>
            </View>
          )}
        </View>
        {prefs_budget != null && (
          <View style={styles.budgetStrip}>
            <Feather name="dollar-sign" size={13} color={C.softGreen} />
            <Text style={styles.budgetTxt}>
              Weekly budget: ${prefs_budget} · {expType} mode
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.primaryGreen}
          />
        }
      >
        {!hasContent ? (
          /* ── Empty state ─────────────────────────────────────────────────── */
          <View style={styles.emptyState}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeTxt}>Waiting for weekly deals</Text>
            </View>
            <Feather name="shopping-bag" size={48} color={C.border} />
            <Text style={styles.emptyTitle}>Chef Stash is waiting on verified offers</Text>
            <Text style={styles.emptySub}>
              Snippd could not find qualifying rows in normalized_offers. This appears when retailer ingestion has not published current, confident offers for your stores.
            </Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity style={styles.emptyPrimaryBtn} onPress={() => navigation.getParent?.()?.navigate('ProfileTab')} activeOpacity={0.86}>
                <Text style={styles.emptyPrimaryTxt}>Build profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emptyGhostBtn} onPress={handleRefresh} activeOpacity={0.86}>
                <Text style={styles.emptyGhostTxt}>Check back after weekly deals refresh</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* ── Weekly Plan ────────────────────────────────────────────────── */}
            {bundles.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Feather name="calendar" size={16} color={C.darkNavy} />
                  <Text style={styles.sectionTitle}>Weekly Plan</Text>
                  <Text style={styles.sectionCount}>{bundles.length} bundles</Text>
                </View>
                <Text style={styles.sectionSub}>Tap a bundle to select it for your cart.</Text>
                {bundles.map(bundle =>
                  renderBundleCard(
                    bundle,
                    selectedId === bundle.id,
                    nutritionMap,
                    handleSelectBundle,
                  )
                )}
              </View>
            )}

            {/* ── Smart Swaps ────────────────────────────────────────────────── */}
            {swaps.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Feather name="refresh-cw" size={16} color={C.amber} />
                  <Text style={styles.sectionTitle}>Smart Swaps</Text>
                </View>
                <Text style={styles.sectionSub}>Same item, lower price at a different store.</Text>
                {swaps.map((swap, i) => renderSwapCard(swap, i))}
              </View>
            )}

            {/* ── Best Deals for You ─────────────────────────────────────────── */}
            {bestDeals.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Feather name="trending-up" size={16} color={C.primaryGreen} />
                  <Text style={styles.sectionTitle}>Best Deals for You</Text>
                </View>
                <Text style={styles.sectionSub}>
                  {prefs_stores.length > 0
                    ? `Ranked for ${prefs_stores.slice(0, 2).join(' & ')}.`
                    : 'Sorted by savings.'}
                </Text>
                {bestDeals.map(offer => renderDealCard(offer))}
              </View>
            )}

            {/* ── Quick Add ──────────────────────────────────────────────────── */}
            <View style={styles.quickAddSection}>
              <TouchableOpacity
                style={[styles.quickAddBtn, !selectedBundle && styles.quickAddBtnDisabled]}
                onPress={handleAddToCart}
                disabled={!selectedBundle}
                activeOpacity={0.88}
              >
                <Feather
                  name="shopping-cart"
                  size={18}
                  color={selectedBundle ? C.white : C.grey}
                />
                <Text style={[styles.quickAddTxt, !selectedBundle && styles.quickAddTxtDisabled]}>
                  {selectedBundle
                    ? `Add "${selectedBundle.title}" to cart`
                    : 'Select a plan above to add to cart'}
                </Text>
              </TouchableOpacity>
              {selectedBundle && (
                <Text style={styles.quickAddSub}>
                  {selectedBundle.items.length} items · {fmtCents(selectedBundle.totalCents)}
                  {selectedBundle.savingsCents
                    ? ` · You save ${fmtCents(selectedBundle.savingsCents)}`
                    : ''}
                </Text>
              )}
            </View>

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Header
  header: {
    backgroundColor: C.deepGreen,
    paddingBottom: 14,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  backBtn: { padding: 4, marginRight: 2 },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: C.white },
  headerSub:   { fontSize: 12, color: C.softGreen, marginTop: 2 },
  personalizedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(197,255,188,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  personalizedBadgeTxt: { fontSize: 10, fontWeight: '700', color: C.softGreen },
  budgetStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 4,
  },
  budgetTxt: { fontSize: 11, color: 'rgba(197,255,188,0.8)', fontWeight: '600' },

  // Body
  body: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20 },

  // Section
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.darkNavy,
    flex: 1,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '600',
    color: C.grey,
  },
  sectionSub: {
    fontSize: 12,
    color: C.grey,
    marginBottom: 12,
  },

  // Bundle card
  bundleCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  bundleCardSelected: {
    borderColor: C.primaryGreen,
    shadowColor: C.primaryGreen,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  bundleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  retailerPill: {
    backgroundColor: C.deepGreen,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  retailerPillTxt: { fontSize: 10, fontWeight: '900', color: C.white },
  confidencePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  confidenceTxt: { fontSize: 10, fontWeight: '700' },
  bundleTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.darkNavy,
    marginBottom: 10,
  },
  itemsPreview: { marginBottom: 10 },
  itemPreviewTxt: { fontSize: 12, color: C.grey, marginBottom: 2, lineHeight: 18 },
  itemPreviewMore: { fontSize: 11, color: C.primaryGreen, fontWeight: '600', marginTop: 2 },

  // Bundle price row
  bundlePriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.lightGrey,
  },
  priceLabel: { fontSize: 9, fontWeight: '900', color: C.grey, letterSpacing: 0.5 },
  priceValue: { fontSize: 26, fontWeight: '900', color: C.darkNavy },
  savingsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  savingsBadgeTxt: { fontSize: 12, fontWeight: '700', color: C.primaryGreen },
  itemCountBadge: {
    backgroundColor: C.lightGrey,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  itemCountTxt: { fontSize: 11, fontWeight: '600', color: C.grey },
  selectedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  selectedTxt: { fontSize: 12, fontWeight: '700', color: C.primaryGreen },

  // Nutrition row
  nutritionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  nutritionPill: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  nutritionVal: { fontSize: 12, fontWeight: '700', color: C.darkNavy },
  nutritionLbl: { fontSize: 9,  fontWeight: '600', color: C.grey },

  // Swap card
  swapCard: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    alignItems: 'flex-start',
    gap: 12,
  },
  swapLeft: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF9C3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapBody: { flex: 1 },
  swapHeading: { fontSize: 13, fontWeight: '700', color: C.darkNavy, marginBottom: 6 },
  swapRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  swapItem: { alignItems: 'center' },
  swapStore: { fontSize: 10, color: C.grey, fontWeight: '600' },
  swapPriceStrike: { fontSize: 14, color: C.alertCoral, textDecorationLine: 'line-through', fontWeight: '700' },
  swapPriceBetter: { fontSize: 14, color: C.primaryGreen, fontWeight: '800' },
  swapProductName: { fontSize: 11, color: C.grey },

  // Deal card
  dealCard: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  dealCardLeft: { flex: 1, paddingRight: 8 },
  dealCardRight: { alignItems: 'flex-end', minWidth: 80 },
  dealProductName: { fontSize: 13, fontWeight: '700', color: C.darkNavy, marginBottom: 2 },
  dealBrand:  { fontSize: 11, color: '#5C6BC0', marginBottom: 4 },
  dealMeta:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dealRetailer: { fontSize: 11, color: C.grey, fontWeight: '600' },
  dealTypePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  dealTypeTxt:  { fontSize: 9, fontWeight: '800' },
  dealPrice: { fontSize: 18, fontWeight: '900', color: C.primaryGreen },
  dealSavingsBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
  },
  dealSavingsTxt: { fontSize: 10, fontWeight: '700', color: C.primaryGreen },

  // Quick Add
  quickAddSection: { marginTop: 8, marginBottom: 8 },
  quickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primaryGreen,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  quickAddBtnDisabled: { backgroundColor: C.lightGrey },
  quickAddTxt: { fontSize: 15, fontWeight: '800', color: C.white },
  quickAddTxtDisabled: { color: C.grey },
  quickAddSub: {
    textAlign: 'center',
    fontSize: 12,
    color: C.grey,
    marginTop: 8,
  },

  // Empty / error states
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  statusBadge: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 14 },
  statusBadgeTxt: { fontSize: 10, fontWeight: '900', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.darkNavy, marginTop: 16 },
  emptySub:   { fontSize: 13, color: C.grey, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyActions: { alignItems: 'center', gap: 8, marginTop: 16 },
  emptyPrimaryBtn: { backgroundColor: C.primaryGreen, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  emptyPrimaryTxt: { color: C.white, fontSize: 12, fontWeight: '900' },
  emptyGhostBtn: { backgroundColor: C.white, borderColor: C.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  emptyGhostTxt: { color: C.deepGreen, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  loadingTxt: { fontSize: 13, color: C.grey, marginTop: 16 },
  errorTxt:   { fontSize: 14, color: C.alertCoral, marginTop: 12, textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    backgroundColor: C.primaryGreen,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnTxt: { fontSize: 14, fontWeight: '700', color: C.white },
});
