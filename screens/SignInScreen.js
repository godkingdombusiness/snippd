/**
 * SignInScreen — Two-panel sign-in/sign-up.
 *
 * Tablet (width > 768): left forest-green panel + right form panel.
 * Phone: single panel (form only).
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
  StatusBar, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';

// ── Palette (matches HTML reference) ──────────────────────────────
const FOREST       = '#0C7A3D';
const FOREST_DEEP  = '#04361D';
const FOREST_MID   = '#0F4A2E';
const MINT         = '#1ED870';
const TEAL         = '#9FE1CB';
const CREAM        = '#F5F2EC';
const INK          = '#0D1B0F';
const MUTED        = '#5A6B5E';
const WHITE        = '#FFFFFF';
const BORDER       = 'rgba(12,122,61,0.18)';
const GLASS        = 'rgba(255,255,255,0.92)';
const ERROR_RED    = '#DC2626';
const FOCUS_RING   = 'rgba(12,122,61,0.15)';

// ── Google SVG as a simple colored-circle placeholder ─────────────
// Real OAuth icon rendered as colored squares in RN (no SVG renderer needed)
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

// ── Apple icon ─────────────────────────────────────────────────────
function AppleIcon({ size = 20 }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name="smartphone" size={size - 2} color={INK} />
    </View>
  );
}

// ── Animated background blob ───────────────────────────────────────
function BlobBg() {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (val, dur) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: dur, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: dur, useNativeDriver: true }),
        ])
      );
    loop(a1, 6000).start();
    loop(a2, 8000).start();
  }, [a1, a2]);

  const tx1 = a1.interpolate({ inputRange: [0, 1], outputRange: [0, 30] });
  const tx2 = a2.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          blobStyle(300, 300, -80, -80, 'rgba(12,122,61,0.10)'),
          { transform: [{ translateX: tx1 }, { translateY: tx1 }] },
        ]}
      />
      <Animated.View
        style={[
          blobStyle(250, 250, undefined, -60, 'rgba(30,216,112,0.08)', 60),
          { transform: [{ translateX: tx2 }, { translateY: tx2 }] },
        ]}
      />
    </View>
  );
}

function blobStyle(w, h, top, right, bg, bottom) {
  return {
    position: 'absolute',
    width: w, height: h, borderRadius: w / 2,
    backgroundColor: bg,
    top, right, bottom,
  };
}

// ── Stats chip ─────────────────────────────────────────────────────
function StatChip({ value, label }) {
  return (
    <View style={left.stat}>
      <Text style={left.statNum}>{value}</Text>
      <Text style={left.statLabel}>{label}</Text>
    </View>
  );
}

// ── Social button ──────────────────────────────────────────────────
function SocialBtn({ icon, label, onPress, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press  = () => { Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start(); onPress?.(); };
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

// ── Field ──────────────────────────────────────────────────────────
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
          placeholderTextColor="rgba(90,107,94,0.45)"
          onFocus={onFocus}
          onBlur={onBlur}
          autoCorrect={false}
        />
        {rightEl}
      </View>
    </View>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────
export default function SignInScreen() {
  const { width } = useWindowDimensions();
  const isTablet  = width > 768;

  const [tab,             setTab]             = useState('signin');   // 'signin' | 'signup'
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [showPw,          setShowPw]          = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [oauthLoading,    setOauthLoading]    = useState(null); // 'google' | 'apple'
  const [errorMsg,        setErrorMsg]        = useState('');
  const [focusedField,    setFocusedField]    = useState(null);
  const [stats,           setStats]           = useState({
    savings: '$2.4k', stores: '6+', autonomous: '100%',
  });

  // Fade-in the form card
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  // Pull real stats from profiles table (best-effort)
  useEffect(() => {
    (async () => {
      try {
        const { count } = await supabase
          .from('profiles')
          .select('user_id', { count: 'exact', head: true });
        if (count && count > 0) {
          setStats(s => ({ ...s, stores: count > 10 ? '10+' : `${count}+` }));
        }
      } catch { /* static fallback is fine */ }
    })();
  }, []);

  const clearError = () => setErrorMsg('');

  // ── Email auth ──────────────────────────────────────────────────
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
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail, password,
        });
        if (error) throw error;
        if (data?.session?.access_token) {
          tracker.setAccessToken(data.session.access_token);
        }
        // App.js onAuthStateChange handles navigation — no manual navigate needed.
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail, password,
        });
        if (error) throw error;
        if (data?.user && !data.session) {
          // Email confirmation required
          setErrorMsg('Check your inbox to confirm your email, then sign in.');
          setTab('signin');
        }
        // If session returned immediately, onAuthStateChange handles routing.
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [tab, email, password]);

  // ── OAuth ────────────────────────────────────────────────────────
  const handleOAuth = useCallback(async (provider) => {
    clearError();
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          skipBrowserRedirect: false,
        },
      });
      if (error) throw error;
      // Browser opens; onAuthStateChange handles return.
    } catch (err) {
      setErrorMsg(`${provider === 'google' ? 'Google' : 'Apple'} sign-in failed. Try email instead.`);
    } finally {
      setOauthLoading(null);
    }
  }, []);

  const handleForgotPassword = useCallback(async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('Enter your email address above, then tap Forgot password?');
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

  // ── Left panel (tablets only) ──────────────────────────────────
  const LeftPanel = () => (
    <LinearGradient
      colors={[FOREST_DEEP, FOREST_MID, FOREST]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={left.panel}
    >
      {/* Soft radial highlight */}
      <View style={left.highlight} />

      {/* Wordmark */}
      <Text style={left.wordmark}>
        snipp<Text style={{ color: MINT }}>d</Text>
      </Text>

      {/* Headline */}
      <View style={left.content}>
        <Text style={left.headline}>
          {'Stack every\ndeal. '}
          <Text style={left.headlineItalic}>{'Miss\nnothing.'}</Text>
        </Text>
        <Text style={left.sub}>
          Your autonomous shopping intelligence finds savings you didn't know existed — automatically, every week.
        </Text>
      </View>

      {/* Stats */}
      <View style={left.statsRow}>
        <StatChip value={stats.savings} label="avg annual savings" />
        <View style={left.divider} />
        <StatChip value={stats.stores}  label="stores tracked" />
        <View style={left.divider} />
        <StatChip value={stats.autonomous} label="autonomous" />
      </View>
    </LinearGradient>
  );

  // ── Right panel (form) ─────────────────────────────────────────
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
        <Animated.View
          style={[
            form.card,
            isTablet && form.cardTablet,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Header */}
          <View style={form.header}>
            {!isTablet && (
              <Text style={form.wordmarkPhone}>
                snipp<Text style={{ color: FOREST }}>d</Text>
              </Text>
            )}
            <Text style={form.eyebrow}>Your shopping intelligence</Text>
            <Text style={form.title}>
              {tab === 'signin'
                ? <Text>Welcome{'\n'}<Text style={form.titleItalic}>back.</Text></Text>
                : <Text>Start{'\n'}<Text style={form.titleItalic}>saving.</Text></Text>
              }
            </Text>
            <Text style={form.sub}>
              {tab === 'signin'
                ? <Text>New here? <Text style={form.subLink} onPress={() => switchTab('signup')}>Create your account</Text></Text>
                : <Text>Already have an account? <Text style={form.subLink} onPress={() => switchTab('signin')}>Sign in</Text></Text>
              }
            </Text>
          </View>

          {/* Tab toggle */}
          <View style={form.tabToggle}>
            <TouchableOpacity
              style={[form.tabBtn, tab === 'signin' && form.tabBtnActive]}
              onPress={() => switchTab('signin')}
            >
              <Text style={[form.tabBtnTxt, tab === 'signin' && form.tabBtnTxtActive]}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[form.tabBtn, tab === 'signup' && form.tabBtnActive]}
              onPress={() => switchTab('signup')}
            >
              <Text style={[form.tabBtnTxt, tab === 'signup' && form.tabBtnTxtActive]}>Create account</Text>
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
              placeholder="you@example.com"
              focused={focusedField === 'email'}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
            />
            <Field
              label="PASSWORD"
              value={password}
              onChangeText={t => { setPassword(t); clearError(); }}
              secureTextEntry={!showPw}
              placeholder="Enter your password"
              focused={focusedField === 'pw'}
              onFocus={() => setFocusedField('pw')}
              onBlur={() => setFocusedField(null)}
              rightEl={
                <TouchableOpacity style={form.eyeBtn} onPress={() => setShowPw(v => !v)}>
                  <Feather name={showPw ? 'eye-off' : 'eye'} size={16} color={MUTED} />
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

          {/* Error */}
          {!!errorMsg && (
            <Text style={form.errorTxt}>
              {errorMsg}
            </Text>
          )}

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
                {tab === 'signin' ? 'Sign in to Snippd' : 'Create my account'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Bottom link */}
          <Text style={form.bottomLink}>
            {tab === 'signin'
              ? <Text>No account yet?<Text style={form.bottomLinkA} onPress={() => switchTab('signup')}> Start saving for free</Text></Text>
              : <Text>Already have an account?<Text style={form.bottomLinkA} onPress={() => switchTab('signin')}> Sign in</Text></Text>
            }
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <View style={root.container}>
      <StatusBar barStyle="dark-content" />
      <BlobBg />

      {isTablet ? (
        // Two-panel tablet layout
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
        // Single-panel phone layout
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <FormPanel />
        </SafeAreaView>
      )}
    </View>
  );
}

// ── Left panel styles ──────────────────────────────────────────────
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
    backgroundColor: 'rgba(30,216,112,0.10)',
  },
  wordmark: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 30,
    color: TEAL,
    letterSpacing: -0.5,
  },
  content: { gap: 16 },
  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 46,
    lineHeight: 50,
    color: WHITE,
    letterSpacing: -1.5,
  },
  headlineItalic: {
    fontFamily: 'Sublima-ExtraLight',
    color: TEAL,
  },
  sub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 24,
    fontWeight: '300',
    maxWidth: 320,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  stat: { flex: 1 },
  statNum: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 26,
    color: MINT,
    letterSpacing: -1,
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '400',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  divider: {
    width: 1, height: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 16,
  },
});

