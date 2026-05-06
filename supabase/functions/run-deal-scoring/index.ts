/**
 * run-deal-scoring — Batch confidence scoring for all pending offers
 *
 * Called by pg_cron daily (or triggered manually).
 * Runs validate_offer() on every offer in 'pending' or 'needs_review' status.
 * Also flags stale prices and expired offers.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ingestKey   = Deno.env.get('INGEST_API_KEY') ?? '';

  const xKey = req.headers.get('x-ingest-key') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (xKey !== ingestKey && !auth.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const db = createClient(supabaseUrl, serviceKey);
  const started = Date.now();

  // Step 1: Flag stale prices and expired offers
  const { error: flagErr } = await db.rpc('flag_stale_prices');
  if (flagErr) console.error('flag_stale_prices error:', flagErr.message);

  // Step 2: Fetch all offers needing validation (pending or needs_review, not expired)
  const { data: offers, error: fetchErr } = await db
    .from('offer_sources')
    .select('id')
    .in('validation_status', ['pending', 'needs_review'])
    .or('expires_on.is.null,expires_on.gte.' + new Date().toISOString().split('T')[0])
    .limit(500);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const offerIds = (offers ?? []).map((o: { id: string }) => o.id);
  let scored = 0;
  let errors = 0;

  // Step 3: Run publish_gate on each (validates + scores + publishes if eligible)
  for (const id of offerIds) {
    const { error } = await db.rpc('publish_gate', { p_offer_source_id: id });
    if (error) { errors++; } else { scored++; }

    // Yield every 50 to avoid timeout
    if (scored % 50 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  const elapsed = Date.now() - started;

  return new Response(JSON.stringify({
    success: true,
    offers_processed: offerIds.length,
    scored,
    errors,
    elapsed_ms: elapsed,
  }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
