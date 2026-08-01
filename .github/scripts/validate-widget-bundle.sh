#!/bin/bash
# Validates that @mj-biz-apps/forms-ng actually SHIPS the <mj-form> browser bundle.
#
# WHY THIS EXISTS. Every published version that carried the widget at all — 0.2.0, 0.2.1,
# 0.3.0 and 0.4.0 — shipped without dist/widget/mj-form.js. (0.0.0 predates the widget; there
# is no 0.1.0.) The bundler was never broken — it simply lived in a separate
# `build:widget` script that no CI path invoked, so `/forms/widget/mj-form.js` 404'd,
# <mj-form> never upgraded, and every public form rendered an empty shell.
#
# It survived all four because turbo declares `outputs: ["dist/**"]`. Anyone who ran
# `build:widget` by hand once had the artifact captured into the build cache as though
# `build` had produced it, and restored on every later cache hit. Local builds looked
# correct forever after; CI, cold-cached, never produced it. A comment could not have
# held that line, so this asserts it instead.
#
# Asserts against the PACK MANIFEST rather than the working tree, because the tarball is
# the actual contract with a host. A disk check would still pass if `files` were narrowed.
#
# Run AFTER the packages are built. Cheap enough for every PR (build.yml) and mandatory
# before publishing (publish.yml).

set -uo pipefail

PKG="@mj-biz-apps/forms-ng"
BUNDLE_PATH="dist/widget/mj-form.js"
DISK_PATH="packages/Angular/${BUNDLE_PATH}"

# A real AOT-compiled Angular bundle is ~835 kB. A stub, a truncated write or an entry
# that bundled nothing lands orders of magnitude below this, and existence alone would
# wave it through.
MIN_BYTES=200000

ERRORS=0
fail() { echo "::error::$1"; ERRORS=$((ERRORS + 1)); }

echo "Checking that ${PKG} ships ${BUNDLE_PATH}..."

# (1) The publish contract: is the file actually in the tarball npm would upload?
if ! MANIFEST=$(npm pack --workspace="$PKG" --dry-run --json 2>/dev/null); then
  fail "Could not read the pack manifest for ${PKG} — is the workspace built?"
  exit 1
fi

if ! echo "$MANIFEST" | jq -e --arg p "$BUNDLE_PATH" '.[0].files[] | select(.path == $p)' >/dev/null 2>&1; then
  fail "${PKG} would publish WITHOUT ${BUNDLE_PATH} — the respondent page would 404 and no public form would render. Its \"build\" script must produce the widget bundle (ngc && node scripts/build-widget.mjs)."
  exit 1
fi
echo "  tarball contains ${BUNDLE_PATH}"

# (2) Plausibly sized, not a stub.
if [ ! -f "$DISK_PATH" ]; then
  fail "${BUNDLE_PATH} is in the manifest but missing from the working tree at ${DISK_PATH}"
  exit 1
fi
BYTES=$(wc -c < "$DISK_PATH" | tr -d ' ')
if [ "$BYTES" -lt "$MIN_BYTES" ]; then
  fail "${BUNDLE_PATH} is only ${BYTES} bytes (expected >= ${MIN_BYTES}) — it looks like a stub, not a bundled Angular element."
else
  echo "  size ${BYTES} bytes (>= ${MIN_BYTES})"
fi

# (3) The Angular Linker pass ran. Without it the bundle still builds and still passes an
# existence + size check, but dies at runtime with "JIT compiler unavailable" — which on the
# hosted page is indistinguishable from the 404 this gate exists to prevent.
NG_DECLARE=$(grep -o 'ngDeclare' "$DISK_PATH" | wc -l | tr -d ' ')
if [ "$NG_DECLARE" != "0" ]; then
  fail "${BUNDLE_PATH} still contains ${NG_DECLARE} partial-compilation (ngDeclare) sites — the Angular Linker onLoad pass in scripts/build-widget.mjs did not run. The bundle would fail at runtime with \"JIT compiler unavailable\"."
else
  echo "  fully linked (0 ngDeclare sites)"
fi

# (4) It self-registers the element the host page waits on. Loading a bundle that never
# calls customElements.define leaves customElements.whenDefined('mj-form') pending forever.
#
# Both halves are deliberately specific. A bare `grep mj-form` is satisfied by the trailing
# `//# sourceMappingURL=mj-form.js.map` comment alone, so this asserted almost nothing: a bundle
# registering some OTHER element would have passed. The tag reaches `define` through a minified
# constant (`var qP="mj-form" ... customElements.define(qP,NI)`), so the registration call and the
# QUOTED tag literal are checked separately — the quotes are what the sourcemap comment lacks.
REGISTERS_TAG=0
grep -q '"mj-form"' "$DISK_PATH" && REGISTERS_TAG=1
grep -q "'mj-form'" "$DISK_PATH" && REGISTERS_TAG=1
if ! grep -q 'customElements\.define(' "$DISK_PATH" || [ "$REGISTERS_TAG" != "1" ]; then
  fail "${BUNDLE_PATH} does not appear to register the <mj-form> custom element — customElements.whenDefined('mj-form') would never resolve on the respondent page."
else
  echo "  registers the <mj-form> custom element"
fi

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "::error::Found $ERRORS problem(s) with the ${PKG} widget bundle"
  exit 1
fi

echo "${PKG} ships a valid ${BUNDLE_PATH}"
