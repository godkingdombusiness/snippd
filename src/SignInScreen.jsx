import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { emitUserSignedIn } from "@/lib/behavior";
import LegalFooter from "@/components/LegalFooter";

/**
 * Email/password sign-in. After Supabase establishes a session, `MissionProvider`
 * subscribes to `onAuthStateChange` and re-hydrates `current_mission` from Supabase.
 */
export default function SignInScreen() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const justDeleted = searchParams.get("deleted") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function onSignIn(e) {
    e.preventDefault();
    setMsg("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(error.message);
      return;
    }
    if (data?.user?.id) {
      emitUserSignedIn({ userId: data.user.id });
    }
    nav("/plan", { replace: true });
  }

  async function onSignUp(e) {
    e.preventDefault();
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("Check your email to confirm, then sign in.");
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
          <button type="submit">Sign in</button>
          <button type="button" className="snippd-secondary" onClick={onSignUp}>
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
