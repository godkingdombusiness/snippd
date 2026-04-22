import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { emitUserSignedIn } from "@/lib/behavior";

/**
 * Email/password sign-in. After Supabase establishes a session, `MissionProvider`
 * subscribes to `onAuthStateChange` and re-hydrates `current_mission` from Supabase.
 */
export default function SignInScreen() {
  const nav = useNavigate();
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
    </div>
  );
}
