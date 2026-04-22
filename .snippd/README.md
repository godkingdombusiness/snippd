# `.snippd/` — autonomous-team scratch space

This directory holds structured data the Snippd autonomous team owns
collectively.

## `team-directory.json`

Canonical roster for every agent on the team. Eight departments, 30 agents.
Every `addedBy` field in `founder-actions.json`, every Slack topic prefix,
every canvas reference must resolve to a handle in this file.

- **Source of truth.** If an agent isn't in here, they don't exist.
- **Slack prefix per department.** Agents sign every Slack post with their
  department's `slackPrefix` (e.g. `[cx]`, `[product]`, `[data]`). The
  `founder-actions-sync` and `reports-cron` workflows use the prefix to
  route into per-channel webhooks if configured, otherwise fall back to
  `SLACK_WINS_WEBHOOK_URL`.
- **Status legend.** `critical-now` blocks launch; `launch` ships day 0;
  `queued` adds at day 30; `deferred` adds at day 60–90; `retainer` is
  external counsel / milestones only.
- **Reporting lines.** Every department has a single `reportsTo`. Chief-of-
  Staff owns 5 departments, Lead-Architect owns Data, Growth-Agent owns
  Partnerships. Auditor is cross-cutting with no direct reports.

See `canvases/snippd-full-team-org.canvas.tsx` for the full build-out
narrative and `canvases/snippd-marketing-org.canvas.tsx` for the marketing
department deep-dive.

## `founder-actions.json`

The canonical backlog of action items **only the founder can complete** —
secret rotations, Stripe dashboard changes, Slack channel creation, etc.

### How items get added

1. **Any agent (or you) in a PR.** Edit this JSON, open a PR, merge. The
   `founder-actions-sync` workflow re-posts the queue on merge.
2. **ADK agents in production** via `snippd_agent/tools/founder_actions.py ::
   queue_action_item(...)`. That helper writes to
   `.snippd/pending-actions.local.json` (gitignored). Periodically a human
   agent in a Cursor session reviews the staging file and promotes items
   into this canonical JSON via PR.

### How the queue is displayed

- `scripts/sync_founder_actions.mjs` renders it + live open-PR data from
  `gh pr list` to a rich Slack Block Kit message, then POSTs to
  `$SLACK_ACTIONS_WEBHOOK_URL` (bound to `#founder-actions`).
- The GitHub Action `.github/workflows/founder-actions-sync.yml` triggers on:
  - PR opened/closed/reopened/ready_for_review on main
  - push to main when this JSON changes
  - daily cron (14:00 UTC)
  - manual `workflow_dispatch`

### How items get removed

- **Done.** Delete the item in a PR. Next sync drops it from the post.
- **Cancelled / superseded.** Same — just delete. Keep the JSON authoritative;
  don't leave tombstones.

### Schema

```json
{
  "version": 1,
  "channel": "#founder-actions",
  "items": [
    {
      "id": "stable-slug-unique-per-item",
      "title": "Short imperative verb phrase",
      "category": "security | ship | verify | polish",
      "priority": "critical | high | medium | low",
      "why": "One or two sentences. Why does this matter and what fails if skipped?",
      "where": "URL or human-readable location (dashboard path, file path, etc.)",
      "addedAt": "YYYY-MM-DD",
      "addedBy": "@AgentName or @username",
      "blockedBy": ["other-item-id-1", "other-item-id-2"]
    }
  ]
}
```

`blockedBy` is optional. If present, the Slack render shows a ⏳ marker and
lists the dependency IDs inline — useful for items like "deploy Edge Function"
that can't happen until "rotate secret" does.
