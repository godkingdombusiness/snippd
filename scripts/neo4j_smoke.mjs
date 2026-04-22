#!/usr/bin/env node
/**
 * Snippd Neo4j Aura smoke test.
 *
 * Run locally before deploying the `ingest-behavior` Edge Function to
 * prove the credentials work and the schema constraints exist.
 *
 * Usage:
 *   NEO4J_URI="neo4j+s://43e46705.databases.neo4j.io" \
 *   NEO4J_USERNAME="neo4j" \
 *   NEO4J_PASSWORD="<your-aura-password>" \
 *     npm run neo4j:smoke
 *
 * What this does (in order):
 *   1. Opens a driver, runs `RETURN 1` — verifies auth + network.
 *   2. Applies `.snippd/neo4j-schema.cypher` — idempotent, safe to re-run.
 *   3. Writes a probe event to a `:SmokeTest` node, reads it back, deletes it.
 *   4. Prints a summary of constraints + indexes so you can confirm the
 *      schema matches what the Edge Function expects.
 *
 * This script writes to the graph but cleans up after itself. The
 * `:SmokeTest` label is isolated so it cannot pollute behavioral data.
 */

import neo4j from "neo4j-driver";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const URI = process.env.NEO4J_URI || "";
const USERNAME = process.env.NEO4J_USERNAME || "neo4j";
const PASSWORD = process.env.NEO4J_PASSWORD || "";
const DATABASE = process.env.NEO4J_DATABASE || "neo4j";

function die(msg) {
  console.error(`\n[neo4j:smoke] ✗ ${msg}\n`);
  process.exit(1);
}

if (!URI) die("NEO4J_URI is not set. Copy from .env.example and retry.");
if (!PASSWORD) die("NEO4J_PASSWORD is not set. Grab it from the Aura console.");

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", ".snippd", "neo4j-schema.cypher");
const schemaSource = readFileSync(schemaPath, "utf8");

// Split on semicolons that end a line; skip comment-only blocks. Aura
// can only execute ONE statement per tx.run() call.
const statements = schemaSource
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.replace(/\/\/.*$/gm, "").trim())
  .filter((s) => s.length > 0 && !s.startsWith("//"));

const driver = neo4j.driver(URI, neo4j.auth.basic(USERNAME, PASSWORD), {
  maxConnectionPoolSize: 5,
  connectionAcquisitionTimeout: 15_000,
});

async function main() {
  console.log(`\n[neo4j:smoke] → connecting to ${URI} (db=${DATABASE})`);

  await driver.getServerInfo();
  console.log("[neo4j:smoke] ✓ auth + network OK");

  const session = driver.session({ database: DATABASE });

  try {
    console.log(`[neo4j:smoke] → applying schema (${statements.length} statements)`);
    for (const stmt of statements) {
      await session.executeWrite((tx) => tx.run(stmt));
    }
    console.log("[neo4j:smoke] ✓ schema applied");

    const probeId = `smoke-${Date.now()}`;
    await session.executeWrite((tx) =>
      tx.run("CREATE (n:SmokeTest { id: $id, at: datetime() })", { id: probeId })
    );
    const readBack = await session.executeRead((tx) =>
      tx.run("MATCH (n:SmokeTest { id: $id }) RETURN n.id AS id", { id: probeId })
    );
    const found = readBack.records[0]?.get("id");
    if (found !== probeId) die(`probe read-back mismatch (got ${found})`);
    console.log(`[neo4j:smoke] ✓ write/read round-trip OK (probe=${probeId})`);

    await session.executeWrite((tx) =>
      tx.run("MATCH (n:SmokeTest { id: $id }) DETACH DELETE n", { id: probeId })
    );
    console.log("[neo4j:smoke] ✓ probe cleaned up");

    const constraints = await session.executeRead((tx) =>
      tx.run("SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties")
    );
    const indexes = await session.executeRead((tx) =>
      tx.run("SHOW INDEXES YIELD name, labelsOrTypes, properties, type WHERE type <> 'LOOKUP'")
    );

    console.log(`\n[neo4j:smoke] constraints (${constraints.records.length}):`);
    for (const rec of constraints.records) {
      console.log(
        `  · ${rec.get("name")} on ${rec.get("labelsOrTypes")}(${rec.get("properties")})`
      );
    }
    console.log(`\n[neo4j:smoke] indexes (${indexes.records.length}):`);
    for (const rec of indexes.records) {
      console.log(
        `  · ${rec.get("name")} on ${rec.get("labelsOrTypes")}(${rec.get("properties")}) [${rec.get("type")}]`
      );
    }

    console.log("\n[neo4j:smoke] ✓ all checks passed — Aura is ready\n");
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error("\n[neo4j:smoke] ✗ failed:", err?.message || err);
  if (err?.code) console.error(`  code: ${err.code}`);
  driver.close().catch(() => {});
  process.exit(1);
});
