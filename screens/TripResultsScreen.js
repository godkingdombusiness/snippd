import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { runFreshStart } from '../lib/freshStart';

const GREEN  = '#0C9E54';
const NAVY   = '#0D1B4B';
const WHITE  = '#FFFFFF';
const GRAY   = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const PALE_GREEN = '#F0FDF4';
const BORDER = '#F0F1F3';
const AMBER  = '#F59E0B';

const SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

// ── TripResultsScreen ─────────────────────────────────────────────────────────
// route.params:
//   trip: { store_name, total_spent_cents, total_savings_cents, items, verified_at }
//
// The "Fresh Start" button triggers the full returning-user loop:
//   close_week → pantry_velocity → ai_training_features → Gemini → home_payload_cache
// Then navigates to WinsScreen with celebration data.

export default function TripResultsScreen({ route, navigation }) {
  const trip = route?.params?.trip || null;
  const [loading, setLoading] = useState(false);

  const yieldPct = trip?.total_savings_cents && trip?.total_spent_cents
    ? Math.round(
        (trip.total_savings_cents /
          (trip.total_savings_cents + trip.total_spent_cents)) * 100
      )
    : 0;

  const handleFreshStart = async () => {
    setLoading(true);
    try {
      const summary = await runFreshStart({
        tripItems:       trip?.items || [],
        storeName:       trip?.store_name || trip?.store || 'Your Store',
        totalSpentCents: trip?.total_spent_cents || 0,
        savedCents:      trip?.total_savings_cents || 0,
      });
      navigation.navigate('Wins', { freshStart: summary });
    } catch (e) {
      Alert.alert(
        'Sync Error',
        'Could not sync your trip right now. Your savings are saved — try again shortly.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!trip) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.emptyCard}>
            <View style={s.emptyIconWrap}>
              <Feather name="shopping-bag" size={32} color={GREEN} />
            </View>
            <Text style={s.emptyTitle}>No trips verified yet</Text>
            <Text style={s.emptySub}>
              Verify your first receipt to see your full trip breakdown,
              savings analysis, and personalized recommendations.
            </Text>
            <TouchableOpacity style={s.cta} onPress={() => navigation.navigate('ReceiptUpload')}>
              <Text style={s.ctaTxt}>Verify Your First Receipt</Text>
            </TouchableOpacity>
          </View>

          <View style={s.howCard}>
            <Text style={s.howTitle}>How the magic works</Text>
            {[
              { icon: 'upload', text: 'Upload and verify your receipt after each shopping trip' },
              { icon: 'cpu', text: 'Snippd compares your cart against your stacks and learns your patterns' },
              { icon: 'trending-up', text: 'Each trip makes next week\'s recommendations smarter and more personal' },
              { icon: 'award', text: 'Earn 10 Stash Credits and extend your savings streak' },
            ].map((item, i) => (
              <View key={i} style={s.howRow}>
                <View style={s.howIconWrap}>
                  <Feather name={item.icon} size={15} color={GREEN} />
                </View>
                <Text style={s.howTxt}>{item.text}</Text>
              </View>
            ))}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Trip result state ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Hero */}
      <View style={s.hero}>
        <Text style={s.heroEyebrow}>TRIP COMPLETE</Text>
        <Text style={s.heroStore}>{trip.store_name || trip.store || 'Your Trip'}</Text>
        <Text style={s.heroSaved}>{fmt(trip.total_savings_cents)}</Text>
        <Text style={s.heroSavedLabel}>saved this trip</Text>

        <View style={s.heroStats}>
          <View style={s.heroStat}>
            <Text style={s.heroStatVal}>{fmt(trip.total_spent_cents)}</Text>
            <Text style={s.heroStatLabel}>SPENT</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={s.heroStatVal}>{yieldPct}%</Text>
            <Text style={s.heroStatLabel}>YIELD</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={s.heroStatVal}>{trip.items?.length || trip.items_on_stack || 0}</Text>
            <Text style={s.heroStatLabel}>ITEMS</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* What's next card */}
        <View style={s.nextCard}>
          <View style={s.nextHeader}>
            <Feather name="zap" size={18} color={AMBER} />
            <Text style={s.nextTitle}>Ready for next week?</Text>
          </View>
          <Text style={s.nextSub}>
            Tap Fresh Start and Snippd will reset your budget, log your savings,
            update your streak, and generate a personalized deal feed just for you —
            based on exactly what you bought today.
          </Text>

          <View style={s.nextBenefits}>
            {[
              { icon: 'refresh-cw', label: 'Budget resets to $0 spent' },
              { icon: 'bar-chart-2', label: 'Savings locked into lifetime total' },
              { icon: 'zap', label: '+10 Stash Credits awarded' },
              { icon: 'star', label: 'Streak updated' },
              { icon: 'cpu', label: 'Personalized feed generated' },
            ].map((b, i) => (
              <View key={i} style={s.benefit}>
                <Feather name={b.icon} size={14} color={GREEN} />
                <Text style={s.benefitTxt}>{b.label}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[s.freshBtn, loading && s.freshBtnLoading]}
            onPress={handleFreshStart}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <View style={s.freshBtnInner}>
                <ActivityIndicator color={WHITE} size="small" />
                <Text style={s.freshBtnTxt}>Personalizing next week...</Text>
              </View>
            ) : (
              <View style={s.freshBtnInner}>
                <Feather name="refresh-cw" size={16} color={WHITE} />
                <Text style={s.freshBtnTxt}>Fresh Start</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Items breakdown */}
        {trip.items?.length > 0 && (
          <View style={s.itemsCard}>
            <Text style={s.itemsTitle}>Items Verified</Text>
            {trip.items.slice(0, 8).map((item, i) => (
              <View key={i} style={[s.itemRow, i === Math.min(trip.items.length, 8) - 1 && { borderBottomWidth: 0 }]}>
                <Text style={s.itemName} numberOfLines={1}>{item.product_name || item.item_name || 'Item'}</Text>
                <Text style={s.itemPrice}>{fmt(item.final_unit_price_cents || item.sale_price || 0)}</Text>
              </View>
            ))}
            {trip.items.length > 8 && (
              <Text style={s.itemsMore}>+{trip.items.length - 8} more items</Text>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll:    { padding: 16 },

  // Empty state
  emptyCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 28,
    alignItems: 'center', borderWidth: 1, borderColor: BORDER,
    marginBottom: 16, ...SHADOW,
  },
  emptyIconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: NAVY, marginBottom: 8 },
  emptySub:   { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  cta: {
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 28, alignItems: 'center',
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  ctaTxt: { color: WHITE, fontSize: 15, fontWeight: 'bold' },

  howCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  howTitle: { fontSize: 15, fontWeight: 'bold', color: NAVY, marginBottom: 14 },
  howRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  howIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: PALE_GREEN, alignItems: 'center', justifyContent: 'center',
  },
  howTxt: { flex: 1, fontSize: 13, color: GRAY, lineHeight: 19 },

  // Hero
  hero: {
    backgroundColor: NAVY, paddingHorizontal: 24,
    paddingTop: 24, paddingBottom: 28,
    alignItems: 'center',
  },
  heroEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: GREEN, letterSpacing: 1.5, marginBottom: 6,
  },
  heroStore:     { fontSize: 16, color: 'rgba(255,255,255,0.6)', marginBottom: 8 },
  heroSaved:     { fontSize: 52, fontWeight: 'bold', color: WHITE, letterSpacing: -2, lineHeight: 56 },
  heroSavedLabel:{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 20 },
  heroStats:     { flexDirection: 'row', gap: 0 },
  heroStat:      { alignItems: 'center', paddingHorizontal: 24 },
  heroStatVal:   { fontSize: 18, fontWeight: 'bold', color: WHITE, marginBottom: 2 },
  heroStatLabel: { fontSize: 9, fontWeight: 'bold', color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 4 },

  // Next week card
  nextCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: BORDER, marginBottom: 12, ...SHADOW,
  },
  nextHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  nextTitle:  { fontSize: 17, fontWeight: 'bold', color: NAVY },
  nextSub:    { fontSize: 13, color: GRAY, lineHeight: 20, marginBottom: 16 },
  nextBenefits: { gap: 8, marginBottom: 20 },
  benefit:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitTxt: { fontSize: 13, color: NAVY, fontWeight: 'normal' },

  freshBtn: {
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 17,
    alignItems: 'center',
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  freshBtnLoading: { backgroundColor: '#4CAF50', shadowOpacity: 0.1 },
  freshBtnInner:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  freshBtnTxt:     { color: WHITE, fontSize: 16, fontWeight: 'bold' },

  // Items
  itemsCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  itemsTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 12 },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  itemName:  { flex: 1, fontSize: 13, color: NAVY, marginRight: 12 },
  itemPrice: { fontSize: 13, fontWeight: 'bold', color: GREEN },
  itemsMore: { fontSize: 12, color: GRAY, textAlign: 'center', paddingTop: 10 },
});
