/**
 * neo4jClient — Neo4j driver singleton
 *
 * Usage:
 *   import { getSession, closeDriver } from '../lib/neo4jClient';
 *
 *   const session = getSession();
 *   try {
 *     await session.run('MATCH (u:User {id: $id}) RETURN u', { id: '...' });
 *   } finally {
 *     await session.close();
 *   }
 *
 * Env vars required:
 *   NEO4J_URI      e.g. neo4j+s://xxxx.databases.neo4j.io
 *   NEO4J_USER     e.g. neo4j (or instance ID on AuraDB Free)
 *   NEO4J_PASSWORD e.g. <password>
 *   NEO4J_DATABASE e.g. neo4j (defaults to NEO4J_USER on AuraDB Free where DB name = instance ID)
 */

import neo4j, { Driver, Session } from 'neo4j-driver';

// ─────────────────────────────────────────────────────────────
// Singleton driver
// ─────────────────────────────────────────────────────────────

let _driver: Driver | null = null;

function getDriver(): Driver {
  if (_driver) return _driver;

  const uri      = process.env['NEO4J_URI']      ?? '';
  const user     = process.env['NEO4J_USER']     ?? 'neo4j';
  const password = process.env['NEO4J_PASSWORD'] ?? '';

  if (!uri) {
    throw new Error('[neo4jClient] NEO4J_URI is not set');
  }
  if (!password) {
    throw new Error('[neo4jClient] NEO4J_PASSWORD is not set');
  }

  _driver = neo4j.driver(
    uri,
    neo4j.auth.basic(user, password),
    {
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 5000,
      logging: {
        level: 'warn',
        logger: (level: string, message: string) => console.warn(`[neo4j:${level}] ${message}`),
      },
    },
  );

  return _driver;
}

/** Returns a new Neo4j session. Caller is responsible for session.close().
 *  Database resolution order:
 *    1. explicit `database` argument
 *    2. NEO4J_DATABASE env var (set to instance ID on AuraDB Free)
 *    3. 'neo4j' fallback (works for AuraDB Professional and self-hosted)
 */
export function getSession(database?: string): Session {
  const db = database ?? process.env['NEO4J_DATABASE'] ?? 'neo4j';
  return getDriver().session({ database: db });
}

/** Verifies connectivity. Throws if the database is unreachable. */
export async function verifyConnectivity(): Promise<void> {
  await getDriver().verifyConnectivity();
}

/** Closes the driver. Call at process shutdown. */
export async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

/** Returns true if Neo4j env vars are fully configured. */
export function isNeo4jConfigured(): boolean {
  return Boolean(
    process.env['NEO4J_URI'] &&
    process.env['NEO4J_PASSWORD'],
  );
}
