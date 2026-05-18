/**
 * SignInScreen — Welcome landing + sign-in / sign-up.
 *
 * mode 'welcome' (default) — Brand landing screen.
 * Buttons: Get Started → signup form
 * Try Demo Mode → PersonaReveal (no auth)
 * Already have account? Sign in → signin form
 * mode 'form'              — Original email / Google / Apple form with
 * Sign In | Create Account tab toggle.
 * Create Account collects name + email + password,
 * creates the Supabase account, upserts full_name,
 * then navigates.reset → Onboarding.
 *
 * Tablet (width > 768): left green panel + right form panel.
 * Phone: welcome landing → form on demand.
 *
 * Auth: Google / Apple → supabase.auth.signInWithOAuth
 * Email  → supabase.auth.signInWithPassword / signUp
 *
 * Billing plan is NOT chosen here.
 * The paywall appears after onboarding + personality, before first shop.
 * On signup we default billing_plan = 'trial'.
 *
 * Input black-box fix: FormPanel is NOT defined as an inner component
 * (would remount on every parent render, destroying TextInput state).
 * It is called as a render function: {renderFormPanel()}.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Platform,
  Animated, KeyboardAvoidingView, ScrollView,
  StatusBar, Image,
} from 'react-native';
import PropTypes from 'prop-types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signInWithApple,
  resetPassword,
  formatAuthError,
} from '../src/services/authService';

// ── Brand palette ──────────────────────────────────────────────────────────────
const GREEN     = '#0C9E54';
const GREEN_MID = '#0C6B38';
const W_BG      = '#0B3B1E';   // welcome screen dark green background
const NAVY      = '#172250';
const MINT      = '#c5ffbc';
const WHITE     = '#FFFFFF';
const GRAY      = '#6B7280';
const BORDER    = '#E5E7EB';
const ERROR_RED = '#DC2626';
const GLASS     = 'rgba(255,255,255,0.94)';
const MINT_BG   = '#E8F5E9';

const STATS = [
  { value: 'Budget-first',   label: 'weekly planning'  },
  { value: 'Meals + stores', label: 'guided together'  },
  { value: 'Receipt-based',  label: 'learning'         },
];

// ── Demo profile — seeds PersonaReveal without any Supabase writes ─────────────
const DEMO_PROFILE = {
  isDemoMode:                        true,
  missions:                          ['pure_savings', 'meal_planning', 'clinical_guardrails'],
  weeklyBudget:                      250,
  weekly_budget_cents:               25000,
  household:                         { adults: 2, children: 2 },
  cookingStyle:                      ['meal_prep', 'from_scratch'],
  foodsAvoided:                      ['high_sugar', 'high_sodium'],
  dietPreferences:                   ['budget_friendly', 'family_friendly'],
  preferred_stores:                  ['publix', 'aldi', 'walmart'],
  dealPreferences:                   ['weekly_ads', 'digital_coupons', 'bogos', 'loyalty_offers'],
  projected_monthly_recovery_cents: 7400,
};

// ── Module-scope atom components ───────────────────────────────────────────────

function GoogleIcon({ size }) {
  const s = size || 20;
  const colors = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
      {colors.map(function (c, i) {
        return <View key={'color-' + i} style={{ width: s / 2, height: s / 2, backgroundColor: c }} />;
      })}
    </View>
  );
}

function AppleIcon({ size }) {
  const s = size || 20;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name="smartphone" size={s - 2} color={NAVY} />
    </View>
  );
}

function StatChip({ value, label, dark }) {
  return (
    <View style={[left.stat, dark && left.statDark]}>
      <Text style={[left.statNum, dark && left.statNumDark]}>{value}</Text>
      <Text style={[left.statLabel, dark && left.statLabelDark]}>{label}</Text>
    </View>
  );
}

function SocialBtn({ icon, label, onPress, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;
  function press() {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
    if (onPress) onPress();
  }
  function release() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  }
  return (
    <Animated.View style={{ transform: [{ scale: scale }] }}>
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

function FieldInput({ label, value, onChangeText, secureTextEntry, keyboardType,
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
          placeholderTextColor={GRAY}
          onFocus={onFocus}
          onBlur={onBlur}
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
          selectionColor={GREEN}
          cursorColor={GREEN}
          underlineColorAndroid="transparent"
        />
        {rightEl}
      </View>
    </View>
  );
}

function LeftPanel() {
  return (
    <LinearGradient
      colors={[NAVY, GREEN_MID, GREEN]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={left.panel}
    >
      <View style={left.highlight} />
      <Text style={left.wordmark}>snipp<Text style={{ color: MINT }}>d</Text></Text>
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
      <View style={left.statsRow}>
        {STATS.map(function (s, i) {
          return (
            <View key={s.value} style={{ flexDirection: 'row', alignItems: 'center' }}>
              {i > 0 && <View style={left.divider} />}
              <StatChip value={s.value} label={s.label} dark />
            </View>
          );
        })}
      </View>
    </LinearGradient>
  );
}

// ── PropTypes ──────────────────────────────────────────────────────────────────

GoogleIcon.propTypes = {
  size: PropTypes.number,
};

AppleIcon.propTypes = {
  size: PropTypes.number,
};

StatChip.propTypes = {
  value: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  dark:  PropTypes.bool,
};

SocialBtn.propTypes = {
  icon:     PropTypes.node.isRequired,
  label:    PropTypes.string.isRequired,
  onPress:  PropTypes.func,
  disabled: PropTypes.bool,
};

FieldInput.propTypes = {
  label:           PropTypes.string.isRequired,
  value:           PropTypes.string.isRequired,
  onChangeText:    PropTypes.func.isRequired,
  secureTextEntry: PropTypes.bool,
  keyboardType:    PropTypes.string,
  autoCapitalize:  PropTypes.string,
  placeholder:     PropTypes.string,
  rightEl:         PropTypes.node,
  onFocus:         PropTypes.func,
  onBlur:          PropTypes.func,
  focused:         PropTypes.bool,
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function SignInScreen({ navigation, route }) {
  const dims     = useWindowDimensions();
  const isTablet = dims.width > 768;

  // If navigated with { openForm: 'signin' } or { openForm: 'signup' }, skip welcome landing
  const openForm = route?.params?.openForm || null;

  // 'welcome' lands first; 'form' shows the sign-in / create-account form
  const [mode,         setMode]         = useState(openForm ? 'form' : 'welcome');
  const [tab,          setTab]          = useState(openForm || 'signin');
  const [name,         setName]         = useState('');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPw,       setShowPw]       = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [infoMsg,      setInfoMsg]      = useState('');
  const [focusedField, setFocusedField] = useState(null);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const signupRoutingRef = useRef(false);

  useEffect(function () {
    tracker.track('signin_screen_viewed', {});
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(function () {
    if (!openForm) return;
    setTab(openForm);
    setMode('form');
  }, [openForm]);

  const clearError = useCallback(function () { setErrorMsg(''); setInfoMsg(''); }, []);

  // Opens the form panel with the requested tab pre-selected
  function goForm(targetTab) {
    clearError();
    setTab(targetTab || 'signin');
    setMode('form');
  }

  // Demo mode — no auth, navigates directly to PersonaReveal with seeded data
  function handleDemoMode() {
    navigation.navigate('PersonaReveal', DEMO_PROFILE);
  }

  const handleEmail = useCallback(async function () {
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
        const { data: signInData, error: signInErr } = await signInWithEmail(trimmedEmail, password);
        if (signInErr) throw signInErr;
        if (!signInData?.session) {
          setInfoMsg('Check your inbox to confirm your account, then sign in.');
        }
        // Successful sign-in — App.js onAuthStateChange handles routing
      } else {
        // ── Sign up path ────────────────────────────────────────────────────
        const trimmedName = name.trim();
        if (!trimmedName) {
          setErrorMsg('Enter your name to get started.');
          setLoading(false);
          return;
        }
        signupRoutingRef.current = true;
        const { data: signUpData, error: signUpErr } = await signUpWithEmail(trimmedEmail, password);
        if (signUpErr) throw signUpErr;
        if (!signUpData?.session) {
          signupRoutingRef.current = false;
          setInfoMsg('Check your inbox to confirm your email, then sign in.');
          setLoading(false);
          return;
        }
        // Write name to profile, then drop into onboarding
        const user = signUpData.session.user;
        if (user) {
          await supabase.from('profiles').upsert({
            user_id:      user.id,
            full_name:    trimmedName,
            first_name:   trimmedName.split(' ')[0],
            billing_plan: 'trial',
          }, { onConflict: 'user_id' });
        }
        navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
        return;
      }
    } catch (err) {
      signupRoutingRef.current = false;
      setErrorMsg(formatAuthError(err));
    } finally {
      if (!signupRoutingRef.current) {
        setLoading(false);
      }
    }
  }, [tab, name, email, password, navigation, clearError]);

  const handleOAuth = useCallback(async function (provider) {
    clearError();
    setOauthLoading(provider);
    try {
      const result = provider === 'google'
        ? await signInWithGoogle()
        : await signInWithApple();
      if (result.error) throw result.error;
      // Successful OAuth — App.js onAuthStateChange handles routing
    } catch (err) {
      const friendly = formatAuthError(err);
      setErrorMsg(friendly || (provider === 'google' ? 'Google' : 'Apple') + ' sign-in failed. Try email instead.');
    } finally {
      setOauthLoading(null);
    }
  }, [clearError]);

  const handleForgotPassword = useCallback(async function () {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('Enter your email above, then tap Forgot password?');
      return;
    }
    setLoading(true);
    try {
      const { error: resetErr } = await resetPassword(trimmedEmail);
      if (resetErr) throw resetErr;
      setInfoMsg('Reset link sent to ' + trimmedEmail);
    } catch (err) {
      setErrorMsg(formatAuthError(err) || err.message);
    } finally {
      setLoading(false);
    }
  }, [email, clearError]);

  function switchTab(t) { setTab(t); clearError(); }

  // ── WELCOME SCREEN ─────────────────────────────────────────────────────────
  // Called as {renderWelcome()} — NOT as <Welcome />.
  function renderWelcome() {
    return (
      <LinearGradient
        colors={['#050F08', '#071910', '#0A2E18', '#0D3E1F', '#0A2E18']}
        locations={[0, 0.22, 0.52, 0.76, 1]}
        style={welcome.root}
      >
        <StatusBar barStyle="light-content" />
        <ScrollView
          contentContainerStyle={welcome.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* TOP GROUP — logo + headline + subtitle */}
          <View style={welcome.topGroup}>
            <Image
              source={require('../assets/Snippd-logo-green-large.png')}
              style={welcome.logoImg}
              resizeMode="contain"
            />
            <Text style={welcome.headline}>Welcome to Snippd</Text>
            <Text style={welcome.sub}>
              Smarter grocery planning,{'\n'}less waste, more time for you.
            </Text>
          </View>

          {/* HERO — full-width wrapper guarantees true horizontal center */}
          <View style={welcome.heroWrap}>
            <Image
              source={require('../assets/grocery-bag-tall-hero.png')}
              style={welcome.heroImg}
              resizeMode="contain"
            />
          </View>

          {/* CTAs — bottom anchor */}
          <View style={welcome.ctaGroup}>
            <TouchableOpacity
              style={welcome.primaryBtn}
              onPress={function () { goForm('signup'); }}
              activeOpacity={0.88}
            >
              <Text style={welcome.primaryBtnTxt}>Get Started</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={welcome.demoBtn}
              onPress={handleDemoMode}
              activeOpacity={0.8}
            >
              <Feather name="play-circle" size={16} color={WHITE} style={{ marginRight: 8 }} />
              <Text style={welcome.demoBtnTxt}>Try Demo Mode</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={function () { goForm('signin'); }}
              style={welcome.signInLink}
              activeOpacity={0.7}
            >
              <Text style={welcome.signInCopy}>
                Already have an account? <Text style={welcome.signInLinkTxt}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // ── FORM PANEL ─────────────────────────────────────────────────────────────
  // Called as {renderFormPanel()} — NOT as <FormPanel />.
  // This avoids the remount-on-render problem that caused the input black box.
  function renderFormPanel() {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[form.scroll, !isTablet && form.scrollPhone]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              form.card,
              isTablet && form.cardTablet,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Back to welcome (phone only) */}
            {!isTablet && (
              <TouchableOpacity
                style={form.backBtn}
                onPress={function () { setMode('welcome'); clearError(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="arrow-left" size={18} color={NAVY} />
                <Text style={form.backBtnTxt}>Back</Text>
              </TouchableOpacity>
            )}

            {/* Header */}
            <View style={form.header}>
              {tab === 'signin' && <Text style={form.eyebrow}>Welcome back</Text>}
              <Text style={form.title}>
                {tab === 'signin'
                  ? <Text>Sign in</Text>
                  : <Text>Create account</Text>
                }
              </Text>
              <Text style={form.headerSub}>
                {tab === 'signin'
                  ? <Text>New here? <Text style={form.headerSubLink} onPress={function () { switchTab('signup'); }}>Create an Account</Text></Text>
                  : <Text>Already have one? <Text style={form.headerSubLink} onPress={function () { switchTab('signin'); }}>Sign In</Text></Text>
                }
              </Text>
            </View>

            {/* Tab toggle */}
            {isTablet && <View style={form.tabToggle}>
              <TouchableOpacity
                style={[form.tabBtn, tab === 'signin' && form.tabBtnActive]}
                onPress={function () { switchTab('signin'); }}
              >
                <Text style={[form.tabBtnTxt, tab === 'signin' && form.tabBtnTxtActive]}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[form.tabBtn, tab === 'signup' && form.tabBtnActive]}
                onPress={function () { switchTab('signup'); }}
              >
                <Text style={[form.tabBtnTxt, tab === 'signup' && form.tabBtnTxtActive]}>Create Account</Text>
              </TouchableOpacity>
            </View>}

            {/* Social auth */}
            <View style={form.socialGroup}>
              <SocialBtn
                icon={<GoogleIcon size={20} />}
                label="Continue with Google"
                onPress={function () { handleOAuth('google'); }}
                disabled={!!(loading || oauthLoading === 'google')}
              />
              {Platform.OS === 'ios' && (
                <SocialBtn
                  icon={<AppleIcon size={20} />}
                  label="Continue with Apple"
                  onPress={function () { handleOAuth('apple'); }}
                  disabled={!!(loading || oauthLoading === 'apple')}
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
              {/* Name field — signup only */}
              {tab === 'signup' && (
                <FieldInput
                  label="YOUR NAME"
                  value={name}
                  onChangeText={function (t) { setName(t); clearError(); }}
                  autoCapitalize="words"
                  keyboardType="default"
                  placeholder="First and last name"
                  focused={focusedField === 'name'}
                  onFocus={function () { setFocusedField('name'); }}
                  onBlur={function () { setFocusedField(null); }}
                />
              )}
              <FieldInput
                label="EMAIL ADDRESS"
                value={email}
                onChangeText={function (t) { setEmail(t); clearError(); }}
                keyboardType="email-address"
                placeholder="Email address"
                focused={focusedField === 'email'}
                onFocus={function () { setFocusedField('email'); }}
                onBlur={function () { setFocusedField(null); }}
              />
              <FieldInput
                label="PASSWORD"
                value={password}
                onChangeText={function (t) { setPassword(t); clearError(); }}
                secureTextEntry={!showPw}
                placeholder="Password (8+ characters)"
                focused={focusedField === 'pw'}
                onFocus={function () { setFocusedField('pw'); }}
                onBlur={function () { setFocusedField(null); }}
                rightEl={
                  <TouchableOpacity style={form.eyeBtn} onPress={function () { setShowPw(function (v) { return !v; }); }}>
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

            {/* Trial notice — signup only */}
            {tab === 'signup' && (
              <View style={form.trialNote}>
                <Feather name="check-circle" size={14} color={GREEN} />
                <Text style={form.trialNoteText}>
                  3-day free trial included. Choose your plan after you set up your profile.
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
              {loading
                ? <ActivityIndicator color={WHITE} />
                : <Text style={form.submitBtnTxt}>
                    {tab === 'signin' ? 'Sign In' : 'Start Free Trial'}
                  </Text>
              }
            </TouchableOpacity>

            <Text style={form.trustCopy}>
              {tab === 'signup'
                ? 'No surprise charges. Cancel before trial ends to pay nothing.'
                : 'Plan smarter. Save more. Stress less.'}
            </Text>

            {isTablet && <Text style={form.bottomLink}>
              {tab === 'signin'
                ? <Text>No account yet?<Text style={form.bottomLinkA} onPress={function () { switchTab('signup'); }}> Start your free trial</Text></Text>
                : <Text>Already have an account?<Text style={form.bottomLinkA} onPress={function () { switchTab('signin'); }}> Sign In</Text></Text>
              }
            </Text>}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  // On tablet: always show two-panel layout (LeftPanel + form).
  // On phone: welcome landing or form depending on mode.
  if (isTablet) {
    return (
      <View style={root.container}>
        <StatusBar barStyle="dark-content" />
        <View style={root.twoPanelRow}>
          <View style={root.leftCol}><LeftPanel /></View>
          <View style={root.rightCol}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
              {renderFormPanel()}
            </SafeAreaView>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[root.container, mode === 'welcome' && { backgroundColor: W_BG }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {mode === 'welcome' ? renderWelcome() : renderFormPanel()}
      </SafeAreaView>
    </View>
  );
}

// ── Left panel styles ──────────────────────────────────────────────────────────
const left = StyleSheet.create({
  panel: { flex: 1, padding: 48, justifyContent: 'space-between', overflow: 'hidden' },
  highlight: {
    position: 'absolute', width: 400, height: 400,
    top: -80, right: -100, borderRadius: 200,
    backgroundColor: 'rgba(197,255,188,0.12)',
  },
  wordmark: { fontFamily: 'Sublima-ExtraBold', fontSize: 30, color: MINT, letterSpacing: -0.5 },
  content: { gap: 18 },
  headline: {
    fontFamily: 'Sublima-ExtraBold', fontSize: 42,
    lineHeight: 48, color: WHITE, letterSpacing: -1.5,
  },
  headlineAccent: { fontFamily: 'Sublima-ExtraLight', color: MINT },
  sub: { fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 24, fontWeight: '300', maxWidth: 320 },
  motto: { fontSize: 14, fontWeight: '700', color: MINT, letterSpacing: 0.2 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat:          { flex: 1 },
  statDark:      { flex: 1 },
  statNum:       { fontSize: 15, fontWeight: '900', color: MINT, letterSpacing: -0.3 },
  statNumDark:   { fontSize: 15, fontWeight: '900', color: MINT, letterSpacing: -0.3 },
  statLabel:     { fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  statLabelDark: { fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  divider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 16 },
});

// ── Welcome landing styles ─────────────────────────────────────────────────────
const welcome = StyleSheet.create({
  root:  { flex: 1 },

  // Compact mobile welcome stack: all core actions should fit without scrolling.
  scroll: {
    flexGrow: 1,
    paddingTop: 12,
    paddingBottom: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },

  // Top zone — alignSelf stretch overrides parent alignItems:center, fills full width
  topGroup:  { alignItems: 'center', paddingHorizontal: 24, alignSelf: 'stretch' },
  logoImg:   { width: 232, height: 82, marginBottom: 4 },
  headline: {
    fontSize: 30, fontWeight: '700', color: WHITE,
    textAlign: 'center', letterSpacing: 0,
    lineHeight: 35, marginBottom: 6,
    alignSelf: 'stretch',
  },
  sub: {
    fontSize: 13, color: 'rgba(255,255,255,0.80)',
    textAlign: 'center', fontWeight: '400',
    lineHeight: 19, paddingHorizontal: 8, alignSelf: 'stretch',
  },

  // Middle zone — isolated full-width container, no padding, bag centers on exact screen axis
  heroWrap: {
    flex: 1,
    width: '100%',
    minHeight: 210,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 0,
  },
  heroImg:  { width: '74%', height: 284, maxHeight: '100%', transform: [{ translateX: -14 }] },

  // Bottom zone — alignSelf stretch restores full-width button layout
  ctaGroup: { gap: 8, paddingHorizontal: 20, alignSelf: 'stretch' },
  primaryBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: WHITE,
    paddingVertical: 13, borderRadius: 12,
  },
  primaryBtnTxt: { color: '#1B3A2D', fontSize: 16, fontWeight: '600' },
  demoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: 'transparent',
  },
  demoBtnTxt: { color: WHITE, fontSize: 16, fontWeight: '600' },
  signInLink: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 4,
  },
  signInCopy: { fontSize: 13, color: 'rgba(255,255,255,0.72)', fontWeight: '500' },
  signInLinkTxt: { color: WHITE, fontWeight: '700', textDecorationLine: 'underline' },
});

// ── Form styles ────────────────────────────────────────────────────────────────
const form = StyleSheet.create({
  scroll:       { flexGrow: 1, justifyContent: 'center', padding: 48 },
  scrollPhone:  { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 18, justifyContent: 'flex-start' },
  card:         { width: '100%' },
  cardTablet:   { maxWidth: 420, alignSelf: 'center' },

  backBtn:    { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  backBtnTxt: { fontSize: 13, color: NAVY, fontWeight: '700' },

  header:     { marginBottom: 14 },
  eyebrow:    { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.8, color: GREEN, marginBottom: 7 },
  title: {
    fontFamily: 'Sublima-ExtraBold', fontSize: 28,
    color: NAVY, letterSpacing: 0, lineHeight: 32, marginBottom: 4,
  },
  titleAccent:   { fontFamily: 'Sublima-ExtraLight', color: GREEN },
  headerSub:     { fontSize: 12, color: GRAY, fontWeight: '500' },
  headerSubLink: { color: GREEN, fontWeight: '800' },

  tabToggle: {
    flexDirection: 'row', backgroundColor: 'rgba(12,158,84,0.08)',
    borderRadius: 14, padding: 4, marginBottom: 16,
    borderWidth: 1, borderColor: '#E4F3EA',
  },
  tabBtn:         { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  tabBtnActive: {
    backgroundColor: WHITE,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  tabBtnTxt:       { fontSize: 12, fontWeight: '600', color: GRAY },
  tabBtnTxtActive: { color: GREEN, fontWeight: '800' },

  socialGroup: { gap: 10, marginBottom: 14 },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: 18,
    borderWidth: 1, borderColor: BORDER, borderRadius: 14,
    backgroundColor: GLASS, gap: 14,
  },
  socialIcon:  { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  socialLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '500', color: NAVY },

  divider:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerTxt:  { fontSize: 10, fontWeight: '600', color: GRAY, letterSpacing: 1, textTransform: 'uppercase' },

  fieldGroup: { gap: 8, marginBottom: 8 },
  fieldWrap:  {},
  fieldLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: GRAY, marginBottom: 5 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: BORDER, borderRadius: 14,
    backgroundColor: WHITE, paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 11 : 7,
    minHeight: 46,
  },
  inputWrapFocused: { borderColor: GREEN, backgroundColor: '#FEFFFE' },
  input: { flex: 1, fontSize: 15, color: NAVY, fontWeight: '400' },
  eyeBtn: { padding: 4 },

  forgotWrap: { alignItems: 'flex-end', marginBottom: 16, marginTop: 4 },
  forgotTxt:  { fontSize: 13, color: GREEN, fontWeight: '500' },

  trialNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginBottom: 10, backgroundColor: MINT_BG, borderRadius: 14, padding: 10,
    borderWidth: 1, borderColor: '#D8F3DC',
  },
  trialNoteText: { flex: 1, fontSize: 11, color: NAVY, lineHeight: 17 },

  errorTxt: { color: ERROR_RED, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  infoTxt:  { color: GREEN,     fontSize: 13, marginBottom: 12, textAlign: 'center' },

  submitBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.24, shadowRadius: 10, elevation: 5,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnTxt:      { color: WHITE, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  trustCopy:   { fontSize: 10, color: GRAY, textAlign: 'center', marginTop: 12, lineHeight: 15, paddingHorizontal: 10 },
  bottomLink:  { fontSize: 12, color: GRAY, textAlign: 'center', marginTop: 10 },
  bottomLinkA: { color: GREEN, fontWeight: '800' },
});

// ── Root / container styles ────────────────────────────────────────────────────
const root = StyleSheet.create({
  container:    { flex: 1, backgroundColor: WHITE },
  twoPanelRow:  { flex: 1, flexDirection: 'row' },
  leftCol:      { width: '42%' },
  rightCol:     { flex: 1 },
});
