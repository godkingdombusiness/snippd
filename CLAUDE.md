# Claude Code Instructions — Snippd

> These instructions apply to every Claude Code session in this project.
> They are non-negotiable and override default behavior.

---

## Project Identity

**Snippd** — Autonomous Shopping Intelligence platform.
Stack: React Native / Expo (app) · Supabase (source of truth) · Vertex AI (scoring) · Neo4j (memory graph, planned).

Key constraint: **All writes go to Supabase.** No local state persistence outside of Supabase DB.

---

## Brand Theme

- Canvas: Mint (`#E8F5E9` / `#F0FBF0`)
- Text: Navy (`#1A237E`)
- Cards: White
- CTA buttons: Green (`#2E7D32`)
- Accent: Coral (`#FF7043`)
- **Dark theme was explicitly rejected.** Do not add dark mode.

---

## MANDATORY: Update Docs on Every Change

After **every** code change, database change, or new file created, you MUST:

### 1. Update `CHANGELOG.md`

Add an entry under `[Unreleased]` with today's date.

Use these categories:
- **Added** — new file, feature, endpoint, service
- **Changed** — modification to existing behavior
- **Fixed** — bug fix
- **Removed** — deletion
- **Database** — any schema change (new table, column, index, view, trigger)
- **API** — new or changed Edge Function endpoint
- **Services** — new or changed Node.js service

Be specific. Not "added files" — write "Added `stackValidator.ts` — validates 9 policy rules per retailer".

### 2. Update the relevant doc in `docs/`

| Change type | Doc to update |
|---|---|
| New or modified table, column, index, trigger, view | `docs/DATABASE.md` |
| New or changed Edge Function endpoint | `docs/API.md` |
| New or changed Node.js service | `docs/SERVICES.md` |
| Architecture change | `docs/ARCHITECTURE.md` |
| Stacking logic change (new offer type, new validator, policy change) | `docs/STACKING_ENGINE.md` |
| New event, weight change, tracker method added | `docs/EVENT_TRACKING.md` |

### 3. Bump version in `CHANGELOG.md` when:

| Bump | Trigger |
|---|---|
| **Patch** `0.1.x` | Bug fix, type fix, minor wording update |
| **Minor** `0.x.0` | New feature, new endpoint, new service, new table |
| **Major** `x.0.0` | Breaking schema change, major architecture change |

---

## Never Do This

- Never create a file without updating `CHANGELOG.md`
- Never modify a table without updating `docs/DATABASE.md`
- Never add an endpoint without updating `docs/API.md`
- Never say "I'll update the docs later"
- Never commit to dark mode or change the brand theme
- Never write directly to the database from the React Native client (always go through Edge Functions)
- Never use `--no-verify` on git commits
- Never hardcode event weights (they live in `event_weight_config`)
- Never hardcode retailer stacking rules (they live in `retailer_coupon_parameters` + `retailer_rules`)

---

## Code Conventions

### TypeScript
- `src/types/stacking.ts` — camelCase, computation-facing types
- `src/types/events.ts` — snake_case, DB/API-facing types
- All new services in `src/` (not root-level `services/` or `lib/`)
- Strict typing — no `any` unless unavoidable (add a comment explaining why)

### Supabase Edge Functions (Deno)
- File: `supabase/functions/<name>/index.ts`
- Runtime: Deno — use `https://esm.sh/` imports, not npm
- Always include CORS headers
- Auth: Bearer JWT preferred, `x-ingest-key` for server-to-server

### Node.js Services
- File: `src/services/<name>.ts`
- Use `@supabase/supabase-js` (CommonJS)
- Export a main function (e.g., `runPreferenceUpdater(db)`) for testability
- Add `if (require.main === module)` CLI entry point

### SQL Migrations
- Always use `IF NOT EXISTS` on `CREATE TABLE`
- Always use `ADD COLUMN IF NOT EXISTS` on `ALTER TABLE`
- Use `ON CONFLICT DO NOTHING` on seed inserts
- File: `supabase/migrations/YYYYMMDD_description.sql`

### React Native
- Screens in `screens/`, components in `components/`
- Event tracking via `tracker` singleton — never call the ingest endpoint directly

---

## Testing

Run stacking engine tests:
```bash
npx ts-node --project tsconfig.test.json \
  src/services/stacking/__tests__/stackingEngine.test.ts
```

Run TypeScript type check:
```bash
npx tsc --noEmit --project tsconfig.test.json
```

All 16 tests must pass before shipping stacking engine changes.

---

## Key Files Quick Reference

| Purpose | File |
|---|---|
| Stacking types | `src/types/stacking.ts` |
| Event types | `src/types/events.ts` |
| Event tracker (client) | `src/lib/eventTracker.ts` |
| Policy loader | `src/services/stacking/policyLoader.ts` |
| Offer validator | `src/services/stacking/stackValidator.ts` |
| Price calculator | `src/services/stacking/stackCalculator.ts` |
| Stack orchestrator | `src/services/stacking/stackingEngine.ts` |
| Preference updater | `src/services/preferenceUpdater.ts` |
| Vertex feature builder | `src/services/vertexFeatureBuilder.ts` |
| Ingest Edge Function | `supabase/functions/ingest-event/index.ts` |
| Stack Edge Function | `supabase/functions/stack-compute/index.ts` |
| Safe migration | `supabase/migrations/001_behavioral_intelligence_safe.sql` |
