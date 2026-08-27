-- One default ending per form, enforced.
--
-- `FormScreen.IsDefault` shipped as an independent flag under a builder label promising "every
-- form needs exactly one", which nothing anywhere kept. A form could carry two — or none — and
-- still look correct: `resolveEndingScreen` simply takes the first in display order, so a second
-- flagged screen was a setting the author had turned on that did nothing, and a form with none
-- silently fell through to the form-wide confirmation message.
--
-- Two defaults are also about to become unrepresentable in the builder, where the flag becomes a
-- pick-one rather than a switch per screen. Leaving the data able to express what the UI cannot
-- is how a repair turns into a save that fails for reasons the author cannot see.
--
-- Ending screens themselves stay unconstrained — several is the point, and the sibling index
-- UQ_FormScreen_OneWelcomePerForm constrains Welcome for a different reason.

-- 1. Too many. Keep the one the runtime already resolves to — the lowest DisplayOrder among the
--    eligible endings — so the repair does not move the ending respondents were already getting.
--    Screened-out endings are excluded here for the same reason resolveEndingScreen excludes them
--    from resolution entirely: one flagged as the default holds a setting that can never apply.
WITH ranked AS (
    SELECT
        ID,
        ROW_NUMBER() OVER (PARTITION BY FormID ORDER BY DisplayOrder, ID) AS rn
    FROM [${flyway:defaultSchema}].[FormScreen]
    WHERE IsDefault = 1
      AND ScreenType = 'Ending'
      AND IsDisqualification = 0
)
UPDATE s
SET s.IsDefault = 0
FROM [${flyway:defaultSchema}].[FormScreen] s
INNER JOIN ranked r ON r.ID = s.ID
WHERE r.rn > 1;
GO

-- 2. Flagged but ineligible. A screened-out screen or a Welcome screen carrying IsDefault would
--    survive step 1 untouched and then violate the index below, so clear it explicitly rather
--    than letting the CREATE INDEX fail on data nobody knew was there.
UPDATE [${flyway:defaultSchema}].[FormScreen]
SET IsDefault = 0
WHERE IsDefault = 1
  AND (ScreenType <> 'Ending' OR IsDisqualification = 1);
GO

-- 3. Too few. A form with eligible endings and no default gets the first one, which is what the
--    builder does for the first ending an author creates. Forms with no eligible ending are left
--    alone: there is nothing to promote, and endingMessage already falls back to the form-wide
--    confirmation message.
UPDATE s
SET s.IsDefault = 1
FROM [${flyway:defaultSchema}].[FormScreen] s
WHERE s.ID = (
    SELECT TOP 1 e.ID
    FROM [${flyway:defaultSchema}].[FormScreen] e
    WHERE e.FormID = s.FormID
      AND e.ScreenType = 'Ending'
      AND e.IsDisqualification = 0
    ORDER BY e.DisplayOrder, e.ID
)
AND NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].[FormScreen] d
    WHERE d.FormID = s.FormID
      AND d.IsDefault = 1
);
GO

-- 4. Keep it that way. Filtered on the flag rather than on ScreenType, so the index states the
--    invariant the application relies on — at most one default per form — instead of restating
--    which screens are eligible, which steps 2 and 3 have already settled.
CREATE UNIQUE INDEX UQ_FormScreen_OneDefaultEndingPerForm
    ON [${flyway:defaultSchema}].[FormScreen] (FormID)
    WHERE IsDefault = 1;
GO
