// Edge Function: score-deals
// Accepts a FilterObject, calls get_scored_deals() SQL function,
// applies preference/nutrition/novelty scoring, updates user_variation_state,
// returns ranked deals + nutrition_summary + score_breakdown per deal.
//
// Auth: Bearer JWT (user must be authenticated)
//
// Request body:
//   {
//     stores:      string[]           (empty = all)
//     preferences: string[]           (e.g. ['vegetarian','keto','budget','family'])
//     nutrition: {
//       min_protein:   number | null
//       max_carbs:     number | null
//       max_calories:  number | null
//       max_sodium:    number | null
//     }
//     limit: number                  (default 30, max 60)
//   }
//
// Response 200:
//   {
//     deals: ScoredDeal[]
//     nutrition_summary: NutritionSummary
//     total_returned: number
//     filters_applied: FilterObject
//   }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Inline scoring types (mirror src/lib/dealScoring.ts — no npm imports in Deno) ──

interface ScoredDeal {
  id: string;
  product_name: string;
  retailer: string;
  price_cents: number | null;
  final_unit_price_cents: number | null;
  regular_price_cents: number | null;
  savings_cents: number | null;
  deal_type: string | null;
  category: string | null;
  confidence_score: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  usda_food_id: number | null;
  nutrition_confidence: number | null;
  composite_score: number;
  score_breakdown: {
    savings_score: number;
    nutrition_score: number;
    preference_score: number;
    novelty_score: number;
    composite: number;
  };
}

interface FilterObject {
  stores: string[];
  preferences: string[];
  nutrition: {
    min_protein: number | null;
    max_carbs: number | null;
    max_calories: number | null;
    max_sodium: number | null;
  };
}

interface UserContext {
  preferred_stores: string[];
  category_clicks: Record<string, number>;
  last_seen_deals: string[];
}

// ── Weights ───────────────────────────────────────────────────────────────────

const W = { savings: 0.45, nutrition: 0.25, preference: 0.20, novelty: 0.10 } as const;

function clamp01(v: number): number { return Math.min(1, Math.max(0, v)); }

function savingsScore(deal: ScoredDeal): number {
  return clamp01((deal.savings_cents ?? 0) / 500);
}

function nutritionScore(deal: ScoredDeal): number {
  if (deal.calories == null) return 0.5;
  const density = (deal.protein != null && deal.calories > 0) ? (deal.protein / deal.calories) * 100 : 0;
  const calPenalty = deal.calories > 500 ? clamp01((deal.calories - 500) / 500) * 0.3 : 0;
  return clamp01(clamp01(density / 10) - calPenalty);
}

const MEATS = ['chicken','beef','pork','turkey','bacon','sausage','ham','fish','salmon','shrimp'];

function preferenceScore(deal: ScoredDeal, user: UserContext, filters: FilterObject): number {
  let score = 0.5;
  if (user.preferred_stores.includes(deal.retailer)) score += 0.2;
  if (deal.category) score += clamp01((user.category_clicks[deal.category] ?? 0) / 10) * 0.2;
  const prefs = filters.preferences;
  const name  = deal.product_name.toLowerCase();
  if (prefs.includes('vegetarian') && MEATS.some(m => name.includes(m))) score -= 0.3;
  if (prefs.includes('budget') && (deal.savings_cents ?? 0) > 200) score += 0.15;
  if (prefs.includes('keto') && deal.carbs != null && deal.carbs < 10) score += 0.15;
  if (prefs.includes('family') && deal.deal_type === 'BOGO') score += 0.1;
  return clamp01(score);
}

function scoreDeal(deal: ScoredDeal, user: UserContext, filters: FilterObject): ScoredDeal {
  const ss = savingsScore(deal);
  const ns = nutritionScore(deal);
  const ps = preferenceScore(deal, user, filters);
  const nv = user.last_seen_deals.includes(deal.id) ? 0 : 1;
  const composite = W.savings * ss + W.nutrition * ns + W.preference * ps + W.novelty * nv;
  const fmt = (n: number) => parseFloat(n.toFixed(4));
  return { ...deal, composite_score: fmt(composite), score_breakdown: { savings_score: fmt(ss), nutrition_score: fmt(ns), preference_score: fmt(ps), novelty_score: fmt(nv), composite: fmt(composite) } };
}

function applyNutritionFilters(deals: ScoredDeal[], f: FilterObject): ScoredDeal[] {
  const { min_protein, max_carbs, max_calories, max_sodium } = f.nutrition;
  return deals.filter(d => {
    if (d.calories == null && d.protein == null) return true; // unenriched: keep
    if (min_protein  != null && d.protein  != null && d.protein  < min_protein)  return false;
    if (max_carbs    != null && d.carbs    != null && d.carbs    > max_carbs)     return false;
    if (max_calories != null && d.calories != null && d.calories > max_calories)  return false;
    if (max_sodium   != null && d.sodium   != null && d.sodium   > max_sodium)    return false;
    return true;
  });
}

