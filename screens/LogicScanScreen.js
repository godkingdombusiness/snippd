// screens/LogicScanScreen.js
// Three-phase sovereign initialization sequence:
//   Phase 1 — SCAN    (5s): terminal-style processing animation
//   Phase 2 — REVEAL  :     Intelligence Briefing data screen
//   Phase 3 — TERMINAL:     3s initialization sequence before navigation

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, StatusBar, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const { width: W } = Dimensions.get('window');

// ── Design tokens ─────────────────────────────────────────────
const BG         = '#050805';
const SURFACE    = '#101410';
const ACCENT     = '#0C9E54';
const ACCENT_DIM = 'rgba(12,158,84,0.10)';
const WHITE      = '#FFFFFF';
const SILVER     = '#A0A0A0';
const DIM        = '#2A2A2A';
const BORDER     = 'rgba(255,255,255,0.07)';

const SCAN_DURATION_MS = 5000;

// ── Scan messages — no emojis, terminal tone ──────────────────
const SCAN_MESSAGES = [
  {
    code:  'SYS_01',
    title: 'Price Floor Analysis',
    body:  'Scanning 5,000+ market nodes for lowest verified prices across your spending categories.',
  },
  {
    code:  'SYS_02',
    title: 'Budget Vector Mapping',
    body:  'Aligning monthly resource allocation with mission parameters and recovery targets.',
  },
  {
    code:  'SYS_03',
    title: 'Coupon Stack Validation',
    body:  'Cross-referencing active promo codes against retailer policy rules for maximum legal stacking.',
  },
  {
    code:  'SYS_04',
    title: 'Alert Layer Initialization',
    body:  'Configuring real-time price-drop triggers across all detected arbitrage windows.',
  },
];

// ── Terminal initialization lines ─────────────────────────────
const TERMINAL_LINES = [
  'Mapping Grocery Arbitrage...',
  'Syncing Vitality Node...',
  'Sovereign Bridge Active.',
];

const DIET_LABELS = {
  plant_based:     'Plant-Based',
  organic_only:    'Organic-Only',
  high_protein:    'High-Protein',
  gluten_free:     'Gluten-Free',
  no_restrictions: 'Unrestricted',
};

const fmt = (cents) => `$${Math.round(cents / 100).toLocaleString()}`;

