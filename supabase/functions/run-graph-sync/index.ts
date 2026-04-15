// ============================================================
// Snippd — Run Graph Sync (cron wrapper)
// supabase/functions/run-graph-sync/index.ts
//
// POST /functions/v1/run-graph-sync
// Auth: x-cron-secret header (pg_cron) OR service-role Bearer JWT
//
// Triggers the nightly-graph-sync GitHub Actions workflow via
// the GitHub API workflow_dispatch event. The Neo4j graph sync
// must run in Node.js (neo4j-driver is CommonJS, not Deno-
// compatible), so this is the correct architecture bridge.
//
// Required env vars (supabase secrets set ...):
//   CRON_SECRET        — shared secret for pg_cron auth
//   GITHUB_PAT         — GitHub Personal Access Token with
//                        repo:actions:write scope
//   GITHUB_OWNER       — GitHub username or org (e.g. "snippd-app")
//   GITHUB_REPO        — Repository name (e.g. "snippd")
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
  const githubPat   = Deno.env.get('GITHUB_PAT')   ?? '';
  const githubOwner = Deno.env.get('GITHUB_OWNER') ?? '';
  const githubRepo  = Deno.env.get('GITHUB_REPO')  ?? '';

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

  // ── Validate config ────────────────────────────────────────
  if (!githubPat || !githubOwner || !githubRepo) {
    return json({
      error: 'Missing GitHub config. Set GITHUB_PAT, GITHUB_OWNER, GITHUB_REPO via supabase secrets set.',
    }, 500);
  }

  const start = Date.now();
  const db    = createClient(supabaseUrl, serviceKey);

  // Read optional inputs from request body
  let skipCoOccurrences = 'false';
  let skipCohort        = 'false';
  try {
    const body = await req.json();
    skipCoOccurrences = body?.skip_co_occurrences === true ? 'true' : 'false';
    skipCohort        = body?.skip_cohort        === true ? 'true' : 'false';
  } catch { /* body is optional */ }

  try {
    // Trigger GitHub Actions workflow_dispatch
    const dispatchUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/nightly-graph-sync.yml/dispatches`;

    const ghResp = await fetch(dispatchUrl, {
      method:  'POST',
      headers: {
        'Accept':               'application/vnd.github+json',
        'Authorization':        `Bearer ${githubPat}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type':         'application/json',
      },
      body: JSON.stringify({
        ref: 'master',
        inputs: {
          skip_co_occurrences: skipCoOccurrences,
          skip_cohort:         skipCohort,
        },
      }),
    });

    const ok = ghResp.status === 204; // GitHub returns 204 No Content on success

    await db.from('ingestion_run_log').insert({
      source_key: 'run-graph-sync',
      stage:      ok ? 'success' : 'error',
      status:     String(ghResp.status),
      message:    ok
        ? 'GitHub Actions nightly-graph-sync dispatched'
        : `GitHub API returned ${ghResp.status}`,
      metadata: {
        duration_ms:        Date.now() - start,
        workflow:           'nightly-graph-sync.yml',
        skip_co_occurrences: skipCoOccurrences,
        skip_cohort:         skipCohort,
      },
    });

    if (!ok) {
      let ghError = '';
      try { ghError = await ghResp.text(); } catch { /* ignore */ }
      return json({ ok: false, github_status: ghResp.status, error: ghError }, 502);
    }

    return json({
      ok:               true,
      workflow:         'nightly-graph-sync.yml',
      duration_ms:      Date.now() - start,
    });
  } catch (e) {
    await db.from('ingestion_run_log').insert({
      source_key: 'run-graph-sync',
      stage:      'error',
      status:     '500',
      message:    String(e),
      metadata:   { duration_ms: Date.now() - start },
    }).catch(() => { /* best effort */ });

    return json({ error: String(e) }, 500);
  }
});
