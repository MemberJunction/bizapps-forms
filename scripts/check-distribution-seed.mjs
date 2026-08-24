#!/usr/bin/env node
/**
 * Distribution gate — can a stranger install this app and get a working one?
 *
 * The first two failures this catches were live in the repo when it was written, and both were
 * invisible from inside: everything built, every test passed, and the app worked perfectly on the
 * machine that had run `mj sync push` by hand. The third guards a regression that has not happened
 * yet and would look identical. See plans/DISTRIBUTION_SEED_PLAN.md.
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
 *   THE ONE HOLE THIS CANNOT CLOSE, stated plainly so nobody assumes otherwise. `Form Respondent`
 *   is a SHARED role a sibling app may mint first, in which case its id is not the one Forms mints.
 *   A seed that binds `@RoleID` to that foreign literal is invisible here: a literal UUID that is
 *   not ours is classified as another role and skipped, and it must be, because the seed's OTHER
 *   permission records bind Developer / Integration / UI by literal id too — treating an unknown
 *   literal as suspicious would fire on every one of them, every time. The defence is upstream, in
 *   migrations/README.md's recipe: the regenerated seed must resolve the role BY NAME, which is what
 *   #39 changed `V202608081700` to do and what makes a seed portable across hosts in the first
 *   place. Bind by name and this gate can see the grant; bind by a foreign id and nothing can.
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
 * asks whether one exists and is current; CHECK 3 asks what the post-hardening ones grant.
 *
 * The separator is optional because CHECK 3 made this name security-load-bearing: `MetadataSync`
 * is a spelling someone types, and under an exact `Metadata_Sync` a generated seed walked past the
 * gate on a naming slip alone. D7's boundary is unchanged — hand-authored migrations remain out of
 * scope; this only widens the spellings of the same machine-generated class.
 *
 * `.pg.sql` twins match as well, so `migrations-pg/` is scanned. Note what that does and does not
 * buy: the parser is T-SQL-only, so a real PostgreSQL seed is caught by the unparsed-call backstop
 * in `checkRespondentGrants` (loudly, as "I could not read this"), NOT by the grant rules.
 */
const METADATA_SEED_FILE = /Metadata[_ -]?Sync.*\.sql$/i;

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
 * reference to it. Reading `@Type` here would let a seed pass the gate and still trip THROW 51112 on
 * the host. (The gate is deliberately WIDER than that migration in two other respects — it rules on
 * any entity, and on Update/Delete — so this is one shared rule, not one shared scope.)
 */
const FILTERABLE_CAPABILITIES = ['Create', 'Read'];
const WRITER_CAPABILITIES = ['Update', 'Delete'];

/** `SET @A = @B` chains are not the generator's shape, but a cap is cheaper than trusting that. */
const MAX_VARIABLE_CHASE = 8;

const PERMISSION_CALL = /\bEXEC(?:UTE)?\s+(?:(?:\[[^\]]*\]|[\w${}]+)\s*\.\s*)?\[?(sp(?:Create|Update)EntityPermission)\]?/gi;
const UUID_LITERAL = /^N?'([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})'$/;

/**
 * Two offset-preserving copies of `sql`, both with comment bodies blanked to spaces:
 *
 *   `structure` — string-literal contents blanked too. Statement shape is matched on this, so a
 *                 `--` or a `;` inside a string cannot truncate a statement.
 *   `values`    — string literals intact. Argument text is sliced from this, so a resolved value
 *                 carries its real content and never a comment's.
 *
 * Neither is the raw source, and that is the point. Reading argument text off the raw source let a
 * comment ANYWHERE inside a value or an argument list corrupt it — `@CanCreate_x = 1 -- allowed`
 * resolved to the whole trailing sentence, and a comment above an argument made the argument
 * unparseable and therefore invisible. Both read as "not granted" and skipped every rule.
 *
 * Blanking comments at all is what keeps prose from masquerading as SQL: `V202608081700`'s header
 * explains its own `@CreateRLSFilterID_Clear = 1` calls in English and `V202608131600`'s names the
 * role two dozen times, so a gate that read comments would fire on the files documenting the
 * problem — and the existing checks' comments warn precisely against training that habit.
 */
