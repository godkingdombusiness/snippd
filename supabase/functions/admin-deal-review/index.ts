/**
 * admin-deal-review — Deal review queue management for Snippd admin
 *
 * All endpoints require admin email in JWT claims.
 *
 * GET  /admin-deal-review/queue         — list pending review items
 * POST /admin-deal-review/approve       — approve an offer in review
 * POST /admin-deal-review/reject        — reject and block an offer
 * POST /admin-deal-review/escalate      — escalate to human senior review
 * POST /admin-deal-review/bulk-score    — re-score all pending offers now
 * GET  /admin-deal-review/stats         — dashboard stats
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
};

const ADMIN_EMAIL = 'ddavis@getsnippd.com';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url    = new URL(req.url);
  const action = url.pathname.split('/').pop();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ingestKey   = Deno.env.get('INGEST_API_KEY') ?? '';

  // Auth: admin JWT or ingest key
  const xKey  = req.headers.get('x-ingest-key') ?? '';
  const auth  = req.headers.get('authorization') ?? '';
  const isIngestKey = xKey === ingestKey && ingestKey !== '';

  if (!isIngestKey && !auth.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }

  // For non-ingest calls, verify admin email from JWT
  if (!isIngestKey) {
    const userDb = createClient(supabaseUrl, supabaseUrl, {
      global: { headers: { authorization: auth } },
    });
    const { data: { user } } = await userDb.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      return json({ error: 'admin only' }, 403);
    }
  }

  const db = createClient(supabaseUrl, serviceKey);
  const body: Record<string, unknown> = req.method !== 'GET'
    ? await req.json().catch(() => ({}))
    : {};

  // ── queue ──────────────────────────────────────────────────
  if (action === 'queue') {
    const { limit = 50, priority, trigger_reason } = body;

    let q = db
      .from('v_deal_review_dashboard')
      .select('*')
      .limit(Number(limit));

    if (priority) q = q.eq('priority', priority);
    if (trigger_reason) q = q.eq('trigger_reason', trigger_reason);

    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ items: data, count: data?.length ?? 0 });
  }

  // ── approve ────────────────────────────────────────────────
  if (action === 'approve') {
    const { review_id, offer_id, notes, with_caution = false } = body;
    if (!review_id || !offer_id) return json({ error: 'review_id and offer_id required' }, 400);

    const newStatus = with_caution ? 'approved_with_caution' : 'auto_approved';

    // Update review queue
    await db.from('deal_review_queue').update({
      review_status: 'approved',
      reviewed_by: ADMIN_EMAIL,
      reviewed_at: new Date().toISOString(),
      review_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', review_id);

    // Update offer_sources
    await db.from('offer_sources').update({
      validation_status: newStatus,
      user_badge: with_caution ? 'likely' : 'confirmed',
      published_at: new Date().toISOString(),
      auto_published: false,
      verified_by: ADMIN_EMAIL,
      last_verified_at: new Date().toISOString(),
    }).eq('id', offer_id);

    // Log validation event
    await db.from('validation_events').insert({
      offer_source_id: offer_id,
      event_type: 'approved',
      new_status: newStatus,
      actor_type: 'human',
      actor_id: ADMIN_EMAIL,
      notes,
    });

    return json({ approved: true, offer_id, status: newStatus });
  }

  // ── reject ─────────────────────────────────────────────────
  if (action === 'reject') {
    const { review_id, offer_id, notes, reason_codes } = body;
    if (!review_id || !offer_id) return json({ error: 'review_id and offer_id required' }, 400);

    await db.from('deal_review_queue').update({
      review_status: 'rejected',
      reviewed_by: ADMIN_EMAIL,
      reviewed_at: new Date().toISOString(),
      review_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', review_id);

    await db.from('offer_sources').update({
      validation_status: 'blocked',
      user_badge: 'needs_review',
      reason_codes: reason_codes ?? [],
      last_verified_at: new Date().toISOString(),
    }).eq('id', offer_id);

    await db.from('validation_events').insert({
      offer_source_id: offer_id,
      event_type: 'blocked',
      new_status: 'blocked',
      actor_type: 'human',
      actor_id: ADMIN_EMAIL,
      notes,
      reason_codes: reason_codes ?? [],
    });

    return json({ rejected: true, offer_id });
  }

  // ── escalate ───────────────────────────────────────────────
  if (action === 'escalate') {
    const { review_id, notes } = body;
    if (!review_id) return json({ error: 'review_id required' }, 400);

    await db.from('deal_review_queue').update({
      review_status: 'escalated',
      priority: 1,
      reviewed_by: ADMIN_EMAIL,
      review_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', review_id);

    return json({ escalated: true, review_id });
  }

  // ── bulk-score ─────────────────────────────────────────────
  if (action === 'bulk-score') {
    // Trigger the run-deal-scoring function
    const scoreUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/run-deal-scoring';
    const resp = await fetch(scoreUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ingest-key': Deno.env.get('INGEST_API_KEY') ?? '',
      },
      body: '{}',
    });
    const result = await resp.json().catch(() => ({}));
    return json({ triggered: true, scoring_result: result });
  }

  // ── stats ──────────────────────────────────────────────────
  if (action === 'stats') {
    const [queueStats, offerStats, feedbackStats] = await Promise.all([
      db.from('deal_review_queue')
        .select('review_status, priority')
        .then(({ data }) => {
          const rows = data ?? [];
          return {
            pending: rows.filter(r => r.review_status === 'pending').length,
            urgent: rows.filter(r => r.priority <= 2).length,
            total: rows.length,
          };
        }),
      db.from('offer_sources')
        .select('validation_status')
        .then(({ data }) => {
          const rows = data ?? [];
          return {
            total: rows.length,
            auto_approved: rows.filter(r => r.validation_status === 'auto_approved').length,
            with_caution: rows.filter(r => r.validation_status === 'approved_with_caution').length,
            needs_review: rows.filter(r => r.validation_status === 'needs_review').length,
            blocked: rows.filter(r => r.validation_status === 'blocked').length,
            pending: rows.filter(r => r.validation_status === 'pending').length,
          };
        }),
      db.from('user_deal_feedback')
        .select('outcome')
        .then(({ data }) => {
          const rows = data ?? [];
          const worked = rows.filter(r => r.outcome === 'worked').length;
          return {
            total: rows.length,
            worked,
            success_rate: rows.length > 0 ? Math.round(worked / rows.length * 100) : null,
          };
        }),
    ]);

    return json({
      review_queue:   queueStats,
      offer_sources:  offerStats,
      user_feedback:  feedbackStats,
    });
  }

  return json({ error: `unknown action: ${action}` }, 404);
});
