// ============================================================
// Snippd — Health Check Endpoint
// supabase/functions/health/index.ts
//
// GET /functions/v1/health
// No auth required. Returns system status and version.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  const start = Date.now();

  // ── Read version from app_config ─────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(supabaseUrl, serviceKey);

  const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};

  // Check 1: Database connectivity
  const dbStart = Date.now();
  try {
    const { error } = await db.from('app_config').select('key').limit(1);
    checks.database = { ok: !error, latency_ms: Date.now() - dbStart };
    if (error) checks.database.error = error.message;
  } catch (e) {
    checks.database = { ok: false, latency_ms: Date.now() - dbStart, error: String(e) };
  }

  // Check 2: event_weight_config populated
  const ewStart = Date.now();
  try {
    const { data, error } = await db.from('event_weight_config').select('event_name').limit(1);
    checks.event_weights = {
      ok: !error && (data?.length ?? 0) > 0,
      latency_ms: Date.now() - ewStart,
    };
    if (error) checks.event_weights.error = error.message;
  } catch (e) {
    checks.event_weights = { ok: false, latency_ms: Date.now() - ewStart, error: String(e) };
  }

  // Read version
  let version = 'unknown';
  try {
    const { data } = await db
      .from('app_config')
      .select('value')
      .eq('key', 'app_version')
      .maybeSingle();
    if (data?.value) {
      version = String(data.value).replace(/^"|"$/g, '');
    }
  } catch { /* version stays unknown */ }

  const allOk = Object.values(checks).every((c) => c.ok);

  return json({
    status:    allOk ? 'ok' : 'degraded',
    version,
    checks,
    timestamp: new Date().toISOString(),
    latency_ms: Date.now() - start,
  }, allOk ? 200 : 503);
});
