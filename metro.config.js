const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Block directories Metro must never crawl ─────────────────────────────────
// Large non-RN trees (Next.js app, Python services, Terraform, etc.) cause
// the DiskCacheManager "Data cannot be cloned, out of memory" error because
// Metro tries to serialize their entire file graph into a V8 buffer.
const ROOT = __dirname.replace(/\\/g, '/');

config.resolver.blockList = [
  // Neo4j Node.js driver — server-only, large binary buffers
  /node_modules\/neo4j-driver\//,
  /node_modules\/neo4j-driver-core\//,
  /node_modules\/neo4j-driver-bolt-connection\//,
  /node_modules\/neo4j-driver-lite\//,

  // Next.js web app — not part of the React Native bundle
  new RegExp(`${ROOT}/web/`),

  // Python/Cloud Run services
  new RegExp(`${ROOT}/services/`),
  new RegExp(`${ROOT}/agent/`),

  // Terraform infrastructure
  new RegExp(`${ROOT}/infra/`),

  // Playwright / e2e tests
  new RegExp(`${ROOT}/e2e/`),

  // Build artifacts
  new RegExp(`${ROOT}/dist-run-check/`),
  new RegExp(`${ROOT}/snippd-backup/`),

  // Python bytecode
  /__pycache__/,
];

// Reduce parallel workers to cut IPC memory pressure
config.maxWorkers = 2;

// Only watch the app source — keeps the file-map small
config.watchFolders = [
  path.resolve(__dirname, 'assets'),
  path.resolve(__dirname, 'components'),
  path.resolve(__dirname, 'contexts'),
  path.resolve(__dirname, 'hooks'),
  path.resolve(__dirname, 'lib'),
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, 'screens'),
  path.resolve(__dirname, 'src'),
  path.resolve(__dirname, 'supabase'),
];

module.exports = config;
