// Supabase Edge Function: create-checkout-session
//
// Snippd Pro ($4.99/mo) Stripe Checkout Session minter. Called from the
// browser at /pro via src/lib/stripe.js :: startSnippdProCheckout.
//
// Deploy:
//   supabase functions deploy create-checkout-session --no-verify-jwt
//
// Secrets (set once per project):
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//   supabase secrets set STRIPE_PRICE_SNIPPD_PRO=price_...
//   supabase secrets set SNIPPD_ALLOWED_ORIGINS=https://snippd.app,http://localhost:5173,http://localhost:5174
//
// Design notes:
// - This function is the ONLY place the Stripe secret key lives. The
//   browser never sees it. The frontend only holds the publishable key
//   and the price ID (both public-safe).
// - The client sends a `price_id` but we IGNORE it and use the server-side
//   STRIPE_PRICE_SNIPPD_PRO secret. This prevents a tampered client from
//   changing the price to $0.01.
// - Origin allowlist prevents random sites from abusing the endpoint to
//   mint Checkout URLs against our Stripe account.
// - Input sizes capped; all errors reported to Sentry (if SENTRY_DSN set).

// @ts-expect-error Deno global is only defined in the Supabase edge runtime.
const denoEnv = Deno.env;

const STRIPE_SECRET_KEY = denoEnv.get("STRIPE_SECRET_KEY") || "";
const STRIPE_PRICE_SNIPPD_PRO = denoEnv.get("STRIPE_PRICE_SNIPPD_PRO") || "";
const ALLOWED_ORIGINS = (denoEnv.get("SNIPPD_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SENTRY_DSN = denoEnv.get("SENTRY_DSN") || "";

type CheckoutRequestBody = {
  mode?: "subscription" | "payment";
  customer_email?: string;
  client_reference_id?: string;
  success_url?: string;
  cancel_url?: string;
};

function corsHeaders(origin: string | null): HeadersInit {
  const allow =
    origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))
      ? origin
      : ALLOWED_ORIGINS[0] || "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

function json(body: unknown, init: ResponseInit & { origin?: string | null } = {}) {
  const { origin, headers, ...rest } = init;
  return new Response(JSON.stringify(body), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin ?? null),
      ...(headers || {}),
    },
  });
}

async function reportToSentry(event: Record<string, unknown>): Promise<void> {
  if (!SENTRY_DSN) return;
  try {
    const m = SENTRY_DSN.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
    if (!m) return;
    const [, publicKey, host, projectId] = m;
    const endpoint = `https://${host}/api/${projectId}/store/?sentry_key=${publicKey}&sentry_version=7`;
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "javascript",
        logger: "create-checkout-session",
        timestamp: new Date().toISOString(),
        ...event,
      }),
    });
  } catch {
    /* swallow — telemetry must never break the payment path */
  }
}

async function createCheckoutSession(body: CheckoutRequestBody) {
  const form = new URLSearchParams();
  form.set("mode", body.mode === "payment" ? "payment" : "subscription");
  form.set("line_items[0][price]", STRIPE_PRICE_SNIPPD_PRO);
  form.set("line_items[0][quantity]", "1");
  if (body.customer_email) form.set("customer_email", body.customer_email);
  if (body.client_reference_id)
    form.set("client_reference_id", body.client_reference_id);
  if (body.success_url) form.set("success_url", body.success_url);
  if (body.cancel_url) form.set("cancel_url", body.cancel_url);
  form.set("allow_promotion_codes", "true");
  form.set("subscription_data[trial_period_days]", "7");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(`Stripe ${res.status}: ${data?.error?.message || "unknown"}`), {
      status: res.status,
      stripe: data,
    });
  }
  return data as { id: string; url: string };
}

// @ts-expect-error Deno.serve is only defined in the edge runtime.
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, origin });
  }

  if (ALLOWED_ORIGINS.length > 0 && origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "origin_not_allowed" }, { status: 403, origin });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_SNIPPD_PRO) {
    await reportToSentry({
      level: "error",
      message:
        "[create-checkout-session] misconfigured: STRIPE_SECRET_KEY or STRIPE_PRICE_SNIPPD_PRO missing",
    });
    return json(
      {
        error: "not_configured",
        detail:
          "Stripe secrets are not set. Run `supabase secrets set STRIPE_SECRET_KEY=... STRIPE_PRICE_SNIPPD_PRO=...`.",
      },
      { status: 503, origin }
    );
  }

  let body: CheckoutRequestBody;
  try {
    const text = await req.text();
    if (text.length > 4096) {
      return json({ error: "payload_too_large" }, { status: 413, origin });
    }
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "invalid_json" }, { status: 400, origin });
  }

  if (body.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer_email)) {
    return json({ error: "invalid_email" }, { status: 400, origin });
  }
  for (const k of ["success_url", "cancel_url"] as const) {
    const v = body[k];
    if (v && !/^https?:\/\//.test(v)) {
      return json({ error: `invalid_${k}` }, { status: 400, origin });
    }
  }

  try {
    const session = await createCheckoutSession(body);
    return json({ id: session.id, url: session.url }, { status: 200, origin });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportToSentry({
      level: "error",
      message: `[create-checkout-session] ${msg}`,
      // @ts-expect-error runtime access
      extra: { stripe: err?.stripe },
    });
    return json({ error: "checkout_failed", detail: msg }, { status: 502, origin });
  }
});
