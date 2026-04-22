import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  BrowserRouter,
  Routes,
  Outlet,
  Link,
} from "react-router-dom";
import * as Sentry from "@sentry/react";
import { supabase } from "@/lib/supabase";
import { MissionProvider } from "@/context/MissionProvider";
import SignInScreen from "@/SignInScreen";
import WeeklyPlanScreen from "@/WeeklyPlanScreen";
import MyListScreen from "@/MyListScreen";
import CheckoutScreen from "@/CheckoutScreen";
import ReceiptVerifiedScreen from "@/ReceiptVerifiedScreen";
import ChefStashScreen from "@/ChefStashScreen";
import ChefMealScreen from "@/ChefMealScreen";
import StudioScreen from "@/StudioScreen";
import DebugScreen from "@/DebugScreen";
import SnippdProScreen from "@/SnippdProScreen";
import "./App.css";

// React Router v7 + Sentry: wrap the plain Routes component so route spans
// and transaction names track the app's navigation automatically.
const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);

function SentryErrorFallback() {
  return (
    <div className="snippd-screen" style={{ padding: "2rem" }}>
      <h2>Something broke.</h2>
      <p>
        The issue has been reported to our on-call team. Try refreshing the
        page or tap Back. If it keeps happening, check{" "}
        <Link to="/debug">/debug</Link> to confirm the pipeline is healthy.
      </p>
    </div>
  );
}

function AuthGate() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="snippd-screen">
        <p>Loading session…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function Shell() {
  return (
    <div className="snippd-app">
      <nav className="snippd-nav">
        <Link to="/plan">Plan</Link>
        <Link to="/list">Clip &amp; list</Link>
        <Link to="/checkout">Checkout</Link>
        <Link to="/verify">Verify</Link>
        <Link to="/chef">Chef</Link>
        <Link to="/studio">Studio</Link>
        <Link
          to="/pro"
          style={{
            marginLeft: "auto",
            padding: "0.25rem 0.75rem",
            borderRadius: 999,
            background: "linear-gradient(135deg, #6f6cff, #9c8bff)",
            color: "#0b0b10",
          }}
        >
          Pro · $4.99
        </Link>
        <Link to="/debug" style={{ opacity: 0.6 }}>
          Debug
        </Link>
      </nav>
      <main className="snippd-main">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<SentryErrorFallback />} showDialog={false}>
      <BrowserRouter>
        <MissionProvider>
          <SentryRoutes>
            <Route path="/login" element={<SignInScreen />} />
            {/* Debug console is intentionally unauthenticated so the
                founder can verify the Sentry→Slack bridge from any device. */}
            <Route path="/debug" element={<DebugScreen />} />
            {/* Pro landing page is public so we can drive traffic to it
                from social and unauthenticated referrals. Checkout still
                requires an email (captured on the page). */}
            <Route path="/pro" element={<SnippdProScreen />} />
            <Route element={<AuthGate />}>
              <Route element={<Shell />}>
                <Route path="/plan" element={<WeeklyPlanScreen />} />
                <Route path="/list" element={<MyListScreen />} />
                <Route path="/checkout" element={<CheckoutScreen />} />
                <Route path="/verify" element={<ReceiptVerifiedScreen />} />
                <Route path="/chef/:slot" element={<ChefMealScreen />} />
                <Route path="/chef" element={<ChefStashScreen />} />
                <Route path="/studio" element={<StudioScreen />} />
              </Route>
              <Route path="/" element={<Navigate to="/plan" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/plan" replace />} />
          </SentryRoutes>
        </MissionProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  );
}
