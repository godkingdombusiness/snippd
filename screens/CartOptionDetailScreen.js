import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { tracker } from '../lib/eventTracker';

const GREEN      = '#0C9E54';
const NAVY       = '#0D1B4B';
const WHITE      = '#FFFFFF';
const GRAY       = '#8A8F9E';
const OFF_WHITE  = '#F8F9FA';
const BORDER     = '#F0F1F3';
const LIGHT_GREEN = '#E8F8F0';
const PALE_GREEN  = '#F0FDF4';
const AMBER      = '#F59E0B';
const PALE_AMBER  = '#FFFBEB';
const BLUE       = '#3B82F6';
const PALE_BLUE   = '#EFF6FF';
const RED        = '#EF4444';

const CART_CONFIG = {
  max_savings: {
    label:    'MAX SAVINGS',
    subLabel: 'Best deals, best price',
    icon:     'trending-up',
    color:    GREEN,
    bg:       LIGHT_GREEN,
    badge:    '#D1FAE5',
    badgeTxt: GREEN,
  },
  balanced: {
    label:    'BALANCED',
    subLabel: 'Savings meets your taste',
    icon:     'sliders',
    color:    BLUE,
    bg:       PALE_BLUE,
    badge:    '#DBEAFE',
    badgeTxt: BLUE,
  },
  convenience: {
    label:    'CONVENIENCE',
    subLabel: 'Fast trip, favourite items',
    icon:     'zap',
    color:    AMBER,
    bg:       PALE_AMBER,
    badge:    '#FEF3C7',
    badgeTxt: '#92400E',
  },
};

function fmt(cents) {
  return cents != null ? '$' + (cents / 100).toFixed(2) : '$0.00';
}

// Signal icon + colour mapping
const SIGNAL_CONFIG = {
  buy_history:        { icon: 'repeat',    color: '#0C9E54' },
  preferred_category: { icon: 'heart',     color: '#3B82F6' },
  preferred_brand:    { icon: 'award',     color: '#3B82F6' },
  cohort_brand:       { icon: 'users',     color: '#8B5CF6' },
  co_occurrence:      { icon: 'link-2',    color: '#F59E0B' },
};

// ─────────────────────────────────────────────────────────────
// Single item row
// ─────────────────────────────────────────────────────────────
function ItemRow({ item, accentColor, insight }) {
  const hasSavings = item.savings_cents > 0;
  const sig = insight ? SIGNAL_CONFIG[insight.signal] : null;

  return (
    <View style={row.wrap}>
      {/* Category icon placeholder */}
      <View style={[row.iconWrap, { backgroundColor: accentColor + '18' }]}>
        <Feather name="package" size={16} color={accentColor} />
      </View>

      {/* Name + meta */}
      <View style={row.info}>
        <Text style={row.name} numberOfLines={2}>{item.name}</Text>
        <View style={row.meta}>
          {item.brand ? (
            <Text style={row.metaTxt}>{item.brand}</Text>
          ) : null}
          {item.category ? (
            <Text style={row.metaDot}>·</Text>
          ) : null}
          {item.category ? (
            <Text style={row.metaTxt}>{item.category}</Text>
          ) : null}
          {item.qty && item.qty > 1 ? (
            <>
              <Text style={row.metaDot}>·</Text>
              <Text style={row.metaTxt}>qty {item.qty}</Text>
            </>
          ) : null}
        </View>
        {/* Graph insight chip */}
        {sig && (
          <View style={[row.insightChip, { backgroundColor: sig.color + '14' }]}>
            <Feather name={sig.icon} size={9} color={sig.color} />
            <Text style={[row.insightTxt, { color: sig.color }]} numberOfLines={1}>
              {insight.text}
            </Text>
          </View>
        )}
      </View>

      {/* Pricing */}
      <View style={row.pricing}>
        <Text style={row.finalPrice}>{fmt(item.final_price_cents)}</Text>
        {hasSavings && (
          <>
            <Text style={row.regularPrice}>{fmt(item.regular_price_cents)}</Text>
            <View style={[row.savingsBadge, { backgroundColor: accentColor + '18' }]}>
              <Text style={[row.savingsBadgeTxt, { color: accentColor }]}>
                -{fmt(item.savings_cents)}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  info:  { flex: 1, gap: 4 },
  name:  { fontSize: 14, fontWeight: '700', color: NAVY, lineHeight: 18 },
  meta:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 3 },
  metaTxt: { fontSize: 11, color: GRAY, fontWeight: '500' },
  metaDot: { fontSize: 11, color: GRAY },
  pricing: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  finalPrice:   { fontSize: 15, fontWeight: '900', color: NAVY },
  regularPrice: { fontSize: 11, color: GRAY, textDecorationLine: 'line-through' },
  savingsBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  savingsBadgeTxt: { fontSize: 10, fontWeight: '800' },
  insightChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, marginTop: 4,
  },
  insightTxt: { fontSize: 10, fontWeight: '700', flexShrink: 1 },
});

