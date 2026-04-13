import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, StatusBar, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { tracker } from '../lib/eventTracker';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - 40;

const GREEN     = '#0C9E54';
const NAVY      = '#0D1B4B';
const WHITE     = '#FFFFFF';
const GRAY      = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const BORDER    = '#F0F1F3';
const PALE_GREEN = '#F0FDF4';
const LIGHT_GREEN = '#E8F8F0';
const AMBER     = '#F59E0B';
const PALE_AMBER = '#FFFBEB';
const BLUE      = '#3B82F6';
const PALE_BLUE  = '#EFF6FF';
const RED       = '#EF4444';

// Cart type display config
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

// Returns this week's Monday as YYYY-MM-DD
function thisWeekOf() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function fmt(cents) {
  return cents != null ? '$' + (cents / 100).toFixed(2) : '$0.00';
}

// ─────────────────────────────────────────────────────────────
// Savings ring — small circular indicator
// ─────────────────────────────────────────────────────────────
function SavingsPct({ pct, color }) {
  return (
    <View style={[ring.wrap, { borderColor: color }]}>
      <Text style={[ring.pct, { color }]}>{pct.toFixed(0)}%</Text>
      <Text style={ring.off}>off</Text>
    </View>
  );
}
const ring = StyleSheet.create({
  wrap: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  pct:  { fontSize: 18, fontWeight: '900', lineHeight: 20 },
  off:  { fontSize: 9, fontWeight: '700', color: GRAY, letterSpacing: 0.5 },
});

// ─────────────────────────────────────────────────────────────
// Cart card
// ─────────────────────────────────────────────────────────────
function CartCard({ cart, onSelect, sessionId, userId }) {
  const cfg = CART_CONFIG[cart.cart_type] ?? CART_CONFIG.balanced;

  const handleSelect = () => {
    onSelect(cart);
  };

  return (
    <View style={[card.wrap, { width: CARD_W }]}>

      {/* Type badge + icon */}
      <View style={[card.typeBadge, { backgroundColor: cfg.badge }]}>
        <Feather name={cfg.icon} size={12} color={cfg.badgeTxt} />
        <Text style={[card.typeLabel, { color: cfg.badgeTxt }]}>{cfg.label}</Text>
      </View>

      {/* Sub-label */}
      <Text style={card.subLabel}>{cfg.subLabel}</Text>

      {/* Financial headline */}
      <View style={card.headRow}>
        <View style={card.savingsBlock}>
          <Text style={[card.savingsAmount, { color: cfg.color }]}>
            {fmt(cart.total_savings_cents)}
          </Text>
          <Text style={card.savingsLabel}>IN SAVINGS</Text>
        </View>
        <SavingsPct pct={cart.savings_pct} color={cfg.color} />
      </View>

      {/* Divider */}
      <View style={card.divider} />

      {/* Stats row */}
      <View style={card.statsRow}>
        <View style={card.stat}>
          <Feather name="shopping-bag" size={13} color={GRAY} />
          <Text style={card.statVal}>{cart.item_count}</Text>
          <Text style={card.statLabel}>items</Text>
        </View>
        <View style={card.stat}>
          <Feather name="map-pin" size={13} color={GRAY} />
          <Text style={card.statVal}>{cart.store_count}</Text>
          <Text style={card.statLabel}>{cart.store_count === 1 ? 'store' : 'stores'}</Text>
        </View>
        <View style={card.stat}>
          <Feather name="tag" size={13} color={GRAY} />
          <Text style={card.statVal}>{fmt(cart.subtotal_after_savings_cents)}</Text>
          <Text style={card.statLabel}>total</Text>
        </View>
        {cart.budget_fit !== undefined && (
          <View style={[card.budgetChip, cart.budget_fit ? card.budgetFit : card.budgetOver]}>
            <Feather
              name={cart.budget_fit ? 'check-circle' : 'alert-circle'}
              size={10}
              color={cart.budget_fit ? GREEN : RED}
            />
            <Text style={[card.budgetTxt, { color: cart.budget_fit ? GREEN : RED }]}>
              {cart.budget_fit ? 'Budget fit' : 'Over budget'}
            </Text>
          </View>
        )}
      </View>

      {/* Explanation bullets */}
      {cart.explanation?.slice(0, 3).map((line, i) => (
        <View key={i} style={card.bulletRow}>
          <View style={[card.bullet, { backgroundColor: cfg.color }]} />
          <Text style={card.bulletTxt} numberOfLines={1}>{line}</Text>
        </View>
      ))}

      {/* Acceptance probability (subtle) */}
      {cart.cart_acceptance_probability > 0 && (
        <View style={card.matchRow}>
          <Feather name="cpu" size={10} color={GRAY} />
          <Text style={card.matchTxt}>
            {Math.round(cart.cart_acceptance_probability * 100)}% match for your preferences
          </Text>
        </View>
      )}

      {/* CTA */}
      <TouchableOpacity
        style={[card.cta, { backgroundColor: cfg.color }]}
        onPress={handleSelect}
        activeOpacity={0.85}
      >
        <Text style={card.ctaTxt}>Use This Cart</Text>
        <Feather name="arrow-right" size={16} color={WHITE} />
      </TouchableOpacity>
    </View>
  );
}

