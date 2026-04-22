# Snippd behavioral intelligence — Neo4j Aura

Snippd uses Neo4j Aura as a purpose-built graph for behavioral
intelligence. Every meaningful action a user takes in the app (sign in,
lock a bundle, mark an item unavailable, complete a trip, record a
preference) becomes a node + relationship in the graph. Personalization
queries the graph to rank stores, pre-fill preferences, and tune the
Chef strategy per user.

Aura instance: **`43e46705`** · URI: `neo4j+s://43e46705.databases.neo4j.io`

---

## Architecture

```
browser  ──▶  src/lib/behavior.js  (typed emit helpers, fire-and-forget)
                       │
                       ▼
            https://…/functions/v1/ingest-behavior  (Deno edge fn, holds creds)
                       │
                       ▼
          Neo4j Aura (instance 43e46705)  —  graph of (:User)-[…]->(:Product/:Trip/…)
```

**Why the edge function**: the browser must never hold the Neo4j
password. The edge function is the only component with access to
`NEO4J_PASSWORD`, applies origin allowlisting, size caps, and reports
errors to Sentry.

**Why fire-and-forget**: behavioral telemetry has to be invisible. A
dropped event is acceptable; a blocked UI is not. The SDK uses
`fetch({ keepalive: true })` so events fire even mid-navigation, and
every call path catches network errors silently.

---

## One-time setup

1. **Grab the Aura password** from `https://console.neo4j.io/` (your
   instance is `43e46705`). Aura shows it only once at creation; if you
   lost it, hit "Reset password".

2. **Smoke test locally** so you know the creds work before any edge
   function traffic:

   ```bash
   export NEO4J_URI="neo4j+s://43e46705.databases.neo4j.io"
   export NEO4J_USERNAME="neo4j"
   export NEO4J_PASSWORD="…"
   npm run neo4j:smoke
   ```

   This applies the schema, round-trips a probe node, and prints the
   constraints + indexes so you can verify everything matches
   `.snippd/neo4j-schema.cypher`.

3. **Set the Supabase secrets**:

   ```bash
   supabase secrets set NEO4J_URI="neo4j+s://43e46705.databases.neo4j.io"
   supabase secrets set NEO4J_USERNAME="neo4j"
   supabase secrets set NEO4J_PASSWORD="…"
   supabase secrets set NEO4J_DATABASE="neo4j"
   ```

4. **Deploy the edge function**:

   ```bash
   supabase functions deploy ingest-behavior --no-verify-jwt
   ```

5. **Point the browser at it**: set `VITE_SNIPPD_BEHAVIOR_URL` in your
   `.env` to
   `https://<your-project>.functions.supabase.co/ingest-behavior`, or
   let the SDK derive it from `VITE_SUPABASE_URL` automatically.

---

## Event taxonomy

Each event type maps to exactly one idempotent Cypher template in
`supabase/functions/ingest-behavior/index.ts`. The wire shape below is
what the client SDK sends; everything else on the event envelope
(`type`, `at`) is added by the SDK.

| event | when it fires | client helper |
|---|---|---|
| `user.signed_in` | `SignInScreen` after successful `signInWithPassword` | `emitUserSignedIn` |
| `plan.bundle_locked` | `WeeklyPlanScreen` when "Add to Cart" is pressed | `emitBundleLocked` |
| `shop.item_unavailable` | `MyListScreen` → "Item not found" (and again when a replacement is picked) | `emitItemUnavailable` |
| `trip.completed` | `ReceiptVerifiedScreen` → "Log demo receipt" | `emitTripCompleted` |
| `preference.recorded` | `ReceiptVerifiedScreen` → "Save preference" | `emitPreferenceRecorded` |

Adding a new event type? Keep these three files in lockstep:

1. Add the event to `EVENT_TYPES` in `src/lib/behavior.js` and write the
   typed emit helper.
2. Add a Cypher template to `TEMPLATES` in
   `supabase/functions/ingest-behavior/index.ts`.
