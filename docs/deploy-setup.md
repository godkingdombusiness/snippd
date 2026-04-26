# Deploy setup — Vercel

## What was wrong

On 2026-04-25 the founder reported "the app is not loading."
Audit found:

1. **The Vite/React app had never been deployed.** No `.vercel/` link, no
   deployment workflow, no `vercel.json`. The `dist/` folder was being
   built locally but nothing was publishing it to the public web.
2. **`snippd.app` is currently a Pop.site marketing landing page**, not
   the React app. (Headers: `x-powered-by: Next.js`, `x-matched-path: /`,
   served via Pop.site's Next.js edge.) That page itself is in a broken
   state — a "This Pop Site uses Pro features without an active Pro
   plan" overlay covers it.
3. Direct hits to `/login` or `/auth/callback` returned `HTTP 404`,
   because the Pop.site site has no such routes — and even if the React
   app *were* deployed, it would still 404 without a SPA fallback rule.

So when the founder went to log in, they were either looking at the
broken Pop.site page, or — if they had been hitting the right URL — the
host would have served a 404 for any non-root path.

## What this PR fixes

- **`vercel.json`** — wires Vite into Vercel as the framework, sets
  `dist/` as the output, and adds the SPA rewrite (`/* → /index.html`)
  so React Router routes resolve on direct navigation. Also caches
  `/assets/*` immutably and adds basic security headers.
- **`.github/workflows/deploy.yml`** — auto-deploys on every push to
  `main` (production) and every PR (preview). Skips cleanly with a
  warning if the Vercel secrets are not yet configured, so the queue
  stays green during the one-time setup.

## One-time founder setup (~3 minutes)

You only have to do this once.

### 1. Create a Vercel project linked to this repo

- Go to https://vercel.com/new
- Import `godkingdombusiness/snippd`
- Framework preset: **Vite** (auto-detected)
- Build command: `npm run build` (auto-detected)
- Output dir: `dist` (auto-detected)
- Click **Deploy**

This creates the project and deploys it once. You'll get a URL like
`https://snippd-<hash>.vercel.app` — confirm the app loads there. The
Google OAuth flow won't work yet from that URL until you add it to
Supabase + Google Cloud allowlists (see the next section).

### 2. Add three GitHub secrets so future commits auto-deploy

In the Vercel dashboard:

| Secret              | Where to find it                                                |
| ------------------- | --------------------------------------------------------------- |
| `VERCEL_TOKEN`      | https://vercel.com/account/tokens → Create Token (full-access)  |
| `VERCEL_ORG_ID`     | Team Settings → General → Team ID (or Personal Account ID)      |
| `VERCEL_PROJECT_ID` | Project → Settings → General → Project ID                       |

Paste each one at https://github.com/godkingdombusiness/snippd/settings/secrets/actions/new

After that, every push to `main` deploys to production automatically.

### 3. Point `snippd.app` at the new project

This is the part that will make `https://snippd.app` actually serve the
React app instead of the broken Pop.site page.

- In Vercel: **Project → Settings → Domains** → add `snippd.app` and
  `www.snippd.app`.
- Vercel will show you the DNS record to point at it (typically an
  `A` record `76.76.21.21` for the apex and a `CNAME` to
  `cname.vercel-dns.com` for `www`).
- Update those records at your domain registrar.
- The current Pop.site landing page will stop being served as soon as
  DNS propagates (usually under an hour).

> **Heads up:** if you want to keep the Pop.site marketing page alive at
> a different hostname (e.g. `landing.snippd.app`), move it there
> *before* flipping the apex DNS, otherwise the marketing page goes dark
> at the same moment the React app comes up.

### 4. Re-add the new origin to Supabase + Google Cloud

Once the React app is reachable at `https://snippd.app`, update the
allowlists per `docs/google-oauth-setup.md`. The list of URLs that need
to be present is unchanged — `https://snippd.app/auth/callback` was
already in the recommended set. This is just the trigger to confirm
they're actually saved in both dashboards.

### 5. Smoke test

1. Open `https://snippd.app/` — you should see the React landing screen.
2. Open `https://snippd.app/auth/callback` directly — you should see the
   "Finishing sign-in…" loader (this is what proves the SPA rewrite is
   live; without it Vercel would 404).
3. Click **Continue with Google** → consent → confirm you land on `/plan`.

If any step fails, the symptoms map cleanly:

| Symptom                                      | Likely cause                                              |
| -------------------------------------------- | --------------------------------------------------------- |
| `snippd.app/` still shows Pop.site page      | DNS hasn't propagated yet (or wasn't switched). Wait or recheck registrar. |
| `snippd.app/auth/callback` returns 404       | `vercel.json` rewrite missing on the active deployment. Trigger a redeploy. |
| Google login times out / no redirect back    | Supabase or Google Cloud redirect URLs still not allowlisted. See `docs/google-oauth-setup.md`. |
| App loads but immediately signs you out      | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` not set in Vercel project env. Add them under Project Settings → Environment Variables. |
