/**
 * SmartStarterCartScreen — AI-generated starter cart built around
 * the user's budget, stores, goals, and household habits.
 *
 * Uses seeded data. User reviews sections and taps "Review My Plan".
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

const SEEDED_CART = [
  {
    section: 'Must-Have Staples',
    icon: 'anchor',
    items: [
      { name: 'Eggs (18 ct)',        price: '$3.49',  store: 'Aldi',          savings: null },
      { name: 'Whole Milk (1 gal)',  price: '$3.89',  store: 'Aldi',          savings: null },
      { name: 'Bananas (3 lb)',      price: '$1.29',  store: 'Aldi',          savings: null },
      { name: 'Butter (1 lb)',       price: '$4.29',  store: 'Aldi',          savings: null },
    ],
  },
  {
    section: 'Smart Savings',
    icon: 'tag',
    items: [
      { name: 'Chicken Breast (3 lb)', price: '$8.74', store: 'Publix',  savings: 'BOGO 50% off' },
      { name: 'Strawberries (1 lb)',   price: '$1.99', store: 'Publix',  savings: 'BOGO' },
      { name: 'Greek Yogurt (32 oz)',  price: '$4.49', store: 'Publix',  savings: '$1.00 off' },
    ],
  },
  {
    section: 'Meal Builders',
    icon: 'layers',
    items: [
      { name: 'Ground Turkey (1 lb)', price: '$5.29', store: 'Aldi',   savings: null },
      { name: 'Pasta (16 oz)',        price: '$1.19', store: 'Aldi',   savings: null },
      { name: 'Tomato Sauce (24 oz)', price: '$1.89', store: 'Aldi',   savings: null },
      { name: 'Rice (2 lb)',          price: '$2.49', store: 'Aldi',   savings: null },
    ],
  },
  {
    section: 'Quick Backup Meals',
    icon: 'clock',
    items: [
      { name: 'Frozen Stir Fry Veggies', price: '$2.99', store: 'Aldi',         savings: null },
      { name: 'Whole Grain Bread',       price: '$3.49', store: 'Publix',        savings: null },
      { name: 'Peanut Butter (16 oz)',   price: '$3.79', store: 'Dollar General', savings: '$0.50 off' },
    ],
  },
  {
    section: 'Eat-Out Defense',
    icon: 'shield',
    items: [
      { name: 'Rotisserie Chicken',    price: '$6.99', store: 'Publix',  savings: null },
      { name: 'Pre-washed Salad Mix', price: '$2.99', store: 'Aldi',    savings: null },
      { name: 'Frozen Pizza (2-pk)',   price: '$5.49', store: 'Aldi',    savings: null },
    ],
  },
  {
    section: 'Household Items',
    icon: 'home',
    items: [
      { name: 'Paper Towels (6-roll)',      price: '$5.25', store: 'Dollar General', savings: '$1.00 off' },
      { name: 'Laundry Detergent (50 oz)',  price: '$7.95', store: 'Dollar General', savings: null },
      { name: 'Dish Soap',                  price: '$2.50', store: 'Dollar General', savings: null },
    ],
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

function SectionBlock({ section, icon, items, removedIds, onRemove }) {
  const [collapsed, setCollapsed] = useState(false);
  const visibleItems = items.filter((_, i) => !removedIds.has(`${section}-${i}`));
  if (visibleItems.length === 0) return null;

  return (
    <View style={styles.sectionCard}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setCollapsed(c => !c)}
        activeOpacity={0.8}
      >
        <View style={styles.sectionIconWrap}>
          <Feather name={icon} size={15} color={GREEN} />
        </View>
        <Text style={styles.sectionTitle}>{section}</Text>
        <Text style={styles.sectionCount}>{visibleItems.length}</Text>
        <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={GRAY} />
      </TouchableOpacity>
      {!collapsed && (
        <View style={styles.itemList}>
          {items.map((item, idx) => {
            const key = `${section}-${idx}`;
            if (removedIds.has(key)) return null;
            return (
              <View key={key} style={styles.itemRow}>
                <View style={styles.itemMain}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemStore}>{item.store}</Text>
                    {item.savings && (
                      <View style={styles.savingsBadge}>
                        <Text style={styles.savingsText}>{item.savings}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={styles.itemPrice}>{item.price}</Text>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => onRemove(key)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={14} color={GRAY} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function SmartStarterCartScreen({ navigation, route }) {
  const addedItems = route?.params?.addedItems ?? [];
  const [removedIds, setRemovedIds] = useState(new Set());

  function removeItem(key) {
    setRemovedIds(prev => new Set([...prev, key]));
  }

  const totalItems = SEEDED_CART.reduce((sum, s) => sum + s.items.length, 0) - removedIds.size;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headline}>Here's a smart starting point.</Text>
          <Text style={styles.sub}>
            Built around your budget, stores, goals, and household habits.
          </Text>
        </View>

        {/* Summary strip */}
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>$56.71</Text>
            <Text style={styles.summaryLabel}>Est. spend</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: GREEN }]}>$14.25</Text>
            <Text style={styles.summaryLabel}>Savings found</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalItems}</Text>
            <Text style={styles.summaryLabel}>Items</Text>
          </View>
        </View>

        {/* User-added items notice */}
        {addedItems.length > 0 && (
          <View style={styles.addedNotice}>
            <Feather name="check-circle" size={16} color={GREEN} />
            <Text style={styles.addedNoticeText}>
              Added {addedItems.length} item{addedItems.length !== 1 ? 's' : ''} you requested
            </Text>
          </View>
        )}

        {/* Sections */}
        {SEEDED_CART.map(s => (
          <SectionBlock
            key={s.section}
            section={s.section}
            icon={s.icon}
            items={s.items}
            removedIds={removedIds}
            onRemove={removeItem}
          />
        ))}

        <StashBubble
          message="You can remove anything that doesn't feel right. I'll adjust the plan around what you keep."
        />

        {/* CTA */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('PlanReview')}
        >
          <Text style={styles.primaryBtnText}>Review My Plan</Text>
          <Feather name="arrow-right" size={18} color={WHITE} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('AddNeeds')}
        >
          <Text style={styles.secondaryBtnText}>Add more items</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  scroll: { padding: 24, paddingBottom: 40 },
  backBtn: { marginBottom: 20, alignSelf: 'flex-start' },

  header: { marginBottom: 20 },
  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 28,
    color: NAVY,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 8,
  },
  sub: { fontSize: 15, color: GRAY, lineHeight: 22, fontWeight: '300' },

  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '700', color: NAVY, marginBottom: 2 },
  summaryLabel: { fontSize: 11, color: GRAY },
  summaryDivider: { width: 1, backgroundColor: BORDER, marginHorizontal: 8 },

  addedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: MINT,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  addedNoticeText: { fontSize: 13, color: GREEN, fontWeight: '500' },

  sectionCard: {
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  sectionIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: NAVY },
  sectionCount: {
    fontSize: 12, fontWeight: '600', color: GREEN,
    backgroundColor: MINT, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },

  itemList: { borderTopWidth: 1, borderTopColor: BORDER },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    gap: 10,
  },
  itemMain: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '500', color: NAVY, marginBottom: 3 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemStore: { fontSize: 11, color: GRAY },
  savingsBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  savingsText: { fontSize: 10, color: '#92400E', fontWeight: '600' },
  itemPrice: { fontSize: 14, fontWeight: '700', color: NAVY, minWidth: 44, textAlign: 'right' },
  removeBtn: { padding: 4 },

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
  secondaryBtnText: { fontSize: 14, color: GREEN, fontWeight: '600' },
});
