import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { WealthEngine } from '../../../services/WealthEngine.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const jwt = authHeader.slice(7);
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: authError } = await db.auth.getUser(jwt);
  if (authError || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const userId = userData.user.id;

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('stack_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ stack_results: data });
  }

  const rawBody = await req.text();
  let body: Record<string, unknown> = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const offerMatchId = asString(body.offer_match_id);
  const retailerKey = asString(body.retailer_key);
  const modelVersion = asString(body.model_version) ?? 'wealth-v1';
  const candidates = asArray(body.candidates);
  const budgetCents = asNumber(body.budget_cents);

  let matchRow: Record<string, unknown> | null = null;
  if (offerMatchId) {
    const { data, error } = await db
      .from('offer_matches')
      .select('retailer_key, candidates, budget_cents')
      .eq('id', offerMatchId)
      .single();

    if (error || !data) {
      return json({ error: 'Offer match not found' }, 404);
    }
    matchRow = data;
  }

  if (!matchRow && (!candidates.length || !retailerKey)) {
    return json({ error: 'Missing offer_match_id or inline candidates and retailer_key' }, 400);
  }

  const effectiveRetailer = asString(matchRow?.retailer_key) || retailerKey!;
  const offerCandidates = matchRow ? asArray(matchRow.candidates) : candidates;
  const effectiveBudget = budgetCents ?? asNumber(matchRow?.budget_cents) ?? 0;

  const { data: preferenceRows, error: prefError } = await db
    .from('user_preference_scores')
    .select('preference_key, category, brand, retailer_key, score')
    .eq('user_id', userId);
  if (prefError) {
    return json({ error: prefError.message }, 500);
  }

  const { data: policyRows, error: policyError } = await db
    .from('retailer_coupon_parameters')
    .select('retailer_key, policy_key, policy_value')
    .eq('retailer_key', effectiveRetailer);
  if (policyError) {
    return json({ error: policyError.message }, 500);
  }

  const variants = WealthEngine.buildVariants(
    offerCandidates,
    (preferenceRows ?? []) as any,
    (policyRows ?? []) as any,
  );

  if (!variants.length) {
    return json({ error: 'No valid stack variants found' }, 422);
  }

  const inserted: Record<string, unknown>[] = [];
  for (const variant of variants) {
    const { data, error } = await db.from('stack_results').insert([{ 
      user_id: userId,
      retailer_key: effectiveRetailer,
      model_version: modelVersion,
      variant_type: variant.variant_type,
      candidate: variant.candidate,
      budget_fit: variant.budget_fit,
      preference_fit: variant.preference_fit,
      simplicity_score: variant.simplicity_score,
      score: variant.score,
      feature_vector: variant.feature_vector,
    }]).select('*').single();

    if (error) {
      return json({ error: error.message }, 500);
    }
    inserted.push(data ?? {});
  }

  const snapshot = WealthEngine.buildWealthSnapshotFromVariant(variants[0].candidate);
  const { data: wealthData, error: wealthError } = await db
    .from('wealth_momentum_snapshots')
    .insert([{ user_id: userId, ...snapshot }])
    .select('*')
    .single();

  if (wealthError) {
    return json({ error: wealthError.message }, 500);
  }

  return json({ variants, stack_results: inserted, wealth_snapshot: wealthData });
});
