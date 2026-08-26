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
 * CHECK 5 — A SHIPPED SCHEMA SYNC NEVER REACHES A SCHEMA THIS APP DOES NOT OWN.
 *   CodeGen writes `@ExcludedSchemaNames` from whatever schemas the DEV database happened to hold,
 *   so the list is only ever as good as one developer's install. It must never be NARROWER than a
 *   list the repo already shipped — which is checked against history rather than a constant,
 *   because a hand-written deny-list cannot name an Open App nobody here has heard of.
 *
 * CHECK 4 — A CORE-METADATA INSERT IS NEVER GUARDED ON ITS OWN ID ALONE.
 *   `IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '<guid>')` asks
 *   whether THIS ROW was inserted before. What makes an insert safe is whether the THING IT
 *   DESCRIBES already exists, under whatever id the host minted for it — and on any machine that ran
 *   `mj codegen` before the migration, that id is not ours. The guard misses, the insert lands a
 *   second copy, and four of the seven tables involved have no unique constraint on their natural
 *   key to stop it. That is #64. Its consequence is #66: CodeGen emits one `@FieldResolver` per
 *   `EntityRelationship` row, so a duplicated row makes the NEXT regeneration emit a duplicate
 *   identifier and `forms-server` stops compiling — on whichever branch happens to regenerate,
 *   nowhere near the migration that caused it.
 *
 *   This is the third gate here whose failure mode is silence, and the third for the same reason:
 *   everything builds, every test passes, and the checked-in generated files still compile, because
 *   they predate the duplicate. Nothing in the repo reads the database this defect lives in.
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
 * The directories whose SQL reaches a stranger's database, scanned by CHECK 3 and CHECK 4 alike.
 *
 * `migrations-pg/` is included so the first PostgreSQL seed is checked from birth rather than from
 * whenever somebody remembers to widen a gate. It is not kept in lockstep today (it stops at 0.8.x),
 * which is precisely why the gates must already know about it.
 */
const SHIPPED_MIGRATION_DIRS = ['migrations', 'migrations-pg'];

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
// CHECK 5 — CodeGen's schema-sync calls never reach a schema this app does not own
// ---------------------------------------------------------------------------

/**
 * The FLOOR of schemas `spUpdateExistingEntitiesFromSchema` must always be told to leave alone.
 *
 * A floor, not the answer. The `__mj_BizApps*` schemas belong to SIBLING Open Apps —
 * `bizapps-tasks` is a hard dependency of this one and `mj app install` installs it FIRST, so a
 * sync that includes it rewrites another app's entity metadata on every host that installs Forms.
 * `dbo` and `staging` belong to the HOST: sweeping them registers the customer's own tables as MJ
 * entities. Both case variants, because the collation a host uses is not ours to assume.
 *
 * What a hand-written list CANNOT do is name an Open App nobody here has heard of — `mj.config.cjs`
 * makes exactly this point about `__mj_BizAppsCaliber`, "which no deny-list maintained here could
 * ever have named in advance". So this floor is only half the check; {@link previouslyExcluded}
 * supplies the other half by reading what the repo has already shipped.
 */
const SCHEMAS_NEVER_SYNCED = [
    'sys',
    'staging',
    'dbo',
    '${mjSchema}',
    '${mjSchema}_BizAppsCommon',
    '${mjSchema}_BizAppsTasks',
    '${mjSchema}_bizappscommon',
    '${mjSchema}_bizappstasks',
    // Named explicitly even though history also supplies them: the history half derives from the
    // WORKING TREE, and exactly one tracked file names these two, so renaming or squashing
    // `V202608191400` would have silently relaxed the floor back to the six above. History is for
    // the apps nobody here has heard of; this list is for the ones we have.
    '${mjSchema}_BizAppsATS',
    '${mjSchema}_BizAppsCaliber',
];

