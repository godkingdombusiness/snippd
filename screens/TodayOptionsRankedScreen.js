// screens/TodayOptionsRankedScreen.js
// "What's the plan for tonight?" — 3-card decision hub.
// Context from TodaySetupGateScreen drives: wallet banner, portion badges,
// recipe selection, pricing, coupon rows, and CTA routing.

import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Platform,
} from 'react-native';
import PropTypes from 'prop-types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { tracker } from '../src/lib/eventTracker';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN       = '#0C9E54';
const GREEN_DARK  = '#065F46';
const BLUE        = '#1D4ED8';
const BLUE_DARK   = '#1E3A8A';
const CHARCOAL    = '#1E293B';
const CHARCOAL_DK = '#0F172A';
const WHITE       = '#FFFFFF';
const NAVY        = '#0A192F';
const SLATE       = '#475569';
const GRAY        = '#94A3B8';
const BORDER      = '#E5E7EB';
const MINT_SOFT   = '#F0FDF4';
const AMBER       = '#D97706';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function primaryGoalLabel(behaviorProfile) {
  const p = behaviorProfile ?? [];
  if (p.includes('high_protein'))  return 'High Protein';
  if (p.includes('lower_calorie')) return 'Light & Lean';
  if (p.includes('fastest'))       return 'Quick Prep';
  if (p.includes('spend_least'))   return 'Max Savings';
  if (p.includes('kid_friendly'))  return 'Kid-Friendly';
  if (p.includes('healthier'))     return 'Clean Eats';
  return 'Balanced';
}

function activeMinsLabel(timeWindow) {
  if (timeWindow === 'under_15') return '15';
  if (timeWindow === '15_30')    return '25';
  if (timeWindow === '30_45')    return '35';
  return '45';
}

function buildCards(context) {
  const bp         = context.behaviorProfile ?? [];
  const eaters     = context.tonightEatersCount ?? context.householdSize ?? 2;
  const remaining  = context.remainingBudgetCents ?? 0;
  const isProtein  = bp.includes('high_protein') || bp.includes('fastest');
  const isBudget   = bp.includes('spend_least');

  // ── Card 1 — Cook at Home ────────────────────────────────────────────────
  const cookTotalCents  = isProtein ? 842 : isBudget ? 624 : 842;
  const cookCouponCents = isProtein ? 350 : 200;
  const cookMins        = activeMinsLabel(context.timeWindow);
  const cookRecipe      = isProtein
    ? 'Quick Garlic-Herb Chicken & Asparagus'
    : isBudget
    ? 'Batch Turkey & Brown Rice Bowl'
    : 'Herb-Marinated Chicken & Roasted Veggies';
  const cookDesc = 'Ingredients ready for curbside pickup at your preferred store.';
  const cookCoupons = isProtein
    ? ['$1.00 off Tyson Chicken Strips', 'BOGO savings applied to Quaker Oats']
    : ['$0.75 off store-brand rice', 'Digital clip: $1.25 off lean turkey'];

  // ── Card 2 — Store Delivery ──────────────────────────────────────────────
  const delivTotalCents  = cookTotalCents;
  const delivCouponCents = cookCouponCents;

  // ── Card 3 — Eat Out / Takeout ───────────────────────────────────────────
  const takeoutTotal = 1250;
  const perPerson    = (takeoutTotal / eaters / 100).toFixed(2);

  return {
    cook: {
      totalCents:   cookTotalCents,
      couponCents:  cookCouponCents,
      recipe:       cookRecipe,
      desc:         cookDesc,
      coupons:      cookCoupons,
      mins:         cookMins,
    },
    delivery: {
      totalCents:   delivTotalCents,
      couponCents:  delivCouponCents,
      recipe:       cookRecipe,
    },
    takeout: {
      totalCents:   takeoutTotal,
      perPerson,
      eaters,
    },
    eaters,
    goalLabel: primaryGoalLabel(bp),
    remaining,
    weekly: context.weeklyBudgetCents ?? 25000,
  };
}

// ── Sub-components (module scope) ─────────────────────────────────────────────

