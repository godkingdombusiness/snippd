/**
 * AddNeedsScreen — Lets users type items they already know they need this week.
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Platform,
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

function StashBubble({ message }) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}><Text style={styles.stashIconText}>✦</Text></View>
      <Text style={styles.stashText}>{message}</Text>
    </View>
  );
}

function ItemChip({ label, onRemove }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="x" size={13} color={GREEN} />
      </TouchableOpacity>
    </View>
  );
}

export default function AddNeedsScreen({ navigation }) {
  const [inputText, setInputText] = useState('');
  const [items, setItems] = useState([]);

  function addItem() {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    const newItems = trimmed
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    setItems(prev => [...prev, ...newItems.filter(i => !prev.includes(i))]);
    setInputText('');
  }

  function removeItem(label) {
    setItems(prev => prev.filter(i => i !== label));
  }

  function handleContinue() {
    navigation.navigate('SmartStarterCart', { addedItems: items });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Header */}
        <Text style={styles.headline}>What do you need this week?</Text>
        <Text style={styles.sub}>
          Add anything you already know you need. Snippd will build around it.
        </Text>

        {/* Search/input */}
        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <Feather name="search" size={16} color={GRAY} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="milk, eggs, chicken, pasta, snacks..."
              placeholderTextColor="rgba(107,114,128,0.5)"
              returnKeyType="done"
              onSubmitEditing={addItem}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={GREEN}
              {...Platform.select({ web: { outline: 'none' } })}
            />
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={addItem}>
            <Feather name="plus" size={18} color={WHITE} />
          </TouchableOpacity>
        </View>

        {/* Chips */}
        {items.length > 0 && (
          <View style={styles.chipWrap}>
            {items.map(item => (
              <ItemChip key={item} label={item} onRemove={() => removeItem(item)} />
            ))}
          </View>
        )}

        {/* Quick-add suggestions */}
        <Text style={styles.sectionLabel}>Quick add</Text>
        <View style={styles.suggestions}>
          {['Milk', 'Eggs', 'Chicken', 'Bread', 'Bananas', 'Rice', 'Pasta', 'Yogurt'].map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.suggestionChip, items.includes(s) && styles.suggestionChipActive]}
              onPress={() => {
                if (!items.includes(s)) setItems(prev => [...prev, s]);
              }}
            >
              <Text style={[
                styles.suggestionText,
                items.includes(s) && styles.suggestionTextActive,
              ]}>
                {s}
              </Text>
              {items.includes(s) && (
                <Feather name="check" size={11} color={GREEN} style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <StashBubble message="Add anything that comes to mind. I'll help you organize it into a smarter plan." />

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('UsualStaples')}
          >
            <Feather name="list" size={16} color={GREEN} />
            <Text style={styles.secondaryBtnText}>Use My Usual Staples</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('SmartStarterCart', { addedItems: items })}
          >
            <Feather name="zap" size={16} color={GREEN} />
            <Text style={styles.secondaryBtnText}>Build Smart Starter Cart</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, items.length === 0 && styles.primaryBtnDim]}
            onPress={handleContinue}
          >
            <Text style={styles.primaryBtnText}>
              {items.length > 0 ? `Continue with ${items.length} item${items.length !== 1 ? 's' : ''}` : 'Continue'}
            </Text>
            <Feather name="arrow-right" size={18} color={WHITE} />
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
    marginBottom: 8,
  },
  sub: { fontSize: 15, color: GRAY, lineHeight: 22, fontWeight: '300', marginBottom: 24 },

  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  input: { flex: 1, fontSize: 14, color: NAVY },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MINT,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  chipText: { fontSize: 13, color: NAVY, fontWeight: '500' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  suggestionChipActive: {
    backgroundColor: MINT,
    borderColor: '#C8E6C9',
  },
  suggestionText: { fontSize: 13, color: GRAY },
  suggestionTextActive: { color: GREEN, fontWeight: '600' },

  stash: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: MINT,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    marginBottom: 28,
  },
  stashIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stashIconText: { color: WHITE, fontSize: 14, fontWeight: '700' },
  stashText: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 21 },

  actions: { gap: 12 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: GREEN,
    paddingVertical: 14,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: GREEN },
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
  primaryBtnDim: { opacity: 0.6 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },
});
