#!/usr/bin/env node
/**
 * @Apple-Reviewer audit — runs the Snippd codebase against a checklist derived
 * from the App Store Review Guidelines (.snippd/app-review-checks.json) and
 * posts a structured verdict to #app-review in Slack.
 *
 * This is NOT a replacement for a real App Store submission review, but it
 * catches the high-frequency rejection reasons before you waste a review
 * cycle. The goal is: "when we hit Submit for Review, we have high confidence
 * we won't be rejected on a blocker guideline."
 *
 * Usage:
 *   node scripts/audit_app_review.mjs                 # post to Slack
 *   node scripts/audit_app_review.mjs --dry-run       # stdout only (full JSON)
 *   node scripts/audit_app_review.mjs --summary       # stdout only (human)
 *   node scripts/audit_app_review.mjs --fail-on-blocker  # exit 1 if any blocker fails
 *
 * Env:
 *   SLACK_APP_REVIEW_WEBHOOK_URL   Required for posting (graceful skip if unset).
 *   GITHUB_REPO                    Defaults to godkingdombusiness/snippd.
 *
 * How checks run:
 *   Each entry in app-review-checks.json carries an `automation` block when
 *   the check can be machine-evaluated. Supported automation kinds:
 *
 *     - forbidden-strings         : fail if any pattern is found in `paths`
 *     - html-title                : parse index.html <title> and fail on `forbid`
 *     - payment-processor-detection: flag external payment SDKs in imports
 *     - conditional-grep          : if any-of A matches, then any-of B must match
 *     - grep  (patternsAny)       : fail if NONE of the patterns is found
 *     - grep  (patternsAll)       : fail if any pattern is missing
 *     - sentry-replay-detection   : flag presence of Sentry session replay
 *     - file-existence-or-grep    : pass if any pattern is found in `paths`
 *
 *   Manual checks (automated=false) always render as "manual-review" — they
 *   belong to the reviewer/founder, not to this script.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const CHECKLIST_PATH = path.join(
  REPO_ROOT,
  ".snippd",
  "app-review-checks.json"
);

const SEVERITY_ORDER = ["blocker", "high", "medium", "low"];
const SEVERITY_EMOJI = {
  blocker: ":rotating_light:",
  high: ":warning:",
  medium: ":large_yellow_circle:",
  low: ":white_small_square:",
};

const STATUS_EMOJI = {
  pass: ":white_check_mark:",
  fail: ":x:",
  "manual-review": ":ballot_box_with_check:",
  error: ":grey_question:",
};

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--summary") out.summary = true;
    else if (a === "--fail-on-blocker") out.failOnBlocker = true;
  }
  return out;
}

// --- filesystem helpers -----------------------------------------------------

// Extensions we actually want to scan. Keeps us out of node_modules, dist,
// image binaries, and other noise. `paths` in the JSON is always relative
// to REPO_ROOT.
const SCAN_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".html",
  ".css",
  ".md",
  ".json",
  ".yml",
  ".yaml",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "build",
  "coverage",
  ".next",
  ".venv",
  "__pycache__",
]);

async function* walk(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!ext || SCAN_EXTENSIONS.has(ext) || entry.name === ".cursorrules") {
        yield full;
      }
    }
  }
}

async function readFileSafe(p) {
  try {
    const s = await stat(p);
    if (!s.isFile()) return null;
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

/** Search `paths` for any regex in `patterns`. Returns {matched, hits}. */
async function searchPaths(paths, patterns, { negate = false } = {}) {
  const regexes = patterns.map((p) => new RegExp(p, "i"));
  const hits = [];
  for (const rel of paths) {
    const abs = path.resolve(REPO_ROOT, rel);
    const s = await stat(abs).catch(() => null);
    if (!s) continue;
    const files = s.isDirectory() ? walk(abs) : [abs];
    for await (const file of files) {
      const content = await readFileSafe(file);
      if (content == null) continue;
      for (const rx of regexes) {
        const m = content.match(rx);
        if (m) {
          hits.push({
            file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"),
            pattern: rx.source,
            snippet: (m[0] || "").slice(0, 120),
          });
          if (!negate) break;
        }
      }
    }
  }
  return { matched: hits.length > 0, hits: hits.slice(0, 8) };
}

// --- automation runners -----------------------------------------------------

