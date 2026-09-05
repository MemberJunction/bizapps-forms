#!/usr/bin/env node
/**
 * Mutation gate for the distribution gate — does its spec actually KILL what it claims to cover?
 *
 * `check-distribution-seed.spec.mjs` proves the gate FIRES. This proves the spec would NOTICE if a
 * behaviour were removed, which is a different question and the one that matters here: CHECK 3's
 * failure mode is silence, so a behaviour no test kills is a behaviour a refactor can delete with
 * the suite still green and a seed slipping through months later.
 *
 * It exists because that gap was measured, not imagined. An adversarial review of #42 ran a mutation
 * pass by hand and found nine such behaviours (#44); re-measuring at 092a0e6 found twelve more the
 * review had missed and two the review had misread. A one-off audit cannot keep finding those — the
 * fourteenth goes unpinned the same way the first nine did — so the audit ships as a gate.
 *
 * HOW TO READ THE LIST BELOW. `MUTANTS` is the statement of which behaviours are load-bearing: each
 * entry deletes one and must be killed by at least one spec case. `EQUIVALENT` is its opposite and
 * is just as deliberate: code that cannot be observed, asserted to STAY unobservable. A "failure"
 * there means someone gave the code behaviour without noticing, and the entry is now stale.
 *
 * Failure modes, all fatal:
 *   SURVIVED     — a mutant nothing killed. Write the case; the entry says what it deletes.
 *   KILLED       — an EQUIVALENT mutant a case now kills. The code became observable; promote it.
 *   NOT APPLIED  — a `find` that no longer matches exactly once. A refactor renamed the behaviour
 *                  out from under its mutant, so nothing was measured. This is why the harness
 *                  fails rather than skips: a silently unapplied mutant reads exactly like a
 *                  healthy one, which is the same trap the gate itself exists to close.
 *   CRASHED      — the spec died without naming a failed case: an import error, a timeout, a
 *                  harness tree that is not repo-shaped. NOT a kill, however tempting, and this
 *                  harness shipped for about an hour believing otherwise. Every mutant makes the
 *                  spec exit non-zero when the harness itself is broken, so "non-zero means killed"
 *                  reported 49 green kills over a run that measured NOTHING. Reviewers found it by
 *                  breaking the symlink loop. A gate whose own breakage reads as success is the
 *                  precise failure this file was written to stop, so it is now checked twice: the
 *                  BASELINE below must pass before any mutant runs, and a kill must name the case
 *                  that did it.
 *
 * DELIBERATELY NOT LISTED, so nobody adds them back thinking they were forgotten:
 *   - paren-depth tracking in `scanToDepthZero` and `parseCallArguments`. Both are killable, but
 *     only by SQL no generator emits — a bracketed column literally named `[SET]`, a role subselect
 *     written `WHERE Name IN (N'a', N'b')`. Pinning those would advertise support for shapes we do
 *     not model. The depth tracking stays (three lines, fails safe); it is unexercised defence.
 *   - the `seen` de-duplication in `checkPlaceholders`. No case asserts a violation COUNT, and the
 *     rule is cosmetic — one message per placeholder per file rather than one per occurrence.
 *   - CHECK 7's seeded set being built across the WHOLE corpus rather than per file. The property is
 *     real and `check-distribution-seed.spec.mjs` case 100 binds it — the seed lives in one migration
 *     and the reference in another — but every narrow mutant for it also breaks `check7/seeds-are-read`,
 *     so it would be killed for the wrong reason. Coverage, not mutation, is the tool for that one.
 *   - `@RoleID` bound inline in the `EXEC` rather than through a variable. D3 requires the shape and
 *     `check-distribution-seed.spec.mjs` case 43 covers it, but no narrow mutant expresses it: every
 *     candidate also breaks the inline arguments case 26 already binds, so it is killed for the
 *     wrong reason. Coverage, not mutation, is the tool for that one.
 *
 * Node stdlib only and no build step, same constraint as the gate and its spec, so CI runs it
 * without an install.
 *
 * Serial, and it costs about three minutes (measured 2026-09-04: 174s wall, 96 mutants). It was 40s
 * for 66 before CHECK 7, and the step grew by more than the mutant count: each mutant runs the whole
 * spec in a fresh process, and CHECK 7 reads every shipped `.sql` file twice per `runChecks` — which
 * the spec does against the REAL tree, not only against fixtures. The spec builds 99 of those
 * (measured at `mkdtempSync`, not counted off the source — the table-driven loops multiply 15 call
 * sites into 99). It no longer copies the `metadata/` tree into each of them — that was CHECK 1's,
 * and #105 removed the check and the copy together. Each run is capped by SPEC_TIMEOUT_MS:
 * `mask/block-comment-first-close` injects a `while` loop into the gate, and a mutant that hangs
 * would otherwise hang CI with no signal at all. Those are the honest numbers — a workflow step
 * whose real cost is quadruple what its comment claims is a step someone deletes in a hurry later,
 * so RE-MEASURE when you add mutants rather than leaving the old figure in place.
 *
 * Parallelising is possible and deliberately not done: the gate only runs on paths that touch it,
 * and a worker pool is more of this harness to own for three minutes nobody is waiting on. If the
 * step ever outgrows that, the cost is in the spec's real-tree runs, not in the mutant count.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPTS_DIR, '..');
const GATE = join(SCRIPTS_DIR, 'check-distribution-seed.mjs');
const SPEC = join(SCRIPTS_DIR, 'check-distribution-seed.spec.mjs');

/**
 * Behaviours that must stay pinned. `find` must match the gate source EXACTLY once — an anchor that
 * drifts is reported, never skipped. `behaviour` is written as what the reader loses, because that
 * is what a survivor's error message has to tell someone who has never read this file.
 */
