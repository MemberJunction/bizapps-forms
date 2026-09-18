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
 * Plain Node, stdlib only, matching `check-peer-ranges.mjs`, `check-distribution-seed.mjs`, and
 * `check-migration-order.mjs`: a gate that guards the distribution must run in CI without
 * installing anything. This file previously `import`ed the `semver` package, which is declared in
 * no manifest in this repo. It resolved on the author's machine only because that checkout sits
 * inside a larger shared pnpm workspace whose hoisted `node_modules` happens to contain it — CI
 * installs this repo standalone (and two sibling gates, `distribution-gate.yml` and
 * `migration-order-gate.yml`, run with zero `pnpm install` step at all), so `semver` does not
 * exist there and every CI run failed with `ERR_MODULE_NOT_FOUND`. Do not reintroduce a
 * third-party import here for the same reason. Both rules only ever need a version's numeric
 * tuple and its raw prerelease tag off the FLOOR of a range — never a full range parse, never
 * `satisfies()`, never an intersection or a comparison operator — which the small hand-rolled
 * parser below (`parseVersion` / `rangeFloor`) covers for every SINGLE-floor range.
 *
 * Its one documented limit: a `||` union has one floor per alternative, so "the floor" is not a
 * question it can answer. `rangeFloor` reads the first comparator, which for a union would judge
 * alternative one and silently ignore the rest — so `isUnionRange` intercepts them first and
 * `classifyPeerRange` refuses them by name. That is a real refusal of a possibly-valid range, and
 * it is deliberate: Rule 2's invariant (a peer's floor equals `mjVersionRange`'s floor) has no
 * single answer for a union, so there is nothing honest to compare.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Matches one concrete version: optional leading `v` (a git-tag spelling), three dot-separated
 * non-negative integers, an optional `-`-prefixed prerelease tag (captured raw, undissected —
 * this gate only ever needs to know THAT one is present, never to compare or order it), and an
 * optional `+`-prefixed build-metadata tag this gate ignores entirely (it carries no ordering or
 * admission semantics).
 */
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z][0-9A-Za-z.-]*))?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Parses a concrete version string into its numeric tuple and raw prerelease tag. Returns `null`
 * for anything that is not one well-formed version — a range, a dist-tag, a protocol, garbage.
 */
function parseVersion(spec) {
    if (typeof spec !== 'string') return null;
    const match = VERSION_RE.exec(spec.trim());
    if (match === null) return null;
    const [, major, minor, patch, prerelease] = match;
    return { major: Number(major), minor: Number(minor), patch: Number(patch), prerelease: prerelease ?? null };
}

/** The floor of any bare-wildcard range: admits everything, so it carries no prerelease. */
const WILDCARD_FLOOR = Object.freeze({ major: 0, minor: 0, patch: 0, prerelease: null });

/** True when `token` is one of a range's own bare-wildcard spellings: `*`, `x`, `X`, or empty. */
function isWildcardToken(token) {
    return token === '' || token === '*' || token.toLowerCase() === 'x';
}

/**
 * Strips a single leading range operator — longest match first, so `>=` is never mistaken for a
 * lone `>`. `^`, `~`, `>`, and `=` are the one-character operators this gate needs to see;
 * anything else (a bare version, or unparseable garbage) is returned unchanged for
 * `parseVersion` to accept or reject on its own.
 *
 * Applied to a whole trimmed range rather than to a pre-split token, because npm does not require
 * an operator to be glued to its version: `">= 6.1.0-edge.6"`, `"^ 6.1.1"` and `"~ 6.1.1"` are all
 * valid and node-semver normalizes the space away. See `rangeFloor` for why the ordering matters.
 */
function stripOperator(token) {
    if (token.startsWith('>=')) return token.slice(2);
    if (token.startsWith('^') || token.startsWith('~') || token.startsWith('>') || token.startsWith('=')) {
        return token.slice(1);
    }
    return token;
}

/**
 * Finds a range's FLOOR version — the version named by its first comparator — without attempting
 * general range parsing. That is all either rule ever asks: "does the floor carry a prerelease"
 * and "does the floor's tuple match `mjVersionRange`'s floor". A bare wildcard (`*`, `x`, `X`, or
 * the empty-after-trim string) is a VALID range whose floor is `0.0.0` with no prerelease — it
 * must not be reported as invalid alongside genuine garbage like `workspace:*` or `latest`.
 * Returns `null` when `range` is not a string, or its first token is neither a wildcard nor a
 * parseable version — the signal `isValidRange` and every caller below treats as "invalid".
 */
