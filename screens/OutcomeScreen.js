/**
 * OutcomeScreen — Post-receipt savings comparison + 3-question survey.
 *
 * route.params shape:
 * {
 *   outcome: {
 *     outcome_id, weekly_plan_id, store,
 *     planned_total, actual_total, baseline_without_snippd_total,
 *     planned_savings, actual_savings, plan_accuracy_percent,
 *     budget_target, budget_result, was_under_budget,
 *     matched_items_count, missing_items_count,
 *     coupons_expected, coupons_confirmed, meals_covered,
 *     baseline_is_estimated,
 *     bonus_savings?
 *   }
 * }
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { recordMemoryEvent } from '../src/lib/memoryEvents';

// ── Brand ─────────────────────────────────────────────────────────────────────
const GREEN   = '#0C9E54';
const FOREST  = '#04361D';
const NAVY    = '#1A237E';
const WHITE   = '#FFFFFF';
const MINT    = '#F0FBF0';
const LIGHT_GRN = '#DCFCE7';
const SLATE   = '#64748B';
const BORDER  = '#E2E8F0';
const AMBER   = '#F59E0B';
const CORAL   = '#FF7043';
const BLUE_BG = '#EFF6FF';
const BLUE    = '#1D4ED8';

const fmt = (n) => '$' + Math.abs(Number(n) || 0).toFixed(2);
const pct = (n) => Math.round(Number(n) || 0) + '%';

// ── Survey config ─────────────────────────────────────────────────────────────
const Q1_OPTIONS = [
  { key: 'yes',       label: 'Yes',       icon: 'check-circle', color: GREEN  },
  { key: 'somewhat',  label: 'A little',  icon: 'meh',          color: AMBER  },
  { key: 'not_really',label: 'Not really',icon: 'x-circle',     color: CORAL  },
];
const Q2_OPTIONS = [
  { key: 'yes',       label: 'Yes',       icon: 'check-circle', color: GREEN  },
  { key: 'mostly',    label: 'Mostly',    icon: 'meh',          color: AMBER  },
  { key: 'no',        label: 'No',        icon: 'x-circle',     color: CORAL  },
];
const Q3_OPTIONS = [
  { key: 'yes',       label: 'Yes',       icon: 'thumbs-up',    color: GREEN  },
  { key: 'maybe',     label: 'Maybe',     icon: 'meh',          color: AMBER  },
  { key: 'no',        label: 'No',        icon: 'thumbs-down',  color: CORAL  },
];
const IMPROVEMENT_OPTIONS = [
  'Cheaper options',
  'Better substitutions',
  'More meals',
  'Better store accuracy',
  'Simpler plan',
  'Better coupons',
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function OutcomeScreen({ route, navigation }) {
  const outcome = route?.params?.outcome ?? {};
  const {
    outcome_id,
    weekly_plan_id,
    store              = 'Your Store',
    planned_total      = 0,
    actual_total       = 0,
    baseline_without_snippd_total = 0,
    planned_savings    = 0,
    actual_savings     = 0,
    plan_accuracy_percent = 100,
    budget_target      = 150,
    budget_result      = 0,
    was_under_budget   = false,
    matched_items_count   = 0,
    missing_items_count   = 0,
    coupons_expected   = 0,
    coupons_confirmed  = 0,
    meals_covered      = 0,
    baseline_is_estimated = false,
    bonus_savings      = null,
  } = outcome;

  const [q1, setQ1] = useState(null);
  const [q2, setQ2] = useState(null);
  const [q3, setQ3] = useState(null);
  const [improvement, setImprovement] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasBonusSavings = bonus_savings &&
    ((bonus_savings.total_bonus_available ?? 0) > 0 ||
     (bonus_savings.total_bonus_claimed ?? 0) > 0);

  const handleSaveSurvey = async () => {
    if (!q1 || !q2 || !q3) {
      Alert.alert('Almost done', 'Please answer all 3 questions.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Save survey to trip_feedback table
      await supabase.from('trip_feedback').insert({
        user_id:                user.id,
        store,
        planned_total:          planned_total,
        actual_total:           actual_total,
        was_under_budget,
        actual_savings,
        saved_money_response:   q1,
        store_accuracy_response:q2,
        reuse_intent:           q3,
        improvement_area:       improvement,
      });

      // Fire memory events (non-blocking)
      recordMemoryEvent({
        event_type:      'survey_completed',
        trip_id:         outcome_id,
        survey_response: {
          saved_money:    q1,
          matched_store:  q2,
          use_again:      q3,
          improvement_area: improvement,
        },
        metadata: {
          store,
          plan_accuracy_percent,
          was_under_budget,
          outcome_id,
          weekly_plan_id,
        },
      });

      recordMemoryEvent({
        event_type: 'receipt_confirmed',
        trip_id:    outcome_id,
        savings:    Math.round(actual_savings * 100),
        metadata: {
          store,
          planned_total,
          actual_total,
          baseline_without_snippd_total,
          budget_target,
          budget_result,
          plan_accuracy_percent,
          coupons_expected,
          coupons_confirmed,
          over_budget: !was_under_budget,
          bonus_savings: bonus_savings ?? null,
        },
      });

      setSaved(true);
    } catch (e) {
      console.warn('[OutcomeScreen] survey save failed:', e.message);
      Alert.alert('Save failed', 'Could not save your feedback. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const accuracyColor = plan_accuracy_percent >= 85
    ? GREEN : plan_accuracy_percent >= 70 ? AMBER : CORAL;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.navRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
              <Feather name="arrow-left" size={20} color={WHITE} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>TRIP OUTCOME</Text>
              <Text style={s.headerTitle} numberOfLines={1}>{store}</Text>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Headline banner ───────────────────────────────────────── */}
        <View style={[s.banner, was_under_budget ? s.bannerGreen : s.bannerAmber]}>
          <Text style={[s.bannerIcon]}>
            {was_under_budget ? '✓' : '👍'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerTitle, { color: was_under_budget ? FOREST : '#92400E' }]}>
              {was_under_budget ? 'Under budget!' : 'Good effort!'}
            </Text>
            <Text style={[s.bannerSub, { color: was_under_budget ? GREEN : '#B45309' }]}>
              {was_under_budget
                ? `You stayed ${fmt(Math.abs(budget_result))} under your ${fmt(budget_target)} budget`
                : `You went ${fmt(Math.abs(budget_result))} over your ${fmt(budget_target)} budget`}
            </Text>
          </View>
        </View>

        {/* ── 2. Plain-English summary ─────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>WHAT HAPPENED</Text>
          {planned_total > 0 && (
            <SummaryLine
              text={`You planned to spend ${fmt(planned_total)}.`}
              icon="calendar"
            />
          )}
          <SummaryLine
            text={`You actually spent ${fmt(actual_total)}.`}
            icon="shopping-cart"
          />
          {baseline_without_snippd_total > 0 && (
            <SummaryLine
              text={`Without Snippd you would have spent about ${fmt(baseline_without_snippd_total)}${baseline_is_estimated ? ' (estimated)' : ''}.`}
              icon="trending-up"
            />
          )}
          {actual_savings > 0 && (
            <SummaryLine
              text={`You saved ${fmt(actual_savings)} compared to shopping without Snippd.`}
              icon="tag"
              highlight
            />
          )}
          {plan_accuracy_percent > 0 && planned_total > 0 && (
            <SummaryLine
              text={`Your plan was ${pct(plan_accuracy_percent)} accurate.`}
              icon="target"
            />
          )}
          {meals_covered > 0 && (
            <SummaryLine
              text={`You covered ${meals_covered} of 7 planned days.`}
              icon="check-square"
            />
          )}
        </View>

        {/* ── 3. Savings breakdown ─────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>SNIPPD SAVINGS</Text>
          <View style={s.metricsGrid}>
            <MetricBox label="PLANNED SAVINGS" value={fmt(planned_savings)} color={NAVY} />
            <MetricBox label="ACTUAL SAVINGS"  value={fmt(actual_savings)}  color={GREEN} />
          </View>
          {baseline_is_estimated && (
            <Text style={s.estimateNote}>
              * "Without Snippd" baseline is estimated — will refine as you shop more.
            </Text>
          )}
        </View>

        {/* ── 4. Plan accuracy ─────────────────────────────────────────── */}
        {planned_total > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>PLAN ACCURACY</Text>
            <View style={s.accuracyRow}>
              <Text style={[s.accuracyPct, { color: accuracyColor }]}>
                {pct(plan_accuracy_percent)}
              </Text>
              <View style={s.accuracyBar}>
                <View style={[s.accuracyFill, {
                  width: `${plan_accuracy_percent}%`,
                  backgroundColor: accuracyColor,
                }]} />
              </View>
            </View>
            <Text style={s.accuracySub}>
              Planned {fmt(planned_total)} · Actual {fmt(actual_total)}
            </Text>
          </View>
        )}

        {/* ── 5. Coupons ───────────────────────────────────────────────── */}
        {coupons_expected > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>COUPONS</Text>
            <View style={s.metricsGrid}>
              <MetricBox label="EXPECTED"  value={String(coupons_expected)}  color={SLATE} />
              <MetricBox label="CONFIRMED" value={String(coupons_confirmed)} color={GREEN} />
            </View>
          </View>
        )}

        {/* ── 6. Bonus savings (Fetch / Ibotta — only if data present) ─── */}
        {hasBonusSavings && (
          <View style={[s.card, s.bonusCard]}>
            <Text style={[s.cardTitle, { color: BLUE }]}>BONUS SAVINGS</Text>
            {bonus_savings.fetch_available > 0 && (
              <BonusRow label="Fetch available" value={fmt(bonus_savings.fetch_available)} />
            )}
            {bonus_savings.ibotta_available > 0 && (
              <BonusRow label="Ibotta available" value={fmt(bonus_savings.ibotta_available)} />
            )}
            {bonus_savings.total_bonus_claimed > 0 && (
              <BonusRow label="Claimed cashback" value={fmt(bonus_savings.total_bonus_claimed)} positive />
            )}
            {bonus_savings.missed_bonus_savings > 0 && (
              <Text style={s.missedBonus}>
                {fmt(bonus_savings.missed_bonus_savings)} in bonus savings available — clip before next trip.
              </Text>
            )}
          </View>
        )}

        {/* ── 7. What Snippd learned ───────────────────────────────────── */}
        <View style={[s.card, s.learnCard]}>
          <Text style={[s.cardTitle, { color: FOREST }]}>WHAT SNIPPD LEARNED</Text>
          {LearnLines({ was_under_budget, plan_accuracy_percent, missing_items_count, coupons_confirmed, coupons_expected, q3 })}
        </View>

        {/* ── 8. 3-Question survey ─────────────────────────────────────── */}
        {!saved ? (
          <View style={s.surveyCard}>
            <Text style={s.surveyHeading}>Quick check-in</Text>
            <Text style={s.surveyIntro}>Takes 10 seconds. Helps Snippd improve your next plan.</Text>

            <SurveyQuestion
              label="Did this save you money?"
              options={Q1_OPTIONS}
              selected={q1}
              onSelect={setQ1}
            />
            <SurveyQuestion
              label="Did this match what you found in-store?"
              options={Q2_OPTIONS}
              selected={q2}
              onSelect={setQ2}
            />
            <SurveyQuestion
              label="Would you use Snippd again next week?"
              options={Q3_OPTIONS}
              selected={q3}
              onSelect={setQ3}
            />

            {/* Optional improvement area */}
            <Text style={s.improvementLabel}>Anything to improve? (optional)</Text>
            <View style={s.pillRow}>
              {IMPROVEMENT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[s.pill, improvement === opt && s.pillActive]}
                  onPress={() => setImprovement(prev => prev === opt ? null : opt)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.pillTxt, improvement === opt && s.pillTxtActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.saveBtn, (!q1 || !q2 || !q3 || saving) && { opacity: 0.45 }]}
              onPress={handleSaveSurvey}
              disabled={!q1 || !q2 || !q3 || saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <>
                  <Feather name="send" size={16} color={WHITE} />
                  <Text style={s.saveBtnTxt}>Save & Close</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.savedCard}>
            <Feather name="check-circle" size={20} color={GREEN} />
            <Text style={s.savedTxt}>
              Got it. Snippd will use this to build a better plan next week.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Footer CTA ───────────────────────────────────────────────────── */}
      {saved && (
        <View style={s.footer}>
          <TouchableOpacity
            style={s.homeBtn}
            onPress={() => navigation.popToTop?.()}
            activeOpacity={0.85}
          >
            <Feather name="home" size={18} color={WHITE} />
            <Text style={s.homeBtnTxt}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Sub-components (defined outside to avoid remount) ─────────────────────────

function SummaryLine({ text, icon, highlight }) {
  return (
    <View style={s.summaryLine}>
      <Feather name={icon} size={14} color={highlight ? GREEN : SLATE} style={{ marginTop: 2 }} />
      <Text style={[s.summaryTxt, highlight && { color: FOREST, fontWeight: '700' }]}>
        {text}
      </Text>
    </View>
  );
}

function MetricBox({ label, value, color }) {
  return (
    <View style={s.metricBox}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function BonusRow({ label, value, positive }) {
  return (
    <View style={s.bonusRow}>
      <Text style={s.bonusLabel}>{label}</Text>
      <Text style={[s.bonusValue, positive && { color: GREEN }]}>{value}</Text>
    </View>
  );
}

function SurveyQuestion({ label, options, selected, onSelect }) {
  return (
    <View style={s.qBlock}>
      <Text style={s.qLabel}>{label}</Text>
      <View style={s.qRow}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[s.qBtn, selected === opt.key && { borderColor: opt.color, backgroundColor: opt.color + '18' }]}
            onPress={() => onSelect(prev => prev === opt.key ? null : opt.key)}
            activeOpacity={0.8}
          >
            <Feather
              name={opt.icon}
              size={18}
              color={selected === opt.key ? opt.color : SLATE}
            />
            <Text style={[s.qBtnTxt, selected === opt.key && { color: opt.color }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function LearnLines({ was_under_budget, plan_accuracy_percent, missing_items_count, coupons_confirmed, coupons_expected }) {
  const lines = [];
  if (was_under_budget) {
    lines.push('Budget stayed on track — keeping your target for next week.');
  } else {
    lines.push('Adjusted budget pressure score to find lower-cost options next week.');
  }
  if (plan_accuracy_percent < 80) {
    lines.push('Price accuracy flagged — will verify store prices before next plan.');
  }
  if (missing_items_count > 2) {
    lines.push('Several items were missing — will add flexible substitutions next week.');
  }
  if (coupons_expected > 0 && coupons_confirmed < coupons_expected) {
    lines.push('Some coupons were not used — will move coupon checklist earlier in flow.');
  }
  if (lines.length === 0) {
    lines.push('Everything looked good — keeping the same plan structure next week.');
  }
  return lines.map((line, i) => (
    <View key={i} style={s.learnLine}>
      <Text style={s.learnBullet}>›</Text>
      <Text style={s.learnTxt}>{line}</Text>
    </View>
  ));
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: MINT },

  header:     { backgroundColor: FOREST, paddingBottom: 16, paddingHorizontal: 16 },
  navRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  backBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  eyebrow:    { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5 },
  headerTitle:{ fontSize: 20, fontWeight: '900', color: WHITE, marginTop: 2 },

  scroll:     { paddingHorizontal: 16, paddingTop: 16, gap: 12, paddingBottom: 40 },

  banner:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14 },
  bannerGreen:{ backgroundColor: LIGHT_GRN },
  bannerAmber:{ backgroundColor: '#FEF3C7' },
  bannerIcon: { fontSize: 22 },
  bannerTitle:{ fontSize: 15, fontWeight: '800', marginBottom: 2 },
  bannerSub:  { fontSize: 12, fontWeight: '600' },

  card:       { backgroundColor: WHITE, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: BORDER },
  cardTitle:  { fontSize: 10, fontWeight: '800', color: SLATE, letterSpacing: 2, marginBottom: 2 },

  summaryLine:{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  summaryTxt: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 20 },

  metricsGrid:{ flexDirection: 'row', gap: 12 },
  metricBox:  { flex: 1, alignItems: 'center', backgroundColor: MINT, borderRadius: 10, padding: 12 },
  metricLabel:{ fontSize: 8, fontWeight: '800', color: SLATE, letterSpacing: 1.5, marginBottom: 4, textAlign: 'center' },
  metricValue:{ fontSize: 22, fontWeight: '900' },

  estimateNote:{ fontSize: 11, color: SLATE, fontStyle: 'italic', marginTop: 4 },

  accuracyRow:{ gap: 6 },
  accuracyPct:{ fontSize: 28, fontWeight: '900' },
  accuracyBar:{ height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  accuracyFill:{ height: 8, borderRadius: 4 },
  accuracySub:{ fontSize: 12, color: SLATE },

  bonusCard:  { borderColor: BLUE + '40', borderWidth: 1 },
  bonusRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  bonusLabel: { fontSize: 13, color: NAVY },
  bonusValue: { fontSize: 14, fontWeight: '700', color: NAVY },
  missedBonus:{ fontSize: 12, color: AMBER, fontWeight: '600', marginTop: 6 },

  learnCard:  { borderColor: GREEN + '40', borderWidth: 1 },
  learnLine:  { flexDirection: 'row', gap: 8, paddingVertical: 3 },
  learnBullet:{ fontSize: 16, color: GREEN, fontWeight: '700', marginTop: -1 },
  learnTxt:   { flex: 1, fontSize: 13, color: FOREST, lineHeight: 19 },

  surveyCard: { backgroundColor: WHITE, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: BORDER },
  surveyHeading:{ fontSize: 16, fontWeight: '800', color: NAVY },
  surveyIntro:  { fontSize: 12, color: SLATE },

  qBlock:     { gap: 8 },
  qLabel:     { fontSize: 13, fontWeight: '700', color: NAVY },
  qRow:       { flexDirection: 'row', gap: 8 },
  qBtn:       { flex: 1, alignItems: 'center', gap: 5, backgroundColor: MINT, borderRadius: 10, paddingVertical: 10, borderWidth: 1.5, borderColor: BORDER },
  qBtnTxt:    { fontSize: 11, fontWeight: '700', color: SLATE },

  improvementLabel: { fontSize: 12, fontWeight: '700', color: SLATE, letterSpacing: 1 },
  pillRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill:       { borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: MINT },
  pillActive: { backgroundColor: FOREST, borderColor: FOREST },
  pillTxt:    { fontSize: 12, fontWeight: '600', color: SLATE },
  pillTxtActive:{ color: WHITE },

  saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: FOREST, borderRadius: 12, paddingVertical: 14 },
  saveBtnTxt: { fontSize: 14, fontWeight: '800', color: WHITE },

  savedCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: LIGHT_GRN, borderRadius: 12, padding: 14 },
  savedTxt:   { flex: 1, fontSize: 13, color: FOREST, fontWeight: '600', lineHeight: 19 },

  footer:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: WHITE, borderTopWidth: 1, borderTopColor: BORDER, padding: 16, paddingBottom: 32 },
  homeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16 },
  homeBtnTxt: { fontSize: 15, fontWeight: '800', color: WHITE },
});
