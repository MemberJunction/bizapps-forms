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
    if (typeof spec !== 'string' || spec.trim() === '') return false;
    // Not `/^\d/`: that only checks the FIRST character, so it misclassifies range forms that
    // merely start with a digit — `6.x` and `6.1.1 - 6.2.0` are both genuine ranges that would
    // still link to a workspace sibling, and flagging them as exact suggested the malformed fix
    // `^6.1.1 - 6.2.0`. `semver.valid()` returns non-null only for a single concrete version,
    // which is the actual property this function is named for.
    return semver.valid(spec.trim()) !== null;
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
            // ENOENT: entry is a directory with no package.json — skip it, as intended.
            // ENOTDIR: entry itself is a plain file (stray README, .DS_Store, …), so
            // join(entry, 'package.json') stats through a file — also skip it, not a manifest.
            // Anything else is unexpected and must not be swallowed.
            if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
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
