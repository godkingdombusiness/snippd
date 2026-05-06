/**
 * SnippdProScreen — Apple IAP subscription paywall.
 *
 * Guideline compliance:
 *   3.1.1  — Purchases digital features through StoreKit (not external payment)
 *   3.1.2(a) — Discloses title, price, billing period, and cancellation path
 *   5.1.1(i) — Links to Privacy Policy and Terms of Use
 *
 * On iOS: uses expo-in-app-purchases (StoreKit).
 * On Android/web: shows a web-payment notice (not yet implemented).
 *
 * Prerequisite: run `npx expo install expo-in-app-purchases` and create
 * the subscription product in App Store Connect before TestFlight.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Platform,
  StatusBar, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { resetToScreen } from '../lib/navigationRef';
import {
  iapConnect, iapGetProduct, iapPurchase,
  iapSetPurchaseListener, iapRestorePurchases, iapDisconnect,
} from '../lib/iap';

// ── Brand ──────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const FOREST     = '#0C7A3D';
const NAVY       = '#0D1B4B';
const WHITE      = '#FFFFFF';
const OFF_WHITE  = '#F8F9FA';
const GRAY       = '#8A8F9E';
const LIGHT_GREEN = '#E8F8F0';
const BORDER     = '#E2E8F0';

const PERKS = [
  { icon: 'zap',        label: 'Smart stack engine',       sub: 'Manufacturer + digital + loyalty stacked automatically' },
  { icon: 'calendar',   label: 'Genius weekly meal plan',  sub: '21 budget-optimised meals every week' },
  { icon: 'shopping-cart', label: 'Full cart management',  sub: 'Lock-in deals, track lists, verify receipts' },
  { icon: 'award',      label: 'Stash Credits & rebates',  sub: 'Earn credits on every verified receipt' },
  { icon: 'users',      label: 'Household sharing',        sub: 'Sync lists and savings with your whole family' },
  { icon: 'bar-chart-2', label: 'Wealth Momentum',         sub: 'Track lifetime savings & spending insights' },
];

// ── Mark purchase active in Supabase ──────────────────────────────
// Updates both profiles.preferences and user_persona.status so that
// resolveUserStatus() in App.js routes the user to MainApp on every
// subsequent app launch.
async function markSubscriptionActive() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Update profiles.preferences
    const { data: prof } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('user_id', user.id)
      .single();
    const prefs = typeof prof?.preferences === 'object' ? prof.preferences : {};
    await supabase.from('profiles').update({
      preferences: {
        ...prefs,
        subscription_status: 'active',
        subscribed_at: new Date().toISOString(),
        subscription_platform: 'apple',
      },
    }).eq('user_id', user.id);

    // 2. Set user_persona.status = 'launched' so resolveUserStatus
    //    routes to MainApp on every subsequent cold start.
    await supabase
      .from('user_persona')
      .upsert(
        {
          user_id: user.id,
          status: 'launched',
          briefing_completed: true,
        },
        { onConflict: 'user_id' }
      );
  } catch (e) {
    console.warn('[SnippdPro] profile update after purchase failed:', e?.message);
  }
}

export default function SnippdProScreen({ navigation }) {
  const [product,     setProduct]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [purchasing,  setPurchasing]  = useState(false);
  const [restoring,   setRestoring]   = useState(false);

  // Fallback price shown while StoreKit loads (or on non-iOS)
  const displayPrice  = product?.localizedPrice ?? '$4.99';
  const displayPeriod = 'per month';

  // Connect to StoreKit and fetch product on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (Platform.OS === 'ios') {
        const ok = await iapConnect();
        if (!mounted) return;
        if (ok) {
          const p = await iapGetProduct();
          if (mounted) setProduct(p);
        }
        // Register the purchase completion handler
        await iapSetPurchaseListener(async (purchase, err) => {
          if (!mounted) return;
          setPurchasing(false);
          if (err) {
            Alert.alert('Purchase Failed', err.message ?? 'Something went wrong. Please try again.');
            return;
          }
          if (purchase) {
            await markSubscriptionActive();
            Alert.alert(
              'Welcome to Snippd Pro!',
              'Your subscription is now active. Enjoy unlimited savings.',
              [{ text: 'Start saving', onPress: () => resetToScreen('MainApp') }],
            );
          }
        });
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
      iapDisconnect();
    };
  }, [navigation]);

  const handlePurchase = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert(
        'Subscribe on iOS',
        'Manage your Snippd Pro subscription from the iOS app via your Apple ID.',
      );
      return;
    }
    setPurchasing(true);
    try {
      await iapPurchase();
      // Result handled in setPurchaseListener above
    } catch (e) {
      setPurchasing(false);
      Alert.alert('Purchase Error', e?.message ?? 'Could not start purchase. Please try again.');
    }
  }, []);

  const handleRestore = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    setRestoring(true);
    try {
      const purchases = await iapRestorePurchases();
      if (purchases.length > 0) {
        await markSubscriptionActive();
        Alert.alert(
          'Subscription Restored',
          'Your Snippd Pro subscription has been restored.',
          [{ text: 'Continue', onPress: () => resetToScreen('MainApp') }],
        );
      } else {
        Alert.alert('Nothing to Restore', 'No active Snippd Pro subscription was found for your Apple ID.');
      }
    } catch (e) {
      Alert.alert('Restore Failed', e?.message ?? 'Could not restore. Try again.');
    } finally {
      setRestoring(false);
    }
  }, [navigation]);

  const handleManageSubscription = () => {
    // Deep-link to iOS subscription management
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainApp')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="x" size={20} color={NAVY} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Snippd Pro</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Feather name="award" size={32} color={WHITE} />
          </View>
          <Text style={s.heroTitle}>Snippd Pro</Text>
          <Text style={s.heroSub}>
            The complete grocery intelligence platform — plan, stack, save, and track every dollar.
          </Text>
        </View>

        {/* Price card */}
        <View style={s.priceCard}>
          {loading ? (
            <ActivityIndicator color={GREEN} />
          ) : (
            <>
              <Text style={s.priceAmt}>{displayPrice}</Text>
              <Text style={s.pricePeriod}>{displayPeriod}</Text>
              <Text style={s.priceNote}>
                Auto-renewing subscription · Cancel any time in{'\n'}
                Settings → Apple ID → Subscriptions
              </Text>
            </>
          )}
        </View>

        {/* Perks */}
        <View style={s.perksCard}>
          <Text style={s.perksTitle}>EVERYTHING INCLUDED</Text>
          {PERKS.map(p => (
            <View key={p.label} style={s.perkRow}>
              <View style={s.perkIconWrap}>
                <Feather name={p.icon} size={16} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.perkLabel}>{p.label}</Text>
                <Text style={s.perkSub}>{p.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[s.ctaBtn, purchasing && { opacity: 0.7 }]}
          onPress={handlePurchase}
          disabled={purchasing || loading}
          activeOpacity={0.88}
        >
          {purchasing ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <>
              <Text style={s.ctaBtnTxt}>Subscribe — {displayPrice}/{displayPeriod === 'per month' ? 'mo' : displayPeriod}</Text>
              <Text style={s.ctaBtnSub}>Cancel any time · Billed through Apple</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Restore */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={s.restoreBtn}
            onPress={handleRestore}
            disabled={restoring}
          >
            {restoring ? (
              <ActivityIndicator color={GRAY} size="small" />
            ) : (
              <Text style={s.restoreBtnTxt}>Restore previous purchase</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Subscription disclosure — required by Apple 3.1.2(a) */}
        <View style={s.disclosureBox}>
          <Text style={s.disclosureTxt}>
            Snippd Pro is an auto-renewable subscription at {displayPrice}/month.
            Payment will be charged to your Apple ID account at confirmation of purchase.
            Subscription automatically renews unless it is cancelled at least 24 hours before
            the end of the current period. Your account will be charged for renewal within
            24 hours prior to the end of the current period. You can manage and cancel your
            subscriptions by going to your Account Settings in the App Store after purchase.
            Any unused portion of a free trial period will be forfeited when you purchase a
            subscription.
          </Text>
        </View>

        {/* Legal links */}
        <View style={s.legalRow}>
          <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')}>
            <Text style={s.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={s.legalSep}>·</Text>
          <TouchableOpacity onPress={() => navigation.navigate('TermsOfUse')}>
            <Text style={s.legalLink}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={s.legalSep}>·</Text>
          <TouchableOpacity onPress={handleManageSubscription}>
            <Text style={s.legalLink}>Manage Subscription</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: WHITE,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: NAVY },

  scroll: { padding: 16, gap: 14 },

  hero: { alignItems: 'center', paddingVertical: 20 },
  heroIcon: {
    width: 68, height: 68, borderRadius: 20,
    backgroundColor: FOREST,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: FOREST, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  heroTitle: { fontSize: 26, fontWeight: '900', color: NAVY, marginBottom: 8 },
  heroSub:   { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 21, paddingHorizontal: 20 },

  priceCard: {
    backgroundColor: WHITE, borderRadius: 18,
    borderWidth: 1, borderColor: BORDER,
    padding: 22, alignItems: 'center',
  },
  priceAmt:    { fontSize: 44, fontWeight: '900', color: NAVY, letterSpacing: -1 },
  pricePeriod: { fontSize: 16, color: GRAY, fontWeight: '600', marginTop: 2 },
  priceNote:   { fontSize: 11, color: GRAY, textAlign: 'center', marginTop: 10, lineHeight: 17 },

  perksCard: {
    backgroundColor: WHITE, borderRadius: 18,
    borderWidth: 1, borderColor: BORDER, padding: 18,
  },
  perksTitle: {
    fontSize: 10, fontWeight: '800', color: GRAY,
    letterSpacing: 1.5, marginBottom: 14,
  },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  perkIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  perkLabel: { fontSize: 14, fontWeight: '700', color: NAVY },
  perkSub:   { fontSize: 12, color: GRAY, marginTop: 2, lineHeight: 17 },

  ctaBtn: {
    backgroundColor: FOREST, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: FOREST, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  ctaBtnTxt: { fontSize: 16, fontWeight: '800', color: WHITE },
  ctaBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  restoreBtn: { alignItems: 'center', paddingVertical: 12 },
  restoreBtnTxt: { fontSize: 13, color: GRAY, fontWeight: '600' },

  disclosureBox: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, padding: 14,
  },
  disclosureTxt: { fontSize: 11, color: GRAY, lineHeight: 17 },

  legalRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', flexWrap: 'wrap', gap: 6,
  },
  legalLink: { fontSize: 12, color: GREEN, fontWeight: '600' },
  legalSep:  { fontSize: 12, color: GRAY },
});
