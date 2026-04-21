/**
 * Sentry initialization for the Snippd web app.
 *
 * CRITICAL: This file MUST be the FIRST import in `src/main.jsx`. Sentry has
 * to initialize before React renders so it can capture errors thrown during
 * early hydration, route registration, and async module boot.
 *
 * Config source: environment variables injected by Vite. Only `VITE_*` vars
 * are exposed to the client bundle, so the DSN (a public identifier) is
 * fine to ship. Auth tokens / service keys must NEVER be `VITE_*`.
 */

import * as Sentry from "@sentry/react";
import React from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

const DSN =
  import.meta.env.VITE_SENTRY_DSN ||
  // Fallback DSN provided by the founder on 2026-04-21. Safe to ship (public key).
  "https://b234427f0980f25b65b10aa986e617cd@o4511256923537408.ingest.us.sentry.io/4511257095045120";

const ENV = import.meta.env.MODE || "development";
const RELEASE =
  import.meta.env.VITE_APP_VERSION ||
  import.meta.env.VITE_GIT_SHA ||
  "snippd-web@dev";

Sentry.init({
  dsn: DSN,
  environment: ENV,
  release: RELEASE,

  // Includes IP + user-agent; required to correlate with Supabase auth user ids
  // downstream. Keep redaction explicit (see beforeSend below) — no raw emails,
  // no receipt OCR text, no coupon codes land in events.
  sendDefaultPii: true,

  integrations: [
    // React Router v7 non-framework mode — the app uses <BrowserRouter> in
    // src/App.jsx, not createBrowserRouter. The hook-based integration is the
    // right call here.
    Sentry.reactRouterV7BrowserTracingIntegration({
      useEffect: React.useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
    // Visual session replay: mask text + block media by default to keep PII
    // out of recordings. Error sessions always fully recorded (see below).
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Tracing
  tracesSampleRate: ENV === "production" ? 0.2 : 1.0,
  tracePropagationTargets: [
    "localhost",
    /^https:\/\/.*\.supabase\.co/,
    /^https:\/\/.*\.firebaseio\.com/,
    /^https:\/\/.*\.cloudfunctions\.net/,
    /^https:\/\/.*\.run\.app/,
    /^https:\/\/aiplatform\.googleapis\.com/,
  ],

  // Session Replay sampling
  replaysSessionSampleRate: ENV === "production" ? 0.1 : 0.25,
  replaysOnErrorSampleRate: 1.0,

  // Structured logging surface (Sentry.logger.*)
  enableLogs: true,

  /**
   * Last-mile PII redaction. The Snippd app handles receipt OCR text, coupon
   * clip codes, and Supabase service errors that may echo user input. Strip
   * anything that looks sensitive before it leaves the browser.
   */
  beforeSend(event) {
    try {
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers?.authorization) {
        event.request.headers.authorization = "[Filtered]";
      }
      if (event.extra) {
        for (const key of Object.keys(event.extra)) {
          if (/receipt|coupon_code|otp|ssn|dob/i.test(key)) {
            event.extra[key] = "[Filtered]";
          }
        }
      }
    } catch {
      /* never block the pipeline on redaction errors */
    }
    return event;
  },
});

export { Sentry };
