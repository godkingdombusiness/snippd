/**
 * Shared helpers for the #founder-actions queue.
 *
 * Both scripts/sync_founder_actions.mjs (the Slack renderer) and
 * scripts/process_approvals.mjs (the reply-based approver) must agree on a
 * single, deterministic ordering of items — otherwise "reply 1-3 to approve"
 * means different things on the two sides and approvals process the wrong
 * rows.
 *
 * This module owns that ordering. Any future sorting tweaks (e.g. surfacing
 * blockers first, collapsing completed items) must happen here or we'll
 * silently drift the contract with Slack.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
export const BACKLOG_PATH = path.join(
  REPO_ROOT,
  ".snippd",
  "founder-actions.json"
);

export const PRIORITY_ORDER = ["critical", "high", "medium", "low"];
export const CATEGORY_ORDER = ["security", "ship", "verify", "polish"];

export const PRIORITY_EMOJI = {
  critical: ":fire:",
  high: ":rocket:",
  medium: ":white_check_mark:",
  low: ":broom:",
};

export const CATEGORY_META = {
  security: { emoji: ":lock:", label: "Security" },
  ship: { emoji: ":ship:", label: "Ship" },
  verify: { emoji: ":mag:", label: "Verify" },
  polish: { emoji: ":sparkles:", label: "Polish" },
};

export async function loadBacklog() {
  const raw = await readFile(BACKLOG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error(
      `${BACKLOG_PATH} is missing "items" array (version=${parsed?.version})`
    );
  }
  return parsed;
}

export async function saveBacklog(backlog) {
  const body = JSON.stringify(backlog, null, 2) + "\n";
  await writeFile(BACKLOG_PATH, body, "utf8");
}

/** Deterministic item sort. Must match the Slack render order exactly. */
export function sortItems(items) {
  return [...items].sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category || "polish");
    const cb = CATEGORY_ORDER.indexOf(b.category || "polish");
    if (ca !== cb) return ca - cb;
    const pa = PRIORITY_ORDER.indexOf(a.priority || "low");
    const pb = PRIORITY_ORDER.indexOf(b.priority || "low");
    if (pa !== pb) return pa - pb;
    return (a.addedAt || "").localeCompare(b.addedAt || "");
  });
}

/**
 * Return a sorted array of items, each decorated with an `index` starting at 1.
 * The contract: this is the number the founder replies with in Slack.
 */
export function indexedItems(items) {
  return sortItems(items).map((item, i) => ({ ...item, index: i + 1 }));
}

/**
 * Parse an approval spec string into a sorted set of 1-based indices.
 *
 * Supported syntax:
 *   "all"               → every item (returns { all: true })
 *   "1-3"               → {1, 2, 3}
 *   "1,9,4,3"           → {1, 3, 4, 9}
 *   "1-3,7,9-11"        → {1, 2, 3, 7, 9, 10, 11}
 *   "2, 5 ,  7-9"       → whitespace-tolerant
 *
 * Invalid tokens throw with a helpful error so the GitHub Action surfaces it.
 * Duplicates are silently deduped. Range endpoints may be reversed ("5-3"
 * becomes {3, 4, 5}).
 */
export function parseApprovalSpec(raw) {
  if (raw == null) throw new Error("approval spec is required");
  const trimmed = String(raw).trim();
  if (!trimmed) throw new Error("approval spec is empty");
  if (/^all$/i.test(trimmed)) return { all: true, indices: null };

  const indices = new Set();
  const tokens = trimmed.split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) throw new Error("approval spec has no tokens");

  for (const token of tokens) {
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      let a = parseInt(range[1], 10);
      let b = parseInt(range[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new Error(`invalid range: "${token}"`);
      }
      if (a > b) [a, b] = [b, a];
      for (let n = a; n <= b; n++) indices.add(n);
      continue;
    }
    if (!/^\d+$/.test(token)) {
      throw new Error(`invalid approval token: "${token}"`);
    }
    indices.add(parseInt(token, 10));
  }
  return { all: false, indices: [...indices].sort((a, b) => a - b) };
}

/**
 * Resolve a parsed approval spec against the indexed item list.
 * Returns { approved, notFound } where:
 *   - approved: array of { index, item } in the order requested
 *   - notFound: array of integer indices that exceed the current queue
 */
export function resolveApprovals(indexed, spec) {
  if (spec.all) {
    return { approved: indexed.map((i) => ({ index: i.index, item: i })), notFound: [] };
  }
  const byIndex = new Map(indexed.map((i) => [i.index, i]));
  const approved = [];
  const notFound = [];
  for (const n of spec.indices) {
    const item = byIndex.get(n);
    if (item) approved.push({ index: n, item });
    else notFound.push(n);
  }
  return { approved, notFound };
}
