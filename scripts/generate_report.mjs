#!/usr/bin/env node
/**
 * Snippd #reports heartbeat generator.
 *
 * Assembles a live snapshot of the app's health across four axes and posts
 * it to the #reports Slack channel. Same shape as sync_founder_actions.mjs —
 * a rich Block Kit message, fallback text for push notifications, graceful
 * no-op when the webhook isn't configured.
 *
 * Signals pulled automatically (no dashboards required):
 *   1. Health       — `npm audit` vuln counts, package count.
 *   2. Shipping     — open PRs + merges to main in the last `--since-hours`.
 *   3. Founder Queue — count + priority breakdown from
 *                      .snippd/founder-actions.json.
 *   4. CI           — conclusion of the most recent ci.yml run on main.
 *
 * Signals intentionally skipped (need paid integrations or secrets we don't
 * have in a cron runner): Sentry issue count, Supabase DB stats, Stripe
 * revenue deltas. Those belong to a follow-up report class once we have the
 * API credentials wired.
 *
 * Usage:
 *   node scripts/generate_report.mjs              # post to Slack
 *   node scripts/generate_report.mjs --dry-run    # print blocks to stdout
 *   node scripts/generate_report.mjs --since-hours 6
 *
 * Env:
 *   SLACK_REPORTS_WEBHOOK_URL   Required for posting (graceful skip if unset).
 *   GITHUB_REPO                 Defaults to godkingdombusiness/snippd.
 *
 * Exit codes:
 *   0 — posted, skipped (no webhook), or dry-run rendered successfully
 *   1 — Slack webhook returned non-2xx
 *   2 — config / input error
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
const DEFAULT_REPO = "godkingdombusiness/snippd";
const DEFAULT_SINCE_HOURS = 6;

function parseArgs(argv) {
  const out = { sinceHours: DEFAULT_SINCE_HOURS };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--since-hours") {
      out.sinceHours = Number(argv[i + 1]);
      i++;
    }
  }
  if (!Number.isFinite(out.sinceHours) || out.sinceHours <= 0) {
    out.sinceHours = DEFAULT_SINCE_HOURS;
  }
  return out;
}

// --- data gathering ---------------------------------------------------------

// On Windows the `npm` entry point is `npm.cmd`, not a binary. execFile
// doesn't consult PATHEXT, so we have to pick the right one explicitly.
const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";

async function getNpmAudit() {
  try {
    const { stdout } = await execFileP(NPM_BIN, ["audit", "--json"], {
      timeout: 30_000,
      cwd: REPO_ROOT,
      // npm audit exits non-zero when vulns exist; we still want the JSON.
      maxBuffer: 10 * 1024 * 1024,
      // Node >=18.20 rejects .cmd / .bat execution via execFile for security
      // unless `shell: true` is set. Safe here because the args are static.
      shell: process.platform === "win32",
    });
    return JSON.parse(stdout);
  } catch (err) {
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        // fall through
      }
    }
    return { _error: err.code || err.message };
  }
}

function summarizeAudit(audit) {
  if (!audit || audit._error) {
    return { error: audit?._error || "unknown", total: null };
  }
  const sev = audit?.metadata?.vulnerabilities || {};
  const total = Object.values(sev).reduce(
    (acc, v) => acc + (typeof v === "number" ? v : 0),
    0
  );
  const deps = audit?.metadata?.totalDependencies ?? null;
  return {
    total,
    critical: sev.critical || 0,
    high: sev.high || 0,
    moderate: sev.moderate || 0,
    low: sev.low || 0,
    info: sev.info || 0,
    totalDependencies: deps,
  };
}

async function getOpenPRs(repo) {
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
        "number,title,url,isDraft,author,createdAt,labels",
        "--limit",
        "50",
      ],
      { timeout: 15_000 }
    );
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

async function getRecentMerges(sinceHours) {
  // Use git log since `gh` would require an auth token and a network round-trip.
  // `main` already exists locally in the CI runner after actions/checkout.
  const sinceIso = new Date(
    Date.now() - sinceHours * 3600 * 1000
  ).toISOString();
  try {
    const { stdout } = await execFileP(
      "git",
      [
        "log",
        `--since=${sinceIso}`,
        "--first-parent",
        "origin/main",
        "--pretty=format:%h\t%an\t%s",
      ],
      { timeout: 10_000, cwd: REPO_ROOT }
    );
    if (!stdout.trim()) return [];
    return stdout
      .trim()
      .split("\n")
      .map((line) => {
        const [sha, author, ...rest] = line.split("\t");
        return { sha, author, subject: rest.join("\t") };
      });
  } catch {
    return [];
  }
}

async function getLatestCi(repo) {
  try {
    const { stdout } = await execFileP(
      "gh",
      [
        "run",
        "list",
        "--repo",
        repo,
        "--workflow",
        "ci.yml",
        "--branch",
        "main",
        "--limit",
        "1",
        "--json",
        "conclusion,status,displayTitle,url,createdAt",
      ],
      { timeout: 15_000 }
    );
    const rows = JSON.parse(stdout);
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function getFounderQueue() {
  try {
    const raw = await readFile(
      path.join(REPO_ROOT, ".snippd", "founder-actions.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw);
    const items = parsed.items || [];
    const counts = {
      total: items.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const item of items) {
      const p = item.priority || "low";
      if (p in counts) counts[p]++;
    }
    return counts;
  } catch {
    return null;
  }
}

// --- rendering --------------------------------------------------------------

const HEALTH_EMOJI = (totalVulns, ciConclusion) => {
  if (totalVulns === null) return ":grey_question:";
  if (ciConclusion === "failure") return ":x:";
  if (totalVulns === 0 && ciConclusion === "success") return ":green_heart:";
  if (totalVulns > 0) return ":warning:";
  return ":hourglass_flowing_sand:";
};

function formatEasternNow() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

function buildBlocks({
  auditSummary,
  openPRs,
  merges,
  ci,
  founderCounts,
  sinceHours,
}) {
  const blocks = [];

  const headerEmoji = HEALTH_EMOJI(auditSummary.total, ci?.conclusion);
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `${headerEmoji} Snippd Heartbeat Report`,
      emoji: true,
    },
  });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `_${formatEasternNow()} · window: last ${sinceHours}h_`,
      },
    ],
  });
  blocks.push({ type: "divider" });

  // --- Health
  const healthLines = [];
  if (auditSummary.error) {
    healthLines.push(`:grey_question: npm audit: _unavailable_ (${auditSummary.error})`);
  } else {
    const vulnEmoji =
      auditSummary.total === 0
        ? ":white_check_mark:"
        : auditSummary.critical > 0
          ? ":rotating_light:"
          : auditSummary.high > 0
            ? ":warning:"
            : ":information_source:";
    const deps =
      auditSummary.totalDependencies != null
        ? ` _(${auditSummary.totalDependencies} deps)_`
        : "";
    healthLines.push(
      `${vulnEmoji} *npm audit:* ${auditSummary.total} vulns` +
        (auditSummary.total === 0
          ? ""
          : ` · C:${auditSummary.critical} H:${auditSummary.high} M:${auditSummary.moderate} L:${auditSummary.low}`) +
        deps
    );
  }

  if (ci) {
    const ciEmoji =
      ci.conclusion === "success"
        ? ":white_check_mark:"
        : ci.conclusion === "failure"
          ? ":x:"
          : ci.conclusion === "cancelled"
            ? ":black_circle:"
            : ":hourglass_flowing_sand:";
    healthLines.push(
      `${ciEmoji} *Latest CI on main:* ${ci.conclusion || ci.status} — <${ci.url}|view run>`
    );
  } else {
    healthLines.push(`:grey_question: *Latest CI on main:* _unavailable_`);
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*Health*\n${healthLines.join("\n")}` },
  });

  // --- Shipping
  const shippingLines = [];
  shippingLines.push(
    `:package: *Merges to main (${sinceHours}h):* ${merges.length}`
  );
  if (merges.length) {
    const shown = merges.slice(0, 5).map((m) => `   • \`${m.sha}\` ${m.subject} — _${m.author}_`);
    shippingLines.push(shown.join("\n"));
    if (merges.length > 5) {
      shippingLines.push(`   _…and ${merges.length - 5} more_`);
    }
  }
  shippingLines.push(`:mag: *Open PRs:* ${openPRs.length}`);
  if (openPRs.length) {
    const shown = openPRs
      .slice()
      .sort((a, b) => a.number - b.number)
      .slice(0, 6)
      .map((pr) => {
        const draft = pr.isDraft ? " _(draft)_" : "";
        return `   • <${pr.url}|#${pr.number}> ${pr.title}${draft}`;
      });
    shippingLines.push(shown.join("\n"));
    if (openPRs.length > 6) {
      shippingLines.push(`   _…and ${openPRs.length - 6} more_`);
    }
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*Shipping*\n${shippingLines.join("\n")}` },
  });

  // --- Founder queue
  if (founderCounts) {
    const qLine = `:clipboard: *Founder queue:* ${founderCounts.total} open · :fire: ${founderCounts.critical} · :rocket: ${founderCounts.high} · :white_check_mark: ${founderCounts.medium} · :broom: ${founderCounts.low}`;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Your queue*\n${qLine}\n_Full list posts separately to #founder-actions._`,
      },
    });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          "_Cadence: 1am · 5am · 9am · 11am · 3pm · 8pm ET · source: `scripts/generate_report.mjs`_",
      },
    ],
  });

  return blocks;
}

function buildFallbackText({ auditSummary, openPRs, merges, ci, founderCounts }) {
  const healthTag =
    auditSummary.total === 0 && ci?.conclusion === "success"
      ? "green"
      : auditSummary.critical > 0 || ci?.conclusion === "failure"
        ? "red"
        : "yellow";
  return (
    `Snippd heartbeat [${healthTag}]: ` +
    `${auditSummary.total ?? "?"} vulns · ` +
    `${openPRs.length} open PRs · ` +
    `${merges.length} merges · ` +
    `${founderCounts?.total ?? "?"} founder items`
  ).slice(0, 300);
}

// --- main -------------------------------------------------------------------

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

  const [audit, openPRs, merges, ci, founderCounts] = await Promise.all([
    getNpmAudit(),
    getOpenPRs(repo),
    getRecentMerges(args.sinceHours),
    getLatestCi(repo),
    getFounderQueue(),
  ]);

  const auditSummary = summarizeAudit(audit);
  const blocks = buildBlocks({
    auditSummary,
    openPRs,
    merges,
    ci,
    founderCounts,
    sinceHours: args.sinceHours,
  });
  const fallback = buildFallbackText({
    auditSummary,
    openPRs,
    merges,
    ci,
    founderCounts,
  });

  const payload = { text: fallback, blocks };

  if (args.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    console.log(
      `[generate_report] dry-run: audit.total=${auditSummary.total}, ` +
        `openPRs=${openPRs.length}, merges=${merges.length}, ` +
        `founder=${founderCounts?.total ?? "n/a"}`
    );
    return;
  }

  const webhook = process.env.SLACK_REPORTS_WEBHOOK_URL;
  if (!webhook) {
    console.warn(
      "[generate_report] SLACK_REPORTS_WEBHOOK_URL is not set — nothing posted. " +
        "Run with --dry-run to preview, or set the env var to go live."
    );
    return;
  }

  try {
    await postToSlack(webhook, payload);
    console.log(
      `[generate_report] posted: ${auditSummary.total ?? "?"} vulns, ` +
        `${openPRs.length} open PRs, ${merges.length} merges.`
    );
  } catch (err) {
    console.error(`[generate_report] post failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
