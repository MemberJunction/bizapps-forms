#!/usr/bin/env node
/**
 * Proves the migration-ordering gate FIRES.
 *
 * Every case below is a reconstruction of a defect that actually reached a pull request, in
 * miniature: a procedure regenerated from a stale database, a trigger that outruns the column it
 * writes, an EntityField insert that outruns its Entity row. A gate nobody has watched fail is
 * indistinguishable from one that returns "pass" unconditionally — and this gate guards a class
 * of bug whose entire character is that the authoring machine looks fine.
 *
 * Plain Node, matching `check-distribution-seed.spec.mjs`: the gate is stdlib-only so it can run
 * in CI without installing anything, and its test must not reintroduce that dependency.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runChecks, findColumnsAdded, findProcedures, findEntityFieldDependencies } from './check-migration-order.mjs';

let failures = 0;
function check(name, condition, detail) {
    if (condition) {
        console.log(`  ✓ ${name}`);
    } else {
        console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
        failures++;
    }
}

/** A throwaway repo containing exactly the migrations a case needs. */
function withMigrations(files, assert) {
    const root = mkdtempSync(join(tmpdir(), 'mig-order-'));
    mkdirSync(join(root, 'migrations'), { recursive: true });
    for (const [name, sql] of Object.entries(files)) {
        writeFileSync(join(root, 'migrations', name), sql);
    }
    try {
        assert(runChecks(root));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

const CREATE_WIDGET = `
CREATE TABLE [\${flyway:defaultSchema}].[Widget] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Title NVARCHAR(500) NOT NULL,
    CONSTRAINT PK_Widget PRIMARY KEY (ID)
);
GO
`;

const ENTITY_ROW_FOR_WIDGET = `
IF NOT EXISTS (SELECT 1 FROM [\${mjSchema}].[Entity] WHERE [BaseTable] = 'Widget')
BEGIN
   INSERT INTO [\${mjSchema}].[Entity] ( [ID], [Name], [BaseTable] )
   VALUES ( 'aaaa-1', 'Widgets', 'Widget' );
END
GO
`;

const TIMESTAMPS_FOR_WIDGET = `
ALTER TABLE [\${flyway:defaultSchema}].[Widget] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO
ALTER TABLE [\${flyway:defaultSchema}].[Widget] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO
`;

/** A CRUD procedure over Widget, with whichever parameters the case wants it to know about. */
function widgetProc(kind, params) {
    return `
IF OBJECT_ID('[\${flyway:defaultSchema}].[sp${kind}Widget]', 'P') IS NOT NULL
    DROP PROCEDURE [\${flyway:defaultSchema}].[sp${kind}Widget];
GO
CREATE PROCEDURE [\${flyway:defaultSchema}].[sp${kind}Widget]
    @ID uniqueidentifier,
${params.map((p) => `    @${p} nvarchar(MAX) = NULL`).join(',\n')}
AS
BEGIN
    SET NOCOUNT ON;
END
GO
`;
}

const ENTITY_FIELD_FOR_WIDGET = `
INSERT INTO [\${mjSchema}].[EntityField] ( [ID], [EntityID], [Name] )
   VALUES ( 'bbbb-1', (SELECT TOP 1 [ID] FROM [\${mjSchema}].[Entity] WHERE [BaseTable] = 'Widget'), 'Subtitle' );
GO
`;

const TRIGGER_FOR_WIDGET = `
CREATE TRIGGER [\${flyway:defaultSchema}].trgUpdateWidget
ON [\${flyway:defaultSchema}].[Widget]
AFTER UPDATE
AS
BEGIN
    UPDATE [\${flyway:defaultSchema}].[Widget]
    SET __mj_UpdatedAt = GETUTCDATE()
    FROM [\${flyway:defaultSchema}].[Widget] AS _w INNER JOIN inserted AS I ON _w.ID = I.ID;
END
GO
`;

console.log('\nCHECK 1 — a procedure regenerated from a stale database');

// 1. The defect exactly as it shipped: migration A adds a column and teaches the procedure about
//    it; migration B, generated an hour earlier, recreates the procedure without it.
withMigrations(
    {
        'V202601010000__v0.1.x__Create.sql': CREATE_WIDGET + ENTITY_ROW_FOR_WIDGET,
        'V202601020000__v0.1.x__Add_Column.sql':
            `ALTER TABLE [\${flyway:defaultSchema}].[Widget] ADD\n    Subtitle NVARCHAR(MAX) NULL;\nGO\n` +
            widgetProc('Update', ['Title', 'Subtitle']),
        'V202601030000__v0.1.x__Stale_Regen.sql': widgetProc('Update', ['Title']),
    },
    (violations) => {
        check(
            'catches a later migration dropping a parameter an earlier one added',
            violations.some((v) => v.includes('Stale_Regen') && v.includes('spUpdateWidget') && v.includes('[Subtitle]')),
            JSON.stringify(violations),
        );
    },
);

// 2. …and stays quiet when the LAST definition is the complete one. Order is the whole point:
//    the same two files in the other order are correct, and a gate that flagged both would be
//    telling authors to stop regenerating procedures at all.
withMigrations(
    {
        'V202601010000__v0.1.x__Create.sql': CREATE_WIDGET + ENTITY_ROW_FOR_WIDGET,
        'V202601020000__v0.1.x__Stale_Regen.sql': widgetProc('Update', ['Title']),
        'V202601030000__v0.1.x__Add_Column.sql':
            `ALTER TABLE [\${flyway:defaultSchema}].[Widget] ADD\n    Subtitle NVARCHAR(MAX) NULL;\nGO\n` +
            widgetProc('Update', ['Title', 'Subtitle']),
    },
    (violations) => {
        check('is quiet when the last definition knows every column', violations.length === 0, JSON.stringify(violations));
    },
);

// 3. spCreate is checked too — it takes the same parameters and fails the same way.
withMigrations(
    {
        'V202601010000__v0.1.x__Create.sql': CREATE_WIDGET + ENTITY_ROW_FOR_WIDGET,
        'V202601020000__v0.1.x__Add_Column.sql': `ALTER TABLE [\${flyway:defaultSchema}].[Widget] ADD\n    Subtitle NVARCHAR(MAX) NULL;\nGO\n`,
        'V202601030000__v0.1.x__Regen.sql': widgetProc('Create', ['Title']),
    },
    (violations) => {
        check(
            'checks spCreate, not just spUpdate',
            violations.some((v) => v.includes('spCreateWidget')),
            JSON.stringify(violations),
        );
    },
);

console.log('\nCHECK 2 — a CodeGen timestamp column referenced before it exists');

// 4. The trigger-before-column defect: CREATE TRIGGER resolves column names against the real
//    table, so this is a hard failure on a fresh install and invisible everywhere else.
withMigrations(
    {
        'V202601010000__v0.1.x__Create.sql': CREATE_WIDGET + ENTITY_ROW_FOR_WIDGET,
        'V202601020000__v0.1.x__Trigger_First.sql': TRIGGER_FOR_WIDGET,
        'V202601030000__v0.1.x__Timestamps.sql': TIMESTAMPS_FOR_WIDGET,
    },
    (violations) => {
        check(
            'catches a trigger writing __mj_UpdatedAt before the column is added',
            violations.some((v) => v.includes('Trigger_First') && v.includes('timestamp column')),
            JSON.stringify(violations),
        );
    },
);

// 5. …and is quiet once the column is added first. The unbracketed `__mj_UpdatedAt` in CodeGen's
//    trigger body is the exact spelling that slipped past the first draft of this gate.
withMigrations(
    {
        'V202601010000__v0.1.x__Create.sql': CREATE_WIDGET + ENTITY_ROW_FOR_WIDGET,
        'V202601020000__v0.1.x__Timestamps.sql': TIMESTAMPS_FOR_WIDGET,
        'V202601030000__v0.1.x__Trigger.sql': TRIGGER_FOR_WIDGET,
    },
    (violations) => {
        check('is quiet when the column is added first', violations.length === 0, JSON.stringify(violations));
    },
);

console.log('\nCHECK 3 — an EntityField insert that outruns its Entity row');

// 6. The NULL-EntityID abort. The IF NOT EXISTS guard passes on a NULL comparison, so this reaches
//    the INSERT and dies on the NOT NULL constraint.
withMigrations(
    {
        'V202601010000__v0.1.x__Create.sql': CREATE_WIDGET,
        'V202601020000__v0.1.x__Field_First.sql': ENTITY_FIELD_FOR_WIDGET,
        'V202601030000__v0.1.x__Entity_Row.sql': ENTITY_ROW_FOR_WIDGET,
    },
    (violations) => {
        check(
            'catches an EntityField insert before the Entity row exists',
            violations.some((v) => v.includes('Field_First') && v.includes('EntityField')),
            JSON.stringify(violations),
        );
    },
);

// 7. …and is quiet in the correct order.
withMigrations(
    {
        'V202601010000__v0.1.x__Create.sql': CREATE_WIDGET,
        'V202601020000__v0.1.x__Entity_Row.sql': ENTITY_ROW_FOR_WIDGET,
        'V202601030000__v0.1.x__Field.sql': ENTITY_FIELD_FOR_WIDGET,
    },
    (violations) => {
        check('is quiet when the Entity row comes first', violations.length === 0, JSON.stringify(violations));
    },
);

// 8. A baseline entity the repo never creates must not be flagged — most EntityField inserts here
//    target entities MJ shipped, and treating those as violations would make the gate useless.
withMigrations(
    {
        'V202601010000__v0.1.x__Create.sql': CREATE_WIDGET,
        'V202601020000__v0.1.x__Field.sql': ENTITY_FIELD_FOR_WIDGET,
    },
    (violations) => {
        check(
            'does not flag an Entity row this repo never creates (a baseline entity)',
            violations.length === 0,
            JSON.stringify(violations),
        );
    },
);

console.log('\nParsers');

// 9-11. The parsers carry the gate; a silent parse miss is a silent pass.
check(
    'parses columns from CREATE TABLE, skipping constraints and __mj_*',
    JSON.stringify(findColumnsAdded(CREATE_WIDGET).map((c) => c.column)) === JSON.stringify(['ID', 'Title']),
    JSON.stringify(findColumnsAdded(CREATE_WIDGET)),
);
check(
    'parses a multi-line ALTER … ADD',
    findColumnsAdded(
        `ALTER TABLE [\${flyway:defaultSchema}].[Widget] ADD\n    Subtitle NVARCHAR(MAX) NULL,\n    Caption NVARCHAR(10) NULL;`,
    ).map((c) => c.column).join(',') === 'Subtitle,Caption',
    JSON.stringify(findColumnsAdded(`ALTER TABLE [\${flyway:defaultSchema}].[Widget] ADD\n    Subtitle NVARCHAR(MAX) NULL,\n    Caption NVARCHAR(10) NULL;`)),
);
check(
    'parses a procedure parameter list',
    JSON.stringify(findProcedures(widgetProc('Update', ['Title']))[0].params) === JSON.stringify(['ID', 'Title']),
    JSON.stringify(findProcedures(widgetProc('Update', ['Title']))),
);
check(
    'reads the BaseTable an EntityField insert depends on',
    [...findEntityFieldDependencies(ENTITY_FIELD_FOR_WIDGET)].join(',') === 'Widget',
    JSON.stringify([...findEntityFieldDependencies(ENTITY_FIELD_FOR_WIDGET)]),
);

if (failures > 0) {
    console.error(`\n${failures} gate self-test(s) failed.`);
    process.exit(1);
}
console.log('\nAll migration-ordering self-tests passed.');
