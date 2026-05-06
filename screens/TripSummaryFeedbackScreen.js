/**
 * TripSummaryFeedbackScreen — post-trip summary + micro survey.
 *
 * route.params shape:
 * {
 *   planned_total_cents, receipt_total_cents, verified_savings_cents,
 *   coupons_clipped, plan_followed_pct, store
 * }
 *
 * Saves feedback to Supabase trip_feedback table.
 * Neo4j write is fire-and-forget via the ingest-event edge function.
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
const GREEN     = '#0C9E54';
const FOREST    = '#04361D';
const NAVY      = '#1A237E';
const WHITE     = '#FFFFFF';
const MINT      = '#F0FBF0';
const SLATE     = '#64748B';
const BORDER    = '#E2E8F0';
const AMBER     = '#F59E0B';
const CORAL     = '#FF7043';
const LIGHT_GRN = '#DCFCE7';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCents(cents) {
  if (cents == null || isNaN(cents)) return '$—';
  return '$' + (Math.max(0, Number(cents)) / 100).toFixed(2);
}

// ── Config ────────────────────────────────────────────────────────────────────
const RATINGS = [
  { key: 'perfect',     label: 'Perfect',     icon: 'star',        color: GREEN  },
  { key: 'good',        label: 'Good',        icon: 'thumbs-up',   color: '#3B82F6' },
  { key: 'okay',        label: 'Okay',        icon: 'meh',         color: AMBER  },
  { key: 'frustrating', label: 'Frustrating', icon: 'thumbs-down', color: CORAL  },
];

const ISSUES = [
  'Coupons did not work',
  'Item unavailable',
  'Switched store',
  'Too complicated',
  'Other',
];

const SAVINGS_ACTIONS = [
  { key: 'savings',     label: 'Move to savings'  },
  { key: 'bill',        label: 'Pay a bill'        },
  { key: 'credit_card', label: 'Pay credit card'   },
  { key: 'donate',      label: 'Donate'            },
  { key: 'split',       label: 'Split it'          },
];

// ── Screen ────────────────────────────────────────────────────────────────────
export default function TripSummaryFeedbackScreen({ route, navigation }) {
  const params = route?.params || {};
  const plannedCents    = params.planned_total_cents    || 0;
  const receiptCents    = params.receipt_total_cents    || 0;
  const savingsCents    = params.verified_savings_cents || 0;
  const couponsClipped  = params.coupons_clipped        || 0;
  const planFollowedPct = params.plan_followed_pct      || 0;
  const store           = params.store                  || 'Your Store';

  const [rating,        setRating]        = useState(null);
  const [issue,         setIssue]         = useState(null);
  const [savingsAction, setSavingsAction] = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);

  const showIssues = rating === 'frustrating' || rating === 'okay';

  const handleSave = async () => {
    if (!rating) {
      Alert.alert('Rate your trip', 'Please select a rating before saving.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('trip_feedback').insert({
          user_id:                 user.id,
          store,
          planned_total_cents:     plannedCents,
          receipt_total_cents:     receiptCents,
          verified_savings_cents:  savingsCents,
          coupons_clipped:         couponsClipped,
          plan_followed_pct:       planFollowedPct,
          rating,
          issue:                   issue || null,
          savings_action:          savingsAction || null,
        });

        // Fire-and-forget adaptive memory events
        const savedMoneyResp   = rating === 'perfect' ? 'yes' : rating === 'good' ? 'somewhat' : 'not really';
        const matchedStoreResp = issue === 'Switched store' ? 'no' : issue ? 'mostly' : 'yes';
        const useAgainResp     = rating === 'perfect' ? 'yes' : rating === 'good' ? 'maybe' : 'no';

        recordMemoryEvent({
          event_type: 'survey_completed',
          survey_response: {
            saved_money:    savedMoneyResp,
            matched_store:  matchedStoreResp,
            use_again:      useAgainResp,
          },
          metadata: {
            rating, issue, savings_action: savingsAction,
            store, plan_followed_pct: planFollowedPct,
          },
        });

        recordMemoryEvent({
          event_type: 'receipt_confirmed',
          savings:    savingsCents,
          metadata: {
            store,
            over_budget:          receiptCents > plannedCents,
            planned_total_cents:  plannedCents,
            receipt_total_cents:  receiptCents,
          },
        });
      }
      setSaved(true);
    } catch {
      Alert.alert('Save failed', 'Could not save your feedback. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.navRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
              <Feather name="arrow-left" size={20} color={WHITE} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.headerEyebrow}>TRIP COMPLETE</Text>
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
        {/* ── Achievement banner ────────────────────────────────────────────── */}
        {(() => {
          const savingsPct = plannedCents > 0 ? Math.round((savingsCents / plannedCents) * 100) : planFollowedPct;
          const isGreat = savingsPct >= 70 || planFollowedPct >= 70;
          return (
            <View style={[s.achieveBanner, { backgroundColor: isGreat ? LIGHT_GRN : '#FEF3C7' }]}>
              <Text style={s.achieveIcon}>{isGreat ? '✓' : '👍'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.achieveTitle, { color: isGreat ? FOREST : '#92400E' }]}>
                  {isGreat ? 'Great job!' : 'Good effort!'}
                </Text>
                <Text style={[s.achieveSub, { color: isGreat ? GREEN : '#B45309' }]}>
                  {savingsPct > 0
                    ? `You achieved ${Math.min(savingsPct, 100)}% of your planned savings`
                    : 'Plan followed — keep it up next trip'}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* ── Summary metrics ───────────────────────────────────────────────── */}
        <View style={s.metricsCard}>
          <View style={s.metricRow}>
            <View style={s.metric}>
              <Text style={s.metricLabel}>YOU PLANNED</Text>
              <Text style={s.metricVal}>{fmtCents(plannedCents)}</Text>
            </View>
            <View style={s.metricDividerV} />
            <View style={s.metric}>
              <Text style={s.metricLabel}>YOU SPENT</Text>
              <Text style={s.metricVal}>{fmtCents(receiptCents || plannedCents)}</Text>
            </View>
            <View style={s.metricDividerV} />
            <View style={s.metric}>
              <Text style={s.metricLabel}>YOU SAVED</Text>
              <Text style={[s.metricVal, { color: GREEN }]}>{fmtCents(savingsCents)}</Text>
            </View>
          </View>

          <View style={s.metricDivider} />

          <View style={s.metricRow}>
            <View style={s.metric}>
              <Text style={s.metricLabel}>PLAN FOLLOWED</Text>
              <Text style={[
                s.metricVal,
                planFollowedPct >= 80 ? { color: GREEN } : { color: AMBER },
              ]}>
                {planFollowedPct}%
              </Text>
            </View>
            <View style={s.metric}>
              <Text style={s.metricLabel}>COUPONS CLIPPED</Text>
              <Text style={s.metricVal}>{couponsClipped}</Text>
            </View>
          </View>
        </View>

        {/* ── What will you do with the savings? ────────────────────────────── */}
        {savingsCents > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              WHAT WILL YOU DO WITH {fmtCents(savingsCents)}?
            </Text>
            <View style={s.pillGrid}>
              {SAVINGS_ACTIONS.map(action => (
                <TouchableOpacity
                  key={action.key}
                  style={[s.pill, savingsAction === action.key && s.pillActive]}
                  onPress={() => setSavingsAction(
                    prev => prev === action.key ? null : action.key
                  )}
                  activeOpacity={0.8}
                >
                  <Text style={[s.pillTxt, savingsAction === action.key && s.pillTxtActive]}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Micro survey ──────────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>HOW WAS YOUR TRIP?</Text>
          <View style={s.ratingRow}>
            {RATINGS.map(r => (
              <TouchableOpacity
                key={r.key}
                style={[
                  s.ratingBtn,
                  rating === r.key && { borderColor: r.color, backgroundColor: r.color + '18' },
                ]}
                onPress={() => setRating(prev => prev === r.key ? null : r.key)}
                activeOpacity={0.8}
              >
                <Feather
                  name={r.icon}
                  size={20}
                  color={rating === r.key ? r.color : SLATE}
                />
                <Text style={[s.ratingLabel, rating === r.key && { color: r.color }]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Issue picker (shown when okay / frustrating) ───────────────────── */}
        {showIssues && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>WHAT WENT WRONG?</Text>
            <View style={s.pillGrid}>
              {ISSUES.map(iss => (
                <TouchableOpacity
                  key={iss}
                  style={[s.pill, issue === iss && s.pillActive]}
                  onPress={() => setIssue(prev => prev === iss ? null : iss)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.pillTxt, issue === iss && s.pillTxtActive]}>
                    {iss}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Saved confirmation ────────────────────────────────────────────── */}
        {saved && (
          <View style={s.savedBanner}>
            <Feather name="check-circle" size={18} color={GREEN} />
            <Text style={s.savedTxt}>
              Feedback saved. Snippd learns from every trip to improve your plan next week.
            </Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Footer CTA ───────────────────────────────────────────────────────── */}
      <View style={s.footer}>
        {saved ? (
          <TouchableOpacity
            style={s.doneBtn}
            onPress={() => navigation.popToTop?.()}
            activeOpacity={0.85}
          >
            <Feather name="home" size={18} color={WHITE} />
            <Text style={s.doneBtnTxt}>Back to Home</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.saveBtn, (!rating || saving) && { opacity: 0.45 }]}
            onPress={handleSave}
            disabled={!rating || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <>
                <Feather name="save" size={18} color={WHITE} />
                <Text style={s.saveBtnTxt}>Save Trip Feedback</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: MINT },

  header:        { backgroundColor: FOREST, paddingBottom: 16, paddingHorizontal: 16 },
  navRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  backBtn:       { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5 },
  headerTitle:   { fontSize: 20, fontWeight: '900', color: WHITE, marginTop: 2 },

  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 16, paddingBottom: 40 },

  metricsCard:  { backgroundColor: WHITE, borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: BORDER },
  achieveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, marginBottom: 4,
  },
  achieveIcon:  { fontSize: 22 },
  achieveTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  achieveSub:   { fontSize: 12, fontWeight: '600' },

  metricRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  metric:       { flex: 1, alignItems: 'center' },
  metricLabel:  { fontSize: 8, fontWeight: '800', color: SLATE, letterSpacing: 1.5, marginBottom: 4, textAlign: 'center' },
  metricVal:    { fontSize: 18, fontWeight: '900', color: NAVY },
  metricDivider:  { height: 1, backgroundColor: BORDER },
  metricDividerV: { width: 1, height: 40, backgroundColor: BORDER },

  section:      { gap: 10 },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: SLATE, letterSpacing: 2 },

  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill:     { borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: WHITE },
  pillActive:   { backgroundColor: FOREST, borderColor: FOREST },
  pillTxt:      { fontSize: 13, fontWeight: '600', color: SLATE },
  pillTxtActive:{ color: WHITE },

  ratingRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  ratingBtn: {
    flex: 1, minWidth: '22%',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: WHITE, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1.5, borderColor: BORDER,
  },
  ratingLabel: { fontSize: 11, fontWeight: '700', color: SLATE },

  savedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: LIGHT_GRN, borderRadius: 12, padding: 14 },
  savedTxt:    { flex: 1, fontSize: 13, color: FOREST, fontWeight: '600', lineHeight: 19 },

  footer:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: WHITE, borderTopWidth: 1, borderTopColor: BORDER, padding: 16, paddingBottom: 32 },
  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: FOREST, borderRadius: 14, paddingVertical: 16 },
  saveBtnTxt:  { fontSize: 15, fontWeight: '800', color: WHITE },
  doneBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16 },
  doneBtnTxt:  { fontSize: 15, fontWeight: '800', color: WHITE },
});
