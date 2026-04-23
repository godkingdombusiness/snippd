# Google OAuth (Continue with Google) — how the full path works

This document exists because the flow has three places it can silently break,
and 90% of the time the app code is correct — it's the dashboard config on
Supabase or Google Cloud that's wrong. When a user reports "Google login
times out and doesn't redirect back," check these three places in order.

## The flow, end-to-end

```
[1] User clicks "Continue with Google" on /login
         │
         ▼
[2] supabase.auth.signInWithOAuth({ provider: "google",
                                     redirectTo: "<origin>/auth/callback" })
         │  Supabase 302 → accounts.google.com
         ▼
[3] User authenticates with Google + grants consent
         │
         │  Google 302 → https://<project-ref>.supabase.co/auth/v1/callback
         ▼                (this URL is owned by Supabase, not by us)
[4] Supabase verifies the Google response, issues a PKCE `code`
         │
         │  Supabase 302 → <origin>/auth/callback?code=<pkce-code>&state=...
         ▼
[5] AuthCallbackScreen.jsx calls supabase.auth.exchangeCodeForSession(href)
         │
         │  Supabase returns { session, user }
         ▼
[6] MissionProvider sees `onAuthStateChange("SIGNED_IN", ...)` and
    rehydrates the mission; AuthCallbackScreen navigates to /plan.
```

## Checklist — what must be configured where

### 1. Supabase dashboard → Authentication → Providers → Google

- [x] **Enable Google** toggle is on.
- [x] **Client ID** = the Google Cloud OAuth 2.0 Client ID (ends in
      `.apps.googleusercontent.com`).
- [x] **Client Secret** = the matching Client Secret from Google Cloud.
- [x] **Skip nonce check** is OFF (leave it default-off; the web flow needs
      the nonce to prevent replay).

### 2. Supabase dashboard → Authentication → URL Configuration

- [x] **Site URL** = the canonical production URL, e.g.
      `https://snippd.app`. If you're testing a preview deploy, add both.
- [x] **Redirect URLs** — MUST include every origin the app runs on PLUS
      the `/auth/callback` path. Glob syntax is supported. Use:
      ```
      https://snippd.app/auth/callback
      https://snippd.app/**
      https://*.vercel.app/auth/callback
      http://localhost:5173/auth/callback
      http://localhost:5173/**
      ```
      The Supabase callback step (step 4 above) refuses to redirect to a
      URL not in this allow-list — that's the single most common cause of
      "authenticated with Google but never came back to the app." Silent
      failure: you'll see `?error=redirect_uri_not_allowed` in the URL,
      which our AuthCallbackScreen surfaces in its error banner.

### 3. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs

The Client ID from step 1 has its own Authorized Redirect URIs list.
Google won't send step 3 back to Supabase unless Supabase's
`/auth/v1/callback` URL is explicitly allow-listed here:

- [x] **Authorized JavaScript origins** — add every origin the app runs
      on:
      ```
      https://snippd.app
      http://localhost:5173
      ```
- [x] **Authorized redirect URIs** — add the Supabase callback URL, which
      is printed directly on the Supabase Google provider page. Looks
      like:
      ```
      https://<project-ref>.supabase.co/auth/v1/callback
      ```

      Do NOT add `/auth/callback` here. That is the app-side callback;
      Google talks to Supabase, not to us. This is the #2 most common
      misconfiguration — people add the wrong URL here and wonder why
      Google rejects the redirect.

### 4. Capacitor / iOS wrapper (future)

When the iOS wrapper ships, add a custom URL scheme (e.g. `snippd://`) to
both the Capacitor config AND Supabase's Redirect URLs. The flow becomes
`snippd://auth/callback` and Supabase 302s to it. Until then, the web flow
is all that matters.

## Verifying after a change

Three ways, in increasing order of ceremony:

1. **Local smoke.** Run `npm run dev`, hit `http://localhost:5173/login`,
   click **Continue with Google**. You should land on `/plan` within 3s.
2. **Debug console.** Open `/debug` after signing in — the bottom shows the
   current session user ID and provider. For OAuth logins it should read
   `provider: google`.
3. **Sentry.** `AuthCallbackScreen` captures any exchange failure with tag
   `subsystem=auth, step=oauth_callback`. Filter Sentry by that tag to see
   what's actually failing.

## Common failure modes and their signatures

| Symptom | Likely cause |
|---|---|
| Google consent screen shows, then "error 400: redirect_uri_mismatch" | Step 3 missing the Supabase callback URL. |
| Google returns, URL shows `?error=redirect_uri_not_allowed` | Step 2 missing the app's `/auth/callback`. |
| Google returns to `/auth/callback`, page hangs forever | Old build without `AuthCallbackScreen`. Deploy current main. |
| Google returns, you get to `/plan`, but refresh logs you out | `persistSession: false` on the Supabase client. We set it `true` in `src/lib/supabase.ts`; don't change it. |
| "Code already exchanged" error | React 18 strict mode double-invocation. Already handled by the `ran` ref in `AuthCallbackScreen`; if you see this, confirm you're on the latest `AuthCallbackScreen.jsx`. |
| Mobile: Safari shows a blank page after Google | Safari's third-party cookie policy. Enable the Supabase cookie-based helper, or use the custom-URL-scheme flow via Capacitor. |
