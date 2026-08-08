# Entity Binding — Implementation Guide

How the on-submit automation layer and entity binding actually work, how to configure one, and
what to check when one misbehaves.

This describes **what is built**. The design intent and the reasoning behind the decisions live in
[`plans/ENTITY_BINDING_SPEC.md`](../plans/ENTITY_BINDING_SPEC.md); where the two disagree, this
file is the one that matches the code. Section 9 lists what is specified but not yet built.

---

## 1. What it does

A form author declares *"submissions to this form create or update a record of entity X"*. On a
completed submission, MJ Forms maps the answers onto that entity's fields, decides whether this
submission belongs to a record that already exists, works out which values may be written, and
writes them — under a dedicated service principal, never under the anonymous respondent.

```
respondent submits
      │
      ▼
runSubmitPipeline ──► answers persisted (FormResponse + FormResponseAnswer)   ← source of truth
      │
      ▼  step 10, complete submissions only
snapshot has automations?
      │
      ├── no  ──► legacy hard-coded on-submit hook list (unchanged behaviour)
      │
      └── yes ──► planAutomations ──► runAutomations ──► dispatchAutomation
                                                              ├─ Action        → ActionEngineServer
                                                              ├─ Agent         → AgentRunner.RunAgent
                                                              └─ EntityBinding → executeBinding
                                                                                   │
                                                                                   ▼
                                                          target entity record + ledger row
```

Two properties are worth internalising before configuring anything:

- **The normalized answers are always the source of truth.** A bound record is derived. If a
  binding fails, the submission is untouched and can be re-driven later; nothing is lost.
- **Automations execute from the published snapshot, never from the live configuration rows.** A
  response answered against version 7 runs version 7's automations. Editing a binding does not
  change what already-submitted responses did, and **does not take effect until the form is
  republished**. This is the single most common surprise.

---

## 2. The three tables you configure

| Table | Entity name | What it holds |
|---|---|---|
| `FormEntityBinding` | `MJ_BizApps_Forms: Form Entity Bindings` | The target entity, the field mapping, the identity rule, the merge policy |
| `FormAutomation` | `MJ_BizApps_Forms: Form Automations` | What runs on submit, when, in what order — one row per automation, pointing at an Action, an Agent, or a binding |
| `FormAutomationRun` / `FormEntityBindingRecord` | `…: Form Automation Runs` / `…: Form Entity Binding Records` | Written by the runtime. Run history and the identity ledger — you read these, you do not author them |

`FormAutomation.TargetType` is `Action | Agent | EntityBinding`, and a CHECK constraint enforces
that the matching id column is the one populated — a row claiming `Action` while pointing at a
binding cannot be saved.

---

## 3. Configuring a binding

Three JSON columns on `FormEntityBinding`. Every parser **refuses** what it does not understand
rather than falling back to a default, because the failure mode of a silent default here is a
field that quietly stops updating.

### 3.1 `FieldMappings`

```jsonc
{
  "version": 1,
  "fields": [
    { "targetField": "Email",     "source": { "kind": "question", "questionId": "ae1ff634-…" }, "required": true },
    { "targetField": "FirstName", "source": { "kind": "question", "questionId": "17b03d45-…" } },
    { "targetField": "LastName",  "source": { "kind": "static",   "value": "(unknown)" } }
  ]
}
```

- `questionId` is the **FormQuestion GUID** — the one identifier stable across transport, snapshot
  and storage. Casing does not matter; it is folded on both sides.
- `required: true` means a submission that does not answer it is refused outright rather than
  producing a half-written record. A blank counts as missing for a required field.
- Duplicate `targetField` entries are rejected.
- **Watch for NOT NULL columns.** A mapping that omits one can merge into an existing record but
  can never create one, and you will see `candidate: Writing to "…" failed: … cannot be null`. A
  static source is the usual fix.

### 3.2 `IdentityRule`

```jsonc
{
  "mode": "MatchThenCreate",
  "match": [ { "targetField": "Email", "normalize": "LowerCaseTrim" } ],
  "scope": [ { "targetField": "CompanyID", "value": "05f0…" } ],
  "onMultipleMatch": "Oldest",
  "onMissingIdentityValue": "Skip"
}
```

| Mode | Behaviour |
|---|---|
| `AlwaysCreate` | Every submission creates a record; no lookup. Cannot carry `match`. |
| `MatchThenCreate` | Look for an existing record; create when none matches. |
| `MatchOrSkip` | Look for an existing record; record a skip when none matches. Never creates. |

- `normalize` is `LowerCaseTrim | Trim | ExactMatch`. Applied to **both** the column and the value,
  so a match does not depend on database collation.
