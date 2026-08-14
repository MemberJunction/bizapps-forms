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
 * CHECK 3 — A POST-HARDENING SEED NEVER RE-GRANTS THE ANONYMOUS ROLE UNFILTERED ACCESS.
 *   `V202608131600__v0.10.x__Respondent_Grant_Hardening.sql` attaches row-level-security filters to
 *   the four grants the `Form Respondent` role keeps, and THROWs if any Forms grant is left
 *   unfiltered — but only at its own point in the chain. A regenerated `*Metadata_Sync*.sql`
 *   necessarily carries a LATER timestamp, so on a fresh install its permission rows are written
 *   after the hardening ran and simply win. One shared anonymous principal backs every respondent,
 *   and MJ's `UserExemptFromRowLevelSecurity` returns TRUE on the FIRST unfiltered row it finds, so
 *   that regeneration re-opens an instance-wide read and a write that bypasses the submit pipeline
 *   entirely — silently, on a stranger's database. That is issue #41.
 *
 *   WATERSHED, NOT WHOLE HISTORY. The shipped `V202608081700` seed legitimately carries unfiltered
 *   creates (its own header says so) because `V202608131600` corrects them afterward. Only seeds
 *   sorting AFTER that stamp land with the last word, so only those must carry filtered grants.
 *   Scanning every seed would fail today's healthy tree, which is how a gate gets disabled.
 *
 *   BOTH CALL SHAPES, AND OMISSION AS WELL AS `_Clear`. The regeneration path migrations/README.md
 *   recommends — a delta pushed against a migrated-to-head database — emits
 *   `spUpdateEntityPermission` for grants that already exist, so a check reading only
 *   `spCreateEntityPermission` would miss exactly the shape the documented workflow produces. And an
 *   argument bound to a DECLAREd-but-never-SET variable is NULL at run time just as surely as
 *   `@CreateRLSFilterID_Clear = 1` is, so absence counts too.
 *
 *   Text-level, like CHECK 2, and deliberately scoped to the machine-generated seeds: hand-authored
 *   migrations are human-reviewed and `V202608131600` already asserts their end state, while
 *   widening a text gate to all SQL invites the false positives that teach people to silence it.
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
 * The one machine-generated file class: `mj sync push`'s output, moved into migrations/. CHECK 1
 * asks whether one exists and is current; CHECK 3 asks what the post-hardening ones grant. Matches
 * the `.pg.sql` twins too, so the first PostgreSQL seed is born covered.
 */
const METADATA_SEED_FILE = /Metadata_Sync.*\.sql$/i;

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
    const seeds = readdirSync(MIGRATIONS_DIR).filter((f) => METADATA_SEED_FILE.test(f));
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
// CHECK 3 — post-hardening seeds carry filtered Form Respondent grants, or none
// ---------------------------------------------------------------------------

/**
 * The point in migration order after which a seed's permission state is FINAL, because nothing
 * corrects it afterward: the stamp of `V202608131600__v0.10.x__Respondent_Grant_Hardening.sql`.
 * Seeds at or before it are exempt — including the shipped `V202608081700`, whose unfiltered creates
 * are real and are what that migration exists to fix.
 */
const RESPONDENT_HARDENING_WATERSHED = 202608131600;

/**
 * How a seed may name the anonymous role: by name, which is how the post-#39 seed binds it so a host
 * where a sibling app minted the row first still resolves, or by the id Forms itself mints.
 */
const RESPONDENT_ROLE_NAME = 'Form Respondent';
const RESPONDENT_ROLE_ID = 'A18E13FC-B2C1-4E77-A3D7-EE775BDE098C';

/**
 * What this app grants the role, and which filter record each grant must point at — the same four
 * facts `V202608131600`'s `@Contract` table declares (lines 178-181), carrying the entity ids the
 * 0.8.0 seed binds. Both halves are re-derived from their sources by the spec, so an id that drifts
 * fails loudly instead of quietly matching nothing.
 *
 * A grant on an entity NOT listed here is still checked: rules 1-3 below apply to every grant this
 * role holds, because tomorrow's new grant must be born filtered too. The table adds only rule 4 —
 * a guarded pair pointed at some OTHER filter record, which is non-NULL and still wrong.
 */
