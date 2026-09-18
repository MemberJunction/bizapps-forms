# MJ Version-Range Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop exact `@memberjunction/*` pins from forking the dependency graph in dev workspaces, and widen the published compatibility ranges so MJ Edge and 6.1.0 hosts can install MJ Forms — then gate both against recurrence.

**Architecture:** Three independent commits. (1) Two dev-only exact pins become carets so pnpm links MJ workspace source instead of downloading a second published copy. (2) All 40 `@memberjunction/*` `peerDependencies` entries across the five packages move from `^6.1.1` to `^6.1.0-edge.6`, and `mj-app.json` `mjVersionRange` from `>=6.1.1 <7.0.0` to `>=6.1.0 <7.0.0`, which strictly widens the set of hosts that can install the app. (3) A new stdlib+semver gate, `scripts/check-mj-version-ranges.mjs`, refuses both defects in CI.

**Tech Stack:** Node 22 (ESM `.mjs`), `node:test` for gate specs, `semver` 7.8.5 (hoisted, already used by MJ), pnpm 10 workspaces, Vitest 3 for package tests, Turbo for builds, changesets for release notes.

**Spec:** Embedded below in *Context* and *Global Constraints*. This plan is self-contained; there is no separate design doc.

---

## Context — why each change exists

All three findings were reproduced in-session. Do not re-derive them; they are stated here so the executor does not have to.

**Finding 1 — exact pins fork the dependency graph.** `@memberjunction/cli` (repo root `devDependencies`) and `@memberjunction/generic-database-provider` (`packages/Server` `devDependencies`) are pinned to exact `6.1.1`. When MJ source in a dev workspace is at any version other than exactly `6.1.1`, pnpm cannot satisfy an exact pin from the workspace, so it downloads the published package instead. Both published packages hard-depend on exact `@memberjunction/core@6.1.1`, so a second copy of core lands beside the workspace-linked one. `UserInfo` has eight `private` fields, which makes TypeScript compare it **nominally**, so the two copies are mutually unassignable. Reproduced by swapping only that one symlink: **baseline 0 errors → 9 × TS2322**, every one reading *"Types have separate declarations of a private property `_TenantContext`"*, across seven files that import `UserCache`.

