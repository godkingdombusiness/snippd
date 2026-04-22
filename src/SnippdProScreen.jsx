import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { supabase } from "@/lib/supabase";
import { startSnippdProCheckout, stripeConfig } from "@/lib/stripe";

const PRICE_LABEL = "$4.99 / month";
const TRIAL_LABEL = "7-day free trial, cancel anytime";

const PRO_FEATURES = [
  {
    title: "Unlimited weekly stacks",
    body: "Every coupon + rebate + cashback combo the Snippd agent can find, not the 3-per-week Free cap.",
  },
  {
    title: "Retailer-policy verified savings",
    body: "Stacks are cross-checked against our live retailer_policies registry so your basket never surprises you at the register.",
  },
  {
    title: "Chef Meal Studio",
    body: "Turn a week's stack into a 4-meal plan with grocery list, macros, and prep time — no hunting through tabs.",
  },
  {
    title: "Priority receipt verification",
    body: "Pro scans skip the queue and get verified in under 60 seconds.",
  },
  {
    title: "Founding-member pricing, locked forever",
    body: "Your $4.99 never goes up, even when we add card-linked offers in Q3.",
  },
];

export default function SnippdProScreen() {
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const u = data?.user;
      if (u) {
        setUserId(u.id);
        if (u.email) setEmail(u.email);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (statusParam === "success") {
      setNotice(
        "You're in. Welcome to Snippd Pro — your next stack will unlock the full catalog."
      );
      Sentry.captureMessage("[stripe] Snippd Pro checkout success", "info");
    } else if (statusParam === "cancel") {
      setNotice("No charge made. Come back whenever you're ready.");
    }
  }, [statusParam]);

  const isLive = stripeConfig.isLive;

  const ctaLabel = useMemo(() => {
    if (pending) return "Opening checkout…";
    if (!isLive) return "Join the Pro waitlist";
    return `Start 7-day free trial — then ${PRICE_LABEL}`;
  }, [pending, isLive]);

  async function handleSubscribe() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await startSnippdProCheckout({ email, userId });
      if (result.status === "preview") {
        setNotice(
          "Saved your interest. Stripe isn't live yet — you'll be emailed the moment Pro opens."
        );
        // Record the signal in Supabase so the Growth agent sees demand.
        try {
          await supabase.from("pro_waitlist").insert({
            email: email || null,
            user_id: userId,
            source: "snippd_pro_landing",
          });
        } catch {
          // Table may not exist yet in dev; ignore — Sentry event from helper
          // already captures the preview-mode click.
        }
      } else if (result.status === "error") {
        setError(
          result.reason ||
            "Checkout didn't start. We've been notified and will look into it."
        );
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="snippd-screen" style={{ padding: "1.5rem 1rem 3rem" }}>
      <header className="snippd-header" style={{ textAlign: "center" }}>
        <span className="snippd-pill" style={{ marginLeft: 0 }}>Snippd Pro</span>
        <h1 style={{ fontSize: "2.25rem", margin: "0.75rem 0 0.35rem" }}>
          Stop clipping. Start stacking.
        </h1>
        <p className="snippd-muted" style={{ maxWidth: 560, margin: "0 auto" }}>
          Pro unlocks every retailer policy-verified coupon + rebate + cashback
          combo our agent finds, so your weekly grocery run actually pays you
          back. {TRIAL_LABEL}.
        </p>
        <div
          className="snippd-hero"
          style={{
            display: "inline-block",
            marginTop: "1.25rem",
            padding: "0.75rem 1.25rem",
          }}
        >
          <strong style={{ fontSize: "1.35rem" }}>{PRICE_LABEL}</strong>
          <span className="snippd-muted" style={{ marginLeft: "0.5rem" }}>
            · founding-member lock
          </span>
        </div>
      </header>

      {notice && (
        <p className="snippd-msg" style={{ textAlign: "center", marginTop: "1rem" }}>
          {notice}
        </p>
      )}
      {error && (
        <p className="snippd-error" style={{ textAlign: "center", marginTop: "1rem" }}>
          {error}
        </p>
      )}

      <section className="snippd-section" style={{ marginTop: "2rem" }}>
        <ul className="snippd-checklist">
          {PRO_FEATURES.map((f) => (
            <li key={f.title} className="snippd-check-row" style={{ alignItems: "flex-start" }}>
              <span aria-hidden style={{ fontWeight: 700, color: "#9c8bff" }}>
                ✓
              </span>
              <span style={{ flex: 1 }}>
                <strong>{f.title}</strong>
                <div className="snippd-muted" style={{ marginTop: "0.2rem" }}>
                  {f.body}
                </div>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="snippd-section" style={{ textAlign: "center", marginTop: "2rem" }}>
        <div className="snippd-inline" style={{ maxWidth: 360, margin: "0 auto 1rem" }}>
          <label htmlFor="pro-email">Email for your receipt</label>
          <input
            id="pro-email"
            type="email"
            autoComplete="email"
            placeholder="you@kitchen-table.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="snippd-primary wide"
          onClick={handleSubscribe}
          disabled={pending}
          style={{ padding: "0.85rem 1.25rem", borderRadius: 10 }}
        >
          {ctaLabel}
        </button>
        <p className="snippd-muted" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
          Payments handled by Stripe. We never see your card number. Cancel in
          one tap from your account page.
        </p>
      </section>

      <section
        className="snippd-section"
        style={{
          marginTop: "2.5rem",
          padding: "1rem 1.25rem",
          borderRadius: 12,
          border: "1px solid rgba(120, 120, 120, 0.35)",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Why Pro pays for itself in week one</h3>
        <p className="snippd-muted">
          The average Snippd Free user captures $12–$18 in verified stacks per
          week. Pro unlocks the uncapped catalog and retailer-specific policy
          stacking (e.g. Publix BOGO + Ibotta + card-linked) — most Pro users
          clear their $4.99 back on their first shop.
        </p>
        <p className="snippd-muted" style={{ marginTop: "0.75rem" }}>
          Not ready? <Link to="/plan">Keep using Snippd Free</Link> and see this
          week's capped stack first.
        </p>
      </section>

      <footer style={{ marginTop: "2.5rem", textAlign: "center", opacity: 0.7 }}>
        <small>
          Pricing shown in USD. Subscription auto-renews monthly; cancel anytime
          from your account page.
        </small>
      </footer>
    </div>
  );
}
