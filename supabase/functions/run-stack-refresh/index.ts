/**
 * run-stack-refresh — daily stack refresh cron target
 *
 * Called at 7:15 AM EDT by the daily-stack-refresh pg_cron job.
 * 1. Calls refresh_app_home_feed() to verify math, generate instructions,
 *    upsert qualifying stacks (confidence ≥ 80) to app_home_feed, and expire stale items.
 * 2. Returns {published, skipped, errors} JSON for logging.
 *
 * Auth: x-ingest-key header (INGEST_API_KEY env secret).
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ingestKey = Deno.env.get('INGEST_API_KEY') ?? '';
  const xKey      = req.headers.get('x-ingest-key') ?? '';

  if (!ingestKey || xKey !== ingestKey) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db          = createClient(supabaseUrl, serviceKey);

  const startedAt = new Date().toISOString();

  const { data, error } = await db.rpc('refresh_app_home_feed');

  if (error) {
    console.error('[run-stack-refresh] refresh_app_home_feed error:', error.message);
    return json({ ok: false, error: error.message, started_at: startedAt }, 500);
  }

  const result = data as { published: number; skipped: number; errors: number } | null;

  return json({
    ok:          true,
    published:   result?.published  ?? 0,
    skipped:     result?.skipped    ?? 0,
    errors:      result?.errors     ?? 0,
    started_at:  startedAt,
    finished_at: new Date().toISOString(),
  });
});
