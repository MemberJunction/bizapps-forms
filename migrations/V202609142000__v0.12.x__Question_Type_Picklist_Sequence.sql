-- =============================================================================================
-- MJ Forms v0.12.x — the QuestionType picklist order a host actually receives (#219)
-- =============================================================================================
-- `V202608301200` (Signature → Doodle) renamed this row's `Value` and `Code` and deliberately left
-- its `Sequence`, saying so in its own §5:
--
--     `Sequence` is deliberately NOT touched. CodeGen re-derives the whole field's sequences from
--     the CHECK constraint (sorted, then `Sequence = 1 + index`) on its next run […]
--
-- Correct about what CodeGen does; wrong about whether it ever runs. `mj app install` writes
-- `__mj_BizAppsForms` into the host's `excludeSchemas`
-- (MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts:1987 — "so CodeGen skips entity
-- discovery, view generation, and Angular component generation for app-owned tables"), and
-- CodeGen's constraint-sync query filters on exactly that list: `getCheckConstraintsSchemaFilter`
-- returns ` WHERE SchemaName NOT IN (…)` (SQLServerCodeGenProvider.ts:2000), consumed at
-- manage-metadata.ts:5470. On a host the constraint never reaches `syncEntityFieldValues`. There is
-- no next run, and `migrations/` is the only channel — the same premise
-- `scripts/check-codegen-append.mjs` is built on.
--
-- THE DAMAGE. Renaming Signature (alphabetical slot 20) to Doodle (slot 5) shifted every value
-- between, so 16 of the 25 rows still carry the pre-rename ordering. The designer's QuestionType
-- dropdown renders Doodle where Signature used to be and 15 other values off by one. Cosmetic,
-- permanent, and contrary to that migration's own stated contract ("A real run must produce NO
-- diff"). History is append-only, so the repair is this file rather than an edit to that one.
--
-- THE NUMBERS BELOW ARE CODEGEN'S, NOT A PREFERENCE. `syncEntityFieldValues`
-- (CodeGenLib/src/Database/manage-metadata.ts:5656) sorts the parsed CHECK values with a bare
-- `Array.prototype.sort()` — UTF-16 code-unit order — and writes `Sequence = 1 + index`, matching
-- rows BY VALUE. `question-types.spec.ts` recomputes that from the shipped constraint and fails if
-- this file ever drifts from it, so the pairing is checked rather than asserted.
--
-- WHY LITERALS AND NOT `ROW_NUMBER() OVER (ORDER BY [Value])`. The window function would be shorter
-- and would encode a DIFFERENT rule: SQL Server's collation (CI_AS) rather than UTF-16. The two
-- agree on today's 25 values only by luck, and diverge as soon as a value's first differing
-- character crosses case — 'NPS' against a hypothetical 'NaN' sorts one way in JS (P=80 < a=97) and
-- the other in SQL (p > a). Shipping a rule that merely happens to agree is how #219 happened.
--
-- WHY THE NATURAL KEY AND NOT THE ROW IDS. `EntityField` ids are minted per database, so a literal
-- one silently matches nothing on a host that minted its own — `V202608252340` records exactly this
-- for these very rows, and `lint:distribution` CHECK 4 exists for the same reason. The THROW is the
-- other half: a guard that turns a missing prerequisite into silence is what produced this defect in
-- the first place (`V202609141900`). Rows are then matched on `Value`, which is how CodeGen itself
-- matches them.
--
-- ALL 25 ROWS, NOT ONLY THE 16 THAT DRIFT. This makes the file a declaration of the order rather
-- than a delta against one particular history: it is idempotent, it repairs a host that drifted some
-- other way, and it re-states the list a reviewer can diff by eye against the CHECK constraint. The
-- nine writes that change nothing cost nothing.
--
-- ONE BATCH, NO `GO` UNTIL THE END. `@QuestionTypeFieldID` goes out of scope at a batch separator,
-- and every UPDATE would then silently match nothing against a NULL variable — the same silence this
-- file exists to remove. `V202608252340` uses the same single-batch shape.
-- =============================================================================================

DECLARE @QuestionTypeFieldID UNIQUEIDENTIFIER = (
    SELECT TOP 1 ef.[ID]
      FROM [${mjSchema}].[EntityField] ef
      JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
     WHERE e.[BaseTable]  = 'FormQuestion'
       AND e.[SchemaName] = '${flyway:defaultSchema}'
       AND ef.[Name]      = 'QuestionType'
);

IF @QuestionTypeFieldID IS NULL
    THROW 51219, N'#219: no [EntityField] row for FormQuestion.QuestionType in this schema. Run the Forms migrations in order.', 1;

-- =============================================================================================
-- CodeGen output (appended) — the 25 writes CodeGen would have emitted, had it ever run here
-- =============================================================================================
-- Everything above this line is hand-authored and is the reviewable part: the field lookup and the
-- guard that refuses to proceed in silence. Everything below is mechanical — one write per value in
-- the CHECK constraint, at the sequence `syncEntityFieldValues` computes for it. Read it as
-- generated plumbing, not as a set of 25 independent decisions; the only thing to check is that the
-- value list and its order match the constraint, which `question-types.spec.ts` checks for you.
--
-- Transcribed rather than pasted, because the run that would have produced it cannot happen on a
-- host — that is the whole subject of this migration. The shape is CodeGen's own
-- (`SET Sequence=<1 + index>`), re-keyed from the row id to the natural key for the reason the
-- header gives.
-- =============================================================================================
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  1 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Address';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  2 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Checkbox';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  3 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'ContactInfo';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  4 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Date';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  5 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Doodle';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  6 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Dropdown';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  7 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Email';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  8 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'FileUpload';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  9 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Legal';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 10 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'LongText';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 11 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Matrix';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 12 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'MultiChoice';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 13 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'NPS';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 14 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Number';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 15 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'OpinionScale';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 16 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Phone';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 17 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'PictureChoice';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 18 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Ranking';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 19 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Rating';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 20 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'ShortText';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 21 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'SingleChoice';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 22 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Statement';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 23 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Time';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 24 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Website';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 25 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'YesNo';
GO
