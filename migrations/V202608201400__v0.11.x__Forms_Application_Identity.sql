-- =============================================================================================
-- MJ Forms v0.11.x — give the Forms application its own colour and mark
-- =============================================================================================
-- WHAT WAS WRONG. The Explorer's app launcher tints each application's icon from
-- `Application.Color` (`BaseApplication.GetColor()` → `--app-color`, consumed by the home
-- dashboard's `.app-icon` as a 12% background tint, the glyph colour, and the full-strength
-- hover fill). Forms never set it, so `GetColor()` fell through to its `var(--mj-text-muted)`
-- default and the tile rendered grey among a grid of coloured siblings — reading as an
-- unfinished or second-class app rather than a deliberate choice. The seeding migration
-- V202608081700 passes `@Color_Clear = 1`, so the null is explicit and has to be overwritten
-- rather than merely filled in.
--
-- WHY THIS GREEN (#2F9E44). Chosen by measurement, not taste, against the colours the other
-- applications already occupy (Actions 36°, Lists/Testing 174°, Scheduling 201°, Workflows 208°,
-- Data Explorer 231°, Bulk Operations 258°, Chat 291°):
--
--   * SEPARATION. Those leave one genuinely empty region — a 138° gap between Actions' orange
--     and Testing's teal. #2F9E44 sits at hue 131°, 43° from its nearest neighbour. The
--     emerald that first suggested itself (#1D9E75, the Forms analytics palette's "positive")
--     measured just 13° from Testing's teal and would have read as the same app at a glance.
--   * MEANING. Green is the completion colour, and a completed submission is the entire point
--     of a form — it is also the least threatening hue for a product whose job is asking
--     strangers to hand over personal information, where orange or red would read as warning.
--   * LEGIBILITY. Clears 3:1 (WCAG 1.4.11, non-text) on every MJ surface in both themes:
--     3.29 on the light card, 4.25 on the dark card, 5.18 on the dark page. The hover state
--     inverts to a solid fill with `--mj-text-inverse` on top — 3.45 with white in light mode,
--     5.18 with near-black in dark — so both directions stay legible.
--
-- THE MARK. `fa-clipboard-list` sat next to the Lists application's `fa-list-check` and read as
-- the same idea twice; both are a list with ticks. `fa-pen-to-square` is unique on the grid and
-- says the thing the product is actually for — filling something in — while staying readable at
-- the 16px the nav chips render it at. The nav items keep their own icons: the Forms item is a
-- LIST of forms, so a clipboard is right there, and Responses & Analytics keeps its chart.
--
-- WHY A MIGRATION AS WELL AS THE METADATA EDIT. `metadata/applications/.applications.json`
-- carries both values and remains the source of truth, so a regenerated seed reproduces this
-- state. But that seed has already run on every existing host, so the edit alone reaches only
-- fresh installs. This is the repair vehicle for the rest — the same split V202608181030 and
-- V202608201200 use.
--
-- Matched by the Application's hardcoded ID, which Forms mints itself in V202608081700.

DECLARE @FormsAppID UNIQUEIDENTIFIER = 'BFB97C57-4552-4643-8933-A0B2D76544D8';

-- Precondition: the row ships in Forms' own seed. Its absence means this database never ran
-- that migration, and continuing would report success while changing nothing.
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Application] WHERE ID = @FormsAppID)
    THROW 51140, 'Forms application row not found — V202608081700 has not run on this database.', 1;

UPDATE [${mjSchema}].[Application]
SET Color = N'#2F9E44',
    Icon = N'fa-solid fa-pen-to-square'
WHERE ID = @FormsAppID;

-- Postconditions: assert what the launcher will actually read, so a silently-skipped UPDATE
-- (a WHERE that matched nothing, a column renamed under us) fails here rather than showing up
-- as a grey tile nobody connects back to this file.
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[Application]
    WHERE ID = @FormsAppID AND Color = N'#2F9E44')
    THROW 51141, 'Forms application Color was not applied.', 1;

IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[Application]
    WHERE ID = @FormsAppID AND Icon = N'fa-solid fa-pen-to-square')
    THROW 51142, 'Forms application Icon was not applied.', 1;
