# Snippd Feature Flags

The app has a small feature system under `src/features/`.
Use it to add, remove, or hide product surfaces without editing every screen.

## Structure

```text
src/features/
  registry.js
  studio/index.js
  chefStash/index.js
  omniStoreComparison/index.js
```

`registry.js` owns flags and route-to-feature mapping. Each feature folder owns the route or tab pieces for that feature.

## Current Flags

| Feature | Env var | Default | What it controls |
| --- | --- | --- | --- |
| Studio | `EXPO_PUBLIC_FEATURE_STUDIO` | `true` | Studio tab, Studio home/profile CTAs, receipt/recipe Studio prompts |
| Chef Stash | `EXPO_PUBLIC_FEATURE_CHEF_STASH` | `true` | Chef Stash routes and pantry/kitchen recipe CTAs |
| Omni Store Comparison | `EXPO_PUBLIC_FEATURE_OMNI_STORE_COMPARISON` | `false` | Reserved feature slot for same-item store comparison |

Accepted false values: `false`, `0`, `no`, `off`, `disabled`.
Accepted true values: `true`, `1`, `yes`, `on`, `enabled`.

## Remove Studio

Set:

```bash
EXPO_PUBLIC_FEATURE_STUDIO=false
```

Then restart Expo with cache clear if the value was already bundled:

```bash
npx expo start -c
```

Studio will disappear from the tab bar and related CTAs.

## Remove Chef Stash

Set:

```bash
EXPO_PUBLIC_FEATURE_CHEF_STASH=false
```

Chef Stash routes and pantry/kitchen entry points will be hidden. Core meal planning should stay in the backend lifecycle plan, not inside the Chef Stash screen.

## Add A New Feature

1. Add an ID to `FEATURE_IDS`.
2. Add a record to `FEATURE_REGISTRY`.
3. If it has routes, add them to `ROUTE_FEATURES`.
4. Create `src/features/<feature>/index.js` and export route/tab helpers from there.
5. Add tab/menu items with `featureId`.
6. Keep math and eligibility decisions in Cloud Run, Supabase, or Google services. The frontend should only display returned state.

For Omni Store Comparison, the frontend calls:

```text
GET /functions/v1/get-omni-store-comparison
```

The Edge Function reads the latest `weekly_lifecycle_plans` row and returns an authoritative display payload. The frontend must not calculate winner, savings percentage, or out-of-pocket cost.

The response shape is:

```json
{
  "comparison_id": "uuid",
  "status": "APPROVED",
  "winner": "WINN_DIXIE",
  "stores": [
    { "retailer": "Publix", "oop": 42.11, "savings_percentage": 61.2 },
    { "retailer": "Winn-Dixie", "oop": 38.7, "savings_percentage": 64.8 }
  ]
}
```
