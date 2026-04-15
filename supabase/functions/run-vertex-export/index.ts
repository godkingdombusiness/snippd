// ============================================================
// Snippd — Run Vertex Training Export
// supabase/functions/run-vertex-export/index.ts
//
// POST /functions/v1/run-vertex-export
// Auth: x-cron-secret header (pg_cron) OR service-role Bearer JWT
//
// Exports 90-day labeled training data to 'vertex-training-data' bucket:
//   - Joins event_stream + recommendation_exposures + user_state_snapshots + stack_results
//   - Labels: purchased=1.0, accepted=0.8, clicked=0.4, dismissed=0.0, other=0.1
//   - Writes JSONL to training_data/vertex_training_YYYY-MM-DD.jsonl
//   - Logs result to ingestion_run_log
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const BATCH_SIZE  = 500;
const ROLLING_DAYS = 90;

const EVENT_LABELS: Record<string, number> = {
  item_purchased:           1.0,
  receipt_scanned:          1.0,
  purchase_completed:       1.0,
  deal_accepted:            0.8,
  offer_added_to_cart:      0.8,
  recommendation_accepted:  0.8,
  deal_clicked:             0.4,
  recommendation_clicked:   0.4,
  offer_viewed:             0.4,
  deal_dismissed:           0.0,
  recommendation_dismissed: 0.0,
  offer_skipped:            0.0,
};

function labelEvent(eventName: string): number {
  return EVENT_LABELS[eventName] ?? 0.1;
}