3. Update the table above and the schema file if the template touches
   new node labels.

---

## Graph model

See `.snippd/neo4j-schema.cypher` for the authoritative constraints and
indexes. Conceptually:

- **`(:User { id })`** — Supabase `auth.uid()` is the source of truth.
- **`(:Session { id })`** — one per browser tab / login cycle.
- **`(:Bundle { id, strategy, storeSlug, budgetCents })`** — a locked
  weekly plan. id is `${userId}:${storeSlug}:${strategyKey}:${YYYY-MM-DD}`
  so re-locking the same strategy the same day merges cleanly.
- **`(:Product { name, storeSlug })`** — same product name at different
  stores is a different node on purpose.
- **`(:Store { slug })`** — matches the retailer seed rows in Supabase.
- **`(:Trip { id, retailCents, totalSavingsCents, completedAt })`**
- **`(:Clip { id })`** — reserved for Studio uploads (not wired yet).

Key relationships for personalization queries:

- `(:User)-[:PLANNED]->(:Bundle)-[:AT_STORE]->(:Store)`
- `(:Bundle)-[:CONTAINS { role }]->(:Product)`
- `(:User)-[:UNAVAILABLE { at, replacement }]->(:Product)`
- `(:User)-[:BOUGHT_UNPLANNED]->(:Product)`
- `(:User)-[:COMPLETED]->(:Trip)-[:FROM]->(:Bundle)`
- `(:User)-[:EXPRESSED_PREFERENCE { sentiment, text }]->(:Product)`

---

## Personalization queries (the point of all this)

### "Which store should this user default to?"

```cypher
MATCH (u:User { id: $uid })-[:COMPLETED]->(t:Trip)-[:FROM]->(b:Bundle)-[:AT_STORE]->(s:Store)
WITH s, count(*) AS trips, avg(t.totalSavingsCents) AS avgSavings
RETURN s.slug, trips, avgSavings
ORDER BY avgSavings DESC, trips DESC
LIMIT 1
```

### "Which products should we downrank at Aldi for this user?"

```cypher
MATCH (u:User { id: $uid })-[r:UNAVAILABLE]->(p:Product { storeSlug: 'aldi' })
WHERE r.at > datetime() - duration({ days: 28 })
RETURN p.name, count(*) AS misses
ORDER BY misses DESC
```

### "Unplanned items this user keeps buying — offer them pre-selected next week"

```cypher
MATCH (u:User { id: $uid })-[:BOUGHT_UNPLANNED]->(p:Product)
WITH p, count(*) AS freq
WHERE freq >= 3
RETURN p.name, p.storeSlug, freq
ORDER BY freq DESC
```

---

## Working with the VS Code extension

You have `neo4j.neo4j-for-vscode` installed. To connect it to this
instance:

1. Open the Neo4j panel in the sidebar.
2. "Add connection" → paste `neo4j+s://43e46705.databases.neo4j.io`.
3. Username `neo4j`, password from the Aura console.
4. Right-click `.snippd/neo4j-schema.cypher` → **Run with Neo4j driver**
   to apply the schema from inside VS Code.
5. Any Cypher in this repo can be executed the same way — useful for
   running the personalization queries above against real data.

The extension also has a graph visualizer — `MATCH (n) RETURN n LIMIT 50`
is a good way to see what the ingest function is actually writing.

---

## Privacy + App Review

Behavioral data is **not** PII in isolation, but Supabase `auth.uid()`
links it to an account. Two things must ship before public launch:

1. **Privacy policy disclosure** — already in the founder-actions queue
   (`privacy-policy-page`). Must state that we collect in-app activity
   for personalization and name the processor (Neo4j Aura by Neo4j, Inc.).
2. **App Privacy details in App Store Connect** — declare "Product
   Interaction" and "Other Usage Data" under Usage Data, linked to
   Identity for personalization.

The Edge Function deliberately never writes email, name, receipt photos,
or payment info to Neo4j. Only `auth.uid()` travels.
