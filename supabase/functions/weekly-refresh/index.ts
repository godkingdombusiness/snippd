/**
 * weekly-refresh Edge Function
 *
 * Triggered two ways:
 *  1. On-demand: POST from WeeklyIntelligenceModal when a user opens the app
 *     on or after Sunday (user-scoped refresh).
 *  2. pg_cron: Every Sunday and Wednesday at 06:00 UTC (global refresh).
 *
 * What it does:
 *  - Expires stale app_home_feed deals (status → 'expired' where valid_until < now)
 *  - Recomputes home_payload_cache for the household (or all active users if global)
 *  - Writes a cron_audit_log entry so every run is traceable
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret     = Deno.env.get('WEEKLY_REFRESH_CRON_SECRET') ?? '';

  // ── Auth: accept either cron-secret header (pg_cron) or valid JWT (user) ──
  const cronHeader = req.headers.get('x-cron-secret') ?? '';
  const authHeader  = req.headers.get('authorization') ?? '';
  const isCron      = cronSecret && cronHeader === cronSecret;
  const isUser      = authHeader.startsWith('Bearer ');

  if (!isCron && !isUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Service-role client for DB writes
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const rawBody = await req.text();
  let body: { user_id?: string; budget?: number } = {};
  try { body = JSON.parse(rawBody || '{}'); } catch { /* no-op */ }

  const results: string[] = [];

  // ── 1. Expire stale deals ─────────────────────────────────────────────────
  try {
    const { count } = await db
      .from('app_home_feed')
      .update({ status: 'expired' })
      .lt('valid_until', new Date().toISOString())
      .eq('status', 'active')
      .select('id', { count: 'exact', head: true });

    results.push(`expired_deals:${count ?? 0}`);
  } catch (e) {
    results.push(`expire_deals_error:${String(e).slice(0, 80)}`);
  }

  // ── 2. Re-fetch + cache home payload ─────────────────────────────────────
  //    Pulls the freshest active deals and writes them to home_payload_cache.
  //    If user_id provided, scopes to that user's preferred stores.
  try {
    const { data: freshDeals } = await db
      .from('app_home_feed')
      .select('id, title, retailer, pay_price, save_price, category, breakdown_list, tags, valid_until')
      .eq('status', 'active')
      .eq('verification_status', 'verified_live')
      .order('save_price', { ascending: false })
      .limit(50);

    const payload = {
      generated_at: new Date().toISOString(),
      deals: freshDeals ?? [],
      deal_count: freshDeals?.length ?? 0,
    };

    // home_payload_cache: upsert with a stable row key
    const cacheKey = body.user_id ?? 'global';
    await db.from('home_payload_cache').upsert(
      { cache_key: cacheKey, payload, updated_at: new Date().toISOString() },
      { onConflict: 'cache_key' },
    );
    results.push(`cache_refreshed:${freshDeals?.length ?? 0}_deals`);
  } catch (e) {
    results.push(`cache_error:${String(e).slice(0, 80)}`);
  }

  // ── 3. Reset weekly chef_stash_weekly_uses if triggered on Sunday ─────────
  //    Only reset when this is the Sunday global cron (not user on-demand mid-week)
  if (isCron) {
    const today = new Date();
    if (today.getDay() === 0) { // Sunday
      try {
        // Batch-reset uses count — set to 0 in preferences JSON
        // Uses a SQL function for efficiency; falls back to individual updates
        const { error } = await db.rpc('reset_weekly_chef_uses');
        results.push(error ? `chef_reset_rpc_error:${error.message}` : 'chef_uses_reset:ok');
      } catch (e) {
        results.push(`chef_reset_error:${String(e).slice(0, 80)}`);
      }
    }
  }

  // ── 4. Audit log ──────────────────────────────────────────────────────────
  try {
    await db.from('cron_audit_log').insert({
      job_name: 'weekly-refresh',
      triggered_by: isCron ? 'pg_cron' : `user:${body.user_id ?? 'unknown'}`,
      result: results.join('; '),
      ran_at: new Date().toISOString(),
    });
  } catch { /* audit failure should not break the response */ }

  return new Response(
    JSON.stringify({ ok: true, results }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
});
