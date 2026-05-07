/**
 * AdminDealReviewScreen — Deal review queue for Snippd admin.
 *
 * Calls the existing admin-deal-review edge function:
 *   GET  /queue          — list pending review items
 *   POST /approve        — approve a deal (with or without caution)
 *   POST /reject         — reject a deal
 *   POST /stack-feedback — approve/reject/flag stack candidates
 *   GET  /stats          — dashboard stats header
 *   GET  /stack-audit    — stack review rows
 *
 * Only accessible to ddavis@getsnippd.com.
 */

import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput,
  Modal, FlatList, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ── Colors ──────────────────────────────────────────────────────────────────
const FOREST  = '#0C7A3D';
const GREEN   = '#0C9E54';
const NAVY    = '#1A237E';
const WHITE   = '#FFFFFF';
const BORDER  = '#E2E8F0';
const LIGHT   = '#F0FAF5';
const GRAY    = '#64748B';
const RED     = '#DC2626';
const AMBER   = '#D97706';
const BLUE    = '#1D4ED8';
const PURPLE  = '#7C3AED';

const ADMIN_EMAIL = 'ddavis@getsnippd.com';

const STATUS_COLORS = {
  auto_approved:        { bg: '#DCFCE7', text: '#15803D' },
  approved_with_caution:{ bg: '#FEF3C7', text: '#92400E' },
  needs_review:         { bg: '#FEE2E2', text: '#B91C1C' },
  blocked:              { bg: '#F1F5F9', text: GRAY       },
  pending:              { bg: '#EFF6FF', text: BLUE       },
};

