#!/usr/bin/env node
// One-shot helper: print only the rendered Markdown body of the current
// founder-action queue. Used to seed the pinned GitHub channel issue the
// first time; after that `scripts/sync_founder_actions.mjs` keeps it in sync.
import {
  CATEGORY_ORDER,
  PRIORITY_ORDER,
  indexedItems,
  loadBacklog,
} from "./_founder_actions_shared.mjs";

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

function groupByCategory(items) {
  const buckets = new Map();
  for (const item of items) {
    const key = item.category || "polish";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  return buckets;
}

function render({ backlog, repo }) {
  const indexed = indexedItems(backlog.items);
  const grouped = groupByCategory(indexed);
  const totals = PRIORITY_ORDER.reduce((acc, p) => {
    acc[p] = indexed.filter((i) => i.priority === p).length;
    return acc;
  }, {});
  const headerCounts = PRIORITY_ORDER.filter((p) => totals[p] > 0)
    .map((p) => `${PRIORITY_MD[p]} **${p}** ${totals[p]}`)
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
      const tags = [];
      if (item.priority) tags.push(`**priority:** ${item.priority}`);
      if (item.category) tags.push(`**category:** ${item.category}`);
      if (item.addedBy) tags.push(`**added by:** ${item.addedBy}`);
      if (item.addedAt) tags.push(`**added:** ${item.addedAt}`);
      if (Array.isArray(item.blockedBy) && item.blockedBy.length) {
        tags.push(
          `:hourglass_flowing_sand: **blocked by:** ${item.blockedBy.join(", ")}`
        );
      }
      if (tags.length) lines.push(tags.join(" · "));
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

const backlog = await loadBacklog();
const repo = process.env.GITHUB_REPO || "godkingdombusiness/snippd";
process.stdout.write(render({ backlog, repo }));
