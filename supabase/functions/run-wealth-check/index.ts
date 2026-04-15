// ============================================================
// Snippd — Run Wealth Check (cron wrapper)
// supabase/functions/run-wealth-check/index.ts
//
// POST /functions/v1/run-wealth-check
// Auth: x-cron-secret header (pg_cron) OR service-role Bearer JWT
//
// Scans wealth_momentum_snapshots for users whose velocity_score
// has dropped more than 20% week-over-week (wealth attrition).
// Logs a summary to ingestion_run_log for monitoring.
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

interface SnapshotRow {
  user_id:         string;
  velocity_score:  number | null;
  realized_savings: number | null;
  timestamp:       string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? '';

  // ── Auth ───────────────────────────────────────────────────
  const incomingCronSecret = req.headers.get('x-cron-secret') ?? '';
  const authHeader         = req.headers.get('authorization') ?? '';

  const isCronAuth   = cronSecret && incomingCronSecret === cronSecret;
  const isBearerAuth = authHeader.startsWith('Bearer ');

  if (!isCronAuth && !isBearerAuth) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!isCronAuth && isBearerAuth) {
    const token = authHeader.replace('Bearer ', '');
    if (token !== serviceKey) return json({ error: 'Forbidden' }, 403);
  }

  const start = Date.now();
  const db    = createClient(supabaseUrl, serviceKey);

  try {
    const now       = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Fetch snapshots from the last 7 days (most recent per user)
    const { data: recentSnaps, error: recentErr } = await db
      .from('wealth_momentum_snapshots')
      .select('user_id, velocity_score, realized_savings, timestamp')
      .gte('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp', { ascending: false });

    if (recentErr) throw new Error(`Recent snapshots query failed: ${recentErr.message}`);

    const recentByUser = new Map<string, SnapshotRow>();
    for (const row of (recentSnaps ?? []) as SnapshotRow[]) {
      if (!recentByUser.has(row.user_id)) {
        recentByUser.set(row.user_id, row);
      }
    }

    if (recentByUser.size === 0) {
      await db.from('ingestion_run_log').insert({
        source_key: 'run-wealth-check',
        stage:      'success',
        status:     '200',
        message:    'No recent snapshots found — skipping attrition check',
        metadata:   { duration_ms: Date.now() - start, users_checked: 0, attrition_count: 0 },
      });
      return json({ ok: true, users_checked: 0, attrition_count: 0, duration_ms: Date.now() - start });
    }

    const userIds = Array.from(recentByUser.keys());

    // Fetch baseline snapshots (7-14 days ago) for the same users
    const { data: baseSnaps, error: baseErr } = await db
      .from('wealth_momentum_snapshots')
      .select('user_id, velocity_score, realized_savings, timestamp')
      .in('user_id', userIds)
      .gte('timestamp', fourteenDaysAgo.toISOString())
      .lt('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp', { ascending: false });

    if (baseErr) throw new Error(`Baseline snapshots query failed: ${baseErr.message}`);

    const baseByUser = new Map<string, SnapshotRow>();
    for (const row of (baseSnaps ?? []) as SnapshotRow[]) {
      if (!baseByUser.has(row.user_id)) {
        baseByUser.set(row.user_id, row);
      }
    }

    // Detect attrition: velocity_score dropped > 20%
    const attritionUsers: Array<{
      user_id: string;
      current_velocity: number;
      baseline_velocity: number;
      drop_pct: number;
    }> = [];

    for (const [userId, current] of recentByUser) {
      const baseline = baseByUser.get(userId);
      if (!baseline) continue;

      const currentV  = current.velocity_score  ?? 0;
      const baselineV = baseline.velocity_score ?? 0;

      if (baselineV > 0 && currentV < baselineV * 0.8) {
        attritionUsers.push({
          user_id:           userId,
          current_velocity:  currentV,
          baseline_velocity: baselineV,
          drop_pct:          Math.round((1 - currentV / baselineV) * 100),
        });
      }
    }

    await db.from('ingestion_run_log').insert({
      source_key: 'run-wealth-check',
      stage:      'success',
      status:     '200',
      message:    `Wealth check complete: ${attritionUsers.length} users with attrition out of ${recentByUser.size} checked`,
      metadata:   {
        duration_ms:     Date.now() - start,
        users_checked:   recentByUser.size,
        attrition_count: attritionUsers.length,
        attrition_users: attritionUsers.slice(0, 20), // Log up to 20 for review
      },
    });

    return json({
      ok:              true,
      users_checked:   recentByUser.size,
      attrition_count: attritionUsers.length,
      attrition_users: attritionUsers,
      duration_ms:     Date.now() - start,
    });
  } catch (e) {
    await db.from('ingestion_run_log').insert({
      source_key: 'run-wealth-check',
      stage:      'error',
      status:     '500',
      message:    String(e),
      metadata:   { duration_ms: Date.now() - start },
    }).catch(() => { /* best effort */ });

    return json({ error: String(e) }, 500);
  }
});
