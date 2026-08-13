-- =============================================================================================
-- MJ Forms teardown — retire this app's rows from the shared core schema on `mj app remove`
-- =============================================================================================
-- SCOPE. Dropping `__mj_BizAppsForms` reclaims everything Forms owns in its OWN schema, and
-- `mj app remove` separately walks the foreign-key graph out from this app's `__mj.Entity` rows
-- (RemoveAppEntityMetadata) and retires app-owned Applications and SchemaInfo. Neither reaches the
-- metadata-seed payload: the roles, actions, AI prompts, templates and dashboards that
-- `V202608081700__v0.8.x__Metadata_Sync.sql` writes into `__mj`, plus the row-level-security
-- filters `V202608131600__v0.10.x__Respondent_Grant_Hardening.sql` adds. Without this file they survive a
-- remove, and the next install re-INSERTs the same fixed UUIDs and fails on a primary-key
-- collision. That is the whole reason the file exists.
--
-- WHAT IS LISTED BELOW IS ONLY THE ROOTS. Twenty-one rows — the ones this app's migrations create
-- that nothing else creates (eighteen from the seed, plus the three row-level-security filters
-- V202608131600 adds for #39). Their children are NOT listed, because listing them is what breaks: a static
-- delete list only orders rows the SEED made, while a real installation also holds runtime
-- children (action execution logs, prompt runs, user-application grants, dashboard state) that a
-- pristine canary database does not. bizapps-caliber shipped the static version first and had 11
-- of its deletes blocked on a used database while passing cleanly on a fresh one. The engine below
-- is ported from `bizapps-caliber/migrations-teardown/V001__Retire_Caliber_Core_Rows.sql`; the
-- lessons in its comments were paid for there, not rediscovered here.
--
-- HOW IT DECIDES. Dependents are discovered from `sys.foreign_keys` AT APPLY TIME:
--   • a NULLABLE reference is set to NULL — that row belongs to the customer and merely points at
--     ours; deleting their record because it referenced our Action would destroy data that is not
--     ours to destroy;
--   • a NOT NULL reference is deleted and joins the doomed set, because a row that cannot exist
--     without its parent is meaningless once the parent is gone;
--   • a reference from OUR OWN schema is deleted whatever its column says, because
--     `mj app remove` runs this file BEFORE it drops `__mj_BizAppsForms` (HandleTeardown, then
--     DropAppSchema), so our rows are still there and still pointing at the Actions we are
--     retiring. Both alternatives are wrong: leaving them blocks the Action delete with
--     FK_FormAutomation_Action, and NULLing `FormAutomation.ActionID` violates
--     CK_FormAutomation_SingleTarget, which requires exactly one of ActionID / BindingID. Either
--     way the single transaction rolls back and an install that ever configured one automation
--     could not be removed at all. Both were observed by running this against a database with
--     real automation rows; a pristine canary has none and passes either way.
--
-- CONSEQUENCE WORTH STATING PLAINLY. Seeding the two Roles dooms every `EntityPermission` and
-- `UserRole` row pointing at them — including grants an operator added by hand. That is correct
-- (a permission cannot outlive its role) and it is why the plan is printed before it executes.
--
-- RUNTIME. MJ executes this file as ONE statement inside ONE transaction and rolls everything back
-- on error, so there is no `GO` here and no partial application. Exactly one placeholder is
-- substituted at teardown time: `${mjSchema}`. The app-schema placeholder used by regular
-- migrations is NOT substituted here and must never appear.
-- =============================================================================================

CREATE TABLE #FormsDoomed (
    SchemaName sysname NOT NULL,
    TableName  sysname NOT NULL,
    RowID      UNIQUEIDENTIFIER NOT NULL,
    Depth      INT NOT NULL,
    PRIMARY KEY (TableName, RowID)
);

