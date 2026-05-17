// screens/PremiumBetaPaywallScreen.js
// High-conversion beta paywall — Founder Tier ($97 lifetime) vs Beta Rate ($4.99/mo).
// CTA: opens hosted Stripe payment link directly via Linking.openURL.
// Deep-link return (snippd://checkout-complete?status=success): resets nav to MainApp.
// Promo code SNIPPDDEMO: demo-only bypass — marks profile active and enters MainApp.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, Linking, ActivityIndicator, Platform, TextInput,
} from 'react-native';
import PropTypes from 'prop-types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ── Stripe payment links (hosted, no secret key needed client-side) ────────────
const STRIPE_FOUNDER  = process.env.EXPO_PUBLIC_STRIPE_FOUNDER  ?? 'https://buy.stripe.com/snippd-founder';
const STRIPE_BETA_PRO = process.env.EXPO_PUBLIC_STRIPE_BETA_PRO ?? 'https://buy.stripe.com/snippd-beta-pro';

// ── Demo bypass ───────────────────────────────────────────────────────────────
const DEMO_CODE = 'SNIPPDDEMO';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN       = '#0C9E54';
const DARK_NAVY   = '#0A192F';
const WHITE       = '#FFFFFF';
const SLATE       = '#64748B';
const SLATE_DARK  = '#475569';
const SLATE_LIGHT = '#CBD5E1';
const MINT_SOFT   = '#F6FDF9';
const BADGE_BG    = '#E6FFFA';
const AMBER       = '#D97706';
const BORDER      = '#E5E7EB';
const ERROR_RED   = '#DC2626';

// ── Static content ────────────────────────────────────────────────────────────
const VALUE_PILLARS = [
  {
    icon:  'lock',
    title: 'Instant Persona Lock-In',
    body:  'Immediately deploy your tailored deal stacks across your 3 favorite stores.',
  },
  {
    icon:  'chart-line',
    title: 'Optimized Catalog Matching',
    body:  'Automatically view mapped discounts that align with your performance staples and budget.',
  },
  {
    icon:  'magic',
    title: 'Full Creative Freedom',
    body:  'Zero commitments. Manage, pause, or adjust your goals inside your profile at any time.',
  },
];

const TRUST_BADGES = [
  { icon: 'shield',        label: 'Secure\nCheckout'      },
  { icon: 'check-circle',  label: 'Cancel\nAnytime'       },
  { icon: 'tag',           label: 'Transparent\nPricing'  },
  { icon: 'lock',          label: 'Your Data\nIs Private' },
];

const PLANS = {
  lifetime: {
    stripeUrl:   STRIPE_FOUNDER,
    badgeText:   'FOUNDER TIER',
    badgeColor:  GREEN,
    priceMain:   '$97',
    priceSuffix: '/ lifetime',
    priceColor:  AMBER,
    body: 'Pay once, free forever. Limited to the first 2,000 founding members.',
    ctaText: 'Claim Lifetime Access & Enter Dashboard',
  },
  monthly: {
    stripeUrl:   STRIPE_BETA_PRO,
    badgeText:   'BETA RATE',
    badgeColor:  SLATE,
    priceMain:   '$4.99',
    priceSuffix: '/ month',
    priceColor:  DARK_NAVY,
    body: 'Lock in our lowest subscription rate during beta testing only. Includes a 3-day free trial. Limited to 200 testers.',
    ctaText: 'Start 3-Day Free Trial & Enter Dashboard',
  },
};

// ── Sub-components (module scope — no inner components) ───────────────────────

function PillarRow({ icon, title, body, showDivider }) {
  return (
    <>
      <View style={s.pillarRow}>
        <View style={s.pillarIconCircle}>
          <FontAwesome5 name={icon} size={18} color={GREEN} solid />
        </View>
        <View style={s.pillarText}>
          <Text style={s.pillarTitle}>{title}</Text>
          <Text style={s.pillarBody}>{body}</Text>
        </View>
      </View>
      {showDivider && <View style={s.pillarDivider} />}
    </>
  );
}
PillarRow.propTypes = {
  icon:        PropTypes.string.isRequired,
  title:       PropTypes.string.isRequired,
  body:        PropTypes.string.isRequired,
  showDivider: PropTypes.bool,
};