async function runForbiddenStrings(check) {
  const { paths, patterns } = check.automation;
  const { matched, hits } = await searchPaths(paths, patterns);
  return matched
    ? {
        status: "fail",
        evidence: `Found ${hits.length} forbidden string(s): ${hits
          .map((h) => `\`${h.file}\``)
          .slice(0, 3)
          .join(", ")}`,
      }
    : { status: "pass", evidence: "No forbidden strings in scanned paths." };
}

async function runHtmlTitle(check) {
  const htmlPath = path.resolve(REPO_ROOT, "index.html");
  const html = await readFileSafe(htmlPath);
  if (html == null) {
    return {
      status: "error",
      evidence: "Could not read index.html.",
    };
  }
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = m ? m[1].trim() : "";
  const forbidden = (check.automation.forbid || []).find((f) =>
    title.toLowerCase().includes(f.toLowerCase())
  );
  return forbidden
    ? {
        status: "fail",
        evidence: `<title> contains forbidden string "${forbidden}" (current: "${title}").`,
      }
    : {
        status: "pass",
        evidence: `<title>: "${title || "<empty>"}".`,
      };
}

async function runPaymentProcessorDetection(check) {
  const { paths, flaggedImports, flaggedUrlRedirects = [] } = check.automation;
  const sdkPatterns = flaggedImports.map(
    (imp) => `from\\s+["']${imp.replace(/[/@]/g, "\\$&")}["']`
  );
  const packageJsonPattern = flaggedImports.map((imp) =>
    imp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );

  const srcPaths = paths.filter((p) => p !== "package.json");
  const importHits = await searchPaths(srcPaths, sdkPatterns);
  const pkgHits = await searchPaths(["package.json"], packageJsonPattern);
  const urlHits = flaggedUrlRedirects.length
    ? await searchPaths(srcPaths, flaggedUrlRedirects)
    : { matched: false, hits: [] };

  if (!importHits.matched && !pkgHits.matched && !urlHits.matched) {
    return {
      status: "pass",
      evidence: "No external payment SDKs or payment-link redirects detected.",
    };
  }
  const reasons = [];
  if (importHits.matched) {
    reasons.push(
      `SDK import(s) in ${importHits.hits
        .map((h) => h.file)
        .slice(0, 2)
        .join(", ")}`
    );
  }
  if (pkgHits.matched) {
    reasons.push(
      `payment SDK in package.json (${pkgHits.hits
        .map((h) => h.snippet.trim())
        .slice(0, 2)
        .join(", ")})`
    );
  }
  if (urlHits.matched) {
    reasons.push(
      `external checkout URL redirect in ${urlHits.hits
        .map((h) => h.file)
        .slice(0, 2)
        .join(", ")}`
    );
  }
  return {
    status: "fail",
    evidence: `External payment flow detected — ${reasons.join("; ")}. iOS submission of a digital subscription requires Apple IAP (StoreKit) or an approved exception (reader app, External Link Account Entitlement).`,
  };
}

async function runUgcAbsence(check) {
  const { paths, ugcPatterns } = check.automation;
  const { matched, hits } = await searchPaths(paths, ugcPatterns);
  return matched
    ? {
        status: "manual-review",
        evidence: `UGC call sites detected in ${hits
          .map((h) => h.file)
          .slice(0, 2)
          .join(", ")}. Verify EULA, reporting, blocking, and moderation are in place.`,
      }
    : {
        status: "pass",
        evidence: "No user-generated content creation patterns detected.",
      };
}

async function runConditionalGrep(check) {
  const { paths, ifAnyPresent, thenMustAlsoMatch } = check.automation;
  const trigger = await searchPaths(paths, ifAnyPresent);
  if (!trigger.matched) {
    return {
      status: "pass",
      evidence: "No third-party social-login imports detected — rule does not apply.",
    };
  }
  const required = await searchPaths(paths, thenMustAlsoMatch);
  return required.matched
    ? {
        status: "pass",
        evidence: `Third-party login present (${trigger.hits[0].file}) and Sign in with Apple present (${required.hits[0].file}).`,
      }
    : {
        status: "fail",
        evidence: `Found third-party login (${trigger.hits[0].file}) but NO Sign in with Apple. Guideline 4.8 requires both.`,
      };
}

async function runGrepAny(check) {
  const { paths, patternsAny } = check.automation;
  const { matched, hits } = await searchPaths(paths, patternsAny);
  return matched
    ? {
        status: "pass",
        evidence: `Matched in ${hits[0].file} (pattern: ${hits[0].pattern}).`,
      }
    : {
        status: "fail",
        evidence: `None of the expected patterns matched in ${paths.join(", ")}.`,
      };
}

