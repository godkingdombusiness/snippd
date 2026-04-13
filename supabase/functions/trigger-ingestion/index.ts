/**
 * trigger-ingestion — Creates a new ingestion job
 *
 * POST /functions/v1/trigger-ingestion
 * Auth: service role key only (x-ingest-key header)
 *
 * Body: { retailer_key, week_of, storage_path }
 * Returns: { job_id, status }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Service-role auth only ───────────────────────────────────────
  // Accepts either x-ingest-key header or Authorization: Bearer <service_role_key>
  const ingestKey  = req.headers.get('x-ingest-key');
  const authHeader = req.headers.get('authorization');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const isAuthorized =
    (ingestKey && ingestKey === serviceKey) ||
    (authHeader?.startsWith('Bearer ') && authHeader.replace('Bearer ', '') === serviceKey);

  if (!isAuthorized) {
    return json({ error: 'Unauthorized — service role key required' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Parse request body ───────────────────────────────────────────
  let body: { retailer_key?: string; week_of?: string; storage_path?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { retailer_key, week_of, storage_path } = body;

  if (!retailer_key || !week_of || !storage_path) {
    return json({ error: 'retailer_key, week_of, and storage_path are required' }, 400);
  }

  // Validate week_of format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_of)) {
    return json({ error: 'week_of must be in YYYY-MM-DD format' }, 400);
  }

  // ── Create ingestion_jobs record ─────────────────────────────────
  const { data: jobRow, error: jobErr } = await supabase
    .from('ingestion_jobs')
    .insert({
      retailer_key,
      week_of,
      storage_path,
      status:   'queued',
      attempts: 0,
    })
    .select('id, retailer_key, week_of, storage_path, status, created_at')
    .single();

  if (jobErr || !jobRow) {
    console.error('[trigger-ingestion] Failed to create job:', jobErr?.message);
    return json({ error: `Failed to create ingestion job: ${jobErr?.message}` }, 500);
  }

  return json({
    status:       'ok',
    job_id:       (jobRow as { id: string }).id,
    retailer_key,
    week_of,
    storage_path,
    job_status:   'queued',
    created_at:   (jobRow as { created_at: string }).created_at,
  });
});
