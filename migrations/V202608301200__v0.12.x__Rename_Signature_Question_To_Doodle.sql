-- =============================================================================================
-- MJ Forms v0.12.x — the `Signature` question type becomes `Doodle`
-- =============================================================================================
-- Issue #97. The control is an HTML canvas that captures a freehand drawing, exports it as a PNG
-- and stores it as an ordinary file answer. It has none of the apparatus a real e-signature needs
-- — no identity verification, no content hash, no signing certificate, no audit trail of a
-- signing event — so calling it a signature invited customers to rely on it for something it
-- cannot do. It ships as a drawing tool instead; real e-signature is separate work through a
-- signing provider.
--
-- THIS MIGRATION IS NOT OPTIONAL AND CANNOT SHIP LATER THAN THE CODE. `QuestionType` lives in
-- three places, and the third one is a live outage:
--
--   1. `FormQuestion.QuestionType`      — authoring rows, constrained by CK_FormQuestion_QuestionType
--   2. `__mj.EntityFieldValue`          — the designer dropdown CodeGen derives from the constraint
--   3. `FormVersion.DefinitionSnapshot` — the PUBLISHED JSON the public link is served from
--
-- The snapshot is the dangerous one. `snapshot-parser.parseQuestion` rejects a question whose
-- `type` fails `isFormQuestionType`; a rejected question makes its whole PAGE undefined, and a
-- rejected page makes the whole DEFINITION undefined. So one unmigrated `"type":"Signature"` does
-- not degrade to a missing field — it takes the entire published form off its public link, along
-- with every other question on it. `snapshot-parser.spec.ts` states that as a test
-- ("takes the WHOLE definition down for one question at a retired type").
--
-- WHY A TARGETED REPLACE AND NOT A BLANKET ONE. The word "Signature" also appears in respondent-
-- facing PROMPTS in these very snapshots — the builder's default prompt is
-- "Untitled Signature question", and one form simply asks "Signature". A blanket
-- REPLACE(…, 'Signature', 'Doodle') would rewrite an author's question text. Only the exact
-- `"type":"Signature"` token is touched, and that token has exactly ONE spelling because
-- `publish.service.ts` writes the snapshot with `JSON.stringify` (no spacing, no indent) — which
-- is also why the contract needs no `Signature` alias as a safety net.
--
-- ORDER IS LOAD-BEARING: the CHECK constraint has to come off before the data can move, and the
-- new one cannot go on while any 'Signature' row remains.
--
-- ⚠️ RUN `npm run mj:codegen` AFTER THIS MIGRATION. This CHECK constraint is the value list
-- CodeGen turns into the generated `QuestionType` union in
-- `packages/Entities/src/generated/entity_subclasses.ts`. That file was HAND-EDITED in the same
-- commit as this migration — the rename does not compile otherwise, and the environment it was
-- written in had no database to regenerate from. The edit reproduces exactly what CodeGen emits
-- from the state below: `syncEntityFieldValues` sorts the parsed constraint values and rewrites
-- every `Sequence` to `1 + index`, and `sortBySequenceAndCreatedAt` then emits in that order, so
-- 'Doodle' lands alphabetically between 'Date' and 'Dropdown'. A real run must produce NO diff.
-- Nothing here is taken on trust: `question-types.spec.ts`'s "matches the generated QuestionType
-- value list" pairs the contract to the generated file and fails loudly if a later CodeGen run
-- against an unmigrated database reverts it.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- 1. Take the old constraint off
-- ---------------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] DROP CONSTRAINT [CK_FormQuestion_QuestionType];
GO

-- ---------------------------------------------------------------------------------------------
-- 2. Move the authoring rows
-- ---------------------------------------------------------------------------------------------
UPDATE [${flyway:defaultSchema}].[FormQuestion]
SET QuestionType = 'Doodle'
WHERE QuestionType = 'Signature';
GO

-- ---------------------------------------------------------------------------------------------
-- 3. Put the constraint back, with Doodle in place of Signature
--
-- Drop-and-recreate rather than an additive constraint: SQL Server ANDs multiple CHECKs on the
-- same column, so a second one listing the new value would reject every existing type. The list
-- below is paired to `QUESTION_TYPE_BEHAVIOR` by the `checkConstraintTypes` test in
-- `question-types.spec.ts`, which reads the LAST migration to define this constraint — this one.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] ADD CONSTRAINT [CK_FormQuestion_QuestionType] CHECK (QuestionType IN (
    'ShortText', 'LongText', 'Email', 'Phone', 'Website', 'Number',
    'SingleChoice', 'MultiChoice', 'Dropdown', 'PictureChoice',
    'Rating', 'NPS', 'OpinionScale', 'Ranking', 'Matrix',
    'YesNo', 'Checkbox', 'Legal',
    'Date', 'Time',
    'Address', 'ContactInfo',
    'FileUpload', 'Doodle',
    'Statement'
));
GO

-- ---------------------------------------------------------------------------------------------
-- 4. Rewrite the published snapshots
--
-- Every version that carries the token, not only the Published ones: a Draft version becomes the
-- served one the moment it is published, and an Archived one is what a restore brings back.
-- Scoped by the same predicate the REPLACE keys on, so the statement is idempotent and touches no
-- row it has nothing to do with.
-- ---------------------------------------------------------------------------------------------
UPDATE [${flyway:defaultSchema}].[FormVersion]
SET DefinitionSnapshot = REPLACE(DefinitionSnapshot, '"type":"Signature"', '"type":"Doodle"')
WHERE DefinitionSnapshot LIKE '%"type":"Signature"%';
GO

-- ---------------------------------------------------------------------------------------------
-- 5. The designer dropdown
--
-- The row seeded by `V202608191300__v0.11.x__Element_Parity_Metadata_Backfill.sql`. Leave it and
-- the builder offers a value the constraint above now rejects — a Save() that fails with a
-- constraint violation naming neither the column nor the value.
--
-- BOTH `Value` AND `Code` are updated. CodeGen's `syncEntityFieldValues` matches existing rows by
-- `Value` alone and never reconciles `Code`, so a `Code` left saying 'Signature' would survive
-- every future run.
--
-- `Sequence` is deliberately NOT touched. CodeGen re-derives the whole field's sequences from the
-- CHECK constraint (sorted, then `Sequence = 1 + index`) on its next run, so setting one here
-- would be a guess that CodeGen immediately overwrites — and picking 20's alphabetical successor
-- by hand would collide with the 24 rows it does not renumber until then.
-- ---------------------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'd4a3d852-21ca-41e5-977d-6297b1f33b11')
BEGIN
    UPDATE [${mjSchema}].[EntityFieldValue]
    SET [Value] = 'Doodle', [Code] = 'Doodle'
    WHERE [ID] = 'd4a3d852-21ca-41e5-977d-6297b1f33b11';
END
GO
