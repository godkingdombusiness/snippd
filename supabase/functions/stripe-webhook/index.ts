import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// stripe-webhook — Stripe payment confirmation → paid waitlist position
//
// Handles: checkout.session.completed
// On success: calls assign_paid_waitlist_position() which:
//   - assigns paid tier position (1, 2, 3 … in payment order)
//   - auto-approves the first 200 paid users
//   - updates user_persona.status → 'paid_beta' or 'waitlist'
//
// Required Supabase secrets (Dashboard → Project Settings → Edge Functions):
//   STRIPE_WEBHOOK_SECRET  — from Stripe Dashboard → Webhooks → signing secret
//   SUPABASE_URL           — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// Required Stripe payment link setup (Stripe Dashboard → Payment Links):
//   Add metadata:  tier = beta_pro   (or tier = founder)
//   This determines which stripe_tier is stored in waitlist_positions.
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ACCEPTED_TIERS = new Set(['beta_pro', 'founder']);
const DEFAULT_TIER   = 'beta_pro';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ── Stripe signature verification ─────────────────────────────────────────────
// Implements https://stripe.com/docs/webhooks/signatures
// Signature header format: t=TIMESTAMP,v1=SIG[,v1=SIG2]
//
// Signed payload = "<timestamp>.<raw_body>"
// Expected sig   = HMAC-SHA256(signed_payload, webhook_secret)
// Replay window  = 5 minutes (300 seconds)

async function verifyStripeSignature(
  rawBody: string,
  header: string,
  secret: string,
): Promise<boolean> {
  let timestamp = '';
  const v1Sigs: string[] = [];
  for (const part of header.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k === 't')  timestamp = v;
    if (k === 'v1') v1Sigs.push(v);
  }

  if (!timestamp || v1Sigs.length === 0) return false;

  // Replay attack protection: reject events older than 5 minutes
  const ageSeconds = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (ageSeconds > 300) return false;

  // Compute expected HMAC-SHA256
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign(
    'HMAC',
    keyMaterial,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  const computedSig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Accept if any v1 sig matches (Stripe can send multiple during key rotation)
  return v1Sigs.some((s) => s === computedSig);
}

// ── User lookup by email ──────────────────────────────────────────────────────
// Uses the GoTrue admin API (service role required).
// For beta scale (≤ 200 paid users) a single page of 1000 is always sufficient.