async function fetchBatch(
  db: ReturnType<typeof createClient>,
  offset: number,
  since: string,
): Promise<Record<string, unknown>[]> {
  const { data: events, error } = await db
    .from('event_stream')
    .select('id, user_id, session_id, event_name, object_type, object_id, retailer_key, created_at')
    .gte('created_at', since)
    .in('event_name', Object.keys(EVENT_LABELS))
    .order('created_at', { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);

  if (error) throw new Error(`event_stream query failed: ${error.message}`);
  if (!events || events.length === 0) return [];

  const evArr = events as Array<Record<string, unknown>>;
  const userIds   = [...new Set(evArr.map(e => e.user_id as string))];
  const objectIds = evArr.filter(e => e.object_id).map(e => e.object_id as string);
  const safeIds   = objectIds.length > 0 ? objectIds : ['__none__'];

  const [exposureRows, snapshotRows, stackRows] = await Promise.all([
    db.from('recommendation_exposures')
      .select('id, object_id, recommendation_type, rank_position, stack_rank_score, savings_pct, has_coupon, primary_category')
      .in('object_id', safeIds)
      .then(r => (r.data ?? []) as Array<Record<string, unknown>>),

    db.from('user_state_snapshots')
      .select('user_id, loyalty_tier, preference_vector, weekly_spend_cents, snapshot_at')
      .in('user_id', userIds)
      .gte('snapshot_at', since)
      .order('snapshot_at', { ascending: false })
      .then(r => (r.data ?? []) as Array<Record<string, unknown>>),

    db.from('stack_results')
      .select('id, final_price_cents, savings_cents, stack_complexity')
      .in('id', safeIds)
      .then(r => (r.data ?? []) as Array<Record<string, unknown>>),
  ]);

  const exposureMap = new Map<string, Record<string, unknown>>();
  for (const exp of exposureRows) {
    if (exp.object_id) exposureMap.set(exp.object_id as string, exp);
  }

  const snapshotMap = new Map<string, Record<string, unknown>>();
  for (const snap of snapshotRows) {
    if (!snapshotMap.has(snap.user_id as string)) snapshotMap.set(snap.user_id as string, snap);
  }

  const stackMap = new Map<string, Record<string, unknown>>();
  for (const sr of stackRows) stackMap.set(sr.id as string, sr);

  return evArr.map(ev => {
    const exp  = ev.object_id ? exposureMap.get(ev.object_id as string) : undefined;
    const snap = snapshotMap.get(ev.user_id as string);
    const stk  = ev.object_id && ev.object_type === 'stack'
      ? stackMap.get(ev.object_id as string) : undefined;

    return {
      user_id:             ev.user_id,
      session_id:          ev.session_id ?? null,
      event_name:          ev.event_name,
      object_type:         ev.object_type ?? null,
      object_id:           ev.object_id ?? null,
      retailer_key:        ev.retailer_key ?? null,
      event_at:            ev.created_at,

      exposure_id:         exp?.id ?? null,
      recommendation_type: exp?.recommendation_type ?? null,
      rank_position:       exp?.rank_position ?? null,
      stack_rank_score:    exp?.stack_rank_score ?? null,
      savings_pct:         exp?.savings_pct ?? null,
      has_coupon:          exp?.has_coupon ?? null,
      primary_category:    exp?.primary_category ?? null,

      loyalty_tier:        snap?.loyalty_tier ?? null,
      preference_vector:   snap?.preference_vector ?? null,
      weekly_spend_cents:  snap?.weekly_spend_cents ?? null,

      final_price_cents:   stk?.final_price_cents ?? null,
      savings_cents:       stk?.savings_cents ?? null,
      stack_complexity:    stk?.stack_complexity ?? null,

      label: labelEvent(ev.event_name as string),
    };
  });
}

// ── Main handler ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? '';

  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  // ── Auth: x-cron-secret OR service-role Bearer ────────────
  const incomingCronSecret = req.headers.get('x-cron-secret') ?? '';
  const authHeader         = req.headers.get('authorization') ?? '';

  const isCronAuth   = cronSecret && incomingCronSecret === cronSecret;
  const isBearerAuth = authHeader.startsWith('Bearer ');

  if (!isCronAuth && !isBearerAuth) return json({ error: 'Unauthorized' }, 401);
  if (!isCronAuth && isBearerAuth) {
    if (authHeader.slice(7) !== serviceKey) return json({ error: 'Forbidden' }, 403);
  }

  const db        = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const startedAt = new Date().toISOString();
  const dateSuffix = startedAt.split('T')[0];
  const since      = new Date(Date.now() - ROLLING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const storagePath = `training_data/vertex_training_${dateSuffix}.jsonl`;

  try {
    const allRows: Record<string, unknown>[] = [];
    let offset = 0;

    while (true) {
      const batch = await fetchBatch(db, offset, since);
      if (batch.length === 0) break;
      allRows.push(...batch);
      offset += batch.length;
      if (batch.length < BATCH_SIZE) break;
    }

    if (allRows.length === 0) {
      return json({
        ok: true, rows_exported: 0, storage_path: storagePath,
        message: 'No training rows found in rolling window',
      });
    }

    // Serialize to JSONL
    const jsonlContent = allRows.map(r => JSON.stringify(r)).join('\n');
    const encoder = new TextEncoder();
    const blob    = new Blob([encoder.encode(jsonlContent)], { type: 'application/x-ndjson' });

    const { error: uploadErr } = await db.storage
      .from('vertex-training-data')
      .upload(storagePath, blob, { contentType: 'application/x-ndjson', upsert: true });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const completedAt = new Date().toISOString();

    db.from('ingestion_run_log').insert({
      source_key: 'run-vertex-export',
      stage:      'export_complete',
      status:     'ok',
      message:    `Exported ${allRows.length} rows to ${storagePath}`,
      metadata:   {
        rows_exported: allRows.length,
        storage_path:  storagePath,
        since,
        duration_ms:   new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      },
    }).then(() => {}).catch(() => {});

    return json({
      ok:            true,
      rows_exported: allRows.length,
      storage_path:  storagePath,
      started_at:    startedAt,
      completed_at:  completedAt,
    });
  } catch (err) {
    console.error('[run-vertex-export]', err);
    db.from('ingestion_run_log').insert({
      source_key: 'run-vertex-export',
      stage:      'export_error',
      status:     'error',
      message:    String(err),
      metadata:   { started_at: startedAt },
    }).then(() => {}).catch(() => {});
    return json({ error: String(err), ok: false }, 500);
  }
});
