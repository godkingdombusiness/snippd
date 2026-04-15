// ============================================================
// Snippd — Run Preference Updater (cron wrapper)
// supabase/functions/run-preference-updater/index.ts
//
// POST /functions/v1/run-preference-updater
// Auth: x-cron-secret header (pg_cron) OR service-role Bearer JWT
//
// Forwards the request to the preference-updater function and
// returns its result. Serves as the pg_cron entry point so the
// core preference-updater function can evolve independently.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? '';

  // ── Auth: x-cron-secret OR service-role Bearer ────────────
  const incomingCronSecret = req.headers.get('x-cron-secret') ?? '';
  const authHeader         = req.headers.get('authorization') ?? '';

  const isCronAuth    = cronSecret && incomingCronSecret === cronSecret;
  const isBearerAuth  = authHeader.startsWith('Bearer ');

  if (!isCronAuth && !isBearerAuth) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // If bearer, verify it's the service role key
  if (!isCronAuth && isBearerAuth) {
    const token = authHeader.replace('Bearer ', '');
    if (token !== serviceKey) {
      return json({ error: 'Forbidden' }, 403);
    }
  }

  const start = Date.now();

  try {
    // Forward to preference-updater with service-role auth
    const fnUrl = `${supabaseUrl}/functions/v1/preference-updater`;
    const resp  = await fetch(fnUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'x-cron-secret': cronSecret,
      },
      body: '{}',
    });

    const result = await resp.json();

    // Log to ingestion_run_log
    const db = createClient(supabaseUrl, serviceKey);
    await db.from('ingestion_run_log').insert({
      source_key: 'run-preference-updater',
      stage:      resp.ok ? 'success' : 'error',
      status:     String(resp.status),
      message:    resp.ok ? 'Preference update forwarded successfully' : `preference-updater returned ${resp.status}`,
      metadata:   { duration_ms: Date.now() - start, downstream_result: result },
    });

    return json({ ok: resp.ok, forwarded_to: 'preference-updater', result, duration_ms: Date.now() - start }, resp.status);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
