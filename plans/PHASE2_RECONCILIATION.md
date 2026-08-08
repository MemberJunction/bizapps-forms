# Phase 2 Reconciliation — one plan for "responses as entities"

**Status:** Draft for review · **Date:** 2026-08-07
**Purpose:** fold three overlapping "response ↔ entity" designs into the **single**
`FORMS_BUILD_PLAN.md` roadmap without losing any existing functionality or any committed
Phase 2 feature. This note is the merge instruction; once approved, its content moves into
`FORMS_BUILD_PLAN.md` §5, §8, §9, §10 and the two design specs become referenced appendices.

The three designs being reconciled:

| Design | Where it lives today | What it does | Direction |
|---|---|---|---|
| **Projection / materialization** (feature A) | `FORMS_BUILD_PLAN.md` §5.4, §8.2, §9 Phase 2 | Derive a **new** view/entity **from** responses (reporting, Skip-queryable) | reads OUT |
| **On-submit automation layer** | `plans/ON_SUBMIT_AUTOMATION_SPEC.md` (Draft) | Per-form, metadata-driven Actions/Agents on submit; replaces the hardcoded hook list | write path |
| **Entity binding** (feature B) | `plans/ENTITY_BINDING_SPEC.md` (Draft) | Feed an **existing** entity (Person, Lead, Applicant) **from** responses via mapping/identity/merge | writes IN |

---

## 1. The reconciliation (the conceptual unification)

The build plan already promises (§0, §1.2): *"responses are first-class records in your
MemberJunction database — optionally projected into real, query-able, Skip-accessible
entities."* That promise has **two directions**, and we now name both as one capability —
**"Responses as Entities"** (proposed new §5.5) — so authors, Caliber, and future Open Apps
see a single "where does this form's data go" surface instead of three unrelated features:

- **Direction OUT — Projection** *(the original feature A, unchanged in intent).* A form/group's
  responses are **derived into** a lightweight SQL **view** (default, live, no restart) or an
  **RSU-materialized table** (opt-in, admin-triggered, batched). Read-only reporting surface.
- **Direction IN — Binding** *(feature B, net-new).* A submission **writes into** a pre-existing
  entity via declarative field mapping + identity rule + merge policy, executed on submit under
  a service principal. Operational intake surface.

Both directions ride **two shared substrates**, which is what makes this one plan and not three:

1. **The On-Submit Automation layer is the write-path dispatch for Direction IN.** Binding is a
   *target type* of it (`Action | Agent | EntityBinding`) — not a parallel pipeline. So binding
   inherits per-form config, ordering, conditions, sync/async, observability, the service
   principal, and anti-abuse gating for free.
2. **The `FormVersion` snapshot is the version-coupling for both.** Projection column sets and
   binding field-mappings are both keyed to a version's question GUIDs, so both snapshot at
   publish and a response fired against version N uses version N's config.

**Where the two directions converge (Phase 3):** an RSU-materialized *projection* entity can
itself become a *binding* target. That is the single point where A and B meet, and it is
deferred to Phase 3 by design — v1 keeps them independent.

---

## 2. Nothing-lost guarantees (explicit)

These are the regressions this reconciliation must *not* cause. Each becomes a gated task with
a test in §4.

- **G1 — The four live on-submit hooks survive.** `Upsert Respondent Person`, `Send
  Confirmation Email`, `Create Followup Task`, `Analyze Written Responses` are **preserved by
  back-fill**: the automation layer seeds an equivalent `FormAutomation` row set for every
  existing form, the runner falls back to the legacy `ON_SUBMIT_ACTION_NAMES` list only for
  pre-automations snapshots, and `ON_SUBMIT_ACTION_NAMES` is deleted **only after** a
  parity test proves the seeded automations produce byte-identical effects. (Ref: automation
  spec §9.)
- **G2 — Every original Phase 2 "Power" item stays committed** (advanced question types,
  LLM-judge scoring, review/approve routing, partial-resume/quotas). They move to Phase 2.4 with
  their scope intact — reordered, not dropped.
