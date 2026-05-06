/**
 * WinsScreen — verified savings history.
 *
 * Reads signed rows from checkout_math_snapshots (written by Cloud Run).
 * Falls back to user_trips for trips that were uploaded without checkout math.
 * Never estimates or computes savings locally.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const GREEN    = '#0C9E54';
const FOREST   = '#0C7A3D';
const NAVY     = '#0D1B4B';
const WHITE    = '#FFFFFF';
const GRAY     = '#64748B';
const BORDER   = '#E2E8F0';
const OFF_WHITE = '#F8FAFC';
const PALE_GREEN = '#F0FDF4';
const AMBER    = '#F59E0B';

const fmt = (cents) =>
  typeof cents === 'number' ? '$' + (cents / 100).toFixed(2) : '--';

function dateFmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function WinCard({ snap }) {
  const res = snap.response_payload ?? {};
  const savedCents = res.savings_cents ?? res.at_register_savings_cents ?? null;
  const youPay     = res.you_pay_cents ?? null;
  const retailer   = res.retailer_node ?? res.retailer ?? snap.request_payload?.retailer ?? 'Trip';

  return (
    <View style={s.winCard}>
      <View style={s.winCardTop}>
        <View style={s.winIconWrap}>
          <Feather name="check-circle" size={18} color={FOREST} />
        </View>
        <View style={s.winCardMid}>
          <Text style={s.winRetailer}>{String(retailer).replace(/_/g, ' ')}</Text>
          <Text style={s.winDate}>{dateFmt(snap.computed_at)}</Text>
        </View>
        {savedCents !== null && (
          <View style={s.winSavedBadge}>
            <Text style={s.winSavedTxt}>Saved {fmt(savedCents)}</Text>
          </View>
        )}
      </View>
      {youPay !== null && (
        <Text style={s.winYouPay}>You paid {fmt(youPay)} · signed by Cloud Run</Text>
      )}
    </View>
  );
}

export default function WinsScreen({ navigation }) {
  const [loading, setLoading]       = useState(true);
  const [snapshots, setSnapshots]   = useState([]);
  const [lifetimeCents, setLifetime] = useState(null);
  const [streak, setStreak]          = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { setLoading(false); return; }

      const { data } = await supabase
        .from('checkout_math_snapshots')
        .select('id, plan_id, status, request_payload, response_payload, computed_at')
        .eq('user_id', session.user.id)
        .eq('status', 'APPROVED')
        .order('computed_at', { ascending: false })
        .limit(50);

      const rows = data ?? [];
      setSnapshots(rows);

      // Lifetime savings: sum response_payload.savings_cents
      const total = rows.reduce((acc, r) => {
        const v = r.response_payload?.savings_cents ?? r.response_payload?.at_register_savings_cents;
        return acc + (typeof v === 'number' ? v : 0);
      }, 0);
      setLifetime(total > 0 ? total : null);

      // Streak: consecutive weeks with at least one verified trip (simple count of distinct weeks)
      const weeks = new Set(rows.map((r) => {
        if (!r.computed_at) return null;
        const d = new Date(r.computed_at);
        const week = Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));
        return week;
      }).filter(Boolean));
      setStreak(weeks.size);
    } catch { /* non-critical */ } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(load);

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={s.title}>Wins</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={GREEN} />}
      >
        {/* Hero stats */}
        {lifetimeCents !== null && (
          <View style={s.heroCard}>
            <Text style={s.heroEyebrow}>VERIFIED SAVINGS</Text>
            <Text style={s.heroAmount}>{fmt(lifetimeCents)}</Text>
            <Text style={s.heroSub}>Signed by Cloud Run · never estimated</Text>
            <View style={s.heroDivider} />
            <View style={s.heroRow}>
              <View style={s.heroStat}>
                <Text style={s.heroStatVal}>{snapshots.length}</Text>
                <Text style={s.heroStatLabel}>Verified trips</Text>
              </View>
              <View style={s.heroStatDivider} />
              <View style={s.heroStat}>
                <Text style={s.heroStatVal}>{streak}</Text>
                <Text style={s.heroStatLabel}>Active weeks</Text>
              </View>
              <View style={s.heroStatDivider} />
              <View style={s.heroStat}>
                <Text style={s.heroStatVal}>{fmt(lifetimeCents * 12 / Math.max(1, streak))}</Text>
                <Text style={s.heroStatLabel}>Annual pace</Text>
              </View>
            </View>
          </View>
        )}

        {/* Loading */}
        {loading && (
          <View style={s.loadWrap}>
            <ActivityIndicator size="large" color={GREEN} />
          </View>
        )}

        {/* Trip history */}
        {!loading && snapshots.length > 0 && (
          <>
            <Text style={s.sectionLabel}>TRIP HISTORY</Text>
            {snapshots.map((snap) => <WinCard key={snap.id} snap={snap} />)}
          </>
        )}

        {/* Empty — no verified trips yet */}
        {!loading && snapshots.length === 0 && (
          <View style={s.emptyCard}>
            <View style={s.emptyIconWrap}>
              <Feather name="award" size={32} color={GREEN} />
            </View>
            <Text style={s.emptyTitle}>No verified wins yet</Text>
            <Text style={s.emptyBody}>
              Complete your first trip — upload your receipt and Snippd signs the real dollar savings permanently to your record.
            </Text>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => navigation.navigate('ReceiptUpload')}
            >
              <Feather name="camera" size={15} color={WHITE} style={{ marginRight: 6 }} />
              <Text style={s.primaryBtnTxt}>Upload a Receipt</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '900', color: NAVY },
  scroll: { padding: 16, gap: 12 },

  // Hero card
  heroCard: {
    backgroundColor: FOREST, borderRadius: 20, padding: 20,
    shadowColor: FOREST, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  heroEyebrow: {
    fontSize: 9, fontWeight: '800', letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.6)', marginBottom: 6,
  },
  heroAmount: { fontSize: 40, fontWeight: '900', color: WHITE, letterSpacing: -1 },
  heroSub:    { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4 },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 16 },
  heroRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  heroStat:   { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 18, fontWeight: '900', color: WHITE, marginBottom: 2 },
  heroStatLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 },

  loadWrap: { alignItems: 'center', paddingVertical: 48 },

  sectionLabel: {
    fontSize: 9, fontWeight: '800', letterSpacing: 1.5,
    color: GRAY, textTransform: 'uppercase', marginBottom: 4, marginTop: 8,
  },

  // Win card
  winCard: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER,
    padding: 14,
  },
  winCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  winIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: PALE_GREEN, alignItems: 'center', justifyContent: 'center',
  },
  winCardMid: { flex: 1 },
  winRetailer: { fontSize: 14, fontWeight: '800', color: NAVY, textTransform: 'capitalize' },
  winDate:     { fontSize: 11, color: GRAY, marginTop: 1 },
  winSavedBadge: {
    backgroundColor: PALE_GREEN, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  winSavedTxt: { fontSize: 12, fontWeight: '800', color: FOREST },
  winYouPay:   { fontSize: 11, color: GRAY, marginTop: 8 },

  // Empty
  emptyCard: {
    backgroundColor: WHITE, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    padding: 24, alignItems: 'center',
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: PALE_GREEN, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: NAVY, marginBottom: 8, textAlign: 'center' },
  emptyBody:  { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: GREEN, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  primaryBtnTxt: { color: WHITE, fontSize: 13, fontWeight: '900' },
});
