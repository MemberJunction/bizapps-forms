-- =============================================================================================
-- MJ Forms v0.10.x — Form Respondent grant hardening (#39)
-- =============================================================================================
-- Closes findings 1 and 2 of issue #39, and removes five grants that finding 2 did not know were
-- dead. Finding 3 (the blind role INSERT) is fixed in the 0.8.0 seed itself, because a host bricked
-- on it never reaches this file — see the dated paragraph in
-- `V202608081700__v0.8.x__Metadata_Sync.sql`. Plan: `plans/ISSUE-39-RESPONDENT-SEED-HARDENING-PLAN.md`.
--
-- WHAT WAS WRONG. The 0.8.0 seed creates nine `Form Respondent` permission rows and passes every RLS
-- filter parameter `_Clear = 1`, i.e. explicitly NULL. Two consequences, neither visible from inside:
--
--   1. MJ publishes a generic `Create<Entity>` mutation for every entity, and
--      `UserExemptFromRowLevelSecurity` (core `entityInfo.js`) returns TRUE the moment
--      `CreateRLSFilterID` is null. So the two CanCreate grants did not merely satisfy
--      forms-server's `checkRespondentScope` gate — they handed every anonymous respondent direct
--      write access that never enters `submit-pipeline.ts`. Turnstile, rate limiting, the
--      MaxResponses quota, field validation and the distribution's open/close window ALL live in
--      that pipeline; none of them are enforced at the entity layer. Verified by exploit on the
--      sibling app (bizapps-caliber#219 Appendix A): an anonymous session JWT created a FormResponse
--      row against an arbitrary FormID in one request.
--
--   2. ONE shared anonymous principal backs every respondent, so an unfiltered read is an
--      INSTANCE-WIDE read. Every respondent to any form could read every Form Distribution row —
--      `PublicLinkToken` included — and every other form's definition.
--
-- WHY THE CREATE GRANTS COST NOTHING TO FILTER. `checkRespondentScope` reads only the CanCreate
-- **flag** (`scope-check.service.ts:47` — `entity.GetUserPermisions(user).CanCreate`), which a filter
-- does not change; and every legitimate response write is performed by the SYSTEM user
-- (`PublicFormResolver.ts:86`, `UserCache.Instance.GetSystemUser()`), which is not subject to this
-- role's filters. There is no legitimate anonymous direct create to preserve. If a future release
-- makes the respondent write its own rows, the deny-all filter must be REPLACED with a scoped
-- predicate, never simply removed.
--
-- WHY FIVE READ GRANTS ARE DELETED RATHER THAN FILTERED. The entire anonymous surface is two GraphQL
-- operations (`PublishedForm`, `SubmitFormResponse` — `forms-api.graphql.service.ts:50,58`) plus the
-- upload endpoint, and all three resolve the definition through `resolvePublishedDefinition`
-- (`definition-loader.service.ts`), which reads ONLY Form Distributions and Form Versions under the
-- anonymous `contextUser` — the version's `DefinitionSnapshot` already embeds the questions, pages,
-- options and style tokens. The respondent host page is system-user throughout
-- (`RespondentHostMiddleware.ts:112,153`). So no anonymous code path reads Forms, Form Questions,
-- Form Question Options, Form Pages or Form Styles; those five grants exist only because the seed's
-- role description assumed a widget that loads definitions entity-by-entity, which it never did.
-- A special case designed out of existence beats a special case given a filter.
--
-- WHY THE FILTER RECORDS ARE FORMS-OWNED AND ATTACHED UNCONDITIONALLY. bizapps-caliber ≥ #220
-- attaches semantically identical filters on co-installs, but only where the slot is NULL
-- (`COALESCE`) — the right stance for Caliber, because those are not its rows. These ARE Forms' rows.
-- Pointing them at Caliber-owned filter records recreates the regression #39 documents: Caliber's
-- uninstall deletes its filter records and MJ's nullable-FK teardown returns the slot to NULL, i.e.
-- back to the exploitable state. Forms-owned records make the hardening durable across a sibling
-- app's lifecycle. Both install orders converge here: Caliber-first, this file overwrites Caliber's
-- ids with Forms' own; Forms-first, Caliber's `COALESCE` finds the slots filled and leaves them. Its
-- THROW 50021 postcondition tests `IS NOT NULL`, not filter identity, so it passes either way.
--
-- THE POSTCONDITIONS ASSERT FORMS' OWN FACTS AND DELIBERATELY NEVER A ROLE-WIDE COUNT. `Form
-- Respondent` is a SHARED role: Caliber adds two more rows to it (`MJ: File Storage Accounts`,
-- `MJ: File Storage Providers` — the unfiltered reads `FileStorageEngine` must load). A
-- `COUNT(*) = 4` check would be green on a standalone install and would brick every Caliber
-- co-install, which is exactly the mistake that made Caliber's own migration uninstallable
-- (bizapps-caliber#219). What this file may assert is what this file requires.
--
-- ⚠️ IT ASSERTS BOTH THE PRESENCE OF A FILTERED ROW **AND** THE ABSENCE OF AN UNFILTERED ONE. Those
-- are different checks and neither implies the other. `UserExemptFromRowLevelSecurity` iterates ALL
-- of the entity's permission rows and returns TRUE on the FIRST one whose filter slot is null — so a
-- single unfiltered leftover re-opens the bypass no matter how many filtered rows sit beside it, and
-- a check that merely finds one good row would call that state healthy. `__mj.EntityPermission` has
-- NO unique constraint on (EntityID, RoleID) (verified against the core schema), and duplicates are
-- reachable in practice: on a host where Caliber minted the role and created its own grants before
-- Forms 0.8.0 adopted it, both apps' rows coexist for the same pair. Hence THROW 51111 and THROW
-- 51112 as separate checks, and hence every UPDATE below is set-based and matches on (role name,
-- entity name) rather than on a permission-row id.
--
-- IDEMPOTENT AND SELF-HEALING. Guarded INSERTs, absolute UPDATEs, DELETEs that converge. Re-running
-- changes nothing. It heals every population in one shape: fresh installs (it runs immediately after
-- the seed in the same chain), hosts already upgraded to 0.8.0, hosts where the role was adopted
-- under a foreign id, and co-installs in either order.
--
-- PLACEHOLDERS. Only `${mjSchema}` (core) and `${flyway:defaultSchema}` (this app's schema) appear,
-- which are the only two `mj app install` supplies; `npm run lint:distribution` is the gate. Note
-- that `{{ScopeResourceID}}` in the filter text below is MJ's own runtime token, not a Skyway
-- placeholder — Skyway substitutes only the dollar-brace form, so the double-brace token ships
-- through untouched, which is required. (Written without the dollar-brace form on purpose, exactly
-- as the 0.8.0 seed's header is: `npm run lint:distribution` scans shipped SQL as text and cannot
-- tell a comment from a statement. That is the correct trade — a placeholder mentioned in a comment
-- today is a placeholder pasted into SQL tomorrow — and the gate caught this very line.)
-- =============================================================================================

-- ── The role must be resolvable by name, asserted before anything below relies on it ───────────
-- Every statement in this file resolves the role BY NAME, because the id is not ours to assume: on
-- a host where a sibling app minted `Form Respondent` first, the 0.8.0 seed adopts that row and the
-- canonical `A18E13FC…` never exists. Zero rows would make every UPDATE and DELETE below match
-- nothing, silently, and the migration would report success having done nothing at all. Two rows
-- would be a core-schema corruption (`Role.Name` carries `UQ__Role__737584F6A210197E`), which is
-- what makes this check cheap and its firing meaningful.
IF (SELECT COUNT(*) FROM [${mjSchema}].[Role] WHERE Name = N'Form Respondent') <> 1
    THROW 51110, 'MJ Forms: expected exactly ONE role named ''Form Respondent''. The 0.8.0 metadata seed creates or adopts it, and forms-server''s magic-link minter resolves it by name — zero rows means the seed did not run or its role was removed, and this hardening migration would otherwise report success while silently matching nothing.', 1;
GO

-- ── The three Forms-owned row-level-security filters ──────────────────────────────────────────
-- Guarded INSERT then absolute UPDATE, rather than INSERT-only: the UPDATE is what makes a re-run
-- self-healing and what corrects a record whose text drifted. These are Forms' rows to define — the
-- same ownership argument that justifies overwriting the slots below — so restoring their text is
-- correct rather than presumptuous.

-- Deny-all create. Deliberately unsatisfiable: the anonymous session must ANSWER yes to
-- forms-server's CanCreate gate, but it is never the identity that legitimately writes a response.
-- MJ enforces create filters in `CheckCreateRLS`, which evaluates the predicate against a synthetic
-- one-row projection of the NEW record's non-null fields — so a column-free predicate is always
-- valid here, and `1 = 0` is the narrowest possible statement of "no direct create, ever".
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RowLevelSecurityFilter] WHERE ID = '7F0E0001-A1B2-4C3D-8E4F-000000000001')
    INSERT INTO [${mjSchema}].[RowLevelSecurityFilter] (ID, Name, Description, FilterText)
    VALUES ('7F0E0001-A1B2-4C3D-8E4F-000000000001', N'MJ Forms: Respondent Gate Only, Never A Writer', N'', N'');

UPDATE [${mjSchema}].[RowLevelSecurityFilter]
SET Name        = N'MJ Forms: Respondent Gate Only, Never A Writer',
    Description = N'Denies every direct create by the anonymous Form Respondent role. forms-server''s checkRespondentScope requires the CanCreate FLAG, and reads nothing else; the actual response write is performed by the system user (PublicFormResolver elevates via UserCache.Instance.GetSystemUser()), which is not subject to this role''s filters. So there is no legitimate anonymous create to permit, and permitting one re-opens MJ''s generic Create<Entity> mutation as a bypass of the whole submit pipeline (Turnstile, rate limit, quota, validation, open/close window). If a future release makes the respondent write its own response rows, REPLACE this with a scoped predicate — never simply remove it.',
    FilterText  = N'1 = 0'
WHERE ID = '7F0E0001-A1B2-4C3D-8E4F-000000000001';
GO

-- The one distribution this session's link was minted for. `provision-runner.ts:84` sets the invite's
-- `resourceId` to `ctx.distributionId`, so the scope claim IS the distribution id.
--
-- ⚠️ CAST TO TEXT ON PURPOSE — do not "simplify" to `ID = '{{ScopeResourceID}}'`. MJ substitutes an
-- absent scope with the EMPTY STRING, and comparing that against a `uniqueidentifier` column is a
-- conversion ERROR, so the query would fail loudly-but-wrongly instead of matching nothing. Cast to
-- text it is an ordinary non-match and the filter FAILS CLOSED, which is the required behaviour.
--
-- ⚠️ AND NOTE THE LIMIT: the scope is PER-DISTRIBUTION, not per-respondent. Every respondent to the
-- same distribution shares one scope value, so this isolates one form from another, NOT one
-- respondent from another. That is acceptable only because the sole readable rows are the form's own
-- public definition — the questions every respondent is shown anyway. It is why this role holds no
-- read on the two response entities and must never be given one.
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RowLevelSecurityFilter] WHERE ID = '7F0E0002-A1B2-4C3D-8E4F-000000000002')
    INSERT INTO [${mjSchema}].[RowLevelSecurityFilter] (ID, Name, Description, FilterText)
    VALUES ('7F0E0002-A1B2-4C3D-8E4F-000000000002', N'MJ Forms: Respondent Own Distribution', N'', N'');

UPDATE [${mjSchema}].[RowLevelSecurityFilter]
SET Name        = N'MJ Forms: Respondent Own Distribution',
    Description = N'The single Form Distribution this anonymous respondent''s magic-link invite was scoped to. forms sets the invite ResourceID to the distribution id (CoreEntitiesServer, magic-link/provision-runner.ts), so the scope claim IS the distribution. Cast to text deliberately: an absent scope substitutes the empty string, which against a uniqueidentifier column is a conversion error rather than a non-match — the cast makes it fail CLOSED. Scopes one form from another; it does NOT separate two respondents to the same distribution, who share one scope value.',
    FilterText  = N'CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}'''
WHERE ID = '7F0E0002-A1B2-4C3D-8E4F-000000000002';
GO

-- Published versions of the form that distribution points at. The loader asks for
-- `FormID=<id> AND Status='Published'` (`definition-loader.service.ts`); this clause is ANDed onto
-- it by MJ, so a session cannot reach any other form's published definition even if it supplied a
-- different FormID.
--
-- The Forms schema is spelled from `${flyway:defaultSchema}` rather than as a literal — unlike the
-- twin filter bizapps-caliber ships, which must hardcode `__mj_BizAppsForms` because a sibling app's
-- schema is not one of ITS placeholders. Here it is our own schema, so the placeholder is available
-- and correct: it still honours a host that installed Forms under a different schema name. Skyway
-- resolves it at apply time, so what lands in FilterText is the concrete schema.
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RowLevelSecurityFilter] WHERE ID = '7F0E0003-A1B2-4C3D-8E4F-000000000003')
    INSERT INTO [${mjSchema}].[RowLevelSecurityFilter] (ID, Name, Description, FilterText)
    VALUES ('7F0E0003-A1B2-4C3D-8E4F-000000000003', N'MJ Forms: Respondent Own Form Versions', N'', N'');

UPDATE [${mjSchema}].[RowLevelSecurityFilter]
SET Name        = N'MJ Forms: Respondent Own Form Versions',
    Description = N'Versions belonging to the form that this respondent''s scoped distribution points at. ANDed onto the definition loader''s own FormID + Status=Published predicate, so a session cannot reach another form''s published definition even by supplying a different FormID. Same deliberate cast-to-text as the distribution filter, for the same fail-closed reason.',
    FilterText  = N'FormID IN (SELECT FormID FROM [${flyway:defaultSchema}].vwFormDistributions WHERE CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}'')'
WHERE ID = '7F0E0003-A1B2-4C3D-8E4F-000000000003';
GO

-- ── The role's contract, declared once and used three times ───────────────────────────────────
-- What Forms grants this role, what filter each grant carries, and what the postconditions assert
-- are the SAME four facts, so they are written once. A table variable is batch-scoped, which is why
-- the attach, the retirement and the assertions all live in this single batch.
DECLARE @Contract TABLE (
    EntityName NVARCHAR(255)    NOT NULL,
    Capability CHAR(1)          NOT NULL,   -- 'C' = create, 'R' = read
    FilterID   UNIQUEIDENTIFIER NOT NULL,
    Fact       NVARCHAR(200)    NOT NULL,
    PRIMARY KEY (EntityName, Capability)
);
INSERT INTO @Contract (EntityName, Capability, FilterID, Fact) VALUES
    (N'MJ_BizApps_Forms: Form Responses',        'C', '7F0E0001-A1B2-4C3D-8E4F-000000000001', N'DENY-FILTERED CREATE on Form Responses'),
    (N'MJ_BizApps_Forms: Form Response Answers', 'C', '7F0E0001-A1B2-4C3D-8E4F-000000000001', N'DENY-FILTERED CREATE on Form Response Answers'),
    (N'MJ_BizApps_Forms: Form Distributions',    'R', '7F0E0002-A1B2-4C3D-8E4F-000000000002', N'SCOPE-FILTERED READ on Form Distributions'),
    (N'MJ_BizApps_Forms: Form Versions',         'R', '7F0E0003-A1B2-4C3D-8E4F-000000000003', N'SCOPE-FILTERED READ on Form Versions');

-- The five definition reads no anonymous code path uses. Named here rather than deleted by
-- permission-row id: on a host where the role was adopted, equivalent rows may exist under ids this
-- repo has never seen, and a (role name, entity name) join converges both populations.
DECLARE @Retired TABLE (EntityName NVARCHAR(255) NOT NULL PRIMARY KEY);
INSERT INTO @Retired (EntityName) VALUES
    (N'MJ_BizApps_Forms: Forms'),
    (N'MJ_BizApps_Forms: Form Questions'),
    (N'MJ_BizApps_Forms: Form Question Options'),
    (N'MJ_BizApps_Forms: Form Pages'),
    (N'MJ_BizApps_Forms: Form Styles');

-- ── Attach the filters ────────────────────────────────────────────────────────────────────────
-- Set-based and unconditional. Unconditional because these are Forms' rows (see the header);
-- set-based because every matching row must be filtered, not merely one — a single unfiltered
-- leftover exempts the whole role from RLS for that operation.
UPDATE p
SET p.CreateRLSFilterID = c.FilterID
FROM [${mjSchema}].[EntityPermission] p
JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
JOIN @Contract              c ON c.EntityName = e.Name AND c.Capability = 'C'
WHERE r.Name = N'Form Respondent';

UPDATE p
SET p.ReadRLSFilterID = c.FilterID
FROM [${mjSchema}].[EntityPermission] p
JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
JOIN @Contract              c ON c.EntityName = e.Name AND c.Capability = 'R'
WHERE r.Name = N'Form Respondent';

-- ── Retire the five dead read grants ──────────────────────────────────────────────────────────
-- The whole row goes, not just its CanRead bit: this role has no business holding ANY capability on
-- a form-definition entity. forms-server refuses a session outright if it can create one
-- ("privilege accretion", `scope-check.service.ts`), and bizapps-caliber asserts the same invariant
-- from its side (THROW 50022), so removing the row satisfies both rather than trading one for the
-- other. If a future widget feature genuinely needs a direct definition read, it adds a SCOPED grant
-- then — a new decision, made with its own evidence, not a survival of this one.
DELETE p
FROM [${mjSchema}].[EntityPermission] p
JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
JOIN @Retired               x ON x.EntityName = e.Name
WHERE r.Name = N'Form Respondent';

-- ── Correct the role description ──────────────────────────────────────────────────────────────
-- It has been stale twice over since it was written: it promised "read-only on the published
-- form-definition entities the respondent widget must load", and the widget never loaded them.
--
-- ⚠️ ONLY WHERE FORMS MINTED THE ROW. On a host where a sibling app created `Form Respondent` first
-- and the 0.8.0 seed adopted it, the Description is that app's prose about its own grants —
-- overwriting it would be the same ownership mistake this file refuses to make with filter slots,
-- in the opposite direction. bizapps-caliber declines symmetrically ("on the adoption path forms'
-- own description stays"). Keyed on the canonical id because that is the precise test for "Forms
-- INSERTed this row", which is a different question from "does Forms own the role name".
UPDATE [${mjSchema}].[Role]
SET Description = N'Restricted role for anonymous/external respondents who reach a published MJ Form via a scoped magic-link distribution. The ONE deliberate exception to the magic-link read-only convention. It grants exactly four things and nothing else: CanCreate on Form Responses and Form Response Answers, each carrying a DENY-ALL create filter — forms-server''s checkRespondentScope reads only the CanCreate flag, while the real write is performed by the system user, so an unfiltered grant would buy nothing but a bypass of the submit pipeline via MJ''s generic Create mutation; and scope-filtered read on Form Distributions and Form Versions, filtered to the distribution the session''s own invite names. It holds NO read on the two response entities (one shared anonymous principal backs every respondent, so no filter can make that read safe) and NOTHING on Forms, Form Questions, Form Question Options, Form Pages or Form Styles — the published version''s DefinitionSnapshot already carries all of that, so no anonymous code path reads them. This is a SHARED role: co-installed apps may add their own grants to it, and this app asserts only its own four facts. Authorization is enforced server-side from the session''s mj_scopes union; this role is the entity-permission boundary. Never assign to internal/SSO users.'
WHERE Name = N'Form Respondent'
  AND ID   = 'A18E13FC-B2C1-4E77-A3D7-EE775BDE098C';

-- ── Postconditions ────────────────────────────────────────────────────────────────────────────
-- A security migration that half-applies and reports success is the worst available outcome, so the
-- end state is asserted rather than assumed. Each check names the broken fact: at 3am the operator
-- needs to know WHICH truth failed, not merely that one did.

-- 1. Every required grant is present AND filtered. Checked positively, because the absence check
--    below passes vacuously when the rows do not exist at all — which is precisely what a
--    silently-matched-nothing run looks like.
DECLARE @Missing NVARCHAR(MAX) = (
    SELECT STRING_AGG(CAST(c.Fact AS NVARCHAR(MAX)), N'; ')
    FROM @Contract c
    WHERE NOT EXISTS (
        SELECT 1
        FROM [${mjSchema}].[EntityPermission] p
        JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
        JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
        WHERE r.Name = N'Form Respondent'
          AND e.Name = c.EntityName
          AND ((c.Capability = 'C' AND p.CanCreate = 1 AND p.CreateRLSFilterID IS NOT NULL)
            OR (c.Capability = 'R' AND p.CanRead   = 1 AND p.ReadRLSFilterID   IS NOT NULL))));

IF @Missing IS NOT NULL
BEGIN
    DECLARE @MissingMsg NVARCHAR(2048) =
        N'MJ Forms: the Form Respondent role is missing a required grant, or holds it unfiltered — ' + @Missing +
        N'. A missing grant fails at a respondent''s submit rather than here; an unfiltered one lets MJ''s generic Create mutation write past the submit pipeline entirely, or exposes every form''s definition to every respondent.';
    THROW 51111, @MissingMsg, 1;
END

-- 2. This role holds NO unfiltered create or read on ANY Forms entity — findings 1 and 2 stated as
--    one invariant, and the only shape of this check that can actually fail.
--
--    ⚠️ THE OBVIOUS VERSIONS OF THIS CHECK ARE TAUTOLOGIES, and the first draft of this file shipped
--    two of them. "No unfiltered row survives for a CONTRACTED entity" re-tests the predicate of the
--    attach UPDATE directly above it; "no row survives for a RETIRED entity" re-tests the predicate
--    of the DELETE. Both pass by construction on every input, while reading like protection. A
--    postcondition earns its lines only if some reachable state makes it fire.
--
--    Widening the scope from the four contracted entities to every `MJ_BizApps_Forms:` entity is
--    what makes it reachable, and it subsumes what those two tautologies were reaching for:
--      • a retired grant that survived because the DELETE matched nothing — a host whose entity
--        names differ from the literals above — is an unfiltered read, so it trips here;
--      • a duplicate (EntityID, RoleID) row the attach did not reach trips here, and duplicates ARE
--        reachable: `__mj.EntityPermission` has no unique constraint on that pair, and a host where
--        a sibling app minted the role before 0.8.0 adopted it carries both apps' rows;
--      • a fifth grant on some other Forms entity, from any source, trips here — which nothing
--        scoped to the contract could ever see.
--    It matters because `UserExemptFromRowLevelSecurity` returns TRUE on the FIRST unfiltered row it
--    finds: one leftover re-opens the bypass however many filtered rows sit beside it.
--
--    ⚠️ SCOPED TO `MJ_BizApps_Forms:` ENTITIES, NEVER ROLE-WIDE — that boundary is load-bearing.
--    `Form Respondent` is shared, and bizapps-caliber grants this same role UNFILTERED reads on
--    `MJ: File Storage Accounts` and `MJ: File Storage Providers` deliberately (FileStorageEngine
--    needs the instance-wide list; withholding it poisons that engine's cache process-wide). A
--    role-wide version of this check would be green standalone and would brick every Caliber
--    co-install — precisely the mistake that made Caliber's own migration uninstallable. Our
--    entities are ours to rule on; another app's are not.
--
--    Update and Delete are deliberately NOT asserted here: the seed grants neither, they are not
--    what #39 is about, and Caliber's THROW 50024 already covers them on co-installs. Asserting
--    them would widen this file past the issue it closes.
DECLARE @Unfiltered NVARCHAR(MAX) = (
    SELECT STRING_AGG(CAST(d.Detail AS NVARCHAR(MAX)), N'; ')
    FROM (
        SELECT DISTINCT e.Name + CASE WHEN p.CanCreate = 1 AND p.CreateRLSFilterID IS NULL
                                      THEN N' (unfiltered CREATE)' ELSE N' (unfiltered READ)' END AS Detail
        FROM [${mjSchema}].[EntityPermission] p
        JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
        JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
        WHERE r.Name  = N'Form Respondent'
          AND e.Name LIKE N'MJ[_]BizApps[_]Forms: %'
          AND ((p.CanCreate = 1 AND p.CreateRLSFilterID IS NULL)
            OR (p.CanRead   = 1 AND p.ReadRLSFilterID   IS NULL))
    ) d);

IF @Unfiltered IS NOT NULL
BEGIN
    DECLARE @UnfilteredMsg NVARCHAR(2048) =
        N'MJ Forms: the Form Respondent role holds an UNFILTERED grant on a Forms entity — ' + @Unfiltered +
        N'. ONE shared anonymous principal backs every respondent, so an unfiltered read is an instance-wide read and an unfiltered create is a write that never enters the submit pipeline. MJ exempts the role from row-level security on the FIRST unfiltered row it finds, so this stands regardless of the filtered rows beside it. If the entity named above is not one of the four this app grants, something else added it: attach a scoped filter or remove the row — do not widen this check.';
    THROW 51112, @UnfilteredMsg, 1;
END
GO
