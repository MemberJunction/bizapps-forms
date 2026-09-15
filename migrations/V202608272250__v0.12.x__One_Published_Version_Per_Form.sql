-- One Published version per form, enforced.
--
-- `FormVersion.Status` has allowed 'Draft', 'Published' and 'Retired' since the baseline, but
-- 'Retired' was never written by any code path: publishing minted a new Published version and
-- left every earlier one Published too. Forms accumulated them — three simultaneously-live
-- versions on one dev form, two on several others — and nothing broke, because all three readers
-- disambiguate with `ORDER BY VersionNumber DESC`.
--
-- That is precisely the problem this fixes. The invariant was asserted (`loadPublishedVersion`'s
-- docstring says "the SINGLE Published version for a form") but enforced nowhere, so it held only
-- as long as every future query, report and integration remembered an ORDER BY that has nothing to
-- do with what it is asking. One that filters on `Status='Published'` and forgets gets an
-- arbitrary historical version and looks correct in testing, because a form published once has
-- only one to choose from.
--
-- After this, publishing retires the incumbent inside the same transaction (PublishService), and
-- the index below is what makes that a property of the data rather than a convention. See #82.

-- 1. Backfill. Keep the version every reader already resolves to — the highest VersionNumber —
--    and demote the rest. No tiebreak is needed: `UQ_FormVersion_Form_VersionNumber` has made
--    VersionNumber unique per form since the baseline, so this ordering is already total.
--    Responses are unaffected: a FormResponse pins its own FormVersionID and the reporting and
--    response-detail readers load that version by ID, with no Status filter anywhere.
WITH ranked AS (
    SELECT
        ID,
        ROW_NUMBER() OVER (PARTITION BY FormID ORDER BY VersionNumber DESC) AS rn
    FROM [${flyway:defaultSchema}].[FormVersion]
    WHERE Status = 'Published'
)
UPDATE v
SET v.Status = 'Retired'
FROM [${flyway:defaultSchema}].[FormVersion] v
INNER JOIN ranked r ON r.ID = v.ID
WHERE r.rn > 1;
GO

-- 2. Keep it that way. Filtered on the status rather than restated in application code, so a
--    second live version is unrepresentable no matter which client, integration or hand-written
--    UPDATE tries to create one. Draft and Retired rows are deliberately unconstrained — a form
--    has as many of those as it has history.
--
--    This also decides the ORDER of the publish swap: the incumbent must be demoted BEFORE the
--    replacement is inserted, which is why PublishService does both in one transaction group.
CREATE UNIQUE INDEX UQ_FormVersion_OnePublishedPerForm
    ON [${flyway:defaultSchema}].[FormVersion] (FormID)
    WHERE Status = 'Published';
GO
