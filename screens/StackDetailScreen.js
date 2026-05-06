/**
 * StackDetailScreen — display-only. Zero frontend math.
 * All values come from the backend-generated stack object via route.params.stack.
 *
 * Expected stack shape (from app_home_feed or generate-stacks Cloud Run):
 * {
 *   store, title, stack_type, best_shop_window, expiration_date,
 *   final_out_of_pocket_cents, savings_percent, subtotal_cents,
 *   total_discounts_cents, confidence, instructions[],
 *   breakdown_list / stack_items: [
 *     { display_name, coupon_search_name, coupon_clip_instruction,
 *       coupon_status, price_cents, coupon_value_cents, final_price_cents,
 *       qty, deal_expiration_date }
 *   ]
 * }
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Share, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { resolveCouponActivationLink } from '../src/lib/retailerCouponLinks';

// ── Brand ─────────────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const FOREST     = '#04361D';
const NAVY       = '#1A237E';
const WHITE      = '#FFFFFF';
const MINT       = '#F0FBF0';
const MINT_DEEP  = '#E8F5E9';
const SLATE      = '#64748B';
const BORDER     = '#E2E8F0';
const CORAL      = '#FF7043';
const AMBER      = '#F59E0B';
const LIGHT_GRN  = '#DCFCE7';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCents(cents) {
  if (cents == null || isNaN(cents)) return '$—';
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function parseMaybeJson(val, fallback = []) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
}

function confidenceColor(c) {
  if (!c) return SLATE;
  if (c.toUpperCase() === 'HIGH')   return GREEN;
  if (c.toUpperCase() === 'MEDIUM') return AMBER;
  return CORAL;
}

function centsFrom(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 500 ? Math.round(n * 100) : Math.round(n);
}

function itemName(item) {
  return String(
    item.display_name ??
    item.displayName ??
    item.name ??
    item.item ??
    item.product_name ??
    'Item'
  );
}

function couponSearchName(item) {
  return item.coupon_search_name ?? item.couponSearchName ?? null;
}

function couponValueCents(item) {
  return centsFrom(item.coupon_value_cents ?? item.couponValueCents ?? item.coupon ?? 0);
}

function regularPriceCents(item) {
  return centsFrom(item.price_cents ?? item.regular_price_cents ?? item.regularPriceCents ?? item.regular_price ?? item.price);
}

function finalPriceCents(item) {
  return centsFrom(item.final_price_cents ?? item.finalPriceCents ?? item.final_price ?? item.pay_price ?? item.price);
}

function quantity(item) {
  const q = Number(item.qty ?? item.quantity ?? 1);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepRow({ number, text }) {
  return (
    <View style={s.stepRow}>
      <View style={s.stepNum}>
        <Text style={s.stepNumTxt}>{number}</Text>
      </View>
      <Text style={s.stepTxt}>{text}</Text>
    </View>
  );
}

async function openUrl(url) {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open link', 'Please try again from the retailer app or website.');
  }
}

function ItemRow({ item, retailer, checked, onToggle }) {
  const isCoupon = item.coupon_status === 'verified';
  const couponLink = resolveCouponActivationLink(item, retailer);
  const name = itemName(item);
  const searchName = couponSearchName(item);
  const regularCents = regularPriceCents(item);
  const finalCents = finalPriceCents(item) || regularCents;
  const couponCents = couponValueCents(item);
  const qty = quantity(item);
  return (
    <TouchableOpacity
      style={[s.itemRow, checked && s.itemRowChecked]}
      onPress={onToggle}
      activeOpacity={0.75}
    >
      {/* Checkbox */}
      <View style={[s.checkbox, checked && s.checkboxChecked]}>
        {checked && <Feather name="check" size={12} color={WHITE} />}
      </View>

      {/* Name + coupon search */}
      <View style={{ flex: 1 }}>
        <Text style={[s.itemName, checked && s.itemNameChecked]} numberOfLines={2}>
          {name}
        </Text>
        {searchName ? (
          <View style={s.couponRow}>
            <Feather name="scissors" size={11} color={isCoupon ? GREEN : SLATE} />
            <Text style={[s.couponSearchName, !isCoupon && { color: SLATE }]}>
              {searchName}
            </Text>
            {isCoupon && (
              <View style={s.verifiedBadge}>
                <Text style={s.verifiedTxt}>VERIFIED</Text>
              </View>
            )}
          </View>
        ) : null}
        {couponLink.url ? (
          <TouchableOpacity
            style={s.couponLinkBtn}
            onPress={() => openUrl(couponLink.url)}
            activeOpacity={0.85}
          >
            <Feather name="external-link" size={11} color={GREEN} />
            <Text style={s.couponLinkTxt}>{couponLink.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Pricing */}
      <View style={s.priceCol}>
        {regularCents > 0 && regularCents !== finalCents && (
          <Text style={s.strikePriceTxt}>{fmtCents(regularCents)}</Text>
        )}
        <Text style={[s.finalPriceTxt, { color: couponCents > 0 ? GREEN : NAVY }]}>
          {fmtCents(finalCents)}
        </Text>
        {qty > 1 && (
          <Text style={s.qtyTxt}>×{qty}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StackDetailScreen({ route, navigation }) {
  const stack = route?.params?.stack;
  const [checked, setChecked] = useState({});

  if (!stack) {
    return (
      <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Feather name="alert-circle" size={40} color={SLATE} />
        <Text style={{ color: SLATE, marginTop: 12 }}>No stack data available.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={{ color: GREEN, fontWeight: '700' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const items = parseMaybeJson(stack.breakdown_list ?? stack.stack_items ?? stack.items, []);
  const retailer = stack.retailer || stack.store || stack.retailer_key;
  const instructions = parseMaybeJson(stack.instructions, [
    `Open the ${stack.store || 'store'} app`,
    'Search each coupon name below and clip it',
    'Add exact items listed to your cart',
    'Verify prices in-store before checkout',
  ]);

  // All values are backend-provided — no computation here.
  const finalCents    = stack.final_out_of_pocket_cents ?? 0;
  const savingsPct    = stack.savings_percent ?? 0;
  const subtotalCents = stack.subtotal_cents ?? 0;
  const discountCents = stack.total_discounts_cents ?? 0;

  const toggleItem = (idx) => setChecked(prev => ({ ...prev, [idx]: !prev[idx] }));

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const allChecked = items.length > 0 && checkedCount === items.length;

  const handleAddAll = () => {
    navigation.navigate('ShoppingList', { stack });
  };

  const handleShare = async () => {
    const msg = `Snippd Deal Alert 🟢\n\n${stack.title || stack.store + ' Stack'}\n\nFinal: ${fmtCents(finalCents)} (save ${savingsPct}%)\n${stack.best_shop_window || ''}\n\nGenerated by Snippd — snippd.com`;
    try { await Share.share({ message: msg }); } catch { /* user cancelled */ }
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.navRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
              <Feather name="arrow-left" size={22} color={WHITE} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.headerEyebrow}>BUILD WITH CONFIDENCE</Text>
              <Text style={s.headerTitle} numberOfLines={1}>
                {stack.store || 'Store'} Stack
              </Text>
            </View>
            <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
              <Feather name="share-2" size={18} color={WHITE} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero metrics ─────────────────────────────────────────────────── */}
        <View style={s.heroCard}>
          <View style={s.heroPriceRow}>
            <Text style={s.heroPrice}>{fmtCents(finalCents)}</Text>
            <View style={[s.savingsBadge, { backgroundColor: savingsPct >= 50 ? GREEN : AMBER }]}>
              <Text style={s.savingsBadgeTxt}>{savingsPct}%</Text>
            </View>
          </View>

          {stack.best_shop_window ? (
            <View style={s.windowBadge}>
              <Feather name="calendar" size={12} color={GREEN} />
              <Text style={s.windowTxt}>{stack.best_shop_window.toUpperCase()}</Text>
            </View>
          ) : null}

          {stack.confidence ? (
            <Text style={[s.confidenceTxt, { color: confidenceColor(stack.confidence) }]}>
              {stack.confidence} CONFIDENCE
            </Text>
          ) : null}

          <View style={s.subtotalsRow}>
            <View style={s.subtotalCol}>
              <Text style={s.subtotalLabel}>Subtotal</Text>
              <Text style={s.subtotalVal}>{fmtCents(subtotalCents)}</Text>
            </View>
            <View style={s.subtotalDivider} />
            <View style={s.subtotalCol}>
              <Text style={s.subtotalLabel}>Coupon savings</Text>
              <Text style={[s.subtotalVal, { color: GREEN }]}>-{fmtCents(discountCents)}</Text>
            </View>
            <View style={s.subtotalDivider} />
            <View style={s.subtotalCol}>
              <Text style={s.subtotalLabel}>Final</Text>
              <Text style={[s.subtotalVal, { fontWeight: '900' }]}>{fmtCents(finalCents)}</Text>
            </View>
          </View>
        </View>

        {/* ── Overage notice ───────────────────────────────────────────────── */}
        {stack.is_overage && (
          <View style={s.overageCard}>
            <Feather name="info" size={15} color={AMBER} />
            <Text style={s.overageText}>
              Coupons exceed item prices — this stack earns store credit. Not cash profit.
            </Text>
          </View>
        )}

        {/* ── Steps ────────────────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>FOLLOW THESE STEPS</Text>
          <View style={s.stepsCard}>
            {instructions.map((step, i) => (
              <StepRow key={i} number={i + 1} text={step} />
            ))}
          </View>
        </View>

        {/* ── Items ────────────────────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>YOUR ITEMS ({items.length})</Text>
            {checkedCount > 0 && (
              <Text style={s.checkedCount}>{checkedCount}/{items.length} found</Text>
            )}
          </View>

          {items.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={{ color: SLATE, textAlign: 'center' }}>No items available.</Text>
            </View>
          ) : (
            <View style={s.itemsCard}>
              {items.map((item, i) => (
                <ItemRow
                  key={i}
                  item={item}
                  retailer={retailer}
                  checked={!!checked[i]}
                  onToggle={() => toggleItem(i)}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Source note ──────────────────────────────────────────────────── */}
        <View style={s.sourceNote}>
          <Feather name="shield" size={12} color={GREEN} />
          <Text style={s.sourceNoteTxt}>
            Snippd-generated stack · {stack.validation_status === 'system_generated_verified'
              ? 'Math verified by engine'
              : 'Verify prices in-store'}
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Footer CTA ───────────────────────────────────────────────────────── */}
      <View style={s.footer}>
        <View style={s.footerMeta}>
          <Text style={s.footerLabel}>OUT OF POCKET</Text>
          <Text style={s.footerPrice}>{fmtCents(finalCents)}</Text>
        </View>
        <TouchableOpacity
          style={[s.ctaBtn, items.length === 0 && { opacity: 0.4 }]}
          onPress={handleAddAll}
          disabled={items.length === 0}
          activeOpacity={0.85}
        >
          <Feather name="list" size={18} color={WHITE} />
          <Text style={s.ctaBtnTxt}>Add All Items to My List</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: MINT },

  header:       { backgroundColor: FOREST, paddingBottom: 20, paddingHorizontal: 20 },
  navRow:       { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  backBtn:      { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  shareBtn:     { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerEyebrow:{ fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.5)', letterSpacing: 2 },
  headerTitle:  { fontSize: 18, fontWeight: '900', color: WHITE, marginTop: 2 },

  scroll:       { paddingHorizontal: 16, paddingTop: 16, gap: 14 },

  heroCard:     { backgroundColor: WHITE, borderRadius: 20, padding: 20, gap: 10, borderWidth: 1, borderColor: BORDER },
  heroPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroPrice:    { fontSize: 42, fontWeight: '900', color: NAVY, letterSpacing: -1 },
  savingsBadge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  savingsBadgeTxt:{ fontSize: 18, fontWeight: '900', color: WHITE },
  windowBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: LIGHT_GRN, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  windowTxt:    { fontSize: 10, fontWeight: '800', color: GREEN, letterSpacing: 1.5 },
  confidenceTxt:{ fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  subtotalsRow: { flexDirection: 'row', marginTop: 6 },
  subtotalCol:  { flex: 1, alignItems: 'center' },
  subtotalDivider:{ width: 1, backgroundColor: BORDER },
  subtotalLabel:{ fontSize: 10, color: SLATE, fontWeight: '600', marginBottom: 2 },
  subtotalVal:  { fontSize: 15, fontWeight: '800', color: NAVY },

  overageCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: AMBER },
  overageText:  { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },

  section:      { gap: 8 },
  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: SLATE, letterSpacing: 1.5, textTransform: 'uppercase' },
  checkedCount: { fontSize: 12, fontWeight: '700', color: GREEN },

  stepsCard:    { backgroundColor: WHITE, borderRadius: 16, padding: 16, gap: 0, borderWidth: 1, borderColor: BORDER },
  stepRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  stepNum:      { width: 26, height: 26, borderRadius: 13, backgroundColor: FOREST, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumTxt:   { fontSize: 12, fontWeight: '900', color: WHITE },
  stepTxt:      { flex: 1, fontSize: 14, fontWeight: '600', color: NAVY, lineHeight: 20 },

  itemsCard:    { backgroundColor: WHITE, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  itemRow:      { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 10 },
  itemRowChecked:{ backgroundColor: '#FAFAFA', opacity: 0.55 },
  checkbox:     { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  checkboxChecked:{ backgroundColor: GREEN, borderColor: GREEN },
  itemName:     { fontSize: 14, fontWeight: '700', color: NAVY, lineHeight: 20 },
  itemNameChecked:{ textDecorationLine: 'line-through', color: SLATE },
  couponRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' },
  couponSearchName:{ fontSize: 12, color: GREEN, fontWeight: '600' },
  couponLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, backgroundColor: LIGHT_GRN, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  couponLinkTxt: { fontSize: 11, color: GREEN, fontWeight: '800' },
  verifiedBadge:{ backgroundColor: LIGHT_GRN, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  verifiedTxt:  { fontSize: 9, fontWeight: '800', color: GREEN, letterSpacing: 0.5 },
  priceCol:     { alignItems: 'flex-end', flexShrink: 0 },
  strikePriceTxt:{ fontSize: 12, color: SLATE, textDecorationLine: 'line-through', marginBottom: 1 },
  finalPriceTxt:{ fontSize: 16, fontWeight: '900', color: NAVY },
  qtyTxt:       { fontSize: 11, color: SLATE, marginTop: 1 },

  emptyCard:    { backgroundColor: WHITE, borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: BORDER },

  sourceNote:   { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 6 },
  sourceNoteTxt:{ fontSize: 11, color: SLATE },

  footer:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: WHITE, borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  footerMeta:   {},
  footerLabel:  { fontSize: 10, fontWeight: '700', color: SLATE, letterSpacing: 1 },
  footerPrice:  { fontSize: 26, fontWeight: '900', color: NAVY },
  ctaBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: FOREST, borderRadius: 14, paddingVertical: 16 },
  ctaBtnTxt:    { fontSize: 15, fontWeight: '800', color: WHITE },
});