// ── Form / right panel styles ──────────────────────────────────────
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
  card: {
    width: '100%',
  },
  cardTablet: {
    maxWidth: 420,
    alignSelf: 'center',
  },

  // Header
  header: { marginBottom: 32 },
  wordmarkPhone: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 28,
    color: INK,
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: FOREST,
    marginBottom: 10,
  },
  title: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 38,
    color: INK,
    letterSpacing: -1.5,
    lineHeight: 42,
    marginBottom: 8,
  },
  titleItalic: {
    fontFamily: 'Sublima-ExtraLight',
    color: FOREST,
  },
  sub: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '300',
  },
  subLink: {
    color: FOREST,
    fontWeight: '600',
  },

  // Tab toggle
  tabToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(12,122,61,0.07)',
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
  tabBtnTxt: {
    fontSize: 13, fontWeight: '500', color: MUTED,
  },
  tabBtnTxtActive: {
    color: FOREST, fontWeight: '700',
  },

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
  socialIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  socialLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '500', color: INK },

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
    color: MUTED, letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Fields
  fieldGroup: { gap: 12, marginBottom: 8 },
  fieldWrap: {},
  fieldLabel: {
    fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: MUTED,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: GLASS,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  inputWrapFocused: {
    borderColor: FOREST,
    backgroundColor: WHITE,
    shadowColor: FOREST,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 0,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: INK,
  },
  eyeBtn: { padding: 4 },

  // Forgot
  forgotWrap: { alignItems: 'flex-end', marginBottom: 16 },
  forgotTxt: { fontSize: 12, color: FOREST, fontWeight: '500', opacity: 0.75 },

  // Error
  errorTxt: {
    fontSize: 13,
    color: ERROR_RED,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Submit
  submitBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: FOREST,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: FOREST,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnTxt: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Bottom link
  bottomLink: { textAlign: 'center', fontSize: 13, color: MUTED },
  bottomLinkA: { color: FOREST, fontWeight: '700' },
});

// ── Root layout styles ─────────────────────────────────────────────
const root = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CREAM,
  },
  twoPanelRow: {
    flex: 1,
    flexDirection: 'row',
  },
  leftCol: {
    flex: 1,
  },
  rightCol: {
    flex: 1,
    backgroundColor: CREAM,
  },
});
