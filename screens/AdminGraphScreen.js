/**
 * AdminGraphScreen — Neo4j memory graph viewer
 *
 * Admin-only (same ADMIN_EMAILS guard as AdminPulseScreen).
 * Fetches from GET /functions/v1/admin-graph-stats.
 * Shows: connection status, node counts, relationship counts,
 * top categories, top brands, top co-occurrences, top cohort pairs.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase, SUPABASE_URL } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────

const GREEN  = '#0C9E54';
const NAVY   = '#0D1B4B';
const MINT   = '#E8F5E9';
const WHITE  = '#FFFFFF';
const GRAY   = '#8E8E93';
const BG     = '#F2F2F7';
const BORDER = '#E5E5EA';
const RED    = '#FF3B30';
const AMBER  = '#F59E0B';
const PURPLE = '#7C3AED';

const ADMIN_EMAILS = ['dina@getsnippd.com', 'admin@getsnippd.com'];

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MetricCard({ label, value, color = NAVY, icon }) {
  return (
    <View style={s.metricCard}>
      {icon && <Feather name={icon} size={16} color={color} style={{ marginBottom: 4 }} />}
      <Text style={[s.metricValue, { color }]}>{value.toLocaleString()}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function MetricRow({ items }) {
  return (
    <View style={s.metricRow}>
      {items.map((item, i) => <MetricCard key={i} {...item} />)}
    </View>
  );
}

function TableRow({ cols, bold, dimmed }) {
  return (
    <View style={[s.tableRow, dimmed && { opacity: 0.5 }]}>
      {cols.map((c, i) => (
        <Text
          key={i}
          style={[s.tableCell, i === 0 && s.tableCellPrimary, bold && { fontWeight: '700' }]}
          numberOfLines={1}
        >
          {c}
        </Text>
      ))}
    </View>
  );
}

function TopList({ columns, rows, emptyMsg = 'No data yet' }) {
  if (!rows || rows.length === 0) {
    return <Text style={s.emptyMsg}>{emptyMsg}</Text>;
  }
  return (
    <View style={s.table}>
      <TableRow cols={columns} bold />
      {rows.map((row, i) => <TableRow key={i} cols={row} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────

export default function AdminGraphScreen({ navigation }) {
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-graph-stats`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const body = await res.json();

      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setStats(body);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
        Alert.alert('Access Denied', 'Admin only.');
        navigation.goBack();
        return;
      }
      fetchStats();
    })();
  }, []);

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <Header navigation={navigation} />
        <View style={s.center}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={s.loadingText}>Querying graph…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state ────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <Header navigation={navigation} onRefresh={() => fetchStats()} />
        <View style={s.center}>
          <Feather name="alert-circle" size={36} color={RED} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => fetchStats()}>
            <Text style={s.retryBtnTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const configured = stats?.neo4j_configured ?? false;
  const nodes = stats?.nodes ?? {};
  const rels  = stats?.relationships ?? {};

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Header navigation={navigation} onRefresh={() => fetchStats(true)} />

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchStats(true)} tintColor={GREEN} />
        }
      >
        {/* ── Connection status ─────────────────────────────── */}
        <View style={[s.statusBanner, configured ? s.statusOk : s.statusWarn]}>
          <Feather
            name={configured ? 'check-circle' : 'alert-triangle'}
            size={16}
            color={configured ? GREEN : AMBER}
          />
          <Text style={[s.statusText, { color: configured ? GREEN : AMBER }]}>
            {configured
              ? `Neo4j connected · ${stats?.computed_at ? new Date(stats.computed_at).toLocaleTimeString() : ''}`
              : 'Neo4j not configured — set NEO4J_URI and NEO4J_PASSWORD'}
          </Text>
        </View>

        {/* ── Node counts ───────────────────────────────────── */}
        <Section title="NODES">
          <MetricRow items={[
            { label: 'Users',      value: nodes.User     ?? 0, color: NAVY,   icon: 'users' },
            { label: 'Products',   value: nodes.Product  ?? 0, color: GREEN,  icon: 'package' },
            { label: 'Categories', value: nodes.Category ?? 0, color: PURPLE, icon: 'tag' },
          ]} />
          <MetricRow items={[
            { label: 'Brands', value: nodes.Brand ?? 0, color: AMBER, icon: 'award' },
            { label: 'Stores', value: nodes.Store ?? 0, color: GREEN, icon: 'shopping-bag' },
            { label: 'Stacks', value: nodes.Stack ?? 0, color: NAVY,  icon: 'layers' },
          ]} />
        </Section>

        {/* ── Relationship counts ───────────────────────────── */}
        <Section title="RELATIONSHIPS">
          <MetricRow items={[
            { label: 'PREFERS',        value: rels.PREFERS        ?? 0, color: GREEN },
            { label: 'BUYS',           value: rels.BUYS           ?? 0, color: NAVY },
            { label: 'CO_OCCURS_WITH', value: rels.CO_OCCURS_WITH ?? 0, color: PURPLE },
          ]} />
          <MetricRow items={[
            { label: 'SHOWS_PATTERN', value: rels.SHOWS_PATTERN ?? 0, color: AMBER },
            { label: 'ACCEPTS',       value: rels.ACCEPTS       ?? 0, color: GREEN },
            { label: 'DISMISSES',     value: rels.DISMISSES     ?? 0, color: RED },
          ]} />
        </Section>

        {/* ── Top categories ────────────────────────────────── */}
        <Section title="TOP PREFERRED CATEGORIES">
          <TopList
            columns={['Category', 'Users', 'Avg Score']}
            rows={(stats?.top_categories ?? []).map((c) => [
              c.name,
              c.user_count.toString(),
              c.avg_score.toFixed(2),
            ])}
            emptyMsg="No PREFERS→Category edges yet"
          />
        </Section>

        {/* ── Top brands ────────────────────────────────────── */}
        <Section title="TOP PREFERRED BRANDS">
          <TopList
            columns={['Brand', 'Users', 'Avg Score']}
            rows={(stats?.top_brands ?? []).map((b) => [
              b.name,
              b.user_count.toString(),
              b.avg_score.toFixed(2),
            ])}
            emptyMsg="No PREFERS→Brand edges yet"
          />
        </Section>

        {/* ── Top co-occurrences ────────────────────────────── */}
        <Section title="TOP CO-OCCURRING PRODUCTS">
          <TopList
            columns={['Product A', 'Product B', 'Count']}
            rows={(stats?.top_co_occurrences ?? []).map((p) => [
              p.product1,
              p.product2,
              p.count.toString(),
            ])}
            emptyMsg="No CO_OCCURS_WITH edges yet — run graphSync"
          />
        </Section>

        {/* ── Top cohort pairs ──────────────────────────────── */}
        <Section title="TOP COHORT PAIRS (SHOWS_PATTERN)">
          <TopList
            columns={['User A', 'User B', 'Similarity']}
            rows={(stats?.top_cohort_pairs ?? []).map((p) => [
              p.user1 + '…',
              p.user2 + '…',
              p.similarity.toFixed(2),
            ])}
            emptyMsg="No SHOWS_PATTERN edges yet — run graphCohort"
          />
        </Section>

        <View style={s.footer}>
          <Text style={s.footerNote}>
            Scoring boosts active: preferred cat ×1.15 · buy history +0.20 ·
            co-occurrence +0.10 · cohort category +0.08 · cohort brand +0.06
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Header sub-component
// ─────────────────────────────────────────────────────────────

