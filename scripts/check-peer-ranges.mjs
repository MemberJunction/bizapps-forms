#!/usr/bin/env node
/**
 * Refuse an exact version in any package's `peerDependencies`.
 *
 * A peer range is a compatibility CLAIM — "this package works against anything in here". An exact
 * peer claims the package works against one patch release and no other, and npm enforces that
 * claim against the host's installed tree. `@mj-biz-apps/forms-ng` declared `"@angular/cdk":
 * "21.1.3"`, so `mj app install` on a stock MJ 6.1.0-edge.6 host — which ships `@angular/cdk`
 * 21.2.14, a version line that moves independently of `@angular/core` — died with ERESOLVE, and
 * the CLI finalized the app as `Disabled` while telling the operator to fix their npm auth and
 * `.npmrc`. Neither was involved. See #211.
 *
 * It shipped in 0.5.0 through 0.10.0 because nothing here reads a peer range. A unit test cannot
 * reach this defect: it is a string in a manifest that only the host's resolver ever evaluates,
 * and the repo's own pnpm workspace never evaluates it at all (no `importers:` block records
 * `peerDependencies`, so the lockfile is blind to it too). This gate is the only place the claim
 * gets read before a host reads it.
 *
 * Scope is `peerDependencies` and nothing else, deliberately. Exact `dependencies` in `apps/*` and
 * exact `@angular/*` anchors in `devDependencies` are the documented model (`CLAUDE.md` → Angular
 * pinning model); a gate that read those blocks would fail this repo on its first run.
 *
 * Plain Node, stdlib only, matching `check-release-pushes.mjs` and `check-migration-order.mjs`: a
 * gate that guards the distribution must run in CI without installing anything.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Where publishable manifests live. `packages/*` is what npm receives; `apps/*` is scanned too so
 * a peer block added there is never unguarded, even though today those manifests declare none.
 */
export const SCANNED_DIRS = Object.freeze(['packages', 'apps']);

/**
 * Exact peers that are correct, each with the reason it is correct.
 *
 * An entry is matched on package, peer AND version. Matching the version is the point: if the
 * upstream value these track ever moves and we follow it, the exception expires and has to be
 * re-argued here rather than silently inherited by a value nobody checked.
 */
export const ALLOWED_EXACT_PEERS = Object.freeze([
    Object.freeze({
        package: '@mj-biz-apps/forms-server',
        peer: 'type-graphql',
        version: '2.0.0-beta.3',
        reason:
            "@memberjunction/server declares type-graphql as an EXACT direct dependency at this same " +
            'version, so every host that has MJ installed has exactly this build and the peer is always ' +
            'satisfiable — the opposite of the @angular/cdk case, where the host chooses the version. A ' +
            'range here would be the lie instead: type-graphql 2.x is a prerelease line whose betas and ' +
            'rcs break each other, and forms-server has only ever been built against beta.3. This tracks ' +
            "MJ's pin; when MJ moves it, move it here and update this entry.",
    }),
]);

/**
 * True when `spec` names one concrete version rather than a set of them.
 *
 * Everything npm accepts as a range — `^`, `~`, comparators, `||`, hyphen ranges, x-ranges, `*`,
 * `workspace:`, a tag, a URL — is a claim about a set and is therefore fine. Only a bare semver,
 * optionally written `=1.2.3` or with a leading `v` the way a git tag is (`v1.2.3`, or both:
 * `=v1.2.3`), pins the host to a single build — npm normalises the `v` away, so it is the same
 * pin written like a tag. Prerelease and build metadata are part of a concrete version
 * (`2.0.0-beta.3` is exactly one release), so they match.
 */
export function isExactVersion(spec) {
    if (typeof spec !== 'string') {
        return false;
    }
    return /^=?v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(spec.trim());
}

/** True when this package/peer/version triple is a documented, still-current exception. */
function isAllowed(packageName, peer, version) {
    return ALLOWED_EXACT_PEERS.some(
        (a) => a.package === packageName && a.peer === peer && a.version === version.trim(),
    );
}

/**
 * The documented allowance for this package/peer pair, regardless of version — used to tell an
 * expired allowance (the pin moved, but ALLOWED_EXACT_PEERS was not updated to follow it) apart
 * from an ordinary, never-allowlisted violation. Undefined when no allowance names this pair.
 */
function allowanceFor(packageName, peer) {
    return ALLOWED_EXACT_PEERS.find((a) => a.package === packageName && a.peer === peer);
}

/**
 * Every exact, non-allowlisted entry in one manifest's `peerDependencies`.
 *
 * @param {{name?: string, peerDependencies?: Record<string, string>}} manifest parsed package.json
 * @param {string} relPath path reported in the violation, relative to the repo root
 */