function statusChip(status) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Text style={[styles.chipTxt, { color: c.text }]}>
        {String(status || 'pending').replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

function fmt(cents) { return '$' + ((cents || 0) / 100).toFixed(2); }

// ── Main Component ───────────────────────────────────────────────────────────

export default function AdminDealReviewScreen({ navigation }) {
  const [tab, setTab]       = useState('queue'); // 'queue' | 'stacks' | 'stats'
  const [items, setItems]   = useState([]);
  const [stacks, setStacks] = useState([]);
  const [stats, setStats]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // row id being actioned

  const [noteModal, setNoteModal]   = useState(null); // { id, offer_id, review_id, action }
  const [noteText, setNoteText]     = useState('');

  const [filterStatus, setFilterStatus] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // ── Auth guard ────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin(user?.email === ADMIN_EMAIL);
      setAuthChecked(true);
    });
  }, []);

  // ── Edge function caller ──────────────────────────────────────
  const callAdmin = useCallback(async (action, body = {}, method = 'POST') => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const supabaseUrl = supabase.supabaseUrl ?? supabase['supabaseUrl'];
    const base = (supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '')
      .replace(/\/$/, '');

    const url = `${base}/functions/v1/admin-deal-review/${action}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }, []);

  // ── Load queue ────────────────────────────────────────────────
  const loadQueue = useCallback(async () => {
    try {
      const data = await callAdmin('queue', { limit: 100 }, 'GET');
      setItems(data.items ?? []);
    } catch (e) {
      console.warn('[AdminReview] loadQueue:', e.message);
    }
  }, [callAdmin]);

  // ── Load stacks ───────────────────────────────────────────────
  const loadStacks = useCallback(async () => {
    try {
      const data = await callAdmin('stack-audit', {}, 'GET');
      setStacks(data.items ?? []);
    } catch (e) {
      console.warn('[AdminReview] loadStacks:', e.message);
    }
  }, [callAdmin]);

  // ── Load stats ────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const data = await callAdmin('stats', {}, 'GET');
      setStats(data);
    } catch (e) {
      console.warn('[AdminReview] loadStats:', e.message);
    }
  }, [callAdmin]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    await Promise.all([loadQueue(), loadStacks(), loadStats()]);
    setLoading(false);
    setRefreshing(false);
  }, [loadQueue, loadStacks, loadStats]);

  useEffect(() => {
    if (authChecked && isAdmin) loadAll();
  }, [authChecked, isAdmin, loadAll]);

  const onRefresh = () => { setRefreshing(true); loadAll(true); };

  // ── Actions ───────────────────────────────────────────────────
  const doReviewAction = useCallback(async (item, action) => {
    if (!item) return;
    const review_id = item.id ?? item.review_id;
    const offer_id  = item.offer_id ?? item.offer_source_id;

    if (!review_id) {
      Alert.alert('Error', 'No review_id found on this item.');
      return;
    }

    // Actions that need a note → open modal
    if (action === 'wrong_price' || action === 'missing_coupon' || action === 'add_note') {
      setNoteText('');
      setNoteModal({ review_id, offer_id, action });
      return;
    }

    setActionLoading(review_id);
    try {
      if (action === 'approve' || action === 'approve_with_caution') {
        await callAdmin('approve', {
          review_id,
          offer_id,
          with_caution: action === 'approve_with_caution',
        });
      } else if (action === 'reject') {
        await callAdmin('reject', { review_id, offer_id });
      } else if (action === 'needs_review') {
        await callAdmin('escalate', { review_id });
      }
      await loadQueue();
    } catch (e) {
      Alert.alert('Action failed', e.message);
    } finally {
      setActionLoading(null);
    }
  }, [callAdmin, loadQueue]);

  const doStackFeedback = useCallback(async (stack, action) => {
    const stack_candidate_id = stack.stack_candidate_id ?? stack.id;
    if (!stack_candidate_id) return;

    if (action === 'add_note' || action === 'mark_price_wrong' || action === 'mark_coupon_missing') {
      setNoteText('');
      setNoteModal({ stack_candidate_id, action, isStack: true });
      return;
    }

    setActionLoading(stack_candidate_id);
    try {
      await callAdmin('stack-feedback', { stack_candidate_id, action });
      await loadStacks();
    } catch (e) {
      Alert.alert('Stack action failed', e.message);
    } finally {
      setActionLoading(null);
    }
  }, [callAdmin, loadStacks]);

  const submitNote = useCallback(async () => {
    if (!noteModal) return;
    setActionLoading(noteModal.review_id ?? noteModal.stack_candidate_id);

    try {
      if (noteModal.isStack) {
        await callAdmin('stack-feedback', {
          stack_candidate_id: noteModal.stack_candidate_id,
          action: noteModal.action,
          note: noteText.trim() || null,
        });
        await loadStacks();
      } else {
        const action = noteModal.action;
        if (action === 'wrong_price' || action === 'missing_coupon') {
          await callAdmin('stack-feedback', {
            action: action === 'wrong_price' ? 'mark_price_wrong' : 'mark_coupon_missing',
            note: noteText.trim() || null,
          });
        } else {
          await callAdmin('reject', {
            review_id: noteModal.review_id,
            offer_id:  noteModal.offer_id,
            notes:     noteText.trim() || null,
          });
        }
        await loadQueue();
      }
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setActionLoading(null);
      setNoteModal(null);
      setNoteText('');
    }
  }, [noteModal, noteText, callAdmin, loadQueue, loadStacks]);

  // ── Not admin ─────────────────────────────────────────────────
  if (authChecked && !isAdmin) {
    return (
      <SafeAreaView style={styles.center}>
        <Feather name="lock" size={40} color={GRAY} />
        <Text style={styles.emptyTxt}>Admin access only</Text>
      </SafeAreaView>
    );
  }

  if (!authChecked || (loading && !refreshing)) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </SafeAreaView>
    );
  }

  // ── Filtered items ────────────────────────────────────────────
  const filteredItems = filterStatus
    ? items.filter(i => (i.offer_validation_status || i.validation_status || '') === filterStatus)
    : items;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deal Review</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={18} color={GREEN} />
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      {stats && (
        <View style={styles.statsBar}>
          <StatPill label="Pending"  value={stats.review_queue?.pending  ?? 0} color={AMBER} />
          <StatPill label="Urgent"   value={stats.review_queue?.urgent   ?? 0} color={RED}   />
          <StatPill label="Approved" value={stats.offer_sources?.auto_approved ?? 0} color={GREEN} />
          <StatPill label="Blocked"  value={stats.offer_sources?.blocked  ?? 0} color={GRAY}  />
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        {['queue', 'stacks', 'stats'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
              {t === 'queue' ? 'Review Queue' : t === 'stacks' ? 'Stacks' : 'Stats'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
      >

        {/* ── QUEUE TAB ────────────────────────────────────────── */}
        {tab === 'queue' && (
          <>
            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              {['', 'needs_review', 'pending', 'auto_approved', 'blocked'].map(s => (
                <TouchableOpacity
                  key={s || 'all'}
                  style={[styles.filterChip, filterStatus === s && styles.filterChipActive]}
                  onPress={() => setFilterStatus(s)}
                >
                  <Text style={[styles.filterChipTxt, filterStatus === s && styles.filterChipTxtActive]}>
                    {s ? s.replace(/_/g, ' ') : 'All'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="check-circle" size={32} color={GREEN} />
                <Text style={styles.emptyTxt}>Queue is clear</Text>
              </View>
            ) : (
              filteredItems.map(item => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  loading={actionLoading === (item.id ?? item.review_id)}
                  onAction={doReviewAction}
                />
              ))
            )}
          </>
        )}

        {/* ── STACKS TAB ───────────────────────────────────────── */}
        {tab === 'stacks' && (
          stacks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="layers" size={32} color={GRAY} />
              <Text style={styles.emptyTxt}>No stack audit rows</Text>
            </View>
          ) : (
            stacks.map(stack => (
              <StackCard
                key={stack.id ?? stack.stack_candidate_id}
                stack={stack}
                loading={actionLoading === (stack.id ?? stack.stack_candidate_id)}
                onAction={doStackFeedback}
              />
            ))
          )
        )}

        {/* ── STATS TAB ────────────────────────────────────────── */}
        {tab === 'stats' && stats && (
          <View>
            <SectionLabel title="Review Queue" />
            <StatCard rows={[
              { label: 'Pending',    value: stats.review_queue?.pending  },
              { label: 'Urgent',     value: stats.review_queue?.urgent   },
              { label: 'Total',      value: stats.review_queue?.total    },
            ]} />

            <SectionLabel title="Offer Sources" />
            <StatCard rows={[
              { label: 'Auto approved', value: stats.offer_sources?.auto_approved  },
              { label: 'With caution',  value: stats.offer_sources?.with_caution   },
              { label: 'Needs review',  value: stats.offer_sources?.needs_review   },
              { label: 'Blocked',       value: stats.offer_sources?.blocked        },
              { label: 'Pending',       value: stats.offer_sources?.pending        },
              { label: 'Total',         value: stats.offer_sources?.total          },
            ]} />

            <SectionLabel title="User Feedback" />
            <StatCard rows={[
              { label: 'Total',        value: stats.user_feedback?.total        },
              { label: 'Worked',       value: stats.user_feedback?.worked       },
              { label: 'Success rate', value: stats.user_feedback?.success_rate != null
                  ? `${stats.user_feedback.success_rate}%` : '—' },
            ]} />
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Note modal */}
      <Modal visible={!!noteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {noteModal?.action === 'wrong_price'    ? 'Flag Wrong Price'       :
               noteModal?.action === 'missing_coupon' ? 'Flag Missing Coupon'    :
               noteModal?.action === 'mark_price_wrong'   ? 'Mark Price Wrong'   :
               noteModal?.action === 'mark_coupon_missing' ? 'Mark Coupon Missing' :
               'Add Note'}
            </Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Note (optional)…"
              placeholderTextColor={GRAY}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => { setNoteModal(null); setNoteText(''); }}
              >
                <Text style={styles.modalBtnTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSubmit]}
                onPress={submitNote}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={WHITE} />
                ) : (
                  <Text style={[styles.modalBtnTxt, { color: WHITE }]}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ label, value, color }) {
  return (
    <View style={styles.statPill}>
      <Text style={[styles.statPillVal, { color }]}>{value}</Text>
      <Text style={styles.statPillLbl}>{label}</Text>
    </View>
  );
}

function SectionLabel({ title }) {
  return <Text style={styles.sectionLabel}>{title.toUpperCase()}</Text>;
}

function StatCard({ rows }) {
  return (
    <View style={styles.statCardWrap}>
      {rows.map((r, i) => (
        <View key={i} style={[styles.statRow, i < rows.length - 1 && styles.statRowBorder]}>
          <Text style={styles.statRowLabel}>{r.label}</Text>
          <Text style={styles.statRowVal}>{r.value ?? '—'}</Text>
        </View>
      ))}
    </View>
  );
}

function ReviewCard({ item, loading, onAction }) {
  const title       = item.deal_title || item.title || item.offer_title || 'Untitled Deal';
  const status      = item.offer_validation_status || item.validation_status || item.review_status || '';
  const priority    = item.priority ?? 3;
  const store       = item.retailer_key || item.store || '';
  const confidence  = item.confidence_score;
  const savings     = item.savings_percent;
  const finalCents  = item.final_out_of_pocket_cents || item.final_cents;

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.reviewTitle} numberOfLines={2}>{title}</Text>
          {store ? <Text style={styles.reviewSub}>{store}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {statusChip(status)}
          {priority <= 2 && (
            <View style={[styles.chip, { backgroundColor: '#FEE2E2' }]}>
              <Text style={[styles.chipTxt, { color: RED }]}>Urgent</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.reviewMeta}>
        {confidence != null && (
          <Text style={styles.reviewMetaTxt}>Confidence: {confidence}%</Text>
        )}
        {savings != null && (
          <Text style={styles.reviewMetaTxt}>Savings: {savings}%</Text>
        )}
        {finalCents != null && (
          <Text style={styles.reviewMetaTxt}>Final OOP: {fmt(finalCents)}</Text>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={GREEN} style={{ marginTop: 12 }} />
      ) : (
        <View style={styles.actionRow}>
          <ActionBtn label="Approve"    color={GREEN} icon="check"   onPress={() => onAction(item, 'approve')} />
          <ActionBtn label="Caution"    color={AMBER} icon="alert-triangle" onPress={() => onAction(item, 'approve_with_caution')} />
          <ActionBtn label="Reject"     color={RED}   icon="x"       onPress={() => onAction(item, 'reject')} />
          <ActionBtn label="Flag"       color={GRAY}  icon="flag"    onPress={() => onAction(item, 'needs_review')} />
          <ActionBtn label="$ Wrong"    color={PURPLE} icon="dollar-sign" onPress={() => onAction(item, 'wrong_price')} />
        </View>
      )}
    </View>
  );
}

function StackCard({ stack, loading, onAction }) {
  const title      = stack.deal_title || stack.title || 'Stack';
  const stackType  = stack.stack_type || '';
  const status     = stack.review_status || stack.validation_status || '';
  const confidence = stack.confidence_score;
  const savings    = stack.savings_percent;
  const oop        = stack.final_out_of_pocket_cents;

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.reviewTitle} numberOfLines={2}>{title}</Text>
          {stackType ? <Text style={styles.reviewSub}>{stackType.replace(/_/g, ' ')}</Text> : null}
        </View>
        {statusChip(status)}
      </View>

      <View style={styles.reviewMeta}>
        {confidence != null && (
          <Text style={styles.reviewMetaTxt}>Confidence: {confidence}%</Text>
        )}
        {savings != null && (
          <Text style={styles.reviewMetaTxt}>Savings: {savings}%</Text>
        )}
        {oop != null && (
          <Text style={styles.reviewMetaTxt}>OOP: {fmt(oop)}</Text>
        )}
        {stack.math_verified === true && (
          <Text style={[styles.reviewMetaTxt, { color: GREEN }]}>✓ Math verified</Text>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={GREEN} style={{ marginTop: 12 }} />
      ) : (
        <View style={styles.actionRow}>
          <ActionBtn label="Approve"    color={GREEN}  icon="check"         onPress={() => onAction(stack, 'approve')} />
          <ActionBtn label="Reject"     color={RED}    icon="x"             onPress={() => onAction(stack, 'reject')} />
          <ActionBtn label="Review"     color={AMBER}  icon="eye"           onPress={() => onAction(stack, 'needs_review')} />
          <ActionBtn label="$ Wrong"    color={PURPLE} icon="dollar-sign"   onPress={() => onAction(stack, 'mark_price_wrong')} />
          <ActionBtn label="Coupon"     color={GRAY}   icon="scissors"      onPress={() => onAction(stack, 'mark_coupon_missing')} />
        </View>
      )}
    </View>
  );
}

function ActionBtn({ label, color, icon, onPress }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.75}>
      <Feather name={icon} size={14} color={color} />
      <Text style={[styles.actionBtnTxt, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#F0FAF5' },
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F0FAF5' },

  // Header
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn:   { padding: 4, marginRight: 8 },
  refreshBtn:{ padding: 4, marginLeft: 'auto' },
  headerTitle:{ fontSize: 18, fontWeight: '700', color: NAVY, flex: 1, textAlign: 'center' },

  // Stats bar
  statsBar:  { flexDirection: 'row', backgroundColor: WHITE, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: BORDER },
  statPill:  { flex: 1, alignItems: 'center' },
  statPillVal:{ fontSize: 20, fontWeight: '800' },
  statPillLbl:{ fontSize: 11, color: GRAY, marginTop: 1 },

  // Tabs
  tabRow:    { flexDirection: 'row', backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  tabBtn:    { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive:{ borderBottomWidth: 2, borderBottomColor: GREEN },
  tabTxt:    { fontSize: 13, color: GRAY, fontWeight: '500' },
  tabTxtActive:{ color: GREEN, fontWeight: '700' },

  scroll:    { padding: 14, gap: 10 },

  // Filter chips
  filterRow:   { marginBottom: 10 },
  filterChip:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER, marginRight: 8 },
  filterChipActive:{ backgroundColor: GREEN, borderColor: GREEN },
  filterChipTxt:   { fontSize: 12, color: GRAY, fontWeight: '500' },
  filterChipTxtActive:{ color: WHITE },

  // Review card
  reviewCard:   { backgroundColor: WHITE, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 2 },
  reviewCardTop:{ flexDirection: 'row', gap: 10 },
  reviewTitle:  { fontSize: 15, fontWeight: '700', color: NAVY, marginBottom: 2 },
  reviewSub:    { fontSize: 12, color: GRAY },
  reviewMeta:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  reviewMetaTxt:{ fontSize: 12, color: GRAY },

  // Chip
  chip:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipTxt: { fontSize: 11, fontWeight: '600' },

  // Action row
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: BORDER },
  actionBtnTxt:{ fontSize: 12, fontWeight: '600' },

  // Stats
  sectionLabel:{ fontSize: 11, fontWeight: '700', color: GRAY, letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  statCardWrap:{ backgroundColor: WHITE, borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', marginBottom: 2 },
  statRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  statRowBorder:{ borderBottomWidth: 1, borderBottomColor: BORDER },
  statRowLabel:{ fontSize: 14, color: NAVY },
  statRowVal:  { fontSize: 14, fontWeight: '700', color: GREEN },

  // Empty
  emptyCard: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTxt:  { fontSize: 15, color: GRAY },

  // Note modal
  modalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:   { backgroundColor: WHITE, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalTitle:  { fontSize: 16, fontWeight: '700', color: NAVY, marginBottom: 14 },
  noteInput:   { borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, fontSize: 14, color: NAVY, minHeight: 80, textAlignVertical: 'top', backgroundColor: '#FAFAFA' },
  modalActions:{ flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn:    { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  modalBtnCancel:{ backgroundColor: '#F1F5F9' },
  modalBtnSubmit:{ backgroundColor: GREEN },
  modalBtnTxt: { fontSize: 15, fontWeight: '700', color: NAVY },
});
