/**
 * SavingsActionScreen — Screen I.
 * "What do you want to do with your $X in savings?"
 * User picks one action card (Save, Pay bill, Debt, Donate).
 * Selection is written to Neo4j via recordMemoryEvent + Supabase savings_actions.
 * Budget is NOT updated until the user confirms here.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { recordMemoryEvent } from '../src/lib/memoryEvents';

// ── Brand ─────────────────────────────────────────────────────────────────────
const GREEN   = '#0C9E54';
const FOREST  = '#004D40';
const NAVY    = '#1A237E';
const WHITE   = '#FFFFFF';
const MINT    = '#F0FBF0';
const LIGHT_GRN = '#DCFCE7';
const SLATE   = '#64748B';
const BORDER  = '#E2E8F0';
const CORAL   = '#FF7043';

// ── Action definitions ────────────────────────────────────────────────────────
const ACTIONS = [
  {
    key:      'save_fund',
    icon:     'archive',
    iconBg:   '#DCFCE7',
    iconColor: GREEN,
    title:    'Save to my emergency fund',
    sub:      'Build a buffer for unexpected expenses',
    neo4j:    'EmergencyFund',
  },
  {
    key:      'pay_bill',
    icon:     'file-text',
    iconBg:   '#EFF6FF',
    iconColor: '#1D4ED8',
    title:    'Apply toward a bill',
    sub:      'Put it toward rent, utilities, or subscriptions',
    neo4j:    'Bill',
  },
  {
    key:      'pay_debt',
    icon:     'credit-card',
    iconBg:   '#FEF3C7',
    iconColor: '#92400E',
    title:    'Pay down debt',
    sub:      'Apply to a credit card or loan balance',
    neo4j:    'Debt',
  },
  {
    key:      'donate',
    icon:     'heart',
    iconBg:   '#FEE2E2',
    iconColor: CORAL,
    title:    'Donate to a cause',
    sub:      'Give to a charity or community fund',
    neo4j:    'Donation',
  },
];

function fmtDollars(amount) {
  return '$' + Math.abs(Number(amount) || 0).toFixed(2);
}

// ── Action Card (defined outside to prevent remount) ──────────────────────────
function ActionCard({ action, selected, onPress }) {
  const isSelected = selected === action.key;
  return (
    <TouchableOpacity
      style={[s.actionCard, isSelected && s.actionCardSelected]}
      onPress={() => onPress(action.key)}
      activeOpacity={0.82}
    >
      <View style={[s.actionIcon, { backgroundColor: action.iconBg }]}>
        <Feather name={action.icon} size={22} color={action.iconColor} />
      </View>
      <View style={s.actionText}>
        <Text style={[s.actionTitle, isSelected && { color: FOREST }]}>{action.title}</Text>
        <Text style={s.actionSub}>{action.sub}</Text>
      </View>
      <Feather
        name={isSelected ? 'check-circle' : 'chevron-right'}
        size={20}
        color={isSelected ? GREEN : SLATE}
      />
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function SavingsActionScreen({ route, navigation }) {
  const {
    actualSavings = 0,      // dollar amount saved this trip
    tripId        = null,
    store         = 'Your Store',
    weeklyPlanId  = null,
  } = route?.params ?? {};

  const [selected,  setSelected]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const action = ACTIONS.find(a => a.key === selected);

      // Write to savings_actions table (do NOT update budget until confirmed here)
      await supabase.from('savings_actions').insert({
        user_id:        user.id,
        trip_id:        tripId,
        weekly_plan_id: weeklyPlanId,
        store,
        action_type:    selected,
        amount:         actualSavings,
        confirmed_at:   new Date().toISOString(),
      }).throwOnError();

      // Fire Neo4j edge: (:User)-[:COMMITTED_TO {action, amount}]->(:SavingsAction)
      recordMemoryEvent({
        event_type: 'savings_action_committed',
        trip_id:    tripId,
        savings:    Math.round(actualSavings * 100),
        metadata: {
          action_type:   selected,
          neo4j_label:   action?.neo4j,
          amount:        actualSavings,
          store,
          weekly_plan_id: weeklyPlanId,
        },
      });

      setConfirmed(true);
    } catch (e) {
      console.warn('[SavingsActionScreen] save failed:', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    navigation.replace('NextWeekBuilder', {
      lastSavings:     actualSavings,
      lastStore:       store,
      savingsAction:   selected,
    });
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={s.headerWrap}>
        <View style={s.navRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={20} color={NAVY} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Success graphic ───────────────────────────────────────────── */}
        <View style={s.successGraphic}>
          <View style={s.coinOuter}>
            <View style={s.coinInner}>
              <Text style={s.coinEmoji}>🪙</Text>
            </View>
          </View>
          <View style={s.savingsAmtWrap}>
            <Text style={s.savingsAmt}>{fmtDollars(actualSavings)}</Text>
            <Text style={s.savingsAmtLabel}>saved this trip</Text>
          </View>
        </View>

        {/* ── Headline ──────────────────────────────────────────────────── */}
        <Text style={s.headline}>
          What do you want to do with your{'\n'}
          <Text style={s.headlineAmt}>{fmtDollars(actualSavings)}</Text>
          {' '}in savings?
        </Text>
        <Text style={s.subHead}>
          Your budget isn't updated until you make a choice. Pick one to lock it in.
        </Text>

        {/* ── Action cards ──────────────────────────────────────────────── */}
        <View style={s.cardList}>
          {ACTIONS.map(action => (
            <ActionCard
              key={action.key}
              action={action}
              selected={selected}
              onPress={setSelected}
            />
          ))}
        </View>

        {/* ── Confirm or success state ───────────────────────────────────── */}
        {!confirmed ? (
          <TouchableOpacity
            style={[s.confirmBtn, (!selected || saving) && { opacity: 0.4 }]}
            onPress={handleConfirm}
            disabled={!selected || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <>
                <Feather name="check" size={18} color={WHITE} />
                <Text style={s.confirmBtnTxt}>Confirm my choice</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={s.confirmedBanner}>
            <Feather name="check-circle" size={18} color={GREEN} />
            <Text style={s.confirmedTxt}>
              Locked in. Snippd will track this toward your lifetime savings.
            </Text>
          </View>
        )}

        {/* Skip or Next */}
        {confirmed ? (
          <TouchableOpacity style={s.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={s.nextBtnTxt}>Plan next week</Text>
            <Feather name="arrow-right" size={16} color={WHITE} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.skipLink}
            onPress={() => navigation.navigate('NextWeekBuilder', {
              lastSavings:   actualSavings,
              lastStore:     store,
              savingsAction: null,
            })}
            activeOpacity={0.7}
          >
            <Text style={s.skipTxt}>Skip for now</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: WHITE },

  headerWrap:  { backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  navRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  backBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

  scroll:      { paddingHorizontal: 24, paddingTop: 28, alignItems: 'center', gap: 0 },

  // Success graphic
  successGraphic: { alignItems: 'center', marginBottom: 28 },
  coinOuter:      { width: 100, height: 100, borderRadius: 50, backgroundColor: LIGHT_GRN, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  coinInner:      { width: 72, height: 72, borderRadius: 36, backgroundColor: '#A7F3D0', alignItems: 'center', justifyContent: 'center' },
  coinEmoji:      { fontSize: 36 },
  savingsAmtWrap: { alignItems: 'center' },
  savingsAmt:     { fontSize: 36, fontWeight: '900', color: GREEN },
  savingsAmtLabel:{ fontSize: 13, color: SLATE, marginTop: 2 },

  headline:    { fontSize: 22, fontWeight: '800', color: NAVY, textAlign: 'center', lineHeight: 30, marginBottom: 8, width: '100%' },
  headlineAmt: { color: GREEN },
  subHead:     { fontSize: 13, color: SLATE, textAlign: 'center', lineHeight: 19, marginBottom: 28, width: '100%' },

  cardList:    { width: '100%', gap: 10, marginBottom: 24 },

  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: WHITE, borderRadius: 16,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  actionCardSelected: {
    borderColor: GREEN, backgroundColor: '#F0FDF4',
  },
  actionIcon:  { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionText:  { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '800', color: NAVY, marginBottom: 3, lineHeight: 20 },
  actionSub:   { fontSize: 12, color: SLATE, lineHeight: 17 },

  confirmBtn:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: FOREST, borderRadius: 14, paddingVertical: 17,
    width: '100%', marginBottom: 12,
  },
  confirmBtnTxt: { fontSize: 16, fontWeight: '900', color: WHITE },

  confirmedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: LIGHT_GRN, borderRadius: 12, padding: 14,
    width: '100%', marginBottom: 12,
  },
  confirmedTxt: { flex: 1, fontSize: 13, color: FOREST, fontWeight: '600', lineHeight: 19 },

  nextBtn:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 17,
    width: '100%', marginBottom: 12,
  },
  nextBtnTxt: { fontSize: 16, fontWeight: '800', color: WHITE },

  skipLink: { paddingVertical: 10, width: '100%', alignItems: 'center', marginBottom: 8 },
  skipTxt:  { fontSize: 14, color: SLATE, textDecorationLine: 'underline' },
});
