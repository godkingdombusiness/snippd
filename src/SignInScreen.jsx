import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { supabase } from "@/lib/supabase";
import { emitUserSignedIn } from "@/lib/behavior";
import LegalFooter from "@/components/LegalFooter";

/**
 * Sign-in / sign-up screen.
 *
 * Two auth paths:
 *   1. Email + password via `signInWithPassword` / `signUp`.
 *   2. Google OAuth via `signInWithOAuth` → Google consent → Supabase
 *      callback → our /auth/callback route (see `AuthCallbackScreen`) →
 *      /plan.
 *
 * After Supabase establishes a session, `MissionProvider` subscribes to
 * `onAuthStateChange` and re-hydrates `current_mission` from Supabase.
 *
 * Guards that were missing and are now present:
 *   - If the user hits /login while already authenticated, we forward to
 *     /plan instead of rendering the form. This fixes the "I authenticated
 *     but the app keeps showing me the login screen" bug.
 *   - Google sign-in uses `redirectTo: <origin>/auth/callback` so the PKCE
 *     code lands on a route that knows how to exchange it for a session.
 *   - All long-running calls are guarded by a local loading state so the
 *     button can't be double-clicked into a timeout.
 */
export default function SignInScreen() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const justDeleted = searchParams.get("deleted") === "1";
  const callbackError = searchParams.get("err");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(
    callbackError ? decodeURIComponent(callbackError) : ""
  );
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // If we already have a session (e.g. the user came back to /login via a
  // bookmark after OAuth completed on another tab), send them straight to
  // /plan. Without this guard, users who finish Google auth but land on
  // /login see the form again and assume login failed — which is exactly
  // the "doesn't redirect me back to logging in" symptom.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data?.session) {
        nav("/plan", { replace: true });
        return;
      }
      setCheckingSession(false);
    });
    return () => {
      cancelled = true;
    };
  }, [nav]);

  async function onSignIn(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      if (data?.user?.id) {
        emitUserSignedIn({ userId: data.user.id }).catch(() => {});
      }
      nav("/plan", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  async function onSignUp(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      setMsg("Check your email to confirm, then sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleSignIn() {
    setMsg("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          // `select_account` forces Google to show the account chooser
          // every time instead of silently signing in the last-used
          // account. This matters when the user has multiple Google
          // accounts and wants to pick which one to associate with Snippd.
          queryParams: {
            prompt: "select_account",
            access_type: "offline",
          },
        },
      });
      if (error) {
        Sentry.captureException(error, {
          tags: { subsystem: "auth", step: "google_kickoff" },
        });
        setMsg(error.message);
        setBusy(false);
      }
      // On success, the browser has already navigated to accounts.google.com;
      // there is nothing more to do in this component. Don't clear busy —
      // the whole page is about to unload.
    } catch (err) {
      Sentry.captureException(err, {
        tags: { subsystem: "auth", step: "google_kickoff_threw" },
      });
      setMsg(err?.message || "Couldn't reach Google. Try email + password.");
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="snippd-screen snippd-card" style={{ textAlign: "center" }}>
        <h1>Snippd</h1>
        <p className="snippd-muted">Checking sign-in…</p>
      </div>
    );
  }

  return (
    <div className="snippd-screen snippd-card">
      <h1>Snippd Concierge</h1>
      {justDeleted ? (
        <div
          role="status"
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            background: "rgba(108, 198, 68, 0.12)",
            border: "1px solid rgba(108, 198, 68, 0.4)",
          }}
        >
          Your account and associated data have been deleted. Thanks for
          using Snippd.
        </div>
      ) : null}
      <p className="snippd-muted">
        Signing in restores your active mission from <code>current_mission</code>{" "}
        automatically.
      </p>

      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={busy}
        aria-label="Continue with Google"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          width: "100%",
          padding: "0.75rem 1rem",
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.2)",
          background: "#ffffff",
          color: "#1f1f1f",
          fontWeight: 600,
          fontSize: "0.95rem",
          cursor: busy ? "wait" : "pointer",
          marginBottom: "1rem",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
          />
        </svg>
        Continue with Google
      </button>

      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          opacity: 0.6,
          fontSize: "0.78rem",
          margin: "0.5rem 0 1rem",
        }}
      >
        <div
          style={{
            flex: 1,
            height: 1,
            background: "rgba(255,255,255,0.18)",
          }}
        />
        or with email
        <div
          style={{
            flex: 1,
            height: 1,
            background: "rgba(255,255,255,0.18)",
          }}
        />
      </div>

      <form className="snippd-form" onSubmit={onSignIn}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <div className="snippd-row">
          <button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            className="snippd-secondary"
            onClick={onSignUp}
            disabled={busy}
          >
            Create account
          </button>
        </div>
      </form>
      {msg ? <p className="snippd-msg">{msg}</p> : null}
      <p className="snippd-muted" style={{ fontSize: "0.82rem", marginTop: "1.25rem" }}>
        By creating an account you agree to our{" "}
        <Link to="/terms">Terms</Link> and{" "}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
      <LegalFooter />
    </div>
  );
}
