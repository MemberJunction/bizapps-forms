#!/usr/bin/env node
/**
 * Distribution gate — can a stranger install this app and get a working one?
 *
 * Both failures this catches were live in the repo when it was written, and both were invisible
 * from inside: everything built, every test passed, and the app worked perfectly on the machine
 * that had run `mj sync push` by hand. See plans/DISTRIBUTION_SEED_PLAN.md.
 *
 * CHECK 1 — THE METADATA SEED EXISTS AND IS CURRENT.
 *   `mj-app.json`'s `metadata.directory` is documentation: MJ's manifest schema says the install
 *   engine NEVER reads it, and seeding happens exclusively through `migrations/`. So metadata that
 *   has not been pushed into a `*Metadata_Sync*.sql` migration ships nowhere. MJ Forms went nine
 *   months and ~56 records without one.
 *
 *   Currency is checked against a manifest of content hashes rather than by diffing git: a hash
 *   manifest answers the question that actually matters ("is the shipped seed current with the
 *   metadata?") rather than a proxy ("did both change in the same pull request?"), and it works on
 *   any checkout, including the shallow clones CI hands you.
 *
 *   Regenerate both together:  npm run seed:manifest   (after regenerating the seed migration)
 *
 * CHECK 2 — NO UNRESOLVABLE PLACEHOLDERS IN SHIPPED SQL.
 *   `mj migrate` builds Skyway's placeholder map from THIS repo's mj.config.cjs, but
 *   `mj app install` builds it from the HOST's (MJCLI's open-app-context.ts ->
 *   openApps.migrationPlaceholders). Only `${flyway:defaultSchema}` and `${mjSchema}` are supplied
 *   by the install engine itself. Skyway deliberately leaves an unknown `${...}` UNTOUCHED rather
 *   than failing, so a third placeholder does not error — it survives as a literal string into
 *   whatever SQL contained it. `${commonSchema}` did exactly that in two migrations, silently
 *   disabling the bizapps-common exclusion in five CodeGen sweeps.
 *
 * Read-only. No --fix. Exits non-zero on any violation. Node stdlib only, so it runs in CI
 * without an install step.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

/**
 * The only placeholders `mj app install` resolves. `flyway:defaultSchema` is the app schema and
 * `mjSchema` the core schema; everything else is the host's to define, and the host has never
 * heard of us.
 */
const INSTALL_SUPPLIED_PLACEHOLDERS = new Set(['flyway:defaultSchema', 'mjSchema']);

/**
 * `metadata/sql_logging/` holds the raw generator output that BECOMES the seed migration. It is
 * gitignored, but a local run leaves it on disk and it must not be hashed as if it were source.
 */
const METADATA_IGNORED_DIRS = new Set(['sql_logging']);

/**
 * `README.md` under `metadata/` is documentation for humans, never record content, so editing one
 * cannot make the shipped seed stale. Record bodies that DO live in files are pulled in by
 * `@file:` references (`metadata/templates/templates/*.md`) and are still hashed — only the name
 * `README.md` is exempt. Without this the gate fires on a documentation edit and teaches people
 * that regenerating the manifest is how you make it quiet, which is precisely the habit that would
 * let a real drift through.
 */
const METADATA_IGNORED_FILES = new Set(['README.md']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every file under `metadata/`, repo-relative and sorted, excluding generator output. */
function collectMetadataFiles(dir, acc = []) {
    for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (!METADATA_IGNORED_DIRS.has(name)) collectMetadataFiles(full, acc);
        } else if (!METADATA_IGNORED_FILES.has(name)) {
            acc.push(full);
        }
    }
    return acc;
}

/**
 * Hash of a metadata file's MEANING, not its bytes.
 *
 * `mj sync push` writes a `sync` block (lastModified + checksum) back into each record after a
 * push. Those are bookkeeping about the push, not content — hashing them would make the gate fire
 * on the very push that regenerated the seed, which trains people to regenerate the manifest to
 * silence it. Stripped for JSON; other files (template .md bodies) hash whole.
 */
function contentHash(file) {
    const raw = readFileSync(file, 'utf-8');
    if (!file.endsWith('.json')) return createHash('sha256').update(raw).digest('hex');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        // Unparseable JSON is a real problem, but not this gate's problem to diagnose — hash the
        // bytes so it still registers as a change rather than being silently skipped.
        return createHash('sha256').update(raw).digest('hex');
    }
    const strip = (node) => {
        if (Array.isArray(node)) return node.map(strip);
        if (node && typeof node === 'object') {
            return Object.fromEntries(
                Object.entries(node)
                    .filter(([k]) => k !== 'sync')
                    .map(([k, v]) => [k, strip(v)]),
            );
        }
        return node;
    };
    return createHash('sha256').update(JSON.stringify(strip(parsed))).digest('hex');
}

