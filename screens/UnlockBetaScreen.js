// screens/UnlockBetaScreen.js
// Step 4 of the new onboarding flow (replaces waitlist as primary destination).
// Three paths:
//   1. Valid promo code → sets user_persona.status='launched', beta_unlocked=true → MainApp
//   2. Stripe payment  → opens link, polls persona on return, same as WaitlistScreen
//   3. Limited preview → routes to MainApp if is_beta_live flag allows

import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, AppState, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { recordMemoryEvent } from '../src/lib/memoryEvents';

const GREEN      = '#0C9E54';
const GREEN_SOFT = 'rgba(12,158,84,0.12)';
const NAVY       = '#1A237E';
const NAVY_DEEP  = '#04361D';
const MINT       = '#F0FBF0';
const WHITE      = '#FFFFFF';
const SLATE      = '#64748B';
const BORDER     = '#E2E8F0';
const CORAL      = '#FF7043';
const CORAL_SOFT = 'rgba(255,112,67,0.12)';
const AMBER      = '#F59E0B';
const MINT_POP   = '#C5FFBC';

const STRIPE_BETA_PRO = process.env.EXPO_PUBLIC_STRIPE_BETA_PRO  ?? 'https://buy.stripe.com/snippd-beta-pro';
const STRIPE_FOUNDER  = process.env.EXPO_PUBLIC_STRIPE_FOUNDER   ?? 'https://buy.stripe.com/snippd-founder';

// Hardcoded fallback codes (same as PromoCodesScreen)
const HARDCODED_VALID = ['SNIPPD10', 'WELCOME5', 'SAVE20', 'CLERMONT', 'SNIPPDBETA', 'FOUNDER97', 'TEST1234SNIPPD'];

// ── Helper — defined outside to avoid remount ─────────────────────────────────

