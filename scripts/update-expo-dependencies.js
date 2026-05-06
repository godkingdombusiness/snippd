#!/usr/bin/env node
/**
 * update-expo-dependencies.js
 *
 * Runs `npx expo install --fix` which non-interactively installs all
 * packages that are out of sync with the current Expo SDK version.
 * Expo's own resolver picks the correct versions — no manual semver parsing.
 *
 * Usage:
 *   npm run update:expo-dependencies
 *
 * In CI the GitHub Actions workflow runs this, then opens a PR if package.json
 * or package-lock.json changed.
 */

const { spawnSync } = require('child_process');

console.log('Running expo install --fix ...\n');

const result = spawnSync('npx', ['expo', 'install', '--fix'], {
  encoding: 'utf-8',
  stdio: 'inherit',   // streams output directly — no prompt buffering
  env: { ...process.env, CI: 'true' },  // suppress any remaining prompts
});

process.exit(result.status ?? 0);
