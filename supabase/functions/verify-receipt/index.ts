// ============================================================
// Snippd — verify-receipt (The Logic Lock)
// supabase/functions/verify-receipt/index.ts
//
// POST /functions/v1/verify-receipt
// Auth: Bearer JWT (required)
//
// The single authoritative gatekeeper for receipt credit awards.
// Replaces the client-side applyReceiptVerifyCredits() + updateStreakOnVerify().
//
// Security controls:
//   [1] JWT auth — only the owner of the receipt upload gets credits
//   [2] Duplicate detection — upload_id already claimed → reject
//   [3] Content hash dedup — same physical receipt re-uploaded → reject
//   [4] Velocity check — ≥3 receipts in 5 min → fraud flag + reject
//   [5] Atomic DB transaction — credits + streak updated in one RPC call
//       process_receipt_verification() uses SELECT FOR UPDATE, eliminating
//       any ToCTOU race condition
//
// Response:
//   {
//     ok: true,
//     credits_earned: 10,
//     bonus_credits: 0 | 10 | 25,    ← variable reward (computed server-side)
//     total_credits_earned: 10-35,
//     streak_weeks: number,
//     longest_streak: number,
//     was_extended: boolean,
//     shield_used: boolean,
//     already_counted_this_week: boolean,
//     badges_earned: string[]
//   }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY  = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ── Auth — verify caller owns the session ────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'missing_auth' }, 401);
  }
  const jwt = authHeader.slice(7);

  // User-scoped client — validates JWT, enforces RLS
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json({ error: 'invalid_token' }, 401);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { receipt_upload_id?: string; content_hash?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { receipt_upload_id, content_hash } = body;

  if (!receipt_upload_id || typeof receipt_upload_id !== 'string') {
    return json({ error: 'receipt_upload_id_required' }, 400);
  }

  // Sanitize — prevent injection into the RPC argument
  if (receipt_upload_id.length > 128) {
    return json({ error: 'receipt_upload_id_too_long' }, 400);
  }

  // ── Verify the upload belongs to this user ───────────────────────────────
  // Uses user-scoped client (RLS enforced) so another user can't claim
  // someone else's upload_id
  const { data: uploadRow, error: uploadErr } = await userClient
    .from('receipt_uploads')
    .select('id, user_id, status')
    .eq('id', receipt_upload_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (uploadErr) {
    console.error('[verify-receipt] upload lookup error:', uploadErr.message);
    // If receipt_uploads table doesn't exist yet, proceed anyway
    // (some deployments haven't run all migrations)
    if (!uploadErr.message.includes('does not exist')) {
      return json({ error: 'upload_lookup_failed', detail: uploadErr.message }, 500);
    }
  }

  // If table exists and row not found → user doesn't own this upload
  if (!uploadErr && uploadRow === null) {
    return json({ error: 'upload_not_found_or_unauthorized' }, 403);
  }

  // ── Service role client — for the atomic RPC ─────────────────────────────
  // SECURITY NOTE: SERVICE_ROLE_KEY never leaves this Edge Function.
  // It is stored in Supabase Vault / Edge Function secrets, NOT in the app.
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── Call process_receipt_verification() — single atomic transaction ───────
  const { data: result, error: rpcError } = await serviceClient.rpc(
    'process_receipt_verification',
    {
      p_user_id:      user.id,
      p_upload_id:    receipt_upload_id,
      p_content_hash: content_hash ?? null,
    },
  );

  if (rpcError) {
    console.error('[verify-receipt] RPC error:', rpcError.message);
    return json({ error: 'verification_failed', detail: rpcError.message }, 500);
  }

  if (!result?.ok) {
    // Not an error — a controlled rejection (duplicate, velocity, etc.)
    const statusCode = result?.error === 'velocity_limit_exceeded' ? 429
      : result?.error === 'already_claimed'                        ? 200  // idempotent
      : result?.error === 'upload_not_found_or_unauthorized'       ? 403
      : 422;

    return json(result, statusCode);
  }

  // ── Log to ingestion pipeline for preference learning ────────────────────
  try {
    await serviceClient.from('event_stream').insert({
      user_id:    user.id,
      event_name: 'RECEIPT_VERIFIED_CREDITS_AWARDED',
      properties: {
        upload_id:     receipt_upload_id,
        credits_earned: result.total_credits_earned,
        bonus_credits:  result.bonus_credits,
        streak_weeks:   result.streak_weeks,
        badges_earned:  result.badges_earned,
      },
    });
  } catch { /* non-critical — never block the response */ }

  return json(result, 200);
});
