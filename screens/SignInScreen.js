/**
 * SignInScreen — Two-panel sign-in/sign-up.
 *
 * Tablet (width > 768): left green panel + right form panel.
 * Phone: compact hero header + form.
 *
 * Auth wiring:
 *   Google / Apple → supabase.auth.signInWithOAuth (opens browser)
 *   Email → supabase.auth.signInWithPassword / signUp
 *
 * On success: App.js onAuthStateChange handles routing.
 * Errors: inline red text (no Alert.alert).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Platform,
  Animated, KeyboardAvoidingView, ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';

WebBrowser.maybeCompleteAuthSession();

// ── Brand palette ─────────────────────────────────────────────────────────────
const GREEN     = '#0C9E54';
const GREEN_MID = '#0C6B38';
const NAVY      = '#172250';
const MINT      = '#c5ffbc';
const CREAM     = '#FAF8F1';
const WHITE     = '#FFFFFF';
const GRAY      = '#6B7280';
const BORDER    = '#E5E7EB';
const ERROR_RED = '#DC2626';
const GLASS     = 'rgba(255,255,255,0.94)';
const MINT_BG   = '#E8F5E9';

// ── Value proposition stats — left panel and mobile hero ──────────────────────
const STATS = [
  { value: 'Budget-first',   label: 'weekly planning'    },
  { value: 'Meals + stores', label: 'guided together'    },
  { value: 'Receipt-based',  label: 'learning'           },
];

// ── Google icon ───────────────────────────────────────────────────────────────
const GOOGLE_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];
function GoogleIcon({ size = 20 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
      {GOOGLE_COLORS.map((c, i) => (
        <View key={i} style={{ width: size / 2, height: size / 2, backgroundColor: c }} />
      ))}
    </View>
  );
}

// ── Apple icon ────────────────────────────────────────────────────────────────
function AppleIcon({ size = 20 }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name="smartphone" size={size - 2} color={NAVY} />
    </View>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatChip({ value, label, dark }) {
  return (
    <View style={[left.stat, dark && left.statDark]}>
      <Text style={[left.statNum, dark && left.statNumDark]}>{value}</Text>
      <Text style={[left.statLabel, dark && left.statLabelDark]}>{label}</Text>
    </View>
  );
}

// ── Social button ─────────────────────────────────────────────────────────────
function SocialBtn({ icon, label, onPress, disabled }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const press   = () => { Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start(); onPress?.(); };
  const release = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[form.socialBtn, disabled && { opacity: 0.5 }]}
        onPress={press}
        onPressOut={release}
        activeOpacity={0.85}
        disabled={disabled}
      >
        <View style={form.socialIcon}>{icon}</View>
        <Text style={form.socialLabel}>{label}</Text>
        <View style={{ width: 22 }} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────
function Field({ label, value, onChangeText, secureTextEntry, keyboardType,
                 autoCapitalize, placeholder, rightEl, onFocus, onBlur, focused }) {
  return (
    <View style={form.fieldWrap}>
      <Text style={form.fieldLabel}>{label}</Text>
      <View style={[form.inputWrap, focused && form.inputWrapFocused]}>
        <TextInput
          style={form.input}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType || 'default'}
          autoCapitalize={autoCapitalize || 'none'}
          placeholder={placeholder}
          placeholderTextColor="rgba(107,114,128,0.5)"
          onFocus={onFocus}
          onBlur={onBlur}
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
          selectionColor={GREEN}
          cursorColor={GREEN}
        />
        {rightEl}
      </View>
    </View>
  );
}

// ── Left panel (tablet only) ──────────────────────────────────────────────────
function LeftPanel() {
  return (
    <LinearGradient
      colors={[NAVY, GREEN_MID, GREEN]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={left.panel}
    >
      <View style={left.highlight} />

      {/* Wordmark */}
      <Text style={left.wordmark}>
        snipp<Text style={{ color: MINT }}>d</Text>
      </Text>

      {/* Headline + sub */}
      <View style={left.content}>
        <Text style={left.headline}>
          {'Smarter food\ndecisions, '}
          <Text style={left.headlineAccent}>{'before the\nmoney is spent.'}</Text>
        </Text>
        <Text style={left.sub}>
          Snippd helps you plan groceries, meals, store choices, savings, and eat-out options around your real weekly budget.
        </Text>
        <Text style={left.motto}>Save more, stress less.</Text>
      </View>

      {/* Stat cards */}
      <View style={left.statsRow}>
        {STATS.map((s, i) => (
          <View key={s.value} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {i > 0 && <View style={left.divider} />}
            <StatChip value={s.value} label={s.label} dark />
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

// ── Mobile hero header (phone only) ───────────────────────────────────────────
function MobileHero() {
  return (
    <View style={hero.wrap}>
      <Text style={hero.wordmark}>
        snipp<Text style={{ color: GREEN }}>d</Text>
      </Text>
      <Text style={hero.headline}>
        Smarter food decisions, before the money is spent.
      </Text>
      <Text style={hero.sub}>
        Plan groceries, meals, savings, and eat-out options around your real weekly budget.
      </Text>
      <View style={hero.statsRow}>
        {STATS.map(s => (
          <View key={s.value} style={hero.statCard}>
            <Text style={hero.statValue}>{s.value}</Text>
            <Text style={hero.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function SignInScreen({ navigation }) {
  const { width }  = useWindowDimensions();
  const isTablet   = width > 768;

  const [tab,           setTab]           = useState('signin');
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [showPw,        setShowPw]        = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [oauthLoading,  setOauthLoading]  = useState(null);
  const [errorMsg,      setErrorMsg]      = useState('');
  const [infoMsg,       setInfoMsg]       = useState('');
  const [focusedField,  setFocusedField]  = useState(null);
  const [billingPlan,   setBillingPlan]   = useState('trial'); // 'trial' | 'monthly'

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const clearError = () => { setErrorMsg(''); setInfoMsg(''); };

  // ── Email auth ────────────────────────────────────────────────────────────
  const handleEmail = useCallback(async () => {
    clearError();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
        if (error) throw error;
        if (data?.session?.access_token) {
          tracker.setAccessToken(data.session.access_token);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
        if (error) throw error;
        if (data?.user) {
          await supabase.from('profiles').upsert({
            user_id:        data.user.id,
            email:          data.user.email,
            full_name:      data.user.email?.split('@')[0],
            weekly_budget:  15000,
            billing_plan:   billingPlan,
          }, { onConflict: 'user_id', ignoreDuplicates: true });
          if (data.session) {
            tracker.setAccessToken(data.session.access_token);
          } else {
            setInfoMsg('Check your inbox to confirm your account, then sign in.');
          }
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [tab, email, password]);

  // ── OAuth ─────────────────────────────────────────────────────────────────
  const handleOAuth = useCallback(async (provider) => {
    clearError();
    setOauthLoading(provider);
    try {
      const redirectTo = makeRedirectUri({ scheme: 'snippd', path: 'auth/callback' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success' && result.url) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(result.url);
          if (exchangeErr) throw exchangeErr;
        }
      }
    } catch (err) {
      setErrorMsg(`${provider === 'google' ? 'Google' : 'Apple'} sign-in failed. Try email instead.`);
    } finally {
      setOauthLoading(null);
    }
  }, []);

  const handleForgotPassword = useCallback(async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('Enter your email above, then tap Forgot password?');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
      if (error) throw error;
      setErrorMsg(`Reset link sent to ${trimmedEmail}`);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [email]);

  const switchTab = (t) => { setTab(t); clearError(); };

  // ── Form panel ────────────────────────────────────────────────────────────
  const FormPanel = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[form.scroll, !isTablet && form.scrollPhone]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Mobile hero — shown on phone only */}
        {!isTablet && <MobileHero />}

        <Animated.View
          style={[
            form.card,
            isTablet && form.cardTablet,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Header */}
          <View style={form.header}>
            <Text style={form.eyebrow}>Your weekly food plan</Text>
            <Text style={form.title}>
              {tab === 'signin'
                ? <Text>Welcome{'\n'}<Text style={form.titleAccent}>back.</Text></Text>
                : <Text>Get{'\n'}<Text style={form.titleAccent}>started.</Text></Text>
              }
            </Text>
            <Text style={form.headerSub}>
              {tab === 'signin'
                ? <Text>New here? <Text style={form.headerSubLink} onPress={() => switchTab('signup')}>Create an Account</Text></Text>
                : <Text>Already have one? <Text style={form.headerSubLink} onPress={() => switchTab('signin')}>Sign In</Text></Text>
              }
            </Text>
          </View>

          {/* Tab toggle */}
          <View style={form.tabToggle}>
            <TouchableOpacity
              style={[form.tabBtn, tab === 'signin' && form.tabBtnActive]}
              onPress={() => switchTab('signin')}
            >
              <Text style={[form.tabBtnTxt, tab === 'signin' && form.tabBtnTxtActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[form.tabBtn, tab === 'signup' && form.tabBtnActive]}
              onPress={() => switchTab('signup')}
            >
              <Text style={[form.tabBtnTxt, tab === 'signup' && form.tabBtnTxtActive]}>Create an Account</Text>
            </TouchableOpacity>
          </View>

          {/* Social auth */}
          <View style={form.socialGroup}>
            <SocialBtn
              icon={<GoogleIcon size={20} />}
              label="Continue with Google"
              onPress={() => handleOAuth('google')}
              disabled={!!loading || oauthLoading === 'google'}
            />
            {Platform.OS === 'ios' && (
              <SocialBtn
                icon={<AppleIcon size={20} />}
                label="Continue with Apple"
                onPress={() => handleOAuth('apple')}
                disabled={!!loading || oauthLoading === 'apple'}
              />
            )}
          </View>

          {/* Divider */}
          <View style={form.divider}>
            <View style={form.dividerLine} />
            <Text style={form.dividerTxt}>or with email</Text>
            <View style={form.dividerLine} />
          </View>

          {/* Fields */}
          <View style={form.fieldGroup}>
            <Field
              label="EMAIL ADDRESS"
              value={email}
              onChangeText={t => { setEmail(t); clearError(); }}
              keyboardType="email-address"
              placeholder="Email address"
              focused={focusedField === 'email'}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
            />
            <Field
              label="PASSWORD"
              value={password}
              onChangeText={t => { setPassword(t); clearError(); }}
              secureTextEntry={!showPw}
              placeholder="Password"
              focused={focusedField === 'pw'}
              onFocus={() => setFocusedField('pw')}
              onBlur={() => setFocusedField(null)}
              rightEl={
                <TouchableOpacity style={form.eyeBtn} onPress={() => setShowPw(v => !v)}>
                  <Feather name={showPw ? 'eye-off' : 'eye'} size={16} color={GRAY} />
                </TouchableOpacity>
              }
            />
          </View>

          {/* Forgot password */}
          {tab === 'signin' && (
            <TouchableOpacity style={form.forgotWrap} onPress={handleForgotPassword} disabled={loading}>
              <Text style={form.forgotTxt}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {/* Pricing section — signup only */}
          {tab === 'signup' && (
            <View style={form.pricingSection}>
              <Text style={form.pricingHeading}>Choose how to start</Text>

              {/* Trial option */}
              <TouchableOpacity
                style={[form.planOption, billingPlan === 'trial' && form.planOptionActive]}
                onPress={() => setBillingPlan('trial')}
                activeOpacity={0.8}
              >
                <View style={[form.planRadio, billingPlan === 'trial' && form.planRadioActive]}>
                  {billingPlan === 'trial' && <View style={form.planRadioDot} />}
                </View>
                <View style={form.planText}>
                  <Text style={[form.planTitle, billingPlan === 'trial' && form.planTitleActive]}>
                    3-day free trial
                  </Text>
                  <Text style={form.planSub}>
                    Then $97/year — founding member rate
                  </Text>
                </View>
                <View style={form.planBadge}>
                  <Text style={form.planBadgeText}>Best value</Text>
                </View>
              </TouchableOpacity>

              {/* Monthly option */}
              <TouchableOpacity
                style={[form.planOption, billingPlan === 'monthly' && form.planOptionActive]}
                onPress={() => setBillingPlan('monthly')}
                activeOpacity={0.8}
              >
                <View style={[form.planRadio, billingPlan === 'monthly' && form.planRadioActive]}>
                  {billingPlan === 'monthly' && <View style={form.planRadioDot} />}
                </View>
                <View style={form.planText}>
                  <Text style={[form.planTitle, billingPlan === 'monthly' && form.planTitleActive]}>
                    $4.99/month
                  </Text>
                  <Text style={form.planSub}>No trial — start right away, cancel anytime</Text>
                </View>
              </TouchableOpacity>

              <Text style={form.pricingDisclosure}>
                {billingPlan === 'trial'
                  ? 'Your 3-day free trial starts today. After 3 days, $97 is charged annually. Cancel before your trial ends to avoid any charges.'
                  : '$4.99 is charged monthly. Cancel anytime from your account settings.'}
              </Text>
            </View>
          )}

          {/* Error / info */}
          {!!errorMsg && <Text style={form.errorTxt}>{errorMsg}</Text>}
          {!!infoMsg  && <Text style={form.infoTxt}>{infoMsg}</Text>}

          {/* Submit */}
          <TouchableOpacity
            style={[form.submitBtn, (loading || !!oauthLoading) && form.submitBtnDisabled]}
            onPress={handleEmail}
            disabled={loading || !!oauthLoading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <Text style={form.submitBtnTxt}>
                {tab === 'signin'
                  ? 'Sign In'
                  : billingPlan === 'trial'
                  ? 'Start 3-day Free Trial'
                  : 'Subscribe at $4.99/mo'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Trust copy */}
          <Text style={form.trustCopy}>
            {tab === 'signup'
              ? 'No surprise charges. Cancel before trial ends to pay nothing.'
              : 'Plan smarter. Save more. Stress less.'}
          </Text>

          {/* Bottom switch link */}
          <Text style={form.bottomLink}>
            {tab === 'signin'
              ? <Text>No account yet?<Text style={form.bottomLinkA} onPress={() => switchTab('signup')}> Start your free trial</Text></Text>
              : <Text>Already have an account?<Text style={form.bottomLinkA} onPress={() => switchTab('signin')}> Sign In</Text></Text>
            }
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <View style={root.container}>
      <StatusBar barStyle="dark-content" />

      {isTablet ? (
        <View style={root.twoPanelRow}>
          <View style={root.leftCol}>
            <LeftPanel />
          </View>
          <View style={root.rightCol}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
              <FormPanel />
            </SafeAreaView>
          </View>
        </View>
      ) : (
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <FormPanel />
        </SafeAreaView>
      )}
    </View>
  );
}

// ── Left panel styles ─────────────────────────────────────────────────────────
const left = StyleSheet.create({
  panel: {
    flex: 1,
    padding: 48,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    width: 400, height: 400,
    top: -80, right: -100,
    borderRadius: 200,
    backgroundColor: 'rgba(197,255,188,0.12)',
  },
  wordmark: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 30,
    color: MINT,
    letterSpacing: -0.5,
  },
  content: { gap: 18 },
  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 42,
    lineHeight: 48,
    color: WHITE,
    letterSpacing: -1.5,
  },
  headlineAccent: {
    fontFamily: 'Sublima-ExtraLight',
    color: MINT,
  },
  sub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 24,
    fontWeight: '300',
    maxWidth: 320,
  },
  motto: {
    fontSize: 14,
    fontWeight: '700',
    color: MINT,
    letterSpacing: 0.2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat:          { flex: 1 },
  statDark:      { flex: 1 },
  statNum:       { fontSize: 15, fontWeight: '900', color: MINT, letterSpacing: -0.3 },
  statNumDark:   { fontSize: 15, fontWeight: '900', color: MINT, letterSpacing: -0.3 },
  statLabel:     { fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  statLabelDark: { fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  divider:       { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 16 },
});

// ── Mobile hero styles ────────────────────────────────────────────────────────
const hero = StyleSheet.create({
  wrap: {
    paddingBottom: 28,
  },
  wordmark: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 26,
    color: NAVY,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  headline: {
    fontSize: 22,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.5,
    lineHeight: 28,
    marginBottom: 8,
  },
  sub: {
    fontSize: 13,
    color: GRAY,
    lineHeight: 19,
    marginBottom: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 11,
    fontWeight: '800',
    color: GREEN,
    textAlign: 'center',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 9,
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});

// ── Form styles ───────────────────────────────────────────────────────────────
const form = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 48,
  },
  scrollPhone: {
    padding: 24,
    paddingTop: 16,
  },
  card: { width: '100%' },
  cardTablet: { maxWidth: 420, alignSelf: 'center' },

  header: { marginBottom: 28 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: GREEN,
    marginBottom: 10,
  },
  title: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 36,
    color: NAVY,
    letterSpacing: -1.2,
    lineHeight: 40,
    marginBottom: 8,
  },
  titleAccent: {
    fontFamily: 'Sublima-ExtraLight',
    color: GREEN,
  },
  headerSub: { fontSize: 14, color: GRAY, fontWeight: '300' },
  headerSubLink: { color: GREEN, fontWeight: '600' },

  // Tab toggle
  tabToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(12,158,84,0.08)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 28,
  },
  tabBtn: {
    flex: 1, paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBtnTxt:       { fontSize: 12, fontWeight: '500', color: GRAY },
  tabBtnTxtActive: { color: GREEN, fontWeight: '700' },

  // Social
  socialGroup: { gap: 10, marginBottom: 24 },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: GLASS,
    gap: 14,
  },
  socialIcon:  { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  socialLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '500', color: NAVY },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerTxt: {
    fontSize: 10, fontWeight: '600',
    color: GRAY, letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Fields
  fieldGroup: { gap: 12, marginBottom: 8 },
  fieldWrap:  {},
  fieldLabel: {
    fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: GRAY,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: WHITE,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  inputWrapFocused: {
    borderColor: GREEN,
    ...Platform.select({
      web: { boxShadow: '0px 0px 0px 3px rgba(12,158,84,0.15)' },
      default: {
        shadowColor: GREEN,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: NAVY,
    backgroundColor: WHITE,
    underlineColorAndroid: 'transparent',
    paddingVertical: 0,
    ...Platform.select({ web: { outline: 'none' } }),
  },
  eyeBtn: { padding: 4 },

  // Forgot
  forgotWrap: { alignItems: 'flex-end', marginBottom: 16 },
  forgotTxt:  { fontSize: 12, color: GREEN, fontWeight: '500', opacity: 0.8 },

  // Messages
  errorTxt: { fontSize: 13, color: ERROR_RED, marginBottom: 12, textAlign: 'center', fontWeight: '500' },
  infoTxt:  { fontSize: 13, color: GREEN,     marginBottom: 12, textAlign: 'center', fontWeight: '500' },

  // Submit
  submitBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnTxt: { color: WHITE, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },

  // Trust copy
  trustCopy: {
    textAlign: 'center',
    fontSize: 11,
    color: GRAY,
    marginBottom: 18,
    letterSpacing: 0.3,
  },

  // Bottom link
  bottomLink:  { textAlign: 'center', fontSize: 13, color: GRAY },
  bottomLinkA: { color: GREEN, fontWeight: '700' },

  // Pricing section
  pricingSection: {
    marginTop: 4,
    marginBottom: 16,
    gap: 10,
  },
  pricingHeading: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: GRAY,
    marginBottom: 4,
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    backgroundColor: WHITE,
  },
  planOptionActive: {
    borderColor: GREEN,
    backgroundColor: MINT_BG,
  },
  planRadio: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  planRadioActive: { borderColor: GREEN },
  planRadioDot: {
    width: 9, height: 9,
    borderRadius: 4.5,
    backgroundColor: GREEN,
  },
  planText:  { flex: 1 },
  planTitle: { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 2 },
  planTitleActive: { color: GREEN },
  planSub:   { fontSize: 12, color: GRAY, lineHeight: 16 },
  planBadge: {
    backgroundColor: 'rgba(12,158,84,0.12)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  planBadgeText: { fontSize: 10, fontWeight: '700', color: GREEN },
  pricingDisclosure: {
    fontSize: 11,
    color: GRAY,
    lineHeight: 16,
    paddingHorizontal: 2,
  },
});

// ── Root layout ───────────────────────────────────────────────────────────────
const root = StyleSheet.create({
  container:   { flex: 1, backgroundColor: CREAM },
  twoPanelRow: { flex: 1, flexDirection: 'row' },
  leftCol:     { flex: 1 },
  rightCol:    { flex: 1, backgroundColor: CREAM },
});
