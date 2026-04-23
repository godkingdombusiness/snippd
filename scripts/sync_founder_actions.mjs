#!/usr/bin/env node
/**
 * Snippd #founder-actions synchronizer.
 *
 * Renders the current founder-action queue to Slack with **stable 1-based
 * indices** so the founder can approve items by replying with the
 * corresponding numbers (parsed by scripts/process_approvals.mjs via the
 * `Founder approval inbox` GitHub Action).
 *
 * Source of truth is:
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
 *   This posts a fresh top-level message on each sync rather than threading
 *   replies to a pinned parent. Incoming webhooks don't return the message
 *   ts, so true threading would require a Slack bot token + Web API. The
 *   channel itself is the log; pin the most recent snapshot and history
 *   scrolls above.
 *
 *   Items are numbered using the deterministic `indexedItems()` contract in
 *   _founder_actions_shared.mjs. That contract is ALSO used by the approval
 *   processor — if you change the sort, change it there, not here.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  PRIORITY_EMOJI,
  PRIORITY_ORDER,
  indexedItems,
  loadBacklog,
} from "./_founder_actions_shared.mjs";

const execFileP = promisify(execFile);
const DEFAULT_REPO = "godkingdombusiness/snippd";

// Title of the pinned GitHub Issue that mirrors the live founder-action queue.
// Must match the issue created in the repo — see also issues #27 (firmwide) and
// #30-36 (per-department channels). This one is owned by dept:exec and serves
// as the GitHub-side equivalent of the Slack action-needed channel so the
// queue stays visible even when Slack is dark.
const FOUNDER_ACTIONS_ISSUE_TITLE =
  "[action-needed] Founder action queue · live";

// GitHub Markdown emoji equivalents for the same priority/category signals
// Slack uses. Keep these parallel to PRIORITY_EMOJI / CATEGORY_META in
// _founder_actions_shared.mjs so the two surfaces feel identical.
const PRIORITY_MD = {
  critical: ":fire:",
  high: ":rocket:",
  medium: ":white_check_mark:",
  low: ":broom:",
};
const CATEGORY_MD = {
  security: { emoji: ":lock:", label: "Security" },
  ship: { emoji: ":ship:", label: "Ship" },
  verify: { emoji: ":mag:", label: "Verify" },
  polish: { emoji: ":sparkles:", label: "Polish" },
};

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--no-gh") out.noGh = true;
  }
  return out;
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
 * Build an mrkdwn bullet line for a single action item. The leading
 * `[N]` is the founder-facing approval number — scripts/process_approvals.mjs
 * resolves the same N back to this item via `indexedItems()`.
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
  return `*[${item.index}]* ${pri} *${item.title}*${whereLine}\n   ${why}${blockedSuffix}${addedBy}`;
}

function buildBlocks({ backlog, prs, repo }) {
  const indexed = indexedItems(backlog.items);
  const grouped = groupByCategory(indexed);

  const totalsByPriority = PRIORITY_ORDER.reduce((acc, p) => {
    acc[p] = indexed.filter((i) => i.priority === p).length;
    return acc;
  }, {});

  const headerLine =
    `*Founder Action Queue* — ${indexed.length} open · ` +
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

  // Founder approval instructions — always visible at the bottom so the reply
  // syntax stays discoverable even in a long list.
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        ":ballot_box_with_check: *How to approve*\n" +
        "Open the *Founder approval inbox* workflow in GitHub Actions " +
        `(<https://github.com/${repo}/actions/workflows/process-approvals.yml|here>), ` +
        "click *Run workflow*, and paste your approval spec:\n" +
        "• `all` → approve every item above\n" +
        "• `1-3` → approve items 1 through 3\n" +
        "• `1,9,4,3` → approve those specific items\n" +
        "• `1-3,7,9-11` → any mix of ranges and singles\n" +
        "Approved items that have an automated action (merging a PR, dispatching a workflow) run immediately. " +
        "Manual items (rotate a key, verify a webhook) get acknowledged and drop out of the queue.",
    },
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          `_Synced ${new Date().toUTCString()} · ` +
          `source: \`.snippd/founder-actions.json\` on ${repo} · ` +
          `numbers above are stable for this post · ` +
          `edit the JSON in a PR to add new items._`,
      },
    ],
  });

  return blocks;
}

/**
 * Render the current queue as a GitHub-flavored Markdown body. This is what
 * gets written into the pinned `[action-needed] Founder action queue · live`
 * issue every sync, so the founder can see the live queue in GitHub (and
 * receive a notification email on every change) even while Slack is dark.
 */