- **G3 — Projection (feature A) stays exactly as designed.** §5.4 dual-persistence and §8.2
  first-class projection are preserved verbatim in intent; the only change is renumbering into
  Phase 2.3 and adding one cross-reference to binding.
- **G4 — The public submit path's verified behavior is untouched.** No change to
  `runSubmitPipeline` semantics except (a) step 8 dispatches through the runner instead of the
  constant list, and (b) automations/bindings are suppressed for responses that fail
  Turnstile/quota/rate-limit/dedupe (new gate, strictly additive).
- **G5 — PostgreSQL installability is preserved.** Every new table ships SQL-Server **and**
  `migrations-pg` together (the repo is PG-installable as of commit 2f85d01); no Phase 2 table
  lands SQL-Server-only.

---

## 3. Exact edits to `FORMS_BUILD_PLAN.md`

1. **§5.4 (Dual persistence)** — retitle to *"Responses as Entities — Direction OUT
   (projection)"* and add a one-line pointer to the new §5.5. Body unchanged.
2. **New §5.5 (Responses as Entities — Direction IN: binding)** — the §1 unification above, plus
   the `FormEntityBinding` / `FormEntityBindingRecord` / `FormAutomation` data model summarized
   from `ENTITY_BINDING_SPEC.md` §4 (full detail stays in the appendix).
3. **New §5.6 (On-Submit Automation layer)** — the `FormAutomation` / `FormAutomationRun` model
   summarized from `ON_SUBMIT_AUTOMATION_SPEC.md` §3; full detail stays in the appendix.
4. **§8.2 (First-class projection)** — add one sentence distinguishing projection (reads out)
   from binding (writes in) so the reporting section doesn't read as the only entity story.
5. **§9 Phase 2** — replace the current flat five-item checklist with the dependency-ordered
   sub-phases in §4 below. The five existing items are preserved inside 2.3/2.4.
6. **§10 Decision Gates** — add DG-7…DG-12 (§5 below).
7. **Appendices** — add a "Design appendices" list pointing at `ON_SUBMIT_AUTOMATION_SPEC.md`
   and `ENTITY_BINDING_SPEC.md` as the normative detailed designs; state that §9 is the task
   state and the specs are the design-of-record (no task tracking in the specs).
8. **Status Snapshot ▶ NEXT** — after 0.3.0 ships, Phase 2 resumes in the 2.0 → 2.4 order below,
   not the old flat order.

---

## 4. Restructured §9 Phase 2 — dependency-ordered task breakdown

> Ordering rule (unchanged plan convention): pick up the first unfinished task in dependency
> order. `2.0` gates `2.2`; `2.1` gates `2.2`; `2.3` and `2.4` are independent of `2.1/2.2`.

### Phase 2.0 — Shared prerequisites (small, independently shippable)

Each ships on its own; several are latent security fixes worth landing regardless of binding.

- [ ] **P2.0-a — Fix F-SEC-1 (submitted `fileId` provenance).** `persistence.service.ts` writes
      any existing File GUID into `FormResponseAnswer.FileID` with only an FK existence check, and
      `__mj.File` has no owner column / RLS. Add an upload-provenance record (a small forms-owned
      **session→fileId ledger** written by `UploadMiddleware`) and constrain accepted `fileId`s at
      submit to this session's uploads / the forms `ProviderKey` path prefix. *(This is the buildable
      mechanism the binding spec's "re-verify before copying" depends on — without a persisted map
      there is nothing to verify against.)* **Test:** cross-session fileId is rejected at submit.
- [ ] **P2.0-b — Fix F-SEC-2 (Form Respondent has no `MJ: Files` CanCreate grant).** The anonymous
      upload path Saves an `MJ: Files` row but no metadata grants the role CanCreate on Files, which
      is default-deny — should throw on a clean install (the upload tests stub storage, so it is
      structurally untested). Either add the grant via mj-sync entity-permissions **or** move File
      creation under the P2.1 service principal. **Test:** clean-install upload against a real
      (un-stubbed) permission check.