const MUTANTS = [
    // --- CHECK 6: an extended-property write never hands `sql_variant` a MAX type ----------------
    // Every one of these was a real hole in a shipped cut of the check, found by review rather
    // than by the spec — which is exactly the state this harness exists to make impossible.
    ['sqlvariant/case-insensitive-type', 'the MAX-type scan is case-insensitive, so `nvarchar(max)` is caught as readily as the shouted form',
        `const MAX_TYPED_DECLARATION = /(@[A-Za-z0-9_]+)\\s+(?:AS\\s+)?((?:N?VARCHAR|VARBINARY)\\s*\\(\\s*MAX\\s*\\)|XML\\b)/gi;`,
        `const MAX_TYPED_DECLARATION = /(@[A-Za-z0-9_]+)\\s+(?:AS\\s+)?((?:N?VARCHAR|VARBINARY)\\s*\\(\\s*MAX\\s*\\)|XML\\b)/g;`],
    ['sqlvariant/optional-as', 'the optional `AS` in a DECLARE is tolerated, so `DECLARE @d AS NVARCHAR(MAX)` cannot hide the type',
        `(?:AS\\s+)?`, ``],
    ['sqlvariant/xml-included', 'XML is a rejected type in its own right, not only the parenthesised MAX ones',
        `|XML\\b)/gi;`, `)/gi;`],
    ['sqlvariant/varbinary-included', 'VARBINARY(MAX) is rejected too — the restriction is the MAX type, not the string types',
        `(?:N?VARCHAR|VARBINARY)`, `(?:N?VARCHAR)`],
    ['sqlvariant/positional-arguments', 'every argument of the call is read, not only a NAMED `@value =` — T-SQL allows the value positionally, and the named-only form was the shape that let a broken migration through',
        `        for (const ref of args.matchAll(/@[A-Za-z0-9_]+/g)) {`,
        `        for (const ref of args.matchAll(/(?<=@value\\s{0,4}=\\s{0,4})@[A-Za-z0-9_]+/gi)) {`],
    ['sqlvariant/proc-restriction', 'only the extended-property procedures are gated, so an ordinary procedure taking a MAX argument is not blamed',
        `const EXTENDED_PROPERTY_PROCS = /\\b(?:sp_addextendedproperty|sp_updateextendedproperty)\\b/gi;`,
        `const EXTENDED_PROPERTY_PROCS = /\\b(?:sp_addextendedproperty|sp_updateextendedproperty|spSomethingElse)\\b/gi;`],
    ['sqlvariant/declare-only', 'only a variable inside a DECLARE statement is a MAX-typed candidate, so a procedure parameter named @Value cannot be mistaken for the call\'s argument',
        `    for (const decl of sql.matchAll(DECLARE_STATEMENT)) {\n        for (const m of decl[1].matchAll(MAX_TYPED_DECLARATION)) {\n            maxTyped.set(m[1].toLowerCase(), m[2].toUpperCase().replace(/\\s+/g, ''));\n        }\n    }`,
        `    for (const m of sql.matchAll(MAX_TYPED_DECLARATION)) {\n        maxTyped.set(m[1].toLowerCase(), m[2].toUpperCase().replace(/\\s+/g, ''));\n    }`],
    ['sqlvariant/blank-line-terminates', 'a blank line ends an unterminated call, so a missing semicolon cannot swallow the rest of the file into one argument list',
        `const terminator = sql.slice(from).search(/;|\\n\\s*\\n|^\\s*GO\\s*$/m);`,
        `const terminator = sql.slice(from).search(/;|^\\s*GO\\s*$/m);`],
    ['sqlvariant/teardown-scanned', 'migrations-teardown is scanned by CHECK 6 too — a teardown that cannot execute is as fatal as an install that cannot',
        `for (const dirName of [...SHIPPED_MIGRATION_DIRS, 'migrations-teardown']) {`,
        `for (const dirName of [...SHIPPED_MIGRATION_DIRS]) {`],

    // --- the masking layer: the gate's worst bug history, every entry a former silent pass -------
    ['mask/code-units', 'the mask is built from UTF-16 code units, so an astral character cannot slide it out of alignment with the source',
        `    const structure = sql.split('');\n    const values = sql.split('');`,
        `    const structure = [...sql];\n    const values = [...sql];`],
    ['mask/block-comment-first-close', 'a block comment ends at the FIRST `*/`, so an unbalanced `/*` in prose cannot blindfold the rest of the file',
        `            const close = sql.indexOf('*/', i + 2);`,
        `            let close = sql.indexOf('*/', i + 2); { let d = 1, k = i + 2; while (k < sql.length && d > 0) { if (sql.slice(k, k + 2) === '/*') { d++; k += 2; } else if (sql.slice(k, k + 2) === '*/') { d--; close = d === 0 ? k : close; k += 2; } else k++; } if (d > 0) close = -1; }`],
    ['mask/line-comment', 'a `--` comment is blanked, so prose about a violation is not read as the violation',
        `        if (pair === '--') {`, `        if (false) {`],
    ['mask/block-comment', 'a `/* */` comment is blanked, so a commented-out record is not read as a live grant',
        `        } else if (pair === '/*') {`, `        } else if (false) {`],
    ['mask/string-body', 'a string literal\'s body is blanked on the structure mask, so a `;` or an `EXEC` inside prose cannot truncate a statement',
        '            blankStructureOnly(i + 1, j); // quotes stay, so offsets and token shape are preserved', '            '],
    ['mask/escaped-quote', "an escaped `''` does not end a string literal, so an apostrophe in a description cannot invert code and prose for the rest of the file",
        `j += sql[j] === "'" ? 2 : 1;`, 'j += 1;'],
    ['mask/values-keeps-comments-out', 'the values mask blanks comments too, so a comment can never supply an argument value',
        `    const blankBoth = (from, to) => {\n        for (let k = from; k < to; k++) {\n            if (structure[k] === '\\n') continue;\n            structure[k] = ' ';\n            values[k] = ' ';\n        }\n    };`,
        `    const blankBoth = (from, to) => {\n        for (let k = from; k < to; k++) {\n            if (structure[k] === '\\n') continue;\n            structure[k] = ' ';\n        }\n    };`],

    // --- batching and statement scanning ---------------------------------------------------------
    ['scan/go-batches', 'variables are traced PER `GO` batch, so a suffix reused across records cannot let a later binding overwrite an earlier one',
        `    const ranges = [];\n    let start = 0;\n    for (const match of masked.matchAll(/^[ \\t]*GO[ \\t]*$/gim)) {\n        ranges.push([start, match.index]);\n        start = match.index + match[0].length;\n    }\n    ranges.push([start, masked.length]);\n    return ranges;`,
        '    return [[0, masked.length]];'],
    ['scan/assignment-terminators', 'a `SET` value ends at the next `EXEC`/`EXECUTE`/`DECLARE` as well as at `;`, so an unterminated assignment cannot swallow the statement after it',
        '/(?:\\b(?:SET|EXEC|EXECUTE|DECLARE)\\b|;)/iy', '/(?:\\bSET\\b|;)/iy'],
    ['scan/args-end-at-next-exec', 'an argument list ends at the next `EXEC` as well as at `;`, so two calls in one unterminated batch cannot merge into one argument map',
        `            const argsTo = scanToDepthZero(structure, argsFrom, to, (i, char) => {\n                if (char === ';') return true;\n                nextCall.lastIndex = i;\n                return nextCall.test(structure);\n            });`,
        `            const argsTo = scanToDepthZero(structure, argsFrom, to, (i, char) => char === ';');`],
    ['scan/variable-chase', 'a variable is chased through more than one hop, so a `SET @A = @B` chain still resolves',
        'const MAX_VARIABLE_CHASE = 8;', 'const MAX_VARIABLE_CHASE = 1;'],
    ['scan/unset-variable-is-null', 'a DECLAREd-but-never-SET variable resolves to NULL, which is what it is at run time',
        '        if (assigned === undefined) return null; // DECLAREd and never SET — NULL at run time',
        '        if (assigned === undefined) return value;'],

    // --- recognising a permission call at all ----------------------------------------------------
    ['call/schema-prefix-optional', 'the schema prefix is OPTIONAL, so an unqualified `EXEC spCreateEntityPermission` is still read',
        '(?:(?:\\[[^\\]]*\\]|[\\w${}]+)\\s*\\.\\s*)?\\[?(sp', '(?:(?:\\[[^\\]]*\\]|[\\w${}]+)\\s*\\.\\s*)\\[?(sp'],
    ['call/schema-prefix-bracketed', 'a BRACKETED schema prefix is read',
        '(?:(?:\\[[^\\]]*\\]|[\\w${}]+)\\s*\\.\\s*)?', '(?:[\\w${}]+\\s*\\.\\s*)?'],
    ['call/schema-prefix-bare', 'a BARE schema prefix is read, so `EXEC dbo.spCreateEntityPermission` is not invisible',
        '(?:(?:\\[[^\\]]*\\]|[\\w${}]+)\\s*\\.\\s*)?', '(?:\\[[^\\]]*\\]\\s*\\.\\s*)?'],
    ['call/execute-spelling', 'the `EXECUTE` spelling is read, not just `EXEC`',
        '/\\bEXEC(?:UTE)?\\s+(?:(?:\\[', '/\\bEXEC\\s+(?:(?:\\['],
    ['call/seed-file-spellings', 'the seed file class matches `MetadataSync` too, so a naming slip cannot walk a generated seed past the gate',
        'const METADATA_SEED_FILE = /Metadata[_ -]?Sync.*\\.sql$/i;', 'const METADATA_SEED_FILE = /Metadata_Sync.*\\.sql$/i;'],
    ['call/backstop', 'the gate asserts it parsed every call it saw, so zero understood calls cannot read as a clean file',
        '            if (mentions > calls.length) {', '            if (false) {'],
    ['call/backstop-excludes-comments', 'the backstop does not count a procedure name that appears only in a comment',
        'return [...maskSql(sql).values.matchAll(/sp(?:Create|Update)EntityPermission/gi)].length;',
        'return [...sql.matchAll(/sp(?:Create|Update)EntityPermission/gi)].length;'],
    ['call/backstop-independent-of-string-mask', 'the backstop counts on the values mask, so it stays independent of the string-scanning layer whose desync it exists to detect',
        'return [...maskSql(sql).values.matchAll(', 'return [...maskSql(sql).structure.matchAll('],

    // --- whose grant is it, and on what ----------------------------------------------------------
    ['identity/role-name-collation', "the role name is compared as SQL Server compares it — case-insensitively, ignoring trailing blanks",
        'return name.trimEnd().toLowerCase() === RESPONDENT_ROLE_NAME.toLowerCase();',
        'return name === RESPONDENT_ROLE_NAME;'],
    ['identity/uuid-case', 'a literal UUID is normalised to upper case, so a lower-case id still matches the role and the guarded table',
        'return match ? match[1].toUpperCase() : null;', 'return match ? match[1] : null;'],
    ['identity/uuid-n-prefix', "a UUID literal written `N'…'` is read as a UUID",
        "const UUID_LITERAL = new RegExp(`^N?'(", "const UUID_LITERAL = new RegExp(`^'("],
    ['identity/entity-by-name', 'an entity named through a `WHERE Name = N\'…\'` subselect is resolved, so rule 4 knows which grant it is looking at',
        'return { entityId: literalUuid(value), entityName: readQuotedName(value) };',
        'return { entityId: literalUuid(value), entityName: null };'],
    ['identity/role-substring-fallback', 'a `@RoleID` expression neither reader parses is still attributed to the role when it names it literally',
        "return value.includes(`'${RESPONDENT_ROLE_NAME}'`) ? 'respondent' : 'unknown';", "return 'unknown';"],
    ['identity/absent-vs-unknown', 'an absent `@RoleID` is reported as absent rather than as an expression the gate cannot model — two different facts about why it cannot tell',
        `    if (!present) return 'absent';`, `    if (!present) return 'unknown';`],
    ['identity/unresolvable-is-reported', '"I cannot tell whose grant this is" is reported, never treated as "this grant is fine"',
        `    if (grant.role !== 'respondent') {`, `    if (false) {`],
    ['identity/other-roles-skipped', "a call that provably binds another role says nothing, so the gate does not fire on the seed's Developer and Integration records",
        `                if (call.role === 'other') continue;`, `                if (false) continue;`],

    // --- the D2 rules ----------------------------------------------------------------------------
    ['rule/never-a-writer', 'CanUpdate and CanDelete are refused outright for this role, filtered or not',
        '    for (const capability of WRITER_CAPABILITIES) {\n        if (!grant.granted[capability]) continue;',
        '    for (const capability of []) {\n        if (!grant.granted[capability]) continue;'],
    ['rule/delete-is-a-write', 'Delete counts as a write, not just Update — D2.3 names both',
        `const WRITER_CAPABILITIES = ['Update', 'Delete'];`, `const WRITER_CAPABILITIES = ['Update'];`],
    ['rule/read-is-filterable', 'Read is filter-checked, not just Create',
        `const FILTERABLE_CAPABILITIES = ['Create', 'Read'];`, `const FILTERABLE_CAPABILITIES = ['Create'];`],
    ['rule/null-filter', 'a granted capability with no row-level-security filter is a violation',
        '        if (nullReason) {', '        if (false) {'],
    ['rule/clear-without-restating', 'clearing a filter for a capability the call never mentions is a violation on its own — the #41 shape',
        '        if (!grant.granted[capability] && !grant.stated[capability] && filter.cleared) {',
        '        if (false) {'],
    ['rule/wrong-filter-record', 'a guarded pair pointed at another filter record is a violation even though it is non-NULL',
        'if (guarded && stated && stated !== guarded.filterId) {', 'if (false) {'],
    ['rule/guard-key-capability', 'the guarded table is keyed on capability as well as entity, so a Create grant is not judged against the Read row\'s filter',
        '(g) => g.capability === capability && (g.entityId === grant.entityId || g.entityName === grant.entityName),',
        '(g) => (g.entityId === grant.entityId || g.entityName === grant.entityName),'],
    ['rule/guard-key-entity-id', 'the guarded table matches on entity ID, so a grant named by literal id reaches rule 4',
        '(g.entityId === grant.entityId || g.entityName === grant.entityName)', '(g.entityName === grant.entityName)'],
    ['rule/guard-key-entity-name', 'the guarded table matches on entity NAME, so a grant named by subselect reaches rule 4',
        '(g.entityId === grant.entityId || g.entityName === grant.entityName)', '(g.entityId === grant.entityId)'],
    ['rule/flag-fails-closed', 'a capability flag the parser cannot reduce to a literal counts as GRANTED — "I cannot read this" is not "not granted"',
        `    return value !== null && !/^N?'?0'?$/.test(value.trim());`,
        `    return value !== null && value.trim() === '1';`],
    ['rule/absent-flag-is-not-granted', 'a flag the call never mentions is not treated as granted',
        '    if (!args.has(name)) return false;', '    if (!args.has(name)) return true;'],

    // --- which files are in scope ----------------------------------------------------------------
    ['scope/unstamped-is-checked', 'a seed whose filename carries no version stamp is checked rather than skipped — an unorderable file is the one most likely to land last',
        'return stamp === null || Number(stamp[1]) > RESPONDENT_HARDENING_WATERSHED;',
        'return stamp !== null && Number(stamp[1]) > RESPONDENT_HARDENING_WATERSHED;'],
    ['scope/watershed-is-exclusive', 'the watershed itself is EXEMPT — `>` not `>=` — because the hardening migration has the last word at its own stamp',
        'Number(stamp[1]) > RESPONDENT_HARDENING_WATERSHED', 'Number(stamp[1]) >= RESPONDENT_HARDENING_WATERSHED'],
    ['scope/migrations-pg', 'migrations-pg/ is scanned, so the first PostgreSQL seed is checked from birth',
        `const SHIPPED_MIGRATION_DIRS = ['migrations', 'migrations-pg'];`, `const SHIPPED_MIGRATION_DIRS = ['migrations'];`],

    // --- CHECK 2 -----------------------------------------------------------------------------------
    //
    // Six `seed/*` mutants pinned CHECK 1, the hash manifest, and were removed with it in #105. They
    // are not replaced here: what took CHECK 1's place is a release-readiness check on the actual
    // property (scripts/check-release-seed-coverage.mjs), which has its own spec and is not part of
    // this gate.
    ['placeholder/teardown-map', 'teardown scripts get the stricter map — MJ substitutes only ${mjSchema} there',
        `dir.endsWith('migrations-teardown') ? new Set(['mjSchema']) : INSTALL_SUPPLIED_PLACEHOLDERS`,
        'INSTALL_SUPPLIED_PLACEHOLDERS'],

    // --- CHECK 4: ID-only guards on core-metadata inserts (#64 / #66) -----------------------------
    ['idguard/predicate-is-id-only', 'a guard is flagged ONLY when its predicate is nothing but `[ID] = …`, so the OR-joined natural-key shape passes',
        `const ID_ONLY_PREDICATE = /^\\s*\\[?ID\\]?\\s*=\\s*(?:N?'[^']*'|@\\w+)\\s*$/i;`,
        `const ID_ONLY_PREDICATE = /\\[?ID\\]?\\s*=\\s*(?:N?'[^']*'|@\\w+)/i;`],
    ['idguard/where-clause-read', 'the predicate is read from the subquery\'s WHERE, so a guard with no WHERE at all is not treated as ID-only',
        '        if (predicate === null || !ID_ONLY_PREDICATE.test(predicate)) continue;',
        '        if (predicate !== null && !ID_ONLY_PREDICATE.test(predicate)) continue;'],
    ['idguard/not-exists-subquery-only', 'the predicate comes from INSIDE the `NOT EXISTS (…)`, so a companion `AND EXISTS (…)` outside it cannot rescue an ID-only guard',
        '        const predicate = whereClauseOf(structure.slice(open + 1, close));',
        '        const predicate = whereClauseOf(structure.slice(open + 1, governedStatement(structure, close + 1)[0]));'],
    ['idguard/core-tables-only', 'only the seven core `__mj` metadata tables are ruled on, so this app\'s own ID-guarded inserts are left alone',
        '            if (CORE_METADATA_TABLES.has(insert[1].toLowerCase())) {', '            if (true) {'],
    ['idguard/table-list-complete', 'the table list carries all seven, so dropping the constrained ones (whose failure is loud, not silent) is noticed',
        `['entity', 'entityfield', 'entityfieldvalue', 'entityrelationship', 'entitypermission', 'applicationentity', 'entitysetting']`,
        `['entityfieldvalue', 'entityrelationship', 'entitysetting', 'entitypermission']`],
    ['idguard/watershed', 'only migrations AFTER the watershed are scanned, so the five shipped offenders nobody may edit do not fail a healthy tree',
        '            .filter((f) => f.endsWith(\'.sql\') && landsAfter(f, ID_ONLY_GUARD_WATERSHED))',
        '            .filter((f) => f.endsWith(\'.sql\'))'],
    ['idguard/watershed-is-exclusive', 'the watershed is EXCLUSIVE, so the offender at the stamp itself stays exempt',
        '    return stamp === null || Number(stamp[1]) > watershed;',
        '    return stamp === null || Number(stamp[1]) >= watershed;'],
    ['idguard/governed-block', 'a guard governs its whole `BEGIN … END`, so an insert two lines below the guard is still attributed to it',
        `            if (keyword === 'BEGIN') return [i, matchingEnd(text, i)];`,
        `            if (keyword === 'BEGIN') return [i, i];`],
    ['idguard/masked-source', 'the scan reads the comment-blanked mask, so prose describing a bad guard is not read as one',
        '    const { structure } = maskSql(sql);', '    const structure = sql;'],
    ['idguard/stops-at-any-statement', 'the scan stops at the FIRST statement of any kind, so a guard over a PRINT cannot reach forward and blame the next insert',
        '            if (!GOVERNED_DML.has(keyword)) return [i, i];', '            if (!GOVERNED_DML.has(keyword)) continue;'],
    ['idguard/unguarded-inserts', 'a core insert with NO guard at all is reported, not merely invisible to a walk that starts from guards',
        '        if (guarded.some(([from, to]) => insert.index >= from && insert.index < to)) continue;',
        '        continue;'],
    ['schemasync/parse-accounting', 'CHECK 5 counts the sync calls it should have parsed, so a removed or variable-bound list is caught instead of unseen',
        '            if (calls > parsed) {', '            if (false) {'],
    ['schemasync/history-floor', 'CHECK 5 requires everything the repo has already shipped, not only the hand-written floor',
        '            ...previouslyExcluded(lists, list.stamp),', '            ...[],'],
    ['schemasync/reports-the-narrowing', 'CHECK 5 reports a narrowed list rather than computing the difference and discarding it',
        '        if (missing.length > 0) {', '        if (false) {'],
    ['schemasync/watershed', 'CHECK 5 skips migrations older than the watershed instead of gating every file ever shipped',
        '        if (list.stamp < SCHEMA_SYNC_GATE_FROM) continue;', '        if (false) continue;'],
    ['schemasync/proc-floor', 'the accounting knows the procs CodeGen emits even when no call in the corpus passes the argument',
        "        'spdeleteunneededentityfields',", "        'spnevermatches',"],
    ['schemasync/backstop-independent-of-string-mask', "CHECK 5's accounting counts on `values`, so a call hidden in a dynamic-SQL literal cannot slip past it",
        "            const calls = countSchemaSyncCalls(maskSql(readFileSync(path, 'utf-8')).values, procNames);",
        "            const calls = countSchemaSyncCalls(maskSql(readFileSync(path, 'utf-8')).structure, procNames);"],
    ['schemasync/unbracketed-call', 'a call counts whether or not the procedure name is bracketed — T-SQL makes that optional',
        '    for (const call of sql.matchAll(/\\bEXEC(?:UTE)?\\s+(?:\\[[^\\]]*\\]|[\\w$.{}]+)?\\s*\\.?\\s*\\[?"?(sp\\w+)/gi)) {',
        '    for (const call of sql.matchAll(/\\bEXEC(?:UTE)?\\s+(?:\\[[^\\]]*\\]|[\\w$.{}]+)?\\s*\\.?\\s*\\["?(sp\\w+)/gi)) {'],
    ['schemasync/unqualified-exec', 'an `EXEC spX` with no schema qualifier is counted too',
        '    for (const call of sql.matchAll(/\\bEXEC(?:UTE)?\\s+(?:\\[[^\\]]*\\]|[\\w$.{}]+)?\\s*\\.?\\s*\\[?"?(sp\\w+)/gi)) {',
        '    for (const call of sql.matchAll(/\\bEXEC(?:UTE)?\\s+(?:\\[[^\\]]*\\]|[\\w$.{}]+)\\s*\\.\\s*\\[?"?(sp\\w+)/gi)) {'],
    ['schemasync/call-syntax-required', 'the accounting counts a call only where a keyword introduces it, so a procedure named in prose is not a call',
        '    for (const call of sql.matchAll(/\\bEXEC(?:UTE)?\\s+(?:\\[[^\\]]*\\]|[\\w$.{}]+)?\\s*\\.?\\s*\\[?"?(sp\\w+)/gi)) {',
        '    for (const call of sql.matchAll(/[.["](sp\\w+)/gi)) {'],
    ['schemasync/unorderable-fails-safe', 'a shipped .sql whose version this gate cannot order is gated, not exempted',
        "    return stamp === null ? '999999999999' : stamp[1];", '    return stamp === null ? null : stamp[1];'],
    ['schemasync/positional-proc-filter', 'the positional matcher reads a list only for a proc known to take one, so a generated CRUD function is not mistaken for a schema sync',
        '        if (procNames.has(positional[1].toLowerCase())) {\n            found.push(positional[2]);\n        }',
        '        found.push(positional[2]);'],
    ['schemasync/pg-positional', 'exclusion lists are read in BOTH dialects, so the PostgreSQL positional form is not invisible',
        '    for (const positional of sql.matchAll(/"(sp\\w+)"\\s*\\(\\s*\'([^\']*)\'/gi)) {',
        '    for (const positional of []) {'],

    // --- CHECK 7: an entity id shipped SQL references is one shipped SQL seeds (#155) -------------
    //
    // The reference side carries four shapes, each found in this repo's own migrations. Dropping one
    // is SILENT — the id it would have reported simply is not reported — so each gets its own
    // mutant. The seed side fails the other way (a missed seed makes every reference to that id
    // fire), which is why its mutants are about INVENTING a seed rather than missing one.
    ['check7/registered', 'CHECK 7 runs at all — an unregistered check reads no SQL and reports nothing',
        '    checkEntityIdReferences(repoRoot, violations);\n', ''],
    ['check7/shape-column', 'an `EntityID = \'<guid>\'` comparison is read as a reference — the guard shape #155 shipped',
        '        pattern: ENTITY_ID_COLUMN_REFERENCE,', '        pattern: /(?!)/g,'],
    ['check7/shape-annotation', "CodeGen's positional `'<guid>', -- Entity: <name>` is read as a reference",
        '        pattern: QUOTED_UUID,', '        pattern: /(?!)/g,'],
    ['check7/shape-entityids', 'the `@EntityIDs` scoping argument is read as a reference — an id it cannot resolve makes the sweep unscoped',
        '        pattern: ENTITY_IDS_ARGUMENT,', '        pattern: /(?!)/g,'],
    ['check7/shape-variable', "a generated metadata seed's `@EntityID_<hash>` variable is read as a reference",
        '        pattern: GENERATED_ENTITY_ID_VARIABLE,', '        pattern: /(?!)/g,'],
    ['check7/related-column', '`RelatedEntityID` is read as well as `EntityID` — both columns point at the same table',
        "const ENTITY_ID_COLUMNS = '(?:Related)?EntityID';", "const ENTITY_ID_COLUMNS = 'EntityID';"],
    ['check7/identifier-boundary', "a longer identifier ending in EntityID stays out of scope, so the check does not silently widen past the two columns CodeGen writes (`TargetEntityID` is an entity FK too, and is deliberately not read)",
        "const NOT_PART_OF_A_LONGER_NAME = '(?<![\\\\w@])';", "const NOT_PART_OF_A_LONGER_NAME = '';"],
    ['check7/entityids-list', 'the `@EntityIDs` argument is split on commas, so an unseeded id hiding behind a seeded one is still read',
        "        read: (match) => match[1].split(',').map((token) => token.trim()).filter((token) => BARE_UUID.test(token)),",
        '        read: (match) => [match[1]],'],
    ['check7/entityids-token-filter', 'only UUID-shaped tokens of that list are read, so a trailing separator does not report an empty id',
        '.filter((token) => BARE_UUID.test(token)),', ','],
    ['check7/annotation-confirmed', 'a quoted UUID is a reference only when the annotation confirms it, so every guid in the file is not read as an entity id',
        '            if (confirm !== undefined && !confirm(sql, match)) continue;', '            if (false) continue;'],
    ['check7/annotation-same-line', "the `-- Entity:` annotation must sit on the SAME LINE as the value it labels, so CodeGen's file banners do not annotate whatever precedes them",
        'const ENTITY_VALUE_ANNOTATION = /^[ \\t]*,?[ \\t]*--[ \\t]*(?:Related)?Entity:/i;',
        'const ENTITY_VALUE_ANNOTATION = /^\\s*,?\\s*--\\s*(?:Related)?Entity:/i;'],
    ['check7/annotation-related', 'the `-- RelatedEntity:` spelling of the annotation is read too',
        '--[ \\t]*(?:Related)?Entity:/i;', '--[ \\t]*Entity:/i;'],
    ['check7/references-masked', 'references are read off the comment-blanked mask, so the provenance note the fixed migration carries is not read as the defect it describes',
        '    const { values } = maskSql(sql);', '    const values = sql;'],
    ['check7/seeds-masked', 'seeds are read off the comment-blanked mask too, so a commented-out `[Entity]` insert seeds nothing',
        'export function findSeededEntityIds(sql) {\n    const { structure, values } = maskSql(sql);',
        'export function findSeededEntityIds(sql) {\n    const structure = sql, values = sql;'],
    ['check7/seed-id-column-lookup', 'the `[ID]` value is located by column NAME, so a seed that does not list it first is still read',
        '        const idColumn = topLevelItemRanges(structure, columnsOpen + 1, columnsClose)\n            .findIndex(([from, to]) => bareColumnName(structure.slice(from, to)) === \'id\');',
        '        const idColumn = 0;'],
    ['check7/seed-table-exact', 'only `[Entity]` is a seed, so `[EntityField]` — whose first column is an [ID] too — cannot invent one',
        `(?:\\\\[Entity\\\\]|"Entity"|Entity)`, `(?:\\\\[Entity\\\\w*\\\\]|"Entity"|Entity)`],
    ['check7/values-row-adjacent', "the VALUES row must FOLLOW the column list immediately, so an `INSERT … SELECT` cannot pair with the next statement's row and seed a foreign id",
        "    if (match === null || structure.slice(after, match.index).trim() !== '') return null;",
        '    if (match === null) return null;'],
    ['check7/seeds-are-read', 'the seeded set is actually collected, so a correctly seeded id is not reported',
        '    const seeded = new Set();\n    for (const { sql } of shippedSqlFiles(repoRoot, ENTITY_SEED_DIRS)) {\n        for (const id of findSeededEntityIds(sql)) seeded.add(id);\n    }',
        '    const seeded = new Set();'],
    ['check7/teardown-not-a-seed', 'a teardown may not SEED — it only ever deletes an [Entity] row, so it cannot license a reference elsewhere',
        'const ENTITY_SEED_DIRS = SHIPPED_MIGRATION_DIRS;',
        "const ENTITY_SEED_DIRS = [...SHIPPED_MIGRATION_DIRS, 'migrations-teardown'];"],
    ['check7/teardown-references', 'a teardown IS read for references — a hardcoded id there deletes nothing on a host that minted its own',
        "const ENTITY_REFERENCE_DIRS = [...SHIPPED_MIGRATION_DIRS, 'migrations-teardown'];",
        'const ENTITY_REFERENCE_DIRS = SHIPPED_MIGRATION_DIRS;'],
    ['check7/uuid-case', 'a referenced id is normalised to upper case, so CodeGen writing the seed lower-case and the reference upper-case is not read as two different entities',
        '            for (const id of read(match)) found.push({ id: id.toUpperCase(), line, shape });',
        '            for (const id of read(match)) found.push({ id, line, shape });'],
];

