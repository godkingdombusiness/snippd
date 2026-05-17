// screens/TodaySetupGateScreen.js
// Animated profile-optimization engine. Reads saved profile, runs 0→100% ring
// animation, then auto-navigates to TodayOptionsRanked. No user inputs or buttons.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, StatusBar, Easing,
} from 'react-native';
import PropTypes from 'prop-types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const DARK_SLATE = '#1E293B';
const WHITE      = '#FFFFFF';
const GRAY_LIGHT = '#E5E7EB';
const GRAY_MID   = '#94A3B8';
const SLATE      = '#475569';
const MINT_PALE  = '#D1FAE5';
const SLATE_PALE = '#F1F5F9';

// ── Ring dimensions ───────────────────────────────────────────────────────────
const RING_SIZE   = 144;
const RING_HALF   = RING_SIZE / 2;
const RING_BORDER = 9;
const DONUT_SIZE  = RING_SIZE - RING_BORDER * 2 + 2;

// ── Animation ─────────────────────────────────────────────────────────────────
const ANIM_MS = 4400;

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildContext(profile) {
  const weekly   = Number(profile?.weekly_budget) || 150;
  const household = Number(profile?.household_size) || 2;
  return {
    weeklyBudgetCents:    Math.round(weekly * 100),
    remainingBudgetCents: Math.round(weekly * 100 * 0.6),
    householdSize:        household,
    peopleEatingToday:    household,
    groceryStatus:        profile?.grocery_status    ?? 'no',
    timeBeforeDinner:     profile?.time_before_dinner ?? '30_45',
    pantryPreference:     profile?.pantry_preference  ?? 'not_sure',
    todayGoal:            profile?.today_goal          ?? 'spend_least',
  };
}

function getRowStatuses(p) {
  if (p < 28)  return ['active', 'upcoming', 'upcoming', 'upcoming'];
  if (p < 54)  return ['done',   'active',   'upcoming', 'upcoming'];
  if (p < 78)  return ['done',   'done',     'active',   'upcoming'];
  if (p < 100) return ['done',   'done',     'done',     'active'];
  return           ['done',   'done',     'done',     'done'];
}

// ── Sub-components (module scope — no inner components) ───────────────────────

function RowIcon({ status }) {
  if (status === 'done') {
    return <Feather name="check-circle" size={22} color={GREEN} />;
  }
  if (status === 'active') {
    return (
      <View style={iconStyles.dotRing}>
        <View style={iconStyles.dotCore} />
      </View>
    );
  }
  return <View style={iconStyles.grayRing} />;
}
RowIcon.propTypes = { status: PropTypes.string.isRequired };

function StatusBadge({ status }) {
  if (status === 'done') {
    return (
      <View style={[badgeStyles.base, badgeStyles.done]}>
        <Text style={[badgeStyles.text, badgeStyles.doneText]}>Completed</Text>
      </View>
    );
  }
  if (status === 'active') {
    return (
      <View style={[badgeStyles.base, badgeStyles.active]}>
        <Text style={[badgeStyles.text, badgeStyles.activeText]}>In Progress</Text>
      </View>
    );
  }
  return (
    <View style={[badgeStyles.base, badgeStyles.upcoming]}>
      <Text style={[badgeStyles.text, badgeStyles.upcomingText]}>Upcoming</Text>
    </View>
  );
}
StatusBadge.propTypes = { status: PropTypes.string.isRequired };

function TimelineRow({ status, label, last }) {
  return (
    <View style={[rowStyles.row, last && rowStyles.rowLast]}>
      <RowIcon status={status} />
      <Text style={[rowStyles.label, status === 'upcoming' && rowStyles.labelDim]}>
        {label}
      </Text>
      <StatusBadge status={status} />
    </View>
  );
}
TimelineRow.propTypes = {
  status: PropTypes.string.isRequired,
  label:  PropTypes.string.isRequired,
  last:   PropTypes.bool,
};

