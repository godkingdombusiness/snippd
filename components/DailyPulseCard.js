// components/DailyPulseCard.js
// One-tap daily refresh card. Shows a contextual action based on
// the user's stored persona (mission, leak_category, style_vibe).
//
// Usage:
//   <DailyPulseCard persona={persona} pulse={pulse} onTap={handleTap} />
//
// `pulse`  — a pulse object fetched from the backend or generated locally
// `onTap`  — callback with (pulse, action: 'yes' | 'dismiss')

import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

const { width: W } = Dimensions.get('window');

// ── Brand palette ─────────────────────────────────────────────
const MINT     = '#C5FFBC';
const MINT_BG  = '#EAF9E7';
const NAVY     = '#172250';
const GREEN    = '#0C9E54';
const CORAL    = '#FB5B5B';
const WHITE    = '#FFFFFF';
const MUTED    = '#7A9B89';
const BORDER   = '#D4EDCE';

// ── Pulse types & their config ────────────────────────────────
export const PULSE_TYPES = {
  stock_check:  { icon: '📦', color: GREEN,  ctaLabel: 'Grab It' },
  size_alert:   { icon: '👕', color: NAVY,   ctaLabel: 'Hold It' },
  goal_update:  { icon: '🎯', color: CORAL,  ctaLabel: 'Keep Going' },
  deal_flash:   { icon: '⚡', color: '#F59E0B', ctaLabel: 'See Deal' },
};

// ── generatePulse — creates a contextual pulse from persona ──
// Call this when you don't have a server-generated pulse.
// Pass persona from user_persona table.
export function generatePulse(persona, savingsToday = 0) {
  if (!persona) return null;

  const { mission, leak_category, style_vibe, monthly_budget_cents } = persona;

  if (savingsToday > 0) {
    const goal = { rent_killer: 'Rent', save_goal: 'Goal', find_deals: 'Streak' }[mission] ?? 'Goal';
    return {
      type:      'goal_update',
      headline:  `You saved $${(savingsToday / 100).toFixed(0)} today.`,
      body:      `That's $${(savingsToday / 100).toFixed(0)} closer to your ${goal}. Keep it going?`,
      cta_label: 'Keep Going',
    };
  }

  if (style_vibe === 'trend_forward') {
    return {
      type:      'size_alert',
      headline:  'A trending item is finally in your size.',
      body:      'The boots you liked are available now. Should I hold them for you?',
      cta_label: 'Hold It',
    };
  }

  if (leak_category) {
    const labels = { amazon: 'Amazon', food_apps: 'your food apps', clothing: 'clothing' };
    const label = labels[leak_category] ?? 'your top category';
    return {
      type:      'stock_check',
      headline:  'An item you buy often is cheaper today.',
      body:      `I found a lower price in ${label}. Want to grab it before it's gone?`,
      cta_label: 'Grab It',
    };
  }

  // Fallback
  return {
    type:      'deal_flash',
    headline:  'New price floor detected.',
    body:      `I found ${Math.floor(Math.random() * 5) + 3} items at their lowest price this week. Want to see them?`,
    cta_label: 'See Deals',
  };
}

// ── DailyPulseCard ────────────────────────────────────────────
export default function DailyPulseCard({ persona, pulse: pulseProp, onTap, style }) {
  const pulse = pulseProp ?? generatePulse(persona);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [pulse?.type]);

  if (!pulse) return null;

  const config  = PULSE_TYPES[pulse.type] ?? PULSE_TYPES.deal_flash;
  const ctaText = pulse.cta_label ?? config.ctaLabel;

  const handleYes     = () => onTap?.(pulse, 'yes');
  const handleDismiss = () => onTap?.(pulse, 'dismiss');

  return (
    <Animated.View
      style={[
        styles.card,
        style,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Type badge */}
      <View style={[styles.badge, { backgroundColor: config.color }]}>
        <Text style={styles.badgeEmoji}>{config.icon}</Text>
        <Text style={styles.badgeTxt}>{pulse.type.replace('_', ' ').toUpperCase()}</Text>
      </View>

      {/* Content */}
      <Text style={styles.headline}>{pulse.headline}</Text>
      <Text style={styles.body}>{pulse.body}</Text>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: config.color }]}
          onPress={handleYes}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaTxt}>{ctaText}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={handleDismiss}
          activeOpacity={0.7}
        >
          <Feather name="x" size={16} color={MUTED} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
    ...Platform.select({
      web: { boxShadow: '0px 3px 10px rgba(26,35,126,0.08)' },
      default: {
        shadowColor: NAVY,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 4,
      },
    }),
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  badgeEmoji: { fontSize: 13 },
  badgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: 0.8,
  },
  headline: {
    fontSize: 17,
    fontWeight: '800',
    color: NAVY,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 14,
    color: MUTED,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  ctaBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: 0.2,
  },
  dismissBtn: {
    width: 44, height: 44,
    borderRadius: 12,
    backgroundColor: MINT_BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
});
