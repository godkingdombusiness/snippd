/**
 * SplashIntroScreen
 * Cold-visitor first impression — 3 swipeable value prop slides before sign-up.
 *
 * Shown once, on first launch (AsyncStorage key: @snippd_intro_seen).
 * After CTA: marks key seen, navigates to Auth.
 *
 * Brand: Mint canvas · Navy text · Green CTA · Coral accent
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';

const { width: W, height: H } = Dimensions.get('window');

// ── Design tokens ─────────────────────────────────────────────────────────────
const MINT     = '#F0FBF0';
const MINT_MID = '#D6F5D6';
const NAVY     = '#1A237E';
const GREEN    = '#2E7D32';
const GREEN_LT = '#E8F5E9';
const CORAL    = '#FF7043';
const WHITE    = '#FFFFFF';
const SLATE    = '#64748B';
const NAVY_DIM = '#3949AB';

const INTRO_SEEN_KEY = '@snippd_intro_seen';

// ── Slide definitions ─────────────────────────────────────────────────────────
const SLIDES = [
  {
    id: 'leak',
    icon: 'trending-down',
    iconColor: CORAL,
    iconBg: '#FFF3F0',
    kicker: 'The problem',
    headline: 'Your grocery\ncart is leaking\nmoney every week.',
    body: 'Brand traps. Convenience tax. Loyalty points you never use. The average family overpays by $312 a month and doesn\'t know it.',
    stat: '$3,744',
    statLabel: 'Average annual grocery overspend',
    statColor: CORAL,
  },
  {
    id: 'agent',
    icon: 'cpu',
    iconColor: GREEN,
    iconBg: GREEN_LT,
    kicker: 'The solution',
    headline: 'Your personal\nAI shopping agent\nstops the bleeding.',
    body: 'Snippd scans your receipts, learns your household, and builds a precision plan that cuts waste — automatically, every week.',
    stat: '18–40%',
    statLabel: 'Typical savings rate for Snippd households',
    statColor: GREEN,
  },
  {
    id: 'community',
    icon: 'users',
    iconColor: NAVY_DIM,
    iconBg: '#EEF0FB',
    kicker: 'The movement',
    headline: 'Thousands of\nfamilies are locking\nin their savings.',
    body: 'From clipping sessions to receipt-verified wins — Snippd turns grocery shopping from a chore into a power move.',
    stat: '$2.1M+',
    statLabel: 'Recovered by Snippd households this year',
    statColor: NAVY_DIM,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function SplashIntroScreen({ navigation }) {
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const isLast = activeIndex === SLIDES.length - 1;

  // ── Slide content — defined outside render to avoid inner-component remount ──
  function SlideContent({ slide, index }) {
    return (
      <View style={[styles.slide, { width: W }]}>
        {/* Icon orb */}
        <View style={[styles.iconOrb, { backgroundColor: slide.iconBg }]}>
          <Feather name={slide.icon} size={40} color={slide.iconColor} />
        </View>

        {/* Kicker */}
        <Text style={styles.kicker}>{slide.kicker.toUpperCase()}</Text>

        {/* Headline */}
        <Text style={styles.headline}>{slide.headline}</Text>

        {/* Body */}
        <Text style={styles.body}>{slide.body}</Text>

        {/* Stat card */}
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: slide.statColor }]}>
            {slide.stat}
          </Text>
          <Text style={styles.statLabel}>{slide.statLabel}</Text>
        </View>
      </View>
    );
  }

  function handleScroll(e) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / W);
    if (idx !== activeIndex) setActiveIndex(idx);
  }

  function goNext() {
    if (isLast) {
      handleGetStarted();
      return;
    }
    const next = activeIndex + 1;
    scrollRef.current?.scrollTo({ x: next * W, animated: true });
    setActiveIndex(next);
  }

  function handleSkip() {
    handleGetStarted();
  }

  async function handleGetStarted() {
    try {
      await AsyncStorage.setItem(INTRO_SEEN_KEY, 'true');
    } catch (_) {}
    navigation.replace('Auth');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={MINT} />

      {/* Skip — top right (hidden on last slide) */}
      {!isLast && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.skipTxt}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slide reel */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.reel}
        contentContainerStyle={{ alignItems: 'flex-start' }}
      >
        {SLIDES.map((slide, index) => SlideContent({ slide, index }))}
      </ScrollView>

      {/* Bottom bar — dots + CTA */}
      <View style={styles.bottomBar}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* CTA button */}
        <TouchableOpacity
          style={[styles.ctaBtn, isLast && styles.ctaBtnFinal]}
          onPress={goNext}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaTxt}>
            {isLast ? 'Get Started' : 'Next'}
          </Text>
          <Feather
            name={isLast ? 'arrow-right' : 'chevron-right'}
            size={18}
            color={WHITE}
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>

        {/* Already have account — only on last slide */}
        {isLast && (
          <TouchableOpacity onPress={handleGetStarted} style={styles.signInRow}>
            <Text style={styles.signInTxt}>
              Already have an account?{' '}
              <Text style={styles.signInLink}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: MINT,
  },
  skipBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    right: 24,
    zIndex: 10,
  },
  skipTxt: {
    fontSize: 14,
    color: SLATE,
    fontWeight: '500',
  },
  reel: {
    flex: 1,
  },
  // ── Individual slide ────────────────────────────────────────────────────────
  slide: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: H * 0.08,
    paddingBottom: 24,
  },
  iconOrb: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 2.5,
    color: SLATE,
    fontWeight: '700',
    marginBottom: 12,
  },
  headline: {
    fontSize: 34,
    fontWeight: '800',
    color: NAVY,
    lineHeight: 42,
    marginBottom: 20,
  },
  body: {
    fontSize: 16,
    color: SLATE,
    lineHeight: 26,
    marginBottom: 32,
  },
  statCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statValue: {
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: SLATE,
    lineHeight: 18,
  },
  // ── Bottom bar ──────────────────────────────────────────────────────────────
  bottomBar: {
    paddingHorizontal: 28,
    paddingBottom: Platform.OS === 'ios' ? 8 : 20,
    paddingTop: 16,
    backgroundColor: MINT,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 24,
    backgroundColor: GREEN,
  },
  dotInactive: {
    width: 6,
    backgroundColor: MINT_MID,
  },
  ctaBtn: {
    width: '100%',
    height: 54,
    backgroundColor: GREEN,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaBtnFinal: {
    backgroundColor: GREEN,
  },
  ctaTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
  },
  signInRow: {
    marginTop: 16,
    paddingBottom: 4,
  },
  signInTxt: {
    fontSize: 14,
    color: SLATE,
  },
  signInLink: {
    color: GREEN,
    fontWeight: '700',
  },
});
