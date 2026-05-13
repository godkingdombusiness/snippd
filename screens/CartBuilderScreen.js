/**
 * CartBuilderScreen — Organizes approved plan items by store.
 * Users can Keep, Swap, or Remove each item before finalizing.
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

const SEEDED_STORES = [
  {
    id: 'aldi',
    name: 'Aldi',
    tagline: 'Best for basics and protein',
    icon: '🛒',
    total: '$68.21',
    items: [
      { id: 'a1', name: 'Eggs (18 ct)',           price: '$3.49',  savings: null },
      { id: 'a2', name: 'Whole Milk (1 gal)',      price: '$3.89',  savings: null },
      { id: 'a3', name: 'Bananas (3 lb)',          price: '$1.29',  savings: null },
      { id: 'a4', name: 'Ground Turkey (1 lb)',    price: '$5.29',  savings: null },
      { id: 'a5', name: 'Pasta (16 oz)',           price: '$1.19',  savings: null },
      { id: 'a6', name: 'Tomato Sauce',            price: '$1.89',  savings: null },
      { id: 'a7', name: 'Rice (2 lb)',             price: '$2.49',  savings: null },
      { id: 'a8', name: 'Frozen Stir Fry',         price: '$2.99',  savings: null },
      { id: 'a9', name: 'Pre-washed Salad Mix',    price: '$2.99',  savings: null },
      { id: 'a10', name: 'Frozen Pizza (2-pk)',    price: '$5.49',  savings: null },
    ],
  },
  {
    id: 'publix',
    name: 'Publix',
    tagline: 'Best for BOGO and produce',
    icon: '🏪',
    total: '$72.48',
    items: [
      { id: 'p1', name: 'Chicken Breast (3 lb)',  price: '$8.74',  savings: 'BOGO 50%' },
      { id: 'p2', name: 'Strawberries (1 lb)',    price: '$1.99',  savings: 'BOGO' },
      { id: 'p3', name: 'Greek Yogurt (32 oz)',   price: '$4.49',  savings: '$1.00 off' },
      { id: 'p4', name: 'Rotisserie Chicken',     price: '$6.99',  savings: null },
      { id: 'p5', name: 'Whole Grain Bread',      price: '$3.49',  savings: null },
      { id: 'p6', name: 'Butter (1 lb)',          price: '$4.29',  savings: null },
    ],
  },
  {
    id: 'dg',
    name: 'Dollar General',
    tagline: 'Best for household items',
    icon: '🏬',
    total: '$27.71',
    items: [
      { id: 'd1', name: 'Paper Towels (6-roll)',      price: '$5.25',  savings: '$1.00 off' },
      { id: 'd2', name: 'Laundry Detergent (50 oz)',  price: '$7.95',  savings: null },
      { id: 'd3', name: 'Dish Soap',                  price: '$2.50',  savings: null },
      { id: 'd4', name: 'Peanut Butter (16 oz)',      price: '$3.79',  savings: '$0.50 off' },
    ],
  },
];

const SWAP_OPTIONS = {
  a4: { name: 'Ground Beef (1 lb)',   price: '$6.49' },
  p1: { name: 'Canned Tuna (5-pk)',   price: '$5.99' },
  a2: { name: 'Almond Milk (64 oz)',  price: '$4.29' },
};

function StashBubble({ message }) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}><Text style={styles.stashIconText}>✦</Text></View>
      <Text style={styles.stashText}>{message}</Text>
    </View>
  );
}

function ItemRow({ item, status, onKeep, onSwap, onRemove }) {
  if (status === 'removed') return null;

  const swapped = status === 'swapped' && SWAP_OPTIONS[item.id];

  return (
    <View style={[styles.itemRow, status === 'swapped' && styles.itemRowSwapped]}>
      <View style={styles.itemMain}>
        <Text style={[styles.itemName, status === 'swapped' && { textDecorationLine: 'line-through', color: GRAY }]}>
          {item.name}
        </Text>
        {swapped && (
          <Text style={styles.swappedFor}>→ {swapped.name}</Text>
        )}
        {item.savings && (
          <View style={styles.savingsBadge}>
            <Text style={styles.savingsText}>{item.savings}</Text>
          </View>
        )}
      </View>
      <Text style={styles.itemPrice}>
        {swapped ? swapped.price : item.price}
      </Text>
      <View style={styles.itemActions}>
        {status !== 'kept' ? (
          <TouchableOpacity style={styles.keepBtn} onPress={onKeep}>
            <Text style={styles.keepBtnText}>Keep</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.keptBadge}>
            <Feather name="check" size={12} color={GREEN} />
          </View>
        )}
        {SWAP_OPTIONS[item.id] && status !== 'swapped' && (
          <TouchableOpacity style={styles.swapBtn} onPress={onSwap}>
            <Text style={styles.swapBtnText}>Swap</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={14} color={GRAY} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StoreBlock({ store, itemStatuses, onKeep, onSwap, onRemove }) {
  const visibleItems = store.items.filter(i => itemStatuses[i.id] !== 'removed');
  if (visibleItems.length === 0) return null;

  return (
    <View style={styles.storeCard}>
      <View style={styles.storeHeader}>
        <Text style={styles.storeEmoji}>{store.icon}</Text>
        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>{store.name}</Text>
          <Text style={styles.storeTagline}>{store.tagline}</Text>
        </View>
        <Text style={styles.storeTotal}>{store.total}</Text>
      </View>
      <View style={styles.storeItems}>
        {store.items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            status={itemStatuses[item.id] ?? 'default'}
            onKeep={() => onKeep(item.id)}
            onSwap={() => onSwap(item.id)}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </View>
    </View>
  );
}

export default function CartBuilderScreen({ navigation }) {
  const [itemStatuses, setItemStatuses] = useState({});

  function setStatus(id, status) {
    setItemStatuses(prev => ({ ...prev, [id]: status }));
  }

  const totalKept = Object.values(itemStatuses).filter(s => s === 'kept').length;
  const totalItems = SEEDED_STORES.reduce((sum, s) => sum + s.items.length, 0);
  const totalRemoved = Object.values(itemStatuses).filter(s => s === 'removed').length;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Header */}
        <Text style={styles.headline}>Your cart is almost ready.</Text>
        <Text style={styles.sub}>
          Snippd grouped your items by store, savings, and meal use. Review each before you shop.
        </Text>

        {/* Progress bar */}
        <View style={styles.progressCard}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>{totalItems - totalRemoved} items in cart</Text>
            {totalRemoved > 0 && (
              <Text style={styles.progressRemoved}>{totalRemoved} removed</Text>
            )}
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(10, ((totalItems - totalRemoved) / totalItems) * 100)}%` }]} />
          </View>
        </View>

        {/* Store blocks */}
        {SEEDED_STORES.map(store => (
          <StoreBlock
            key={store.id}
            store={store}
            itemStatuses={itemStatuses}
            onKeep={id => setStatus(id, 'kept')}
            onSwap={id => setStatus(id, 'swapped')}
            onRemove={id => setStatus(id, 'removed')}
          />
        ))}

        <StashBubble
          message="Your cart is a guide — not a locked order. Adjust anything at the store. I'll learn from what you actually buy."
        />

        {/* Finish */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('ReceiptPrompt')}
        >
          <Text style={styles.primaryBtnText}>Finish — I'm ready to shop</Text>
          <Feather name="shopping-cart" size={18} color={WHITE} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainApp' }] })}
        >
          <Text style={styles.secondaryBtnText}>Save and go to dashboard</Text>
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
  sub: { fontSize: 15, color: GRAY, lineHeight: 22, fontWeight: '300', marginBottom: 20 },

  progressCard: {
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 20,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 13, fontWeight: '600', color: NAVY },
  progressRemoved: { fontSize: 12, color: CORAL },
  progressTrack: { height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: GREEN },

  storeCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  storeEmoji: { fontSize: 24 },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 16, fontWeight: '700', color: NAVY },
  storeTagline: { fontSize: 12, color: GRAY, marginTop: 1 },
  storeTotal: { fontSize: 16, fontWeight: '700', color: GREEN },

  storeItems: {},
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    gap: 10,
  },
  itemRowSwapped: { backgroundColor: '#FFFBEB' },
  itemMain: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '500', color: NAVY, marginBottom: 3 },
  swappedFor: { fontSize: 13, color: GREEN, fontWeight: '500', marginBottom: 3 },
  savingsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  savingsText: { fontSize: 10, color: '#92400E', fontWeight: '600' },
  itemPrice: { fontSize: 14, fontWeight: '700', color: NAVY, minWidth: 44, textAlign: 'right' },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keepBtn: {
    backgroundColor: MINT,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  keepBtnText: { fontSize: 11, fontWeight: '600', color: GREEN },
  keptBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
  },
  swapBtn: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  swapBtnText: { fontSize: 11, fontWeight: '600', color: '#92400E' },
  removeBtn: { padding: 2 },

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
    marginTop: 8,
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
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },
  secondaryBtn: { alignItems: 'center', paddingVertical: 10 },
  secondaryBtnText: { fontSize: 14, color: GRAY, fontWeight: '500' },
});