function buildNutritionSummary(deals: ScoredDeal[]) {
  const enriched = deals.filter(d => d.calories != null);
  if (!enriched.length) return { avg_calories: null, avg_protein: null, avg_carbs: null, avg_fat: null, enriched_count: 0, total_count: deals.length };
  const avg = (key: keyof ScoredDeal) => {
    const vals = enriched.map(d => d[key] as number | null).filter((v): v is number => v != null);
    return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : null;
  };
  return { avg_calories: avg('calories'), avg_protein: avg('protein'), avg_carbs: avg('carbs'), avg_fat: avg('fat'), enriched_count: enriched.length, total_count: deals.length };
}

// ── CORS + json helper ────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  // Auth: extract user from JWT
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Authorization required' }, 401);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Verify JWT and get user
  const { data: { user }, error: authErr } = await db.auth.getUser(jwt);
  if (authErr || !user) return json({ error: 'Invalid token' }, 401);
  const userId = user.id;

  // Parse request body
  let body: Partial<{ stores: string[]; preferences: string[]; nutrition: Record<string, number | null>; limit: number }> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const filters: FilterObject = {
    stores:      Array.isArray(body.stores)      ? body.stores      : [],
    preferences: Array.isArray(body.preferences) ? body.preferences : [],
    nutrition: {
      min_protein:   body.nutrition?.min_protein   ?? null,
      max_carbs:     body.nutrition?.max_carbs     ?? null,
      max_calories:  body.nutrition?.max_calories  ?? null,
      max_sodium:    body.nutrition?.max_sodium     ?? null,
    },
  };
  const limit = Math.min(Math.max(1, body.limit ?? 30), 60);

  console.log('[score-deals] user:', userId, 'stores:', filters.stores, 'prefs:', filters.preferences, 'limit:', limit);

  // ── 1. Load user context ────────────────────────────────────────────────────

  const [prefsRes, variationRes] = await Promise.all([
    db.from('user_preferences').select('preferred_stores, category_clicks').eq('user_id', userId).maybeSingle(),
    db.from('user_variation_state').select('last_seen_deals').eq('user_id', userId).maybeSingle(),
  ]);

  const userPrefs  = prefsRes.data;
  const variation  = variationRes.data;

  const userContext: UserContext = {
    preferred_stores: (userPrefs?.preferred_stores as string[]) ?? [],
    category_clicks:  (userPrefs?.category_clicks  as Record<string, number>) ?? {},
    last_seen_deals:  (variation?.last_seen_deals   as string[]) ?? [],
  };

  // Merge explicit store filter with preferred stores (explicit takes priority)
  const effectiveStores = filters.stores.length ? filters.stores : userContext.preferred_stores;

  // ── 2. Fetch scored deals via SQL function ──────────────────────────────────

  const { data: rawDeals, error: rpcErr } = await db.rpc('get_scored_deals', {
    p_stores: effectiveStores.length ? effectiveStores : null,
    p_limit:  Math.min(limit * 3, 60),  // fetch more than needed, trim after scoring
  });

  if (rpcErr) {
    console.error('[score-deals] get_scored_deals failed:', rpcErr);
    return json({ error: 'Failed to load deals', detail: rpcErr.message }, 500);
  }

  const deals: ScoredDeal[] = (rawDeals ?? []).map((d: unknown) => ({ ...(d as object), composite_score: 0, score_breakdown: { savings_score: 0, nutrition_score: 0, preference_score: 0, novelty_score: 0, composite: 0 } }));

  // ── 3. Apply nutrition filters ──────────────────────────────────────────────

  const filtered = applyNutritionFilters(deals, filters);

  // ── 4. Score and sort ───────────────────────────────────────────────────────

  const scored = filtered
    .map(d => scoreDeal(d, userContext, filters))
    .sort((a, b) => b.composite_score - a.composite_score)
    .slice(0, limit);

  // ── 5. Update user_variation_state ──────────────────────────────────────────

  const seenIds = scored.map(d => d.id);
  const newSeen = [...new Set([...seenIds, ...userContext.last_seen_deals])].slice(0, 40);

  await db.from('user_variation_state').upsert(
    { user_id: userId, last_seen_deals: newSeen, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );

  // ── 6. Build nutrition summary ──────────────────────────────────────────────

  const nutrition_summary = buildNutritionSummary(scored);

  console.log('[score-deals] returning', scored.length, 'deals, enriched:', nutrition_summary.enriched_count);

  return json({
    deals:            scored,
    nutrition_summary,
    total_returned:   scored.length,
    filters_applied:  filters,
  });
});
