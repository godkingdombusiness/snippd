/**
 * SpecStackCard — v1.9.0
 *
 * Deal card for a single SpecItem from a SnippdStack.
 * Displays coupon_layers[], math box, rebates[], basket trigger,
 * and "Start clip session" CTA.
 *
 * Props:
 *   item           — SpecItem (from SnippdStack.items[])
 *   stack          — SnippdStack (optional — for basket trigger banner)
 *   onStartSession — () => void — navigate to ClipSessionScreen
 *   compact        — boolean (default false) — collapses math + layers
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

// ── Brand ──────────────────────────────────────────────────────────
const MINT       = '#E8F5E9';
const NAVY       = '#1A237E';
const GREEN      = '#2E7D32';
const CORAL      = '#FF7043';
const WHITE      = '#FFFFFF';
const BORDER     = '#E8E8E8';
const LIGHT_MINT = '#F0FBF0';
const AMBER      = '#FF8F00';

// ── Coupon tier colour map ─────────────────────────────────────────
const TIER = {
  PUBLIX_STORE: { bg: '#E3F2FD', acc: '#1565C0', label: 'Publix Store', order: '1st' },
  MFR_COUPON:   { bg: '#FFF3E0', acc: '#E65100', label: 'Manufacturer', order: '2nd' },
  DIGITAL:      { bg: '#F3E5F5', acc: '#6A1B9A', label: 'Digital',      order: 'Auto' },
  LOYALTY:      { bg: '#E8F5E9', acc: '#2E7D32', label: 'Loyalty',      order: '—' },
  BOGO:         { bg: '#FFF8E1', acc: '#F57F17', label: 'BOGO',         order: '—' },
  B1G2:         { bg: '#FFF8E1', acc: '#F57F17', label: 'B1G2',         order: '—' },
  MULTI:        { bg: '#F1F8E9', acc: '#33691E', label: 'Multi',        order: '—' },
};

const REBATE_TIER = {
  ibotta:      { bg: '#FFF3E0', acc: '#BF360C', label: 'Ibotta' },
  fetch:       { bg: '#E8EAF6', acc: '#283593', label: 'Fetch' },
  swagbucks:   { bg: '#FCE4EC', acc: '#880E4F', label: 'Swagbucks' },
  checkout51:  { bg: '#E0F7FA', acc: '#006064', label: 'Checkout51' },
};

// ── Helpers ────────────────────────────────────────────────────────
const fmt   = (v) => `$${Number(v ?? 0).toFixed(2)}`;
const cents = (v) => fmt((v ?? 0) / 100);

function tierFor(type) {
  return TIER[type] ?? { bg: '#F5F5F5', acc: '#757575', label: type, order: '—' };
}

// ── Coupon chip bar ────────────────────────────────────────────────
function CouponChipBar({ layers }) {
  if (!layers?.length) return null;

  // Show only unique types (one chip per tier type)
  const seen = new Set();
  const chips = layers.filter(l => {
    if (seen.has(l.type)) return false;
    seen.add(l.type);
    return true;
  });

  return (
    <View style={styles.chipBar}>
      {chips.map((layer, i) => {
        const t = tierFor(layer.type);
        return (
          <View key={i} style={[styles.chip, { backgroundColor: t.bg, borderColor: t.acc }]}>
            <View style={[styles.chipBadge, { backgroundColor: t.acc }]}>
              <Text style={styles.chipBadgeText}>{t.label.charAt(0)}</Text>
            </View>
            <Text style={[styles.chipText, { color: t.acc }]}>
              −{fmt(layer.value)} {t.label}
            </Text>
            <Text style={styles.chipOrder}>{t.order}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Math box ───────────────────────────────────────────────────────
function MathBox({ item }) {
  const rebateDollars = (item.rebate_savings ?? 0);

  return (
    <View style={styles.mathBox}>
      <View style={styles.mathRow}>
        <Text style={styles.mathLabel}>Regular</Text>
        <Text style={[styles.mathValue, styles.strike]}>{fmt(item.original_price)}</Text>
      </View>
      {item.sale_price !== item.original_price && (
        <View style={styles.mathRow}>
          <Text style={styles.mathLabel}>Sale floor</Text>
          <Text style={styles.mathValue}>{fmt(item.sale_price)}</Text>
        </View>
      )}
      {(item.coupon_savings ?? 0) > 0 && (
        <View style={styles.mathRow}>
          <Text style={[styles.mathLabel, { color: GREEN }]}>Snippd saves</Text>
          <Text style={[styles.mathValue, { color: GREEN, fontWeight: '600' }]}>
            −{fmt(item.coupon_savings)}
          </Text>
        </View>
      )}
      <View style={[styles.mathRow, styles.mathFinalRow]}>
        <Text style={[styles.mathLabel, { fontWeight: '700', color: NAVY }]}>You pay</Text>
        <Text style={[styles.mathValue, { fontWeight: '800', color: NAVY, fontSize: 16 }]}>
          {fmt(item.pay_price)}
        </Text>
      </View>
      {rebateDollars > 0 && (
        <>
          <View style={styles.mathRow}>
            <Text style={[styles.mathLabel, { color: CORAL }]}>Rebates (after trip)</Text>
            <Text style={[styles.mathValue, { color: CORAL }]}>−{fmt(rebateDollars)}</Text>
          </View>
          <View style={styles.mathRow}>
            <Text style={[styles.mathLabel, { fontSize: 11, opacity: 0.5 }]}>True cost</Text>
            <Text style={[styles.mathValue, { fontSize: 11, opacity: 0.5 }]}>{fmt(item.true_cost)}</Text>
          </View>
        </>
      )}
      {!item.math_valid && item.math_error && (
        <View style={styles.mathErrRow}>
          <Feather name="alert-triangle" size={11} color={CORAL} />
          <Text style={styles.mathErrText}>{item.math_error}</Text>
        </View>
      )}
    </View>
  );
}

// ── Rebate list ────────────────────────────────────────────────────
function RebateList({ rebates }) {
  if (!rebates?.length) return null;
  return (
    <View style={styles.rebateList}>
      <Text style={styles.rebateListTitle}>Rebates — claim after purchase</Text>
      {rebates.map((r, i) => {
        const rt = REBATE_TIER[r.platform] ?? { bg: '#F5F5F5', acc: '#757575', label: r.platform };
        return (
          <View key={i} style={[styles.rebateRow, { backgroundColor: rt.bg }]}>
            <View style={[styles.chipBadge, { backgroundColor: rt.acc }]}>
              <Text style={styles.chipBadgeText}>{rt.label.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.mathLabel, { color: rt.acc, fontWeight: '700' }]}>{rt.label}</Text>
              <Text style={styles.rebateAction}>{r.action}</Text>
            </View>
            <Text style={[styles.mathValue, { color: CORAL, fontWeight: '700' }]}>
              {cents(r.value_cents)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Basket trigger banner ──────────────────────────────────────────
function BasketBanner({ stack }) {
  if (!stack?.basket_trigger_value) return null;

  if (stack.basket_filler_needed) {
    return (
      <View style={[styles.triggerBanner, { backgroundColor: AMBER }]}>
        <Feather name="alert-circle" size={13} color={WHITE} />
        <Text style={styles.triggerText}>
          Add {fmt(stack.basket_filler_gap)} more in qualifying brands to unlock{' '}
          {fmt(stack.basket_trigger_value)} basket discount
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.triggerBanner, { backgroundColor: GREEN }]}>
      <Feather name="zap" size={13} color={WHITE} />
      <Text style={styles.triggerText}>
        Basket trigger active — {fmt(stack.basket_trigger_value)} discount at register
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SpecStackCard
// ─────────────────────────────────────────────────────────────────────────

export default function SpecStackCard({
  item,
  stack = null,
  onStartSession,
  compact = false,
}) {
  const [expanded, setExpanded] = useState(!compact);

  if (!item) return null;

  const isBogo       = item.deal_types?.includes('BOGO');
  const isB1G2       = item.deal_types?.includes('B1G2');
  const hasCoupons   = item.coupon_layers?.length > 0;
  const hasRebates   = item.rebates?.length > 0;
  const couponSavings = item.coupon_savings ?? 0;
  const savingsPct   = item.savings_pct ?? 0;

  return (
    <View style={styles.card}>

      {/* Deal type badge (BOGO / B1G2 / deal_label) */}
      {(isBogo || isB1G2 || item.deal_label) && (
        <View style={styles.dealBadgeRow}>
          {(isBogo || isB1G2) && (
            <View style={[styles.dealBadge, { backgroundColor: CORAL }]}>
              <Text style={styles.dealBadgeText}>{isBogo ? 'BOGO' : 'B1G2'}</Text>
            </View>
          )}
          {item.deal_label && !(isBogo || isB1G2) && (
            <View style={[styles.dealBadge, { backgroundColor: '#EF6C00' }]}>
              <Text style={styles.dealBadgeText}>{item.deal_label}</Text>
            </View>
          )}
          {savingsPct > 0 && (
            <View style={[styles.dealBadge, { backgroundColor: GREEN }]}>
              <Text style={styles.dealBadgeText}>{Math.round(savingsPct)}% off</Text>
            </View>
          )}
        </View>
      )}

      {/* Card header */}
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => compact && setExpanded(e => !e)}
        activeOpacity={compact ? 0.7 : 1}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          {item.brand ? <Text style={styles.brandName}>{item.brand}</Text> : null}
          {item.size  ? <Text style={styles.sizeText}>{item.size}</Text>   : null}
        </View>

        <View style={styles.priceSummary}>
          <Text style={styles.payPrice}>{fmt(item.pay_price)}</Text>
          {couponSavings > 0 && (
            <Text style={styles.savingsLabel}>save {fmt(couponSavings)}</Text>
          )}
          {item.quantity > 1 && (
            <Text style={styles.qtyLabel}>qty {item.quantity}</Text>
          )}
        </View>

        {compact && (
          <Feather
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={NAVY}
            style={{ marginLeft: 6 }}
          />
        )}
      </TouchableOpacity>

      {/* Coupon chip bar — always visible if item has coupon layers */}
      {hasCoupons && <CouponChipBar layers={item.coupon_layers} />}

      {/* Basket trigger banner */}
      {stack && <BasketBanner stack={stack} />}

      {/* Expanded section */}
      {expanded && (
        <>
          <MathBox item={item} />

          {/* Coupon action list */}
          {hasCoupons && (
            <View style={styles.actionList}>
              <Text style={styles.actionListTitle}>Coupon actions</Text>
              {item.coupon_layers.map((layer, i) => {
                const t = tierFor(layer.type);
                const timingLabel = {
                  before_store:    'Before you leave home',
                  before_checkout: 'Clip in-app before checkout',
                  at_checkout:     'Auto-applied at register',
                }[layer.timing] ?? layer.timing;

                return (
                  <View key={i} style={[styles.actionRow, { backgroundColor: t.bg }]}>
                    <View style={[styles.chipBadge, { backgroundColor: t.acc }]}>
                      <Text style={styles.chipBadgeText}>{t.label.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.actionType, { color: t.acc }]}>{t.label}</Text>
                      <Text style={styles.actionDesc}>{layer.action}</Text>
                      <Text style={styles.actionTiming}>{timingLabel}</Text>
                    </View>
                    <Text style={[styles.actionValue, { color: t.acc }]}>−{fmt(layer.value)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Rebates */}
          {hasRebates && <RebateList rebates={item.rebates} />}

          {/* Rain check note */}
          {item.rain_check_note && (
            <View style={styles.rainCheck}>
              <Feather name="umbrella" size={12} color={NAVY} />
              <Text style={styles.rainCheckText}>{item.rain_check_note}</Text>
            </View>
          )}

          {/* DG doubling note */}
          {item.dg_double_eligible && (
            <View style={styles.dgNote}>
              <Feather name="chevrons-up" size={12} color={GREEN} />
              <Text style={styles.dgNoteText}>
                DG doubles this coupon — effective value {fmt(item.dg_doubled_value)}
              </Text>
            </View>
          )}
        </>
      )}

      {/* Start clip session CTA */}
      {onStartSession && (
        <TouchableOpacity style={styles.clipBtn} onPress={onStartSession}>
          <Feather name="scissors" size={15} color={WHITE} />
          <Text style={styles.clipBtnText}>Start clip session</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },

  // Deal badge row
  dealBadgeRow: { flexDirection: 'row', padding: 10, paddingBottom: 0, gap: 6 },
  dealBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  dealBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  // Card header
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, paddingTop: 10 },
  productName: { fontSize: 15, fontWeight: '700', color: NAVY },
  brandName:   { fontSize: 12, color: NAVY, opacity: 0.55, marginTop: 2 },
  sizeText:    { fontSize: 11, color: '#888', marginTop: 1 },
  priceSummary: { alignItems: 'flex-end', marginLeft: 10 },
  payPrice:    { fontSize: 18, fontWeight: '800', color: NAVY },
  savingsLabel: { fontSize: 11, color: GREEN, fontWeight: '600', marginTop: 2 },
  qtyLabel:    { fontSize: 10, color: '#888', marginTop: 2 },

  // Chip bar
  chipBar:   { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 8, gap: 6 },
  chip:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, gap: 5 },
  chipBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chipBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  chipText:  { fontSize: 12, fontWeight: '600' },
  chipOrder: { fontSize: 10, color: '#888' },

  // Basket trigger
  triggerBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  triggerText:   { color: '#FFF', fontSize: 12, fontWeight: '600', flex: 1 },

  // Math box
  mathBox:     { backgroundColor: LIGHT_MINT, margin: 12, marginTop: 4, borderRadius: 8, padding: 10 },
  mathRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  mathFinalRow: { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6, marginTop: 2 },
  mathLabel:   { fontSize: 13, color: NAVY, opacity: 0.75 },
  mathValue:   { fontSize: 13, color: NAVY, fontWeight: '600' },
  strike:      { textDecorationLine: 'line-through', opacity: 0.45 },
  mathErrRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  mathErrText: { fontSize: 11, color: CORAL, flex: 1 },

  // Coupon action list
  actionList:      { marginHorizontal: 12, marginBottom: 8 },
  actionListTitle: { fontSize: 12, fontWeight: '700', color: NAVY, opacity: 0.6, marginBottom: 6 },
  actionRow:       { flexDirection: 'row', alignItems: 'flex-start', padding: 8, borderRadius: 8, marginBottom: 4 },
  actionType:      { fontSize: 12, fontWeight: '700' },
  actionDesc:      { fontSize: 11, color: NAVY, opacity: 0.7, marginTop: 1 },
  actionTiming:    { fontSize: 10, color: '#888', marginTop: 2 },
  actionValue:     { fontSize: 13, fontWeight: '700' },

  // Rebate list
  rebateList:      { marginHorizontal: 12, marginBottom: 8 },
  rebateListTitle: { fontSize: 12, fontWeight: '700', color: NAVY, opacity: 0.6, marginBottom: 6 },
  rebateRow:       { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8, marginBottom: 4 },
  rebateAction:    { fontSize: 11, color: '#555', marginTop: 1 },

  // Rain check / DG note
  rainCheck:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 8, gap: 5, backgroundColor: '#E3F2FD', padding: 8, borderRadius: 6 },
  rainCheckText: { fontSize: 11, color: NAVY, flex: 1 },
  dgNote:        { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 8, gap: 5, backgroundColor: '#E8F5E9', padding: 8, borderRadius: 6 },
  dgNoteText:    { fontSize: 11, color: GREEN, flex: 1 },

  // CTA
  clipBtn:     { margin: 12, marginTop: 4, backgroundColor: GREEN, paddingVertical: 13, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  clipBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
