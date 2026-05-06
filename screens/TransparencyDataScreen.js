/**
 * Transparency & Data Sovereignty — legal disclaimer, ATT (iOS), privacy link.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as TrackingTransparency from 'expo-tracking-transparency';
import { supabase } from '../lib/supabase';

const MINT = '#E8F5E9';
const NAVY = '#1A237E';
const GREEN = '#2E7D32';
const WHITE = '#FFFFFF';
const GRAY = '#64748B';

export default function TransparencyDataScreen({ navigation, route }) {
  const nextRoute = route?.params?.next ?? 'Onboarding';
  const [busy, setBusy] = useState(false);

  const openPrivacy = useCallback(() => {
    navigation.navigate('PrivacyPolicy');
  }, [navigation]);

  const requestTrack = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    try {
      await TrackingTransparency.requestTrackingPermissionsAsync();
    } catch { /* optional */ }
  }, []);

  const onContinue = useCallback(async () => {
    setBusy(true);
    try {
      await requestTrack();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ transparency_ack_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .catch(() => {});
      }
      if (nextRoute === 'Onboarding') {
        navigation.replace('Onboarding');
      } else {
        navigation.replace(nextRoute);
      }
    } finally {
      setBusy(false);
    }
  }, [navigation, nextRoute, requestTrack]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.iconWrap}>
          <Feather name="shield" size={32} color={GREEN} />
        </View>
        <Text style={styles.h1}>Transparency &amp; data sovereignty</Text>
        <Text style={styles.lead}>
          Snippd runs an Intelligence Layer on your behalf: deal matching, stacking logic, and budget guardrails.
          We minimize data collection to what powers those outcomes.
        </Text>

        <View style={styles.block}>
          <Text style={styles.h2}>Legal disclaimer</Text>
          <Text style={styles.p}>
            Snippd provides shopping intelligence and savings estimates for informational purposes only.
            Prices, offers, and nutrition estimates may differ at the register. Nothing here is financial,
            medical, or dietary advice.
          </Text>
        </View>

        {Platform.OS === 'ios' && (
          <View style={styles.block}>
            <Text style={styles.h2}>Request to track</Text>
            <Text style={styles.p}>
              On iOS, you can allow or deny cross-app tracking for analytics and ad relevance.
              You can change this anytime in Settings → Privacy → Tracking.
            </Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={requestTrack} activeOpacity={0.88}>
              <Text style={styles.secondaryBtnTxt}>Show iOS tracking prompt</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.h2}>Privacy policy</Text>
          <Text style={styles.p}>
            Read how we handle account data, retention, and your controls.
          </Text>
          <TouchableOpacity onPress={openPrivacy} activeOpacity={0.88}>
            <Text style={styles.link}>Open Privacy Policy →</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.cta, busy && styles.ctaDisabled]}
          onPress={onContinue}
          disabled={busy}
          activeOpacity={0.88}
        >
          {busy
            ? <ActivityIndicator color={WHITE} />
            : <Text style={styles.ctaTxt}>Continue</Text>}
        </TouchableOpacity>

        <Text style={styles.footer}>
          Questions?{' '}
          <Text style={styles.link} onPress={() => Linking.openURL('mailto:support@getsnippd.com')}>
            support@getsnippd.com
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: MINT },
  scroll: { padding: 24, paddingBottom: 40 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: WHITE,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(26,35,126,0.1)',
  },
  h1:     { fontSize: 24, fontWeight: '900', color: NAVY, marginBottom: 10, letterSpacing: -0.3 },
  lead:   { fontSize: 15, color: GRAY, lineHeight: 22, marginBottom: 20 },
  block:  { backgroundColor: WHITE, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(26,35,126,0.08)' },
  h2:     { fontSize: 14, fontWeight: '800', color: NAVY, marginBottom: 8 },
  p:      { fontSize: 13, color: GRAY, lineHeight: 20 },
  link:   { fontSize: 14, fontWeight: '800', color: GREEN, marginTop: 8 },
  secondaryBtn: {
    marginTop: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1.5, borderColor: GREEN, alignItems: 'center',
  },
  secondaryBtnTxt: { fontSize: 14, fontWeight: '800', color: GREEN },
  cta: {
    marginTop: 8, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.7 },
  ctaTxt: { color: WHITE, fontSize: 16, fontWeight: '800' },
  footer: { marginTop: 20, fontSize: 12, color: GRAY, textAlign: 'center' },
});
