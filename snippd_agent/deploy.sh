#!/usr/bin/env bash
# Snippd Agent Engine — one-shot pre-flight + ADK deploy (europe-west1).
#
# ---------------------------------------------------------------------------
# Cloud Shell / bash quick fixes
# ---------------------------------------------------------------------------
# 1) Run this script FROM the agent folder (the one that contains agent.py):
#      cd ~/path/to/snippd_agent
#      chmod +x deploy.sh && ./deploy.sh
#    Do NOT run: cd snippd_agent again when your prompt already shows ~/snippd_agent.
#    If `ls` has no deploy.sh, read CLOUDSHELL.txt and clone the repo fresh.
#
# 2) The agent directory MUST be named with a valid Python identifier (no hyphens).
#    Use `snippd_agent`, not `snippd-agent`. Hyphens break the staged module name
#    (e.g. snippd-agent_tmp... is not importable) and often yields Code 3 builds.
#
# 3) The gsutil line that looks like:
#      gsutil mb ... gs://...mv main.py agent.py
#    means you accidentally pasted TWO commands on one line. Run gsutil alone; never
#    append `mv main.py agent.py`.
#
# 4) Code 3: open Cloud Console → Cloud Build → failed build → "pip" / "docker build"
#    step log. Common fixes: adjust requirements.txt, or set INSTALL_DEPS=1 here.
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[0;33m'; NC='\033[0m'
info() { echo -e "${GRN}==>${NC} $*"; }
warn() { echo -e "${YLW}WARN:${NC} $*"; }
die() { echo -e "${RED}ERROR:${NC} $*" >&2; exit 1; }

# Folder basename must be import-safe (no hyphens) — matches Python module rules.
AGENT_DIR_NAME="$(basename "${SCRIPT_DIR}")"
if [[ ! "${AGENT_DIR_NAME}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  die "Directory name '${AGENT_DIR_NAME}' is not a valid Python identifier (no hyphens). Rename this folder to e.g. snippd_agent and retry."
fi

# Block incomplete checkouts (e.g. Cloud Shell ~/snippd-agent with only main.py).
if [[ -f "${SCRIPT_DIR}/verify_tree.sh" ]]; then
  info "Verifying agent file layout..."
  bash "${SCRIPT_DIR}/verify_tree.sh" || die "Incomplete directory. Read CLOUDSHELL.txt and clone the full repo into .../snippd_agent"
fi

REGION="${REGION:-europe-west1}"
DISPLAY_NAME="${DISPLAY_NAME:-Snippd Stack Relay}"
PROJECT_ID="${GCLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  die "No GCP project. Export GCLOUD_PROJECT or run: gcloud config set project YOUR_PROJECT_ID"
fi

info "Using project=${PROJECT_ID} region=${REGION} agent_dir=${AGENT_DIR_NAME}"

# -----------------------------------------------------------------------------
# 1) gcloud authentication (user)
# -----------------------------------------------------------------------------
info "Checking gcloud authentication..."
if ! command -v gcloud >/dev/null 2>&1; then
  die "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"
fi

if ! gcloud auth print-access-token >/dev/null 2>&1; then
  die "gcloud has no valid credentials. Run: gcloud auth login"
fi

if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  warn "Application Default Credentials missing — run: gcloud auth application-default login"
fi

# -----------------------------------------------------------------------------
# 2) Enable APIs
# -----------------------------------------------------------------------------
info "Ensuring required APIs are enabled..."
for api in aiplatform.googleapis.com cloudbuild.googleapis.com storage.googleapis.com; do
  if gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name:${api}" --format="value(config.name)" 2>/dev/null | grep -q "^${api}$"; then
    info "  OK: ${api}"
  else
    info "  Enabling ${api} ..."
    gcloud services enable "${api}" --project="${PROJECT_ID}"
  fi
done

# -----------------------------------------------------------------------------
# 3) Vertex AI service agent IAM (optional strict check)
# -----------------------------------------------------------------------------
PN="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
SA="service-${PN}@gcp-sa-aiplatform.iam.gserviceaccount.com"
info "Vertex AI service agent: ${SA}"

has_role() {
  local want="$1"
  gcloud projects get-iam-policy "${PROJECT_ID}" \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:${SA}" \
    --format="value(bindings.role)" 2>/dev/null | grep -Fxq "${want}"
}

if [[ "${SKIP_IAM_CHECK:-0}" != "1" ]]; then
  MISSING=()
  for role in roles/aiplatform.admin roles/storage.admin; do
    if has_role "${role}"; then
      info "  OK: ${role}"
    else
      MISSING+=("${role}")
    fi
  done
  if [[ "${#MISSING[@]}" -gt 0 ]]; then
    echo -e "${RED}Missing IAM bindings on project ${PROJECT_ID} for ${SA}:${NC}"
    for r in "${MISSING[@]}"; do echo "  - ${r}"; done
    echo "Grant (needs Owner / Project IAM Admin):"
    for r in "${MISSING[@]}"; do
      echo "  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
      echo "    --member=serviceAccount:${SA} \\"
      echo "    --role=${r}"
    done
    die "Fix IAM or re-run with SKIP_IAM_CHECK=1 if your org grants these roles elsewhere."
  fi
else
  warn "SKIP_IAM_CHECK=1 — not verifying roles/aiplatform.admin or roles/storage.admin."
fi

# -----------------------------------------------------------------------------
# 4) Staging bucket (GCS)
# -----------------------------------------------------------------------------
if [[ -n "${STAGING_BUCKET_URI:-}" ]]; then
  BUCKET_URI="${STAGING_BUCKET_URI}"
  info "Using STAGING_BUCKET_URI from environment: ${BUCKET_URI}"
else
  SUFFIX="$(python3 -c 'import secrets; print(secrets.token_hex(4))')"
  BUCKET_NAME="${PROJECT_ID}-snippd-adk-stg-${SUFFIX}"
  BUCKET_URI="gs://${BUCKET_NAME}"
  info "Creating staging bucket (if missing): ${BUCKET_URI}"
  if gcloud storage buckets describe "${BUCKET_URI}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    info "  Bucket already exists."
  else
    gcloud storage buckets create "${BUCKET_URI}" \
      --project="${PROJECT_ID}" \
      --location="${REGION}" \
      --uniform-bucket-level-access
    info "  Created."
  fi
fi

if [[ "${BUCKET_URI}" != gs://* ]]; then
  die "staging bucket must look like gs://bucket-name (got: ${BUCKET_URI})"
fi

info "Writing staging_bucket to .agent_engine_config.json ..."
python3 <<PY
import json
from pathlib import Path
p = Path(".agent_engine_config.json")
cfg = {}
if p.exists():
    cfg = json.loads(p.read_text(encoding="utf-8"))
cfg["staging_bucket"] = "${BUCKET_URI}"
cfg.setdefault("display_name", "${DISPLAY_NAME}")
cfg.setdefault("description", "Snippd multi-agent stack relay (ADK).")
p.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
PY

# -----------------------------------------------------------------------------
# 5) Optional: install deps before import validation
# -----------------------------------------------------------------------------
if [[ "${INSTALL_DEPS:-0}" == "1" ]]; then
  info "Installing requirements.txt (INSTALL_DEPS=1) ..."
  python3 -m pip install -U pip setuptools wheel
  python3 -m pip install -r requirements.txt
fi

# -----------------------------------------------------------------------------
# 6) ADK deploy (from THIS directory; final arg is .)
# -----------------------------------------------------------------------------
if ! command -v adk >/dev/null 2>&1; then
  die "adk CLI not found. Install: pip install --user 'google-adk>=1.30' && export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

if [[ "${ADK_VALIDATE_IMPORT:-0}" == "1" ]]; then
  info "Pre-deployment import validation enabled (ADK_VALIDATE_IMPORT=1)."
fi

info "Deploying Agent Engine (several minutes)..."
if [[ "${ADK_VALIDATE_IMPORT:-0}" == "1" ]]; then
  adk deploy agent_engine \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --display_name="${DISPLAY_NAME}" \
    --adk_app agent_engine_app \
    --adk_app_object app \
    --requirements_file requirements.txt \
    --validate-agent-import \
    --staging_bucket="${BUCKET_URI}" \
    .
else
  adk deploy agent_engine \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --display_name="${DISPLAY_NAME}" \
    --adk_app agent_engine_app \
    --adk_app_object app \
    --requirements_file requirements.txt \
    --staging_bucket="${BUCKET_URI}" \
    .
fi

info "Done. Code 3: Cloud Build → your build → expand failed step → read pip stderr."
