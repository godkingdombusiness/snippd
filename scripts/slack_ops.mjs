#!/usr/bin/env node
/**
 * Snippd Slack operator.
 *
 * Replaces the blind "incoming webhook" surface with proper Web API calls
 * once SLACK_BOT_TOKEN is set. Designed to fail gracefully when the token
 * is missing so CI still passes during bootstrap.
 *
 * Subcommands:
 *   list-channels                    Dump every public+private channel the
 *                                    bot can see (name, id, members, purpose).
 *   identify-webhook-channel <name>  Find the channel the incoming webhook
 *                                    posts to by matching a unique marker.
 *   ensure-channels                  Create any missing per-department
 *                                    channels (reads .snippd/slack-channels.json).
 *   post <channel> <text>            Post plain text to a channel by name.
 *   post-blocks <channel> <file>     Post Block Kit JSON from a file.
 *
 * Env:
 *   SLACK_BOT_TOKEN           required — starts with xoxb-
 *   SLACK_WINS_WEBHOOK_URL    optional — used by identify-webhook-channel
 *
 * Exits 0 on success; 1 on Slack API error; 2 on bad usage / missing token.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://slack.com/api";
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function token() {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) {
    console.error(
      "[slack_ops] SLACK_BOT_TOKEN is not set. Install the app from " +
        "docs/slack-app-manifest.yml and paste the xoxb- token into the " +
        "GitHub secret named SLACK_BOT_TOKEN."
    );
    process.exit(2);
  }
  return t;
}

async function call(method, body, tokenOverride) {
  const t = tokenOverride || token();
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${t}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    throw new Error(
      `slack.${method} failed: ${json.error || res.status} ` +
        `${json.needed ? `(needed: ${json.needed})` : ""}`
    );
  }
  return json;
}

/**
 * Enumerate every channel the bot can see (public + private). Handles
 * Slack's cursor pagination. Returns a flat array of channel objects.
 */
async function listAllChannels() {
  const out = [];
  let cursor;
  do {
    const r = await call("conversations.list", {
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    out.push(...r.channels);
    cursor = r.response_metadata?.next_cursor || "";
  } while (cursor);
  return out;
}

async function cmdListChannels() {
  const channels = await listAllChannels();
  for (const c of channels.sort((a, b) => a.name.localeCompare(b.name))) {
    const privacy = c.is_private ? "private" : "public";
    const members = c.num_members ?? "?";
    const topic = (c.topic?.value || "").slice(0, 60).replace(/\s+/g, " ");
    console.log(
      `#${c.name.padEnd(30)} ${c.id.padEnd(12)} ${privacy.padEnd(8)} ${String(
        members
      ).padStart(3)} members  ${topic}`
    );
  }
  console.log(`\n[slack_ops] ${channels.length} channels visible to bot.`);
}

/**
 * Post a uniquely-tagged message via the incoming webhook, then search every
 * channel's recent history for that tag. The one match is the channel the
 * webhook lives in — the answer we've been missing for three days.
 */
async function cmdIdentifyWebhookChannel() {
  const webhook = process.env.SLACK_WINS_WEBHOOK_URL;
  if (!webhook) {
    console.error(
      "[slack_ops] SLACK_WINS_WEBHOOK_URL not set — nothing to identify."
    );
    process.exit(2);
  }
  const marker = `[snippd-ops-probe-${Date.now()}]`;
  console.log(`[slack_ops] posting marker ${marker} via webhook…`);

  const postRes = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `${marker} — auto-probe from scripts/slack_ops.mjs, safe to ignore.`,
    }),
  });
  if (!postRes.ok) {
    console.error(`[slack_ops] webhook rejected: ${postRes.status}`);
    process.exit(1);
  }

  // Slack sometimes needs a beat to index the message.
  await new Promise((r) => setTimeout(r, 1500));

  const channels = await listAllChannels();
  console.log(
    `[slack_ops] scanning ${channels.length} channels for marker…`
  );

  for (const c of channels) {
    try {
      const hist = await call("conversations.history", {
        channel: c.id,
        limit: 10,
      });
      const hit = hist.messages?.find((m) => (m.text || "").includes(marker));
      if (hit) {
        console.log(
          `\n  :white_check_mark: webhook posts to #${c.name} (${c.id}) — ${
            c.is_private ? "private" : "public"
          } channel, ${c.num_members ?? "?"} members\n`
        );
        return;
      }
    } catch (err) {
      // not_in_channel is expected for channels the bot isn't in;
      // chat:write.public lets us post but not read. skip silently.
      if (!String(err.message).includes("not_in_channel")) {
        console.warn(`[slack_ops] ${c.name}: ${err.message}`);
      }
    }
  }
  console.error(
    `\n  ✗ marker ${marker} not found in any visible channel. The webhook ` +
      "may point to a channel the bot can't read (invite @Snippd Ops to it), " +
      "or the webhook target is a DM / Slackbot channel which isn't accessible."
  );
  process.exit(1);
}

