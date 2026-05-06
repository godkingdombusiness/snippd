const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Block large non-RN directories from Metro's file crawler ─────────────────
// Use full absolute paths so we ONLY block root-level dirs, not nested ones
// (e.g. we must NOT block src/services/ — only the root services/ dir).
function escRx(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rootDirPattern(dirName) {
  const abs = path.resolve(__dirname, dirName);
  // Match the dir itself or anything inside it
  return new RegExp('^' + escRx(abs) + '([/\\\\]|$)');
}

config.resolver.blockList = [
  // Neo4j Node.js driver — server-only, large binary buffers
  /node_modules[/\\]neo4j-driver[/\\]/,
  /node_modules[/\\]neo4j-driver-core[/\\]/,
  /node_modules[/\\]neo4j-driver-bolt-connection[/\\]/,
  /node_modules[/\\]neo4j-driver-lite[/\\]/,

  // Root-level dirs that are NOT React Native source
  rootDirPattern('web'),        // Next.js app
  rootDirPattern('services'),   // Cloud Run Python services (NOT src/services)
  rootDirPattern('agent'),      // Python ADK agent
  rootDirPattern('infra'),      // Terraform
  rootDirPattern('e2e'),        // Playwright tests
  rootDirPattern('dist-run-check'),
  rootDirPattern('snippd-backup'),
];

// Limit parallel workers to reduce IPC memory pressure
config.maxWorkers = 2;

module.exports = config;