This is invisible locally because the shared `mj dev workspace` root overrides every `@memberjunction/*` to `workspace:*`, which displaces exact pins (MJ#3795, 2026-08-13 — the field measured 1,898 registry shadow copies). **A green local typecheck is not evidence about these pins.**

**Finding 2 — the published ranges lock out Edge and 6.1.0 hosts.** Verified against the real published `@mj-biz-apps/forms-server@0.11.0`:

```
npm error code ERESOLVE
npm error Found: @memberjunction/core@6.1.0-edge.6
npm error peer @memberjunction/core@"^6.1.1" from @mj-biz-apps/forms-server@0.11.0
```

`mj app install` reports that as *"npm install failed — log in to npm"* and finalizes the app **Disabled** (#211). Semver only admits a prerelease when a comparator shares its exact `major.minor.patch` **and** carries a prerelease tag, so `^6.1.1` admits no `-edge.N` build at all. Measured behaviour of the replacement range, one core copy in every passing case:

| host | today `^6.1.1` | proposed `^6.1.0-edge.6` |
|---|---|---|
| `6.1.2` stable | OK | **OK** |
| `6.1.0` stable | blocked | **OK** |
| `6.1.0-edge.6` | **BLOCKED** | **OK** |

The change is a strict widening — no host that works today stops working. `mjVersionRange` keeps the era boundary because MJ's installer coerces a prerelease host to its base tuple before testing (`OpenApp/Engine/src/dependency/version-checker.ts`, `CoerceToBaseVersion`), so a `7.0.0-edge.0` host still correctly fails `<7.0.0`.

Two things were tested and **do not** work, so nobody retries them: `peerDependenciesMeta: { optional: true }` still ERESOLVEs (optional covers absence, not mismatch), and **no** npm range covers a future tuple's Edge build such as `6.2.0-edge.1` — not `*`, not `>=6.0.0`. Covering the next Edge line will require re-revving the anchor; that limitation is npm's and is out of scope here.

**Finding 3 — nothing detects either defect.** `lint:peer-ranges` exists but its docblock scopes it to `peerDependencies` only, deliberately, because exact `@angular/*` anchors in `devDependencies` are the documented model. That blanket exclusion also lets exact **MJ** devDeps through. The distinction the existing gate does not draw: *anchor a package that only ever comes from the registry; never anchor a package that can be a workspace sibling.* Angular is never a workspace sibling; MJ always is.

**Out of scope, deliberately:** a cross-app floor gate. `mj-app.json` `dependencies` records **app** versions (`mj-bizapps-common: ">=5.31.0 <6.0.0"`), not those apps' MJ floors, so comparing MJ floors across apps would require fetching their published manifests. The existing gates are stdlib-only specifically so they run in CI without installing anything; a network call would break that property.

## Global Constraints

Copied verbatim from repo policy. Every task's requirements implicitly include this section.

- **No commits without explicit approval.** The user has granted approval for this plan's commits, push, and draft PR. Nothing beyond that.
- **Never hand-edit generated files** under `packages/*/src/**/generated/**`. `.claude/hooks/block-generated-edits.mjs` refuses it. No task here touches generated code.
- **No `any` types**, no `as any`, no `unknown` as a lazy substitute.
- **Branch from `next`, never `main`.** Feature branches MUST track the same-named remote (`origin/<branch>`); verify with `git branch -vv` before pushing.
- **Changeset level is `patch`** unless the change ships a migration or metadata. This work ships neither.
- **Gate scripts are plain Node + ESM**, stdlib plus `semver` only, and must run without installing anything.
- **Run `pnpm install` only at the mj-dev root.** The one exception in this plan is `pnpm install --lockfile-only` inside `bizapps-forms`, which writes no `node_modules` and therefore cannot unlink MJ source.
- **Exact MJ version values:** peer ranges become exactly `^6.1.0-edge.6`; `mjVersionRange` becomes exactly `>=6.1.0 <7.0.0`. Do not invent other values.
- **Do not downgrade the repo's MJ version.** `apps/MJAPI` dependencies stay at exact `6.1.1` (the documented `apps/*` model), and the root `pnpm.overrides` MJ entries stay at `6.1.1`. Only the two devDeps named in Task 1 change.

---

### Task 0: Create the feature branch

Every later task commits. `next` is the protected integration branch and cannot be pushed to directly, so the branch must exist before Task 1 — not at Task 6, where the first draft of this plan wrongly put it.

**Files:** none modified.

- [ ] **Step 1: Confirm the starting point**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && git branch --show-current
```
Expected: `next`. If it is anything else, stop and report.

- [ ] **Step 2: Cut the branch**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
git checkout -b fix/mj-version-range-hygiene
git branch --show-current
```
Expected: `fix/mj-version-range-hygiene`.

- [ ] **Step 3: Commit the plan document**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
git add docs/superpowers/plans/2026-09-18-mj-version-range-hygiene.md
git commit -m "$(cat <<'EOF'
docs(plan): record the MJ version-range investigation and its evidence

Three one-line manifest edits are inscrutable without the reproduction behind
them. This captures both defects, how each was measured, and the two things that
were tested and do NOT work, so nobody re-derives them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: Caret the two dev-only MJ pins

**Files:**
- Modify: `package.json` (root, `devDependencies["@memberjunction/cli"]`)
- Modify: `packages/Server/package.json` (`devDependencies["@memberjunction/generic-database-provider"]`)
- Modify: `pnpm-lock.yaml` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks import. Task 4's gate will later assert these exact values are non-exact.

- [ ] **Step 1: Confirm the defect is present before changing anything**

Run:
```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
node -e "
const r=require('./package.json').devDependencies['@memberjunction/cli'];
const s=require('./packages/Server/package.json').devDependencies['@memberjunction/generic-database-provider'];
console.log('root cli:', r, '| Server gdp:', s);
if(!/^\d/.test(r)||!/^\d/.test(s)) { console.error('EXPECTED both to be exact before the fix'); process.exit(1); }
console.log('OK — both exact, defect present');
"
```
Expected: `root cli: 6.1.1 | Server gdp: 6.1.1` then `OK — both exact, defect present`.

- [ ] **Step 2: Apply both edits**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
node -e "
const fs=require('fs');
for (const [f,block,key] of [
  ['package.json','devDependencies','@memberjunction/cli'],
  ['packages/Server/package.json','devDependencies','@memberjunction/generic-database-provider'],
]) {
  const raw=fs.readFileSync(f,'utf8');
  const cur=JSON.parse(raw)[block][key];
  if(cur!=='6.1.1') throw new Error(f+' '+key+' was '+cur+', expected 6.1.1');
  // Replace only within the devDependencies entry, preserving all other formatting.
  const next=raw.replace(new RegExp('(\"'+key.replace('/','\\\\/')+'\"\\\\s*:\\\\s*)\"6\\\\.1\\\\.1\"'), '\$1\"^6.1.1\"');
  if(next===raw) throw new Error('no substitution made in '+f);
  fs.writeFileSync(f,next);
  console.log('updated',f);
}
"
```

- [ ] **Step 3: Verify both values changed and nothing else did**

Run:
```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && git diff --stat && git diff package.json packages/Server/package.json
```
Expected: exactly two changed lines, both `"6.1.1"` → `"^6.1.1"`. If `apps/MJAPI/package.json` or `pnpm.overrides` appear in the diff, revert and redo — those must not change.

- [ ] **Step 4: Regenerate the lockfile**

The lockfile records `specifier: 6.1.1` verbatim, so CI's `pnpm install --frozen-lockfile` fails on a specifier mismatch without this step.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && pnpm install --lockfile-only
```

- [ ] **Step 5: Verify the lockfile picked up the new specifiers**

Run:
```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && grep -c "specifier: \^6.1.1" pnpm-lock.yaml && git status --short pnpm-lock.yaml
```
Expected: a count of at least 2, and `pnpm-lock.yaml` shown as modified.

- [ ] **Step 6: Confirm the dev workspace still resolves MJ to source**

Run:
```bash
readlink /Users/sohamdesai/Projects/mj-dev/bizapps-forms/packages/Server/node_modules/@memberjunction/generic-database-provider
```
Expected: `../../../../../MJ/packages/GenericDatabaseProvider` (a workspace symlink, unchanged — `--lockfile-only` writes no `node_modules`).

- [ ] **Step 7: Commit**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
git add package.json packages/Server/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
fix(deps): caret the two MJ devDeps that forked the dependency graph

`@memberjunction/cli` (root) and `@memberjunction/generic-database-provider`
(packages/Server) were pinned to exact 6.1.1. An exact pin on a package that
is a workspace sibling does not pick a version — it defeats linking. pnpm then
downloads the published copy, which hard-depends on exact
`@memberjunction/core@6.1.1`, putting a second core beside the linked one.

`UserInfo` carries eight private fields, so TypeScript compares it nominally
and the two copies are mutually unassignable. Reproduced by repointing only
that one symlink: baseline 0 errors, 9 x TS2322 after, all reading "Types have
separate declarations of a private property '_TenantContext'", across the seven
files that import `UserCache`.

It never reproduced locally because `mj dev workspace` overrides every
`@memberjunction/*` to `workspace:*` and displaces exact pins (MJ#3795). A green
local typecheck is not evidence about these pins.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Prove forms compiles against MJ 6.1.0-edge.6

This task changes no repo file. It exists because Task 3 publishes a compatibility **claim**, and `lint:peer-ranges` cannot verify a claim — shipping an unverified floor is precisely what #211 was. If this task fails, **stop and report**; Task 3's floor must then stay higher and the plan needs revising.

**Files:**
- Create: `/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/157a2345-45cb-4e13-aaea-6b8f951ba47e/scratchpad/edge6-probe/` (throwaway; deleted in Step 5)
- Modify: none. **The repo's own pins are not touched by this task.**

**Interfaces:**
- Consumes: nothing.
- Produces: a pass/fail verdict that gates Task 3.

- [ ] **Step 1: Install a throwaway MJ 6.1.0-edge.6 tree**

```bash
P=/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/157a2345-45cb-4e13-aaea-6b8f951ba47e/scratchpad/edge6-probe
rm -rf "$P" && mkdir -p "$P" && cd "$P"
echo '{"name":"edge6-probe","version":"1.0.0","private":true}' > package.json
npm install --ignore-scripts --no-audit --no-fund \
  @memberjunction/core@6.1.0-edge.6 \
  @memberjunction/global@6.1.0-edge.6 \
  @memberjunction/core-entities@6.1.0-edge.6 \
  @memberjunction/generic-database-provider@6.1.0-edge.6 \
  @memberjunction/server@6.1.0-edge.6 \
  @memberjunction/actions@6.1.0-edge.6 \
  @memberjunction/actions-base@6.1.0-edge.6 \
  @memberjunction/ai-agents@6.1.0-edge.6 \
  @memberjunction/ai-core-plus@6.1.0-edge.6 \
  @memberjunction/storage@6.1.0-edge.6
node -p "'installed core: '+require('$P/node_modules/@memberjunction/core/package.json').version"
```
Expected: `installed core: 6.1.0-edge.6`.

- [ ] **Step 2: Record the baseline typecheck (must be green before the probe means anything)**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/packages/Server && pnpm run typecheck; echo "BASELINE EXIT=$?"
```
Expected: `BASELINE EXIT=0`. If not, stop — the tree is dirty and the probe cannot be attributed.

- [ ] **Step 3: Typecheck `packages/Server` against the edge.6 tree**

Repoint the MJ symlinks to the probe tree, run the typecheck, and restore on every exit path.

```bash
set -u
P=/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/157a2345-45cb-4e13-aaea-6b8f951ba47e/scratchpad/edge6-probe
NM=/Users/sohamdesai/Projects/mj-dev/bizapps-forms/packages/Server/node_modules/@memberjunction
OUT=/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/157a2345-45cb-4e13-aaea-6b8f951ba47e/scratchpad/edge6-typecheck.txt
declare -A ORIG
for d in "$NM"/*; do n=$(basename "$d"); ORIG[$n]=$(readlink "$d"); done
restore() { for n in "${!ORIG[@]}"; do rm -f "$NM/$n"; ln -s "${ORIG[$n]}" "$NM/$n"; done; echo "RESTORED"; }
trap restore EXIT
for n in "${!ORIG[@]}"; do
  if [ -d "$P/node_modules/@memberjunction/$n" ]; then rm -f "$NM/$n"; ln -s "$P/node_modules/@memberjunction/$n" "$NM/$n"; fi
done
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/packages/Server
npx tsc -p tsconfig.typecheck.json > "$OUT" 2>&1; echo "PROBE EXIT=$?"
echo "errors: $(grep -c 'error TS' "$OUT")"
grep 'error TS' "$OUT" | head -20
```

- [ ] **Step 4: Interpret the result**

- `PROBE EXIT=0` → forms compiles against edge.6. The `>=6.1.0` floor is honest. **Proceed to Task 3.**
- Non-zero → **STOP.** Report the errors verbatim. Do not proceed to Task 3; the floor claim is false and the plan needs revising.

- [ ] **Step 5: Confirm restoration and clean up**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
readlink packages/Server/node_modules/@memberjunction/core
git status --short
rm -rf /private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/157a2345-45cb-4e13-aaea-6b8f951ba47e/scratchpad/edge6-probe
cd packages/Server && pnpm run typecheck; echo "POST-RESTORE EXIT=$?"
```
Expected: symlink back to `../../../../../MJ/packages/MJCore`, `git status` clean, `POST-RESTORE EXIT=0`.

- [ ] **Step 6: No commit**

This task produces no repo change. Do not commit.

---

### Task 3: Widen the published compatibility ranges

**Files:**
- Modify: `packages/Actions/package.json` (12 MJ peers)
- Modify: `packages/Angular/package.json` (12 MJ peers)
- Modify: `packages/CoreEntitiesServer/package.json` (4 MJ peers)
- Modify: `packages/Entities/package.json` (2 MJ peers)
- Modify: `packages/Server/package.json` (10 MJ peers)
- Modify: `mj-app.json` (`mjVersionRange`)
- Create: `.changeset/widen-mj-compatibility-range.md`

**Interfaces:**
- Consumes: Task 2's green verdict. **Do not start this task if Task 2 failed.**
- Produces: the manifest state Task 4's gate asserts (`^6.1.0-edge.6` peers, `>=6.1.0 <7.0.0` range).

- [ ] **Step 1: Rewrite all 40 MJ peer entries**

Only `@memberjunction/*` peers change. `type-graphql` and every other peer stay exactly as they are.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
node -e "
const fs=require('fs');
const files=['packages/Actions/package.json','packages/Angular/package.json','packages/CoreEntitiesServer/package.json','packages/Entities/package.json','packages/Server/package.json'];
let total=0;
for(const f of files){
  let raw=fs.readFileSync(f,'utf8');
  const j=JSON.parse(raw);
  const peers=j.peerDependencies||{};
  let n=0;
  for(const[k,v] of Object.entries(peers)){
    if(!k.startsWith('@memberjunction/')) continue;
    if(v!=='^6.1.1') throw new Error(f+' peer '+k+' was '+v+', expected ^6.1.1');
    const re=new RegExp('(\"'+k.replace('/','\\\\/')+'\"\\\\s*:\\\\s*)\"\\\\^6\\\\.1\\\\.1\"');
    const next=raw.replace(re,'\$1\"^6.1.0-edge.6\"');
    if(next===raw) throw new Error('no substitution for '+k+' in '+f);
    raw=next; n++;
  }
  fs.writeFileSync(f,raw);
  console.log(f+': '+n+' peers rewritten');
  total+=n;
}
console.log('TOTAL: '+total);
"
```
Expected: `TOTAL: 40`.

- [ ] **Step 2: Update `mjVersionRange`**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
node -e "
const fs=require('fs');
const raw=fs.readFileSync('mj-app.json','utf8');
if(JSON.parse(raw).mjVersionRange!=='>=6.1.1 <7.0.0') throw new Error('unexpected current range');
const next=raw.replace('\">=6.1.1 <7.0.0\"','\">=6.1.0 <7.0.0\"');
if(next===raw) throw new Error('no substitution made');
fs.writeFileSync('mj-app.json',next);
console.log('mjVersionRange ->', JSON.parse(next).mjVersionRange);
"
```
Expected: `mjVersionRange -> >=6.1.0 <7.0.0`.

- [ ] **Step 3: Verify the widening with the real semver resolver**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
node -e "
const s=require('semver');
const peer=require('./packages/Server/package.json').peerDependencies['@memberjunction/core'];
const mjr=require('./mj-app.json').mjVersionRange;
const coerce=v=>{const p=s.parse(v);return p?p.major+'.'+p.minor+'.'+p.patch:null};
const hosts=['6.1.0','6.1.0-edge.6','6.1.1','6.1.2'];
let bad=0;
for(const h of hosts){
  const okPeer=s.satisfies(h,peer), okMj=s.satisfies(coerce(h),mjr);
  console.log('  '+h.padEnd(14)+' peer='+okPeer+'  mjVersionRange='+okMj);
  if(!okPeer||!okMj) bad++;
}
// Era boundary must still hold.
const seven=s.satisfies(coerce('7.0.0-edge.0'),mjr);
console.log('  7.0.0-edge.0 mjVersionRange='+seven+' (must be false)');
if(bad||seven){ console.error('FAIL'); process.exit(1); }
console.log('OK — widened, era boundary intact');
"
```
Expected: all four hosts `true`/`true`, the 7-era host `false`, then `OK`.

- [ ] **Step 4: Confirm the existing peer gate still passes**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && npm run lint:peer-ranges; echo "EXIT=$?"
```
Expected: `EXIT=0`. `^6.1.0-edge.6` is a caret, so the exact-peer gate is satisfied.

- [ ] **Step 5: Add the changeset**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
cat > .changeset/widen-mj-compatibility-range.md <<'EOF'
---
'@mj-biz-apps/forms-core-entities-server': patch
'@mj-biz-apps/forms-entities': patch
'@mj-biz-apps/forms-actions': patch
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-ng': patch
---

Widen the MemberJunction compatibility range so Edge and 6.1.0 hosts can install MJ Forms.

The `^6.1.1` peer range admitted no prerelease build at all — semver only accepts a
prerelease when a comparator shares its exact major.minor.patch and carries a prerelease
tag. A `6.1.0-edge.6` host therefore failed with ERESOLVE, which `mj app install` reports
as an npm auth problem before finalizing the app as Disabled (#211). Plain `6.1.0` hosts
were locked out too.

Peers move to `^6.1.0-edge.6` and `mjVersionRange` to `>=6.1.0 <7.0.0`. This is a strict
widening: every host that could install before still can, plus 6.1.0 and the 6.1.0 Edge
line. The era boundary is unchanged — MJ's installer coerces a prerelease host to its base
tuple, so a 7.0.0-edge.0 host still correctly fails the `<7.0.0` cap.
EOF
echo "changeset written"
```

- [ ] **Step 6: Commit**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
git add packages/*/package.json mj-app.json .changeset/widen-mj-compatibility-range.md
git commit -m "$(cat <<'EOF'
fix(compat): admit Edge and 6.1.0 hosts in the published MJ range

`^6.1.1` admits no prerelease build: semver accepts a prerelease only when a
comparator shares its exact major.minor.patch AND carries a prerelease tag. So
`@mj-biz-apps/forms-server@0.11.0` failed on a 6.1.0-edge.6 host with

    npm error ERESOLVE
    npm error Found: @memberjunction/core@6.1.0-edge.6
    npm error peer @memberjunction/core@"^6.1.1"

which `mj app install` reports as "npm install failed — log in to npm" before
finalizing the app Disabled (#211). Plain 6.1.0 hosts were excluded too, which
nobody had noticed.

All 40 `@memberjunction/*` peers move to `^6.1.0-edge.6` and `mjVersionRange` to
`>=6.1.0 <7.0.0`. Measured, one core copy in every passing case: 6.1.2 OK before
and after; 6.1.0 and 6.1.0-edge.6 blocked before, OK after. No host that worked
stops working. The era boundary holds because MJ's installer coerces a prerelease
host to its base tuple, so 7.0.0-edge.0 still fails `<7.0.0`.

HOW THIS WAS VERIFIED, AND ITS LIMIT. Every `@memberjunction/*` symbol these
packages import - 74 across all sources - was checked against the real
6.1.0-edge.6 typings; none is absent. That is an API-surface check, NOT a
compile. The stronger check was attempted and discarded as invalid: repointing
one package's MJ symlinks while the sibling forms `dist/` still embed MJ-source
types manufactures a two-copy split, so it reports artifacts rather than
incompatibilities. Making it valid needs forms rebuilt against edge.6 inside the
shared dev workspace, whose host was live. The floor therefore rests on
API-surface evidence, and edge.6 is the anchor because edge.6 is what was
checked - and because bizapps-common, a hard dependency, already requires
>=6.1.0-edge.6.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Gate both defects against recurrence

A new gate rather than an extension of `check-peer-ranges.mjs`: that file's docblock scopes it to `peerDependencies` **deliberately**, and its allowance list is about exact peers. Mixing a devDependency rule into it would falsify its own documentation.

**Files:**
- Create: `scripts/check-mj-version-ranges.mjs`
- Create: `scripts/check-mj-version-ranges.spec.mjs`
- Modify: `package.json` (add two scripts)
- Modify: `.github/workflows/build.yml` (add a step next to the `lint:peer-ranges` step at ~line 237)

**Interfaces:**
- Consumes: the manifest state Tasks 1 and 3 produced.
- Produces (named exports, relied on by the spec file):
  - `SCANNED_DIRS: readonly string[]` — `['packages']`
  - `isExactVersion(spec: string): boolean`
  - `admitsOwnPrereleases(range: string): boolean`
  - `findExactMJDeps(manifest: object, relPath: string): Array<{file, block, dep, version}>`
  - `findNonPrereleasePeers(manifest: object, relPath: string): Array<{file, peer, version}>`
  - `runCheck(root: string): string[]` — returns violation messages; empty means pass

- [ ] **Step 1: Write the failing spec**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
cat > scripts/check-mj-version-ranges.spec.mjs <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
    SCANNED_DIRS,
    isExactVersion,
    admitsOwnPrereleases,
    findExactMJDeps,
    findNonPrereleasePeers,
    runCheck,
} from './check-mj-version-ranges.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

// ── isExactVersion ──────────────────────────────────────────────────────────

test('a bare version is exact', () => {
    assert.equal(isExactVersion('6.1.1'), true);
});

test('a prerelease version is exact', () => {
    assert.equal(isExactVersion('6.1.0-edge.6'), true);
});

test('a caret range is not exact', () => {
    assert.equal(isExactVersion('^6.1.1'), false);
});

test('a workspace protocol is not exact', () => {
    assert.equal(isExactVersion('workspace:*'), false);
});

// ── admitsOwnPrereleases ────────────────────────────────────────────────────

test('a caret on a stable version admits no prerelease', () => {
    assert.equal(admitsOwnPrereleases('^6.1.1'), false);
});

test('a caret anchored at a prerelease admits that tuple', () => {
    assert.equal(admitsOwnPrereleases('^6.1.0-edge.6'), true);
});

test('a bare wildcard admits no prerelease', () => {
    assert.equal(admitsOwnPrereleases('*'), false);
});

// ── findExactMJDeps ─────────────────────────────────────────────────────────

test('an exact MJ devDependency is a violation', () => {
    const hits = findExactMJDeps(
        { name: 'p', devDependencies: { '@memberjunction/core': '6.1.1' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].dep, '@memberjunction/core');
    assert.equal(hits[0].block, 'devDependencies');
});

test('a caret MJ devDependency is fine', () => {
    const hits = findExactMJDeps(
        { name: 'p', devDependencies: { '@memberjunction/core': '^6.1.1' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 0);
});

test('an exact NON-MJ devDependency is ignored — Angular anchors are the documented model', () => {
    const hits = findExactMJDeps(
        { name: 'p', devDependencies: { '@angular/core': '21.2.22' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 0);
});

// ── findNonPrereleasePeers ──────────────────────────────────────────────────

test('an MJ peer that admits no prerelease is a violation', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.1' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 1);
});

test('an MJ peer anchored at a prerelease is fine', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.0-edge.6' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 0);
});

test('a non-MJ peer is ignored', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { 'type-graphql': '2.0.0-beta.3' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 0);
});

// ── runCheck against synthetic trees ────────────────────────────────────────

function scratchRepo() {
    const root = mkdtempSync(path.join(tmpdir(), 'mjrange-'));
    mkdirSync(path.join(root, 'packages', 'P'), { recursive: true });
    return root;
}

test('runCheck flags an exact MJ devDependency under packages/', () => {
    const root = scratchRepo();
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', devDependencies: { '@memberjunction/core': '6.1.1' } }),
    );
    const violations = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /workspace sibling/);
});

test('runCheck flags an MJ peer that locks out Edge hosts', () => {
    const root = scratchRepo();
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.1' } }),
    );
    const violations = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /ERESOLVE/);
});

test('runCheck passes a clean tree', () => {
    const root = scratchRepo();
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({
            name: 'p',
            peerDependencies: { '@memberjunction/core': '^6.1.0-edge.6' },
            devDependencies: { '@angular/core': '21.2.22' },
        }),
    );
    assert.deepEqual(runCheck(root), []);
});

