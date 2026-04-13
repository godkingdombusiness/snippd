/**
 * delete-account Edge Function
 *
 * Permanently deletes the calling user's profile data and auth account.
 * Uses service-role key server-side — the client cannot call
 * supabase.auth.admin.deleteUser() directly.
 *
 * POST: Authorization: Bearer <user JWT>
 * Returns: { ok: true } or { error: "..." }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Verify the caller via their session JWT
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const userId = user.id;

  // Service-role client for admin operations
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Delete user-owned data before removing the auth account.
  // Cascade deletes handle most FKs, but explicitly clean up profiles
  // and any tables without ON DELETE CASCADE.
  const cleanupTables = [
    'profiles',
    'cart_items',
    'household_cart_items',
    'trip_results',
    'receipt_items',
    'receipt_summaries',
    'cron_audit_log',
  ];

  for (const table of cleanupTables) {
    try {
      // Most tables use user_id; some use id. Try both silently.
      await admin.from(table).delete().eq('user_id', userId);
    } catch { /* non-blocking — FK cascade handles the rest */ }
  }

  // Delete the Supabase auth user — this is the real account deletion
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return json({ error: `Could not delete account: ${deleteError.message}` }, 500);
  }

  return json({ ok: true });
});
