# Snippd Scripts

This directory contains operational scripts for Snippd. All scripts are
designed to be run from the **workspace root**, not from within this folder.

## Quick Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `setup-slack-webhook.sh` | Configure Supabase Slack webhook for policy change notifications | `scripts/setup-slack-webhook.sh "<webhook-url>"` |
| `generate_report.mjs` | Generate and post 6×/day health reports to Slack | `npm run report` or `npm run report:dry` |
| `sync_founder_actions.mjs` | Sync pending founder actions to Slack | `npm run sync:actions` or `npm run sync:actions:dry` |
| `process_approvals.mjs` | Process approval inbox (manual workflow trigger) | Called by GitHub Actions |
| `audit_app_review.mjs` | Audit app against Apple Review guidelines | `npm run audit:app-review` |
| `post_win.mjs` | Post win messages to Slack on merge/release | Called by GitHub Actions |
| `neo4j_smoke.mjs` | Test Neo4j Aura connection and schema | `npm run neo4j:smoke` |
| `sentry_ping.mjs` | Verify Sentry connectivity | `node scripts/sentry_ping.mjs` |

## Setup Scripts

### `setup-slack-webhook.sh`

**Purpose**: Configure the Slack webhook for real-time retailer policy change
notifications triggered by Supabase.

**Prerequisites**:
- Slack Incoming Webhook created and pointed at `#engineering` (or your target channel)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in `.env`
- `curl` and `jq` installed

**What it does**:
1. Validates webhook URL format
2. Sends a test message to verify connectivity
3. Upserts the webhook into `public.snippd_integrations` table
4. Sends a confirmation message to Slack

**Example**:
```bash
scripts/setup-slack-webhook.sh "https://hooks.slack.com/services/T01ABC/B02DEF/XYZ123"
```

**Security notes**:
- The webhook URL is stored in Supabase, NOT in GitHub secrets
- Only the service role can read `snippd_integrations` (RLS enforced)
- The script sources `.env` if present but never commits it
- Webhook failures are logged but never block policy writes

**See also**: `docs/slack-hub.md` for complete Slack integration guide

## Report and Notification Scripts

All `.mjs` scripts require `SLACK_WEBHOOK_URL` (or a topic-specific override)
set as a GitHub secret or in `.env` when running locally. See `docs/slack-hub.md`
for the webhook setup guide.

### Running Locally vs. CI

- **Dry-run mode**: Most scripts support `--dry-run` to preview output without
  posting to Slack or mutating state.
- **Environment**: Scripts load `.env` from the repo root if it exists. GitHub
  Actions inject secrets as environment variables.
- **Authentication**: Supabase scripts require `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`. Neo4j scripts require `NEO4J_URI`,
  `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`.

## Development Guidelines

When adding a new script:

1. **Shebang**: Use `#!/usr/bin/env bash` (shell) or `#!/usr/bin/env node` (JS/mjs).
2. **Permissions**: Run `chmod +x scripts/<name>` after creating.
3. **Package.json**: Add a named script entry (e.g. `"my:script": "node scripts/my_script.mjs"`).
4. **Documentation**: Update this README with usage and prerequisites.
5. **Error handling**:
   - Shell: use `set -euo pipefail` and `die()` helpers
   - Node: catch errors and exit with non-zero code
6. **Secrets**: NEVER commit `.env`, webhook URLs, or service-role keys. Use
   environment variables and document in `.env.example`.
7. **Testing**: Provide a `--dry-run` flag for scripts that mutate state or post
   to external services.

## Troubleshooting

**"Command not found: jq"**
- macOS: `brew install jq`
- Ubuntu: `sudo apt-get install jq`

**"SUPABASE_SERVICE_ROLE_KEY is not set"**
- Copy `.env.example` to `.env` and fill in the values from your Supabase project
- Never commit `.env` — it's gitignored

**"Slack webhook returns 404"**
- The webhook was deleted or the channel was archived
- Recreate the webhook in Slack and update GitHub secrets or re-run setup

**"Script fails with permission denied"**
- Run `chmod +x scripts/<script-name>.sh` to make it executable