function rangeFloor(range) {
    if (typeof range !== 'string') return null;
    const trimmed = range.trim();
    if (isWildcardToken(trimmed)) return WILDCARD_FLOOR;
    // Strip the operator BEFORE tokenizing. Splitting first assumes an operator is always glued to
    // its version, which npm does not require: `">= 6.1.0-edge.6"` then made `">="` its own token
    // and `stripOperator` reduced it to `""`, so a valid range parsed as no floor at all. That
    // produced two false statements rather than a missed violation — a peer reported as "not a
    // valid semver range at all", and a spaced `mjVersionRange` aborting the whole gate with "is
    // not a usable semver range". The sibling gate `check-host-truth-codegen.mjs` already allows
    // the space (`>=\s*` in its own lower-bound regex).
    const afterOperator = stripOperator(trimmed).trimStart();
    return parseVersion(afterOperator.split(/\s+/)[0]);
}

/** True when `range` parses under this gate's rules — wildcard or floor-having; see `rangeFloor`. */
function isValidRange(range) {
    return rangeFloor(range) !== null;
}

/**
 * True when `range` is a `||` union of alternatives.
 *
 * `rangeFloor` reads ONE comparator, so for `A || B` it judges A and never looks at B. That is
 * wrong rather than merely incomplete: `^6.1.1 || ^6.1.0-edge.6` genuinely admits `6.1.0-edge.6`
 * (semver agrees), and judging the first alternative reported it as admitting no prerelease at
 * all — a false explanation attached to a correct refusal.
 *
 * Unions are refused BY NAME instead of parsed. Rule 2's invariant is that a peer's floor equals
 * `mjVersionRange`'s floor, which is a single-floor property: a union has one floor per
 * alternative and no single answer to give. Saying so is the honest classification; silently
 * judging alternative one is not.
 */
function isUnionRange(range) {
    return typeof range === 'string' && range.includes('||');
}

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
 * The root's `pnpm.overrides` stay unscanned by BOTH rules, deliberately — but NOT because those
 * entries are inert. They are not: this repo's own committed `pnpm-lock.yaml` records
 * `specifier: 6.1.1` for `@memberjunction/core` and `/global` in all five published-package
 * importers, displacing the `^6.1.0-edge.6` those manifests declare, and `packages/Angular` is the
 * control that proves the cause — its twelve other auto-installed MJ peers keep their declared
 * `^6.1.0-edge.6`, and only the two names in `pnpm.overrides` read `6.1.1`. `CLAUDE.md` says the
 * same thing from the other side: "the pin that actually binds is `pnpm.overrides` ... an override
 * outranks every manifest in the tree."
 *
 * The exclusion is right for two reasons that survive that correction:
 *
 *   1. RULE 1 cannot apply. The harm Rule 1 refuses is an exact pin DEFEATING workspace linking,
 *      and overrides bind only where this repo IS the workspace root — a standalone or CI install,
 *      which has no MJ sibling to link against in the first place. In the shared `mj dev
 *      workspace`, where linking is the whole issue, this repo is not the root and its overrides
 *      genuinely are ignored. So an exact MJ override can never produce the two-`UserInfo` fork.
 *   2. RULE 2 cannot apply. `pnpm.overrides` is not a published contract — a host installing
 *      `@mj-biz-apps/forms-*` honours its OWN root's overrides, never ours — so the #211
 *      ERESOLVE-on-an-Edge-host failure cannot originate in this block.
 *
 * Scanning them would therefore flag a line that cannot cause either defect. An earlier draft of
 * this comment said they "never influence what gets linked or installed in this repo's own
 * checkout", which the lockfile refutes; the plan this was written from had the narrower and
 * correct wording ("inert inside the shared dev workspace") and the docblock widened it.
 */
export const SCANNED_DIRS = Object.freeze(['packages']);

/**
 * Dependency blocks where a registry-bound MJ spec defeats workspace linking. All three INSTALL
 * the package — `optionalDependencies` differs only in tolerating a failed install, so an exact
 * MJ pin there forks the graph exactly as one in `dependencies` does. `peerDependencies` is
 * deliberately absent: it declares a requirement rather than installing anything, and Rule 2
 * governs it.
 */
const PINNING_BLOCKS = Object.freeze(['dependencies', 'devDependencies', 'optionalDependencies']);

/**
 * An `npm:` alias — `npm:@memberjunction/core@6.1.1`, or with a range inside it.
 *
 * Rule 1 asks "does this spec name one build?", and an alias defeats that question rather than
 * answering it: `semver.validRange('npm:@memberjunction/core@6.1.1')` is null, so the version is
 * invisible to an exactness test. It is reported as its own kind rather than folded into `exact`,
 * because the reason differs — the defect is the PROTOCOL, not the version inside it. `npm:`
 * names a registry package; the spelling that links a workspace sibling is `workspace:`. So an
 * alias to a RANGE is refused too, which an exactness test would have waved through.
 */
