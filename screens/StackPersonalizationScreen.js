/**
 * StackPersonalizationScreen — Explains why Snippd picked each stack
 * for the user's plan. Opened from PlanReviewScreen.
 */

import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

const GREEN  = '#0C9E54';
const NAVY   = '#172250';
const CREAM  = '#FAF8F1';
const WHITE  = '#FFFFFF';
const GRAY   = '#6B7280';
const BORDER = '#E5E7EB';
const MINT   = '#E8F5E9';

const STACKS = [
  {
    id: 'budget',
    icon: 'dollar-sign',
    title: 'Budget Saver Stack',
    reason: 'Keeps your plan under budget.',
    detail: 'Price-matched across Aldi, Publix, and Dollar General to find the lowest cost per item without sacrificing your staples.',
    matchReason: 'You set a $185 / week budget.',
    color: '#10B981',
    bg: '#D1FAE5',
  },
  {
    id: 'protein',
    icon: 'zap',
    title: 'High Protein Stack',
    reason: 'Matches your current food goal.',
    detail: 'Prioritizes chicken, eggs, Greek yogurt, and ground turkey across your preferred stores with available deals.',
    matchReason: 'You selected "High Protein" as a goal.',
    color: '#6366F1',
    bg: '#EEF2FF',
  },
  {
    id: 'quick',
    icon: 'clock',
    title: 'Quick Meals Stack',
    reason: 'Helps with busy nights.',
    detail: 'Includes heat-and-eat options and 30-minute meal ingredients that fit your household size.',
    matchReason: 'You selected "Quick Meals" as a goal.',
    color: '#F59E0B',
    bg: '#FEF3C7',
  },
  {
    id: 'eatout',
    icon: 'shield',
    title: 'Eat-Out Defense Stack',
    reason: 'Gives you backup meals before takeout gets expensive.',
    detail: 'Rotisserie chicken, salad mix, and frozen pizza give you fast alternatives when cooking isn\'t happening.',
    matchReason: 'Based on common Friday spending patterns for households like yours.',
    color: '#EF4444',
    bg: '#FEE2E2',
  },
];

function StashBubble({ message }) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}><Text style={styles.stashIconText}>✦</Text></View>
      <Text style={styles.stashText}>{message}</Text>
    </View>
  );
}

function StackCard({ stack }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: stack.bg }]}>
          <Feather name={stack.icon} size={18} color={stack.color} />
        </View>
        <View style={styles.cardTitles}>
          <Text style={styles.cardTitle}>{stack.title}</Text>
          <Text style={styles.cardReason}>{stack.reason}</Text>
        </View>
      </View>
      <Text style={styles.cardDetail}>{stack.detail}</Text>
      <View style={styles.matchRow}>
        <Feather name="user" size={13} color={GREEN} />
        <Text style={styles.matchText}>{stack.matchReason}</Text>
      </View>
    </View>
  );
}

export default function StackPersonalizationScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Header */}
        <Text style={styles.headline}>Why Snippd picked these stacks</Text>
        <Text style={styles.sub}>
          Your plan is personalized around what you told us and what your household tends to do.
        </Text>

        {/* Stack cards */}
        <View style={styles.cards}>
          {STACKS.map(s => <StackCard key={s.id} stack={s} />)}
        </View>

        <StashBubble
          message="Stacks combine deals, store strengths, and your goals into one organized plan. You always see exactly what's in each one."
        />

        {/* Back to plan */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.primaryBtnText}>Back to My Plan</Text>
          <Feather name="check" size={18} color={WHITE} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  scroll: { padding: 24, paddingBottom: 40 },
  backBtn: { marginBottom: 20, alignSelf: 'flex-start' },

  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 26,
    color: NAVY,
    letterSpacing: -0.5,
    lineHeight: 32,
    marginBottom: 8,
  },
  sub: { fontSize: 15, color: GRAY, lineHeight: 22, fontWeight: '300', marginBottom: 24 },

  cards: { gap: 14, marginBottom: 24 },
  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12 },
  cardIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardTitles: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: NAVY, marginBottom: 3 },
  cardReason: { fontSize: 13, color: GREEN, fontWeight: '500' },
  cardDetail: { fontSize: 14, color: GRAY, lineHeight: 21, marginBottom: 12 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: MINT,
    borderRadius: 8,
    padding: 10,
  },
  matchText: { fontSize: 12, color: NAVY, fontWeight: '500', flex: 1 },

  stash: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: MINT,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    marginBottom: 24,
  },
  stashIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stashIconText: { color: WHITE, fontSize: 14, fontWeight: '700' },
  stashText: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 21 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },
});
