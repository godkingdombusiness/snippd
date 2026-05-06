// ============================================================
// Snippd — reflexion-agent (Self-Healing Reflexion Loop)
// supabase/functions/reflexion-agent/index.ts
//
// POST /functions/v1/reflexion-agent
// Auth: x-ingest-key (server-to-server, triggered by pg_cron or webhook)
//
// Architecture: Reflexion Pattern
//   1. Scan healing_events for unanalyzed critical/warning events (last 24h)
//   2. Group by check_name to detect chronic patterns (≥2 failures)
//   3. For each chronic pattern: call Gemini to analyze + recommend a fix
//   4. Apply automated fixes where safe (retailer_coverage, user_persona prefs)
//   5. Mark analyzed events in healing_events.reflexion_analyzed = true
//   6. Insert a REFLEXION_OUTCOME healing event recording what was done
//
// This gives the system a feedback loop:
//   Failure → Log → Reflexion Agent → Gemini Analysis → Auto-fix → Re-check
//
// Triggered by:
//   - pg_cron: every 6 hours (scheduled in dashboard)
//   - Webhook: on-demand from AdminPulseScreen or FounderDashboard
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INGEST_KEY         = Deno.env.get('INGEST_KEY') ?? '';
const GEMINI_API_KEY     = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL       = 'gemini-1.5-flash';  // fast, cheap for structured analysis

interface HealingEvent {
  id:          string;
  user_id:     string | null;
  session_id:  string;
  check_name:  string;
  status:      string;
  issue:       string | null;
  heal_action: string | null;
  healed:      boolean;
  duration_ms: number;
  app_version: string;
  created_at:  string;
}

interface ChronicPattern {
  check_name:     string;
  failure_count:  number;
  unhealed_count: number;
  issues:         string[];
  event_ids:      string[];
  user_ids:       string[];
}

// ── Gemini call ───────────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    console.warn('[reflexion-agent] GEMINI_API_KEY not set — skipping AI analysis');
    return 'GEMINI_KEY_MISSING';
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature:     0.2,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[reflexion-agent] Gemini error:', err);
    return 'GEMINI_ERROR';
  }

  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'GEMINI_EMPTY';
}

// ── Build analysis prompt ────────────────────────────────────────────────────

function buildAnalysisPrompt(pattern: ChronicPattern): string {
  return `You are a systems reliability engineer analyzing a self-healing app.

Check name: "${pattern.check_name}"
Failure count (last 24h): ${pattern.failure_count}
Unhealed failures: ${pattern.unhealed_count}
Distinct users affected: ${[...new Set(pattern.user_ids)].length}
Sample issues:
${pattern.issues.slice(0, 5).map((i, idx) => `  ${idx + 1}. ${i}`).join('\n')}

Respond ONLY with valid JSON in this exact shape:
{
  "root_cause": "one sentence",
  "severity": "low" | "medium" | "high" | "critical",
  "auto_fix_safe": true | false,
  "auto_fix_action": "none" | "flag_retailer_coverage" | "update_user_preference" | "clear_stale_cache" | "notify_admin",
  "auto_fix_params": {},
  "user_message": "one sentence shown to affected users (or null)",
  "notes": "any additional context (or null)"
}`;
}

// ── Apply automated fix ───────────────────────────────────────────────────────

