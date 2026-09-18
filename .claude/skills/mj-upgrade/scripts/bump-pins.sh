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
# PUBLISHED PEERS ARE NOT HOST PINS (added 2026-09-18, after PR #233).
# `packages/*` peerDependencies and `mj-app.json`'s mjVersionRange declare the range of MJ hosts
# this app SUPPORTS. They are not a record of which build you are developing against, and the
# two move on different schedules. Since #233 they are anchored at a prerelease
# (`^6.1.0-edge.6`), because a range with no prerelease tag admits no `-edge.N` host at all and
# an Edge host then fails ERESOLVE, which `mj app install` misreports as an npm auth problem
# before finalizing the app Disabled (#211).
#
# Flattening `^6.1.0-edge.6` to `^6.1.2` for a host upgrade therefore re-breaks every Edge host
# AND is refused by `npm run lint:mj-ranges`, a step in the required `build-and-test` check.
# This script used to do exactly that, on all 40 peers, while printing "all pins consistent ✓".
#
# So: a target with NO prerelease bumps only the host-tracking pins (`apps/*` exact deps, the
# root devDependencies) and leaves the peers and mjVersionRange alone — which is correct, because
# `^6.1.0-edge.6` already admits 6.1.1, 6.1.2 and every later 6.x. Moving the supported LINE is a
# separate, deliberate act: pass that line's own prerelease, e.g. `bump-pins.sh 6.2.0-edge.0`.
#
# Usage: bump-pins.sh <target-version>     e.g. bump-pins.sh 6.1.2  |  bump-pins.sh 6.2.0-edge.0
set -euo pipefail

# Semver with an optional prerelease, in the two dialects this script needs.
SEMVER_ERE='[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?'   # grep -E
SEMVER_PCRE='\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?'         # perl (non-capturing: keeps $1/$2/$3)

V="${1:-}"
[[ "$V" =~ ^${SEMVER_ERE}$ ]] || { echo "usage: bump-pins.sh <X.Y.Z[-prerelease]>" >&2; exit 2; }
MAJ="${V%%.*}"; CEIL="$(( MAJ + 1 )).0.0"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Manifests that track the HOST BUILD you are developing against. Exact in apps/* by documented
# policy; caret at the root. Safe to move to any target, prerelease or not.
HOST_FILES=(
  package.json
  apps/MJAPI/package.json
  apps/MJExplorer/package.json
)

# Manifests that declare the SUPPORTED HOST RANGE. CoreEntitiesServer is easy to forget — it is
# this repo's fifth package and holds the magic-link entity subclass. These carry MJ only as
# peerDependencies, governed by `scripts/check-mj-version-ranges.mjs` Rule 2, and they move only
# when the target names a prerelease. See the header.
PEER_FILES=(
  packages/Angular/package.json
  packages/Server/package.json
  packages/Actions/package.json
  packages/Entities/package.json
  packages/CoreEntitiesServer/package.json
)

# A target with no `-prerelease` cannot be written into a peer range: `^6.1.2` admits no Edge
# host, which is #211 exactly, and `lint:mj-ranges` refuses it.
TARGET_HAS_PRERELEASE=0
[[ "$V" == *-* ]] && TARGET_HAS_PRERELEASE=1

if [[ "$TARGET_HAS_PRERELEASE" -eq 1 ]]; then
  FILES=( "${HOST_FILES[@]}" "${PEER_FILES[@]}" )
else
  FILES=( "${HOST_FILES[@]}" )
fi

# Loop one file at a time — a space-joined var is NOT word-split under zsh, which
# silently no-ops the replace. An explicit array + per-file call is safe everywhere.
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "skip (missing): $f"; continue; }
  V="$V" SEMVER_PCRE="$SEMVER_PCRE" perl -i -pe \
    's/("\@memberjunction\/[^"]+":\s*")(\^?)$ENV{SEMVER_PCRE}(")/${1}${2}$ENV{V}${3}/g' "$f"
done

# mj-app.json's mjVersionRange is DERIVED from packages/Entities' own MJ pin by
# scripts/sync-app-version.mjs, and build-and-test checks the derivation. It therefore moves with
# the peers and never independently — writing it here while leaving the peers alone is the exact
# drift that check red in the first place.
if [[ "$TARGET_HAS_PRERELEASE" -eq 1 && -f mj-app.json ]]; then
  V="$V" CEIL="$CEIL" perl -i -pe 's/("mjVersionRange":\s*")>=\S+ <\d+\.0\.0(")/${1}>=$ENV{V} <$ENV{CEIL}${2}/g' mj-app.json
fi

echo "=== bumped @memberjunction/* pins -> $V ==="
STRAGGLERS=0
TOTAL=0
# Verify ONLY what was actually rewritten. Counting the peer files here when the target has no
# prerelease would report them as stragglers for correctly keeping their Edge anchor -- the
# summary has to describe the same set the substitution touched, or "consistent ✓" is a claim
# about files nobody looked at, which is the failure this block already exists to prevent.
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

if [[ "$TARGET_HAS_PRERELEASE" -eq 1 ]]; then
  echo "  range -> >=$V <$CEIL"
  grep -q "\"mjVersionRange\": \">=$V <$CEIL\"" mj-app.json && echo "  mj-app.json range OK" || { echo "  ⚠ mj-app.json range NOT updated"; STRAGGLERS=1; }
else
  CURRENT_RANGE=$(grep -o '"mjVersionRange": "[^"]*"' mj-app.json | sed 's/.*: "//;s/"$//')
  echo ""
  echo "  NOT TOUCHED, deliberately — the supported-host declaration:"
  for f in "${PEER_FILES[@]}"; do [[ -f "$f" ]] && echo "    $f (peerDependencies)"; done
  echo "    mj-app.json  mjVersionRange = $CURRENT_RANGE"
  echo "  \"$V\" carries no prerelease, so writing it into a peer range would admit no MJ Edge"
  echo "  host at all (#211) and 'npm run lint:mj-ranges' would refuse the tree. The existing"
  echo "  anchor already admits $V. To move the supported LINE, pass that line's own prerelease,"
  echo "  e.g. bump-pins.sh 6.2.0-edge.0"
fi

# The gate is the authority on whether the tree this script just produced is shippable.
if [[ -f scripts/check-mj-version-ranges.mjs ]]; then
  echo ""
  if node scripts/check-mj-version-ranges.mjs; then
    echo "  lint:mj-ranges OK"
  else
    echo "  ⚠ lint:mj-ranges REFUSES this tree — do not commit it"
    STRAGGLERS=1
  fi
fi

[[ "$STRAGGLERS" -eq 0 ]] && echo "  all $TOTAL pins consistent ✓" || { echo "  STRAGGLERS FOUND"; exit 1; }
