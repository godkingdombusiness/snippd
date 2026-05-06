const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Block server-only packages from the React Native bundle.
// neo4j-driver uses Node.js worker_threads + large binary buffers — causes
// "DataCloneError: Data cannot be cloned, out of memory" in Metro workers.
// All Neo4j access in the app goes through Supabase Edge Functions (Deno HTTP).
config.resolver.blockList = [
  /node_modules\/neo4j-driver\//,
  /node_modules\/neo4j-driver-core\//,
  /node_modules\/neo4j-driver-bolt-connection\//,
  /node_modules\/neo4j-driver-lite\//,
];

// Limit parallel workers to reduce IPC memory pressure on large graphs
config.maxWorkers = 2;

module.exports = config;
