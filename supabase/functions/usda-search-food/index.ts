// Edge Function: usda-search-food
// Searches USDA FoodData Central for a food item, caches the result in
// nutrition_cache, and optionally maps it in product_nutrition_map.
//
// SECURITY: USDA_API_KEY stored as a Supabase secret — never sent to the client.
// Set with: supabase secrets set USDA_API_KEY=your_key_here
// Free key: https://fdc.nal.usda.gov/api-guide.html
//
// Request body:
//   { query: string, product_name?: string, retailer?: string }
//
// Response:
//   { hit: true, data: NutritionData, source: 'cache' | 'usda' }
//   { hit: false, data: null }
//   { error: string } — always HTTP 200; caller must check hit/error

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USDA_SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// Standard USDA nutrient IDs
const N = {
  calories: 1008,
  protein:  1003,
  carbs:    1005,
  fat:      1004,
  fiber:    1079,
  sugar:    2000,
  sodium:   1093,
} as const;

type NutrientList = Array<{ nutrientId: number; value: number }>;

function get(nutrients: NutrientList, id: number): number | null {
  const n = nutrients.find(n => n.nutrientId === id);
  return n != null ? Math.round(n.value * 10) / 10 : null;
}

function wordOverlap(query: string, description: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return 0;
  const desc  = description.toLowerCase();
  return words.filter(w => desc.includes(w)).length / words.length;
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const apiKey      = Deno.env.get('USDA_API_KEY') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server misconfigured', hit: false, data: null });
  }

  let body: { query?: string; product_name?: string; retailer?: string } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const query        = (body.query ?? '').trim();
  const productName  = (body.product_name ?? '').trim();
  const retailer     = (body.retailer ?? '').trim() || null;

  if (!query) return json({ error: 'query is required', hit: false, data: null });

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── 1. Cache check via product_nutrition_map ──────────────────────────────
  const lookupName = productName || query;
  const { data: mapRow } = await db
    .from('product_nutrition_map')
    .select('usda_food_id, confidence_score')
    .eq('product_name', lookupName)
    .not('usda_food_id', 'is', null)
    .order('confidence_score', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (mapRow?.usda_food_id) {
    const { data: cached } = await db
      .from('nutrition_cache')
      .select('*')
      .eq('usda_food_id', mapRow.usda_food_id)
      .maybeSingle();

    if (cached) {
      console.log('[usda-search-food] cache hit for:', lookupName, '→ fdcId:', cached.usda_food_id);
      return json({ hit: true, source: 'cache', data: cached });
    }
  }

  // ── 2. USDA API call ──────────────────────────────────────────────────────
  if (!apiKey) {
    console.warn('[usda-search-food] USDA_API_KEY not set — returning no data');
    return json({ hit: false, data: null, warning: 'USDA_API_KEY not configured' });
  }

  console.log('[usda-search-food] calling USDA API for:', query);

  const url = new URL(USDA_SEARCH);
  url.searchParams.set('query',    query);
  url.searchParams.set('pageSize', '3');
  url.searchParams.set('dataType', 'SR Legacy,Foundation,Branded');
  url.searchParams.set('api_key',  apiKey);

  let usdaRes: Response;
  try {
    usdaRes = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
  } catch (e) {
    return json({ hit: false, data: null, error: `USDA timeout: ${String(e)}` });
  }

  if (!usdaRes.ok) {
    return json({ hit: false, data: null, error: `USDA ${usdaRes.status}` });
  }

  const usdaJson = await usdaRes.json();
  const foods: Array<{
    fdcId: number;
    description: string;
    foodNutrients: NutrientList;
    servingSize?: number;
    servingSizeUnit?: string;
    score?: number;
  }> = usdaJson.foods ?? [];

  if (!foods.length) {
    return json({ hit: false, data: null });
  }

  // Pick the food with the best word overlap (not just first result)
  let best = foods[0];
  let bestOverlap = wordOverlap(query, best.description);
  for (const food of foods.slice(1)) {
    const overlap = wordOverlap(query, food.description);
    if (overlap > bestOverlap) { best = food; bestOverlap = overlap; }
  }

  // Require at least 30% word overlap to avoid garbage matches
  if (bestOverlap < 0.3) {
    console.log('[usda-search-food] no confident match for:', query, '(best overlap:', bestOverlap, ')');
    return json({ hit: false, data: null });
  }

  const nutrients = best.foodNutrients ?? [];
  const nutrition = {
    usda_food_id:  best.fdcId,
    description:   best.description,
    calories:      get(nutrients, N.calories),
    protein:       get(nutrients, N.protein),
    carbs:         get(nutrients, N.carbs),
    fat:           get(nutrients, N.fat),
    fiber:         get(nutrients, N.fiber),
    sugar:         get(nutrients, N.sugar),
    sodium:        get(nutrients, N.sodium),
    serving_size:  best.servingSize ?? null,
    serving_unit:  best.servingSizeUnit ?? null,
    last_updated:  new Date().toISOString(),
  };

  // ── 3. Cache result ───────────────────────────────────────────────────────
  await db.from('nutrition_cache').upsert(nutrition, { onConflict: 'usda_food_id' });

  // ── 4. Save product → USDA mapping ───────────────────────────────────────
  if (lookupName) {
    const confidenceScore = parseFloat(Math.min(bestOverlap + 0.2, 1).toFixed(2));
    await db.from('product_nutrition_map').upsert(
      {
        product_name:     lookupName,
        retailer:         retailer,
        usda_food_id:     best.fdcId,
        confidence_score: confidenceScore,
      },
      { onConflict: 'product_name, COALESCE(retailer, \'\')' },
    ).then(() => {}); // non-fatal if unique constraint setup differs
  }

  console.log('[usda-search-food] fetched from USDA — fdcId:', best.fdcId, 'overlap:', bestOverlap);
  return json({ hit: true, source: 'usda', data: nutrition });
});
