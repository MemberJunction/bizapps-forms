-- Captcha is opt-in: FormDistribution.CaptchaRequired now defaults to 0.
--
-- The baseline declared the column `BIT NOT NULL DEFAULT 1`, and the submit gate is an OR of the
-- form's own `settings.captchaRequired` and this column. So a distribution row created without
-- naming the column — a direct INSERT, an import, an API caller relying on entity defaults —
-- demanded a captcha the form never asked for, and on a host with no Turnstile keys every final
-- submit to it was refused with "Captcha verification failed (turnstile-not-configured)", after the
-- respondent had typed everything. The builder always writes the column explicitly, so links
-- created through the UI were never affected; this closes the door for every other writer. See #122.
--
-- The default lives in THREE places, because CodeGen copies a column default into two more, and
-- all three have to agree or the next writer that relies on any one of them gets the old answer:
--   1. the SQL default constraint                       (direct INSERTs)
--   2. spCreateFormDistribution's ISNULL(@CaptchaRequired, 1)  (a NULL parameter)
--   3. __mj.EntityField.DefaultValue                     (BaseEntity.NewRecord(), i.e. every API/GraphQL caller)
-- This migration writes all three by hand rather than shipping a CodeGen run: the only generated
-- code that changes is a doc comment, and a full CodeGen regeneration would drag in whatever else
-- the generating database happened to hold (migrations/README.md, "order is a correctness
-- property"). Each step is idempotent, so re-running it is a no-op.
--
-- Existing rows are deliberately NOT touched. A stored 1 is either an author's explicit choice
-- through the builder or a direct writer's reliance on the old default, and the two cannot be told
-- apart after the fact; silently removing a captcha an author chose is the worse error. An operator
-- who knows a row was born by accident flips it in the builder, and the boot-time readiness check
-- now names any active link that still requires a captcha on a host without Turnstile.

-- 1. The column default. The baseline's inline DEFAULT got a server-generated name
--    (DF__FormDistr__Captc__<hex>, different on every host), so it is looked up, not assumed.
DECLARE @existingDefault sysname;
SELECT @existingDefault = dc.[name]
FROM sys.default_constraints dc
JOIN sys.columns c ON c.[object_id] = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormDistribution]')
  AND c.[name] = 'CaptchaRequired';

IF @existingDefault IS NOT NULL AND @existingDefault <> 'DF_FormDistribution_CaptchaRequired'
BEGIN
    DECLARE @dropDefault NVARCHAR(400) =
        'ALTER TABLE [${flyway:defaultSchema}].[FormDistribution] DROP CONSTRAINT ' + QUOTENAME(@existingDefault);
    EXEC (@dropDefault);
END

IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE [name] = 'DF_FormDistribution_CaptchaRequired'
      AND parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormDistribution]')
)
    ALTER TABLE [${flyway:defaultSchema}].[FormDistribution]
        ADD CONSTRAINT [DF_FormDistribution_CaptchaRequired] DEFAULT 0 FOR [CaptchaRequired];
GO

-- 2. The create procedure. CodeGen bakes the column default into `ISNULL(@CaptchaRequired, 1)`
--    (once per INSERT branch). Patched from the procedure's CURRENT text rather than re-created
--    from a copy, so this cannot regress a column added to the procedure after it was written —
--    the failure migrations/README.md rule 1 describes. ALTER keeps the EXECUTE grants CodeGen
--    issued; a DROP/CREATE would silently lose them.
DECLARE @proc NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormDistribution]'));
IF @proc IS NULL
    THROW 50122, 'spCreateFormDistribution is missing; the CodeGen chain this migration patches has not been applied.', 1;

IF CHARINDEX('ISNULL(@CaptchaRequired, 1)', @proc) > 0
BEGIN
    SET @proc = REPLACE(@proc, 'ISNULL(@CaptchaRequired, 1)', 'ISNULL(@CaptchaRequired, 0)');
    SET @proc = STUFF(@proc, CHARINDEX('CREATE PROCEDURE', @proc), LEN('CREATE PROCEDURE'), 'ALTER PROCEDURE');
    EXEC (@proc);
END
GO

-- 3. The entity metadata. This is the default BaseEntity applies on NewRecord(), so it is the one
--    every GraphQL mutation, action and script that goes through the entity layer actually sees.
--    Matched on the entity's NAME rather than a literal id: a host that ran CodeGen before the
--    shipped metadata holds this entity under an id of its own (migrations/README.md, CHECK 4).
UPDATE ef
   SET ef.[DefaultValue] = '((0))'
  FROM [${mjSchema}].[EntityField] ef
  JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
 WHERE e.[Name] = 'MJ_BizApps_Forms: Form Distributions'
   AND ef.[Name] = 'CaptchaRequired'
   AND ISNULL(ef.[DefaultValue], '') <> '((0))';
GO
