#!/usr/bin/env node
/**
 * Snippd #founder-actions approval processor.
 *
 * Reads a founder-supplied approval spec (`all`, `1-3`, `1,9,4,3`,
 * `1-3,7,9-11`), resolves it against the current queue using the exact same
 * ordering `sync_founder_actions.mjs` posts to Slack, executes any
 * automated actions (PR merges, workflow dispatches), and posts a concise
 * result summary back to `#founder-actions`.
 *
 * Items are removed from `.snippd/founder-actions.json` when approved;
 * the caller is expected to commit that change (the GitHub Action
 * `.github/workflows/process-approvals.yml` does this automatically).
 *
 * Modes:
 *   --spec "1-3,9"      approval spec (required unless --from-env)
 *   --from-env          read APPROVAL_SPEC from env (used by the Action)
 *   --execute           actually run automated actions + write backlog
 *                       (default: preview — print what WOULD happen, no side effects)
 *   --no-slack          don't post to Slack even if webhook is set
 *
 * Env:
 *   APPROVAL_SPEC              same as --spec but for --from-env
 *   SLACK_ACTIONS_WEBHOOK_URL  Slack webhook for #founder-actions
 *   GH_TOKEN / GITHUB_TOKEN    passed through for `gh` calls
 *
 * Supported item.approval shapes (in .snippd/founder-actions.json):
 *   { "action": "merge-pr", "pr": 7, "strategy": "squash", "deleteBranch": true }
 *   { "action": "workflow-dispatch", "workflow": "wins.yml", "ref": "main" }
 *   { "action": "ack" }               // default — just drops from queue
 *   (absent)                          // treated as "ack"
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  indexedItems,
  loadBacklog,
  parseApprovalSpec,
  resolveApprovals,
  saveBacklog,
  PRIORITY_EMOJI,
} from "./_founder_actions_shared.mjs";

const execFileP = promisify(execFile);
const DEFAULT_REPO = "godkingdombusiness/snippd";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--spec") {
      out.spec = argv[i + 1];
      i++;
    } else if (a === "--from-env") {
      out.fromEnv = true;
    } else if (a === "--execute") {
      out.execute = true;
    } else if (a === "--no-slack") {
      out.noSlack = true;
    }
  }
  return out;
}

async function getPrState(pr, repo) {
  try {
    const { stdout } = await execFileP(
      "gh",
      ["pr", "view", String(pr), "--repo", repo, "--json", "state,url"],
      { timeout: 10_000 }
    );
    const parsed = JSON.parse(stdout);
    return { state: parsed.state, url: parsed.url };
  } catch (err) {
    return {
      state: null,
      error: err.stderr || err.message || String(err),
    };
  }
}

/** Run `gh pr merge N --squash --delete-branch`. Returns { ok, stdout, stderr }. */
async function runGhPrMerge(pr, { strategy = "squash", deleteBranch = true, repo }) {
  const args = [
    "pr",
    "merge",
    String(pr),
    "--repo",
    repo,
    `--${strategy}`,
  ];
  if (deleteBranch) args.push("--delete-branch");
  try {
    const { stdout, stderr } = await execFileP("gh", args, { timeout: 60_000 });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || String(err),
    };
  }
}

async function runGhWorkflowDispatch(workflow, ref, repo) {
  try {
    const { stdout, stderr } = await execFileP(
      "gh",
      ["workflow", "run", workflow, "--repo", repo, "--ref", ref || "main"],
      { timeout: 30_000 }
    );
    return { ok: true, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || String(err),
    };
  }
}

/**
 * Dispatch the action defined on an item. No-ops in preview mode — the
 * runner only branches on `execute`.
 */
async function dispatchAction({ item, execute, repo }) {
  const approval = item.approval || { action: "ack" };
  const action = approval.action || "ack";

  if (action === "ack") {
    return {
      kind: "ack",
      summary: "acknowledged — manual step; drops from queue",
    };
  }

  if (action === "merge-pr") {
    const pr = approval.pr;
    if (!pr) {
      return { kind: "error", summary: `merge-pr missing \`pr\` field` };
    }
    // Peek at PR state first. If already MERGED or CLOSED, treat as ack so
    // the queue can clear historical items without a confusing "merge failed"
    // message.
    const probe = await getPrState(pr, repo);
    if (probe.state === "MERGED") {
      return {
        kind: "ack",
        summary: `PR #${pr} already merged — acknowledged, dropping from queue`,
      };
    }
    if (probe.state === "CLOSED") {
      return {
        kind: "ack",
        summary: `PR #${pr} was closed without merging — dropping from queue (revisit manually if this was wrong)`,
      };
    }
    if (!execute) {
      return {
        kind: "merge-pr",
        summary: `would run: gh pr merge ${pr} --${approval.strategy || "squash"}${
          approval.deleteBranch === false ? "" : " --delete-branch"
        }`,
      };
    }
    const res = await runGhPrMerge(pr, {
      strategy: approval.strategy || "squash",
      deleteBranch: approval.deleteBranch !== false,
      repo,
    });
    return res.ok
      ? { kind: "merge-pr", summary: `merged PR #${pr}` }
      : {
          kind: "error",
          summary: `merge of PR #${pr} failed: ${(res.stderr || "").slice(0, 200)}`,
        };
  }

  if (action === "workflow-dispatch") {
    const workflow = approval.workflow;
    const ref = approval.ref || "main";
    if (!workflow) {
      return { kind: "error", summary: `workflow-dispatch missing \`workflow\` field` };
    }
    if (!execute) {
      return {
        kind: "workflow-dispatch",
        summary: `would run: gh workflow run ${workflow} --ref ${ref}`,
      };
    }
    const res = await runGhWorkflowDispatch(workflow, ref, repo);
    return res.ok
      ? { kind: "workflow-dispatch", summary: `dispatched workflow ${workflow}` }
      : {
          kind: "error",
          summary: `dispatch of ${workflow} failed: ${(res.stderr || "").slice(0, 200)}`,
        };
  }

  return {
    kind: "error",
    summary: `unknown approval.action: "${action}"`,
  };
}