/**
 * The first migration this check governs, as its version stamp.
 *
 * Deliberately forward-looking. Four migrations that predate this carry lists missing some of the
 * baseline, and they are already applied on every host that installed those versions — editing
 * them now would change nothing for those hosts while making the shipped history disagree with
 * what ran. Remediating them means a NEW corrective migration, which is its own change with its
 * own verification; it is logged in plans/FORMS_BUILD_PLAN.md rather than smuggled in here.
 *
 * What this gate does is stop the next one, which is the failure mode that matters: the list is
 * regenerated by CodeGen from the dev machine's schema inventory on every run.
 */
const SCHEMA_SYNC_GATE_FROM = '202608252340';

/**
 * The same watershed, as a number, for the checks that compare with {@link landsAfter}.
 *
 * Both of this repo's newest checks — the schema-sync scope above and the unguarded-core-insert
 * scan below — are deliberately forward-looking for the same reason: older migrations carry known
 * instances of both gaps and are already applied on hosts, where editing them changes nothing
 * while making the shipped history disagree with what ran. Remediating those means a corrective
 * migration, which is its own change with its own verification, and it is logged in
 * plans/FORMS_BUILD_PLAN.md rather than smuggled into an unrelated one.
 */
const NEWER_GATES_WATERSHED = Number(SCHEMA_SYNC_GATE_FROM) - 1;


/**
 * CHECK 5 — every `@ExcludedSchemaNames` in shipped SQL excludes at least the baseline above.
 *
 * This exists because a CodeGen run bakes the DEV MACHINE's schema inventory into the SQL it
 * emits, and that inventory is whatever happened to be installed that day. A developer whose
 * database lacks `bizapps-tasks` gets a list without it, appends the output to a migration, and
 * ships a sync that quietly rewrites tasks' metadata for everyone else. It happened: the
 * Rules & Branching migration shipped a list missing `__mj_BizAppsTasks`, `dbo` and `staging`
 * while the migration immediately before it named all three, and nothing caught the difference —
 * `check-generated-schema-scope.mjs` reads `mj.config.cjs` and generated TypeScript, not SQL.
 */
/**
 * A schema name reduced to its IDENTITY, so two spellings of one schema compare equal.
 *
 * Only the PLACEHOLDER is normalized, deliberately, and case is NOT. Shipped lists disagree on the
 * placeholder — most write `${mjSchema}_BizAppsTasks`, one older CodeGen run baked the literal
 * `__mj_BizAppsTasks` — and treating those as different schemas would report a drop that is purely
 * a spelling difference, which is how a real check turns into noise somebody switches off.
 *
 * Case is a different thing entirely. CodeGen emits BOTH `_BizAppsTasks` and `_bizappstasks`
 * because the host's collation is not knowable from here, so the two spellings are two separate
 * protections and losing one is a real narrowing on a case-sensitive host. Folding case here made
 * the check accept dropping either — the first version of this function did exactly that, and
 * removing `${mjSchema}_BizAppsTasks` outright passed clean.
 */
function schemaIdentity(name) {
    return name.replace(/\$\{mjSchema\}/g, '__mj');
}

/**
 * The procs that this repo's shipped SQL is known to pass `@ExcludedSchemaNames` to.
 *
 * DISCOVERED, not enumerated. A hand-written list of proc names goes stale exactly the way a
 * hand-written list of schema names does, and it did: the first version named four procs and
 * missed `spDeleteUnneededEntityFields`, which is the one CodeGen emits LAST — so deleting that
 * call's argument passed the accounting backstop clean, the very hole the backstop was added to
 * close. Reading the names out of the corpus means a proc is covered from the first call that
 * passes the argument, with nothing to keep up to date.
 */
