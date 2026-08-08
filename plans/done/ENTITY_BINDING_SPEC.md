# Entity Binding — Design Spec

**Status:** Draft for review · **Date:** 2026-08-07
**Extends:** `plans/done/ON_SUBMIT_AUTOMATION_SPEC.md` (binding is a new **target type** of that layer)
**Fulfills:** ask F1 from the ATS/Caliber design plan — a platform-level "this form feeds that
entity" capability that Caliber, ATS, and any future Open App consume instead of each building
its own intake mapper.

> Goal: a form author declares **"submissions to this form create/update a record of entity
> X"** — with (a) a declarative field mapping from question GUIDs to entity fields, (b) an
> identity rule (find-existing vs always-create), (c) a per-field merge policy — executed
> durably on submit under a service principal, never under the anonymous respondent.

Research grounding: this spec was written after a full sweep of the MJ monorepo (verified
against the `v5.51.0` tag — our exact pin), the forms repo, and Caliber's intake pipeline.
Every MJ capability referenced below **exists at 5.51.0** unless explicitly flagged.

---

## 1. What the research established (the three questions)

### 1.1 "Entity binding" in MJ — does it exist?

No. `EntityBinding` / `bindEntity` / any "form → entity" concept appears nowhere in MJ
(code, migrations, metadata, docs). The name is free. But four precedents shape the design:

| Precedent | What it is | Verdict |
|---|---|---|
| **Integration System** (`CompanyIntegrationEntityMap` + `FieldMap` + `RecordMap`, `MatchEngine`, v5.8.x) | External-system sync: per-entity config (ConflictResolution, DeleteBehavior), per-field rows (SourceFieldName→DestinationFieldName, IsKeyField, TransformPipeline), durable external-ID→record ledger, find-by-PK/key-fields/ledger identity cascade | **Imitate the shape, don't reuse the tables** — they're hard-wired to CompanyIntegration (credentials, watermarks, sync direction), the wrong ontology for "this form feeds that entity". Its three-table decomposition (policy / lines / ledger) and MatchEngine's identity doctrine are the blueprint. |
| **Field Rules engine** (`FieldRuleSet` in `@memberjunction/global`, `EntityFieldRules` in `@memberjunction/core`, v5.43.0) | Declarative `{TargetField, Source: static\|field\|formula\|lookup, Transforms[], Condition}` mapping with TSType coercion, metadata pre-flight validation, RunView-backed lookups, **dry-run diffs**, Apply+Save with audit | **Reuse as the execution engine.** A form submission (answers already captured) is exactly its "source data you already hold" case — its own doc comment draws that boundary vs the Integration engine. |
| **Entity Actions** (`EntityAction` + 10 invocation types) | MJ's own declarative binding of Actions to entity lifecycle events | **Don't build on** for our trigger (at 5.51.0: no ordering, no scoping, fire-and-forget, fires on *every* save). The forms-owned FormAutomation dispatch is strictly better. |
| **Naming idiom** (`AICredentialBinding`, `MLModelScoringBinding`) | "X Binding" tables with `TargetEntityID`/`BindingType` + CHECK-enforced one-of-target | **Adopt the naming.** Avoid bare `FieldMap` (already means "literal survivor overrides" in core's `MergeRecords` API) and `MatchStrategy` (a live-but-never-read column on CompanyIntegrationEntityMap). |

Two things MJ does **not** have anywhere, which are this spec's genuinely net-new vocabulary:
- **Field-level merge policy.** Integration's ConflictResolution is record-level; its update
  path overwrites every mapped field, nulls included. `EntityMergeOptions` is an empty class.
- **A declarative identity-rule config** richer than `IsKeyField` bits.

Caliber has both — battle-tested over five review rounds — and we adopt its vocabulary (§5).

### 1.2 "Entity JSON type" — how MJ types JSON

There is **no `'JSON'` ExtendedType**. MJ's canonical typed-JSON-column mechanism is the
`EntityField.JSONType` / `JSONTypeIsArray` / `JSONTypeDefinition` metadata (since ~v5.23):
CodeGen emits a typed `get/set <Field>Object()` accessor with cached parse/stringify next to
the raw `string | null` property. There is no runtime JSON-schema validation anywhere — shape
validation belongs in the entity subclass's `Validate()` override.

**We use exactly this** for the binding's three config columns (`FieldMappings`,
`IdentityRule`, `MergePolicy`): set JSONType metadata so CodeGen gives us typed accessors, and
validate config shape in the `FormEntityBindingEntity` server subclass.

