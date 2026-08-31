#!/usr/bin/env node
/**
 * Release readiness — is every record declared under `metadata/` named by the shipped chain?
 *
 * Collects every `primaryKey.ID` UUID under `metadata/` and checks each appears somewhere in
 * `migrations/*.sql`. No database, no dependencies, runs on any checkout.
 *
 * WHY THIS EXISTS, AND WHAT IT REPLACED. The gate here used to compare `metadata/` against a
 * checked-in hash manifest and infer "the seed ships this record" from the PRESENCE OF A MANIFEST
 * KEY. That inference is a silent pass in one direction: regenerate the manifest without
 * regenerating the seed and the gate goes green while the record ships nowhere. bizapps-sales hit
 * exactly that. This checks the property the manifest was a proxy for, and it needs nothing kept
 * up to date — it reproduces the "what is still pending" list from the repo itself.
 *
 * NOT A PR GATE, deliberately. PRs contribute declarative JSON only; the build engineer generates
 * ONE consolidated `Metadata_Sync` per release from a clean database (MJ/metadata/CLAUDE.md §1b
 * and §10). Wiring this into every PR would re-impose the per-PR cadence MJ rules out. It runs at
 * the release boundary — `publish.yml`, before anything is published or tagged — and by hand when
 * you cut the seed. `lint:distribution` does not invoke it.
 *
 *   npm run check:release-seed
 *
 * WHAT A PASS DOES AND DOES NOT MEAN. A pass says every declared record id is named by the shipped
 * SQL — it does not say the seed CREATES it correctly, because a match counts wherever the id
 * appears, including inside a comment. That is deliberate: the id can ship as `'<guid>'`, `N'<guid>'`
 * or either case, and a second SQL parser to distinguish those shapes would be more to own than the
 * question is worth, while a false negative here costs a build engineer an hour chasing a record
 * that did ship. The proof that a seed installs correctly is a clean install from migrations, which
 * needs a database and is release work.
 *
 * `migrations/` only, NOT `migrations-pg/`. A record present only in the PostgreSQL twin has not
 * shipped on the chain every host runs; counting it would report coverage this app does not have.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const METADATA = join(ROOT, 'metadata');
const MIGRATIONS = join(ROOT, 'migrations');

/**
 * `sql_logging/` is the raw `mj sync push` output that BECOMES a seed and `.backups/` is what a
 * push writes before updating a record in place. Both are gitignored, both are left on disk by a
 * local run, and neither is source — reading either would report ids that were never declared.
 */
const IGNORED_DIRS = new Set(['sql_logging', '.backups']);

/** `.mj-sync.json` is directory configuration (entity name, order, pull filters) — never a record. */
const NOT_A_RECORD_FILE = '.mj-sync.json';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Every record file under `metadata/`, repo-relative and sorted, excluding generator output. */
function collectRecordFiles(dir, acc = []) {
    for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (!IGNORED_DIRS.has(name)) collectRecordFiles(full, acc);
        } else if (name.endsWith('.json') && name !== NOT_A_RECORD_FILE) {
            acc.push(full);
        }
    }
    return acc;
}

/**
 * Every `primaryKey.ID` in a parsed record file, at any nesting depth.
 *
 * Recursive rather than array-of-records because `@parent` nesting puts child records inside a
 * `relatedEntities` block, and a child that ships nowhere is as invisible to a host as a root one.
 */
function collectIds(node, acc) {
    if (Array.isArray(node)) {
        for (const item of node) collectIds(item, acc);
        return;
    }
    if (!node || typeof node !== 'object') return;
    const pk = node.primaryKey;
    if (pk && typeof pk.ID === 'string' && UUID.test(pk.ID.trim())) acc.push(pk.ID.trim());
    for (const value of Object.values(node)) collectIds(value, acc);
}

/** The shipped SQL as one lower-cased haystack. Guards first: an empty haystack fails everything. */
function readShippedSql() {
    if (!existsSync(MIGRATIONS)) throw new Error(`No migrations/ directory at ${MIGRATIONS} — this is not a repo root.`);
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    if (files.length === 0) throw new Error('migrations/ contains no .sql files, so every record would be reported missing.');
    return files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n').toLowerCase();
}

if (!existsSync(METADATA)) {
    console.error(`❌ No metadata/ directory at ${METADATA} — this is not a repo root.`);
    process.exit(1);
}

const sql = readShippedSql();
const problems = [];
let filesRead = 0;
let idsChecked = 0;

for (const file of collectRecordFiles(METADATA)) {
    const shown = relative(ROOT, file).split(sep).join('/');
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        // Never skipped. A record file this script cannot read is a record it cannot vouch for,
        // and silently passing over it is the failure mode this check exists to end.
        problems.push(`${shown} could not be parsed, so its records were not checked: ${error.message}`);
        continue;
    }
    filesRead++;
    const ids = [];
    collectIds(parsed, ids);
    const unique = [...new Set(ids)];
    idsChecked += unique.length;
    const unseen = unique.filter((id) => !sql.includes(id.toLowerCase()));
    if (unseen.length > 0) {
        problems.push(`${shown}: ${unseen.length} of ${unique.length} declared IDs appear in NO migration — e.g. ${unseen[0]}`);
    }
}

/**
 * A probe that measures nothing must not report success. CHECK 1 was retired for passing while
 * asserting something false; a run that collected no ids at all — a moved directory, a renamed
 * `primaryKey` shape, a walk that matched nothing — is the same defect wearing this script's name.
 */
if (idsChecked === 0) {
    console.error(
        `❌ Release seed coverage measured NOTHING: ${filesRead} record file(s) under metadata/ declared no ` +
            'primaryKey UUID. Either the metadata layout changed under this script or the walk is broken. ' +
            'A check that examines nothing is not a check that passed.',
    );
    process.exit(1);
}

if (problems.length > 0) {
    console.error('\n❌ Release seed coverage failed — metadata declared here reaches no host:\n');
    for (const problem of problems) console.error(`  • ${problem}`);
    console.error(
        '\nGenerate the release `Metadata_Sync` migration (migrations/README.md) and re-run. This is the ' +
            'consolidated seed for the release, not a per-PR one.\n',
    );
    process.exit(1);
}

console.log(
    `✅ Release seed coverage passed — all ${idsChecked} primaryKey UUIDs across ${filesRead} metadata record ` +
        'file(s) appear in migrations/.',
);
