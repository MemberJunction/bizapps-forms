-- =============================================================================================
-- MJ Forms v0.11.x — element parity + Welcome/Ending screens
-- =============================================================================================
-- Plan: `plans/FORMS_ELEMENT_PARITY.md`.
--
-- Three independent changes that ship together because they are one authoring story:
--
--   1. TEN new question types. `CK_FormQuestion_QuestionType` is the value list CodeGen turns
--      into the generated `QuestionType` union, so widening it here is what makes the union
--      widen there. The TypeScript table in
--      `packages/Entities/src/contracts/question-types.ts` is the other half of this pair, and
--      `question-types.spec.ts` fails if the two lists ever disagree — a type present in the
--      code but absent here fails at Save() with a constraint violation and no explanation of
--      which column is at fault, which is a genuinely awful thing to debug.
--
--   2. OPTIONS grow two per-mode columns. `PictureChoice` needs an image per option and
--      `Matrix` needs to know whether an option is a row or a column. Both are options in every
--      other respect — label, value, order, default — so they extend the existing table rather
--      than forking a near-identical one.
--
--   3. FormScreen — Welcome and Ending screens, as their OWN entity rather than as question
--      types. A screen is never answered, produces no FormResponseAnswer, appears in no
--      aggregation and cannot be referenced by a conditional rule. Modelling it as a question
--      would push a "…except this one" branch into every consumer that walks the question list.
--      Multiple Ending screens with per-screen redirect is the whole reason this is a table and
--      not a handful of columns on Form.
--
-- Deploy order: apply this BEFORE the code that writes the new types. In the reverse order the
-- builder offers types the constraint rejects.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- 1. Question types
-- ---------------------------------------------------------------------------------------------
-- Drop-and-recreate rather than an additive constraint: SQL Server ANDs multiple CHECKs on the
-- same column, so a second constraint listing the new values would reject every EXISTING type.
ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] DROP CONSTRAINT [CK_FormQuestion_QuestionType];
GO

ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] ADD CONSTRAINT [CK_FormQuestion_QuestionType] CHECK (QuestionType IN (
    'ShortText', 'LongText', 'Email', 'Phone', 'Website', 'Number',
    'SingleChoice', 'MultiChoice', 'Dropdown', 'PictureChoice',
    'Rating', 'NPS', 'OpinionScale', 'Ranking', 'Matrix',
    'YesNo', 'Checkbox', 'Legal',
    'Date', 'Time',
    'Address', 'ContactInfo',
    'FileUpload', 'Signature',
    'Statement'
));
GO

-- ---------------------------------------------------------------------------------------------
-- 2. Option columns for the image and matrix modes
-- ---------------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[FormQuestionOption] ADD
    ImageURL NVARCHAR(1000) NULL,
    MatrixAxis NVARCHAR(20) NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[FormQuestionOption] ADD CONSTRAINT [CK_FormQuestionOption_MatrixAxis]
    CHECK (MatrixAxis IS NULL OR MatrixAxis IN ('Row', 'Column'));
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'PictureChoice only: image shown above the option label. Ignored by every other question type',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormQuestionOption', @level2type = N'COLUMN', @level2name = N'ImageURL';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Matrix only: whether this option is a Row or a Column of the grid. NULL for every other question type, and read as Row if left NULL on a Matrix',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormQuestionOption', @level2type = N'COLUMN', @level2name = N'MatrixAxis';
GO

-- ---------------------------------------------------------------------------------------------
-- 3. Partial submit point
-- ---------------------------------------------------------------------------------------------
-- Not a new capability: the widget already banks partials on an autosave timer. This makes the
-- TIMING authorable, so a form whose first page collects contact details can bank that page the
-- moment it is left rather than whenever the debounce next fires.
ALTER TABLE [${flyway:defaultSchema}].[FormPage] ADD
    IsPartialSubmitPoint BIT NOT NULL CONSTRAINT DF_FormPage_IsPartialSubmitPoint DEFAULT 0;
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When set, advancing past this page banks a Partial response immediately instead of waiting for the autosave debounce',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormPage', @level2type = N'COLUMN', @level2name = N'IsPartialSubmitPoint';
GO

-- ---------------------------------------------------------------------------------------------
-- 4. FormScreen — the screens that bracket intake
-- ---------------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[FormScreen] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FormID UNIQUEIDENTIFIER NOT NULL,
    ScreenType NVARCHAR(20) NOT NULL,
    Title NVARCHAR(500) NOT NULL,
    Body NVARCHAR(MAX) NULL,
    ButtonLabel NVARCHAR(100) NULL,
    MediaURL NVARCHAR(1000) NULL,
    RedirectURL NVARCHAR(1000) NULL,
    DisplayOrder INT NOT NULL DEFAULT 0,
    ConditionalRule NVARCHAR(MAX) NULL,
    IsDefault BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_FormScreen PRIMARY KEY (ID),
    CONSTRAINT FK_FormScreen_Form FOREIGN KEY (FormID) REFERENCES [${flyway:defaultSchema}].[Form](ID),
    CONSTRAINT CK_FormScreen_ScreenType CHECK (ScreenType IN ('Welcome', 'Ending'))
);
GO

-- At most one Welcome screen per form. A filtered unique index rather than application logic:
-- "which of the two welcome screens do we show" has no good answer, and a second one is far
-- easier to create by accident (a double-click on Add) than to notice afterwards. Ending screens
-- are deliberately unconstrained — several is the point.
CREATE UNIQUE INDEX UQ_FormScreen_OneWelcomePerForm
    ON [${flyway:defaultSchema}].[FormScreen] (FormID)
    WHERE ScreenType = 'Welcome';
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Welcome and Ending screens for a form. Distinct from questions: a screen is never answered, produces no FormResponseAnswer row, appears in no aggregation and cannot be referenced by a conditional rule. It brackets the intake rather than sitting inside it',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this screen is shown before intake begins (Welcome) or after a successful submit (Ending)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'ScreenType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Headline shown on the screen',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'Title';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Body copy shown under the title. Plain text — the widget does not render HTML from this column',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'Body';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Label for the screens single button. The widget supplies Start / Done when this is blank',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'ButtonLabel';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional image shown above the title',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'MediaURL';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Ending only: send the respondent here instead of showing this screen. Takes precedence over the form-wide redirect in Form.Settings',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'RedirectURL';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Order among the forms Ending screens. Resolution walks them in this order and takes the first whose ConditionalRule the answers satisfy',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'DisplayOrder';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Ending only: JSON ConditionalRule deciding whether this ending applies to a given response. Unlike a page rule, a blank rule here does NOT mean always — it means this screen is only reachable as the default',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'ConditionalRule';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Ending only: the fallback shown when no conditional ending matched',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'IsDefault';
GO
