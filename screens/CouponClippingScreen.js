/**
 * CouponClippingScreen — pre-shop prep.
 *
 * Displays only Cloud Run-authorized checkout savings. Coupon links remain
 * actionable, but this screen does not estimate additional discounts.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { AgenticLedger, DecisionType } from '../src/services/agenticLedger';
import {
  authorizedTotalsForRoute,
  fetchAuthorizedCheckoutMath,
} from '../src/services/authoritativeCheckoutMath';
import { readActiveCart } from '../src/services/cartStorage';
import { runCouponClip } from '../src/services/CouponClippingService';

const GREEN = '#0C9E54';
const FOREST = '#0C7A3D';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const BORDER = '#E2E8F0';

const fmt = (cents) => (typeof cents === 'number' ? '$' + (cents / 100).toFixed(2) : '--');

const STORE_CLIP_STEPS = [
  { retailer: 'Walmart', loginPrompt: 'Log into your Walmart account to load digital offers.', url: 'https://www.walmart.com/coupons' },
  { retailer: 'Target', loginPrompt: 'Open Target Circle in the Target app or web to clip store coupons.', url: 'https://www.target.com/circle' },
  { retailer: 'Publix', loginPrompt: 'Sign in to Publix.com and open Digital Coupons.', url: 'https://www.publix.com/savings/digital-coupons' },
  { retailer: 'Walgreens', loginPrompt: 'Log into myWalgreens and clip weekly deals.', url: 'https://www.walgreens.com/offers/offers.jsp' },
  { retailer: 'Dollar General', loginPrompt: 'Open DG Digital Coupons after signing in.', url: 'https://www.dollargeneral.com/digital-coupons' },
];

const RETAILER_COUPON_URLS = {
  walmart: 'https://www.walmart.com/coupons',
  target: 'https://www.target.com/circle',
  publix: 'https://www.publix.com/savings/digital-coupons',
  walgreens: 'https://www.walgreens.com/offers/offers.jsp',
  dollar_general: 'https://www.dollargeneral.com/digital-coupons',
  dollargeneral: 'https://www.dollargeneral.com/digital-coupons',
  kroger: 'https://www.kroger.com/savings/cl/coupons',
  cvs: 'https://www.cvs.com/extracare/home',
};

function retailerKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function couponUrl(coupon) {
  return coupon.exact_coupon_url || null;
}

async function copyCouponHint(coupon) {
  const text = [coupon.product_name, coupon.savings_label, coupon.coupon_id].filter(Boolean).join(' - ');
  try {
    if (globalThis?.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* best effort only */ }
  return false;
}

