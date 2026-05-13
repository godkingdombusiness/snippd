/**
 * SmartStartScreen — Post-login/post-onboarding concierge landing page.
 *
 * Receives `action` (NBA_ACTIONS key) and `firstName` from navigation params.
 * Highlights the most relevant option based on the user's current state.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getNextBestAction } from '../src/services/nextBestActionService';

const GREEN  = '#0C9E54';
const NAVY   = '#172250';
const CREAM  = '#FAF8F1';
const WHITE  = '#FFFFFF';
const GRAY   = '#6B7280';
const BORDER = '#E5E7EB';
const MINT   = '#E8F5E9';

// ── Stash bubble ─────────────────────────────────────────────────────────────
function StashBubble({ message }) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}>
        <Text style={styles.stashIconText}>✦</Text>
      </View>
      <Text style={styles.stashText}>{message}</Text>
    </View>
  );
}

// ── Option card ───────────────────────────────────────────────────────────────
function OptionCard({ icon, label, sublabel, highlighted, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.optionCard, highlighted && styles.optionCardHighlighted]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.optionIcon, highlighted && styles.optionIconHighlighted]}>
        <Feather name={icon} size={20} color={highlighted ? WHITE : GREEN} />
      </View>
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, highlighted && styles.optionLabelHighlighted]}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={[styles.optionSub, highlighted && styles.optionSubHighlighted]}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={18} color={highlighted ? 'rgba(255,255,255,0.7)' : BORDER} />
    </TouchableOpacity>
  );
}

// ── Action → highlighted option map ──────────────────────────────────────────
const ACTION_HIGHLIGHT = {
  START_WEEKLY_PLAN:            'build_plan',
  REVIEW_PLAN:                  'build_plan',
  CONTINUE_SHOPPING_OR_RECEIPT: 'receipt',
  COMPLETE_TRIP_FEEDBACK:       'receipt',
  VIEW_WEEKLY_INSIGHTS:         'browse',
  HOME_DASHBOARD:               null,
};

const ACTION_SUBLABELS = {
  REVIEW_PLAN:                  'Your plan is ready',
  CONTINUE_SHOPPING_OR_RECEIPT: 'Trip in progress',
  COMPLETE_TRIP_FEEDBACK:       'Quick 3-question check-in',
  VIEW_WEEKLY_INSIGHTS:         'See how this week went',
};

// ── Main component ────────────────────────────────────────────────────────────
export default function SmartStartScreen({ navigation, route }) {
  const paramAction = route?.params?.action;
  const [nbaAction, setNbaAction] = useState(paramAction ?? 'START_WEEKLY_PLAN');
  const [firstName, setFirstName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Resolve NBA action dynamically when not passed as param
          if (!paramAction) {
            const { action: resolved } = await getNextBestAction(user.id);
            setNbaAction(resolved);
          }
          // Get first name
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('user_id', user.id)
            .single();
          const name = profile?.full_name ?? user.email?.split('@')[0] ?? '';
          setFirstName(name.split(' ')[0]);
        }
      } catch { /* use empty fallback */ }
      setLoading(false);
    })();
  }, [paramAction]);

  const highlighted = ACTION_HIGHLIGHT[nbaAction];

  function goToMainApp() {
    navigation.reset({ index: 0, routes: [{ name: 'MainApp' }] });
  }

  const options = [
    {
      id: 'build_plan',
      icon: 'calendar',
      label: 'Build this week\'s grocery plan',
      sublabel: ACTION_SUBLABELS[nbaAction] && highlighted === 'build_plan'
        ? ACTION_SUBLABELS[nbaAction] : null,
      onPress: () => navigation.navigate('WeeklyPlanStarter', { action: nbaAction }),
    },
    {
      id: 'add_items',
      icon: 'plus-circle',
      label: 'Add items I already know I need',
      sublabel: null,
      onPress: () => navigation.navigate('AddNeeds', { action }),
    },
    {
      id: 'tonight',
      icon: 'moon',
      label: 'Figure out what\'s for tonight',
      sublabel: null,
      onPress: goToMainApp,
    },
    {
      id: 'receipt',
      icon: 'upload',
      label: 'Check a receipt',
      sublabel: ACTION_SUBLABELS[nbaAction] && highlighted === 'receipt'
        ? ACTION_SUBLABELS[nbaAction] : null,
      onPress: () => navigation.navigate('ReceiptPrompt', { action }),
    },
    {
      id: 'browse',
      icon: 'tag',
      label: 'Just browse savings',
      sublabel: null,
      onPress: goToMainApp,
    },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <ActivityIndicator color={GREEN} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headline}>
            Welcome back{firstName ? `, ${firstName}` : ''}.
          </Text>
          <Text style={styles.sub}>Let's make this week easier.</Text>
        </View>

        {/* Question */}
        <Text style={styles.question}>What do you want help with today?</Text>

        {/* Options */}
        <View style={styles.options}>
          {options.map(opt => (
            <OptionCard
              key={opt.id}
              icon={opt.icon}
              label={opt.label}
              sublabel={opt.sublabel}
              highlighted={opt.id === highlighted}
              onPress={opt.onPress}
            />
          ))}
        </View>

        {/* Stash */}
        <StashBubble
          message="I'll help you save more, stress less, and keep your food budget in view."
        />

        {/* Skip to dashboard */}
        <TouchableOpacity style={styles.skipBtn} onPress={goToMainApp}>
          <Text style={styles.skipText}>Go to dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CREAM },
  scroll: { padding: 24, paddingBottom: 40 },

  header: { marginBottom: 28, marginTop: 8 },
  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 32,
    color: NAVY,
    letterSpacing: -0.8,
    lineHeight: 38,
    marginBottom: 6,
  },
  sub: { fontSize: 16, color: GRAY, fontWeight: '300', lineHeight: 24 },

  question: {
    fontSize: 13,
    fontWeight: '700',
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  options: { gap: 10, marginBottom: 28 },

  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  optionCardHighlighted: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconHighlighted: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '600', color: NAVY },
  optionLabelHighlighted: { color: WHITE },
  optionSub: { fontSize: 12, color: GRAY, marginTop: 2 },
  optionSubHighlighted: { color: 'rgba(255,255,255,0.8)' },

  stash: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: MINT,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  stashIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stashIconText: { color: WHITE, fontSize: 14, fontWeight: '700' },
  stashText: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 21, fontWeight: '400' },

  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 13, color: GRAY, fontWeight: '500' },
});