/**
 * Code asserted to have NO observable behaviour, which must therefore SURVIVE. Both entries are
 * findings, not oversights, and both are listed so the next reader who notices "there is no test for
 * this" gets an answer instead of writing one that proves nothing.
 *
 * To re-derive either claim rather than taking it on trust: import the gate and a copy patched with
 * the entry's `replace`, then compare `findPermissionCalls` + `countPermissionProcedureMentions`
 * across every shipped `.sql` file and a sweep of short strings built from the alphabet that
 * can matter here — newline, CR, quote, `-`, `*`, `/`, `;`, `(`, `)`, and the letters of GO and
 * EXEC. That is how these two were established, and an entry that stops surviving this list is
 * telling you the sweep has found something the sweep that wrote it did not.
 */
const EQUIVALENT = [
    ['equivalent/crlf-in-go', 'ECMAScript counts CR as a LineTerminator, so `$` under /m already matches before it; a `\\r?` here is unobservable and only looks like CRLF support',
        '/^[ \\t]*GO[ \\t]*$/gim', '/^[ \\t]*GO[ \\t]*\\r?$/gim'],
    ['equivalent/newline-preserved-in-mask', 'newlines survive blanking so a mask lines up with the source when printed; nothing downstream reads line structure, so this is debuggability, not behaviour',
        `            if (structure[k] === '\\n') continue;\n            structure[k] = ' ';\n            values[k] = ' ';`,
        `            structure[k] = ' ';\n            values[k] = ' ';`],
];