// ─────────────────────────────────────────────────────────────
// Summary bar at the top
// ─────────────────────────────────────────────────────────────
function SummaryBar({ cart, cfg }) {
  return (
    <View style={[sum.wrap, { backgroundColor: cfg.bg }]}>
      <View style={sum.col}>
        <Text style={[sum.big, { color: cfg.color }]}>{fmt(cart.total_savings_cents)}</Text>
        <Text style={sum.label}>SAVINGS</Text>
      </View>
      <View style={sum.dividerV} />
      <View style={sum.col}>
        <Text style={[sum.big, { color: NAVY }]}>{fmt(cart.subtotal_after_savings_cents)}</Text>
        <Text style={sum.label}>TOTAL</Text>
      </View>
      <View style={sum.dividerV} />
      <View style={sum.col}>
        <Text style={[sum.big, { color: NAVY }]}>{cart.savings_pct?.toFixed(1)}%</Text>
        <Text style={sum.label}>OFF</Text>
      </View>
      <View style={sum.dividerV} />
      <View style={sum.col}>
        <Text style={[sum.big, { color: NAVY }]}>{cart.item_count}</Text>
        <Text style={sum.label}>ITEMS</Text>
      </View>
    </View>
  );
}

const sum = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 14, marginBottom: 8,
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12,
  },
  col:      { flex: 1, alignItems: 'center' },
  big:      { fontSize: 16, fontWeight: '900', lineHeight: 20 },
  label:    { fontSize: 9, fontWeight: '800', color: GRAY, letterSpacing: 0.8, marginTop: 2 },
  dividerV: { width: 1, height: 30, backgroundColor: BORDER },
});

// ─────────────────────────────────────────────────────────────
// Budget chip
// ─────────────────────────────────────────────────────────────
function BudgetChip({ cart }) {
  if (cart.budget_fit === undefined) return null;
  return (
    <View style={[bud.wrap, cart.budget_fit ? bud.fit : bud.over]}>
      <Feather
        name={cart.budget_fit ? 'check-circle' : 'alert-circle'}
        size={12}
        color={cart.budget_fit ? GREEN : RED}
      />
      <Text style={[bud.txt, { color: cart.budget_fit ? GREEN : RED }]}>
        {cart.budget_fit ? 'Fits your weekly budget' : 'Over your weekly budget'}
      </Text>
    </View>
  );
}