const card = StyleSheet.create({
  wrap: {
    backgroundColor: WHITE,
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, marginBottom: 6,
  },
  typeLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  subLabel:  { fontSize: 13, color: GRAY, fontWeight: '600', marginBottom: 16 },
  headRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  savingsBlock: { flex: 1 },
  savingsAmount: { fontSize: 36, fontWeight: '900', lineHeight: 40, letterSpacing: -1 },
  savingsLabel:  { fontSize: 9, fontWeight: '800', color: GRAY, letterSpacing: 1.2, marginTop: 2 },
  divider: { height: 1, backgroundColor: BORDER, marginBottom: 14 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  stat:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statVal:   { fontSize: 13, fontWeight: '800', color: NAVY },
  statLabel: { fontSize: 11, color: GRAY },
  budgetChip:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginLeft: 'auto' },
  budgetFit:   { backgroundColor: LIGHT_GREEN },
  budgetOver:  { backgroundColor: '#FEE2E2' },
  budgetTxt:   { fontSize: 10, fontWeight: '700' },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  bullet:    { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  bulletTxt: { fontSize: 12, color: NAVY, fontWeight: '500', flex: 1 },
  matchRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, marginBottom: 4 },
  matchTxt:  { fontSize: 10, color: GRAY, fontWeight: '600' },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 16, paddingVertical: 15, marginTop: 14,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
    shadowColor: GREEN,
  },
  ctaTxt: { color: WHITE, fontSize: 16, fontWeight: '800' },
});

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
export default function CartOptionsScreen({ navigation, route }) {
  const retailerKey = route?.params?.retailer_key ?? 'publix';
  const weekOf      = route?.params?.week_of ?? thisWeekOf();

  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [carts, setCarts]         = useState([]);
  const [error, setError]         = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [userId, setUserId]       = useState(null);
  const [sessionId, setSessionId] = useState(null);

  const scrollRef = useRef(null);

  const fetchCarts = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Please sign in to see personalised cart options.');
        return;
      }
      setUserId(session.user.id);
      setSessionId(session.access_token);

      const url = `${SUPABASE_URL}/functions/v1/get-cart-options?retailer_key=${encodeURIComponent(retailerKey)}&week_of=${weekOf}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const json = await res.json();
      setCarts(json.carts ?? []);

      // Track impression for each cart shown
      for (const cart of (json.carts ?? [])) {
        tracker.trackStackViewed({
          user_id:    session.user.id,
          session_id: session.access_token,
          object_id:  cart.cart_id,
          screen_name: 'CartOptionsScreen',
          metadata: { cart_type: cart.cart_type, retailer_key: retailerKey },
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchCarts(); }, [retailerKey, weekOf]);

  const onRefresh = () => { setRefreshing(true); fetchCarts(true); };

  const handleScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 8));
    setActiveIdx(Math.max(0, Math.min(idx, carts.length - 1)));
  };

  const handleSelect = (cart) => {
    navigation.navigate('CartOptionDetail', {
      cart,
      retailer_key: retailerKey,
      session_id:   sessionId,
      user_id:      userId,
    });
  };

  const handleDismiss = () => {
    for (const cart of carts) {
      tracker.trackCartRejected({
        user_id:    userId,
        session_id: sessionId ?? String(Date.now()),
        object_id:  cart.cart_id,
        screen_name: 'CartOptionsScreen',
        metadata: { cart_type: cart.cart_type, retailer_key: retailerKey, reason: 'dismissed_all' },
      });
    }
    navigation.goBack();
  };

  const retailerLabel = retailerKey.charAt(0).toUpperCase() + retailerKey.slice(1);

  // ── States ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={s.center}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={s.loadingTxt}>Building your smart carts…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Feather name="arrow-left" size={20} color={NAVY} />
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <Feather name="alert-circle" size={40} color={RED} />
          <Text style={s.errorTitle}>Couldn't load carts</Text>
          <Text style={s.errorSub}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => fetchCarts()}>
            <Text style={s.retryTxt}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (carts.length === 0) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Feather name="arrow-left" size={20} color={NAVY} />
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Feather name="shopping-cart" size={28} color={GREEN} />
          </View>
          <Text style={s.emptyTitle}>No carts available yet</Text>
          <Text style={s.emptySub}>
            Smart carts for {retailerLabel} will appear here once deals are loaded for the week.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleDismiss} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{retailerLabel} Carts</Text>
          <Text style={s.headerSub}>Week of {weekOf}</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={s.backBtn}>
          <Feather name="refresh-cw" size={18} color={NAVY} />
        </TouchableOpacity>
      </View>

      {/* Preamble */}
      <View style={s.preamble}>
        <Text style={s.preambleHead}>3 smart carts, built for you</Text>
        <Text style={s.preambleSub}>Swipe to compare · Tap to see all items</Text>
      </View>

      {/* Cards pager */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        decelerationRate="fast"
        snapToInterval={CARD_W + 8}
        snapToAlignment="center"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.cardsContainer}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={undefined}
      >
        {carts.map((cart) => (
          <CartCard
            key={cart.cart_id}
            cart={cart}
            onSelect={handleSelect}
            sessionId={sessionId}
            userId={userId}
          />
        ))}
      </ScrollView>

      {/* Dot indicators */}
      <View style={s.dots}>
        {carts.map((_, i) => (
          <View
            key={i}
            style={[s.dot, activeIdx === i && s.dotActive]}
          />
        ))}
      </View>

      {/* Dismiss link */}
      <TouchableOpacity style={s.dismissBtn} onPress={handleDismiss}>
        <Text style={s.dismissTxt}>None of these · Skip</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: OFF_WHITE },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingTxt:  { marginTop: 14, fontSize: 14, color: GRAY, fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  headerSub:   { fontSize: 11, color: GRAY, fontWeight: '600', marginTop: 1 },

  preamble:    { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
  preambleHead: { fontSize: 18, fontWeight: '800', color: NAVY, marginBottom: 3 },
  preambleSub:  { fontSize: 12, color: GRAY, fontWeight: '600' },

  cardsContainer: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: BORDER },
  dotActive: { width: 20, backgroundColor: NAVY },

  dismissBtn: { alignItems: 'center', paddingVertical: 14, paddingBottom: 20 },
  dismissTxt: { fontSize: 13, color: GRAY, fontWeight: '600' },

  errorTitle: { fontSize: 18, fontWeight: '800', color: NAVY, marginTop: 16, marginBottom: 8 },
  errorSub:   { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  retryBtn:   { backgroundColor: GREEN, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 13 },
  retryTxt:   { color: WHITE, fontSize: 15, fontWeight: '800' },

  emptyIcon:  { width: 68, height: 68, borderRadius: 34, backgroundColor: LIGHT_GREEN, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: NAVY, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 19 },
});
