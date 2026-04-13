# Neo4j Memory Graph — Deploy Runbook

> One-time setup and ongoing maintenance for the Snippd memory graph.
> The graph is **optional** — all services degrade gracefully when `NEO4J_URI` is unset.

---

## 1. Provision Neo4j Aura Free (or AuraDB Professional)

1. Go to [console.neo4j.io](https://console.neo4j.io) and create a free AuraDB instance.
2. Choose **AuraDB Free** (sufficient for development/staging) or **AuraDB Professional** for production.
3. After the instance starts, download the connection credentials file.
4. Note the three values you need:

| Credential | Where to find it |
|---|---|
| `NEO4J_URI` | `neo4j+s://<your-instance-id>.databases.neo4j.io` |
| `NEO4J_USER` | The instance ID (e.g. `43e46705`) — **not** `neo4j` on AuraDB Free |
| `NEO4J_PASSWORD` | Generated password shown once at creation |
| `NEO4J_DATABASE` | The instance ID (same value as `NEO4J_USER` on AuraDB Free) |

> **AuraDB Free note:** Both the username and the database name equal the instance ID (e.g. `43e46705`). The default database is NOT named `neo4j`. Always set `NEO4J_DATABASE` to the instance ID.

---

## 2. Set env vars

### Local `.env` (for running Node.js services)
```bash
NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io
NEO4J_USER=xxxx          # instance ID, not 'neo4j'
NEO4J_PASSWORD=<your-password>
NEO4J_DATABASE=xxxx      # same as NEO4J_USER on AuraDB Free
```

### Supabase Edge Function secrets
```bash
supabase secrets set NEO4J_URI="neo4j+s://xxxx.databases.neo4j.io"
supabase secrets set NEO4J_USER="xxxx"
supabase secrets set NEO4J_PASSWORD="<your-password>"
supabase secrets set NEO4J_DATABASE="xxxx"
```

---

## 3. Initialize the schema

Run once on a fresh instance. Safe to re-run — all statements use `IF NOT EXISTS`.

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io \
NEO4J_USER=neo4j \
NEO4J_PASSWORD=xxx \
npx ts-node --project tsconfig.test.json src/services/graph/graphSchema.ts
```

**Expected output:**
```
[graphSchema] Schema initialized: 10 applied, 0 already existed
[graphSchema] Done.
```

**What gets created:**

| Object | Type | Key |
|---|---|---|
| `user_id_unique` | Constraint | `User.id` |
| `category_name_unique` | Constraint | `Category.name` |
| `brand_name_unique` | Constraint | `Brand.name` |
| `store_key_unique` | Constraint | `Store.retailer_key` |
| `deal_id_unique` | Constraint | `Deal.id` |
| `stack_id_unique` | Constraint | `Stack.id` |
| `product_key_unique` | Constraint | `Product.normalized_key` |
| `user_updated_idx` | Index | `User.updated_at` |
| `product_category_idx` | Index | `Product.category` |
| `product_brand_idx` | Index | `Product.brand` |
| `prefers_score_idx` | Rel. Index | `PREFERS.score` |
| `co_occurs_count_idx` | Rel. Index | `CO_OCCURS_WITH.count` |
| `buys_count_idx` | Rel. Index | `BUYS.count` |

---

## 4. First data sync

Syncs Supabase behavioral data into Neo4j for all users active in the last 30 days.
Includes: preference edges, purchase history, cart acceptance, co-occurrences, and cohort similarity.

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io \
NEO4J_USER=neo4j \
NEO4J_PASSWORD=xxx \
npx ts-node --project tsconfig.test.json src/services/graph/graphSync.ts
```

**Expected output (example):**
```
[graphSync] Syncing 47 active users
[graphSync] Running co-occurrence sync…
[graphSync] Running cohort similarity sync…
[graphCohort] Computing similarity for 47 users…
[graphCohort] Wrote 312 SHOWS_PATTERN edges
[graphSync] Complete: { users: 47, pairs: 1840, cohortEdges: 312 }
```

**First sync time estimate:** ~2–5 minutes for < 100 users.

---

## 5. Cohort-only sync (standalone)

Run the cohort computation without a full sync (e.g., after re-tuning `MIN_SIMILARITY`):

```bash
NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io \
NEO4J_USER=neo4j \
NEO4J_PASSWORD=xxx \
npx ts-node --project tsconfig.test.json src/services/graph/graphCohort.ts
```

---

## 6. Nightly cron schedule (recommended)

| Time (UTC) | Job | Command |
|---|---|---|
| 02:00 | Full graph sync | `graphSync.ts` |
| 02:30 | Schema check (optional) | `graphSchema.ts` |

The ingestion worker (`ingestionWorker.ts`) runs every 30 minutes independently and does not touch Neo4j directly — `graphSync.ts` picks up new `stack_candidates` nightly.

---

## 7. Verify connectivity

Quick check that credentials work:

```typescript
import { verifyConnectivity } from './src/lib/neo4jClient';
await verifyConnectivity(); // throws if unreachable
```

Or via the Neo4j Browser at `https://browser.neo4j.io` — paste your URI and credentials.

---

## 8. Graph scoring summary

Once the graph is populated, `cartEngine.ts` applies these boosts at scoring time:

| Signal | Boost | Source |
|---|---|---|
| Category in user's `PREFERS` edges | `categoryScore × 1.15` | `graphRetrieval` |
| Category in user's `REJECTS` edges | **skip candidate** | `graphRetrieval` |
| Product in user's `BUYS` history | `preferenceScore + 0.20` | `graphRetrieval` |
| Product in user's `CO_OCCURS_WITH` graph | `preferenceScore + 0.10` | `graphRetrieval` |
| Category in cohort peers' `PREFERS` (collaborative) | `preferenceScore + 0.08` | `graphCohort` |
| Brand in cohort peers' `PREFERS` (collaborative)    | `preferenceScore + 0.06` | `graphCohort` |

All boosts are clamped to `[0, 1]`. If Neo4j is unavailable, all boosts are 0 and cart generation continues normally.
