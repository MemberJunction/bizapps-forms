#!/usr/bin/env node
/**
 * Refuse the two `@memberjunction/*` version-range mistakes that this repo has actually shipped.
 *
 * RULE 1 — no EXACT `@memberjunction/*` in `dependencies` / `devDependencies`, under `packages/`
 * and in the repo-root manifest.
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
 * exact `dependencies` by documented policy. The repo-root manifest IS scanned: it is not under
 * `apps/`, and one of the two pins this gate exists for (`devDependencies["@memberjunction/cli"]`)
 * lived there — a gate that only reads `packages/` misses half the defect it claims to catch.
 *
 * Nothing else catches this. The shared `mj dev workspace` root overrides every `@memberjunction/*`
 * to `workspace:*` and displaces exact pins (MJ#3795), so the defect is invisible locally and a
 * green typecheck is not evidence.
 *
 * RULE 2 — every `@memberjunction/*` peer range must admit its own tuple's prereleases, AND that
 * tuple must be the version line this app actually targets.
 *
 * Semver accepts a prerelease only when a comparator shares its exact major.minor.patch AND carries
 * a prerelease tag. So `^6.1.1` admits no `-edge.N` build at all, and
 * `@mj-biz-apps/forms-server@0.11.0` failed on a 6.1.0-edge.6 host with ERESOLVE — which
 * `mj app install` reports as "npm install failed — log in to npm" before finalizing the app
 * Disabled (#211). `^6.1.0-edge.6` admits the whole 6.1.0 Edge line and every stable 6.x.
 *
 * "Admits its own tuple's prereleases" alone is not enough: `^6.0.0-edge.1` admits its own tuple
 * (6.0.0) but refuses `6.1.0-edge.6`, which is the floor this app's `mj-app.json` `mjVersionRange`
 * actually targets — the range would pass the check while blocking every current Edge host it
 * claims to support. Rule 2 therefore also requires the peer's floor tuple to equal the
 * `mjVersionRange` floor tuple, read from the repo-root `mj-app.json`.
 *
 * Known limit, deliberately not encoded: no npm range covers a NEXT tuple's Edge build such as
 * `6.2.0-edge.1` — not `*`, not `>=6.0.0`. That is npm's constraint, not something a gate can fix;
 * covering a new Edge line means re-revving both the peer ranges and `mjVersionRange` together.
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

/** The repo-root manifest, scanned directly by `runCheck` (Rule 1 only — see `SCANNED_DIRS`). */
const ROOT_MANIFEST_PATH = 'package.json';

/** Where `mjVersionRange` lives, read once per `runCheck` when Rule 2 needs its floor tuple. */
const MJ_APP_MANIFEST_PATH = 'mj-app.json';

/**
 * `packages/` is scanned one directory deep, for both rules. The repo-root `package.json` is
 * scanned too, but separately from this list — `runCheck` reads it directly, because it is one
 * file rather than a directory of packages, and only Rule 1 applies to it (an app root carries no
 * `peerDependencies` contract for Rule 2 to police).
 *
 * `apps/*` stays unscanned: it uses exact `dependencies` by documented policy — the same policy
 * that makes `apps/*`'s exact `@angular/*` anchors correct.
 *
 * The root's `pnpm.overrides` stay unscanned by BOTH rules, deliberately: pnpm honours
 * `overrides` only at the workspace root, and in the shared `mj dev workspace` this repo is NOT
 * that root, so those entries are inert here — they never influence what gets linked or
 * installed in this repo's own checkout. In CI (no MJ workspace to link against at all) they
 * merely pin a version and do nothing else. Flagging them would gate a no-op.
 */
export const SCANNED_DIRS = Object.freeze(['packages']);

/** Dependency blocks where an exact MJ pin defeats workspace linking. */
const PINNING_BLOCKS = Object.freeze(['dependencies', 'devDependencies']);

/** True when `spec` names one build rather than a range. */
export function isExactVersion(spec) {
    if (typeof spec !== 'string' || spec.trim() === '') return false;
    const trimmed = spec.trim();
    // A leading "=" ("=6.1.1") is npm/pnpm's explicit-exact syntax. semver.valid() does not strip
    // it and returns null for the raw string, which would let "=6.1.1" slip past this check even
    // though it defeats workspace linking identically to the bare form.
    const candidate = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
    // Not `/^\d/`: that only checks the FIRST character, so it misclassifies range forms that
    // merely start with a digit — `6.x` and `6.1.1 - 6.2.0` are both genuine ranges that would
    // still link to a workspace sibling, and flagging them as exact suggested the malformed fix
    // `^6.1.1 - 6.2.0`. `semver.valid()` returns non-null only for a single concrete version,
    // which is the actual property this function is named for.
    return semver.valid(candidate) !== null;
}