### 1.3 "Source form → destination entity" — the mapping vocabulary

MJ's established naming: `SourceFieldName`/`DestinationFieldName` (Integration FieldMap),
`TargetEntityID` + `TargetField` (MLModelScoringBinding, FieldRule), `*Mapping` JSON columns
(`ActionInputMapping` on AIAgentStep). `SourceEntity*` already means query-lineage provenance
(QueryField) — we don't need it; our source is always the form, keyed by **question GUID**,
which is the one identifier that survives transport → snapshot → storage unchanged (answer
row IDs are NOT stable — answers are deleted and re-inserted on every autosave).

---

## 2. Design principles (the books, applied)

- **The normalized answers stay the single source of truth; the bound record is a derived
  view** *(Kleppmann)*. Binding is re-derivable: answers are recorded first, binding failure
  never discards a submission, and a failed binding is repairable later by re-running an
  idempotent executor. Pending work is **derived from state** (a Complete response with no
  ledger row), not from an ephemeral queue — so crash recovery is a query, not a dead-letter
  drain. No distributed transactions: per-step idempotency + a dedup ledger, races documented
  and bounded rather than wished away.
- **One deep module** *(Ousterhout)*. The executor's interface is small — `(bindingConfig,
  responseContext, serviceUser) → BindingResult` — and everything hard (canonicalization,
  GUID case-folding, coercion, identity resolution, merge planning, idempotency) is hidden
  behind it. Errors defined out of existence: an empty merge plan is a no-op (not an error,
  no `__mj_UpdatedAt` churn); an absent answer never writes (absent ≠ empty); a clean skip is
  `Success:true / SKIPPED`, matching the repo's existing action convention.
- **DRY + orthogonality + tracer bullet** *(Hunt & Thomas)*. One mapping vocabulary (reuse
  MJ's FieldRule engine as the execution IR; adopt Caliber's identity/merge semantics so its
  migration is mechanical deletion, not translation). Mapping ⊥ identity ⊥ merge ⊥ dispatch —
  each independently configurable and testable. v1 ships as a tracer bullet: one form → one
  entity, end-to-end through the real automation layer, before any breadth.

---

## 3. Architecture: a target type of FormAutomation

Binding does **not** get its own dispatch path. It is the third `TargetType` of the
FormAutomation layer (ON_SUBMIT_AUTOMATION_SPEC), so it inherits per-form configuration,
triggers, conditions, ordering, sync/async, observability, and the service-principal
execution — and downstream automations (confirmation email, Caliber's future intake action)
can consume its output.

```
runSubmitPipeline step 8
  └─ FormAutomationRunner.run(...)                       — spec §5, unchanged
       ├─ TargetType='Action'        → ActionEngineServer.RunAction
       ├─ TargetType='Agent'         → AgentRunner.RunAgent
       └─ TargetType='EntityBinding' → FormEntityBindingExecutor.Execute   ← NEW
