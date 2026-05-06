const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Block large non-RN directories from Metro's file crawler ─────────────────
// Anchored to absolute paths so src/services/ is never accidentally blocked.
function escRx(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function rootDirPattern(dirName) {
  const abs = path.resolve(__dirname, dirName);
  return new RegExp('^' + escRx(abs) + '([/\\\\]|$)');
}

config.resolver.blockList = [
  // Neo4j Node.js driver — server-only, large binary buffers
  /node_modules[/\\]neo4j-driver[/\\]/,
  /node_modules[/\\]neo4j-driver-core[/\\]/,
  /node_modules[/\\]neo4j-driver-bolt-connection[/\\]/,
  /node_modules[/\\]neo4j-driver-lite[/\\]/,

  // Next.js web app (contains its own node_modules — very large)
  rootDirPattern('web'),

  // Python Cloud Run service subdirs only — NOT the whole services/ dir
  // because services/WealthEngine.ts and services/preferenceUpdater.ts are RN imports
  rootDirPattern('services/checkout_math'),
  rootDirPattern('services/generate_stacks'),

  // Python ADK agent
  rootDirPattern('agent'),

  // Terraform (contains large provider .exe)
  rootDirPattern('infra'),

  // Playwright e2e tests
  rootDirPattern('e2e'),

  // Build artifacts and backups
  rootDirPattern('dist-run-check'),
  rootDirPattern('snippd-backup'),
];

// Limit parallel workers to reduce IPC memory pressure
config.maxWorkers = 2;

module.exports = config;
