/**
 * AdminAnalyticsDashboardScreen
 *
 * Six analytics sections for admin users:
 *   1. Deal Pipeline Health      — ingestion_jobs by status
 *   2. Recommendation Performance — v_recommendation_funnel (7-day)
 *   3. User Savings Velocity     — wealth_momentum_snapshots (7-day totals)
 *   4. Behavioral Signal Health  — event_stream event counts (mini bar chart)
 *   5. Vertex Training Readiness — event coverage progress bars
 *   6. Anonymized Market Signals — anonymized_signals aggregate
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ── Colors ────────────────────────────────────────────────────
const GREEN  = '#0C9E54';
const NAVY   = '#0D1B4B';
const RED    = '#FF3B30';
const AMBER  = '#F59E0B';
const WHITE  = '#FFFFFF';
const GRAY   = '#8E8E93';
const BG     = '#F2F2F7';
const BORDER = '#E5E5EA';
const MINT   = '#E8F5E9';
const CORAL  = '#FF7043';

const ADMIN_EMAILS = ['dina@getsnippd.com', 'admin@getsnippd.com'];

// ── Helpers ───────────────────────────────────────────────────

const fmt$ = (cents) => {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
};

const fmtPct = (v) => {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)}%`;
};

const fmtNum = (v) => {
  if (v == null) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
};

// ── Mini Bar Chart ─────────────────────────────────────────────
function MiniBar({ value, max, color = GREEN, label, count }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={barStyles.row}>
      <Text style={barStyles.label} numberOfLines={1}>{label}</Text>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={barStyles.count}>{fmtNum(count ?? value)}</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { width: 90, fontSize: 11, color: NAVY, fontWeight: '500' },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: BORDER, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 4 },
  count: { width: 40, textAlign: 'right', fontSize: 11, color: GRAY, fontWeight: '600' },
});

// ── Progress Bar ───────────────────────────────────────────────
function ProgressBar({ label, value, target, color = GREEN }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  return (
    <View style={progStyles.container}>
      <View style={progStyles.headerRow}>
        <Text style={progStyles.label}>{label}</Text>
        <Text style={[progStyles.pct, { color }]}>{Math.round(pct)}%</Text>
      </View>
      <View style={progStyles.track}>
        <View style={[progStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={progStyles.sub}>{fmtNum(value)} / {fmtNum(target)} rows</Text>
    </View>
  );
}

const progStyles = StyleSheet.create({
  container:  { marginBottom: 14 },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label:      { fontSize: 13, fontWeight: '600', color: NAVY },
  pct:        { fontSize: 13, fontWeight: '700' },
  track:      { height: 10, borderRadius: 5, backgroundColor: BORDER, overflow: 'hidden' },
  fill:       { height: '100%', borderRadius: 5 },
  sub:        { fontSize: 11, color: GRAY, marginTop: 4 },
});

// ── Stat Card ──────────────────────────────────────────────────
function StatCard({ label, value, color = NAVY, icon }) {
  return (
    <View style={cardStyles.container}>
      {icon && <Feather name={icon} size={16} color={color} style={{ marginBottom: 6 }} />}
      <Text style={[cardStyles.value, { color }]}>{value}</Text>
      <Text style={cardStyles.label}>{label}</Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', padding: 14,
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  value: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  label: { fontSize: 11, color: GRAY, textAlign: 'center', fontWeight: '500' },
});

// ── Section wrapper ─────────────────────────────────────────────
function Section({ title, icon, children, loading }) {
  return (
    <View style={secStyles.container}>
      <View style={secStyles.header}>
        <Feather name={icon} size={16} color={GREEN} />
        <Text style={secStyles.title}>{title}</Text>
        {loading && <ActivityIndicator size="small" color={GREEN} style={{ marginLeft: 8 }} />}
      </View>
      {children}
    </View>
  );
}

const secStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: WHITE, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    padding: 16, overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  title:  { fontSize: 15, fontWeight: '700', color: NAVY, marginLeft: 8, flex: 1 },
});

// ── Main Component ─────────────────────────────────────────────
export default function AdminAnalyticsDashboardScreen({ navigation }) {
  const [authorized, setAuthorized]     = useState(false);
  const [loading,    setLoading]        = useState({});
  const [pipeline,   setPipeline]       = useState(null);
  const [funnel,     setFunnel]         = useState(null);
  const [savings,    setSavings]        = useState(null);
  const [signals,    setSignals]        = useState([]);
  const [vertex,     setVertex]         = useState(null);
  const [market,     setMarket]         = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
        setAuthorized(true);
        loadAll();
      } else {
        Alert.alert('Access Denied', 'Admin only.');
        navigation.goBack();
      }
    })();
  }, []);

  const setLoad = (key, val) => setLoading(prev => ({ ...prev, [key]: val }));

  const loadAll = useCallback(() => {
    loadPipeline();
    loadFunnel();
    loadSavings();
    loadSignals();
    loadVertex();
    loadMarket();
  }, []);

  // ── 1. Deal Pipeline Health ────────────────────────────────
  const loadPipeline = async () => {
    setLoad('pipeline', true);
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('ingestion_jobs')
        .select('status')
        .gte('created_at', since);

      if (!data) return;
      const counts = { queued: 0, processing: 0, parsed: 0, failed: 0 };
      for (const row of data) {
        if (counts[row.status] !== undefined) counts[row.status]++;
      }
      setPipeline({ ...counts, total: data.length });
    } catch (e) {
      console.warn('[AdminAnalytics] pipeline:', e.message);
    } finally {
      setLoad('pipeline', false);
    }
  };

  // ── 2. Recommendation Performance ─────────────────────────
  const loadFunnel = async () => {
    setLoad('funnel', true);
    try {
      const { data } = await supabase
        .from('v_recommendation_funnel')
        .select('exposures, clicks, adds_to_cart, purchases, click_rate_pct, conversion_rate_pct')
        .gte('week_of', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .limit(20);

      if (!data || data.length === 0) { setFunnel(null); return; }

      const totals = data.reduce((acc, row) => ({
        exposures:       (acc.exposures       || 0) + (row.exposures       || 0),
        clicks:          (acc.clicks          || 0) + (row.clicks          || 0),
        adds_to_cart:    (acc.adds_to_cart    || 0) + (row.adds_to_cart    || 0),
        purchases:       (acc.purchases       || 0) + (row.purchases       || 0),
      }), {});

      setFunnel({
        ...totals,
        click_rate_pct:      totals.exposures > 0
          ? ((totals.clicks / totals.exposures) * 100).toFixed(1) : '0.0',
        conversion_rate_pct: totals.exposures > 0
          ? ((totals.purchases / totals.exposures) * 100).toFixed(1) : '0.0',
      });
    } catch (e) {
      console.warn('[AdminAnalytics] funnel:', e.message);
    } finally {
      setLoad('funnel', false);
    }
  };

  // ── 3. User Savings Velocity ───────────────────────────────
  const loadSavings = async () => {
    setLoad('savings', true);
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('wealth_momentum_snapshots')
        .select('realized_savings, wealth_momentum, velocity_score')
        .gte('timestamp', since);

      if (!data || data.length === 0) { setSavings(null); return; }

      const totalSavings   = data.reduce((s, r) => s + (r.realized_savings || 0), 0);
      const avgVelocity    = data.reduce((s, r) => s + (r.velocity_score || 0), 0) / data.length;
      const avgMomentum    = data.reduce((s, r) => s + (r.wealth_momentum || 0), 0) / data.length;

      setSavings({ totalSavings, avgVelocity, avgMomentum, receiptCount: data.length });
    } catch (e) {
      console.warn('[AdminAnalytics] savings:', e.message);
    } finally {
      setLoad('savings', false);
    }
  };

  // ── 4. Behavioral Signal Health ────────────────────────────
  const loadSignals = async () => {
    setLoad('signals', true);
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('event_stream')
        .select('event_name')
        .gte('created_at', since);

      if (!data) return;
      const counts = {};
      for (const row of data) {
        counts[row.event_name] = (counts[row.event_name] || 0) + 1;
      }
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }));

      setSignals(sorted);
    } catch (e) {
      console.warn('[AdminAnalytics] signals:', e.message);
    } finally {
      setLoad('signals', false);
    }
  };

  // ── 5. Vertex Training Readiness ───────────────────────────
  const loadVertex = async () => {
    setLoad('vertex', true);
    try {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const [evResult, expResult, snapResult] = await Promise.all([
        supabase.from('event_stream').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('recommendation_exposures').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('user_state_snapshots').select('id', { count: 'exact', head: true }).gte('snapshot_at', since),
      ]);

      setVertex({
        events:    evResult.count   ?? 0,
        exposures: expResult.count  ?? 0,
        snapshots: snapResult.count ?? 0,
      });
    } catch (e) {
      console.warn('[AdminAnalytics] vertex:', e.message);
    } finally {
      setLoad('vertex', false);
    }
  };

  // ── 6. Anonymized Market Signals ──────────────────────────
  const loadMarket = async () => {
    setLoad('market', true);
    try {
      const { data } = await supabase
        .from('anonymized_signals')
        .select('category, total_signals, avg_savings_cents, trend')
        .order('total_signals', { ascending: false })
        .limit(6);

      setMarket(data ?? []);
    } catch (e) {
      console.warn('[AdminAnalytics] market:', e.message);
    } finally {
      setLoad('market', false);
    }
  };

  if (!authorized) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={GREEN} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const signalMax = signals.length > 0 ? signals[0].count : 1;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadAll}>
          <Feather name="refresh-cw" size={16} color={GREEN} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── 1. Deal Pipeline Health ───────────────────────── */}
        <Section title="Deal Pipeline Health" icon="activity" loading={loading.pipeline}>
          {pipeline ? (
            <>
              <View style={styles.statRow}>
                <StatCard label="Queued"     value={pipeline.queued}     color={NAVY}  icon="clock" />
                <View style={{ width: 10 }} />
                <StatCard label="Parsing"    value={pipeline.processing} color={AMBER} icon="loader" />
                <View style={{ width: 10 }} />
                <StatCard label="Complete"   value={pipeline.parsed}     color={GREEN} icon="check-circle" />
                <View style={{ width: 10 }} />
                <StatCard label="Failed"     value={pipeline.failed}     color={RED}   icon="alert-circle" />
              </View>
              <Text style={styles.subText}>
                {pipeline.total} jobs in the last 7 days
                {pipeline.total > 0
                  ? ` · ${Math.round((pipeline.parsed / pipeline.total) * 100)}% success rate`
                  : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.emptyText}>No pipeline data</Text>
          )}
        </Section>

        {/* ── 2. Recommendation Performance ─────────────────── */}
        <Section title="Recommendation Performance" icon="target" loading={loading.funnel}>
          {funnel ? (
            <>
              <View style={styles.statRow}>
                <StatCard label="Exposures"   value={fmtNum(funnel.exposures)}    color={NAVY} />
                <View style={{ width: 10 }} />
                <StatCard label="Clicks"      value={fmtNum(funnel.clicks)}       color={AMBER} />
                <View style={{ width: 10 }} />
                <StatCard label="Purchases"   value={fmtNum(funnel.purchases)}    color={GREEN} />
              </View>
              <View style={styles.rateRow}>
                <View style={styles.rateChip}>
                  <Text style={styles.rateValue}>{fmtPct(funnel.click_rate_pct)}</Text>
                  <Text style={styles.rateLabel}>CTR</Text>
                </View>
                <View style={styles.rateChip}>
                  <Text style={[styles.rateValue, { color: GREEN }]}>{fmtPct(funnel.conversion_rate_pct)}</Text>
                  <Text style={styles.rateLabel}>Conversion</Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>No funnel data for this week</Text>
          )}
        </Section>

        {/* ── 3. User Savings Velocity ──────────────────────── */}
        <Section title="User Savings Velocity" icon="trending-up" loading={loading.savings}>
          {savings ? (
            <>
              <View style={styles.statRow}>
                <StatCard label="Total Saved"   value={fmt$(savings.totalSavings)}          color={GREEN} icon="dollar-sign" />
                <View style={{ width: 10 }} />
                <StatCard label="Avg Velocity"  value={savings.avgVelocity.toFixed(2) + 'x'} color={AMBER} icon="zap" />
                <View style={{ width: 10 }} />
                <StatCard label="Receipts"      value={savings.receiptCount}                color={NAVY}  icon="file-text" />
              </View>
              <Text style={styles.subText}>
                Avg wealth momentum: {fmtNum(savings.avgMomentum)}¢ per receipt
              </Text>
            </>
          ) : (
            <Text style={styles.emptyText}>No savings data</Text>
          )}
        </Section>

        {/* ── 4. Behavioral Signal Health ───────────────────── */}
        <Section title="Behavioral Signal Health" icon="radio" loading={loading.signals}>
          {signals.length > 0 ? (
            signals.map(({ name, count }) => (
              <MiniBar
                key={name}
                label={name.replace(/_/g, ' ')}
                value={count}
                max={signalMax}
                count={count}
                color={count > signalMax * 0.6 ? GREEN : count > signalMax * 0.3 ? AMBER : CORAL}
              />
            ))
          ) : (
            <Text style={styles.emptyText}>No events in last 7 days</Text>
          )}
        </Section>

        {/* ── 5. Vertex Training Readiness ──────────────────── */}
        <Section title="Vertex Training Readiness" icon="cpu" loading={loading.vertex}>
          {vertex ? (
            <>
              <ProgressBar
                label="Events (90d)"
                value={vertex.events}
                target={50000}
                color={vertex.events >= 50000 ? GREEN : vertex.events >= 20000 ? AMBER : CORAL}
              />
              <ProgressBar
                label="Exposures (90d)"
                value={vertex.exposures}
                target={10000}
                color={vertex.exposures >= 10000 ? GREEN : vertex.exposures >= 3000 ? AMBER : CORAL}
              />
              <ProgressBar
                label="User Snapshots"
                value={vertex.snapshots}
                target={5000}
                color={vertex.snapshots >= 5000 ? GREEN : vertex.snapshots >= 1000 ? AMBER : CORAL}
              />
              <Text style={styles.subText}>
                {vertex.events >= 50000 && vertex.exposures >= 10000 && vertex.snapshots >= 5000
                  ? '✓ Ready for Vertex AI training export'
                  : 'Collecting more data before training is recommended'}
              </Text>
            </>
          ) : (
            <Text style={styles.emptyText}>Loading readiness data...</Text>
          )}
        </Section>

        {/* ── 6. Anonymized Market Signals ──────────────────── */}
        <Section title="Market Signals" icon="bar-chart-2" loading={loading.market}>
          {market && market.length > 0 ? (
            market.map((sig, i) => (
              <View key={i} style={styles.marketRow}>
                <View style={styles.marketLeft}>
                  <Text style={styles.marketCategory}>{sig.category ?? '—'}</Text>
                  <Text style={styles.marketSub}>Avg savings: {fmt$(sig.avg_savings_cents)}</Text>
                </View>
                <View style={styles.marketRight}>
                  <Text style={styles.marketCount}>{fmtNum(sig.total_signals)}</Text>
                  {sig.trend === 'up' && <Feather name="trending-up"   size={12} color={GREEN} />}
                  {sig.trend === 'down' && <Feather name="trending-down" size={12} color={RED} />}
                  {!sig.trend && <Feather name="minus" size={12} color={GRAY} />}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No market signals</Text>
          )}
        </Section>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: NAVY },
  refreshBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  statRow: { flexDirection: 'row', marginBottom: 12 },

  subText: { fontSize: 12, color: GRAY, marginTop: 4 },
  emptyText: { fontSize: 13, color: GRAY, textAlign: 'center', paddingVertical: 8 },

  rateRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  rateChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    backgroundColor: BG, borderRadius: 12,
  },
  rateValue: { fontSize: 18, fontWeight: '800', color: NAVY },
  rateLabel: { fontSize: 11, color: GRAY, marginTop: 2 },

  marketRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  marketLeft:     { flex: 1 },
  marketCategory: { fontSize: 13, fontWeight: '700', color: NAVY, textTransform: 'capitalize' },
  marketSub:      { fontSize: 11, color: GRAY, marginTop: 2 },
  marketRight:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  marketCount:    { fontSize: 13, fontWeight: '700', color: NAVY },
});