/**
 * True when `range` admits prerelease builds of its own base tuple — the property that decides
 * whether an Edge host can install the package. Does NOT check which tuple that is; Rule 2 layers
 * that requirement on top via `classifyPeerRange`.
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

/**
 * Classifies why an MJ peer range fails the Edge-host requirement, or returns `null` when it
 * passes. Order matters: an invalid range (`workspace:*`, `latest`, `^^6.1.1` — not a tag, not a
 * protocol, not parseable semver at all) must be reported as invalid, not as "admits no
 * prerelease" — that message sends someone hunting for a comparator problem that was never there.
 *
 * `floorTuple` is the app's own targeted version line (`major.minor.patch`, from `mj-app.json`'s
 * `mjVersionRange`). A range that admits its own tuple's prereleases still fails if that tuple is
 * not the one this app targets — see the Rule 2 doc comment above for why that case exists.
 */
export function classifyPeerRange(range, floorTuple) {
    if (typeof range !== 'string' || range.trim() === '' || semver.validRange(range.trim()) === null) {
        return 'invalid';
    }
    if (!admitsOwnPrereleases(range)) return 'no-prerelease';
    const min = semver.minVersion(range.trim());
    const tuple = `${min.major}.${min.minor}.${min.patch}`;
    return tuple === floorTuple ? null : 'wrong-line';
}

/** Exact `@memberjunction/*` entries in the pinning blocks of one manifest. */
export function findExactMJDeps(manifest, relPath) {
    const hits = [];
    for (const block of PINNING_BLOCKS) {
        for (const [dep, version] of Object.entries(manifest?.[block] ?? {})) {
            if (!dep.startsWith(MJ_SCOPE)) continue;
            if (!isExactVersion(version)) continue;
            const trimmed = String(version).trim();
            const bareVersion = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
            hits.push({ file: relPath, block, dep, version: trimmed, bareVersion });
        }
    }
    return hits;
}

/**
 * `@memberjunction/*` peers whose range fails the Edge-host requirement — see `classifyPeerRange`
 * for the three ways a range can fail and why the order between them matters. `floorTuple` is the
 * app's own `mjVersionRange` floor tuple, threaded in by the caller (`runCheck`).
 */
