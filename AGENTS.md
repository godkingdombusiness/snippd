# AI Agent Rules — Snippd

These rules apply to Codex, Claude Code, and any other assistant working in this repo.

## Required Git Sync

All agent work must sync through the same Git repository:

- Repo root: `C:\Users\Dina Davis\snippd`
- Default shared branch: `frontend-v2-launch`
- Remote: `origin`

Before starting work:

- Confirm the repo root with `git rev-parse --show-toplevel`.
- Confirm the current branch with `git branch --show-current`.
- Pull with `git pull --rebase` when the working tree allows it.
- If local uncommitted changes block pulling, report the blocker. Do not overwrite or revert another tool's work.

After every meaningful change:

- Run `git status --short`.
- Stage only the intended files for the task. Do not use broad `git add .` in a dirty tree.
- Include every new file required by imports, routes, helpers, or runtime behavior.
- Do not leave required files untracked.
- Run a relevant local bundle/test check when practical.
- Commit with a focused message.
- Push to `origin/frontend-v2-launch`.
- Report the commit hash and any intentionally uncommitted files.

Vercel builds from GitHub, not local Expo. Local changes are not deploy-ready until committed and pushed.

## Coordination

- Treat changes from other tools as user work.
- Do not revert other tool or user edits unless Dina explicitly asks.
- If Codex and Claude Code both touch the same file, inspect the diff before committing.
- Keep commits focused enough that Vercel failures can be traced quickly.