- [ ] **P2.0-c — Project Date/File/Score into the response context.** `FormResponseContext.answers`
      today carries only text/numeric/boolean/json (verified: no `dateValue`/`fileId`). Extend
      `loadFormResponseContext` + `AnswerWithType` to include `DateValue`, `FileID`, and `Score` so
      automation param-mapping and binding can see Date/File/Score answers. **Test:** a Date and a
      File answer are visible to a hook.
- [ ] **P2.0-d — Ship the canonical answer-collapse + GUID case-fold helper** in
      `packages/Entities` (shared, Caliber-visible): one value per question with the documented
      first-non-null precedence, all-null → **absent** (not null), and **case-folded** question-GUID
      comparison (the 0.4.0 defect class). **Test:** uppercase DB GUID matches lowercase client GUID;
      all-null answer is omitted.
- [ ] **P2.0-e — PG-parity harness for new tables.** Establish the `migrations-pg` pattern for
      Phase 2 up front so 2.1/2.2/2.3 tables ship SQL-Server + PG together (G5). Make JSONType /
      GUID-rendering **dialect-aware** (SQL Server uppercases uniqueidentifiers, PG lowercases — the
      case-fold in P2.0-d must not assume one side).

### Phase 2.1 — On-Submit Automation layer  *(foundation for binding; folds in `ON_SUBMIT_AUTOMATION_SPEC.md`)*

- [ ] `FormAutomation` + `FormAutomationRun` entities + migration (SQL Server **and** PG) + CodeGen.
- [ ] Snapshot: `DefinitionSnapshot` gains `automations[]`; extend `snapshot-builder.ts`,
      `snapshot-parser.ts`, and `PublishedFormDefinition` **in lockstep** (all three whitelist
      fields — miss one and config is silently stripped).
- [ ] Generic `FormAutomationRunner` (server): `Action` + `Agent` target types, parameter mapping
      (context/static/answers), conditions (reuse the §6 evaluator — do not reimplement), sync/async,
      per-automation `FormAutomationRun` observability.
- [ ] `Forms: Invoke Agent` reusable action (shared `invokeAgentForResponse` helper — one agent
      dispatch path).
- [ ] **Service principal** — seeded `Forms Automation Service` user + `Forms Automation Runner`
      role, config-resolved, **fail-closed** (never falls back to Owner/System). Settles ON_SUBMIT
      open decision #1 (see DG-7).
- [ ] **G1 back-fill** — seed the four current hooks as `FormAutomation` rows for every existing
      form; runner falls back to `ON_SUBMIT_ACTION_NAMES` only for pre-`automations` snapshots.
      **Parity test** proves seeded automations = legacy hook effects; **then** delete
      `ON_SUBMIT_ACTION_NAMES` / `fireOnSubmitHooks`.
- [ ] **Anti-abuse gate (G4)** — automations do not fire for responses failing
      Turnstile/quota/rate-limit/dedupe. **Test:** a spam-flagged submission fires zero automations.
- [ ] Builder "On Submit" tab skeleton (list/add/reorder/condition/param-map/activity; reuse
      drag-drop + `conditional-rule-editor`).
- [ ] Tests: runner ordering, condition-skip, sync/async, fail-open, param mapping, snapshot
      round-trip, back-fill parity.

### Phase 2.2 — Entity Binding v1 (the tracer bullet)  *(depends 2.0 + 2.1; folds in `ENTITY_BINDING_SPEC.md`)*

- [ ] `FormEntityBinding` + `FormEntityBindingRecord` (ledger, unique `(BindingID,
      FormResponseID)`) entities + migration (SQL Server **and** PG) + CodeGen. `FormAutomation`
      gains `EntityBinding` target type + `BindingID` FK + extended XOR CHECK.