- `scope` entries are constants ANDed into the lookup **and** stamped on create — tenant scoping.
  They are never rewritten on update.
- Every `match.targetField` must also be a mapping target. If it is not, the binding is refused as
  a config error, because otherwise the value is never produced and every submission skips forever
  while looking like ordinary data quality.
- There is **no default identity field**. Guessing that a field called "email" is the identity is
  right often enough to be dangerous and wrong exactly where it is unrecoverable.

### 3.3 `MergePolicy`

```jsonc
{ "default": "neverBlank", "fields": { "Notes": "latestWins", "Source": "writeOnce" } }
```

| Rule | Behaviour on an existing record |
|---|---|
| `neverBlank` *(default)* | Writes a real value; never replaces an existing value with a blank |
| `latestWins` | Writes whatever came in — **the only rule that can clear a field** |
| `writeOnce` | Fills a blank; never overwrites an existing non-empty value |

Rules that are structural and not configurable:

- **Absent is not empty.** A question the form never asked can never write anything, under any
  rule. A question that was asked and answered blank is *present*, and the rule decides whether
  that blank may clear. This is what stops a short form silently erasing what a longer one
  collected.
- **Identity and scope fields are immutable on update.** Rewriting the field a record was matched
  on is not an edit, it is a claim that this is now a different person.
- **An empty plan means no save.** A replay does not stamp `__mj_UpdatedAt` or fabricate a
  record-change row; the outcome is `Unchanged`.
- `0` and `false` are answers, not blanks.

---

## 4. Making it run

A binding only executes if a `FormAutomation` row points at it **and** the form has been
republished so the snapshot carries it.

```jsonc
// FormVersion.DefinitionSnapshot gains:
"automations": [
  { "id": "…", "name": "Create CRM Lead", "targetType": "EntityBinding", "bindingId": "…",
    "trigger": "OnComplete", "executionMode": "Sync", "displayOrder": 1,
    "continueOnError": true, "isActive": true }
]
```

- `trigger`: `OnComplete` (default) | `OnPartial` | `OnCompleteOrPartial`.
- `executionMode`: **`Sync` automations run first**, in `displayOrder`, each awaited — so a later
  one can depend on what an earlier produced. `Async` ones are dispatched and not waited for.
  A binding whose record another automation needs must be `Sync`.
- `conditionalRule`: the same rule JSON used for question show/hide. A suppressed automation is
  recorded as `Skipped`, not dropped, so "it didn't fire because they answered No" is visible.
- `continueOnError: false` halts the remaining **Sync** automations for that response.

---

## 5. Operations

| Setting | Purpose |
|---|---|
| `FORMS_AUTOMATION_USER` | Name of the user automations run as. Default `Forms Automation Service`. |
| `FORMS_BINDING_ALLOWED_ENTITIES` | Comma-separated entities bindings may write. Unset = unrestricted; **set-but-empty = permit nothing.** |
| `FORMS_RATELIMIT_MAX` | Submissions per minute per session/distribution (default 5). Raise it for load or smoke runs. |

**The service principal fails closed.** If the configured user does not exist or is inactive, *no
automations run at all* and a log line says so. There is deliberately no fallback to the system
user: that would restore the broad grants a dedicated principal exists to avoid, on a fresh
deployment where the seed had not run, with nobody watching.

Provisioning it is a deployment step:

1. The role `Forms Automation Runner` and its grants on the Forms-owned entities ship as mj-sync
   metadata (`metadata/roles`, `metadata/entity-permissions`).
2. **You create the user and grant it on the binding target entities.** That grant set is the real
   ceiling on what a form author can reach, and it is not this app's to choose for you. The
   allow-list above is the second, narrower gate — it can be checked at authoring time, whereas the
   grant is enforced by the database and cannot be bypassed.

---

## 6. Observability

Two tables, two jobs.

- **`FormAutomationRun`** — one row per attempt: `Pending | Running | Succeeded | Failed | Skipped`,
  with `AttemptCount`, `ErrorMessage`, and links to MJ's own `ActionExecutionLog` / `AIAgentRun`.
- **`FormEntityBindingRecord`** — the identity ledger: which record a submission produced, with
  `Outcome` (`Created | Merged | Unchanged | Skipped`), `TargetRecordID` (pipe-joined for a
  composite key) and `WrittenFields`. Unique on `(BindingID, FormResponseID)` — the database-level
  guard against a double execution. Written on **every** outcome including a skip, so "considered
  and produced nothing" is a fact rather than an absence.

Error messages carry their **scope**, which tells you who has to fix it:

