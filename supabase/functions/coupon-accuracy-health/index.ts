// coupon-accuracy-health
//
// Returns operational status for the verified-only coupon evidence gate.
// Auth: x-cron-secret header or Authorization: Bearer <service_role_key>.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function verifyServiceAuth(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronHeader = req.headers.get('x-cron-secret') ?? '';
  const authHeader = req.headers.get('authorization') ?? '';

  return Boolean(
    (cronSecret && cronHeader === cronSecret) ||
    (serviceKey && authHeader === `Bearer ${serviceKey}`),
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
  if (!verifyServiceAuth(req)) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('get_coupon_accuracy_health');

  if (error) return json({ error: error.message }, 500);

  const health = Array.isArray(data) ? data[0] : data;
  const status = health?.status === 'healthy' ? 200 : 503;
  return json({ ok: status === 200, health }, status);
});
