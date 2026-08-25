# File Entity Record Links — attachments visible on the response AND the materialized record

**Goal.** A file uploaded through a form should appear in MJ's record-attachments panel in two
places: on the `MJ_BizApps_Forms: Form Responses` row, and on the business record a binding
materializes from that response (e.g. `ATS: Applicants`). MJ's soft-link table
(`__mj.FileEntityRecordLink`) is the mechanism; both writes live in **this repo** — the target
apps need no schema or code changes.

Out of scope: legacy CDP ATS (pinned to MJ 5.51.1, where the attachments UX does not exist and
resumes are Box paths with no `MJ: Files` row — a separate upgrade + backfill effort), and the
MJ-side delete fix (filed upstream as **MemberJunction/MJ#4046** — see T5; nothing here waits
on it).

---

## Status snapshot

| Task | State |
|---|---|
| T1 file-links service + unit tests | ✅ `packages/Server/src/file-links/{file-links.service,mj-file-link-gateway}.ts` + 14 specs |
| T2 wire into submit persistence | ✅ `persistSubmission` → `attachResponseFiles`; 7 specs |
| T3 wire into binding dispatch | ✅ `runBindingTarget` → `attachBoundRecordFiles`; 10 specs |
| T4 writer grants verification (+migration if needed) | ✅ system user already covered; runner granted by `V202608251800` |
| T5 delete hazard | ✅ filed upstream as MJ#4046 (assigned: Soham); Forms-side = doc note (done in T7) |
| T6 smoke `file-links-path.mjs` | ✅ `npm run smoke:file-links` — passes live, both legs, mutation-checked |
| T7 docs + progress log | ✅ ENTITY_BINDING_GUIDE §9, FORMS_BUILD_PLAN progress log, this snapshot |

**Sequencing:** T1 → (T2 ∥ T3) → T4 → T6; T7 last. One PR for T1–T4 (+T6 per repo smoke
convention). No CodeGen run (no schema change), no widget change, no Angular change.

### Where the build departed from this plan, and why

1. **The gateway holds the principal; `SyncFileLinksInput` does not carry a `contextUser`.** Matches
   `MJBindingGateway(ctx.principal)`, the established shape here, and leaves the decision module
   free of every MJ type — so its tests need no MJ import at all, not merely no database.
2. **The gateway takes an injected provider** (`FileLinkDataProvider`) rather than reaching for
   `new Metadata()` / `new RunView()`. The submit path passes the per-request provider it already
   holds, which is more correct than the global and is also what makes the persistence tests drive
   the real code through the existing fake. `globalFileLinkProvider()` serves the automation path,
   which has no per-request handle.
3. **Guard clauses are narrower than "valid GUIDs".** Only `target.entityId` is shape-checked,
   because passing an entity NAME where the link table wants the `MJ: Entities` row id is the
   mistake worth catching (every other MJ API accepts either). A record id may legitimately not be
   a GUID, and a malformed FILE id is better left in the wanted set and reported by the write that
   rejects it — filtering it out would move it out of "wanted", where D4 reads the absence as "the
   respondent removed this file" and deletes a link that should have stayed.
4. **D4's provenance lookup is keyed by response, not by file id.** `FormUpload` is read with
   `ResponseDraftID = <responseId>`, so the two views in the batch have no dependency on each other
   and one round trip settles both the adds and the removes.
5. **No short-circuit on an empty file set.** "This form has no file questions" and "the respondent
   removed their only upload" are indistinguishable from the answer list, and the second is exactly
   the case a stale link gets wrong — so the reconciler always makes its one batched read. Cost is
   one indexed two-view read on a path that already runs about ten.
6. **`FORM_UPLOAD_ENTITY` was hoisted into `entity-names.ts`.** The literal had three copies
   (`download.service.ts`, `upload-provenance.service.ts`, `upload.service.ts`) and this work would
   have added a fourth. Zero behaviour change — worth keeping as its own commit when this lands.
7. **D3's "store the server-returned casing" holds for `RecordID`, not `FileID`.** `createLink`
   writes the file id in the caller's spelling. It is a `uniqueidentifier` column, so SQL Server
   normalises it on the way in and a raw-SQL consumer never sees the client's casing — the rule's
   purpose is met without the extra round trip a read-back would cost.

## Agent execution notes (read first)

- Follow `CLAUDE.md` and `.claude/rules/*` — the non-negotiables that bite here: **no `any`**,
  no `.Get()`/`.Set()` weak typing, always pass `contextUser` server-side, check `Save()`/
  `Delete()` booleans and `RunView.Success`, `RunViews` (plural) to batch, `md.EntityByName`
  never `Entities.find`, tests are **`.spec.ts`** (Vitest), **no commits without explicit
  approval**.
