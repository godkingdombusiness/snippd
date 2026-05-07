import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase, SUPABASE_URL } from '../lib/supabase';

const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const RED = '#DC2626';
const AMBER = '#D97706';
const WHITE = '#FFFFFF';
const GRAY = '#64748B';
const BG = '#F8FAFC';
const BORDER = '#E2E8F0';

const ADMIN_EMAILS = ['ddavis@getsnippd.com', 'dina@getsnippd.com', 'admin@getsnippd.com'];

function cents(value) {
  if (value == null) return '-';
  return `$${(Number(value) / 100).toFixed(2)}`;
}

function statusColor(status) {
  if (status === 'approved') return GREEN;
  if (status === 'rejected') return RED;
  if (status === 'needs_review') return AMBER;
  return GRAY;
}

export default function StackReviewTrainingScreen({ navigation }) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [runs, setRuns] = useState([]);
  const [note, setNote] = useState('');
  const [savingId, setSavingId] = useState(null);

  const adminFetch = useCallback(async (path, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Missing admin session');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-deal-review/${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...(options.headers ?? {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? 'Admin request failed');
    return json;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
        Alert.alert('Access Denied', 'You do not have permission to view this screen.');
        navigation.goBack();
        return;
      }
      setAuthorized(true);
      const [auditResp, runsResp] = await Promise.all([
        adminFetch('stack-audit?limit=50'),
        adminFetch('stack-runs?limit=8'),
      ]);
      setItems(auditResp.items ?? []);
      setRuns(runsResp.items ?? []);
    } catch (err) {
      Alert.alert('Stack Review', err.message ?? 'Could not load stack audit rows.');
    } finally {
      setLoading(false);
    }
  }, [adminFetch, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const sendFeedback = async (item, action) => {
    setSavingId(item.audit_id);
    try {
      await adminFetch('stack-feedback', {
        method: 'POST',
        body: JSON.stringify({
          audit_id: item.audit_id,
          stack_candidate_id: item.stack_candidate_id,
          app_home_feed_id: item.app_home_feed_id,
          action,
          note: note.trim() || null,
        }),
      });
      setNote('');
      await load();
    } catch (err) {
      Alert.alert('Feedback Failed', err.message ?? 'Could not record feedback.');
    } finally {
      setSavingId(null);
    }
  };

  if (!authorized && loading) {
    return <View style={styles.loadingScreen} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Stack Review</Text>
          <Text style={styles.subtitle}>Read-only until an admin action is clicked</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={load}>
          <Feather name="refresh-cw" size={16} color={GREEN} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={GREEN} size="large" />
          <Text style={styles.muted}>Loading generated stack audit...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Recent Generation Runs</Text>
            {runs.length === 0 ? (
              <Text style={styles.muted}>No automation runs recorded yet.</Text>
            ) : runs.map(run => (
              <View key={run.id} style={styles.runRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.runStatus}>{run.status}</Text>
                  <Text style={styles.small}>{run.model_function_used}</Text>
                </View>
                <Text style={styles.runMetric}>
                  {run.approved_count ?? 0}/{run.generated_count ?? 0}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Feedback Note</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Optional note for the next action"
              placeholderTextColor={GRAY}
              style={styles.noteInput}
              multiline
            />
          </View>

          {items.length === 0 ? (
            <View style={styles.panel}>
              <Text style={styles.muted}>No generated stack audit rows found.</Text>
            </View>
          ) : items.map(item => {
            const math = item.price_math ?? {};
            const busy = savingId === item.audit_id;
            return (
              <View key={item.audit_id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.retailer}>{item.retailer_key ?? 'unknown retailer'}</Text>
                    <Text style={styles.product}>{item.product_name ?? item.home_feed_title ?? 'Generated deal'}</Text>
                  </View>
                  <View style={[styles.badge, { borderColor: statusColor(item.review_status) }]}>
                    <Text style={[styles.badgeText, { color: statusColor(item.review_status) }]}>
                      {item.review_status ?? 'pending'}
                    </Text>
                  </View>
                </View>

                <View style={styles.mathGrid}>
                  <Metric label="Regular" value={cents(math.regular_price_cents)} />
                  <Metric label="Sale" value={cents(math.sale_price_cents)} />
                  <Metric label="Promo" value={cents(math.promo_discount_cents)} />
                  <Metric label="Coupon" value={cents(math.coupon_discount_cents)} />
                  <Metric label="Rebate" value={cents(math.rebate_value_cents)} />
                  <Metric label="Net" value={cents(math.net_price_after_rebate_cents)} />
                </View>

                <View style={styles.auditBlock}>
                  <Text style={styles.auditLabel}>Audit</Text>
                  <Text style={styles.auditText}>Model: {item.model_function_used ?? '-'}</Text>
                  <Text style={styles.auditText}>Confidence: {item.confidence_score == null ? '-' : Math.round(Number(item.confidence_score) * 100)}%</Text>
                  <Text style={styles.auditText}>Sources: {(item.source_tables_used ?? []).join(', ') || '-'}</Text>
                  {item.error_reason ? <Text style={[styles.auditText, { color: RED }]}>Error: {item.error_reason}</Text> : null}
                  {item.latest_feedback_note ? <Text style={styles.auditText}>Latest note: {item.latest_feedback_note}</Text> : null}
                </View>

                <View style={styles.actions}>
                  <ActionButton label="Approve" color={GREEN} busy={busy} onPress={() => sendFeedback(item, 'approve')} />
                  <ActionButton label="Reject" color={RED} busy={busy} onPress={() => sendFeedback(item, 'reject')} />
                  <ActionButton label="Needs Review" color={AMBER} busy={busy} onPress={() => sendFeedback(item, 'needs_review')} />
                  <ActionButton label="Price Wrong" color={NAVY} busy={busy} onPress={() => sendFeedback(item, 'mark_price_wrong')} />
                  <ActionButton label="Coupon Missing" color={NAVY} busy={busy} onPress={() => sendFeedback(item, 'mark_coupon_missing')} />
                  <ActionButton label="Add Note" color={GRAY} busy={busy} onPress={() => sendFeedback(item, 'add_note')} />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function ActionButton({ label, color, busy, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { borderColor: color }, busy && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={busy}
    >
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingScreen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: { color: NAVY, fontSize: 17, fontWeight: '900' },
  subtitle: { color: GRAY, fontSize: 11, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  panel: {
    backgroundColor: WHITE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  panelTitle: { color: NAVY, fontSize: 13, fontWeight: '900', marginBottom: 10 },
  muted: { color: GRAY, fontSize: 13 },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BG,
  },
  runStatus: { color: NAVY, fontWeight: '800', fontSize: 13 },
  small: { color: GRAY, fontSize: 11, marginTop: 2 },
  runMetric: { color: GREEN, fontSize: 16, fontWeight: '900' },
  noteInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 10,
    color: NAVY,
    textAlignVertical: 'top',
    backgroundColor: BG,
  },
  card: {
    backgroundColor: WHITE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  retailer: { color: GREEN, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  product: { color: NAVY, fontSize: 16, fontWeight: '900', marginTop: 3 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  mathGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    width: '31%',
    minWidth: 92,
    backgroundColor: BG,
    borderRadius: 8,
    padding: 9,
  },
  metricLabel: { color: GRAY, fontSize: 10, fontWeight: '800' },
  metricValue: { color: NAVY, fontSize: 14, fontWeight: '900', marginTop: 4 },
  auditBlock: { backgroundColor: '#F1F5F9', borderRadius: 8, padding: 10, gap: 3 },
  auditLabel: { color: NAVY, fontSize: 11, fontWeight: '900', marginBottom: 2 },
  auditText: { color: GRAY, fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: WHITE,
  },
  actionText: { fontSize: 11, fontWeight: '900' },
});