function maskSql(sql) {
    // `split('')`, never `[...sql]`: the spread iterates CODE POINTS while every index below is a
    // UTF-16 CODE UNIT, so one astral character (an emoji in a generated description, say) slid the
    // mask out of alignment with the source and three blanked the record outright — a silent pass.
    const structure = sql.split('');
    const values = sql.split('');
    // Newlines survive blanking, so a mask is LINE-preserving as well as offset-preserving: printing
    // one beside the source lines up, which is how the three silent-pass bugs in this layer were
    // eventually seen. No reader below depends on it — a mutation pass over 600k inputs and every
    // shipped .sql file cannot distinguish keeping it from dropping it — so it is a debuggability
    // invariant, not behaviour. Do not "test" it; there is nothing to observe.
    const blankBoth = (from, to) => {
        for (let k = from; k < to; k++) {
            if (structure[k] === '\n') continue;
            structure[k] = ' ';
            values[k] = ' ';
        }
    };
    const blankStructureOnly = (from, to) => {
        for (let k = from; k < to; k++) if (structure[k] !== '\n') structure[k] = ' ';
    };
    let i = 0;
    while (i < sql.length) {
        const pair = sql.slice(i, i + 2);
        if (pair === '--') {
            const newline = sql.indexOf('\n', i);
            const end = newline === -1 ? sql.length : newline;
            blankBoth(i, end);
            i = end;
        } else if (pair === '/*') {
            // Ends at the FIRST `*/`, deliberately, even though T-SQL block comments nest. Tracking
            // depth is more faithful to the dialect and strictly worse here: a header reading
            // "per migrations/*.sql convention" opens a phantom nesting level the real `*/` cannot
            // close, so the scan runs to EOF and blanks every record below it — the gate then reads
            // an empty file and reports health. Stopping early can only leak comment text into the
            // structure pass, which fails loudly instead of silently.
            const close = sql.indexOf('*/', i + 2);
            const end = close === -1 ? sql.length : close + 2;
            blankBoth(i, end);
            i = end;
        } else if (sql[i] === "'") {
            let j = i + 1;
            while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
            blankStructureOnly(i + 1, j); // quotes stay, so offsets and token shape are preserved
            i = Math.min(j + 1, sql.length);
        } else {
            i++;
        }
    }
    return { structure: structure.join(''), values: values.join('') };
}

/**
 * `[start, end)` ranges between `GO` batch separators — the boundary the generator writes on.
 *
 * CRLF needs no handling here and must not grow any: ECMAScript counts CR as a LineTerminator, so
 * under `/m` the `$` already matches BEFORE the `\r` of a Windows line ending. The `\r?` this
 * pattern used to carry made it look like CRLF support a test could pin, and it is not: dropping it
 * shortens `match[0]` by one character and therefore moves the next range's start back onto the
 * `\r` — `"a\r\nGO\r\nb"` gives `[[0,3],[5,8]]` where it used to give `[[0,3],[6,8]]`. Every reader
 * of a range trims or tokenises, so a leading CR changes nothing, and no input distinguishes the two
 * spellings. `equivalent/crlf-in-go` in the mutation gate holds that claim to account.
 */
function splitBatches(masked) {
    const ranges = [];
    let start = 0;
    for (const match of masked.matchAll(/^[ \t]*GO[ \t]*$/gim)) {
        ranges.push([start, match.index]);
        start = match.index + match[0].length;
    }
    ranges.push([start, masked.length]);
    return ranges;
}