/**
 * How long one spec run may take before it is a hang rather than a slow test. The whole suite runs
 * in well under a second; a minute is "something is badly wrong", not "this machine is loaded".
 */
const SPEC_TIMEOUT_MS = 60_000;

/**
 * A repo-shaped directory whose `scripts/` is real files and whose data directories are symlinks —
 * the spec resolves REPO_ROOT from its own location, so it must sit two levels inside something that
 * looks like this repo, but the three migration directories are read-only to it and cost nothing to
 * share. `metadata/` is NOT among them: with CHECK 1 gone the gate reads only SQL, so a link to it
 * would be a dependency this harness does not have.
 *
 * The teardown below `rmSync`s this tree, and its children are links INTO the working tree. That is
 * safe — Node unlinks a symlink rather than recursing through it — but it is worth saying out loud:
 * nothing in this file may ever follow these links while deleting.
 */
function buildHarnessTree() {
    const root = mkdtempSync(join(tmpdir(), 'seed-mutants-'));
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts', 'check-distribution-seed.spec.mjs'), readFileSync(SPEC, 'utf-8'));
    for (const dir of ['migrations', 'migrations-pg', 'migrations-teardown']) {
        if (existsSync(join(REPO_ROOT, dir))) symlinkSync(join(REPO_ROOT, dir), join(root, dir), 'dir');
    }
    return root;
}