export function findNonPrereleasePeers(manifest, relPath, floorTuple) {
    const hits = [];
    for (const [peer, version] of Object.entries(manifest?.peerDependencies ?? {})) {
        if (!peer.startsWith(MJ_SCOPE)) continue;
        const reason = classifyPeerRange(version, floorTuple);
        if (reason !== null) hits.push({ file: relPath, peer, version: String(version).trim(), reason });
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

/**
 * Every manifest `runCheck` inspects, as repo-relative paths — the root manifest plus one level
 * under each of `SCANNED_DIRS`. Exported only so a spec can assert the real scan actually visited
 * manifests, not merely that it found nothing wrong in a scan of nothing.
 */
export function scannedManifests(root) {
    const paths = [ROOT_MANIFEST_PATH];
    for (const dir of SCANNED_DIRS) paths.push(...manifestsUnder(root, dir));
    return paths;
}

/** Reads and parses one manifest, throwing a descriptive `SyntaxError` on malformed JSON. */
function loadManifest(root, relPath) {
    const raw = readFileSync(join(root, relPath), 'utf8');
    try {
        return JSON.parse(raw);
    } catch (err) {
        throw new SyntaxError(`check-mj-version-ranges: ${relPath} is not valid JSON — ${err.message}`);
    }
}

/**
 * Reads `mjVersionRange`'s floor tuple (`major.minor.patch`) from the repo-root `mj-app.json` —
 * the version line MJ Forms actually targets, and what Rule 2 ties every MJ peer's prerelease
 * anchor to. Throws rather than silently skipping Rule 2's version-line check: a missing or
 * unparseable `mj-app.json` means the check cannot be evaluated, not that it passes.
 */
function mjVersionFloorTuple(root) {
    const manifestPath = join(root, MJ_APP_MANIFEST_PATH);
    let raw;
    try {
        raw = readFileSync(manifestPath, 'utf8');
    } catch (err) {
        throw new Error(
            `check-mj-version-ranges: cannot read ${MJ_APP_MANIFEST_PATH} to determine the ` +
                `mjVersionRange floor that Rule 2 anchors MJ peers to — ${err.message}`,
        );
    }
    let manifest;
    try {
        manifest = JSON.parse(raw);
    } catch (err) {
        throw new SyntaxError(`check-mj-version-ranges: ${MJ_APP_MANIFEST_PATH} is not valid JSON — ${err.message}`);
    }
    const range = manifest?.mjVersionRange;
    if (typeof range !== 'string' || range.trim() === '' || semver.validRange(range.trim()) === null) {
        throw new Error(
            `check-mj-version-ranges: ${MJ_APP_MANIFEST_PATH}'s "mjVersionRange" (${JSON.stringify(range)}) ` +
                `is not a usable semver range to anchor MJ peer ranges against.`,
        );
    }
    const min = semver.minVersion(range.trim());
    return `${min.major}.${min.minor}.${min.patch}`;
}

/** Renders one `findExactMJDeps` hit as a CLI violation message. */
function exactPinMessage(hit) {
    return (
        `${hit.file}: ${hit.block}["${hit.dep}"] is the exact version "${hit.version}". ` +
        `MJ is a workspace sibling, so an exact pin does not pick a version — it defeats ` +
        `linking, and pnpm downloads a published copy whose own exact core dependency ` +
        `forks the graph. Two copies of \`UserInfo\` compare nominally (it has private ` +
        `fields), so the build fails with TS2322 "separate declarations of a private ` +
        `property". Write a range: "^${hit.bareVersion}".`
    );
}

/** Renders one `findNonPrereleasePeers` hit as a CLI violation message, by failure reason. */
function peerRangeMessage(hit) {
    if (hit.reason === 'invalid') {
        return (
            `${hit.file}: peerDependencies["${hit.peer}"] is "${hit.version}", which is not a valid ` +
            `semver range at all — not a dist-tag like "latest", not a protocol like ` +
            `"workspace:*", not a well-formed range. npm/pnpm cannot resolve it against any host, ` +
            `Edge or stable, so it is not a "no prerelease admitted" defect, it is unresolvable as ` +
            `written. Write a real range, e.g. "^X.Y.Z-edge.0".`
        );
    }
    if (hit.reason === 'wrong-line') {
        return (
            `${hit.file}: peerDependencies["${hit.peer}"] is "${hit.version}", which admits ` +
            `prereleases of a different version line than this app targets. \`mj-app.json\`'s ` +
            `"mjVersionRange" floor is the line MJ Forms actually installs against, so an MJ peer's ` +
            `prerelease anchor must share that major.minor.patch — a range admitting an older (or ` +
            `newer) line's Edge builds still refuses the current one. Anchor at the target tuple's ` +
            `first prerelease, e.g. "^X.Y.Z-edge.0" where X.Y.Z matches mjVersionRange's floor.`
        );
    }
    return (
        `${hit.file}: peerDependencies["${hit.peer}"] is "${hit.version}", which admits no ` +
        `prerelease of its own tuple. Semver accepts a prerelease only when a comparator ` +
        `shares its exact major.minor.patch AND carries a prerelease tag, so every MJ Edge ` +
        `host fails with ERESOLVE — 'mj app install' then reports an npm auth problem and ` +
        `finalizes the app as Disabled (#211). Anchor the range at the tuple's first ` +
        `prerelease, e.g. "^X.Y.Z-edge.0".`
    );
}

/** Runs both rules over `root`. Returns violation messages; empty means pass. */
export function runCheck(root) {
    const violations = [];
    let floorTuple = null;

    for (const relPath of scannedManifests(root)) {
        const manifest = loadManifest(root, relPath);
        for (const hit of findExactMJDeps(manifest, relPath)) {
            violations.push(exactPinMessage(hit));
        }

        if (relPath === ROOT_MANIFEST_PATH) continue; // Rule 2 does not apply to the app root.

        const hasMJPeer = Object.keys(manifest?.peerDependencies ?? {}).some((peer) => peer.startsWith(MJ_SCOPE));
        if (!hasMJPeer) continue;
        if (floorTuple === null) floorTuple = mjVersionFloorTuple(root);
        for (const hit of findNonPrereleasePeers(manifest, relPath, floorTuple)) {
            violations.push(peerRangeMessage(hit));
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
