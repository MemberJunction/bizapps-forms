-- Forms: Page Funnel Reach — per page, how many responses answered at least one of its questions
-- (FormReportingEngine, Forms.GetResponseSummary funnel). One row per page of the labelling version.
--
-- The page layout comes from the published SNAPSHOT (FormVersion.DefinitionSnapshot, pages[] and
-- their questions[]), not from the live FormPage/FormQuestion rows, which an author may have edited
-- since. The labelling version is FormVersionID when given, else the form's one Published version.
--
-- Responses: every STATUS counts, deliberately: drop-off is a fact about the people who abandoned,
-- so excluding partials would measure only the respondents who never dropped off. FormVersionID
-- also narrows the responses to that version; absent, every version's responses count, mapped onto
-- the labelling version's pages by QuestionID.
--
-- "Answered" means an answer row exists, as in forms-core-entities-server reporting/funnel.ts buildFunnel(). Pages with
-- no answerable question are returned with their QuestionTypes so the engine can drop them using
-- the contracts' answerable-type table rather than a second copy of it here.
--
-- OPENJSON gets only a snapshot that already passed ISJSON: the guard is INSIDE the call
-- (CASE ... END yields NULL otherwise, and OPENJSON(NULL) returns no rows), because SQL Server
-- does not promise to filter rows before evaluating a CROSS APPLY, and OPENJSON throws on
-- invalid JSON.
WITH version AS (
    -- ORDER BY rather than resting on the one-Published-version invariant
    -- (UQ_FormVersion_OnePublishedPerForm) alone: TOP 1 without it is arbitrary by definition.
    SELECT TOP 1 v.DefinitionSnapshot
    FROM [__mj_BizAppsForms].[vwFormVersions] v
    WHERE v.FormID = {{ FormID | sqlString }}
    {% if FormVersionID %}
      AND v.ID = {{ FormVersionID | sqlString }}
    {% else %}
      AND v.Status = N'Published'
    {% endif %}
    ORDER BY v.VersionNumber DESC
),
pages AS (
    -- Every JSON_VALUE / OPENJSON input below is gated by its element type INSIDE the call
    -- (5 = object), for the same evaluation-order reason as the snapshot guard above: a stray
    -- non-object element yields NULLs and no rows instead of an error.
    SELECT
        JSON_VALUE(CASE WHEN p.[type] = 5 THEN p.[value] END, '$.id') AS PageID,
        JSON_VALUE(CASE WHEN p.[type] = 5 THEN p.[value] END, '$.title') AS Title,
        TRY_CONVERT(INT, JSON_VALUE(CASE WHEN p.[type] = 5 THEN p.[value] END, '$.displayOrder')) AS DisplayOrder,
        CASE WHEN p.[type] = 5 THEN p.[value] END AS PageJSON
    FROM version v
    CROSS APPLY OPENJSON(CASE WHEN ISJSON(v.DefinitionSnapshot) = 1 THEN v.DefinitionSnapshot END, '$.pages') p
    WHERE p.[type] = 5
),
page_questions AS (
    SELECT
        pg.PageID,
        TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(CASE WHEN q.[type] = 5 THEN q.[value] END, '$.id')) AS QuestionID,
        JSON_VALUE(CASE WHEN q.[type] = 5 THEN q.[value] END, '$.type') AS QuestionType
    FROM pages pg
    CROSS APPLY OPENJSON(pg.PageJSON, '$.questions') q
    WHERE q.[type] = 5
),
scoped AS (
    SELECT r.ID
    FROM [__mj_BizAppsForms].[vwFormResponses] r
    WHERE r.FormID = {{ FormID | sqlString }}
    {% if FormVersionID %}
      AND r.FormVersionID = {{ FormVersionID | sqlString }}
    {% endif %}
),
reached AS (
    SELECT pq.PageID, COUNT(DISTINCT a.ResponseID) AS ReachedCount
    FROM page_questions pq
    INNER JOIN [__mj_BizAppsForms].[vwFormResponseAnswers] a ON a.QuestionID = pq.QuestionID
    INNER JOIN scoped s ON s.ID = a.ResponseID
    GROUP BY pq.PageID
)
SELECT
    pg.PageID,
    pg.Title,
    pg.DisplayOrder,
    ISNULL(rc.ReachedCount, 0) AS ReachedCount,
    (SELECT STRING_AGG(pq.QuestionType, N',') FROM page_questions pq WHERE pq.PageID = pg.PageID) AS QuestionTypes
FROM pages pg
LEFT JOIN reached rc ON rc.PageID = pg.PageID
ORDER BY pg.DisplayOrder, pg.PageID;
