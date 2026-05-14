import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tracker } from '../src/lib/eventTracker';

// ── Brand colors ──────────────────────────────────────────────────────────────

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var CORAL  = '#fb5b5b';
var AMBER  = '#F59E0B';

// ── Seeded pantry data ────────────────────────────────────────────────────────

var SEEDED_PANTRY = [
  { id: 'p1', item_name: 'White rice',      quantity: '2 cups',          confidence: 'confirmed',    category: 'Grains' },
  { id: 'p2', item_name: 'Broccoli',        quantity: '2 cups',          confidence: 'confirmed',    category: 'Produce' },
  { id: 'p3', item_name: 'Eggs',            quantity: '6',               confidence: 'confirmed',    category: 'Protein' },
  { id: 'p4', item_name: 'Pasta',           quantity: '1 box',           confidence: 'confirmed',    category: 'Grains' },
  { id: 'p5', item_name: 'Garlic',          quantity: 'several cloves',  confidence: 'likely',       category: 'Produce' },
  { id: 'p6', item_name: 'Olive oil',       quantity: 'partial bottle',  confidence: 'likely',       category: 'Pantry' },
  { id: 'p7', item_name: 'Soy sauce',       quantity: 'partial bottle',  confidence: 'likely',       category: 'Pantry' },
  { id: 'p8', item_name: 'Canned tomatoes', quantity: '1 can',           confidence: 'needs_review', category: 'Pantry' },
];