export const RESPONDENT_GUARDED_GRANTS = [
    { entityName: 'MJ_BizApps_Forms: Form Responses',        entityId: '63600739-7165-4BDC-B7D7-19A1B1951DFA', capability: 'Create', filterId: '7F0E0001-A1B2-4C3D-8E4F-000000000001' },
    { entityName: 'MJ_BizApps_Forms: Form Response Answers', entityId: 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', capability: 'Create', filterId: '7F0E0001-A1B2-4C3D-8E4F-000000000001' },
    { entityName: 'MJ_BizApps_Forms: Form Distributions',    entityId: '1FC60BDA-25B8-473B-ACE5-1238670D3535', capability: 'Read',   filterId: '7F0E0002-A1B2-4C3D-8E4F-000000000002' },
    { entityName: 'MJ_BizApps_Forms: Form Versions',         entityId: '622E2804-5B6D-4B43-92A4-294ADC538F50', capability: 'Read',   filterId: '7F0E0003-A1B2-4C3D-8E4F-000000000003' },
];

/**
 * The two capabilities MJ can row-level-filter for this role, and the two it must never hold.
 *
 * The call's `@Type` argument (`N'Allow'` in every shipped record) is deliberately NOT consulted:
 * `V202608131600`'s own postconditions test `CanCreate = 1 AND CreateRLSFilterID IS NULL` without
 * reference to it, and this gate asserts the same invariant that migration does. Reading `@Type`
 * here would let a seed pass the gate and still trip THROW 51112 on the host.
 */
const FILTERABLE_CAPABILITIES = ['Create', 'Read'];
const WRITER_CAPABILITIES = ['Update', 'Delete'];

/** `SET @A = @B` chains are not the generator's shape, but a cap is cheaper than trusting that. */
const MAX_VARIABLE_CHASE = 8;

const PERMISSION_CALL = /\bEXEC(?:UTE)?\s+(?:(?:\[[^\]]*\]|[\w${}]+)\s*\.\s*)?\[?(sp(?:Create|Update)EntityPermission)\]?/gi;
const UUID_LITERAL = /^N?'([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})'$/;

/**
 * A copy of `sql` whose comment bodies and string-literal contents are blanked to spaces, with every
 * byte offset preserved. Structure is then matched on the mask while values are read from the
 * original at the same offsets — so a `--` inside a string cannot truncate a statement, and English
 * prose cannot masquerade as SQL.
 *
 * That second hazard is the reason this exists rather than a bare regex: `V202608081700`'s header
 * explains its own `@CreateRLSFilterID_Clear = 1` calls in prose, and `V202608131600`'s names the
 * role two dozen times. A text gate that reads comments would fire on the very files that document
 * the problem, and the existing checks' comments warn precisely against training that habit.
 */
function maskLiteralsAndComments(sql) {
    const out = [...sql];
    const blank = (from, to) => {
        for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
    };
    let i = 0;
    while (i < sql.length) {
        const pair = sql.slice(i, i + 2);
        if (pair === '--') {
            const newline = sql.indexOf('\n', i);
            const end = newline === -1 ? sql.length : newline;
            blank(i, end);
            i = end;
        } else if (pair === '/*') {
            // T-SQL block comments nest, so depth is tracked rather than searching for the first `*/`.
            let depth = 1;
            let j = i + 2;
            while (j < sql.length && depth > 0) {
                if (sql.slice(j, j + 2) === '/*') { depth++; j += 2; }
                else if (sql.slice(j, j + 2) === '*/') { depth--; j += 2; }
                else j++;
            }
            blank(i, j);
            i = j;
        } else if (sql[i] === "'") {
            let j = i + 1;
            while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
            blank(i + 1, j); // the quotes stay, so a literal is still recognisable as one
            i = Math.min(j + 1, sql.length);
        } else {
            i++;
        }
    }
    return out.join('');
}

