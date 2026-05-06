/**
 * price-tracker — Record price observations and detect volatility
 *
 * POST /price-tracker/observe   — log a new price observation
 * POST /price-tracker/volatility — compute volatility for offer
 * GET  /price-tracker/history   — price history for product/retailer
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url    = new URL(req.url);
  const action = url.pathname.split('/').pop();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ingestKey   = Deno.env.get('INGEST_API_KEY') ?? '';

  const xKey = req.headers.get('x-ingest-key') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (xKey !== ingestKey && !auth.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }

  const db = createClient(supabaseUrl, serviceKey);
  const body: Record<string, unknown> = req.method !== 'GET'
    ? await req.json().catch(() => ({}))
    : {};

  // ── observe ────────────────────────────────────────────────
  if (action === 'observe') {
    const {
      offer_source_id, retailer_key, normalized_key, product_name,
      observed_price_cents, store_id, zip_code, state, source_type, source_url,
      brand, size, regular_price_cents, sale_price_cents, coupon_value_cents,
      final_price_cents, observed_by = 'system',
    } = body;

    if (!retailer_key || !normalized_key || !product_name || !observed_price_cents) {
      return json({ error: 'retailer_key, normalized_key, product_name, observed_price_cents required' }, 400);
    }

    const { error } = await db.from('price_observations').insert({
      offer_source_id,
      retailer_key,
      normalized_key,
      product_name,
      brand,
      size,
      observed_price_cents,
      regular_price_cents,
      sale_price_cents,
      coupon_value_cents,
      final_price_cents,
      store_id,
      zip_code,
      state,
      source_type: source_type ?? 'system',
      source_url,
      observed_by,
    });

    if (error) return json({ error: error.message }, 500);

    // Immediately update offer_sources.latest_observed_price
    if (offer_source_id) {
      await db.from('offer_sources').update({
        latest_observed_price: observed_price_cents,
        price_at_recommendation: observed_price_cents,
        price_observed_at: new Date().toISOString(),
        price_source: source_type ?? 'system',
      }).eq('id', offer_source_id);

      // Recompute volatility async
      await db.rpc('compute_price_volatility', {
        p_offer_source_id: offer_source_id,
        p_window_days: 14,
      });
    }

    return json({ recorded: true });
  }

  // ── volatility ─────────────────────────────────────────────
  if (action === 'volatility') {
    const { offer_id, window_days = 14 } = body;
    if (!offer_id) return json({ error: 'offer_id required' }, 400);

    const { data, error } = await db.rpc('compute_price_volatility', {
      p_offer_source_id: offer_id,
      p_window_days: window_days,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ volatility_score: data });
  }

  // ── history ────────────────────────────────────────────────
  if (action === 'history') {
    const { normalized_key, retailer_key, limit = 30 } = body;
    if (!normalized_key || !retailer_key) {
      return json({ error: 'normalized_key and retailer_key required' }, 400);
    }

    const { data, error } = await db
      .from('v_offer_price_history')
      .select('*')
      .eq('normalized_key', normalized_key)
      .eq('retailer_key', retailer_key)
      .order('observed_at', { ascending: false })
      .limit(Number(limit));

    if (error) return json({ error: error.message }, 500);
    return json({ history: data });
  }

  return json({ error: `unknown action: ${action}` }, 404);
});
