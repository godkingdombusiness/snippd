import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const PALE_GREEN = '#F0FDF4';
const BORDER = '#F0F1F3';
const AMBER = '#F59E0B';
const RED = '#EF4444';

const SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

const SHADOW_SM = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};

const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

const STORE_DETAILS = {
  publix: {
    label: 'Publix',
    color: GREEN,
    reason: 'Best source for protein, produce, and BOGO deals this week. Digital coupons available in the Publix app.',
    timing: 'Go first — fresh items should be purchased last for quality.',
    appTip: 'Clip digital coupons in the Publix app before you go.',
  },
  dollar_general: {
    label: 'Dollar General',
    color: AMBER,
    reason: 'Best prices on household essentials, pantry staples, and cleaning products this week.',
    timing: 'Go second — quick in and out for non-perishables.',
    appTip: 'Load DG Cash offers in the Dollar General app for extra savings.',
  },
  aldi: {
    label: 'Aldi',
    color: '#3B82F6',
    reason: 'Everyday low prices on produce, dairy, and pantry staples. No loyalty card needed.',
    timing: 'Bring quarters for cart rental. Bags are not included.',
    appTip: 'No app required — prices are already the lowest in store.',
  },
  target: {
    label: 'Target',
    color: RED,
    reason: 'Target Circle deals and weekly specials on household and snack items.',
    timing: 'Check Target Circle app before shopping for extra circle offers.',
    appTip: 'Scan your Target Circle barcode at checkout for automatic savings.',
  },
  walgreens: {
    label: 'Walgreens',
    color: RED,
    reason: 'myWalgreens cash rewards and weekly specials on personal care and household items.',
    timing: 'Check weekly ad for bonus rewards items before your trip.',
    appTip: 'Clip digital coupons in the myWalgreens app before checkout.',
  },
  sprouts: {
    label: 'Sprouts',
    color: GREEN,
    reason: 'Weekly specials on organic produce, natural proteins, and specialty items.',
    timing: 'Shop Wednesday for the overlap between old and new weekly sales.',
    appTip: 'Check the Sprouts app for digital coupons and weekly ad.',
  },
};

const getStoreDetails = (storeKey) => {
  const key = (storeKey || '').toLowerCase().replace(/\s/g, '_');
  return STORE_DETAILS[key] || {
    label: storeKey || 'Store',
    color: NAVY,
    reason: 'Check this store for deals on your list items this week.',
    timing: 'Review the weekly ad before your visit.',
    appTip: 'Download the store app for additional digital savings.',
  };
};

// Default plan when no cart data
const DEFAULT_STOPS = [
  {
    store: 'publix',
    items: 8,
    est_cents: 2800,
    saved_cents: 1200,
  },
  {
    store: 'dollar_general',
    items: 5,
    est_cents: 1800,
    saved_cents: 900,
  },
];

const SAVINGS_TIPS = [
  { title: 'Shop early in the week', desc: 'Wednesday is the best day — old and new weekly deals overlap at most stores.' },
  { title: 'Clip coupons first', desc: 'Always clip all digital coupons before entering the store. They must be pre-loaded to apply.' },
  { title: 'Check your list at the door', desc: 'Review your Snippd list before entering each store to avoid backtracking.' },
  { title: 'Buy only stack items', desc: 'Unplanned purchases are the biggest budget breaker. Stick to your stack.' },
];

