---
"@mj-biz-apps/forms-server": minor
---

`Forms: Analyze Written Responses` could never record a run, so it never completed.

The action runs an AI prompt under the automation service principal, and MJ's prompt engine writes one `MJ: AI Prompt Runs` row per execution — inserted when the run starts, updated on completion with the result and token counts. `Forms Automation Runner` held no permission on that entity, so every execution died at `BaseEntitySaveQueue.Insert(MJ: AI Prompt Runs)` and no answer was ever scored.

Nothing surfaced. On-submit automations are best-effort by design — the response is persisted and the respondent answered before they run — so the failure reached a log line and stopped there. Found while QA-ing the live path: 17 consecutive failures against one form, a green submit every time, and no prompt-run row to show for any of them. Any host that enabled this automation has been silently dropping both the analysis and its audit trail; the missing audit trail is the worse half, because there is no record that the work did not happen.

`V202608241700` grants the role Read + Create + Update on `MJ: AI Prompt Runs`, and no Delete. That is what the engine needs and it matches the `UI` and `Widget Guest` grants on the same entity; `Developer` and `Integration` additionally hold Delete, which a runner has no reason to and which would let it erase the evidence of its own executions. The grant is mirrored in `metadata/entity-permissions/.entity-permissions.json` under the same id the migration inserts, so a regenerated seed reproduces this row instead of minting a duplicate under a fresh GUID (`__mj.EntityPermission` has no unique constraint on `(EntityID, RoleID)`, so duplicates are silently additive).

This is the first grant this repo ships on a core `__mj` entity. The prompt-run ledger is where MJ records that an AI call happened at all, so any principal permitted to run a prompt has to be able to write it — which is why `Integration` and `Widget Guest`, the other non-interactive roles, already hold it.

**Note for operators:** on a host where this automation is enabled, it starts actually calling the model once this migration is applied. That is the point, but it is new spend where there was silently none — roughly 600 tokens per submission on a five-question form in local testing.
