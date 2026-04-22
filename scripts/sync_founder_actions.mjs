#!/usr/bin/env node
/**
 * Snippd #founder-actions synchronizer.
 *
 * Renders the current founder-action queue to Slack. Source of truth is:
 *   - .snippd/founder-actions.json  (static backlog, commit-editable by any agent)
 *   - gh pr list                    (live open PRs awaiting review)
 *
 * Usage:
 *   node scripts/sync_founder_actions.mjs            # post to Slack
 *   node scripts/sync_founder_actions.mjs --dry-run  # print blocks to stdout, no POST
 *   node scripts/sync_founder_actions.mjs --no-gh    # skip live PR lookup
 *
 * Env:
 *   SLACK_ACTIONS_WEBHOOK_URL   Required for posting; in --dry-run mode, ignored.
 *   GITHUB_REPO                 Defaults to godkingdombusiness/snippd.
 *
 * Exit codes:
 *   0 — posted or dry-run rendered successfully
 *   1 — Slack webhook returned non-2xx
 *   2 — config / input error (bad JSON, missing file, etc.)
 *
 * Design notes:
 *   This intentionally posts a fresh top-level message on each sync rather than
 *   threading replies to a pinned parent. Incoming webhooks don't return the
 *   message ts, so true threading would require a Slack bot token + Web API —
 *   a heavier auth story than this deserves. The channel itself is the log;
 *   pin the most recent snapshot and history scrolls above.
 */

import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileP = promisify(execFile);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const BACKLOG_PATH = path.join(REPO_ROOT, ".snippd", "founder-actions.json");
const DEFAULT_REPO = "godkingdombusiness/snippd";

const PRIORITY_EMOJI = {
  critical: ":fire:",
  high: ":rocket:",
  medium: ":white_check_mark:",
  low: ":broom:",
};

const CATEGORY_META = {
  security: { emoji: ":lock:", label: "Security" },
  ship: { emoji: ":ship:", label: "Ship" },
  verify: { emoji: ":mag:", label: "Verify" },
  polish: { emoji: ":sparkles:", label: "Polish" },
};

const PRIORITY_ORDER = ["critical", "high", "medium", "low"];
const CATEGORY_ORDER = ["security", "ship", "verify", "polish"];

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--no-gh") out.noGh = true;
  }
  return out;
}

async function loadBacklog() {
  const raw = await readFile(BACKLOG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error(
      `${BACKLOG_PATH} is missing "items" array (version=${parsed?.version})`
    );
  }
  return parsed;
}

/**
 * Pull open PRs from GitHub via `gh`. Silently returns [] if gh is absent or
 * unauthenticated — the backlog JSON is still the primary signal; this just
 * enriches the post with live review state.
 */
async function loadOpenPRs(repo) {
  try {
    const { stdout } = await execFileP(
      "gh",
      [
        "pr",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--json",
        "number,title,url,isDraft,author,createdAt",
        "--limit",
        "50",
      ],
      { timeout: 10_000 }
    );
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(
      `[sync_founder_actions] gh pr list failed (${
        err.code || err.message
      }) — skipping live PR enrichment.`
    );
    return [];
  }
}

