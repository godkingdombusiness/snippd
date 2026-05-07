/**
 * SignInScreen — SNIPPD_BETA_HERO_REBUILD_V1
 *
 * Tablet (width > 768): dark hero left panel + white form right panel.
 * Phone: dark gradient hero header + floating white auth card.
 *
 * Auth wiring unchanged:
 *   Google / Apple → supabase.auth.signInWithOAuth (opens browser)
 *   Email → supabase.auth.signInWithPassword / signUp
 *   On success: App.js onAuthStateChange handles routing.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Platform,
  Animated, KeyboardAvoidingView, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';

WebBrowser.maybeCompleteAuthSession();

// ── Palette ───────────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const GREEN_DARK = '#07652F';
const NAVY       = '#172250';
const NAVY_DEEP  = '#0E1634';
const NAVY_MID   = '#1A2E6B';
const ACCENT     = '#C5FFBC';
const ALERT      = '#FB5B5B';
const WHITE      = '#FFFFFF';
const INK        = '#0D1217';
const MUTED      = '#6B7280';
const BORDER     = 'rgba(23,34,80,0.10)';
const GLASS      = 'rgba(255,255,255,0.97)';

// ── Google icon ───────────────────────────────────────────────────────────────
const GOOGLE_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];
function GoogleIcon({ size = 18 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
      {GOOGLE_COLORS.map((c, i) => (
        <View key={i} style={{ width: size / 2, height: size / 2, backgroundColor: c }} />
      ))}
    </View>
  );
}

// ── Animated background blobs ─────────────────────────────────────────────────
function HeroBg() {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (val, dur) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: dur, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(val, { toValue: 0, duration: dur, useNativeDriver: Platform.OS !== 'web' }),
        ])
      );
    loop(a1, 7000).start();
    loop(a2, 9500).start();
    loop(a3, 12000).start();
  }, [a1, a2, a3]);

  const t1 = a1.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });
  const t2 = a2.interpolate({ inputRange: [0, 1], outputRange: [0, -28] });
  const t3 = a3.interpolate({ inputRange: [0, 1], outputRange: [0, 22] });

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', overflow: 'hidden' }]}>
      <Animated.View style={[blobSt(360, 360, -100, -100, 'rgba(12,158,84,0.13)'), { transform: [{ translateX: t1 }, { translateY: t1 }] }]} />
      <Animated.View style={[blobSt(240, 240, undefined, -60, 'rgba(197,255,188,0.07)', 120), { transform: [{ translateX: t2 }] }]} />
      <Animated.View style={[blobSt(180, 180, 220, undefined, 'rgba(12,158,84,0.09)', undefined, 40), { transform: [{ translateY: t3 }] }]} />
    </View>
  );
}

function blobSt(w, h, top, right, bg, bottom, left) {
  return { position: 'absolute', width: w, height: h, borderRadius: w / 2, backgroundColor: bg, top, right, bottom, left };
}

// ── Value block (hero section) ────────────────────────────────────────────────
function ValueBlock({ icon, title, text, compact = false }) {
  if (compact) {
    return (
      <View style={vb.chipWrap}>
        <Feather name={icon} size={13} color={ACCENT} />
        <Text style={vb.chipTitle}>{title}</Text>
      </View>
    );
  }
  return (
    <View style={vb.blockWrap}>
      <View style={vb.iconWrap}>
        <Feather name={icon} size={16} color={ACCENT} />
      </View>
      <Text style={vb.blockTitle}>{title}</Text>
      <Text style={vb.blockText}>{text}</Text>
    </View>
  );
}

const vb = StyleSheet.create({
  // Full blocks (tablet left panel)
  blockWrap:  { flex: 1, gap: 6 },
  iconWrap:   { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(197,255,188,0.12)', alignItems: 'center', justifyContent: 'center' },
  blockTitle: { fontSize: 13, fontWeight: '800', color: WHITE, letterSpacing: -0.2 },
  blockText:  { fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 15 },

  // Compact chips (mobile)
  chipWrap:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(197,255,188,0.08)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(197,255,188,0.15)' },
  chipTitle: { fontSize: 11, fontWeight: '700', color: ACCENT, letterSpacing: 0.2 },
});

// ── AI Mockup card (tablet right decoration) ──────────────────────────────────
function AIMockup() {
  const pulse = useRef(new Animated.Value(1)).current;
  const dotFade = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.015, duration: 2200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 2200, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotFade, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(dotFade, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse, dotFade]);

  const ITEMS = [
    { name: 'Organic Chicken Breast 2lb', store: 'Publix',  save: '−$3.10', tag: 'Matched',   tagColor: GREEN },
    { name: 'Whole Grain Bread',          store: 'Walmart', save: '−$1.20', tag: 'Coupon',    tagColor: '#3B82F6' },
    { name: 'Greek Yogurt 32oz',          store: 'Aldi',    save: '−$2.00', tag: 'Best Price', tagColor: '#8B5CF6' },
  ];

  return (
    <Animated.View style={[mock.card, { transform: [{ scale: pulse }] }]}>
      <View style={mock.headerRow}>
        <Animated.View style={[mock.dot, { opacity: dotFade }]} />
        <Text style={mock.headerTxt}>Optimizing your cart…</Text>
        <ActivityIndicator size="small" color={ACCENT} style={{ marginLeft: 'auto' }} />
      </View>

      {ITEMS.map((item, i) => (
        <View key={i} style={mock.itemRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={mock.itemName} numberOfLines={1}>{item.name}</Text>
            <Text style={mock.itemStore}>{item.store}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={mock.itemSave}>{item.save}</Text>
            <View style={[mock.tag, { backgroundColor: item.tagColor + '20' }]}>
              <Text style={[mock.tagTxt, { color: item.tagColor }]}>{item.tag}</Text>
            </View>
          </View>
        </View>
      ))}

      <View style={mock.footer}>
        <Text style={mock.footerLabel}>Saved this week</Text>
        <Text style={mock.footerVal}>$6.30</Text>
      </View>

      <View style={mock.insight}>
        <Feather name="zap" size={11} color={ACCENT} />
        <Text style={mock.insightTxt}>Switching to Aldi for dairy saves ~$14/mo</Text>
      </View>
    </Animated.View>
  );
}

const mock = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(197,255,188,0.12)',
    padding: 16,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT },
  headerTxt: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.2 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  itemName: { fontSize: 12, fontWeight: '600', color: WHITE },
  itemStore: { fontSize: 10, color: 'rgba(255,255,255,0.35)' },
  itemSave: { fontSize: 13, fontWeight: '800', color: ACCENT },
  tag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tagTxt: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(197,255,188,0.15)' },
  footerLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  footerVal: { fontSize: 18, fontWeight: '900', color: ACCENT, letterSpacing: -0.5 },

  insight: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(197,255,188,0.06)', borderRadius: 10, padding: 8 },
  insightTxt: { fontSize: 11, color: 'rgba(255,255,255,0.5)', flex: 1, lineHeight: 15 },
});

// ── Social button ─────────────────────────────────────────────────────────────
function SocialBtn({ icon, label, onPress, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[form.socialBtn, disabled && { opacity: 0.5 }]}
        onPress={() => {
          Animated.sequence([
            Animated.timing(scale, { toValue: 0.97, duration: 80, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1,    duration: 120, useNativeDriver: true }),
          ]).start();
          onPress?.();
        }}
        activeOpacity={0.88}
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
          placeholderTextColor="rgba(107,114,128,0.40)"
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

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function SignInScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isTablet  = width > 768;

  const [tab,          setTab]          = useState('signin');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPw,       setShowPw]       = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [focusedField, setFocusedField] = useState(null);

  const cardFade  = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardFade,  { toValue: 1, duration: 750, delay: 200, useNativeDriver: true }),
      Animated.timing(cardSlide, { toValue: 0, duration: 750, delay: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const clearError = () => setErrorMsg('');

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
        if (data?.session?.access_token) tracker.setAccessToken(data.session.access_token);
        // App.js onAuthStateChange fires SIGNED_IN → resolveUserStatus → navigates.
      } else {
        const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
        if (error) throw error;
        if (data?.user) {
          await supabase.from('profiles').upsert({
            user_id:       data.user.id,
            email:         data.user.email,
            full_name:     data.user.email?.split('@')[0],
            weekly_budget: 15000,
          }, { onConflict: 'user_id', ignoreDuplicates: true });
          if (data.session) {
            tracker.setAccessToken(data.session.access_token);
          } else {
            navigation.navigate('ConciergeOnboarding');
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

  // ── Shared form body (everything inside the white card) ───────────────────
  const FormBody = () => (
    <>
      {/* Card header */}
      <View style={form.cardHead}>
        <Text style={form.cardEyebrow}>
          {tab === 'signin' ? 'Welcome back to smarter shopping.' : 'Start saving smarter today.'}
        </Text>
        <Text style={form.cardSub}>
          {tab === 'signin'
            ? 'Sign in to continue building smarter carts and personalized savings plans.'
            : 'Join the beta and let Snippd quietly handle the savings work.'}
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
          <Text style={[form.tabBtnTxt, tab === 'signup' && form.tabBtnTxtActive]}>Join Beta</Text>
        </TouchableOpacity>
      </View>

      {/* Social auth */}
      <View style={form.socialGroup}>
        <SocialBtn
          icon={<GoogleIcon size={18} />}
          label="Continue with Google"
          onPress={() => handleOAuth('google')}
          disabled={!!loading || oauthLoading === 'google'}
        />
        {Platform.OS === 'ios' && (
          <SocialBtn
            icon={<Feather name="smartphone" size={18} color={INK} />}
            label="Continue with Apple"
            onPress={() => handleOAuth('apple')}
            disabled={!!loading || oauthLoading === 'apple'}
          />
        )}
      </View>

      {/* Divider */}
      <View style={form.dividerRow}>
        <View style={form.dividerLine} />
        <Text style={form.dividerTxt}>or continue with email</Text>
        <View style={form.dividerLine} />
      </View>

      {/* Fields */}
      <View style={form.fieldGroup}>
        <Field
          label="Email"
          value={email}
          onChangeText={t => { setEmail(t); clearError(); }}
          keyboardType="email-address"
          placeholder="you@example.com"
          focused={focusedField === 'email'}
          onFocus={() => setFocusedField('email')}
          onBlur={() => setFocusedField(null)}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={t => { setPassword(t); clearError(); }}
          secureTextEntry={!showPw}
          placeholder="••••••••"
          focused={focusedField === 'pw'}
          onFocus={() => setFocusedField('pw')}
          onBlur={() => setFocusedField(null)}
          rightEl={
            <TouchableOpacity style={form.eyeBtn} onPress={() => setShowPw(v => !v)}>
              <Feather name={showPw ? 'eye-off' : 'eye'} size={15} color={MUTED} />
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
        <View style={form.errorWrap}>
          <Feather name="alert-circle" size={13} color={ALERT} />
          <Text style={form.errorTxt}>{errorMsg}</Text>
        </View>
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
            {tab === 'signin' ? 'Continue' : 'Join Beta'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Bottom link */}
      <Text style={form.bottomLink}>
        {tab === 'signin'
          ? <Text>New to Snippd?{' '}<Text style={form.bottomLinkA} onPress={() => switchTab('signup')}>Join the beta →</Text></Text>
          : <Text>Already have an account?{' '}<Text style={form.bottomLinkA} onPress={() => switchTab('signin')}>Sign in</Text></Text>
        }
      </Text>
    </>
  );

  // ── LEFT PANEL (tablet hero) ──────────────────────────────────────────────
  const LeftPanel = () => (
    <LinearGradient
      colors={[NAVY_DEEP, NAVY, NAVY_MID]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={layout.leftPanel}
    >
      <HeroBg />
      <SafeAreaView style={layout.leftInner} edges={['top', 'bottom']}>

        {/* Wordmark */}
        <Text style={hero.wordmark}>
          snipp<Text style={{ color: ACCENT }}>d</Text>
        </Text>

        {/* Headline */}
        <View style={hero.headlineWrap}>
          <Text style={hero.headline}>
            {'Groceries got\nexpensive.'}
          </Text>
          <Text style={[hero.headline, { color: ACCENT }]}>
            {'Your cart got\nsmarter.'}
          </Text>
        </View>

        {/* Sub */}
        <Text style={hero.sub}>
          Snippd automatically finds better deals, personalized savings, and smarter shopping plans before you check out — so your money goes further without the extra work.
        </Text>

        {/* Value blocks */}
        <View style={hero.valueRow}>
          <ValueBlock icon="clock"         title="Save Time"          text="Skip the spreadsheets and store hopping." />
          <ValueBlock icon="shopping-cart" title="Smarter Carts"      text="Built around your real shopping habits." />
          <ValueBlock icon="trending-up"   title="Gets Smarter"       text="The more you use it, the better it gets." />
        </View>

        {/* AI Mockup */}
        <AIMockup />
      </SafeAreaView>
    </LinearGradient>
  );

  // ── RIGHT PANEL (tablet form) ─────────────────────────────────────────────
  const RightPanel = () => (
    <View style={layout.rightPanel}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={layout.rightScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={[layout.formCard, { opacity: cardFade, transform: [{ translateY: cardSlide }] }]}
            >
              <FormBody />
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );

  // ── PHONE LAYOUT ──────────────────────────────────────────────────────────
  const PhoneLayout = () => (
    <LinearGradient
      colors={[NAVY_DEEP, NAVY, NAVY_MID]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.3, y: 1 }}
      style={{ flex: 1 }}
    >
      <HeroBg />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={layout.phoneScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Hero header */}
            <View style={hero.phoneHero}>
              <Text style={hero.wordmarkPhone}>
                snipp<Text style={{ color: ACCENT }}>d</Text>
              </Text>
              <Text style={hero.phoneHeadline}>
                {'Groceries got expensive.\n'}
                <Text style={{ color: ACCENT }}>Your cart got smarter.</Text>
              </Text>
              <Text style={hero.phoneSub}>
                AI-powered savings that works quietly in the background — personalized to how you actually shop.
              </Text>
              {/* Value chips */}
              <View style={hero.chipRow}>
                <ValueBlock icon="clock"         title="Save Time"      compact />
                <ValueBlock icon="shopping-cart" title="Smart Carts"    compact />
                <ValueBlock icon="trending-up"   title="Personalized"   compact />
              </View>
            </View>

            {/* Floating auth card */}
            <Animated.View
              style={[layout.phoneCard, { opacity: cardFade, transform: [{ translateY: cardSlide }] }]}
            >
              <FormBody />
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      {isTablet ? (
        <View style={layout.tabletRow}>
          <LeftPanel />
          <RightPanel />
        </View>
      ) : (
        <PhoneLayout />
      )}
    </View>
  );
}