async function applyFix(
  db: ReturnType<typeof createClient>,
  pattern: ChronicPattern,
  fix: {
    auto_fix_safe:   boolean;
    auto_fix_action: string;
    auto_fix_params: Record<string, unknown>;
    severity:        string;
    user_message:    string | null;
    notes:           string | null;
    root_cause:      string;
  },
): Promise<string> {
  if (!fix.auto_fix_safe) return 'fix_not_safe_skipped';

  switch (fix.auto_fix_action) {
    case 'flag_retailer_coverage': {
      // Mark the relevant retailer as needing review in retailer_coverage
      const retailerKey = fix.auto_fix_params?.retailer_key as string | undefined;
      if (!retailerKey) return 'no_retailer_key';
      const { error } = await db
        .from('retailer_coverage')
        .update({ market_readiness_score: 0, notes: `Auto-flagged by reflexion-agent: ${fix.root_cause}` })
        .eq('retailer_key', retailerKey);
      return error ? `flag_retailer_failed: ${error.message}` : `flagged_retailer:${retailerKey}`;
    }

    case 'update_user_preference': {
      // Update a preference key for all affected users
      const prefKey   = fix.auto_fix_params?.pref_key   as string | undefined;
      const prefValue = fix.auto_fix_params?.pref_value as unknown;
      if (!prefKey || prefValue === undefined) return 'no_pref_params';

      const affectedUsers = [...new Set(pattern.user_ids.filter(Boolean))];
      let successCount = 0;
      for (const uid of affectedUsers) {
        const { data: prof } = await db
          .from('profiles')
          .select('preferences')
          .eq('user_id', uid)
          .maybeSingle();
        if (!prof) continue;
        const prefs = typeof prof.preferences === 'object' ? prof.preferences : {};
        const { error } = await db
          .from('profiles')
          .update({ preferences: { ...prefs, [prefKey]: prefValue } })
          .eq('user_id', uid);
        if (!error) successCount++;
      }
      return `updated_user_prefs:${prefKey}:${successCount}/${affectedUsers.length}`;
    }

    case 'notify_admin': {
      // Insert a high-priority healing event that will surface in AdminPulseScreen
      await db.from('healing_events').insert({
        user_id:     null,
        session_id:  `reflexion-${Date.now()}`,
        check_name:  'REFLEXION_ADMIN_ALERT',
        status:      fix.severity === 'critical' ? 'critical' : 'warning',
        issue:       `Chronic pattern detected: ${pattern.check_name} — ${fix.root_cause}`,
        healed:      false,
        heal_action: fix.notes ?? null,
        duration_ms: 0,
        app_version: 'reflexion-agent',
      });
      return 'admin_notified';
    }

    case 'clear_stale_cache': {
      // Clear home_payload_cache for affected users
      const affectedUsers = [...new Set(pattern.user_ids.filter(Boolean))];
      if (affectedUsers.length === 0) return 'no_users_to_clear';
      const { error } = await db
        .from('home_payload_cache')
        .delete()
        .in('user_id', affectedUsers);
      return error ? `cache_clear_failed: ${error.message}` : `cleared_cache:${affectedUsers.length}`;
    }

    default:
      return 'no_action_taken';
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Auth — server-to-server ingest key
  const ingestKey = req.headers.get('x-ingest-key');
  if (!INGEST_KEY || ingestKey !== INGEST_KEY) {
    return json({ error: 'unauthorized' }, 401);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const startTime = Date.now();

  // ── 1. Load unanalyzed critical/warning events from last 24h ─────────────
  const { data: events, error: eventsErr } = await db
    .from('healing_events')
    .select('id, user_id, session_id, check_name, status, issue, heal_action, healed, duration_ms, app_version, created_at')
    .in('status', ['critical', 'warning'])
    .eq('reflexion_analyzed', false)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(500);

  if (eventsErr) {
    console.error('[reflexion-agent] events query error:', eventsErr.message);
    return json({ error: 'events_query_failed', detail: eventsErr.message }, 500);
  }

  const healingEvents = (events ?? []) as HealingEvent[];

  if (healingEvents.length === 0) {
    return json({ ok: true, patterns_analyzed: 0, message: 'no_unanalyzed_events', elapsed_ms: Date.now() - startTime });
  }

  // ── 2. Group into chronic patterns (≥2 failures of same check_name) ───────
  const grouped = new Map<string, ChronicPattern>();
  for (const ev of healingEvents) {
    const existing = grouped.get(ev.check_name);
    if (existing) {
      existing.failure_count++;
      if (!ev.healed) existing.unhealed_count++;
      if (ev.issue) existing.issues.push(ev.issue);
      existing.event_ids.push(ev.id);
      if (ev.user_id) existing.user_ids.push(ev.user_id);
    } else {
      grouped.set(ev.check_name, {
        check_name:    ev.check_name,
        failure_count: 1,
        unhealed_count: ev.healed ? 0 : 1,
        issues:        ev.issue ? [ev.issue] : [],
        event_ids:     [ev.id],
        user_ids:      ev.user_id ? [ev.user_id] : [],
      });
    }
  }

  // Only analyze patterns with ≥2 failures (filter out one-off glitches)
  const chronicPatterns = [...grouped.values()].filter(p => p.failure_count >= 2);

  const outcomes: Array<{ check_name: string; analysis: unknown; fix_result: string }> = [];

  // ── 3. Analyze each pattern via Gemini ───────────────────────────────────
  for (const pattern of chronicPatterns) {
    let fixResult = 'skipped';
    let parsedAnalysis: Record<string, unknown> = {};

    try {
      const prompt    = buildAnalysisPrompt(pattern);
      const raw       = await callGemini(prompt);

      if (raw !== 'GEMINI_KEY_MISSING' && raw !== 'GEMINI_ERROR' && raw !== 'GEMINI_EMPTY') {
        parsedAnalysis = JSON.parse(raw);
        // ── 4. Apply fix ────────────────────────────────────────────────────
        fixResult = await applyFix(db, pattern, parsedAnalysis as Parameters<typeof applyFix>[2]);
      } else {
        parsedAnalysis = { error: raw };
        fixResult = raw;
      }
    } catch (err) {
      console.error('[reflexion-agent] analysis error for', pattern.check_name, err);
      parsedAnalysis = { error: String(err) };
      fixResult = 'analysis_error';
    }

    outcomes.push({ check_name: pattern.check_name, analysis: parsedAnalysis, fix_result: fixResult });

    // ── 5. Mark events as analyzed ──────────────────────────────────────────
    await db
      .from('healing_events')
      .update({
        reflexion_analyzed: true,
        reflexion_at:       new Date().toISOString(),
        reflexion_notes:    JSON.stringify({
          root_cause: (parsedAnalysis as Record<string, unknown>).root_cause ?? 'unknown',
          fix_result: fixResult,
        }),
      })
      .in('id', pattern.event_ids);

    // ── 6. Insert REFLEXION_OUTCOME log entry ────────────────────────────────
    await db.from('healing_events').insert({
      user_id:     null,
      session_id:  `reflexion-${Date.now()}-${pattern.check_name}`,
      check_name:  'REFLEXION_OUTCOME',
      status:      (parsedAnalysis as Record<string, unknown>).severity === 'critical' ? 'critical' : 'ok',
      issue:       null,
      healed:      true,
      heal_action: JSON.stringify({
        pattern:    pattern.check_name,
        failures:   pattern.failure_count,
        fix_result: fixResult,
        analysis:   parsedAnalysis,
      }),
      duration_ms: Date.now() - startTime,
      app_version: 'reflexion-agent-v1',
    });
  }

  return json({
    ok:                 true,
    events_scanned:     healingEvents.length,
    patterns_found:     grouped.size,
    patterns_analyzed:  chronicPatterns.length,
    outcomes,
    elapsed_ms:         Date.now() - startTime,
  });
});
