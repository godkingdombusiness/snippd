// components/AgentActivityLog.js
// Rotating idle agent status ticker — replaces empty space anywhere the agent
// is running in the background. Uses AGENT_MESSAGES.idle(location, vibe, size).
// Pulls user context from props or falls back to graceful defaults.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
} from 'react-native';
import { COLORS, TYPE, SPACE, RADIUS, DURATION, AGENT_MESSAGES } from '../src/design/tokens';

const TICK_INTERVAL = 3500; // ms between message swaps

/**
 * AgentActivityLog
 *
 * Props:
 *   location   — user's city/area string (from user_persona or device)
 *   vibe       — style_vibe from persona (e.g. 'streetwear', 'athleisure')
 *   size       — clothing_size from persona (e.g. 'M', 'L')
 *   status     — 'active' | 'idle' | 'scanning' (visual indicator dot color)
 *   variant    — 'navy' | 'canvas' — sets text color scheme
 *   style      — style override
 */
export default function AgentActivityLog({
  location = 'your area',
  vibe     = 'your style',
  size     = 'your size',
  status   = 'idle',
  variant  = 'navy',
  style,
}) {
  const messages      = AGENT_MESSAGES.idle(location, vibe, size);
  const [idx, setIdx] = useState(0);
  const fadeAnim      = useRef(new Animated.Value(1)).current;
  const dotAnim       = useRef(new Animated.Value(1)).current;

  // ── Message rotation ──────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0, duration: DURATION.normal, useNativeDriver: true,
      }).start(() => {
        setIdx(prev => (prev + 1) % messages.length);
        Animated.timing(fadeAnim, {
          toValue: 1, duration: DURATION.normal, useNativeDriver: true,
        }).start();
      });
    }, TICK_INTERVAL);

    return () => clearInterval(interval);
  }, [messages, fadeAnim]);

  // ── Status dot pulse ──────────────────────────────────────────
  useEffect(() => {
    if (status === 'scanning') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      dotAnim.setValue(1);
    }
  }, [status, dotAnim]);

  const onDark     = variant === 'navy';
  const labelColor = onDark ? COLORS.mint     : COLORS.navy;
  const msgColor   = onDark ? '#8FBFB0'       : COLORS.muted;
  const bgColor    = onDark ? COLORS.navyMid  : COLORS.canvasDim;
  const dotColor   = STATUS_DOT_COLOR[status] ?? COLORS.muted;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }, style]}>
      {/* Header row */}
      <View style={styles.header}>
        <Animated.View
          style={[styles.dot, { backgroundColor: dotColor, opacity: dotAnim }]}
        />
        <Text style={[TYPE.label, { color: labelColor }]}>AGENT STATUS</Text>
      </View>

      {/* Ticker */}
      <Animated.Text
        style={[styles.message, { color: msgColor, opacity: fadeAnim }]}
        numberOfLines={2}
      >
        {messages[idx]}
      </Animated.Text>
    </View>
  );
}

const STATUS_DOT_COLOR = {
  active:   COLORS.green,
  scanning: COLORS.amber,
  idle:     COLORS.muted,
};

const styles = StyleSheet.create({
  container: {
    borderRadius:    RADIUS.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACE.sm,
  },
  dot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  message: {
    fontSize:   13,
    fontWeight: '500',
    lineHeight: 18,
  },
});
