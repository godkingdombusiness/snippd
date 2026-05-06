// Edge Function: enrich-nutrition
// Looks up product names against USDA FoodData Central and returns nutrition facts.
//
// SECURITY: USDA_API_KEY is a Supabase secret — never exposed to the client.
// Set with: supabase secrets set USDA_API_KEY=your_key_here
//
// Nutrition is OPTIONAL. If key is missing or USDA is unavailable, returns {}.
// The client must never block on this call.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USDA_SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// Standard USDA nutrient IDs
const NUTRIENT = {
  calories: 1008,
  protein:  1003,
  carbs:    1005,
  fat:      1004,
  sodium:   1093,
} as const;

function getNutrient(nutrients: Array<{ nutrientId: number; value: number }>, id: number): number | null {
  const n = nutrients.find(n => n.nutrientId === id);
  return n != null ? Math.round(n.value) : null;
}

function wordOverlap(query: string, description: string): number {
  const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!qWords.length) return 0;
  const desc = description.toLowerCase();
  const matched = qWords.filter(w => desc.includes(w)).length;
  return matched / qWords.length;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const empty = () =>
    new Response(JSON.stringify({ nutrition: {} }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const products: string[] = Array.isArray(body?.products) ? body.products : [];
    if (!products.length) return empty();

    const apiKey = Deno.env.get('USDA_API_KEY');
    if (!apiKey) return empty(); // Key not configured; return gracefully

    const nutrition: Record<string, {
      fdcId: number;
      description: string;
      calories: number | null;
      protein:  number | null;
      carbs:    number | null;
      fat:      number | null;
      sodium:   number | null;
      servingSize:     number | null;
      servingSizeUnit: string | null;
    }> = {};

    await Promise.all(
      products.slice(0, 10).map(async (productName: string) => {
        try {
          const url = new URL(USDA_SEARCH);
          url.searchParams.set('query', productName);
          url.searchParams.set('pageSize', '1');
          url.searchParams.set('dataType', 'SR Legacy,Foundation');
          url.searchParams.set('api_key', apiKey);

          const res = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) });
          if (!res.ok) return;

          const json = await res.json();
          const food = json.foods?.[0];
          if (!food) return;

          // Only use the result if word overlap is reasonable
          const overlap = wordOverlap(productName, food.description ?? '');
          if (overlap < 0.3) return;

          nutrition[productName] = {
            fdcId:           food.fdcId,
            description:     food.description,
            calories:        getNutrient(food.foodNutrients ?? [], NUTRIENT.calories),
            protein:         getNutrient(food.foodNutrients ?? [], NUTRIENT.protein),
            carbs:           getNutrient(food.foodNutrients ?? [], NUTRIENT.carbs),
            fat:             getNutrient(food.foodNutrients ?? [], NUTRIENT.fat),
            sodium:          getNutrient(food.foodNutrients ?? [], NUTRIENT.sodium),
            servingSize:     food.servingSize     ?? null,
            servingSizeUnit: food.servingSizeUnit ?? null,
          };
        } catch {
          // Individual product failures are silent
        }
      }),
    );

    return new Response(JSON.stringify({ nutrition }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch {
    return empty(); // Always 200 — nutrition is optional
  }
});
