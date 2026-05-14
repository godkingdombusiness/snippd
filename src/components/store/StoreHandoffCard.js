import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';
var AMBER  = '#F59E0B';

function StoreHandoffCard(props) {
  var store       = props.store;
  var onViewList  = props.onViewList;
  var isUberEats  = props.isUberEats;

  var initial = (store.store_name || 'ST').slice(0, 2).toUpperCase();

  return (
    <View style={[styles.card, isUberEats && styles.cardUber]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={[styles.badge, isUberEats && styles.badgeUber]}>
          <Text style={[styles.badgeText, isUberEats && styles.badgeTextUber]}>{initial}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.storeName}>{store.store_name}</Text>
          {isUberEats ? (
            <View style={styles.sandboxPill}>
              <Text style={styles.sandboxText}>Sandbox testing</Text>
            </View>
          ) : (
            <Text style={styles.itemCount}>{store.item_count || 0} items</Text>
          )}
        </View>
        {!isUberEats && (
          <View style={styles.totalWrap}>
            <Text style={styles.totalAmount}>
              {'$' + ((store.estimated_total_cents || 0) / 100).toFixed(2)}
            </Text>
            {store.savings_cents > 0 && (
              <Text style={styles.savingsLabel}>
                {'Save $' + (store.savings_cents / 100).toFixed(2)}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Supports row */}
      {store.supports_label && !isUberEats && (
        <Text style={styles.supportsLabel}>{store.supports_label}</Text>
      )}

      {isUberEats && (
        <Text style={styles.uberDesc}>
          Available for Eat Out Smart handoff. Open in the Uber Eats app to browse options near you.
        </Text>
      )}

      {/* CTA */}
      <TouchableOpacity
        style={[styles.ctaBtn, isUberEats && styles.ctaBtnUber]}
        onPress={onViewList}
        activeOpacity={0.85}
      >
        <Feather
          name={isUberEats ? 'external-link' : 'list'}
          size={14}
          color={isUberEats ? WHITE : GREEN}
        />
        <Text style={[styles.ctaText, isUberEats && styles.ctaTextUber]}>
          {isUberEats ? 'Open in Uber Eats' : 'View ' + store.store_name + ' List'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

var styles = StyleSheet.create({
  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
  },
  cardUber: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  badge: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: MINT,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  badgeUber:     { backgroundColor: '#FEF3C7' },
  badgeText:     { fontSize: 13, fontWeight: '900', color: GREEN },
  badgeTextUber: { color: AMBER },
  headerInfo: { flex: 1 },
  storeName:  { fontSize: 15, fontWeight: '700', color: NAVY, marginBottom: 3 },
  itemCount:  { fontSize: 12, color: GRAY },
  sandboxPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sandboxText:  { fontSize: 10, fontWeight: '700', color: '#92400E' },
  totalWrap:    { alignItems: 'flex-end' },
  totalAmount:  { fontSize: 16, fontWeight: '800', color: NAVY },
  savingsLabel: { fontSize: 11, color: GREEN, fontWeight: '600' },
  supportsLabel: { fontSize: 12, color: GRAY, marginBottom: 12, lineHeight: 17 },
  uberDesc:     { fontSize: 13, color: '#92400E', lineHeight: 19, marginBottom: 12 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 12,
    paddingVertical: 11,
    backgroundColor: WHITE,
  },
  ctaBtnUber:  { backgroundColor: AMBER, borderColor: AMBER },
  ctaText:     { fontSize: 14, fontWeight: '700', color: GREEN },
  ctaTextUber: { color: WHITE },
});

export default StoreHandoffCard;
