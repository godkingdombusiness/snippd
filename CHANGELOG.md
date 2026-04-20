# Changelog

All notable database and tooling changes for this repo are recorded here. Apply migrations in timestamp order via the Supabase CLI or dashboard.

## [Unreleased]

### Added

- **`supabase/migrations/20260419120000_phase1_safe_client_aligned.sql`**  
  - Sets `security_invoker = true` on `public.v_active_offers` when the view exists (aligns with lint 0010 / prior view hardening).  
  - Drops redundant `public.profiles_user_id_idx` only when `public.profiles_user_id_unique` exists (lint 0009 duplicate index).  
  - Header comment documents the **client contract** (anon-key surfaces: `current_mission`, `profiles`, `trips`, `v_active_offers`, storage `ugc-videos`, optional helpers).

- **`supabase/migrations/20260419130000_function_search_path_custom_public.sql`**  
  - Lint **0011** (`function_search_path_mutable`): runs `ALTER FUNCTION … SET search_path TO public, pg_temp` for **non–extension-owned** functions in `public` (skips `pg_depend.deptype = 'e'` so `vector` / `pg_trgm` internals are not bulk-altered; those should be addressed via moving extensions out of `public`).

- **`supabase/migrations/20260419140000_rls_auth_initplan.sql`**  
  - Lint **0003** (`auth_rls_initplan`): rewrites policies that still used bare `auth.uid()` / `auth.role()` to `(select auth.uid())` / `(select auth.role())` on listed `public` tables and two `storage.objects` policies, preserving semantics (including subqueries on `carts`, `clip_sessions`, etc.).  
  - Does **not** change policies that already used a scalar subselect form.

- **`supabase/migrations/20260419150000_rls_explicit_deny_internal_tables.sql`**  
  - Lint **0008** (`rls_enabled_no_policy`): for `anonymized_signals`, `creator_profiles`, `event_weight_config`, `meal_prep_strategies`, `model_predictions`, `rebate_offers`, `weekly_ad_files` — if the table exists, has RLS enabled, and has **no** policies yet, creates explicit deny-all policies for `anon` and `authenticated`. Service role continues to bypass RLS.

### Changed

- **`supabase/queries/phase2_linter_followup.sql`**  
  - **Section 1** split into **1a** (all public functions missing `search_path`) and **1b** (custom-only, excluding extension members — matches the `20260419130000` migration).  
  - **Section 2** (auth RLS initplan): exclusion regex updated to **`~* '\(\s*select\s+auth\.'`** so policies already using `( SELECT auth.uid() … )` are not false positives.

### Notes (not committed as migrations)

- **Extension location (lint 0014):** moving `vector`, `pg_trgm`, `pg_net` into the `extensions` schema remains a separate, deliberate migration (update callers, then `ALTER EXTENSION … SET SCHEMA`).  
- **Duplicate permissive RLS policies (lint 0006)** and **FK vs unused-index tradeoffs** were intentionally not bulk-edited here; review workload and merge policies in a follow-up.  
- After deploying RLS/view changes, smoke-test: auth, mission load/save, `profiles` / preferred stores, `trips`, `v_active_offers` / Clip & list flows, and any storage paths you use.

### Expo SDK 55 package alignment (separate Expo app)

This repo is **Vite + React** only; root `package.json` does **not** include `expo` or `expo-*`. Expo Doctor compatibility fixes apply to your **React Native / Expo** project (run commands from **that** project’s root).

Target versions reported by Expo for SDK 55:

| Package | Expected range |
| --- | --- |
| `expo` | `~55.0.15` |
| `expo-auth-session` | `~55.0.14` |
| `expo-blur` | `~55.0.14` |
| `expo-camera` | `~55.0.15` |
| `expo-crypto` | `~55.0.14` |
| `expo-image-picker` | `~55.0.18` |
| `expo-linear-gradient` | `~55.0.13` |
| `expo-linking` | `~55.0.13` |
| `expo-location` | `~55.1.8` |
| `expo-media-library` | `~55.0.14` |
| `expo-secure-store` | `~55.0.13` |
| `expo-sharing` | `~55.0.18` |
| `expo-splash-screen` | `~55.0.18` |
| `expo-web-browser` | `~55.0.14` |

From the Expo app directory, install aligned versions (recommended):

```bash
npx expo install expo@~55.0.15 expo-auth-session@~55.0.14 expo-blur@~55.0.14 expo-camera@~55.0.15 expo-crypto@~55.0.14 expo-image-picker@~55.0.18 expo-linear-gradient@~55.0.13 expo-linking@~55.0.13 expo-location@~55.1.8 expo-media-library@~55.0.14 expo-secure-store@~55.0.13 expo-sharing@~55.0.18 expo-splash-screen@~55.0.18 expo-web-browser@~55.0.14
```

Alternatively, `npx expo install --fix` (or `expo doctor --fix`) in that project will bump Expo-managed packages to match the installed SDK.