const bud = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  fit:  { backgroundColor: LIGHT_GREEN },
  over: { backgroundColor: '#FEE2E2' },
  txt:  { fontSize: 12, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────
// Stores row
// ─────────────────────────────────────────────────────────────
function StoreRow({ cart }) {
  if (!cart.retailer_set?.length) return null;
  return (
    <View style={str.wrap}>
      <Feather name="map-pin" size={13} color={GRAY} />
      <Text style={str.label}>
        {cart.store_count === 1 ? 'Single store trip' : `${cart.store_count} stores`}:{' '}
        <Text style={str.stores}>{cart.retailer_set.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')}</Text>
      </Text>
    </View>
  );
}

const str = StyleSheet.create({
  wrap:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 10 },
  label:  { fontSize: 12, color: GRAY, fontWeight: '600' },
  stores: { color: NAVY, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
export default function CartOptionDetailScreen({ navigation, route }) {
  const { cart, retailer_key, session_id, user_id } = route.params ?? {};
  const [accepting, setAccepting] = useState(false);

  // Graph insights — fetched lazily after mount, won't block cart display
  const [cartInsights, setCartInsights]   = useState([]);
  const [itemInsights, setItemInsights]   = useState({});
  const [insightsReady, setInsightsReady] = useState(false);

  useEffect(() => {
    if (!cart?.items?.length) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch(`${SUPABASE_URL}/functions/v1/graph-insights`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: cart.items.map(i => ({
              product_id:     i.product_id,
              name:           i.name,
              brand:          i.brand,
              category:       i.category,
              normalized_key: i.normalized_key,
            })),
          }),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json.status === 'ok') {
          setCartInsights(json.cart_insights ?? []);
          setItemInsights(json.item_insights ?? {});
          setInsightsReady(true);
        }
      } catch {
        // Insights are additive — silently skip on error
      }
    })();
  }, [cart?.cart_id]);

  if (!cart) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.center}>
          <Text style={s.errorTxt}>No cart data. Please go back and try again.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backPill}>
            <Text style={s.backPillTxt}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const cfg = CART_CONFIG[cart.cart_type] ?? CART_CONFIG.balanced;

  const handleAccept = async () => {
    setAccepting(true);
    try {
      tracker.trackCartAccepted({
        user_id:    user_id,
        session_id: session_id ?? String(Date.now()),
        object_id:  cart.cart_id,
        screen_name: 'CartOptionDetailScreen',
        retailer_key: retailer_key,
        metadata: {
          cart_type:   cart.cart_type,
          retailer_key: retailer_key,
          item_count:  cart.item_count,
          savings_pct: cart.savings_pct,
          total_savings_cents: cart.total_savings_cents,
          subtotal_after_savings_cents: cart.subtotal_after_savings_cents,
          model_version: cart.model_version,
        },
      });

      Alert.alert(
        'Cart accepted!',
        `Your ${cfg.label.toLowerCase()} cart has been saved. Happy shopping!`,
        [{ text: 'Great', onPress: () => navigation.popToTop() }],
      );
    } finally {
      setAccepting(false);
    }
  };

  const handleTryAnother = () => {
    tracker.trackCartRejected({
      user_id:    user_id,
      session_id: session_id ?? String(Date.now()),
      object_id:  cart.cart_id,
      screen_name: 'CartOptionDetailScreen',
      retailer_key: retailer_key,
      metadata: {
        cart_type:   cart.cart_type,
        retailer_key: retailer_key,
        reason:      'user_chose_another',
      },
    });
    navigation.goBack();
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleTryAnother} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={[s.typeBadge, { backgroundColor: cfg.badge }]}>
            <Feather name={cfg.icon} size={11} color={cfg.badgeTxt} />
            <Text style={[s.typeLabel, { color: cfg.badgeTxt }]}>{cfg.label}</Text>
          </View>
          <Text style={s.headerSub}>{cfg.subLabel}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {/* Summary bar */}
        <SummaryBar cart={cart} cfg={cfg} />

        {/* Budget chip */}
        <BudgetChip cart={cart} />

        {/* Store row */}
        <StoreRow cart={cart} />

        {/* Explanation bullets */}
        {cart.explanation?.length > 0 && (
          <View style={s.explanSection}>
            <Text style={s.sectionTitle}>WHY THIS CART</Text>
            {cart.explanation.map((line, i) => (
              <View key={i} style={s.bulletRow}>
                <View style={[s.bullet, { backgroundColor: cfg.color }]} />
                <Text style={s.bulletTxt}>{line}</Text>
              </View>
            ))}
          </View>
        )}

        {/* AI match */}
        {cart.cart_acceptance_probability > 0 && (
          <View style={s.matchRow}>
            <Feather name="cpu" size={11} color={GRAY} />
            <Text style={s.matchTxt}>
              {Math.round(cart.cart_acceptance_probability * 100)}% match for your preferences
            </Text>
          </View>
        )}

        {/* Memory insights — graph-powered plain language signals */}
        {insightsReady && cartInsights.length > 0 && (
          <View style={s.insightsSection}>
            <View style={s.insightsHeader}>
              <Feather name="share-2" size={11} color="#8B5CF6" />
              <Text style={s.insightsSectionTitle}>PERSONALISED FOR YOU</Text>
            </View>
            {cartInsights.map((line, i) => (
              <View key={i} style={s.insightRow}>
                <View style={s.insightDot} />
                <Text style={s.insightRowTxt}>{line}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Items list */}
        <View style={s.itemsSection}>
          <Text style={s.sectionTitle}>ALL ITEMS ({cart.item_count})</Text>
          {(cart.items ?? []).map((item, i) => (
            <ItemRow
              key={item.product_id ?? i}
              item={item}
              accentColor={cfg.color}
              insight={itemInsights[item.product_id] ?? itemInsights[item.normalized_key] ?? null}
            />
          ))}
        </View>

        {/* Bottom spacer for sticky footer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky footer */}
      <View style={s.footer}>
        <TouchableOpacity
          style={s.tryAnotherBtn}
          onPress={handleTryAnother}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={16} color={NAVY} />
          <Text style={s.tryAnotherTxt}>Try Another</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.acceptBtn, { backgroundColor: cfg.color }, accepting && s.acceptBtnDisabled]}
          onPress={handleAccept}
          disabled={accepting}
          activeOpacity={0.85}
        >
          <Feather name="check" size={18} color={WHITE} />
          <Text style={s.acceptTxt}>Accept This Cart</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: OFF_WHITE },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  errorTxt:   { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20 },
  backPill:   { backgroundColor: NAVY, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  backPillTxt: { color: WHITE, fontWeight: '700' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 3 },
  typeBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  typeLabel:   { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  headerSub:   { fontSize: 11, color: GRAY, fontWeight: '600' },

  scroll:        { flex: 1 },
  scrollContent: { paddingTop: 4 },

  // Explanation
  explanSection: { marginHorizontal: 16, marginBottom: 8 },
  sectionTitle:  { fontSize: 10, fontWeight: '800', color: GRAY, letterSpacing: 1, marginBottom: 10 },
  bulletRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  bullet:        { width: 5, height: 5, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  bulletTxt:     { fontSize: 13, color: NAVY, fontWeight: '500', flex: 1, lineHeight: 18 },

  // Match row
  matchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginHorizontal: 16, marginBottom: 14,
  },
  matchTxt: { fontSize: 11, color: GRAY, fontWeight: '600' },

  // Memory insights section
  insightsSection: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: '#F5F3FF',
    borderRadius: 14, padding: 14,
    borderLeftWidth: 3, borderLeftColor: '#8B5CF6',
  },
  insightsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8,
  },
  insightsSectionTitle: {
    fontSize: 9, fontWeight: '800', color: '#8B5CF6', letterSpacing: 1.2,
  },
  insightRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 5,
  },
  insightDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#8B5CF6', marginTop: 7, flexShrink: 0,
  },
  insightRowTxt: { fontSize: 12, color: '#1A1A2E', fontWeight: '500', flex: 1, lineHeight: 18 },

  // Items section
  itemsSection: { marginHorizontal: 16 },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    paddingBottom: 28,
    backgroundColor: WHITE,
    borderTopWidth: 1, borderTopColor: BORDER,
    shadowColor: NAVY, shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 8,
  },
  tryAnotherBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 14, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: WHITE,
  },
  tryAnotherTxt: { fontSize: 14, fontWeight: '700', color: NAVY },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  acceptBtnDisabled: { opacity: 0.6 },
  acceptTxt: { color: WHITE, fontSize: 16, fontWeight: '800' },
});
