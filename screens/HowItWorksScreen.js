// screens/HowItWorksScreen.js
// Feature walkthrough — 4 cards explaining what Snippd does.
// Final screen before entering the app. Get Started → MainApp.

import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, ScrollView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const GREEN_SOFT = 'rgba(12,158,84,0.12)';
const MINT       = '#F0FBF0';
const NAVY       = '#172250';
const NAVY_DEEP  = '#0E1634';
const WHITE      = '#FFFFFF';
const SLATE      = '#64748B';
const MINT_POP   = '#C5FFBC';
const CORAL      = '#FF7043';

// ── Feature cards ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon:    'layers',
    color:   GREEN,
    bg:      GREEN_SOFT,
    title:   'Stacks Every Deal That Fits',
    body:    'I layer sale prices, loyalty discounts, manufacturer coupons, store credits, and rebates — all at once — so you never leave money on the table.',
    tag:     'Core Engine',
  },
  {
    icon:    'cpu',
    color:   '#7C3AED',
    bg:      'rgba(124,58,237,0.12)',
    title:   'Learns Your Household',
    body:    'The more you shop, the smarter I get. I remember what your household eats, which stores you prefer, and what deals you actually use.',
    tag:     'Adaptive AI',
  },
  {
    icon:    'dollar-sign',
    color:   '#0891B2',
    bg:      'rgba(8,145,178,0.12)',
    title:   'Budget-Built Weekly Plans',
    body:    'Every week I build a shopping plan fitted exactly to your budget — not a range, your actual number — with the optimal store routing to hit it.',
    tag:     'Smart Planning',
  },
  {
    icon:    'bell',
    color:   CORAL,
    bg:      'rgba(255,112,67,0.12)',
    title:   'Alerts Before Prices Change',
    body:    'I watch your anchor products across all your stores. When something you buy regularly drops to a deal price, you hear about it first.',
    tag:     'Price Watch',
  },
];

// ── What makes Snippd different ───────────────────────────────────────────────
const DIFFERENCES = [
  'Works before you shop, not while you\'re in the aisle',
  'Stacks multiple deal types simultaneously — no app does that',
  'Personalized to your household, not a generic list',
  'Budget-first — every stack respects your number',
];

