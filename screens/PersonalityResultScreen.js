/**
 * PersonalityResultScreen — Household Type reveal + viral shareable card.
 * Shown after completing the 9-step onboarding.
 * Routes to MainApp.
 */

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar, Share, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay,
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const GREEN      = '#0C9E54';
const GREEN_DARK = '#0A8040';
const DARK       = '#111827';
const WHITE      = '#FFFFFF';
const GRAY       = '#6B7280';
const MINT_BG    = '#F0FBF5';
const BORDER     = '#E5E7EB';

const hapticSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
const hapticMedium  = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

// Persona-specific insights and stats
const PERSONA_DATA = {
  'The GLP-1 Optimizer': {
    savings:  '$1,820/yr',
    waste:    '42% less',
    hours:    '2.4 hrs/mo',
    fit:      '97%',
    color:    '#7C3AED',
    insights: [
      'GLP-1 users need 40% more protein per dollar — Snippd adjusts your bundles automatically.',
      'Smaller portion packages save GLP-1 households an average of $35/week.',
      'Your plan avoids the top 5 trigger foods that stall GLP-1 progress.',
    ],
  },
  'The Busy Parent': {
    savings:  '$2,184/yr',
    waste:    '31% less',
    hours:    '2.8 hrs/mo',
    fit:      '91%',
    color:    '#F97316',
    insights: [
      'Sub-20-minute meal plans mean your kids eat well even on your busiest nights.',
      'Kid-approved deal filters remove 94% of ingredients they refuse to eat.',
      'Freezer-friendly bulk deals cut your mid-week grocery runs by 60%.',
    ],
  },
  'The Wellness Optimizer': {
    savings:  '$1,960/yr',
    waste:    '28% less',
    hours:    '2.1 hrs/mo',
    fit:      '94%',
    color:    '#3B82F6',
    insights: [
      'Low-sodium deals are auto-prioritized across all your preferred stores.',
      'Supplement stacking alerts fire when your targeted brands go on sale.',
      'Soft-texture meal recommendations adapt to any household mobility needs.',
    ],
  },
  'The Culinary Value Hunter': {
    savings:  '$2,340/yr',
    waste:    '26% less',
    hours:    '1.8 hrs/mo',
    fit:      '88%',
    color:    '#B58900',
    insights: [
      'Premium ingredient alerts fire before seasonal windows close.',
      'BOGO deals on specialty items are tracked across 5,000+ stores.',
      'Your weekly plan is built around what\'s worth cooking — not what\'s just cheap.',
    ],
  },
  'The Budget Master': {
    savings:  '$2,508/yr',
    waste:    '36% less',
    hours:    '2.6 hrs/mo',
    fit:      '96%',
    color:    '#059669',
    insights: [
      'Unit price comparison fires automatically — you always pay the lowest cost-per-ounce.',
      'Zero-waste meal plans mean you buy exactly what you will use, every week.',
      'Your budget ceiling is respected on every deal recommendation.',
    ],
  },
  'The Conscious Saver': {
    savings:  '$1,896/yr',
    waste:    '34% less',
    hours:    '2.2 hrs/mo',
    fit:      '93%',
    color:    '#16A34A',
    insights: [
      'Organic sale triggers fire when clean-label items hit your price floor.',
      'Plant-based BOGO radar covers 2,200+ SKUs across your preferred stores.',
      'Your health guardrails are respected in every deal recommendation.',
    ],
  },
  'The Selective Maximizer': {
    savings:  '$1,764/yr',
    waste:    '29% less',
    hours:    '1.9 hrs/mo',
    fit:      '89%',
    color:    '#8B5CF6',
    insights: [
      'Your never-again blocklist silently filters 100% of disliked items from every deal.',
      'Substitution intelligence finds equivalent products that match your taste profile.',
      'Tight preference filtering means every deal you see is one you will actually use.',
    ],
  },
  'The Efficiency Machine': {
    savings:  '$2,028/yr',
    waste:    '27% less',
    hours:    '2.1 hrs/mo',
    fit:      '92%',
    color:    '#0D1B4B',
    insights: [
      '15-minute meal plans are built every week around your cooking window.',
      'Delivery cost optimization fires when in-store and delivery costs cross over.',
      'Single-item BOGO stacking captures savings you\'d never find manually.',
    ],
  },
  'The Balanced Strategist': {
    savings:  '$2,028/yr',
    waste:    '27% less',
    hours:    '2.1 hrs/mo',
    fit:      '90%',
    color:    GREEN,
    insights: [
      'Full-stack deal stacking captures every coupon layer across every store.',
      'Cross-retailer arbitrage surfaces deals your single-store plan would miss.',
      'Wealth momentum tracking shows you exactly how your savings compound over time.',
    ],
  },
};

