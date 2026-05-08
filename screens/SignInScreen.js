/**
 * SignInScreen — ADAPTIVE_HOUSEHOLD_INTELLIGENCE_V1
 * Premium landing page + multi-step sign-up onboarding.
 * Zero emojis. Brand green #0C9E54. Dark theme rejected.
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, ScrollView, StatusBar, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const GREEN      = '#0C9E54';
const GREEN_DARK = '#0A8040';
const NAVY       = '#111827';
const WHITE      = '#FFFFFF';
const BG         = '#F8FAF9';
const MUTED      = '#6B7280';
const BORDER     = '#E5E7EB';
const ERROR      = '#EF4444';
const CARD_BG    = '#FFFFFF';

const FEATURES = [
  { icon: 'resize-outline',  label: 'Right-sized grocery optimization' },
  { icon: 'pulse-outline',   label: 'Adaptive consumption intelligence' },
  { icon: 'leaf-outline',    label: 'Wellness-aware household planning' },
  { icon: 'sync-outline',    label: 'Behavioral grocery orchestration' },
];

const SAVINGS_ROWS = [
  { label: 'Right-sized packages', amount: '$624/yr' },
  { label: 'Coupon optimization',  amount: '$480/yr' },
  { label: 'Waste reduction',      amount: '$624/yr' },
  { label: 'Time value recovered', amount: '$300/yr' },
];

const PAIN_POINTS = [
  'You buy the family pack, eat half, and toss the rest.',
  'You clip coupons for things you never needed.',
  'You spend Sunday planning meals you will not make.',
];

const HOUSEHOLD_SIZES = ['Just me', '2 people', '3 people', '4+ people'];
const GROCERY_GOALS   = ['Save money', 'Reduce waste', 'Eat healthier', 'All of these'];

export default function SignInScreen() {
  const scrollRef   = useRef(null);
  const authRef     = useRef(null);

  const [tab,           setTab]           = useState('signup');
  const [signupStep,    setSignupStep]    = useState(0);
  const [householdSize, setHouseholdSize] = useState(null);
  const [groceryGoal,   setGroceryGoal]   = useState(null);
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [loading,       setLoading]       = useState(false);
  const [errorMsg,      setErrorMsg]      = useState('');
  const [painExpanded,  setPainExpanded]  = useState(false);

  const scrollToAuth = () => {
    authRef.current?.measureLayout(
      scrollRef.current?.getInnerViewNode?.() ?? null,
      (_x, y) => scrollRef.current?.scrollTo({ y: y - 20, animated: true }),
      () => {},
    );
  };

  const handleGetStarted = () => {
    setTab('signup');
    setSignupStep(0);
    setTimeout(scrollToAuth, 150);
  };

  const switchTab = (t) => {
    setTab(t);
    setSignupStep(0);
    setErrorMsg('');
  };

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const { error } = tab === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── HERO ─────────────────────────────────── */}
            <View style={s.hero}>
              <Text style={s.logo}>snipp<Text style={{ color: GREEN }}>d</Text></Text>
              <Text style={s.overline}>ADAPTIVE HOUSEHOLD INTELLIGENCE</Text>
              <Text style={s.headline}>
                The grocery industry was built for a{' '}
                <Text style={{ color: GREEN }}>different generation.</Text>
              </Text>

              <View style={s.statRow}>
                {[
                  { num: '34%', label: 'Less Waste\naverage' },
                  { num: '84%', label: 'Right-Sized\nmatch score' },
                  { num: '$47', label: 'Saved\nper week avg', green: true },
                ].map(({ num, label, green }) => (
                  <View key={num} style={s.statCard}>
                    <Text style={[s.statNum, green && { color: GREEN }]}>{num}</Text>
                    <Text style={s.statLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              <Text style={s.trust}>Trusted by 50,000+ modern households</Text>

              <TouchableOpacity style={s.heroCta} onPress={handleGetStarted} activeOpacity={0.9}>
                <Text style={s.heroCtaText}>Build My Smart Grocery Plan</Text>
                <Ionicons name="arrow-forward" size={16} color={WHITE} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>

            {/* ── WHY GROCERIES FEEL BROKEN ─────────────── */}
            <View style={s.section}>
              <TouchableOpacity
                style={s.collapseRow}
                onPress={() => setPainExpanded(v => !v)}
                activeOpacity={0.8}
              >
                <Text style={s.sectionTitle}>WHY GROCERIES FEEL SO BROKEN</Text>
                <Ionicons
                  name={painExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={18}
                  color={MUTED}
                />
              </TouchableOpacity>
              {painExpanded && PAIN_POINTS.map((pt, i) => (
                <View key={i} style={s.painRow}>
                  <View style={s.painDot} />
                  <Text style={s.painText}>{pt}</Text>
                </View>
              ))}
            </View>

            {/* ── BUILT FOR HOW YOU ACTUALLY LIVE ──────── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>BUILT FOR HOW YOU ACTUALLY LIVE</Text>
              {FEATURES.map((f, i) => (
                <View key={i} style={s.featureRow}>
                  <View style={s.featureIcon}>
                    <Ionicons name={f.icon} size={18} color={GREEN} />
                  </View>
                  <Text style={s.featureLabel}>{f.label}</Text>
                </View>
              ))}
            </View>

            {/* ── $2,028 ANNUAL SAVINGS ─────────────────── */}
            <LinearGradient colors={[GREEN, GREEN_DARK]} style={s.savingsCard}>
              <Text style={s.savingsOverline}>
                ANNUAL SAVINGS POTENTIAL{'\n'}WITH SNIPPD
              </Text>
              <Text style={s.savingsTotal}>$2,028</Text>
              <Text style={s.savingsSub}>potential savings per year, per household</Text>
              <View style={s.savingsDivider} />
              {SAVINGS_ROWS.map((row, i) => (
                <View key={i} style={s.savingsRow}>
                  <Text style={s.savingsItem}>{row.label}</Text>
                  <Text style={s.savingsAmt}>{row.amount}</Text>
                </View>
              ))}
            </LinearGradient>

            {/* ── COST OF DOING NOTHING ─────────────────── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>COST OF DOING NOTHING</Text>
              <Text style={s.sectionSub}>Without Snippd, this is what continues</Text>
              <View style={s.costRow}>
                {[
                  { num: '$2,028', label: '/year in grocery overspend' },
                  { num: '25+',    label: 'hrs/month of planning time wasted' },
                  { num: '4.8',    label: 'lbs/week food waste generated' },
                ].map(({ num, label }) => (
                  <View key={num} style={s.costCard}>
                    <Text style={s.costNum}>{num}</Text>
                    <Text style={s.costLabel}>{label}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.costCallout}>
                That is $2,028 per year and 25+ hours per month — handed back to you by Snippd.
              </Text>
            </View>

            {/* ── MONTHLY TIME RECOVERED ────────────────── */}
            <View style={[s.section, s.timeCard]}>
              <Text style={s.sectionTitle}>MONTHLY TIME RECOVERED</Text>
              <Text style={s.timeStat}>2.1 hrs</Text>
              <Text style={s.timeSub}>saved per month vs. manual grocery planning</Text>
            </View>

            {/* ── PERSONALIZED INSIGHTS ─────────────────── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>PERSONALIZED GROCERY INSIGHTS</Text>
              {[
                'Your household overspends by ~$39/week on wrong package sizes',
                'Right-sized protein bundles save 28% vs. family packs',
                'Snippd users reduce waste by 34% in the first 30 days',
              ].map((insight, i) => (
                <View key={i} style={s.insightRow}>
                  <Ionicons name="checkmark-circle" size={16} color={GREEN} style={{ marginTop: 2 }} />
                  <Text style={s.insightText}>{insight}</Text>
                </View>
              ))}
              <Text style={s.insightCta}>Snippd already figured this out for you.</Text>
              <Text style={s.insightSub}>Start in 2 minutes. No setup. No spreadsheets.</Text>
            </View>

            {/* ── AUTH CARD ─────────────────────────────── */}
            <View ref={authRef} style={s.authCard} collapsable={false}>

              {/* Tab row */}
              <View style={s.tabRow}>
                {[
                  { id: 'signup', label: 'Get Started' },
                  { id: 'signin', label: 'Sign In' },
                ].map(({ id, label }) => (
                  <TouchableOpacity
                    key={id}
                    style={[s.tabBtn, tab === id && s.tabActive]}
                    onPress={() => switchTab(id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.tabText, tab === id && s.tabTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── SIGN IN ── */}
              {tab === 'signin' && (
                <View>
                  <Text style={s.cardTitle}>Welcome back</Text>
                  <View style={s.inputGroup}>
                    <TextInput
                      style={s.input}
                      placeholder="Email address"
                      placeholderTextColor={MUTED}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                    />
                    <TextInput
                      style={s.input}
                      placeholder="Password"
                      placeholderTextColor={MUTED}
                      secureTextEntry
                      value={password}
                      onChangeText={setPassword}
                    />
                  </View>
                  {!!errorMsg && <Text style={s.error}>{errorMsg}</Text>}
                  <TouchableOpacity style={s.primaryBtn} onPress={handleAuth} activeOpacity={0.9}>
                    {loading
                      ? <ActivityIndicator color={WHITE} />
                      : <Text style={s.primaryBtnText}>Continue</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}

              {/* ── SIGN UP — STEP 0: HOUSEHOLD SIZE ── */}
              {tab === 'signup' && signupStep === 0 && (
                <View>
                  <Text style={s.cardTitle}>How many people do you shop for?</Text>
                  <Text style={s.cardSub}>Snippd right-sizes your grocery plan for your household.</Text>
                  <View style={s.choiceGrid}>
                    {HOUSEHOLD_SIZES.map(size => (
                      <TouchableOpacity
                        key={size}
                        style={[s.choiceBtn, householdSize === size && s.choiceActive]}
                        onPress={() => setHouseholdSize(size)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.choiceText, householdSize === size && s.choiceTextActive]}>
                          {size}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[s.primaryBtn, !householdSize && s.btnDisabled]}
                    onPress={() => householdSize && setSignupStep(1)}
                    activeOpacity={0.9}
                  >
                    <Text style={s.primaryBtnText}>Next</Text>
                  </TouchableOpacity>
                  <View style={s.stepDots}>
                    {[0, 1, 2].map(i => (
                      <View key={i} style={[s.dot, i === 0 && s.dotActive]} />
                    ))}
                  </View>
                </View>
              )}

              {/* ── SIGN UP — STEP 1: GROCERY GOAL ── */}
              {tab === 'signup' && signupStep === 1 && (
                <View>
                  <Text style={s.cardTitle}>What is your main grocery goal?</Text>
                  <Text style={s.cardSub}>Snippd optimizes differently for each goal.</Text>
                  <View style={s.choiceGrid}>
                    {GROCERY_GOALS.map(goal => (
                      <TouchableOpacity
                        key={goal}
                        style={[s.choiceBtn, groceryGoal === goal && s.choiceActive]}
                        onPress={() => setGroceryGoal(goal)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.choiceText, groceryGoal === goal && s.choiceTextActive]}>
                          {goal}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[s.primaryBtn, !groceryGoal && s.btnDisabled]}
                    onPress={() => groceryGoal && setSignupStep(2)}
                    activeOpacity={0.9}
                  >
                    <Text style={s.primaryBtnText}>Next</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSignupStep(0)} style={s.backBtn}>
                    <Text style={s.backText}>Back</Text>
                  </TouchableOpacity>
                  <View style={s.stepDots}>
                    {[0, 1, 2].map(i => (
                      <View key={i} style={[s.dot, i === 1 && s.dotActive]} />
                    ))}
                  </View>
                </View>
              )}

              {/* ── SIGN UP — STEP 2: EMAIL + PASSWORD ── */}
              {tab === 'signup' && signupStep === 2 && (
                <View>
                  <Text style={s.cardTitle}>Create your account</Text>
                  <Text style={s.cardSub}>
                    {householdSize} · {groceryGoal}
                  </Text>
                  <View style={s.inputGroup}>
                    <TextInput
                      style={s.input}
                      placeholder="Email address"
                      placeholderTextColor={MUTED}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                    />
                    <TextInput
                      style={s.input}
                      placeholder="Password"
                      placeholderTextColor={MUTED}
                      secureTextEntry
                      value={password}
                      onChangeText={setPassword}
                    />
                  </View>
                  {!!errorMsg && <Text style={s.error}>{errorMsg}</Text>}
                  <TouchableOpacity style={s.primaryBtn} onPress={handleAuth} activeOpacity={0.9}>
                    {loading
                      ? <ActivityIndicator color={WHITE} />
                      : <Text style={s.primaryBtnText}>Start Saving with Snippd</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSignupStep(1)} style={s.backBtn}>
                    <Text style={s.backText}>Back</Text>
                  </TouchableOpacity>
                  <View style={s.stepDots}>
                    {[0, 1, 2].map(i => (
                      <View key={i} style={[s.dot, i === 2 && s.dotActive]} />
                    ))}
                  </View>
                </View>
              )}

              <Text style={s.disclaimer}>256-bit encryption · No credit card required</Text>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  scroll: { paddingBottom: 60 },

  // ── Hero ──
  hero: {
    backgroundColor: WHITE,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  logo: {
    fontSize: 26,
    fontWeight: '900',
    color: NAVY,
    letterSpacing: -1,
    marginBottom: 20,
  },
  overline: {
    fontSize: 11,
    fontWeight: '800',
    color: GREEN,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  headline: {
    fontSize: 36,
    fontWeight: '800',
    color: NAVY,
    lineHeight: 44,
    letterSpacing: -1,
    marginBottom: 28,
  },

  // Stat cards
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 22,
    fontWeight: '900',
    color: NAVY,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: MUTED,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
  },

  trust: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
    marginBottom: 20,
  },
  heroCta: {
    backgroundColor: GREEN,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  heroCtaText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  // ── Sections ──
  section: {
    backgroundColor: WHITE,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  sectionSub: {
    fontSize: 13,
    color: MUTED,
    marginTop: -8,
    marginBottom: 16,
    fontWeight: '500',
  },

  // Collapsible pain points
  collapseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  painRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
  },
  painDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GREEN,
    marginTop: 7,
    flexShrink: 0,
  },
  painText: {
    fontSize: 14,
    color: NAVY,
    lineHeight: 22,
    flex: 1,
  },

  // Features
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F0FBF5',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: NAVY,
  },

  // Savings card
  savingsCard: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  savingsOverline: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  savingsTotal: {
    fontSize: 52,
    fontWeight: '900',
    color: WHITE,
    letterSpacing: -2,
    lineHeight: 58,
  },
  savingsSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 20,
  },
  savingsDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 16,
  },
  savingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  savingsItem: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  savingsAmt: {
    fontSize: 14,
    color: WHITE,
    fontWeight: '700',
  },

  // Cost of doing nothing
  costRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  costCard: {
    flex: 1,
    backgroundColor: '#FEF3F2',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
  },
  costNum: {
    fontSize: 18,
    fontWeight: '900',
    color: '#DC2626',
    letterSpacing: -0.5,
  },
  costLabel: {
    fontSize: 10,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
    fontWeight: '500',
  },
  costCallout: {
    fontSize: 13,
    color: NAVY,
    lineHeight: 20,
    fontWeight: '600',
    fontStyle: 'italic',
  },

  // Time recovered
  timeCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  timeStat: {
    fontSize: 48,
    fontWeight: '900',
    color: GREEN,
    letterSpacing: -2,
    marginVertical: 8,
  },
  timeSub: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Insights
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  insightText: {
    fontSize: 14,
    color: NAVY,
    lineHeight: 22,
    flex: 1,
    fontWeight: '500',
  },
  insightCta: {
    fontSize: 17,
    fontWeight: '800',
    color: NAVY,
    marginTop: 8,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  insightSub: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '500',
  },

  // ── Auth card ──
  authCard: {
    backgroundColor: CARD_BG,
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 24,
    elevation: 6,
    marginBottom: 8,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 28,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: WHITE,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: MUTED,
  },
  tabTextActive: {
    color: GREEN,
  },

  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: NAVY,
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  cardSub: {
    fontSize: 13,
    color: MUTED,
    fontWeight: '500',
    marginBottom: 20,
  },

  // Choice grid (onboarding questions)
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  choiceBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#F9FAFB',
  },
  choiceActive: {
    borderColor: GREEN,
    backgroundColor: '#F0FBF5',
  },
  choiceText: {
    fontSize: 14,
    fontWeight: '600',
    color: NAVY,
  },
  choiceTextActive: {
    color: GREEN,
  },

  // Inputs
  inputGroup: { gap: 14, marginBottom: 24 },
  input: {
    height: 52,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    borderWidth: 1,
    borderColor: BORDER,
    color: NAVY,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: GREEN,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },
  btnDisabled: { opacity: 0.4 },
  primaryBtnText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '900',
  },
  backBtn: { alignItems: 'center', marginTop: 14 },
  backText: { fontSize: 14, color: MUTED, fontWeight: '600' },

  // Step dots
  stepDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
  },
  dotActive: { backgroundColor: GREEN, width: 20 },

  error: {
    color: ERROR,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  disclaimer: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 11,
    color: MUTED,
    fontWeight: '500',
  },
});