async function findUserByEmail(
  supabaseUrl: string,
  serviceKey: string,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const res = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    },
  );

  if (!res.ok) {
    console.error('[stripe-webhook] GoTrue admin fetch failed:', res.status, await res.text());
    return null;
  }

  const body = await res.json();
  const users: Array<{ id: string; email?: string }> = body.users ?? [];
  const match = users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  return match ? { id: match.id, email: match.email! } : null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  console.log('[stripe-webhook] request received:', req.method, req.url);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const supabaseUrl   = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    console.error('[stripe-webhook] FATAL: missing required env vars — STRIPE_WEBHOOK_SECRET, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY not set in Supabase secrets');
    return json({ error: 'Webhook not configured' }, 500);
  }

  // Read raw body — signature verification requires the exact bytes Stripe sent
  const rawBody = await req.text();
  const stripeSignature = req.headers.get('stripe-signature') ?? '';

  if (!stripeSignature) {
    console.error('[stripe-webhook] rejected: missing Stripe-Signature header');
    return json({ error: 'Missing Stripe-Signature header' }, 400);
  }

  const valid = await verifyStripeSignature(rawBody, stripeSignature, webhookSecret);
  if (!valid) {
    console.error('[stripe-webhook] rejected: invalid signature');
    return json({ error: 'Invalid signature' }, 400);
  }

  // Parse event
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error('[stripe-webhook] rejected: invalid JSON body');
    return json({ error: 'Invalid JSON' }, 400);
  }

  const eventType = event.type as string;
  console.log('[stripe-webhook] event type:', eventType);

  // ── checkout.session.completed ────────────────────────────────────────────
  if (eventType === 'checkout.session.completed') {
    const session = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;
    const sessionId = session.id as string ?? 'unknown';

    console.log('[stripe-webhook] checkout.session.completed — session id:', sessionId);
    console.log('[stripe-webhook] payment_status:', session.payment_status);

    // Only process fully paid sessions (skip $0 sessions, free trials, etc.)
    if (session.payment_status !== 'paid') {
      console.log('[stripe-webhook] skipping — payment_status is not "paid":', session.payment_status);
      return json({ received: true, skipped: `payment_status=${session.payment_status}` });
    }

    const customerDetails = session.customer_details as Record<string, string> | null;
    const email           = (customerDetails?.email ?? '').trim().toLowerCase();
    // Subscriptions (mode=subscription) set payment_intent=null and use invoice+subscription instead.
    // Use subscription ID if available, fall back to payment_intent, then session ID.
    const subscriptionId  = (session.subscription as string) ?? null;
    const paymentIntentId = (session.payment_intent as string) ?? subscriptionId ?? sessionId;
    const rawMetadata     = (session.metadata as Record<string, string>) ?? {};
    const sessionMode     = (session.mode as string) ?? 'payment';

    console.log('[stripe-webhook] session mode:', sessionMode, '— payment_intent:', session.payment_intent ?? 'null (subscription)', '— subscription:', subscriptionId ?? 'none');

    console.log('[stripe-webhook] customer email:', email || '(none)');

    // Defensively trim metadata.tier — Stripe dashboard entries can have leading/trailing spaces
    const rawTier    = rawMetadata.tier ?? '';
    const cleanedTier = rawTier.trim().toLowerCase();
    const stripeTier  = ACCEPTED_TIERS.has(cleanedTier) ? cleanedTier : DEFAULT_TIER;

    console.log('[stripe-webhook] metadata.tier raw:', JSON.stringify(rawTier), '→ cleaned:', stripeTier);

    if (!email) {
      console.error('[stripe-webhook] WARNING: no customer email in session', sessionId, '— returning 200, manual follow-up required');
      // Return 200 — Stripe must not retry; requires manual reconciliation
      return json({ received: true, warning: 'no_customer_email', session_id: sessionId });
    }

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Look up the Snippd user account by email
    const user = await findUserByEmail(supabaseUrl, serviceKey, email);

    if (!user) {
      console.error('[stripe-webhook] WARNING: no Snippd account for email:', email, '— returning 200, manual follow-up required');
      // Return 200 — Stripe must not retry; user may have signed up with a different email
      return json({ received: true, warning: 'user_not_found', email });
    }

    console.log('[stripe-webhook] found user:', user.id, '— calling assign_paid_waitlist_position with tier:', stripeTier);

    // Assign paid waitlist position (auto-approves if position ≤ 200)
    const { data: rpcData, error: rpcError } = await db.rpc('assign_paid_waitlist_position', {
      p_user_id:           user.id,
      p_stripe_payment_id: paymentIntentId,
      p_stripe_tier:       stripeTier,
    });

    if (rpcError) {
      console.error('[stripe-webhook] FATAL: assign_paid_waitlist_position RPC failed:', JSON.stringify(rpcError));
      // Return 500 — Stripe retries on 5xx; this is a recoverable database error
      return json({ received: true, error: rpcError.message }, 500);
    }

    const position = rpcData as number;
    console.log('[stripe-webhook] SUCCESS — paid position assigned:', {
      user_id:     user.id,
      email,
      tier:        stripeTier,
      position,
      auto_approved: position <= 200,
    });

    return json({
      received:    true,
      user_id:     user.id,
      stripe_tier: stripeTier,
      position,
    });
  }

  // All other event types — acknowledge to prevent Stripe retries
  console.log('[stripe-webhook] unhandled event type acknowledged:', eventType);
  return json({ received: true, type: eventType });
});