| Prefix | Meaning |
|---|---|
| `config:` | Broken for every submission — an author or operator must fix it. Never retried. |
| `candidate:` | About this one response. Retried if the cause was transient. |

**Recovery.** Failed runs with attempts remaining are re-driven by `sweepFailedAutomations`, capped
at `MAX_BINDING_ATTEMPTS` (5). Pending work is derived from state — a `Failed` run row *is* the
work item — so a crash is recovered by a query rather than by replaying a queue. `config:` failures
are never retried; a run with no recorded message is, because that is what a crash between opening
and closing a run leaves behind.

---

## 7. Testing

```bash
npm test                                   # 595 unit tests, no database
npm run smoke:binding:seed                 # seed a live binding (dev DB only)
npm run smoke:binding                      # 5 real submissions, then verify the database
npm run smoke:respondent -- <slug>         # the public path, unchanged
```

Both smoke scripts need `set -a && . ./.env && set +a` first, MJAPI running, and the raised rate
limit (`FORMS_RATELIMIT_MAX=200 npm run start:api`) because the binding test submits five times in
a row.

The binding smoke test asserts the invariants whose failure is *silent*: a repeat submission merges
into the same record rather than duplicating, an uppercase email matches the same person, an
identical resubmission writes nothing, and the ledger's `TargetRecordID` actually joins to the row
it names. A green unit suite is necessary and not sufficient — version 0.2.1 shipped with the
public path completely broken and every unit test passing.

---

## 8. Code map

| Concern | File |
|---|---|
| Answer collapse + GUID folding | `packages/Entities/src/contracts/answer-canonical.ts` |
| Binding config types + parsers | `packages/Entities/src/contracts/entity-binding.ts` |
| Mapping + merge planning (pure) | `packages/Entities/src/contracts/entity-binding-merge.ts` |
| Which automations run, in what order | `packages/Server/src/public-submit/automation-plan.ts` |
| Carrying out a plan | `packages/Server/src/automation/automation-runner.ts` |
| Dispatch by target type + bookkeeping | `packages/Server/src/automation/dispatch-automation.ts` |
| Binding policy (validate → identity → merge → write) | `packages/Actions/src/custom/binding/binding-executor.ts` |
| The MJ I/O behind that policy | `packages/Actions/src/custom/binding/mj-binding-gateway.ts` |
| `Forms: Bind Response To Entity` action | `packages/Actions/src/custom/binding/bind-response-to-entity.action.ts` |
| Recovery sweep | `packages/Server/src/automation/recovery-sweep.ts` |
| Builder "On Submit" tab | `packages/Angular/src/lib/builder/automation-tab.component.ts` |
| Service principal, allow-list, sweep | `packages/Server/src/automation/{service-principal,allowed-entities,recovery-sweep}.ts` |

The split that matters: **policy is testable without a database, I/O is not**. Everything in
`binding-executor.ts` runs against a `BindingTargetGateway` interface, because the decisions that
quietly corrupt data are the ones that need exhaustive tests and are impractical to exercise live.

---

## 9. Not built yet

- **File answers into File-FK columns — REFUSED, not merely undone.** `__mj.File` rows carry no
  owner, so a submitted fileId proves the file exists, not that this respondent uploaded it, and
  copying one onto a record other users can read is cross-tenant disclosure. The executor now
  refuses any mapping whose value came from a file answer, as a config-scoped failure. The switch
  to flip when upload provenance becomes verifiable is `ExecuteBindingInput.allowFileAnswers` —
  deliberately a parameter rather than a constant, so the guard has one greppable place to be
  turned on instead of being deleted from the middle of the executor. Needs the provenance ledger
  (F-SEC-1 / decision DG-12a, `plans/UPLOAD_PROVENANCE_LEDGER_SPEC.md`); the recommendation on the
  table is that the upload endpoint elevates and the anonymous role holds no grants at all, because
  a ledger the anonymous role can write is not a ledger.
- **Deleting the legacy hook list.** The four hard-coded on-submit actions still run for any form
  that configures no automations, and dispatch is all-or-nothing — so the builder now seeds
  equivalents for all four the first time a form configures anything, making the cutover per-form
  and visible rather than a silent regression. `legacy-automation-parity.spec.ts` holds the
  assertions that must pass before `ON_SUBMIT_ACTION_NAMES` can be removed; what remains is a
  migration seeding those rows for forms that already exist.
- **Builder editing.** The On Submit tab creates bindings and lists what is configured; it does not
  yet edit or delete an existing one, reorder automations, or run the dry-run preview the spec
  describes. Changing a binding today means editing the row.
