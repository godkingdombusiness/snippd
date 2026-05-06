/**
 * ClipSessionScreen — v1.9.0
 *
 * Three-phase coupon clip session UI built on SnippdStack + clip_session_items.
 *
 * Phases:
 *   pending     — Review SnippdStack spec, math, basket trigger, coupon layers.
 *   in_progress — Sort-ordered checklist: mark each item done / skipped / expired.
 *   completed   — Savings summary, post-trip rebate CTAs, fetch/swagbucks flags.
 *
 * Navigation params (one of two forms):
 *   Form A — new session:   { stack: SnippdStack }
 *   Form B — existing:      { sessionId: string }
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
  StatusBar, Switch, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ── Brand ──────────────────────────────────────────────────────────
const MINT       = '#E8F5E9';
const NAVY       = '#1A237E';
const GREEN      = '#2E7D32';
const CORAL      = '#FF7043';
const WHITE      = '#FFFFFF';
const BORDER     = '#E0E0E0';
const LIGHT_MINT = '#F0FBF0';
const AMBER      = '#FF8F00';

// Tier colour map — consistent with coupon_type values from DB
const TIER_COLORS = {
  PUBLIX_STORE: { bg: '#E3F2FD', badge: '#1565C0', label: 'Publix Store' },
  MFR_COUPON:   { bg: '#FFF3E0', badge: '#E65100', label: 'Manufacturer' },
  DIGITAL:      { bg: '#F3E5F5', badge: '#6A1B9A', label: 'Digital' },
  LOYALTY:      { bg: '#E8F5E9', badge: '#2E7D32', label: 'Loyalty' },
  BOGO:         { bg: '#FFF8E1', badge: '#F57F17', label: 'BOGO' },
  B1G2:         { bg: '#FFF8E1', badge: '#F57F17', label: 'B1G2' },
  MULTI:        { bg: '#F1F8E9', badge: '#33691E', label: 'Multi' },
  ibotta:       { bg: '#FFF3E0', badge: '#BF360C', label: 'Ibotta' },
  fetch:        { bg: '#E8EAF6', badge: '#283593', label: 'Fetch' },
  swagbucks:    { bg: '#FCE4EC', badge: '#880E4F', label: 'Swagbucks' },
  checkout51:   { bg: '#E0F7FA', badge: '#006064', label: 'Checkout51' },
};

// ── Helpers ────────────────────────────────────────────────────────
const fmt   = (v) => `$${Number(v ?? 0).toFixed(2)}`;
const cents = (v) => fmt((v ?? 0) / 100);
const cap   = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '';

function tierColor(type) {
  return TIER_COLORS[type] ?? { bg: '#F5F5F5', badge: '#757575', label: type };
}

// ── Phase bar ──────────────────────────────────────────────────────
const PHASES     = ['pending', 'in_progress', 'completed'];
const PHASE_LABELS = { pending: 'Review Stack', in_progress: 'Clip & Act', completed: 'Trip Done' };

function PhaseBar({ status }) {
  const current = PHASES.indexOf(status);
  return (
    <View style={styles.phaseBar}>
      {PHASES.map((p, i) => (
        <React.Fragment key={p}>
          <View style={styles.phaseStep}>
            <View style={[styles.phaseDot, i <= current && styles.phaseDotActive]}>
              {i < current
                ? <Feather name="check" size={10} color={WHITE} />
                : <Text style={styles.phaseDotNum}>{i + 1}</Text>
              }
            </View>
            <Text style={[styles.phaseLabel, i === current && styles.phaseLabelActive]}>
              {PHASE_LABELS[p]}
            </Text>
          </View>
          {i < PHASES.length - 1 && (
            <View style={[styles.phaseLine, i < current && styles.phaseLineActive]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

// ── Basket trigger banner ──────────────────────────────────────────
function BasketBanner({ stack }) {
  if (!stack?.basket_trigger_value) return null;

  if (stack.basket_filler_needed) {
    return (
      <View style={[styles.triggerBanner, { backgroundColor: AMBER }]}>
        <Feather name="alert-circle" size={16} color={WHITE} />
        <Text style={styles.triggerText}>
          Add {fmt(stack.basket_filler_gap)} more in qualifying brands to unlock{' '}
          {fmt(stack.basket_trigger_value)} basket discount
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.triggerBanner, { backgroundColor: GREEN }]}>
      <Feather name="zap" size={16} color={WHITE} />
      <Text style={styles.triggerText}>
        Basket trigger unlocked — {fmt(stack.basket_trigger_value)} discount at register
      </Text>
    </View>
  );
}

// ── CouponLayer row ────────────────────────────────────────────────
function CouponLayerRow({ layer }) {
  const tc = tierColor(layer.type);
  const timingBadge = {
    before_store:    'Before store',
    before_checkout: 'Before checkout',
    at_checkout:     'Auto-applied',
  }[layer.timing] ?? layer.timing;

  return (
    <View style={[styles.layerRow, { backgroundColor: tc.bg }]}>
      <View style={[styles.layerBadge, { backgroundColor: tc.badge }]}>
        <Text style={styles.layerBadgeText}>{tc.label.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.layerType}>{tc.label}</Text>
        <Text style={styles.layerAction}>{layer.action}</Text>
      </View>
      <View style={styles.layerRight}>
        <Text style={[styles.layerValue, { color: tc.badge }]}>−{fmt(layer.value)}</Text>
        <Text style={styles.layerTiming}>{timingBadge}</Text>
      </View>
      {layer.is_critical && (
        <View style={styles.criticalDot} />
      )}
    </View>
  );
}

// ── SpecItem card (phase: pending) ─────────────────────────────────
function SpecItemCard({ item }) {
  const [open, setOpen] = useState(false);
  const hasCoupons = item.coupon_layers?.length > 0;
  const hasRebates = item.rebates?.length > 0;

  return (
    <View style={styles.itemCard}>
      <TouchableOpacity onPress={() => setOpen(!open)} style={styles.itemCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemName}>{item.name}</Text>
          {item.brand && <Text style={styles.itemBrand}>{item.brand}</Text>}
          {item.deal_label ? (
            <View style={styles.dealLabelBadge}>
              <Text style={styles.dealLabelText}>{item.deal_label}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.itemPriceSummary}>
          <Text style={styles.itemPayPrice}>{fmt(item.pay_price)}</Text>
          {item.coupon_savings > 0 && (
            <Text style={styles.itemSavings}>save {fmt(item.coupon_savings)}</Text>
          )}
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={NAVY} />
      </TouchableOpacity>

      {open && (
        <View style={styles.itemCardExpanded}>
          {/* Math box */}
          <View style={styles.mathBox}>
            <View style={styles.mathRow}>
              <Text style={styles.mathLabel}>Regular</Text>
              <Text style={[styles.mathValue, styles.strike]}>{fmt(item.original_price)}</Text>
            </View>
            {item.sale_price !== item.original_price && (
              <View style={styles.mathRow}>
                <Text style={styles.mathLabel}>Sale floor</Text>
                <Text style={styles.mathValue}>{fmt(item.sale_price)}</Text>
              </View>
            )}
            {item.coupon_savings > 0 && (
              <View style={styles.mathRow}>
                <Text style={[styles.mathLabel, { color: GREEN }]}>Coupon savings</Text>
                <Text style={[styles.mathValue, { color: GREEN }]}>−{fmt(item.coupon_savings)}</Text>
              </View>
            )}
            <View style={[styles.mathRow, styles.mathRowFinal]}>
              <Text style={[styles.mathLabel, { fontWeight: '700', color: NAVY }]}>You pay</Text>
              <Text style={[styles.mathValue, { fontWeight: '800', color: NAVY, fontSize: 16 }]}>
                {fmt(item.pay_price)}
              </Text>
            </View>
            {item.rebate_savings > 0 && (
              <>
                <View style={styles.mathRow}>
                  <Text style={[styles.mathLabel, { color: CORAL }]}>Rebates (after trip)</Text>
                  <Text style={[styles.mathValue, { color: CORAL }]}>−{cents(item.rebate_savings * 100)}</Text>
                </View>
                <View style={styles.mathRow}>
                  <Text style={[styles.mathLabel, { color: '#666', fontSize: 11 }]}>True cost</Text>
                  <Text style={[styles.mathValue, { color: '#666', fontSize: 11 }]}>{fmt(item.true_cost)}</Text>
                </View>
              </>
            )}
            {!item.math_valid && (
              <Text style={styles.mathError}>⚠ {item.math_error}</Text>
            )}
          </View>

          {/* Coupon layers */}
          {hasCoupons && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.sectionSubHeader}>Coupon layers</Text>
              {item.coupon_layers.map((layer, i) => (
                <CouponLayerRow key={i} layer={layer} />
              ))}
            </View>
          )}

          {/* Rebates */}
          {hasRebates && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.sectionSubHeader}>Rebates (after purchase)</Text>
              {item.rebates.map((r, i) => {
                const tc = tierColor(r.platform);
                return (
                  <View key={i} style={[styles.layerRow, { backgroundColor: tc.bg }]}>
                    <View style={[styles.layerBadge, { backgroundColor: tc.badge }]}>
                      <Text style={styles.layerBadgeText}>{tc.label.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.layerType}>{tc.label}</Text>
                      <Text style={styles.layerAction}>{r.action}</Text>
                    </View>
                    <Text style={[styles.layerValue, { color: CORAL }]}>{cents(r.value_cents)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {item.rain_check_note && (
            <Text style={styles.rainCheck}>☔ {item.rain_check_note}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Checklist item (phase: in_progress) ───────────────────────────
function ChecklistItem({ dbItem, onAction }) {
  const tc = tierColor(dbItem.coupon_type);
  const isDone    = dbItem.status === 'done';
  const isSkipped = dbItem.status === 'skipped';
  const isExpired = dbItem.status === 'expired';
  const isPending = dbItem.status === 'pending';

  const timingLabel = {
    before_store:    'Before you leave',
    before_checkout: 'In-app before checkout',
    at_checkout:     'Auto at register',
    after_receipt:   'After purchase',
  }[dbItem.timing] ?? dbItem.timing;

  return (
    <View style={[
      styles.checklistRow,
      dbItem.is_critical && styles.checklistRowCritical,
      (isDone || isSkipped || isExpired) && { opacity: 0.55 },
    ]}>
      <View style={styles.checklistLeft}>
        {/* Type badge */}
        <View style={[styles.typeBadge, { backgroundColor: tc.badge }]}>
          <Text style={styles.typeBadgeText}>{tc.label}</Text>
        </View>

        {/* Item name */}
        <Text style={styles.checklistName} numberOfLines={2}>
          {dbItem.is_critical && <Text style={{ color: CORAL }}>★ </Text>}
          {dbItem.item_name}
          {dbItem.brand ? ` · ${dbItem.brand}` : ''}
        </Text>

        {/* Value + timing */}
        <View style={styles.checklistMeta}>
          {dbItem.coupon_value > 0 && (
            <Text style={styles.checklistValue}>−{fmt(dbItem.coupon_value)}</Text>
          )}
          <Text style={styles.checklistTiming}>{timingLabel}</Text>
        </View>

        {/* Ibotta verify warning */}
        {dbItem.ibotta_verify_flag && isPending && (
          <View style={styles.ibottaWarn}>
            <Feather name="alert-triangle" size={12} color={AMBER} />
            <Text style={styles.ibottaWarnText}>
              Verify this Ibotta offer is still active before shopping
            </Text>
          </View>
        )}

        {/* Deep link */}
        {dbItem.deep_link && isPending && (
          <Text style={styles.deepLink} numberOfLines={1}>{dbItem.deep_link}</Text>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.checklistActions}>
        {isPending ? (
          <>
            <TouchableOpacity
              style={styles.actionBtnDone}
              onPress={() => onAction(dbItem.id, 'done')}
            >
              <Feather name="check" size={14} color={WHITE} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtnSkip}
              onPress={() => onAction(dbItem.id, 'skipped')}
            >
              <Text style={styles.actionBtnSkipText}>Skip</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={[
            styles.statusBadge,
            isDone    && { backgroundColor: GREEN },
            isSkipped && { backgroundColor: '#757575' },
            isExpired && { backgroundColor: CORAL },
          ]}>
            <Text style={styles.statusBadgeText}>
              {isDone ? 'Done' : isSkipped ? 'Skipped' : 'Expired'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Post-trip form (inside completed section) ──────────────────────
function PostTripForm({ session, onSave }) {
  const [fetchSnapped,      setFetchSnapped]      = useState(session?.fetch_snapped ?? false);
  const [swagbucksSnapped,  setSwagbucksSnapped]  = useState(session?.swagbucks_snapped ?? false);
  const [savingsInput,      setSavingsInput]       = useState(
    session?.savings_at_shop != null ? String(session.savings_at_shop) : ''
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      fetch_snapped:     fetchSnapped,
      swagbucks_snapped: swagbucksSnapped,
      savings_at_shop:   savingsInput ? parseFloat(savingsInput) : null,
    });
    setSaving(false);
  };

  return (
    <View style={styles.postTripForm}>
      <Text style={styles.postTripFormTitle}>Post-trip actions</Text>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>Snapped Fetch receipt</Text>
          <Text style={styles.switchSub}>Open Fetch Rewards → scan receipt</Text>
        </View>
        <Switch
          value={fetchSnapped}
          onValueChange={setFetchSnapped}
          trackColor={{ false: BORDER, true: GREEN }}
          thumbColor={WHITE}
        />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>Snapped Swagbucks receipt</Text>
          <Text style={styles.switchSub}>Open Swagbucks → scan receipt</Text>
        </View>
        <Switch
          value={swagbucksSnapped}
          onValueChange={setSwagbucksSnapped}
          trackColor={{ false: BORDER, true: GREEN }}
          thumbColor={WHITE}
        />
      </View>

      <View style={styles.inputRow}>
        <Text style={styles.switchLabel}>Actual register savings ($)</Text>
        <TextInput
          style={styles.savingsInput}
          value={savingsInput}
          onChangeText={setSavingsInput}
          keyboardType="decimal-pad"
          placeholder="e.g. 14.72"
          placeholderTextColor="#aaa"
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.primaryBtnText}>
          {saving ? 'Saving…' : 'Save & complete trip ✓'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────

export default function ClipSessionScreen({ route, navigation }) {
  const { stack: navStack, sessionId: existingSessionId } = route.params ?? {};

  const [loading,    setLoading]    = useState(true);
  const [session,    setSession]    = useState(null);    // ClipSessionRow
  const [stack,      setStack]      = useState(navStack ?? null); // SnippdStack (for phase pending)
  const [dbItems,    setDbItems]    = useState([]);      // ClipSessionItemRow[]
  const [validation, setValidation] = useState(null);   // PreTripValidation
  const [error,      setError]      = useState(null);

  // ── Load or create session ─────────────────────────────────────

  const initSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let sessionRow = null;

      if (existingSessionId) {
        const { data, error: e } = await supabase
          .from('clip_sessions')
          .select('*')
          .eq('id', existingSessionId)
          .eq('user_id', user.id)
          .single();
        if (e) throw e;
        sessionRow = data;
      } else if (navStack?.id) {
        // Build new session from SnippdStack via edge function
        const { data: fnData, error: fnErr } = await supabase.functions.invoke(
          'build-clip-session',
          { body: { userId: user.id, stackId: navStack.id } }
        );
        if (fnErr) throw fnErr;
        if (fnData?.error) throw new Error(fnData.error);
        sessionRow = fnData.session;
      } else {
        throw new Error('No sessionId or stack provided.');
      }

      setSession(sessionRow);

      // Load items
      if (sessionRow?.id) {
        const { data: items, error: itemsErr } = await supabase
          .from('clip_session_items')
          .select('*')
          .eq('session_id', sessionRow.id)
          .order('sort_order', { ascending: true });
        // clip_session_items may not exist yet — treat as empty, not a crash
        if (!itemsErr) setDbItems(items ?? []);
      }
    } catch (e) {
      setError(e.message ?? 'Failed to load session.');
    } finally {
      setLoading(false);
    }
  }, [existingSessionId, navStack]);

  useEffect(() => { initSession(); }, [initSession]);

  // ── Phase transitions ──────────────────────────────────────────

  const setStatus = useCallback(async (newStatus) => {
    if (!session?.id) return;
    const { error: e } = await supabase
      .from('clip_sessions')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', session.id);
    if (e) { Alert.alert('Error', e.message); return; }
    setSession(prev => ({ ...prev, status: newStatus }));
  }, [session]);

  // Pending → in_progress: run pre-trip validation first
  const handleStartClipping = useCallback(async () => {
    if (!session?.id) return;

    try {
      const { data, error: e } = await supabase.functions.invoke(
        'validate-session',
        { body: { sessionId: session.id } }
      );
      if (e) throw e;

      if (data?.expired_count > 0) {
        Alert.alert(
          `${data.expired_count} Expired Coupon${data.expired_count > 1 ? 's' : ''}`,
          'Some coupons expired. They have been removed from your checklist.',
        );
        // Reload items to get expired statuses
        const { data: fresh } = await supabase
          .from('clip_session_items')
          .select('*')
          .eq('session_id', session.id)
          .order('sort_order', { ascending: true });
        setDbItems(fresh ?? []);
      }

      if (data?.unactioned_critical?.length > 0 && !data.ready) {
        const names = data.unactioned_critical.map(i => i.item_name).join(', ');
        Alert.alert(
          'Critical items need action',
          `Before clipping: ${names}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Proceed', onPress: () => setStatus('in_progress') },
          ]
        );
        return;
      }

      setValidation(data);
      await setStatus('in_progress');
    } catch (e) {
      // Fall through — let user proceed even if validation edge function is pending
      await setStatus('in_progress');
    }
  }, [session, setStatus]);

  // in_progress → completed: check for pending items
  const handleCompleteTrip = useCallback(async () => {
    const pendingCritical = dbItems.filter(i => i.is_critical && i.status === 'pending');
    if (pendingCritical.length > 0) {
      Alert.alert(
        'Critical items unactioned',
        `${pendingCritical.length} critical item(s) not marked done. Complete anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Complete', onPress: () => setStatus('completed') },
        ]
      );
      return;
    }
    await setStatus('completed');
  }, [dbItems, setStatus]);

  const handlePostTripSave = useCallback(async (opts) => {
    if (!session?.id) return;
    const { error: e } = await supabase
      .from('clip_sessions')
      .update({
        status:            'completed',
        fetch_snapped:     opts.fetch_snapped,
        swagbucks_snapped: opts.swagbucks_snapped,
        savings_at_shop:   opts.savings_at_shop,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', session.id);
    if (e) { Alert.alert('Error', e.message); return; }
    setSession(prev => ({ ...prev, ...opts, status: 'completed' }));
  }, [session]);

  // ── Item action ────────────────────────────────────────────────

  const handleItemAction = useCallback(async (itemId, action) => {
    const { error: e } = await supabase
      .from('clip_session_items')
      .update({
        status:      action,
        actioned_at: new Date().toISOString(),
      })
      .eq('id', itemId);
    if (e) { Alert.alert('Error', e.message); return; }

    setDbItems(prev => prev.map(i => i.id === itemId
      ? { ...i, status: action, actioned_at: new Date().toISOString() }
      : i
    ));

    // Update clipped_count on session
    if (action === 'done') {
      const newCount = dbItems.filter(i =>
        (i.id === itemId || i.status === 'done') && i.id !== itemId
          ? i.status === 'done' : action === 'done'
      ).length + 1;
      await supabase
        .from('clip_sessions')
        .update({ clipped_count: newCount })
        .eq('id', session.id);
    }
  }, [dbItems, session]);

  // ── Abandon ────────────────────────────────────────────────────

  const handleAbandon = useCallback(() => {
    Alert.alert(
      'Abandon Session',
      'Your progress will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('clip_sessions')
              .update({ status: 'abandoned', updated_at: new Date().toISOString() })
              .eq('id', session.id);
            navigation.goBack();
          },
        },
      ]
    );
  }, [session, navigation]);

  // ── Derived state ──────────────────────────────────────────────

  const status      = session?.status ?? 'pending';
  const doneCount   = dbItems.filter(i => i.status === 'done').length;
  const totalItems  = dbItems.length;
  const pendingItems = dbItems.filter(i => i.status === 'pending');
  const activeStack = stack ?? null;

  // Savings display
  const savingsAtBuild = session?.savings_at_build ?? activeStack?.coupon_savings_total ?? 0;
  const rebateCents    = activeStack?.rebate_total_cents ?? 0;
  const payPrice       = activeStack?.pay_price ?? 0;

  // ── Loading / error ────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadingText}>Building clip session…</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <Feather name="alert-circle" size={40} color={CORAL} />
        <Text style={[styles.loadingText, { color: CORAL, marginTop: 12 }]}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={initSession}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={MINT} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={NAVY} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerTitle}>{PHASE_LABELS[status] ?? cap(status)}</Text>
          <Text style={styles.headerSub}>
            {activeStack?.retailer ?? cap(session?.retailer_key ?? '')}
          </Text>
        </View>
        {status !== 'completed' && status !== 'abandoned' && (
          <TouchableOpacity onPress={handleAbandon} style={styles.abandonBtn}>
            <Text style={styles.abandonText}>Abandon</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Phase bar */}
      <PhaseBar status={status} />

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* Summary card — always visible */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>You pay</Text>
            <Text style={styles.summaryPayValue}>{fmt(payPrice)}</Text>
          </View>
          {savingsAtBuild > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: GREEN }]}>Coupon savings</Text>
              <Text style={[styles.summaryValue, { color: GREEN }]}>{fmt(savingsAtBuild)}</Text>
            </View>
          )}
          {rebateCents > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: CORAL }]}>Rebates (after trip)</Text>
              <Text style={[styles.summaryValue, { color: CORAL }]}>{cents(rebateCents)}</Text>
            </View>
          )}
          {status === 'in_progress' && (
            <Text style={styles.progressNote}>
              {doneCount} / {totalItems} items actioned
            </Text>
          )}
        </View>

        {/* ── PHASE: pending ── */}
        {status === 'pending' && (
          <>
            {activeStack && <BasketBanner stack={activeStack} />}

            {activeStack?.math_errors?.length > 0 && (
              <View style={styles.errorBanner}>
                <Feather name="alert-triangle" size={15} color={WHITE} />
                <Text style={styles.errorBannerText}>
                  {activeStack.math_errors.length} math issue(s) detected — check items below
                </Text>
              </View>
            )}

            {activeStack?.expiry_alert && (
              <View style={[styles.errorBanner, { backgroundColor: AMBER }]}>
                <Feather name="clock" size={15} color={WHITE} />
                <Text style={styles.errorBannerText}>
                  Some coupons expire soon — build session and clip immediately
                </Text>
              </View>
            )}

            {(activeStack?.items ?? []).map(item => (
              <SpecItemCard key={item.id} item={item} />
            ))}

            {activeStack?.cashier_note && (
              <View style={styles.cashierNote}>
                <Feather name="info" size={14} color={NAVY} />
                <Text style={styles.cashierNoteText}>{activeStack.cashier_note}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.primaryBtn} onPress={handleStartClipping}>
              <Text style={styles.primaryBtnText}>Build checklist →</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── PHASE: in_progress ── */}
        {status === 'in_progress' && (
          <>
            {validation?.warnings?.map((w, i) => (
              <View key={i} style={[styles.errorBanner, { backgroundColor: AMBER }]}>
                <Feather name="alert-circle" size={14} color={WHITE} />
                <Text style={styles.errorBannerText}>{w}</Text>
              </View>
            ))}

            <Text style={styles.sectionHeader}>
              {pendingItems.length > 0
                ? `${pendingItems.length} action${pendingItems.length > 1 ? 's' : ''} remaining`
                : 'All items actioned — ready to go!'}
            </Text>

            {dbItems.map(item => (
              <ChecklistItem
                key={item.id}
                dbItem={item}
                onAction={handleItemAction}
              />
            ))}

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 16 }]}
              onPress={handleCompleteTrip}
            >
              <Text style={styles.primaryBtnText}>Complete trip ✓</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── PHASE: completed ── */}
        {status === 'completed' && (
          <>
            <View style={styles.completedBanner}>
              <Feather name="check-circle" size={52} color={GREEN} />
              <Text style={styles.completedTitle}>Trip Complete!</Text>
              {session?.savings_at_shop != null ? (
                <Text style={styles.completedSub}>
                  You saved {fmt(session.savings_at_shop)} at the register
                </Text>
              ) : savingsAtBuild > 0 ? (
                <Text style={styles.completedSub}>
                  Projected savings: {fmt(savingsAtBuild)}
                </Text>
              ) : null}
            </View>

            {/* Savings breakdown */}
            <View style={styles.breakdownCard}>
              {activeStack?.savings_breakdown && Object.entries(activeStack.savings_breakdown)
                .filter(([k, v]) => k !== 'total' && v > 0)
                .map(([k, v]) => (
                  <View key={k} style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{cap(k)}</Text>
                    <Text style={[styles.summaryValue, { color: GREEN }]}>{fmt(v)}</Text>
                  </View>
                ))
              }
              {rebateCents > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: CORAL }]}>Pending rebates</Text>
                  <Text style={[styles.summaryValue, { color: CORAL }]}>{cents(rebateCents)}</Text>
                </View>
              )}
            </View>

            {/* Post-trip form if not yet saved */}
            {(session?.savings_at_shop == null) && (
              <PostTripForm session={session} onSave={handlePostTripSave} />
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: NAVY, marginTop: 16 }]}
              onPress={() => navigation.navigate('Discover')}
            >
              <Text style={styles.primaryBtnText}>Back to Discover</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── PHASE: stale / abandoned ── */}
        {(status === 'stale' || status === 'abandoned') && (
          <View style={styles.staleBanner}>
            <Feather name="alert-circle" size={32} color={CORAL} />
            <Text style={styles.staleTitle}>
              {status === 'stale' ? 'Session Stale' : 'Session Abandoned'}
            </Text>
            <Text style={styles.staleSub}>
              {status === 'stale'
                ? 'Coupons may have expired. Build a new session for accurate savings.'
                : 'This session was abandoned.'}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 20 }]}
              onPress={() => navigation.navigate('Discover')}
            >
              <Text style={styles.primaryBtnText}>Go to Discover</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: MINT },
  centerScreen: { flex: 1, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: NAVY, marginTop: 16, fontSize: 15, textAlign: 'center' },
  retryBtn:    { marginTop: 20, backgroundColor: GREEN, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryBtnText: { color: WHITE, fontWeight: '600' },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: MINT },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: NAVY },
  headerSub:   { fontSize: 13, color: NAVY, opacity: 0.55 },
  abandonBtn:  { paddingHorizontal: 12, paddingVertical: 6 },
  abandonText: { color: CORAL, fontSize: 13, fontWeight: '600' },

  // Phase bar
  phaseBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  phaseStep:      { alignItems: 'center' },
  phaseDot:       { width: 24, height: 24, borderRadius: 12, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  phaseDotActive: { backgroundColor: GREEN },
  phaseDotNum:    { fontSize: 11, color: '#999', fontWeight: '600' },
  phaseLabel:     { fontSize: 10, color: '#999', marginTop: 3, textAlign: 'center', maxWidth: 64 },
  phaseLabelActive: { color: NAVY, fontWeight: '600' },
  phaseLine:      { flex: 1, height: 2, backgroundColor: BORDER, marginHorizontal: 4, marginBottom: 12 },
  phaseLineActive: { backgroundColor: GREEN },

  // Scroll
  scroll: { flex: 1 },

  // Summary card
  summaryCard:     { margin: 16, backgroundColor: WHITE, borderRadius: 14, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6 },
  summaryRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel:    { fontSize: 14, color: NAVY, opacity: 0.7 },
  summaryPayValue: { fontSize: 24, fontWeight: '800', color: NAVY },
  summaryValue:    { fontSize: 16, fontWeight: '700' },
  progressNote:    { marginTop: 8, color: NAVY, opacity: 0.45, fontSize: 12 },

  // Banners
  triggerBanner: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, gap: 8 },
  triggerText:   { color: WHITE, fontSize: 13, fontWeight: '600', flex: 1 },
  errorBanner:   { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: CORAL, padding: 10, borderRadius: 8, gap: 8 },
  errorBannerText: { color: WHITE, fontSize: 13, flex: 1 },

  // Cashier note
  cashierNote:     { marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', backgroundColor: '#E8EAF6', padding: 10, borderRadius: 8, gap: 8, alignItems: 'flex-start' },
  cashierNoteText: { color: NAVY, fontSize: 13, flex: 1 },

  // Section header
  sectionHeader:    { marginHorizontal: 16, marginTop: 8, marginBottom: 8, fontSize: 15, fontWeight: '700', color: NAVY },
  sectionSubHeader: { fontSize: 12, fontWeight: '600', color: NAVY, opacity: 0.6, marginBottom: 4 },

  // Item cards (phase pending)
  itemCard:        { marginHorizontal: 16, marginBottom: 8, backgroundColor: WHITE, borderRadius: 12, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  itemCardHeader:  { flexDirection: 'row', alignItems: 'center', padding: 14 },
  itemCardExpanded: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  itemName:        { fontSize: 15, fontWeight: '700', color: NAVY },
  itemBrand:       { fontSize: 12, color: NAVY, opacity: 0.55, marginTop: 2 },
  dealLabelBadge:  { marginTop: 4, alignSelf: 'flex-start', backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  dealLabelText:   { fontSize: 11, fontWeight: '600', color: '#E65100' },
  itemPriceSummary: { alignItems: 'flex-end', marginRight: 10 },
  itemPayPrice:    { fontSize: 17, fontWeight: '800', color: NAVY },
  itemSavings:     { fontSize: 11, color: GREEN, fontWeight: '600', marginTop: 2 },

  // Math box
  mathBox:        { backgroundColor: LIGHT_MINT, borderRadius: 8, padding: 10, marginTop: 8 },
  mathRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  mathRowFinal:   { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6, marginTop: 2 },
  mathLabel:      { fontSize: 13, color: NAVY, opacity: 0.75 },
  mathValue:      { fontSize: 13, color: NAVY, fontWeight: '600' },
  strike:         { textDecorationLine: 'line-through', opacity: 0.5 },
  mathError:      { fontSize: 11, color: CORAL, marginTop: 4 },
  rainCheck:      { fontSize: 12, color: '#555', marginTop: 6, fontStyle: 'italic' },

  // Coupon layer rows
  layerRow:    { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8, marginBottom: 4 },
  layerBadge:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: NAVY },
  layerBadgeText: { color: WHITE, fontSize: 12, fontWeight: '700' },
  layerType:   { fontSize: 12, fontWeight: '700', color: NAVY },
  layerAction: { fontSize: 11, color: NAVY, opacity: 0.65 },
  layerRight:  { alignItems: 'flex-end' },
  layerValue:  { fontSize: 14, fontWeight: '700' },
  layerTiming: { fontSize: 10, color: '#777', marginTop: 2 },
  criticalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CORAL, marginLeft: 6 },

  // Checklist (phase in_progress)
  checklistRow:         { marginHorizontal: 16, marginBottom: 8, backgroundColor: WHITE, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'flex-start', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3 },
  checklistRowCritical: { borderLeftWidth: 3, borderLeftColor: CORAL },
  checklistLeft:  { flex: 1 },
  typeBadge:      { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 6 },
  typeBadgeText:  { color: WHITE, fontSize: 10, fontWeight: '700' },
  checklistName:  { fontSize: 14, fontWeight: '600', color: NAVY, lineHeight: 19 },
  checklistMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  checklistValue: { fontSize: 12, fontWeight: '700', color: GREEN },
  checklistTiming: { fontSize: 11, color: '#888' },
  ibottaWarn:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, backgroundColor: '#FFF8E1', padding: 5, borderRadius: 5 },
  ibottaWarnText: { fontSize: 11, color: AMBER, flex: 1 },
  deepLink:       { fontSize: 10, color: NAVY, opacity: 0.4, marginTop: 4 },
  checklistActions: { marginLeft: 10, alignItems: 'center', gap: 6 },
  actionBtnDone:  { width: 34, height: 34, borderRadius: 17, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  actionBtnSkip:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: BORDER },
  actionBtnSkipText: { fontSize: 11, color: '#888' },
  statusBadge:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: { color: WHITE, fontSize: 11, fontWeight: '600' },

  // Completed
  completedBanner: { alignItems: 'center', padding: 32 },
  completedTitle:  { fontSize: 26, fontWeight: '800', color: NAVY, marginTop: 12 },
  completedSub:    { fontSize: 15, color: NAVY, opacity: 0.65, marginTop: 6, textAlign: 'center' },
  breakdownCard:   { marginHorizontal: 16, backgroundColor: WHITE, borderRadius: 14, padding: 16, elevation: 1 },

  // Post-trip form
  postTripForm:      { marginHorizontal: 16, marginTop: 16, backgroundColor: WHITE, borderRadius: 14, padding: 16 },
  postTripFormTitle: { fontSize: 15, fontWeight: '700', color: NAVY, marginBottom: 14 },
  switchRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  switchLabel:       { fontSize: 14, fontWeight: '600', color: NAVY },
  switchSub:         { fontSize: 11, color: '#888', marginTop: 2 },
  inputRow:          { paddingVertical: 12 },
  savingsInput:      { marginTop: 6, borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: NAVY },

  // Stale / abandoned
  staleBanner: { alignItems: 'center', padding: 48 },
  staleTitle:  { fontSize: 20, fontWeight: '700', color: NAVY, marginTop: 16 },
  staleSub:    { fontSize: 14, color: NAVY, opacity: 0.6, marginTop: 8, textAlign: 'center' },

  // CTA buttons
  primaryBtn:     { marginHorizontal: 16, marginTop: 12, backgroundColor: GREEN, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: WHITE, fontSize: 16, fontWeight: '700' },
});
