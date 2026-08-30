# Adopting MJ's Entity Action workflow extensions

> **Status:** ✅ **Unblocked upstream — but the first step here is a decision, not metadata.**
> Was a tracking doc; the MJ work has landed and this repo's own on-submit layer has shipped
> since. See §2 and §5.
> **Upstream:** MemberJunction/MJ **[#3408](https://github.com/MemberJunction/MJ/pull/3408)** —
> merged (`0b5a1afe8`), engine in `927b4832b`, durable dispatch in `b4bd4b751`. Design plan:
> [`plans/entity-action-workflow-extensions.md`](https://github.com/MemberJunction/MJ/blob/next/plans/entity-action-workflow-extensions.md).
> **Sibling analysis:** `bizapps-common` `plans/mj-entity-action-workflow-adoption.md` is the
> family-level version of this document. Terminology here follows it; where it states a rule, this
> file points at it rather than restating it.
> **Verified against the MJ tree 2026-08-30.** Every claim below carries the file it was read from.

---

## 1. What MJ core now provides

`EntityAction` — MJ's generalized hook for running an Action off an entity's
create / update / delete / validate — is now the **workflow-hook substrate for every app on the
platform**, so no app needs to invent its own.

The invocation semantics matter more than the schema suggests, and **getting them backwards fails
silently**:

| Invocation | Where it fires | Semantics |
|---|---|---|
| `Validate` | `OnValidateBeforeSave` | **A real blocking gate** — a non-`Success` result fails the save |
| `Before*` | `OnBeforeSaveExecute` | Awaited, **result discarded — cannot veto** |
| `After*` | `OnAfterSaveExecute` | Asynchronous; `Inline` by default, `Durable` opt-in — see §1.2 |

> ### 🚨 `Before*` CANNOT REFUSE A SAVE. Do not use one as a gate.
>
> This is the single easiest thing to get wrong here, because `BeforeCreate` reads like the natural
> place to put an acceptance rule and it is not one. In
> `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts`:
>
> - **`OnValidateBeforeSave` (line 600)** collects the results, filters `!v.Success`, joins their
>   messages and returns the string. `databaseProviderBase.ts:1413` turns a non-null return into
>   `Success = false` and `return false` — the save is refused. **This is the gate.**
> - **`OnBeforeSaveExecute` (line 612)** does `await this.HandleEntityActions(entity, 'save', true, …)`
>   and **discards the returned array**. A `Before*` action that returns failure delays the save and
>   changes nothing else.
> - **`OnAfterSaveExecute` (line 630)** calls `HandleEntityActions` with an explicit
>   `// NO AWAIT INTENTIONALLY`.
>
> A rule that must be able to say *no* is bound to **`Validate`**. Anywhere else it is decoration.

And because **`Execute Agent` is just an Action**, any binding can already run an agent — a
deterministic **flow agent** (visual editor, `Action`/`Prompt`/`Sub-Agent`/`ForEach`/`While` steps,
per-step retry and error behaviour) or a **loop agent** where judgement is genuinely needed. The
house shape is a flow agent with a `Sub-Agent` step calling a loop agent.

**Authoring is pure metadata** — `metadata/entity-actions/`, with `relatedEntities` for invocations,
filters and params. No schema and no code in the consuming app. (MJ's own `metadata/entity-actions/`
is the worked example.)

### 1.1 What shipped, confirmed in the merged tree

- **`EntityAction.ScopeEntityID` + `ScopeRecordID`** — bind a workflow to *one configuration record*
  rather than to every record of an entity. `NULL` (both, enforced by `CK_EntityAction_Scope`) means
  "every record", which is the pre-existing behaviour. This is the important one: **no app ever
  grows a column per type per event**, and a configuration record can surface "the workflows bound
  to me" as a real relationship instead of something buried in filter code.
- **`EntityAction.Sequence`** — deterministic ordering when several bindings share an event
  (default `0`, lower runs first).
- **`EntityActionParam.ValueType = 'Entity Object Data'`** — passes `entity.GetAll()` instead of the
  live `BaseEntity`. Use it for anything that serializes, above all `Execute Agent`'s `Data` payload:
  a `BaseEntity` serializes to `{}` because its fields are getters, so the agent silently receives
  an empty payload with no error anywhere.
- **`EntityAction.RunMode`** (`'Inline' | 'Durable'`, default `Inline`) — see §1.2.
- **`EntityAction.LoggingMode`** (`All` / `FailuresOnly` / `None`) and a per-binding
  `EntityActionParam.LogValue`, on top of a **hard rule**: a param whose `ValueType` is
  `Entity Object` or `Entity Object Data` is **never** written to `ActionExecutionLog.Params`,
  whatever the settings say. This matters here more than in most repos — a `FormResponse` payload is
  respondent-supplied personal data by construction.

All of the above are visible in the generated ORM (`MJEntityActionSchema` /
`MJEntityActionParamSchema` in `packages/MJCoreEntities/src/generated/entities/__mj.ts`) and in
`migrations/v6/V202608042200__v6.1.x__EntityAction_Workflow_Extensions.sql` /
`V202608081200__v6.1.x__Durable_EntityAction_Dispatch.sql`.

### 1.2 Durability is **opt-in**, not automatic — correcting an earlier claim

The design plan said `After*` would be **routed through `QueueManager`** so failures became durable
and retryable. **That is not what shipped, and this document previously repeated it.**

What shipped is **`EntityAction.RunMode`, defaulting to `Inline`**, with the durable path behind a
seam (`packages/Actions/Base/src/DurableEntityActionSubmitter.ts`, honoured at
`packages/Actions/Engine/src/entity-actions/EntityActionInvocationTypes.ts:208`). Its own header
gives the reasoning: durability costs a Task row per dispatch, a dispatcher hop of latency, and it
persists the action's parameters at rest, so charging every installation for that silently would be
a large unasked-for change.

**The consequence is the part to internalise:** an `After*` binding left at the default is
**fire-and-forget — a failure is logged and swallowed**, which at the call site is indistinguishable
from success. Anything that must not be lost sets `RunMode = 'Durable'` deliberately, per binding.
`Validate` and `Before*` ignore `RunMode` entirely; deferring work that decides whether a save
succeeds is a different feature, not durability.

### 1.3 Scope resolution has a seam, and it **fails closed**

The framework **stores and filters on the `ScopeEntityID`/`ScopeRecordID` pair; it does not
interpret it** (`packages/Actions/Base/src/EntityActionScopeResolver.ts`). *How* a scope record
relates to a subject record is answered by a `@RegisterClass`-resolved resolver keyed on the scope
entity name. The default implementation walks the subject entity's foreign keys for one pointing at
the scope entity, and **declines (`null`) when there is no such key, or more than one**.

`IsEntityActionInScope` treats an undecidable scope as **not applicable** — the binding does not
run — on the stated grounds that a workflow which doesn't fire is visible while one that fires on
every record is a production incident. Correct, and the trap it creates for us is in §3.

### 1.4 The two reusable `ActionFilter`s were **not** seeded — open question

The design plan called for two seeded reusable filters, **"field changed"** and **"field changed
*to* value"**, so transition detection stops being hand-rolled. This document previously listed them
as shipped.

**Searched and did not find them (2026-08-30):** no `ActionFilter` seed rows in `migrations/v6/**`,
and MJ has no `metadata/action-filters/` directory. What *did* ship is the machinery underneath
them — `EntityChangeContext` is captured by the dispatcher before the save's first `await`, and
every filter body is evaluated with `ActionFilterContext.DidFieldChange(field)` and
`DidFieldChangeToValue(field, value)` in scope
(`packages/Actions/Engine/src/generic/ActionEngine.ts:70`, `:79`, bound at `:429`–`:430`).

So a transition filter is a **one-line `ActionFilter` row you author**, not a row you reference:
`return ActionFilterContext.DidFieldChangeToValue('Status', 'Complete')`. That is a much smaller ask
than hand-rolling detection, but it is not nothing, and every app will write the same two rows.

> **Open question (§6, Q1):** does Forms author its own two filter rows, or does this repo join
> `bizapps-common`'s upstream ask for MJ to seed them? Consistent with common's §9 — the answer is
> the same one for the whole family and is not ours to pick alone.

### 1.5 Version floors — the manifest currently permits an MJ without `RunMode`

Measured against the MJ release tags:

| Feature | First release containing it |
|---|---|
| `ScopeEntityID` / `ScopeRecordID` / `Sequence` / `'Entity Object Data'` | `6.1.0-edge.1` |
| `RunMode` / durable dispatch | `6.1.0-edge.2` |

`mj-app.json` declares `"mjVersionRange": ">=6.1.0-edge.1 <7.0.0"`, which satisfies the first row and
**not** the second. A host at exactly `edge.1` would accept a binding carrying `RunMode = 'Durable'`
and run it inline, silently. If any binding here depends on durability, the floor moves with it.

---

## 2. What this means for MJ Forms

Forms is one of the strongest fits in the family, because **scope binding maps exactly onto how
forms are actually used**: different forms need different things to happen on submit.

**But the ground has moved since this doc was written.** Forms no longer *plans* an on-submit Action
layer — it has **shipped one**: `FormAutomation`, `FormAutomationRun`, `FormEntityBinding` and
`FormEntityBindingRecord` (`migrations/V202608072330__v0.8.x__Automation_And_Entity_Binding.sql`,
spec now at `plans/done/ON_SUBMIT_AUTOMATION_SPEC.md`). `FormAutomation` is already per-form, already
dispatches to an Action, an Agent or an EntityBinding, and already carries `Trigger`,
`ExecutionMode`, `DisplayOrder`, `ConditionalRule`, `ParameterMapping`, `ContinueOnError` and
`TimeoutMS`, with `FormAutomationRun` as the retry watermark and observability record.

That changes the question this document is asking. It is no longer *"should Forms adopt EntityAction
instead of building something"* — the thing is built, in production shape, with a runner and a run
ledger. It is *"where does `EntityAction` reach something `FormAutomation` structurally cannot, and
is that worth a second mechanism?"* §5 puts that decision where it belongs rather than answering it.

Where `EntityAction` genuinely reaches further, and `FormAutomation` does not:

- **Entities other than `FormResponse`.** `FormAutomation.FormID` binds it to a form's submissions.
  A `FormVersion` lifecycle hook has no home there.
- **A real blocking gate.** `FormAutomation` runs after persistence (§4); `Validate` runs inside the
  save and can refuse it.
- **Bindings authored outside the form builder** — by another app, or by an administrator against a
  configuration record rather than a form.

## 3. Candidate bindings

Corrected against the shipped schema. The `Work` column follows §7's rule; `RunMode` is a required
decision per §1.2, not a default to inherit.

| Entity + invocation | Scope | Work | `RunMode` | Purpose |
|---|---|---|---|---|
| `FormResponse` · `AfterUpdate`, filtered `Status` **changed to** `Complete` | a **`Form`** | Flow agent | Durable | The headline case — route, score, notify, create records. See the note below on why this is not `AfterCreate`. |
| `FormResponse` · `AfterCreate`, filtered `Status = Complete` | a **`Form`** | Flow agent | Durable | The other half of the same case: a single-shot submit that is born `Complete`. |
| `FormResponse` · `Validate` | a `Form` | Action | n/a | Per-form acceptance rules an administrator authors — **not** the hardening layer, which has shipped as code (§4). |
| `FormVersion` · `AfterUpdate`, filtered status **changed to** review | a `Form` | Action | Durable | The publish-approval routing into bizapps-tasks that Phase 2 anticipates. |
| ~~`FormResponse` · `AfterCreate` scoped to a `FormGroup`~~ | — | — | — | **Removed — `FormGroup` does not exist.** See below. |

**Why the headline binding is `AfterUpdate`, not `AfterCreate`.** A public submission does not
usually arrive as a create. `FormResponse.Status` defaults to `'Partial'`
(`migrations/B202606281200__v0.1.x_Schema_and_Tables.sql`), and
`packages/Server/src/public-submit/persistence.service.ts` is explicit that the write is one of
**CREATE, UPDATE, or PROMOTE partial→complete**: a completion that follows an autosave is an
**update** to an existing row. An `AfterCreate` binding would fire on the first keystroke-triggered
autosave and never on the completion. Both rows above are needed to cover both paths, and both need
the transition filter of §1.4 — without it `AfterUpdate` fires on **every** autosave, and a filter
written as "status *is* Complete" re-fires on every later save of the same row.

**`FormGroup` is a Phase-2 entity that does not exist yet.** The baseline migration says so in its
own header comment. The row is removed rather than left as aspiration, and if it lands there is a
trap attached: `FormResponse` would reach a `FormGroup` through `Form`, not directly, so the default
foreign-key walk finds no candidate, declines, and **`IsEntityActionInScope` fails closed — the
binding silently never fires** (§1.3). A `FormGroup`-scoped binding requires Forms to register an
`EntityActionScopeResolver` for that entity. Noted here so it is designed in rather than debugged.

**`Form`-scoped bindings need no registration.** `FormResponse.FormID` is the single foreign key
from `FormResponse` to `Form`, so the default walk resolves them with nothing registered. That is
the case the mechanism was built for, and it is ours.

## 4. Notes specific to this repo

**⚠️ The public-write hardening layer has shipped — `Validate` is no longer where it belongs.**
This document previously argued that Turnstile, rate limiting, quota and dedupe were *per-form
policy* best expressed as a `Validate` binding. They are now **code, and they refuse at the door**:
`packages/Server/src/public-submit/submit-pipeline.ts` runs scope check → definition → rate-limit →
Turnstile → disqualification → dedupe → quota → re-validation → file provenance, **and only then**
persists (each with its own service module). A `Validate` EntityAction fires from
`BaseEntity.Save()` — strictly later, inside a save the pipeline has already decided to attempt, and
on *every* save of a `FormResponse` including each partial autosave. Re-expressing a shipped
door-gate as a save-gate would be a second enforcement point that is weaker and fires more often.

What a `Validate` binding is still genuinely good for is the residue: **per-form acceptance rules an
administrator authors as configuration** — an eligibility predicate, a business-level duplicate rule,
a cross-record constraint — which the pipeline's fixed gates do not express and which must be able
to refuse. Those belong on `Validate` and nowhere else (see the §1 warning box).

**Scope binding may simplify the existing design — but the existing design is now built.** Forms'
`FormAutomation` and an `EntityAction` scoped to a `Form` do substantially the same job for the
on-submit case. `FormAutomation` is more ergonomic inside the form builder and owns its run ledger;
`EntityAction` reaches entities and authors the builder never will (§2). Keeping both is defensible.
Building a *third* path is not — and note that **`FormAutomation` is already the second**, so the
next mechanism added here is the third.

**Synchronous work runs inside the caller's transaction.** `FormAutomation` already draws this line
(`ExecutionMode` `Sync`/`Async`); `EntityAction` draws it at `Validate`/`Before*` versus `After*`.
They are the same line and should be reasoned about together, not separately.

**The `FormResponse` → identity flow is a natural `LogActivity` target.** With the Activity spine
landed in `bizapps-common`, a form submission can write a timeline entry against the respondent's
Person record through a binding rather than through code. Note common's own §3.1: **`Common.LogActivity`
does not exist yet**, so this is downstream of common's first deliverable, not available today.

---

## 5. What to do now

The upstream blocker is gone, so "nothing" is no longer the answer — but the next step is a decision,
not a metadata file. In order:

1. **Answer Q2 in §6** — does Forms adopt `EntityAction` at all, given `FormAutomation` shipped? Everything
   below is void if the answer is no.
2. If yes: **confirm the §3 bindings** against the current schema, and settle Q1 (the transition filters)
   with the family rather than locally.
3. **Raise `mj-app.json`'s `mjVersionRange` floor to `>=6.1.0-edge.2`** if any binding uses
   `RunMode = 'Durable'` (§1.5).
4. Author the surviving bindings as metadata under `metadata/entity-actions/`.
5. Build the flow agents they dispatch to.
6. Delete this file, or fold it into `plans/FORMS_BUILD_PLAN.md`.

## 6. Open questions — for a human, not for a builder

**Q1 — the transition filters (§1.4).** MJ did not seed the "field changed" / "field changed to
value" `ActionFilter` rows, though the helpers they would use are shipped. Does Forms author its own
two rows, or join `bizapps-common`'s upstream ask (its §9) for MJ to seed them family-wide? Do not
hand-roll transition detection per binding either way.

**Q2 — one mechanism or two (§2, §4).** `FormAutomation` shipped after this document was written and
covers the on-submit case per form. Adopting `EntityAction` as well is defensible for what it reaches
that `FormAutomation` cannot, and is a second thing to own. **This is the load-bearing decision in
this document and it is deliberately not made here.** If the answer is "EntityAction only where
`FormAutomation` structurally cannot go", §3 shrinks to the `FormVersion` row and the `Validate` row.

**Q3 — the `mjVersionRange` floor (§1.5).** Raising it to `>=6.1.0-edge.2` narrows the hosts that can
install Forms. Worth doing for `Durable`, or is `Inline` acceptable for everything proposed here?

## 7. Rules to carry into the design

- **A gate is `Validate`. Never `Before*`.** `Before*` is awaited and its result discarded — binding
  a rule there removes it while looking like it enforces it (§1, box).
- **`RunMode` is a decision, not a default.** Anything that must not be lost is `Durable`; the
  default is fire-and-forget with a swallowed failure (§1.2).
- **A scoped binding fails closed.** If the resolver cannot decide, the workflow silently does not
  run. Verify the scope entity is reachable by a single foreign key, or register a resolver (§1.3).
- **Synchronous bindings should be Actions, never agents.** `Validate` and `Before*` run inside the
  caller's transaction. A loop agent's duration is unbounded and holding a transaction open for it
  is not acceptable. Agents belong on `After*`, which is async.
- **A flow agent should create human work and finish** — it should not hold a run open waiting for
  a person. Use `MJ: AI Agent Requests` when the answer resumes the same run (minutes to hours), and
  a **bizapps-tasks** Task when it is durable, assignable work someone owns (days to weeks).
- **`'Entity Object Data'` for anything that serializes** — a `BaseEntity` yields `{}`, silently
  (§1.1).
- **Respondent payloads are personal data.** Whole-record params are never logged by rule, but a
  binding that passes answers through an ordinary `Text` parameter needs `LogValue = 0` set
  explicitly (§1.1).

---
_Generated by [Claude Code](https://claude.ai/code)_
