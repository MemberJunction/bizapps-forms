-- Forms: Response Completion Stats — the reporting headline for one form, as ONE row
-- (FormReportingEngine, Forms.GetResponseSummary).
--
-- FormID is required. FormVersionID narrows to the responses pinned to one version; absent, every
-- version counts, because each response pins the version live when it was submitted and reading
-- only the latest version hides every response an earlier one collected.
--
-- Rules carried over unchanged from the dashboard's former client-side aggregations (now
-- forms-core-entities-server reporting/headline.ts):
--   * Status counts are reported separately; the engine's headline is CompleteCount alone.
--   * Duration is SubmittedAt - StartedAt over Complete rows that have both, kept only when the
--     gap is 0 to 24 hours: anything outside is a broken StartedAt (an epoch default, a migrated
--     row), not a sitting, and one such row moves a mean by orders of magnitude.
--   * The MEDIAN, not the mean, for the same reason. PERCENTILE_CONT(0.5) interpolates the two
--     middle values of an even count, exactly as statistics.ts median() does.
-- Both parameters pass through sqlString, so no caller text reaches the SQL unquoted.
WITH scoped AS (
    SELECT r.Status, r.StartedAt, r.SubmittedAt
    FROM [__mj_BizAppsForms].[vwFormResponses] r
    WHERE r.FormID = {{ FormID | sqlString }}
    {% if FormVersionID %}
      AND r.FormVersionID = {{ FormVersionID | sqlString }}
    {% endif %}
),
durations AS (
    SELECT CAST(DATEDIFF_BIG(MILLISECOND, s.StartedAt, s.SubmittedAt) AS FLOAT) / 1000.0 AS Seconds
    FROM scoped s
    WHERE s.Status = N'Complete'
      AND s.StartedAt IS NOT NULL
      AND s.SubmittedAt IS NOT NULL
      AND DATEDIFF_BIG(MILLISECOND, s.StartedAt, s.SubmittedAt) BETWEEN 0 AND 86400000
)
SELECT
    (SELECT COUNT(*) FROM scoped WHERE Status = N'Complete') AS CompleteCount,
    (SELECT COUNT(*) FROM scoped WHERE Status = N'Partial') AS PartialCount,
    (SELECT COUNT(*) FROM scoped WHERE Status = N'Disqualified') AS DisqualifiedCount,
    (SELECT COUNT(*) FROM scoped) AS StartedCount,
    (SELECT TOP 1 PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY d.Seconds) OVER () FROM durations d) AS MedianCompletionSeconds,
    (SELECT MAX(SubmittedAt) FROM scoped WHERE Status = N'Complete') AS LastSubmittedAt;