function RadioDot({ selected }) {
  return (
    <View style={[s.radioOuter, selected && s.radioOuterOn]}>
      {selected && <View style={s.radioInner} />}
    </View>
  );
}
RadioDot.propTypes = { selected: PropTypes.bool };

function TierCard({ planKey, plan, selected, onSelect }) {
  const active = selected === planKey;
  return (
    <TouchableOpacity
      style={[s.tierCard, active ? s.tierCardOn : s.tierCardOff]}
      onPress={() => onSelect(planKey)}
      activeOpacity={0.85}
    >
      <View style={[s.cornerBadge, { backgroundColor: plan.badgeColor }]}>
        <Text style={s.cornerBadgeText}>{plan.badgeText}</Text>
      </View>

      <Text style={[s.tierPrice, { color: plan.priceColor }]}>
        {plan.priceMain}
        <Text style={s.tierPriceSuffix}> {plan.priceSuffix}</Text>
      </Text>

      <View style={s.tierDivider} />
      <Text style={s.tierBody}>{plan.body}</Text>

      <View style={s.tierRadioWrap}>
        <RadioDot selected={active} />
      </View>
    </TouchableOpacity>
  );
}
TierCard.propTypes = {
  planKey:  PropTypes.string.isRequired,
  plan:     PropTypes.object.isRequired,
  selected: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};

function TrustBadge({ icon, label }) {
  return (
    <View style={s.trustBadge}>
      <Feather name={icon} size={22} color={GREEN} />
      <Text style={s.trustLabel}>{label}</Text>
    </View>
  );
}
TrustBadge.propTypes = {
  icon:  PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
};