function getPersonaData(type) {
  return PERSONA_DATA[type] ?? PERSONA_DATA['The Balanced Strategist'];
}

export default function PersonalityResultScreen({ navigation, route }) {
  const persona = route?.params?.persona ?? {
    type:   'The Balanced Strategist',
    color:  GREEN,
    icon:   'analytics-outline',
    traits: ['Full-stack deal stacking', 'Cross-retailer arbitrage', 'Wealth momentum tracking'],
  };

  const data    = getPersonaData(persona.type);
  const color   = persona.color ?? data.color;
  const darkColor = color + 'CC';

  // Entrance animations
  const cardScale   = useSharedValue(0.8);
  const cardOpacity = useSharedValue(0);
  const statsY      = useSharedValue(30);
  const statsOpacity = useSharedValue(0);

  useEffect(() => {
    hapticSuccess();
    cardScale.value   = withSpring(1, { damping: 12, stiffness: 100 });
    cardOpacity.value = withTiming(1, { duration: 400 });
    statsY.value      = withDelay(300, withSpring(0, { damping: 15 }));
    statsOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
  }, []);

  const cardStyle  = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }], opacity: cardOpacity.value }));
  const statsStyle = useAnimatedStyle(() => ({ transform: [{ translateY: statsY.value }], opacity: statsOpacity.value }));

  const handleShare = async () => {
    hapticMedium();
    try {
      await Share.share({
        message: `I just built my Snippd intelligence profile — I'm ${persona.type}!\n\nSnippd estimates I could save ${data.savings} per year on groceries. Try it: snippd.app`,
        title: `I'm ${persona.type} on Snippd`,
      });
    } catch { /* share cancelled */ }
  };

  const handleContinue = () => {
    hapticMedium();
    navigation.replace('MainApp');
  };

  const STATS = [
    { label: 'Annual Savings', value: data.savings,  icon: 'cash-outline' },
    { label: 'Less Waste',     value: data.waste,    icon: 'leaf-outline' },
    { label: 'Time Saved',     value: data.hours,    icon: 'time-outline' },
    { label: 'Budget Fit',     value: data.fit,      icon: 'checkmark-circle-outline' },
  ];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[color, darkColor, '#0A0A0A']} style={s.gradBg}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

            {/* Header */}
            <View style={s.header}>
              <Text style={s.headerLabel}>YOUR SNIPPD PROFILE</Text>
            </View>

            {/* Main persona card */}
            <Animated.View style={[s.personaCard, cardStyle]}>
              <View style={[s.iconCircle, { backgroundColor: color + '22', borderColor: color + '44' }]}>
                <Ionicons name={persona.icon ?? 'analytics-outline'} size={48} color={color} />
              </View>
              <Text style={s.typeLabel}>YOU ARE</Text>
              <Text style={[s.typeName, { color }]}>{persona.type}</Text>
              <View style={s.traitList}>
                {persona.traits.map((trait, i) => (
                  <Animated.View key={i} entering={FadeIn.delay(300 + i * 120).duration(300)} style={s.traitRow}>
                    <View style={[s.traitDot, { backgroundColor: color }]} />
                    <Text style={s.traitText}>{trait}</Text>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>

            {/* Stats grid */}
            <Animated.View style={[s.statsGrid, statsStyle]}>
              {STATS.map((stat, i) => (
                <View key={i} style={s.statCard}>
                  <Ionicons name={stat.icon} size={20} color={color} style={{ marginBottom: 6 }} />
                  <Text style={[s.statValue, { color }]}>{stat.value}</Text>
                  <Text style={s.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </Animated.View>

            {/* Urgency card */}
            <Animated.View entering={FadeIn.delay(500).duration(400)} style={s.urgencyCard}>
              <Text style={s.urgencyTitle}>Cost of doing nothing</Text>
              <Text style={s.urgencyBody}>
                Without Snippd, households like yours continue spending{' '}
                <Text style={{ fontWeight: '800', color: '#EF4444' }}>{data.savings} more per year</Text>
                {' '}on groceries and losing{' '}
                <Text style={{ fontWeight: '800', color: '#EF4444' }}>{data.hours} per month</Text>
                {' '}to planning.
              </Text>
            </Animated.View>

            {/* Personalized insights */}
            <Animated.View entering={FadeIn.delay(600).duration(400)} style={s.insightsCard}>
              <Text style={s.insightsTitle}>HOW SNIPPD HELPS YOU SPECIFICALLY</Text>
              {data.insights.map((insight, i) => (
                <View key={i} style={s.insightRow}>
                  <Ionicons name="checkmark-circle" size={16} color={GREEN} style={{ marginTop: 2, flexShrink: 0 }} />
                  <Text style={s.insightText}>{insight}</Text>
                </View>
              ))}
            </Animated.View>

            {/* CTAs */}
            <Animated.View entering={FadeIn.delay(700).duration(400)} style={s.ctaSection}>
              <TouchableOpacity style={[s.primaryBtn, { backgroundColor: color }]} onPress={handleContinue} activeOpacity={0.9}>
                <Text style={s.primaryBtnText}>Go to My Dashboard</Text>
                <Ionicons name="arrow-forward" size={18} color={WHITE} />
              </TouchableOpacity>

              <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.85}>
                <Ionicons name="share-social-outline" size={18} color={WHITE} />
                <Text style={s.shareBtnText}>Share My Profile</Text>
              </TouchableOpacity>
            </Animated.View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1 },
  gradBg: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },

  header: { paddingTop: 16, paddingBottom: 8, alignItems: 'center' },
  headerLabel: {
    fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5,
  },

  // Persona card
  personaCard: {
    backgroundColor: WHITE,
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 12,
  },
  iconCircle: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, marginBottom: 16,
  },
  typeLabel: {
    fontSize: 11, fontWeight: '800', color: GRAY,
    letterSpacing: 2, marginBottom: 6,
  },
  typeName: {
    fontSize: 26, fontWeight: '900', letterSpacing: -0.5,
    textAlign: 'center', marginBottom: 8,
  },
  traitList:  { width: '100%', marginTop: 16, gap: 10 },
  traitRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  traitDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  traitText:  { fontSize: 14, color: DARK, fontWeight: '600', flex: 1 },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    width: '47.5%',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  statValue: {
    fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginBottom: 2,
  },
  statLabel: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)',
  },

  // Urgency
  urgencyCard: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  urgencyTitle: {
    fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase',
  },
  urgencyBody: {
    fontSize: 15, color: 'rgba(255,255,255,0.85)',
    lineHeight: 24, fontWeight: '500',
  },

  // Insights
  insightsCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  insightsTitle: {
    fontSize: 11, fontWeight: '800', color: GRAY,
    letterSpacing: 1.2, marginBottom: 16,
  },
  insightRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  insightText: { fontSize: 14, color: DARK, lineHeight: 22, flex: 1, fontWeight: '500' },

  // CTAs
  ctaSection: { gap: 12, marginBottom: 8 },
  primaryBtn: {
    borderRadius: 18, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
  },
  primaryBtnText: { color: WHITE, fontSize: 17, fontWeight: '900' },
  shareBtn: {
    borderRadius: 18, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
  },
  shareBtnText: { color: WHITE, fontSize: 16, fontWeight: '700' },
});
