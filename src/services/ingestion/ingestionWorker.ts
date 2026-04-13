/**
 * ingestionWorker — Scheduled worker that processes queued ingestion jobs
 *
 * Polls ingestion_jobs (status = 'queued'), runs parseFlyer → normalizeAndPublish,
 * then calls couponIngester to wire in digital coupons.
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx ts-node --project tsconfig.test.json src/services/ingestion/ingestionWorker.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { parseFlyer } from './flyerParser';
import { normalizeAndPublish } from './offerNormalizer';
import { ingestDigitalCoupons } from './couponIngester';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS   = 30 * 60 * 1000; // 30 minutes
const BATCH_SIZE         = 5;
const MAX_ATTEMPTS       = 3;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface IngestionJobRow {
  id: string;
  retailer_key: string;
  week_of: string;
  storage_path: string;
  status: string;
  attempts: number;
  error_message: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Single job processing
// ─────────────────────────────────────────────────────────────

async function processJob(job: IngestionJobRow, db: SupabaseClient): Promise<void> {
  const startedAt = new Date().toISOString();

  // Mark as 'processing' and increment attempts
  await db
    .from('ingestion_jobs')
    .update({ status: 'processing', attempts: job.attempts + 1, started_at: startedAt })
    .eq('id', job.id);

  let dealCount    = 0;
  let publishResult: { published: number; matched: number; candidates: number } | null = null;
  let couponResult: { coupons_processed: number; new_matches: number; candidates_updated: number } | null = null;

  try {
    // Step 1 — parse flyer PDF via Gemini Vision
    dealCount = await parseFlyer(job.id, db);

    // Step 2 — normalize + publish to offer_sources, stack_candidates
    publishResult = await normalizeAndPublish(job.id, db);

    // Step 3 — wire in digital coupons for this retailer × week
    couponResult = await ingestDigitalCoupons(job.retailer_key, job.week_of, db);

    // Mark job complete
    await db
      .from('ingestion_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', job.id);

    // Log success
    await db
      .from('ingestion_run_log')
      .insert({
        ingestion_id:     job.id,
        retailer_key:     job.retailer_key,
        week_of:          job.week_of,
        status:           'completed',
        deals_extracted:  dealCount,
        deals_published:  publishResult?.published ?? 0,
        coupons_matched:  (publishResult?.matched ?? 0) + (couponResult?.new_matches ?? 0),
        candidates_written: publishResult?.candidates ?? 0,
        started_at:       startedAt,
        completed_at:     new Date().toISOString(),
        error_message:    null,
      });

    console.log(
      `[ingestionWorker] Job ${job.id} completed:`,
      `deals=${dealCount}`,
      `published=${publishResult?.published}`,
      `candidates=${publishResult?.candidates}`,
      `coupon_matches=${couponResult?.new_matches}`,
    );
  } catch (err) {
    const errorMessage = (err as Error).message;
    const isFatal = job.attempts + 1 >= MAX_ATTEMPTS;

    await db
      .from('ingestion_jobs')
      .update({
        status:        isFatal ? 'failed' : 'queued',
        error_message: errorMessage,
        completed_at:  isFatal ? new Date().toISOString() : null,
      })
      .eq('id', job.id);

    await db
      .from('ingestion_run_log')
      .insert({
        ingestion_id:     job.id,
        retailer_key:     job.retailer_key,
        week_of:          job.week_of,
        status:           isFatal ? 'failed' : 'retryable',
        deals_extracted:  dealCount,
        deals_published:  publishResult?.published ?? 0,
        coupons_matched:  0,
        candidates_written: publishResult?.candidates ?? 0,
        started_at:       startedAt,
        completed_at:     new Date().toISOString(),
        error_message:    errorMessage,
      });

    console.error(`[ingestionWorker] Job ${job.id} ${isFatal ? 'FAILED' : 'error (will retry'}:`, errorMessage);
  }
}

// ─────────────────────────────────────────────────────────────
// Poll & process batch
// ─────────────────────────────────────────────────────────────

async function runBatch(db: SupabaseClient): Promise<void> {
  const { data: jobRows, error } = await db
    .from('ingestion_jobs')
    .select('id, retailer_key, week_of, storage_path, status, attempts, error_message, created_at')
    .eq('status', 'queued')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[ingestionWorker] Failed to poll ingestion_jobs:', error.message);
    return;
  }

  const jobs = (jobRows ?? []) as IngestionJobRow[];

  if (jobs.length === 0) {
    console.log(`[ingestionWorker] No queued jobs at ${new Date().toISOString()}`);
    return;
  }

  console.log(`[ingestionWorker] Processing ${jobs.length} job(s)...`);

  // Process sequentially to avoid storage/API rate limits
  for (const job of jobs) {
    await processJob(job, db);
  }
}

// ─────────────────────────────────────────────────────────────
// Worker loop
// ─────────────────────────────────────────────────────────────

export async function startIngestionWorker(db: SupabaseClient): Promise<void> {
  console.log(`[ingestionWorker] Starting — polling every ${POLL_INTERVAL_MS / 60000} minutes`);

  // Run immediately on start
  await runBatch(db);

  // Then repeat on interval
  setInterval(() => {
    runBatch(db).catch((e: Error) => {
      console.error('[ingestionWorker] Unhandled batch error:', e.message);
    });
  }, POLL_INTERVAL_MS);
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  const supabaseUrl = process.env['SUPABASE_URL'] ?? '';
  const serviceKey  = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const db = createClient(supabaseUrl, serviceKey);
  startIngestionWorker(db).catch((e: Error) => {
    console.error('[ingestionWorker] Fatal error:', e.message);
    process.exit(1);
  });
}
