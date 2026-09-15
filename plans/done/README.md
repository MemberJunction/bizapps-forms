# Implemented specs

Design docs whose work has landed. They are kept, not deleted: a spec is the record of *why* a
thing is shaped the way it is, and that reasoning outlives the work — it is what a reviewer, or an
agent, needs when the code alone does not explain a decision.

Moving one here says the implementation exists, not that the document is now describing it
accurately. Where the two have diverged the CODE IS THE TRUTH, and the running documentation is:

| Spec | Implemented by | Live documentation |
|---|---|---|
| `ENTITY_BINDING_SPEC.md` | PR #33 | [`guides/ENTITY_BINDING_GUIDE.md`](../../guides/ENTITY_BINDING_GUIDE.md) |
| `ON_SUBMIT_AUTOMATION_SPEC.md` | PR #33 | [`guides/ENTITY_BINDING_GUIDE.md`](../../guides/ENTITY_BINDING_GUIDE.md) §4 |
| `QUESTION_LEVEL_LOGIC_PLAN.md` | PR #72 | the code — `packages/Entities/src/contracts/{conditional-rule,flow-resolver}.ts` and `packages/Angular/src/lib/builder/logic-*.ts` |
| `ISSUE-74-EDIT-LOGIC-DIALOG-PLAN.md` | `45d586d` + `5b48fe0` on `enhancement/rules-and-branching`; PR to `next` not yet open | its own Phase 4 checklist, until that PR merges |

Anything still being built stays in `plans/`. The `ISSUE-74` row is the one exception worth
naming: its code has landed and its remaining checklist is close-out — a PR and a comment on the
issue — not construction. It is here because the *design* is settled, and it is settled in a way
the issue itself contradicts: #74 asks for two dialog controls, one shipped as a read-only
sentence and the other will not be built at all. Both refusals have reasons written down, and
both are the kind a later reader "fixes" if they read only the issue.
