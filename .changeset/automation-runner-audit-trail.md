---
"@mj-biz-apps/forms-server": minor
---

The automation runner could not write its own audit trail, and Forms never wired the one it ships.

Two defects that read as one. Every automation Forms dispatches runs an MJ Action, and the action engine writes one `MJ: Action Execution Logs` row per execution — inserted at start, updated at completion. `Forms Automation Runner` held no permission on that entity, so every dispatch logged `BaseEntitySaveQueue.Insert(MJ: Action Execution Logs) failed` for the service principal and carried on. The work still happened; only the record of it did not.

`V202608242110` grants the role Read + Create + Update, no Delete — exactly what `Developer` holds on that entity. `Integration` additionally holds Delete, which a runner has no reason to and which would let it erase the evidence of its own executions.

That grant alone did not restore the trail, and the second defect only became visible once it was applied. `FormAutomationRun.ActionExecutionLogID` and `.AIAgentRunID` have existed since `V202608072330`, and the responses dashboard reads both — but `dispatch-automation.ts` never wrote either. On the database this was found on, all 134 automation runs carried a null `ActionExecutionLogID`, **successes included**; with no log rows to point at, that looked like a consequence of the missing grant rather than a separate bug underneath it. Each target now returns a `DispatchOutcome` carrying its provenance id alongside the summary, and the run row is stamped with it — including on the failure path, via an error type that carries the outcome, because a failed run is where the reason lives and so the last row that should lose the pointer to it.

Verified end to end on a live stack: before, 134 of 134 runs null and zero log rows for the principal; after, every Action-target run joins to its own execution log, and the entity-binding target correctly carries none (a binding writes a business record directly, with no MJ-side run — its identity-ledger row is its provenance).

`V202608242100` ships alongside them, granting the same role Read + Create + Update on `MJ_BizApps_Common: People`. `Forms: Upsert Respondent Person` exists to match-or-create one of those, and `Forms: Bind Response To Entity` writes the same table; neither could on any host where an operator had not hand-inserted the row. That is how it was found — the grant was live in a dev database under an id present in no migration and no metadata file, the signature of a fix applied and never shipped. Both grants are mirrored in `metadata/entity-permissions/.entity-permissions.json` under the ids the migrations insert, so a regenerated seed reproduces them instead of minting duplicates (`__mj.EntityPermission` has no unique constraint on `(EntityID, RoleID)`, so duplicates are silently additive).

**Note for operators:** the People grant makes `Forms: Upsert Respondent Person` start actually creating People on hosts where it has been silently failing. That is the point, but responses submitted before this will not be backfilled — they keep their null `RespondentPersonID`.