function WalletBanner({ remaining, weekly, onPress }) {
  return (
    <TouchableOpacity style={wb.card} onPress={onPress} activeOpacity={0.9}>
      <View style={wb.left}>
        <FontAwesome5 name="wallet" size={22} color={WHITE} solid />
      </View>
      <View style={wb.mid}>
        <Text style={wb.amount}>
          You have <Text style={wb.highlight}>{fmt(remaining)}</Text> remaining
        </Text>
        <Text style={wb.sub}>of your {fmt(weekly)} weekly grocery budget.</Text>
      </View>
      <Feather name="chevron-right" size={20} color={WHITE} style={{ opacity: 0.7 }} />
    </TouchableOpacity>
  );
}
WalletBanner.propTypes = {
  remaining: PropTypes.number.isRequired,
  weekly:    PropTypes.number.isRequired,
  onPress:   PropTypes.func.isRequired,
};

function PortionBadge({ eaters, goalLabel }) {
  return (
    <View style={pb.badge}>
      <Text style={pb.text}>{eaters} Portion{eaters !== 1 ? 's' : ''} | {goalLabel}</Text>
    </View>
  );
}
PortionBadge.propTypes = {
  eaters:    PropTypes.number.isRequired,
  goalLabel: PropTypes.string.isRequired,
};

