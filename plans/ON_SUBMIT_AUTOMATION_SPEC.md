# On-Submit Automation — Design Spec

**Status:** Draft for review · **Author:** (spec) · **Date:** 2026-07-01
**Fulfills:** FORMS_BUILD_PLAN §3 ("On-submit automation via MJ Actions & Agents — free"),
§4 submission path step 8, §9 (generalizes the three Phase-1 on-submit hooks).

> Goal: replace the hardcoded three-action on-submit hook with a **generic,
> metadata-driven automation layer** that lets a form author configure, per form, an
> ordered set of **MJ Actions and/or MJ Agents** to run when a response is
> submitted — with conditions, parameter mapping, and observability — using MJ's
> existing Action/Agent/Prompt infrastructure rather than a bespoke workflow engine.

---

## 1. Where we are today (the gap)

`packages/Server/src/public-submit/on-submit-hooks.service.ts` fires a **compile-time
constant** list for **every** complete submission on **every** form:

```ts
export const ON_SUBMIT_ACTION_NAMES = [
  'Forms: Upsert Respondent Person',
  'Forms: Send Confirmation Email',
  'Forms: Create Followup Task',
] as const;
```

`runSubmitPipeline()` (step 8) calls `fireOnSubmitHooks(ctx, contextUser)`, which loops
the array, resolves each via `ActionEngineServer.GetActionByName`, and runs it with a
fixed param set (`FormResponseID`, `FormID`, `FormVersionID`, `DistributionID`) built by
`buildHookParams`. Best-effort: a hook failure is logged and swallowed; the submit still
succeeds.

**What's missing for the plan's vision:**
1. **Per-form configuration** — every form runs the same three actions; you can't add,
   remove, reorder, or disable per form.
2. **Agents** — the plan explicitly says "route to an agent"; today only named Actions fire.
3. **Conditions** — no "only email if they opted in" / "only create a task if NPS ≤ 6".
4. **Parameter mapping** — actions get four fixed context ids; you can't bind an action
   input to a specific answer or set static config.
5. **Execution semantics** — everything runs inline, unconditionally best-effort; no
   sync-vs-async choice, no per-automation observability record.
6. **Privilege model** — hooks run under the **anonymous respondent** `contextUser`, whose
   scope is `CanCreate` on responses only. Privileged side effects (upsert Person, create
   Task) therefore either over-grant the Form Respondent role or fail. See §7.

---

## 2. Design principles

- **Metadata, not code.** Which automations run is data (entities + mj-sync seed), executed
  by one generic runner. Adding an automation never requires a deploy.
- **Reuse MJ primitives.** Actions via `ActionEngineServer.RunAction`; Agents via
  `AgentRunner.RunAgent`; conditions via the **existing §6 conditional evaluator** already
  used by the widget + `validation.service`. No new workflow/branching engine (§3 non-goal).
- **Snapshot at publish.** Automations execute from the **`FormVersion.DefinitionSnapshot`**,
  exactly like questions/pages/logic — so a response fired against version N runs version N's
  automation config (immutable, auditable). The `FormAutomation` table is the *authoring*
  store; the snapshot is what *executes*.
- **Fail-open for the respondent.** An automation failure never fails the submit (unchanged
  from today). Sync automations are awaited before the confirmation; async are dispatched
  fire-and-forget.
- **Backwards compatible.** The three existing actions are good generic building blocks — we
  keep them and back-fill existing forms with equivalent `FormAutomation` rows so nothing
  regresses.

---

## 3. Data model (new — Phase-2 schema work)

New tables in `__mj_BizAppsForms`, entity prefix `MJ_BizApps_Forms:`. Standard migration
discipline (single multi-`ADD` `ALTER`s, hardcoded UUIDs, `sp_addextendedproperty` on every
business column, **no** `__mj_*` timestamp cols / FK indexes — CodeGen adds them; CodeGen
output appended into the migration file).

### 3.1 `FormAutomation` — the authoring config (entity `MJ_BizApps_Forms: Form Automations`)