/**
 * Read .snippd/slack-channels.json and ensure every `name` in it exists.
 * Creates missing ones, sets the topic/purpose, and logs what happened.
 */
async function cmdEnsureChannels() {
  const specPath = path.join(REPO_ROOT, ".snippd", "slack-channels.json");
  let spec;
  try {
    spec = JSON.parse(await readFile(specPath, "utf8"));
  } catch (err) {
    console.error(`[slack_ops] cannot read ${specPath}: ${err.message}`);
    process.exit(2);
  }
  if (!Array.isArray(spec?.channels)) {
    console.error(`[slack_ops] ${specPath} missing "channels" array`);
    process.exit(2);
  }

  const existing = await listAllChannels();
  const byName = new Map(existing.map((c) => [c.name, c]));

  for (const want of spec.channels) {
    if (byName.has(want.name)) {
      const c = byName.get(want.name);
      console.log(`  ✓ #${want.name} already exists (${c.id})`);
      if (want.topic && want.topic !== c.topic?.value) {
        await call("conversations.setTopic", {
          channel: c.id,
          topic: want.topic,
        }).catch((e) => console.warn(`    topic: ${e.message}`));
      }
      continue;
    }
    try {
      const created = await call("conversations.create", {
        name: want.name,
        is_private: !!want.private,
      });
      console.log(`  + #${want.name} created (${created.channel.id})`);
      if (want.topic) {
        await call("conversations.setTopic", {
          channel: created.channel.id,
          topic: want.topic,
        }).catch((e) => console.warn(`    topic: ${e.message}`));
      }
      if (want.purpose) {
        await call("conversations.setPurpose", {
          channel: created.channel.id,
          purpose: want.purpose,
        }).catch((e) => console.warn(`    purpose: ${e.message}`));
      }
    } catch (err) {
      // name_taken means someone created it in the UI between our list and
      // create call — safe to ignore.
      if (String(err.message).includes("name_taken")) {
        console.log(`  ✓ #${want.name} raced (already exists)`);
        continue;
      }
      console.warn(`  ✗ #${want.name}: ${err.message}`);
    }
  }
}

async function cmdPost(channelName, text) {
  if (!channelName || !text) {
    console.error("usage: slack_ops.mjs post <#channel> <text>");
    process.exit(2);
  }
  const name = channelName.replace(/^#/, "");
  await call("chat.postMessage", { channel: name, text });
  console.log(`  ✓ posted to #${name}`);
}

async function cmdPostBlocks(channelName, blocksPath) {
  if (!channelName || !blocksPath) {
    console.error("usage: slack_ops.mjs post-blocks <#channel> <blocks.json>");
    process.exit(2);
  }
  const name = channelName.replace(/^#/, "");
  const raw = await readFile(blocksPath, "utf8");
  const payload = JSON.parse(raw);
  await call("chat.postMessage", {
    channel: name,
    text: payload.text || "(block kit message)",
    blocks: payload.blocks || payload,
  });
  console.log(`  ✓ posted blocks to #${name}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "list-channels":
      return cmdListChannels();
    case "identify-webhook-channel":
      return cmdIdentifyWebhookChannel();
    case "ensure-channels":
      return cmdEnsureChannels();
    case "post":
      return cmdPost(rest[0], rest.slice(1).join(" "));
    case "post-blocks":
      return cmdPostBlocks(rest[0], rest[1]);
    default:
      console.error(
        "usage: slack_ops.mjs <list-channels | identify-webhook-channel | " +
          "ensure-channels | post <#ch> <text> | post-blocks <#ch> <file>>"
      );
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(`[slack_ops] ${err.message}`);
  process.exit(1);
});
