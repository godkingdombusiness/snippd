/**
 * NextWeekBuilderScreen — Screen J.
 * Post-trip retention screen. Shows last-week recap then lets user pick
 * their planning mode for next week: Same plan | Refill items | New plan.
 * Lifetime savings read from Neo4j via get-dynamic-home-layout.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ── Brand ─────────────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const FOREST     = '#004D40';
const NAVY       = '#1A237E';
const WHITE      = '#FFFFFF';
const MINT       = '#F0FBF0';
const LIGHT_GRN  = '#DCFCE7';
const SLATE      = '#64748B';
const BORDER     = '#E2E8F0';
const AMBER      = '#F59E0B';
const AMBER_SOFT = '#FEF3C7';

const fmt = (n) => '$' + Math.abs(Number(n) || 0).toFixed(2);
const pct = (n) => Math.round(Number(n) || 0) + '%';

// ── Plan choice cards ─────────────────────────────────────────────────────────
const PLAN_CHOICES = [
  {
    key:   'same',
    icon:  'repeat',
    iconBg: LIGHT_GRN,
    iconColor: GREEN,
    title: 'Same plan again',
    sub:   'Keep everything the same — run the exact meals and stores from last week',
  },
  {
    key:   'refill',
    icon:  'refresh-cw',
    iconBg: '#EFF6FF',
    iconColor: '#1D4ED8',
    title: 'Refill items only',
    sub:   'Restock what you\'re low on without rebuilding the whole plan',
  },
  {
    key:   'new',
    icon:  'edit-3',
    iconBg: AMBER_SOFT,
    iconColor: '#92400E',
    title: 'Build a fresh plan',
    sub:   'Let Snippd create a brand new meal + savings plan for next week',
  },
];

// ── Progress ring (simple bar for RN compatibility) ───────────────────────────
function AccuracyRing({ percent }) {
  const color  = percent >= 85 ? GREEN : percent >= 70 ? AMBER : '#EF4444';
  const radius = 30;
  const size   = radius * 2 + 8;
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {/* Outer ring background */}
        <View style={[ringS.track, { width: size, height: size, borderRadius: size / 2 }]} />
        {/* Inner fill — approximated with inset border */}
        <View style={[
          ringS.fill,
          {
            width: size, height: size, borderRadius: size / 2,
            borderWidth: 5, borderColor: color,
            opacity: percent / 100,
          },
        ]} />
        <View style={ringS.center}>
          <Text style={[ringS.label, { color }]}>{pct(percent)}</Text>
        </View>
      </View>
      <Text style={ringS.sub}>plan accuracy</Text>
    </View>
  );
}
const ringS = StyleSheet.create({
  track:  { position: 'absolute', borderWidth: 5, borderColor: BORDER },
  fill:   { position: 'absolute' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  label:  { fontSize: 13, fontWeight: '900' },
  sub:    { fontSize: 10, color: SLATE, fontWeight: '600' },
});

// ── Choice Card ───────────────────────────────────────────────────────────────
function ChoiceCard({ choice, selected, onSelect }) {
  const isSel = selected === choice.key;
  return (
    <TouchableOpacity
      style={[s.choiceCard, isSel && s.choiceCardSelected]}
      onPress={() => onSelect(choice.key)}
      activeOpacity={0.82}
    >
      <View style={[s.choiceIcon, { backgroundColor: choice.iconBg }]}>
        <Feather name={choice.icon} size={22} color={choice.iconColor} />
      </View>
      <View style={s.choiceText}>
        <Text style={[s.choiceTitle, isSel && { color: FOREST }]}>{choice.title}</Text>
        <Text style={s.choiceSub}>{choice.sub}</Text>
      </View>
      <Feather
        name={isSel ? 'check-circle' : 'chevron-right'}
        size={20}
        color={isSel ? GREEN : SLATE}
      />
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function NextWeekBuilderScreen({ route, navigation }) {
  const {
    lastSavings    = 0,
    lastStore      = 'Your Store',
    savingsAction  = null,
    planAccuracy   = null,   // 0–100
  } = route?.params ?? {};

  const [selected,       setSelected]       = useState(null);
  const [lifetimeSavings,setLifetimeSavings] = useState(null);
  const [building,       setBuilding]        = useState(false);

  // Fetch lifetime savings from Neo4j graph via edge function
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-dynamic-home-layout`,
          {
            method:  'GET',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const json = await res.json();
        if (json?.lifetime_savings) setLifetimeSavings(json.lifetime_savings);
      } catch {}
    })();
  }, []);

  const handleContinue = async () => {
    if (!selected || building) return;
    setBuilding(true);
    try {
      if (selected === 'new') {
        navigation.replace('WeeklyPlan');
      } else if (selected === 'same') {
        navigation.replace('WeeklyPlan', { mode: 'same' });
      } else {
        navigation.replace('WeeklyPlan', { mode: 'refill' });
      }
    } catch {
      setBuilding(false);
    }
  };

  const accuracyPct = planAccuracy != null ? planAccuracy : 85;

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />

      <SafeAreaView edges={['top']} style={s.headerWrap}>
        <View style={s.navRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={20} color={NAVY} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Next Week</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Recap card ────────────────────────────────────────────── */}
        <View style={s.recapCard}>
          <Text style={s.recapEyebrow}>LAST WEEK RECAP</Text>
          <View style={s.recapRow}>
            <View style={s.recapStat}>
              <Text style={s.recapStatVal}>{fmt(lastSavings)}</Text>
              <Text style={s.recapStatLabel}>saved at {lastStore}</Text>
            </View>
            <AccuracyRing percent={accuracyPct} />
          </View>
          {savingsAction && (
            <View style={s.recapAction}>
              <Feather name="check-circle" size={13} color={GREEN} />
              <Text style={s.recapActionTxt}>
                You committed your savings to:{' '}
                <Text style={{ fontWeight: '800', color: FOREST }}>
                  {savingsAction === 'save_fund'  ? 'Emergency fund'
                    : savingsAction === 'pay_bill'  ? 'A bill'
                    : savingsAction === 'pay_debt'  ? 'Debt paydown'
                    : 'Donation'}
                </Text>
              </Text>
            </View>
          )}
          {lifetimeSavings != null && (
            <View style={s.lifetimeRow}>
              <Feather name="trending-up" size={14} color={GREEN} />
              <Text style={s.lifetimeTxt}>
                Lifetime savings with Snippd:{' '}
                <Text style={{ fontWeight: '900', color: GREEN }}>{fmt(lifetimeSavings)}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* ── Section label ────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>What do you need this week?</Text>
        <Text style={s.sectionSub}>Choose how you want to start your plan.</Text>

        {/* ── Choice cards ─────────────────────────────────────────── */}
        <View style={s.choiceList}>
          {PLAN_CHOICES.map(choice => (
            <ChoiceCard
              key={choice.key}
              choice={choice}
              selected={selected}
              onSelect={setSelected}
            />
          ))}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Footer CTA ───────────────────────────────────────────────── */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.ctaBtn, (!selected || building) && { opacity: 0.4 }]}
          onPress={handleContinue}
          disabled={!selected || building}
          activeOpacity={0.85}
        >
          {building ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <>
              <Text style={s.ctaBtnTxt}>Continue</Text>
              <Feather name="arrow-right" size={18} color={WHITE} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: MINT },

  headerWrap:  { backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  navRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: NAVY },

  scroll: { paddingHorizontal: 16, paddingTop: 20, gap: 0 },

  // Recap card
  recapCard:      { backgroundColor: WHITE, borderRadius: 16, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: BORDER },
  recapEyebrow:   { fontSize: 10, fontWeight: '800', color: SLATE, letterSpacing: 2, marginBottom: 12 },
  recapRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  recapStat:      { flex: 1 },
  recapStatVal:   { fontSize: 34, fontWeight: '900', color: GREEN },
  recapStatLabel: { fontSize: 12, color: SLATE, marginTop: 2 },
  recapAction:    { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: LIGHT_GRN, borderRadius: 10, padding: 10, marginBottom: 10 },
  recapActionTxt: { flex: 1, fontSize: 12, color: FOREST, lineHeight: 17 },
  lifetimeRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lifetimeTxt:    { fontSize: 13, color: NAVY },

  sectionLabel: { fontSize: 18, fontWeight: '900', color: NAVY, marginBottom: 4 },
  sectionSub:   { fontSize: 13, color: SLATE, marginBottom: 16, lineHeight: 18 },

  choiceList: { gap: 10 },

  choiceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: WHITE, borderRadius: 16,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  choiceCardSelected: { borderColor: GREEN, backgroundColor: '#F0FDF4' },
  choiceIcon:   { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  choiceText:   { flex: 1 },
  choiceTitle:  { fontSize: 15, fontWeight: '800', color: NAVY, marginBottom: 3, lineHeight: 20 },
  choiceSub:    { fontSize: 12, color: SLATE, lineHeight: 17 },

  // Footer
  footer:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: WHITE, borderTopWidth: 1, borderTopColor: BORDER, padding: 16, paddingBottom: 32 },
  ctaBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: FOREST, borderRadius: 16, paddingVertical: 18 },
  ctaBtnTxt: { fontSize: 17, fontWeight: '900', color: WHITE },
});
