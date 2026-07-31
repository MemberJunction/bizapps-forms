#!/usr/bin/env bash
# Bump every @memberjunction/* pin in bizapps-forms to a target version, preserving each
# line's exact-vs-caret prefix, and set mj-app.json's mjVersionRange floor.
# Version-agnostic: replaces whatever semver is currently pinned. Idempotent.
#
# Pinning model (verified 2026-07-30 against this repo):
#   apps/*      -> exact  "X.Y.Z" in dependencies
#   packages/*  -> caret  "^X.Y.Z" in peerDependencies, no MJ dependencies at all
# The perl substitution preserves whichever prefix each line already has, so it upholds
# that model rather than imposing one.
#
# Usage: bump-pins.sh <target-version>     e.g. bump-pins.sh 5.50.0
set -euo pipefail

V="${1:-}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: bump-pins.sh <X.Y.Z>" >&2; exit 2; }
MAJ="${V%%.*}"; CEIL="$(( MAJ + 1 )).0.0"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Every package.json carrying @memberjunction/* pins. CoreEntitiesServer is easy to
# forget — it is this repo's fifth package and holds the magic-link entity subclass.
FILES=(
  package.json
  apps/MJAPI/package.json
  apps/MJExplorer/package.json
  packages/Angular/package.json
  packages/Server/package.json
  packages/Actions/package.json
  packages/Entities/package.json
  packages/CoreEntitiesServer/package.json
)

# Loop one file at a time — a space-joined var is NOT word-split under zsh, which
# silently no-ops the replace. An explicit array + per-file call is safe everywhere.
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "skip (missing): $f"; continue; }
  V="$V" perl -i -pe 's/("\@memberjunction\/[^"]+":\s*")(\^?)\d+\.\d+\.\d+(")/${1}${2}$ENV{V}${3}/g' "$f"
done

# mj-app.json version range floor: ">=<target> <(major+1).0.0"
if [[ -f mj-app.json ]]; then
  V="$V" CEIL="$CEIL" perl -i -pe 's/("mjVersionRange":\s*")>=\S+ <\d+\.0\.0(")/${1}>=$ENV{V} <$ENV{CEIL}${2}/g' mj-app.json
fi

echo "=== bumped @memberjunction/* pins -> $V (range >=$V <$CEIL) ==="
STRAGGLERS=0
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  n=$(grep -cE "\"@memberjunction/[^\"]+\": *\"\^?[0-9]+\.[0-9]+\.[0-9]+\"" "$f" || true)
  m=$(grep -cE "\"@memberjunction/[^\"]+\": *\"\^?${V//./\\.}\"" "$f" || true)
  [[ "$n" -ne "$m" ]] && { echo "  ⚠ $f: $((n-m)) pin(s) NOT at $V"; STRAGGLERS=1; }
  echo "  $f: $m @memberjunction pins at $V"
done
grep -q "\"mjVersionRange\": \">=$V <$CEIL\"" mj-app.json && echo "  mj-app.json range OK" || { echo "  ⚠ mj-app.json range NOT updated"; STRAGGLERS=1; }
[[ "$STRAGGLERS" -eq 0 ]] && echo "  all pins consistent ✓" || { echo "  STRAGGLERS FOUND"; exit 1; }