function CouponRow({ label, saving, items }) {
  return (
    <View style={cr.wrap}>
      <View style={cr.header}>
        <View style={cr.left}>
          <FontAwesome5 name="ticket-alt" size={12} color={GREEN} solid style={{ marginRight: 6 }} />
          <Text style={cr.label}>{label}</Text>
        </View>
        <Text style={cr.saving}>{saving}</Text>
      </View>
      {(items ?? []).map((item, i) => (
        <View key={i} style={cr.item}>
          <Feather name="check" size={11} color={GREEN} style={{ marginRight: 6 }} />
          <Text style={cr.itemText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}
CouponRow.propTypes = {
  label:  PropTypes.string.isRequired,
  saving: PropTypes.string.isRequired,
  items:  PropTypes.arrayOf(PropTypes.string),
};

function ImagePlaceholder({ bg, icon, eaters, goalLabel }) {
  return (
    <View style={[ip.box, { backgroundColor: bg }]}>
      <FontAwesome5 name={icon} size={28} color="rgba(255,255,255,0.35)" solid />
      <View style={ip.badgeWrap}>
        <PortionBadge eaters={eaters} goalLabel={goalLabel} />
      </View>
    </View>
  );
}
ImagePlaceholder.propTypes = {
  bg:        PropTypes.string.isRequired,
  icon:      PropTypes.string.isRequired,
  eaters:    PropTypes.number.isRequired,
  goalLabel: PropTypes.string.isRequired,
};

function Sidebar({ bg, darkBg, icon, label, badge, badgeDark }) {
  return (
    <View style={[sb.col, { backgroundColor: bg }]}>
      <View style={[sb.iconWrap, { backgroundColor: darkBg }]}>
        <FontAwesome5 name={icon} size={22} color={WHITE} solid />
      </View>
      <Text style={sb.label}>{label}</Text>
      <View style={[sb.badge, badgeDark && sb.badgeDark]}>
        <Text style={sb.badgeText}>{badge}</Text>
      </View>
    </View>
  );
}
Sidebar.propTypes = {
  bg:        PropTypes.string.isRequired,
  darkBg:    PropTypes.string.isRequired,
  icon:      PropTypes.string.isRequired,
  label:     PropTypes.string.isRequired,
  badge:     PropTypes.string.isRequired,
  badgeDark: PropTypes.bool,
};

// ── Main screen ───────────────────────────────────────────────────────────────
export default function TodayOptionsRankedScreen({ navigation, route }) {
  const context = route?.params?.context ?? {
    weeklyBudgetCents:    25000,
    remainingBudgetCents: 16300,
    householdSize:        2,
    tonightEatersCount:   2,
    shoppingStatus:       'not_yet',
    timeWindow:           '15_30',
    behaviorProfile:      ['high_protein'],
    mode:                 'plan_tonight',
  };

  const cards = useMemo(() => buildCards(context), []);

  React.useEffect(() => {
    tracker.track('today_options_viewed', {
      mode:            context.mode,
      behavior_profile: context.behaviorProfile,
      eaters:          cards.eaters,
    });
  }, []);

  function navCook() {
    navigation.navigate('StorePickupHandoff', { context });
  }
  function navDelivery() {
    navigation.navigate('StoreCartHandoff', { context });
  }
  function navTakeout() {
    navigation.navigate('EatOutSmart', { context });
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.canGoBack() && navigation.goBack()} style={s.backBtn}>
            <Feather name="arrow-left" size={20} color={NAVY} />
          </TouchableOpacity>
          <Text style={s.headline}>What's the plan{'\n'}for tonight?</Text>
          <Text style={s.sub}>Choose the option that fits your time, goals, and budget.</Text>
        </View>

        {/* ── Wallet Banner ────────────────────────────────────────────── */}
        <View style={s.bannerWrap}>
          <WalletBanner
            remaining={cards.remaining}
            weekly={cards.weekly}
            onPress={() => navigation.navigate('BudgetDashboard')}
          />
        </View>

        {/* ══ Card 1 — Cook at Home ════════════════════════════════════ */}
        <View style={[s.card, s.cardShadow]}>
          <Sidebar
            bg={GREEN}
            darkBg={GREEN_DARK}
            icon="utensils"
            label={'Cook at\nHome'}
            badge="MAX SAVINGS"
          />
          <View style={s.cardBody}>
            <ImagePlaceholder
              bg="#2D6A4F"
              icon="drumstick-bite"
              eaters={cards.eaters}
              goalLabel={cards.goalLabel}
            />
            <View style={s.cardContent}>
              <Text style={s.recipeTitle}>{cards.cook.recipe}</Text>
              <Text style={s.recipeDesc}>{cards.cook.desc}</Text>

              <View style={s.metricsRow}>
                <View style={s.metric}>
                  <Text style={s.metricPrice}>{fmt(cards.cook.totalCents)}</Text>
                  <Text style={s.metricLabel}>TOTAL COST</Text>
                  <Text style={s.metricSub}>
                    Includes {fmt(cards.cook.couponCents)} digital coupon clip
                  </Text>
                </View>
                <View style={s.metricDivider} />
                <View style={s.metric}>
                  <Text style={s.metricTime}>{cards.cook.mins}</Text>
                  <Text style={s.metricLabel}>MINS</Text>
                  <Text style={s.metricSub}>ACTIVE TIME</Text>
                </View>
              </View>

              <CouponRow
                label="Coupon Stack Applied"
                saving={`Saved ${fmt(cards.cook.couponCents)} extra`}
                items={cards.cook.coupons}
              />

              <TouchableOpacity style={[s.cta, s.ctaGreen]} onPress={navCook} activeOpacity={0.85}>
                <Text style={[s.ctaText, s.ctaTextWhite]}>Order Curbside Pickup</Text>
                <Feather name="arrow-right" size={15} color={WHITE} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ══ Card 2 — Store Delivery (no Instacart) ══════════════════ */}
        <View style={[s.card, s.cardShadow]}>
          <Sidebar
            bg={BLUE}
            darkBg={BLUE_DARK}
            icon="truck"
            label={'Store\nDelivery'}
            badge="FAST & CONVENIENT"
            badgeDark
          />
          <View style={s.cardBody}>
            <ImagePlaceholder
              bg="#1E40AF"
              icon="shopping-bag"
              eaters={cards.eaters}
              goalLabel={cards.goalLabel}
            />
            <View style={s.cardContent}>
              <Text style={s.recipeTitle}>Port ingredients directly to your door.</Text>
              <Text style={s.recipeDesc}>
                Fulfilled via same-day store delivery using your remaining {fmt(cards.remaining)} weekly balance.
              </Text>

              <View style={s.metricsRow}>
                <View style={s.metric}>
                  <Text style={s.metricPrice}>
                    {fmt(cards.delivery.totalCents)}
                    <Text style={s.metricFeeSuffix}> + fees</Text>
                  </Text>
                  <Text style={s.metricLabel}>TOTAL COST</Text>
                  <Text style={s.metricSub}>Coupons auto-applied at checkout</Text>
                </View>
                <View style={s.metricDivider} />
                <View style={s.metric}>
                  <Text style={s.metricTime}>35</Text>
                  <Text style={s.metricLabel}>MINS</Text>
                  <Text style={s.metricSub}>TO YOUR DOOR</Text>
                </View>
              </View>

              <View style={[cr.wrap, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <View style={cr.header}>
                  <View style={cr.left}>
                    <FontAwesome5 name="tag" size={12} color={BLUE} solid style={{ marginRight: 6 }} />
                    <Text style={[cr.label, { color: BLUE }]}>Clipped to Cart</Text>
                  </View>
                  <Text style={[cr.saving, { color: BLUE }]}>Saved {fmt(cards.delivery.couponCents)}</Text>
                </View>
                <Text style={[cr.itemText, { color: SLATE, marginTop: 4 }]}>
                  Your digital coupon stack has been automatically ported to offset delivery fees.
                </Text>
              </View>

              <TouchableOpacity style={[s.cta, s.ctaBlue]} onPress={navDelivery} activeOpacity={0.85}>
                <Text style={[s.ctaText, s.ctaTextBlue]}>Send to Delivery Cart</Text>
                <Feather name="arrow-right" size={15} color={BLUE} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ══ Card 3 — Eat Out / Takeout ══════════════════════════════ */}
        <View style={[s.card, s.cardShadow]}>
          <Sidebar
            bg={CHARCOAL}
            darkBg={CHARCOAL_DK}
            icon="coffee"
            label={'Eat Out /\nTakeout'}
            badge="SMART CHOICE"
            badgeDark
          />
          <View style={s.cardBody}>
            <ImagePlaceholder
              bg="#334155"
              icon="hamburger"
              eaters={cards.eaters}
              goalLabel={cards.goalLabel}
            />
            <View style={s.cardContent}>
              <Text style={s.recipeTitle}>Chipotle High-Protein Bowl Match</Text>
              <Text style={s.recipeDesc}>
                We mapped your macro goals to the cleanest, lowest-cost local takeout option nearby.
              </Text>

              {/* Uber Eats promo row */}
              <View style={s.uberRow}>
                <View style={s.uberBadge}>
                  <FontAwesome5 name="motorcycle" size={13} color={WHITE} solid />
                  <Text style={s.uberBadgeText}>Uber Eats</Text>
                </View>
                <Text style={s.uberPromo}>Promo Applied: SNIPPD20</Text>
              </View>
              <Text style={s.uberPromoSub}>
                20% discount code auto-injected into your delivery checkout path.
              </Text>

              <View style={s.metricsRow}>
                <View style={s.metric}>
                  <Text style={s.metricPrice}>~{fmt(cards.takeout.totalCents)}</Text>
                  <Text style={s.metricLabel}>TOTAL COST</Text>
                  <Text style={s.metricSub}>~${cards.takeout.perPerson} / person</Text>
                  <Text style={s.metricSub}>Includes 20% in-app promo code</Text>
                </View>
                <View style={s.metricDivider} />
                <View style={s.metric}>
                  <Text style={s.metricTime}>10</Text>
                  <Text style={s.metricLabel}>MIN PICKUP</Text>
                  <Text style={s.metricSub}>25 MIN DELIVERY</Text>
                </View>
              </View>

              <TouchableOpacity style={[s.cta, s.ctaOutline]} onPress={navTakeout} activeOpacity={0.85}>
                <Text style={[s.ctaText, s.ctaTextDark]}>View Clean Takeout Match</Text>
                <Feather name="arrow-right" size={15} color={NAVY} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

TodayOptionsRankedScreen.propTypes = {
  navigation: PropTypes.shape({
    navigate:   PropTypes.func.isRequired,
    canGoBack:  PropTypes.func,
    goBack:     PropTypes.func,
  }).isRequired,
  route: PropTypes.object,
};

// ── Stylesheets ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: WHITE },
  scroll: { paddingBottom: 24 },

  // Header
  header:  { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn: { marginBottom: 12, alignSelf: 'flex-start' },
  headline: {
    fontSize: 28, fontWeight: '800', color: NAVY,
    letterSpacing: -0.5, lineHeight: 34, marginBottom: 6,
  },
  sub: { fontSize: 14, color: SLATE, lineHeight: 20 },

  // Wallet banner
  bannerWrap: { paddingHorizontal: 20, marginBottom: 20 },

  // Cards
  card: {
    marginHorizontal: 20, marginBottom: 16,
    borderRadius: 18, overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: WHITE,
  },
  cardShadow: {
    ...Platform.select({
      web:     { boxShadow: '0 2px 16px rgba(0,0,0,0.08)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
    }),
  },
  cardBody:    { flex: 1, flexDirection: 'column' },
  cardContent: { padding: 14 },

  // Metrics row
  metricsRow:    { flexDirection: 'row', gap: 12, marginBottom: 12, marginTop: 8 },
  metric:        { flex: 1 },
  metricDivider: { width: 1, backgroundColor: BORDER },
  metricPrice: {
    fontSize: 20, fontWeight: '800', color: NAVY, letterSpacing: -0.3,
  },
  metricFeeSuffix: { fontSize: 13, fontWeight: '500', color: GRAY },
  metricTime:  { fontSize: 20, fontWeight: '800', color: GREEN },
  metricLabel: { fontSize: 10, fontWeight: '700', color: GRAY, letterSpacing: 0.5, marginTop: 1 },
  metricSub:   { fontSize: 11, color: SLATE, lineHeight: 15, marginTop: 2 },

  // Recipe copy
  recipeTitle: { fontSize: 15, fontWeight: '700', color: NAVY, marginBottom: 4, lineHeight: 20 },
  recipeDesc:  { fontSize: 12, color: SLATE, lineHeight: 17, marginBottom: 4 },

  // Uber Eats row
  uberRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  uberBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#000', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  uberBadgeText: { fontSize: 11, fontWeight: '700', color: WHITE },
  uberPromo:     { fontSize: 12, fontWeight: '600', color: NAVY },
  uberPromoSub:  { fontSize: 11, color: SLATE, lineHeight: 15, marginBottom: 8 },

  // CTA buttons
  cta: {
    borderRadius: 10, paddingVertical: 11,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 12,
  },
  ctaGreen:     { backgroundColor: GREEN },
  ctaBlue:      { borderWidth: 1.5, borderColor: BLUE },
  ctaOutline:   { borderWidth: 1.5, borderColor: BORDER },
  ctaText:      { fontSize: 13, fontWeight: '700' },
  ctaTextWhite: { color: WHITE },
  ctaTextBlue:  { color: BLUE },
  ctaTextDark:  { color: NAVY },
});

const wb = StyleSheet.create({
  card: {
    backgroundColor: GREEN, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
    ...Platform.select({
      web:     { boxShadow: '0 2px 12px rgba(12,158,84,0.25)' },
      default: { shadowColor: GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
    }),
  },
  left:      { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  mid:       { flex: 1 },
  amount:    { fontSize: 14, fontWeight: '700', color: WHITE, lineHeight: 20 },
  highlight: { fontSize: 16, fontWeight: '800', color: WHITE },
  sub:       { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
});

const pb = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  text: { fontSize: 11, fontWeight: '700', color: WHITE, letterSpacing: 0.3 },
});

const ip = StyleSheet.create({
  box: {
    height: 88, width: '100%',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  badgeWrap: { position: 'absolute', top: 8, left: 10 },
});

const sb = StyleSheet.create({
  col: {
    width: 88, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, paddingHorizontal: 8, gap: 10,
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  label: {
    fontSize: 12, fontWeight: '800', color: WHITE,
    textAlign: 'center', lineHeight: 16, letterSpacing: 0.2,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeDark: { backgroundColor: 'rgba(0,0,0,0.25)' },
  badgeText: {
    fontSize: 8, fontWeight: '800', color: WHITE,
    letterSpacing: 0.5, textAlign: 'center',
  },
});

const cr = StyleSheet.create({
  wrap: {
    backgroundColor: MINT_SOFT, borderRadius: 10,
    borderWidth: 1, borderColor: '#BBF7D0',
    padding: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  left:   { flexDirection: 'row', alignItems: 'center' },
  label:  { fontSize: 12, fontWeight: '700', color: GREEN },
  saving: { fontSize: 12, fontWeight: '700', color: GREEN },
  item:   { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  itemText: { fontSize: 11, color: SLATE, flex: 1 },
});
