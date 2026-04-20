#!/usr/bin/env bash
# Run in Google Cloud Shell (any directory). Clones your repo and lands you in snippd_agent.
#
#   export SNIPPD_GIT_URL='https://github.com/YOUR_ORG/snippd-beta-demo.git'
#   bash bootstrap_cloudshell.sh
#
# Or one line:
#   SNIPPD_GIT_URL='https://github.com/YOUR_ORG/snippd-beta-demo.git' bash bootstrap_cloudshell.sh

set -euo pipefail

URL="${SNIPPD_GIT_URL:-}"
if [[ -z "$URL" ]]; then
  echo "ERROR: Set SNIPPD_GIT_URL to your repository HTTPS URL."
  echo "Example:"
  echo "  export SNIPPD_GIT_URL='https://github.com/YOUR_ORG/snippd-beta-demo.git'"
  echo "  bash bootstrap_cloudshell.sh"
  exit 1
fi

TARGET="${HOME}/snippd-beta-demo"
if [[ -d "${TARGET}/.git" ]]; then
  echo "Updating existing clone: ${TARGET}"
  git -C "${TARGET}" pull --ff-only
else
  if [[ -d "${TARGET}" ]]; then
    echo "ERROR: ${TARGET} exists but is not a git repo. Move or remove it, then retry."
    exit 1
  fi
  echo "Cloning into ${TARGET} ..."
  git clone "${URL}" "${TARGET}"
fi

cd "${TARGET}/snippd_agent"
chmod +x deploy.sh verify_tree.sh bootstrap_cloudshell.sh 2>/dev/null || true
echo ""
bash ./verify_tree.sh
echo ""
echo "Ready. Set project and deploy:"
echo "  gcloud config set project YOUR_PROJECT_ID"
echo "  ./deploy.sh"
