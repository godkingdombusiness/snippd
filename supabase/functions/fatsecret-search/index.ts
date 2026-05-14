import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEEDED_FALLBACK = [
  { food_id: 'seed_001', food_name: 'Chicken Breast', food_type: 'Generic', food_url: null, brand_name: null },
  { food_id: 'seed_002', food_name: 'White Rice', food_type: 'Generic', food_url: null, brand_name: null },
];

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
      console.error('[fatsecret-search] Token request failed:', resp.status);
      return null;
    }

    const data: FatSecretTokenResponse = await resp.json();
    // Never log the token value itself
    return data.access_token ?? null;
  } catch (err) {
    console.error('[fatsecret-search] Token fetch error:', (err as Error).message);
    return null;
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

  let query: string;
  let maxResults = 10;
  let _region: string | undefined;

  try {
    const body = await req.json();
    query = body.query;
    if (!query || typeof query !== 'string' || query.trim() === '') {
      throw new Error('query is required');
    }
    if (body.max_results && typeof body.max_results === 'number') {
      maxResults = Math.min(Math.max(1, body.max_results), 50);
    }
    _region = body.region;
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || 'Invalid request body' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  const token = await getFatSecretToken();

  if (!token) {
    return new Response(
      JSON.stringify({ results: SEEDED_FALLBACK, nutrition_source: 'Estimated by Snippd demo data' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
    );
  }

  try {
    const params = new URLSearchParams({
      method: 'foods.search',
      search_expression: query.trim(),
      max_results: String(maxResults),
      format: 'json',
    });

    const resp = await fetch(`https://platform.fatsecret.com/rest/server.api?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      console.error('[fatsecret-search] API error:', resp.status);
      return new Response(
        JSON.stringify({ results: SEEDED_FALLBACK, nutrition_source: 'Estimated by Snippd demo data' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    const data = await resp.json();
    const foods = data?.foods?.food ?? [];

    // Normalise to consistent shape
    const results = (Array.isArray(foods) ? foods : [foods]).map((f: Record<string, string>) => ({
      food_id: f.food_id ?? null,
      food_name: f.food_name ?? null,
      food_type: f.food_type ?? null,
      food_url: f.food_url ?? null,
      brand_name: f.brand_name ?? null,
    }));

    return new Response(
      JSON.stringify({ results, nutrition_source: 'FatSecret' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (err) {
    console.error('[fatsecret-search] Fetch error:', (err as Error).message);
    return new Response(
      JSON.stringify({ results: SEEDED_FALLBACK, nutrition_source: 'Estimated by Snippd demo data' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
    );
  }
});