function isNpmAlias(spec) {
    return typeof spec === 'string' && spec.trim().startsWith('npm:');
}

/** True when `spec` names one build rather than a range. */
export function isExactVersion(spec) {
    if (typeof spec !== 'string' || spec.trim() === '') return false;
    const trimmed = spec.trim();
    // A leading "=" ("=6.1.1") is npm/pnpm's explicit-exact syntax. parseVersion() does not strip
    // it and returns null for the raw string, which would let "=6.1.1" slip past this check even
    // though it defeats workspace linking identically to the bare form.
    const candidate = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
    // Not `/^\d/`: that only checks the FIRST character, so it misclassifies range forms that
    // merely start with a digit — `6.x` and `6.1.1 - 6.2.0` are both genuine ranges that would
    // still link to a workspace sibling, and flagging them as exact suggested the malformed fix
    // `^6.1.1 - 6.2.0`. `parseVersion()` is anchored end-to-end and returns non-null only for a
    // single concrete version, which is the actual property this function is named for.
    return parseVersion(candidate) !== null;
}

/**
 * True when `range` admits prerelease builds of its own base tuple — the property that decides
 * whether an Edge host can install the package. Does NOT check which tuple that is; Rule 2 layers
 * that requirement on top via `classifyPeerRange`.
 */
export function admitsOwnPrereleases(range) {
    // Semver admits a prerelease only when a comparator shares its major.minor.patch AND carries a
    // prerelease tag. For a floor-anchored range that comparator IS the floor, so the range admits
    // prereleases of its own tuple exactly when its own floor carries one.
    //
    // Do NOT "probe" instead with something like `satisfies(`${major}.${minor}.${patch}-0`, range)`.
    // Numeric prerelease identifiers sort BELOW alphanumeric ones, so `6.1.0-0` < `6.1.0-edge.6`:
    // the probe lands under the floor and the check reports `^6.1.0-edge.6` — the correct,
    // Edge-admitting range this repo now ships — as a violation. That version of this function was
    // written, and caught only by running it against the spec's own expectations before shipping.
    const floor = rangeFloor(range);
    return floor !== null && floor.prerelease !== null;
}

/**
 * Classifies why an MJ peer range fails the Edge-host requirement, or returns `null` when it
 * passes. Order matters, and each reason is distinct because each sends a reader somewhere
 * different: a union is refused by name rather than judged on its first alternative; an invalid
 * range (`workspace:*`, `latest`, `^^6.1.1`) must not be reported as "admits no prerelease",
 * which sends someone hunting for a comparator problem that was never there.
 *
 * `floorSpec` is the app's own floor, WHOLE — `major.minor.patch` plus its prerelease tag, read
 * from `mj-app.json`'s `mjVersionRange`. Comparing only the tuple is not enough, and this gate
 * originally did exactly that: `^6.1.0-edge.9` shares the `6.1.0` tuple with a floor of
 * `6.1.0-edge.6`, so it passed — while a `6.1.0-edge.6` host, the one the manifest names as
 * supported, does not satisfy `^6.1.0-edge.9` and fails with the ERESOLVE this rule exists to
 * prevent. An anchor BELOW the floor is drift in the other direction: it advertises support the
 * app's own `mjVersionRange` refuses. The repo already had the precedent — `sync-app-version.mjs`
 * compares the full floor string, prerelease included.
 */
export function classifyPeerRange(range, floorSpec) {
    if (isUnionRange(range)) return 'union';
    if (!isValidRange(range)) return 'invalid';
    if (!admitsOwnPrereleases(range)) return 'no-prerelease';
    const floor = rangeFloor(range);
    const target = parseVersion(floorSpec);
    if (target === null) return 'wrong-line';
    const tuple = `${floor.major}.${floor.minor}.${floor.patch}`;
    const targetTuple = `${target.major}.${target.minor}.${target.patch}`;
    if (tuple !== targetTuple) return 'wrong-line';
    return floor.prerelease === target.prerelease ? null : 'wrong-anchor';
}

/**
 * `@memberjunction/*` entries in the pinning blocks of one manifest that cannot resolve to a
 * workspace sibling. Each hit carries a `kind` — `'exact'` for a version that names one build,
 * `'alias'` for an `npm:` spec — because the two need different messages and different fixes.
 */
export function findExactMJDeps(manifest, relPath) {
    const hits = [];
    for (const block of PINNING_BLOCKS) {
        for (const [dep, version] of Object.entries(manifest?.[block] ?? {})) {
            if (!dep.startsWith(MJ_SCOPE)) continue;
            const trimmed = String(version).trim();
            if (isNpmAlias(version)) {
                hits.push({ file: relPath, block, dep, version: trimmed, bareVersion: null, kind: 'alias' });
                continue;
            }
            if (!isExactVersion(version)) continue;
            const bareVersion = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
            hits.push({ file: relPath, block, dep, version: trimmed, bareVersion, kind: 'exact' });
        }
    }
    return hits;
}

