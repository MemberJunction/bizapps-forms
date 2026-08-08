-- =============================================================================
-- Back-fill: give every existing form the four legacy on-submit actions as automations
--
-- Guarantee G1. Dispatch is all-or-nothing — a form whose published snapshot carries any
-- automations runs those and NOT the hard-coded list — so a form that gains its first automation
-- would otherwise lose its confirmation email, follow-up task, respondent-Person upsert and
-- answer scoring, silently. The builder seeds these for a form the moment an author configures
-- anything; this does the same for forms that already exist, so the two paths cannot disagree.
--
-- IDEMPOTENT AND NON-DESTRUCTIVE. It inserts only for forms that have no automations at all, so
-- re-running changes nothing and a form somebody has already configured by hand is left exactly
-- as they left it. Actions are matched BY NAME and a missing one is simply skipped — the legacy
-- runner also resolved by name and skipped what it could not find, so skipping reproduces the old
-- behaviour rather than inventing a new failure.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It does not republish anything. Automations execute from the
-- FormVersion snapshot, so these rows change nothing until an author republishes — which is the
-- point: a migration must not alter what already-published forms do to responses arriving right
-- now. Until republish, those forms keep taking the legacy path, which is the same behaviour by a
-- different route.
-- =============================================================================

INSERT INTO __mj_BizAppsForms.FormAutomation
    (ID, FormID, Name, TargetType, ActionID, [Trigger], ExecutionMode, DisplayOrder, ContinueOnError, IsActive)
SELECT
    NEWID(),
    f.ID,
    a.Name,
    'Action',
    a.ID,
    'OnComplete',      -- the legacy runner fired only for COMPLETE submissions
    'Sync',            -- sequential and awaited, as the legacy loop was
    a.LegacyOrder,
    1,                 -- best-effort: a failure was logged and the rest continued
    1
FROM __mj_BizAppsForms.Form f
CROSS JOIN (
    SELECT act.ID, act.Name, v.LegacyOrder
    FROM (VALUES
        ('Forms: Upsert Respondent Person', 1),
        ('Forms: Send Confirmation Email',  2),
        ('Forms: Create Followup Task',     3),
        ('Forms: Analyze Written Responses',4)
    ) AS v(ActionName, LegacyOrder)
    JOIN __mj.Action act ON act.Name = v.ActionName
) AS a
WHERE NOT EXISTS (
    SELECT 1 FROM __mj_BizAppsForms.FormAutomation existing WHERE existing.FormID = f.ID
);
GO
