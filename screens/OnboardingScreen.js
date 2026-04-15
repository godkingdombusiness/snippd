/**
 * OnboardingScreen — Premium 7-screen onboarding
 *
 * Steps:
 *   0  Hero          — animated brand moment
 *   1  Household     — who's at the table
 *   2  Dietary       — health guardrails
 *   3  Cooking Style — Tuesday vibe
 *   4  Never Again   — dislikes
 *   5  Persona       — AI shopper DNA reveal
 *   6  Paywall       — tier selection + consent
 *
 * Tech: react-native-reanimated, expo-haptics, expo-linear-gradient
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, StatusBar, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withSequence, withDelay,
  runOnJS, interpolate, Easing,
  FadeIn, FadeOut, SlideInRight, SlideOutLeft,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');

// ── Brand ─────────────────────────────────────────────────────
const GREEN    = '#0C9E54';
const DARK     = '#04361D';
const NAVY     = '#0D1B4B';
const WHITE    = '#FFFFFF';
const GRAY     = '#64748B';
const BORDER   = '#E2E8F0';
const MINT_BG  = '#F0FDF4';
const LIGHT_BG = '#F8FAFC';
const GOLD     = '#B58900';
const CORAL    = '#FF7043';

const TOTAL_STEPS = 7;

// ── Persona engine ────────────────────────────────────────────

function derivePersona(formData) {
  const { household_members, health_constraints, cooking_style, dislikes } = formData;

  const hasSenior  = household_members.includes('senior');
  const hasChild   = household_members.includes('child');
  const hasInfant  = household_members.includes('infant');
  const isHealth   = health_constraints.length >= 2;
  const isSurvival = cooking_style === 'Survival';
  const isChef     = cooking_style === 'Chef';

  if (hasInfant && isHealth)    return { type: 'Precision Nurturer',   emoji: '🌿', color: '#22C55E', traits: ['Ingredient-first thinking', 'Allergen-aware filtering', 'Clean label priority'] };
  if (hasSenior && isHealth)    return { type: 'Wellness Optimizer',   emoji: '💙', color: '#3B82F6', traits: ['Low-sodium deal alerts', 'Soft-texture recommendations', 'Supplement stacking'] };
  if (hasChild && isSurvival)   return { type: 'Speed Strategist',     emoji: '⚡', color: CORAL,     traits: ['Sub-20-min meal stacks', 'Kid-approved filters', 'Freezer-friendly bulk buys'] };
  if (isChef)                   return { type: 'Culinary Value Hunter', emoji: '👨‍🍳', color: GOLD,     traits: ['Premium ingredient alerts', 'BOGO on specialties', 'Seasonal produce timing'] };
  if (isSurvival && !hasChild)  return { type: 'Efficiency Machine',   emoji: '🎯', color: NAVY,      traits: ['15-min meal plans', 'Single-item BOGO stacking', 'Delivery cost optimizer'] };
  if (isHealth)                 return { type: 'Conscious Saver',      emoji: '🌱', color: '#16A34A', traits: ['Organic sale triggers', 'Plant-based BOGO radar', 'Unit price comparison'] };
  if (dislikes.length >= 3)     return { type: 'Selective Maximizer',  emoji: '🔍', color: '#8B5CF6', traits: ['Tight preference filtering', 'Never-again blocklist', 'Substitution intelligence'] };
  return                               { type: 'Balanced Strategist',   emoji: '⚖️', color: GREEN,     traits: ['Full-stack deal stacking', 'Cross-retailer arbitrage', 'Wealth momentum tracking'] };
}

// ── Haptic helpers ────────────────────────────────────────────

const hapticLight  = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
const hapticMedium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
const hapticHeavy  = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
const hapticSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

// ── Selectable pill with spring scale ─────────────────────────

function SelectPill({ label, selected, onPress, icon, size = 'small' }) {
  const scale = useSharedValue(1);
  const bgOpacity = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    bgOpacity.value = withTiming(selected ? 1 : 0, { duration: 180 });
  }, [selected]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.92, { damping: 8, stiffness: 300 }),
      withSpring(1.0,  { damping: 10, stiffness: 200 }),
    );
    hapticLight();
    onPress();
  };

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        style={[
          size === 'large' ? styles.bigPill : styles.smallPill,
          selected && styles.pillActive,
        ]}
      >
        {icon && (
          <MaterialCommunityIcons
            name={icon}
            size={size === 'large' ? 28 : 16}
            color={selected ? GREEN : DARK}
          />
        )}
        <Text style={[styles.pillTxt, selected && styles.pillTxtActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Progress bar ──────────────────────────────────────────────

function ProgressBar({ step }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring((step + 1) / TOTAL_STEPS, {
      damping: 20, stiffness: 120,
    });
  }, [step]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${interpolate(progress.value, [0, 1], [0, 100])}%`,
  }));

  return (
    <View style={styles.progressBg}>
      <Animated.View style={[styles.progressFill, barStyle]} />
    </View>
  );
}

// ── Step 0: Hero ──────────────────────────────────────────────

function HeroStep({ onNext }) {
  const logoScale   = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  const tagOpacity  = useSharedValue(0);
  const btnOpacity  = useSharedValue(0);
  const btnY        = useSharedValue(20);

  useEffect(() => {
    logoScale.value   = withDelay(100, withSpring(1, { damping: 12, stiffness: 100 }));
    logoOpacity.value = withDelay(100, withTiming(1, { duration: 400 }));
    tagOpacity.value  = withDelay(600, withTiming(1, { duration: 500 }));
    btnOpacity.value  = withDelay(1100, withTiming(1, { duration: 400 }));
    btnY.value        = withDelay(1100, withSpring(0, { damping: 15 }));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tagOpacity.value }));
  const btnStyle = useAnimatedStyle(() => ({
    opacity: btnOpacity.value,
    transform: [{ translateY: btnY.value }],
  }));

  return (
    <LinearGradient colors={['#04361D', '#0C9E54', '#1ED870']} style={styles.heroGrad}>
      <SafeAreaView style={styles.heroSafe}>
        <Animated.View style={[styles.heroLogo, logoStyle]}>
          <Text style={styles.heroSnippdText}>snippd</Text>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>AUTONOMOUS SHOPPING INTELLIGENCE</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.heroTaglines, tagStyle]}>
          <Text style={styles.heroTagline}>Stack every deal.</Text>
          <Text style={styles.heroTagline}>Miss nothing.</Text>
          <Text style={styles.heroTaglineSub}>Your AI concierge finds savings you didn't know existed — automatically.</Text>
        </Animated.View>

        <Animated.View style={[styles.heroFooter, btnStyle]}>
          <TouchableOpacity
            style={styles.heroBtn}
            onPress={() => { hapticHeavy(); onNext(); }}
            activeOpacity={0.88}
          >
            <Text style={styles.heroBtnTxt}>Build My Intelligence Profile</Text>
            <Feather name="arrow-right" size={20} color={DARK} />
          </TouchableOpacity>
          <Text style={styles.heroTime}>Takes 90 seconds</Text>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Step 1: Household ─────────────────────────────────────────

function HouseholdStep({ formData, setFormData }) {
  const toggle = (id) => {
    const current = formData.household_members;
    const next = current.includes(id) ? current.filter(i => i !== id) : [...current, id];
    if (next.length > current.length) hapticMedium();
    setFormData({ ...formData, household_members: next });
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepNumber}>01 / 05</Text>
      <Text style={styles.stepTitle}>Who are we{'\n'}planning for?</Text>
      <Text style={styles.stepSub}>Biological needs vary. We calibrate deals to your household.</Text>
      <View style={styles.bigPillGrid}>
        {[
          { id: 'infant', label: 'Infant',     icon: 'baby-bottle' },
          { id: 'child',  label: 'Child/Teen', icon: 'human-child' },
          { id: 'adult',  label: 'Adult',      icon: 'human-male-female' },
          { id: 'senior', label: 'Senior',     icon: 'human-cane' },
        ].map(t => (
          <SelectPill
            key={t.id}
            label={t.label}
            icon={t.icon}
            selected={formData.household_members.includes(t.id)}
            onPress={() => toggle(t.id)}
            size="large"
          />
        ))}
      </View>
    </View>
  );
}

// ── Step 2: Dietary ───────────────────────────────────────────

function DietaryStep({ formData, setFormData }) {
  const toggle = (goal) => {
    const current = formData.health_constraints;
    const next = current.includes(goal) ? current.filter(g => g !== goal) : [...current, goal];
    if (next.length > current.length) hapticMedium();
    setFormData({ ...formData, health_constraints: next });
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepNumber}>02 / 05</Text>
      <Text style={styles.stepTitle}>Any dietary{'\n'}guardrails?</Text>
      <Text style={styles.stepSub}>We'll automatically filter out deals that don't fit your needs.</Text>
      <View style={styles.pillWrap}>
        {['Gluten-Free', 'Low Sodium', 'Diabetic-Friendly', 'Dairy-Free', 'Keto', 'Plant-Based', 'Nut-Free', 'Halal'].map(goal => (
          <SelectPill
            key={goal}
            label={goal}
            selected={formData.health_constraints.includes(goal)}
            onPress={() => toggle(goal)}
          />
        ))}
      </View>
      {formData.health_constraints.length === 0 && (
        <Text style={styles.skipHint}>Skip if none apply — tap Continue</Text>
      )}
    </View>
  );
}

// ── Step 3: Cooking Style ─────────────────────────────────────

function CookingStep({ formData, setFormData }) {
  const OPTIONS = [
    { id: 'Chef',       label: 'Chef Mode',      sub: 'I enjoy the 45-min process.', icon: 'chef-hat' },
    { id: 'Efficiency', label: 'Efficiency',      sub: 'Keep it under 30 mins.',      icon: 'timer' },
    { id: 'Survival',   label: 'Survival Mode',   sub: '10-min prep or heat-and-eat.', icon: 'lightning-bolt' },
  ];

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepNumber}>03 / 05</Text>
      <Text style={styles.stepTitle}>Tuesday night{'\n'}vibe?</Text>
      <Text style={styles.stepSub}>This tunes your deal anchors around real cooking energy.</Text>
      <View style={{ gap: 14 }}>
        {OPTIONS.map(opt => {
          const selected = formData.cooking_style === opt.id;
          const scale = useSharedValue(1);

          const animStyle = useAnimatedStyle(() => ({
            transform: [{ scale: scale.value }],
          }));

          const handlePress = () => {
            scale.value = withSequence(
              withSpring(0.96, { damping: 6, stiffness: 300 }),
              withSpring(1.0,  { damping: 10 }),
            );
            hapticMedium();
            setFormData({ ...formData, cooking_style: opt.id });
          };

          return (
            <Animated.View key={opt.id} style={animStyle}>
              <TouchableOpacity
                style={[styles.listOption, selected && styles.listOptionActive]}
                onPress={handlePress}
                activeOpacity={1}
              >
                <View style={styles.listOptionLeft}>
                  <MaterialCommunityIcons
                    name={opt.icon}
                    size={22}
                    color={selected ? GREEN : GRAY}
                    style={{ marginRight: 14 }}
                  />
                  <View>
                    <Text style={[styles.listOptionTxt, selected && { color: GREEN }]}>{opt.label}</Text>
                    <Text style={styles.listOptionSub}>{opt.sub}</Text>
                  </View>
                </View>
                {selected && (
                  <Animated.View entering={FadeIn.duration(200)}>
                    <Feather name="check-circle" size={22} color={GREEN} />
                  </Animated.View>
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

// ── Step 4: Never Again ───────────────────────────────────────

function DislikeStep({ formData, setFormData }) {
  const toggle = (item) => {
    const current = formData.dislikes;
    const next = current.includes(item) ? current.filter(d => d !== item) : [...current, item];
    if (next.length > current.length) hapticLight();
    setFormData({ ...formData, dislikes: next });
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepNumber}>04 / 05</Text>
      <Text style={styles.stepTitle}>The "Never Again"{'\n'}List</Text>
      <Text style={styles.stepSub}>What should never make it into your cart?</Text>
      <View style={styles.pillWrap}>
        {['Mushrooms', 'Cilantro', 'Olives', 'Shellfish', 'Pork', 'Spicy Foods', 'Anchovies', 'Blue Cheese'].map(item => {
          const selected = formData.dislikes.includes(item);
          return (
            <TouchableOpacity
              key={item}
              style={[styles.smallPill, selected && styles.dislikePillActive]}
              onPress={() => toggle(item)}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillTxt, selected && styles.dislikePillTxt]}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {formData.dislikes.length === 0 && (
        <Text style={styles.skipHint}>No blocklist? Skip — tap Continue</Text>
      )}
    </View>
  );
}

// ── Step 5: Persona Generation ────────────────────────────────

function PersonaStep({ formData, onNext }) {
  const [phase, setPhase]       = useState('loading');   // loading | reveal
  const [traitIndex, setTraitIndex] = useState(0);
  const persona = derivePersona(formData);

  const ringScale    = useSharedValue(0);
  const ringOpacity  = useSharedValue(1);
  const cardScale    = useSharedValue(0.7);
  const cardOpacity  = useSharedValue(0);

  // Pulsing ring during loading
  useEffect(() => {
    ringScale.value = withSequence(
      withTiming(1.3, { duration: 700, easing: Easing.out(Easing.ease) }),
      withTiming(1.0, { duration: 400 }),
    );

    const timers = [
      setTimeout(() => setTraitIndex(1), 700),
      setTimeout(() => setTraitIndex(2), 1400),
      setTimeout(() => setTraitIndex(3), 2100),
      setTimeout(() => {
        hapticSuccess();
        setPhase('reveal');
        cardScale.value  = withSpring(1, { damping: 10, stiffness: 100 });
        cardOpacity.value = withTiming(1, { duration: 300 });
      }, 2800),
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  const LOADING_LINES = [
    'Reading household profile...',
    'Mapping dietary constraints...',
    'Calibrating deal radar...',
    'Generating Shopper DNA...',
  ];

  return (
    <View style={[styles.stepContent, { alignItems: 'center', justifyContent: 'center', flex: 1 }]}>
      {phase === 'loading' ? (
        <>
          <Animated.View style={[styles.personaRing, { borderColor: persona.color }, ringStyle]}>
            <Text style={{ fontSize: 48 }}>{persona.emoji}</Text>
          </Animated.View>
          <View style={{ marginTop: 32, gap: 12, alignItems: 'center' }}>
            {LOADING_LINES.slice(0, traitIndex + 1).map((line, i) => (
              <Animated.Text
                key={i}
                entering={FadeIn.duration(300)}
                style={[styles.loadingLine, i === traitIndex && styles.loadingLineActive]}
              >
                {i < traitIndex ? '✓ ' : '◉ '}{line}
              </Animated.Text>
            ))}
          </View>
        </>
      ) : (
        <Animated.View style={[styles.personaCard, { borderColor: persona.color }, cardStyle]}>
          <Text style={styles.personaDnaLabel}>YOUR SHOPPER DNA</Text>
          <Text style={{ fontSize: 52, marginVertical: 8 }}>{persona.emoji}</Text>
          <Text style={[styles.personaType, { color: persona.color }]}>{persona.type}</Text>
          <View style={styles.personaTraits}>
            {persona.traits.map((trait, i) => (
              <Animated.View
                key={i}
                entering={FadeIn.delay(i * 150).duration(300)}
                style={styles.personaTraitRow}
              >
                <View style={[styles.personaTraitDot, { backgroundColor: persona.color }]} />
                <Text style={styles.personaTraitText}>{trait}</Text>
              </Animated.View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.personaContinueBtn, { backgroundColor: persona.color }]}
            onPress={() => { hapticHeavy(); onNext(); }}
            activeOpacity={0.88}
          >
            <Text style={styles.personaContinueTxt}>Unlock Full Intelligence</Text>
            <Feather name="arrow-right" size={18} color={WHITE} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

// ── Step 6: Paywall ───────────────────────────────────────────

function PaywallStep({ formData, setFormData, navigation }) {
  const [consentChecked, setConsentChecked] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const persona = derivePersona(formData);

  const checkScale = useSharedValue(1);
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));

  const toggleConsent = () => {
    checkScale.value = withSequence(
      withSpring(1.3, { damping: 6 }),
      withSpring(1.0),
    );
    hapticLight();
    setConsentChecked(c => !c);
  };

  const handleFinish = async () => {
    if (!consentChecked || saving) return;
    hapticSuccess();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await supabase.from('profiles').update({
        onboarding_complete:    true,
        credits_balance:        20,
        household_members:      formData.household_members,
        preferences: {
          health_constraints: formData.health_constraints,
          cooking_style:      formData.cooking_style,
          dislikes:           formData.dislikes,
          persona_type:       persona.type,
        },
        consent_accepted:         true,
        consent_accepted_at:      new Date().toISOString(),
        privacy_policy_version:   '1.0',
      }).eq('user_id', user.id);
      navigation.navigate('MainApp');
    } catch {
      navigation.navigate('MainApp');
    }
  };

  return (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Choose your path</Text>
      <Text style={styles.stepSub}>Your {persona.type} profile is ready.</Text>

      {/* Free tier credit welcome */}
      <Animated.View
        entering={FadeIn.delay(100).duration(400)}
        style={styles.creditBanner}
      >
        <MaterialCommunityIcons name="wallet-giftcard" size={28} color={GREEN} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.creditBannerTitle}>+20 Free Credits</Text>
          <Text style={styles.creditBannerSub}>Added to your account on sign-in</Text>
        </View>
      </Animated.View>

      {/* Plus tier */}
      <Animated.View entering={FadeIn.delay(200).duration(400)}>
        <TouchableOpacity style={styles.tierCard} activeOpacity={0.88}>
          <View style={styles.tierHeader}>
            <Text style={styles.tierName}>PLUS MEMBER</Text>
            <Text style={styles.tierPrice}>$4.99<Text style={styles.tierPriceSub}>/mo</Text></Text>
          </View>
          <Text style={styles.tierDesc}>• 15 monthly credits{'\n'}• Deep personalization engine{'\n'}• Unlimited store sync</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Founder tier */}
      <Animated.View entering={FadeIn.delay(300).duration(400)}>
        <TouchableOpacity style={[styles.tierCard, styles.tierCardGold]} activeOpacity={0.88}>
          <View style={styles.tierHeader}>
            <Text style={[styles.tierName, { color: GOLD }]}>FOUNDER — LIFETIME</Text>
            <Text style={[styles.tierPrice, { color: GOLD }]}>$99</Text>
          </View>
          <Text style={styles.tierDesc}>• Unlimited everything, forever{'\n'}• No monthly fees{'\n'}• First 2,000 members only</Text>
          <View style={styles.scarcityTrack}>
            <View style={[styles.scarcityFill, { width: '85%' }]} />
          </View>
          <Text style={styles.scarcityTxt}>1,842 / 2,000 spots claimed</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Consent */}
      <TouchableOpacity style={styles.consentRow} onPress={toggleConsent} activeOpacity={1}>
        <Animated.View style={[styles.consentBox, consentChecked && styles.consentBoxOn, checkStyle]}>
          {consentChecked && <Feather name="check" size={12} color={WHITE} />}
        </Animated.View>
        <Text style={styles.consentTxt}>
          I agree to the{' '}
          <Text style={styles.consentLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
            Privacy Policy and Terms
          </Text>
        </Text>
      </TouchableOpacity>

      {/* CTA */}
      <TouchableOpacity
        style={[styles.ctaBtn, !consentChecked && styles.ctaBtnDisabled]}
        onPress={handleFinish}
        disabled={!consentChecked || saving}
        activeOpacity={0.88}
      >
        <Text style={[styles.ctaBtnTxt, !consentChecked && { opacity: 0.4 }]}>
          {saving ? 'Setting up your account…' : 'Start saving with my 20 credits'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function OnboardingScreen({ navigation, route }) {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    household_members:  [],
    health_constraints: [],
    cooking_style:      'Efficiency',
    dislikes:           [],
  });

  // Resume at a specific step when returning from NutritionProfileScreen
  useEffect(() => {
    if (route?.params?.resumeAtStep != null) {
      setStep(route.params.resumeAtStep);
    }
  }, [route?.params?.resumeAtStep]);

  // Slide transition values
  const translateX = useSharedValue(0);
  const opacity    = useSharedValue(1);

  const goNext = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) return;
    opacity.value = withTiming(0, { duration: 120 }, () => {
      runOnJS(setStep)(s => s + 1);
      translateX.value = width * 0.06;
      opacity.value = withTiming(1, { duration: 220 });
      translateX.value = withSpring(0, { damping: 18, stiffness: 200 });
    });
  }, [step]);

  const goBack = useCallback(() => {
    if (step === 0) return;
    hapticLight();
    opacity.value = withTiming(0, { duration: 100 }, () => {
      runOnJS(setStep)(s => s - 1);
      translateX.value = -(width * 0.06);
      opacity.value = withTiming(1, { duration: 200 });
      translateX.value = withSpring(0, { damping: 18, stiffness: 200 });
    });
  }, [step]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const showProgress = step >= 1 && step <= 4;
  const showBack     = step >= 1 && step <= 4;
  const showNext     = step >= 1 && step <= 4;
  const isLastQuestion = step === 4;

  // Hero screen has its own full-screen layout
  if (step === 0) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <HeroStep onNext={goNext} />
      </>
    );
  }

  // Persona step has its own full-screen layout
  if (step === 5) {
    return (
      <View style={{ flex: 1, backgroundColor: LIGHT_BG }}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={{ flex: 1 }}>
          <PersonaStep formData={formData} onNext={goNext} />
        </SafeAreaView>
      </View>
    );
  }

  // Paywall step
  if (step === 6) {
    return (
      <View style={{ flex: 1, backgroundColor: WHITE }}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Feather name="arrow-left" size={18} color={DARK} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
          </View>
          <Animated.View style={[{ flex: 1, paddingHorizontal: 24 }, contentStyle]}>
            <PaywallStep formData={formData} setFormData={setFormData} navigation={navigation} />
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  // Steps 1–4: question screens
  const stepComponents = {
    1: <HouseholdStep formData={formData} setFormData={setFormData} />,
    2: <DietaryStep   formData={formData} setFormData={setFormData} />,
    3: <CookingStep   formData={formData} setFormData={setFormData} />,
    4: <DislikeStep   formData={formData} setFormData={setFormData} />,
  };

  return (
    <View style={{ flex: 1, backgroundColor: WHITE }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          {showBack ? (
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Feather name="arrow-left" size={18} color={DARK} />
            </TouchableOpacity>
          ) : <View style={{ width: 36 }} />}
          {showProgress && <ProgressBar step={step - 1} />}
          <View style={{ width: 36 }} />
        </View>

        {/* Content */}
        <Animated.View style={[{ flex: 1, paddingHorizontal: 24 }, contentStyle]}>
          {stepComponents[step]}
        </Animated.View>

        {/* Footer CTA */}
        {showNext && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={() => {
                hapticHeavy();
                if (step === 2) {
                  navigation.navigate('NutritionProfile', { fromOnboarding: true });
                } else {
                  goNext();
                }
              }}
              activeOpacity={0.88}
            >
              <Text style={styles.nextBtnTxt}>
                {isLastQuestion ? 'Generate My Profile' : 'Continue'}
              </Text>
              <Feather name="arrow-right" size={20} color={WHITE} />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: LIGHT_BG, alignItems: 'center', justifyContent: 'center',
  },

  // Progress
  progressBg: {
    flex: 1, height: 5, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: GREEN, borderRadius: 3,
  },

  // Step content
  stepContent: { flex: 1, paddingTop: 8 },
  stepNumber:  { fontSize: 12, fontWeight: '700', color: GREEN, letterSpacing: 1, marginBottom: 10 },
  stepTitle: {
    fontSize: 34, fontWeight: '900', color: DARK,
    letterSpacing: -0.5, lineHeight: 40, marginBottom: 10,
  },
  stepSub: { fontSize: 15, color: GRAY, lineHeight: 22, marginBottom: 28 },

  // Pill grid
  bigPillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  bigPill: {
    width: (width - 62) / 2, paddingVertical: 22, paddingHorizontal: 16,
    borderRadius: 22, borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', gap: 10, backgroundColor: WHITE,
  },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  smallPill: {
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 30, borderWidth: 2, borderColor: BORDER,
    backgroundColor: WHITE,
  },
  pillActive: { borderColor: GREEN, backgroundColor: MINT_BG },
  pillTxt:    { fontSize: 14, fontWeight: '700', color: DARK },
  pillTxtActive: { color: GREEN },

  // Dislike pill
  dislikePillActive: { borderColor: CORAL, backgroundColor: '#FFF3EE' },
  dislikePillTxt:    { color: CORAL },

  skipHint: { marginTop: 20, fontSize: 13, color: GRAY, textAlign: 'center' },

  // List options (cooking style)
  listOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderRadius: 20, borderWidth: 2, borderColor: BORDER,
    backgroundColor: WHITE,
  },
  listOptionActive: { borderColor: GREEN, backgroundColor: MINT_BG },
  listOptionLeft:  { flexDirection: 'row', alignItems: 'center', flex: 1 },
  listOptionTxt:   { fontSize: 17, fontWeight: '800', color: DARK },
  listOptionSub:   { fontSize: 13, color: GRAY, marginTop: 2 },

  // Hero
  heroGrad:   { flex: 1 },
  heroSafe:   { flex: 1, justifyContent: 'space-between', paddingHorizontal: 30, paddingVertical: 20 },
  heroLogo:   { marginTop: 40, alignItems: 'flex-start' },
  heroSnippdText: { fontSize: 52, fontWeight: '900', color: WHITE, letterSpacing: -2 },
  heroBadge: {
    marginTop: 6, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6,
  },
  heroBadgeText: { fontSize: 9, fontWeight: '800', color: WHITE, letterSpacing: 1.5 },
  heroTaglines:  { flex: 1, justifyContent: 'center' },
  heroTagline:   { fontSize: 46, fontWeight: '900', color: WHITE, letterSpacing: -1, lineHeight: 50 },
  heroTaglineSub: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: 16, lineHeight: 24 },
  heroFooter:  { paddingBottom: 10 },
  heroBtn: {
    backgroundColor: WHITE, borderRadius: 20, paddingVertical: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  heroBtnTxt: { fontSize: 17, fontWeight: '900', color: DARK },
  heroTime:   { textAlign: 'center', marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  // Persona
  personaRing: {
    width: 140, height: 140, borderRadius: 70, borderWidth: 4,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: WHITE,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 20, elevation: 8,
  },
  loadingLine:       { fontSize: 14, color: GRAY, fontWeight: '500' },
  loadingLineActive: { color: DARK, fontWeight: '700' },
  personaCard: {
    width: width - 48, padding: 28, borderRadius: 28, borderWidth: 2,
    backgroundColor: WHITE, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1, shadowRadius: 24, elevation: 10,
  },
  personaDnaLabel: { fontSize: 11, fontWeight: '800', color: GRAY, letterSpacing: 2 },
  personaType: { fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  personaTraits:     { width: '100%', marginTop: 18, gap: 10 },
  personaTraitRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personaTraitDot:   { width: 8, height: 8, borderRadius: 4 },
  personaTraitText:  { fontSize: 14, color: DARK, fontWeight: '600', flex: 1 },
  personaContinueBtn: {
    marginTop: 24, width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 17, borderRadius: 18,
  },
  personaContinueTxt: { color: WHITE, fontSize: 16, fontWeight: '800' },

  // Paywall
  creditBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: MINT_BG, borderRadius: 18, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  creditBannerTitle: { fontSize: 16, fontWeight: '800', color: GREEN },
  creditBannerSub:   { fontSize: 12, color: GRAY, marginTop: 2 },
  tierCard: {
    padding: 22, borderRadius: 24, borderWidth: 2, borderColor: BORDER,
    marginBottom: 14, backgroundColor: WHITE,
  },
  tierCardGold: { borderColor: GOLD, backgroundColor: '#FFFDF0' },
  tierHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tierName:     { fontSize: 11, fontWeight: '900', color: GRAY, letterSpacing: 1.2 },
  tierPrice:    { fontSize: 26, fontWeight: '900', color: DARK },
  tierPriceSub: { fontSize: 14, fontWeight: '600', color: GRAY },
  tierDesc:     { fontSize: 14, color: GRAY, lineHeight: 22, fontWeight: '500' },
  scarcityTrack:{ height: 7, backgroundColor: BORDER, borderRadius: 4, marginTop: 14, overflow: 'hidden' },
  scarcityFill: { height: '100%', backgroundColor: GOLD, borderRadius: 4 },
  scarcityTxt:  { fontSize: 11, fontWeight: '800', color: GOLD, marginTop: 6, textAlign: 'center' },

  // Consent
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 20, gap: 12 },
  consentBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE, flexShrink: 0, marginTop: 1,
  },
  consentBoxOn: { backgroundColor: GREEN, borderColor: GREEN },
  consentTxt:  { flex: 1, fontSize: 14, color: GRAY, lineHeight: 20 },
  consentLink: { color: GREEN, fontWeight: '700', textDecorationLine: 'underline' },

  // CTA
  ctaBtn: {
    backgroundColor: DARK, borderRadius: 20, paddingVertical: 19,
    alignItems: 'center',
  },
  ctaBtnDisabled: { backgroundColor: BORDER },
  ctaBtnTxt: { color: WHITE, fontSize: 16, fontWeight: '800' },

  // Footer
  footer:   { paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 8 : 20, paddingTop: 12 },
  nextBtn:  {
    backgroundColor: DARK, borderRadius: 20, paddingVertical: 19,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  nextBtnTxt: { color: WHITE, fontSize: 17, fontWeight: '900' },
});