/**
 * Scans from `from` to the first character at paren depth 0 for which `stop` holds, else `to`.
 *
 * The depth tracking is defence, not a modelled shape, and is deliberately unpinned by any test: the
 * only inputs that distinguish it from a flat scan put a terminator keyword inside parentheses in
 * CODE — a column literally named `[SET]`, say — because the mask has already blanked anything
 * inside a string or a comment. No generator emits that. Three lines that fail safe are worth
 * keeping; a test asserting `[SET]` works would advertise support for SQL we do not model. See the
 * DELIBERATELY NOT LISTED note in check-distribution-seed.mutants.mjs.
 */
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
function collectAssignments(structure, values, [from, to]) {
    const endsAssignment = /(?:\b(?:SET|EXEC|EXECUTE|DECLARE)\b|;)/iy;
    const assignments = new Map();
    for (const match of structure.slice(from, to).matchAll(/\bSET\s+@(\w+)\s*=\s*/gi)) {
        const valueStart = from + match.index + match[0].length;
        const valueEnd = scanToDepthZero(structure, valueStart, to, (i) => {
            endsAssignment.lastIndex = i;
            return endsAssignment.test(structure);
        });
        assignments.set(match[1].toLowerCase(), values.slice(valueStart, valueEnd).trim());
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
    for (let hop = 0; hop < MAX_VARIABLE_CHASE; hop++) {
        if (!/^@\w+$/.test(value)) return /^NULL$/i.test(value) ? null : value;
        const assigned = assignments.get(value.slice(1).toLowerCase());
        if (assigned === undefined) return null; // DECLAREd and never SET — NULL at run time
        value = assigned;
    }
    // Cap reached. A chain this long is not a shape we model, so resolve to NULL: for a granted
    // capability that is a violation, which is the fail-closed direction, rather than a silent pass.
    return null;
}

/**
 * `@Name = value` pairs of one call, resolved through the batch's assignments.
 *
 * The paren-depth guard on the comma split is the same unexercised defence as `scanToDepthZero`'s,
 * and unpinned for the same reason: it only shows through on a value carrying a top-level comma
 * inside parentheses BEFORE the text that identifies the grant — `WHERE Name IN (N'a', N'b')` — and
 * nothing emits that either.
 */
function parseCallArguments(structure, values, from, to, assignments) {
    const args = new Map();
    let start = from;
    const commit = (end) => {
        // The NAME is found on the structure mask so a comment cannot hide an argument, and the
        // VALUE is sliced from the values mask at the same offsets so a comment cannot become one.
        const named = structure.slice(start, end).match(/^\s*@(\w+)\s*=\s*/);
        if (named) {
            const valueFrom = start + named[0].length;
            args.set(named[1].toLowerCase(), resolveArgumentValue(values.slice(valueFrom, end), assignments));
        }
        start = end + 1;
    };
    for (let i = from, depth = 0; i < to; i++) {
        const char = structure[i];
        if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (char === ',' && depth === 0) commit(i);
    }
    commit(to);
    return args;
}

/**
 * Is this BIT-valued argument set? Fail-closed on purpose: only an argument that is absent, NULL, or
 * a readable zero counts as unset. Anything the parser cannot reduce to a literal — `CAST(1 AS BIT)`,
 * a quoted `'1'`, an expression added by a future generator — is treated as SET.
 *
 * A strict `=== '1'` here meant every flag the parser could not read came back "not granted", which
 * skips all four rules and reports health. That is the same conflation `classifyRole` refuses for
 * `@RoleID`: "I cannot tell" is not "this is fine". Over-reading a flag costs at most a violation
 * someone has to explain; under-reading it costs the whole check.
 */
function isFlagSet(args, name) {
    if (!args.has(name)) return false;
    const value = args.get(name);
    return value !== null && !/^N?'?0'?$/.test(value.trim());
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
    const name = readQuotedName(value);
    if (name !== null) return namesRespondentRole(name) ? 'respondent' : 'other';
    return value.includes(`'${RESPONDENT_ROLE_NAME}'`) ? 'respondent' : 'unknown';
}

/** The name a `WHERE Name = N'…'` subselect looks up. Brackets optional, as T-SQL allows. */
function readQuotedName(value) {
    const match = value === null ? null : value.match(/\[?Name\]?\s*=\s*N?'([^']*)'/i);
    return match ? match[1] : null;
}