/**
 * Runs the spec in the harness tree against whatever gate source it is handed.
 *
 * Reports WHY a non-zero exit happened rather than collapsing every throw into "killed". The
 * distinction is the whole correctness of this harness: a spec that fails cases has measured the
 * mutant, and a spec that dies on import, on a timeout, or on a tree that is not repo-shaped has
 * measured nothing while looking identical from the exit code alone.
 */
function runSpec(root, gateSource) {
    writeFileSync(join(root, 'scripts', 'check-distribution-seed.mjs'), gateSource);
    try {
        execFileSync(process.execPath, [join(root, 'scripts', 'check-distribution-seed.spec.mjs')], {
            stdio: 'pipe',
            timeout: SPEC_TIMEOUT_MS,
        });
        return { outcome: 'passed' };
    } catch (error) {
        if (error.killed || error.signal) {
            return { outcome: 'crashed', detail: `the spec did not finish within ${SPEC_TIMEOUT_MS / 1000}s (${error.signal ?? 'killed'})` };
        }
        const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        const failed = [...output.matchAll(/^ {2}✗ (.*?)(?: — |$)/gm)].map((m) => m[1]);
        if (failed.length === 0) {
            const lastLine = output.trim().split('\n').filter(Boolean).pop() ?? '(no output)';
            return { outcome: 'crashed', detail: `the spec exited ${error.status} without naming a failed case — ${lastLine.slice(0, 160)}` };
        }
        return { outcome: 'failed', failed };
    }
}