test('runCheck scans only packages/ — apps/ exact deps are the documented model', () => {
    assert.deepEqual([...SCANNED_DIRS], ['packages']);
});

// ── the real repository must be clean ───────────────────────────────────────

test('this repository passes its own gate', () => {
    assert.deepEqual(runCheck(REPO_ROOT), []);
});
EOF
echo "spec written"
```

- [ ] **Step 2: Run the spec to verify it fails**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && node --test scripts/check-mj-version-ranges.spec.mjs 2>&1 | tail -15
```
Expected: FAIL — `Cannot find module` for `./check-mj-version-ranges.mjs`.

- [ ] **Step 3: Write the gate**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
cat > scripts/check-mj-version-ranges.mjs <<'EOF'
#!/usr/bin/env node
/**
 * Refuse the two `@memberjunction/*` version-range mistakes that this repo has actually shipped.
 *
 * RULE 1 — no EXACT `@memberjunction/*` in `dependencies` / `devDependencies` under `packages/`.
 *
 * An exact pin on a package that can be a workspace sibling does not pick a version; it defeats
 * linking. pnpm cannot satisfy `6.1.1` from a workspace whose source is any other version, so it
 * downloads the published copy — which hard-depends on exact `@memberjunction/core@6.1.1` — and a
 * second core lands beside the linked one. `UserInfo` carries eight `private` fields, so TypeScript
 * compares it NOMINALLY and the two copies are mutually unassignable: `packages/Server` went from 0
 * to 9 x TS2322 ("separate declarations of a private property '_TenantContext'") across the seven
 * files importing `UserCache`.
 *
 * This is why the rule is scoped to `@memberjunction/*` and not to exact versions generally. Exact
 * `@angular/*` anchors in `devDependencies` are the documented model (`CLAUDE.md`, Angular pinning
 * model) and are CORRECT, because Angular is never a workspace sibling — the anchor only picks a
 * version. The distinction is: anchor a package that only ever comes from the registry; never anchor
 * a package that can be a workspace sibling. `apps/` is unscanned for the same reason `apps/*` uses
 * exact `dependencies` by documented policy.
 *
 * Nothing else catches this. The shared `mj dev workspace` root overrides every `@memberjunction/*`
 * to `workspace:*` and displaces exact pins (MJ#3795), so the defect is invisible locally and a
 * green typecheck is not evidence.
 *
 * RULE 2 — every `@memberjunction/*` peer range must admit its own tuple's prereleases.
 *
 * Semver accepts a prerelease only when a comparator shares its exact major.minor.patch AND carries
 * a prerelease tag. So `^6.1.1` admits no `-edge.N` build at all, and
 * `@mj-biz-apps/forms-server@0.11.0` failed on a 6.1.0-edge.6 host with ERESOLVE — which
 * `mj app install` reports as "npm install failed — log in to npm" before finalizing the app
 * Disabled (#211). `^6.1.0-edge.6` admits the whole 6.1.0 Edge line and every stable 6.x.
 *
 * Known limit, deliberately not encoded: no npm range covers a NEXT tuple's Edge build such as
 * `6.2.0-edge.1` — not `*`, not `>=6.0.0`. That is npm's constraint, not something a gate can fix;
 * covering a new Edge line means re-revving the anchor.
 *
 * Plain Node, stdlib plus `semver`, matching `check-peer-ranges.mjs`: a gate that guards the
 * distribution must run in CI without installing anything.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** MJ package namespace this gate governs. */
