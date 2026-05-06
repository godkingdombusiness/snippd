/**
 * ReceiptVerifiedScreen — post-purchase confirmation.
 *
 * This screen displays signed checkout authority only. It never recomputes
 * purchase savings locally.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';
import { applyReceiptVerifyCredits } from '../src/services/creditRewards';
import { AgenticLedger, DecisionType } from '../src/services/agenticLedger';
import {
  authorizedTotalsForRoute,
  fetchAuthorizedCheckoutMath,
} from '../src/services/authoritativeCheckoutMath';

const CART_KEY = 'snippd_cart';

const FOREST = '#0C7A3D';
const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const PALE_GREEN = '#F0FDF4';
const BORDER = '#E2E8F0';
const PURPLE = '#7C3AED';

const fmt = (cents) => (typeof cents === 'number' ? '$' + (cents / 100).toFixed(2) : '--');

function normName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function SparkleRow() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, [anim]);

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Animated.View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: ['#1ED870', '#9FE1CB', '#0C7A3D', '#4ADE80', '#C5FFBC'][i],
            opacity: anim,
            transform: [{
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [10, i % 2 === 0 ? -6 : -2],
              }),
            }],
          }}
        />
      ))}
    </View>
  );
}

export default function ReceiptVerifiedScreen({ route, navigation }) {
  const params = route?.params ?? {};
  const [cartItems, setCartItems] = useState(params.cartItems ?? []);
  const [checkoutAuthority, setCheckoutAuthority] = useState(params.checkoutAuthority ?? null);
  const [loading, setLoading] = useState(!params.cartItems?.length && !params.totals);
  const [creditNote, setCreditNote] = useState(null);
  const [planNameList, setPlanNameList] = useState([]);

  useEffect(() => {
    async function loadFallbackAuthority() {
      if (params.totals) {
        setLoading(false);
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(CART_KEY);
        const items = raw ? JSON.parse(raw) : [];
        const normalized = Array.isArray(items) ? items : [];
        setCartItems(normalized);
        setCheckoutAuthority(normalized.length ? await fetchAuthorizedCheckoutMath({ items: normalized }) : null);
      } catch {
        setCheckoutAuthority(null);
      } finally {
        setLoading(false);
      }
    }
    loadFallbackAuthority();
  }, [params.totals]);

  useEffect(() => {
    AsyncStorage.getItem('snippd_weekly_plan_ingredient_names').then((raw) => {
      if (!raw) return;
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setPlanNameList(arr);
      } catch { /* ignore */ }
    });
  }, []);

  const authority = params.totals ?? authorizedTotalsForRoute(checkoutAuthority);
  const plannedSet = new Set(planNameList);
  const unplannedItems = cartItems.filter((item) => {
    const name = normName(item.product_name || item.name);
    if (planNameList.length === 0) return false;
    return name && !plannedSet.has(name);
  });
  const plannedCount = cartItems.filter((item) => {
    const name = normName(item.product_name || item.name);
    return name && plannedSet.has(name);
  }).length;

  const tracked = useRef(false);
  useEffect(() => {
    if (!authority || tracked.current) return;
    tracked.current = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        tracker.trackPurchaseCompleted({
          user_id: session.user.id,
          session_id: session.access_token || String(Date.now()),
          screen_name: 'ReceiptVerifiedScreen',
          cart_value_cents: authority.you_pay_cents,
          item_count: cartItems.length,
        });
        applyReceiptVerifyCredits(supabase, session.user.id).then((added) => {
          if (added > 0) setCreditNote(`+${added} early access credits added to your balance.`);
        }).catch(() => {});
        AgenticLedger.log({
          user_id: session.user.id,
          decision_type: DecisionType.STASH_INSIGHT_VIEW,
          actor: 'ReceiptVerifiedScreen',
          result: 'info',
          metadata: {
            planned_count: plannedCount,
            unplanned_count: unplannedItems.length,
            math_source: authority.math_source,
            signature_present: Boolean(authority.signature),
            mirror_neo4j: true,
          },
        });
      }
    }).catch(() => {});
  }, [authority, cartItems.length, plannedCount, unplannedItems.length]);

  const saveWeeklyPlanOptIn = useCallback(async (itemLabel) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Sign in', 'Log in to save this preference to your profile.');
        return;
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('user_id', user.id)
        .single();
      const pref = prof?.preferences && typeof prof.preferences === 'object' ? prof.preferences : {};
      const arr = Array.isArray(pref.concierge_opt_in_items) ? [...pref.concierge_opt_in_items] : [];
      if (!arr.includes(itemLabel)) arr.push(itemLabel);
      await supabase.from('profiles').update({
        preferences: { ...pref, concierge_opt_in_items: arr },
      }).eq('user_id', user.id);
      await AgenticLedger.log({
        user_id: user.id,
        decision_type: DecisionType.UNPLANNED_ITEM_OPT_IN,
        actor: 'ReceiptVerifiedScreen',
        result: 'approved',
        metadata: { item: itemLabel, mirror_neo4j: true },
      });
      Alert.alert('Saved', 'We will weight this into your future weekly plans.');
    } catch {
      Alert.alert('Could not save', 'Try again in a moment.');
    }
  }, []);

  const handleShare = useCallback(async () => {
    const story = [
      'Snippd - my trip story',
      `Shelf total ${fmt(authority?.regular_total_cents)} -> Snippd total ${fmt(authority?.true_final_cents ?? authority?.you_pay_cents)}`,
      `Saved ${fmt(authority?.total_savings_cents)} with signed checkout math`,
      'Stack every deal. Miss nothing. https://getsnippd.com',
      '#Snippd #SnippdSavings #SaveSmart',
    ].join('\n');
    try {
      await Share.share({ message: story, title: 'Share my Snippd story' });
    } catch { /* share cancelled */ }
  }, [authority]);

  const handleGoHome = useCallback(() => {
    navigation.getParent()?.navigate('HomeTab');
  }, [navigation]);

  const submitDealFeedback = useCallback(async (outcome) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      await supabase.functions.invoke('deal-validator', {
        body: {
          action:           'feedback',
          user_id:          session.user.id,
          offer_id:         route.params?.offerSourceId ?? null,
          outcome,
          actual_cents:     authority?.total_savings_cents ?? null,
          predicted_cents:  authority?.at_register_savings_cents ?? null,
          store_id:         route.params?.storeName ?? null,
        },
      });
    } catch { /* non-critical — never block the user */ }
  }, [authority, route.params]);

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.center}>
          <Feather name="check-circle" size={40} color={GREEN} />
          <Text style={s.loadTxt}>Loading signed checkout math...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : handleGoHome()}
        >
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Purchase Confirmed</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        <View style={s.heroCard}>
          <SparkleRow />
          <View style={s.heroIconWrap}>
            <Feather name={authority ? 'check-circle' : 'alert-circle'} size={44} color={WHITE} />
          </View>
          <Text style={s.heroTitle}>{authority ? 'Purchase verified!' : 'Math authority unavailable'}</Text>
          <Text style={s.heroSub}>
            {authority
              ? `${cartItems.length} item${cartItems.length !== 1 ? 's' : ''} confirmed`
              : 'Totals are hidden until Cloud Run returns signed checkout math.'}
          </Text>
          <View style={s.heroSavingsRow}>
            <Text style={s.heroSavingsLabel}>Total savings</Text>
            <Text style={s.heroSavingsAmt}>{fmt(authority?.total_savings_cents)}</Text>
            <Text style={s.heroSavingsPct}>{typeof authority?.savings_pct === 'number' ? `(${authority.savings_pct}% off)` : ''}</Text>
          </View>
          <Text style={s.heroLoggedTxt}>
            {authority?.signature ? 'Signed math recorded' : 'Signature missing'}
          </Text>
          {!!creditNote && <Text style={s.creditBanner}>{creditNote}</Text>}
        </View>

        {planNameList.length > 0 && cartItems.length > 0 && (
          <View style={s.stashCard}>
            <Text style={s.stashTitle}>STASH INSIGHTS</Text>
            <Text style={s.stashBody}>
              {plannedCount} item{plannedCount !== 1 ? 's' : ''} matched your weekly plan.
              {unplannedItems.length > 0
                ? ` ${unplannedItems.length} extra${unplannedItems.length !== 1 ? 's' : ''} were not on that list.`
                : ' Everything in your cart was on your plan.'}
            </Text>
          </View>
        )}

        {unplannedItems.length > 0 && (
          <View style={s.stashCard}>
            <Text style={s.stashTitle}>Unplanned extras</Text>
            <Text style={s.stashHint}>Tap an item to add it to future weekly plans.</Text>
            {unplannedItems.map((item, idx) => {
              const label = item.product_name || item.name;
              return (
                <TouchableOpacity
                  key={item.id || String(idx)}
                  style={s.unplanRow}
                  onPress={() => saveWeeklyPlanOptIn(label)}
                  activeOpacity={0.75}
                >
                  <Text style={s.unplanName} numberOfLines={2}>{label}</Text>
                  <Text style={s.unplanCta}>Include</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={s.receiptCard}>
          <Text style={s.receiptTitle}>RECEIPT SUMMARY</Text>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>Regular total</Text>
            <Text style={[s.receiptVal, s.strikeVal]}>{fmt(authority?.regular_total_cents)}</Text>
          </View>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>Authorized savings</Text>
            <Text style={[s.receiptVal, { color: GREEN }]}>-{fmt(authority?.at_register_savings_cents)}</Text>
          </View>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>Authorized register total</Text>
            <Text style={s.receiptVal}>{fmt(authority?.you_pay_cents)}</Text>
          </View>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>Math source</Text>
            <Text style={s.receiptVal}>{authority?.math_source || 'Unavailable'}</Text>
          </View>
        </View>

        {/* Deal Feedback — Did it work? */}
        <View style={s.feedbackCard}>
          <Text style={s.feedbackTitle}>DID THE DEAL WORK?</Text>
          <Text style={s.feedbackSub}>Your answer improves future recommendations for everyone.</Text>
          <View style={s.feedbackRow}>
            <TouchableOpacity
              style={[s.feedbackBtn, { borderColor: GREEN }]}
              onPress={() => { submitDealFeedback('worked'); Alert.alert('Thanks!', 'Your savings are verified and logged.'); }}
              activeOpacity={0.85}
            >
              <Feather name="check-circle" size={16} color={GREEN} />
              <Text style={[s.feedbackBtnTxt, { color: GREEN }]}>Yes, it worked</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.feedbackBtn, { borderColor: '#F59E0B' }]}
              onPress={() => { submitDealFeedback('wrong_price'); Alert.alert('Noted', 'We will flag this deal for review.'); }}
              activeOpacity={0.85}
            >
              <Feather name="alert-triangle" size={16} color="#F59E0B" />
              <Text style={[s.feedbackBtnTxt, { color: '#F59E0B' }]}>Wrong price</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.feedbackBtn, { borderColor: '#EF4444' }]}
              onPress={() => { submitDealFeedback('coupon_failed'); Alert.alert('Flagged', 'Coupon failure recorded — we will review this deal.'); }}
              activeOpacity={0.85}
            >
              <Feather name="x-circle" size={16} color="#EF4444" />
              <Text style={[s.feedbackBtnTxt, { color: '#EF4444' }]}>Coupon failed</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.86}>
          <Feather name="share-2" size={17} color={WHITE} />
          <Text style={s.shareBtnTxt}>Share my savings story</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.homeBtn} onPress={handleGoHome} activeOpacity={0.86}>
          <Text style={s.homeBtnTxt}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadTxt: { marginTop: 12, color: GRAY, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  scroll: { padding: 16, gap: 14, paddingBottom: 120 },
  heroCard: { backgroundColor: FOREST, borderRadius: 20, padding: 24, alignItems: 'center' },
  heroIconWrap: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { color: WHITE, fontSize: 24, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.72)', fontSize: 13, marginTop: 6, textAlign: 'center' },
  heroSavingsRow: { marginTop: 20, alignItems: 'center' },
  heroSavingsLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  heroSavingsAmt: { color: WHITE, fontSize: 42, fontWeight: '900', marginTop: 4 },
  heroSavingsPct: { color: '#A7F3D0', fontSize: 14, fontWeight: '800', marginTop: 2 },
  heroLoggedTxt: { color: 'rgba(255,255,255,0.75)', marginTop: 14, fontSize: 12, fontWeight: '700' },
  creditBanner: { marginTop: 10, color: '#C5FFBC', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  stashCard: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  stashTitle: { fontSize: 11, fontWeight: '900', color: GRAY, letterSpacing: 1, marginBottom: 8 },
  stashBody: { fontSize: 14, color: NAVY, lineHeight: 21 },
  stashHint: { fontSize: 12, color: GRAY, marginBottom: 10 },
  unplanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  unplanName: { flex: 1, color: NAVY, fontSize: 13, fontWeight: '700' },
  unplanCta: { color: GREEN, fontSize: 12, fontWeight: '900', marginLeft: 8 },
  receiptCard: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  receiptTitle: { fontSize: 11, fontWeight: '900', color: GRAY, letterSpacing: 1, marginBottom: 12 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  receiptLabel: { color: GRAY, fontSize: 13 },
  receiptVal: { color: NAVY, fontSize: 13, fontWeight: '800', maxWidth: '58%', textAlign: 'right' },
  strikeVal: { textDecorationLine: 'line-through', color: GRAY },
  shareBtn: { backgroundColor: PURPLE, borderRadius: 16, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareBtnTxt: { color: WHITE, fontWeight: '900', fontSize: 14 },
  homeBtn: { backgroundColor: PALE_GREEN, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  homeBtnTxt: { color: GREEN, fontWeight: '900', fontSize: 14 },
  feedbackCard: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  feedbackTitle: { fontSize: 10, fontWeight: '900', color: GRAY, letterSpacing: 1.5, marginBottom: 4 },
  feedbackSub: { fontSize: 12, color: GRAY, marginBottom: 14, lineHeight: 18 },
  feedbackRow: { flexDirection: 'row', gap: 8 },
  feedbackBtn: { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 4 },
  feedbackBtnTxt: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
});