- Build/test loop: `cd packages/Server && pnpm run build && pnpm test`. `pnpm install` only at
  repo root, and only if deps change (they shouldn't — this feature adds no dependency).
- The link entity is MJ core: name `'MJ: Files'`-style → **`'MJ: File Entity Record Links'`**,
  typed class `MJFileEntityRecordLinkEntity` from `@memberjunction/core-entities` (verified
  present at this repo's pin). Columns: `ID`, `FileID` (FK→File), `EntityID` (FK→Entity),
  `RecordID nvarchar(750)`. **No unique constraint** on (FileID, EntityID, RecordID) — the
  writer owns idempotency (D3).
- Smoke tests (T6) need a live DB + MJAPI harness (`apps/MJAPI`, `node server.mjs`); unit tests
  must not. If no DB is available in the agent environment, deliver T6's script + registration
  and state plainly that it was not executed.

---

## 0. Verified ground truth (all re-checked 2026-08-25, with receipts)

| # | Fact | Evidence |
|---|------|----------|
| 1 | Uploads already create real `MJ: Files` rows via `FileStorageEngine.UploadFile` (provider-agnostic — 7 registered drivers incl. Box, S3, Azure). | `packages/Server/src/upload/upload.service.ts` (`storeFile`); MJ `MJStorage/src/FileStorageEngine.ts:371-427`, `src/drivers/*` |
| 2 | This repo writes **zero** `FileEntityRecordLink` rows today. The file↔submission tie is `FormResponseAnswer.FileID` + the `FormUpload` provenance ledger — neither is read by the attachments panel. | repo-wide grep: no hits outside this plan |
| 3 | The panel (`<mj-record-attachments>`, `@memberjunction/ng-file-storage`) is mounted generically in `record-form-container.component.html:334`, gated only by `record.IsSaved` + `EntityInfo.Configuration?.Attachments?.Enabled !== false` (default **on**), and loads via `ExtraFilter: EntityID='…' AND RecordID='…'` on `MJ: File Entity Record Links`. Forms' generated Explorer forms use that container, so the button already renders (reading 0). | MJ `base-forms/…/record-form-container.component.ts:1277-1285`, `file-storage/…/record-attachments.component.ts:530-534`; `packages/Angular/src/lib/generated/Entities/mjBizAppsFormsFormResponse/…form.component.html:1` |
| 4 | The panel exists only in MJ ≥ 6.1.0-edge (added `dfb2b74552`, 2026-08-18; absent from tags v5.51.0/v5.51.1). This repo pins `^6.1.0-edge.1` and dev-resolves to workspace MJ 6.1.0-edge.3 — so we have it. | `git show v5.51.1:…record-attachments.component.ts` → not in tree; `packages/Server/package.json` |
| 5 | Link table shape: `ID, FileID (FK→File), EntityID (FK→Entity), RecordID nvarchar(750)`. PK + FKs only — **no unique constraint on (FileID, EntityID, RecordID)**, so idempotency is the writer's job. | MJ `migrations/v2/V202407171600__v2.0.x.sql:514,21394-21396` |
| 6 | Submit-side insertion point exists: `persistSubmission` (`packages/Server/src/public-submit/persistence.service.ts:362`) runs under the elevated system user (`PublicFormResolver.ts:87`), file answers land as `answer.FileID = input.fileId` (`:281-282`), and provenance is verified **before** persistence (step 7b, `submit-pipeline.ts:377`). The response row ID is the client-minted id when valid (`response.ID = adoptedId`), i.e. it equals `FormUpload.ResponseDraftID`. |
| 7 | Binding-side insertion point exists: the binding branch of `packages/Server/src/automation/dispatch-automation.ts` has, in one scope: `binding.TargetEntityID`, `result.outcome.targetRecordId`, the answers map (file ids via `isFileAnswer`), the already-computed `filesAreVerified(ctx)` verdict, and `ctx.principal` (the automation service principal). Outcome kinds: `Created | Merged | Unchanged | Skipped` (`binding-executor.ts:47-51`). |
| 8 | Entity-level `Configuration.Attachments` has **no delete/upload toggles** — only `Enabled`, `MaxFileSizeBytes`, `AllowedContentTypes`, `DefaultStorageAccountID`, `DefaultCategoryID` (MJ `IEntityConfiguration.ts:41-69`). The container mounts the panel with **no** `AllowDelete`/`Config` bindings; delete is gated solely by the viewing user's `CanDelete` on `MJ: Files` AND `MJ: File Entity Record Links` (`EffectiveAllowDelete`, `record-attachments.component.ts:458-460`). |
| 9 | The delete hazard: the panel's "Delete Completely" deletes the link row, **then** hard-deletes the `MJ: Files` row, sequentially, no transaction, no confirmation (`record-attachments.component.ts:1007-1029`); a successful delete also orphans the storage bytes (no delete path calls the storage driver). Root cause is MJ-side (`MJ: Files` has no server subclass; `spDeleteFile` is a bare row DELETE) — **filed as MemberJunction/MJ#4046**, which proposes `MJFileEntityServer` (Tag/List pattern: refuse on hard-FK dependents via `GetEntityDependencies`, cascade own link rows, delete bytes). Until it lands, our `FK_FormUpload_File` (and ATS `ResumeFileID`) are the fail-closed backstop. |

---

## 1. Design decisions

**D1 — Both writers live in `packages/Server` (Forms).** Link #1 is part of persisting a
submission; link #2 is part of executing a binding. The binding executor is generic over target
entities — putting the write there covers ATS and every future target with zero per-app code.

**D2 — One deep module, two call sites.** A single `file-links.service.ts` owns "make the link
set for (entityID, recordID) match this list of file ids, touching only links whose files Forms
provably owns." Both call sites pass file ids + target; neither reimplements idempotency or
reconciliation.

**D3 — Idempotent by lookup, not by constraint** (fact 5). One `RunViews` batch for existing
links on `(EntityID, RecordID)` and the `FormUpload` rows for the involved file ids, then insert
only the missing. GUID comparison case-folded (client mints lowercase, SQL returns uppercase —
the same boundary `upload.service.ts` already documents); **store** the server-returned casing
(`saved.entity.ID`, `file.ID`).

**D4 — Reconciliation is scoped by provenance.** On a re-submit/promotion the answer set can drop
a file (respondent replaced their upload). The link set should mirror the current answers — but
the panel also lets admins attach files by hand, and those links are not ours to delete. Rule:
*remove* a link only when its `FileID` has a `FormUpload` row whose `ResponseDraftID` equals this
response's id (i.e. Forms created it for this response) **and** it is absent from the current
answer set. Admin-attached links are never touched. `FormUpload.FileID` is UNIQUE, so ownership
lookup is one filtered view over the ledger.

**D5 — Link writes are best-effort, loudly.** The answer row's `FileID` remains the source of
truth (the Responses tab already joins on it). A failed link insert must not fail a respondent's
submit or a binding that already wrote the business record — same posture as
`incrementResponseCount` (`persistence.service.ts:346-352`): log with response/file ids, return,
never throw, never silently drop the error.

**D6 — Binding links are gated the way file FK copies are.** Write link #2 only when
`outcome.kind` is `Created` or `Merged` (a non-null `targetRecordId` we just wrote) **and** the
already-computed `filesAreVerified` verdict is true — the same defence-in-depth that guards
`allowFileAnswers`. `Unchanged` re-runs still *reconcile* (adds are idempotent; the record may
predate this feature), `Skipped` does nothing.

**D7 — Principals.** Link #1 writes as the submit pipeline's `elevatedUser` (system user); link
#2 as `ctx.principal` (automation runner). The runner's grants must be verified (T4) — issue #60
established the pattern of granting the runner exactly what it writes.

---

## 2. Tasks

### T1 — `packages/Server/src/file-links/file-links.service.ts` (+ tests)

The deep module. Public surface (one function, injected gateway for testability, matching the
`upload.service.ts` seam style):

```ts
export interface FileLinkTarget { entityID: string; recordID: string; }

export interface SyncFileLinksInput {
  target: FileLinkTarget;
  /** File ids that SHOULD be linked (current verified file answers). */
  fileIds: readonly string[];
  /** The response whose provenance scopes deletions (D4). */
  responseId: string;
  contextUser: UserInfo;              // the elevated principal (D7)
}

/** Returns counts for logging; never throws (D5 — failures logged with context, reported in result). */
export async function syncFileLinks(gateway: FileLinkGateway, input: SyncFileLinksInput): Promise<SyncFileLinksResult>;
```

Internals:
1. Guard clauses (valid GUIDs, non-empty target) — fail fast with descriptive messages.
2. `RunViews` (one round trip): existing links for the target; `FormUpload` rows for
   (existing ∪ wanted) file ids.
3. Compute: `toInsert = wanted − existing`; `toDelete = existing ∩ provenance(responseId) − wanted`.
4. Insert via `GetEntityObject('MJ: File Entity Record Links', contextUser)`; delete likewise.
   Check every `Save()`/`Delete()` boolean; collect failures into the result.

Entity name constant `MJ_FILE_ENTITY_RECORD_LINKS = 'MJ: File Entity Record Links'` lives here.

**Unit tests** (`__tests__/file-links.service.spec.ts`, stub gateway — no DB): empty file set is
a no-op; insert-only on first write; second identical call inserts nothing; replaced file deletes
the provenance-owned stale link; admin-attached link (no matching `FormUpload.ResponseDraftID`)
is never deleted; casing mismatch dedupes; save-failure is reported, not thrown, and does not
abort remaining writes.

**Done when:** service + spec exist, `pnpm run build` clean, all specs green.

### T2 — Wire link #1 into `persistSubmission`

In `persistence.service.ts`, after `insertAnswers` succeeds: collect `inputs.answers` where
`input.fileId` is set, call `syncFileLinks` with
`target = { entityID: <Form Responses entity ID>, recordID: responseId }`. Resolve the entity ID
via `provider.EntityByName(FORM_RESPONSE_ENTITY)` (constant from `entity-names.ts`). Runs on
**both** partial and complete saves. On the `saved.skipAnswers` dedupe path, skip (the concurrent
completer already linked). The upsert path needs no special casing: D4's reconciliation derives
adds/removes from the current answer set, so one call after `insertAnswers` covers create,
update, and promote alike.

**Done when:** existing persistence specs still green + new spec cases: submit with a file answer
produces one link write via the gateway; re-submit produces none; link-write failure does not
fail the submit but is present in logs/result.

### T3 — Wire link #2 into the binding dispatch

In `dispatch-automation.ts`'s binding branch, after `recordBindingLedgerRow`: hoist the
`filesAreVerified(ctx)` result to a local (it is currently computed inline for
`allowFileAnswers` — compute once, use twice). If `result.outcome.kind` ∈
{`Created`,`Merged`,`Unchanged`} and `targetRecordId` is non-null and the verdict is true, call
`syncFileLinks` with `target = { entityID: binding.TargetEntityID, recordID: targetRecordId }`,
`fileIds` = file answers from `ctx.answers` (`isFileAnswer`), `contextUser = ctx.principal`.

**Done when:** dispatch specs cover: Created outcome links verified files; Skipped/null-record
outcomes write nothing; unverified files write nothing; link failure does not fail the dispatch.

### T4 — Grants for the writers (migration only if needed)

Verify, against a clean-install seed, that (a) the submit path's system user and (b) the
automation runner role hold `CanCreate`/`CanDelete` on `MJ: File Entity Record Links`. The
system user should already; the runner role likely needs an explicit grant — if so, ship it in a
new `V…__File_Link_Grants.sql` following the #60 pattern (hardcoded UUIDs,
`${flyway:defaultSchema}`/`${mjSchema}` placeholders only, `npm run lint:distribution` clean).
**No new tables.**

**Done when:** either a written confirmation in the PR that grants exist, or the migration +
`lint:distribution` green.

### T5 — Delete hazard: filed upstream, Forms-side is documentation only

Root cause and fix are MJ core's: **MemberJunction/MJ#4046** (assigned: Soham) proposes
`MJFileEntityServer` — refuse on hard-FK dependents (via `GetEntityDependencies`), cascade its
own `FileEntityRecordLink` rows, delete storage bytes, then the row; plus a confirmation dialog
and `Configuration.Attachments` plumb-through. Full analysis and precedents (`MJTagEntityServer`,
`MJListEntityServer`) are in the issue.

Forms-side, this plan's only obligation: the `guides/ENTITY_BINDING_GUIDE.md` §9 note in T7
documenting the interim hazard (deleting a Forms-linked attachment fails on `FK_FormUpload_File`
*after* the link row is gone; do not grant Forms roles `CanDelete` on `MJ: Files` /
`MJ: File Entity Record Links` in the meantime). **Nothing in T1–T4 depends on #4046.**

### T6 — Smoke test: `smoke/file-links-path.mjs`

Following `smoke/upload-provenance-path.mjs` and the shared `smoke/lib` helpers: upload → submit
→ assert one link row on the response; re-submit same draft → still one row; run a binding to a
target entity → assert the second link row; replace the file and re-submit → old link gone, new
link present, a hand-inserted "admin" link untouched. Register as `smoke:file-links` in root
`package.json` beside the existing `smoke:*` scripts. Requires a live DB + the `apps/MJAPI`
harness; if unavailable, deliver the script and say so.

### T7 — Docs & plan bookkeeping

- `guides/ENTITY_BINDING_GUIDE.md` §9: link-row behavior + the T5 interim-hazard note.
- `plans/FORMS_BUILD_PLAN.md` progress log entry; update this file's Status snapshot;
  `RESPONSES_UI_PLAN.md` note that the attachments panel now has data (its uploads join is
  unchanged — it reads `FormUpload`, not links).

---

## 3. Edge cases the tests must pin

- Partial → promote: link written at partial time survives promotion (same responseId).
- Duplicate-key recovery (`skipAnswers`): no double write.
- Revoked upload (`FormUpload.Status='Revoked'`): submit already rejects it upstream; the
  service treats provenance-scoped deletion identically for Active and Revoked rows.
- A binding whose target record the panel is open on: count badge refreshes on next open (no
  push channel — acceptable).
- RecordID casing: SQL Server's case-insensitive collation makes reads safe either way, but we
  store server casing (D3) so raw-SQL consumers never depend on collation.
