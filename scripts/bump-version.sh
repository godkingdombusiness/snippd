#!/usr/bin/env bash
# bump-version.sh — bumps Snippd version in CHANGELOG.md and docs/VERSION
#
# Usage: bash scripts/bump-version.sh <patch|minor|major>
#
# What it does:
#   1. Reads current version from the most recent [x.x.x] section in CHANGELOG.md
#   2. Calculates the new version based on the bump type
#   3. Renames [Unreleased] to [new-version] — today's date
#   4. Inserts a fresh empty [Unreleased] section above it
#   5. Writes new version to docs/VERSION
#   6. Prints: "Bumped to version X.X.X"

set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────────────

BUMP_TYPE="${1:-}"
if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: bash scripts/bump-version.sh <patch|minor|major>"
  exit 1
fi

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CHANGELOG="$ROOT_DIR/CHANGELOG.md"
VERSION_FILE="$ROOT_DIR/docs/VERSION"

if [[ ! -f "$CHANGELOG" ]]; then
  echo "Error: CHANGELOG.md not found at $CHANGELOG"
  exit 1
fi

# ── Read current version ───────────────────────────────────────────────────────

# Find the most recent versioned section: ## [x.x.x]
CURRENT_VERSION=$(grep -oP '(?<=## \[)\d+\.\d+\.\d+(?=\])' "$CHANGELOG" | head -1)

if [[ -z "$CURRENT_VERSION" ]]; then
  echo "Error: No versioned section found in CHANGELOG.md (looking for ## [x.x.x])"
  exit 1
fi

echo "Current version: $CURRENT_VERSION"

# ── Calculate new version ──────────────────────────────────────────────────────

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  patch)
    PATCH=$((PATCH + 1))
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
TODAY=$(date +%Y-%m-%d)

echo "Bumping to:      $NEW_VERSION ($BUMP_TYPE bump)"
echo "Date:            $TODAY"

# ── Build the new [Unreleased] block ──────────────────────────────────────────

NEW_UNRELEASED="## [Unreleased]
### Added
### Changed
### Fixed
### Database
### API
### Services"

# ── Rewrite CHANGELOG.md ──────────────────────────────────────────────────────
# Replace the first "## [Unreleased]" block with:
#   [new unreleased block]
#   ---
#   ## [NEW_VERSION] — TODAY
#   <old unreleased content>

TMPFILE=$(mktemp)

# Use awk to do the replacement
awk -v new_version="$NEW_VERSION" -v today="$TODAY" -v new_unreleased="$NEW_UNRELEASED" '
BEGIN {
  found_unreleased = 0
  in_unreleased = 0
  unreleased_content = ""
  printed_new = 0
}

# Detect the [Unreleased] header
/^## \[Unreleased\]/ {
  if (!found_unreleased) {
    found_unreleased = 1
    in_unreleased = 1
    next
  }
}

# While inside the unreleased block, capture lines until next ## section
in_unreleased && /^## \[/ {
  # End of unreleased block — print the transformed output
  in_unreleased = 0

  # Print fresh unreleased block
  print new_unreleased
  print ""
  print "---"
  print ""

  # Print versioned section with captured content
  print "## [" new_version "] — " today
  # Print the captured unreleased content (trimmed leading/trailing blank lines)
  if (unreleased_content != "") {
    print unreleased_content
  }
  print ""
  print "---"
  print ""

  # Now print the current line (start of next versioned section)
  print $0
  next
}

in_unreleased {
  # Accumulate lines inside the unreleased block
  if (unreleased_content == "" && $0 ~ /^[[:space:]]*$/) next  # skip leading blanks
  if (unreleased_content != "") unreleased_content = unreleased_content "\n" $0
  else unreleased_content = $0
  next
}

# Handle case where [Unreleased] is the last section (no ## after it)
END {
  if (in_unreleased) {
    print new_unreleased
    print ""
    print "---"
    print ""
    print "## [" new_version "] — " today
    if (unreleased_content != "") print unreleased_content
  }
}

# Pass through all other lines
{ print }
' "$CHANGELOG" > "$TMPFILE"

mv "$TMPFILE" "$CHANGELOG"

# ── Write docs/VERSION ────────────────────────────────────────────────────────

echo "$NEW_VERSION" > "$VERSION_FILE"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "Bumped to version $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Review CHANGELOG.md to confirm the versioned section looks correct"
echo "  2. Update docs/ files if this bump reflects a significant release"
