/**
 * SignInScreen — three-mode welcome experience.
 *
 * mode 'welcome'  — Dark-green landing screen (matching brand mockup).
 *                   Buttons: Get Started, Try Demo Mode, Already have account? Sign in
 * mode 'signup'   — Simple one-screen sign-up: name + email + password → Onboarding
 * mode 'signin'   — Original email / Google / Apple sign-in form
 *
 * TextInput black-box fix: all forms are render functions called as {renderX()},
 * never defined as inner components used as <X />.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Image, Platform, KeyboardAvoidingView,
  ScrollView, StatusBar, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
var BG_DARK    = '#0B3B1E';   // deep forest green — matches mockup
var GREEN      = '#1DB954';   // bright CTA green
var GREEN_DIM  = '#27AE60';
var NAVY       = '#172250';
var WHITE      = '#FFFFFF';
var GRAY       = '#6B7280';
var BORDER     = '#E5E7EB';
var CREAM      = '#FAF8F1';
var ERROR_RED  = '#DC2626';
var MINT_BG    = '#E8F5E9';
var ICON_BG    = 'rgba(255,255,255,0.15)';
var OVERLAY_TXT = 'rgba(255,255,255,0.75)';

// Demo profile (matches OnboardingScreen DEMO_PROFILE)
var DEMO_PROFILE = {
  isDemoMode:                      true,
  missions:                        ['pure_savings', 'meal_planning', 'clinical_guardrails'],
  weeklyBudget:                    250,
  weekly_budget_cents:             25000,
  household: { adults: 2, children: 2, infant: 0, toddler: 0, school_age: 1, teenager: 1 },
  cookingStyle:                    ['meal_prep', 'from_scratch'],
  foodsAvoided:                    ['high_sugar', 'high_sodium'],
  dietPreferences:                 ['budget_friendly', 'family_friendly'],
  preferred_stores:                ['publix', 'aldi', 'walmart'],
  dealPreferences:                 ['weekly_ads', 'digital_coupons', 'bogos', 'loyalty_offers'],
  projected_monthly_recovery_cents: 7400,
};

var FEATURES = [
  {
    icon: 'tag',
    title: 'Save more',
    desc: 'Find relevant deals and coupons.',
  },
  {
    icon: 'calendar',
    title: 'Stress less',
    desc: 'Plan meals and shopping with less guesswork.',
  },
  {
    icon: 'heart',
    title: 'Live better',
    desc: 'Stay on budget while feeding your household.',
  },
];

// ── Module-scope atom components ───────────────────────────────────────────────

function FeatureRow({ icon, title, desc }) {
  return (
    <View style={w.featureRow}>
      <View style={w.featureIcon}>
        <Feather name={icon} size={18} color={GREEN} />
      </View>
      <View style={w.featureText}>
        <Text style={w.featureTitle}>{title}</Text>
        <Text style={w.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function FieldInput({ label, value, onChangeText, secureTextEntry, keyboardType,
                      autoCapitalize, placeholder, rightEl, onFocus, onBlur, focused }) {
  return (
    <View style={f.fieldWrap}>
      {label ? <Text style={f.fieldLabel}>{label}</Text> : null}
      <View style={[f.inputWrap, focused && f.inputWrapFocused]}>
        <TextInput
          style={f.input}
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
          underlineColorAndroid="transparent"
        />
        {rightEl || null}
      </View>
    </View>
  );
}

function SocialBtn({ icon, label, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[f.socialBtn, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
    >
      <View style={f.socialIcon}>{icon}</View>
      <Text style={f.socialLabel}>{label}</Text>
      <View style={{ width: 22 }} />
    </TouchableOpacity>
  );
}

function GoogleIcon() {
  var colors = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];
  return (
    <View style={{ width: 20, height: 20, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
      {colors.map(function (c, i) {
        return <View key={i} style={{ width: 10, height: 10, backgroundColor: c }} />;
      })}
    </View>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function SignInScreen({ navigation }) {
  var [mode,         setMode]         = useState('welcome'); // 'welcome' | 'signup' | 'signin'
  var [name,         setName]         = useState('');
  var [email,        setEmail]        = useState('');
  var [password,     setPassword]     = useState('');
  var [showPw,       setShowPw]       = useState(false);
  var [loading,      setLoading]      = useState(false);
  var [oauthLoading, setOauthLoading] = useState(null);
  var [errorMsg,     setErrorMsg]     = useState('');
  var [infoMsg,      setInfoMsg]      = useState('');
  var [focusedField, setFocusedField] = useState(null);

  var fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(function () {
    tracker.track('welcome_screen_viewed', {});
    Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, []);

  function clearMessages() { setErrorMsg(''); setInfoMsg(''); }

  function goMode(m) {
    clearMessages();
    setMode(m);
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(function () {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    });
  }

  function handleDemoMode() {
    tracker.track('demo_mode_started', {});
    navigation.navigate('PersonaReveal', DEMO_PROFILE);
  }

  // ── Sign-up: name + email + password → create account → Onboarding ────────
  var handleSignUp = useCallback(async function () {
    clearMessages();
    var trimmedName  = name.trim();
    var trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName) { setErrorMsg('Enter your first name.'); return; }
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
      var { data, error } = await signUpWithEmail(trimmedEmail, password);
      if (error) throw error;
      if (!data?.session) {
        setInfoMsg('Check your inbox to confirm your email, then come back to sign in.');
        return;
      }
      // Write name to profile
      var { supabase } = require('../lib/supabase');
      var user = data.session.user;
      if (user) {
        await supabase.from('profiles').upsert({
          user_id:    user.id,
          full_name:  trimmedName,
          first_name: trimmedName.split(' ')[0],
        }, { onConflict: 'user_id' });
      }
      navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }, [name, email, password, navigation]);

  // ── Sign-in ────────────────────────────────────────────────────────────────
  var handleSignIn = useCallback(async function () {
    clearMessages();
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
      var { data, error } = await signInWithEmail(trimmedEmail, password);
      if (error) throw error;
      if (!data?.session) {
        setInfoMsg('Check your inbox to confirm your account, then sign in.');
      }
      // App.js onAuthStateChange handles routing after successful sign-in
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }, [email, password]);

  var handleOAuth = useCallback(async function (provider) {
    clearMessages();
    setOauthLoading(provider);
    try {
      var result = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
      if (result.error) throw result.error;
    } catch (err) {
      setErrorMsg(formatAuthError(err) || provider + ' sign-in failed. Try email instead.');
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
      var { error } = await resetPassword(trimmedEmail);
      if (error) throw error;
      setInfoMsg('Reset link sent to ' + trimmedEmail);
    } catch (err) {
      setErrorMsg(formatAuthError(err) || err.message);
    } finally {
      setLoading(false);
    }
  }, [email]);

  // ── Render: Welcome ────────────────────────────────────────────────────────
  function renderWelcome() {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={w.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo + wordmark */}
        <View style={w.logoRow}>
          <Image
            source={require('../assets/Snippd-White-Logo.png')}
            style={w.logoImage}
            resizeMode="contain"
          />
          <Text style={w.wordmark}>snippd</Text>
        </View>

        {/* Headline */}
        <Text style={w.headline}>Welcome to{'\n'}Snippd</Text>
        <Text style={w.tagline}>
          Smarter grocery planning starts here.{'\n'}Save more. Stress less. Live better.
        </Text>

        {/* Hero image */}
        <View style={w.heroWrap}>
          <Image
            source={require('../assets/hero-banner.png')}
            style={w.heroImage}
            resizeMode="contain"
          />
        </View>

        {/* Feature list */}
        <View style={w.features}>
          {FEATURES.map(function (f) {
            return <FeatureRow key={f.icon} icon={f.icon} title={f.title} desc={f.desc} />;
          })}
        </View>

        {/* CTAs */}
        <View style={w.ctaGroup}>
          <TouchableOpacity
            style={w.getStartedBtn}
            onPress={function () { goMode('signup'); }}
            activeOpacity={0.88}
          >
            <Text style={w.getStartedTxt}>Get Started</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={w.demoBtn}
            onPress={handleDemoMode}
            activeOpacity={0.8}
          >
            <Feather name="play" size={16} color={WHITE} style={{ marginRight: 8 }} />
            <Text style={w.demoBtnTxt}>Try Demo Mode</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={function () { goMode('signin'); }} activeOpacity={0.75}>
            <Text style={w.signInLink}>
              Already have an account?{'  '}
              <Text style={w.signInLinkGreen}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ── Render: Get Started (sign-up form) ────────────────────────────────────
  function renderSignUp() {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={f.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={f.backBtn} onPress={function () { goMode('welcome'); }} activeOpacity={0.7}>
            <Feather name="arrow-left" size={22} color={WHITE} />
          </TouchableOpacity>

          <View style={f.card}>
            <Text style={f.cardEyebrow}>Free trial — no credit card needed</Text>
            <Text style={f.cardTitle}>Create your{'\n'}account</Text>
            <Text style={f.cardSub}>We'll personalize your plan in the next few steps.</Text>

            <View style={f.fieldGroup}>
              <FieldInput
                label="YOUR NAME"
                value={name}
                onChangeText={function (t) { setName(t); clearMessages(); }}
                autoCapitalize="words"
                placeholder="First name"
                focused={focusedField === 'name'}
                onFocus={function () { setFocusedField('name'); }}
                onBlur={function () { setFocusedField(null); }}
              />
              <FieldInput
                label="EMAIL ADDRESS"
                value={email}
                onChangeText={function (t) { setEmail(t); clearMessages(); }}
                keyboardType="email-address"
                placeholder="your@email.com"
                focused={focusedField === 'email'}
                onFocus={function () { setFocusedField('email'); }}
                onBlur={function () { setFocusedField(null); }}
              />
              <FieldInput
                label="PASSWORD"
                value={password}
                onChangeText={function (t) { setPassword(t); clearMessages(); }}
                secureTextEntry={!showPw}
                placeholder="8+ characters"
                focused={focusedField === 'pw'}
                onFocus={function () { setFocusedField('pw'); }}
                onBlur={function () { setFocusedField(null); }}
                rightEl={
                  <TouchableOpacity style={f.eyeBtn} onPress={function () { setShowPw(function (v) { return !v; }); }}>
                    <Feather name={showPw ? 'eye-off' : 'eye'} size={16} color={GRAY} />
                  </TouchableOpacity>
                }
              />
            </View>

            {!!errorMsg && <Text style={f.errorTxt}>{errorMsg}</Text>}
            {!!infoMsg  && <Text style={f.infoTxt}>{infoMsg}</Text>}

            <TouchableOpacity
              style={[f.submitBtn, (loading || !!oauthLoading) && f.submitBtnDisabled]}
              onPress={handleSignUp}
              disabled={loading || !!oauthLoading}
              activeOpacity={0.88}
            >
              {loading
                ? <ActivityIndicator color={WHITE} />
                : <Text style={f.submitBtnTxt}>Create Account</Text>
              }
            </TouchableOpacity>

            <Text style={f.trustCopy}>
              No surprise charges. Cancel before trial ends to pay nothing.
            </Text>

            <TouchableOpacity onPress={function () { goMode('signin'); }} style={f.switchLink}>
              <Text style={f.switchLinkTxt}>
                Already have an account?{'  '}
                <Text style={f.switchLinkGreen}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Render: Sign In ────────────────────────────────────────────────────────
  function renderSignIn() {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={f.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={f.backBtn} onPress={function () { goMode('welcome'); }} activeOpacity={0.7}>
            <Feather name="arrow-left" size={22} color={WHITE} />
          </TouchableOpacity>

          <View style={f.card}>
            <Text style={f.cardEyebrow}>Your weekly food plan</Text>
            <Text style={f.cardTitle}>Welcome{'\n'}back.</Text>

            {/* Social auth */}
            <View style={f.socialGroup}>
              <SocialBtn
                icon={<GoogleIcon />}
                label="Continue with Google"
                onPress={function () { handleOAuth('google'); }}
                disabled={!!(loading || oauthLoading === 'google')}
              />
              {Platform.OS === 'ios' && (
                <SocialBtn
                  icon={<Feather name="smartphone" size={18} color={NAVY} />}
                  label="Continue with Apple"
                  onPress={function () { handleOAuth('apple'); }}
                  disabled={!!(loading || oauthLoading === 'apple')}
                />
              )}
            </View>

            <View style={f.divider}>
              <View style={f.dividerLine} />
              <Text style={f.dividerTxt}>or with email</Text>
              <View style={f.dividerLine} />
            </View>

            <View style={f.fieldGroup}>
              <FieldInput
                label="EMAIL ADDRESS"
                value={email}
                onChangeText={function (t) { setEmail(t); clearMessages(); }}
                keyboardType="email-address"
                placeholder="your@email.com"
                focused={focusedField === 'email'}
                onFocus={function () { setFocusedField('email'); }}
                onBlur={function () { setFocusedField(null); }}
              />
              <FieldInput
                label="PASSWORD"
                value={password}
                onChangeText={function (t) { setPassword(t); clearMessages(); }}
                secureTextEntry={!showPw}
                placeholder="Password"
                focused={focusedField === 'pw'}
                onFocus={function () { setFocusedField('pw'); }}
                onBlur={function () { setFocusedField(null); }}
                rightEl={
                  <TouchableOpacity style={f.eyeBtn} onPress={function () { setShowPw(function (v) { return !v; }); }}>
                    <Feather name={showPw ? 'eye-off' : 'eye'} size={16} color={GRAY} />
                  </TouchableOpacity>
                }
              />
            </View>

            <TouchableOpacity style={f.forgotWrap} onPress={handleForgotPassword} disabled={loading}>
              <Text style={f.forgotTxt}>Forgot password?</Text>
            </TouchableOpacity>

            {!!errorMsg && <Text style={f.errorTxt}>{errorMsg}</Text>}
            {!!infoMsg  && <Text style={f.infoTxt}>{infoMsg}</Text>}

            <TouchableOpacity
              style={[f.submitBtn, (loading || !!oauthLoading) && f.submitBtnDisabled]}
              onPress={handleSignIn}
              disabled={loading || !!oauthLoading}
              activeOpacity={0.88}
            >
              {loading
                ? <ActivityIndicator color={WHITE} />
                : <Text style={f.submitBtnTxt}>Sign In</Text>
              }
            </TouchableOpacity>

            <Text style={f.trustCopy}>Plan smarter. Save more. Stress less.</Text>

            <TouchableOpacity onPress={function () { goMode('signup'); }} style={f.switchLink}>
              <Text style={f.switchLinkTxt}>
                No account yet?{'  '}
                <Text style={f.switchLinkGreen}>Start your free trial</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={root.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG_DARK} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
          {mode === 'welcome' && renderWelcome()}
          {mode === 'signup'  && renderSignUp()}
          {mode === 'signin'  && renderSignIn()}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// Welcome screen
var w = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },

  // Logo + wordmark
  logoRow: { alignItems: 'center', marginBottom: 24 },
  logoImage: { width: 64, height: 64, marginBottom: 8 },
  wordmark: { fontSize: 28, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },

  // Headline
  headline: {
    fontSize: 38,
    fontWeight: '900',
    color: WHITE,
    textAlign: 'center',
    letterSpacing: -0.8,
    lineHeight: 44,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 16,
    color: OVERLAY_TXT,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
    fontWeight: '300',
  },

  // Hero image
  heroWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 28,
  },
  heroImage: {
    width: '90%',
    height: 200,
  },

  // Feature list
  features: { width: '100%', gap: 14, marginBottom: 32 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  featureIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: ICON_BG,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: { flex: 1, paddingTop: 2 },
  featureTitle: { fontSize: 16, fontWeight: '700', color: WHITE, marginBottom: 2 },
  featureDesc:  { fontSize: 14, color: OVERLAY_TXT, lineHeight: 20, fontWeight: '300' },

  // CTAs
  ctaGroup: { width: '100%', gap: 12, alignItems: 'center' },
  getStartedBtn: {
    width: '100%',
    backgroundColor: GREEN,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 7,
  },
  getStartedTxt: { fontSize: 17, fontWeight: '800', color: WHITE },
  demoBtn: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  demoBtnTxt: { fontSize: 15, fontWeight: '600', color: WHITE },
  signInLink: {
    fontSize: 15,
    color: OVERLAY_TXT,
    textAlign: 'center',
    marginTop: 4,
  },
  signInLinkGreen: { color: GREEN, fontWeight: '700' },
});

// Form screens (signup + signin)
var f = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 24, paddingTop: 12 },

  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: ICON_BG,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },

  card: { width: '100%' },
  cardEyebrow: {
    fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1.5, color: GREEN, marginBottom: 10,
  },
  cardTitle: {
    fontSize: 38, fontWeight: '900', color: WHITE,
    letterSpacing: -0.8, lineHeight: 44, marginBottom: 8,
  },
  cardSub: {
    fontSize: 15, color: OVERLAY_TXT, fontWeight: '300',
    lineHeight: 22, marginBottom: 28,
  },

  // Social
  socialGroup: { gap: 10, marginBottom: 22 },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 15, paddingHorizontal: 20,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 14,
  },
  socialIcon:  { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  socialLabel: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '500', color: WHITE },

  divider:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  dividerTxt:  { fontSize: 11, fontWeight: '600', color: OVERLAY_TXT, letterSpacing: 0.8, textTransform: 'uppercase' },

  // Fields
  fieldGroup: { gap: 14, marginBottom: 8 },
  fieldWrap:  {},
  fieldLabel: {
    fontSize: 10, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, color: 'rgba(255,255,255,0.55)', marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    minHeight: 54,
  },
  inputWrapFocused: {
    borderColor: GREEN,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: WHITE,
    backgroundColor: 'transparent',
    paddingVertical: 0,
    ...Platform.select({ web: { outline: 'none' } }),
  },
  eyeBtn: { padding: 4 },

  forgotWrap: { alignItems: 'flex-end', marginBottom: 16 },
  forgotTxt:  { fontSize: 13, color: GREEN, fontWeight: '500' },

  errorTxt: { fontSize: 13, color: '#FCA5A5', marginBottom: 12, textAlign: 'center', fontWeight: '500' },
  infoTxt:  { fontSize: 13, color: GREEN,     marginBottom: 12, textAlign: 'center', fontWeight: '500' },

  submitBtn: {
    width: '100%', paddingVertical: 18, borderRadius: 14,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
    marginTop: 8, marginBottom: 12,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 5,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnTxt: { color: WHITE, fontSize: 16, fontWeight: '700' },

  trustCopy: { textAlign: 'center', fontSize: 12, color: OVERLAY_TXT, marginBottom: 20, letterSpacing: 0.3 },

  switchLink: { alignItems: 'center' },
  switchLinkTxt: { fontSize: 14, color: OVERLAY_TXT },
  switchLinkGreen: { color: GREEN, fontWeight: '700' },
});

// Root
var root = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_DARK },
});