export function findExactPeers(manifest, relPath) {
    if (manifest === null || typeof manifest !== 'object') {
        throw new TypeError(`check-peer-ranges: ${relPath} did not parse to an object`);
    }
    const peers = manifest.peerDependencies;
    if (peers === undefined) {
        return [];
    }
    const packageName = manifest.name ?? relPath;
    const found = [];
    for (const [peer, version] of Object.entries(peers)) {
        if (isExactVersion(version) && !isAllowed(packageName, peer, version)) {
            found.push({ package: packageName, peer, version: version.trim(), file: relPath });
        }
    }
    return found;
}

/** Immediate subdirectory manifests of `root/dir`; [] when the directory is absent. */
function manifestsUnder(root, dir) {
    let entries;
    try {
        entries = readdirSync(join(root, dir), { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return [];
        }
        throw err;
    }
    const found = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const relPath = `${dir}/${entry.name}/package.json`;
        try {
            statSync(join(root, relPath));
        } catch (err) {
            if (err.code === 'ENOENT') {
                continue;
            }
            throw err;
        }
        found.push(relPath);
    }
    return found.sort();
}

/**
 * Scan the repo. Returns violations (exact peers) and stale allowances (documented exceptions that
 * no longer match anything on disk). Both fail the gate — a dead exception reads as a considered
 * decision long after the thing it excused is gone.
 */
export function runCheck(root) {
    const violations = [];
    const seenAllowances = new Set();

    for (const dir of SCANNED_DIRS) {
        for (const relPath of manifestsUnder(root, dir)) {
            const raw = readFileSync(join(root, relPath), 'utf8');
            let manifest;
            try {
                manifest = JSON.parse(raw);
            } catch (err) {
                throw new SyntaxError(`check-peer-ranges: ${relPath} is not valid JSON — ${err.message}`);
            }
            for (const hit of findExactPeers(manifest, relPath)) {
                const expired = allowanceFor(hit.package, hit.peer);
                if (expired) {
                    // This pair has a documented exception, but at a version that no longer matches —
                    // the allowance's own reasoning is that a RANGE here would be the lie (see
                    // ALLOWED_EXACT_PEERS), so "write a range" is exactly the wrong advice. The pin
                    // moved and the exception was not re-argued to follow it.
                    violations.push(
                        `${hit.file}: peerDependencies["${hit.peer}"] is "${hit.version}", but ` +
                            `ALLOWED_EXACT_PEERS documents an exception for ${hit.package} -> ${hit.peer} ` +
                            `only at "${expired.version}". A range would be the lie that exception exists ` +
                            `to avoid — the documented exception has simply expired, and must be re-argued ` +
                            `in ALLOWED_EXACT_PEERS at "${hit.version}" before this can go green again.`,
                    );
                } else {
                    violations.push(
                        `${hit.file}: peerDependencies["${hit.peer}"] is the exact version "${hit.version}". ` +
                            `A peer range is a compatibility claim, and an exact one claims ${hit.package} works ` +
                            `against that single build and no other — so npm fails with ERESOLVE on every host ` +
                            `whose ${hit.peer} differs, 'mj app install' finalizes the app as Disabled, and the ` +
                            `operator is told to fix their npm auth (see #211). Write a range: "^${hit.version}".`,
                    );
                }
            }
            const peers = manifest.peerDependencies ?? {};
            for (const allowance of ALLOWED_EXACT_PEERS) {
                if (manifest.name === allowance.package && peers[allowance.peer]?.trim() === allowance.version) {
                    seenAllowances.add(allowance);
                }
            }
        }
    }

    const stale = ALLOWED_EXACT_PEERS.filter((a) => !seenAllowances.has(a)).map(
        (a) =>
            `ALLOWED_EXACT_PEERS allows ${a.package} -> ${a.peer}@${a.version}, which no longer appears in ` +
            `any manifest. Delete the entry, or correct its version if the pin moved.`,
    );

    return { violations, stale };
}

/** CLI entry point. */
function main() {
    const { violations, stale } = runCheck(REPO_ROOT);
    if (violations.length > 0 || stale.length > 0) {
        console.error('Peer-range gate FAILED:\n');
        for (const v of violations) {
            console.error(`  ✗ ${v}\n`);
        }
        for (const s of stale) {
            console.error(`  ✗ ${s}\n`);
        }
        console.error(`${violations.length} exact peer(s), ${stale.length} stale allowance(s).`);
        process.exit(1);
    }
    console.log(`Peer-range gate passed (${SCANNED_DIRS.join(', ')}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