function schemaSyncProcNames(repoRoot) {
    // The floor: every such proc CodeGen is known to emit today. Discovery alone is not enough —
    // in a corpus where no call happens to pass the argument (a single-migration fixture, or a
    // future paste that omits it everywhere) there would be nothing to discover, and the check
    // would go quiet exactly when it is needed. The floor is what we know; discovery is for what
    // we do not.
    const names = new Set([
        'spupdateexistingentitiesfromschema',
        'spupdateexistingentityfieldsfromschema',
        'spdeleteunneededentityfields',
        'spsetdefaultcolumnwidthwhereneeded',
        'spupdateschemainfofromdatabase',
    ]);
    for (const dir of SHIPPED_MIGRATION_DIRS.map((d) => join(repoRoot, d))) {
        if (!existsSync(dir)) continue;
        for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
            const sql = maskSql(readFileSync(join(dir, file), 'utf-8')).values;
            // Both spellings, or discovery is only half true. T-SQL names the argument; PostgreSQL
            // passes it positionally, so matching `@ExcludedSchemaNames` alone meant a proc used
            // ONLY in `migrations-pg/` was never discovered — and once the positional matcher was
            // filtered to discovered names, that made CHECK 5 silent on exactly the dialect it had
            // just been taught to read. Coverage should not depend on a proc happening to appear
            // in T-SQL too.
            for (const call of sql.matchAll(/\[?(sp\w+)\]?\s*@ExcludedSchemaNames/gi)) {
                names.add(call[1].toLowerCase());
            }
            // Deliberately NOT the positional form. That regex is character-identical to the one
            // this set gates, so discovering through it would populate the filter with the very
            // pattern the filter exists to restrict: `migrations-pg/` is full of generated
            // `"spCreateFormQuestion"('<guid>', …)` calls, and one of those would be discovered as
            // a sync proc and its GUID read as an exclusion list — poisoning the history floor so
            // that every later correct migration failed. The named form is unambiguous, and the
            // floor above already covers every sync proc that exists in either dialect.
        }
    }
    return names;
}

/**
 * How many times `sql` invokes one of `procNames` — with or without an argument.
 *
 * Counting the CALLS rather than the arguments is the whole point: {@link checkSchemaSyncScope}
 * can only inspect lists it manages to parse, so every way of making one unparseable is a way of
 * passing it silently. Comparing this count against the number parsed turns "not seen" into a
 * violation instead of a pass.
 */