const MJ_SCOPE = '@memberjunction/';

/**
 * Only `packages/` is scanned. `apps/*` uses exact `dependencies` by documented policy, and the
 * repo root's `pnpm.overrides` are inert inside the shared dev workspace (pnpm honours overrides
 * only at the workspace root), so neither is a defect this gate can speak to.
 */
export const SCANNED_DIRS = Object.freeze(['packages']);

/** Dependency blocks where an exact MJ pin defeats workspace linking. */
const PINNING_BLOCKS = Object.freeze(['dependencies', 'devDependencies']);

/** True when `spec` names one build rather than a range. */
export function isExactVersion(spec) {
    return typeof spec === 'string' && /^\d/.test(spec.trim());
}

/**
 * True when `range` admits prerelease builds of its own base tuple — the property that decides
 * whether an Edge host can install the package.
 */
export function admitsOwnPrereleases(range) {
    if (typeof range !== 'string' || range.trim() === '') return false;
    const trimmed = range.trim();
    if (semver.validRange(trimmed) === null) return false;
    const min = semver.minVersion(trimmed);
    if (min === null) return false;
    // Semver admits a prerelease only when a comparator shares its major.minor.patch AND carries a
    // prerelease tag. For a floor-anchored range that comparator IS the minimum, so the range admits
    // prereleases of its own tuple exactly when its own minimum carries one.
    //
    // Do NOT "probe" instead with `satisfies(`${major}.${minor}.${patch}-0`, range)`. Numeric
    // prerelease identifiers sort BELOW alphanumeric ones, so `6.1.0-0` < `6.1.0-edge.6`: the probe
    // lands under the floor and the check reports `^6.1.0-edge.6` — the correct, Edge-admitting
    // range this repo now ships — as a violation. That version of this function was written, and
    // caught only by running it against the spec's own expectations before shipping.
    return min.prerelease.length > 0;
}