async function runGrepAll(check) {
  const { paths, patternsAll } = check.automation;
  const missing = [];
  const found = [];
  for (const p of patternsAll) {
    const { matched, hits } = await searchPaths(paths, [p]);
    if (!matched) missing.push(p);
    else found.push({ pattern: p, file: hits[0].file });
  }
  return missing.length === 0
    ? {
        status: "pass",
        evidence: `All required disclosures present.`,
      }
    : {
        status: "fail",
        evidence: `Missing required disclosure patterns: ${missing.join(", ")}.`,
      };
}

async function runSentryReplayDetection(check) {
  const { paths, patterns } = check.automation;
  const { matched, hits } = await searchPaths(paths, patterns);
  return matched
    ? {
        status: "manual-review",
        evidence: `Sentry session replay is active (${hits[0].file}). Verify the privacy policy discloses this. Not auto-failing because Sentry with PII masking is generally compliant when disclosed.`,
      }
    : {
        status: "pass",
        evidence: "No Sentry session replay detected.",
      };
}

async function runFileExistenceOrGrep(check) {
  const { paths, patterns } = check.automation;
  const { matched, hits } = await searchPaths(paths, patterns);
  return matched
    ? {
        status: "pass",
        evidence: `Reference found in ${hits[0].file}.`,
      }
    : {
        status: "fail",
        evidence: `No reference found in ${paths.join(", ")}. Expected a route, file, or link.`,
      };
}

const AUTOMATION_RUNNERS = {
  "forbidden-strings": runForbiddenStrings,
  "html-title": runHtmlTitle,
  "payment-processor-detection": runPaymentProcessorDetection,
  "conditional-grep": runConditionalGrep,
  grep: async (check) =>
    check.automation.patternsAll
      ? runGrepAll(check)
      : runGrepAny(check),
  "sentry-replay-detection": runSentryReplayDetection,
  "file-existence-or-grep": runFileExistenceOrGrep,
  "ugc-absence": runUgcAbsence,
};

async function runCheck(check) {
  if (!check.automated || !check.automation) {
    return { status: "manual-review", evidence: "Manual reviewer judgement required." };
  }
  const runner = AUTOMATION_RUNNERS[check.automation.kind];
  if (!runner) {
    return {
      status: "error",
      evidence: `Unknown automation kind: ${check.automation.kind}`,
    };
  }
  try {
    return await runner(check);
  } catch (err) {
    return {
      status: "error",
      evidence: `Automation crashed: ${err.message || err}`,
    };
  }
}

// --- rendering --------------------------------------------------------------

function scoreResults(results) {
  const bySeverity = {};
  const byStatus = { pass: 0, fail: 0, "manual-review": 0, error: 0 };
  for (const r of results) {
    const sev = r.check.severity || "low";
    bySeverity[sev] ||= { pass: 0, fail: 0, "manual-review": 0, error: 0 };
    bySeverity[sev][r.status] += 1;
    byStatus[r.status] += 1;
  }
  const blockerFails = bySeverity.blocker?.fail || 0;
  const highFails = bySeverity.high?.fail || 0;
  const totalChecks = results.length;
  const concreteFails = byStatus.fail;
  const concretePasses = byStatus.pass;
  // Readiness = passes / (passes + fails), ignoring manual-review items so a
  // freshly-written app with lots of "manual" doesn't score 0.
  const denom = concretePasses + concreteFails;
  const readiness = denom === 0 ? 0 : Math.round((concretePasses / denom) * 100);
  let verdict;
  if (blockerFails > 0) verdict = "REJECT (blocker guidelines failing)";
  else if (highFails > 0) verdict = "AT RISK (high-severity gaps)";
  else if (byStatus["manual-review"] > 0) verdict = "READY pending manual review";
  else verdict = "READY";
  return {
    bySeverity,
    byStatus,
    blockerFails,
    highFails,
    totalChecks,
    readiness,
    verdict,
  };
}

