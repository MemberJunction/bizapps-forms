# Adopting MJ's Entity Action workflow extensions

> **Status:** Tracking doc — nothing to build here yet.
> **Upstream:** MemberJunction/MJ **[#3408](https://github.com/MemberJunction/MJ/pull/3408)** · [design plan](https://github.com/MemberJunction/MJ/blob/claude/sales-deal-management-app-ueporb/plans/entity-action-workflow-extensions.md)
> **Blocked on:** that PR merging *and* its engine work landing (the PR ships schema + plan only).

---

## 1. What is changing in MJ core

`EntityAction` — MJ's generalized hook for running an Action off an entity's
create / update / delete / validate — is becoming the **workflow-hook substrate for every app on
the platform**, so no app needs to invent its own.

It already does more than its schema suggests, and this is worth knowing regardless of this PR:

| Invocation | Where it fires | Semantics |
|---|---|---|
| `Validate` | `OnValidateBeforeSave` | **A real blocking gate** — a non-`Success` result fails the save |
| `Before*` | `OnBeforeSaveExecute` | Awaited, result discarded (cannot veto) |
| `After*` | `OnAfterSaveExecute` | Fire-and-forget |

And because **`Execute Agent` is just an Action**, any binding can already run an agent — a
deterministic **flow agent** (visual editor, `Action`/`Prompt`/`Sub-Agent`/`ForEach`/`While` steps,
per-step retry and error behaviour) or a **loop agent** where judgement is genuinely needed. The
house shape is a flow agent with a `Sub-Agent` step calling a loop agent.

**What #3408 adds:**

- **`EntityAction.ScopeEntityID` + `ScopeRecordID`** — bind a workflow to *one configuration record*
  rather than to every record of an entity. This is the important one: it means **no app ever grows
  a column per type per event**, and a configuration record can surface "the workflows bound to me"
  as a real relationship instead of something buried in filter code.
- **`EntityAction.Sequence`** — deterministic ordering when several bindings share an event.
- **`EntityActionParam.ValueType = 'Entity Object Data'`** — passes `entity.GetAll()` instead of the
  live `BaseEntity`. Use it for anything that serializes, above all `Execute Agent`'s `Data` payload:
  a `BaseEntity` serializes to `{}` because its fields are getters, so the agent silently receives
  an empty payload with no error anywhere.
- Two seeded reusable `ActionFilter`s — **"field changed"** and **"field changed *to* value"** — so
  transition detection stops being hand-rolled. Without them `AfterUpdate` fires on *every* update,
  and "status *is* X" instead of "status *changed to* X" re-fires on every later save.
- `After*` routed through `QueueManager` so failures are durable and retryable rather than logged
  and swallowed.

**Authoring is pure metadata** — `metadata/entity-actions/`, with `relatedEntities` for invocations,
filters and params. No schema and no code in the consuming app.

---

## 2. What this means for MJ Forms

Forms is one of the strongest fits in the family, because **scope binding maps exactly onto how
forms are actually used**: different forms need different things to happen on submit.

Forms already has on-submit Actions in its design. `EntityAction` with `ScopeRecordID` generalizes
that without Forms carrying the wiring: *"when a response to **this** form arrives, run **this**
agent"* is one metadata row, authored per form, editable by whoever owns the form.

## 3. Suggested bindings

| Entity + invocation | Scope | Work | Purpose |
|---|---|---|---|
| `FormResponse` · `AfterCreate` (or status changed to `Complete`) | a **`Form`** | Flow agent | The headline case — route, score, notify, create records |
| `FormResponse` · `AfterCreate` | a `FormGroup` | Flow agent | Shared handling across a family of forms |
| `FormResponse` · `Validate` | a `Form` | Action | Server-side acceptance rules beyond field validation — quota, eligibility, duplicate detection |
| `FormVersion` · `AfterUpdate` (status changed to review) | a `Form` | Action | The publish-approval routing into bizapps-tasks that Phase 2 already anticipates |

## 4. Notes specific to this repo

**Anonymous submissions make the `Validate` gate valuable.** Public forms accept input from the
internet, and Forms' own plan calls for a public-write hardening layer — Turnstile, rate limit,
quota, dedupe. Some of that is per-form policy rather than framework mechanism, and a `Validate`
binding scoped to a `Form` expresses it as configuration.

**Scope binding may simplify the existing design.** Forms' on-submit Action wiring and
`EntityAction` scoped to a `Form` do substantially the same job. Worth deciding deliberately whether
Forms keeps both — the on-submit path is likely more ergonomic inside the form builder UI, while
`EntityAction` reaches things the builder never will. Not urgent, but do not build a *third* path.

**The `FormResponse` → identity flow is a natural `LogActivity` target.** With the Activity spine
landing in `bizapps-common`, a form submission can write a timeline entry against the respondent's
Person record through a binding rather than through code.

---

## 5. What to do now

**Nothing.** This is a tracking doc so the idea is not lost and so this repo's plans reflect where
workflow hooks are going. When #3408 merges and its engine work lands:

1. Confirm the bindings in §3 are still the right ones.
2. Author them as metadata under `metadata/entity-actions/`.
3. Build the flow agents they dispatch to.
4. Delete this file, or fold it into the repo's main plan.

## 6. Two rules to carry into the design

- **Synchronous bindings should be Actions, never agents.** `Validate` and `Before*` run inside the
  caller's transaction. A loop agent's duration is unbounded and holding a transaction open for it
  is not acceptable. Agents belong on `After*`, which is async.
- **A flow agent should create human work and finish** — it should not hold a run open waiting for
  a person. Use `MJ: AI Agent Requests` when the answer resumes the same run (minutes to hours), and
  a **bizapps-tasks** Task when it is durable, assignable work someone owns (days to weeks).

---
_Generated by [Claude Code](https://claude.ai/code)_