export function buildManifest(repoRoot = REPO_ROOT) {
    const files = {};
    for (const file of collectMetadataFiles(join(repoRoot, 'metadata'))) {
        files[relative(repoRoot, file)] = contentHash(file);
    }
    return { generatedFrom: 'metadata/', files };
}

// ---------------------------------------------------------------------------
// CHECK 1 — the seed migration exists and matches the metadata it was generated from
// ---------------------------------------------------------------------------

function checkSeedMigration(repoRoot, violations) {
    const MIGRATIONS_DIR = join(repoRoot, 'migrations');
    const MANIFEST_PATH = join(MIGRATIONS_DIR, 'metadata-seed.manifest.json');
    const seeds = readdirSync(MIGRATIONS_DIR).filter((f) => /Metadata_Sync.*\.sql$/i.test(f));
    if (seeds.length === 0) {
        violations.push(
            'No `*Metadata_Sync*.sql` migration in migrations/. Everything under metadata/ ships ' +
                'NOWHERE: MJ never reads mj-app.json\'s metadata.directory at install. Generate one with ' +
                '`mj sync push --dir metadata` against a database whose Forms metadata is empty.',
        );
        return;
    }

    if (!existsSync(MANIFEST_PATH)) {
        violations.push(
            `Seed migration(s) present (${seeds.join(', ')}) but ${relative(repoRoot, MANIFEST_PATH)} is ` +
                'missing, so nothing can tell whether they are current. Run `npm run seed:manifest`.',
        );
        return;
    }

    const recorded = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')).files ?? {};
    const current = buildManifest(repoRoot).files;

    for (const [file, hash] of Object.entries(current)) {
        if (!(file in recorded)) {
            violations.push(`${file} is new metadata that no seed migration ships. Regenerate the seed, then \`npm run seed:manifest\`.`);
        } else if (recorded[file] !== hash) {
            violations.push(`${file} changed since the seed migration was generated, so the change ships nowhere. Regenerate the seed, then \`npm run seed:manifest\`.`);
        }
    }
    for (const file of Object.keys(recorded)) {
        if (!(file in current)) {
            violations.push(`${file} was deleted but the seed migration still creates its records. Regenerate the seed, then \`npm run seed:manifest\`.`);
        }
    }
}

// ---------------------------------------------------------------------------
// CHECK 2 — shipped SQL uses only placeholders the install engine supplies
// ---------------------------------------------------------------------------

function checkPlaceholders(repoRoot, violations) {
    const dirs = [join(repoRoot, 'migrations'), join(repoRoot, 'migrations-teardown')];
    for (const dir of dirs) {
        if (!existsSync(dir)) continue;
        // Teardown scripts get an even smaller map — MJ substitutes ONLY ${mjSchema} there, with a
        // literal string split, no Skyway involved.
        const allowed = dir.endsWith('migrations-teardown') ? new Set(['mjSchema']) : INSTALL_SUPPLIED_PLACEHOLDERS;
        for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
            const sql = readFileSync(join(dir, file), 'utf-8');
            const seen = new Set();
            for (const match of sql.matchAll(/\$\{([^}]+)\}/g)) {
                const name = match[1];
                if (!allowed.has(name) && !seen.has(name)) {
                    seen.add(name);
                    violations.push(
                        `${relative(repoRoot, join(dir, file))} uses \${${name}}, which \`mj app install\` does not ` +
                            `supply (it resolves only ${[...allowed].map((p) => '${' + p + '}').join(' and ')}). Skyway leaves ` +
                            'unknown placeholders untouched, so this would ship as a literal string. Use a literal schema name instead.',
                    );
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Entry point. Skipped when imported (by seed:manifest, which reuses buildManifest).
// ---------------------------------------------------------------------------

/** Runs both checks against a repo root and returns the violations found. */
export function runChecks(repoRoot = REPO_ROOT) {
    const violations = [];
    checkSeedMigration(repoRoot, violations);
    checkPlaceholders(repoRoot, violations);
    return violations;
}

if (process.argv[1] && process.argv[1].endsWith('check-distribution-seed.mjs')) {
    const violations = runChecks();

    if (violations.length > 0) {
        console.error('\n❌ Distribution gate failed — this app would not install correctly on someone else\'s database:\n');
        for (const v of violations) console.error(`  • ${v}`);
        console.error('');
        process.exit(1);
    }
    console.log('✅ Distribution gate passed — metadata seed is present and current; shipped SQL uses only install-supplied placeholders.');
}
