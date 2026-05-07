/**
 * stack-automation - service/admin entry point for automatic stack generation.
 *
 * POST /functions/v1/stack-automation
 * Body: { retailer_key?: string, week_of?: string, publish?: boolean }
 *
 * Writes through rpc_generate_auto_stack_candidates so all stack/deal data lands
 * in the existing stack_candidates and app_home_feed surfaces with audit rows.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
};

const ADMIN_EMAILS = new Set([
  'ddavis@getsnippd.com',
  'dina@getsnippd.com',
  'admin@getsnippd.com',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ingestKey = Deno.env.get('INGEST_API_KEY') ?? '';

  const auth = req.headers.get('authorization') ?? '';
  const xKey = req.headers.get('x-ingest-key') ?? '';
  const isIngestKey = ingestKey !== '' && xKey === ingestKey;

  if (!isIngestKey && !auth.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }

  if (!isIngestKey) {
    const userDb = createClient(supabaseUrl, serviceKey, {
      global: { headers: { authorization: auth } },
    });
    const { data: { user }, error } = await userDb.auth.getUser();
    if (error || !user || !ADMIN_EMAILS.has((user.email ?? '').toLowerCase())) {
      return json({ error: 'admin only' }, 403);
    }
  }

  const body = await req.json().catch(() => ({}));
  const db = createClient(supabaseUrl, serviceKey);

  const { data, error } = await db.rpc('rpc_generate_auto_stack_candidates', {
    p_retailer_key: body.retailer_key ?? null,
    p_week_of: body.week_of ?? null,
    p_publish: body.publish ?? true,
  });

  if (error) {
    console.error('stack-automation failed', error);
    return json({ ok: false, error: error.message }, 500);
  }

  return json(data ?? { ok: true });
});