- [ ] JSONType metadata on `FieldMappings` / `IdentityRule` / `MergePolicy` → typed accessors;
      shape validation in the `FormEntityBindingEntity` server subclass.
- [ ] `FormEntityBindingExecutor` — validate → ledger-check → canonicalize (P2.0-d helper) →
      identity (MatchEngine doctrine: `BypassCache`, `MaxRows 2`, prove-absence) → load-or-new →
      plan via `EntityFieldRules` dry-run → merge-policy filter → apply → record ledger. Runs under
      the P2.1 service principal. Re-verifies fileId provenance (P2.0-a) before copying a FileID FK.
- [ ] `Forms: Bind Response To Entity` wrapper action — **IDs only** (`BindingID`,
      `FormResponseID`), never payloads (5.51.0 writes `ActionExecutionLog.Params` unredacted).
- [ ] Target-entity **allow-list** (`mj.config.cjs` forms section) — validated at binding-save
      **and** at execution.
- [ ] **State-derived recovery sweep** + `MAX_BINDING_ATTEMPTS` (pending ≡ Complete response with
      an active binding but no ledger row / retryable-failed run under the cap). See DG-8.
- [ ] Snapshot: bindings ride `DefinitionSnapshot.automations[]` (same three-whitelist rule).
- [ ] Builder mapping UI (auto-map by name w/ confidence, type-compatibility hints, identity picker
      pre-seeded from `OrganicKeys`, per-field merge dropdown) + dry-run preview + activity view.
- [ ] **DoD:** a form binds to a `bizapps-common` Person **and** to one ATS-style entity with a
      File-FK column, end-to-end from an anonymous submission, with the ledger row, under the
      dedicated principal, **surviving a mid-execution process kill** (sweep re-drives idempotently).
- [ ] Tests (first-class — this is where silent data corruption lives): identity matrix
      (wrong-match refused, multi-match `Oldest` ordering, missing-identity skip/fail), merge-policy
      matrix (`neverBlank`/`latestWins`/`writeOnce`, absent-never-writes, empty-plan-no-Save),
      TSType coercion, idempotent replay → `Unchanged`, case-fold, allow-list enforcement (save +
      exec), config-vs-candidate error scoping.

### Phase 2.3 — First-class projection  *(feature A, preserved — was the old flat Phase 2 item 1)*

- [ ] `FormGroup` + `MaterializedEntityID`; `Form.FormGroupID` nullable FK.
- [ ] **View-projection** (default, lightweight, live, **no restart**) — generated denormalized
      SQL view per form/group, registered as an MJ entity.
- [ ] **RSU-materialization** (opt-in, admin-triggered, **batched**, gated by
      `ALLOW_RUNTIME_SCHEMA_UPDATE`, **never a per-submission hot path**) via `RuntimeSchemaManager`,
      column-evolved by `SchemaEvolution`.
- [ ] §8.2 reporting unlock (viewing system / query builder / dashboards / Skip over projected
      entities).
- [ ] Cross-reference note: projection reads OUT; binding writes IN; a materialized projection
      entity may become a binding target in Phase 3 (the A+B convergence point).

### Phase 2.4 — Remaining "Power" items  *(preserved verbatim from the old flat Phase 2)*

- [ ] Advanced question types (Matrix, Ranking, Address → bizapps-common, Signature, Payment,
      Calculated).
- [ ] LLM-judge scoring pipeline on free-text (`ScoringConfig`) — now expressible **as an
      automation** (Agent target) feeding `Score`/`ScoreRationale`, reusing 2.1 rather than a bespoke
      path.
- [ ] Review/approve-before-publish routing via **bizapps-tasks** (FormVersion status state
      machine + a "Form Approval" TaskType whose OnComplete/OnReject hooks call Forms actions).
      Note: the same hooks can invoke `Forms: Bind Response To Entity` (2.2) for approve-then-bind.
