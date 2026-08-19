-- =================================================================================================
-- Social links on an ending screen
-- =================================================================================================
-- The last thing a respondent sees is the one place a form has their attention and nothing left to
-- ask of them, which is exactly where "follow us" belongs. Authors were working around its absence
-- by pasting raw URLs into the ending's Body, where they render as unclickable text.
--
-- ONE JSON COLUMN, not a child table. A social link has no identity, is never queried across forms,
-- is never reported on, and is only ever read as a whole list belonging to one screen — so a table
-- would buy joins and a lifecycle we would then have to maintain, and buy nothing back. The shape
-- is an array of { platform, url }, with `platform` drawn from a fixed catalogue in the contract
-- (forms-entities) so the widget always knows which icon to draw and can never be handed an
-- arbitrary one.
--
-- Deliberately NOT a separate "enabled" flag: an empty or absent list IS disabled. A second column
-- that can disagree with the first is a bug waiting to be authored.
-- =================================================================================================

ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ADD
    SocialLinks NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Ending screens only: JSON array of { platform, url } social links rendered as icons under the ending message. Absent or empty means no social links are shown; there is no separate enabled flag',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'SocialLinks';
GO
