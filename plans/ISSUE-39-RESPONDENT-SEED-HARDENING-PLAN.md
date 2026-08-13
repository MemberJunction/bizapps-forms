# Issue #39 — Form Respondent seed hardening

**Issue:** [MemberJunction/bizapps-forms#39](https://github.com/MemberJunction/bizapps-forms/issues/39)
**Status:** PLANNED (no implementation yet)
**Planned:** 2026-08-13 · **Planning agent:** this PR's author
**Sibling context:** Caliber's side of the same lesson is merged — [bizapps-caliber#220](https://github.com/MemberJunction/bizapps-caliber/pull/220) (plan `plans/ISSUE-219-INSTALL-FIX-PLAN.md`).

---

## 1. Verification — all three findings CONFIRMED against this repo

Every claim in #39 was re-verified against the working tree and MJ 5.51.0 before this
plan was written. Line references are to current `next`.

| # | Claim | Verified against | Verdict |
|---|---|---|---|
| 1 | Unfiltered `CanCreate` bypasses the submit pipeline | Seed rows for Form Responses (`60470C16…`) and Form Response Answers (`4A3B0FDC…`) both pass `CreateRLSFilterID_Clear = 1` (`migrations/V202608081700__v0.8.x__Metadata_Sync.sql:2843`, `:2890`). MJ core `entityInfo.js:1616-1624`: any role permission with NULL `CreateRLSFilterID` → `UserExemptFromRowLevelSecurity` returns true → no create-time RLS. Turnstile / rate-limit / quota / dedupe / open-close window live only in `packages/Server/src/public-submit/submit-pipeline.ts`. | **CONFIRMED** |
| 2 | Unfiltered reads on all seven definition entities = instance-wide reads | All seven read rows pass `ReadRLSFilterID_Clear = 1` (same file; entities mapped by ID: Forms, Form Versions, Form Distributions, Form Styles, Form Pages, Form Questions, Form Question Options). One shared anonymous principal backs every respondent. `FormDistribution.PublicLinkToken` is readable. | **CONFIRMED** |
| 3 | Blind `spCreateRole` breaks install where the role pre-exists | Seed line 53 is an unconditional `EXEC [${mjSchema}].spCreateRole`; the SP body (MJ `V202605032116__v5.32.x`) is a plain INSERT with no existence check; `UQ__Role__737584F6A210197E UNIQUE(Name)` (MJ `V202407171600__v2.0.x.sql:4715`) matches the issue's error text verbatim. | **CONFIRMED** |

The issue's fix-compatibility claims also verified:

- `checkRespondentScope` reads only the `CanCreate` **flag** — `entity.GetUserPermisions(user).CanCreate`
  (`packages/Server/src/public-submit/scope-check.service.ts:47`). A deny-all create filter does not
  change the flag, so the gate still passes.
- Every legitimate response write is performed by the **system user**
  (`packages/Server/src/public-submit/PublicFormResolver.ts:86`, `UserCache.Instance.GetSystemUser()`),
  which is not subject to this role's filters. There is no legitimate anonymous direct create to
  preserve.

### 1.1 A finding beyond the issue: five of the seven read grants are dead

The **entire** anonymous surface is two GraphQL operations (`PublishedForm` query,
`SubmitFormResponse` mutation — `packages/Angular/src/lib/widget/api/forms-api.graphql.service.ts`)
plus the upload endpoint. All three resolve the definition through
`resolvePublishedDefinition` (`packages/Server/src/public-submit/definition-loader.service.ts`),
which reads **only Form Distributions and Form Versions** under the anonymous `contextUser` — the
version's `DefinitionSnapshot` embeds questions, pages, options and style tokens. The host page
middleware uses the system user throughout (`RespondentHostMiddleware.ts:152`).

**No anonymous code path reads Forms, Form Questions, Form Question Options, Form Pages, or Form
Styles.** Those five grants exist only because the seed's role description assumed the widget loads
definitions entity-by-entity, which it never did. The deepest fix is to **remove** them, not filter
them — a special case designed out of existence. (Decision D3 below; confirmed with repo owner
2026-08-13.)

### 1.2 A trap the issue implies but does not spell out: the hardcoded RoleID

Adopt-or-skip on the role INSERT alone is **insufficient**. The seed's 9 permission rows and 2
application-role rows all hardcode `@RoleID = 'A18E13FC-B2C1-4E77-A3D7-EE775BDE098C'`. On a host
where `Form Respondent` pre-exists under a different ID (Caliber-minted), skipping the role create
and then running those batches unchanged FK-fails (or worse, silently attaches grants to a
nonexistent role). Every batch that references the Form Respondent role must **resolve the ID by
name** — the same move Caliber #220 made on its side ("resolve the role by name everywhere and
create it only as a fallback").

---

## 2. Design decisions

### D1 — Deny-all create filters: Forms-owned records, attached **unconditionally**

Forms ships its own `RowLevelSecurityFilter` record (new hardcoded UUID, owned by this app) with
`FilterText = '1 = 0'`, and points both create slots at it — **overwriting** a non-NULL slot if one
is present.

*Why unconditional, when Caliber deliberately fills only NULL slots?* The asymmetry is ownership.
Caliber's `COALESCE` stance is right **for Caliber**: a non-NULL filter on someone else's rows is
someone else's decision. But these are **Forms' rows** — the seed creates them, the issue itself
says "the restored state is *yours*". If Forms' rows point at a Caliber-owned filter record,
Caliber's uninstall deletes that record and MJ's nullable-FK teardown returns the slot to NULL —
the exact regression the issue documents. Pointing Forms' rows at Forms-owned records makes the
state durable across Caliber's lifecycle.

*Co-install compatibility, both orders, verified against Caliber `next` (post-#220):*
- Caliber's postcondition THROW 50021 tests `CreateRLSFilterID IS NOT NULL` — **non-NULL, not
  identity** ("a filter another app chose satisfies this and is left alone"). Forms' filter passes.
- Caliber-first: Caliber attaches `B6D19F73…`; Forms' corrective migration overwrites with Forms'
  own (semantically identical) record. Caliber's later re-runs `COALESCE` — leaves it alone.
- Forms-first: slots already filled; Caliber's `COALESCE` never touches them.
- Both orders converge on Forms-owned filters. Caliber uninstall no longer nulls anything.

### D2 — Scoped read filters on Form Distributions and Form Versions

Forms ships two more Forms-owned filter records, with the **same predicates Caliber proved viable
in production co-installs**:

- Distributions: `CAST(ID AS NVARCHAR(450)) = '{{ScopeResourceID}}'`
  (cast-to-text so an absent scope claim fails **closed** — a NULL/absent `ScopeResourceID` matches
  nothing instead of erroring).
- Versions: `FormID IN (SELECT FormID FROM __mj_BizAppsForms.vwFormDistributions WHERE CAST(ID AS
  NVARCHAR(450)) = '{{ScopeResourceID}}')` — with the schema spelled from `${flyway:defaultSchema}`
  in **our** repo (unlike Caliber, we own this schema's placeholder; do not copy Caliber's literal).

Attached unconditionally to the two read rows, same rationale as D1. The definition loader's
queries (`Slug = …` for distributions, `FormID = … AND Status='Published'` for versions) are ANDed
with these clauses by MJ; the loader keeps working because the session's scope carries the
distribution it is redeeming.

### D3 — Remove the five unused read grants (and fix the role description)

DELETE the Form Respondent read grants on Forms, Form Questions, Form Question Options, Form Pages,
Form Styles (by role-name + entity-name join, never by permission-row UUID — on hosts where the role
was adopted, equivalent rows may have been created by Caliber under different row IDs; the name
join converges both populations).

Safety, verified:
- No anonymous server path reads them (§1.1).
- `checkRespondentScope` never checks CanRead on them (`scope-check.service.ts` checks CanCreate
  absence on Forms/Versions/Distributions only — grant flags, not filters — unaffected).
- Caliber's required-facts table (six facts) does not include any of the five; its THROW 50021
  cannot fire from this removal.
- Authenticated builder/Explorer users hold UI/Developer roles — untouched.

The role's `Description` currently says "plus read-only on the published form-definition entities
the respondent widget must load" — stale twice over (the widget never loaded them, and the grants
are now gone). The corrective migration UPDATEs the description to describe the real contract:
CanCreate (deny-all-filtered) on the two response entities + scoped read on Distributions/Versions.

### D4 — Role adopt-or-skip **by name**, and by-name RoleID resolution throughout the seed

In the 0.8.0 seed (edited in place, see D5):

- `Form Respondent` create becomes `IF NOT EXISTS (SELECT 1 FROM Role WHERE Name = N'Form
  Respondent')` — adopt-or-skip. Same guard for `Forms Automation Runner`: its collision is
  theoretical (Forms-specific name) but it is the identical blind-INSERT failure class, and the
  guard costs one line.
- Every subsequent batch that references either role replaces the hardcoded `@RoleID` literal with
  a by-name lookup (`SELECT ID FROM [${mjSchema}].Role WHERE Name = N'…'`) — batches are
  GO-separated so each declares its own variable already; only the `SET` line changes.
- The `spCreateUserRole` / application-role batches get the same treatment.

The canonical UUID `A18E13FC…` remains the ID **when Forms creates the role fresh** — teardown and
docs keep meaning something — but nothing else may assume it.

### D5 — Vehicle: in-place 0.8.0 edit (role resolution only) + new v0.10.x corrective migration

- **Why the in-place edit is mandatory, not optional:** a host where 0.8.0 currently fails on the
  duplicate role is halted mid-chain — it never reaches any later migration. Only fixing the 0.8.0
  file itself unbricks it. Verified engine-safe: Skyway's `Migrate()` resolves already-applied
  migrations by version and never checksum-validates them (checksum checking lives only in the
  separate `Validate()`), so applied hosts skip the edited file and stuck hosts re-run the
  corrected text.
- **Everything else** (filter records, filter attachment, grant removal, description fix) ships in
  a **new corrective migration**, versioned **v0.10.x** — we are on 0.9.0 and a migration requires
  a minor bump per this repo's release convention (decision by repo owner, 2026-08-13). It is
  idempotent (guarded INSERTs, absolute UPDATEs, DELETEs that converge) and heals every population:
  fresh installs (runs right after the seed in the same chain), already-upgraded 0.8.0 hosts, and
  co-installs in either order.
- The in-place edit deliberately does **not** add the filters to the seed itself: keeping the seed
  edit minimal (role resolution only) keeps its review surface small, and the corrective migration
  runs unconditionally anyway. One place to read the hardening, not two.

### D6 — Postconditions THROW, in our own migration

Following Caliber's pattern (and this repo's design rules: validate up front, check postconditions
on critical outputs), the corrective migration ends with assertions that THROW with a named fact
when the end state is wrong: both create slots filtered, both read slots filtered, zero permission
rows for the five removed entities, role resolvable by name. A silent partial application of a
security migration is the worst outcome; a loud one is cheap.