var FILTER_OPTIONS = [
  { key: 'all',          label: 'All' },
  { key: 'confirmed',    label: 'Confirmed' },
  { key: 'likely',       label: 'Likely' },
  { key: 'needs_review', label: 'Needs Review' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceBadgeStyle(confidence) {
  if (confidence === 'confirmed')    return { bg: '#D1FAE5', text: GREEN };
  if (confidence === 'likely')       return { bg: '#FEF3C7', text: AMBER };
  if (confidence === 'needs_review') return { bg: '#FFE4E4', text: CORAL };
  return { bg: '#F3F4F6', text: GRAY };
}

function confidenceLabel(confidence) {
  if (confidence === 'confirmed')    return 'Confirmed';
  if (confidence === 'likely')       return 'Likely';
  if (confidence === 'needs_review') return 'Needs Review';
  return confidence;
}

// ── Module-scope render helpers ───────────────────────────────────────────────

function renderNavBar(navigation) {
  return (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={function() { navigation.goBack(); }} style={styles.backBtn} activeOpacity={0.7}>
        <Feather name="chevron-left" size={24} color={NAVY} />
      </TouchableOpacity>
      <Text style={styles.navTitle}>Pantry Inventory</Text>
      <View style={styles.navSpacer} />
    </View>
  );
}

function renderFilterChips(activeFilter, onSelect) {
  return (
    <View style={styles.filterRow}>
      {FILTER_OPTIONS.map(function(opt) {
        var active = activeFilter === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={function() { onSelect(opt.key); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function renderSummaryStrip(items) {
  var confirmed   = items.filter(function(i) { return i.confidence === 'confirmed'; }).length;
  var likely      = items.filter(function(i) { return i.confidence === 'likely'; }).length;
  var needsReview = items.filter(function(i) { return i.confidence === 'needs_review'; }).length;
  return (
    <View style={styles.summaryStrip}>
      <Text style={styles.summaryItem}>
        <Text style={[styles.summaryCount, { color: GREEN }]}>{confirmed}</Text>
        <Text style={styles.summaryLabel}> confirmed</Text>
      </Text>
      <Text style={styles.summaryDot}>·</Text>
      <Text style={styles.summaryItem}>
        <Text style={[styles.summaryCount, { color: AMBER }]}>{likely}</Text>
        <Text style={styles.summaryLabel}> likely</Text>
      </Text>
      <Text style={styles.summaryDot}>·</Text>
      <Text style={styles.summaryItem}>
        <Text style={[styles.summaryCount, { color: CORAL }]}>{needsReview}</Text>
        <Text style={styles.summaryLabel}> need review</Text>
      </Text>
    </View>
  );
}

function PantryItemRow(item, onRemove) {
  var badge = confidenceBadgeStyle(item.confidence);
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.item_name}</Text>
        <Text style={styles.itemQuantity}>{item.quantity}</Text>
      </View>
      <View style={[styles.confidenceBadge, { backgroundColor: badge.bg }]}>
        <Text style={[styles.confidenceBadgeText, { color: badge.text }]}>
          {confidenceLabel(item.confidence)}
        </Text>
      </View>
      <TouchableOpacity style={styles.removeBtn} onPress={function() { onRemove(item.id); }} activeOpacity={0.7}>
        <Feather name="x" size={16} color={GRAY} />
      </TouchableOpacity>
    </View>
  );
}

function renderEmptyState() {
  return (
    <View style={styles.emptyState}>
      <Feather name="package" size={40} color={BORDER} />
      <Text style={styles.emptyTitle}>No items match this filter</Text>
    </View>
  );
}

function renderBottomCTA(items, navigation) {
  return (
    <View style={styles.ctaContainer}>
      <TouchableOpacity
        style={styles.secondaryBtn}
        activeOpacity={0.85}
        onPress={function() { navigation.navigate('PantryScan'); }}
      >
        <Feather name="camera" size={16} color={NAVY} style={{ marginRight: 6 }} />
        <Text style={styles.secondaryBtnText}>Scan More Items</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.primaryBtn}
        activeOpacity={0.85}
        onPress={function() {
          tracker.track('pantry_cook_options_opened', {});
          var confirmed = items.filter(function(i) { return i.confidence !== 'needs_review'; });
          navigation.navigate('PantryCookOptions', { pantryItems: confirmed });
        }}
      >
        <Text style={styles.primaryBtnText}>See What I Can Make</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PantryInventoryScreen({ navigation }) {
  var [items, setItems]               = useState(SEEDED_PANTRY);
  var [activeFilter, setActiveFilter] = useState('all');

  useEffect(function() {
    tracker.track('pantry_inventory_viewed', { item_count: SEEDED_PANTRY.length });
  }, []);

  function handleRemove(id) {
    setItems(function(prev) { return prev.filter(function(i) { return i.id !== id; }); });
  }

  var filteredItems = activeFilter === 'all'
    ? items
    : items.filter(function(i) { return i.confidence === activeFilter; });

  function renderItem(info) {
    return PantryItemRow(info.item, handleRemove);
  }

  function keyExtractor(item) {
    return item.id;
  }

  function renderListHeader() {
    return (
      <View>
        {renderFilterChips(activeFilter, setActiveFilter)}
        {renderSummaryStrip(items)}
      </View>
    );
  }

  function renderListFooter() {
    return renderBottomCTA(items, navigation);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderNavBar(navigation)}
      <FlatList
        data={filteredItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={renderListHeader}
        ListFooterComponent={renderListFooter}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

var styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: CREAM },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },

  // NavBar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: NAVY },
  navSpacer: { width: 32 },

  // Filter chips
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 16,
    paddingBottom: 10,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  filterChipActive: { backgroundColor: NAVY, borderColor: NAVY },
  filterChipText: { fontSize: 13, fontWeight: '600', color: GRAY },
  filterChipTextActive: { color: WHITE },

  // Summary strip
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 6,
  },
  summaryItem: { flexDirection: 'row', alignItems: 'baseline' },
  summaryCount: { fontSize: 16, fontWeight: '800' },
  summaryLabel: { fontSize: 13, color: GRAY },
  summaryDot: { fontSize: 14, color: BORDER, marginHorizontal: 8 },

  // Item row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 2 },
  itemQuantity: { fontSize: 12, color: GRAY },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  confidenceBadgeText: { fontSize: 11, fontWeight: '700' },
  removeBtn: { padding: 4 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 15, color: GRAY, marginTop: 12, fontWeight: '600' },

  // CTA
  ctaContainer: { marginTop: 16, gap: 10 },
  primaryBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: WHITE },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: NAVY,
    borderRadius: 14,
    paddingVertical: 13,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: NAVY },
});
