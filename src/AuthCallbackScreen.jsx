import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { supabase } from "@/lib/supabase";
import { emitUserSignedIn } from "@/lib/behavior";

/**
 * OAuth callback landing page.
 *
 * Supabase redirects here after the user authenticates with Google (or any
 * other OAuth provider). Two things can be in the URL depending on the flow:
 *
 *   1. PKCE flow (what we use):     ?code=<one-time-code>
 *   2. Implicit flow (legacy):      #access_token=<jwt>&refresh_token=...
 *
 * The Supabase client with `detectSessionInUrl: true` (configured in
 * `src/lib/supabase.ts`) normally handles both automatically — BUT a race
 * condition exists on first render where React Router can navigate away
 * before the exchange completes, which is why the app used to "authenticate
 * but never redirect back."
 *
 * This screen:
 *   1. Explicitly exchanges `?code` for a session so we never race.
 *   2. Falls back to `getSession()` (which handles the hash-fragment case
 *      and is cheap to call).
 *   3. Redirects to /plan on success, /login with an error on failure.
 *   4. Imposes a 15s timeout so the user never sees an infinite "signing
 *      in…" spinner — the old UX would hang forever if Supabase hung.
 */
export default function AuthCallbackScreen() {
  const nav = useNavigate();
  const [status, setStatus] = useState("Finishing sign-in…");
  const ran = useRef(false);

  useEffect(() => {
    // React 18 strict mode runs effects twice in dev. We can only exchange the
    // code once — the second call errors with "code already exchanged" and
    // blows away the valid session from the first call. Guard with a ref.
    if (ran.current) return;
    ran.current = true;

    let timeoutId;
    const hardTimeout = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Timed out waiting for Supabase to finish sign-in.")),
        15_000
      );
    });

    async function completeSignIn() {
      const href = typeof window !== "undefined" ? window.location.href : "";
      const url = new URL(href);
      const code = url.searchParams.get("code");
      const errorParam = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      if (errorParam) {
        throw new Error(
          errorDescription
            ? decodeURIComponent(errorDescription.replace(/\+/g, " "))
            : errorParam
        );
      }

      // PKCE path — explicit exchange. This is the primary path for
      // signInWithOAuth; the full href is required because Supabase pulls
      // both the code and the code-verifier (stored in localStorage by the
      // kickoff call) to complete the exchange.
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(href);
        if (error) throw error;
        return data?.session || null;
      }

      // Hash-fragment (implicit) fallback. Supabase reads the hash on init
      // when `detectSessionInUrl: true`, so by the time this component
      // mounts the session is usually already present. Poll briefly for it.
      for (let i = 0; i < 10; i++) {
        const { data } = await supabase.auth.getSession();
        if (data?.session) return data.session;
        await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error(
        "No sign-in code found in the callback URL. The Google redirect " +
          "may be misconfigured — verify Authorized Redirect URIs include " +
          `${window.location.origin}/auth/callback in Supabase and Google.`
      );
    }

    Promise.race([completeSignIn(), hardTimeout])
      .then((session) => {
        clearTimeout(timeoutId);
        // Strip `?code=...&state=...` from the URL so a user refreshing the
        // page doesn't attempt a double-exchange (which would fail).
        try {
          window.history.replaceState({}, "", "/auth/callback");
        } catch {
          /* non-fatal */
        }
        if (session?.user?.id) {
          emitUserSignedIn({ userId: session.user.id }).catch(() => {});
        }
        setStatus("Signed in. Loading your plan…");
        nav("/plan", { replace: true });
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        Sentry.captureException(err, {
          tags: { subsystem: "auth", step: "oauth_callback" },
        });
        const message =
          err?.message ||
          "Sign-in didn't complete. Try again or use email + password below.";
        setStatus(`Sign-in failed — ${message}`);
        setTimeout(() => {
          nav(`/login?err=${encodeURIComponent(message)}`, { replace: true });
        }, 1200);
      });

    return () => clearTimeout(timeoutId);
  }, [nav]);

  return (
    <div className="snippd-screen snippd-card" style={{ textAlign: "center" }}>
      <h1>Snippd</h1>
      <div
        role="status"
        aria-live="polite"
        style={{ marginTop: "1.5rem", opacity: 0.85 }}
      >
        {status}
      </div>
      <div
        aria-hidden="true"
        style={{
          marginTop: "1rem",
          fontSize: "0.85rem",
          opacity: 0.6,
        }}
      >
        This should only take a second.
      </div>
    </div>
  );
}
