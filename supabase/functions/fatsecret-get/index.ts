import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEEDED_FALLBACK = {
  food_id: 'seed_001',
  food_name: 'Chicken Breast (cooked)',
  servings: [
    {
      serving_description: '3 oz',
      calories: '142',
      protein: '26.7',
      carbohydrate: '0',
      fat: '3.1',
      sodium: '63',
      sugar: '0',
      source: 'Estimated by Snippd demo data',
    },
  ],
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
      console.error('[fatsecret-get] Token request failed:', resp.status);
      return null;
    }

    const data: FatSecretTokenResponse = await resp.json();
    // Never log the token value itself
    return data.access_token ?? null;
  } catch (err) {
    console.error('[fatsecret-get] Token fetch error:', (err as Error).message);
    return null;
  }
}

interface RawServing {
  serving_description?: string;
  calories?: string;
  protein?: string;
  carbohydrate?: string;
  fat?: string;
  sodium?: string;
  sugar?: string;
}

function normaliseServings(rawServings: unknown): RawServing[] {
  if (!rawServings) return [];
  const arr = Array.isArray(rawServings) ? rawServings : [rawServings];
  return arr.map((s: RawServing) => ({
    serving_description: s.serving_description ?? null,
    calories: s.calories ?? null,
    protein: s.protein ?? null,
    carbohydrate: s.carbohydrate ?? null,
    fat: s.fat ?? null,
    sodium: s.sodium ?? null,
    sugar: s.sugar ?? null,
  }));
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

  let foodId: string;

  try {
    const body = await req.json();
    foodId = body.food_id;
    if (!foodId || typeof foodId !== 'string' || foodId.trim() === '') {
      throw new Error('food_id is required');
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || 'Invalid request body' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  const token = await getFatSecretToken();

  if (!token) {
    return new Response(
      JSON.stringify({ ...SEEDED_FALLBACK, nutrition_source: 'Estimated by Snippd demo data' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
    );
  }

  try {
    const params = new URLSearchParams({
      method: 'food.get.v4',
      food_id: foodId.trim(),
      format: 'json',
    });

    const resp = await fetch(`https://platform.fatsecret.com/rest/server.api?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      console.error('[fatsecret-get] API error:', resp.status);
      return new Response(
        JSON.stringify({ ...SEEDED_FALLBACK, nutrition_source: 'Estimated by Snippd demo data' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    const data = await resp.json();
    const food = data?.food;

    if (!food) {
      return new Response(
        JSON.stringify({ ...SEEDED_FALLBACK, nutrition_source: 'Estimated by Snippd demo data' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    const result = {
      food_id: food.food_id ?? foodId,
      food_name: food.food_name ?? null,
      servings: normaliseServings(food.servings?.serving),
      nutrition_source: 'FatSecret',
    };

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('[fatsecret-get] Fetch error:', (err as Error).message);
    return new Response(
      JSON.stringify({ ...SEEDED_FALLBACK, nutrition_source: 'Estimated by Snippd demo data' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
    );
  }
});