---

## 3. File-level changes

| # | File | Change |
|---|---|---|
| 1 | `migrations/V202608081700__v0.8.x__Metadata_Sync.sql` | **Edit in place (D4/D5).** Both role creates → `IF NOT EXISTS` by name; every `@RoleID_…` SET for the two roles → by-name lookup; header comment gains a dated paragraph explaining the edit and why Skyway tolerates it. No other statement changes. |
| 2 | `migrations/V2026____v0.10.x__Respondent_Grant_Hardening.sql` *(new; timestamp fixed at implementation)* | Creates 3 Forms-owned `RowLevelSecurityFilter` records (guarded INSERT, hardcoded new UUIDs): deny-all create; scoped Distribution read; scoped Versions read. Unconditionally points the 4 surviving Form Respondent slots at them (UPDATE by role-name/entity-name join). DELETEs the 5 dead read grants. UPDATEs the role Description. Postcondition THROWs (D6). Only `${flyway:defaultSchema}` / `${mjSchema}` placeholders. `sp_addextendedproperty` n/a (no new columns). |
| 3 | `migrations/metadata-seed.manifest.json` | Regenerate via `npm run seed:manifest` (file 1 changed). |
| 4 | `migrations-teardown/V001__Retire_Forms_Core_Rows.sql` | Add the 3 filter-record UUIDs to the doom table. Review the role row: dooming by canonical ID is **correct** for adopted hosts (adopted role has a different ID and survives teardown — the pre-Forms state is restored, which is the documented teardown contract). Record that reasoning in the file. |
| 5 | `.changeset/<name>.md` | **minor** — 0.9.0 → 0.10.0 (migration present). |
| 6 | `plans/FORMS_BUILD_PLAN.md` | Progress-log entry; link issue #39 and this plan. |
| 7 | `migrations-pg/` | **No port** (see out-of-scope): the PG chain deliberately stops before the 0.8.0 Metadata_Sync (no seed = neither the vulnerability nor the role INSERT exists there). Add one line to `migrations-pg/README.md` recording that v0.10.x is seed-repair and joins the Metadata_Sync PG-parity debt. |
| 8 | `smoke/respondent-path.mjs` | Extend (or add a sibling smoke) with the negative case: an anonymous session JWT calling the generic `CreateMJBizAppsFormsFormResponse` mutation must be **denied**, while the same session's `SubmitFormResponse` succeeds. This is the exploit-shaped acceptance test — the one signal that cannot lie. |

