import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { supabase } from "@/lib/supabase";
import { stripeConfig } from "@/lib/stripe";

// Account Settings — the legally-required self-service surface.
// Apple App Store Review Guideline 5.1.1(v) mandates an in-app way to
// delete an account and all associated data. That path lives here.

const DELETE_CONFIRM_PHRASE = "delete my account";

function deleteAccountEndpoint() {
  const explicit = import.meta.env.VITE_SNIPPD_DELETE_ACCOUNT_URL;
  if (explicit) return String(explicit);
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return "";
  return `${String(base).replace(/\/+$/, "")}/functions/v1/delete-account`;
}

export default function SettingsScreen() {
  const nav = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data?.user ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function onDelete(e) {
    e.preventDefault();
    if (confirmText.trim().toLowerCase() !== DELETE_CONFIRM_PHRASE) {
      setError(`Type "${DELETE_CONFIRM_PHRASE}" to confirm.`);
      return;
    }
    setError(null);
    setDeleting(true);

    const endpoint = deleteAccountEndpoint();
    if (!endpoint) {
      setDeleting(false);
      setError(
        "Deletion endpoint is not configured. Email hello@getsnippd.com — we'll delete your account by hand within 24h.",
      );
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setDeleting(false);
        setError("Session expired. Sign out and back in, then try again.");
        return;
      }
      Sentry.addBreadcrumb({
        category: "account",
        level: "warning",
        message: "delete_account: user confirmed deletion",
      });

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ initiatedAt: new Date().toISOString() }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`delete-account returned ${res.status}: ${body.slice(0, 200)}`);
      }

      // Auth row is gone; local session token is now invalid. Sign out
      // defensively so the next request doesn't 401 with a stale JWT.
      await supabase.auth.signOut().catch(() => {});
      nav("/login?deleted=1", { replace: true });
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: "delete_account" } });
      setDeleting(false);
      setError(
        "We couldn't complete deletion. Try again, or email hello@getsnippd.com and we'll finish it by hand.",
      );
    }
  }

  if (loading) {
    return (
      <div className="snippd-screen">
        <p>Loading account…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="snippd-screen">
        <p>
          You're signed out. <Link to="/login">Sign in</Link> to manage your
          account.
        </p>
      </div>
    );
  }

  const hasStripe = Boolean(stripeConfig?.customerPortalUrl);

  return (
    <div className="snippd-screen" style={{ maxWidth: 640 }}>
      <h1>Account</h1>

      <section className="snippd-section" style={{ marginTop: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.35rem" }}>Signed in as</h2>
        <p style={{ margin: 0 }}>
          <strong>{user.email || user.id}</strong>
        </p>
      </section>

      <section className="snippd-section" style={{ marginTop: "1.75rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.35rem" }}>Subscription</h2>
        {hasStripe ? (
          <p style={{ margin: 0 }}>
            <a
              href={stripeConfig.customerPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage subscription
            </a>
            {" "}(opens Stripe).
          </p>
        ) : (
          <p className="snippd-muted" style={{ margin: 0 }}>
            To cancel, change, or request a refund, email{" "}
            <a href="mailto:hello@getsnippd.com">hello@getsnippd.com</a>. We
            reply within one business day.
          </p>
        )}
      </section>

      <section className="snippd-section" style={{ marginTop: "1.75rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.35rem" }}>Export my data</h2>
        <p className="snippd-muted" style={{ margin: 0 }}>
          Email{" "}
          <a href="mailto:privacy@getsnippd.com?subject=Snippd%20data%20export%20request">
            privacy@getsnippd.com
          </a>{" "}
          and we'll send a machine-readable export within 30 days.
        </p>
      </section>

      <section
        className="snippd-section"
        style={{
          marginTop: "2rem",
          padding: "1rem 1.25rem",
          borderRadius: 12,
          border: "1px solid rgba(220, 50, 47, 0.45)",
          background: "rgba(220, 50, 47, 0.06)",
        }}
      >
        <h2 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "0.35rem", color: "#d93a2e" }}>
          Delete my account
        </h2>
        <p className="snippd-muted" style={{ marginTop: 0 }}>
          Permanently removes your account, plan + list history, behavioral
          graph data, and any active Stripe subscription. This cannot be
          undone. Receipt images already deleted at verify-time are not
          recoverable.
        </p>
        <form onSubmit={onDelete} style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
          <label>
            <span className="snippd-muted" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem" }}>
              Type <code>{DELETE_CONFIRM_PHRASE}</code> to confirm:
            </span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting}
              autoComplete="off"
              spellCheck={false}
              style={{ width: "100%" }}
            />
          </label>
          <button
            type="submit"
            disabled={deleting || confirmText.trim().toLowerCase() !== DELETE_CONFIRM_PHRASE}
            style={{
              background: "#d93a2e",
              color: "white",
              border: 0,
              borderRadius: 8,
              padding: "0.6rem 1rem",
              fontWeight: 600,
              cursor:
                deleting || confirmText.trim().toLowerCase() !== DELETE_CONFIRM_PHRASE
                  ? "not-allowed"
                  : "pointer",
              opacity:
                deleting || confirmText.trim().toLowerCase() !== DELETE_CONFIRM_PHRASE ? 0.6 : 1,
            }}
          >
            {deleting ? "Deleting…" : "Delete my account permanently"}
          </button>
          {error ? (
            <p className="snippd-msg" role="alert" style={{ color: "#d93a2e", margin: 0 }}>
              {error}
            </p>
          ) : null}
        </form>
        <p className="snippd-muted" style={{ fontSize: "0.8rem", marginTop: "0.75rem", marginBottom: 0 }}>
          See our <Link to="/privacy">Privacy Policy</Link> for what we store
          and how deletion cascades.
        </p>
      </section>
    </div>
  );
}
