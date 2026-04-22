// Stripe Checkout launcher for Snippd Pro ($4.99/mo).
//
// Why this shape:
// - The Stripe *publishable* key + the Price ID are public-safe and live in
//   VITE_ env vars so the bundle can launch Checkout directly.
// - For production we POST to a Supabase Edge Function (or equivalent
//   serverless endpoint) that mints a Checkout Session using the SECRET key.
//   That endpoint URL is VITE_STRIPE_CHECKOUT_URL.
// - If neither is configured, we fall back to a "preview mode" that logs
//   the intent and surfaces a UI message — so the landing page is always
//   shippable without blocking on Stripe onboarding.

import * as Sentry from "@sentry/react";

const PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_SNIPPD_PRO;
const CHECKOUT_URL = import.meta.env.VITE_STRIPE_CHECKOUT_URL;
const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

export const stripeConfig = Object.freeze({
  priceId: PRICE_ID || null,
  checkoutUrl: CHECKOUT_URL || null,
  publishableKey: PUBLISHABLE_KEY || null,
  isLive: Boolean(PRICE_ID && (CHECKOUT_URL || PUBLISHABLE_KEY)),
});

/**
 * Start a Snippd Pro checkout session.
 *
 * @param {object} opts
 * @param {string} [opts.email]    Pre-fill customer email.
 * @param {string} [opts.userId]   Supabase user id, passed as client_reference_id.
 * @param {string} [opts.successUrl] Override success redirect.
 * @param {string} [opts.cancelUrl]  Override cancel redirect.
 * @returns {Promise<{ status: 'redirected' | 'preview' | 'error', reason?: string }>}
 */
export async function startSnippdProCheckout(opts = {}) {
  const { email, userId, successUrl, cancelUrl } = opts;

  return Sentry.startSpan(
    {
      name: "stripe.checkout.snippd_pro",
      op: "commerce.checkout",
      attributes: {
        "stripe.price_id": stripeConfig.priceId ?? "unconfigured",
        "stripe.mode": stripeConfig.isLive ? "live" : "preview",
      },
    },
    async () => {
      if (!stripeConfig.isLive) {
        Sentry.captureMessage(
          "[stripe] Snippd Pro checkout clicked in preview mode",
          "info"
        );
        return {
          status: "preview",
          reason:
            "Stripe not yet configured. Set VITE_STRIPE_PRICE_SNIPPD_PRO and VITE_STRIPE_CHECKOUT_URL to enable.",
        };
      }

      try {
        const res = await fetch(stripeConfig.checkoutUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            price_id: stripeConfig.priceId,
            mode: "subscription",
            customer_email: email,
            client_reference_id: userId,
            success_url:
              successUrl ||
              `${window.location.origin}/pro?status=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${window.location.origin}/pro?status=cancel`,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(
            `Checkout endpoint returned ${res.status}: ${body.slice(0, 200)}`
          );
        }
        const data = await res.json();
        if (!data?.url) {
          throw new Error("Checkout response missing `url`.");
        }
        window.location.assign(data.url);
        return { status: "redirected" };
      } catch (err) {
        Sentry.captureException(err, {
          tags: { subsystem: "stripe", flow: "snippd_pro_checkout" },
        });
        return {
          status: "error",
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );
}