function buildBlocks({ checklist, results, score }) {
  const verdictEmoji = score.blockerFails
    ? ":rotating_light:"
    : score.highFails
      ? ":warning:"
      : ":white_check_mark:";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${verdictEmoji} Apple Review Audit — ${score.verdict}`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_${new Date().toUTCString()} · ${checklist.checks.length} checks · guidelines last reviewed ${checklist.lastReviewedGuidelinesAt}_`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Readiness:* ${score.readiness}%  ` +
          `· :rotating_light: ${score.blockerFails} blocker · ` +
          `:warning: ${score.highFails} high · ` +
          `:ballot_box_with_check: ${score.byStatus["manual-review"]} manual · ` +
          `:white_check_mark: ${score.byStatus.pass} pass · ` +
          `:x: ${score.byStatus.fail} fail`,
      },
    },
    { type: "divider" },
  ];

  // Group by severity. Within each, render concise lines.
  const bySev = new Map();
  for (const r of results) {
    const sev = r.check.severity || "low";
    if (!bySev.has(sev)) bySev.set(sev, []);
    bySev.get(sev).push(r);
  }

  for (const sev of SEVERITY_ORDER) {
    const rows = bySev.get(sev);
    if (!rows || !rows.length) continue;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${SEVERITY_EMOJI[sev]} *${sev.toUpperCase()}* _(${rows.length})_`,
      },
    });
    const CHUNK = 4;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => {
        const se = STATUS_EMOJI[r.status] || "?";
        const evidence = (r.evidence || "").replace(/\s+/g, " ").slice(0, 260);
        return `${se} *${r.check.guideline}* — ${r.check.title}\n   _${evidence}_`;
      });
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: chunk.join("\n\n") },
      });
    }
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "_Source: `.snippd/app-review-checks.json` · runner: `scripts/audit_app_review.mjs` · this is a pre-submission sanity check, not a substitute for App Store Connect review._",
      },
    ],
  });

  return blocks;
}

function renderHumanSummary(results, score) {
  const lines = [];
  lines.push(`Apple Review Audit — ${score.verdict}`);
  lines.push(
    `Readiness: ${score.readiness}% · blocker fails: ${score.blockerFails} · high fails: ${score.highFails} · manual: ${score.byStatus["manual-review"]} · pass: ${score.byStatus.pass} · fail: ${score.byStatus.fail}`
  );
  lines.push("");
  for (const sev of SEVERITY_ORDER) {
    const rows = results.filter((r) => (r.check.severity || "low") === sev);
    if (!rows.length) continue;
    lines.push(`[${sev.toUpperCase()}]`);
    for (const r of rows) {
      lines.push(
        `  ${r.status.padEnd(14)} ${r.check.guideline} — ${r.check.title}`
      );
      if (r.evidence) lines.push(`      ${r.evidence}`);
    }
    lines.push("");
  }
  return lines.join("\n");
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

  const raw = await readFile(CHECKLIST_PATH, "utf8");
  const checklist = JSON.parse(raw);

  const results = [];
  for (const check of checklist.checks) {
    const outcome = await runCheck(check);
    results.push({ check, ...outcome });
  }
  const score = scoreResults(results);

  if (args.summary) {
    console.log(renderHumanSummary(results, score));
    if (args.failOnBlocker && score.blockerFails > 0) process.exit(1);
    return;
  }

  const blocks = buildBlocks({ checklist, results, score });
  const fallback =
    `Apple Review Audit [${score.verdict}] — ${score.readiness}% ready, ` +
    `${score.blockerFails} blocker + ${score.highFails} high gaps.`;
  const payload = { text: fallback.slice(0, 300), blocks };

  if (args.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    console.log("");
    console.log(renderHumanSummary(results, score));
    if (args.failOnBlocker && score.blockerFails > 0) process.exit(1);
    return;
  }

  const webhook = process.env.SLACK_APP_REVIEW_WEBHOOK_URL;
  if (!webhook) {
    console.warn(
      "[audit_app_review] SLACK_APP_REVIEW_WEBHOOK_URL is not set — nothing posted. " +
        "Run with --summary or --dry-run to inspect locally."
    );
    if (args.failOnBlocker && score.blockerFails > 0) process.exit(1);
    return;
  }

  try {
    await postToSlack(webhook, payload);
    console.log(
      `[audit_app_review] posted: ${score.verdict} · readiness ${score.readiness}% ` +
        `· blockers ${score.blockerFails} · highs ${score.highFails}.`
    );
  } catch (err) {
    console.error(`[audit_app_review] post failed: ${err.message}`);
    process.exit(1);
  }
  if (args.failOnBlocker && score.blockerFails > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
