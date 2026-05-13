/**
 * UsualStaplesScreen — Pick from household staples to add to this week's plan.
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

const STAPLES = [
  { id: 'eggs',    label: 'Eggs',             icon: '🥚', category: 'Protein' },
  { id: 'milk',    label: 'Milk',             icon: '🥛', category: 'Dairy' },
  { id: 'chicken', label: 'Chicken Breast',   icon: '🍗', category: 'Protein' },
  { id: 'rice',    label: 'Rice',             icon: '🍚', category: 'Pantry' },
  { id: 'yogurt',  label: 'Greek Yogurt',     icon: '🫙', category: 'Dairy' },
  { id: 'bananas', label: 'Bananas',          icon: '🍌', category: 'Produce' },
  { id: 'pasta',   label: 'Pasta',            icon: '🍝', category: 'Pantry' },
  { id: 'bread',   label: 'Bread',            icon: '🍞', category: 'Pantry' },
  { id: 'butter',  label: 'Butter',           icon: '🧈', category: 'Dairy' },
  { id: 'cheese',  label: 'Cheese',           icon: '🧀', category: 'Dairy' },
  { id: 'beef',    label: 'Ground Beef',      icon: '🥩', category: 'Protein' },
  { id: 'spinach', label: 'Spinach',          icon: '🥬', category: 'Produce' },
  { id: 'apples',  label: 'Apples',           icon: '🍎', category: 'Produce' },
  { id: 'oats',    label: 'Oats',             icon: '🫙', category: 'Pantry' },
  { id: 'coffee',  label: 'Coffee',           icon: '☕', category: 'Pantry' },
  { id: 'towels',  label: 'Paper Towels',     icon: '🧻', category: 'Household' },
  { id: 'detergent', label: 'Laundry Detergent', icon: '🧴', category: 'Household' },
  { id: 'soap',    label: 'Dish Soap',        icon: '🫧', category: 'Household' },
];

const CATEGORIES = ['Protein', 'Dairy', 'Produce', 'Pantry', 'Household'];

function StashBubble({ message }) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}><Text style={styles.stashIconText}>✦</Text></View>
      <Text style={styles.stashText}>{message}</Text>
    </View>
  );
}

function StapleCard({ item, selected, onToggle }) {
  return (
    <TouchableOpacity
      style={[styles.stapleCard, selected && styles.stapleCardSelected]}
      onPress={onToggle}
      activeOpacity={0.75}
    >
      <Text style={styles.stapleEmoji}>{item.icon}</Text>
      <Text style={[styles.stapleLabel, selected && styles.stapleLabelSelected]}>
        {item.label}
      </Text>
      {selected && (
        <View style={styles.checkMark}>
          <Feather name="check" size={12} color={WHITE} />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function UsualStaplesScreen({ navigation }) {
  const [selected, setSelected] = useState(new Set());
  const [activeCategory, setActiveCategory] = useState('All');

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const visibleStaples = activeCategory === 'All'
    ? STAPLES
    : STAPLES.filter(s => s.category === activeCategory);

  function handleAddSelected() {
    const selectedItems = STAPLES.filter(s => selected.has(s.id)).map(s => s.label);
    navigation.navigate('SmartStarterCart', { addedItems: selectedItems });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Header */}
        <Text style={styles.headline}>Your usual staples</Text>
        <Text style={styles.sub}>
          These are items your household tends to buy often. Pick what you need this week.
        </Text>

        {/* Category filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {['All', ...CATEGORIES].map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, activeCategory === cat && styles.catChipActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.catText, activeCategory === cat && styles.catTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Grid */}
        <View style={styles.grid}>
          {visibleStaples.map(item => (
            <StapleCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
            />
          ))}
        </View>

        {selected.size > 0 && (
          <Text style={styles.selectedCount}>
            {selected.size} item{selected.size !== 1 ? 's' : ''} selected
          </Text>
        )}

        <StashBubble message="Pick what sounds right. I'll work these into your plan and look for savings." />

        {/* CTA */}
        <TouchableOpacity
          style={[styles.primaryBtn, selected.size === 0 && styles.primaryBtnDim]}
          onPress={handleAddSelected}
        >
          <Text style={styles.primaryBtnText}>
            {selected.size > 0
              ? `Add ${selected.size} Item${selected.size !== 1 ? 's' : ''} to Plan`
              : 'Add Selected Items'}
          </Text>
          <Feather name="arrow-right" size={18} color={WHITE} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => navigation.navigate('SmartStarterCart')}
        >
          <Text style={styles.skipText}>Skip — build cart from scratch</Text>
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
    fontSize: 28,
    color: NAVY,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 8,
  },
  sub: { fontSize: 15, color: GRAY, lineHeight: 22, fontWeight: '300', marginBottom: 20 },

  categoryRow: { gap: 8, paddingBottom: 4, marginBottom: 20 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  catChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  catText: { fontSize: 13, fontWeight: '500', color: GRAY },
  catTextActive: { color: WHITE, fontWeight: '700' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  stapleCard: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    position: 'relative',
    minWidth: 90,
  },
  stapleCardSelected: {
    borderColor: GREEN,
    backgroundColor: MINT,
  },
  stapleEmoji: { fontSize: 24 },
  stapleLabel: { fontSize: 12, fontWeight: '500', color: NAVY, textAlign: 'center' },
  stapleLabelSelected: { color: GREEN, fontWeight: '700' },
  checkMark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectedCount: {
    fontSize: 13,
    color: GREEN,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },

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
    marginBottom: 12,
  },
  primaryBtnDim: { opacity: 0.6 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },

  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 13, color: GRAY, fontWeight: '500' },
});
