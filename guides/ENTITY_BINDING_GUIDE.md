# Entity Binding — Implementation Guide

How the on-submit automation layer and entity binding actually work, how to configure one, and
what to check when one misbehaves.

This describes **what is built**. The design intent and the reasoning behind the decisions live in
[`plans/done/ENTITY_BINDING_SPEC.md`](../plans/done/ENTITY_BINDING_SPEC.md); where the two disagree, this
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
npm run smoke:provenance                   # a second session cannot claim your upload
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
| Upload provenance | `packages/Server/src/upload/upload-provenance.service.ts` |
| Builder "Automate" tab | `packages/Angular/src/lib/builder/automation-tab.component.ts` |
| Service principal, allow-list, sweep | `packages/Server/src/automation/{service-principal,allowed-entities,recovery-sweep}.ts` |

The split that matters: **policy is testable without a database, I/O is not**. Everything in
`binding-executor.ts` runs against a `BindingTargetGateway` interface, because the decisions that
quietly corrupt data are the ones that need exhaustive tests and are impractical to exercise live.

---

## 9. File answers and upload provenance

A file answer can be mapped onto a `File`-FK column, and it is safe because the file id is proved
to be the respondent's own before it is written anywhere.

`__mj.File` has no owner column and no row-level security, so the foreign key on a submitted
`fileId` establishes only that the file exists. Without a second source of truth, one respondent
could name another's upload — or any file in the instance — and a binding would copy it onto a
record other people can read. `FormUpload` is that source of truth: the upload endpoint writes one
row per upload recording the distribution, the form, the question, and the client-minted response
id the upload was made for.

**Who writes it (decision DG-12a): the upload endpoint, elevated.** Not the anonymous respondent.
Granting the anonymous role `CanCreate` on the ledger would let a session mint its own provenance
row through the generated GraphQL `CreateRecord` mutation and have the check confirm the forgery —
a ledger the caller can write proves nothing. Elevating is also *less* privilege than before: the
anonymous role holds no `MJ: Files` grant, so the upload was failing default-deny on a clean
install (F-SEC-2), and moving the File write to the endpoint's principal fixes that without giving
the anonymous internet the ability to create File rows.

The correlation key is the **client-minted response id**, not the session id, because the anonymous
session id is legitimately blank in ordinary public-link flows — keying on it alone would leave a
real share of honest uploads unattributable. The widget sends it with every upload.

Verification happens twice. At **submit**, before answers persist, so a foreign id never reaches the
database. At **bind**, again, because a response persisted while the check was lenient must not
become writable onto a business record just because a binding was added later. Failure modes:
`unknown-file` (never came through the endpoint), `revoked`, `wrong-distribution`, `unattributable`.

`FORMS_UPLOAD_PROVENANCE=lenient` admits only the *unattributable* case, for a rollout window where
older widgets do not yet send the response id. It is not an off switch — a foreign, revoked or
unknown file is refused in either mode. Default is strict.

**The bind-time check is strict regardless of that setting.** Lenient exists so a rollout does not
reject a respondent mid-submission; it is not a reason to copy an unattributable file onto a
business record later, when nobody is waiting and refusing costs nothing. Both check-points call
the same `evaluateProvenance`, via `everyFileIsAttributable` — an earlier bind-time version
compared only the distribution, which on a public form anyone can open means "was this uploaded by
anybody at all".

---

## 10. Not built yet

- **Deleting `ON_SUBMIT_ACTION_NAMES`.** The constant is still the fallback for a form that has no
  automations at all, which is correct — those forms behave exactly as they always did. Everything
  needed to remove it is in place: the builder seeds equivalents the moment a form configures
  anything, `V202608081400__Backfill_Legacy_Automations.sql` seeds them for forms that already
  existed, and `legacy-automation-parity.spec.ts` holds the assertions that make the removal safe.
  What remains is the decision to cut over, which is deliberately a human one.
- **Editing a saved binding's mapping.** The tab can disable, reorder and remove automations, and
  preview a mapping before saving it, but changing the field mapping of a binding that already
  exists means editing the row. Re-adding is the current path.
- **PostgreSQL identity lookups.** `sqlLiteral` takes a dialect and defaults to SQL Server, and no
  caller passes anything else — there is no runtime dialect detection. The `N'…'` prefix it emits
  is rejected by PostgreSQL, so every `MatchThenCreate` / `MatchOrSkip` lookup would fail on a
  PostgreSQL-backed deployment. `AlwaysCreate` bindings, which never run a lookup, are unaffected.
  Wiring dialect detection through the gateway is the prerequisite.
