// components/LoadingEngine.js
// Reusable 5-second "AI thinking" scan animation.
// Used in LogicScanScreen, and any future screen where the agent is reasoning.
// Self-contained: owns its own timers and cleanup. Calls onComplete when done.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
} from 'react-native';
import { COLORS, TYPE, SPACE, RADIUS, DURATION, AGENT_MESSAGES } from '../src/design/tokens';

const SCAN_DURATION = 5000; // ms — matches DURATION.scan token
const MESSAGE_INTERVAL = 1250; // ms per message rotation

/**
 * LoadingEngine
 *
 * Props:
 *   messages   — array of { icon, title, body } objects (defaults to AGENT_MESSAGES.scan)
 *   duration   — total scan duration in ms (default 5000)
 *   onComplete — called when duration elapses
 *   heading    — headline text above the orb (default "Connecting to the retail engine…")
 *   variant    — 'navy' | 'canvas' — background context
 */
export default function LoadingEngine({
  messages  = AGENT_MESSAGES.scan,
  duration  = SCAN_DURATION,
  onComplete,
  heading   = 'Connecting to the retail engine…',
  variant   = 'navy',
}) {
  const [msgIndex, setMsgIndex]         = useState(0);
  const progressAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim     = useRef(new Animated.Value(1)).current;
  const msgOpacity    = useRef(new Animated.Value(1)).current;
  const timerRef      = useRef(null);
  const intervalRef   = useRef(null);

  const onDark = variant === 'navy';

  // ── Pulse the orb ─────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.00, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  // ── Progress bar ───────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue:         1,
      duration,
      useNativeDriver: false, // width interpolation requires layout driver
    }).start();
  }, [progressAnim, duration]);

  // ── Message rotation ───────────────────────────────────────────
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      // Fade out
      Animated.timing(msgOpacity, {
        toValue: 0, duration: DURATION.normal, useNativeDriver: true,
      }).start(() => {
        setMsgIndex(prev => (prev + 1) % messages.length);
        // Fade in
        Animated.timing(msgOpacity, {
          toValue: 1, duration: DURATION.normal, useNativeDriver: true,
        }).start();
      });
    }, MESSAGE_INTERVAL);

    return () => clearInterval(intervalRef.current);
  }, [messages, msgOpacity]);

  // ── Completion ─────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onComplete?.();
    }, duration);
    return () => clearTimeout(timerRef.current);
  }, [duration, onComplete]);

  const msg       = messages[msgIndex] ?? messages[0];
  const barColor  = onDark ? COLORS.mint : COLORS.green;
  const trackColor = onDark ? 'rgba(197,255,188,0.15)' : COLORS.canvasDim;
  const textColor = onDark ? COLORS.mint : COLORS.navy;
  const subColor  = onDark ? '#8FBFB0' : COLORS.muted;

  const progressWidth = progressAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Orb */}
      <View style={styles.orbWrap}>
        <Animated.View
          style={[
            styles.orbOuter,
            { borderColor: barColor + '33', transform: [{ scale: pulseAnim }] },
          ]}
        >
          <View style={[styles.orbInner, { borderColor: barColor + '66' }]}>
            <View style={[styles.orbCore, { backgroundColor: barColor }]} />
          </View>
        </Animated.View>
      </View>

      {/* Heading */}
      <Text style={[styles.heading, { color: textColor }]}>{heading}</Text>

      {/* Rotating message */}
      <Animated.View style={[styles.msgCard, { opacity: msgOpacity }]}>
        <Text style={styles.msgIcon}>{msg.icon}</Text>
        <Text style={[styles.msgTitle, { color: textColor }]}>{msg.title}</Text>
        <Text style={[styles.msgBody, { color: subColor }]}>{msg.body}</Text>
      </Animated.View>

      {/* Progress bar */}
      <View style={[styles.trackWrap, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[styles.track, { width: progressWidth, backgroundColor: barColor }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: SPACE.xxl,
  },
  orbWrap: {
    marginBottom: SPACE.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbCore: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  heading: {
    ...TYPE.h2,
    textAlign: 'center',
    marginBottom: SPACE.xl,
  },
  msgCard: {
    alignItems: 'center',
    marginBottom: SPACE.xxl,
    paddingHorizontal: SPACE.lg,
    minHeight: 80,
  },
  msgIcon: {
    fontSize: 28,
    marginBottom: SPACE.sm,
  },
  msgTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: SPACE.xs,
    textAlign: 'center',
  },
  msgBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  trackWrap: {
    width: '100%',
    height: 6,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  track: {
    height: 6,
    borderRadius: RADIUS.pill,
  },
});