/** `[start, end)` ranges between `GO` batch separators — the boundary the generator writes on. */
function splitBatches(masked) {
    const ranges = [];
    let start = 0;
    for (const match of masked.matchAll(/^[ \t]*GO[ \t]*\r?$/gim)) {
        ranges.push([start, match.index]);
        start = match.index + match[0].length;
    }
    ranges.push([start, masked.length]);
    return ranges;
}

/** Scans from `from` to the first character at paren depth 0 for which `stop` holds, else `to`. */
function scanToDepthZero(masked, from, to, stop) {
    let depth = 0;
    for (let i = from; i < to; i++) {
        const char = masked[i];
        if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (depth === 0 && stop(i, char)) return i;
    }
    return to;
}

/**
 * `@variable` → assigned text, for one batch. The generator suffixes every variable with a per-record
 * hash, so a batch map never collides even when a file puts several records in one batch.
 */
function collectAssignments(masked, sql, [from, to]) {
    const endsAssignment = /(?:\b(?:SET|EXEC|EXECUTE|DECLARE)\b|;)/iy;
    const assignments = new Map();
    for (const match of masked.slice(from, to).matchAll(/\bSET\s+@(\w+)\s*=\s*/gi)) {
        const valueStart = from + match.index + match[0].length;
        const valueEnd = scanToDepthZero(masked, valueStart, to, (i) => {
            endsAssignment.lastIndex = i;
            return endsAssignment.test(masked);
        });
        assignments.set(match[1].toLowerCase(), sql.slice(valueStart, valueEnd).trim());
    }
    return assignments;
}

/**
 * The text an argument carries at run time, or `null` for NULL. A variable that was DECLAREd and
 * never SET resolves to `null` — that is how the 0.8.0 seed expresses an absent filter alongside its
 * `_Clear` flag, and it is a violation on its own. An unresolvable chain also yields `null`, which
 * fails closed for a granted capability rather than passing on ignorance.
 */
function resolveArgumentValue(raw, assignments) {
    let value = raw.trim();
    for (let hop = 0; hop < MAX_VARIABLE_CHASE && /^@\w+$/.test(value); hop++) {
        const assigned = assignments.get(value.slice(1).toLowerCase());
        if (assigned === undefined) return null;
        value = assigned;
    }
    if (/^@\w+$/.test(value) || /^NULL$/i.test(value)) return null;
    return value;
}

/** `@Name = value` pairs of one call, resolved through the batch's assignments. */
function parseCallArguments(masked, sql, from, to, assignments) {
    const args = new Map();
    let start = from;
    const commit = (end) => {
        const pair = sql.slice(start, end).match(/^\s*@(\w+)\s*=\s*([\s\S]*?)\s*$/);
        if (pair) args.set(pair[1].toLowerCase(), resolveArgumentValue(pair[2], assignments));
        start = end + 1;
    };
    for (let i = from, depth = 0; i < to; i++) {
        const char = masked[i];
        if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (char === ',' && depth === 0) commit(i);
    }
    commit(to);
    return args;
}

/** The UUID a value states literally, uppercased — or null if it states something else. */
function literalUuid(value) {
    const match = value === null ? null : value.match(UUID_LITERAL);
    return match ? match[1].toUpperCase() : null;
}

/**
 * Whose grant a call creates, read from its `@RoleID` argument: the anonymous role (by Forms' id or
 * by the name subselect the post-#39 seed emits), some other role, or — `unknown` — a binding this
 * parser cannot model.
 *
 * `unknown` is reported rather than skipped, and that is deliberate. "I cannot tell whose grant this
 * is" is not the same fact as "this grant is fine", and a gate that conflates them goes quiet
 * exactly when the generator changes shape under it, which is the silent-reopening this check exists
 * to prevent. Everything here is one MJ release away from being written differently.
 */