/** Applies one mutant and reports what the spec made of it. */
function runMutant(root, source, [id, behaviour, find, replace]) {
    const occurrences = source.split(find).length - 1;
    if (occurrences !== 1) {
        return { id, behaviour, outcome: 'not-applied', detail: `\`find\` matched ${occurrences} times, expected exactly 1` };
    }
    const result = runSpec(root, source.replace(find, replace));
    if (result.outcome === 'passed') return { id, behaviour, outcome: 'survived' };
    if (result.outcome === 'crashed') return { id, behaviour, outcome: 'crashed', detail: result.detail };
    return { id, behaviour, outcome: 'killed', killers: result.failed };
}

/**
 * The two lists differ only in which outcome is the healthy one, so they run through one loop. Every
 * other outcome — including a crash, whichever list it came from — is a failure either way.
 */
const SUITES = [
    { entries: MUTANTS, healthy: 'killed', heading: 'behaviours that must stay pinned' },
    { entries: EQUIVALENT, healthy: 'survived', heading: 'code asserted to have no observable behaviour' },
];

/** What to tell someone who has never read this file, for each way an entry can fail. */
function explainFailure({ id, behaviour, outcome, detail }, healthy) {
    if (outcome === 'crashed') {
        return `${id} — ${detail}. Nothing was measured: a spec that dies is not a spec that noticed. Fix the crash, or re-author the mutant so it breaks the BEHAVIOUR rather than the module.`;
    }
    if (outcome === 'not-applied') {
        return `${id} — ${detail}, so nothing was measured. The gate was refactored and this mutant's anchor went stale; re-anchor it on the code that carries the behaviour now: ${behaviour}.`;
    }
    if (healthy === 'killed') {
        return `${id} — no spec case notices when this is removed: ${behaviour}. Add one, or move the entry to EQUIVALENT with the reason no input can distinguish it.`;
    }
    return (
        `${id} — this was asserted to have no observable behaviour (${behaviour}), and a spec case now kills it. ` +
        'Either the code gained behaviour, or the case asserts something it should not. Resolve it, then move the entry to MUTANTS.'
    );
}