function sortItems(items) {
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

function groupByCategory(items) {
  const buckets = new Map();
  for (const item of items) {
    const key = item.category || "polish";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  return buckets;
}

/**
 * Build an mrkdwn bullet line for a single action item.
 * Truncates long "why" text so a 50-item list doesn't blow through Slack's
 * 3000-char-per-block limit.
 */
function renderItemLine(item) {
  const pri = PRIORITY_EMOJI[item.priority] || PRIORITY_EMOJI.low;
  const why = (item.why || "").replace(/\s+/g, " ").trim().slice(0, 240);
  const whereLine = item.where
    ? item.where.startsWith("http")
      ? ` <${item.where}|open>`
      : ` _(${item.where.slice(0, 120)})_`
    : "";
  const blockedSuffix =
    Array.isArray(item.blockedBy) && item.blockedBy.length
      ? ` :hourglass: _blocked by: ${item.blockedBy.join(", ")}_`
      : "";
  const addedBy = item.addedBy ? ` — added by ${item.addedBy}` : "";
  return `${pri} *${item.title}*${whereLine}\n   ${why}${blockedSuffix}${addedBy}`;
}

function buildBlocks({ backlog, prs, repo }) {
  const sorted = sortItems(backlog.items);
  const grouped = groupByCategory(sorted);

  const totalsByPriority = PRIORITY_ORDER.reduce((acc, p) => {
    acc[p] = sorted.filter((i) => i.priority === p).length;
    return acc;
  }, {});

  const headerLine =
    `*Founder Action Queue* — ${sorted.length} open · ` +
    PRIORITY_ORDER.filter((p) => totalsByPriority[p] > 0)
      .map((p) => `${PRIORITY_EMOJI[p]} ${totalsByPriority[p]}`)
      .join("  ");

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":clipboard: Founder Action Queue",
        emoji: true,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: headerLine },
    },
    { type: "divider" },
  ];

  for (const categoryKey of CATEGORY_ORDER) {
    const items = grouped.get(categoryKey);
    if (!items || !items.length) continue;
    const meta = CATEGORY_META[categoryKey];
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${meta.emoji} *${meta.label}* _(${items.length})_`,
      },
    });
    // Slack caps a single section block at 3000 chars. Chunk items into
    // multi-block sections to stay well under that.
    const CHUNK = 6;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: chunk.map(renderItemLine).join("\n\n"),
        },
      });
    }
  }

  if (prs.length) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:mag_right: *Open PRs awaiting your review* _(${prs.length})_`,
      },
    });
    const prChunks = [];
    const CHUNK = 8;
    const prLines = prs
      .sort((a, b) => a.number - b.number)
      .map((pr) => {
        const draft = pr.isDraft ? " _(draft)_" : "";
        const author = pr.author?.login ? ` — @${pr.author.login}` : "";
        return `• <${pr.url}|#${pr.number}> ${pr.title}${draft}${author}`;
      });
    for (let i = 0; i < prLines.length; i += CHUNK) {
      prChunks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: prLines.slice(i, i + CHUNK).join("\n"),
        },
      });
    }
    blocks.push(...prChunks);
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          `_Synced ${new Date().toUTCString()} · ` +
          `source: \`.snippd/founder-actions.json\` on ${repo} · ` +
          `edit the JSON in a PR to add/remove items._`,
      },
    ],
  });

  return blocks;
}

function buildFallbackText(sorted) {
  return (
    `Founder action queue: ${sorted.length} open. ` +
    sorted
      .slice(0, 3)
      .map((i) => `[${i.priority}] ${i.title}`)
      .join(" · ")
  ).slice(0, 300);
}

async function postToSlack(webhook, payload) {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Slack webhook ${res.status}: ${txt.slice(0, 200)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;

  let backlog;
  try {
    backlog = await loadBacklog();
  } catch (err) {
    console.error(`[sync_founder_actions] failed to load backlog: ${err.message}`);
    process.exit(2);
  }

  const prs = args.noGh ? [] : await loadOpenPRs(repo);
  const blocks = buildBlocks({ backlog, prs, repo });
  const fallback = buildFallbackText(sortItems(backlog.items));

  const payload = { text: fallback, blocks };

  if (args.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    console.log(
      `[sync_founder_actions] dry-run: ${backlog.items.length} items, ${prs.length} live PRs.`
    );
    return;
  }

  const webhook = process.env.SLACK_ACTIONS_WEBHOOK_URL;
  if (!webhook) {
    console.warn(
      "[sync_founder_actions] SLACK_ACTIONS_WEBHOOK_URL is not set — nothing posted. " +
        "Run with --dry-run to preview, or set the env var to go live."
    );
    return;
  }

  try {
    await postToSlack(webhook, payload);
    console.log(
      `[sync_founder_actions] posted: ${backlog.items.length} items, ${prs.length} live PRs.`
    );
  } catch (err) {
    console.error(`[sync_founder_actions] post failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