function classifyRole(present, value) {
    if (!present) return 'absent';
    if (value === null) return 'unknown';
    const id = literalUuid(value);
    if (id) return id === RESPONDENT_ROLE_ID ? 'respondent' : 'other';
    if (value.includes(`'${RESPONDENT_ROLE_NAME}'`)) return 'respondent';
    return /\bName\s*=\s*N?'/i.test(value) ? 'other' : 'unknown';
}

/** How a call names its entity: a literal id, a by-name subselect, or neither. */
function readEntityIdentity(value) {
    const byName = value === null ? null : value.match(/\bName\s*=\s*N?'([^']*)'/i);
    return { entityId: literalUuid(value), entityName: byName ? byName[1] : null };
}

/**
 * Every `spCreate/spUpdateEntityPermission` call in `sql` that binds the anonymous respondent role,
 * with its arguments already resolved through the per-record variables the generator emits. Pure
 * read; exported because the spec pins the guarded table against the shipped seed through it, using
 * the same parser the gate uses rather than a second one that could agree by coincidence.
 */
export function findRespondentGrants(sql) {
    const masked = maskLiteralsAndComments(sql);
    const grants = [];
    for (const [from, to] of splitBatches(masked)) {
        const assignments = collectAssignments(masked, sql, [from, to]);
        for (const call of masked.slice(from, to).matchAll(PERMISSION_CALL)) {
            const argsFrom = from + call.index + call[0].length;
            const argsTo = scanToDepthZero(masked, argsFrom, to, (_i, char) => char === ';');
            const args = parseCallArguments(masked, sql, argsFrom, argsTo, assignments);
            const role = classifyRole(args.has('roleid'), args.get('roleid') ?? null);
            if (role === 'other') continue;
            grants.push({
                procedure: call[1],
                role,
                ...readEntityIdentity(args.get('entityid') ?? null),
                granted: Object.fromEntries(
                    [...FILTERABLE_CAPABILITIES, ...WRITER_CAPABILITIES].map((c) => [c, args.get(`can${c.toLowerCase()}`) === '1']),
                ),
                filters: Object.fromEntries(
                    FILTERABLE_CAPABILITIES.map((c) => [c, {
                        present: args.has(`${c.toLowerCase()}rlsfilterid`),
                        cleared: args.get(`${c.toLowerCase()}rlsfilterid_clear`) === '1',
                        value: args.get(`${c.toLowerCase()}rlsfilterid`) ?? null,
                    }]),
                ),
            });
        }
    }
    return grants;
}

/** Why this grant's filter slot would be NULL on the host, or null if it would be filled. */
function describeNullFilter(filter, capability) {
    if (filter.cleared) return `\`@${capability}RLSFilterID_Clear = 1\` explicitly nulls it`;
    if (!filter.present) return `the \`@${capability}RLSFilterID\` parameter is absent, so it is never set`;
    if (filter.value === null) return `\`@${capability}RLSFilterID\` resolves to NULL (a variable DECLAREd but never SET)`;
    return null;
}

function describeEntity(grant) {
    return grant.entityName ?? grant.entityId ?? 'an entity this call does not name literally';
}

