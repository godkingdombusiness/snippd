# Slack bot install — 90 seconds, one OAuth consent

This is the one OAuth grant that unblocks the most. It replaces the blind
`SLACK_WINS_WEBHOOK_URL` pipe with a proper bot that can create channels,
post to any channel by name, and identify where the legacy webhook is
landing.

## Steps

1. **Create the app.** Open
   [api.slack.com/apps?new_app=1](https://api.slack.com/apps?new_app=1).
   - Click **From an app manifest**.
   - Pick the **getsnippd** workspace.
   - Paste the contents of
     [`docs/slack-app-manifest.yml`](./slack-app-manifest.yml) into the YAML
     tab. Click **Next** → **Create**.

2. **Install to workspace.** On the app page, click **Install to Workspace**
   at the top. Slack shows the scope list (posted channels, create channels,
   read channels, post messages, etc.). Click **Allow**.

3. **Copy the bot token.** You land on the **OAuth & Permissions** page. Copy
   the **Bot User OAuth Token** — it starts with `xoxb-`.

4. **Paste into repo secrets.** Open
   [repo → Settings → Secrets and variables → Actions](https://github.com/godkingdombusiness/snippd/settings/secrets/actions).
   Click **New repository secret**. Name: `SLACK_BOT_TOKEN`. Value: the
   `xoxb-…` token. Save.

5. **Run the bootstrap.** Open
   [Actions → slack-bootstrap](https://github.com/godkingdombusiness/snippd/actions/workflows/slack-bootstrap.yml)
   → **Run workflow** → **Run workflow**. It:
   - identifies which channel `SLACK_WINS_WEBHOOK_URL` has been posting to
     (the mystery we haven't solved in three days),
   - creates every per-department channel defined in
     `.snippd/slack-channels.json` (12 channels total: ops-control-center,
     action-needed, app-review, reports, wins, dept-cx, dept-product,
     dept-data, dept-revops, dept-legal (private), dept-partnerships,
     dept-marketing),
   - posts a confirmation to `#ops-control-center` so you can see the bot
     working end-to-end.

After step 5, every subsequent agent post can address channels by name
(`chat.postMessage` with `channel: "dept-cx"`) instead of being stuck in a
single webhook channel. The existing workflows continue to use the webhook
chain for backward compatibility — migrating them to the bot is a follow-up
PR, not a blocker.

## Revoking

Open the app page → **Basic Information** → **Delete App** at the bottom.
Or just remove the `SLACK_BOT_TOKEN` secret — the workflows fall back to
webhook + GitHub Issue mirror.
