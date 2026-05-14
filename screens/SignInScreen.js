/**
 * SignInScreen — Welcome landing + sign-in / sign-up.
 *
 * mode 'welcome' (default) — Brand landing screen.
 *                            Buttons: Get Started → signup form
 *                                     Try Demo Mode → PersonaReveal (no auth)
 *                                     Already have account? Sign in → signin form
 * mode 'form'              — Original email / Google / Apple form with
 *                            Sign In | Create Account tab toggle.
 *                            Create Account collects name + email + password,
 *                            creates the Supabase account, upserts full_name,
 *                            then navigates.reset → Onboarding.
 *
 * Tablet (width > 768): left green panel + right form panel.
 * Phone: welcome landing → form on demand.
 *
 * Auth: Google / Apple → supabase.auth.signInWithOAuth
 *       Email  → supabase.auth.signInWithPassword / signUp
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
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
var GREEN     = '#0C9E54';
var GREEN_MID = '#0C6B38';
var W_BG      = '#0B3B1E';   // welcome screen dark green background
var W_GREEN   = '#3DBA6F';   // welcome screen feature icon green (lighter, visible on dark)
var NAVY      = '#172250';
var MINT      = '#c5ffbc';
var CREAM     = '#FAF8F1';
var WHITE     = '#FFFFFF';
var GRAY      = '#6B7280';
var BORDER    = '#E5E7EB';
var ERROR_RED = '#DC2626';
var GLASS     = 'rgba(255,255,255,0.94)';
var MINT_BG   = '#E8F5E9';

var STATS = [
  { value: 'Budget-first',   label: 'weekly planning'  },
  { value: 'Meals + stores', label: 'guided together'  },
  { value: 'Receipt-based',  label: 'learning'         },
];

// ── Demo profile — seeds PersonaReveal without any Supabase writes ─────────────
var DEMO_PROFILE = {
  isDemoMode:                       true,
  missions:                         ['pure_savings', 'meal_planning', 'clinical_guardrails'],
  weeklyBudget:                     250,
  weekly_budget_cents:              25000,
  household:                        { adults: 2, children: 2 },
  cookingStyle:                     ['meal_prep', 'from_scratch'],
  foodsAvoided:                     ['high_sugar', 'high_sodium'],
  dietPreferences:                  ['budget_friendly', 'family_friendly'],
  preferred_stores:                 ['publix', 'aldi', 'walmart'],
  dealPreferences:                  ['weekly_ads', 'digital_coupons', 'bogos', 'loyalty_offers'],
  projected_monthly_recovery_cents: 7400,
};

// ── Module-scope atom components ───────────────────────────────────────────────

function GoogleIcon({ size }) {
  var s = size || 20;
  var colors = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
      {colors.map(function (c, i) {
        return <View key={i} style={{ width: s / 2, height: s / 2, backgroundColor: c }} />;
      })}
    </View>
  );
}

function AppleIcon({ size }) {
  var s = size || 20;
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
  var scale = useRef(new Animated.Value(1)).current;
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

function MobileHero() {
  return (
    <View style={hero.wrap}>
      <Text style={hero.wordmark}>snipp<Text style={{ color: GREEN }}>d</Text></Text>
      <Text style={hero.headline}>Smarter food decisions, before the money is spent.</Text>
      <Text style={hero.sub}>
        Plan groceries, meals, savings, and eat-out options around your real weekly budget.
      </Text>
      <View style={hero.statsRow}>
        {STATS.map(function (s) {
          return (
            <View key={s.value} style={hero.statCard}>
              <Text style={hero.statValue}>{s.value}</Text>
              <Text style={hero.statLabel}>{s.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function SignInScreen({ navigation }) {
  var dims     = useWindowDimensions();
  var isTablet = dims.width > 768;

  // 'welcome' lands first; 'form' shows the sign-in / create-account form
  var [mode,         setMode]         = useState('welcome');
  var [tab,          setTab]          = useState('signin');
  var [name,         setName]         = useState('');
  var [email,        setEmail]        = useState('');
  var [password,     setPassword]     = useState('');
  var [showPw,       setShowPw]       = useState(false);
  var [loading,      setLoading]      = useState(false);
  var [oauthLoading, setOauthLoading] = useState(null);
  var [errorMsg,     setErrorMsg]     = useState('');
  var [infoMsg,      setInfoMsg]      = useState('');
  var [focusedField, setFocusedField] = useState(null);

  var fadeAnim  = useRef(new Animated.Value(0)).current;
  var slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(function () {
    tracker.track('signin_screen_viewed', {});
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  function clearError() { setErrorMsg(''); setInfoMsg(''); }

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

  var handleEmail = useCallback(async function () {
    clearError();
    var trimmedEmail = email.trim().toLowerCase();
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
        var { data: signInData, error: signInErr } = await signInWithEmail(trimmedEmail, password);
        if (signInErr) throw signInErr;
        if (!signInData?.session) {
          setInfoMsg('Check your inbox to confirm your account, then sign in.');
        }
        // Successful sign-in — App.js onAuthStateChange handles routing
      } else {
        // ── Sign up path ────────────────────────────────────────────────────
        var trimmedName = name.trim();
        if (!trimmedName) {
          setErrorMsg('Enter your name to get started.');
          setLoading(false);
          return;
        }
        var { data: signUpData, error: signUpErr } = await signUpWithEmail(trimmedEmail, password);
        if (signUpErr) throw signUpErr;
        if (!signUpData?.session) {
          setInfoMsg('Check your inbox to confirm your email, then sign in.');
          setLoading(false);
          return;
        }
        // Write name to profile, then drop into onboarding
        var { supabase } = require('../lib/supabase');
        var user = signUpData.session.user;
        if (user) {
          await supabase.from('profiles').upsert({
            user_id:    user.id,
            full_name:  trimmedName,
            first_name: trimmedName.split(' ')[0],
          }, { onConflict: 'user_id' });
        }
        navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }, [tab, name, email, password, navigation]);

  var handleOAuth = useCallback(async function (provider) {
    clearError();
    setOauthLoading(provider);
    try {
      var result = provider === 'google'
        ? await signInWithGoogle()
        : await signInWithApple();
      if (result.error) throw result.error;
      // Successful OAuth — App.js onAuthStateChange handles routing
    } catch (err) {
      var friendly = formatAuthError(err);
      setErrorMsg(friendly || (provider === 'google' ? 'Google' : 'Apple') + ' sign-in failed. Try email instead.');
    } finally {
      setOauthLoading(null);
    }
  }, []);

  var handleForgotPassword = useCallback(async function () {
    var trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('Enter your email above, then tap Forgot password?');
      return;
    }
    setLoading(true);
    try {
      var { error: resetErr } = await resetPassword(trimmedEmail);
      if (resetErr) throw resetErr;
      setInfoMsg('Reset link sent to ' + trimmedEmail);
    } catch (err) {
      setErrorMsg(formatAuthError(err) || err.message);
    } finally {
      setLoading(false);
    }
  }, [email]);

  function switchTab(t) { setTab(t); clearError(); }

  // ── WELCOME SCREEN ─────────────────────────────────────────────────────────
  // Called as {renderWelcome()} — NOT as <Welcome />.
  function renderWelcome() {
    return (
      <View style={welcome.root}>
        <StatusBar barStyle="light-content" />
        <ScrollView
          contentContainerStyle={welcome.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo + wordmark */}
          <View style={welcome.logoBlock}>
            <Image
              source={require('../assets/Snippd-White-Cart .png')}
              style={welcome.logoImg}
              resizeMode="contain"
            />
            <Text style={welcome.wordmark}>snippd</Text>
          </View>

          {/* "Welcome" headline — logo already has brand name */}
          <Text style={welcome.headline}>Welcome</Text>
          <Text style={welcome.sub}>Save More . Stress Less. Live Better.</Text>

          {/* Feature rows — rounded-square icon style matching mockup */}
          <View style={welcome.featureList}>
            {[
              { icon: 'tag',      title: 'Save more',    body: 'Find relevant deals and coupons.' },
              { icon: 'calendar', title: 'Stress less',  body: 'Plan meals and shopping with less guesswork.' },
              { icon: 'heart',    title: 'Live better',  body: 'Stay on budget while feeding your household.' },
            ].map(function (f) {
              return (
                <View key={f.title} style={welcome.featureRow}>
                  <View style={welcome.featureIconWrap}>
                    <Feather name={f.icon} size={18} color={WHITE} />
                  </View>
                  <View style={welcome.featureText}>
                    <Text style={welcome.featureTitle}>{f.title}</Text>
                    <Text style={welcome.featureBody}>{f.body}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* CTAs */}
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
              <Text style={welcome.signInLinkTxt}>
                Already have an account?{'  '}
                <Text style={welcome.signInLinkAccent}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
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
          {!isTablet && <MobileHero />}

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
              <Text style={form.eyebrow}>Your weekly food plan</Text>
              <Text style={form.title}>
                {tab === 'signin'
                  ? <Text>Welcome{'\n'}<Text style={form.titleAccent}>back.</Text></Text>
                  : <Text>Get{'\n'}<Text style={form.titleAccent}>started.</Text></Text>
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
            <View style={form.tabToggle}>
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
            </View>

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

            <Text style={form.bottomLink}>
              {tab === 'signin'
                ? <Text>No account yet?<Text style={form.bottomLinkA} onPress={function () { switchTab('signup'); }}> Start your free trial</Text></Text>
                : <Text>Already have an account?<Text style={form.bottomLinkA} onPress={function () { switchTab('signin'); }}> Sign In</Text></Text>
              }
            </Text>
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
var left = StyleSheet.create({
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

// ── Mobile hero styles ─────────────────────────────────────────────────────────
var hero = StyleSheet.create({
  wrap: { paddingBottom: 28 },
  wordmark: { fontFamily: 'Sublima-ExtraBold', fontSize: 26, color: NAVY, letterSpacing: -0.5, marginBottom: 16 },
  headline: { fontSize: 22, fontWeight: '800', color: NAVY, letterSpacing: -0.5, lineHeight: 28, marginBottom: 8 },
  sub: { fontSize: 13, color: GRAY, lineHeight: 19, marginBottom: 18 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1, backgroundColor: WHITE, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER, padding: 10, alignItems: 'center',
  },
  statValue: { fontSize: 11, fontWeight: '800', color: GREEN, textAlign: 'center', marginBottom: 2 },
  statLabel: { fontSize: 9, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
});

// ── Welcome landing styles ─────────────────────────────────────────────────────
var welcome = StyleSheet.create({
  root:  { flex: 1, backgroundColor: W_BG },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 32,
    backgroundColor: W_BG,
  },

  // Logo block
  logoBlock: { alignItems: 'center', marginBottom: 14 },
  logoImg:   { width: 64, height: 64, marginBottom: 6 },
  wordmark:  { fontSize: 22, fontWeight: '800', color: WHITE, letterSpacing: 1 },

  // Headlines
  headline: {
    fontSize: 52, fontWeight: '900', color: WHITE,
    textAlign: 'center', letterSpacing: -1,
    lineHeight: 56, marginBottom: 10,
  },
  sub: {
    fontSize: 17, color: 'rgba(255,255,255,0.80)',
    textAlign: 'center', fontWeight: '500',
    letterSpacing: 0.2, marginBottom: 0,
  },

  // Feature rows — rounded square icons (not circles)
  featureList: { gap: 12, marginBottom: 24, marginTop: 28 },
  featureRow:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  featureText:  { flex: 1 },
  featureTitle: { fontSize: 15, fontWeight: '700', color: WHITE, marginBottom: 1 },
  featureBody:  { fontSize: 13, color: 'rgba(255,255,255,0.62)', lineHeight: 18 },

  // CTAs
  ctaGroup: { gap: 12 },
  primaryBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#22C55E',
    paddingVertical: 18, borderRadius: 14,
    shadowColor: '#22C55E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  primaryBtnTxt: { color: WHITE, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  demoBtn: {
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    paddingVertical: 15, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  demoBtnTxt: { color: WHITE, fontSize: 15, fontWeight: '600' },
  signInLink:       { alignItems: 'center', paddingVertical: 8 },
  signInLinkTxt:    { fontSize: 14, color: 'rgba(255,255,255,0.75)' },
  signInLinkAccent: { color: '#22C55E', fontWeight: '700' },
});

// ── Form styles ────────────────────────────────────────────────────────────────
var form = StyleSheet.create({
  scroll:       { flexGrow: 1, justifyContent: 'center', padding: 48 },
  scrollPhone:  { padding: 24, paddingTop: 16 },
  card:         { width: '100%' },
  cardTablet:   { maxWidth: 420, alignSelf: 'center' },

  backBtn:    { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 6 },
  backBtnTxt: { fontSize: 14, color: NAVY, fontWeight: '500' },

  header:     { marginBottom: 28 },
  eyebrow:    { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, color: GREEN, marginBottom: 10 },
  title: {
    fontFamily: 'Sublima-ExtraBold', fontSize: 36,
    color: NAVY, letterSpacing: -1.2, lineHeight: 40, marginBottom: 8,
  },
  titleAccent:   { fontFamily: 'Sublima-ExtraLight', color: GREEN },
  headerSub:     { fontSize: 14, color: GRAY, fontWeight: '300' },
  headerSubLink: { color: GREEN, fontWeight: '600' },

  tabToggle: {
    flexDirection: 'row', backgroundColor: 'rgba(12,158,84,0.08)',
    borderRadius: 12, padding: 4, marginBottom: 28,
  },
  tabBtn:         { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabBtnActive: {
    backgroundColor: WHITE,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  tabBtnTxt:       { fontSize: 12, fontWeight: '500', color: GRAY },
  tabBtnTxtActive: { color: GREEN, fontWeight: '700' },

  socialGroup: { gap: 10, marginBottom: 24 },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 20,
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 14,
    backgroundColor: GLASS, gap: 14,
  },
  socialIcon:  { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  socialLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '500', color: NAVY },

  divider:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerTxt:  { fontSize: 10, fontWeight: '600', color: GRAY, letterSpacing: 1, textTransform: 'uppercase' },

  fieldGroup: { gap: 12, marginBottom: 8 },
  fieldWrap:  {},
  fieldLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: GRAY, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    backgroundColor: WHITE,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    minHeight: 52,
  },
  inputWrapFocused: {
    borderColor: GREEN,
    ...Platform.select({
      web: { boxShadow: '0px 0px 0px 3px rgba(12,158,84,0.15)' },
      default: { shadowColor: GREEN, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
    }),
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: NAVY,
    backgroundColor: WHITE,
    underlineColorAndroid: 'transparent',
    paddingVertical: 0,
    ...Platform.select({ web: { outline: 'none' } }),
  },
  eyeBtn: { padding: 4 },

  forgotWrap: { alignItems: 'flex-end', marginBottom: 16 },
  forgotTxt:  { fontSize: 12, color: GREEN, fontWeight: '500', opacity: 0.8 },

  trialNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: MINT_BG, borderRadius: 10, padding: 12, marginBottom: 16,
  },
  trialNoteText: { flex: 1, fontSize: 13, color: NAVY, lineHeight: 18 },

  errorTxt: { fontSize: 13, color: ERROR_RED, marginBottom: 12, textAlign: 'center', fontWeight: '500' },
  infoTxt:  { fontSize: 13, color: GREEN,     marginBottom: 12, textAlign: 'center', fontWeight: '500' },

  submitBtn: {
    width: '100%', paddingVertical: 16, borderRadius: 14,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 10, elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnTxt: { color: WHITE, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },

  trustCopy: { textAlign: 'center', fontSize: 11, color: GRAY, marginBottom: 18, letterSpacing: 0.3 },

  bottomLink:  { textAlign: 'center', fontSize: 13, color: GRAY },
  bottomLinkA: { color: GREEN, fontWeight: '700' },
});

// ── Root layout ────────────────────────────────────────────────────────────────
var root = StyleSheet.create({
  container:   { flex: 1, backgroundColor: CREAM },
  twoPanelRow: { flex: 1, flexDirection: 'row' },
  leftCol:     { flex: 1 },
  rightCol:    { flex: 1, backgroundColor: CREAM },
});
