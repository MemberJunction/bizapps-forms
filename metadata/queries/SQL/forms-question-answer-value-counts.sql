-- Forms: Question Answer Value Counts — per question, how many Complete responses chose each
-- stored value (FormReportingEngine, Forms.GetResponseSummary breakdowns). One row per
-- (QuestionID, ValueKind, Value).
--
-- FormID is required. FormVersionID narrows to the responses pinned to one version; absent, every
-- version counts (answers map back to questions by QuestionID).
--
-- Complete responses only: breakdowns describe the same population as the headline, and mixing in
-- partial autosaves produced counts larger than the denominator they were shown against.
--
-- Value extraction mirrors answer-values.ts extractChoiceValues():
--   * a JSONValue that is a JSON ARRAY contributes one value per non-null, non-blank element, and
--     then its TextValue is ignored (an empty array contributes nothing);
--   * otherwise a non-blank TextValue is the value;
--   * NumericValue, BooleanValue and DateValue contribute their own kinds, so scale, consent and
--     date breakdowns come from the same query.
-- A nested array or object element is counted by its JSON text; no choice control writes one.
-- A JSON OBJECT (Matrix, Address, ContactInfo) contributes nothing here: those are aggregated by
-- the engine from the rows themselves (Matrix cells, the respondent profile).
--
-- UNBOUNDED, deliberately. The dashboard truncates no choice, scale, yes/no or date distribution,
-- so neither may this. Free-text values come back too (the query cannot tell a ShortText from a
-- SingleChoice without the type table it must not duplicate); the engine uses only the rows of
-- charted questions, and nothing here ever reaches a client: the operation returns aggregates.
-- AnsweredResponses is distinct Complete responses with any value for the question.
--
-- OPENJSON gets only text that already passed the array guard: the guard is INSIDE the call
-- (CASE ... END yields NULL otherwise, and OPENJSON(NULL) returns no rows), because SQL Server
-- does not promise to filter rows before evaluating a CROSS APPLY, and OPENJSON throws on
-- invalid JSON.
WITH scoped AS (
    SELECT r.ID
    FROM [__mj_BizAppsForms].[vwFormResponses] r
    WHERE r.FormID = {{ FormID | sqlString }}
      AND r.Status = N'Complete'
    {% if FormVersionID %}
      AND r.FormVersionID = {{ FormVersionID | sqlString }}
    {% endif %}
),
answers AS (
    SELECT
        a.QuestionID,
        a.ResponseID,
        a.TextValue,
        a.NumericValue,
        a.BooleanValue,
        a.DateValue,
        a.JSONValue,
        CASE WHEN ISJSON(a.JSONValue) = 1 AND LEFT(LTRIM(a.JSONValue), 1) = N'[' THEN 1 ELSE 0 END AS IsJSONArray
    FROM [__mj_BizAppsForms].[vwFormResponseAnswers] a
    INNER JOIN scoped s ON s.ID = a.ResponseID
),
vals AS (
    SELECT a.QuestionID, a.ResponseID, N'Text' AS ValueKind, LTRIM(RTRIM(j.[value])) AS Value, CAST(NULL AS DECIMAL(18, 4)) AS NumericValue
    FROM answers a
    CROSS APPLY OPENJSON(CASE WHEN a.IsJSONArray = 1 THEN a.JSONValue END) j
    WHERE a.IsJSONArray = 1 AND j.[type] <> 0 AND LTRIM(RTRIM(j.[value])) <> N''
    UNION ALL
    SELECT a.QuestionID, a.ResponseID, N'Text', a.TextValue, NULL
    FROM answers a
    WHERE a.IsJSONArray = 0 AND a.TextValue IS NOT NULL AND LTRIM(RTRIM(a.TextValue)) <> N''
    UNION ALL
    SELECT a.QuestionID, a.ResponseID, N'Numeric', CONVERT(NVARCHAR(64), a.NumericValue), a.NumericValue
    FROM answers a
    WHERE a.NumericValue IS NOT NULL
    UNION ALL
    SELECT a.QuestionID, a.ResponseID, N'Boolean', CASE WHEN a.BooleanValue = 1 THEN N'true' ELSE N'false' END, NULL
    FROM answers a
    WHERE a.BooleanValue IS NOT NULL
    UNION ALL
    SELECT a.QuestionID, a.ResponseID, N'Date', CONVERT(NVARCHAR(40), a.DateValue, 127), NULL
    FROM answers a
    WHERE a.DateValue IS NOT NULL
),
answered AS (
    SELECT v.QuestionID, COUNT(DISTINCT v.ResponseID) AS AnsweredResponses
    FROM vals v
    GROUP BY v.QuestionID
),
counted AS (
    -- Grouped on the value's BYTES, not its text: the database collation is case- and trailing-space-
    -- insensitive, so GROUP BY v.Value would put 'g', 'G' and 'g ' in one group and return whichever
    -- spelling came first — moving a whole option's count into "Other", or an off-list variant into
    -- the option, depending on row order. The browser compared values exactly; so does this. Every
    -- row of a group has the same bytes, so MAX(v.Value) is that one value, deterministically.
    SELECT v.QuestionID, v.ValueKind, MAX(v.Value) AS Value, v.NumericValue, COUNT(*) AS ValueCount
    FROM vals v
    GROUP BY v.QuestionID, v.ValueKind, CONVERT(VARBINARY(MAX), v.Value), v.NumericValue
)
SELECT
    c.QuestionID,
    q.AnsweredResponses,
    c.ValueKind,
    c.Value,
    c.NumericValue,
    c.ValueCount
FROM counted c
INNER JOIN answered q ON q.QuestionID = c.QuestionID
ORDER BY c.QuestionID, c.ValueKind, c.ValueCount DESC, c.Value;
