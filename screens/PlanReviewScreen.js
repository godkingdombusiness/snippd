/**
 * PlanReviewScreen — Shows the generated weekly plan with budget summary
 * and lets users approve, add items, or request a cheaper/healthier version.
 */

import React, { useState } from 'react';
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
const CORAL  = '#fb5b5b';
const AMBER  = '#F59E0B';

const SEEDED = {
  estimatedSpend: 168.40,
  budget: 185,
  potentialSavings: 31.75,
  items: 47,
  stores: ['Publix', 'Aldi', 'Dollar General'],
  builtAround: [
    { label: 'Your budget',            icon: 'dollar-sign' },
    { label: 'Your favorite stores',   icon: 'map-pin' },
    { label: 'Your goals',             icon: 'target' },
    { label: 'Your usual staples',     icon: 'list' },
    { label: 'This week\'s savings',   icon: 'tag' },
  ],
};

function StashBubble({ message }) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}><Text style={styles.stashIconText}>✦</Text></View>
      <Text style={styles.stashText}>{message}</Text>
    </View>
  );
}

function BudgetBar({ spent, budget }) {
  const pct = Math.min((spent / budget) * 100, 100);
  const isOver = spent > budget;
  return (
    <View style={styles.budgetBarWrap}>
      <View style={styles.budgetTrack}>
        <View
          style={[
            styles.budgetFill,
            { width: `${pct}%`, backgroundColor: isOver ? CORAL : GREEN },
          ]}
        />
      </View>
      <View style={styles.budgetLabels}>
        <Text style={styles.budgetSpent}>${spent.toFixed(2)} planned</Text>
        <Text style={styles.budgetTotal}>of ${budget} budget</Text>
      </View>
    </View>
  );
}

