// components/VictoryCard.js
// Icon-left | Bold Value center | Progress bar bottom layout.
// Used in Stacks / Wealth dashboard to surface savings wins at a glance.

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
} from 'react-native';
import { COLORS, TYPE, SPACE, RADIUS, SHADOW, DURATION } from '../src/design/tokens';
import GlobalCard from './GlobalCard';

/**
 * VictoryCard
 *
 * Props:
 *   icon         — emoji or string for left icon badge
 *   label        — small label above the value (e.g. "Potential Savings")
 *   value        — bold primary value (e.g. "$1,247")
 *   subLabel     — secondary line below value (e.g. "per year at current pace")
 *   progress     — 0–1 fill for bottom progress bar (optional)
 *   progressLabel — text next to progress bar (e.g. "62% to goal")
 *   accent       — bar color: 'green' | 'coral' | 'amber' | 'sky' (default 'green')
 *   variant      — GlobalCard variant: 'default' | 'navy' (default 'default')
 *   style        — style override
 *   animateIn    — fade+slide entrance (default true)
 */
export default function VictoryCard({
  icon,
  label,
  value,
  subLabel,
  progress,
  progressLabel,
  accent    = 'green',
  variant   = 'default',
  style,
  animateIn = true,
}) {
  const fadeAnim  = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(animateIn ? 12 : 0)).current;
  const barAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animateIn) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: DURATION.normal, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: DURATION.normal, useNativeDriver: true }),
      ]).start();
    }
    if (progress != null) {
      Animated.timing(barAnim, {
        toValue:         Math.min(Math.max(progress, 0), 1),
        duration:        DURATION.slow,
        delay:           100,
        useNativeDriver: false,
      }).start();
    }
  }, [progress, animateIn, fadeAnim, slideAnim, barAnim]);

  const onDark     = variant === 'navy';
  const labelColor = onDark ? '#8FBFB0' : COLORS.muted;
  const valueColor = onDark ? COLORS.mint : COLORS.navy;
  const subColor   = onDark ? '#8FBFB0' : COLORS.muted;
  const trackColor = onDark ? 'rgba(197,255,188,0.15)' : COLORS.canvasDim;
  const barColor   = ACCENT_COLORS[accent] ?? COLORS.green;

  const barWidth = barAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <GlobalCard variant={variant} style={[styles.card, style]}>
        <View style={styles.row}>
          {/* Icon badge */}
          {icon != null && (
            <View style={[styles.iconBadge, { backgroundColor: barColor + '22' }]}>
              <Text style={styles.iconText}>{icon}</Text>
            </View>
          )}

          {/* Text block */}
          <View style={styles.textBlock}>
            {label != null && (
              <Text style={[TYPE.label, { color: labelColor, marginBottom: SPACE.xs }]}>
                {label.toUpperCase()}
              </Text>
            )}
            <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
            {subLabel != null && (
              <Text style={[TYPE.caption, { color: subColor, marginTop: 2 }]}>{subLabel}</Text>
            )}
          </View>
        </View>

        {/* Progress bar */}
        {progress != null && (
          <View style={styles.progressSection}>
            <View style={[styles.trackWrap, { backgroundColor: trackColor }]}>
              <Animated.View
                style={[styles.track, { width: barWidth, backgroundColor: barColor }]}
              />
            </View>
            {progressLabel != null && (
              <Text style={[TYPE.caption, { color: labelColor, marginTop: SPACE.xs }]}>
                {progressLabel}
              </Text>
            )}
          </View>
        )}
      </GlobalCard>
    </Animated.View>
  );
}

const ACCENT_COLORS = {
  green: COLORS.green,
  coral: COLORS.coral,
  amber: COLORS.amber,
  sky:   COLORS.sky,
};

const styles = StyleSheet.create({
  card: {
    // GlobalCard handles padding + shadow
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACE.lg,
  },
  iconBadge: {
    width:          52,
    height:         52,
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  iconText: {
    fontSize: 24,
  },
  textBlock: {
    flex: 1,
  },
  value: {
    fontSize:      26,
    fontWeight:    '800',
    letterSpacing: -0.5,
    lineHeight:    30,
  },
  progressSection: {
    marginTop: SPACE.lg,
  },
  trackWrap: {
    height:       6,
    borderRadius: RADIUS.pill,
    overflow:     'hidden',
  },
  track: {
    height:       6,
    borderRadius: RADIUS.pill,
  },
});
