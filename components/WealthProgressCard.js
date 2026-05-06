// components/WealthProgressCard.js
// Circular SVG progress ring toward mission goal (Rent-Killer / Stacker / Goal-Saver).
// Requires: expo install react-native-svg
// Shows: goal label, ring with % complete, Potential Annual Recovery, breakdown line.

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS, TYPE, SPACE, RADIUS, SHADOW, DURATION } from '../src/design/tokens';
import GlobalCard from './GlobalCard';

const RING_SIZE    = 120;  // outer diameter
const STROKE_WIDTH = 10;
const RADIUS_VAL   = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS_VAL;

const MISSION_LABELS = {
  rent_killer: 'Rent-Killer Goal',
  save_goal:   'Savings Goal',
  find_deals:  'Deal-Stacker Goal',
};

/**
 * WealthProgressCard
 *
 * Props:
 *   mission          — 'rent_killer' | 'save_goal' | 'find_deals'
 *   savedCents       — total savings captured so far (cents)
 *   targetCents      — goal amount from persona.monthly_budget_cents * rate (cents)
 *   annualRecoveryCents — Potential Annual Recovery value (cents)
 *   location         — user's location string (for sub-label)
 *   variant          — 'default' | 'navy'
 *   style            — style override
 */
export default function WealthProgressCard({
  mission             = 'rent_killer',
  savedCents          = 0,
  targetCents         = 0,
  annualRecoveryCents = 0,
  location            = 'your area',
  variant             = 'default',
  style,
}) {
  const AnimatedCircle = Animated.createAnimatedComponent(Circle);
  const progressAnim   = useRef(new Animated.Value(0)).current;

  const pct = targetCents > 0 ? Math.min(savedCents / targetCents, 1) : 0;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue:         pct,
      duration:        DURATION.slow,
      delay:           200,
      useNativeDriver: false,
    }).start();
  }, [pct, progressAnim]);

  const onDark      = variant === 'navy';
  const ringTrack   = onDark ? 'rgba(197,255,188,0.15)' : COLORS.canvasDim;
  const ringFill    = COLORS.green;
  const labelColor  = onDark ? '#8FBFB0' : COLORS.muted;
  const valueColor  = onDark ? COLORS.mint : COLORS.navy;

  const strokeDash = progressAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [
      `${0} ${CIRCUMFERENCE}`,
      `${CIRCUMFERENCE} ${CIRCUMFERENCE}`,
    ],
  });

  const savedDollars    = (savedCents / 100).toFixed(0);
  const targetDollars   = (targetCents / 100).toFixed(0);
  const annualDollars   = (annualRecoveryCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const pctDisplay      = Math.round(pct * 100);
  const missionLabel    = MISSION_LABELS[mission] ?? 'Savings Goal';

  return (
    <GlobalCard variant={variant} style={[styles.card, style]}>
      {/* Header */}
      <Text style={[TYPE.label, { color: labelColor, marginBottom: SPACE.lg }]}>
        {missionLabel.toUpperCase()}
      </Text>

      <View style={styles.body}>
        {/* Ring */}
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            {/* Track */}
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS_VAL}
              stroke={ringTrack}
              strokeWidth={STROKE_WIDTH}
              fill="none"
            />
            {/* Progress — animated via strokeDasharray */}
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS_VAL}
              stroke={ringFill}
              strokeWidth={STROKE_WIDTH}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={strokeDash}
              // Rotate so progress starts at 12 o'clock
              rotation="-90"
              originX={RING_SIZE / 2}
              originY={RING_SIZE / 2}
            />
          </Svg>
          {/* Center label */}
          <View style={styles.ringCenter}>
            <Text style={[styles.ringPct, { color: valueColor }]}>{pctDisplay}%</Text>
            <Text style={[TYPE.caption, { color: labelColor }]}>saved</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.stats}>
          <View style={styles.statRow}>
            <Text style={[TYPE.caption, { color: labelColor }]}>Saved</Text>
            <Text style={[styles.statVal, { color: valueColor }]}>${savedDollars}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={[TYPE.caption, { color: labelColor }]}>Target</Text>
            <Text style={[styles.statVal, { color: valueColor }]}>${targetDollars}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={[TYPE.label, { color: labelColor, marginBottom: SPACE.xs }]}>
            POTENTIAL ANNUAL RECOVERY
          </Text>
          <Text style={[styles.annualVal, { color: COLORS.green }]}>
            ${annualDollars}
          </Text>
          <Text style={[TYPE.caption, { color: labelColor }]}>
            at current pace in {location}
          </Text>
        </View>
      </View>
    </GlobalCard>
  );
}

const styles = StyleSheet.create({
  card: {},
  body: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACE.xl,
  },
  ringWrap: {
    width:          RING_SIZE,
    height:         RING_SIZE,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  ringCenter: {
    position:       'absolute',
    alignItems:     'center',
    justifyContent: 'center',
  },
  ringPct: {
    fontSize:   22,
    fontWeight: '800',
    lineHeight: 26,
  },
  stats: {
    flex: 1,
    gap:  SPACE.sm,
  },
  statRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  statVal: {
    fontSize:   15,
    fontWeight: '700',
  },
  divider: {
    height:          1,
    backgroundColor: COLORS.border,
    marginVertical:  SPACE.sm,
  },
  annualVal: {
    fontSize:   22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