```

Plus one thin wrapper Action (`Forms: Bind Response To Entity`, params `BindingID` +
`FormResponseID` only) sharing the same executor — so binding is invocable from anywhere
Actions run (bizapps-tasks approval hooks, manual re-drive, Caliber). Same dual pattern the
automation spec already uses for agents (§6). **Pass IDs, never payloads, as ActionParams:**
at 5.51.0 `ActionExecutionLog.Params` is written **unredacted** (redaction/`LogValue` is
6.x-only) — answer PII must not ride in action params.

The vertical business logic stays out: Application create/reopen, screening, engagement
linking remain Caliber's. Binding emits `{targetEntityName, recordId, outcome, written[]}`
into the automation context; Caliber's layers become ordinary downstream consumers (§10).

---

## 4. Data model (new tables in `__mj_BizAppsForms`)

Standard migration discipline (hardcoded UUIDs, `sp_addextendedproperty` per business column,
no `__mj_*` timestamps / FK indexes — CodeGen adds them).

### 4.1 `FormEntityBinding` (entity `MJ_BizApps_Forms: Form Entity Bindings`)

| Column | Type | Notes |
|---|---|---|
| `FormID` | FK → Form | Owning form. Snapshotted per version at publish, like everything else. |
| `Name` | nvarchar(255) | Author label ("Create CRM Lead"). |
| `Description` | nvarchar(max) NULL | |
| `TargetEntityID` | uniqueidentifier, **hard FK → `__mj.Entity(ID)`** | MJ's own precedent (CompanyIntegrationEntityMap, MLModelScoringBinding) binds by EntityID. Cross-schema FKs into `__mj` are proven (`FormResponseAnswer.FileID → __mj.File`). |
| `TargetEntityName` | nvarchar(500) | Display + cross-environment portability. RSU/CodeGen-created entities get **per-environment UUIDs** (minted by `createNewUUID()` at CodeGen time), so Name is the only portable handle; ID is the only durable same-DB handle. Store both; resolve by ID, repair by Name. |
| `FieldMappings` | nvarchar(max) JSON (+ JSONType metadata) | §5.1. |
| `IdentityRule` | nvarchar(max) JSON (+ JSONType) | §5.2. |
| `MergePolicy` | nvarchar(max) JSON (+ JSONType) NULL | §5.3. Null = `neverBlank` everywhere. |
| `Status` | value-list: `Active` \| `Disabled` | |

### 4.2 `FormAutomation` gains the target type

`TargetType` value-list becomes `Action | Agent | EntityBinding`; add `BindingID` FK →
FormEntityBinding NULL; the XOR CHECK extends to exactly-one-of-three matching TargetType.
Trigger, ExecutionMode, DisplayOrder, `ConditionalRule` (whole-binding condition, reusing the
existing §6 evaluator over the answers map), ContinueOnError, TimeoutMS all ride FormAutomation
unchanged. Binding rows for a form must default `ExecutionMode='Sync'` + early DisplayOrder,
so downstream automations can consume the bound record's ID.

### 4.3 `FormEntityBindingRecord` — the identity ledger (entity `…: Form Entity Binding Records`)

Modeled on `CompanyIntegrationRecordMap` + `RecordMapBatch`'s invariants: a durable
(binding, response) → record correlation, **upserted on every path including skips**, so
retries are idempotent upserts and lineage is queryable by consumers (Caliber reads back
"which record did my submission produce").

| Column | Type | Notes |
|---|---|---|
| `BindingID` | FK → FormEntityBinding | |
| `FormResponseID` | FK → FormResponse | |
| `TargetEntityID` | uniqueidentifier | Denormalized from binding at execution time. |
| `TargetRecordID` | nvarchar(750) NULL | `'|'`-joined composite-PK serialization, MatchEngine's convention. NULL when Outcome=`Skipped`. |
| `Outcome` | value-list: `Created` \| `Merged` \| `Unchanged` \| `Skipped` | Caliber's outcome enum, plus `Skipped`. |
| `WrittenFields` | nvarchar(max) JSON NULL | Field names written this execution (audit + Caliber's `written[]` contract). |

**Unique index on `(BindingID, FormResponseID)`** — the DB-level idempotency backstop
(Caliber's filtered-unique-index lesson: app-side SELECT-then-INSERT is not enough).
Per-attempt observability (status, error, attempt count, timing) lives in `FormAutomationRun`
(automation spec §3.2) — two tables, two jobs: the ledger is identity, the run log is history.

### 4.4 Snapshot

Bindings snapshot into `FormVersion.DefinitionSnapshot` with the `automations[]` array
(automation spec §3.3) — a response fired against version N binds with version N's mapping.
This is forced by the data anyway: mappings reference question GUIDs, which are a property of
the version. Fixing a mapping means republish (cheap, and the audit trail is the point).
Reminder from the code: `snapshot-builder.ts`, `snapshot-parser.ts`, and
`PublishedFormDefinition` all **whitelist fields** — all three must be extended in lockstep
or the config is silently stripped at publish/parse.

---

## 5. Config vocabulary

Design rule: **authoring shape borrows Caliber's proven semantics; execution lowers onto MJ's
FieldRule engine.** Caliber's `SubjectEntityConfig` encodes five review-rounds of hard-won
rules (absent≠empty, identity immutability, refuse-vs-create asymmetry, config-vs-candidate
failure scoping); MJ's `EntityFieldRules` gives us validation, coercion, transforms, and
dry-run for free. We take both.

### 5.1 `FieldMappings`

```jsonc
{
  "version": 1,
  "fields": [
    { "targetField": "Email",        "source": { "kind": "question", "questionId": "3e4f…" }, "required": true },
    { "targetField": "FirstName",    "source": { "kind": "question", "questionId": "9a1b…" } },
    { "targetField": "LeadSource",   "source": { "kind": "static",   "value": "Web Form" } },
    { "targetField": "ResumeFileID", "source": { "kind": "question", "questionId": "77c2…" } },   // FileUpload → FK copy, §8
    { "targetField": "Notes",        "source": { "kind": "question", "questionId": "ab12…" },
      "transforms": [ { "type": "substring", "maxLength": 4000 } ],
      "condition": "…" }                                                                          // per-line condition (FieldRule.Condition)
  ]
}
```

- `version: 1` frozen-shape versioning + duplicate-`targetField` rejection (Caliber's
  `IntakeMappingSchema` discipline).
- Each line lowers to a `FieldRule { TargetField, Source: {Kind:'field', …}, Transforms,
  Condition }` evaluated by `FieldRulesEvaluator` with **Context = the canonical answers map**
  (question GUID → collapsed value). The full transform pipeline (regex/split/combine/format/
  coerce/jsonpath/…, each with `OnError: Skip|Null|Fail`) comes along for free; v1 UI exposes
  none of it, the schema carries it from day one.
- `required: true` + missing/empty answer → the binding refuses with one error listing **all**
  missing targets (never partial-writes a required-incomplete record).

**Canonical answer collapse** (forms-side, replacing Caliber's `collapseAnswers`): one value
per question, first-non-null precedence `TextValue → NumericValue → DateValue.toISOString() →
BooleanValue → JSONValue(parse, keep raw string on parse failure) → FileID`; all-null
(Statement/skipped) → **absent** — the key is omitted, not null. Question-GUID comparison is
**case-folded on both sides** (SQL Server renders uniqueidentifiers uppercase; client-minted
GUIDs are lowercase — the exact defect class Caliber hit live and forms hit in 0.4.0).

### 5.2 `IdentityRule`

```jsonc
{
  "mode": "MatchThenCreate",                     // AlwaysCreate | MatchThenCreate | MatchOrSkip
  "match": [ { "targetField": "Email", "normalize": "LowerCaseTrim" } ],
  "scope": [ { "targetField": "CompanyID", "value": "05F0…" } ],
  "onMultipleMatch": "Oldest",                   // Oldest | Fail
  "onMissingIdentityValue": "Skip"               // Skip | Fail   (AlwaysCreate ignores)
}
```

- **Match values come from the mapped values** — a validator enforces every `match.targetField`
  is also a mapping target (Caliber auto-adds the identity pair to the map for exactly this
  reason: the create must write the value later lookups match on).
- `normalize` uses the **Organic Keys** vocabulary (`LowerCaseTrim | Trim | ExactMatch`,
  `EntityInfo.OrganicKeys`, MJ ≥5.15) — and the builder pre-seeds the identity picker from the
  target's declared OrganicKeys/UniqueKeys.
- `scope` entries are constant constraints ANDed into the match filter **and** stamped on
  create — Caliber's mandatory CompanyID scoping, generalized. No default identity field ever
  ("guessing that *email* maps to *Email* is right often enough to be dangerous").
- Doctrine imported from MatchEngine verbatim: absence must be **proven** (a failed lookup is
  an error, never "no match"); reads that decide create-vs-update use `BypassCache: true`;
  a *wrong* match (writing onto someone else's row) is worse than a *missed* match (duplicate).
  `MaxRows 2` on the match read; `>1` rows → per `onMultipleMatch`, `Oldest` binds
  `ORDER BY __mj_CreatedAt ASC` deterministically and logs (never auto-repairs duplicates).
- `MatchOrSkip` is Caliber's ruled asymmetry (a duplicate person is costlier than an unbound
  submission): record the `Skipped` ledger row, keep the response, a human or later re-run
  repairs. `AlwaysCreate` serves the generic case (event RSVPs, survey entries).

### 5.3 `MergePolicy`

```jsonc
{ "default": "neverBlank", "fields": { "Notes": "latestWins", "Source": "writeOnce" } }
```

Caliber's vocabulary verbatim — `neverBlank` (default; incoming empty never clears existing) |
`latestWins` (the only rule that can clear, and only via a **present**-but-empty answer) |
`writeOnce` (never overwrite an existing non-empty value). Unknown rule string → config
**refused**, not defaulted (a typo must not become a field that quietly stops updating).
Structural rules, not configurable: absent never writes under any rule; identity fields are
immutable on update (rewriting one could merge two real people); create path writes all
supplied non-empty values regardless of rule; `value === existing` skips; **empty plan → no
Save** (idempotent replays never churn `__mj_UpdatedAt` or fabricate RecordChange rows —
also the Integration engine's check-Dirty-before-bookkeeping lesson).

One deliberate improvement over Caliber, enabled by the FieldRule lowering: **typed
coercion**. Caliber's `PlanSubjectMerge` silently skips every non-string value, so numbers,
booleans, dates, and files can never reach an entity column there. We coerce per
`EntityFieldInfo.TSType` (the `EntityFieldRules` coercion table: Number/bool-string/Date/
String) and pass FileID GUIDs through to FK columns (§8) — the two capabilities that make
this strictly better than what it replaces, not merely equal.

---

## 6. The executor

`FormEntityBindingExecutor` in `packages/Server/src/automation/` (alongside the runner).
One public method; every step below is internal.

```
Execute(binding, responseCtx, serviceUser) → BindingResult
  1. VALIDATE (fail fast, config-scoped):
     - md.EntityByID(TargetEntityID) resolves; entity is on the deployment allow-list (§7);
       AllowCreateAPI/AllowUpdateAPI per mode.
     - Every targetField ∈ EntityInfo.Fields and !ReadOnly → ONE error listing ALL problems
       (BaseEntity.Set() silently no-ops on unknown/readonly fields; unvalidated drift is
       silent data loss). This is EntityFieldRules.Validate + Caliber's
       requireAuthoredColumnsExist, merged.
  2. LEDGER CHECK: existing (BindingID, FormResponseID) row → idempotent short-circuit
     (return prior outcome) unless this is an explicit re-drive.
  3. CANONICALIZE answers (§5.1) → Context map.
  4. IDENTITY (§5.2): mode-dependent match via RunView {ExtraFilter: SqlLiteral-escaped,
     normalized; MaxRows 2; BypassCache-equivalent fresh read} under serviceUser.
  5. LOAD-OR-NEW: md.GetEntityObject(TargetEntityName, serviceUser) → null-check (it returns
     null, never throws); load matched record by CompositeKey or NewRecord().
  6. PLAN: lower mappings to FieldRules, ComputeForEntity (dry-run diff), filter the diff
     through the merge policy → SubjectMergePlan-style {column → value}, only what changes.
     Empty plan → Outcome 'Unchanged', upsert ledger, return.
  7. APPLY: entity.Set() per surviving field (Set() routes IS-A parent columns — proven live
     at 5.51.0 by Caliber's Applicant IS-A Person single-save), then Save().
     Save() is boolean — on false, read LatestResult.CompleteMessage. CheckPermissions THROWS
     (not false) when the service principal lacks the grant — distinguish the two.
  8. RECORD: upsert ledger row (Outcome, TargetRecordID '|'-joined, WrittenFields); the
     runner writes the FormAutomationRun row; emit BindingResult into the automation context.
```

**Error taxonomy** (two axes, both from research):
- *Scope* — `config` (broken for every submission: unknown entity, missing column, bad rule)
  vs `candidate` (this submission: missing required answer, no identity value). Caliber's
  `SubjectBindFailureScope`: a config typo must never read as per-candidate advice.
- *Retryability* — `retryable` (DB timeout, lookup failure) vs `deterministic` (validation,
  config). Integration's `SyncErrorCode` split. Only retryable failures are re-driven (§9).

**Transactions:** none in v1, deliberately. The Actions framework provides no transaction
(AfterSave hooks are unawaited, fire-and-forget); MJ's `TransactionGroup` exists and a
single-record bind is one SP call (atomic) anyway. Multi-record binds don't exist in v1. The
consistency model is Kleppmann-style: idempotent steps + ledger, not 2PC.

---

## 7. Security model

The research confirmed the sanctioned pattern (`widgetGuestElevation.ts`, MJServer, in
5.51.0 — the formalized "anonymous guest triggers work that runs as a server principal"
helper) and this spec imports its invariants wholesale:

1. **Dedicated service principal, fail-closed.** A seeded `Forms Automation Service` user
   (Type='User') with a `Forms Automation Runner` role, resolved by config the way
   `magicLink.contextUserForProvisioning` is (UserCache lookup by name) — but **failing the
   automation rather than falling back to Owner/System**. Recommended over
   `UserCache.GetSystemUser()` (the current hooks' principal): the System user's power comes
   from broad core roles; a dedicated principal is least-privilege and makes RecordChange
   audit legible. This settles automation-spec open decision #1. Note: MJCore has **no
   Type='Owner' code bypass** — all power is role grants, so the principal's EntityPermission
   rows are the real, auditable ceiling.
2. **The respondent's scope never widens.** 'Form Respondent' keeps CanCreate on the two
   response entities only. Ownership/eligibility checks run on the **caller**; only the work
   runs elevated. Elevation is unreachable except through the runner.
3. **Config is authoritative, payload is not.** The executed binding comes from the published
   snapshot resolved via the distribution → version chain — never from anything the client
   sent. (widgetGuestElevation: "a guest can never run an arbitrary agent under the elevated
   principal".)
4. **Target-entity allow-list, checked twice.** A form author with builder rights must not be
   a privilege-escalation path to any entity the service principal can touch. Deployment
   config (`mj.config.cjs` forms section) carries an explicit entity allow-list; validated at
   binding save time AND at execution time. The service principal's role grants are the hard
   ceiling; the allow-list keeps authoring honest inside it.
5. **Attribution.** RecordChange rows on the target entity are stamped with the service
   principal (`Source='Internal'`, `Comments` hardcoded null on the automatic path — there is
   no pass-through attribution channel at the entity layer). Submission lineage therefore
   lives in our ledger + FormAutomationRun; optionally, an explicit `MJ: Record Changes` row
   (`Source='External'`, `Comments='MJ Forms response <id>'`) — the entity is AllowCreateAPI
   and its description invites exactly this.

### 7.1 Two live findings the design must fix first (found during research)

- **F-SEC-1 — submitted `fileId` has no session provenance check.** The submit pipeline
  writes any existing File GUID into `FormResponseAnswer.FileID` (only the FK checks
  existence; `__mj.File` has **no owner column and no RLS**). Today that's a latent oddity;
  the moment a binding copies `FileID` onto e.g. `Applicant.ResumeFileID` and recruiters get
  read, it becomes **cross-tenant file exfiltration by GUID**. Fix at submit time (constrain
  accepted fileIds to this session's uploads / the forms `ProviderKey` path prefix), and the
  executor re-verifies before copying.
- **F-SEC-2 — 'Form Respondent' has no `MJ: Files` CanCreate grant** in repo metadata, but
  the anonymous upload path Saves a File row under the anonymous session user, which is
  default-deny — should throw on a clean install. The upload tests stub the storage engine,
  so this is structurally untested. Either add the grant (mj-sync entity-permissions) or move
  File creation under the service principal. Needs a live check + fix regardless of this spec.

---

## 8. File answers (FileUpload → entity)

The one capability that makes binding strictly better than Caliber's intake for the ATS
(resume pipeline, generalization-proposal item 7):

- **Primary:** the target entity carries a `uniqueidentifier` FK column → `__mj.File(ID)`
  (exactly `FK_FormResponseAnswer_File`'s pattern; core itself does this four times). The
  executor **copies the GUID** — no blob copy, no re-owning, no provider interaction — after
  the F-SEC-1 provenance check. The FK makes the File row deletion-proof for free.
- **Fallback** (target schema can't change): an `MJ: File Entity Record Links` row (the
  realtime-recording pattern) — with eyes open: `UNIQUE(EntityID, FileID)` means one file
  links to at most one record per entity (check-before-insert), and **nothing in Explorer
  renders the table at 5.51.0** — the consumer must RunView it itself.
- Reader-side permission is flat: whoever holds CanRead on `MJ: Files` can read **every**
  file instance-wide. Granting that to e.g. recruiters is a deployment decision to document,
  not something binding can scope at 5.51.0.

---

## 9. Durability & idempotency

Nothing in MJ 5.51.0 provides at-least-once execution (MJQueue is at-most-once/in-memory
with an unimplemented heartbeat; ScheduledActions has no locking and is deleted in v6;
the Task claim-CAS dispatcher is 6.1-edge). So durability is forms-owned, and cheap because
the state model does the work:

- **Execute inline** (Sync, before confirmation) — the happy path lands immediately.
- **Recovery is derived from state, not a queue:** pending work ≡ *Complete responses whose
  version snapshot has an active binding but no `FormEntityBindingRecord` row, or whose run
  row is Failed-retryable with `AttemptCount < MAX_BINDING_ATTEMPTS`.* A periodic in-process
  sweep (interval + on-boot) re-executes them idempotently — the ledger's unique index makes
  double-execution collapse into `Unchanged`.
- `MAX_BINDING_ATTEMPTS` (constant, e.g. 5) with the limit-hit case explicit: run row parked
  `Failed`/terminal, surfaced in the builder's activity view — never an unbounded loop,
  never silent.
- Deterministic failures (config/candidate scope) don't retry — they park immediately with
  the scoped message.
- This converges with where MJ itself is heading (the 6.1 Task claim dispatcher); when forms
  revs onto a version that ships it, the sweep collapses into Task rows without touching the
  executor.

Binding fires on `Trigger='OnComplete'` only in v1 — the Partial-autosave supersede dance
that consumed Caliber's R33 review round evaporates when the producer owns the trigger.

---

## 10. Caliber / ATS adoption path

The research produced a 16-point acceptance checklist ("what a forms-side binding must
support for Caliber to delete its intake layer") — mapping, GUID case-folding, answer
collapse, FileID, idempotency + supersede, completeness guard, identity vocabulary, merge
vocabulary, fail-fast validation, IS-A targets, post-bind extension point, durability
posture, service principal, provenance, SQL-literal safety, result surface. This spec covers
all sixteen by construction except two that stay deliberately out of scope:

- **The vertical write graph** (Application create/reopen via the IntakeRecord seam,
  screening, engagement linking, magic-link mint) stays Caliber's. Binding's contract to it
  is the emitted `BindingResult` + the queryable ledger; when forms later ships an Action/
  webhook automation target, Caliber's claim trigger becomes an ordinary on-submit automation.
- **The `MappedData` public vocabulary** (prompt rendering, email merge fields,
  carry-forward chaining) is Caliber-internal; four of its consumers read those keys. Caliber
  migrates by pointing its `ExternalFormSchema` authoring at the form's own binding config
  when it's ready — the vocabularies are deliberately convergent (`{source, target}` ≡
  question line; `identity/mergePolicy` adopted verbatim), so convergence is a re-point, not
  a migration.

ATS v1 keeps riding the Caliber claim path (per the design-plan decision); the first
direct ATS consumers are the simple forms — referral, feedback, requisition — bound straight
to ATS entities with zero Caliber involvement.

---

## 11. Builder UX ("On Submit" tab, extends automation-spec §8)

- **Pick entity:** `new Metadata().Entities` (identical client-side via GraphQLDataProvider —
  no new API), filtered to AllowCreateAPI ∩ deployment allow-list.
- **Map fields:** target-entity fields from `EntityInfo.Fields` showing DisplayNameOrName,
  TSType, AllowsNull, MaxLength, value lists (`EntityFieldValues` → dropdown), excluding
  `ReadOnly` (the getter already folds in PK/AllowUpdateAPI/special dates). **Auto-map by
  name with confidence indicators** — crib the documented UX from
  `packages/Integration/docs/field-mapping.md` (case-insensitive, ignores underscores/spaces).
  Compatibility hints from question type → `ExtendedType`/TSType (Email question → Email
  field; FileUpload → File-FK columns only).
- **Identity rule:** picker pre-seeded from the target's `OrganicKeys` / `UniqueKeys`.
- **Merge policy:** per-field dropdown, default `neverBlank`.
- **Dry-run preview:** `EntityFieldRules` dry-run against a sample/most-recent response →
  the diff view (`FieldChange[]`) exists in the engine already.
- **Activity:** ledger + run rows (bound record link, outcome, parked failures).
- **Phase 2, RK's bonus:** generate form questions *from* the entity's fields (invert the
  mapping — walk `EntityInfo.Fields`, emit typed questions with the mapping pre-authored).

---

## 12. Phasing

**Phase 0 — prerequisites (small, independently shippable):**
fix F-SEC-1 + F-SEC-2 (§7.1); extend `loadFormResponseContext` to project `DateValue`,
`FileID` (and `Score`) — today Date/File answers are invisible to hooks; ship the canonical
answer-collapse + case-fold helper in `packages/Entities` (shared contract, Caliber-visible).

**Phase 1 — FormAutomation layer** (the existing spec, unchanged scope): entities, runner,
snapshot plumbing, Action/Agent targets, builder tab skeleton, back-fill.

**Phase 2 — Entity binding v1 (the tracer bullet):** `FormEntityBinding` +
`FormEntityBindingRecord` + executor + `Forms: Bind Response To Entity` wrapper action +
service principal + allow-list + builder mapping UI + dry-run; recovery sweep with capped
retries. Definition of done: a form binds to a `bizapps-common` Person AND to one ATS-style
entity with a File-FK column, end-to-end from an anonymous submission, with the ledger row,
under the dedicated principal, surviving a mid-execution process kill (sweep re-drives).

**Phase 3 —** overflow/unmapped-answers capture (optional JSON column target, the
`CustomOverflow` pattern), lookup-source mapping lines (FK-by-name with explicit `?create`
opt-in, MetadataSync's semantics), webhook/notification automation target (Caliber's
trigger), question-generation-from-entity, RSU-materialized targets hardening.

---

## 13. Decisions (settled with Soham, 2026-08-07)

1. **v1 scope: full layer.** Phase 1+2 as one workstream — FormAutomation entities + runner +
   all three target types + back-fill; the hardcoded on-submit list dies once.
2. **Execution principal: dedicated service user.** Seeded `Forms Automation Service` user +
   role, config-resolved, fail-closed (never falls back to Owner/System). Settles
   ON_SUBMIT_AUTOMATION_SPEC open decision #1 — update that spec's §7/§11 when Phase 1 starts.
3. **Durability v1: state-derived recovery sweep** with `MAX_BINDING_ATTEMPTS`-capped retries
   (§9). The automation spec's fire-and-forget stance stays for Action/Agent targets;
   EntityBinding is always sweep-covered.
4. **Vocabulary: Caliber's, verbatim** — `neverBlank | latestWins | writeOnce`, oldest-first
   convergence, refuse-without-identity. Caliber's migration is deletion, not translation.
5. **Snapshot over live config** (§4.4) — mappings are version-coupled through question GUIDs
   regardless.
