import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  BrowserRouter,
  Routes,
  Outlet,
  Link,
} from "react-router-dom";
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
import "./App.css";

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
      </nav>
      <main className="snippd-main">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MissionProvider>
        <Routes>
          <Route path="/login" element={<SignInScreen />} />
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
        </Routes>
      </MissionProvider>
    </BrowserRouter>
  );
}