// ── Main Screen ───────────────────────────────────────────────
export default function LogicScanScreen({ route, navigation }) {
  const { persona } = route.params ?? {};

  const [phase,    setPhase]    = useState('scan');   // 'scan' | 'reveal' | 'terminal'
  const [msgIdx,   setMsgIdx]   = useState(0);
  const [reveal,   setReveal]   = useState(null);
  const [termIdx,  setTermIdx]  = useState(0);        // terminal line index

  const barProgress  = useRef(new Animated.Value(0)).current;
  const msgFade      = useRef(new Animated.Value(1)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const revealFade   = useRef(new Animated.Value(0)).current;
  const revealSlide  = useRef(new Animated.Value(20)).current;
  const termFade     = useRef(new Animated.Value(0)).current;
  const cursorAnim   = useRef(new Animated.Value(1)).current;
  // One fade value per terminal line
  const lineFades    = useRef(TERMINAL_LINES.map(() => new Animated.Value(0))).current;

  // ── Cursor blink ─────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, [cursorAnim]);

  // ── Orb pulse ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'scan') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulseAnim]);

  // ── Progress bar ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'scan') return;
    Animated.timing(barProgress, {
      toValue:         W - 80,
      duration:        SCAN_DURATION_MS,
      useNativeDriver: false,
    }).start();
  }, [phase, barProgress]);

  // ── Message rotation ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'scan') return;
    const interval = SCAN_DURATION_MS / SCAN_MESSAGES.length;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      if (i >= SCAN_MESSAGES.length) { clearInterval(timer); return; }
      Animated.timing(msgFade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        setMsgIdx(i);
        Animated.timing(msgFade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
      });
    }, interval);
    return () => clearInterval(timer);
  }, [phase, msgFade]);

  // ── API call ─────────────────────────────────────────────────
  const callApi = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/initialize-agent`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(persona),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'API error');
      return data.reveal;
    } catch (err) {
      console.error('[LogicScan] initialize-agent failed:', err.message);
      // Graceful mock — UX never breaks
      const budget = persona?.monthly_budget_cents ?? 60000;
      return {
        initial_savings_cents: Math.round(budget * 0.15),
        leak_savings_cents:    Math.round(budget * 0.08),
        items_at_floor_price:  11,
        mission_label: {
          rent_killer: 'Rent-Killer',
          save_goal:   'Reserve Builder',
          find_deals:  'Deal Hunter',
        }[persona?.mission] ?? 'Autonomous Agent',
        leak_label: {
          amazon:    'E-Commerce',
          food_apps: 'Food & Delivery',
          clothing:  'Apparel',
        }[persona?.leak_category] ?? 'spending',
        _mock: true,
      };
    }
  }, [persona]);

  // ── Scan → Reveal transition ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'scan') return;
    const timer = setTimeout(async () => {
      const revealData = await callApi();
      setReveal(revealData);
      setPhase('reveal');
      Animated.parallel([
        Animated.timing(revealFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(revealSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }, SCAN_DURATION_MS);
    return () => clearTimeout(timer);
  }, [phase, callApi]);

  // ── Terminal sequence ─────────────────────────────────────────
  const startTerminal = useCallback(() => {
    setPhase('terminal');
    setTermIdx(0);
    Animated.timing(termFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    // Stagger each line in, then navigate after all are shown
    TERMINAL_LINES.forEach((_, i) => {
      const delay = 300 + i * 900;
      setTimeout(() => {
        Animated.timing(lineFades[i], {
          toValue: 1, duration: 400, useNativeDriver: true,
        }).start();
        setTermIdx(i + 1);
      }, delay);
    });

    // Navigate after all lines + hold
    const total = 300 + TERMINAL_LINES.length * 900 + 800;
    setTimeout(() => {
      navigation.replace('MainApp');
    }, total);
  }, [termFade, lineFades, navigation]);

  // ── Projected values for Intelligence Briefing ────────────────
  const budget          = persona?.monthly_budget_cents ?? 0;
  const annualRecovery  = Math.round(budget * 0.10 * 12);
  const savings         = reveal?.initial_savings_cents ?? 0;
  const leakSavings     = reveal?.leak_savings_cents    ?? 0;
  const floorItems      = reveal?.items_at_floor_price  ?? 0;
  const dietLabel       = DIET_LABELS[persona?.dietary_preference] ?? 'Unrestricted';
  const missionLabel    = reveal?.mission_label ?? 'Autonomous Agent';

  // ══════════════════════════════════════════════════════════════
  // PHASE: SCAN
  // ══════════════════════════════════════════════════════════════
  if (phase === 'scan') {
    const msg = SCAN_MESSAGES[msgIdx];
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={BG} />

        <View style={styles.scanWrap}>
          {/* System label */}
          <Text style={styles.sysLabel}>SNIPPD / AGENT_INIT</Text>

          {/* Orb */}
          <View style={styles.orbContainer}>
            <Animated.View style={[styles.orbOuter, { transform: [{ scale: pulseAnim }] }]} />
            <View style={styles.orbInner}>
              <View style={styles.orbCore} />
            </View>
          </View>

          <Text style={styles.scanHeading}>Initializing Your Agent</Text>
          <Text style={styles.scanSub}>Calibrating economic parameters…</Text>

          {/* Progress bar */}
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, { width: barProgress }]} />
          </View>

          {/* Rotating intel card */}
          <Animated.View style={[styles.msgCard, { opacity: msgFade }]}>
            <View style={styles.msgCodeRow}>
              <Text style={styles.msgCode}>{msg.code}</Text>
              <View style={styles.msgPulse} />
            </View>
            <Text style={styles.msgTitle}>{msg.title}</Text>
            <Text style={styles.msgBody}>{msg.body}</Text>
          </Animated.View>

          <Text style={styles.scanMuted}>Processing Economic DNA…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE: TERMINAL
  // ══════════════════════════════════════════════════════════════
  if (phase === 'terminal') {
    return (
      <View style={styles.terminalScreen}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <SafeAreaView style={styles.terminalSafe}>
          <Text style={styles.terminalPrompt}>$ snippd --init sovereign-layer</Text>
          <View style={styles.terminalLines}>
            {TERMINAL_LINES.map((line, i) => (
              <Animated.View key={i} style={{ opacity: lineFades[i] }}>
                <Text style={[
                  styles.terminalLine,
                  i === TERMINAL_LINES.length - 1 && styles.terminalLineFinal,
                ]}>
                  {`> ${line}`}
                </Text>
              </Animated.View>
            ))}
            {termIdx < TERMINAL_LINES.length && (
              <Animated.Text style={[styles.terminalLine, { opacity: cursorAnim }]}>
                {'> _'}
              </Animated.Text>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE: REVEAL — Intelligence Briefing
  // ══════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.revealScroll}
        showsVerticalScrollIndicator={false}
        // eslint-disable-next-line react-native/no-inline-styles
        contentContainerStyle={[
          styles.revealScroll,
          { opacity: revealFade, transform: [{ translateY: revealSlide }] },
        ]}
      >
        {/* Header */}
        <View style={styles.briefingHeader}>
          <Text style={styles.briefingEyebrow}>INTELLIGENCE BRIEFING</Text>
          <View style={styles.briefingStatusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.briefingStatus}>Agent Calibration Complete</Text>
          </View>
        </View>

        {/* PRIMARY METRIC — Annual Recovery */}
        <View style={styles.primaryMetric}>
          <Text style={styles.primaryLabel}>PROJECTED ANNUAL RECOVERY</Text>
          <Text style={styles.primaryValue}>{fmt(annualRecovery)}</Text>
          <Text style={styles.primarySub}>
            Based on {fmt(budget / 100 * 12)} annual spend at 10% recovery rate
          </Text>
        </View>

        {/* DATA GRID */}
        <View style={styles.dataGrid}>
          <View style={styles.dataCell}>
            <Text style={styles.dataCellLabel}>MARKET NODES SCANNED</Text>
            <Text style={styles.dataCellValue}>5,000+</Text>
            <Text style={styles.dataCellSub}>Retailers monitored</Text>
          </View>
          <View style={[styles.dataCell, styles.dataCellBorder]}>
            <Text style={styles.dataCellLabel}>FLOOR PRICE ITEMS</Text>
            <Text style={styles.dataCellValue}>{floorItems}</Text>
            <Text style={styles.dataCellSub}>At lowest price now</Text>
          </View>
        </View>

        <View style={styles.dataGrid}>
          <View style={styles.dataCell}>
            <Text style={styles.dataCellLabel}>MONTHLY RECOVERY</Text>
            <Text style={[styles.dataCellValue, { color: ACCENT }]}>{fmt(savings)}</Text>
            <Text style={styles.dataCellSub}>{missionLabel} mode</Text>
          </View>
          <View style={[styles.dataCell, styles.dataCellBorder]}>
            <Text style={styles.dataCellLabel}>LEAK RECOVERY</Text>
            <Text style={[styles.dataCellValue, { color: ACCENT }]}>{fmt(leakSavings)}</Text>
            <Text style={styles.dataCellSub}>Identified today</Text>
          </View>
        </View>

        {/* Vitality profile */}
        <View style={styles.vitalityCard}>
          <View style={styles.vitalityRow}>
            <Feather name="activity" size={14} color={ACCENT} />
            <Text style={styles.vitalityLabel}>VITALITY PROFILE</Text>
          </View>
          <Text style={styles.vitalityValue}>{dietLabel} Active</Text>
          <Text style={styles.vitalitySub}>
            All scans filtered for {dietLabel.toLowerCase()} compliance
          </Text>
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTxt}>
            Agent initialized for{' '}
            <Text style={{ color: ACCENT, fontWeight: '700' }}>{missionLabel}</Text>
            {'. Projected recovery of '}
            <Text style={{ color: ACCENT, fontWeight: '700' }}>{fmt(savings)}/mo</Text>
            {' — '}
            <Text style={{ color: ACCENT, fontWeight: '700' }}>{fmt(savings * 12)}</Text>
            {' this year. Autonomous layer standing by.'}
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity style={styles.ctaBtn} onPress={startTerminal} activeOpacity={0.85}>
          <Text style={styles.ctaTxt}>Access Intelligence Feed</Text>
          <Feather name="arrow-right" size={16} color={WHITE} style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        <Text style={styles.revealMuted}>
          Snippd / Agent v1.0 — Real-time sync active
        </Text>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },

  // ── SCAN phase ───────────────────────────────────────────────
  sysLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: ACCENT,
    marginBottom: 32,
  },
  scanWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 18,
  },
  orbContainer: {
    width: 100, height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  orbOuter: {
    position: 'absolute',
    width: 100, height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(12,158,84,0.25)',
  },
  orbInner: {
    position: 'absolute',
    width: 68, height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(12,158,84,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbCore: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: ACCENT,
  },
  scanHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: WHITE,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  scanSub: {
    fontSize: 14,
    color: SILVER,
    textAlign: 'center',
  },
  barTrack: {
    width: W - 80,
    height: 2,
    backgroundColor: SURFACE,
    overflow: 'hidden',
  },
  barFill: {
    height: 2,
    backgroundColor: ACCENT,
  },
  msgCard: {
    backgroundColor: SURFACE,
    borderRadius: 10,
    padding: 18,
    width: '100%',
    borderWidth: 1,
    borderColor: BORDER,
    gap: 6,
  },
  msgCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  msgCode: {
    fontSize: 10,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 1.5,
  },
  msgPulse: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  msgTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: 0.1,
  },
  msgBody: {
    fontSize: 13,
    color: SILVER,
    lineHeight: 19,
  },
  scanMuted: {
    fontSize: 11,
    color: DIM,
    letterSpacing: 1,
  },

  // ── TERMINAL phase ───────────────────────────────────────────
  terminalScreen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  terminalSafe: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 60,
    gap: 0,
  },
  terminalPrompt: {
    fontSize: 13,
    color: SILVER,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginBottom: 20,
  },
  terminalLines: {
    gap: 12,
  },
  terminalLine: {
    fontSize: 15,
    color: ACCENT,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  terminalLineFinal: {
    color: WHITE,
  },

  // ── REVEAL phase ─────────────────────────────────────────────
  revealScroll: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 48,
    gap: 12,
  },
  briefingHeader: {
    marginBottom: 8,
  },
  briefingEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  briefingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
  },
  briefingStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: WHITE,
  },

  // Primary metric
  primaryMetric: {
    backgroundColor: SURFACE,
    borderRadius: 10,
    padding: 24,
    borderWidth: 1,
    borderColor: ACCENT,
    gap: 4,
  },
  primaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 2,
    marginBottom: 4,
  },
  primaryValue: {
    fontSize: 48,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: -2,
    lineHeight: 52,
  },
  primarySub: {
    fontSize: 12,
    color: SILVER,
    marginTop: 4,
  },

  // Data grid
  dataGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  dataCell: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 4,
  },
  dataCellBorder: {
    // same as dataCell — no visual difference needed
  },
  dataCellLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: SILVER,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  dataCellValue: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  dataCellSub: {
    fontSize: 11,
    color: SILVER,
  },

  // Vitality
  vitalityCard: {
    backgroundColor: ACCENT_DIM,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: ACCENT,
    gap: 4,
  },
  vitalityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  vitalityLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 2,
  },
  vitalityValue: {
    fontSize: 18,
    fontWeight: '700',
    color: WHITE,
  },
  vitalitySub: {
    fontSize: 12,
    color: SILVER,
  },

  // Summary
  summaryCard: {
    backgroundColor: SURFACE,
    borderRadius: 10,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  summaryTxt: {
    fontSize: 15,
    color: SILVER,
    lineHeight: 24,
    fontWeight: '400',
  },

  // CTA
  ctaBtn: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  ctaTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: 0.2,
  },
  revealMuted: {
    fontSize: 11,
    color: DIM,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
