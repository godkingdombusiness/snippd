/**
 * deal-validator — Universal Deal Validation + Scoring Edge Function
 *
 * Endpoints:
 *   POST /deal-validator/validate   — run validate_offer() on one offer
 *   POST /deal-validator/publish    — run publish_gate() on one offer
 *   POST /deal-validator/feedback   — submit user deal feedback
 *   POST /deal-validator/market     — get market readiness for state/zip
 *   POST /deal-validator/batch      — validate a batch of offer_ids
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  // Resolve action from URL path segment (e.g. /deal-validator/feedback)
  // OR from body `action` field — supports both supabase.functions.invoke()
  // (which hits /functions/v1/deal-validator) and direct fetch with sub-path.
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const lastSegment  = pathSegments[pathSegments.length - 1];
  // If the last segment IS the function name (invoke() with no sub-path), read from body
  const KNOWN_ACTIONS = new Set(['validate','publish','feedback','market','batch','active-offers']);
  // We'll resolve action after parsing body below
  let action = KNOWN_ACTIONS.has(lastSegment) ? lastSegment : null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ingestKey   = Deno.env.get('INGEST_API_KEY') ?? '';

  // Auth: accept Bearer JWT or x-ingest-key
  const authHeader = req.headers.get('authorization') ?? '';
  const xKey       = req.headers.get('x-ingest-key') ?? '';

  const isSystemCall  = xKey === ingestKey && ingestKey !== '';
  const isBearerCall  = authHeader.startsWith('Bearer ');

  if (!isSystemCall && !isBearerCall) return err('unauthorized', 401);

  const db = createClient(supabaseUrl, serviceKey);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* no body required for some endpoints */ }

  // Resolve action from body if URL path didn't give a known action
  // (supabase.functions.invoke sends body.action or body._action)
  if (!action) {
    const bodyAction = (body.action ?? body._action ?? '') as string;
    action = KNOWN_ACTIONS.has(bodyAction) ? bodyAction : null;
  }

  // ── validate ───────────────────────────────────────────────
  if (action === 'validate') {
    const { offer_id } = body;
    if (!offer_id) return err('offer_id required');

    const { data, error } = await db.rpc('validate_offer', {
      p_offer_source_id: offer_id,
    });
    if (error) return err(error.message, 500);
    return json(data);
  }

  // ── publish ────────────────────────────────────────────────
  if (action === 'publish') {
    const { offer_id } = body;
    if (!offer_id) return err('offer_id required');

    const { data, error } = await db.rpc('publish_gate', {
      p_offer_source_id: offer_id,
    });
    if (error) return err(error.message, 500);
    return json(data);
  }

  // ── feedback ───────────────────────────────────────────────
  if (action === 'feedback') {
    const {
      user_id, offer_id, outcome,
      actual_cents, predicted_cents,
      store_id, zip_code, state, notes,
    } = body;

    if (!user_id || !offer_id || !outcome) {
      return err('user_id, offer_id, outcome required');
    }

    const validOutcomes = [
      'worked', 'coupon_failed', 'out_of_stock', 'wrong_price',
      'substituted', 'quantity_not_met', 'exclusion_hit', 'register_rejected',
    ];
    if (!validOutcomes.includes(outcome as string)) {
      return err(`outcome must be one of: ${validOutcomes.join(', ')}`);
    }

    const { data, error } = await db.rpc('process_deal_feedback', {
      p_user_id:         user_id,
      p_offer_source_id: offer_id,
      p_outcome:         outcome,
      p_actual_cents:    actual_cents   ?? null,
      p_predicted_cents: predicted_cents ?? null,
      p_store_id:        store_id       ?? null,
      p_zip_code:        zip_code       ?? null,
      p_state:           state          ?? null,
      p_notes:           notes          ?? null,
    });
    if (error) return err(error.message, 500);
    return json(data);
  }

  // ── market ─────────────────────────────────────────────────
  if (action === 'market') {
    const { state, zip_code, retailer } = body;
    if (!state) return err('state required');

    const { data, error } = await db.rpc('compute_market_readiness', {
      p_state:    state,
      p_zip_code: zip_code  ?? null,
      p_retailer: retailer  ?? null,
    });
    if (error) return err(error.message, 500);
    return json(data);
  }

  // ── batch ──────────────────────────────────────────────────
  if (action === 'batch') {
    const { offer_ids } = body;
    if (!Array.isArray(offer_ids) || offer_ids.length === 0) {
      return err('offer_ids array required');
    }
    if (offer_ids.length > 100) {
      return err('batch max 100 offers per call');
    }

    const results: unknown[] = [];
    for (const offer_id of offer_ids) {
      const { data, error } = await db.rpc('publish_gate', {
        p_offer_source_id: offer_id,
      });
      results.push(error
        ? { offer_id, error: error.message }
        : { offer_id, ...data }
      );
    }
    return json({ processed: results.length, results });
  }

  // ── active-offers (read) ───────────────────────────────────
  if (action === 'active-offers') {
    const {
      state, zip_code, retailer_key,
      min_confidence = 0, limit = 50, offset = 0,
    } = body;

    let q = db
      .from('v_active_offers')
      .select('*')
      .gte('confidence_pct', min_confidence)
      .order('confidence_pct', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (state)        q = q.or(`state.eq.${state},offer_scope.eq.national`);
    if (retailer_key) q = q.eq('retailer_key', retailer_key);

    const { data, error } = await q;
    if (error) return err(error.message, 500);
    return json({ offers: data, count: data?.length ?? 0 });
  }

  return err(`unknown action: ${action}`, 404);
});
