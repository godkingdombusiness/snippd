import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// stripe-webhook — Stripe payment confirmation → billing_plan + subscription
//
// Events handled:
//   checkout.session.completed     → assign paid position + set billing_plan
//   customer.subscription.created  → set subscription_status + trial_ends_at
//   customer.subscription.updated  → sync plan changes
//   customer.subscription.deleted  → mark cancelled
//   invoice.payment_succeeded      → renew subscription_period_end
//   invoice.payment_failed         → mark past_due
//
// Required Supabase secrets (Dashboard → Project Settings → Edge Functions):
//   STRIPE_WEBHOOK_SECRET          — from Stripe Dashboard → Webhooks → signing secret
//   SUPABASE_URL                   — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY      — auto-injected
//
// Required Stripe metadata on payment link / checkout session:
//   metadata.tier         = 'beta_pro' | 'founder'
//   metadata.billing_plan = 'trial' | 'monthly'
//
// Billing model:
//   trial   → 3-day free trial then $97/year (annual subscription, trial_period_days=3)
//   monthly → $4.99/month subscription, no trial
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

  const ageSeconds = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (ageSeconds > 300) return false;

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

  return v1Sigs.some((s) => s === computedSig);
}

// ── User lookup by email ──────────────────────────────────────────────────────
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