function Header({ navigation, onRefresh }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
        <Feather name="arrow-left" size={22} color={NAVY} />
      </TouchableOpacity>
      <View style={s.headerCenter}>
        <Feather name="share-2" size={18} color={NAVY} style={{ marginRight: 6 }} />
        <Text style={s.headerTitle}>Memory Graph</Text>
      </View>
      {onRefresh ? (
        <TouchableOpacity onPress={onRefresh} style={s.refreshBtn}>
          <Feather name="refresh-cw" size={18} color={GREEN} />
        </TouchableOpacity>
      ) : <View style={{ width: 38 }} />}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: BG },
  scroll:         { paddingBottom: 48 },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 16, paddingVertical: 14,
                    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn:        { padding: 6, width: 38 },
  refreshBtn:     { padding: 6, width: 38, alignItems: 'flex-end' },
  headerCenter:   { flexDirection: 'row', alignItems: 'center' },
  headerTitle:    { fontSize: 17, fontWeight: '700', color: NAVY },

  statusBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8,
                    marginHorizontal: 16, marginTop: 14, marginBottom: 4,
                    paddingHorizontal: 14, paddingVertical: 10,
                    borderRadius: 12, borderWidth: 1 },
  statusOk:       { backgroundColor: MINT, borderColor: '#A5D6A7' },
  statusWarn:     { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  statusText:     { fontSize: 13, fontWeight: '500', flex: 1 },

  section:        { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle:   { fontSize: 11, fontWeight: '700', color: GRAY, marginBottom: 10,
                    letterSpacing: 0.8, textTransform: 'uppercase' },

  metricRow:      { flexDirection: 'row', gap: 10, marginBottom: 10 },
  metricCard:     { flex: 1, backgroundColor: WHITE, borderRadius: 14,
                    padding: 14, alignItems: 'center',
                    borderWidth: 1, borderColor: BORDER },
  metricValue:    { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  metricLabel:    { fontSize: 11, color: GRAY, textAlign: 'center' },

  table:          { backgroundColor: WHITE, borderRadius: 14,
                    overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  tableRow:       { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 11,
                    borderBottomWidth: 1, borderBottomColor: BG },
  tableCell:      { flex: 1, fontSize: 13, color: NAVY, textAlign: 'right' },
  tableCellPrimary: { flex: 2, textAlign: 'left', color: NAVY },

  emptyMsg:       { fontSize: 13, color: GRAY, fontStyle: 'italic',
                    paddingVertical: 12, paddingHorizontal: 4 },

  loadingText:    { marginTop: 12, fontSize: 14, color: GRAY },
  errorText:      { marginTop: 12, fontSize: 14, color: RED, textAlign: 'center' },
  retryBtn:       { marginTop: 16, backgroundColor: GREEN, paddingHorizontal: 28,
                    paddingVertical: 12, borderRadius: 12 },
  retryBtnTxt:    { color: WHITE, fontWeight: '700', fontSize: 15 },

  footer:         { marginTop: 24, marginHorizontal: 16, padding: 14,
                    backgroundColor: MINT, borderRadius: 12,
                    borderWidth: 1, borderColor: '#A5D6A7' },
  footerNote:     { fontSize: 12, color: '#2E7D32', lineHeight: 18 },
});