// ─────────────────────────────────────────────────────────────────────────────
export default function HowItWorksScreen({ route, navigation }) {
  const personaName = route?.params?.persona ?? null;
  const [activeCard, setActiveCard] = useState(0);

  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(24)).current;
  const cardAnims  = useRef(FEATURES.map(() => new Animated.Value(0))).current;
  const ctaAnim    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      // Stagger feature cards
      Animated.stagger(100,
        cardAnims.map(anim =>
          Animated.spring(anim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true })
        )
      ).start(() => {
        Animated.timing(ctaAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={MINT} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={styles.heroBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.heroBadgeText}>Your concierge is ready</Text>
          </View>

          <Text style={styles.heroTitle}>
            {personaName
              ? `Here's what ${personaName.replace('The ', '')}\nlooks like in action`
              : "Here's how\nSnippd works"}
          </Text>

          <Text style={styles.heroSub}>
            Every feature is already tuned to your persona. This is what happens when you start your first shopping cycle.
          </Text>
        </Animated.View>

        {/* ── Feature cards ─────────────────────────────────────────────── */}
        <View style={styles.cardsWrap}>
          {FEATURES.map((f, i) => (
            <Animated.View
              key={f.title}
              style={{
                opacity: cardAnims[i],
                transform: [{ scale: cardAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
              }}
            >
              <TouchableOpacity
                style={[styles.featureCard, activeCard === i && styles.featureCardActive]}
                onPress={() => setActiveCard(activeCard === i ? -1 : i)}
                activeOpacity={0.88}
              >
                <View style={styles.featureCardTop}>
                  <View style={[styles.featureIconWrap, { backgroundColor: f.bg }]}>
                    <Feather name={f.icon} size={22} color={f.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.featureTagRow}>
                      <Text style={[styles.featureTag, { color: f.color }]}>{f.tag}</Text>
                    </View>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                  </View>
                  <Feather
                    name={activeCard === i ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={SLATE}
                  />
                </View>
                {activeCard === i && (
                  <Text style={styles.featureBody}>{f.body}</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>

        {/* ── What makes it different ────────────────────────────────────── */}
        <Animated.View style={[styles.diffCard, { opacity: ctaAnim }]}>
          <Text style={styles.diffTitle}>Why Snippd is different</Text>
          {DIFFERENCES.map((d, i) => (
            <View key={i} style={styles.diffRow}>
              <View style={styles.diffCheck}>
                <Feather name="check" size={12} color={GREEN} />
              </View>
              <Text style={styles.diffText}>{d}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── Expectation setter ─────────────────────────────────────────── */}
        <Animated.View style={[styles.expectCard, { opacity: ctaAnim }]}>
          <View style={styles.expectIconWrap}>
            <Feather name="clock" size={18} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.expectTitle}>What happens right after you tap "Get Started"</Text>
            <View style={styles.expectSteps}>
              {[
                'Your concierge activates and scans your stores',
                'Your first personalized savings stack is built',
                'Your weekly plan is sized to your $' + (route?.params?.weeklyBudget ? Math.round(route.params.weeklyBudget) : '—') + ' budget',
              ].map((s, i) => (
                <View key={i} style={styles.expectRow}>
                  <View style={styles.expectNum}>
                    <Text style={styles.expectNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.expectText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>

        {/* ── Get Started CTA ────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: ctaAnim }}>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => navigation.replace('MainApp')}
            activeOpacity={0.88}
          >
            <Feather name="zap" size={18} color={WHITE} />
            <Text style={styles.ctaBtnText}>Get Started</Text>
            <Feather name="arrow-right" size={18} color={WHITE} />
          </TouchableOpacity>
          <Text style={styles.ctaDisclaimer}>
            Free to use · No credit card needed · Upgrades available later
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MINT },

  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 48,
    maxWidth: 560,
    alignSelf: 'center',
    width: '100%',
    gap: 20,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: GREEN,
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: NAVY,
    lineHeight: 34,
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 14,
    color: SLATE,
    lineHeight: 22,
  },

  // ── Feature cards ─────────────────────────────────────────────────────────
  cardsWrap: { gap: 10 },
  featureCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 16,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
    }),
  },
  featureCardActive: {
    borderColor: GREEN,
    backgroundColor: '#FAFFFE',
  },
  featureCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureTagRow: { marginBottom: 2 },
  featureTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
    lineHeight: 20,
    flexWrap: 'wrap',
    paddingRight: 8,
  },
  featureBody: {
    fontSize: 14,
    color: SLATE,
    lineHeight: 22,
    marginTop: 12,
    paddingLeft: 58,
  },

  // ── Differences card ──────────────────────────────────────────────────────
  diffCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: GREEN,
    padding: 18,
    gap: 12,
  },
  diffTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: NAVY,
    marginBottom: 4,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  diffCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  diffText: {
    flex: 1,
    fontSize: 14,
    color: SLATE,
    lineHeight: 21,
  },

  // ── Expectation card ──────────────────────────────────────────────────────
  expectCard: {
    backgroundColor: NAVY_DEEP,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    gap: 14,
  },
  expectIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  expectTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: WHITE,
    marginBottom: 14,
    lineHeight: 19,
  },
  expectSteps: { gap: 10 },
  expectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  expectNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  expectNumText: {
    fontSize: 11,
    fontWeight: '800',
    color: WHITE,
  },
  expectText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },

  // ── CTA ───────────────────────────────────────────────────────────────────
  ctaBtn: {
    backgroundColor: GREEN,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    ...Platform.select({
      web: { boxShadow: '0 4px 20px rgba(12,158,84,0.40)' },
      default: { shadowColor: GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
    }),
  },
  ctaBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: WHITE,
    letterSpacing: 0.3,
  },
  ctaDisclaimer: {
    fontSize: 11,
    color: SLATE,
    textAlign: 'center',
    marginTop: 10,
  },
});