function PlanCard({ title, price, per, desc, badgeText, badgeColor, onPress, color }) {
  return (
    <TouchableOpacity
      style={[styles.planCard, color && { borderColor: color, borderWidth: 1.5 }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {badgeText ? (
        <View style={[styles.planBadge, { backgroundColor: badgeColor + '20', borderColor: badgeColor }]}>
          <Text style={[styles.planBadgeText, { color: badgeColor }]}>{badgeText}</Text>
        </View>
      ) : null}
      <Text style={[styles.planTitle, color && { color }]}>{title}</Text>
      <Text style={[styles.planPrice, color && { color }]}>
        {price}<Text style={styles.planPer}>{per}</Text>
      </Text>
      <Text style={styles.planDesc}>{desc}</Text>
      <View style={[styles.planCta, { backgroundColor: color ?? GREEN }]}>
        <Text style={styles.planCtaText}>Unlock now</Text>
        <Feather name="arrow-right" size={14} color={WHITE} />
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function UnlockBetaScreen({ route, navigation }) {
  const { openPromo } = route?.params ?? {};

  const [userId,       setUserId]      = useState(null);
  const [promoCode,    setPromoCode]   = useState('');
  const [promoStatus,  setPromoStatus] = useState(null); // null | 'checking' | 'valid' | 'invalid'
  const [promoFocused, setPromoFocused]= useState(openPromo ?? false);
  const [isBetaLive,   setIsBetaLive]  = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);

  const wentToStripeRef = useRef(false);
  const pollCountRef    = useRef(0);

  // ── Load user + beta flag ─────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setUserId(user.id);

        const { data: flag } = await supabase
          .from('snippd_integrations')
          .select('value')
          .eq('key', 'is_beta_live')
          .maybeSingle();
        setIsBetaLive(flag?.value === 'true');
      } catch (_) {}
    })();
  }, []);

  // ── Re-check payment on focus (same polling as WaitlistScreen) ────────────

  useFocusEffect(
    React.useCallback(() => {
      if (!userId) return;
      (async () => {
        try {
          const { data: persona } = await supabase
            .from('user_persona')
            .select('status, briefing_completed, beta_unlocked')
            .eq('user_id', userId)
            .maybeSingle();

          if (persona?.status === 'paid_beta' || persona?.beta_unlocked || persona?.status === 'launched') {
            navigation.replace('MainApp');
          }
        } catch (_) {}
      })();
    }, [userId, navigation])
  );

  // ── AppState — poll after returning from Stripe ───────────────────────────

  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active' || !wentToStripeRef.current) return;
      if (pollCountRef.current >= 6) {
        wentToStripeRef.current = false; pollCountRef.current = 0; return;
      }
      pollCountRef.current += 1;
      try {
        const { data: persona } = await supabase
          .from('user_persona')
          .select('status, briefing_completed')
          .eq('user_id', userId)
          .maybeSingle();

        if (persona?.status === 'paid_beta' || persona?.status === 'launched') {
          wentToStripeRef.current = false; pollCountRef.current = 0;
          navigation.replace('MainApp');
        } else if (pollCountRef.current < 6) {
          setTimeout(async () => {
            if (!wentToStripeRef.current) return;
            pollCountRef.current += 1;
            try {
              const { data: p2 } = await supabase
                .from('user_persona')
                .select('status')
                .eq('user_id', userId)
                .maybeSingle();
              if (p2?.status === 'paid_beta' || p2?.status === 'launched') {
                wentToStripeRef.current = false; pollCountRef.current = 0;
                navigation.replace('MainApp');
              }
            } catch (_) {}
          }, 3000);
        }
      } catch (_) {}
    });
    return () => sub.remove();
  }, [userId, navigation]);

  // ── Promo code validation ─────────────────────────────────────────────────

  async function applyPromoCode() {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoStatus('checking');

    try {
      // Try promo_codes table first (may not exist yet)
      const { data: dbCode } = await supabase
        .from('promo_codes')
        .select('code, active, unlock_type')
        .eq('code', code)
        .eq('active', true)
        .maybeSingle();

      const isValid = dbCode != null || HARDCODED_VALID.includes(code);

      if (!isValid) {
        setPromoStatus('invalid');
        return;
      }

      setPromoStatus('valid');

      // Mark beta unlocked in user_persona
      if (userId) {
        await supabase.from('user_persona').upsert({
          user_id:       userId,
          status:        'launched',
          beta_unlocked: true,
          promo_unlocked:true,
          unlock_source: 'promo',
        }, { onConflict: 'user_id' });

        // Store the code in profiles.preferences for reference
        await supabase.rpc('apply_promo_code_to_profile', {
          p_user_id: userId,
          p_code:    code,
        }).catch(() => {
          // RPC may not exist — silently skip
        });

        recordMemoryEvent({
          event_type: 'promo_code_entered',
          metadata: { code, valid: true },
        });
        recordMemoryEvent({ event_type: 'beta_unlocked', metadata: { source: 'promo' } });
      }

      // Small delay so user sees the success state
      setTimeout(() => navigation.replace('MainApp'), 800);
    } catch (_) {
      setPromoStatus('invalid');
    }
  }

  async function handleCheckAccess() {
    if (!userId) return;
    setCheckingAccess(true);
    try {
      const { data: persona } = await supabase
        .from('user_persona')
        .select('status, briefing_completed')
        .eq('user_id', userId)
        .maybeSingle();

      if (persona?.status === 'paid_beta' || persona?.status === 'launched') {
        navigation.replace('MainApp');
      } else {
        Alert.alert('Still processing', 'Your payment may take a moment to confirm. Try again in 30 seconds.');
      }
    } catch (_) {
      Alert.alert('Error', 'Could not check status. Try again.');
    }
    setCheckingAccess(false);
  }

  function openStripe(url, source) {
    wentToStripeRef.current = true;
    pollCountRef.current    = 0;
    recordMemoryEvent({ event_type: 'beta_unlocked', metadata: { source } });
    require('react-native').Linking.openURL(url).catch(() => {});
  }

  function handleLimitedPreview() {
    if (isBetaLive) {
      recordMemoryEvent({ event_type: 'beta_unlocked', metadata: { source: 'limited_preview' } });
      navigation.replace('MainApp');
    } else {
      Alert.alert(
        'Limited preview',
        'Full beta isn\'t open yet — but your spot is locked in. You\'ll get early access as soon as we open the doors.',
        [{ text: 'Got it' }]
      );
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.hero}>
        <View style={styles.heroIconWrap}>
          <Feather name="unlock" size={28} color={MINT_POP} />
        </View>
        <Text style={styles.heroTitle}>Unlock full access</Text>
        <Text style={styles.heroSub}>
          Your forecast is ready. Get in to start saving this week.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Promo code ──────────────────────────────────────────────────── */}
        <View style={styles.promoCard}>
          <View style={styles.promoHeader}>
            <Feather name="tag" size={16} color={CORAL} />
            <Text style={styles.promoTitle}>Enter promo code</Text>
          </View>
          <Text style={styles.promoSub}>
            Have a code from a friend or partner? Enter it to unlock immediately.
          </Text>

          <View style={styles.promoInputRow}>
            <TextInput
              style={[
                styles.promoInput,
                promoStatus === 'valid'   && styles.promoInputValid,
                promoStatus === 'invalid' && styles.promoInputInvalid,
              ]}
              placeholder="e.g. SNIPPDBETA"
              placeholderTextColor={SLATE}
              value={promoCode}
              onChangeText={v => { setPromoCode(v); setPromoStatus(null); }}
              autoCapitalize="characters"
              autoCorrect={false}
              onFocus={() => setPromoFocused(true)}
              returnKeyType="done"
              onSubmitEditing={applyPromoCode}
            />
            <TouchableOpacity
              style={[styles.promoApplyBtn, promoStatus === 'checking' && { opacity: 0.7 }]}
              onPress={applyPromoCode}
              disabled={promoStatus === 'checking' || promoStatus === 'valid'}
              activeOpacity={0.85}
            >
              {promoStatus === 'checking'
                ? <ActivityIndicator color={WHITE} size="small" />
                : <Text style={styles.promoApplyText}>
                    {promoStatus === 'valid' ? '✓ Applied' : 'Apply'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          {promoStatus === 'valid' && (
            <View style={styles.promoSuccessRow}>
              <Feather name="check-circle" size={15} color={GREEN} />
              <Text style={styles.promoSuccessText}>Code accepted. Unlocking your access…</Text>
            </View>
          )}
          {promoStatus === 'invalid' && (
            <Text style={styles.promoErrorText}>That code wasn't recognized. Check the spelling and try again.</Text>
          )}
        </View>

        {/* ── Stripe plans ────────────────────────────────────────────────── */}
        <Text style={styles.orDivider}>— or pay to unlock instantly —</Text>

        <View style={styles.plansRow}>
          <PlanCard
            title="Beta Pro"
            price="$4.99"
            per="/mo"
            desc="Full access during beta. Cancel anytime."
            onPress={() => openStripe(STRIPE_BETA_PRO, 'stripe_beta_pro')}
            color={GREEN}
          />
          <PlanCard
            title="Founder"
            price="$97"
            per=" once"
            desc="Lifetime access + Founders Wall recognition."
            badgeText="Best value"
            badgeColor={CORAL}
            onPress={() => openStripe(STRIPE_FOUNDER, 'stripe_founder')}
            color={CORAL}
          />
        </View>

        {/* After Stripe — check access button */}
        <TouchableOpacity style={styles.checkAccessBtn} onPress={handleCheckAccess} activeOpacity={0.8}>
          {checkingAccess
            ? <ActivityIndicator size="small" color={GREEN} />
            : <>
                <Feather name="refresh-cw" size={14} color={GREEN} />
                <Text style={styles.checkAccessText}>Already paid? Check my access</Text>
              </>
          }
        </TouchableOpacity>

        {/* ── Limited preview ─────────────────────────────────────────────── */}
        <View style={styles.previewCard}>
          <View style={styles.previewLeft}>
            <Feather name="eye" size={16} color={SLATE} />
            <View style={{ flex: 1 }}>
              <Text style={styles.previewTitle}>Continue with limited preview</Text>
              <Text style={styles.previewSub}>
                {isBetaLive
                  ? 'Explore core features now. Upgrade for full access.'
                  : 'Your spot is locked in. We\'ll notify you when full access opens.'}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.previewBtn} onPress={handleLimitedPreview} activeOpacity={0.8}>
            <Text style={styles.previewBtnText}>{isBetaLive ? 'Continue' : 'Lock my spot'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Trust signals ────────────────────────────────────────────────── */}
        <View style={styles.trustRow}>
          {[
            { icon: 'lock',      text: 'Secure checkout' },
            { icon: 'x-circle',  text: 'Cancel anytime' },
            { icon: 'shield',    text: 'No price promises' },
          ].map(({ icon, text }) => (
            <View key={icon} style={styles.trustItem}>
              <Feather name={icon} size={13} color={SLATE} />
              <Text style={styles.trustText}>{text}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: NAVY_DEEP },

  hero: {
    backgroundColor: NAVY_DEEP,
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24,
    alignItems: 'center', gap: 8,
  },
  heroIconWrap: {
    width: 60, height: 60, borderRadius: 20,
    backgroundColor: 'rgba(197,255,188,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  heroTitle: { fontSize: 26, fontWeight: '900', color: WHITE, textAlign: 'center' },
  heroSub:   { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 20 },

  body: {
    backgroundColor: MINT,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 24, gap: 14,
  },

  // Promo
  promoCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 20, gap: 10,
    borderWidth: 1.5, borderColor: CORAL + '40',
  },
  promoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promoTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  promoSub:   { fontSize: 13, color: SLATE, lineHeight: 19 },
  promoInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  promoInput: {
    flex: 1, borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, fontWeight: '700', color: NAVY,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 1.5,
  },
  promoInputValid:   { borderColor: GREEN,      backgroundColor: 'rgba(12,158,84,0.06)' },
  promoInputInvalid: { borderColor: '#E53E3E',  backgroundColor: 'rgba(229,62,62,0.06)' },
  promoApplyBtn: {
    backgroundColor: CORAL, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 18,
  },
  promoApplyText: { fontSize: 14, fontWeight: '800', color: WHITE },
  promoSuccessRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  promoSuccessText: { fontSize: 13, color: GREEN, fontWeight: '600' },
  promoErrorText: { fontSize: 13, color: '#E53E3E', lineHeight: 18 },

  // Or divider
  orDivider: {
    textAlign: 'center', fontSize: 12, color: SLATE,
    fontWeight: '600', letterSpacing: 0.5,
  },

  // Plan cards
  plansRow: { flexDirection: 'row', gap: 12 },
  planCard: {
    flex: 1, backgroundColor: WHITE, borderRadius: 18,
    padding: 18, gap: 6, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center',
  },
  planBadge: {
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, marginBottom: 4,
  },
  planBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  planTitle:    { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  planPrice:    { fontSize: 24, fontWeight: '900', color: NAVY },
  planPer:      { fontSize: 13, fontWeight: '500' },
  planDesc:     { fontSize: 11, color: SLATE, textAlign: 'center', lineHeight: 15 },
  planCta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 6,
  },
  planCtaText: { fontSize: 13, fontWeight: '700', color: WHITE },

  // Check access
  checkAccessBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: GREEN, borderRadius: 12,
    paddingVertical: 13, backgroundColor: WHITE,
  },
  checkAccessText: { fontSize: 13, fontWeight: '700', color: GREEN },

  // Limited preview
  previewCard: {
    backgroundColor: WHITE, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER, gap: 12,
  },
  previewLeft: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  previewTitle: { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 3 },
  previewSub:   { fontSize: 12, color: SLATE, lineHeight: 17 },
  previewBtn: {
    backgroundColor: MINT, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingVertical: 10, paddingHorizontal: 20, alignSelf: 'flex-end',
  },
  previewBtnText: { fontSize: 13, fontWeight: '700', color: NAVY },

  // Trust
  trustRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trustText: { fontSize: 11, color: SLATE },
});
