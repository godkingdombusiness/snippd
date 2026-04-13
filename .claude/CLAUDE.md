# Claude Code standing instructions — Snippd

## Read this at the start of every session.

---

## Rule 1 — Update CHANGELOG.md after every change

Add an entry under `[Unreleased]` immediately after making any change. Be specific:

  GOOD: "Added `stackValidator.ts` — validates 9 policy rules including mutual
        exclusion groups and quantity requirements"
  BAD:  "Added files"

Categories to use:
  Added    — new files, tables, endpoints, features
  Changed  — modified existing logic
  Fixed    — bug fixes, type errors
  Removed  — deleted files or features
  Database — any schema change
  API      — any endpoint change
  Services — any background service change

---

## Rule 2 — Update the right doc in docs/

  New or changed table          → docs/DATABASE.md
  New or changed endpoint       → docs/API.md
  New or changed service        → docs/SERVICES.md
  Architecture or flow change   → docs/ARCHITECTURE.md
  Stacking engine change        → docs/STACKING_ENGINE.md
  Event or weight change        → docs/EVENT_TRACKING.md
  Architecture decision         → docs/DECISIONS.md

---

## Rule 3 — Version bumping

Patch (0.1.x): bug fix, type error, minor tweak
Minor (0.x.0): new feature, endpoint, service, table
Major (x.0.0): breaking change, major redesign

When bumping: move [Unreleased] items to a new versioned section with today's date.

Format:
  ## [0.2.0] — YYYY-MM-DD

Use the bump script:
  bash scripts/bump-version.sh minor

---

## Rule 4 — Never do these things

- Never create a file without updating CHANGELOG.md
- Never change a table without updating docs/DATABASE.md
- Never add an endpoint without updating docs/API.md
- Never say "I'll update docs later"
- Never leave [Unreleased] empty after making changes
- Never hardcode event weights (they live in event_weight_config)
- Never hardcode retailer stacking rules (they live in retailer_coupon_parameters + retailer_rules)
- Never write directly to the DB from the React Native client — always go through Edge Functions
- Never add dark mode or change the brand palette

---

## Rule 5 — Brand theme (non-negotiable)

Canvas:   Mint   #E8F5E9 / #F0FBF0
Text:     Navy   #1A237E
Cards:    White
CTA:      Green  #2E7D32
Accent:   Coral  #FF7043

Dark theme was explicitly rejected. Do not add it.

---

## Rule 6 — Code conventions

TypeScript:
  - src/types/stacking.ts — camelCase, computation-facing types
  - src/types/events.ts   — snake_case, DB/API-facing types
  - All new services in src/services/ (not root-level services/ or lib/)
  - Strict typing — no `any` unless unavoidable (add a comment explaining why)

Supabase Edge Functions (Deno):
  - File: supabase/functions/<name>/index.ts
  - Runtime: Deno — use https://esm.sh/ imports, not npm
  - Always include CORS headers
  - Auth: Bearer JWT preferred, x-ingest-key for server-to-server

Node.js Services:
  - File: src/services/<name>.ts
  - Use @supabase/supabase-js (CommonJS)
  - Export a main function for testability
  - Add if (require.main === module) CLI entry point
  - Run with: npx ts-node --project tsconfig.test.json

SQL Migrations:
  - Always use IF NOT EXISTS on CREATE TABLE
  - Always use ADD COLUMN IF NOT EXISTS on ALTER TABLE
  - Use ON CONFLICT DO NOTHING on seed inserts
  - File: supabase/migrations/YYYYMMDD_description.sql

---

## Rule 7 — Session summary

At the end of every session where changes were made, print:

SESSION SUMMARY
Files created/modified: [list]
CHANGELOG.md updated: yes/no
Docs updated: [list which ones]
Current version: [x.x.x]
Next recommended step: [what to build next]

---

## Key files quick reference

| Purpose | File |
|---|---|
| Stacking types | src/types/stacking.ts |
| Event types | src/types/events.ts |
| Event tracker (client) | src/lib/eventTracker.ts |
| Policy loader | src/services/stacking/policyLoader.ts |
| Offer validator | src/services/stacking/stackValidator.ts |
| Price calculator | src/services/stacking/stackCalculator.ts |
| Stack orchestrator | src/services/stacking/stackingEngine.ts |
| Preference updater | src/services/preferenceUpdater.ts |
| Vertex feature builder | src/services/vertexFeatureBuilder.ts |
| Ingest Edge Function | supabase/functions/ingest-event/index.ts |
| Stack Edge Function | supabase/functions/stack-compute/index.ts |
| Safe migration | supabase/migrations/001_behavioral_intelligence_safe.sql |
| Changelog | CHANGELOG.md |
| Architecture | docs/ARCHITECTURE.md |
| Database | docs/DATABASE.md |
| API | docs/API.md |
| Services | docs/SERVICES.md |
| Stacking engine | docs/STACKING_ENGINE.md |
| Event tracking | docs/EVENT_TRACKING.md |
| Decisions | docs/DECISIONS.md |
| Version | docs/VERSION |
| Version bump script | scripts/bump-version.sh |