// ── User lookup by stripe_customer_id ────────────────────────────────────────
async function findUserByCustomerId(
  db: ReturnType<typeof createClient>,
  customerId: string,
): Promise<string | null> {
  const { data } = await db
    .from('profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.user_id ?? null;
}

// ── Determine billing_plan from subscription object ───────────────────────────
// Falls back to metadata.billing_plan, then to interval detection
function resolveBillingPlan(
  metadataPlan: string | undefined,
  subscriptionInterval: string | undefined,
  hasTrial: boolean,
): 'trial' | 'monthly' | 'yearly' {
  if (metadataPlan === 'trial')   return 'trial';
  if (metadataPlan === 'monthly') return 'monthly';
  if (metadataPlan === 'yearly')  return 'yearly';
  // Detect from subscription interval
  if (subscriptionInterval === 'year')  return hasTrial ? 'trial' : 'yearly';
  if (subscriptionInterval === 'month') return 'monthly';
  return 'trial'; // default: trial is the primary offer
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
    console.error('[stripe-webhook] FATAL: missing required env vars');
    return json({ error: 'Webhook not configured' }, 500);
  }

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

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error('[stripe-webhook] rejected: invalid JSON body');
    return json({ error: 'Invalid JSON' }, 400);
  }

  const eventType = event.type as string;
  console.log('[stripe-webhook] event type:', eventType);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── checkout.session.completed ────────────────────────────────────────────
  if (eventType === 'checkout.session.completed') {
    const session       = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;
    const sessionId     = (session.id as string) ?? 'unknown';

    console.log('[stripe-webhook] checkout.session.completed — session id:', sessionId);

    if (session.payment_status !== 'paid') {
      console.log('[stripe-webhook] skipping — payment_status is not "paid":', session.payment_status);
      return json({ received: true, skipped: `payment_status=${session.payment_status}` });
    }

    const customerDetails  = session.customer_details as Record<string, string> | null;
    const email            = (customerDetails?.email ?? '').trim().toLowerCase();
    const subscriptionId   = (session.subscription as string) ?? null;
    const customerId       = (session.customer as string) ?? null;
    const paymentIntentId  = (session.payment_intent as string) ?? subscriptionId ?? sessionId;
    const rawMetadata      = (session.metadata as Record<string, string>) ?? {};
    const sessionMode      = (session.mode as string) ?? 'payment';

    const rawTier    = rawMetadata.tier ?? '';
    const cleanedTier = rawTier.trim().toLowerCase();
    const stripeTier  = ACCEPTED_TIERS.has(cleanedTier) ? cleanedTier : DEFAULT_TIER;
    const metaBillingPlan = (rawMetadata.billing_plan ?? '').trim().toLowerCase();

    console.log('[stripe-webhook] email:', email, '| tier:', stripeTier, '| billing_plan meta:', metaBillingPlan, '| mode:', sessionMode);

    if (!email) {
      console.error('[stripe-webhook] WARNING: no customer email in session', sessionId);
      return json({ received: true, warning: 'no_customer_email', session_id: sessionId });
    }

    const user = await findUserByEmail(supabaseUrl, serviceKey, email);
    if (!user) {
      console.error('[stripe-webhook] WARNING: no Snippd account for email:', email);
      return json({ received: true, warning: 'user_not_found', email });
    }

    // Assign paid waitlist position (existing RPC)
    const { data: rpcData, error: rpcError } = await db.rpc('assign_paid_waitlist_position', {
      p_user_id:           user.id,
      p_stripe_payment_id: paymentIntentId,
      p_stripe_tier:       stripeTier,
    });

    if (rpcError) {
      console.error('[stripe-webhook] FATAL: assign_paid_waitlist_position failed:', JSON.stringify(rpcError));
      return json({ received: true, error: rpcError.message }, 500);
    }

    const position = rpcData as number;

    // Determine billing plan from metadata; fall back to subscription interval detection later
    // For checkout.session.completed, we may not have the full subscription object yet —
    // customer.subscription.created fires separately and will set the full details.
    // Set what we know now; subscription events will enrich further.
    const billingPlan = metaBillingPlan === 'monthly' ? 'monthly'
      : metaBillingPlan === 'yearly' ? 'yearly'
      : 'trial'; // default is trial (founding member annual)

    const trialEndsAt = billingPlan === 'trial'
      ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Update profiles with billing plan + stripe identifiers
    const { error: profileError } = await db
      .from('profiles')
      .update({
        billing_plan:          billingPlan,
        subscription_status:   billingPlan === 'trial' ? 'trialing' : 'active',
        stripe_customer_id:    customerId,
        stripe_subscription_id: subscriptionId,
        trial_ends_at:         trialEndsAt,
      })
      .eq('user_id', user.id);

    if (profileError) {
      console.error('[stripe-webhook] WARNING: profile billing_plan update failed:', JSON.stringify(profileError));
      // Non-fatal — waitlist position already assigned
    }

    console.log('[stripe-webhook] SUCCESS — position:', position, '| billing_plan:', billingPlan, '| user:', user.id);

    return json({
      received:     true,
      user_id:      user.id,
      stripe_tier:  stripeTier,
      billing_plan: billingPlan,
      position,
    });
  }

  // ── customer.subscription.created ────────────────────────────────────────
  if (eventType === 'customer.subscription.created') {
    const sub        = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;
    const customerId = (sub.customer as string) ?? null;
    const subId      = (sub.id as string) ?? null;
    const trialEnd   = sub.trial_end ? new Date((sub.trial_end as number) * 1000).toISOString() : null;
    const periodEnd  = sub.current_period_end ? new Date((sub.current_period_end as number) * 1000).toISOString() : null;
    const status     = (sub.status as string) ?? 'active';

    // Detect interval from first plan item
    const items       = (sub.items as Record<string, unknown>)?.data as Array<Record<string, unknown>> ?? [];
    const interval    = (items[0]?.plan as Record<string, unknown>)?.interval as string ?? '';
    const rawMeta     = (sub.metadata as Record<string, string>) ?? {};
    const hasTrial    = !!trialEnd;
    const billingPlan = resolveBillingPlan(rawMeta.billing_plan, interval, hasTrial);

    const stripeStatus: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'none' =
      status === 'trialing' ? 'trialing'
      : status === 'active' ? 'active'
      : status === 'past_due' ? 'past_due'
      : status === 'canceled' ? 'cancelled'
      : 'active';

    console.log('[stripe-webhook] subscription.created — customer:', customerId, '| plan:', billingPlan, '| interval:', interval, '| status:', stripeStatus);

    if (!customerId) {
      return json({ received: true, warning: 'no_customer_id' });
    }

    const userId = await findUserByCustomerId(db, customerId);
    if (!userId) {
      console.error('[stripe-webhook] subscription.created: no profile for customer:', customerId);
      return json({ received: true, warning: 'user_not_found', customer_id: customerId });
    }

    const { error } = await db
      .from('profiles')
      .update({
        billing_plan:           billingPlan,
        subscription_status:    stripeStatus,
        stripe_subscription_id: subId,
        stripe_customer_id:     customerId,
        trial_ends_at:          trialEnd,
        subscription_period_end: periodEnd,
      })
      .eq('user_id', userId);

    if (error) console.error('[stripe-webhook] subscription.created profile update failed:', JSON.stringify(error));
    else console.log('[stripe-webhook] subscription.created — profile updated:', userId, billingPlan, stripeStatus);

    return json({ received: true, billing_plan: billingPlan, status: stripeStatus });
  }

  // ── customer.subscription.updated ────────────────────────────────────────
  if (eventType === 'customer.subscription.updated') {
    const sub        = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;
    const customerId = (sub.customer as string) ?? null;
    const subId      = (sub.id as string) ?? null;
    const trialEnd   = sub.trial_end ? new Date((sub.trial_end as number) * 1000).toISOString() : null;
    const periodEnd  = sub.current_period_end ? new Date((sub.current_period_end as number) * 1000).toISOString() : null;
    const status     = (sub.status as string) ?? 'active';

    const stripeStatus: string =
      status === 'trialing' ? 'trialing'
      : status === 'active' ? 'active'
      : status === 'past_due' ? 'past_due'
      : status === 'canceled' ? 'cancelled'
      : status;

    const items    = (sub.items as Record<string, unknown>)?.data as Array<Record<string, unknown>> ?? [];
    const interval = (items[0]?.plan as Record<string, unknown>)?.interval as string ?? '';
    const rawMeta  = (sub.metadata as Record<string, string>) ?? {};
    const billingPlan = resolveBillingPlan(rawMeta.billing_plan, interval, !!trialEnd && status === 'trialing');

    console.log('[stripe-webhook] subscription.updated — customer:', customerId, '| status:', stripeStatus, '| plan:', billingPlan);

    if (!customerId) return json({ received: true, warning: 'no_customer_id' });

    const userId = await findUserByCustomerId(db, customerId);
    if (!userId) return json({ received: true, warning: 'user_not_found' });

    const { error } = await db
      .from('profiles')
      .update({
        billing_plan:           billingPlan,
        subscription_status:    stripeStatus,
        stripe_subscription_id: subId,
        trial_ends_at:          trialEnd,
        subscription_period_end: periodEnd,
      })
      .eq('user_id', userId);

    if (error) console.error('[stripe-webhook] subscription.updated profile update failed:', JSON.stringify(error));

    return json({ received: true, billing_plan: billingPlan, status: stripeStatus });
  }

  // ── customer.subscription.deleted ────────────────────────────────────────
  if (eventType === 'customer.subscription.deleted') {
    const sub        = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;
    const customerId = (sub.customer as string) ?? null;

    console.log('[stripe-webhook] subscription.deleted — customer:', customerId);

    if (!customerId) return json({ received: true, warning: 'no_customer_id' });

    const userId = await findUserByCustomerId(db, customerId);
    if (!userId) return json({ received: true, warning: 'user_not_found' });

    const { error } = await db
      .from('profiles')
      .update({ subscription_status: 'cancelled' })
      .eq('user_id', userId);

    if (error) console.error('[stripe-webhook] subscription.deleted profile update failed:', JSON.stringify(error));
    else console.log('[stripe-webhook] subscription.deleted — marked cancelled:', userId);

    return json({ received: true, status: 'cancelled' });
  }

  // ── invoice.payment_succeeded ─────────────────────────────────────────────
  if (eventType === 'invoice.payment_succeeded') {
    const invoice    = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;
    const customerId = (invoice.customer as string) ?? null;
    const periodEnd  = invoice.lines
      ? ((invoice.lines as Record<string, unknown>).data as Array<Record<string, unknown>>)?.[0]
          ?.period?.end
      : null;

    const periodEndIso = periodEnd ? new Date((periodEnd as number) * 1000).toISOString() : null;

    console.log('[stripe-webhook] invoice.payment_succeeded — customer:', customerId);

    if (!customerId) return json({ received: true, warning: 'no_customer_id' });

    const userId = await findUserByCustomerId(db, customerId);
    if (!userId) return json({ received: true, warning: 'user_not_found' });

    const update: Record<string, unknown> = { subscription_status: 'active' };
    if (periodEndIso) update.subscription_period_end = periodEndIso;

    // If this is the first real charge after trial, move billing_plan from 'trial' → 'yearly'
    const { data: profile } = await db
      .from('profiles')
      .select('billing_plan')
      .eq('user_id', userId)
      .single();

    if (profile?.billing_plan === 'trial') {
      update.billing_plan = 'yearly';
    }

    const { error } = await db.from('profiles').update(update).eq('user_id', userId);
    if (error) console.error('[stripe-webhook] invoice.payment_succeeded profile update failed:', JSON.stringify(error));
    else console.log('[stripe-webhook] invoice.payment_succeeded — subscription renewed:', userId, '| period_end:', periodEndIso ?? 'unknown');

    return json({ received: true, status: 'active' });
  }

  // ── invoice.payment_failed ────────────────────────────────────────────────
  if (eventType === 'invoice.payment_failed') {
    const invoice    = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;
    const customerId = (invoice.customer as string) ?? null;

    console.log('[stripe-webhook] invoice.payment_failed — customer:', customerId);

    if (!customerId) return json({ received: true, warning: 'no_customer_id' });

    const userId = await findUserByCustomerId(db, customerId);
    if (!userId) return json({ received: true, warning: 'user_not_found' });

    const { error } = await db
      .from('profiles')
      .update({ subscription_status: 'past_due' })
      .eq('user_id', userId);

    if (error) console.error('[stripe-webhook] invoice.payment_failed profile update failed:', JSON.stringify(error));
    else console.log('[stripe-webhook] invoice.payment_failed — marked past_due:', userId);

    return json({ received: true, status: 'past_due' });
  }

  // All other event types — acknowledge to prevent Stripe retries
  console.log('[stripe-webhook] unhandled event type acknowledged:', eventType);
  return json({ received: true, type: eventType });
});