export default function CouponClippingScreen({ navigation, route }) {
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState(route?.params?.cartItems ?? []);
  const [checkoutAuthority, setCheckoutAuthority] = useState(route?.params?.checkoutAuthority ?? null);
  const [coupons, setCoupons] = useState(route?.params?.coupons ?? []);
  const [currentCouponIndex, setCurrentCouponIndex] = useState(0);
  const [clippedCouponIds, setClippedCouponIds] = useState(new Set());

  const load = useCallback(async () => {
    try {
      const { items: normalized } = await readActiveCart();
      setCartItems(normalized);
      setCheckoutAuthority(route?.params?.checkoutAuthority ?? (normalized.length ? await fetchAuthorizedCheckoutMath({ items: normalized }) : null));
      if (route?.params?.coupons?.length) {
        setCoupons(route.params.coupons.filter(coupon => coupon.exact_coupon_url));
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const result = await runCouponClip(user.id, true);
          setCoupons(result.coupons.filter(coupon => coupon.exact_coupon_url));
        }
      }
    } catch {
      setCartItems([]);
      setCheckoutAuthority(null);
    } finally {
      setLoading(false);
    }
  }, [route?.params?.checkoutAuthority]);

  useEffect(() => { load(); }, [load]);

  const authority = route?.params?.totals ?? authorizedTotalsForRoute(checkoutAuthority);
  const currentCoupon = coupons[currentCouponIndex] ?? null;
  const allCouponsClipped = coupons.length > 0 && clippedCouponIds.size >= coupons.length;

  async function openCoupon(coupon) {
    await copyCouponHint(coupon);
    await AgenticLedger.log({
      decision_type: DecisionType.CONCIERGE_CLIP_STEP,
      actor: 'CouponClippingScreen',
      result: 'approved',
      metadata: {
        retailer: coupon.retailer_key,
        coupon_id: coupon.coupon_id,
        product_name: coupon.product_name,
        mirror_neo4j: true,
      },
    });
    try {
      const url = couponUrl(coupon);
      if (!url) {
        Alert.alert('Coupon hidden', 'This coupon does not have a verified exact source URL.');
        return;
      }
      await WebBrowser.openBrowserAsync(url);
    } catch {
      const url = couponUrl(coupon);
      if (url) Linking.openURL(url);
    }
  }

  function markCurrentCouponClipped() {
    if (!currentCoupon) return;
    const id = currentCoupon.coupon_id || `${currentCoupon.retailer_key}_${currentCoupon.product_name}_${currentCouponIndex}`;
    const nextIndex = Math.min(currentCouponIndex + 1, coupons.length - 1);
    const nextCoupon = coupons[nextIndex];
    setClippedCouponIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setCurrentCouponIndex(nextIndex);
    if (nextCoupon && nextIndex !== currentCouponIndex) {
      copyCouponHint(nextCoupon);
    }
  }

  function openClipStep(idx) {
    if (idx >= STORE_CLIP_STEPS.length) {
      Alert.alert('Clip tour complete', 'Reopen any store below if you need another pass.');
      return;
    }
    const step = STORE_CLIP_STEPS[idx];
    Alert.alert(
      `Clip - ${step.retailer}`,
      `${step.loginPrompt}\n\nOpen the coupon page in your browser?`,
      [
        { text: 'Skip', style: 'cancel', onPress: () => openClipStep(idx + 1) },
        {
          text: 'Open link',
          onPress: async () => {
            await AgenticLedger.log({
              decision_type: DecisionType.CONCIERGE_CLIP_STEP,
              actor: 'CouponClippingScreen',
              result: 'approved',
              metadata: { retailer: step.retailer, step: idx, mirror_neo4j: true },
            });
            try {
              await WebBrowser.openBrowserAsync(step.url);
            } catch {
              Linking.openURL(step.url);
            }
            openClipStep(idx + 1);
          },
        },
      ],
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pre-shop prep</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>COUPONS & REBATES</Text>
          <Text style={styles.heroTitle}>Authorized savings</Text>
          <Text style={styles.heroBig}>{fmt(authority?.total_savings_cents)}</Text>
          <Text style={styles.heroSub}>
            {authority
              ? `Signed checkout math for ${cartItems.length} list item${cartItems.length !== 1 ? 's' : ''}.`
              : 'Savings stay hidden until Cloud Run returns signed checkout math.'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={async () => {
            if (currentCoupon) {
              await openCoupon(currentCoupon);
              return;
            }
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.id) {
              await AgenticLedger.log({
                user_id: session.user.id,
                decision_type: DecisionType.CLIP_SESSION_START,
                actor: 'CouponClippingScreen',
                result: 'info',
                metadata: { flow: 'link_by_link', mirror_neo4j: true },
              });
            }
            Alert.alert(
              'Link-by-link clip tour',
              'We will prompt one store at a time so you can log in and clip before you shop.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Start', onPress: () => openClipStep(0) },
              ],
            );
          }}
        >
          <Feather name="external-link" size={17} color={WHITE} style={{ marginRight: 8 }} />
          <Text style={styles.primaryBtnTxt}>
            {currentCoupon ? 'Open current coupon' : 'Start link-by-link browser prompts'}
          </Text>
        </TouchableOpacity>

        {coupons.length > 0 && (
          <View style={styles.couponQueueCard}>
            <Text style={styles.sectionLabel}>Matched coupons</Text>
            <Text style={styles.queueProgress}>
              {Math.min(clippedCouponIds.size + 1, coupons.length)} of {coupons.length}
            </Text>

            {currentCoupon && !allCouponsClipped && (
              <View style={styles.currentCoupon}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.currentCouponName}>{currentCoupon.product_name}</Text>
                  <View style={styles.couponMetaRow}>
                    <Text style={styles.couponRetailer}>{currentCoupon.retailer_key}</Text>
                    <Text style={styles.couponSavings}>{currentCoupon.savings_label}</Text>
                  </View>
                  <Text style={styles.couponHint}>
                    Verified from {currentCoupon.retailer_key}. Checked {currentCoupon.verified_at ? new Date(currentCoupon.verified_at).toLocaleString() : 'recently'}
                    {currentCoupon.expiration_date ? `, expires ${currentCoupon.expiration_date}` : ''}. Clip it, return here, then mark it done.
                  </Text>
                </View>
                <TouchableOpacity style={styles.clipSmallBtn} onPress={() => openCoupon(currentCoupon)}>
                  <Text style={styles.clipSmallTxt}>Clip</Text>
                </TouchableOpacity>
              </View>
            )}

            {coupons.map((coupon, index) => {
              const id = coupon.coupon_id || `${coupon.retailer_key}_${coupon.product_name}_${index}`;
              const clipped = clippedCouponIds.has(id);
              return (
                <View key={id} style={styles.couponRow}>
                  <Feather
                    name={clipped ? 'check-circle' : index === currentCouponIndex ? 'circle' : 'clock'}
                    size={15}
                    color={clipped ? GREEN : GRAY}
                  />
                  <Text style={[styles.couponRowTxt, clipped && styles.couponRowDone]} numberOfLines={1}>
                    {coupon.product_name}
                  </Text>
                  <Text style={styles.couponRowAmt}>{coupon.savings_label}</Text>
                </View>
              );
            })}

            {!allCouponsClipped ? (
              <TouchableOpacity style={styles.confirmClipBtn} onPress={markCurrentCouponClipped}>
                <Text style={styles.confirmClipTxt}>I clipped this coupon</Text>
                <Feather name="arrow-right" size={17} color={WHITE} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.checkoutBtn}
                onPress={() => navigation.navigate('CheckoutBreakdown', { cartItems, checkoutAuthority, totals: authority })}
              >
                <Text style={styles.checkoutBtnTxt}>All coupons clipped - head to checkout</Text>
                <Feather name="shopping-cart" size={17} color={WHITE} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.sectionLabel}>Store logins</Text>
        {STORE_CLIP_STEPS.map((step) => (
          <View key={step.retailer} style={styles.storeCard}>
            <Text style={styles.storeName}>{step.retailer}</Text>
            <Text style={styles.storeHint}>{step.loginPrompt}</Text>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => WebBrowser.openBrowserAsync(step.url).catch(() => Linking.openURL(step.url))}
            >
              <Text style={styles.linkTxt}>Open coupon page</Text>
              <Feather name="chevron-right" size={16} color={GREEN} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('CheckoutBreakdown', { cartItems, checkoutAuthority, totals: authority })}
        >
          <Text style={styles.secondaryBtnTxt}>Coupons clipped - continue</Text>
          <Feather name="arrow-right" size={18} color={FOREST} />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: NAVY },
  hero: { backgroundColor: FOREST, borderRadius: 18, padding: 22 },
  heroEyebrow: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8 },
  heroTitle: { color: WHITE, fontSize: 17, fontWeight: '800' },
  heroBig: { color: WHITE, fontSize: 42, fontWeight: '900', marginTop: 8 },
  heroSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 20, marginTop: 8 },
  primaryBtn: { backgroundColor: GREEN, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  primaryBtnTxt: { color: WHITE, fontWeight: '900', fontSize: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '900', color: GRAY, letterSpacing: 1, marginTop: 8 },
  couponQueueCard: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER, gap: 10 },
  queueProgress: { position: 'absolute', top: 16, right: 16, fontSize: 12, fontWeight: '900', color: GREEN },
  currentCoupon: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#BBF7D0' },
  currentCouponName: { fontSize: 15, fontWeight: '900', color: NAVY, marginBottom: 6 },
  couponMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  couponRetailer: { fontSize: 10, fontWeight: '900', color: GRAY, textTransform: 'uppercase' },
  couponSavings: { fontSize: 12, fontWeight: '900', color: GREEN },
  couponHint: { marginTop: 7, fontSize: 11, color: GRAY, lineHeight: 16 },
  clipSmallBtn: { backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  clipSmallTxt: { color: WHITE, fontWeight: '900', fontSize: 12 },
  couponRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  couponRowTxt: { flex: 1, fontSize: 13, fontWeight: '700', color: NAVY },
  couponRowDone: { color: GRAY, textDecorationLine: 'line-through' },
  couponRowAmt: { fontSize: 12, fontWeight: '900', color: GREEN },
  confirmClipBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14 },
  confirmClipTxt: { color: WHITE, fontWeight: '900', fontSize: 14 },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: FOREST, borderRadius: 14, paddingVertical: 14 },
  checkoutBtnTxt: { color: WHITE, fontWeight: '900', fontSize: 14 },
  storeCard: { backgroundColor: WHITE, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  storeName: { fontSize: 15, fontWeight: '900', color: NAVY },
  storeHint: { fontSize: 12, color: GRAY, marginTop: 5, lineHeight: 18 },
  linkRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkTxt: { color: GREEN, fontSize: 13, fontWeight: '900' },
  secondaryBtn: { marginTop: 6, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16, backgroundColor: '#E8F8F0', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  secondaryBtnTxt: { color: FOREST, fontWeight: '900', fontSize: 14 },
});