/**
 * Compared the way SQL Server compares it, not the way JavaScript does. A default collation is
 * case-INsensitive and `=` pads trailing blanks, so `N'FORM RESPONDENT'` and `N'Form Respondent '`
 * both resolve to the real role on the host. An exact match here read them as some other role and
 * skipped the call — a gate stricter than the database it is protecting protects nothing.
 */
function namesRespondentRole(name) {
    return name.trimEnd().toLowerCase() === RESPONDENT_ROLE_NAME.toLowerCase();
}

/** How a call names its entity: a literal id, a by-name subselect, or neither. */
function readEntityIdentity(value) {
    return { entityId: literalUuid(value), entityName: readQuotedName(value) };
}

/**
 * How many times the SQL names a permission procedure outside a comment. Compared against what the
 * parser actually read, this is the gate's own postcondition: zero parsed calls is otherwise
 * indistinguishable from a clean file, and every parser blind spot — a new dialect, a shape
 * MetadataSync starts emitting, a mask that desynced — lands as exactly that.
 *
 * Counted on the `values` mask, which keeps string bodies, rather than the `structure` mask the
 * parser itself matches on. That is the whole point: a backstop that read `structure` would share
 * the string-scanning layer with the thing it is checking, so a desync that blanked real code would
 * erase the calls and the count together and the gate would go quiet — the exact failure it exists
 * to catch. The cost is that a procedure name inside a string literal reads as a call the parser
 * missed. That is a false positive in the loud direction, and this file prefers loud.
 */
export function countPermissionProcedureMentions(sql) {
    return [...maskSql(sql).values.matchAll(/sp(?:Create|Update)EntityPermission/gi)].length;
}

/** Every permission call in `sql`, whatever role it binds. Pure read. */
export function findPermissionCalls(sql) {
    const { structure, values } = maskSql(sql);
    const nextCall = /\bEXEC(?:UTE)?\b/iy;
    const grants = [];
    for (const [from, to] of splitBatches(structure)) {
        const assignments = collectAssignments(structure, values, [from, to]);
        for (const call of structure.slice(from, to).matchAll(PERMISSION_CALL)) {
            const argsFrom = from + call.index + call[0].length;
            // Ends at the `;` OR at the next EXEC, whichever comes first. Semicolon alone trusted the
            // generator's framing: two calls in one unterminated batch merged into one argument map,
            // where the second call's `@RoleID` overwrote the first's and re-attributed a respondent
            // grant to another role — in the silent-pass direction.
            const argsTo = scanToDepthZero(structure, argsFrom, to, (i, char) => {
                if (char === ';') return true;
                nextCall.lastIndex = i;
                return nextCall.test(structure);
            });
            const args = parseCallArguments(structure, values, argsFrom, argsTo, assignments);
            const role = classifyRole(args.has('roleid'), args.get('roleid') ?? null);
            grants.push({
                procedure: call[1],
                role,
                ...readEntityIdentity(args.get('entityid') ?? null),
                granted: Object.fromEntries(
                    [...FILTERABLE_CAPABILITIES, ...WRITER_CAPABILITIES].map((c) => [c, isFlagSet(args, `can${c.toLowerCase()}`)]),
                ),
                // Whether the call MENTIONS the flag at all, which is a different question from
                // whether it grants it: MJ treats an omitted parameter as "leave unchanged".
                stated: Object.fromEntries(
                    [...FILTERABLE_CAPABILITIES, ...WRITER_CAPABILITIES].map((c) => [c, args.has(`can${c.toLowerCase()}`)]),
                ),
                filters: Object.fromEntries(
                    FILTERABLE_CAPABILITIES.map((c) => [c, {
                        present: args.has(`${c.toLowerCase()}rlsfilterid`),
                        cleared: isFlagSet(args, `${c.toLowerCase()}rlsfilterid_clear`),
                        value: args.get(`${c.toLowerCase()}rlsfilterid`) ?? null,
                    }]),
                ),
            });
        }
    }
    return grants;
}