- [ ] Partial-response resume, advanced quotas, richer conditional logic.

### Phase 3 — Convergence & breadth  *(from `ENTITY_BINDING_SPEC.md` §12 Phase 3 + plan futures)*

- [ ] Overflow / unmapped-answer capture (optional JSON column target).
- [ ] Lookup-source mapping lines (FK-by-name, explicit `?create` opt-in).
- [ ] **Multi-binding ordering + cross-binding data flow** (binding B consumes binding A's created
      record ID) — the ATS write-graph seam; the first thing multi-entity intake needs.
- [ ] Webhook / notification automation target (Caliber's claim trigger becomes an ordinary
      on-submit automation).
- [ ] Question-generation **from** an entity's fields (invert the mapping).
- [ ] **RSU-materialized projection entity as a binding target** — the A+B convergence.
- [ ] Caliber/ATS adoption: Caliber deletes its intake layer and re-points `ExternalFormSchema`
      at the form's binding config (vocabularies are deliberately convergent → re-point, not migrate).

---

## 5. New Decision Gates (append to §10)

- **DG-7 — Automation/binding execution principal.** ✅ Recommended → dedicated `Forms Automation
  Service` user + role, config-resolved, fail-closed. Settles `ON_SUBMIT_AUTOMATION_SPEC` open
  decision #1; that spec's §7/§11 update when 2.1 starts.
- **DG-8 — Binding durability.** ✅ Recommended → state-derived recovery sweep with
  `MAX_BINDING_ATTEMPTS`-capped retries. Fire-and-forget stays for Action/Agent targets;
  EntityBinding is always sweep-covered.
- **DG-9 — Binding merge/identity vocabulary.** ✅ Caliber's verbatim (`neverBlank | latestWins |
  writeOnce`, oldest-first convergence, refuse-without-identity) so Caliber's migration is deletion.
- **DG-10 — Snapshot over live config** for automations + bindings (forced by question-GUID
  coupling anyway).
- **DG-11 — Reader-side file permission (open caveat).** At 5.51.0 `MJ: Files` read is flat/
  instance-wide; binding a resume to `Applicant.ResumeFileID` means anyone with CanRead on
  `MJ: Files` reads every file. Granting that to recruiters is a **documented deployment decision**,
  not something binding can scope. Must be surfaced to any ATS consumer.
- **DG-12 — File provenance model (needs a call in P2.0-a).** Shape of the session→fileId ledger
  that makes F-SEC-1's "re-verify before copying" buildable (`__mj.File` has no owner column).

---

## 6. Critical path & sequencing

```
0.3.0 ships ─▶ P2.0-a…e (parallel, small) ─▶ P2.1 automation layer ─▶ P2.2 binding v1
                                              (G1 back-fill guards the 4 hooks)
2.3 projection ─┐  (independent of 2.1/2.2 — can run in parallel once 2.0-e PG harness exists)
2.4 power items ─┘
Phase 3 convergence (A+B meet) ─ after 2.2 + 2.3
```

The one hard sequencing risk to flag in the Status Snapshot: **2.2 cannot be demonstrated until
2.1 exists**, and 2.1 is the entire (currently unbuilt, Draft-status) automation layer. The
"full layer" decision (binding spec §13 #1) accepts this consciously — the reconciliation just
makes the dependency explicit so the tracer-bullet isn't scheduled before its substrate.

---

## 7. Disposition of the two specs

`ON_SUBMIT_AUTOMATION_SPEC.md` and `ENTITY_BINDING_SPEC.md` remain the **detailed design of
record** and are linked from `FORMS_BUILD_PLAN.md` as design appendices. Their **task content**
(what to build, in what order) is superseded by §9 Phase 2 above — the plan stays the single
task-state source of truth, the specs stay the "why/how" detail. When 2.1 starts, update
`ON_SUBMIT_AUTOMATION_SPEC` §7/§11 to reflect DG-7 (dedicated principal, no longer "open").