// Read the gate before building anything: a missing or unreadable gate must fail before there is a
// temp directory to leak, not after.
const source = readFileSync(GATE, 'utf-8');
const root = buildHarnessTree();
const failures = [];
const healthy = { killed: 0, survived: 0 };

try {
    // BASELINE. The unmutated gate must make the spec PASS before a single mutant is applied.
    // Without this the harness cannot tell "every behaviour is pinned" from "every run is broken",
    // because both make every spec run exit non-zero. It is one extra second and it is the
    // difference between measuring something and reporting a colour.
    const baseline = runSpec(root, source);
    if (baseline.outcome !== 'passed') {
        const why = baseline.outcome === 'failed' ? `${baseline.failed.length} case(s) already failing: ${baseline.failed.join(' | ')}` : baseline.detail;
        console.error(`❌ Baseline run failed — ${why}\n`);
        console.error('   The spec must pass against the UNMUTATED gate before any mutant means anything.');
        console.error('   Run `node scripts/check-distribution-seed.spec.mjs` and fix that first.\n');
        process.exit(1);
    }
    console.log(`distribution-gate mutation check: baseline green, ${MUTANTS.length} behaviours, ${EQUIVALENT.length} asserted equivalent\n`);

    for (const { entries, healthy: wanted, heading } of SUITES) {
        console.log(`  ${heading}:`);
        for (const entry of entries) {
            const result = runMutant(root, source, entry);
            if (result.outcome === wanted) {
                healthy[wanted]++;
                const how = wanted === 'killed' ? `killed by ${result.killers.length} case(s)` : 'still unobservable';
                console.log(`    ✓ ${result.id.padEnd(44)} ${how}`);
            } else {
                console.log(`    ✗ ${result.id.padEnd(44)} ${result.outcome.toUpperCase().replace('-', ' ')}`);
                failures.push(explainFailure(result, wanted));
            }
        }
        console.log('');
    }
} finally {
    rmSync(root, { recursive: true, force: true });
}

if (failures.length > 0) {
    console.error("❌ Mutation check failed — the distribution gate's spec is not holding what it claims:\n");
    for (const failure of failures) console.error(`  • ${failure}`);
    console.error('');
    process.exit(1);
}
console.log(
    `✅ Mutation check passed — all ${healthy.killed} load-bearing behaviours are killed by the spec, and ` +
        `${healthy.survived} asserted-unobservable ones remain unobservable.`,
);