function countSchemaSyncCalls(sql, procNames) {
    // Anchored on the NAME alone, indifferent to what follows it. Requiring a specific next
    // character (`@`, `;`, whitespace) missed a call whose argument list had been left malformed —
    // `[spDeleteUnneededEntityFields], @EntityIDs=…` — which is precisely the shape a careless
    // deletion produces, so the one mutation that mattered slipped through. Being name-anchored
    // also covers the PostgreSQL call form (`SELECT schema."spX"(…)`), which has no EXEC to anchor
    // What counts as a CALL, across both dialects and all three spellings that actually occur:
    //
    //   EXEC [schema].[spX] @Excl=…        bracketed, T-SQL
    //   EXEC schema.spX;                   UNbracketed — bracketing is optional in T-SQL, and
    //                                      requiring it made this silent on a real call
    //   SELECT schema."spX"('…')           quoted, PostgreSQL
    //
    // Anchored on the punctuation that precedes the name — `.`, `[` or `"` — because that is what
    // separates a call from an `sp_addextendedproperty` description that merely NAMES a procedure
    // in prose, where the name follows a space. Anchoring before rather than after also survives a
    // malformed argument list (`[spX], @EntityIDs=…`, the shape a careless deletion leaves), which
    // an earlier version did not. The unqualified `EXEC spX` form is matched separately below.
    let calls = 0;
    for (const call of sql.matchAll(/[.["](sp\w+)/gi)) {
        if (procNames.has(call[1].toLowerCase())) {
            calls++;
        }
    }
    for (const call of sql.matchAll(/\bEXEC(?:UTE)?\s+(sp\w+)/gi)) {
        if (procNames.has(call[1].toLowerCase())) {
            calls++;
        }
    }
    return calls;
}

/**
 * Every exclusion list `sql` passes to a schema-sync proc, in either dialect.
 *
 * T-SQL names the argument (`@ExcludedSchemaNames='…'`); PostgreSQL passes it POSITIONALLY
 * (`SELECT schema."spUpdateExistingEntitiesFromSchema"('…')`). Reading only the named form meant
 * CHECK 5 could not see the PG path at all — and the lists there are narrower than the T-SQL ones,
 * naming no sibling Open App, which is precisely the drift the check exists to catch. The
 * accounting backstop was reporting those files as calls-it-could-not-parse; that was the check
 * working, and taking it for an over-count would have been the wrong lesson entirely.
 */
function exclusionListsIn(sql, procNames) {
    const found = [];
    for (const named of sql.matchAll(/@ExcludedSchemaNames\s*=\s*'([^']*)'/g)) {
        found.push(named[1]);
    }
    // Positional form, and ONLY for a proc known to take an exclusion list. Unfiltered, this would
    // read the first string argument of any `"spSomething"('…')` as a schema list — there is no
    // such call today, but `migrations-pg/` is full of generated `"spDeleteForm"(…)` functions and
    // one of them growing a string parameter would silently become an "exclusion list".
    for (const positional of sql.matchAll(/"(sp\w+)"\s*\(\s*'([^']*)'/gi)) {
        if (procNames.has(positional[1].toLowerCase())) {
            found.push(positional[2]);
        }
    }
    return found;
}

/**
 * Every `@ExcludedSchemaNames` a migration ships, keyed by its version stamp.
 *
 * Read from the repo rather than maintained, because that is the only way the check can know
 * about a schema nobody thought to add to a constant.
 */
function shippedExclusionLists(repoRoot) {
    const procNames = schemaSyncProcNames(repoRoot);
    const lists = [];
    for (const dir of SHIPPED_MIGRATION_DIRS.map((d) => join(repoRoot, d))) {
        if (!existsSync(dir)) continue;
        for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
            // `R__` repeatables carry no version stamp and were skipped entirely — flagged as an
            // open carry-over for several rounds. A repeatable runs on EVERY migrate, so a sync
            // call in one is the last place this should be blind. They sort after every versioned
            // file, which is also when Flyway runs them.
            const stamp = /^[A-Z](\d{12})__/.exec(file);
            const version = stamp === null ? (/^R__/.test(file) ? '999999999999' : null) : stamp[1];
            if (version === null) continue;
            // The STRUCTURE mask, so `--` comments do not count. `migrations-pg/` documents the
            // statements its conversion skipped in comments, wrapped mid-literal — scanning raw
            // text captured `'s` from a line break as if it were a whole exclusion list, and the
            // check then reported every real migration as "dropping" a schema called `s`. A
            // commented-out call also excludes nothing, so reading one is wrong twice over.
            const sql = maskSql(readFileSync(join(dir, file), 'utf-8')).values;
            for (const raw of exclusionListsIn(sql, procNames)) {
                const names = raw.split(',').map((n) => n.trim()).filter((n) => n.length > 0);
                lists.push({ stamp: version, file: join(dir, file), names, raw });
            }
        }
    }
    return lists;
}

/**
 * Everything the repo has ALREADY shipped an exclusion for, before `stamp`.
 *
 * This is what makes the check self-maintaining. Once any migration excludes a schema, no later
 * migration may drop it — so an Open App this repo has never heard of is still protected the
 * moment one CodeGen run happens to name it. That is the failure this gate exists for: the list
 * is regenerated from whatever schemas the DEV BOX held, so a developer without Caliber installed
 * silently emits a narrower list than the one before it. That has already happened twice
 * (`V202608211000` and `V202608211600` both dropped ATS and Caliber, which `V202608191400` had).
 */
function previouslyExcluded(lists, stamp) {
    const seen = new Set();
    for (const list of lists) {
        if (list.stamp < stamp) {
            for (const name of list.names) seen.add(schemaIdentity(name));
        }
    }
    return seen;
}

/**
 * Every schema-sync call in a gated migration must have yielded a parseable exclusion list.
 *
 * Without this the check is only as strong as its regex: an argument that is absent, renamed or
 * bound to a variable simply is not seen, and "not seen" reads identically to "correct".
 */
function checkEverySyncCallWasParsed(repoRoot, lists, violations) {
    const procNames = schemaSyncProcNames(repoRoot);
    for (const dir of SHIPPED_MIGRATION_DIRS.map((d) => join(repoRoot, d))) {
        if (!existsSync(dir)) continue;
        for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
            const stamp = /^[A-Z](\d{12})__/.exec(file);
            const version = stamp === null ? (/^R__/.test(file) ? '999999999999' : null) : stamp[1];
            if (version === null || version < SCHEMA_SYNC_GATE_FROM) continue;
            const path = join(dir, file);
            // The `values` mask, deliberately — the same choice, for the same reason, that
            // `countPermissionProcedureMentions` documents above: a backstop that read `structure`
            // shares the string-scanning layer with the parser it is checking, so a mask desync
            // that blanked real code would erase the calls and the count together and the gate
            // would go quiet. This briefly read `structure` to dodge a false positive on a
            // procedure name appearing in prose; that traded a loud wrong answer for a silent one,
            // and it also went blind to a real call inside a dynamic-SQL literal. The prose
            // problem is solved in {@link countSchemaSyncCalls} instead, by requiring the name to
            // be QUOTED the way both dialects quote a callee.
            const calls = countSchemaSyncCalls(maskSql(readFileSync(path, 'utf-8')).values, procNames);
            const parsed = lists.filter((l) => l.file === path).length;
            if (calls > parsed) {
                violations.push(
                    `${relative(repoRoot, path)} invokes a schema-sync procedure ${calls} time(s) but only ` +
                        `${parsed} carry an @ExcludedSchemaNames this gate can read. An unreadable list is not a safe ` +
                        'one: a sync with no exclusions sweeps dbo, staging and every sibling Open App on the host. ' +
                        "Write the list as a literal on the call, the way the rest of the file's calls do.",
                );
            }
        }
    }
}

