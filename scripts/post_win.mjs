#!/usr/bin/env node
/**
 * Snippd #wins Slack poster — shared entry point for every "celebrate" trigger.
 *
 * Usage (CLI):
 *   node scripts/post_win.mjs \
 *     --title "Snippd Pro is live" \
 *     --body  "Founding-member pricing shipped. First Pro signup within 2 hours." \
 *     --kind  launch \
 *     --url   "https://snippd.app/pro"
 *
 * Usage (programmatic):
 *   import { postWin } from "./scripts/post_win.mjs";
 *   await postWin({ title, body, kind, url });
 *
 * Usage (GitHub Action / CI):
 *   set env SLACK_WINS_WEBHOOK_URL + SNIPPD_WIN_TITLE + SNIPPD_WIN_BODY
 *   node scripts/post_win.mjs --from-env
 *
 * Requires: SLACK_WINS_WEBHOOK_URL (Slack Incoming Webhook bound to #wins).
 */

const KIND_EMOJI = {
  launch: ":rocket:",
  ship: ":package:",
  milestone: ":trophy:",
  revenue: ":moneybag:",
  crash_free: ":shield:",
  agent: ":robot_face:",
  press: ":newspaper:",
  default: ":sparkles:",
};

function parseArgs(argv) {
  const out = { kind: "default" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from-env") {
      out.fromEnv = true;
      continue;
    }
    const m = a.match(/^--([a-z-]+)$/);
    if (!m) continue;
    const key = m[1].replace(/-/g, "_");
    out[key] = argv[i + 1];
    i++;
  }
  return out;
}

function buildBlocks({ title, body, kind, url, source }) {
  const emoji = KIND_EMOJI[kind] || KIND_EMOJI.default;
  const footerBits = [];
  if (source) footerBits.push(source);
  footerBits.push(new Date().toLocaleString("en-US", { timeZone: "UTC" }) + " UTC");

  return [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} ${title}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: body },
    },
    ...(url
      ? [
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Open" },
                url,
              },
            ],
          },
        ]
      : []),
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `_${footerBits.join(" · ")}_` },
      ],
    },
  ];
}

/**
 * Post a structured "win" message to the Snippd #wins channel.
 *
 * @param {object} opts
 * @param {string} opts.title  Short headline (used as Slack header).
 * @param {string} opts.body   Markdown body (1-3 sentences).
 * @param {string} [opts.kind] One of: launch, ship, milestone, revenue,
 *                             crash_free, agent, press, default.
 * @param {string} [opts.url]  Optional "Open" button target.
 * @param {string} [opts.source] Attribution ("GitHub Action", "Sentry", etc.)
 * @param {string} [opts.webhookUrl] Override env SLACK_WINS_WEBHOOK_URL.
 * @returns {Promise<{status: 'posted' | 'skipped' | 'error', reason?: string}>}
 */
export async function postWin(opts = {}) {
  const webhook = opts.webhookUrl || process.env.SLACK_WINS_WEBHOOK_URL;
  if (!webhook) {
    const reason =
      "SLACK_WINS_WEBHOOK_URL is not set — skipping (nothing posted).";
    console.warn(`[post_win] ${reason}`);
    return { status: "skipped", reason };
  }
  if (!opts.title) {
    return { status: "error", reason: "title is required" };
  }

  const payload = {
    text: `${opts.title} — ${opts.body || ""}`.slice(0, 300),
    blocks: buildBlocks({
      title: opts.title,
      body: opts.body || "",
      kind: opts.kind || "default",
      url: opts.url,
      source: opts.source,
    }),
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      return {
        status: "error",
        reason: `Slack webhook ${res.status}: ${txt.slice(0, 200)}`,
      };
    }
    return { status: "posted" };
  } catch (err) {
    return {
      status: "error",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

// CLI entry ------------------------------------------------------------------
const isCLI = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "");

if (isCLI) {
  const args = parseArgs(process.argv);
  const payload = args.fromEnv
    ? {
        title: process.env.SNIPPD_WIN_TITLE,
        body: process.env.SNIPPD_WIN_BODY,
        kind: process.env.SNIPPD_WIN_KIND,
        url: process.env.SNIPPD_WIN_URL,
        source: process.env.SNIPPD_WIN_SOURCE,
      }
    : args;

  const result = await postWin(payload);
  console.log(`[post_win] ${result.status}${result.reason ? ": " + result.reason : ""}`);
  process.exit(result.status === "error" ? 1 : 0);
}