export default function PlanReviewScreen({ navigation }) {
  const [variant, setVariant] = useState('default'); // 'default' | 'cheaper' | 'healthier'

  const plan = variant === 'cheaper'
    ? { ...SEEDED, estimatedSpend: 148.20, potentialSavings: 38.50, items: 42 }
    : variant === 'healthier'
    ? { ...SEEDED, estimatedSpend: 172.90, potentialSavings: 27.80, items: 49 }
    : SEEDED;

  const remaining = plan.budget - plan.estimatedSpend;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Header */}
        <Text style={styles.headline}>Your smarter weekly plan is ready.</Text>

        {/* Variant badge */}
        {variant !== 'default' && (
          <View style={[styles.variantBadge, variant === 'cheaper' ? styles.variantGreen : styles.variantBlue]}>
            <Text style={styles.variantText}>
              {variant === 'cheaper' ? '💰 Budget-optimized version' : '🥗 Healthier version'}
            </Text>
          </View>
        )}

        {/* Budget summary */}
        <View style={styles.budgetCard}>
          <View style={styles.budgetRow}>
            <View style={styles.budgetCol}>
              <Text style={styles.bigNum}>${plan.estimatedSpend.toFixed(2)}</Text>
              <Text style={styles.bigLabel}>Estimated spend</Text>
            </View>
            <View style={styles.budgetDivider} />
            <View style={styles.budgetCol}>
              <Text style={[styles.bigNum, { color: GREEN }]}>${plan.potentialSavings.toFixed(2)}</Text>
              <Text style={styles.bigLabel}>Potential savings</Text>
            </View>
            <View style={styles.budgetDivider} />
            <View style={styles.budgetCol}>
              <Text style={[styles.bigNum, remaining >= 0 ? { color: GREEN } : { color: CORAL }]}>
                ${Math.abs(remaining).toFixed(0)}
              </Text>
              <Text style={styles.bigLabel}>{remaining >= 0 ? 'Under budget' : 'Over budget'}</Text>
            </View>
          </View>
          <BudgetBar spent={plan.estimatedSpend} budget={plan.budget} />
        </View>

        {/* Built around */}
        <Text style={styles.sectionLabel}>Built around</Text>
        <View style={styles.builtCard}>
          {plan.builtAround.map((item, idx) => (
            <View key={item.label} style={[styles.builtRow, idx < plan.builtAround.length - 1 && styles.builtRowBorder]}>
              <View style={styles.builtIcon}>
                <Feather name={item.icon} size={14} color={GREEN} />
              </View>
              <Text style={styles.builtLabel}>{item.label}</Text>
              <Feather name="check" size={14} color={GREEN} />
            </View>
          ))}
        </View>

        {/* Store breakdown */}
        <Text style={styles.sectionLabel}>Store breakdown</Text>
        <View style={styles.storeRow}>
          <View style={[styles.storeChip, { flex: 2 }]}>
            <Text style={styles.storeChipName}>Aldi</Text>
            <Text style={styles.storeChipAmt}>$68.21</Text>
          </View>
          <View style={[styles.storeChip, { flex: 2 }]}>
            <Text style={styles.storeChipName}>Publix</Text>
            <Text style={styles.storeChipAmt}>$72.48</Text>
          </View>
          <View style={[styles.storeChip, { flex: 2 }]}>
            <Text style={styles.storeChipName}>DG</Text>
            <Text style={styles.storeChipAmt}>$27.71</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('StackPersonalization')}>
          <View style={styles.stacksHint}>
            <Feather name="layers" size={15} color={GREEN} />
            <Text style={styles.stacksHintText}>See why Snippd picked these stacks</Text>
            <Feather name="chevron-right" size={15} color={GREEN} />
          </View>
        </TouchableOpacity>

        <StashBubble
          message="This plan is your starting point, not a locked-in order. You stay in control of every item."
        />

        {/* Primary action */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('CartBuilder')}
        >
          <Text style={styles.primaryBtnText}>Looks good — build my cart</Text>
          <Feather name="arrow-right" size={18} color={WHITE} />
        </TouchableOpacity>

        {/* Secondary actions */}
        <View style={styles.secondaryActions}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('AddNeeds')}
          >
            <Feather name="plus" size={15} color={NAVY} />
            <Text style={styles.secondaryBtnText}>Add more items</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, variant === 'cheaper' && styles.secondaryBtnActive]}
            onPress={() => setVariant(v => v === 'cheaper' ? 'default' : 'cheaper')}
          >
            <Feather name="dollar-sign" size={15} color={variant === 'cheaper' ? WHITE : NAVY} />
            <Text style={[styles.secondaryBtnText, variant === 'cheaper' && { color: WHITE }]}>
              Make it cheaper
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, variant === 'healthier' && styles.secondaryBtnActive]}
            onPress={() => setVariant(v => v === 'healthier' ? 'default' : 'healthier')}
          >
            <Feather name="heart" size={15} color={variant === 'healthier' ? WHITE : NAVY} />
            <Text style={[styles.secondaryBtnText, variant === 'healthier' && { color: WHITE }]}>
              Make it healthier
            </Text>
          </TouchableOpacity>
        </View>
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
    fontSize: 28,
    color: NAVY,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 16,
  },

  variantBadge: {
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  variantGreen: { backgroundColor: MINT },
  variantBlue: { backgroundColor: '#EFF6FF' },
  variantText: { fontSize: 13, fontWeight: '600', color: NAVY },

  budgetCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  budgetRow: { flexDirection: 'row', marginBottom: 16 },
  budgetCol: { flex: 1, alignItems: 'center' },
  budgetDivider: { width: 1, backgroundColor: BORDER, marginHorizontal: 8 },
  bigNum: { fontSize: 22, fontWeight: '800', color: NAVY, marginBottom: 3 },
  bigLabel: { fontSize: 11, color: GRAY, textAlign: 'center' },

  budgetBarWrap: {},
  budgetTrack: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 3 },
  budgetLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  budgetSpent: { fontSize: 11, color: GRAY },
  budgetTotal: { fontSize: 11, color: GRAY },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: GRAY,
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 10,
  },

  builtCard: {
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 20,
    overflow: 'hidden',
  },
  builtRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  builtRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  builtIcon: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
  },
  builtLabel: { flex: 1, fontSize: 14, color: NAVY, fontWeight: '500' },

  storeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  storeChip: {
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    alignItems: 'center',
  },
  storeChipName: { fontSize: 12, fontWeight: '700', color: NAVY, marginBottom: 4 },
  storeChipAmt: { fontSize: 14, fontWeight: '600', color: GREEN },

  stacksHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  stacksHintText: { flex: 1, fontSize: 14, color: GREEN, fontWeight: '500' },

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
    marginBottom: 16,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },

  secondaryActions: { gap: 10 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 12,
  },
  secondaryBtnActive: { backgroundColor: NAVY, borderColor: NAVY },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: NAVY },
});
