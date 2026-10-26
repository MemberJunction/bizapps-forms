-- =============================================================================================
-- MJ Forms v0.16.x — repair People rows that carry the invented surname "(unknown)"
-- =============================================================================================
-- WHAT WAS WRONG. `Forms: Upsert Respondent Person` created a Person for every respondent whose
-- form had no name question, and filled the NOT NULL LastName column with the literal
-- '(unknown)'. That string lands in a table shared with every other app (search, mail-merge,
-- the identity header), where it reads as the person's real surname. The action now stores ''
-- (the column needs a value, not a name); this file repairs the rows already written.
--
-- SCOPE. `__mj_BizAppsCommon.Person` belongs to bizapps-common, so this touches only rows Forms
-- itself created: '(unknown)' is Forms' own placeholder and is the marker. A genuine surname is
-- never changed. The schema is named literally (no third placeholder — `mj app install` builds
-- its placeholder map from the host's config); B202606281200 does the same.
--
-- GUARD. Common is a hard dependency but this file must not fail on a host where it is not yet
-- installed, so a missing table is a clean no-op, not an error.
-- =============================================================================================

IF OBJECT_ID(N'__mj_BizAppsCommon.Person', N'U') IS NOT NULL
BEGIN
    UPDATE [__mj_BizAppsCommon].[Person]
    SET LastName = N''
    WHERE LastName = N'(unknown)';

    -- Postcondition: no placeholder survives.
    IF EXISTS (SELECT 1 FROM [__mj_BizAppsCommon].[Person] WHERE LastName = N'(unknown)')
        THROW 51160, 'MJ Forms v0.16.x: People rows with LastName ''(unknown)'' remain after the repair.', 1;
END
