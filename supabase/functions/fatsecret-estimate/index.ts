import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DISCLAIMER =
  'Nutrition may vary by brand, serving size, recipe preparation, and store availability.';

interface SeededEstimate {
  estimated_calories: number;
  estimated_protein_g: number;
  estimated_carbs_g: number;
  estimated_fat_g: number;
  estimated_sodium_mg: number;
  estimated_sugar_g: number;
}

const SEEDED_ESTIMATES: Record<string, SeededEstimate> = {
  'Chicken Rice Bowls': {
    estimated_calories: 520,
    estimated_protein_g: 38,
    estimated_carbs_g: 45,
    estimated_fat_g: 14,
    estimated_sodium_mg: 680,
    estimated_sugar_g: 4,
  },
  'Pasta with Garlic and Olive Oil': {
    estimated_calories: 480,
    estimated_protein_g: 14,
    estimated_carbs_g: 72,
    estimated_fat_g: 16,
    estimated_sodium_mg: 320,
    estimated_sugar_g: 3,
  },
  'Egg Fried Rice': {
    estimated_calories: 420,
    estimated_protein_g: 18,
    estimated_carbs_g: 52,
    estimated_fat_g: 14,
    estimated_sodium_mg: 890,
    estimated_sugar_g: 6,
  },
  default: {
    estimated_calories: 450,
    estimated_protein_g: 25,
    estimated_carbs_g: 40,
    estimated_fat_g: 15,
    estimated_sodium_mg: 600,
    estimated_sugar_g: 5,
  },
};

interface FatSecretTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function getFatSecretToken(): Promise<string | null> {
  const clientId = Deno.env.get('FATSECRET_CLIENT_ID');
  const clientSecret = Deno.env.get('FATSECRET_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'basic',
    client_id: clientId,
    client_secret: clientSecret,
  });

  try {
    const resp = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!resp.ok) {
      console.error('[fatsecret-estimate] Token request failed:', resp.status);
      return null;
    }

    const data: FatSecretTokenResponse = await resp.json();
    // Never log the token value itself
    return data.access_token ?? null;
  } catch (err) {
    console.error('[fatsecret-estimate] Token fetch error:', (err as Error).message);
    return null;
  }
}

interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium: number;
  sugar: number;
  matched: number;
}

/** Search a single ingredient and pull first result's first serving nutrition. */
async function fetchIngredientNutrition(
  token: string,
  ingredientName: string,
): Promise<Partial<NutritionTotals>> {
  try {
    // Step 1: search
    const searchParams = new URLSearchParams({
      method: 'foods.search',
      search_expression: ingredientName,
      max_results: '1',
      format: 'json',
    });

    const searchResp = await fetch(
      `https://platform.fatsecret.com/rest/server.api?${searchParams.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!searchResp.ok) return {};

    const searchData = await searchResp.json();
    const foods = searchData?.foods?.food;
    const firstFood = Array.isArray(foods) ? foods[0] : foods;

    if (!firstFood?.food_id) return {};

    // Step 2: get nutrition detail
    const getParams = new URLSearchParams({
      method: 'food.get.v4',
      food_id: firstFood.food_id,
      format: 'json',
    });

    const getResp = await fetch(
      `https://platform.fatsecret.com/rest/server.api?${getParams.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!getResp.ok) return {};

    const getData = await getResp.json();
    const servings = getData?.food?.servings?.serving;
    const firstServing = Array.isArray(servings) ? servings[0] : servings;

    if (!firstServing) return {};

    return {
      calories: parseFloat(firstServing.calories ?? '0') || 0,
      protein: parseFloat(firstServing.protein ?? '0') || 0,
      carbs: parseFloat(firstServing.carbohydrate ?? '0') || 0,
      fat: parseFloat(firstServing.fat ?? '0') || 0,
      sodium: parseFloat(firstServing.sodium ?? '0') || 0,
      sugar: parseFloat(firstServing.sugar ?? '0') || 0,
      matched: 1,
    };
  } catch (err) {
    console.error('[fatsecret-estimate] Ingredient fetch error:', (err as Error).message);
    return {};
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Require Bearer JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
      status: 401,
    });
  }

  // Validate JWT via Supabase
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { error: authError } = await supabase.auth.getUser();
  if (authError) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
      status: 401,
    });
  }

  let mealName: string;
  let ingredients: Array<{ name: string; amount: string }>;
  let servings = 1;

  try {
    const body = await req.json();

    mealName = body.meal_name;
    if (!mealName || typeof mealName !== 'string' || mealName.trim() === '') {
      throw new Error('meal_name is required');
    }

    ingredients = body.ingredients;
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      throw new Error('ingredients must be a non-empty array');
    }

    if (body.servings && typeof body.servings === 'number' && body.servings > 0) {
      servings = body.servings;
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || 'Invalid request body' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  const token = await getFatSecretToken();

  // --- FatSecret unavailable: use seeded estimates ---
  if (!token) {
    const seed = SEEDED_ESTIMATES[mealName] ?? SEEDED_ESTIMATES['default'];
    return new Response(
      JSON.stringify({
        ...seed,
        nutrition_source: 'Estimated by Snippd demo data',
        confidence_score: 40,
        disclaimer: DISCLAIMER,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
    );
  }

  // --- FatSecret available: sum ingredient nutrition ---
  const totals: NutritionTotals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    sodium: 0,
    sugar: 0,
    matched: 0,
  };

  // Fetch each ingredient sequentially to avoid rate limits
  for (const ingredient of ingredients) {
    const nutrition = await fetchIngredientNutrition(token, ingredient.name);
    totals.calories += nutrition.calories ?? 0;
    totals.protein += nutrition.protein ?? 0;
    totals.carbs += nutrition.carbs ?? 0;
    totals.fat += nutrition.fat ?? 0;
    totals.sodium += nutrition.sodium ?? 0;
    totals.sugar += nutrition.sugar ?? 0;
    totals.matched += nutrition.matched ?? 0;
  }

  const matchRatio = ingredients.length > 0 ? totals.matched / ingredients.length : 0;

  // If we matched fewer than half the ingredients, fall back to seeds
  if (matchRatio < 0.5) {
    const seed = SEEDED_ESTIMATES[mealName] ?? SEEDED_ESTIMATES['default'];
    return new Response(
      JSON.stringify({
        ...seed,
        nutrition_source: 'Estimated by Snippd demo data',
        confidence_score: 40,
        disclaimer: DISCLAIMER,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
    );
  }

  const perServing = (val: number) => Math.round((val / servings) * 10) / 10;

  // Confidence: 60 base + up to 40 for full ingredient match
  const confidenceScore = Math.round(60 + matchRatio * 40);

  return new Response(
    JSON.stringify({
      estimated_calories: perServing(totals.calories),
      estimated_protein_g: perServing(totals.protein),
      estimated_carbs_g: perServing(totals.carbs),
      estimated_fat_g: perServing(totals.fat),
      estimated_sodium_mg: perServing(totals.sodium),
      estimated_sugar_g: perServing(totals.sugar),
      nutrition_source: 'FatSecret',
      confidence_score: confidenceScore,
      disclaimer: DISCLAIMER,
    }),
    { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
  );
});
