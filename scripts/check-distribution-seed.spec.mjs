#!/usr/bin/env node
/**
 * Proves the distribution gate FIRES. A gate nobody has seen fail is indistinguishable from a
 * gate that returns "pass" unconditionally — and this one guards a defect class whose whole
 * character is that everything looks fine from inside.
 *
 * Plain Node rather than Vitest on purpose: the gate is stdlib-only so it can run in CI without
 * `npm ci`, and its test should not reintroduce the dependency it was designed to avoid.
 *
 * CASE NUMBERS ARE STABLE, INCLUDING THE GAPS. Cases 1–4, 47 and 48 covered CHECK 1, the hash
 * manifest retired in #105, and went with it; the numbers are not reused. Dozens of comments below
 * cite each other by number ("the shape case 43 covers", "case 18 pins…") and renumbering would
 * make every one of those quietly wrong — which is the class of defect this whole file exists to
 * catch. A gap is a fact about the history; a stale cross-reference is a lie.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
    runChecks,
    findRespondentGrants,
    findPermissionCalls,
    countPermissionProcedureMentions,
    findIdOnlyGuardedInserts,
    RESPONDENT_GUARDED_GRANTS,
} from './check-distribution-seed.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(name, condition, detail) {
    if (condition) {
        console.log(`  ✓ ${name}`);
    } else {
        console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
        failures++;
    }
}

/**
 * A minimal repo-shaped fixture: whatever migrations the case needs, and nothing else.
 *
 * It used to copy the whole real `metadata/` tree into every fixture, because CHECK 1 hashed it.
 * With CHECK 1 gone the gate reads only SQL, so the copy would be 87 pointless tree copies per
 * run — and the mutation harness runs this whole spec once per mutant.
 *
 * 87 is measured, not counted by eye: `mkdtempSync` fires that many times per run, identically over
 * three runs. There are only 11 `withFixture` call sites; the rest come from the table-driven loops,
 * which is exactly why reading the number off the source gives 43 and gives it confidently.
 */
function fixture(build) {
    const root = mkdtempSync(join(tmpdir(), 'dist-gate-'));
    mkdirSync(join(root, 'migrations'), { recursive: true });
    build(root);
    return root;
}

