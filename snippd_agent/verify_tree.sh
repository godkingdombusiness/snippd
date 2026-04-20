#!/usr/bin/env bash
# Run from the directory that should contain the agent (same folder as deploy.sh).
set -euo pipefail
HERE="$(pwd)"
echo "Checking agent tree in: $HERE"
MISS=0
for f in agent.py deploy.sh requirements.txt agents/architect.py tools/supabase_tool.py; do
  if [[ ! -e "$f" ]]; then
    echo "MISSING: $f"
    MISS=1
  else
    echo "OK: $f"
  fi
done
if [[ "$MISS" -ne 0 ]]; then
  echo ""
  echo "This directory is not a complete snippd_agent checkout."
  echo "See CLOUDSHELL.txt — clone the repo and cd into .../snippd_agent"
  exit 1
fi
echo "Looks good. Run: chmod +x deploy.sh && ./deploy.sh"
exit 0