function renderMarkdownBody({ backlog, prs, repo }) {
  const indexed = indexedItems(backlog.items);
  const grouped = groupByCategory(indexed);

  const totalsByPriority = PRIORITY_ORDER.reduce((acc, p) => {
    acc[p] = indexed.filter((i) => i.priority === p).length;
    return acc;
  }, {});

  const headerCounts = PRIORITY_ORDER.filter((p) => totalsByPriority[p] > 0)
    .map((p) => `${PRIORITY_MD[p]} **${p}** ${totalsByPriority[p]}`)
    .join(" · ");

  const lines = [];
  lines.push("# :clipboard: Founder Action Queue");
  lines.push("");
  lines.push(
    `**${indexed.length} open** · ${headerCounts || "_none_"} · updated ${new Date().toUTCString()}`
  );
  lines.push("");
  lines.push(
    "> This issue body is rewritten automatically by `founder-actions-sync` " +
      "every time the queue changes. Subscribe to this issue to receive an " +
      "email the moment a new founder action lands, and so you can see the " +
      "current queue without digging through Slack."
  );
  lines.push("");

  for (const categoryKey of CATEGORY_ORDER) {
    const items = grouped.get(categoryKey);
    if (!items || !items.length) continue;
    const meta = CATEGORY_MD[categoryKey];
    lines.push(`## ${meta.emoji} ${meta.label} _(${items.length})_`);
    lines.push("");
    for (const item of items) {
      const pri = PRIORITY_MD[item.priority] || PRIORITY_MD.low;
      lines.push(`### ${pri} [${item.index}] ${item.title}`);
      const meta = [];
      if (item.priority) meta.push(`**priority:** ${item.priority}`);
      if (item.category) meta.push(`**category:** ${item.category}`);
      if (item.addedBy) meta.push(`**added by:** ${item.addedBy}`);
      if (item.addedAt) meta.push(`**added:** ${item.addedAt}`);
      if (Array.isArray(item.blockedBy) && item.blockedBy.length) {
        meta.push(`:hourglass_flowing_sand: **blocked by:** ${item.blockedBy.join(", ")}`);
      }
      if (meta.length) lines.push(meta.join(" · "));
      if (item.why) {
        lines.push("");
        lines.push(`**Why:** ${item.why}`);
      }
      if (item.where) {
        lines.push("");
        if (item.where.startsWith("http")) {
          lines.push(`**Where:** <${item.where}>`);
        } else {
          lines.push(`**Where:** ${item.where}`);
        }
      }
      lines.push("");
    }
  }

  if (prs.length) {
    lines.push("---");
    lines.push("");
    lines.push(`## :mag_right: Open PRs awaiting your review _(${prs.length})_`);
    lines.push("");
    for (const pr of [...prs].sort((a, b) => a.number - b.number)) {
      const draft = pr.isDraft ? " _(draft)_" : "";
      const author = pr.author?.login ? ` — @${pr.author.login}` : "";
      lines.push(`- [#${pr.number}](${pr.url}) ${pr.title}${draft}${author}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## :ballot_box_with_check: How to approve");
  lines.push("");
  lines.push(
    `Open the [Founder approval inbox workflow](https://github.com/${repo}/actions/workflows/process-approvals.yml), ` +
      "click **Run workflow**, and paste an approval spec:"
  );
  lines.push("");
  lines.push("- `all` → approve every item above");
  lines.push("- `1-3` → approve items 1 through 3");
  lines.push("- `1,9,4,3` → approve those specific items");
  lines.push("- `1-3,7,9-11` → any mix of ranges and singles");
  lines.push("");
  lines.push(
    "Approved items that have an automated action run immediately. Manual items " +
      "get acknowledged and drop out of the queue on the next sync."
  );
  lines.push("");
  lines.push(
    `_Source of truth: [\`.snippd/founder-actions.json\`](https://github.com/${repo}/blob/main/.snippd/founder-actions.json) · ` +
      `numbers above are stable until the next sync · edit the JSON in a PR to add items._`
  );

  return lines.join("\n");
}

/**
 * Find the pinned `[action-needed] Founder action queue · live` issue and
 * overwrite its body with the current rendered queue. Silently skips if the
 * `gh` CLI isn't authenticated or the issue doesn't exist — the Slack post is
 * still the primary surface, this is just a mirror.
 */
async function updateFounderActionsIssue({ body, repo }) {
  let issueNumber = process.env.FOUNDER_ACTIONS_ISSUE_NUMBER;

  if (!issueNumber) {
    try {
      const { stdout } = await execFileP(
        "gh",
        [
          "issue",
          "list",
          "--repo",
          repo,
          "--state",
          "open",
          "--label",
          "channel",
          "--search",
          FOUNDER_ACTIONS_ISSUE_TITLE,
          "--json",
          "number,title",
          "--limit",
          "20",
        ],
        { timeout: 10_000 }
      );
      const parsed = JSON.parse(stdout || "[]");
      const match = parsed.find((i) => i.title === FOUNDER_ACTIONS_ISSUE_TITLE);
      if (!match) {
        console.warn(
          `[sync_founder_actions] no issue titled "${FOUNDER_ACTIONS_ISSUE_TITLE}" found — ` +
            "create it once with the ch_action_needed.md body and this script will keep it in sync."
        );
        return { updated: false };
      }
      issueNumber = String(match.number);
    } catch (err) {
      console.warn(
        `[sync_founder_actions] gh issue lookup failed (${err.code || err.message}) — skipping issue mirror.`
      );
      return { updated: false };
    }
  }

  const dir = await mkdtemp(path.join(tmpdir(), "founder-actions-"));
  const bodyPath = path.join(dir, "body.md");
  try {
    await writeFile(bodyPath, body, "utf8");
    await execFileP(
      "gh",
      ["issue", "edit", issueNumber, "--repo", repo, "--body-file", bodyPath],
      { timeout: 15_000 }
    );
    console.log(
      `[sync_founder_actions] updated issue #${issueNumber} body (${body.length} chars).`
    );
    return { updated: true, issueNumber };
  } catch (err) {
    console.warn(
      `[sync_founder_actions] gh issue edit failed (${err.code || err.message}) — skipping issue mirror.`
    );
    return { updated: false };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildFallbackText(indexed) {
  return (
    `Founder action queue: ${indexed.length} open. ` +
    indexed
      .slice(0, 3)
      .map((i) => `[${i.index}] ${i.title}`)
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
  const indexed = indexedItems(backlog.items);
  const fallback = buildFallbackText(indexed);
  const markdownBody = renderMarkdownBody({ backlog, prs, repo });

  const payload = { text: fallback, blocks };

  if (args.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    console.log("---- markdown body (for GitHub issue) ----");
    console.log(markdownBody);
    console.log(
      `[sync_founder_actions] dry-run: ${backlog.items.length} items, ${prs.length} live PRs.`
    );
    return;
  }

  // Mirror the queue to the pinned GitHub channel issue so the founder sees
  // it even when Slack is dark. Best-effort — never fails the workflow. Skip
  // when SKIP_ISSUE_MIRROR is set (useful for local dry runs without gh auth).
  if (!process.env.SKIP_ISSUE_MIRROR) {
    try {
      await updateFounderActionsIssue({ body: markdownBody, repo });
    } catch (err) {
      console.warn(
        `[sync_founder_actions] issue mirror threw (${err.message}) — continuing.`
      );
    }
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