// ── Main screen ───────────────────────────────────────────────────────────────
export default function TodaySetupGateScreen({ navigation }) {
  const animVal  = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);
  const [profile,  setProfile]  = useState(null);
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('preferred_stores, weekly_budget, household_size, grocery_status, time_before_dinner, pantry_preference, today_goal')
            .eq('user_id', user.id)
            .maybeSingle();
          setProfile(data);
        }
      } catch (_) {}
      setReady(true);
    })();
  }, []);

  const startAnim = useCallback(() => {
    const lid = animVal.addListener(({ value }) => {
      setProgress(Math.round(value * 100));
    });
    Animated.timing(animVal, {
      toValue: 1,
      duration: ANIM_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      animVal.removeListener(lid);
      if (finished) {
        tracker.track('today_setup_auto_loaded', {});
        setTimeout(() => {
          navigation.navigate('TodayOptionsRanked', {
            context: buildContext(profile),
          });
        }, 650);
      }
    });
  }, [animVal, navigation, profile]);

  useEffect(() => {
    if (ready) startAnim();
  }, [ready, startAnim]);

  // Ring arc interpolations — two-half-circle rotation technique
  const rightRotate = animVal.interpolate({
    inputRange:  [0, 0.5, 1],
    outputRange: ['-180deg', '0deg', '0deg'],
  });
  const leftRotate = animVal.interpolate({
    inputRange:  [0, 0.5, 1],
    outputRange: ['-180deg', '-180deg', '0deg'],
  });
  const barWidth = animVal.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Profile-derived display values
  const storeCount    = Array.isArray(profile?.preferred_stores)
    ? profile.preferred_stores.length : 3;
  const weeklyBudget  = Number(profile?.weekly_budget) || 150;
  const yearlySavings = Math.round(weeklyBudget * 52 * 0.15);
  const statuses      = getRowStatuses(progress);

  const ROWS = [
    `Analyzing target staples at your ${storeCount} watched stores...`,
    'Filtering out items on your custom avoid list...',
    `Compiling performance-macro stacks to fit your $${weeklyBudget} budget...`,
    `Locking in your initial $${yearlySavings}/year baseline targets...`,
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <View style={s.logoWrap}>
        <Text style={s.logoText}>snippd</Text>
      </View>

      {/* ── Circular Progress Ring ────────────────────────────────────────── */}
      <View style={s.ringWrap}>
        <View style={s.ringContainer}>
          {/* Gray background track */}
          <View style={s.ringTrack} />

          {/* Right half: sweeps 0→50% */}
          <View style={s.halfClipRight}>
            <Animated.View style={[s.halfCircle, s.halfCircleRight, { transform: [{ rotate: rightRotate }] }]} />
          </View>

          {/* Left half: sweeps 50→100% */}
          <View style={s.halfClipLeft}>
            <Animated.View style={[s.halfCircle, s.halfCircleLeft, { transform: [{ rotate: leftRotate }] }]} />
          </View>

          {/* White donut cover to create ring shape */}
          <View style={s.donutCover} />

          {/* Center icon */}
          <View style={s.ringCenter}>
            <FontAwesome5 name="leaf" size={36} color={GREEN} />
          </View>
        </View>
      </View>

      {/* ── Headline ──────────────────────────────────────────────────────── */}
      <Text style={s.headline}>Optimizing your profile... {progress}%</Text>

      {/* ── Progress Bar ──────────────────────────────────────────────────── */}
      <View style={s.barWrap}>
        <View style={s.barTrack}>
          <Animated.View style={[s.barFill, { width: barWidth }]} />
        </View>
      </View>

      {/* ── Timeline Rows ─────────────────────────────────────────────────── */}
      <View style={s.timeline}>
        {ROWS.map((label, i) => (
          <TimelineRow
            key={i}
            status={statuses[i]}
            label={label}
            last={i === ROWS.length - 1}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

TodaySetupGateScreen.propTypes = {
  navigation: PropTypes.shape({ navigate: PropTypes.func.isRequired }).isRequired,
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: WHITE },

  // Logo
  logoWrap: { alignItems: 'center', paddingTop: 28, paddingBottom: 4 },
  logoText: {
    fontSize: 28, fontWeight: '800', color: GREEN,
    letterSpacing: -0.6,
  },

  // Ring
  ringWrap:      { alignItems: 'center', marginTop: 36, marginBottom: 20 },
  ringContainer: {
    width: RING_SIZE, height: RING_SIZE,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  ringTrack: {
    position: 'absolute',
    width: RING_SIZE, height: RING_SIZE,
    borderRadius: RING_HALF,
    borderWidth: RING_BORDER,
    borderColor: GRAY_LIGHT,
  },
  halfClipRight: {
    position: 'absolute', right: 0,
    width: RING_HALF, height: RING_SIZE,
    overflow: 'hidden',
  },
  halfClipLeft: {
    position: 'absolute', left: 0,
    width: RING_HALF, height: RING_SIZE,
    overflow: 'hidden',
  },
  halfCircle: {
    position: 'absolute',
    width: RING_SIZE, height: RING_SIZE,
    borderRadius: RING_HALF,
    borderWidth: RING_BORDER,
    borderColor: GREEN,
  },
  halfCircleRight: { right: 0 },
  halfCircleLeft:  { left: 0 },
  donutCover: {
    position: 'absolute',
    width: DONUT_SIZE, height: DONUT_SIZE,
    borderRadius: DONUT_SIZE / 2,
    backgroundColor: WHITE,
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'center',
  },

  // Headline
  headline: {
    fontSize: 17, fontWeight: '700', color: DARK_SLATE,
    textAlign: 'center', letterSpacing: -0.2,
    marginHorizontal: 32, marginBottom: 14,
  },

  // Progress bar
  barWrap:  { marginHorizontal: 36, marginBottom: 32 },
  barTrack: {
    height: 6, borderRadius: 3,
    backgroundColor: GRAY_LIGHT, overflow: 'hidden',
  },
  barFill: {
    height: 6, borderRadius: 3,
    backgroundColor: GREEN,
  },

  // Timeline
  timeline: { paddingHorizontal: 24 },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 15, gap: 12,
    borderBottomWidth: 1, borderBottomColor: GRAY_LIGHT,
  },
  rowLast: { borderBottomWidth: 0 },
  label: {
    flex: 1, fontSize: 13, color: SLATE,
    lineHeight: 19,
  },
  labelDim: { color: GRAY_MID },
});

const iconStyles = StyleSheet.create({
  dotRing: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  dotCore: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: GREEN,
  },
  grayRing: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: GRAY_LIGHT,
    flexShrink: 0,
  },
});

const badgeStyles = StyleSheet.create({
  base: {
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    flexShrink: 0,
  },
  done:     { backgroundColor: MINT_PALE },
  active:   { borderWidth: 1, borderColor: GREEN, backgroundColor: WHITE },
  upcoming: { backgroundColor: SLATE_PALE },
  text:     { fontSize: 11, fontWeight: '600' },
  doneText:     { color: GREEN },
  activeText:   { color: GREEN },
  upcomingText: { color: GRAY_MID },
});
