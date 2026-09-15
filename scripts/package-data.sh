#!/usr/bin/env bash
# Package the public/data tree plus the license/provenance notices into a
# monthly release zip, then generate and verify a SHA256 checksum manifest.
#
# Usage: ./scripts/package-data.sh [out.zip]
#   default output: <repo>/dist/data-YYYY-MM.zip (current UTC month)
#
# The argument is the OUTPUT ZIP PATH (matching the workflow call
# `./scripts/package-data.sh dist/data-$(date +%Y-%m).zip`). Relative
# paths resolve against the repo root, so the subshell that cds into the
# staging dir can never reinterpret them.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONTH_TAG="$(date -u +%Y-%m)"
OUT_ZIP_RAW="${1:-$REPO_ROOT/dist/data-$MONTH_TAG.zip}"
case "$OUT_ZIP_RAW" in
  /*) OUT_ZIP="$OUT_ZIP_RAW" ;;
  *)  OUT_ZIP="$REPO_ROOT/$OUT_ZIP_RAW" ;;
esac
OUT_DIR="$(dirname "$OUT_ZIP")"

mkdir -p "$OUT_DIR"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

# Copy the data tree and the notice files into a clean staging dir.
mkdir -p "$STAGING/data"
cp -R "$REPO_ROOT/public/data/." "$STAGING/data/"
cp "$REPO_ROOT/DATA_LICENSE" "$STAGING/"
cp "$REPO_ROOT/THIRD_PARTY_NOTICES.md" "$STAGING/"

# Deterministic archive: sort entries, no owner/group/time metadata.
# The output path is $OUT_ZIP (absolute) — the subshell cds into the
# staging dir, so a relative "dist/…" here would resolve inside staging.
(
  cd "$STAGING"
  find . -type f | sort | sed 's|^\./||' | \
    zip -X -q -@ "$OUT_ZIP"
)

# Checksum manifest (relative paths, sorted, verified immediately).
# Prefer GNU `sha256sum` but only when it actually runs (a stale x86
# Homebrew binary on arm64 can exist yet fail with "Bad CPU type"); fall
# back to macOS `shasum -a 256`.
if sha256sum --version >/dev/null 2>&1; then
  CHECKSUM_TOOL="sha256sum"
elif shasum -a 256 --version >/dev/null 2>&1; then
  CHECKSUM_TOOL="shasum -a 256"
else
  echo "ERROR: no working sha256 checksum tool found" >&2
  exit 1
fi
(
  cd "$OUT_DIR"
  find . -maxdepth 1 -type f -name 'data-*.zip' | sed 's|^\./||' | sort | \
    xargs -I{} $CHECKSUM_TOOL "{}" > SHA256SUMS
  $CHECKSUM_TOOL -c SHA256SUMS
)

echo "Packaged → $OUT_ZIP"
echo "Manifest → $OUT_DIR/SHA256SUMS (verified)"
