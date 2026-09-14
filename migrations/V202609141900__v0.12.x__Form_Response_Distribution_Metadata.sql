-- =============================================================================================
-- MJ Forms v0.12.x — the three metadata artifacts a migrations-only host still lacks for
-- FormResponse.FormDistributionID (#201)
-- =============================================================================================
-- V202609121200 repaired the EntityField half of #201: all four rows (AllowDeviceResume,
-- AllowedOrigins, FormDistributionID and the virtual FormDistribution) ship there, guarded on the
-- natural key, and a database built from migrations alone now has 15 EntityField rows against a
-- 15-column vwFormResponses. Measured 2026-09-14 on MJ_I201_Repro — migrations only, never CodeGen.
-- Form Response saves succeed there; the save-capture view-order fallback is gone.
--
-- THREE THINGS CODEGEN STILL DOES THAT NO MIGRATION DOES. Measured on the same database:
--
--   1. The EntityRelationship Form Distributions -> Form Responses (One To Many via
--      FormDistributionID) does not exist. CodeGen minted it on the clean room at 18:20:32,
--      28 seconds after the last migration committed. Without it the related-records collection
--      does not bundle in the API and does not render on the Form Distribution form.
--
--   2. EntityField.RelatedEntityNameFieldMap on FormDistributionID is NULL. This one is an ORDERING
--      defect, not an omission: V202609091600 DOES ship the
--      spUpdateEntityFieldRelatedEntityNameFieldMap call, guarded on a natural-key lookup of the
--      EntityField row -- but that row is created by V202609121200, which sorts THREE DAYS LATER.
--      The lookup returns NULL, the IF skips, and nothing says so. On a developer box CodeGen fills
--      the map in afterwards, which is exactly why nobody saw it. RelatedEntityID,
--      RelatedEntityFieldName and IncludeRelatedEntityNameFieldInBaseView are already correct --
--      they are columns in V202609121200's INSERT. RelatedEntityNameFieldMap is not, and is
--      reachable only through the procedure.
--
--   3. EntityField.Category is NULL on all four of V202609121200's rows. CodeGen does not fill
--      Category -- it is NULL on the CodeGen'd clean room too -- so this one is unauthored rather
--      than un-shipped, and it is why the generated form drops these fields into a generic
--      "Details" section instead of their curated one (related: #180).
--
-- WHY EVERY GUARD HERE IS A SEMANTIC KEY AND NEVER AN ID. The relationship id is minted per
-- database: the 2026-09-14 clean room produced 09519E97-EF0C-407D-AC6A-D2B53E3A89A4 and MJ_ATS_Dev
-- holds the same relationship as 552BEC6E-530C-4011-A08D-C2D36D4E85BC. An
-- `IF NOT EXISTS (… WHERE [ID] = '<literal>')` guard -- the shape CodeGen itself emits -- matches
-- neither and lands a SECOND copy on every database that ran CodeGen. EntityRelationship carries no
-- unique constraint on its natural key to stop that, and a duplicated row makes the next CodeGen run
-- emit a duplicate @FieldResolver so forms-server stops compiling: #64, then #66. That is what
-- `npm run lint:distribution` CHECK 4 exists to refuse, and its watershed sits at 202608211600, so
-- this file is held to it. The literal below is ours, for hosts that have no row at all.
--
-- Sequence is computed as MAX+1 rather than captured, for the reason V202609121200 records at
-- length: a captured value is a statement about the generating database, not a portable one.
-- =============================================================================================

-- ── 1. The relationship ───────────────────────────────────────────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityRelationship]
     WHERE [EntityID]              = '1FC60BDA-25B8-473B-ACE5-1238670D3535'
       AND [RelatedEntityID]       = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
       AND [RelatedEntityJoinField] = 'FormDistributionID')
BEGIN
    INSERT INTO [${mjSchema}].[EntityRelationship]
        ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type],
         [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES
        ('77148474-53ab-46c1-b485-d2b5e73ba039',
         '1FC60BDA-25B8-473B-ACE5-1238670D3535',  -- Entity:        MJ_BizApps_Forms: Form Distributions
         '63600739-7165-4BDC-B7D7-19A1B1951DFA',  -- RelatedEntity: MJ_BizApps_Forms: Form Responses
         'FormDistributionID',
         'One To Many',
         1,
         1,
         (SELECT ISNULL(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityRelationship]
           WHERE [EntityID] = '1FC60BDA-25B8-473B-ACE5-1238670D3535'),
         GETUTCDATE(), GETUTCDATE());
END
GO

-- ── 2. The related-entity name-field map ──────────────────────────────────────────────────────
-- V202609091600's copy of this call was a no-op: it sorts before the migration that creates the row
-- it looks up. Here the row is guaranteed -- V202609121200 sorts before this file -- so a NULL
-- lookup means something is wrong with the chain, and this raises instead of skipping. A guard that
-- turns a missing prerequisite into silence is what produced this defect in the first place.
DECLARE @FormResponseDistributionFieldID UNIQUEIDENTIFIER = (
    SELECT ef.[ID]
      FROM [${mjSchema}].[EntityField] ef
      JOIN [${mjSchema}].[Entity]      e ON e.[ID] = ef.[EntityID]
     WHERE e.[Name]  = N'MJ_BizApps_Forms: Form Responses'
       AND ef.[Name] = N'FormDistributionID');

IF @FormResponseDistributionFieldID IS NULL
    THROW 51201, N'#201: no EntityField row for MJ_BizApps_Forms: Form Responses.FormDistributionID. V202609121200 must have applied before this migration.', 1;

EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap]
     @EntityFieldID             = @FormResponseDistributionFieldID,
     @RelatedEntityNameFieldMap = 'FormDistribution';
GO

-- ── 3. The curated categories ─────────────────────────────────────────────────────────────────
-- `AND [Category] IS NULL` so a host that curated its own grouping keeps it; this fills the blank
-- CodeGen leaves, it does not overrule an author. The values match the siblings already on each
-- entity: CaptchaRequired and PublicLinkToken are 'Access and Limits', FormID and FormVersionID are
-- 'Form & Status'.
UPDATE [${mjSchema}].[EntityField]
   SET [Category] = N'Access and Limits'
 WHERE [EntityID] = '1FC60BDA-25B8-473B-ACE5-1238670D3535'
   AND [Name] IN (N'AllowDeviceResume', N'AllowedOrigins')
   AND [Category] IS NULL;

UPDATE [${mjSchema}].[EntityField]
   SET [Category] = N'Form & Status'
 WHERE [EntityID] = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
   AND [Name] IN (N'FormDistributionID', N'FormDistribution')
   AND [Category] IS NULL;
GO
