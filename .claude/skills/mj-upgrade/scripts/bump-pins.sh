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
# PRERELEASE VERSIONS (added 2026-09-03, on the 6.1.0-edge.2 -> 6.1.0-edge.5 upgrade).
# Every pattern below accepts an optional `-<prerelease>` suffix. Without it this script
# was unusable for the entire 6.x edge line and, worse, unsafe: the argument guard
# rejected `6.1.0-edge.5` outright, but had anyone widened only that guard, the perl
# substitution's `\d+\.\d+\.\d+"` could not match `"6.1.0-edge.2"` either — it would have
# replaced nothing while the verification loop counted 0 pins found and 0 pins wrong, and
# printed "all pins consistent ✓" over a file it had never touched. Hence TOTAL below.
#
# Usage: bump-pins.sh <target-version>     e.g. bump-pins.sh 5.50.0  |  bump-pins.sh 6.1.0-edge.5
set -euo pipefail

# Semver with an optional prerelease, in the two dialects this script needs.
SEMVER_ERE='[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?'   # grep -E
SEMVER_PCRE='\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?'         # perl (non-capturing: keeps $1/$2/$3)

V="${1:-}"
[[ "$V" =~ ^${SEMVER_ERE}$ ]] || { echo "usage: bump-pins.sh <X.Y.Z[-prerelease]>" >&2; exit 2; }
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
  V="$V" SEMVER_PCRE="$SEMVER_PCRE" perl -i -pe \
    's/("\@memberjunction\/[^"]+":\s*")(\^?)$ENV{SEMVER_PCRE}(")/${1}${2}$ENV{V}${3}/g' "$f"
done

# mj-app.json version range floor: ">=<target> <(major+1).0.0"
if [[ -f mj-app.json ]]; then
  V="$V" CEIL="$CEIL" perl -i -pe 's/("mjVersionRange":\s*")>=\S+ <\d+\.0\.0(")/${1}>=$ENV{V} <$ENV{CEIL}${2}/g' mj-app.json
fi

echo "=== bumped @memberjunction/* pins -> $V (range >=$V <$CEIL) ==="
STRAGGLERS=0
TOTAL=0
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  n=$(grep -cE "\"@memberjunction/[^\"]+\": *\"\^?${SEMVER_ERE}\"" "$f" || true)
  m=$(grep -cE "\"@memberjunction/[^\"]+\": *\"\^?${V//./\\.}\"" "$f" || true)
  [[ "$n" -ne "$m" ]] && { echo "  ⚠ $f: $((n-m)) pin(s) NOT at $V"; STRAGGLERS=1; }
  TOTAL=$((TOTAL + m))
  echo "  $f: $m @memberjunction pins at $V"
done
# Fail closed on zero. "Nothing wrong" and "nothing looked at" print the same summary
# otherwise, and the second is what a pattern that stops matching looks like.
[[ "$TOTAL" -gt 0 ]] || { echo "  ⚠ matched 0 @memberjunction pins in $ROOT — the patterns above stopped matching this repo"; STRAGGLERS=1; }
grep -q "\"mjVersionRange\": \">=$V <$CEIL\"" mj-app.json && echo "  mj-app.json range OK" || { echo "  ⚠ mj-app.json range NOT updated"; STRAGGLERS=1; }
[[ "$STRAGGLERS" -eq 0 ]] && echo "  all $TOTAL pins consistent ✓" || { echo "  STRAGGLERS FOUND"; exit 1; }
