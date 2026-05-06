/**
 * clipSessionService.ts
 *
 * Pre-trip clip session management. Creates and manages clip_sessions +
 * clip_session_items from a validated SnippdStack.
 *
 * Sort order for lowest friction:
 *   PRE-STORE (before leaving home):
 *     Sort 1–99:   MFR coupons, highest value first
 *     Sort 100–199: Ibotta offers, highest value first
 *     Sort 200–299: Publix store / ESF coupons
 *   PRE-CHECKOUT (in store):
 *     Sort 300–399: Store digital coupons
 *   POST-TRIP (after checkout):
 *     Sort 400: Fetch receipt snap
 *     Sort 401: Swagbucks receipt snap
 *
 * Usage:
 *   const result = await buildClipSession(sb, userId, stack);
 *   // result.session_id — use to load ClipSessionScreen
 *   await markItemActioned(sb, itemId, 'clipped');
 *   const ready = await validateSessionBeforeTrip(sb, sessionId);
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SnippdStack, CouponLayer, RebateEntry } from './stackSpecEngine';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface ClipSessionRow {
  id: string;
  user_id: string;
  stack_id: string;
  retailer_key: string;
  trip_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'stale' | 'abandoned';
  total_coupons: number;
  clipped_count: number;
  ibotta_loaded_count: number;
  fetch_snapped: boolean;
  swagbucks_snapped: boolean;
  savings_at_build: number | null;
  savings_at_shop: number | null;
  expired_coupons_removed: number;
  cashier_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClipSessionItemRow {
  id: string;
  session_id: string;
  coupon_type: string;
  item_name: string;
  brand: string | null;
  coupon_value: number | null;
  source: string;
  source_url: string | null;
  deep_link: string | null;
  timing: string;
  sort_order: number;
  status: 'pending' | 'done' | 'expired' | 'skipped';
  actioned_at: string | null;
  expires_at: string | null;
  is_critical: boolean;
  ibotta_verify_flag: boolean;
  created_at: string;
}

export interface BuildClipSessionResult {
  session_id: string;
  session: ClipSessionRow;
  items: ClipSessionItemRow[];
  total_coupons: number;
  savings_at_build: number;
  errors: string[];
}

export interface PreTripValidation {
  ready: boolean;
  total: number;
  done: number;
  pending_items: { item_name: string; coupon_type: string; action: string; deep_link: string }[];
  expired_count: number;
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────
// Deep links
// ─────────────────────────────────────────────────────────────────────

const DEEP_LINKS: Record<string, string> = {
  'Coupons.com':    'https://www.coupons.com/printable',
  'P&G Everyday':  'https://www.pgeveryday.com/coupons',
  'SmartSource':   'https://www.smartsource.com',
  'Haleon Huddle': 'https://haleonhuddle.com/en-us/everyday-health-coupons/',
  'Publix app':    'https://www.publix.com/savings/digital-coupons',
  'ibotta':        'https://ibotta.com/rebates',
  'fetch':         'https://fetchrewards.com',
  'swagbucks':     'https://swagbucks.com/shop/grocery',
  'checkout51':    'https://checkout51.com',
};

// ─────────────────────────────────────────────────────────────────────
// buildClipSession
// ─────────────────────────────────────────────────────────────────────

export async function buildClipSession(
  sb: SupabaseClient,
  userId: string,
  stack: SnippdStack
): Promise<BuildClipSessionResult> {
  const errors: string[] = [...stack.math_errors];
  const today = new Date().toISOString().split('T')[0];

  // Build ordered clip items from stack
  const rawItems: Omit<ClipSessionItemRow, 'id' | 'created_at'>[] = [];
  let sortBase = 0;

  // ── Sort 1–99: MFR coupons (highest value first) ──────────────────
  sortBase = 1;
  const mfrLayerItems = stack.items.flatMap(item =>
    item.coupon_layers
      .filter(l => l.type === 'MFR_COUPON')
      .map(l => ({ item, layer: l }))
  ).sort((a, b) => b.layer.value - a.layer.value);

  mfrLayerItems.forEach(({ item, layer }) => {
    rawItems.push(buildItemFromLayer(item.name, item.brand, layer, sortBase++, today));
  });

  // ── Sort 100–199: Ibotta offers (highest value first) ─────────────
  sortBase = 100;
  const ibottaItems = stack.items.flatMap(item =>
    item.rebates
      .filter(r => r.platform === 'ibotta')
      .map(r => ({ item, rebate: r }))
  ).sort((a, b) => b.rebate.value_cents - a.rebate.value_cents);

  ibottaItems.forEach(({ item, rebate }) => {
    rawItems.push(buildItemFromRebate(item.name, item.brand, rebate, sortBase++, today));
  });

  // ── Sort 200–299: Publix store / ESF coupons ──────────────────────
  sortBase = 200;
  const storeLayerItems = stack.items.flatMap(item =>
    item.coupon_layers
      .filter(l => l.type === 'PUBLIX_STORE')
      .map(l => ({ item, layer: l }))
  );

  storeLayerItems.forEach(({ item, layer }) => {
    rawItems.push(buildItemFromLayer(item.name, item.brand, layer, sortBase++, today));
  });

  // ── Sort 300–399: Store digital coupons ───────────────────────────
  sortBase = 300;
  const digitalLayerItems = stack.items.flatMap(item =>
    item.coupon_layers
      .filter(l => l.type === 'DIGITAL')
      .map(l => ({ item, layer: l }))
  );

  digitalLayerItems.forEach(({ item, layer }) => {
    rawItems.push(buildItemFromLayer(item.name, item.brand, layer, sortBase++, today));
  });

  // ── Sort 400+: Fetch + Swagbucks receipt snaps ────────────────────
  const fetchItems = stack.items.flatMap(item =>
    item.rebates
      .filter(r => r.platform === 'fetch')
      .map(r => ({ item, rebate: r }))
  );
  fetchItems.forEach(({ item, rebate }, i) => {
    rawItems.push(buildItemFromRebate(item.name, item.brand, rebate, 400 + i, today));
  });

  const swagItems = stack.items.flatMap(item =>
    item.rebates
      .filter(r => r.platform === 'swagbucks')
      .map(r => ({ item, rebate: r }))
  );
  swagItems.forEach(({ item, rebate }, i) => {
    rawItems.push(buildItemFromRebate(item.name, item.brand, rebate, 420 + i, today));
  });

  // Other rebate platforms
  const otherRebateItems = stack.items.flatMap(item =>
    item.rebates
      .filter(r => !['ibotta', 'fetch', 'swagbucks'].includes(r.platform))
      .map(r => ({ item, rebate: r }))
  );
  otherRebateItems.forEach(({ item, rebate }, i) => {
    rawItems.push(buildItemFromRebate(item.name, item.brand, rebate, 440 + i, today));
  });

  // Loyalty items (critical — prepend at very top)
  const loyaltyItems = stack.items.flatMap(item =>
    item.coupon_layers
      .filter(l => l.type === 'LOYALTY')
      .map(l => ({ item, layer: l }))
  );
  loyaltyItems.forEach(({ item, layer }, i) => {
    rawItems.unshift(buildItemFromLayer(item.name, item.brand, layer, i, today));
  });

  const savings_at_build = stack.coupon_savings_total + (stack.basket_trigger_value ?? 0);

  // Insert session
  const { data: sessionRow, error: sessionErr } = await sb
    .from('clip_sessions')
    .insert({
      user_id: userId,
      stack_id: stack.id,
      retailer_key: stack.retailer_key,
      trip_date: today,
      status: 'pending',
      total_coupons: rawItems.length,
      clipped_count: 0,
      ibotta_loaded_count: 0,
      savings_at_build,
      cashier_note: stack.cashier_note ?? null,
    })
    .select()
    .single();

  if (sessionErr || !sessionRow) {
    return {
      session_id: '',
      session: null as unknown as ClipSessionRow,
      items: [],
      total_coupons: rawItems.length,
      savings_at_build,
      errors: [...errors, 'Failed to create session: ' + (sessionErr?.message ?? 'unknown')],
    };
  }

  // Insert items
  const itemInserts = rawItems.map(row => ({ ...row, session_id: sessionRow.id }));
  let insertedItems: ClipSessionItemRow[] = [];
  if (itemInserts.length > 0) {
    const { data: insertedData, error: itemsErr } = await sb
      .from('clip_session_items')
      .insert(itemInserts)
      .select();

    if (itemsErr) {
      errors.push('Warning: failed to insert session items: ' + itemsErr.message);
    } else {
      insertedItems = (insertedData ?? []) as unknown as ClipSessionItemRow[];
    }
  }

  return {
    session_id: sessionRow.id,
    session: sessionRow as unknown as ClipSessionRow,
    items: insertedItems,
    total_coupons: rawItems.length,
    savings_at_build,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────
// validateSessionBeforeTrip
// ─────────────────────────────────────────────────────────────────────

export async function validateSessionBeforeTrip(
  sb: SupabaseClient,
  sessionId: string
): Promise<PreTripValidation> {
  const today = new Date().toISOString().split('T')[0];
  const warnings: string[] = [];

  const { data: items, error } = await sb
    .from('clip_session_items')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true });

  if (error || !items) {
    return { ready: false, total: 0, done: 0, pending_items: [], expired_count: 0, warnings: ['Failed to load session items'] };
  }

  // Flag expired items
  const expiredItems = (items as unknown as ClipSessionItemRow[]).filter(
    i => i.expires_at && i.expires_at < today && i.status === 'pending'
  );
  if (expiredItems.length > 0) {
    // Mark expired
    await sb.from('clip_session_items')
      .update({ status: 'expired' })
      .in('id', expiredItems.map(i => i.id));
    warnings.push(`${expiredItems.length} coupon(s) expired — removed from session`);
  }

  const activeItems = (items as unknown as ClipSessionItemRow[]).filter(
    i => i.timing !== 'after_receipt' && i.status !== 'expired'
  );
  const preStoreItems = activeItems.filter(
    i => i.timing === 'before_store' || i.timing === 'before_checkout'
  );

  const done = preStoreItems.filter(i => i.status === 'done').length;
  const pending = preStoreItems.filter(i => i.status === 'pending');

  if (pending.some(i => i.is_critical)) {
    warnings.push('Critical loyalty card not yet confirmed — deal price may not unlock');
  }

  return {
    ready: pending.length === 0,
    total: preStoreItems.length,
    done,
    pending_items: pending.map(i => ({
      item_name: i.item_name,
      coupon_type: i.coupon_type,
      action: i.source,
      deep_link: i.deep_link ?? '',
    })),
    expired_count: expiredItems.length,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────
// markItemActioned
// ─────────────────────────────────────────────────────────────────────

export async function markItemActioned(
  sb: SupabaseClient,
  itemId: string,
  action: 'clipped' | 'done' | 'skipped'
): Promise<void> {
  const status = action === 'clipped' || action === 'done' ? 'done' : 'skipped';
  await sb
    .from('clip_session_items')
    .update({ status, actioned_at: new Date().toISOString() })
    .eq('id', itemId);

  // Update parent session clipped_count
  const { data: item } = await sb
    .from('clip_session_items')
    .select('session_id, coupon_type')
    .eq('id', itemId)
    .single();

  if (item) {
    const { data: allItems } = await sb
      .from('clip_session_items')
      .select('status')
      .eq('session_id', item.session_id);

    const clipped = (allItems ?? []).filter((i: any) => i.status === 'done').length;
    const ibottaLoaded = (allItems ?? []).filter(
      (i: any) => (i as any).coupon_type === 'ibotta' && i.status === 'done'
    ).length;

    await sb
      .from('clip_sessions')
      .update({ clipped_count: clipped, ibotta_loaded_count: ibottaLoaded, updated_at: new Date().toISOString() })
      .eq('id', item.session_id);
  }
}

// ─────────────────────────────────────────────────────────────────────
// completePostTrip
// ─────────────────────────────────────────────────────────────────────

export async function completePostTrip(
  sb: SupabaseClient,
  sessionId: string,
  opts: { fetch_snapped?: boolean; swagbucks_snapped?: boolean; savings_at_shop?: number }
): Promise<void> {
  await sb
    .from('clip_sessions')
    .update({
      status: 'completed',
      fetch_snapped: opts.fetch_snapped ?? false,
      swagbucks_snapped: opts.swagbucks_snapped ?? false,
      savings_at_shop: opts.savings_at_shop ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

// ─────────────────────────────────────────────────────────────────────
// getActiveSession
// ─────────────────────────────────────────────────────────────────────

export async function getActiveSession(
  sb: SupabaseClient,
  userId: string
): Promise<{ id: string; retailer_key: string; status: string } | null> {
  const { data, error } = await sb
    .from('clip_sessions')
    .select('id, retailer_key, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as unknown as { id: string; retailer_key: string; status: string };
}

// ─────────────────────────────────────────────────────────────────────
// Item builders
// ─────────────────────────────────────────────────────────────────────

function buildItemFromLayer(
  itemName: string,
  brand: string | null,
  layer: CouponLayer,
  sortOrder: number,
  today: string
): Omit<ClipSessionItemRow, 'id' | 'created_at'> {
  return {
    session_id: '',  // set by caller
    coupon_type: layer.type,
    item_name: itemName,
    brand,
    coupon_value: layer.value,
    source: layer.source,
    source_url: null,
    deep_link: layer.deep_link,
    timing: layer.timing,
    sort_order: sortOrder,
    status: 'pending',
    actioned_at: null,
    expires_at: layer.expires_at ?? null,
    is_critical: layer.is_critical,
    ibotta_verify_flag: false,
  };
}

function buildItemFromRebate(
  itemName: string,
  brand: string | null,
  rebate: RebateEntry,
  sortOrder: number,
  _today: string
): Omit<ClipSessionItemRow, 'id' | 'created_at'> {
  return {
    session_id: '',
    coupon_type: rebate.platform,
    item_name: itemName,
    brand,
    coupon_value: rebate.value_cents / 100,
    source: rebate.platform,
    source_url: rebate.claim_url ?? null,
    deep_link: rebate.claim_url ?? DEEP_LINKS[rebate.platform] ?? '',
    timing: rebate.timing === 'before_shopping' ? 'before_store' : 'after_receipt',
    sort_order: sortOrder,
    status: 'pending',
    actioned_at: null,
    expires_at: null,
    is_critical: rebate.timing === 'before_shopping',
    ibotta_verify_flag: rebate.ibotta_verify_flag ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const sb = createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  );
  console.log('clipSessionService — use buildClipSession(sb, userId, stack) programmatically');
}
