# create-checkout-session

Supabase Edge Function that mints Stripe Checkout Sessions for Snippd Pro
($4.99/mo). Called from the web app at `src/lib/stripe.js`.

## Why this exists

The Stripe **secret key** can never ship to the browser. This function is
the smallest possible server-side shim that lets the `/pro` landing page
open a real Stripe Checkout without us running a full backend.

## Deploy (once)

```bash
# Install Supabase CLI: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref <your-project-ref>

# Set secrets (server-side only — never in git).
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_PRICE_SNIPPD_PRO=price_xxx
supabase secrets set SNIPPD_ALLOWED_ORIGINS=https://snippd.app,http://localhost:5173,http://localhost:5174

# Optional: pipe errors from this function into Sentry too.
supabase secrets set SENTRY_DSN=https://...ingest.us.sentry.io/...

# Deploy. --no-verify-jwt lets anonymous users hit it (needed for /pro
# landing page where the visitor may not have a Supabase session yet).
supabase functions deploy create-checkout-session --no-verify-jwt
```

After deploy, the function URL looks like:

```
https://<project-ref>.functions.supabase.co/create-checkout-session
```

Paste that into your web env:

```bash
# .env.local (or .env.production)
VITE_STRIPE_CHECKOUT_URL=https://<project-ref>.functions.supabase.co/create-checkout-session
VITE_STRIPE_PRICE_SNIPPD_PRO=price_xxx
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
```

Rebuild + deploy the web app. `/pro` will now open real Stripe Checkout.

## Request / response contract

The frontend posts:

```json
{
  "customer_email": "user@example.com",
  "client_reference_id": "<supabase auth user id>",
  "success_url": "https://snippd.app/pro?status=success&session_id={CHECKOUT_SESSION_ID}",
  "cancel_url":  "https://snippd.app/pro?status=cancel"
}
```

The function responds:

```json
{ "id": "cs_live_...", "url": "https://checkout.stripe.com/c/pay/cs_live_..." }
```

The browser then navigates to `url`.

## Security posture

- Stripe secret key never leaves Supabase.
- `price_id` is **NOT** read from the request body — it's pinned to the
  `STRIPE_PRICE_SNIPPD_PRO` secret so a tampered client can't downgrade the
  price to $0.01.
- `SNIPPD_ALLOWED_ORIGINS` acts as an allowlist — only configured origins
  get CORS + successful mint.
- Payload capped at 4 KB.
- 7-day free trial baked into the Subscription data server-side.
- All errors forwarded to Sentry (if `SENTRY_DSN` is set) so the Auditor
  agent sees checkout failures without you needing to tail function logs.

## Local dev

```bash
supabase functions serve create-checkout-session --env-file supabase/functions/create-checkout-session/.env.local
```

Where `.env.local` (gitignored) contains the same secrets as above.
Point `VITE_STRIPE_CHECKOUT_URL` at `http://localhost:54321/functions/v1/create-checkout-session` for local testing.