function renderResultBlocks({ approved, notFound, outcomes, execute, remaining }) {
  const header = execute
    ? ":white_check_mark: Founder Approvals Processed"
    : ":eye: Founder Approvals — Preview";

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: header, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: execute
          ? `*${approved.length}* approved · *${outcomes.filter((o) => o.result.kind === "error").length}* failed · *${remaining}* still in queue`
          : `*${approved.length}* approved in preview mode — re-run with *Execute = true* to apply. *${remaining}* would remain after execution.`,
      },
    },
  ];

  if (notFound.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:warning: Numbers *${notFound.join(", ")}* were not in the queue and were ignored.`,
      },
    });
  }

  if (approved.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":grey_question: No items matched the approval spec. Nothing to do.",
      },
    });
    return blocks;
  }

  blocks.push({ type: "divider" });

  const CHUNK = 6;
  for (let i = 0; i < outcomes.length; i += CHUNK) {
    const chunk = outcomes.slice(i, i + CHUNK);
    const lines = chunk.map(({ index, item, result }) => {
      const pri = PRIORITY_EMOJI[item.priority] || PRIORITY_EMOJI.low;
      const glyph =
        result.kind === "error"
          ? ":x:"
          : result.kind === "ack"
            ? ":ballot_box_with_check:"
            : ":rocket:";
      return `${glyph} *[${index}]* ${pri} *${item.title}*\n   _${result.summary}_`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n\n") },
    });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: execute
          ? "_The queue was updated. Next `sync_founder_actions` post will show the remaining items._"
          : "_No changes applied. Dispatch the workflow again with Execute = true to apply._",
      },
    ],
  });
  return blocks;
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

  const rawSpec = args.fromEnv ? process.env.APPROVAL_SPEC : args.spec;
  if (!rawSpec) {
    console.error(
      "[process_approvals] no approval spec provided. Use --spec \"1-3,9\" or --from-env with APPROVAL_SPEC."
    );
    process.exit(2);
  }

  let spec;
  try {
    spec = parseApprovalSpec(rawSpec);
  } catch (err) {
    console.error(`[process_approvals] spec parse error: ${err.message}`);
    process.exit(2);
  }

  let backlog;
  try {
    backlog = await loadBacklog();
  } catch (err) {
    console.error(`[process_approvals] failed to load backlog: ${err.message}`);
    process.exit(2);
  }

  const indexed = indexedItems(backlog.items);
  const { approved, notFound } = resolveApprovals(indexed, spec);

  console.log(
    `[process_approvals] spec="${rawSpec}" → ${approved.length} approved` +
      (notFound.length ? ` · ${notFound.length} not found (${notFound.join(",")})` : "") +
      ` · execute=${Boolean(args.execute)}`
  );

  const outcomes = [];
  for (const { index, item } of approved) {
    const result = await dispatchAction({ item, execute: Boolean(args.execute), repo });
    outcomes.push({ index, item, result });
    console.log(
      `  [${index}] ${item.id} → ${result.kind}: ${result.summary}`
    );
  }

  // Persist: remove successfully-approved items from the backlog.
  // In preview mode we also print the resulting queue size but DON'T write.
  const approvedIds = new Set(
    outcomes
      .filter((o) => o.result.kind !== "error")
      .map((o) => o.item.id)
  );
  const remainingItems = backlog.items.filter((it) => !approvedIds.has(it.id));
  const wouldRemove = backlog.items.length - remainingItems.length;

  if (args.execute && wouldRemove > 0) {
    const next = { ...backlog, items: remainingItems };
    await saveBacklog(next);
    console.log(
      `[process_approvals] wrote .snippd/founder-actions.json: ${backlog.items.length} → ${remainingItems.length} items (-${wouldRemove})`
    );
  } else if (!args.execute) {
    console.log(
      `[process_approvals] preview: would remove ${wouldRemove} items; remaining would be ${remainingItems.length}`
    );
  }

  if (args.noSlack) {
    return;
  }
  const webhook = process.env.SLACK_ACTIONS_WEBHOOK_URL;
  if (!webhook) {
    console.warn(
      "[process_approvals] SLACK_ACTIONS_WEBHOOK_URL not set — skipping Slack notify."
    );
    return;
  }

  const blocks = renderResultBlocks({
    approved,
    notFound,
    outcomes,
    execute: Boolean(args.execute),
    remaining: remainingItems.length,
  });
  const fallback = `${approved.length} approved, ${
    outcomes.filter((o) => o.result.kind === "error").length
  } failed; ${remainingItems.length} items remain.`;

  try {
    await postToSlack(webhook, { text: fallback.slice(0, 300), blocks });
    console.log("[process_approvals] posted result to Slack.");
  } catch (err) {
    console.error(`[process_approvals] Slack post failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