function withFixture(build, assert) {
    const root = fixture(build);
    try {
        assert(runChecks(root), root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

console.log('distribution gate:');

// 1–4 were CHECK 1's cases (metadata with no seed, a seed with no manifest, metadata edited after
//     the manifest was written, and a rewritten `sync` block that must NOT fire). They were removed
//     with CHECK 1 in #105 — see this file's header for why the numbers are not reused.

// 5. The placeholder leak, in the form it actually shipped in.
withFixture(
    (root) => {
        writeFileSync(
            join(root, 'migrations', 'V2__Leak.sql'),
            "EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,${commonSchema}';\n",
        );
    },
    (violations) => {
        check(
            'flags a placeholder the install engine cannot resolve',
            violations.some((v) => v.includes('commonSchema')),
            JSON.stringify(violations),
        );
    },
);

// 6. Teardown scripts get a stricter map — only ${mjSchema} is substituted there.
withFixture(
    (root) => {
        mkdirSync(join(root, 'migrations-teardown'), { recursive: true });
        writeFileSync(
            join(root, 'migrations-teardown', 'V001__Teardown.sql'),
            'DELETE FROM [${flyway:defaultSchema}].[Thing];\n',
        );
    },
    (violations) => {
        check(
            'flags the app-schema placeholder in a teardown script, where MJ does not substitute it',
            violations.some((v) => v.includes('migrations-teardown') && v.includes('flyway:defaultSchema')),
            JSON.stringify(violations),
        );
    },
);

// 7. The real repository must pass, or the gate is not describing this codebase.
check('the repository itself passes', runChecks(REPO_ROOT).length === 0, JSON.stringify(runChecks(REPO_ROOT)));

// ---------------------------------------------------------------------------
// CHECK 3 — what a post-hardening seed may grant the anonymous respondent role
// ---------------------------------------------------------------------------

const DENY_CREATE_FILTER = '7F0E0001-A1B2-4C3D-8E4F-000000000001';
const OWN_DISTRIBUTION_FILTER = '7F0E0002-A1B2-4C3D-8E4F-000000000002';
const OWN_VERSIONS_FILTER = '7F0E0003-A1B2-4C3D-8E4F-000000000003';
const FORM_RESPONSES = '63600739-7165-4BDC-B7D7-19A1B1951DFA';
const FORM_DISTRIBUTIONS = '1FC60BDA-25B8-473B-ACE5-1238670D3535';
const FORMS = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8'; // granted nothing after #39 — see V202608131600

/**
 * One filter argument as `mj sync push` would log it. `clear` and `unset` are the two ways the
 * generator writes "no filter" — the 0.8.0 seed uses both at once — and `omit` is what a
 * hand-trimmed call looks like. All three end as NULL in the permission row.
 */
function filterArgument(suffix, capability, spec) {
    const variable = `@${capability}RLSFilterID_${suffix}`;
    if (spec === 'omit') return { sets: [], args: [] };
    if (spec === 'clear') return { sets: [], args: [`@${capability}RLSFilterID = ${variable}`, `@${capability}RLSFilterID_Clear = 1`] };
    if (spec === 'unset') return { sets: [], args: [`@${capability}RLSFilterID = ${variable}`] };
    return { sets: [`SET\n  ${variable} = '${spec}'`], args: [`@${capability}RLSFilterID = ${variable}`] };
}

/**
 * One permission record in the shape the generator actually logs: DECLAREs, per-record SET
 * assignments, then an EXEC whose every argument is a variable reference. Built rather than pasted
 * so each case states only what it is testing — but built in the REAL shape by default, because a
 * hand-simplified `EXEC ... @RoleID = '<literal>'` exercises a parser path the shipped files never
 * take: all twenty `@RoleID` bindings in `V202608081700` go through a variable.
 *
 * `roleBinding` reaches that other path on purpose for case 43. D3 names three ways a call may bind
 * the role — through the call's own SET, as a literal, or as an inline subselect — and the first was
 * the only one any fixture used, so the two the generator does not emit today were unpinned. They
 * are the shapes a future MetadataSync is most likely to switch to, which is the whole reason the
 * gate reads them.
 */
function permissionRecord({
    suffix,
    procedure = 'spCreateEntityPermission',
    entityId = null,
    entityName = null,
    roleBinding = 'byName',
    canCreate = 0,
    canRead = 0,
    canUpdate = 0,
    canDelete = 0,
    createFilter = 'clear',
    readFilter = 'clear',
}) {
    const entity = entityId ? `'${entityId}'` : `(SELECT ID FROM [\${mjSchema}].[Entity] WHERE Name = N'${entityName}')`;
    const role =
        roleBinding === 'byId' || roleBinding === 'inlineById'
            ? "'A18E13FC-B2C1-4E77-A3D7-EE775BDE098C'"
            : `(SELECT ID FROM [\${mjSchema}].[Role] WHERE Name = N'Form Respondent')`;
    // An inline binding writes the value in the EXEC and emits no SET, which is the point of it.
    const inlineRole = roleBinding.startsWith('inline');
    const create = filterArgument(suffix, 'Create', createFilter);
    const read = filterArgument(suffix, 'Read', readFilter);
    return [
        `-- Save MJ: Entity Permissions (core SP call only)`,
        `DECLARE @ID_${suffix} UNIQUEIDENTIFIER,`,
        `@EntityID_${suffix} UNIQUEIDENTIFIER,`,
        `@RoleID_${suffix} UNIQUEIDENTIFIER,`,
        `@CanCreate_${suffix} BIT,`,
        `@CanRead_${suffix} BIT,`,
        `@CanUpdate_${suffix} BIT,`,
        `@CanDelete_${suffix} BIT,`,
        `@ReadRLSFilterID_${suffix} UNIQUEIDENTIFIER,`,
        `@CreateRLSFilterID_${suffix} UNIQUEIDENTIFIER,`,
        `@Type_${suffix} NVARCHAR(10)`,
        `SET\n  @ID_${suffix} = '00000000-0000-4000-8000-0000000000${suffix.slice(0, 2)}'`,
        `SET\n  @EntityID_${suffix} = ${entity}`,
        inlineRole ? null : `SET\n  @RoleID_${suffix} = ${role}`,
        `SET\n  @CanCreate_${suffix} = ${canCreate}`,
        `SET\n  @CanRead_${suffix} = ${canRead}`,
        `SET\n  @CanUpdate_${suffix} = ${canUpdate}`,
        `SET\n  @CanDelete_${suffix} = ${canDelete}`,
        ...create.sets,
        ...read.sets,
        `SET\n  @Type_${suffix} = N'Allow' EXEC [\${mjSchema}].${procedure} @ID = @ID_${suffix},`,
        [
            `  @EntityID = @EntityID_${suffix}`,
            `  @RoleID = ${inlineRole ? role : `@RoleID_${suffix}`}`,
            `  @CanCreate = @CanCreate_${suffix}`,
            `  @CanRead = @CanRead_${suffix}`,
            `  @CanUpdate = @CanUpdate_${suffix}`,
            `  @CanDelete = @CanDelete_${suffix}`,
            ...read.args.map((a) => `  ${a}`),
            ...create.args.map((a) => `  ${a}`),
            `  @Type = @Type_${suffix};`,
        ].join(',\n'),
        '',
        'GO',
        '',
    ]
        .filter((line) => line !== null)
        .join('\n');
}

/** A seed file: the header comment these always carry, then the records. */
function seedSql(...records) {
    return `-- MJ Forms metadata seed (fixture)\n-- =====================================\nGO\n\n${records.join('\n')}`;
}

/**
 * Drops one seed file into an empty repo and asserts on what CHECK 3 says about it.
 *
 * The filter by file name is what makes each case speak for itself: an assertion on the whole
 * violation list would pass or fail on anything else the fixture happened to trip.
 */
function withSeed(fileName, sql, assert) {
    withFixture(
        (root) => writeFileSync(join(root, 'migrations', fileName), sql),
        (violations) => assert(violations.filter((v) => v.includes(fileName))),
    );
}

const POST = 'V202609010000__v0.11.x__Metadata_Sync.sql';
const PRE = 'V202608120000__v0.9.x__Metadata_Sync.sql';

// 8. #41 exactly as reported: a regenerated seed re-clears the create filter on a guarded grant.
withSeed(
    POST,
    seedSql(permissionRecord({ suffix: 'aa11bb22', entityId: FORM_RESPONSES, canCreate: 1, createFilter: 'clear' })),
    (violations) => {
        check(
            'flags a post-watershed seed that clears a guarded CanCreate filter',
            violations.some((v) => v.includes('CanCreate') && v.includes('_Clear = 1') && v.includes(FORM_RESPONSES)),
            JSON.stringify(violations),
        );
    },
);

// 9. The same regression with the parameter simply left out — NULL by another route.
withSeed(
    POST,
    seedSql(permissionRecord({ suffix: 'bb22cc33', entityId: FORM_RESPONSES, canCreate: 1, createFilter: 'omit' })),
    (violations) => {
        check(
            'flags a post-watershed seed that omits the filter parameter on a CanCreate grant',
            violations.some((v) => v.includes('CanCreate') && v.includes('is absent')),
            JSON.stringify(violations),
        );
    },
);

// 10. The shape the DOCUMENTED regeneration path produces: a delta against a migrated-to-head
//     database expresses a changed grant as an UPDATE, not a CREATE. Role bound by literal id here,
//     which is the other binding a future generator run may emit.
withSeed(
    POST,
    seedSql(
        permissionRecord({
            suffix: 'cc33dd44',
            procedure: 'spUpdateEntityPermission',
            entityId: FORM_DISTRIBUTIONS,
            roleBinding: 'byId',
            canRead: 1,
            readFilter: 'clear',
        }),
    ),
    (violations) => {
        check(
            'flags an update-shaped clear (the delta path), with the role bound by literal id',
            violations.some((v) => v.includes('spUpdateEntityPermission') && v.includes('CanRead') && v.includes(FORM_DISTRIBUTIONS)),
            JSON.stringify(violations),
        );
    },
);

// 11. A grant on an entity outside the four. Nothing in the hardening migration's contract names it,
//     so only a rule that covers EVERY grant this role holds can see it.
withSeed(
    POST,
    seedSql(permissionRecord({ suffix: 'dd44ee55', entityId: FORMS, canRead: 1, readFilter: 'unset' })),
    (violations) => {
        check(
            'flags a new unfiltered grant on an entity outside the guarded four',
            violations.some((v) => v.includes(FORMS) && v.includes('DECLAREd but never SET')),
            JSON.stringify(violations),
        );
    },
);

// 12. The never-a-writer rule: no update or delete for this role is legitimate, filtered or not.
withSeed(
    POST,
    seedSql(
        permissionRecord({
            suffix: 'ee55ff66',
            entityId: FORM_RESPONSES,
            canCreate: 1,
            canUpdate: 1,
            createFilter: DENY_CREATE_FILTER,
        }),
    ),
    (violations) => {
        check(
            'flags a CanUpdate grant outright, even beside a correctly filtered create',
            violations.length === 1 && violations[0].includes('CanUpdate') && violations[0].includes('gate, never a writer'),
            JSON.stringify(violations),
        );
    },
);

// 13. Non-NULL is not enough for a guarded pair: pointing it at another app's filter record is undone
//     the moment that app uninstalls. Entity bound by NAME here, the other identification path.
withSeed(
    POST,
    seedSql(
        permissionRecord({
            suffix: 'ff66aa77',
            entityName: 'MJ_BizApps_Forms: Form Responses',
            canCreate: 1,
            createFilter: OWN_DISTRIBUTION_FILTER,
        }),
    ),
    (violations) => {
        check(
            'flags a guarded pair pointed at the wrong filter record, resolved by entity name',
            violations.some((v) => v.includes(OWN_DISTRIBUTION_FILTER) && v.includes(DENY_CREATE_FILTER)),
            JSON.stringify(violations),
        );
    },
);

// 14. MUST PASS — the same seed as case 8, but landing BEFORE the hardening migration corrects it.
//     This is what keeps the gate off today's healthy tree; without it the shipped 0.8.0 seed fails.
withSeed(
    PRE,
    seedSql(permissionRecord({ suffix: 'aa11bb22', entityId: FORM_RESPONSES, canCreate: 1, createFilter: 'clear' })),
    (violations) => {
        check('ignores a pre-watershed seed, which V202608131600 corrects afterward', violations.length === 0, JSON.stringify(violations));
    },
);

// 15. MUST PASS — a post-watershed delta carrying the grants correctly filtered.
withSeed(
    POST,
    seedSql(
        permissionRecord({
            suffix: 'aa88bb99',
            procedure: 'spUpdateEntityPermission',
            entityId: FORM_RESPONSES,
            canCreate: 1,
            createFilter: DENY_CREATE_FILTER,
        }),
        permissionRecord({
            suffix: 'bb99cc00',
            procedure: 'spUpdateEntityPermission',
            entityId: FORM_DISTRIBUTIONS,
            canRead: 1,
            readFilter: OWN_DISTRIBUTION_FILTER,
        }),
    ),
    (violations) => {
        check('passes a post-watershed delta whose grants carry their filters', violations.length === 0, JSON.stringify(violations));
    },
);

// 16. MUST PASS — a post-watershed seed with no respondent content at all. Most seeds are this.
withSeed(
    POST,
    seedSql(
        permissionRecord({
            suffix: 'cc00dd11',
            entityId: FORM_RESPONSES,
            roleBinding: 'byName',
            canCreate: 1,
            createFilter: 'clear',
        }).replace(/Form Respondent/g, 'Integration'),
    ),
    (violations) => {
        check('says nothing about a seed whose permission records belong to another role', violations.length === 0, JSON.stringify(violations));
    },
);

// 17. MUST PASS — prose about the violation is not the violation. Both shipped migrations explain
//     `_Clear = 1` for this role in their headers, and a gate that read comments would fire on the
//     files that document the problem, teaching people that regenerating is how you silence it.
withSeed(
    POST,
    `-- The 0.8.0 seed passed @CreateRLSFilterID_Clear = 1 on every Form Respondent grant, including\n` +
        `-- EXEC [\${mjSchema}].spCreateEntityPermission @RoleID = (SELECT ID FROM [\${mjSchema}].[Role]\n` +
        `--   WHERE Name = N'Form Respondent'), @CanCreate = 1, @CreateRLSFilterID_Clear = 1;\n` +
        `/* and a block comment saying the same thing, @CanUpdate = 1 included. */\nGO\n`,
    (violations) => {
        check('does not read a comment as a permission call', violations.length === 0, JSON.stringify(violations));
    },
);

// 18. A call the gate cannot attribute must not pass in silence — "I cannot tell whose grant this is"
//     is a different fact from "this grant is fine", and conflating them is how the check goes quiet
//     the first time the generator emits a shape this parser does not model.
withSeed(
    POST,
    seedSql(
        permissionRecord({ suffix: 'aa99bb00', entityId: FORM_RESPONSES, canCreate: 1, createFilter: DENY_CREATE_FILTER }).replace(
            /SET\n  @RoleID_aa99bb00 = .*\n/,
            '',
        ),
    ),
    (violations) => {
        check(
            'flags a permission call whose @RoleID it cannot resolve',
            violations.some((v) => v.includes('cannot resolve')),
            JSON.stringify(violations),
        );
    },
);

// 19. migrations-pg/ ships no seed today, and the scan covers it so the first one is born checked.
withFixture(
    (root) => {
        mkdirSync(join(root, 'migrations-pg'), { recursive: true });
        writeFileSync(
            join(root, 'migrations-pg', 'V202609010000__v0.11.x__Metadata_Sync.pg.sql'),
            seedSql(permissionRecord({ suffix: 'bb00cc11', entityId: FORM_RESPONSES, canCreate: 1, createFilter: 'clear' })),
        );
    },
    (violations) => {
        check(
            'scans migrations-pg/, so the first PostgreSQL seed is checked from birth',
            violations.some((v) => v.includes('migrations-pg') && v.includes('CanCreate')),
            JSON.stringify(violations),
        );
    },
);

// 20. The guarded table is only as good as the ids in it: one that drifted would match nothing and
//     the gate would pass everything in silence. Each half is pinned to the file it came from —
//     entity ids to the seed that binds them, filter ids to the hardening migration's @Contract.
const shippedSeed = readFileSync(join(REPO_ROOT, 'migrations', 'V202608081700__v0.8.x__Metadata_Sync.sql'), 'utf-8');
const shippedGrants = findRespondentGrants(shippedSeed);
check(
    'the shipped 0.8.0 seed still carries the nine Form Respondent grants #39 describes',
    shippedGrants.length === 9,
    `found ${shippedGrants.length}`,
);

const contract = readFileSync(join(REPO_ROOT, 'migrations', 'V202608131600__v0.10.x__Respondent_Grant_Hardening.sql'), 'utf-8').replace(/\s+/g, ' ');
for (const guarded of RESPONDENT_GUARDED_GRANTS) {
    check(
        `${guarded.entityName} (${guarded.capability}) is the entity id the shipped seed binds`,
        shippedGrants.some((g) => g.entityId === guarded.entityId && g.granted[guarded.capability]),
        `no ${guarded.capability} grant on ${guarded.entityId} in the shipped seed`,
    );
    check(
        `${guarded.entityName} (${guarded.capability}) -> ${guarded.filterId} matches V202608131600's @Contract`,
        contract.includes(`(N'${guarded.entityName}', '${guarded.capability[0]}', '${guarded.filterId}',`),
        'the hardening migration declares a different filter for this pair',
    );
}

// ---------------------------------------------------------------------------
// CHECK 3 — hardening against the parser false negatives found by adversarial
// review of PR #42. Every case below was a silent pass before its fix: the gate
// read the file, understood none of it, and reported health.
// ---------------------------------------------------------------------------

/** A record that MUST be caught: CanCreate on Form Responses with the create filter cleared. */
const VIOLATION = { suffix: 'ad00be01', entityId: FORM_RESPONSES, canCreate: 1, createFilter: 'clear' };

/** Asserts the seed's violation is still seen through whatever `decorate` did to the file. */
function stillCaught(name, sql) {
    withSeed(POST, sql, (violations) => {
        check(name, violations.some((v) => v.includes('CanCreate')), JSON.stringify(violations));
    });
}

// 21. Astral characters. The mask was built with [...sql] (code points) but indexed against sql
//     (UTF-16 code units), so each emoji slid the mask one unit further out of alignment; at three
//     the record was blanked outright. Seed text is generated from metadata/ descriptions, where an
//     emoji is ordinary prose.
stillCaught('sees through emoji in a preceding comment (mask/source index alignment)', `-- Regenerated 🚀🚀🚀 seed delta\n${permissionRecord(VIOLATION)}`);

// 22. Block-comment nesting turned a header into a file-wide blindfold. `migrations/*.sql` contains
//     the two characters `/*`, so depth went 1 -> 2, the real `*/` returned it to 1, and the scan
//     ran off the end blanking every record below. Nesting is T-SQL-correct and, for a gate, the
//     wrong trade: over-running to EOF hides violations, while stopping early can only expose
//     comment text as code, which fails loudly.
stillCaught(
    'sees past a header comment that mentions `migrations/*.sql` (unbalanced /* )',
    `/*\n * MJ Forms 0.11 seed delta. Substitutions applied per migrations/*.sql convention.\n */\n${permissionRecord(VIOLATION)}`,
);

// 23. Capability detection must fail CLOSED. It compared the resolved argument to the string '1',
//     so every flag it could not read came back "not granted" — which skips all four rules and
//     reports health. The file already argues (for @RoleID) that "I cannot tell" is not "this is
//     fine"; these four are the same argument applied to Can*.
const CAN_CREATE_SET = `SET\n  @CanCreate_${VIOLATION.suffix} = 1`;
const CAN_CREATE_ARG = `  @CanCreate = @CanCreate_${VIOLATION.suffix},`;
for (const [name, sql] of [
    ['a trailing comment on the flag\'s assignment', permissionRecord(VIOLATION).replace(CAN_CREATE_SET, `${CAN_CREATE_SET} -- respondents may submit`)],
    ['a comment line above the flag\'s argument', permissionRecord(VIOLATION).replace(CAN_CREATE_ARG, `  -- the one deliberate write (#39)\n${CAN_CREATE_ARG}`)],
    ['a quoted flag value', permissionRecord(VIOLATION).replace(CAN_CREATE_SET, `SET\n  @CanCreate_${VIOLATION.suffix} = '1'`)],
    ['a CAST expression as the flag', permissionRecord(VIOLATION).replace(CAN_CREATE_ARG, '  @CanCreate = CAST(1 AS BIT),')],
]) {
    stillCaught(`reads CanCreate as granted despite ${name}`, sql);
}

// 24. Role-name matching was exact where SQL Server's `=` is not: a default collation is
//     case-insensitive and pads trailing blanks, so all three of these resolve to the real role on
//     the host while the gate read them as some other role and skipped the call.
const AS_WRITTEN = `(SELECT ID FROM [\${mjSchema}].[Role] WHERE Name = N'Form Respondent')`;
for (const [name, subselect] of [
    ['upper case', `(SELECT ID FROM [\${mjSchema}].[Role] WHERE Name = N'FORM RESPONDENT')`],
    ['a trailing blank', `(SELECT ID FROM [\${mjSchema}].[Role] WHERE Name = N'Form Respondent ')`],
    ['a bracketed column name', `(SELECT ID FROM [\${mjSchema}].[Role] WHERE [Name] = N'Form Respondent')`],
]) {
    stillCaught(`matches the role named with ${name}`, permissionRecord(VIOLATION).replace(AS_WRITTEN, subselect));
}

// 25. Two calls in one batch, the first unterminated: the argument scan ran past the first call into
//     the second, and the second's `@RoleID` overwrote the first's in the FIRST call's own argument
//     map — re-attributing a respondent grant to whatever role came next, and skipping it.
stillCaught(
    'reads the first of two calls in a batch when it carries no terminating semicolon',
    permissionRecord(VIOLATION).replace(/;\n/, '\n').replace(/\nGO\n/, '\n') +
        permissionRecord({ ...VIOLATION, suffix: 'be01cf02', entityId: FORMS }).replace(/Form Respondent/g, 'Integration'),
);

// 26. #41's exploit in the shape MJ's `_Clear` convention exists for: an UPDATE that nulls the
//     filter and says nothing about the capability, leaving the host row at CanCreate = 1 with no
//     filter. The rules keyed off "if the call GRANTS CanCreate", and this call grants nothing — it
//     only takes the filter away, which is the whole attack.
withSeed(
    POST,
    `-- Save MJ: Entity Permissions (core SP call only)
DECLARE @EntityID_z UNIQUEIDENTIFIER, @RoleID_z UNIQUEIDENTIFIER
SET
  @EntityID_z = '${FORM_RESPONSES}'
SET
  @RoleID_z = (SELECT ID FROM [\${mjSchema}].[Role] WHERE Name = N'Form Respondent')
EXEC [\${mjSchema}].spUpdateEntityPermission @ID = '60470C16-21AB-48DF-BD12-EB3482F365F7',
  @EntityID = @EntityID_z,
  @RoleID = @RoleID_z,
  @CreateRLSFilterID_Clear = 1;
GO
`,
    (violations) => {
        check(
            'flags an update that clears a filter without restating the capability',
            violations.some((v) => v.includes('clears') || v.includes('_Clear')),
            JSON.stringify(violations),
        );
    },
);

// 27. Rule 4 needs to know WHICH grant it is looking at, and an entity named through a bracketed
//     column went unresolved — so a guarded pair pointed at another app's filter record read as an
//     ordinary non-NULL filter and passed.
withSeed(
    POST,
    seedSql(
        permissionRecord({
            suffix: 'cf02da03',
            entityName: 'MJ_BizApps_Forms: Form Responses',
            canCreate: 1,
            createFilter: OWN_DISTRIBUTION_FILTER,
        }).replace("WHERE Name = N'MJ_BizApps_Forms: Form Responses'", "WHERE [Name] = N'MJ_BizApps_Forms: Form Responses'"),
    ),
    (violations) => {
        check(
            'applies rule 4 to an entity named through a bracketed column',
            violations.some((v) => v.includes(OWN_DISTRIBUTION_FILTER) && v.includes(DENY_CREATE_FILTER)),
            JSON.stringify(violations),
        );
    },
);

// 28. The backstop. Zero parsed calls is indistinguishable from a clean file, so the gate asserts
//     that it understood everything it saw: if the SQL names a permission procedure more often than
//     the parser recognised a call, it says so instead of reporting health. A PostgreSQL seed is the
//     concrete case — `migrations-pg/` is scanned but the parser is T-SQL-only, and the converter
//     renders these calls as `SELECT`s.
withFixture(
    (root) => {
        writeFileSync(
            join(root, 'migrations', POST),
            `SELECT \${mjSchema}.spcreateentitypermission('60470c16-21ab-48df-bd12-eb3482f365f7'::uuid, '${FORM_RESPONSES.toLowerCase()}'::uuid, (SELECT id FROM \${mjSchema}.role WHERE name = 'Form Respondent'), true, false, false, false, NULL, NULL, 'Allow');\n`,
        );
    },
    (violations) => {
        check(
            'refuses a seed whose permission calls it could not parse (PostgreSQL shape)',
            violations.some((v) => v.includes('could not parse') || v.includes('did not recognise')),
            JSON.stringify(violations),
        );
    },
);

// 29. …and the backstop must be quiet on the shape that actually ships, or it is just noise. The
//     real seed names the procedure 17 times and the parser reads 17 calls.
check(
    'the backstop agrees with the parser on the shipped seed (17 calls, none missed)',
    countPermissionProcedureMentions(shippedSeed) === 17 && findPermissionCalls(shippedSeed).length === 17,
    `mentions=${countPermissionProcedureMentions(shippedSeed)} parsed=${findPermissionCalls(shippedSeed).length}`,
);

// 30. The file class is matched by name, so a naming slip walked a generated seed straight past the
//     gate. Widened to the spellings a person actually types; D7's boundary (hand-authored
//     migrations stay out of scope) is unchanged.
withSeed(
    'V202609010000__v0.11.x__MetadataSync.sql',
    seedSql(permissionRecord(VIOLATION)),
    (violations) => {
        check('scans a seed named MetadataSync, without the underscore', violations.some((v) => v.includes('CanCreate')), JSON.stringify(violations));
    },
);

// ---------------------------------------------------------------------------
// CHECK 3 — behaviours a mutation pass found unpinned (#44).
//
// This section covered CHECK 1's branches too, in cases 47 and 48; both went with it in #105.
//
// `scripts/check-distribution-seed.mutants.mjs` deletes each of the behaviours
// below one at a time and fails if no case here notices. Every case names the
// mutant it kills, because a case whose purpose nobody can state is the next one
// to be "simplified" away — which is the failure mode this whole file exists for.
// ---------------------------------------------------------------------------

const FORM_RESPONSE_ANSWERS = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810';
const RESPONDENT_BY_NAME = `(SELECT ID FROM [\${mjSchema}].[Role] WHERE Name = N'Form Respondent')`;

/**
 * One hand-written call, for the shapes `permissionRecord` deliberately does not emit. Everything
 * inline, no DECLAREs: these cases are about how a call is RECOGNISED and read, not about the
 * generator's record shape, and a real record around them would only add noise.
 */
function rawCall(args, { keyword = 'EXEC', prefix = `[\${mjSchema}].`, procedure = 'spCreateEntityPermission' } = {}) {
    return `${keyword} ${prefix}${procedure} ${args};\nGO\n`;
}

// 31. mask/escaped-quote. T-SQL doubles an apostrophe and `V202608081700` already carries 36 of
//     them. Reading `''` as a closing quote inverts code and prose for everything after it, and the
//     record below stops existing — the gate reads a clean file and says so.
stillCaught(
    "sees the record after a description carrying an escaped '' apostrophe",
    `DECLARE @D_${VIOLATION.suffix} NVARCHAR(200)\nSET\n  @D_${VIOLATION.suffix} = N'The respondent''s own submissions'\n${permissionRecord(VIOLATION)}`,
);

// 32. mask/string-body. The structure mask blanks string bodies so that a `;` or an `EXEC` inside
//     prose cannot truncate a statement or invent a call. Note what is asserted: not just that the
//     real record survives — it does either way, because the phantom call the mutant conjures out of
//     the quoted text ends where the real one begins — but that the quoted text produces NO call at
//     all. "Still caught" would have passed here and measured nothing.
withSeed(
    POST,
    `DECLARE @D_${VIOLATION.suffix} NVARCHAR(200)\nSET\n  @D_${VIOLATION.suffix} = N'Run; then EXEC spCreateEntityPermission by hand'\n${permissionRecord(VIOLATION)}`,
    (violations) => {
        check(
            'reads a procedure named inside a description as prose, not as a second call',
            violations.some((v) => v.includes('CanCreate')) && !violations.some((v) => v.includes('cannot resolve')),
            JSON.stringify(violations),
        );
    },
);

// 33. call/backstop-independent-of-string-mask. The backstop counts mentions on the VALUES mask,
//     which keeps string bodies, rather than the structure mask the parser matches on — so it does
//     not share the string-scanning layer with the thing it is checking. The cost is visible here:
//     a procedure named only inside a string reads as a call the parser missed, and the gate says so
//     rather than staying quiet. Loud is the direction this file chooses.
withSeed(
    POST,
    `DECLARE @D NVARCHAR(200)\nSET\n  @D = N'documented at spCreateEntityPermission'\nGO\n`,
    (violations) => {
        check(
            'refuses a seed naming a permission procedure it could not parse, even inside a string',
            violations.some((v) => v.includes('could not parse')),
            JSON.stringify(violations),
        );
    },
);

// 34. mask/block-comment. Case 22 pins only the unbalanced-`/*` trade-off; nothing pinned the
//     blanking itself, so a record commented out for a later delta read as a live grant.
withSeed(POST, `/* superseded by the delta in v0.12:\n${permissionRecord(VIOLATION)}\n*/\n`, (violations) => {
    check('does not read a /* */-commented-out record as a live grant', violations.length === 0, JSON.stringify(violations));
});

// 35. scan/go-batches. Variables are traced per `GO` batch. Collapse that to one file-wide map and
//     the LAST binding of a reused suffix wins everywhere, so the second record below re-attributes
//     the first record's grant to another role and the violation disappears. The generator suffixes
//     per record today; the batch boundary is what stops that from being load-bearing.
withSeed(
    POST,
    `DECLARE @RoleID_x UNIQUEIDENTIFIER, @EntityID_x UNIQUEIDENTIFIER, @CanCreate_x BIT
SET
  @RoleID_x = ${RESPONDENT_BY_NAME}
SET
  @EntityID_x = '${FORM_RESPONSES}'
SET
  @CanCreate_x = 1
EXEC [\${mjSchema}].spCreateEntityPermission @EntityID = @EntityID_x, @RoleID = @RoleID_x, @CanCreate = @CanCreate_x, @CreateRLSFilterID_Clear = 1;
GO
DECLARE @RoleID_x UNIQUEIDENTIFIER
SET
  @RoleID_x = (SELECT ID FROM [\${mjSchema}].[Role] WHERE Name = N'Integration')
EXEC [\${mjSchema}].spCreateEntityPermission @RoleID = @RoleID_x, @CanRead = 1;
GO
`,
    (violations) => {
        check(
            'traces variables per GO batch, so a suffix reused by a later record cannot rewrite an earlier grant',
            violations.some((v) => v.includes('CanCreate')),
            JSON.stringify(violations),
        );
    },
);

// 36. scan/assignment-terminators. A `SET` value ends at the next `EXEC`/`EXECUTE`/`DECLARE` as well
//     as at `;`. Without that, an unterminated assignment swallows the statement after it: the
//     filter id below resolves to itself plus a whole EXEC, stops being a literal UUID, and rule 4
//     silently skips a grant pointed at another app's filter record. The generator puts `@Type` last
//     today, which is the only reason no shipped file depends on this.
for (const [name, sql] of [
    [
        'an EXEC on the same line',
        `DECLARE @F_y UNIQUEIDENTIFIER\nSET\n  @F_y = '${OWN_DISTRIBUTION_FILTER}' EXEC [\${mjSchema}].spCreateEntityPermission @EntityID = '${FORM_RESPONSES}', @RoleID = ${RESPONDENT_BY_NAME}, @CanCreate = 1, @CreateRLSFilterID = @F_y;\nGO\n`,
    ],
    [
        "the next record's DECLARE",
        `DECLARE @F_y UNIQUEIDENTIFIER\nSET\n  @F_y = '${OWN_DISTRIBUTION_FILTER}'\nDECLARE @Unused INT\nEXEC [\${mjSchema}].spCreateEntityPermission @EntityID = '${FORM_RESPONSES}', @RoleID = ${RESPONDENT_BY_NAME}, @CanCreate = 1, @CreateRLSFilterID = @F_y;\nGO\n`,
    ],
]) {
    withSeed(POST, sql, (violations) => {
        check(
            `ends a SET value at ${name}, so the filter it binds is still read as a literal`,
            violations.some((v) => v.includes(OWN_DISTRIBUTION_FILTER) && v.includes(DENY_CREATE_FILTER)),
            JSON.stringify(violations),
        );
    });
}

// 37. call/schema-prefix-optional, call/schema-prefix-bare, call/execute-spelling. The call regex
//     accepts all three and every fixture wrote the same one — `EXEC [${mjSchema}].sp…` — so the
//     other arms were decoration. A seed emitted by a differently-configured MetadataSync takes
//     exactly these shapes, and an unrecognised call is a silent pass, not an error.
for (const [name, options] of [
    ['no schema prefix at all', { prefix: '' }],
    ['a bare, unbracketed schema prefix', { prefix: 'dbo.' }],
    ['the EXECUTE spelling', { keyword: 'EXECUTE' }],
]) {
    withSeed(
        POST,
        rawCall(`@EntityID = '${FORM_RESPONSES}', @RoleID = ${RESPONDENT_BY_NAME}, @CanCreate = 1, @CreateRLSFilterID_Clear = 1`, options),
        (violations) => {
            check(`reads a permission call written with ${name}`, violations.some((v) => v.includes('CanCreate')), JSON.stringify(violations));
        },
    );
}

// 38. identity/uuid-case. Lower-case UUID literals already ship in migrations/, and case 28's own
//     PostgreSQL fixture is written entirely in them. Drop the normalisation and a lower-case seed
//     matches neither the role nor the guarded table: every rule skips and the gate reports health.
withSeed(
    POST,
    rawCall(
        `@EntityID = '${FORM_RESPONSE_ANSWERS.toLowerCase()}', @RoleID = 'a18e13fc-b2c1-4e77-a3d7-ee775bde098c', ` +
            `@CanCreate = 1, @CreateRLSFilterID = '${OWN_DISTRIBUTION_FILTER.toLowerCase()}'`,
    ),
    (violations) => {
        check(
            'matches the role and the guarded table when the seed writes its ids in lower case',
            violations.some((v) => v.includes(DENY_CREATE_FILTER)),
            JSON.stringify(violations),
        );
    },
);

// 39. identity/uuid-n-prefix. `N'<uuid>'` is a spelling T-SQL accepts and nothing ships today; the
//     parser reads it, and without a case that is an accident rather than a decision.
withSeed(
    POST,
    rawCall(`@EntityID = N'${FORM_RESPONSES}', @RoleID = N'A18E13FC-B2C1-4E77-A3D7-EE775BDE098C', @CanCreate = 1, @CreateRLSFilterID_Clear = 1`),
    (violations) => {
        check("reads a UUID literal written with the N prefix", violations.some((v) => v.includes('CanCreate')), JSON.stringify(violations));
    },
);

// 40. identity/role-substring-fallback. When neither the id reader nor the `Name = N'…'` reader can
//     make sense of `@RoleID`, a call that still names the role literally is attributed to it rather
//     than written off as unreadable. It is the last thing standing between a reworded subselect and
//     an unexamined grant.
withSeed(
    POST,
    rawCall(
        `@EntityID = '${FORM_RESPONSES}', ` +
            `@RoleID = (SELECT TOP 1 ID FROM [\${mjSchema}].[Role] WHERE UPPER(Name) = UPPER('Form Respondent')), ` +
            '@CanCreate = 1, @CreateRLSFilterID_Clear = 1',
    ),
    (violations) => {
        check(
            'attributes a grant whose @RoleID expression it cannot parse but which names the role literally',
            violations.some((v) => v.includes('CanCreate')),
            JSON.stringify(violations),
        );
    },
);

// 41. identity/absent-vs-unknown. Case 18 pins that an unreadable `@RoleID` is reported; it does not
//     pin WHY, and the two whys are different facts — a missing parameter is a malformed call, an
//     unreadable one is a shape the parser has outgrown. Someone reading the failure needs to know
//     which of those they are looking at.
withSeed(POST, rawCall(`@EntityID = '${FORM_RESPONSES}', @CanCreate = 1`), (violations) => {
    check(
        'says the @RoleID parameter is absent, rather than that it could not be read',
        violations.some((v) => v.includes('the parameter is absent')),
        JSON.stringify(violations),
    );
});

// 42. rule/delete-is-a-write. D2.3 names Update AND Delete; only Update was tested, so half the rule
//     could have been deleted with the suite green.
withSeed(POST, rawCall(`@EntityID = '${FORM_RESPONSE_ANSWERS}', @RoleID = ${RESPONDENT_BY_NAME}, @CanDelete = 1`), (violations) => {
    check('flags a CanDelete grant, not just CanUpdate', violations.some((v) => v.includes('CanDelete')), JSON.stringify(violations));
});

// 43. rule/guard-key-capability — a MUST PASS. The guarded table is keyed on (entity, capability),
//     and Form Distributions appears in it only for Read. A filtered CREATE grant on that entity is
//     therefore an ordinary new grant: rules 1-3 clear it and rule 4 has nothing to say. Judge it
//     against the Read row and the gate invents a contract this app never declared.
const UNGUARDED_CREATE = rawCall(
    `@EntityID = '${FORM_DISTRIBUTIONS}', @RoleID = ${RESPONDENT_BY_NAME}, @CanCreate = 1, @CreateRLSFilterID = '${DENY_CREATE_FILTER}'`,
);
withSeed(POST, UNGUARDED_CREATE, (violations) => {
    // Both halves matter. "No violations" alone would also hold if the gate had never read the file
    // at all, which is the shape of pass this whole suite exists to distrust — so the second half
    // says the silence is informed: the call WAS parsed, as a respondent grant of Create.
    const parsed = findPermissionCalls(UNGUARDED_CREATE);
    check(
        'does not judge a Create grant against the guarded table row for Read on the same entity',
        violations.length === 0 && parsed.length === 1 && parsed[0].role === 'respondent' && parsed[0].granted.Create,
        `violations=${JSON.stringify(violations)} parsed=${JSON.stringify(parsed)}`,
    );
});

// 44. rule/guard-key-entity-id. Case 13 resolves its guarded pair by entity NAME and case 27 by a
//     bracketed one; both go through `readQuotedName`. Nothing reached rule 4 through a literal
//     entity id, which is how `V202608081700` itself binds every one of them.
withSeed(
    POST,
    rawCall(`@EntityID = '${FORM_RESPONSE_ANSWERS}', @RoleID = ${RESPONDENT_BY_NAME}, @CanCreate = 1, @CreateRLSFilterID = '${OWN_DISTRIBUTION_FILTER}'`),
    (violations) => {
        check(
            'applies rule 4 to a guarded pair identified by literal entity id',
            violations.some((v) => v.includes(OWN_DISTRIBUTION_FILTER) && v.includes(DENY_CREATE_FILTER)),
            JSON.stringify(violations),
        );
    },
);

// 45. scope/unstamped-is-checked. A file Skyway cannot order is the one most likely to land last, so
//     it is scanned rather than skipped. The comment said so; nothing held it to it.
withSeed(
    'Metadata_Sync_hotfix.sql',
    seedSql(permissionRecord({ suffix: 'de04ef05', entityId: FORM_RESPONSE_ANSWERS, canCreate: 1, createFilter: 'clear' })),
    (violations) => {
        check(
            'scans a seed whose filename carries no version stamp',
            violations.some((v) => v.includes('CanCreate')),
            JSON.stringify(violations),
        );
    },
);

// 46. scope/watershed-is-exclusive — a MUST PASS, and the case that decides which side of the
//     boundary the watershed sits on. `V202608131600` IS the hardening migration, so a seed sharing
//     its stamp is corrected by it, exactly like the pre-watershed seeds of case 14. Nothing said
//     whether `>` was deliberate or an off-by-one nobody had thought about.
//     Asserted as a BOUNDARY rather than as a silence: the identical seed content is checked at the
//     watershed minute and at the minute after it, so the case fails if the gate stops scanning
//     either side. A bare "no violations" at one stamp would also pass on a gate that had quietly
//     stopped reading the directory.
const AT_WATERSHED = seedSql(permissionRecord({ suffix: 'ef05fa06', entityId: FORM_RESPONSE_ANSWERS, canCreate: 1, createFilter: 'clear' }));
withSeed('V202608131600__v0.10.x__Metadata_Sync.sql', AT_WATERSHED, (violations) => {
    check('exempts a seed stamped exactly at the watershed, which the hardening migration corrects', violations.length === 0, JSON.stringify(violations));
});
withSeed('V202608131601__v0.10.x__Metadata_Sync.sql', AT_WATERSHED, (violations) => {
    check(
        'checks the very next minute after the watershed, so the exemption is a boundary and not a blind spot',
        violations.some((v) => v.includes('CanCreate')),
        JSON.stringify(violations),
    );
});

// 47–48 were CHECK 1's remaining two branches (metadata added, and metadata deleted, after the
//       manifest was written). Removed with CHECK 1 in #105; the property they approximated —
//       "does a declared record actually reach a host?" — is now checked directly, without a
//       manifest, by scripts/check-release-seed-coverage.mjs at the release boundary.

// 49. Not a mutant — a coverage gap, and the one item on #44 that no mutant expresses. D3 names
//     three ways a call may bind the role and every fixture used the same one, because
//     `permissionRecord` builds the generator's real shape and the generator always routes through a
//     variable. The other two are what a future MetadataSync would most plausibly switch to.
for (const roleBinding of ['inlineById', 'inlineByName']) {
    stillCaught(`reads @RoleID bound inline in the EXEC (${roleBinding})`, seedSql(permissionRecord({ ...VIOLATION, roleBinding })));
}

// ---------------------------------------------------------------------------
// CHECK 4 — ID-only guards on core-metadata inserts
// ---------------------------------------------------------------------------

/** A migration that lands AFTER CHECK 4's watershed, so the check speaks; and one that lands before. */
const POST_GUARD = 'V202609010000__v0.12.x__New_Metadata.sql';
const PRE_GUARD = 'V202608200000__v0.11.x__Old_Metadata.sql';

/** Drops one migration into an otherwise-quiet repo and asserts on what CHECK 4 says about it. */
function withMigration(fileName, sql, assert) {
    withFixture(
        (root) => {
            writeFileSync(join(root, 'migrations', fileName), sql);
        },
        (violations) => assert(violations.filter((v) => v.includes(fileName))),
    );
}

const idOnlyGuarded = (table) => `
IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[${table}] WHERE [ID] = '6729890a-d62c-4806-8fd3-3ce466fd0395')
BEGIN
   INSERT INTO [\${mjSchema}].[${table}] ([ID], [EntityID]) VALUES ('6729890a-d62c-4806-8fd3-3ce466fd0395', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8')
END;
`;

// 50. The defect itself, on the table whose duplicate broke CodeGen (#66).
withMigration(POST_GUARD, idOnlyGuarded('EntityRelationship'), (violations) => {
    check(
        'flags an EntityRelationship insert guarded on [ID] alone',
        violations.some((v) => v.includes('EntityRelationship') && v.includes("[ID] = '<guid>'")),
        JSON.stringify(violations),
    );
});

// 51. Every table on the list, not just the one that bit us. The three with upstream unique
//     constraints are included deliberately — see CORE_METADATA_TABLES' comment.
for (const table of ['Entity', 'EntityField', 'EntityFieldValue', 'EntityRelationship', 'EntityPermission', 'ApplicationEntity', 'EntitySetting']) {
    withMigration(POST_GUARD, idOnlyGuarded(table), (violations) => {
        check(`flags an ID-only guard on ${table}`, violations.length === 1, JSON.stringify(violations));
    });
}

// 52. A MUST PASS — the shape `V202608191300`'s EntityField inserts already use, and the shape the
//     violation message tells authors to write. If this fired, the check would be telling people to
//     fix a guard by making it a violation.
withMigration(
    POST_GUARD,
    `
IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[EntityField] WHERE ID = '26476755-bae0-4a03-b6c3-79857c530d6f' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'TemplateSourceFormID')) BEGIN
   INSERT INTO [\${mjSchema}].[EntityField] ([ID], [Name]) VALUES ('26476755-bae0-4a03-b6c3-79857c530d6f', 'TemplateSourceFormID')
END;
`,
    (violations) => check('stays silent on an OR-joined natural-key guard', violations.length === 0, JSON.stringify(violations)),
);

// 53. A MUST PASS — the Entity fence, where the guard names a natural key and the block it governs
//     inserts THREE different core tables. Keying off the inserted table rather than the predicate
//     would fail this.
withMigration(
    POST_GUARD,
    `
IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '\${flyway:defaultSchema}')
BEGIN
   INSERT INTO [\${mjSchema}].[Entity] ([ID], [Name]) VALUES ('1', 'x');
   INSERT INTO [\${mjSchema}].[ApplicationEntity] ([ID], [EntityID]) VALUES ('2', '1');
   INSERT INTO [\${mjSchema}].[EntityPermission] ([ID], [EntityID]) VALUES ('3', '1');
END;
`,
    (violations) => check('stays silent on a natural-key fence governing several inserts', violations.length === 0, JSON.stringify(violations)),
);

// 54. The rescue that isn't. `V202608191300`'s QuestionType inserts carry a companion `AND EXISTS`
//     OUTSIDE the NOT EXISTS, and it does not help: it tests that a DIFFERENT row exists, so on a
//     host where the ID guard is wrong the insert still fires. A parser that read the whole `IF`
//     condition rather than the NOT EXISTS subquery would call this natural-keyed and pass it.
withMigration(
    POST_GUARD,
    `
IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[EntityFieldValue] WHERE [ID] = 'a3807a5d-b745-4aa1-8c9c-97a37c3f0651')
   AND EXISTS (SELECT 1 FROM [\${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45' AND Name = 'QuestionType')
INSERT INTO [\${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Value]) VALUES ('a3807a5d-b745-4aa1-8c9c-97a37c3f0651', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 'ShortText');
`,
    (violations) =>
        check(
            'a companion AND EXISTS does not rescue an ID-only guard',
            violations.some((v) => v.includes('EntityFieldValue')),
            JSON.stringify(violations),
        ),
);

// 55. The watershed. The same SQL before the stamp is shipped history nobody may edit.
withMigration(PRE_GUARD, idOnlyGuarded('EntityRelationship'), (violations) =>
    check('exempts migrations at or before the watershed', violations.length === 0, JSON.stringify(violations)),
);

// 56. A MUST PASS — plain DML under no guard at all, which is what the repair migration itself is.
//     Flagging it would fail the very file that fixes the defect.
withMigration(
    POST_GUARD,
    `
DELETE FROM [\${mjSchema}].[EntityRelationship] WHERE [ID] = 'f3063e0c-7b0a-4b29-8f0c-86450e15f6d3';
UPDATE [\${mjSchema}].[EntityPermission] SET CanRead = 1 WHERE [ID] = '855332fc-b2ee-4254-b3fa-6b513e29de83';
`,
    (violations) => check('ignores guard-free DML', violations.length === 0, JSON.stringify(violations)),
);

// 57. A MUST PASS — a table OUTSIDE the core-metadata list. This app's own tables are guarded on ID
//     legitimately all over `migrations/`, because their ids ARE ours to mint: no other writer
//     creates a `Form` row behind our back, which is the whole difference.
withMigration(
    POST_GUARD,
    `
IF NOT EXISTS (SELECT 1 FROM [\${flyway:defaultSchema}].[Form] WHERE [ID] = '6729890a-d62c-4806-8fd3-3ce466fd0395')
   INSERT INTO [\${flyway:defaultSchema}].[Form] ([ID], [Name]) VALUES ('6729890a-d62c-4806-8fd3-3ce466fd0395', 'x');
`,
    (violations) => check('ignores inserts into this app\'s own schema', violations.length === 0, JSON.stringify(violations)),
);

// 58. Comments cannot manufacture a violation, and cannot hide one. The same lesson CHECK 3's mask
//     layer records — its worst bugs were all a comment being read as code or code as a comment.
withMigration(
    POST_GUARD,
    `
-- IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[EntityRelationship] WHERE [ID] = 'x') INSERT INTO [\${mjSchema}].[EntityRelationship]
/* A block explaining that guarding INSERT INTO [\${mjSchema}].[EntitySetting] on [ID] = 'y' is wrong. */
SELECT 1;
`,
    (violations) => check('reads no violation out of prose describing one', violations.length === 0, JSON.stringify(violations)),
);

// 59. A MUST PASS — a guard whose subquery has NO `WHERE` at all. "Does this table have any rows"
//     is not the defect this check names, and reading a missing predicate as an ID-only one would
//     flag the broadest possible guard as the narrowest.
withMigration(
    POST_GUARD,
    `
IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[EntityRelationship])
   INSERT INTO [\${mjSchema}].[EntityRelationship] ([ID], [EntityID]) VALUES ('1', '2');
`,
    (violations) => check('does not treat a WHERE-less guard as ID-only', violations.length === 0, JSON.stringify(violations)),
);

// 60. A MUST PASS — a CORE-SCHEMA table that is not one of the seven. `V202608131600` guards its
//     `RowLevelSecurityFilter` inserts on `[ID]` exactly like this, and correctly: those ids are
//     Forms' own to mint, so no other writer creates the row behind our back. That is the whole
//     distinction the table list draws, and case 57 does not reach it — a filter on the SCHEMA alone
//     would pass that one for the wrong reason.
withMigration(
    POST_GUARD,
    `
IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[RowLevelSecurityFilter] WHERE ID = '7F0E0001-A1B2-4C3D-8E4F-000000000001')
    INSERT INTO [\${mjSchema}].[RowLevelSecurityFilter] (ID, Name) VALUES ('7F0E0001-A1B2-4C3D-8E4F-000000000001', N'x');
`,
    (violations) => check('ignores a core table outside the metadata seven', violations.length === 0, JSON.stringify(violations)),
);

// 61. A MUST PASS — an ID-only guard whose body is NOT DML must not reach forward and blame the
//     next insert. Found by adversarial review: matching only DML made the scan step over the
//     `PRINT` and attribute the well-guarded `EntityRelationship` insert below to this guard,
//     reporting a violation against a line that is correct. Over-reporting is this gate's safe
//     direction; naming the WRONG statement is not, because it sends someone to fix healthy code.
withMigration(
    POST_GUARD,
    `
IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[EntityRelationship] WHERE [ID] = '6729890a-d62c-4806-8fd3-3ce466fd0395')
    PRINT 'nothing to do';

IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[EntityRelationship] WHERE ID = '855332fc-b2ee-4254-b3fa-6b513e29de83' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND RelatedEntityJoinField = 'TemplateSourceFormID'))
    INSERT INTO [\${mjSchema}].[EntityRelationship] ([ID], [EntityID]) VALUES ('855332fc-b2ee-4254-b3fa-6b513e29de83', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8');
`,
    (violations) =>
        check(
            'an ID-only guard over a non-DML statement does not blame the next insert',
            violations.length === 0,
            JSON.stringify(violations),
        ),
);

// 62. The parser reproduces, on the real shipped file, exactly the count established by hand while
//     writing the repair migration: 14 EntityFieldValue + 1 EntityRelationship + 2 EntitySetting.
//     Pinned against `migrations/` itself so the number cannot drift from the file it describes.
{
    const offender = readFileSync(join(REPO_ROOT, 'migrations', 'V202608191300__v0.11.x__Element_Parity_Metadata_Backfill.sql'), 'utf-8');
    const byTable = {};
    for (const { table } of findIdOnlyGuardedInserts(offender)) {
        byTable[table] = (byTable[table] ?? 0) + 1;
    }
    check(
        'reads the 17 ID-only guards V202608191300 actually ships',
        byTable.EntityFieldValue === 14 && byTable.EntityRelationship === 1 && byTable.EntitySetting === 2,
        JSON.stringify(byTable),
    );
}

// ------------------------------------------------------------------------------------------------
// CHECK 5 and the unguarded-insert scan. Both shipped without a case here, and that gap is exactly
// how CHECK 5's three silent passes survived its own rewrite: narrowing a list was covered by hand,
// REMOVING one was not, and "not seen" reads identically to "correct".
// ------------------------------------------------------------------------------------------------

const FULL_EXCLUSIONS =
    "'sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks," +
    "${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber'";

/** A gated migration whose only content is one schema-sync call with the given argument text. */
function syncMigration(argument) {
    return `EXEC [\${mjSchema}].[spUpdateExistingEntitiesFromSchema]${argument};\n`;
}

withMigration(POST_GUARD, syncMigration(` @ExcludedSchemaNames=${FULL_EXCLUSIONS}`), (violations) =>
    check('CHECK 5 passes a sync that excludes the full baseline', violations.length === 0, JSON.stringify(violations)),
);

withMigration(POST_GUARD, syncMigration(" @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}'"), (violations) =>
    check('CHECK 5 catches a NARROWED exclusion list', violations.some((v) => v.includes('drops')), JSON.stringify(violations)),
);

withMigration(POST_GUARD, syncMigration(''), (violations) =>
    check(
        'CHECK 5 catches a sync call with NO exclusion argument at all',
        violations.some((v) => v.includes('this gate can read')),
        JSON.stringify(violations),
    ),
);

withMigration(POST_GUARD, syncMigration(' @ExcludedSchemaNames=@Excl'), (violations) =>
    check(
        'CHECK 5 catches an exclusion list bound to a variable',
        violations.some((v) => v.includes('this gate can read')),
        JSON.stringify(violations),
    ),
);

withMigration(
    PRE_GUARD,
    syncMigration(" @ExcludedSchemaNames='sys'"),
    (violations) => check('CHECK 5 leaves pre-watershed migrations alone', violations.length === 0, JSON.stringify(violations)),
);

withMigration(
    POST_GUARD,
    `INSERT INTO [\${mjSchema}].[EntityFieldValue] ([ID], [Value]) VALUES ('1', 'x');\n`,
    (violations) =>
        check(
            'an unguarded core insert is caught',
            violations.some((v) => v.includes('no `IF NOT EXISTS` guard at all')),
            JSON.stringify(violations),
        ),
);

withMigration(
    POST_GUARD,
    `
IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[EntityFieldValue] WHERE [EntityFieldID] = '1' AND [Value] = 'x')
BEGIN
   INSERT INTO [\${mjSchema}].[EntityFieldValue] ([ID], [Value]) VALUES ('1', 'x');
   INSERT INTO [\${mjSchema}].[EntityPermission] ([ID]) VALUES ('2');
END;
`,
    (violations) =>
        check(
            'one fence over a BEGIN…END covers every insert inside it',
            !violations.some((v) => v.includes('no `IF NOT EXISTS` guard at all')),
            JSON.stringify(violations),
        ),
);

// The case that proves the point of reading history at all: a schema NO constant here names.
// `bizapps-somethingelse` stands for the Open App this repo has not heard of — `mj.config.cjs`
// says of `__mj_BizAppsCaliber` that no hand-written deny-list "could ever have named it in
// advance", which is why the requirement is derived from what the repo has already shipped. An
// earlier migration excludes it; a later one must not quietly stop.
withFixture(
    (root) => {
        writeFileSync(
            join(root, 'migrations', PRE_GUARD),
            syncMigration(` @ExcludedSchemaNames=${FULL_EXCLUSIONS.slice(0, -1)},\${mjSchema}_BizAppsSomethingElse'`),
        );
        writeFileSync(join(root, 'migrations', POST_GUARD), syncMigration(` @ExcludedSchemaNames=${FULL_EXCLUSIONS}`));
    },
    (violations) =>
        check(
            'CHECK 5 catches dropping a sibling schema only HISTORY knows about',
            violations.some((v) => v.includes(POST_GUARD) && v.includes('BizAppsSomethingElse')),
            JSON.stringify(violations.filter((v) => v.includes(POST_GUARD))),
        ),
);

// The proc round eight found missing. `spDeleteUnneededEntityFields` is the LAST sync call CodeGen
// emits, and the first version of the accounting regex did not name it — so deleting that one
// call's exclusion list passed clean while the same deletion on any other call was caught. A case
// per proc would be noise; a case for the one that was actually missed is the case that matters.
withFixture(
    (root) => {
        writeFileSync(
            join(root, 'migrations', POST_GUARD),
            'EXEC [\${mjSchema}].[spDeleteUnneededEntityFields];\n',
        );
    },
    (violations) =>
        check(
            'CHECK 5 accounts for spDeleteUnneededEntityFields, not only the procs it happens to see used',
            violations.some((v) => v.includes(POST_GUARD) && v.includes('this gate can read')),
            JSON.stringify(violations.filter((v) => v.includes(POST_GUARD))),
        ),
);

// The PostgreSQL call form. `migrations-pg/` passes the exclusion list POSITIONALLY, so a check
// that only reads `@ExcludedSchemaNames=` cannot see that path at all — and the lists there name
// no sibling Open App, which is exactly the drift CHECK 5 exists to catch. Both dialects now.
withFixture(
    (root) => {
        mkdirSync(join(root, 'migrations-pg'), { recursive: true });
        writeFileSync(
            join(root, 'migrations-pg', 'V202609010000__v0.12.x__Probe.pg.sql'),
            `SELECT \${mjSchema}."spUpdateExistingEntitiesFromSchema"('sys,staging,dbo,\${mjSchema}');\n`,
        );
    },
    (violations) =>
        check(
            'CHECK 5 reads the PostgreSQL positional exclusion list, not only the named T-SQL form',
            violations.some((v) => v.includes('Probe.pg.sql') && v.includes('drops')),
            JSON.stringify(violations.filter((v) => v.includes('Probe.pg.sql'))),
        ),
);

// The two directions CHECK 5's accounting has to get right at once, and they pull apart. Round
// nine reported a false failure on prose; round ten reported that the fix for it went blind to a
// real call inside a dynamic-SQL literal. Both are cases now, because either alone licenses the
// other's bug.
withMigration(
    POST_GUARD,
    "EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rebuilt by spUpdateExistingEntitiesFromSchema during install';\n",
    (violations) =>
        check(
            'a procedure named in PROSE is not counted as a call',
            !violations.some((v) => v.includes('this gate can read')),
            JSON.stringify(violations),
        ),
);

withMigration(
    POST_GUARD,
    "DECLARE @cmd NVARCHAR(MAX) = N'EXEC [\${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames = @p';\n",
    (violations) =>
        check(
            'a real call hidden inside a dynamic-SQL literal IS counted',
            violations.some((v) => v.includes('this gate can read')),
            JSON.stringify(violations),
        ),
);

// `syncMigration()` hardcodes brackets, so every case above reached only ONE of the three spellings
// a real call takes. That is how requiring a bracket went silent on `EXEC schema.spX` — the suite
// could not see the difference. One case per spelling now, plus the repeatable.
withMigration(POST_GUARD, 'EXEC ${mjSchema}.spUpdateExistingEntitiesFromSchema;\n', (violations) =>
    check(
        'an UNBRACKETED T-SQL call is counted',
        violations.some((v) => v.includes('this gate can read')),
        JSON.stringify(violations),
    ),
);

withMigration(POST_GUARD, 'EXEC spUpdateExistingEntitiesFromSchema;\n', (violations) =>
    check(
        'an UNQUALIFIED `EXEC spX` call is counted',
        violations.some((v) => v.includes('this gate can read')),
        JSON.stringify(violations),
    ),
);

withMigration('R__Repeatable_Sync.sql', 'EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema];\n', (violations) =>
    check(
        'a repeatable migration is gated too — it runs on every migrate',
        violations.some((v) => v.includes('this gate can read')),
        JSON.stringify(violations),
    ),
);

// The poison the positional matcher must not swallow: a generated CRUD function whose first
// argument is a GUID, not a schema list. Discovering through the positional form would read that
// GUID as an exclusion list and corrupt the history floor for every later migration.
withFixture(
    (root) => {
        mkdirSync(join(root, 'migrations-pg'), { recursive: true });
        writeFileSync(
            join(root, 'migrations-pg', 'V202609030000__v0.12.x__Probe.pg.sql'),
            `SELECT \${mjSchema}."spCreateFormQuestion"('11111111-2222-3333-4444-555555555555');\n`,
        );
    },
    (violations) =>
        check(
            'a generated CRUD function is not mistaken for a schema sync',
            !violations.some((v) => v.includes('Probe.pg.sql')),
            JSON.stringify(violations.filter((v) => v.includes('Probe.pg.sql'))),
        ),
);

// The prose shape that a punctuation anchor could not distinguish from a call. Kept as a case
// because the fix for it has now been got wrong twice in opposite directions: once by counting
// prose as a call, once by going blind to a call inside a literal.
withMigration(
    POST_GUARD,
    `EXEC [\${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames=${FULL_EXCLUSIONS};\n` +
        "EXEC sp_addextendedproperty @value = N'See dbo.spUpdateExistingEntitiesFromSchema for how this is populated.';\n",
    (violations) =>
        check(
            'a DOT-qualified procedure name in prose is not counted as a call',
            !violations.some((v) => v.includes('this gate can read')),
            JSON.stringify(violations),
        ),
);

// Flyway accepts versions this gate cannot order. It used to skip them, which exempted them; the
// other watershed helpers in this file fail safe instead, and now so does this one.
for (const name of ['V1__Unstamped.sql', 'V2026_08__Unstamped.sql']) {
    withMigration(name, 'EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema];\n', (violations) =>
        check(
            `an unstamped but Flyway-legal name (${name}) is GATED, not exempt`,
            violations.some((v) => v.includes('this gate can read')),
            JSON.stringify(violations),
        ),
    );
}

if (failures > 0) {
    console.error(`\n${failures} gate self-test(s) failed.`);
    process.exit(1);
}
console.log('\nAll distribution-gate self-tests passed.');
