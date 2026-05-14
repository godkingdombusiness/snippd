/**
 * FirstShopPaywallScreen
 *
 * Premium paywall that appears when the user is ready to start their first shop
 * but does not yet have an active subscription.
 *
 * Appears after: Onboarding → PersonalizationSummary → (tap Begin My First Shop)
 * Exits to: PaymentSuccessRedirect → TodaySetupGate or TodayOptionsRanked
 *
 * Design: Cream background, white rounded cards, Navy headings, Green CTA.
 * No emojis. No aggressive copy. No lockout of basic history.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { activateMockTrial, saveNextRouteAfterPayment } from '../src/services/paywallGateService';
import { tracker } from '../src/lib/eventTracker';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';
var CORAL  = '#fb5b5b';

var VALUE_BULLETS = [
  { icon: 'dollar-sign', text: 'Budget-first weekly planning' },
  { icon: 'calendar',    text: 'Cook, grocery, pickup, and eat-out guidance' },
  { icon: 'home',        text: 'Pantry-aware recommendations' },
  { icon: 'map-pin',     text: 'Store and savings guidance' },
  { icon: 'refresh-cw',  text: 'Receipt-based learning for smarter future plans' },
];

// ── Module-scope components ────────────────────────────────────────────────────

function ValueBullet({ icon, text }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletIcon}>
        <Feather name={icon} size={16} color={GREEN} />
      </View>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function PlanCard({ title, price, detail, badge, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.planCard, selected && styles.planCardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.planCardRow}>
        <View style={[styles.planRadio, selected && styles.planRadioSelected]}>
          {selected && <View style={styles.planRadioDot} />}
        </View>
        <View style={styles.planCardText}>
          <Text style={[styles.planTitle, selected && styles.planTitleSelected]}>{title}</Text>
          <Text style={styles.planDetail}>{detail}</Text>
        </View>
        {badge ? (
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.planPrice, selected && styles.planPriceSelected]}>{price}</Text>
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function FirstShopPaywallScreen({ navigation, route }) {
  var intendedRoute  = route?.params?.intendedRoute  || 'TodaySetupGate';
  var intendedParams = route?.params?.intendedParams || {};

  var [selectedPlan, setSelectedPlan] = useState('trial');
  var [loading,      setLoading]      = useState(false);

  async function handleStartTrial() {
    if (loading) return;
    setLoading(true);
    try {
      var { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      tracker.track('paywall_trial_started', { user_id: user.id, plan: selectedPlan });

      // Save intent before activating so redirect knows where to go
      await saveNextRouteAfterPayment(user.id, intendedRoute, intendedParams);

      if (selectedPlan === 'trial') {
        // Activate mock trial (real activation happens via Stripe webhook)
        await activateMockTrial(user.id);
      }

      // Route to payment success which reads next_route_after_payment
      navigation.replace('PaymentSuccessRedirect', {
        plan:          selectedPlan,
        intendedRoute: intendedRoute,
        intendedParams: intendedParams,
      });
    } catch (e) {
      // Fail safe — let user in anyway for trial
      navigation.replace(intendedRoute, intendedParams);
    } finally {
      setLoading(false);
    }
  }

  function handleNotNow() {
    tracker.track('paywall_dismissed', {});
    // Route to main app — user can access saved recipes and basic history
    navigation.replace('MainApp');
  }

  function handleOpenMonthlyLink() {
    // TODO: Replace with production Stripe payment link for monthly plan
    Linking.openURL('https://snippd.app/subscribe/monthly').catch(function () {});
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Header badge */}
        <View style={styles.badge}>
          <Feather name="check-circle" size={28} color={GREEN} />
        </View>

        <Text style={styles.headline}>Your first smarter shop is ready.</Text>
        <Text style={styles.sub}>
          Snippd built your plan around your budget, household, stores, food goals, and real-life routine.
        </Text>

        {/* Value list */}
        <View style={styles.valueList}>
          {VALUE_BULLETS.map(function (b, i) {
            return <ValueBullet key={i} icon={b.icon} text={b.text} />;
          })}
        </View>

        {/* Plan chooser */}
        <Text style={styles.chooserLabel}>Start with</Text>

        <PlanCard
          title="3-day free trial"
          price="Then $97/year"
          detail="Founding member rate — lock it in now"
          badge="Best value"
          selected={selectedPlan === 'trial'}
          onPress={function () { setSelectedPlan('trial'); }}
        />

        <PlanCard
          title="Monthly plan"
          price="$4.99/month"
          detail="No trial — cancel anytime"
          selected={selectedPlan === 'monthly'}
          onPress={function () { setSelectedPlan('monthly'); }}
        />

        {/* Primary CTA */}
        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          onPress={selectedPlan === 'monthly' ? handleOpenMonthlyLink : handleStartTrial}
          disabled={loading}
          activeOpacity={0.88}
        >
          {loading
            ? <ActivityIndicator color={WHITE} />
            : <Text style={styles.primaryBtnTxt}>
                {selectedPlan === 'trial' ? 'Start My Trial' : 'Subscribe at $4.99/mo'}
              </Text>
          }
        </TouchableOpacity>

        {/* Trust copy */}
        <Text style={styles.trustCopy}>
          {selectedPlan === 'trial'
            ? 'Your 3-day free trial starts today. Cancel before it ends to pay nothing.'
            : '$4.99 is charged monthly. Cancel anytime from account settings.'}
        </Text>

        {/* Secondary CTA */}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={handleNotNow}
          activeOpacity={0.75}
        >
          <Text style={styles.secondaryBtnTxt}>Not Now</Text>
        </TouchableOpacity>

        {/* Trust footer */}
        <View style={styles.trustFooter}>
          <Feather name="lock" size={12} color={GRAY} />
          <Text style={styles.trustFooterText}>
            Your saved recipes and basic history stay yours.
          </Text>
        </View>

        <Text style={styles.disclaimer}>
          Prices, availability, savings, and nutrition estimates may vary by store, location, and time.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: CREAM },
  scroll: { padding: 24, paddingBottom: 48 },

  badge: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 20,
  },

  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 28, color: NAVY, letterSpacing: -0.6,
    textAlign: 'center', marginBottom: 12,
  },
  sub: {
    fontSize: 15, color: GRAY, lineHeight: 22,
    textAlign: 'center', marginBottom: 24, paddingHorizontal: 4,
  },

  valueList: {
    backgroundColor: WHITE, borderRadius: 14, borderWidth: 1,
    borderColor: BORDER, padding: 16, gap: 12, marginBottom: 28,
  },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bulletIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bulletText: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 20 },

  chooserLabel: {
    fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.8, color: GRAY, marginBottom: 10,
  },

  planCard: {
    backgroundColor: WHITE, borderRadius: 14, borderWidth: 1.5,
    borderColor: BORDER, padding: 14, marginBottom: 10, gap: 6,
  },
  planCardSelected: { borderColor: GREEN, backgroundColor: MINT },
  planCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  planRadioSelected: { borderColor: GREEN },
  planRadioDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: GREEN },
  planCardText: { flex: 1 },
  planTitle: { fontSize: 15, fontWeight: '700', color: NAVY, marginBottom: 2 },
  planTitleSelected: { color: GREEN },
  planDetail: { fontSize: 12, color: GRAY },
  planPrice: { fontSize: 13, fontWeight: '600', color: GRAY, paddingLeft: 32 },
  planPriceSelected: { color: NAVY },
  planBadge: {
    backgroundColor: 'rgba(12,158,84,0.12)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  planBadgeText: { fontSize: 10, fontWeight: '700', color: GREEN },

  primaryBtn: {
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8, marginBottom: 12,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 10, elevation: 4,
  },
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnTxt: { fontSize: 16, fontWeight: '700', color: WHITE, letterSpacing: 0.2 },

  trustCopy: { fontSize: 11, color: GRAY, textAlign: 'center', marginBottom: 20, lineHeight: 16 },

  secondaryBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 20 },
  secondaryBtnTxt: { fontSize: 14, color: NAVY, fontWeight: '500' },

  trustFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginBottom: 16,
  },
  trustFooterText: { fontSize: 12, color: GRAY },

  disclaimer: {
    fontSize: 11, color: GRAY, lineHeight: 16,
    textAlign: 'center', paddingHorizontal: 8,
  },
});