export default function ShoppingPlanScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stops, setStops] = useState([]);
  const [expandedStop, setExpandedStop] = useState(null);
  const [weeklyBudget, setWeeklyBudget] = useState(15000);
  const [totalEst, setTotalEst] = useState(0);
  const [totalSaved, setTotalSaved] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  const buildPlan = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStops(DEFAULT_STOPS);
        setLoading(false);
        return;
      }

      // Fetch profile for budget and preferred stores
      const { data: profile } = await supabase
        .from('profiles')
        .select('weekly_budget, preferred_stores')
        .eq('user_id', user.id)
        .single();

      if (profile?.weekly_budget) setWeeklyBudget(profile.weekly_budget);

      // Fetch cart items to build the plan
      const { data: cartItems } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', user.id);

      if (cartItems && cartItems.length > 0) {
        // Group cart items by store
        const storeGroups = {};
        cartItems.forEach(item => {
          const key = item.store || 'other';
          if (!storeGroups[key]) {
            storeGroups[key] = { items: 0, est_cents: 0, saved_cents: 0 };
          }
          storeGroups[key].items += item.qty || 1;
          storeGroups[key].est_cents += (item.sale_price_cents || 0) * (item.qty || 1);
          storeGroups[key].saved_cents += ((item.original_price_cents || 0) - (item.sale_price_cents || 0)) * (item.qty || 1);
        });

        // Convert to stops array, ordered by savings descending
        const planStops = Object.entries(storeGroups)
          .map(([store, data]) => ({ store, ...data }))
          .sort((a, b) => b.saved_cents - a.saved_cents);

        setStops(planStops);
        setTotalEst(planStops.reduce((s, p) => s + p.est_cents, 0));
        setTotalSaved(planStops.reduce((s, p) => s + p.saved_cents, 0));
        setTotalItems(planStops.reduce((s, p) => s + p.items, 0));
      } else {
        // Use preferred stores from profile to build default plan
        const preferredStores = profile?.preferred_stores || ['publix', 'dollar_general'];
        const defaultStops = preferredStores.slice(0, 3).map((store, i) => ({
          store,
          items: i === 0 ? 8 : 5,
          est_cents: i === 0 ? 2800 : 1800,
          saved_cents: i === 0 ? 1200 : 900,
        }));
        setStops(defaultStops.length > 0 ? defaultStops : DEFAULT_STOPS);
        setTotalEst(defaultStops.reduce((s, p) => s + p.est_cents, 4600));
        setTotalSaved(defaultStops.reduce((s, p) => s + p.saved_cents, 2100));
        setTotalItems(defaultStops.reduce((s, p) => s + p.items, 13));
      }
    } catch (e) {
      
      setStops(DEFAULT_STOPS);
      setTotalEst(DEFAULT_STOPS.reduce((s, p) => s + p.est_cents, 0));
      setTotalSaved(DEFAULT_STOPS.reduce((s, p) => s + p.saved_cents, 0));
      setTotalItems(DEFAULT_STOPS.reduce((s, p) => s + p.items, 0));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { buildPlan(); }, []);

  const onRefresh = () => { setRefreshing(true); buildPlan(); };

  const budgetPct = Math.min((totalEst / weeklyBudget) * 100, 100);
  const budgetColor = budgetPct > 80 ? RED : budgetPct > 60 ? AMBER : GREEN;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadTxt}>Building your shopping plan...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shopping Plan</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => { setRefreshing(true); buildPlan(); }}
        >
          <Text style={styles.refreshBtnTxt}>↻</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
        }
      >

        {/* ── HERO SUMMARY ────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>YOUR OPTIMAL ROUTE</Text>
            <Text style={styles.heroTitle}>
              {stops.map(s => getStoreDetails(s.store).label).join(' then ')}
            </Text>
            <Text style={styles.heroSub}>
              Based on this week's deals and your shopping list
            </Text>

            {/* Stats */}
            <View style={styles.heroStats}>
              {[
                { val: String(stops.length), label: 'Stops' },
                { val: String(totalItems), label: 'Items' },
                { val: fmt(totalEst), label: 'Estimated' },
                { val: fmt(totalSaved), label: 'Savings' },
              ].map((stat, i) => (
                <React.Fragment key={i}>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatVal}>{stat.val}</Text>
                    <Text style={styles.heroStatLabel}>{stat.label}</Text>
                  </View>
                  {i < 3 && <View style={styles.heroStatDivider} />}
                </React.Fragment>
              ))}
            </View>

            {/* Budget bar */}
            <View style={styles.heroBudgetWrap}>
              <View style={styles.heroBudgetTrack}>
                <View style={[styles.heroBudgetFill, {
                  width: `${budgetPct}%`,
                  backgroundColor: WHITE,
                  opacity: budgetPct > 80 ? 1 : 0.8,
                }]} />
              </View>
              <Text style={styles.heroBudgetTxt}>
                {fmt(totalEst)} of {fmt(weeklyBudget)} weekly budget
              </Text>
            </View>
          </View>
        </View>

        {/* ── ROUTE VISUAL ────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Shopping Route</Text>

          {/* Route connector */}
          <View style={styles.routeWrap}>
            {stops.map((stop, index) => {
              const storeDetails = getStoreDetails(stop.store);
              const isExpanded = expandedStop === index;
              const isLast = index === stops.length - 1;

              return (
                <View key={index} style={styles.routeStop}>
                  {/* Connector line */}
                  {!isLast && <View style={styles.routeConnector} />}

                  {/* Stop card */}
                  <TouchableOpacity
                    style={[
                      styles.stopCard,
                      isExpanded && styles.stopCardExpanded,
                      { borderLeftColor: storeDetails.color },
                    ]}
                    onPress={() => setExpandedStop(isExpanded ? null : index)}
                    activeOpacity={0.85}
                  >
                    {/* Stop header */}
                    <View style={styles.stopHeader}>
                      <View style={[styles.stopNum, { backgroundColor: storeDetails.color }]}>
                        <Text style={styles.stopNumTxt}>{index + 1}</Text>
                      </View>
                      <View style={styles.stopHeaderInfo}>
                        <Text style={[styles.stopStore, { color: storeDetails.color }]}>
                          {storeDetails.label}
                        </Text>
                        <Text style={styles.stopMeta}>
                          {stop.items} item{stop.items !== 1 ? 's' : ''} · Est. {fmt(stop.est_cents)}
                        </Text>
                      </View>
                      <View style={styles.stopRight}>
                        <View style={styles.stopSavedBadge}>
                          <Text style={styles.stopSavedTxt}>
                            Save {fmt(stop.saved_cents)}
                          </Text>
                        </View>
                        <Text style={styles.stopChevron}>{isExpanded ? '↑' : '↓'}</Text>
                      </View>
                    </View>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <View style={styles.stopDetail}>
                        <View style={styles.stopDetailDivider} />

                        {/* Why this store */}
                        <Text style={styles.stopDetailLabel}>WHY THIS STORE</Text>
                        <Text style={styles.stopDetailTxt}>{storeDetails.reason}</Text>

                        {/* Timing tip */}
                        <View style={styles.stopTipBox}>
                          <View style={styles.stopTipDot} />
                          <View>
                            <Text style={styles.stopTipLabel}>TIMING TIP</Text>
                            <Text style={styles.stopTipTxt}>{storeDetails.timing}</Text>
                          </View>
                        </View>

                        {/* App tip */}
                        <View style={[styles.stopTipBox, { backgroundColor: LIGHT_GREEN, borderColor: '#A7F3D0' }]}>
                          <View style={[styles.stopTipDot, { backgroundColor: GREEN }]} />
                          <View>
                            <Text style={[styles.stopTipLabel, { color: GREEN }]}>APP TIP</Text>
                            <Text style={styles.stopTipTxt}>{storeDetails.appTip}</Text>
                          </View>
                        </View>

                        {/* Savings breakdown */}
                        <View style={styles.stopBreakdown}>
                          <View style={styles.stopBreakdownRow}>
                            <Text style={styles.stopBreakdownLabel}>Items at this stop</Text>
                            <Text style={styles.stopBreakdownVal}>{stop.items}</Text>
                          </View>
                          <View style={styles.stopBreakdownRow}>
                            <Text style={styles.stopBreakdownLabel}>Estimated total</Text>
                            <Text style={styles.stopBreakdownVal}>{fmt(stop.est_cents)}</Text>
                          </View>
                          <View style={styles.stopBreakdownRow}>
                            <Text style={styles.stopBreakdownLabel}>Snippd savings</Text>
                            <Text style={[styles.stopBreakdownVal, { color: GREEN }]}>
                              -{fmt(stop.saved_cents)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── SAVINGS TIPS ────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Savings Tips for This Trip</Text>
          <View style={styles.card}>
            {SAVINGS_TIPS.map((tip, i) => (
              <View
                key={i}
                style={[
                  styles.tipRow,
                  i === SAVINGS_TIPS.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={styles.tipNum}>
                  <Text style={styles.tipNumTxt}>{i + 1}</Text>
                </View>
                <View style={styles.tipInfo}>
                  <Text style={styles.tipTitle}>{tip.title}</Text>
                  <Text style={styles.tipDesc}>{tip.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── TRIP SUMMARY ────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Estimated Trip Summary</Text>

            {stops.map((stop, i) => {
              const storeDetails = getStoreDetails(stop.store);
              return (
                <View key={i} style={styles.summaryRow}>
                  <View style={[styles.summaryDot, { backgroundColor: storeDetails.color }]} />
                  <Text style={styles.summaryLabel}>
                    {storeDetails.label} ({stop.items} items)
                  </Text>
                  <Text style={styles.summaryVal}>{fmt(stop.est_cents)}</Text>
                </View>
              );
            })}

            <View style={styles.summaryDivider} />

            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotalLabel}>Total Estimated</Text>
              <Text style={styles.summaryTotalVal}>{fmt(totalEst)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryTotalLabel, { color: GREEN }]}>Total Savings</Text>
              <Text style={[styles.summaryTotalVal, { color: GREEN }]}>
                -{fmt(totalSaved)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── ACTION BUTTONS ──────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('SnippdTab')}
          >
            <Text style={styles.primaryBtnTxt}>Build My Cart from This Plan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('List')}
          >
            <Text style={styles.secondaryBtnTxt}>View My Shopping List</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => navigation.navigate('ReceiptUpload')}
          >
            <Text style={styles.ghostBtnTxt}>Verify a Receipt</Text>
          </TouchableOpacity>
        </View>

        {/* ── COMMUNITY MISSION ───────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.missionCard}>
            <Text style={styles.missionEyebrow}>COMMUNITY MISSION</Text>
            <Text style={styles.missionAmt}>$0 of $1,000,000,000</Text>
            <View style={styles.missionBar}>
              <View style={[styles.missionFill, { width: '0%' }]} />
            </View>
            <Text style={styles.missionSub}>
              Verify your receipt after this trip to contribute
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE, gap: 12 },
  loadTxt: { fontSize: 14, color: GRAY },
  pad: { paddingHorizontal: 16, marginTop: 16 },

  // HEADER
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  backBtnTxt: { fontSize: 24, color: NAVY, fontWeight: 'normal', lineHeight: 30 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  refreshBtnTxt: { fontSize: 18, color: NAVY },

  // HERO CARD
  heroCard: {
    backgroundColor: GREEN, borderRadius: 20, padding: 20, ...SHADOW,
  },
  heroEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.5, marginBottom: 6,
  },
  heroTitle: {
    fontSize: 20, fontWeight: 'bold', color: WHITE,
    lineHeight: 26, marginBottom: 4,
  },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 16 },
  heroStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, padding: 14, marginBottom: 14,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 17, fontWeight: 'bold', color: WHITE, marginBottom: 3 },
  heroStatLabel: { fontSize: 9, color: 'rgba(255,255,255,0.75)' },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 4 },
  heroBudgetWrap: {},
  heroBudgetTrack: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2, marginBottom: 6, overflow: 'hidden',
  },
  heroBudgetFill: { height: 4, borderRadius: 2 },
  heroBudgetTxt: { fontSize: 11, color: 'rgba(255,255,255,0.75)' },

  // SECTION
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 12 },

  // ROUTE
  routeWrap: { position: 'relative' },
  routeStop: { position: 'relative', marginBottom: 12 },
  routeConnector: {
    position: 'absolute',
    left: 19,
    top: 56,
    width: 2,
    bottom: -12,
    backgroundColor: BORDER,
    zIndex: 0,
  },

  // STOP CARDS
  stopCard: {
    backgroundColor: WHITE, borderRadius: 18,
    borderWidth: 1, borderColor: BORDER,
    borderLeftWidth: 4,
    overflow: 'hidden', ...SHADOW,
    zIndex: 1,
  },
  stopCardExpanded: { borderColor: GREEN },
  stopHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12,
  },
  stopNum: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  stopNumTxt: { color: WHITE, fontSize: 16, fontWeight: 'bold' },
  stopHeaderInfo: { flex: 1 },
  stopStore: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  stopMeta: { fontSize: 12, color: GRAY },
  stopRight: { alignItems: 'flex-end', gap: 6 },
  stopSavedBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  stopSavedTxt: { fontSize: 11, fontWeight: 'bold', color: GREEN },
  stopChevron: { fontSize: 14, color: GRAY },

  // STOP DETAIL
  stopDetail: { paddingHorizontal: 16, paddingBottom: 16 },
  stopDetailDivider: { height: 1, backgroundColor: BORDER, marginBottom: 14 },
  stopDetailLabel: {
    fontSize: 9, fontWeight: 'bold', color: GRAY,
    letterSpacing: 1.2, marginBottom: 6,
  },
  stopDetailTxt: { fontSize: 13, color: NAVY, lineHeight: 19, marginBottom: 12 },
  stopTipBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: OFF_WHITE, borderRadius: 10,
    padding: 12, gap: 10, marginBottom: 10,
    borderWidth: 1, borderColor: BORDER,
  },
  stopTipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: AMBER, marginTop: 4 },
  stopTipLabel: {
    fontSize: 9, fontWeight: 'bold', color: GRAY,
    letterSpacing: 1, marginBottom: 3,
  },
  stopTipTxt: { fontSize: 12, color: NAVY, lineHeight: 18 },
  stopBreakdown: {
    backgroundColor: OFF_WHITE, borderRadius: 10, padding: 12,
    gap: 6,
  },
  stopBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stopBreakdownLabel: { fontSize: 12, color: GRAY },
  stopBreakdownVal: { fontSize: 12, fontWeight: 'bold', color: NAVY },

  // TIPS
  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  tipRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 12,
  },
  tipNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  tipNumTxt: { fontSize: 12, fontWeight: 'bold', color: GREEN },
  tipInfo: { flex: 1 },
  tipTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  tipDesc: { fontSize: 12, color: GRAY, lineHeight: 18 },

  // TRIP SUMMARY CARD
  summaryCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  summaryTitle: { fontSize: 15, fontWeight: 'bold', color: NAVY, marginBottom: 14 },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 10, gap: 8,
  },
  summaryDot: { width: 8, height: 8, borderRadius: 4 },
  summaryLabel: { flex: 1, fontSize: 13, color: GRAY },
  summaryVal: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  summaryDivider: { height: 1, backgroundColor: BORDER, marginVertical: 10 },
  summaryTotalLabel: { flex: 1, fontSize: 14, fontWeight: 'bold', color: NAVY },
  summaryTotalVal: { fontSize: 18, fontWeight: 'bold', color: NAVY },

  // BUTTONS
  primaryBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    marginBottom: 10,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnTxt: { color: WHITE, fontSize: 15, fontWeight: 'bold' },
  secondaryBtn: {
    backgroundColor: WHITE, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: GREEN,
    marginBottom: 10,
  },
  secondaryBtnTxt: { color: GREEN, fontSize: 14, fontWeight: 'bold' },
  ghostBtn: {
    backgroundColor: WHITE, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  ghostBtnTxt: { color: GRAY, fontSize: 14, fontWeight: 'normal' },

  // MISSION
  missionCard: {
    backgroundColor: NAVY, borderRadius: 20, padding: 20, ...SHADOW,
  },
  missionEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5, marginBottom: 6,
  },
  missionAmt: { fontSize: 20, fontWeight: 'bold', color: WHITE, marginBottom: 12 },
  missionBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, marginBottom: 8 },
  missionFill: { height: 4, backgroundColor: GREEN, borderRadius: 2 },
  missionSub: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
});