INSERT INTO #FormsDoomed (SchemaName, TableName, RowID, Depth) VALUES
    -- Roles. Doom their EntityPermission and UserRole children by construction.
    --
    -- ⚠️ DOOMED BY CANONICAL ID, WHICH DELIBERATELY MISSES AN ADOPTED ROLE (#39). Since 0.8.0's
    -- role create became adopt-or-skip by NAME, a host where a sibling app minted `Form Respondent`
    -- first carries it under that app's id — so the row below matches nothing there and the role
    -- survives this teardown. That is correct, not a gap: the row is not ours, and restoring the
    -- pre-Forms state is this file's whole contract. Nothing is left dangling by it either — the
    -- permission rows on that surviving role all point at Forms ENTITIES, and `mj app remove` walks
    -- those out separately (RemoveAppEntityMetadata); `EntityPermission.EntityID` is NOT NULL, so
    -- they go with the entities regardless of which role owns them.
    ('${mjSchema}', 'Role',              'A18E13FC-B2C1-4E77-A3D7-EE775BDE098C', 0),  -- Form Respondent
    ('${mjSchema}', 'Role',              '5154187D-0AB9-4C75-A444-CFC3D10E1BC0', 0),  -- Forms Automation Runner
    -- Row-level-security filters seeded by V202608131600 (#39). Listed for the same reason as the
    -- Dashboards below — every reference to them is NULLABLE, so the engine would release the
    -- references and keep the rows, and the next install would then re-INSERT the same fixed UUIDs
    -- and fail on a primary-key collision.
    --
    -- Forms owns these records precisely so that a CO-INSTALLED app's uninstall cannot null the
    -- filter slots on Forms' permission rows and hand the anonymous role its grants back unfiltered
    -- — the regression #39 documents. The symmetric obligation is this list: when FORMS is the app
    -- being removed, its own filters go with it.
    ('${mjSchema}', 'RowLevelSecurityFilter', '7F0E0001-A1B2-4C3D-8E4F-000000000001', 0),  -- Respondent Gate Only, Never A Writer
    ('${mjSchema}', 'RowLevelSecurityFilter', '7F0E0002-A1B2-4C3D-8E4F-000000000002', 0),  -- Respondent Own Distribution
    ('${mjSchema}', 'RowLevelSecurityFilter', '7F0E0003-A1B2-4C3D-8E4F-000000000003', 0),  -- Respondent Own Form Versions
    -- Actions (ActionParam.ActionID is NOT NULL, so the 9 params follow automatically).
    ('${mjSchema}', 'Action',            '7F0A0001-A1B2-4C3D-8E4F-000000000001', 0),  -- Generate Form From Brief
    ('${mjSchema}', 'Action',            '7F0A0002-A1B2-4C3D-8E4F-000000000002', 0),  -- Create Form From Template
    ('${mjSchema}', 'Action',            '7F0A0003-A1B2-4C3D-8E4F-000000000003', 0),  -- Upsert Respondent Person
    ('${mjSchema}', 'Action',            '7F0A0004-A1B2-4C3D-8E4F-000000000004', 0),  -- Send Confirmation Email
    ('${mjSchema}', 'Action',            '7F0A0005-A1B2-4C3D-8E4F-000000000005', 0),  -- Create Followup Task
    ('${mjSchema}', 'Action',            '7F0A0006-A1B2-4C3D-8E4F-000000000006', 0),  -- Analyze Written Responses
    ('${mjSchema}', 'ActionCategory',    '7F0C0001-A1B2-4C3D-8E4F-000000000001', 0),  -- Forms
    -- AI prompts (AIPromptModel.PromptID is NOT NULL) and their category.
    ('${mjSchema}', 'AIPrompt',          '6B7C8D9E-0F1A-4B2C-3D4E-5F6071829304', 0),  -- Forms: Form Designer
    ('${mjSchema}', 'AIPrompt',          'B2C3D4E5-F6A7-4B8C-9D0E-1F2A3B4C5D6E', 0),  -- Forms: Response Analyzer
    ('${mjSchema}', 'AIPromptCategory',  '4F5A6B7C-8D9E-4F0A-1B2C-3D4E5F607182', 0),  -- MJ_BizApps_Forms
    -- Templates (TemplateContent and TemplateParam are NOT NULL children).
    ('${mjSchema}', 'Template',          '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61', 0),  -- Form Designer
    ('${mjSchema}', 'Template',          'F6A7B8C9-D0E1-4F2A-3B4C-5D6E7F809102', 0),  -- Response Analyzer
    -- The Forms application (ApplicationEntity / ApplicationRole / UserApplication are NOT NULL).
    ('${mjSchema}', 'Application',       'BFB97C57-4552-4643-8933-A0B2D76544D8', 0),  -- Forms
    -- Dashboards. Listed explicitly rather than left to the Application cascade, because
    -- Dashboard.ApplicationID is NULLABLE — the engine would release the reference and keep the row.
    ('${mjSchema}', 'Dashboard',         'EB23CCFD-AAF5-48BE-8B81-33A3944AD898', 0),  -- Forms Reporting
    ('${mjSchema}', 'Dashboard',         '3F8A6B12-9C4D-4E7A-B1F2-5A6D7E8C9012', 0),  -- Forms
    -- The app-nav user view.
    ('${mjSchema}', 'UserView',          '7F0D0001-A1B2-4C3D-8E4F-000000000001', 0),  -- All Forms
    -- The automation service principal. Its `UserRole` grant is a NOT NULL child and follows
    -- automatically. Listed because the seed CREATES this user with a fixed UUID, so leaving it
    -- behind makes the next install fail on a primary-key collision.
    --
    -- Be aware of what this cascades: `RecordChange.UserID` is NOT NULL, so retiring the principal
    -- also retires the audit rows for changes IT made — automation writes to form responses. Those
    -- rows cannot outlive the identity that authored them, and the plan is printed before it runs,
    -- but it is the one place this teardown removes history rather than configuration.
    ('${mjSchema}', 'User',              '9F2B7C41-6E8D-4A53-B1F0-3C7D5E9A2B84', 0);  -- Forms Automation Service

-- MJ's own AtomicBatchScript sets this, and for the same reason: with XACT_ABORT OFF an error
-- inside EXEC sp_executesql does NOT abort the batch, so the loop would keep issuing destructive
-- statements against an already-doomed transaction.
SET XACT_ABORT ON;

-- ── The engine ────────────────────────────────────────────────────────────────────────────────
-- Discovers dependents from the catalog at apply time rather than trusting a build-time ordering.
-- Bounded, and it fails loudly rather than half-finishing.

DECLARE @pass INT = 0;
DECLARE @MAX_PASSES INT = 25;
DECLARE @changed INT = 1;

WHILE @changed > 0 AND @pass < @MAX_PASSES
BEGIN
    SET @pass += 1;
    SET @changed = 0;

    DECLARE @childSchema sysname, @childTable sysname, @childCol sysname,
            @parentTable sysname, @isNullable BIT, @sql NVARCHAR(MAX);

    DECLARE fk_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT DISTINCT SCHEMA_NAME(pt.schema_id), pt.name, pc.name, rt.name,
               -- EFFECTIVE nullability, not declared nullability. A row in OUR OWN schema is
               -- doomed whatever its column says, so it takes the delete branch below.
               CASE WHEN SCHEMA_NAME(pt.schema_id) = '__mj_BizAppsForms' THEN CAST(0 AS BIT)
                    ELSE pc.is_nullable END
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.tables  pt ON pt.object_id = fk.parent_object_id
        JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
        JOIN sys.tables  rt ON rt.object_id = fk.referenced_object_id
        JOIN sys.columns rc ON rc.object_id = rt.object_id AND rc.column_id = fkc.referenced_column_id
        WHERE SCHEMA_NAME(rt.schema_id) IN ('${mjSchema}', '__mj_BizAppsForms')
          AND rc.name = 'ID'
          -- Single-column constraints only — see the note on the levelling query.
          AND (SELECT COUNT(*) FROM sys.foreign_key_columns c2
               WHERE c2.constraint_object_id = fk.object_id) = 1
          -- Matched on SCHEMA **and** name. Matching on name alone is a live hazard here: the walk
          -- now spans two schemas, and dooming `__mj.Application` must not drag in a same-named
          -- table from another. It also lets an own-schema parent expand its own children — which
          -- is why `__mj_BizAppsForms` appears in the referenced-schema list above: once
          -- FormAutomation is doomed (for pointing at a doomed Action), FormAutomationRun must
          -- follow it, and that FK never touches the core schema at all.
          AND EXISTS (SELECT 1 FROM #FormsDoomed d
                       WHERE d.TableName = rt.name
                         AND d.SchemaName = SCHEMA_NAME(rt.schema_id));

    OPEN fk_cursor;
    FETCH NEXT FROM fk_cursor INTO @childSchema, @childTable, @childCol, @parentTable, @isNullable;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        IF @isNullable = 1
        BEGIN
            -- Someone else's row that merely points at ours. Release the reference, keep the row.
            SET @sql = N'UPDATE c SET c.[' + @childCol + N'] = NULL
                         FROM [' + @childSchema + N'].[' + @childTable + N'] c
                         WHERE c.[' + @childCol + N'] IN (SELECT RowID FROM #FormsDoomed WHERE TableName = @p)';
            EXEC sp_executesql @sql, N'@p sysname', @p = @parentTable;
            SET @changed += @@ROWCOUNT;
        END
        ELSE
        BEGIN
            -- Cannot exist without the parent, so it is doomed too.
            SET @sql = N'INSERT INTO #FormsDoomed (SchemaName, TableName, RowID, Depth)
                         SELECT ''' + @childSchema + N''', ''' + @childTable + N''', c.[ID], @pass
                         FROM [' + @childSchema + N'].[' + @childTable + N'] c
                         WHERE c.[' + @childCol + N'] IN (SELECT RowID FROM #FormsDoomed WHERE TableName = @p)
                           AND NOT EXISTS (SELECT 1 FROM #FormsDoomed d
                                           WHERE d.TableName = ''' + @childTable + N''' AND d.RowID = c.[ID])';
            EXEC sp_executesql @sql, N'@p sysname, @pass INT', @p = @parentTable, @pass = @pass;
            SET @changed += @@ROWCOUNT;
        END

        FETCH NEXT FROM fk_cursor INTO @childSchema, @childTable, @childCol, @parentTable, @isNullable;
    END
    CLOSE fk_cursor;
    DEALLOCATE fk_cursor;
END

IF @pass >= @MAX_PASSES AND @changed > 0
    THROW 51103, 'MJ Forms teardown did not converge: the dependency graph is deeper than MAX_PASSES. Nothing has been committed.', 1;

-- ── Order the deletes by the FK graph, not by discovery order ─────────────────────────────────
-- Discovery depth is NOT a topological order: two tables can be discovered in the same pass from
-- different parents and still be parent and child of each other (Caliber hit exactly this with
-- MagicLinkInvite reached from Role and MagicLinkInviteApplication reached from Application, both
-- landing at depth 1). Forms seeds both a Role and an Application, so it reaches the same pair.
--
-- So compute a real level: a table sits one above every doomed table it references, and deletes
-- run highest level first. Relaxation is bounded; a non-nullable cycle would otherwise spin.
-- Keyed on SCHEMA + NAME, not name alone: `__mj.Application` is not the only Application, and
-- `__mj.Task`/`__mj_BizAppsTasks.Task` genuinely coexist in any database that has Forms installed,
-- since bizapps-tasks is a hard dependency.
CREATE TABLE #FormsLevel (SchemaName sysname NOT NULL, TableName sysname NOT NULL, Lvl INT NOT NULL, PRIMARY KEY (SchemaName, TableName));

INSERT INTO #FormsLevel (SchemaName, TableName, Lvl)
SELECT DISTINCT SchemaName, TableName, 0 FROM #FormsDoomed;

DECLARE @relax INT = 0;
DECLARE @MAX_RELAX INT = 50;
DECLARE @moved INT = 1;

WHILE @moved > 0 AND @relax < @MAX_RELAX
BEGIN
    SET @relax += 1;

    UPDATE child
    SET child.Lvl = parent.Lvl + 1
    FROM #FormsLevel child
    JOIN (
        SELECT DISTINCT
               SCHEMA_NAME(pt.schema_id) AS ChildSchema, pt.name AS ChildTable,
               SCHEMA_NAME(rt.schema_id) AS ParentSchema, rt.name AS ParentTable
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.tables  pt ON pt.object_id = fk.parent_object_id
        JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
        JOIN sys.tables  rt ON rt.object_id = fk.referenced_object_id
        JOIN sys.columns rc ON rc.object_id = rt.object_id AND rc.column_id = fkc.referenced_column_id
        WHERE rc.name = 'ID'
          -- Same EFFECTIVE nullability rule as the discovery cursor. Without the own-schema arm
          -- here, `FormAutomation` would be doomed but carry no level edge to `Action`, and the
          -- highest-level-first delete could run Action before it — the exact FK failure this
          -- ordering pass exists to prevent.
          AND (pc.is_nullable = 0 OR SCHEMA_NAME(pt.schema_id) = '__mj_BizAppsForms')
          AND SCHEMA_NAME(rt.schema_id) IN ('${mjSchema}', '__mj_BizAppsForms')
          -- Single-column constraints only. MJ's EnumerateMjEntityFkGraph skips composites for the
          -- same reason: treating one column of a composite key as a standalone edge would null
          -- half a key or match a child on a partial reference.
          AND (SELECT COUNT(*) FROM sys.foreign_key_columns c2
               WHERE c2.constraint_object_id = fk.object_id) = 1
          AND NOT (pt.object_id = rt.object_id)
    ) edge ON edge.ChildTable = child.TableName AND edge.ChildSchema = child.SchemaName
    JOIN #FormsLevel parent ON parent.TableName = edge.ParentTable AND parent.SchemaName = edge.ParentSchema
    WHERE child.Lvl <= parent.Lvl;

    SET @moved = @@ROWCOUNT;
END

IF @moved > 0
    THROW 51105, 'MJ Forms teardown could not order its deletes within MAX_RELAX passes: either a non-nullable foreign-key CYCLE among the doomed tables, or a dependency chain deeper than the bound. Nothing has been committed.', 1;

-- Announce the plan before executing it. MJ's own teardown prints what it is about to remove; an
-- unrecallable delete of "what your system did" should be announced rather than discovered.
-- RAISERROR(...,0,1) WITH NOWAIT so it streams immediately.
DECLARE @planLine NVARCHAR(400);
DECLARE plan_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT CONCAT('  delete ', d.SchemaName, '.', d.TableName, ' x', COUNT(*))
    FROM #FormsDoomed d GROUP BY d.SchemaName, d.TableName ORDER BY COUNT(*) DESC;
RAISERROR('MJ Forms teardown plan (rows to remove from the shared core schema):', 0, 1) WITH NOWAIT;
OPEN plan_cursor;
FETCH NEXT FROM plan_cursor INTO @planLine;
WHILE @@FETCH_STATUS = 0
BEGIN
    RAISERROR(@planLine, 0, 1) WITH NOWAIT;
    FETCH NEXT FROM plan_cursor INTO @planLine;
END
CLOSE plan_cursor; DEALLOCATE plan_cursor;

DECLARE @lvl INT = (SELECT MAX(Lvl) FROM #FormsLevel);
WHILE @lvl >= 0
BEGIN
    DECLARE @delSchema sysname, @delTable sysname, @delSql NVARCHAR(MAX);
    DECLARE del_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT SchemaName, TableName FROM #FormsLevel WHERE Lvl = @lvl;
    OPEN del_cursor;
    FETCH NEXT FROM del_cursor INTO @delSchema, @delTable;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Joined on SchemaName as well as TableName: identical GUIDs in two same-named tables in
        -- two schemas is not a shape to bet against in a multi-Open-App database.
        SET @delSql = N'DELETE t FROM [' + @delSchema + N'].[' + @delTable + N'] t
                        JOIN #FormsDoomed d ON d.RowID = t.[ID]
                        WHERE d.TableName = @t AND d.SchemaName = @s';
        EXEC sp_executesql @delSql, N'@t sysname, @s sysname', @t = @delTable, @s = @delSchema;
        FETCH NEXT FROM del_cursor INTO @delSchema, @delTable;
    END
    CLOSE del_cursor;
    DEALLOCATE del_cursor;
    SET @lvl -= 1;
END

-- Postcondition: every seeded root is gone. A teardown that reports success while leaving rows
-- behind is the failure this design exists to prevent, so it is asserted rather than assumed.
DECLARE @remaining INT = 0;
DECLARE @chkSchema sysname, @chkTable sysname, @chkSql NVARCHAR(MAX), @chkCount INT;
DECLARE chk_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT DISTINCT SchemaName, TableName FROM #FormsDoomed WHERE Depth = 0;
OPEN chk_cursor;
FETCH NEXT FROM chk_cursor INTO @chkSchema, @chkTable;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @chkSql = N'SELECT @c = COUNT(*) FROM [' + @chkSchema + N'].[' + @chkTable + N'] t
                    JOIN #FormsDoomed d ON d.RowID = t.[ID]
                    WHERE d.TableName = @t AND d.SchemaName = @s';
    EXEC sp_executesql @chkSql, N'@t sysname, @s sysname, @c INT OUTPUT', @t = @chkTable, @s = @chkSchema, @c = @chkCount OUTPUT;
    SET @remaining += ISNULL(@chkCount, 0);
    FETCH NEXT FROM chk_cursor INTO @chkSchema, @chkTable;
END
CLOSE chk_cursor;
DEALLOCATE chk_cursor;

IF @remaining > 0
    THROW 51104, 'MJ Forms teardown finished with seeded rows still present. Nothing has been committed.', 1;

-- Unreachable on the THROW paths above, deliberately: MJ runs this inside a transaction and rolls
-- back on any error, and a ROLLBACK drops temp tables created inside it. Kept for the success path
-- because MJ can run several teardown files on the SAME connection in the SAME transaction.
DROP TABLE #FormsDoomed;
DROP TABLE #FormsLevel;
