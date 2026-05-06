// Edge Function: lookup-barcode
// Looks up a UPC/EAN barcode via Open Food Facts, caches the result in
// scanned_products, and returns structured product + nutrition data.
//
// Flow:
//   1. Check scanned_products cache (instant return if hit)
//   2. Call Open Food Facts API (free, no key required)
//   3. Save to scanned_products cache
//   4. Return product data; trigger USDA mapping in background (non-blocking)
//
// Request:  { barcode: string }
// Response: { found: true, source: 'cache'|'off', product: ProductData }
//           { found: false, barcode: string }   ← prompt user to search manually
//
// Always HTTP 200 — caller checks `found`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

interface OFFNutriments {
  'energy-kcal_100g'?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  sodium_100g?: number;
  [key: string]: number | undefined;
}

interface OFFProduct {
  product_name?: string;
  brands?: string;
  image_url?: string;
  image_front_url?: string;
  ingredients_text?: string;
  nutriments?: OFFNutriments;
  allergens_tags?: string[];
  categories_tags?: string[];
  quantity?: string;
}

function nutritionPending(nutrition: ReturnType<typeof normalizeNutrition>) {
  return !nutrition || Object.values(nutrition).every(v => v == null);
}

function productResponse(params: {
  barcode: string;
  name: string | null;
  brand: string | null;
  image: string | null;
  ingredients: string | null;
  allergens: string[];
  nutrition: ReturnType<typeof normalizeNutrition>;
}) {
  const nutrition = {
    calories: params.nutrition?.calories ?? null,
    protein:  params.nutrition?.protein ?? null,
    carbs:    params.nutrition?.carbs ?? null,
    fat:      params.nutrition?.fat ?? null,
    sodium:   params.nutrition?.sodium ?? null,
  };
  return {
    status: 'found',
    barcode: params.barcode,
    name: params.name,
    brand: params.brand,
    image_url: params.image,
    image: params.image,
    ingredients: params.ingredients,
    allergens: params.allergens,
    nutrition,
    nutrition_pending: nutritionPending(params.nutrition),
  };
}

function normalizeNutrition(n: OFFNutriments | undefined) {
  if (!n) return null;
  const round1 = (v: number | undefined) => v != null ? Math.round(v * 10) / 10 : null;
  return {
    calories: round1(n['energy-kcal_100g']),
    protein:  round1(n['proteins_100g']),
    carbs:    round1(n['carbohydrates_100g']),
    fat:      round1(n['fat_100g']),
    fiber:    round1(n['fiber_100g']),
    sugar:    round1(n['sugars_100g']),
    sodium:   round1(n['sodium_100g'] != null ? n['sodium_100g'] * 1000 : undefined), // g → mg
  };
}

function normalizeAllergens(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  return tags
    .map(t => t.replace(/^en:/, '').replace(/-/g, ' '))
    .filter(t => !t.startsWith('en:'));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return json({ found: false, error: 'Server misconfigured' });
  }

  let body: { barcode?: string } = {};
  try { body = await req.json(); } catch { /* ok */ }

  const barcode = (body.barcode ?? '').trim().replace(/\D/g, ''); // digits only
  if (!barcode) return json({ found: false, error: 'barcode is required' });

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── 1. Cache check ────────────────────────────────────────────────────────
  const { data: cached } = await db
    .from('scanned_products')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();

  if (cached) {
    console.log('[lookup-barcode] cache hit:', barcode);
    const nutrition = cached.nutrition_json ?? {
      calories: cached.calories ?? null,
      protein: cached.protein ?? null,
      carbs: cached.carbs ?? null,
      fat: cached.fat ?? null,
      sodium: cached.sodium ?? null,
    };
    const product = productResponse({
      barcode,
      name: cached.name,
      brand: cached.brand,
      image: cached.image_url,
      ingredients: cached.ingredients_text ?? cached.ingredients,
      allergens: cached.allergens ?? [],
      nutrition,
    });
    return json({ ...product, found: true, source: 'cache', product });
  }

  // ── 2. Open Food Facts API ────────────────────────────────────────────────
  console.log('[lookup-barcode] calling Open Food Facts for:', barcode);

  let offRes: Response;
  try {
    offRes = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      {
        headers: { 'User-Agent': 'Snippd/1.0 (snippd.app@gmail.com)' },
        signal: AbortSignal.timeout(6000),
      },
    );
  } catch (e) {
    console.error('[lookup-barcode] OFF timeout:', e);
    return json({ found: false, barcode, error: 'lookup_timeout' });
  }

  if (!offRes.ok) {
    return json({ found: false, barcode, error: `off_${offRes.status}` });
  }

  const offData = await offRes.json();

  if (offData.status !== 1 || !offData.product) {
    console.log('[lookup-barcode] not found in OFF:', barcode);
    return json({ status: 'not_found', found: false, barcode });
  }

  const p: OFFProduct = offData.product;
  const name        = p.product_name?.trim() || null;
  const brand       = p.brands?.trim() || null;
  const image       = p.image_front_url || p.image_url || null;
  const ingredients = p.ingredients_text?.trim() || null;
  const allergens   = normalizeAllergens(p.allergens_tags);
  const nutrition   = normalizeNutrition(p.nutriments);

  // ── 3. Cache result ───────────────────────────────────────────────────────
  const row = {
    barcode,
    name:             name ?? barcode,
    brand,
    image_url:        image,
    ingredients_text: ingredients,
    ingredients,
    allergens,
    nutrition_json:   nutrition,
    calories:         nutrition?.calories ?? null,
    protein:          nutrition?.protein ?? null,
    carbs:            nutrition?.carbs ?? null,
    fat:              nutrition?.fat ?? null,
    sodium:           nutrition?.sodium ?? null,
    raw_payload:      offData,
    source:           'open_food_facts',
  };

  await db.from('scanned_products').upsert(row, { onConflict: 'barcode' });

  // ── 4. Trigger USDA background mapping (fire-and-forget) ─────────────────
  // Only fire if we have a name to search and a USDA key is configured
  if (name) {
    const usdaKey = Deno.env.get('USDA_API_KEY') ?? '';
    if (usdaKey) {
      // Non-blocking — do not await; function returns before this resolves
      db.functions.invoke('usda-search-food', {
        body: { query: name, product_name: name },
      }).catch(() => {}); // non-fatal
    }
  }

  console.log('[lookup-barcode] found via OFF:', name, '— has nutrition:', nutrition != null);

  const product = productResponse({ barcode, name, brand, image, ingredients, allergens, nutrition });
  return json({ ...product, found: true, source: 'off', product });
});