| Column | Type | Notes |
|---|---|---|
| `FormID` | FK → Form | Owning form. Config lives at Form level; snapshotted per version at publish. |
| `Name` | nvarchar | Author label ("Email confirmation", "Score & route detractors"). |
| `Description` | nvarchar(max), null | |
| `TargetType` | value-list: `Action` \| `Agent` | What runs. |
| `ActionID` | FK → `MJ: Actions`, null | Set when `TargetType='Action'`. |
| `AgentID` | FK → `MJ: AI Agents`, null | Set when `TargetType='Agent'`. |
| `Trigger` | value-list: `OnComplete` \| `OnPartial` \| `OnCompleteOrPartial` | Default `OnComplete` (matches today — partial saves fire nothing). |
| `ExecutionMode` | value-list: `Sync` \| `Async` | `Sync` awaited before confirmation; `Async` fire-and-forget. Default `Async`. |
| `DisplayOrder` | int | Run order within a mode. Reorder via the builder's drag-drop. |
| `ConditionalRule` | JSON, null | §6 rule shape; null = always. Fire only if the response's answers match. |
| `ParameterMapping` | JSON, null | How inputs are built (§4). Null = the four standard context ids (today's behavior). |
| `ContinueOnError` | bit, default 1 | If 0, a failure halts later **Sync** automations for this response. |
| `TimeoutMS` | int, null | Optional per-automation cap. |
| `IsActive` | bit, default 1 | |

Check constraint: exactly one of `ActionID` / `AgentID` non-null, matching `TargetType`.

### 3.2 `FormAutomationRun` — execution/observability (entity `MJ_BizApps_Forms: Form Automation Runs`)

Thin correlation record; the heavy audit lives in MJ's native `ActionExecutionLog` /
`AIAgentRun`, which we link to.

| Column | Type | Notes |
|---|---|---|
| `FormAutomationID` | FK → FormAutomation | Which automation (by config id from the snapshot). |
| `FormResponseID` | FK → FormResponse | Which submission triggered it. |
| `Status` | value-list: `Pending` \| `Running` \| `Succeeded` \| `Failed` \| `Skipped` | `Skipped` = condition not met (MJ logs can't record this). |
| `StartedAt` / `CompletedAt` | datetimeoffset, null | |
| `ActionExecutionLogID` | FK → `MJ: Action Execution Logs`, null | When an Action ran. |
| `AIAgentRunID` | FK → `MJ: AI Agent Runs`, null | When an Agent ran. |
| `ErrorMessage` | nvarchar(max), null | |
| `OutputSummary` | JSON, null | Small result digest (e.g. `{ "PersonID": "..." }`) for the builder's activity view. |

### 3.3 Snapshot inclusion

`FormVersion.DefinitionSnapshot` gains an `automations: []` array (config copied at publish,
each carrying its own stable `id` = the `FormAutomation.ID` it was cloned from). The runner
reads automations **from the snapshot**, never live. `snapshot-builder.ts` (Angular) and the
server snapshot type in `@mj-biz-apps/forms-entities` both extend to carry it.

---

## 4. Parameter mapping

One JSON shape drives both Actions and Agents. Null mapping ⇒ pass the four standard context
ids (today's `buildHookParams` behavior) — so a freshly-added Action "just works".

```jsonc
{
  // Standard response-context ids to include (default: all four).
  "context": ["FormResponseID", "FormID", "FormVersionID", "DistributionID"],
  // Author-set literals.
  "static": { "Subject": "Thanks for registering!" },
  // Bind an input to a specific answer's value, by question id.
  "answers": { "RecipientEmail": "3e4f...q-email", "NpsScore": "9a1b...q-nps" }
}
```

Resolution precedence: `static` > `answers` > `context`. Answer values are pulled from the
already-loaded `FormResponseContext` (`packages/Actions/src/custom/shared/form-response-context.ts`),
which the runner loads **once** per response and reuses across all automations.

- **Action target:** each resolved key becomes an `ActionParam { Name, Value, Type:'Input' }`.
- **Agent target:** resolved keys become the agent's initial **payload** object; additionally
  a rendered `userMessage` (templated from the mapping or a default "A form response was
  submitted: …") seeds `conversationMessages`. Agents read structured context from the
  payload and free-text from the message.

---

## 5. The generic runner (server)

Replaces `on-submit-hooks.service.ts`. New `FormAutomationRunner` service in
`packages/Server/src/public-submit/`.

```
runSubmitPipeline() step 8
  └─ FormAutomationRunner.run(resolved, responseId, complete, ctx)
       1. automations = resolved.snapshot.automations
                          .filter(a => a.isActive && triggerMatches(a.trigger, complete))
                          .sort(by ExecutionMode then DisplayOrder)   // Sync first
       2. context = loadFormResponseContext(responseId, serviceUser)  // once
       3. for each automation:
            - if ConditionalRule && !evaluate(rule, context.answers): record Skipped; continue
            - params = buildParams(automation.parameterMapping, context)
            - dispatch:
                Action → ActionEngineServer.RunAction({ Action, Params, ContextUser: serviceUser })
                Agent  → new AgentRunner().RunAgent({ agent, conversationMessages, contextUser: serviceUser, payload })
            - Sync  → await, record run, honor ContinueOnError
            - Async → fire-and-forget (non-awaited), record run on settle
```

- **Reused helper:** both the runner (for `TargetType='Agent'`) and the standalone
  `Forms: Invoke Agent` action (§6) call one shared `invokeAgentForResponse(agentId, context,
  mapping, serviceUser)` so there's a single agent-dispatch path (no drift).
- **Condition evaluation** reuses the §6 evaluator shared with the widget /
  `validation.service` — do not reimplement.
- **Injectable** for tests exactly like today's `ctx.fireHooks` seam.

---

## 6. `Forms: Invoke Agent` — a reusable Action

Ship one thin Action (`packages/Actions/src/custom/on-submit/invoke-agent.action.ts`) that
wraps `AgentRunner` for a response. The runner dispatches to agents **natively** (cleaner
`AIAgentRun` linkage), but this action makes an agent usable **anywhere Actions are** — e.g.
the Phase-2 bizapps-tasks approval `OnComplete`/`OnReject` hooks (§CLAUDE.md), which are
Action-based. Same `invokeAgentForResponse` helper underneath.

- Input params: `AgentID` (or `AgentName`), `FormResponseID`, optional `PayloadJSON`,
  optional `UserMessage`.
- Output params: `AIAgentRunID`, `Success`, `ResultSummary`.
- Model selection stays metadata-driven inside the agent (same principle as the Form Designer
  prompt — never name a vendor/model in code).

---

## 7. Security — execution principal (important)

Today automations run under the **anonymous respondent** `contextUser` (scope = `CanCreate`
on responses only). Privileged automations (upsert Person, create Task, run an Agent that
reads CRM data) can't work under that scope without granting the Form Respondent role broad
permissions — which **violates the no-privilege-accretion principle** (CLAUDE.md / plan §4).

**Recommendation:** automations execute under a dedicated, configurable **service principal**
(an "Automation Runner" user resolved server-side), decoupled from the anon respondent. The
respondent's scope stays minimal; the elevated context is never reachable from the public
submit path except through the vetted runner. This is a firm design decision to settle before
build — it's the crux of doing on-submit automation safely.

---

## 8. Builder UX (Angular)

New **"On Submit"** tab in the form builder (`packages/Angular/src/lib/builder`):

- **List** configured automations; **drag to reorder** — reuses the drag-drop reorder landing
  in the current builder work.
- **Add** → pick `TargetType`, then select from a `RunView` of `MJ: Actions` (Forms-relevant
  category) or `MJ: AI Agents`.
- **Configure:** trigger, execution mode, **condition** (reuse the existing
  `conditional-rule-editor.component`), and **parameter mapping** — static fields + bind-to-answer
  dropdowns populated from the form's own questions.
- **Test run** against the most recent / a sample response.
- **Activity:** recent `FormAutomationRun` outcomes (fired / skipped / failed) with links to
  the underlying `ActionExecutionLog` / `AIAgentRun`.

Two happy reuses of in-flight builder work: **drag-drop** (ordering) and the
**conditional-rule-editor** (conditions).

---

## 9. Backwards compatibility & rollout

1. Ship entities + CodeGen; snapshot gains `automations`.
2. **Back-fill migration / seed:** for every existing form, create three `FormAutomation`
   rows equal to today's hardcoded set (or attach a shared "default on-submit" template). New
   forms start empty; authors opt in.
3. Runner falls back to the legacy constant list **only** if a snapshot predates the
   `automations` field (feature-flagged), then removed once all versions are re-published.
4. Delete `ON_SUBMIT_ACTION_NAMES` / `fireOnSubmitHooks` after cutover.

---

## 10. Phasing

**v1 (this spec):** the two entities + snapshot field; generic runner (Action + Agent);
parameter mapping (context/static/answers); conditions (reused evaluator); sync/async;
`Forms: Invoke Agent` action; service-principal execution; builder "On Submit" tab; back-fill
migration. Tests: runner (ordering, condition-skip, sync/async, fail-open, param mapping),
`Forms: Invoke Agent`, snapshot round-trip, builder component.

**Phase 2+:** durable async queue + retries (vs fire-and-forget); more triggers
(`OnScoreComputed`, `OnStatusChange`); **LLM-judge scoring** wired as an automation feeding
`FormResponseAnswer.Score`/`ScoreRationale` (plan §5.1 / §8.2); automation chaining
(pass one automation's output into the next); per-automation rate limits; shared runner with
the bizapps-tasks approval-routing hooks.

---

## 11. Open decisions (need a call before build)

1. **Execution principal** (§7) — dedicated service user vs elevated system context. *(Rec: service user.)*
2. **Config altitude** — Form-level config snapshotted per version (this spec) vs config
   directly on FormVersion. *(Rec: Form-level + snapshot, mirrors questions.)*
3. **Agent dispatch** — native in runner + reusable action (this spec) vs everything-through-an-action. *(Rec: both, one shared helper.)*
4. **Async durability in v1** — fire-and-forget (rec, matches today) vs a real queue now.
5. **Default automations** — back-fill existing forms vs make on-submit opt-in going forward.
```
