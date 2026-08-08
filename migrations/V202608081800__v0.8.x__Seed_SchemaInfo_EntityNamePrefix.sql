-- =============================================================================================
-- MJ Forms v0.8.x — declare the `MJ_BizApps_Forms: ` entity-name prefix IN THE DATABASE
-- =============================================================================================
-- THE PROBLEM. CodeGen derives a new entity's Name from its table name and then applies a
-- per-schema prefix rule, which it resolves from TWO sources, in this order
-- (`ManageMetadataBase.getNewEntityNameRule`, MJ 5.51.0 — `return configRule ?? dbRule`):
--
--   1. `mj.config.cjs` -> `newEntityDefaults.NameRulesBySchema`   — OUR config, which a host
--      installing this app does not have;
--   2. `${mjSchema}.SchemaInfo.EntityNamePrefix`                  — the database, which it does.
--
-- Until now Forms declared the rule only in source (1). Today's shipped `__mj.Entity` rows carry
-- the prefix as a literal (they are seeded by the appended CodeGen output in the migrations), so
-- nothing existing is misnamed — but the moment a host's own CodeGen run adds a Forms entity or
-- re-derives one, it names it `Form Widgets` rather than `MJ_BizApps_Forms: Form Widgets`, while
-- `@mj-biz-apps/forms-entities` registers the prefixed name. MJ's class factory resolves by entity
-- name, so the registration misses and nothing binds — silently, with every step reporting success.
-- bizapps-caliber shipped exactly this bug (its #119) and its
-- `V202608041800__v1.0.x__SeedSchemaInfoEntityNamePrefix.sql` carries the full post-mortem. This
-- is the cheap inoculation against the same failure here, taken while the cost is one UPDATE.
--
-- WHY IT SURVIVES. `${mjSchema}.spUpdateSchemaInfoFromDatabase` — the routine CodeGen calls to
-- reconcile SchemaInfo against the live database, and which this repo's own migrations invoke —
-- INSERTs rows for unknown schemas and UPDATEs only `Description` and `CanonicalSchemaName`. It
-- never writes `EntityNamePrefix`. So this value is set once and no later CodeGen run clobbers it.
--
-- Keyed on SchemaName, not on a hardcoded ID: the row is created by
-- `spUpdateSchemaInfoFromDatabase` during the baseline migration, so its ID is whatever that
-- assigned. Written as an upsert so the file is idempotent and does not care whether the baseline
-- has run yet.
-- =============================================================================================

DECLARE @SchemaName NVARCHAR(50)  = N'__mj_BizAppsForms';
DECLARE @Prefix     NVARCHAR(25)  = N'MJ_BizApps_Forms: ';

IF EXISTS (SELECT 1 FROM [${mjSchema}].[SchemaInfo] WHERE [SchemaName] = @SchemaName)
BEGIN
    UPDATE [${mjSchema}].[SchemaInfo]
       SET [EntityNamePrefix] = @Prefix,
           [__mj_UpdatedAt]   = GETUTCDATE()
     WHERE [SchemaName] = @SchemaName
       -- Never overwrite a prefix an operator has deliberately set to something else.
       AND ([EntityNamePrefix] IS NULL OR [EntityNamePrefix] = @Prefix);
END
ELSE
BEGIN
    INSERT INTO [${mjSchema}].[SchemaInfo]
        ([ID], [SchemaName], [EntityIDMin], [EntityIDMax], [EntityNamePrefix], [Description])
    VALUES
        (NEWID(), @SchemaName, 1, 1000, @Prefix,
         N'MJ Forms — forms, surveys and intake. Entities carry the MJ_BizApps_Forms: prefix.');
END
GO

-- Postcondition: the rule is in the database, or this migration did nothing useful and the bug it
-- prevents is still latent. Fail loudly rather than leave that to a silent misnaming later.
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[SchemaInfo]
                WHERE [SchemaName] = N'__mj_BizAppsForms'
                  AND [EntityNamePrefix] = N'MJ_BizApps_Forms: ')
    THROW 51110, 'SchemaInfo.EntityNamePrefix for __mj_BizAppsForms was not set. A host CodeGen run would name Forms entities without their prefix and every @RegisterClass registration would miss.', 1;
GO