function checkSchemaSyncScope(repoRoot, violations) {
    const lists = shippedExclusionLists(repoRoot);
    checkEverySyncCallWasParsed(repoRoot, lists, violations);
    for (const list of lists) {
        if (list.stamp < SCHEMA_SYNC_GATE_FROM) continue;
        const required = new Set([
            ...SCHEMAS_NEVER_SYNCED.map(schemaIdentity),
            ...previouslyExcluded(lists, list.stamp),
        ]);
        const listed = new Set(list.names.map(schemaIdentity));
        const missing = [...required].filter((n) => !listed.has(n));
        if (missing.length > 0) {
            violations.push(
                `${relative(repoRoot, list.file)} ships an @ExcludedSchemaNames that drops ` +
                    `${missing.join(', ')}. CodeGen writes this list from whatever schemas the DEV database ` +
                    'happened to hold, so it must be normalized before the output is shipped — and it may never ' +
                    'be NARROWER than one the repo already shipped: a sync reaching a sibling Open App\'s schema ' +
                    "rewrites its entity metadata on every host, and one reaching dbo/staging registers the host's " +
                    'own tables as entities. Copy the list from the previous migration and add anything new.',
            );
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
    for (const dirName of SHIPPED_MIGRATION_DIRS) {
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
// CHECK 4 — a core-metadata INSERT is never guarded on its own ID alone
// ---------------------------------------------------------------------------

/**
 * The `__mj` tables a migration may write metadata rows into, and where the guard shape matters.
 *
 * The failure differs across them, and BOTH halves belong on this list. `EntityFieldValue`,
 * `EntityRelationship`, `EntitySetting` and `EntityPermission` carry no unique constraint on their
 * natural key, so an ID-only guard duplicates SILENTLY — that is #64, and the duplicated
 * relationship row is what broke CodeGen in #66. `Entity`, `EntityField` and `ApplicationEntity` DO
 * carry one (`UQ_EntityField_EntityID_Name`, `UQ_ApplicationEntity_ApplicationID_EntityID`), so the
 * same mistake there fails LOUDLY on a constraint violation and takes the install down instead.
 *
 * Do not "optimise" the constrained three off this list on the grounds that the database catches
 * them. A migration that cannot apply is not a lesser defect than one that applies wrongly — it is
 * the same authoring error, and the fix is identical: guard on the natural key.
 */
const CORE_METADATA_TABLES = new Set(
    ['entity', 'entityfield', 'entityfieldvalue', 'entityrelationship', 'entitypermission', 'applicationentity', 'entitysetting'],
);

/**
 * The point after which an ID-only guard is a NEW defect rather than shipped history.
 *
 * WATERSHED, NOT WHOLE HISTORY — the same reasoning CHECK 3 records at line 42, and the same
 * constraint: `migrations/` is append-only, so a gate that fails on a file nobody may edit is a gate
 * someone disables. FIVE shipped migrations carry this shape, 51 statements in total, and none can
 * be corrected in place:
 *
 *   B202606281200  Schema_and_Tables                 — 16 EntityRelationship
 *   V202608072330  Automation_And_Entity_Binding     — 12 EntityRelationship
 *   V202608081200  Form_Upload_Provenance            —  5 EntityRelationship
 *   V202608191300  Element_Parity_Metadata_Backfill  — 17 mixed (#64: 14 value, 1 rel, 2 setting)
 *   V202608211600  Form_Template_Source              —  1 EntityRelationship
 *
 * That distribution is the real lesson, and it is why this check is worth its lines: only the fourth
 * file was hand-authored. The other four are PASTED CODEGEN OUTPUT, and this is the guard CodeGen
 * itself emits for a relationship row — so the defect arrives by the routine act of running
 * `mj codegen` and pasting the result, not by anybody choosing a weak predicate. Upstream MJ is
 * where that ends (see the PR's follow-ups); until then this gate is what stops the next paste.
 *
 * The stamp therefore sits after the LATEST offender, not the first. Their damage on existing hosts
 * is repaired by `V202608252300__Converge_Element_Parity_Metadata_Duplicates.sql` for the rows it
 * could identify, and `smoke/metadata-integrity-path.mjs` rules on the END STATE in the database for
 * everything else — it reports a duplicate whatever wrote it, which is the coverage that matters for
 * the 33 rows above whose twins nobody has observed. This check rules on the SQL instead, so that the
 * next one is never written. Moving this stamp forward again to quiet a NEW violation would be
 * exactly the wrong repair: add the natural key to the guard instead.
 */
const ID_ONLY_GUARD_WATERSHED = 202608211600;

/** The `[` … `]`-optional core-table INSERT, on either spelling of the core schema. */
const CORE_INSERT = /\bINSERT\s+INTO\s+(?:\[\$\{mjSchema\}\]|\[?__mj\]?)\s*\.\s*\[?(\w+)\]?/gi;

/** A predicate that tests the row's own id and nothing else — the defect this check names. */
const ID_ONLY_PREDICATE = /^\s*\[?ID\]?\s*=\s*(?:N?'[^']*'|@\w+)\s*$/i;

/** Index of the `)` closing the `(` at `open`, or -1. */
function matchingParen(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')' && --depth === 0) return i;
    }
    return -1;
}

/** Index of the `END` closing the `BEGIN` at `begin`, or the end of the text. */
function matchingEnd(text, begin) {
    const keyword = /\b(BEGIN|END)\b/gi;
    keyword.lastIndex = begin;
    let depth = 0;
    for (let match = keyword.exec(text); match !== null; match = keyword.exec(text)) {
        if (match[1].toUpperCase() === 'BEGIN') depth++;
        else if (--depth === 0) return match.index;
    }
    return text.length;
}

/** Everything after the subquery's top-level `WHERE`, or null when it has none. */
function whereClauseOf(subquery) {
    const where = /\bWHERE\b/iy;
    let depth = 0;
    for (let i = 0; i < subquery.length; i++) {
        const char = subquery[i];
        if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (depth === 0) {
            where.lastIndex = i;
            if (where.test(subquery)) return subquery.slice(where.lastIndex);
        }
    }
    return null;
}

/**
 * The statement an `IF` guard governs: `[from, to)` of its `BEGIN … END` block, or of the single
 * statement that follows.
 *
 * Scanning starts AFTER the `NOT EXISTS (…)` closes and steps over whatever else the condition
 * carries, at paren depth zero. That is what makes a companion `AND EXISTS (…)` unable to rescue an
 * ID-only guard: the extra clause is skipped as condition text, never read as a second predicate.
 * It is the shape `V202608191300`'s QuestionType inserts use, and it does not help — the `AND
 * EXISTS` tests that a DIFFERENT row exists, so on a host where the NOT EXISTS is wrong it fires
 * anyway.
 *
 * ⚠️ THE SCAN STOPS AT THE FIRST STATEMENT OF ANY KIND, not at the first statement we care about.
 * `STATEMENT_START` therefore lists `PRINT`, `SET`, `SELECT` and friends alongside the DML: a guard
 * whose body is `PRINT 'x'` governs that PRINT and nothing else, and returning an EMPTY region for
 * it is the correct answer. An earlier draft matched only DML and so scanned straight past the
 * PRINT to whatever `INSERT` came next — attributing an unrelated, possibly well-guarded insert to
 * this guard and reporting a violation against the wrong line. Over-reporting is the safe direction
 * for this gate, but naming the wrong statement is not: it sends someone to fix code that is fine.
 */
const STATEMENT_START = /\b(BEGIN|INSERT|UPDATE|DELETE|EXEC|EXECUTE|SELECT|SET|PRINT|THROW|DECLARE|RAISERROR|WAITFOR|MERGE|TRUNCATE|IF|WHILE|RETURN|GOTO)\b/iy;
const GOVERNED_DML = new Set(['INSERT', 'UPDATE', 'DELETE', 'EXEC', 'EXECUTE']);

function governedStatement(text, from) {
    let depth = 0;
    for (let i = from; i < text.length; i++) {
        const char = text[i];
        if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (depth === 0) {
            STATEMENT_START.lastIndex = i;
            const match = STATEMENT_START.exec(text);
            if (match === null || match.index !== i) continue;
            const keyword = match[1].toUpperCase();
            if (keyword === 'BEGIN') return [i, matchingEnd(text, i)];
            if (!GOVERNED_DML.has(keyword)) return [i, i];
            const semicolon = text.indexOf(';', i);
            return [i, semicolon === -1 ? text.length : semicolon];
        }
    }
    return [from, from];
}

/**
 * Core-metadata tables inserted under an `IF NOT EXISTS` whose predicate tests only `[ID]`.
 *
 * Read off the STRUCTURE mask, like CHECK 3's parser: string bodies are blanked, so a guid inside a
 * literal still reads as `'        '` and matches the shape without the value mattering, while a
 * `--` comment describing a guard can never be mistaken for one. Pure read; exported for the spec.
 */
export function findIdOnlyGuardedInserts(sql) {
    const { structure } = maskSql(sql);
    const found = [];
    for (const guard of structure.matchAll(/\bIF\s+NOT\s+EXISTS\s*\(/gi)) {
        const open = guard.index + guard[0].length - 1;
        const close = matchingParen(structure, open);
        if (close === -1) continue;
        const predicate = whereClauseOf(structure.slice(open + 1, close));
        if (predicate === null || !ID_ONLY_PREDICATE.test(predicate)) continue;
        const [from, to] = governedStatement(structure, close + 1);
        for (const insert of structure.slice(from, to).matchAll(CORE_INSERT)) {
            if (CORE_METADATA_TABLES.has(insert[1].toLowerCase())) {
                found.push({ table: insert[1], line: structure.slice(0, guard.index).split('\n').length });
            }
        }
    }
    return found;
}

/**
 * Core-metadata INSERTs that carry no `IF NOT EXISTS` guard at all.
 *
 * {@link findIdOnlyGuardedInserts} walks outward from each guard, which means an insert with NO
 * guard is not merely allowed — it is invisible. That is the wrong way round: an unguarded insert
 * is strictly weaker than the ID-only guard CHECK 4 rejects, since it cannot even claim to have
 * asked. It shipped: the Rules & Branching migration carried a bare
 * `INSERT INTO [__mj].[EntityFieldValue]` naming an `EntityFieldID` that only exists on the
 * database CodeGen ran against, so a host that had run `mj codegen` first would have hit a foreign
 * key and stopped mid-migration.
 *
 * "Guarded" is read structurally rather than semantically: an insert counts as guarded when an
 * `IF`/`IF NOT EXISTS` governs it, or when it is inside a `BEGIN…END` that one does. Judging the
 * predicate is CHECK 4's job; this only asks whether anything was asked at all.
 */
export function findUnguardedCoreInserts(sql) {
    const masked = maskSql(sql).structure;
    // The ranges an `IF NOT EXISTS (…)` actually governs, computed with the same
    // `governedStatement` walk CHECK 4 uses — so a single fence around a `BEGIN…END` covers every
    // insert inside it. A first attempt looked backwards from each insert for a nearby `IF`, which
    // reported the SECOND insert under one fence as unguarded: the gate's own spec caught it,
    // which is the whole reason that spec exists.
    const guarded = [];
    for (const guard of masked.matchAll(/\bIF\s+NOT\s+EXISTS\s*\(/gi)) {
        const open = guard.index + guard[0].length - 1;
        const close = matchingParen(masked, open);
        if (close === -1) continue;
        guarded.push(governedStatement(masked, close + 1));
    }
    const found = [];
    for (const insert of masked.matchAll(CORE_INSERT)) {
        if (!CORE_METADATA_TABLES.has(insert[1].toLowerCase())) continue;
        if (guarded.some(([from, to]) => insert.index >= from && insert.index < to)) continue;
        found.push({ table: insert[1], line: masked.slice(0, insert.index).split('\n').length });
    }
    return found;
}

/** A migration's position relative to `watershed`, read from the `V<YYYYMMDDHHMM>` in its name. */
function landsAfter(file, watershed) {
    const stamp = file.match(/^[VB](\d{12})__/);
    return stamp === null || Number(stamp[1]) > watershed;
}

function checkIdOnlyGuards(repoRoot, violations) {
    for (const dirName of SHIPPED_MIGRATION_DIRS) {
        const dir = join(repoRoot, dirName);
        if (!existsSync(dir)) continue;
        const files = readdirSync(dir)
            .filter((f) => f.endsWith('.sql') && landsAfter(f, ID_ONLY_GUARD_WATERSHED))
            .sort();
        for (const file of files) {
            const rel = relative(repoRoot, join(dir, file));
            const sql = readFileSync(join(dir, file), 'utf-8');
            for (const { table, line } of landsAfter(file, NEWER_GATES_WATERSHED) ? findUnguardedCoreInserts(sql) : []) {
                violations.push(
                    `${rel}:${line} INSERTs into \`${table}\` with no \`IF NOT EXISTS\` guard at all. That is ` +
                        'weaker than the ID-only guard this check rejects below — it cannot even claim to have asked ' +
                        'whether the thing already exists. CodeGen emits these bare, naming ids that exist only on the ' +
                        'database it ran against, so on a host that ran `mj codegen` first the foreign key fails and ' +
                        '`mj app install` stops mid-migration. Guard on the natural key: resolve the parent through its ' +
                        'own name and test what the row IS.',
                );
            }
            for (const { table, line } of findIdOnlyGuardedInserts(sql)) {
                violations.push(
                    `${rel}:${line} guards an INSERT into \`${table}\` on \`[ID] = '<guid>'\` alone. That asks whether ` +
                        'THIS ROW was inserted before; what makes an insert safe is whether the THING IT DESCRIBES already ' +
                        'exists, under whatever id the host minted for it. Any developer who ran `mj codegen` before this ' +
                        'migration has that row under a different id, so the guard misses and the insert lands a second ' +
                        'copy — silently, because these tables have no unique constraint on their natural key. A duplicated ' +
                        'EntityRelationship makes CodeGen emit one @FieldResolver per row and forms-server stops compiling ' +
                        '(#66); a duplicated EntityFieldValue duplicates a generated union member. Guard on the natural key ' +
                        `instead — \`WHERE ID = '<guid>' OR (EntityID = … AND Name = …)\` is the shape the EntityField ` +
                        'inserts in the same file already use. A companion `AND EXISTS (…)` outside the NOT EXISTS does ' +
                        'not count: it tests a different row.',
                );
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
    checkIdOnlyGuards(repoRoot, violations);
    checkSchemaSyncScope(repoRoot, violations);
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
            'placeholders; no post-hardening seed re-grants the Form Respondent role unfiltered access; no new ' +
            'core-metadata insert is guarded on its own ID alone; no shipped schema sync reaches a schema this ' +
            'app does not own.',
    );
}
