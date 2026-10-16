-- =============================================================================================
-- MJ Forms v0.16.x — put five fields in their category panels on hosts built from migrations (#303)
-- =============================================================================================
-- THE DEFECT. CodeGen's Angular generator files a field under its `Category` panel only when BOTH
-- columns say so: `GeneratedFormSection = 'Category'` AND a non-empty `Category`. 'Details' sends it
-- to a generic "Details" panel, and 'Category' with no category drops it from the form entirely
-- (MJ/packages/CodeGenLib/src/Angular/angular-codegen.ts:669-672). `GeneratedFormSection` defaults
-- to 'Details', and two migrations in this directory insert EntityField rows without naming it:
--
--   V202609121200  FormDistribution.AllowDeviceResume, FormDistribution.AllowedOrigins,
--                  FormResponse.FormDistributionID, FormResponse.FormDistribution (virtual)
--   V202610131349  FormAutomationRun.FormAutomationEventID
--
-- `V202609141900` §3 set `Category` on the first four, saying that was why they landed in "Details".
-- It was half the cause: their `GeneratedFormSection` is still 'Details' on every host built from
-- migrations, so the curated category never takes effect. FormAutomationEventID gets both from the
-- CodeGen block V202610131349 appends (by the row's id: 'Automation Context', 'Category'); it is
-- listed here, with that same category, only for a host whose row carries another id.
--
-- The generated Explorer forms committed in `packages/Angular/src/lib/generated/` place the first
-- four in their category panels, because the database CodeGen ran against already had them as
-- 'Category'. A host's metadata says otherwise, and that is what a host's Explorer renders: a stray
-- "Details" panel on the Form Distribution, Form Response and Form Automation Run forms, and on Form
-- Response a lone `FormDistributionID` with no label (CodeGen emits `[ShowLabel]="false"` for a
-- section holding one field, angular-codegen.ts:863).
--
-- WHY A MIGRATION AND NOT A CODEGEN RUN. `mj app install` puts `__mj_BizAppsForms` in the host's
-- `excludeSchemas`, so CodeGen never revisits these rows on a host — `V202609142000` gives the
-- source lines. `migrations/` is the only channel that reaches one.
--
-- WHY BOTH COLUMNS. Setting only `GeneratedFormSection` would make a field with no `Category` vanish
-- from its form (see above). Each row is listed with the category it already has where it has one:
-- the four with what `V202609141900` gave them, FormAutomationEventID with the 'Automation Context'
-- panel V202610131349 and the generated Explorer form put it in.
--
-- WHAT IT OVERWRITES, AND WHAT IT LEAVES. Only the values nobody chose: `GeneratedFormSection` is
-- changed only where it still holds the column default 'Details', and `Category` only where it is
-- NULL, the same rule `V202609141900` §3 used. A host whose administrator moved one of these fields
-- to 'Top', or renamed its category, keeps that choice. Re-running the file changes nothing.
--
-- WHY THE NATURAL KEY AND NOT THE ROW IDS. `EntityField` ids are minted per database (the INSERTs
-- in V202609121200 and V202610131349 guard on `EntityID + Name` for exactly that reason), so the
-- rows are found by entity base table, schema and field name.
--
-- WHY THE THROW. Each of the five rows is inserted by an earlier migration in this directory, so a
-- missing one means the chain did not run in order. Updating the four that exist and saying nothing
-- would ship a half-repaired layout with no signal; failing the migration names the problem.
--
-- This is a plain UPDATE of existing `EntityField` rows, which `lint:codegen-append` deliberately
-- does not count as CodeGen output (scripts/check-codegen-append.mjs, `hasGeneratedShape`), so the
-- file carries no appended CodeGen block. No schema changes, so no PostgreSQL twin is owed beyond the
-- next `mj:migrate:convert` (migrations-pg/README.md).
--
-- ONE BATCH. `@Wanted` goes out of scope at a `GO`.
-- =============================================================================================

DECLARE @Wanted TABLE (
    [BaseTable] NVARCHAR(255) NOT NULL,
    [FieldName] NVARCHAR(255) NOT NULL,
    [Category]  NVARCHAR(255) NOT NULL
);

INSERT INTO @Wanted ([BaseTable], [FieldName], [Category]) VALUES
    ('FormDistribution',  'AllowDeviceResume',  'Access and Limits'),
    ('FormDistribution',  'AllowedOrigins',     'Access and Limits'),
    ('FormResponse',      'FormDistributionID', 'Form & Status'),
    ('FormResponse',      'FormDistribution',   'Form & Status'),
    ('FormAutomationRun', 'FormAutomationEventID', 'Automation Context');

DECLARE @Found INT = (
    SELECT COUNT(*)
      FROM @Wanted w
      JOIN [${mjSchema}].[Entity] e
        ON e.[BaseTable]  = w.[BaseTable]
       AND e.[SchemaName] = '${flyway:defaultSchema}'
      JOIN [${mjSchema}].[EntityField] ef
        ON ef.[EntityID] = e.[ID]
       AND ef.[Name]     = w.[FieldName]
);

IF @Found <> 5
    THROW 51303, N'#303: expected 5 [EntityField] rows (FormDistribution.AllowDeviceResume/AllowedOrigins, FormResponse.FormDistributionID/FormDistribution, FormAutomationRun.FormAutomationEventID) in this schema and found fewer. Run the Forms migrations in order.', 1;

UPDATE ef
   SET ef.[GeneratedFormSection] = CASE WHEN ef.[GeneratedFormSection] = 'Details' THEN 'Category' ELSE ef.[GeneratedFormSection] END,
       ef.[Category]             = COALESCE(ef.[Category], w.[Category])
  FROM [${mjSchema}].[EntityField] ef
  JOIN [${mjSchema}].[Entity] e
    ON e.[ID]         = ef.[EntityID]
   AND e.[SchemaName] = '${flyway:defaultSchema}'
  JOIN @Wanted w
    ON w.[BaseTable] = e.[BaseTable]
   AND w.[FieldName] = ef.[Name]
 WHERE ef.[GeneratedFormSection] = 'Details'
    OR ef.[Category] IS NULL;