// ── Hero styles ───────────────────────────────────────────────────────────────
const hero = StyleSheet.create({
  // Tablet left panel
  wordmark: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 28,
    color: 'rgba(197,255,188,0.8)',
    letterSpacing: -0.5,
    marginBottom: 32,
  },
  headlineWrap: { gap: 0, marginBottom: 20 },
  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 44,
    lineHeight: 48,
    color: WHITE,
    letterSpacing: -1.8,
  },
  sub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 22,
    fontWeight: '300',
    maxWidth: 340,
    marginBottom: 28,
  },
  valueRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28,
  },

  // Phone
  phoneHero: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 12,
  },
  wordmarkPhone: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 24,
    color: 'rgba(197,255,188,0.75)',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  phoneHeadline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 34,
    lineHeight: 38,
    color: WHITE,
    letterSpacing: -1.5,
  },
  phoneSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.40)',
    lineHeight: 20,
    fontWeight: '300',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
});

// ── Form / card styles ────────────────────────────────────────────────────────
const form = StyleSheet.create({
  cardHead: { marginBottom: 20, gap: 6 },
  cardEyebrow: {
    fontSize: 15,
    fontWeight: '800',
    color: INK,
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  cardSub: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 19,
    fontWeight: '300',
  },

  // Tab toggle
  tabToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(23,34,80,0.05)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  tabBtn: {
    flex: 1, paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  tabBtnTxt:       { fontSize: 13, fontWeight: '500', color: MUTED },
  tabBtnTxtActive: { fontSize: 13, fontWeight: '800', color: NAVY },

  // Social
  socialGroup: { gap: 10, marginBottom: 20 },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: GLASS,
    gap: 12,
  },
  socialIcon:  { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  socialLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '500', color: INK },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(23,34,80,0.08)' },
  dividerTxt: {
    fontSize: 10, fontWeight: '600',
    color: MUTED, letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Fields
  fieldGroup: { gap: 12, marginBottom: 6 },
  fieldWrap:  {},
  fieldLabel: {
    fontSize: 11, fontWeight: '700',
    color: MUTED, letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: WHITE,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  inputWrapFocused: {
    borderColor: GREEN,
    ...Platform.select({
      web:     { boxShadow: '0px 0px 0px 3px rgba(12,158,84,0.12)' },
      default: { shadowColor: GREEN, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 5, elevation: 2 },
    }),
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: INK,
    backgroundColor: WHITE,
    underlineColorAndroid: 'transparent',
    paddingVertical: 0,
    ...Platform.select({ web: { outline: 'none' } }),
  },
  eyeBtn: { padding: 4 },

  // Forgot
  forgotWrap: { alignItems: 'flex-end', marginBottom: 14, marginTop: 4 },
  forgotTxt:  { fontSize: 12, color: GREEN, fontWeight: '500' },

  // Error
  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12, backgroundColor: '#FFF5F5', borderRadius: 10, padding: 10 },
  errorTxt:  { flex: 1, fontSize: 12, color: ALERT, fontWeight: '500', lineHeight: 17 },

  // Submit
  submitBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnTxt: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.1,
  },

  // Bottom link
  bottomLink:  { textAlign: 'center', fontSize: 13, color: MUTED },
  bottomLinkA: { color: GREEN, fontWeight: '700' },
});

// ── Layout styles ─────────────────────────────────────────────────────────────
const layout = StyleSheet.create({
  tabletRow: { flex: 1, flexDirection: 'row' },

  leftPanel:  { flex: 1, overflow: 'hidden' },
  leftInner:  { flex: 1, padding: 48, justifyContent: 'space-between' },

  rightPanel: { flex: 1, backgroundColor: '#F8FAFB' },
  rightScroll: { flexGrow: 1, justifyContent: 'center', padding: 48 },
  formCard: {
    backgroundColor: WHITE,
    borderRadius: 28,
    padding: 32,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
    elevation: 8,
    ...Platform.select({ web: { boxShadow: '0px 12px 40px rgba(23,34,80,0.10)' } }),
  },

  phoneScroll: { flexGrow: 1, paddingBottom: 40 },
  phoneCard: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: WHITE,
    borderRadius: 32,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
    elevation: 12,
    ...Platform.select({ web: { boxShadow: '0px 16px 48px rgba(0,0,0,0.16)' } }),
  },
});