/**
 * `@memberjunction/*` peers whose range fails the Edge-host requirement — see `classifyPeerRange`
 * for the ways a range can fail and why the order between them matters. `floorSpec` is the app's
 * own `mjVersionRange` floor, prerelease included, threaded in by the caller (`runCheck`).
 */
export function findNonPrereleasePeers(manifest, relPath, floorSpec) {
    const hits = [];
    for (const [peer, version] of Object.entries(manifest?.peerDependencies ?? {})) {
        if (!peer.startsWith(MJ_SCOPE)) continue;
        const reason = classifyPeerRange(version, floorSpec);
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
 * Reads `mjVersionRange`'s floor from the repo-root `mj-app.json` — WHOLE, prerelease tag
 * included, because Rule 2 ties every MJ peer's anchor to it exactly and a tuple-only comparison
 * lets `^6.1.0-edge.9` pass against a `6.1.0-edge.6` floor. Throws rather than silently skipping
 * Rule 2's check: a missing or unparseable `mj-app.json` means the check cannot be evaluated, not
 * that it passes.
 */
function mjVersionFloor(root) {
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
    const floor = rangeFloor(range);
    if (floor === null) {
        throw new Error(
            `check-mj-version-ranges: ${MJ_APP_MANIFEST_PATH}'s "mjVersionRange" (${JSON.stringify(range)}) ` +
                `is not a usable semver range to anchor MJ peer ranges against.`,
        );
    }
    return floor.prerelease === null
        ? `${floor.major}.${floor.minor}.${floor.patch}`
        : `${floor.major}.${floor.minor}.${floor.patch}-${floor.prerelease}`;
}

/** Renders one `findExactMJDeps` hit as a CLI violation message, by kind. */
function exactPinMessage(hit) {
    if (hit.kind === 'alias') {
        return (
            `${hit.file}: ${hit.block}["${hit.dep}"] is "${hit.version}", an \`npm:\` alias. ` +
            `That spec names a REGISTRY package explicitly — the spelling that resolves to a ` +
            `workspace sibling is \`workspace:\` — so it cannot link MJ source whatever version ` +
            `sits inside it, and a downloaded copy brings its own exact \`@memberjunction/core\` ` +
            `alongside the linked one. It is also not a semver range, so the exactness check ` +
            `below cannot see through it. Depend on the package directly: "^X.Y.Z-edge.N".`
        );
    }
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
    if (hit.reason === 'union') {
        return (
            `${hit.file}: peerDependencies["${hit.peer}"] is "${hit.version}", a \`||\` union. ` +
            `This gate reads one floor per range, and Rule 2's invariant — a peer's floor equals ` +
            `\`mj-app.json\`'s \`mjVersionRange\` floor — has no single answer for a range with one ` +
            `floor per alternative. The union is not necessarily wrong; it is unsupported here, ` +
            `which is a different statement from "malformed" or "admits no prerelease". Write a ` +
            `single floor-anchored range, e.g. "^X.Y.Z-edge.N" matching mjVersionRange's floor.`
        );
    }
    if (hit.reason === 'wrong-anchor') {
        return (
            `${hit.file}: peerDependencies["${hit.peer}"] is "${hit.version}", which is on the ` +
            `right version line but anchored at a different prerelease than this app's own floor. ` +
            `\`mj-app.json\`'s \`mjVersionRange\` floor is the host this app declares it supports, so ` +
            `an anchor ABOVE it refuses that very host (a 6.1.0-edge.6 host does not satisfy ` +
            `^6.1.0-edge.9, and fails with the ERESOLVE of #211), while an anchor BELOW it ` +
            `advertises support the app's own manifest refuses. Match the floor exactly.`
        );
    }
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
    let floorSpec = null;

    for (const relPath of scannedManifests(root)) {
        const manifest = loadManifest(root, relPath);
        for (const hit of findExactMJDeps(manifest, relPath)) {
            violations.push(exactPinMessage(hit));
        }

        if (relPath === ROOT_MANIFEST_PATH) continue; // Rule 2 does not apply to the app root.

        const hasMJPeer = Object.keys(manifest?.peerDependencies ?? {}).some((peer) => peer.startsWith(MJ_SCOPE));
        if (!hasMJPeer) continue;
        if (floorSpec === null) floorSpec = mjVersionFloor(root);
        for (const hit of findNonPrereleasePeers(manifest, relPath, floorSpec)) {
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
