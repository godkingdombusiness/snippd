/**
 * PaymentSuccessRedirectScreen
 *
 * Shown immediately after payment or trial activation succeeds.
 * Auto-redirects to the next correct screen within 2 seconds.
 *
 * Priority logic (handlePostPurchaseRedirect):
 * 1. next_route_after_payment stored in profile
 * 2. TodaySetupGate if profile details are missing
 * 3. TodayOptionsRanked as default
 *
 * Does NOT route back to sign-in, onboarding, or the paywall.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { handlePostPurchaseRedirect } from '../src/services/paywallGateService';
import { tracker } from '../src/lib/eventTracker';

var GREEN = '#0C9E54';
var NAVY  = '#172250';
var CREAM = '#FAF8F1';
var WHITE = '#FFFFFF';
var MINT  = '#E8F5E9';

export default function PaymentSuccessRedirectScreen({ navigation, route }) {
  var plan           = route?.params?.plan           || 'trial';
  var intendedRoute  = route?.params?.intendedRoute  || null;
  var intendedParams = route?.params?.intendedParams || {};

  var scaleAnim   = useRef(new Animated.Value(0.8)).current;
  var opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(function () {
    // Entrance animation
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Auto-redirect after brief pause so the user sees the confirmation
    var timer = setTimeout(function () {
      doRedirect();
    }, 1800);

    return function () { clearTimeout(timer); };
  }, []);

  async function doRedirect() {
    try {
      var { data: { user } } = await supabase.auth.getUser();

      tracker.track('payment_success_redirect', {
        user_id: user?.id,
        plan: plan,
        intended_route: intendedRoute,
      });

      // If caller already resolved the route, use it
      if (intendedRoute && intendedRoute !== 'TodaySetupGate') {
        navigation.replace(intendedRoute, intendedParams);
        return;
      }

      // Otherwise use the service logic
      var redirect = await handlePostPurchaseRedirect(user?.id, null);
      navigation.replace(redirect.route, redirect.params || {});
    } catch {
      navigation.replace('TodaySetupGate');
    }
  }

  var planLabel = plan === 'trial' ? '3-day free trial' : '$4.99/month';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.center}>
        <Animated.View style={[styles.badge, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          <Text style={styles.badgeCheck}>✓</Text>
        </Animated.View>

        <Animated.Text style={[styles.headline, { opacity: opacityAnim }]}>
          You're in.
        </Animated.Text>

        <Animated.Text style={[styles.sub, { opacity: opacityAnim }]}>
          {plan === 'trial'
            ? 'Your free trial is active. Taking you to your plan now.'
            : 'Your subscription is active. Taking you to your plan now.'}
        </Animated.Text>

        <Animated.View style={[styles.planPill, { opacity: opacityAnim }]}>
          <Text style={styles.planPillText}>{planLabel} activated</Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: CREAM },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40,
  },

  badge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  badgeCheck: { fontSize: 36, color: WHITE, fontWeight: '800' },

  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 36, color: NAVY, letterSpacing: -1,
    textAlign: 'center', marginBottom: 12,
  },
  sub: {
    fontSize: 16, color: '#4B5563', lineHeight: 24,
    textAlign: 'center', marginBottom: 24,
  },

  planPill: {
    backgroundColor: MINT, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  planPillText: { fontSize: 13, fontWeight: '600', color: GREEN },
});