// ─────────────────────────────────────────────────────────────────────────────
export default function PremiumBetaPaywallScreen({ navigation }) {
  const [selected,     setSelected]     = useState('lifetime');
  const [loading,      setLoading]      = useState(false);
  const [promoCode,    setPromoCode]    = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError,   setPromoError]   = useState('');
  const [promoSuccess, setPromoSuccess] = useState(false);

  // Deep-link listener — fires when Stripe redirects back to the app
  const handleDeepLink = useCallback(({ url }) => {
    if (url && url.includes('checkout-complete') && url.includes('status=success')) {
      navigation.reset({ index: 0, routes: [{ name: 'MainApp' }] });
    }
  }, [navigation]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink({ url }); });
    return () => sub.remove();
  }, [handleDeepLink]);

  // Primary CTA — opens hosted Stripe payment link
  const handleCta = async () => {
    setLoading(true);
    try {
      const url = PLANS[selected].stripeUrl;
      await Linking.openURL(url);
    } catch (err) {
      console.warn('[Paywall] Stripe link error', err);
    } finally {
      setLoading(false);
    }
  };

  // Demo-only promo bypass — SNIPPDDEMO marks the profile active and enters the app
  const handlePromo = async () => {
    setPromoError('');
    if (promoCode.trim().toUpperCase() !== DEMO_CODE) {
      setPromoError('Invalid promo code.');
      return;
    }
    setPromoLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Direct write intentional — demo-only bypass, not a user-facing business flow
        await supabase
          .from('profiles')
          .update({ subscription_status: 'active', billing_plan: 'demo' })
          .eq('user_id', session.user.id);
      }
      setPromoSuccess(true);
      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'MainApp' }] });
      }, 700);
    } catch (err) {
      console.warn('[Paywall] promo error', err);
      setPromoError('Something went wrong. Try again.');
    } finally {
      setPromoLoading(false);
    }
  };

  const activePlan = PLANS[selected];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 1. Header ────────────────────────────────────────────────── */}
        <View style={s.badgeWrap}>
          <View style={s.accessBadge}>
            <FontAwesome5 name="bolt" size={10} color={GREEN} solid style={{ marginRight: 6 }} />
            <Text style={s.accessBadgeText}>EXCLUSIVE BETA ACCESS</Text>
          </View>
        </View>

        <Text style={s.headline}>Activate Your{'\n'}Optimization Engine</Text>
        <Text style={s.subheadline}>
          Your baseline is saved. Step into a smarter way to shop.
        </Text>

        {/* ── 2. Value Pillars ─────────────────────────────────────────── */}
        <View style={s.pillarsCard}>
          {VALUE_PILLARS.map((p, i) => (
            <PillarRow
              key={p.icon}
              icon={p.icon}
              title={p.title}
              body={p.body}
              showDivider={i < VALUE_PILLARS.length - 1}
            />
          ))}
        </View>

        {/* ── 3. Dual-Grid Tier Cards ───────────────────────────────────── */}
        <View style={s.tierGrid}>
          {Object.entries(PLANS).map(([key, plan]) => (
            <TierCard
              key={key}
              planKey={key}
              plan={plan}
              selected={selected}
              onSelect={setSelected}
            />
          ))}
        </View>

        {/* ── 4. Trust Badges ──────────────────────────────────────────── */}
        <View style={s.trustRow}>
          {TRUST_BADGES.map((b) => (
            <TrustBadge key={b.icon + b.label} icon={b.icon} label={b.label} />
          ))}
        </View>

        <View style={s.trustDivider} />

        {/* Stripe attestation */}
        <View style={s.stripeRow}>
          <Feather name="lock" size={11} color={SLATE} style={{ marginRight: 5 }} />
          <Text style={s.stripeText}>
            All payments are securely processed by{' '}
            <Text style={s.stripeBold}>Stripe.</Text>
          </Text>
        </View>

        <Text style={s.billingNote}>
          You can manage your subscription and billing preferences at any time inside your account settings.
        </Text>

        {/* ── 5. Promo Code ────────────────────────────────────────────── */}
        <View style={s.promoDivider} />
        <Text style={s.promoLabel}>Have a promo code?</Text>

        <View style={s.promoRow}>
          <TextInput
            style={[s.promoInput, promoSuccess && s.promoInputSuccess, promoError && s.promoInputError]}
            placeholder="Enter code"
            placeholderTextColor={SLATE}
            value={promoCode}
            onChangeText={(t) => { setPromoCode(t); setPromoError(''); }}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!promoSuccess}
          />
          <TouchableOpacity
            style={[s.promoBtn, promoSuccess && s.promoBtnSuccess]}
            onPress={handlePromo}
            disabled={promoLoading || promoSuccess || promoCode.trim().length === 0}
            activeOpacity={0.8}
          >
            {promoLoading ? (
              <ActivityIndicator color={WHITE} size="small" />
            ) : (
              <Text style={s.promoBtnText}>
                {promoSuccess ? 'Applied' : 'Apply'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {promoError ? (
          <Text style={s.promoError}>{promoError}</Text>
        ) : null}

        {promoSuccess ? (
          <Text style={s.promoSuccessText}>Code accepted. Entering dashboard...</Text>
        ) : null}

      </ScrollView>

      {/* ── 6. Fixed CTA Button ──────────────────────────────────────────── */}
      <View style={s.ctaWrap}>
        <TouchableOpacity
          style={s.ctaBtn}
          onPress={handleCta}
          activeOpacity={0.88}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={WHITE} size="small" />
          ) : (
            <>
              <Text style={s.ctaBtnText}>{activePlan.ctaText}</Text>
              <Feather name="arrow-right" size={18} color={WHITE} style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

PremiumBetaPaywallScreen.propTypes = {
  navigation: PropTypes.shape({ reset: PropTypes.func.isRequired }).isRequired,
};

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: WHITE },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 32,
    maxWidth: 540,
    alignSelf: 'center',
    width: '100%',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  badgeWrap:       { alignItems: 'center', marginBottom: 16 },
  accessBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: BADGE_BG,
    borderWidth: 1, borderColor: GREEN, borderRadius: 20,
    paddingVertical: 4, paddingHorizontal: 12,
  },
  accessBadgeText: {
    fontSize: 11, fontWeight: '700', color: GREEN, letterSpacing: 1,
  },
  headline: {
    fontSize: 26, fontWeight: '800', color: DARK_NAVY,
    textAlign: 'center', letterSpacing: -0.4, lineHeight: 34,
    marginTop: 16, marginBottom: 6,
  },
  subheadline: {
    fontSize: 14, color: SLATE, textAlign: 'center',
    lineHeight: 21, marginBottom: 28,
  },

  // ── Value Pillars ─────────────────────────────────────────────────────────
  pillarsCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    marginBottom: 24,
    ...Platform.select({
      web:     { boxShadow: '0 2px 12px rgba(0,0,0,0.05)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    }),
  },
  pillarRow:        { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 16, gap: 14 },
  pillarIconCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: BADGE_BG,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  pillarText:  { flex: 1 },
  pillarTitle: { fontSize: 15, fontWeight: '700', color: DARK_NAVY, marginBottom: 4 },
  pillarBody:  { fontSize: 13, color: SLATE_DARK, lineHeight: 19 },
  pillarDivider: { height: 1, backgroundColor: BORDER },

  // ── Tier Cards ────────────────────────────────────────────────────────────
  tierGrid: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  tierCard: {
    flex: 1, borderWidth: 2, borderRadius: 16,
    padding: 14, overflow: 'hidden',
    position: 'relative',
  },
  tierCardOn:  { borderColor: GREEN, backgroundColor: MINT_SOFT },
  tierCardOff: { borderColor: SLATE_LIGHT, backgroundColor: WHITE },

  cornerBadge: {
    position: 'absolute', top: 0, right: 0,
    borderTopRightRadius: 14, borderBottomLeftRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  cornerBadgeText: { fontSize: 9, fontWeight: '800', color: WHITE, letterSpacing: 0.6 },

  tierPrice:       { fontSize: 20, fontWeight: '800', marginTop: 30, letterSpacing: -0.3 },
  tierPriceSuffix: { fontSize: 13, fontWeight: '500', color: SLATE },
  tierDivider:     { height: 1, backgroundColor: BORDER, marginVertical: 10 },
  tierBody:        { fontSize: 12, color: SLATE_DARK, lineHeight: 18, marginBottom: 14 },
  tierRadioWrap:   { alignItems: 'center', marginTop: 4 },

  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: SLATE_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterOn: { borderColor: GREEN },
  radioInner:   { width: 12, height: 12, borderRadius: 6, backgroundColor: GREEN },

  // ── Trust Badges ──────────────────────────────────────────────────────────
  trustRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 18, borderTopWidth: 1, borderColor: BORDER,
  },
  trustBadge: { flex: 1, alignItems: 'center', gap: 6 },
  trustLabel: {
    fontSize: 11, fontWeight: '600', color: SLATE_DARK,
    textAlign: 'center', lineHeight: 15,
  },
  trustDivider: { height: 1, backgroundColor: BORDER, marginBottom: 14 },

  // ── Stripe attestation ────────────────────────────────────────────────────
  stripeRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', marginBottom: 8,
  },
  stripeText: { fontSize: 12, color: SLATE, textAlign: 'center' },
  stripeBold: { fontWeight: '700', color: SLATE_DARK },

  // ── Billing note ──────────────────────────────────────────────────────────
  billingNote: {
    fontSize: 12, color: SLATE, textAlign: 'center',
    lineHeight: 18, paddingHorizontal: 8, marginBottom: 4,
  },

  // ── Promo code ────────────────────────────────────────────────────────────
  promoDivider: { height: 1, backgroundColor: BORDER, marginTop: 20, marginBottom: 16 },
  promoLabel:   { fontSize: 13, fontWeight: '600', color: SLATE_DARK, marginBottom: 10 },
  promoRow:     { flexDirection: 'row', gap: 10, marginBottom: 6 },
  promoInput: {
    flex: 1,
    height: 46,
    borderWidth: 1.5,
    borderColor: SLATE_LIGHT,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: DARK_NAVY,
    backgroundColor: WHITE,
    letterSpacing: 1,
  },
  promoInputSuccess: { borderColor: GREEN, backgroundColor: MINT_SOFT },
  promoInputError:   { borderColor: ERROR_RED },
  promoBtn: {
    height: 46,
    paddingHorizontal: 20,
    backgroundColor: DARK_NAVY,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
  },
  promoBtnSuccess: { backgroundColor: GREEN },
  promoBtnText:    { fontSize: 14, fontWeight: '700', color: WHITE },
  promoError:       { fontSize: 12, color: ERROR_RED, marginTop: 2 },
  promoSuccessText: { fontSize: 12, color: GREEN, fontWeight: '600', marginTop: 2 },

  // ── CTA ───────────────────────────────────────────────────────────────────
  ctaWrap: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24,
    backgroundColor: WHITE,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  ctaBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    ...Platform.select({
      web:     { boxShadow: '0 4px 18px rgba(12,158,84,0.38)' },
      default: { shadowColor: GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.32, shadowRadius: 12, elevation: 6 },
    }),
  },
  ctaBtnText: { fontSize: 16, fontWeight: '800', color: WHITE },
});
