// supabase/functions/create-checkout-session/index.ts
// Creates a Stripe Checkout session and returns the hosted URL.
// Metadata keys must match stripe-webhook expectations:
//   metadata.tier         = 'founder' | 'beta_pro'
//   metadata.billing_plan = 'yearly' | 'monthly'
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY            — sk_live_... or sk_test_...
//   STRIPE_PRICE_LIFETIME_97     — Stripe price ID for the $97 one-time founder tier
//   STRIPE_PRICE_MONTHLY_499     — Stripe price ID for the $4.99/month beta subscription
//
// Configure in Dashboard → Project Settings → Edge Functions → Secrets.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization' }, 401);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY not configured' }, 500);

  let body: { priceId?: string; successUrl?: string; cancelUrl?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { priceId, successUrl, cancelUrl } = body;
  if (!priceId || !successUrl) return json({ error: 'priceId and successUrl are required' }, 400);

  // Resolve plan metadata from priceId prefix
  // Frontend sends PLANS[key].priceId — keys contain 'lifetime' or 'monthly'
  const isLifetime = priceId.includes('lifetime');
  const tier         = isLifetime ? 'founder'   : 'beta_pro';
  const billingPlan  = isLifetime ? 'yearly'    : 'monthly';
  const mode         = isLifetime ? 'payment'   : 'subscription';

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode,
      line_items:  [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url:  cancelUrl ?? successUrl,
      // stripe-webhook resolves user by customer_details.email — require it
      customer_email: undefined, // Stripe collects email at checkout
      metadata: { tier, billing_plan: billingPlan },
    };

    // Monthly plan: 3-day free trial
    if (!isLifetime) {
      sessionParams.subscription_data = {
        trial_period_days: 3,
        metadata: { tier, billing_plan: billingPlan },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stripe error';
    console.error('[create-checkout-session]', msg);
    return json({ error: msg }, 500);
  }
});