/** The rules of D2, applied to one parsed grant. Pure; `file` is only used to write the message. */
function respondentGrantViolations(grant, file) {
    const found = [];
    const entity = describeEntity(grant);
    const call = `\`${grant.procedure}\``;

    if (grant.role !== 'respondent') {
        return [
            `${file} contains a ${call} for ${entity} whose \`@RoleID\` this gate cannot resolve — ` +
                `${grant.role === 'absent' ? 'the parameter is absent' : 'it resolves to NULL or to an expression the gate does not model'}. ` +
                'It therefore cannot tell whether the call re-grants the anonymous Form Respondent role, and passing on ' +
                'that ignorance is how this check would go quiet the moment the generator changes shape. Bind `@RoleID` ' +
                'to a literal role id or to a `WHERE Name = N\'...\'` subselect, which is what `mj sync push` emits.',
        ];
    }

    for (const capability of WRITER_CAPABILITIES) {
        if (!grant.granted[capability]) continue;
        found.push(
            `${file} grants the anonymous Form Respondent role Can${capability} on ${entity} (${call}). That role is a ` +
                'gate, never a writer (#39): its one deliberate write is a deny-filtered CanCreate, and there is no ' +
                'legitimate update or delete for a principal every respondent on the instance shares. Remove the ' +
                'capability — a filter does not make it acceptable.',
        );
    }

    for (const capability of FILTERABLE_CAPABILITIES) {
        if (!grant.granted[capability]) continue;
        const filter = grant.filters[capability];
        const guarded = RESPONDENT_GUARDED_GRANTS.find(
            (g) => g.capability === capability && (g.entityId === grant.entityId || g.entityName === grant.entityName),
        );
        const nullReason = describeNullFilter(filter, capability);
        if (nullReason) {
            found.push(
                `${file} grants Form Respondent Can${capability} on ${entity} with no row-level-security filter (${call}) — ` +
                    `${nullReason}. This seed sorts after V202608131600, so its state is what a fresh install ends up ` +
                    'with, and MJ exempts the role from row-level security on the FIRST unfiltered row it finds: an ' +
                    'unfiltered read is instance-wide and an unfiltered create bypasses the whole submit pipeline. ' +
                    `Point the grant at ${guarded ? guarded.filterId : 'a scoped filter record'} instead of clearing it.`,
            );
            continue;
        }
        const stated = literalUuid(filter.value);
        if (guarded && stated && stated !== guarded.filterId) {
            found.push(
                `${file} points Form Respondent's Can${capability} grant on ${entity} at filter ${stated} (${call}), but this app ` +
                    `defines that grant against ${guarded.filterId} (V202608131600:178-181). A grant pointed at another ` +
                    "app's filter record reverts to NULL when that app uninstalls and MJ's nullable FK clears the slot — " +
                    'which is the exploitable state #39 closed.',
            );
        }
    }
    return found;
}

/**
 * A seed's position relative to the watershed, read from the `V<YYYYMMDDHHMM>` the filename carries —
 * the same ordering Skyway applies. A seed whose name carries no stamp cannot be ordered at all, so
 * it is checked rather than skipped: an unorderable file is the one most likely to land last.
 */
function landsAfterHardening(file) {
    const stamp = file.match(/^[VB](\d{12})__/);
    return stamp === null || Number(stamp[1]) > RESPONDENT_HARDENING_WATERSHED;
}

function checkRespondentGrants(repoRoot, violations) {
    for (const dirName of ['migrations', 'migrations-pg']) {
        const dir = join(repoRoot, dirName);
        if (!existsSync(dir)) continue;
        for (const file of readdirSync(dir).filter((f) => METADATA_SEED_FILE.test(f) && landsAfterHardening(f)).sort()) {
            const sql = readFileSync(join(dir, file), 'utf-8');
            for (const grant of findRespondentGrants(sql)) {
                violations.push(...respondentGrantViolations(grant, relative(repoRoot, join(dir, file))));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Entry point. Skipped when imported (by seed:manifest, which reuses buildManifest).
// ---------------------------------------------------------------------------

/** Runs every check against a repo root and returns the violations found. */
export function runChecks(repoRoot = REPO_ROOT) {
    const violations = [];
    checkSeedMigration(repoRoot, violations);
    checkPlaceholders(repoRoot, violations);
    checkRespondentGrants(repoRoot, violations);
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
    console.log(
        '✅ Distribution gate passed — metadata seed is present and current; shipped SQL uses only install-supplied ' +
            'placeholders; no post-hardening seed re-grants the Form Respondent role unfiltered access.',
    );
}
