/**
 * vertexTrainingExport — Exports labeled training data for Vertex AI
 *
 * runVertexTrainingExport(supabase):
 *   1. Joins event_stream + recommendation_exposures + user_state_snapshots + stack_results
 *   2. Labels each row: purchased=1.0, accepted=0.8, clicked=0.4, dismissed=0.0, other=0.1
 *   3. Writes JSONL to Supabase storage bucket 'vertex-training-data'
 *      at path: training_data/vertex_training_YYYY-MM-DD.jsonl
 *   4. Returns: { rows_exported, storage_path, started_at, completed_at }
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface TrainingRow {
  user_id: string;
  session_id: string | null;
  event_name: string;
  object_type: string | null;
  object_id: string | null;
  retailer_key: string | null;
  event_at: string;

  // From recommendation_exposures (joined)
  exposure_id: string | null;
  recommendation_type: string | null;
  rank_position: number | null;
  stack_rank_score: number | null;
  savings_pct: number | null;
  has_coupon: boolean | null;
  primary_category: string | null;

  // From user_state_snapshots (joined on user_id + week)
  loyalty_tier: string | null;
  preference_vector: Record<string, number> | null;
  weekly_spend_cents: number | null;

  // From stack_results (joined on object_id when object_type = 'stack')
  final_price_cents: number | null;
  savings_cents: number | null;
  stack_complexity: number | null;

  // Derived
  label: number;
}

interface ExportResult {
  rows_exported: number;
  storage_path: string;
  started_at: string;
  completed_at: string;
}

// ─────────────────────────────────────────────────────────────
// Label mapping
// ─────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, number> = {
  item_purchased:          1.0,
  receipt_scanned:         1.0,
  purchase_completed:      1.0,
  deal_accepted:           0.8,
  offer_added_to_cart:     0.8,
  recommendation_accepted: 0.8,
  deal_clicked:            0.4,
  recommendation_clicked:  0.4,
  offer_viewed:            0.4,
  deal_dismissed:          0.0,
  recommendation_dismissed: 0.0,
  offer_skipped:           0.0,
};

function labelEvent(eventName: string): number {
  return EVENT_LABELS[eventName] ?? 0.1;
}

// ─────────────────────────────────────────────────────────────
// Query — rolling 90-day window, batch 500 rows
// ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const ROLLING_DAYS = 90;

async function fetchBatch(
  supabase: SupabaseClient,
  offset: number,
  since: string,
): Promise<TrainingRow[]> {
  // Primary join: event_stream
  const { data: events, error } = await supabase
    .from('event_stream')
    .select(`
      id,
      user_id,
      session_id,
      event_name,
      object_type,
      object_id,
      retailer_key,
      created_at
    `)
    .gte('created_at', since)
    .in('event_name', Object.keys(EVENT_LABELS))
    .order('created_at', { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);

  if (error) throw new Error(`event_stream query failed: ${error.message}`);
  if (!events || events.length === 0) return [];

  // Collect IDs for enrichment joins
  const userIds   = [...new Set(events.map((e: { user_id: string }) => e.user_id))];
  const objectIds = events
    .filter((e: { object_id: string | null }) => e.object_id)
    .map((e: { object_id: string }) => e.object_id);

  // Parallel enrichment: recommendation_exposures + user_state_snapshots + stack_results
  const [exposureRows, snapshotRows, stackRows] = await Promise.all([
    supabase
      .from('recommendation_exposures')
      .select('id, object_id, recommendation_type, rank_position, stack_rank_score, savings_pct, has_coupon, primary_category')
      .in('object_id', objectIds.length > 0 ? objectIds : ['__none__'])
      .then(r => r.data ?? []),

    supabase
      .from('user_state_snapshots')
      .select('user_id, loyalty_tier, preference_vector, weekly_spend_cents, snapshot_at')
      .in('user_id', userIds)
      .gte('snapshot_at', since)
      .order('snapshot_at', { ascending: false })
      .then(r => r.data ?? []),

    supabase
      .from('stack_results')
      .select('id, final_price_cents, savings_cents, stack_complexity')
      .in('id', objectIds.length > 0 ? objectIds : ['__none__'])
      .then(r => r.data ?? []),
  ]);

  // Build lookup maps
  const exposureByObjectId = new Map<string, Record<string, unknown>>();
  for (const exp of exposureRows as Array<Record<string, unknown>>) {
    if (exp.object_id) exposureByObjectId.set(exp.object_id as string, exp);
  }

  // Latest snapshot per user
  const snapshotByUser = new Map<string, Record<string, unknown>>();
  for (const snap of snapshotRows as Array<Record<string, unknown>>) {
    if (!snapshotByUser.has(snap.user_id as string)) {
      snapshotByUser.set(snap.user_id as string, snap);
    }
  }

  const stackById = new Map<string, Record<string, unknown>>();
  for (const sr of stackRows as Array<Record<string, unknown>>) {
    stackById.set(sr.id as string, sr);
  }

  // Assemble training rows
  return (events as Array<Record<string, unknown>>).map(ev => {
    const exposure = ev.object_id ? exposureByObjectId.get(ev.object_id as string) : undefined;
    const snapshot = snapshotByUser.get(ev.user_id as string);
    const stack    = ev.object_id && ev.object_type === 'stack'
      ? stackById.get(ev.object_id as string) : undefined;

    return {
      user_id:              ev.user_id as string,
      session_id:           (ev.session_id as string | null) ?? null,
      event_name:           ev.event_name as string,
      object_type:          (ev.object_type as string | null) ?? null,
      object_id:            (ev.object_id as string | null) ?? null,
      retailer_key:         (ev.retailer_key as string | null) ?? null,
      event_at:             ev.created_at as string,

      exposure_id:          (exposure?.id as string | null) ?? null,
      recommendation_type:  (exposure?.recommendation_type as string | null) ?? null,
      rank_position:        (exposure?.rank_position as number | null) ?? null,
      stack_rank_score:     (exposure?.stack_rank_score as number | null) ?? null,
      savings_pct:          (exposure?.savings_pct as number | null) ?? null,
      has_coupon:           (exposure?.has_coupon as boolean | null) ?? null,
      primary_category:     (exposure?.primary_category as string | null) ?? null,

      loyalty_tier:         (snapshot?.loyalty_tier as string | null) ?? null,
      preference_vector:    (snapshot?.preference_vector as Record<string, number> | null) ?? null,
      weekly_spend_cents:   (snapshot?.weekly_spend_cents as number | null) ?? null,

      final_price_cents:    (stack?.final_price_cents as number | null) ?? null,
      savings_cents:        (stack?.savings_cents as number | null) ?? null,
      stack_complexity:     (stack?.stack_complexity as number | null) ?? null,

      label: labelEvent(ev.event_name as string),
    } as TrainingRow;
  });
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export async function runVertexTrainingExport(
  supabase: SupabaseClient,
): Promise<ExportResult> {
  const startedAt  = new Date().toISOString();
  const dateSuffix = startedAt.split('T')[0]; // YYYY-MM-DD
  const since      = new Date(Date.now() - ROLLING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const storagePath = `training_data/vertex_training_${dateSuffix}.jsonl`;

  const allRows: TrainingRow[] = [];
  let offset = 0;

  // Paginate through event_stream
  while (true) {
    const batch = await fetchBatch(supabase, offset, since);
    if (batch.length === 0) break;
    allRows.push(...batch);
    offset += batch.length;
    if (batch.length < BATCH_SIZE) break;
  }

  if (allRows.length === 0) {
    return {
      rows_exported: 0,
      storage_path: storagePath,
      started_at:   startedAt,
      completed_at: new Date().toISOString(),
    };
  }

  // Serialize to JSONL
  const jsonlContent = allRows.map(row => JSON.stringify(row)).join('\n');
  const blob = Buffer.from(jsonlContent, 'utf8');

  // Upload to 'vertex-training-data' bucket
  const { error: uploadErr } = await supabase.storage
    .from('vertex-training-data')
    .upload(storagePath, blob, {
      contentType: 'application/x-ndjson',
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`Storage upload failed: ${uploadErr.message}`);
  }

  const completedAt = new Date().toISOString();

  // Log to ingestion_run_log (fire-and-forget)
  void Promise.resolve(supabase.from('ingestion_run_log').insert({
    source_key: 'vertex-training-export',
    stage:      'export_complete',
    status:     'ok',
    message:    `Exported ${allRows.length} rows to ${storagePath}`,
    metadata:   {
      rows_exported: allRows.length,
      storage_path:  storagePath,
      since,
      duration_ms:   new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    },
  })).catch(() => {});

  return {
    rows_exported: allRows.length,
    storage_path:  storagePath,
    started_at:    startedAt,
    completed_at:  completedAt,
  };
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env['SUPABASE_URL'] ?? '';
  const serviceKey  = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const db = createClient(supabaseUrl, serviceKey) as SupabaseClient;
  runVertexTrainingExport(db)
    .then(result => {
      console.log('Export complete:', JSON.stringify(result, null, 2));
    })
    .catch((err: Error) => {
      console.error('[vertexTrainingExport]', err.message);
      process.exit(1);
    });
}
