# Upload Provenance Ledger — Design Spec

**Status:** Draft for review · **Date:** 2026-08-07
**Fulfills:** `PHASE2_RECONCILIATION.md` task **P2.0-a** and decision **DG-12**; hard prerequisite
gating **F-SEC-1** (`ENTITY_BINDING_SPEC.md` §7.1) and the executor's "re-verify a FileID before
copying" step (`ENTITY_BINDING_SPEC.md` §8, §6 step 7).

> Goal: give the submit path and the binding executor a **buildable** way to prove a submitted
> `FileID` was uploaded **through the Forms upload endpoint, by this same respondent, for this
> distribution** — not an arbitrary `__mj.File` GUID a client pasted in. `__mj.File` has no owner
> column and no RLS, so today the FK check only proves *existence*; provenance must be recorded by
> Forms at upload time and checked at submit + bind time.

---

## 1. The gap (grounded in the code)

Two sites, verified:

- **Write, unchecked:** `persistence.service.ts` copies the client's value straight onto the row —
  [`applyAnswerValue`](packages/Server/src/public-submit/persistence.service.ts#L281):
  ```ts
  if (input.fileId !== undefined) { answer.FileID = input.fileId; }   // no provenance check
  ```
  The only guard downstream is the `FileID → __mj.File` FK, which proves the GUID *exists*, not that
  *this respondent* produced it.
- **Upload, no record kept:** the upload endpoint runs POST-AUTH under the verified anonymous
  magic-link session and creates an `MJ: Files` row via `FileStorageEngine.UploadFile`
  ([`storeFile`](packages/Server/src/upload/upload.service.ts#L147)), then returns `fileId` — but
  **records nothing** linking that file to the session/distribution/question it came from.

**Threat (F-SEC-1):** a malicious submitter puts *any* File GUID (another tenant's resume, a private
document) into `answer.FileID`. It passes the FK check, persists, and — the moment a binding copies
`FileID` onto e.g. `Applicant.ResumeFileID` and recruiters get CanRead on `MJ: Files` — becomes
**cross-tenant file exfiltration by GUID**. Latent today; live the instant binding ships.

---

## 2. What identifiers exist, and the one that survives

The ledger must correlate an *upload* to the *submission* that later references it. What's available:

| Identifier | At upload | At submit | Durable? |
|---|---|---|---|
| **Anonymous session id** (`mj_sid`) | `req.userPayload.sessionId` ([UploadMiddleware.ts:87](packages/Server/src/upload/UploadMiddleware.ts#L87)) | `PersistenceInputs.sessionId` → `response.AnonymousSessionID` | **No** — [documented to be blank](packages/Server/src/public-submit/persistence.service.ts#L54) in valid flows |
| **Client-minted response id** (`clientResponseId`, the FormResponse PK) | *not sent today* — the upload contract has only `distributionSlug`/`distributionId`/`questionId` | `PersistenceInputs.clientResponseId` (the widget's stable v4 UUID) | **Yes** — the correctness key the whole persistence layer already relies on |
| Distribution / question | `distributionId` + `questionId` (required) | known from the submission | scope, not identity |

The decisive fact: **the session id is not a reliable key, but the client response id is** — the
persistence layer already leans on it *because* the session can be blank. So provenance keys on the
**client response id as primary**, session id as a defense-in-depth fallback, and distribution as a
hard scope. This costs **one additive field on the upload contract** (the widget already holds the
id): the upload POST must carry the draft `responseId`.

---

## 3. Data model — `FormUpload` (entity `MJ_BizApps_Forms: Form Uploads`)

One row per successful upload, in `__mj_BizAppsForms`. Standard migration discipline (hardcoded
UUIDs, `sp_addextendedproperty` per business column, no `__mj_*` timestamps / FK indexes — CodeGen
adds them; SQL Server **and** `migrations-pg` in lockstep, per G5).

| Column | Type | Notes |
|---|---|---|
| `FileID` | uniqueidentifier, **hard FK → `__mj.File(ID)`**, **UNIQUE** | The uploaded file. One ledger row per file (a File is created per upload). Cross-schema FK — same proven pattern as `FormResponseAnswer.FileID`. |
| `DistributionID` | FK → `FormDistribution` | The distribution the upload was for. The hard scope every check enforces. |
| `FormID` | FK → `Form` | Denormalized from the distribution at upload time (durable even if the distribution is later repointed). |
| `QuestionID` | FK → `FormQuestion` | The question the file answers (upload already requires `questionId`). |
| `ResponseDraftID` | uniqueidentifier, NULL | **Primary correlation key** — the widget's client-minted response id. NULL only for legacy widgets predating the contract change (§8). Not an FK: the response row may not exist yet at upload time. |
| `AnonymousSessionID` | nvarchar(255), NULL | `mj_sid` at upload time. Fallback correlation key; NULL/blank tolerated. |
| `UploadedByUserID` | uniqueidentifier, FK → `__mj.User`, NULL | The synthesized anonymous session user. **Audit only** — never a correlation key (may be a shared anon user). |
| `ProviderKey` | nvarchar(1000), NULL | The storage key/path of the File (the `forms-uploads/<date>/…` prefix). Enables the cheap prefix backstop (§7) without loading `__mj.File`. |
| `FileName` | nvarchar(500), NULL | Original (sanitized) filename — audit. |
| `ContentType` | nvarchar(255), NULL | Stored content type — audit / optional re-validation. |
| `SizeBytes` | bigint, NULL | Audit / quota. |
| `Status` | value-list: `Active` \| `Revoked` | `Revoked` = admin/GC killed it; a `Revoked` row fails provenance. Bound-vs-orphaned is **derived by query** (§9), not a stored state — no per-submission write churn. |

Indexes CodeGen won't add: unique on `FileID`; non-unique on `ResponseDraftID` and on
`AnonymousSessionID` (verification lookups + GC).

> Naming note: `FormUpload` reads cleanly beside `FormResponse` / `FormDistribution`. Alternative
> `FormFileUpload` if "Form Upload" is judged ambiguous — a DG-style call, not load-bearing.

---

## 4. Write path (upload)

Extend [`runUpload`](packages/Server/src/upload/upload.service.ts#L88) with a **step 5**, after
`storeFile` succeeds and before returning the success body:

```
runUpload(ctx, req)
  1..3  (unchanged: scope check, file validation, open-distribution resolve)
  4.    storeFile → { FileID, name, size, contentType }        (unchanged)
  5.    NEW: recordUpload(ctx, req, storedFile)
          - GetEntityObject('MJ_BizApps_Forms: Form Uploads', writer) → NewRecord()
          - FileID, DistributionID (resolved), FormID (from the resolved definition),
            QuestionID, ResponseDraftID (req.responseId), AnonymousSessionID (ctx.sessionId),
            UploadedByUserID (ctx.contextUser.ID), ProviderKey/FileName/ContentType/SizeBytes,
            Status='Active'
          - Save() — boolean-checked; on failure the upload FAILS (fail-closed): a file with no
            provenance row is unusable downstream, so returning its id would be a footgun.
```

`recordUpload` needs the `sessionId` and the resolved `FormID`/`DistributionID`, so:
- Thread `sessionId` into `UploadContext` (the middleware already reads `req.userPayload.sessionId`;
  pass it alongside `contextUser`).
- Have `resolveOpenDistribution` return the resolved `{ formId, distributionId }` instead of a bare
  ok/fail, so step 5 doesn't re-resolve.

**Who writes the row — ties F-SEC-2.** Two options; the reconciliation picks one at build:
- **Interim (unblocks P2.0-a before the service principal exists):** write under the anonymous
  `contextUser`; grant `Form Respondent` **CanCreate only** on `MJ: Form Uploads` (and, per F-SEC-2
  option A, on `MJ: Files`) via mj-sync — same minimal-grant pattern the role already uses for
  responses/answers. No read/update/delete.
- **Target (recommended, arrives with P2.1):** the upload endpoint authenticates the anon session,
  then performs the privileged `File` + `FormUpload` writes under the **Forms Automation Service
  principal** (DG-7). The anonymous role keeps **zero** Files/Uploads grants — elevation is
  centralized in the vetted endpoint, resolving F-SEC-2 the clean way (option B).

Recommendation: ship P2.0-a with the interim grant to unblock, migrate to the service principal in
P2.1 and drop the anon grants. Record which under DG-12.

---

## 5. Verify path (submit)

New `assertUploadProvenance(provider, inputs, contextUser)` invoked from `persistSubmission`
**before** answers are inserted, for every answer whose `input.fileId` is set. Predicate per file:

```
1. Load FormUpload by FileID (indexed, unique). Absent → FAIL 'unknown-file'
   (not a Forms upload at all → definitively foreign).
2. Status === 'Revoked'                              → FAIL 'revoked'
3. DistributionID !== inputs.distributionId          → FAIL 'wrong-distribution'   (hard scope)
4. Correlation — at least one must hold:
     a. ResponseDraftID && ResponseDraftID === inputs.clientResponseId   (PRIMARY)
     b. AnonymousSessionID (non-empty) && === inputs.sessionId           (FALLBACK)
   Neither establishable (blank session AND no draft id — legacy widget):
     strict mode  → FAIL 'unattributable'
     lenient mode → PASS on distribution-scope alone, LOG a warning
5. QuestionID !== the answer's question  → SOFT: log a mismatch, do not fail (a file answer may be
   re-mapped in the builder; distribution + correlation already bound identity). Configurable to hard.
```

- **Mode** via `FORMS_UPLOAD_PROVENANCE = strict | lenient` (default **strict** for Complete
  submissions feeding bindings; **lenient** tolerates in-flight legacy widgets during rollout).
- **On failure:** strict → reject the whole submission with a field-scoped error (the response is
  never persisted with a foreign file). Lenient → **strip** the offending `fileId` from that answer
  (persist the rest) and log — never silently accept it.
- **When to run:** on every persist carrying a `fileId` (Partial autosave *and* Complete), so a
  foreign id is rejected at first sight, not only at promotion. The check is one indexed lookup per
  file answer (typically 0–2), reused across autosaves; negligible cost.
- **Autosave interaction:** the ledger row is written once at upload and is untouched by
  `replaceAnswersClear` (which only churns `FormResponseAnswer` rows), so provenance survives the
  delete/re-insert autosave cycle and the Partial→Complete promotion unchanged.

---

## 6. Bind-time re-verification (executor, P2.2)

`ENTITY_BINDING_SPEC.md` §6 step 7 says "re-verify before copying." Now buildable: before the
executor copies a `FileID` (from a canonicalized answer) onto a target entity's `File`-FK column, it
runs the **same predicate** against `FormUpload`, keyed by the response it is binding
(`ResponseDraftID === response.ID` OR session match, `DistributionID` from the response's
distribution). A file that fails re-verification is **not copied**; the binding records the field as
skipped with a scoped reason (config-vs-candidate: `candidate`, `deterministic`). This is defense in
depth — the submit-time check (§5) already gates persistence — but the executor must not trust that a
persisted `FileID` was checked under an older, more lenient config.

---

## 7. The cheap backstop — ProviderKey prefix

All Forms uploads land under a known prefix (`forms-uploads/<YYYY-MM-DD>/…`, set by
[`defaultPathPrefix`](packages/Server/src/upload/upload.service.ts#L193) / `FORMS_UPLOAD_STORAGE`
config). A File whose `ProviderKey` does not start with the configured Forms prefix was **not**
uploaded through this endpoint — a coarse, instance-wide "is this even a Forms file" gate that needs
no ledger lookup. It does **not** distinguish sessions (every Forms upload shares the prefix), so it
is a backstop, never the primary control: §5 step 1 (ledger presence) already subsumes it for the
submit path. The executor (§6) checks the prefix as a fast pre-filter before the ledger lookup.

---

## 8. Widget contract change

The upload multipart gains one optional field, **`responseId`** — the widget's already-minted
client response id (the same value it will submit as the response PK). Wiring:
- `UploadRequest` gains `responseId?: string`; `parseMultipart` reads the field; the widget's upload
  call includes it.
- Backward compatible: absent `responseId` → `ResponseDraftID` NULL → correlation falls to the
  session-id path (or lenient-mode distribution scope). Existing widgets keep working during rollout;
  strict mode is enabled once the widget change is deployed.

---

## 9. Orphan GC (bounds the spam-upload vector)

Uploads that never get referenced by a Complete response accumulate (abandoned drafts, and — since
the endpoint accepts a file per open-distribution request — spam uploads). A periodic + on-boot
sweep (same state-derived muscle as binding durability, DG-8):

```
orphans ≡ FormUpload rows, Status='Active', older than FORMS_UPLOAD_TTL,
          with NO FormResponseAnswer.FileID referencing them on a Complete response
  → delete the __mj.File (blob + row) and mark the FormUpload Revoked (audit trail kept).
```

Bound-vs-orphaned is a **query over `FormResponseAnswer`**, not a per-submission status write — so
the happy path never pays bookkeeping cost, and recovery is a query (Kleppmann, matching the binding
spec's posture). TTL default e.g. 7 days; configurable.

---

## 10. Migration / CodeGen / PG

- One migration adds `FormUpload` (SQL Server), CodeGen output appended; the `migrations-pg` twin in
  the same change (G5). Cross-schema FKs to `__mj.File` and `__mj.User`.
- After CodeGen, the generated `mjBizAppsFormsFormUploadEntity` is the type used everywhere — no
  `.Get()/.Set()`, no code against the new columns until CodeGen has run (repo rule).
- mj-sync: the `Form Respondent` grant delta (interim) OR the service-principal seed (target) per §4.

---

## 11. Tests

- **Verification matrix:** unknown FileID rejected; wrong-distribution rejected; correct
  draft-id passes; session-fallback passes when draft id absent but session matches; unattributable
  → strict rejects / lenient strips+logs; revoked rejected; question mismatch soft-logs.
- **Cross-session exfil (the F-SEC-1 regression test):** session A uploads file F; session B submits
  an answer carrying F → rejected. This is the test that would have caught the original hole.
- **Autosave survival:** upload → 3 Partial autosaves → Complete; provenance passes throughout;
  answer delete/re-insert doesn't drop the ledger row.
- **Duplicate-key race:** concurrent submit reconcile path still provenance-checks the winning
  response's answers.
- **Bind-time re-verify:** executor refuses to copy a FileID whose ledger row was revoked after
  submit.
- **GC:** an orphaned upload past TTL is revoked and its File deleted; a bound upload is never GC'd.
- **Upload write fail-closed:** a `FormUpload.Save()` failure fails the upload (no unusable file id
  returned).

---

## 12. Decisions / open questions

- **DG-12a — Ledger writer principal.** Interim anon-role CanCreate grant vs target service
  principal (§4). *Rec: interim to unblock P2.0-a, migrate under the principal in P2.1.*
- **DG-12b — Default provenance mode.** *Rec: `strict` once the widget sends `responseId`; ship
  `lenient` only for the rollout window.*
- **DG-12c — Question-match strictness.** Soft-log (rec) vs hard-fail on `QuestionID` mismatch.
- **DG-12d — Entity name.** `FormUpload` (rec) vs `FormFileUpload`.
- **DG-12e — TTL for orphan GC.** Default 7 days; confirm.

---

## 13. Where this plugs into the plan

- Implements **P2.0-a** (F-SEC-1 fix) and supplies the mechanism **P2.2** references for the
  executor's file-copy re-verification; resolves **DG-12**.
- Interlocks with **F-SEC-2 / P2.0-b**: §4's writer-principal choice is the same decision as F-SEC-2's
  "grant the anon role CanCreate on Files vs move File creation under a principal" — decide them
  together.
- Additive to the verified Phase-1 submit path (G4): the only submit-path change is the pre-insert
  provenance assertion, which rejects/strips foreign files and is a no-op for legitimate uploads.
