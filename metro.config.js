const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ── Block large non-RN directories from Metro's file crawler ─────────────────
// Metro crashes with "Data cannot be cloned, out of memory" when it tries to
// serialize these directories into a V8 IPC buffer.
// NOTE: Do NOT use watchFolders — Metro crashes if any listed directory is missing.
config.resolver.blockList = [
  // Neo4j Node.js driver — server-only, large binary buffers
  /node_modules\/neo4j-driver\//,
  /node_modules\/neo4j-driver-core\//,
  /node_modules\/neo4j-driver-bolt-connection\//,
  /node_modules\/neo4j-driver-lite\//,

  // Next.js web app
  /[/\\]web[/\\]/,

  // Python / Cloud Run services
  /[/\\]services[/\\]/,
  /[/\\]agent[/\\]/,

  // Terraform infrastructure
  /[/\\]infra[/\\]/,

  // Playwright / e2e tests
  /[/\\]e2e[/\\]/,

  // Build artifacts and backups
  /[/\\]dist-run-check[/\\]/,
  /[/\\]snippd-backup[/\\]/,
  /[/\\]__pycache__[/\\]/,
];

// Limit parallel workers to reduce IPC memory pressure
config.maxWorkers = 2;

module.exports = config;
