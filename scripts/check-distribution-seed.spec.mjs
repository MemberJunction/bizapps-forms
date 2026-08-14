#!/usr/bin/env node
/**
 * Proves the distribution gate FIRES. A gate nobody has seen fail is indistinguishable from a
 * gate that returns "pass" unconditionally — and this one guards a defect class whose whole
 * character is that everything looks fine from inside.
 *
 * Plain Node rather than Vitest on purpose: the gate is stdlib-only so it can run in CI without
 * `npm ci`, and its test should not reintroduce the dependency it was designed to avoid.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
    runChecks,
    buildManifest,
    findRespondentGrants,
    findPermissionCalls,
    countPermissionProcedureMentions,
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

/** A minimal repo-shaped fixture: real metadata, plus whatever migrations the case needs. */
function fixture(build) {
    const root = mkdtempSync(join(tmpdir(), 'dist-gate-'));
    cpSync(join(REPO_ROOT, 'metadata'), join(root, 'metadata'), {
        recursive: true,
        // `dereference` so a symlink under metadata/ is copied as content: cases below WRITE into
        // this copy, and through a link those writes would land in the real working tree.
        dereference: true,
        filter: (src) => !src.includes(`${'metadata'}/sql_logging`),
    });
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

// 1. The state MJ Forms was actually in: metadata present, no seed migration anywhere.
withFixture(
    () => {},
    (violations) => {
        check(
            'flags metadata that ships nowhere (no Metadata_Sync migration)',
            violations.some((v) => v.includes('ships') && v.includes('NOWHERE')),
            JSON.stringify(violations),
        );
    },
);

// 2. A seed exists but nothing records what it was generated from.
withFixture(
    (root) => writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n'),
    (violations) => {
        check(
            'flags a seed migration with no manifest to date it',
            violations.some((v) => v.includes('metadata-seed.manifest.json')),
            JSON.stringify(violations),
        );
    },
);

// 3. The common case this exists for: someone edits metadata and does not regenerate the seed.
withFixture(
    (root) => {
        writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n');
        writeFileSync(
            join(root, 'migrations', 'metadata-seed.manifest.json'),
            JSON.stringify(buildManifest(root), null, 2),
        );
        // Edit a record AFTER the manifest was written — exactly the drift being guarded against.
        const rolesPath = join(root, 'metadata', 'roles', '.roles.json');
        const roles = JSON.parse(readFileSync(rolesPath, 'utf-8'));
        roles[0].fields.Description = 'edited after the seed was generated';
        writeFileSync(rolesPath, JSON.stringify(roles, null, 2));
    },
    (violations) => {
        check(
            'flags metadata edited after the seed was generated',
            violations.some((v) => v.includes('.roles.json') && v.includes('changed since')),
            JSON.stringify(violations),
        );
    },
);

// 4. A `sync` block rewritten by a push is bookkeeping, not content — it must NOT fire, or the
//    gate cries wolf on the very push that regenerated the seed.
withFixture(
    (root) => {
        writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n');
        writeFileSync(
            join(root, 'migrations', 'metadata-seed.manifest.json'),
            JSON.stringify(buildManifest(root), null, 2),
        );
        const rolesPath = join(root, 'metadata', 'roles', '.roles.json');
        const roles = JSON.parse(readFileSync(rolesPath, 'utf-8'));
        roles[0].sync = { lastModified: '2099-01-01T00:00:00.000Z', checksum: 'deadbeef' };
        writeFileSync(rolesPath, JSON.stringify(roles, null, 2));
    },
    (violations) => {
        check(
            'ignores a rewritten sync block (bookkeeping, not content)',
            !violations.some((v) => v.includes('.roles.json')),
            JSON.stringify(violations),
        );
    },
);

// 5. The placeholder leak, in the form it actually shipped in.
withFixture(
    (root) => {
        writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n');
        writeFileSync(
            join(root, 'migrations', 'metadata-seed.manifest.json'),
            JSON.stringify(buildManifest(root), null, 2),
        );
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
        writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n');
        writeFileSync(
            join(root, 'migrations', 'metadata-seed.manifest.json'),
            JSON.stringify(buildManifest(root), null, 2),
        );
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
 * so each case states only what it is testing — but built in the REAL shape, because a
 * hand-simplified `EXEC ... @RoleID = '<literal>'` would exercise a parser path the shipped files
 * never take.
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
        roleBinding === 'byId'
            ? "'A18E13FC-B2C1-4E77-A3D7-EE775BDE098C'"
            : `(SELECT ID FROM [\${mjSchema}].[Role] WHERE Name = N'Form Respondent')`;
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
        `SET\n  @RoleID_${suffix} = ${role}`,
        `SET\n  @CanCreate_${suffix} = ${canCreate}`,
        `SET\n  @CanRead_${suffix} = ${canRead}`,
        `SET\n  @CanUpdate_${suffix} = ${canUpdate}`,
        `SET\n  @CanDelete_${suffix} = ${canDelete}`,
        ...create.sets,
        ...read.sets,
        `SET\n  @Type_${suffix} = N'Allow' EXEC [\${mjSchema}].${procedure} @ID = @ID_${suffix},`,
        [
            `  @EntityID = @EntityID_${suffix}`,
            `  @RoleID = @RoleID_${suffix}`,
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
    ].join('\n');
}

/** A seed file: the header comment these always carry, then the records. */
function seedSql(...records) {
    return `-- MJ Forms metadata seed (fixture)\n-- =====================================\nGO\n\n${records.join('\n')}`;
}

/** A fixture where CHECKs 1 and 2 are already satisfied, so only CHECK 3 can speak. */
function quietRepo(root) {
    writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n');
    writeFileSync(join(root, 'migrations', 'metadata-seed.manifest.json'), JSON.stringify(buildManifest(root), null, 2));
}

/** Drops one extra seed file into an otherwise-quiet repo and asserts on what CHECK 3 says. */
function withSeed(fileName, sql, assert) {
    withFixture(
        (root) => {
            quietRepo(root);
            writeFileSync(join(root, 'migrations', fileName), sql);
        },
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
        quietRepo(root);
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
        quietRepo(root);
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

if (failures > 0) {
    console.error(`\n${failures} gate self-test(s) failed.`);
    process.exit(1);
}
console.log('\nAll distribution-gate self-tests passed.');
