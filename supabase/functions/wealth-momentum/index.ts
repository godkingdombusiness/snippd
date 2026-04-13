import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildWealthSnapshot, WealthSnapshotInput } from '../../../services/WealthEngine.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asTripItems(value: unknown): any[] {
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
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: authError } = await db.auth.getUser(jwt);
  if (authError || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const userId = userData.user.id;

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('wealth_momentum_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ snapshots: data });
  }

  const rawBody = await req.text();
  let body: Record<string, unknown> = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const totalSpentCents = asNumber(body.total_spent_cents);
  const totalSavedCents = asNumber(body.total_saved_cents);

  if (totalSpentCents === null || totalSavedCents === null) {
    return json({ error: 'total_spent_cents and total_saved_cents are required numeric values' }, 400);
  }

  const snapshot = buildWealthSnapshot({
    totalSpentCents,
    totalSavedCents,
    tripItems: asTripItems(body.trip_items),
  });

  try {
    const { data, error } = await db
      .from('wealth_momentum_snapshots')
      .insert([{ user_id: userId, ...snapshot }])
      .select('*')
      .single();

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ snapshot: data });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