/**
 * The permission calls that concern the anonymous role — everything `findPermissionCalls` read
 * except the calls that provably bind some other role, with arguments already resolved through the
 * per-record variables the generator emits.
 *
 * Pure read, and exported for the spec rather than for the gate: case 20 pins the guarded table
 * against the shipped seed through this function, so the ids are re-derived by the SAME parser the
 * gate uses rather than by a second one that could agree with it by coincidence.
 */
export function findRespondentGrants(sql) {
    return findPermissionCalls(sql).filter((call) => call.role !== 'other');
}

/** The row of this app's contract a grant falls under, or undefined if it grants something else. */
function guardedGrantFor(grant, capability) {
    return RESPONDENT_GUARDED_GRANTS.find(
        (g) => g.capability === capability && (g.entityId === grant.entityId || g.entityName === grant.entityName),
    );
}

/** Why this grant's filter slot would be NULL on the host, or null if it would be filled. */
function describeNullFilter(filter, capability) {
    if (filter.cleared) return `\`@${capability}RLSFilterID_Clear = 1\` explicitly nulls it`;
    if (!filter.present) return `the \`@${capability}RLSFilterID\` parameter is absent, so it is never set`;
    if (filter.value === null) return `\`@${capability}RLSFilterID\` resolves to NULL — an explicit NULL, or a variable DECLAREd but never SET`;
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
        const filter = grant.filters[capability];
        const guarded = guardedGrantFor(grant, capability);
        // Clearing a filter for a capability the call never MENTIONS is a violation on its own.
        // MJ's `_Clear` convention exists BECAUSE an omitted parameter means "leave unchanged", so
        // such a call leaves the host row at CanCreate = 1 with no filter — #41 exactly — while
        // granting nothing itself, which is why keying off "does this call grant CanCreate" missed
        // it. A call that says `@CanRead = 0` beside a cleared read filter is the generator's own
        // shape and is fine: no grant, so no filter to require.
        if (!grant.granted[capability] && !grant.stated[capability] && filter.cleared) {
            found.push(
                `${file} clears Form Respondent's ${capability}RLSFilterID on ${entity} (${call}) without restating ` +
                    `Can${capability}. An omitted capability means "leave unchanged", so the row keeps whatever grant it ` +
                    'had and loses its row-level-security filter — the exact end state #41 describes. Set the filter to ' +
                    `${guarded ? guarded.filterId : 'a scoped filter record'} rather than clearing it, or drop the grant.`,
            );
            continue;
        }
        if (!grant.granted[capability]) continue;
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
            const rel = relative(repoRoot, join(dir, file));
            const calls = findPermissionCalls(sql);
            const mentions = countPermissionProcedureMentions(sql);
            if (mentions > calls.length) {
                violations.push(
                    `${rel} names a permission procedure ${mentions} time(s) in SQL but this gate could not parse ` +
                        `${mentions - calls.length} of those call(s), so it cannot say what they grant. Zero understood calls ` +
                        'reads exactly like a clean file, which is how this check would go quiet on a dialect or an ' +
                        'emission shape it does not model — a PostgreSQL seed, for instance, whose converted calls are ' +
                        '`SELECT`s rather than `EXEC`s. Teach the parser this shape rather than renaming the file past it.',
                );
            }
            for (const call of calls) {
                if (call.role === 'other') continue;
                violations.push(...respondentGrantViolations(call, rel));
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