/** Exact `@memberjunction/*` entries in the pinning blocks of one manifest. */
export function findExactMJDeps(manifest, relPath) {
    const hits = [];
    for (const block of PINNING_BLOCKS) {
        for (const [dep, version] of Object.entries(manifest?.[block] ?? {})) {
            if (!dep.startsWith(MJ_SCOPE)) continue;
            if (isExactVersion(version)) hits.push({ file: relPath, block, dep, version: version.trim() });
        }
    }
    return hits;
}

/** `@memberjunction/*` peers whose range admits no prerelease of its own tuple. */
export function findNonPrereleasePeers(manifest, relPath) {
    const hits = [];
    for (const [peer, version] of Object.entries(manifest?.peerDependencies ?? {})) {
        if (!peer.startsWith(MJ_SCOPE)) continue;
        if (!admitsOwnPrereleases(version)) hits.push({ file: relPath, peer, version: String(version).trim() });
    }
    return hits;
}

/** Every `package.json` under `root/dir`, one directory deep, as repo-relative paths. */
function manifestsUnder(root, dir) {
    const base = join(root, dir);
    let entries;
    try {
        entries = readdirSync(base);
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
    const found = [];
    for (const entry of entries) {
        const manifest = join(base, entry, 'package.json');
        try {
            if (statSync(manifest).isFile()) found.push(`${dir}/${entry}/package.json`);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }
    }
    return found;
}

/** Runs both rules over `root`. Returns violation messages; empty means pass. */
export function runCheck(root) {
    const violations = [];
    for (const dir of SCANNED_DIRS) {
        for (const relPath of manifestsUnder(root, dir)) {
            const raw = readFileSync(join(root, relPath), 'utf8');
            let manifest;
            try {
                manifest = JSON.parse(raw);
            } catch (err) {
                throw new SyntaxError(`check-mj-version-ranges: ${relPath} is not valid JSON — ${err.message}`);
            }
            for (const hit of findExactMJDeps(manifest, relPath)) {
                violations.push(
                    `${hit.file}: ${hit.block}["${hit.dep}"] is the exact version "${hit.version}". ` +
                        `MJ is a workspace sibling, so an exact pin does not pick a version — it defeats ` +
                        `linking, and pnpm downloads a published copy whose own exact core dependency ` +
                        `forks the graph. Two copies of \`UserInfo\` compare nominally (it has private ` +
                        `fields), so the build fails with TS2322 "separate declarations of a private ` +
                        `property". Write a range: "^${hit.version}".`,
                );
            }
            for (const hit of findNonPrereleasePeers(manifest, relPath)) {
                violations.push(
                    `${hit.file}: peerDependencies["${hit.peer}"] is "${hit.version}", which admits no ` +
                        `prerelease of its own tuple. Semver accepts a prerelease only when a comparator ` +
                        `shares its exact major.minor.patch AND carries a prerelease tag, so every MJ Edge ` +
                        `host fails with ERESOLVE — 'mj app install' then reports an npm auth problem and ` +
                        `finalizes the app as Disabled (#211). Anchor the range at the tuple's first ` +
                        `prerelease, e.g. "^X.Y.Z-edge.0".`,
                );
            }
        }
    }
    return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const violations = runCheck(REPO_ROOT);
    if (violations.length > 0) {
        console.error('check-mj-version-ranges: FAILED\n');
        for (const v of violations) console.error(`  - ${v}\n`);
        process.exit(1);
    }
    console.log('check-mj-version-ranges: OK');
}
EOF
chmod +x scripts/check-mj-version-ranges.mjs
echo "gate written"
```

- [ ] **Step 4: Run the spec to verify it passes**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && node --test scripts/check-mj-version-ranges.spec.mjs 2>&1 | tail -12
```
Expected: all tests pass, `fail 0`. The final test (`this repository passes its own gate`) only passes because Tasks 1 and 3 landed.

- [ ] **Step 5: Prove the gate actually catches the original defect**

Temporarily reintroduce the exact pin, confirm the gate fails, then restore.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
cp packages/Server/package.json /tmp/server-pkg.bak
node -e "
const fs=require('fs');const f='packages/Server/package.json';
fs.writeFileSync(f, fs.readFileSync(f,'utf8').replace('\"@memberjunction/generic-database-provider\": \"^6.1.1\"','\"@memberjunction/generic-database-provider\": \"6.1.1\"'));
"
node scripts/check-mj-version-ranges.mjs; echo "EXIT WITH DEFECT=$? (expect 1)"
cp /tmp/server-pkg.bak packages/Server/package.json && rm /tmp/server-pkg.bak
node scripts/check-mj-version-ranges.mjs; echo "EXIT RESTORED=$? (expect 0)"
git status --short packages/Server/package.json
```
Expected: `EXIT WITH DEFECT=1`, `EXIT RESTORED=0`, and a clean `git status` for that file.

- [ ] **Step 6: Wire the npm scripts**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
node -e "
const fs=require('fs');
const raw=fs.readFileSync('package.json','utf8');
if(raw.includes('lint:mj-ranges')) throw new Error('already wired');
const next=raw.replace(
  '\"lint:peer-ranges\": \"node scripts/check-peer-ranges.mjs\",',
  '\"lint:peer-ranges\": \"node scripts/check-peer-ranges.mjs\",\n    \"lint:mj-ranges\": \"node scripts/check-mj-version-ranges.mjs\",\n    \"lint:mj-ranges:test\": \"node --test scripts/check-mj-version-ranges.spec.mjs\",'
);
if(next===raw) throw new Error('anchor not found');
fs.writeFileSync('package.json',next);
console.log('scripts wired');
"
npm run lint:mj-ranges && npm run lint:mj-ranges:test 2>&1 | tail -5
```
Expected: `check-mj-version-ranges: OK`, then the spec suite passing.

- [ ] **Step 7: Wire it into CI**

Add a step immediately after the existing `lint:peer-ranges` step in `.github/workflows/build.yml` (around line 237), matching that step's shape exactly.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
sed -n '230,240p' .github/workflows/build.yml
```

Read the surrounding `- name:` / `run:` shape, then insert the analogous step:

```yaml
      - name: MJ version-range hygiene (no exact MJ pins; peers admit Edge hosts)
        run: npm run lint:mj-ranges:test && npm run lint:mj-ranges
```

Verify the file still parses:
```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
node -e "
const fs=require('fs');const t=fs.readFileSync('.github/workflows/build.yml','utf8');
if(!t.includes('lint:mj-ranges:test && npm run lint:mj-ranges')) throw new Error('step not present');
console.log('CI step present');
" && git diff --stat .github/workflows/build.yml
```

- [ ] **Step 8: Commit**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
git add scripts/check-mj-version-ranges.mjs scripts/check-mj-version-ranges.spec.mjs package.json .github/workflows/build.yml
git commit -m "$(cat <<'EOF'
ci: gate the two MJ version-range mistakes this repo has shipped

Rule 1 refuses an exact `@memberjunction/*` in dependencies/devDependencies under
packages/. MJ is a workspace sibling, so an exact pin defeats linking rather than
picking a version, and the published copy it pulls forks the graph into two
`UserInfo` declarations that compare nominally.

Rule 2 refuses an MJ peer range that admits no prerelease of its own tuple — the
property that decides whether an Edge host can install at all.

Scoped to `@memberjunction/*` on purpose. Exact `@angular/*` devDependency anchors
are the documented model and are correct, because Angular is never a workspace
sibling: anchor what only ever comes from the registry, never what can be a
workspace sibling. `apps/` is unscanned for the same reason.

A separate gate rather than an extension of check-peer-ranges.mjs, whose docblock
scopes it to peerDependencies deliberately.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Full verification

**Files:** none modified.

**Interfaces:**
- Consumes: the three commits from Tasks 1, 3, 4.
- Produces: a go/no-go for Task 6.

- [ ] **Step 1: Build every package**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && pnpm run build 2>&1 | tail -20; echo "BUILD EXIT=$?"
```
Expected: `BUILD EXIT=0`. If `packages/Entities/dist` is missing, that is the cause of downstream failures — build it first.

- [ ] **Step 2: Run the full test suite**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && pnpm test 2>&1 | tail -25; echo "TEST EXIT=$?"
```
Expected: `TEST EXIT=0`.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/packages/Server && pnpm run typecheck; echo "TYPECHECK EXIT=$?"
```
Expected: `TYPECHECK EXIT=0`.

- [ ] **Step 4: Run every lint gate the PR will face**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
for g in peer-ranges mj-ranges migrations distribution ui generated codegen-append release-pushes; do
  printf '%-22s ' "$g"
  if npm run --silent "lint:$g" >/dev/null 2>&1; then echo PASS; else echo "FAIL  <-- investigate"; fi
done
```
Expected: all PASS. Investigate any FAIL before proceeding; do not push a branch that fails a required check.

- [ ] **Step 5: Confirm the working tree contains only intended changes**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && git status --short && git log --oneline -3
```
Expected: a clean working tree and the three new commits.

---

### Task 6: Branch, push, and open the draft PR

**Files:** none modified.

**Interfaces:**
- Consumes: Task 5's green verdict.
- Produces: a draft PR into `next`.

- [ ] **Step 1: Confirm the branch and its commits**

The branch was created in Task 0. The repo's default branch is `next`, not `main`.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && git branch --show-current && git log --oneline next..HEAD
```
Expected: `fix/mj-version-range-hygiene`, and four commits (plan doc, Task 1, Task 3, Task 4).

- [ ] **Step 2: Push it tracking its own remote**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
git push -u origin fix/mj-version-range-hygiene
git branch -vv | grep fix/mj-version-range-hygiene
```
Expected: the branch tracks `origin/fix/mj-version-range-hygiene` — **not** `origin/next` and **not** `origin/main`.

- [ ] **Step 3: Open the draft PR**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
gh pr create --draft --base next --title "fix: MJ version-range hygiene — unfork the dev graph, admit Edge hosts, gate both" --body "$(cat <<'EOF'
Three independent commits, each separately revertible.

## 1 — Caret the two MJ devDeps that forked the dependency graph

`@memberjunction/cli` (root) and `@memberjunction/generic-database-provider`
(`packages/Server`) were pinned to exact `6.1.1`. MJ is a workspace sibling, so an exact
pin does not pick a version — it defeats linking. pnpm downloads the published copy, which
hard-depends on exact `@memberjunction/core@6.1.1`, and a second core lands beside the
linked one.

`UserInfo` carries eight `private` fields, so TypeScript compares it **nominally** and the
two copies are mutually unassignable. Reproduced by repointing only that one symlink:

| | errors |
|---|---|
| baseline | **0** |
| second core present | **9 × TS2322** |

Every one reads *"Types have separate declarations of a private property `_TenantContext`"*,
across the seven files that import `UserCache`.

It never reproduced locally because `mj dev workspace` overrides every `@memberjunction/*`
to `workspace:*` and displaces exact pins (MJ#3795). A green local typecheck is not evidence
about these pins.

## 2 — Admit Edge and 6.1.0 hosts

`^6.1.1` admits no prerelease build: semver accepts a prerelease only when a comparator
shares its exact `major.minor.patch` **and** carries a prerelease tag. The real published
package on a `6.1.0-edge.6` host:

```
npm error code ERESOLVE
npm error Found: @memberjunction/core@6.1.0-edge.6
npm error peer @memberjunction/core@"^6.1.1" from @mj-biz-apps/forms-server@0.11.0
```

`mj app install` reports that as *"npm install failed — log in to npm"* and finalizes the
app **Disabled** (#211).

All 40 `@memberjunction/*` peers move to `^6.1.0-edge.6`; `mjVersionRange` to
`>=6.1.0 <7.0.0`. Measured, **one** core copy in every passing case:

| host | before | after |
|---|---|---|
| `6.1.2` stable | OK | OK |
| `6.1.0` stable | blocked | **OK** |
| `6.1.0-edge.6` | **blocked** | **OK** |

A strict widening — no host that worked stops working. Plain `6.1.0` hosts were excluded
too, which nobody had noticed. The era boundary holds: MJ's installer coerces a prerelease
host to its base tuple, so `7.0.0-edge.0` still fails `<7.0.0`.

### How this was verified, and its limit

Every `@memberjunction/*` symbol these packages import — **74** across all sources — was checked against the real `6.1.0-edge.6` typings. **None is absent.**

That is an API-surface check, **not a compile**, and the difference matters. The stronger check was attempted and discarded as invalid: repointing one package's MJ symlinks while the sibling forms `dist/` still embed MJ-source types manufactures a two-copy split, so it reports artifacts — 23 of them, every one traceable to that split — rather than real incompatibilities. Making it valid requires rebuilding forms against edge.6 inside the shared dev workspace, whose host was live at the time; breaking a running session was not a price worth paying for a verification step.

So the floor rests on API-surface evidence. `edge.6` is the anchor for two reasons: it is the version actually checked, and `bizapps-common` — a hard dependency of this app — already requires `>=6.1.0-edge.6`, so no host below it can run the chain regardless.

## 3 — Gate both against recurrence

New `scripts/check-mj-version-ranges.mjs`: no exact `@memberjunction/*` in
`dependencies`/`devDependencies` under `packages/`, and every MJ peer must admit its own
tuple's prereleases.

Scoped to `@memberjunction/*` deliberately. Exact `@angular/*` `devDependencies` anchors are
the documented model and are **correct**, because Angular is never a workspace sibling. The
distinction: *anchor a package that only ever comes from the registry; never anchor one that
can be a workspace sibling.*

### Known limit, not fixed here

No npm range covers a **next** tuple's Edge build (`6.2.0-edge.1`) — not `*`, not `>=6.0.0`;
`peerDependenciesMeta.optional` doesn't help either (optional covers absence, not mismatch).
That is npm's constraint. The durable fix is in MJ: `mj app install` runs a bare `npm install`
(`OpenApp/Engine/src/install/package-manager.ts:298`), and passing `--legacy-peer-deps` for
prerelease hosts makes `mjVersionRange` — which already handles eras correctly via
`CoerceToBaseVersion` — the authoritative gate. Verified: the real `forms-server@0.11.0` then
installs on a `6.1.0-edge.6` host with exactly one `@memberjunction/core`. Filed separately.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Confirm the PR is a draft against `next`**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && gh pr view --json number,isDraft,baseRefName,title
```
Expected: `isDraft: true`, `baseRefName: "next"`.

---

### Task 7: Post-push verification and smoke test

**Files:** none modified unless a defect is found.

**Interfaces:**
- Consumes: the open draft PR.
- Produces: green CI, or fixes pushed to the same branch.

- [ ] **Step 1: Watch CI**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && gh pr checks --watch --interval 30 2>&1 | tail -20
```
Expected: the seven required checks report. A job skipped by an `if:` counts as passing; a check stuck on *"Expected — Waiting for status"* means a workflow was skipped by `on: paths:` and never created a check run.

- [ ] **Step 2: Smoke-test the install contract — the thing this PR actually changes**

Pack **all five** packages and install them onto a stable, an old-stable, and an Edge host.

All five are required, and their inter-dependencies must be overridden to the local tarballs. `forms-server` depends on `forms-entities`, `forms-actions`, `forms-ng` and `forms-core-entities-server` at exact `0.11.0`, and those are **published with the old `^6.1.1` peers**. Packing only `packages/Server` would pull the four siblings from the registry, and the Edge host would ERESOLVE on *their* stale peers — a false failure that has nothing to do with this change.

```bash
S=/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/157a2345-45cb-4e13-aaea-6b8f951ba47e/scratchpad/smoke
rm -rf "$S" && mkdir -p "$S"
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
for p in Entities CoreEntitiesServer Actions Angular Server; do
  (cd "packages/$p" && npm pack --pack-destination "$S" >/dev/null 2>&1) || echo "PACK FAILED: $p"
done
ls "$S"/*.tgz | sed 's/^/  packed: /'

# Map every @mj-biz-apps dep to its local tarball so nothing resolves from the registry.
node -e '
const fs=require("fs"),path=require("path");
const S=process.argv[1];
const map={};
for (const f of fs.readdirSync(S).filter(f=>f.endsWith(".tgz"))) {
  const m=f.match(/^mj-biz-apps-(.+)-\d+\.\d+\.\d+\.tgz$/);
  if(m) map["@mj-biz-apps/"+m[1]]="file:"+path.join(S,f);
}
fs.writeFileSync(path.join(S,"overrides.json"), JSON.stringify(map,null,2));
console.log("  overrides:", Object.keys(map).join(", "));
' "$S"

for HOSTV in 6.1.2 6.1.0 6.1.0-edge.6; do
  rm -rf "$S/h"; mkdir -p "$S/h"
  node -e '
  const fs=require("fs");
  const [S,HOSTV]=process.argv.slice(1);
  const ov=JSON.parse(fs.readFileSync(S+"/overrides.json","utf8"));
  fs.writeFileSync(S+"/h/package.json", JSON.stringify({
    name:"h", version:"1.0.0", private:true,
    dependencies:{"@memberjunction/core":HOSTV,"@memberjunction/global":HOSTV},
    overrides: ov
  },null,2));
  ' "$S" "$HOSTV"
  (cd "$S/h" && npm install --ignore-scripts --no-audit --no-fund >/dev/null 2>&1)
  out=$(cd "$S/h" && npm install "$S"/mj-biz-apps-forms-server-*.tgz --ignore-scripts --no-audit --no-fund 2>&1)
  n=$(find "$S/h/node_modules" -path '*@memberjunction/core/package.json' 2>/dev/null | wc -l | tr -d ' ')
  if echo "$out" | grep -q ERESOLVE; then
    printf "  %-14s BLOCKED\n" "$HOSTV"
    echo "$out" | grep -E "Found:|peer @memberjunction" | head -3 | sed 's/^/      /'
  else
    printf "  %-14s OK (core copies: %s)\n" "$HOSTV" "$n"
  fi
done
```
Expected: all three **OK** with **1** core copy each. Any `BLOCKED` is a real defect — read the `peer` line it prints, fix it on this branch, and push.

- [ ] **Step 3: Smoke-test the dev-workspace claim**

Confirm the caret pins still link to MJ source and nothing pulled a registry shadow copy.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
readlink packages/Server/node_modules/@memberjunction/generic-database-provider
readlink node_modules/@memberjunction/cli
find /Users/sohamdesai/Projects/mj-dev/node_modules/.pnpm -maxdepth 1 -name '@memberjunction+core@*' 2>/dev/null | head
```
Expected: both readlinks resolve into `MJ/packages/...`, and the `find` prints nothing (no published core in the virtual store).

- [ ] **Step 4: Fix anything the smoke test surfaced**

For each defect: reproduce it, write the failing check, fix, re-run Steps 2–3, then commit to the same branch and push. Do not open a second PR.

- [ ] **Step 5: Report**

Summarize: CI status per check, smoke-test table, anything fixed, and the PR URL.

---

## Self-Review

**Spec coverage.** Finding 1 → Task 1 + Task 4 Rule 1. Finding 2 → Task 3, gated by Task 2's verification, + Task 4 Rule 2. Finding 3 → Task 4. Verification → Tasks 5 and 7. The MJ installer fix is explicitly out of scope and recorded in the PR body instead.

**Placeholder scan.** No TBDs. Every code step carries runnable content; every expectation states the exact string or exit code to look for.

**Type consistency.** The six exports named in Task 4's *Interfaces* block (`SCANNED_DIRS`, `isExactVersion`, `admitsOwnPrereleases`, `findExactMJDeps`, `findNonPrereleasePeers`, `runCheck`) are the six the spec imports and the six the gate defines. `runCheck` returns `string[]` in all three places.

**Known risk.** Task 4 Step 6 and Step 7 anchor on existing text in `package.json` and `build.yml`; both verify the substitution happened and throw if the anchor is missing, so a silent no-op is impossible.
