import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { tracker } from '../lib/eventTracker';

const { width: SCREEN_W } = Dimensions.get('window');

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
const MINT       = '#E8F5E9';

function fmt(cents) {
  if (cents == null) return '$0.00';
  return '$' + (cents / 100).toFixed(2);
}

function fmtBig(cents) {
  if (!cents) return '$0';
  const dollars = cents / 100;
  if (dollars >= 1000) return '$' + (dollars / 1000).toFixed(1) + 'k';
  return '$' + Math.round(dollars);
}

// ─────────────────────────────────────────────────────────────
// Mini bar chart — time series
// ─────────────────────────────────────────────────────────────
function BarChart({ data, accentColor }) {
  if (!data?.length) return null;

  const maxVal = Math.max(...data.map((d) => d.savings || 0), 1);
  const BAR_W  = Math.floor((SCREEN_W - 48) / Math.min(data.length, 8)) - 4;

  const slice = data.slice(-8); // show last 8 points

  return (
    <View style={chart.wrap}>
      {slice.map((point, i) => {
        const h = Math.max(4, Math.round(((point.savings || 0) / maxVal) * 72));
        const isLast = i === slice.length - 1;
        return (
          <View key={i} style={[chart.col, { width: BAR_W }]}>
            <View style={[chart.bar, { height: h, backgroundColor: isLast ? accentColor : accentColor + '60' }]} />
            <Text style={chart.label} numberOfLines={1}>
              {point.date?.slice(5) ?? ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const chart = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingTop: 8, paddingBottom: 4 },
  col:   { alignItems: 'center', gap: 4 },
  bar:   { borderRadius: 4, minWidth: 8 },
  label: { fontSize: 8, color: GRAY, fontWeight: '600' },
});

// ─────────────────────────────────────────────────────────────
// Velocity gauge
// ─────────────────────────────────────────────────────────────
function VelocityGauge({ score }) {
  const pct   = Math.min(1, Math.max(0, score ?? 0));
  const label = pct >= 0.7 ? 'Accelerating' : pct >= 0.4 ? 'Steady' : 'Building';
  const color = pct >= 0.7 ? GREEN : pct >= 0.4 ? AMBER : BLUE;
  const barW  = SCREEN_W - 64;

  return (
    <View style={vel.wrap}>
      <View style={vel.header}>
        <Text style={vel.title}>Savings Velocity</Text>
        <View style={[vel.badge, { backgroundColor: color + '20' }]}>
          <Text style={[vel.badgeTxt, { color }]}>{label}</Text>
        </View>
      </View>
      <View style={vel.track}>
        <View style={[vel.fill, { width: pct * barW, backgroundColor: color }]} />
      </View>
      <Text style={vel.pct}>{Math.round(pct * 100)}% vs 4-week average</Text>
    </View>
  );
}

const vel = StyleSheet.create({
  wrap:     { marginBottom: 16 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title:    { fontSize: 13, fontWeight: '800', color: NAVY },
  badge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  track:    { height: 8, backgroundColor: BORDER, borderRadius: 4, overflow: 'hidden' },
  fill:     { height: '100%', borderRadius: 4 },
  pct:      { fontSize: 10, color: GRAY, fontWeight: '600', marginTop: 6 },
});

// ─────────────────────────────────────────────────────────────
// Transparency report accordion
// ─────────────────────────────────────────────────────────────
function TransparencyReport({ report }) {
  const [open, setOpen] = useState(false);
  if (!report) return null;

  return (
    <View style={tr.wrap}>
      <TouchableOpacity style={tr.header} onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <View style={tr.titleRow}>
          <Feather name="info" size={14} color={BLUE} />
          <Text style={tr.title}>How We Calculate This</Text>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={GRAY} />
      </TouchableOpacity>

      {open && (
        <View style={tr.body}>
          <View style={tr.formulaBox}>
            <Text style={tr.formulaLabel}>FORMULA</Text>
            <Text style={tr.formula}>{report.formula}</Text>
          </View>

          <Text style={tr.versionTxt}>Math version: {report.math_version}</Text>

          {report.breakdown?.map((item, i) => (
            <View key={i} style={tr.row}>
              <View style={tr.rowHeader}>
                <Text style={tr.component}>{item.component}</Text>
                <Text style={tr.value}>{typeof item.value === 'number' && item.value > 100
                  ? fmt(item.value)
                  : typeof item.value === 'number'
                    ? item.value.toFixed(2)
                    : item.value}</Text>
              </View>
              <Text style={tr.explanation}>{item.explanation}</Text>
            </View>
          ))}

          {report.data_sources?.length > 0 && (
            <View style={tr.sourcesWrap}>
              <Text style={tr.sourcesLabel}>DATA SOURCES</Text>
              {report.data_sources.map((s, i) => (
                <Text key={i} style={tr.source}>· {s}</Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const tr = StyleSheet.create({
  wrap:        { backgroundColor: PALE_BLUE, borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:       { fontSize: 13, fontWeight: '700', color: NAVY },
  body:        { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  formulaBox:  { backgroundColor: NAVY, borderRadius: 10, padding: 12 },
  formulaLabel:{ fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.5)', letterSpacing: 0.8, marginBottom: 4 },
  formula:     { fontSize: 12, color: WHITE, fontFamily: 'monospace', lineHeight: 18 },
  versionTxt:  { fontSize: 10, color: GRAY, fontWeight: '600' },
  row:         { borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 8, gap: 3 },
  rowHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  component:   { fontSize: 12, fontWeight: '700', color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5 },
  value:       { fontSize: 12, fontWeight: '900', color: BLUE },
  explanation: { fontSize: 11, color: GRAY, lineHeight: 16 },
  sourcesWrap: { gap: 3 },
  sourcesLabel:{ fontSize: 9, fontWeight: '800', color: GRAY, letterSpacing: 0.8 },
  source:      { fontSize: 11, color: GRAY },
});

// ─────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, bg }) {
  return (
    <View style={[sc.wrap, { backgroundColor: bg }]}>
      <View style={[sc.iconWrap, { backgroundColor: color + '20' }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
      {sub ? <Text style={sc.sub}>{sub}</Text> : null}
    </View>
  );
}

const sc = StyleSheet.create({
  wrap:     { flex: 1, borderRadius: 16, padding: 14, gap: 6 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  value:    { fontSize: 20, fontWeight: '900', lineHeight: 24 },
  label:    { fontSize: 10, fontWeight: '800', color: GRAY, letterSpacing: 0.5 },
  sub:      { fontSize: 9, color: GRAY },
});

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
export default function WealthMomentumScreen({ navigation }) {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [data, setData]         = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Please sign in to view your wealth momentum.');
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-wealth-momentum`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const json = await res.json();
      setData(json.data);

      // Track screen view
      tracker.emit({
        event_name:  'WEALTH_SNAPSHOT_VIEWED',
        user_id:     session.user.id,
        session_id:  session.access_token,
        screen_name: 'WealthMomentumScreen',
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={s.center}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={s.loadingTxt}>Loading your wealth momentum…</Text>
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
          <Feather name="alert-circle" size={40} color={AMBER} />
          <Text style={s.errorTitle}>Couldn't load momentum</Text>
          <Text style={s.errorSub}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={fetchData}>
            <Text style={s.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const velocity          = data?.current_velocity_score ?? 0;
  const lifetimeSavings   = data?.lifetime_realized_savings ?? 0; // in cents/dollars
  const inflationShield   = data?.inflation_shield_total ?? 0;
  const timeSeries        = data?.time_series ?? [];
  const latestSnap        = data?.snapshots?.[0];
  const annualProjection  = latestSnap?.projected_annual_wealth ?? 0;
  const transparencyReport = data?.transparency_report;

  // lifetime_realized_savings from the API is already in dollars (from wealth_momentum_snapshots)
  const lifetimeCents    = Math.round((lifetimeSavings ?? 0) * 100);
  const inflationCents   = Math.round((inflationShield ?? 0) * 100);
  const annualCents      = Math.round((annualProjection ?? 0) * 100);

  const isEmpty = timeSeries.length === 0 && !latestSnap;

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Wealth Momentum</Text>
          <Text style={s.headerSub}>Your savings are working for you</Text>
        </View>
        <TouchableOpacity onPress={fetchData} style={s.backBtn}>
          <Feather name="refresh-cw" size={18} color={NAVY} />
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Feather name="trending-up" size={28} color={GREEN} />
          </View>
          <Text style={s.emptyTitle}>No momentum data yet</Text>
          <Text style={s.emptySub}>
            Upload your first receipt to start tracking your wealth momentum.
          </Text>
          <TouchableOpacity
            style={s.uploadBtn}
            onPress={() => navigation.navigate('ReceiptUpload')}
          >
            <Text style={s.uploadBtnTxt}>Upload Receipt</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — annual projection */}
          <View style={s.hero}>
            <Text style={s.heroSub}>PROJECTED ANNUAL SAVINGS</Text>
            <Text style={s.heroAmount}>{fmtBig(annualCents)}</Text>
            <Text style={s.heroCaption}>Based on your current shopping patterns</Text>
          </View>

          {/* Key stats row */}
          <View style={s.statsRow}>
            <StatCard
              icon="dollar-sign"
              label="LIFETIME SAVINGS"
              value={fmtBig(lifetimeCents)}
              color={GREEN}
              bg={LIGHT_GREEN}
            />
            <StatCard
              icon="shield"
              label="INFLATION SHIELD"
              value={fmtBig(inflationCents)}
              sub="vs USDA avg prices"
              color={BLUE}
              bg={PALE_BLUE}
            />
          </View>

          {/* Velocity gauge */}
          <View style={s.section}>
            <VelocityGauge score={velocity} />
          </View>

          {/* Bar chart */}
          {timeSeries.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>WEEKLY SAVINGS HISTORY</Text>
                <Text style={s.sectionSub}>last {Math.min(timeSeries.length, 8)} weeks</Text>
              </View>
              <BarChart data={timeSeries} accentColor={GREEN} />
            </View>
          )}

          {/* Recent snapshots */}
          {data?.snapshots?.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>RECENT SNAPSHOTS</Text>
              {data.snapshots.slice(0, 4).map((snap, i) => (
                <View key={i} style={s.snapRow}>
                  <View style={s.snapLeft}>
                    <Text style={s.snapDate}>{snap.timestamp?.split('T')[0]}</Text>
                    <Text style={s.snapSavings}>
                      {fmtBig(Math.round((snap.realized_savings ?? 0) * 100))} saved
                    </Text>
                  </View>
                  <View style={s.snapRight}>
                    <View style={[s.velocityDot, { backgroundColor: (snap.velocity_score ?? 0) >= 0.5 ? GREEN : AMBER }]} />
                    <Text style={s.snapVelocity}>
                      v{((snap.velocity_score ?? 0) * 100).toFixed(0)}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Transparency report */}
          <View style={s.section}>
            <TransparencyReport report={transparencyReport} />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: OFF_WHITE },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  loadingTxt: { fontSize: 14, color: GRAY, fontWeight: '600', marginTop: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  headerSub:   { fontSize: 11, color: GRAY, fontWeight: '600', marginTop: 1 },

  // Hero
  hero: {
    backgroundColor: NAVY, paddingHorizontal: 24, paddingVertical: 28, alignItems: 'center', gap: 4,
  },
  heroSub:     { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2 },
  heroAmount:  { fontSize: 52, fontWeight: '900', color: WHITE, lineHeight: 58, letterSpacing: -2 },
  heroCaption: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },

  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  section: {
    backgroundColor: WHITE, marginHorizontal: 16, marginTop: 10,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle:  { fontSize: 10, fontWeight: '800', color: GRAY, letterSpacing: 1 },
  sectionSub:    { fontSize: 10, color: GRAY },

  snapRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  snapLeft:   { gap: 2 },
  snapDate:   { fontSize: 12, fontWeight: '700', color: NAVY },
  snapSavings: { fontSize: 11, color: GRAY, fontWeight: '600' },
  snapRight:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  velocityDot: { width: 8, height: 8, borderRadius: 4 },
  snapVelocity: { fontSize: 12, fontWeight: '700', color: NAVY },

  emptyIcon:  { width: 72, height: 72, borderRadius: 36, backgroundColor: LIGHT_GREEN, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: NAVY },
  emptySub:   { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 20 },
  uploadBtn:  { backgroundColor: GREEN, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  uploadBtnTxt: { color: WHITE, fontSize: 15, fontWeight: '800' },

  errorTitle: { fontSize: 17, fontWeight: '800', color: NAVY, marginTop: 12 },
  errorSub:   { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 19 },
  retryBtn:   { backgroundColor: GREEN, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  retryTxt:   { color: WHITE, fontWeight: '800' },
});