No TypeScript changes. `scope-check.service.ts`, the resolvers, and the widget are correct as-is —
that is the point of the design: the flags they read do not change.

## 4. Sequencing

1. **Commit A — corrective migration + teardown + manifest** (files 2, 3, 4). Independently
   shippable; heals applied hosts even before the seed edit lands.
2. **Commit B — seed in-place edit** (file 1 + regenerated file 3). Separate commit so the diff of
   a shipped file is reviewable in isolation.
3. **Commit C — smoke + changeset + docs** (files 5, 6, 7, 8).

Refactor/behavior separation does not apply (no behavior-preserving refactor here); the split is
by blast radius instead: new-file / shipped-file-edit / verification.

## 5. Acceptance criteria

1. **Fresh standalone install** (SQL Server, empty DB): chain applies clean; end state has exactly
   4 Form Respondent permission rows (2 create w/ deny-all filter, 2 read w/ scope filter), 0 rows
   for the five removed entities; widget loads a published form and submits through the pipeline.
2. **Blocked-upgrade host** (role pre-exists under a foreign ID, the #219 topology): 0.8.0 now
   applies (role adopted by name, grants attached to the adopted ID); chain continues through
   v0.10.x; same end state as (1) modulo role ID.
3. **Already-upgraded host** (0.8.0 applied before this fix): v0.10.x alone converges to the same
   end state. Re-running it changes nothing (idempotence).
4. **Co-install, both orders** (Forms→Caliber and Caliber→Forms, Caliber ≥ #220): both apps'
   migrations green including Caliber's THROW 50021 postconditions; final slots point at
   Forms-owned filter UUIDs; simulated Caliber uninstall (delete its 3 filter records) leaves all
   four slots non-NULL.
5. **The exploit is dead:** anonymous session JWT → generic `Create<FormResponse>` mutation is
   denied (smoke, file 8). `SubmitFormResponse` through the pipeline still succeeds for the same
   session. `PublishedForm` still resolves. Cross-form read: a RunView on Form Distributions under
   an anonymous session returns only the scoped distribution row.
6. **Repo gates:** `npm run lint:distribution` green (placeholder discipline + manifest freshness);
   package builds + unit tests green; no `${…}` placeholder other than the two permitted appears in
   either touched migration.

## 6. Explicitly out of scope

- **Filtered reads for the five removed entities.** They are removed, not filtered; if a future
  widget feature needs direct definition reads it must add scoped grants then (new issue).
- **PG parity for the seed chain.** The PG migrations deliberately stop before 0.8.0's
  Metadata_Sync; this plan adds no PG files and only documents the debt (§3 #7).
- **MJ core changes** — an upsert-shaped `spCreateRole`, or realtime's scoped-anonymous fix
  (MJ #3371), are upstream concerns.
- **Caliber changes.** Caliber ≥ #220 is already correct and compatible; nothing here requires a
  Caliber release.
- **`MJ: Files` upload grants** — Caliber's role-wide THROW on `MJ: Files` stands; Forms seeds no
  such grant and this plan does not touch the upload leg's storage-entity grants.
- **The `Forms Automation Runner` grant set** — only its create gets the existence guard;
  its permissions are untouched by this issue.

## 7. Review protocol (this PR)

The planning agent reviews every implementation commit on this branch against this plan: scope
drift, missing acceptance criteria, placeholder discipline, and the D1–D6 decisions are the
checklist. Deviations are flagged as PR comments; plan changes (if the build teaches us something)
are made by editing this file with an explanatory PR comment. Approval when §5 is fully satisfied.
