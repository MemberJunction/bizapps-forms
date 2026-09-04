# Resume a Partial Response (#138) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A respondent can reopen a half-finished form — on the same device automatically, or on any device through an emailed link — and the server, not a replayable browser header, decides whose draft it is.

**Architecture:** The resume credential is an ordinary `__mj.MagicLinkInvite` whose `ResourceID` is the `FormResponse.ID`. Redeeming it mints a Form Respondent JWT scoped to that one response, so reading the draft becomes row-level security and continuing it becomes one extra clause in the existing ownership rule. Two delivery channels (an `HttpOnly` cookie holding a single-use rotating token; an emailed 25-use link) collapse into that one session shape. No new table, no new token format, no change to MJ core, no change to the frozen submission contracts.

**Tech Stack:** TypeScript (no `strictNullChecks` in `packages/Server`), MJ `6.1.0-edge` entities/RunView/BaseEntity, type-graphql, Express middleware via `BaseServerMiddleware`, Angular 21 standalone custom element, Vitest, Flyway-style SQL migrations, Node `.mjs` smoke scripts.

**Spec:** [`docs/superpowers/specs/2026-09-03-resume-a-partial-response-design.md`](../specs/2026-09-03-resume-a-partial-response-design.md) — read it first; every task below argues from it.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **No `any`.** No `as any`, `: any`, `<any>`, or `unknown` as a lazy alternative. No `BaseEntity.Get()/.Set()` as a substitute for generated types — if a generated type is missing, CodeGen has not run (Task 1).
- **No re-exports between packages.** Import from the source package.
- **`BaseSingleton`** (from `@memberjunction/global`) for any singleton. **No `localStorage`** anywhere (repo rule 8) — the device pointer is an `HttpOnly` cookie and nothing else. **No dynamic `import()`.**
- **Entity access:** `provider.GetEntityObject<T>(name, contextUser)`, never `new`. `RunView` never throws — check `.Success`. `Save()`/`Delete()` return booleans — check them and log `LatestResult.CompleteMessage` (never return it to a respondent). Never spread a `BaseEntity` — use `.GetAll()`.
- **Flat, non-discriminated result shapes** (`{ ok: boolean; value?: T }`) in `packages/Server`: the build config cannot have `strictNullChecks` (it changes `emitDecoratorMetadata`, which type-graphql reads at runtime). A string discriminant narrows under both configs; a boolean literal does not.
- **Migrations:** `migrations/VYYYYMMDDHHMM__v0.12.x__<Description>.sql`; hardcoded UUIDs; no `__mj_*` timestamp columns and no FK indexes (CodeGen adds both); `sp_addextendedproperty` on every business column; new tables/columns in `${flyway:defaultSchema}`; **only `${flyway:defaultSchema}` and `${mjSchema}` may appear in shipped SQL** (`npm run lint:distribution` is the gate, and it scans comments too). `{{ScopeResourceID}}` is MJ's runtime token, not a placeholder — it ships through untouched.
- **Tests:** Vitest, `.spec.ts`, colocated or in a neighbouring `__tests__/`, whichever the touched code already uses. `@memberjunction/test-utils` is **not installed** — hand-rolled fakes (`packages/Server/src/public-submit/__tests__/fakes.ts` is the model). No database in unit tests. Specs are type-checked by `npm run typecheck`.
- **A test that reads source text asserts presence, not behaviour.** Test behaviour through public interfaces. If you add a guard this plan calls load-bearing, add it to `scripts/check-guard-mutants.mjs`.
- **Commands:** `pnpm install` at the repo root only, never inside a package. Per-package build: `cd packages/<Pkg> && pnpm run build`. Root: `pnpm run build`, `npm test`, `npm run typecheck`, `npm run lint:distribution`, `npm run lint:migrations`, `npm run lint:ui`.
- **Never `git commit` without the user explicitly asking**, and never a destructive git operation without approval. Commit steps below say "commit" because they are the plan's natural boundaries — ask before running them if approval has not already been given for the batch.
- **Changeset level:** this PR ships a migration → **`minor`** (`.claude/rules/changesets.md`). Do not raise it further and check no sibling changeset on the branch claims more.
- **Respondent-facing copy** is authored, neutral, and identical for every `410` (never reveals whether a draft exists). Logs carry the response id — never a token, never an email address.
- **Mobile-first, `--mj-*` / `--mjf-*` design tokens, no hardcoded colours** in any new UI (`npm run lint:ui` is the gate).

### Names this plan fixes (use these exactly)

| Symbol | Where it lives | Shape |
|---|---|---|
| `ResumeSnapshot`, `ResumeStatus` | `packages/Entities/src/contracts/resume.ts` | Task 2 |
| `ResponseCaller` | `packages/Server/src/public-submit/persistence.service.ts` | `{ sessionId: string; scopedResponseId?: string }` |
| `responseIsOurs(response, caller)` | same | Task 3 |
| `findScopedResponse(provider, key, contextUser)` | `public-submit/response-lookup.service.ts` | Task 4 |
| `scopeNamesDistribution(scopeResourceId, distributionId)` | `public-submit/scope-response.service.ts` | Task 4 |
| `resolveScopedResponseId(...)` | same | Task 4 |
| `loadResumeSnapshot(provider, scopeResourceId, contextUser)` | `public-submit/resume-snapshot.service.ts` | Task 5 |
| `mintResponseInvite`, `revokeResponseInvites`, `pruneSpentDeviceInvites`, `findInviteByRawToken` | `magic-link/resume-invites.service.ts` | Task 6 |
| `buildResumeCookie`, `clearResumeCookieHeader`, `readResumeCookie`, `RESUME_COOKIE_NAME` | `respondent-host/resume-cookie.ts` | Task 7 |
| `matchResumeRoute(method, path)` | `respondent-host/resume-routes.ts` | Task 8 |
| `runRemember`, `runResume`, `runForget` | `respondent-host/device-resume.service.ts` | Task 8 |
| `RequestResumeLink` mutation | `public-submit/PublicFormResolver.ts` | Task 12 |

---

## File Structure

**New**

| File | Responsibility |
|---|---|
| `migrations/V202609031200__v0.12.x__Resume_Own_Response.sql` | two columns, two new RLS filters, two extended filters, the read grants, postconditions |
| `packages/Entities/src/contracts/resume.ts` | the `ResumeSnapshot` wire shape both ends parse |
| `packages/Entities/src/contracts/answer-date.ts` (modify) | `answerTextFromInstant` — the inverse of `dateAnswerInstant`, for prefill |
| `packages/Server/src/public-submit/scope-response.service.ts` | what the untyped scope claim names (fixed-order, ≤1 read) |
| `packages/Server/src/public-submit/resume-snapshot.service.ts` | the anonymous-user read of one response + its answers |
| `packages/Server/src/magic-link/resume-invites.service.ts` | mint / revoke-by-resource / prune / find-by-token for response-scoped invites |
| `packages/Server/src/respondent-host/resume-cookie.ts` | pure `Set-Cookie` builder + parser |
| `packages/Server/src/respondent-host/resume-routes.ts` | pure route matcher + refusal→view mapping |
| `packages/Server/src/respondent-host/device-resume.service.ts` | the three route bodies, injectable end to end |
| `packages/Server/src/respondent-host/resume-email.service.ts` | mint + CommunicationEngine send + re-send match |
| `packages/Angular/src/lib/widget/core/resume-prefill.ts` | stored answer rows → the widget's answer map |
| `smoke/device-resume-path.mjs`, `smoke/resume-link-path.mjs` | the two live suites |
| `.changeset/<name>.md` | `minor` |

**Modified** — `persistence.service.ts` (caller identity, `FormDistributionID`, write-once source metadata), `submit-pipeline.ts` (scope on the context, the scoped branch, revoke on seal), `response-lookup.service.ts` (`findScopedResponse`), `PublicFormResolver.ts` (`resumeJSON`, `RequestResumeLink`), `graphql-types.ts` (two fields, one input type), `respondent-host/{config,host-page,RespondentHostMiddleware}.ts`, `public-submit/config.ts` (re-send cap), widget `mj-form.component.ts` + `api/{forms-api.interface,forms-api.graphql.service,forms-api.mock.service}.ts`, `package.json` (two smoke scripts).

---

## Task 1: Migration — the two columns, the row filters, the read grants

**Files:**
- Create: `migrations/V202609031200__v0.12.x__Resume_Own_Response.sql`
- Read first: `migrations/V202608131600__v0.10.x__Respondent_Grant_Hardening.sql` (the filter/grant idiom this file continues), `migrations/V202608252340__v0.12.x__Rules_And_Branching.sql` (the ADD COLUMN + extended property idiom)

**Interfaces:**
- Produces: `mjBizAppsFormsFormResponseEntity.FormDistributionID`, `mjBizAppsFormsFormDistributionEntity.AllowDeviceResume` (after CodeGen), and the four filter ids `7F0E0002…`/`7F0E0003…` (extended), `7F0E0004-A1B2-4C3D-8E4F-000000000004`, `7F0E0005-A1B2-4C3D-8E4F-000000000005` (new).

> ⚠️ **Database hazard, read before step 4.** MJ's host serves the MAIN checkout against the shared dev DB. Applying this migration from a worktree desyncs code from data and breaks the host. Apply + CodeGen in the main checkout, or coordinate with the repo owner first. A worktree also has no `.env` — copy it from the main checkout or every `mj` command hits the wrong port.

- [ ] **Step 1: Write the migration**

Header comment must state: why authorization moves onto a real FK rather than `JSON_VALUE(SourceMetadata)`; why every predicate is parenthesised (MJ ANDs the filter onto the caller's predicate, so a bare `OR` binds wrong); why the cast to text is kept (an absent scope substitutes `''`, which against `uniqueidentifier` is a conversion error, not a non-match — the cast makes it fail closed); and that `CanRead` on Form Responses also opens the generated `mjBizAppsFormsFormResponses` query, filtered to exactly one row (review finding 10).

```sql
-- ── The two columns ───────────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[FormResponse]') AND name = N'FormDistributionID')
    ALTER TABLE [${flyway:defaultSchema}].[FormResponse]
        ADD [FormDistributionID] UNIQUEIDENTIFIER NULL
            CONSTRAINT [FK_FormResponse_FormDistribution] FOREIGN KEY
            REFERENCES [${flyway:defaultSchema}].[FormDistribution]([ID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[FormDistribution]') AND name = N'AllowDeviceResume')
    ALTER TABLE [${flyway:defaultSchema}].[FormDistribution]
        ADD [AllowDeviceResume] BIT NOT NULL
            CONSTRAINT [DF_FormDistribution_AllowDeviceResume] DEFAULT (1);
GO

DECLARE @distColumn NVARCHAR(4000) = N'The distribution this response was submitted through, stamped on create. A response-scoped resume session must load the definition of the distribution it came through, and the row-level-security filter that permits that read has to name a real column: putting authorization on JSON_VALUE(SourceMetadata) would make a JSON blob the authorization key. NULL on rows created before resume shipped; those rows are not resumable by either channel.';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = @distColumn,
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormResponse',
    @level2type = N'COLUMN', @level2name = N'FormDistributionID';
GO

DECLARE @switchColumn NVARCHAR(4000) = N'Owner switch for same-device resume on this link. When 1 (default) the respondent host mints a single-use device invite after the first partial save and holds its token in an HttpOnly cookie scoped to /f/<slug>, so reopening the link on the same browser restores the draft. Set 0 for kiosks and shared devices: no device invite is minted and any cookie already held is cleared without being redeemed. It does not affect the emailed resume link.';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = @switchColumn,
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormDistribution',
    @level2type = N'COLUMN', @level2name = N'AllowDeviceResume';
GO
```

Then the four filters — guarded INSERT + absolute UPDATE, exactly as the 0.10.x file does (copy its
comment discipline; each `Description` says what the filter permits and what it deliberately does not):

```sql
-- NEW: the respondent's own response.
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RowLevelSecurityFilter] WHERE ID = '7F0E0004-A1B2-4C3D-8E4F-000000000004')
    INSERT INTO [${mjSchema}].[RowLevelSecurityFilter] (ID, Name, Description, FilterText)
    VALUES ('7F0E0004-A1B2-4C3D-8E4F-000000000004', N'MJ Forms: Respondent Own Response', N'', N'');

UPDATE [${mjSchema}].[RowLevelSecurityFilter]
SET Name        = N'MJ Forms: Respondent Own Response',
    Description = N'The single Form Response a resume session''s magic-link invite was scoped to. A public-link session''s scope is a distribution id, which is the primary key of a different table, so it matches no response row and that session reads zero responses. Note this grant also opens MJ''s generated mjBizAppsFormsFormResponses query to the anonymous role — filtered to exactly this one row, forensics columns (AnonymousSessionID, SourceMetadata) included, which is more than resumeJSON exposes and is accepted deliberately. Cast to text so an absent scope (substituted as the empty string) is an ordinary non-match rather than a conversion error: the filter fails CLOSED.',
    FilterText  = N'(CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}'')'
WHERE ID = '7F0E0004-A1B2-4C3D-8E4F-000000000004';
GO
```

`7F0E0005…` is the same shape on `MJ_BizApps_Forms: Form Response Answers` with
`FilterText = N'(CAST(ResponseID AS NVARCHAR(450)) = ''{{ScopeResourceID}}'')'`.

The two EXTENDED filters keep their ids and gain one clause each:

```sql
UPDATE [${mjSchema}].[RowLevelSecurityFilter]
SET FilterText = N'(CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}'' OR ID IN (SELECT FormDistributionID FROM [${flyway:defaultSchema}].vwFormResponses WHERE CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}''))'
WHERE ID = '7F0E0002-A1B2-4C3D-8E4F-000000000002';   -- Respondent Own Distribution
GO

UPDATE [${mjSchema}].[RowLevelSecurityFilter]
SET FilterText = N'(FormID IN (SELECT FormID FROM [${flyway:defaultSchema}].vwFormDistributions WHERE CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}'') OR ID IN (SELECT FormVersionID FROM [${flyway:defaultSchema}].vwFormResponses WHERE CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}''))'
WHERE ID = '7F0E0003-A1B2-4C3D-8E4F-000000000003';   -- Respondent Own Form Versions
GO
```

Also UPDATE both `Description`s so they describe the two-scope reality rather than the
one-scope claim they carry today.

Then the grants — set-based, matching on (role name, entity name), never on a permission-row id
(the 0.10.x file explains why: `EntityPermission` has no unique constraint on the pair, and the
role may have been adopted under a foreign id):

```sql
DECLARE @ReadContract TABLE (EntityName NVARCHAR(255) NOT NULL PRIMARY KEY, FilterID UNIQUEIDENTIFIER NOT NULL, Fact NVARCHAR(200) NOT NULL);
INSERT INTO @ReadContract VALUES
    (N'MJ_BizApps_Forms: Form Responses',        '7F0E0004-A1B2-4C3D-8E4F-000000000004', N'SCOPE-FILTERED READ on Form Responses'),
    (N'MJ_BizApps_Forms: Form Response Answers', '7F0E0005-A1B2-4C3D-8E4F-000000000005', N'SCOPE-FILTERED READ on Form Response Answers');

UPDATE p
SET p.CanRead = 1, p.ReadRLSFilterID = c.FilterID
FROM [${mjSchema}].[EntityPermission] p
JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
JOIN @ReadContract          c ON c.EntityName = e.Name
WHERE r.Name = N'Form Respondent';
```

Finish with two postconditions in the 0.10.x style: (1) every row in `@ReadContract` is present with
`CanRead = 1 AND ReadRLSFilterID IS NOT NULL` — `THROW 51113` naming the missing fact and saying the
0.8.0 seed is what creates the permission row, so a miss means the seed did not run; (2) re-assert the
"no unfiltered create or read on any `MJ[_]BizApps[_]Forms: %` entity for this role" invariant —
`THROW 51114` — because this file has just added read grants and `UserExemptFromRowLevelSecurity`
returns TRUE on the FIRST unfiltered row it finds.

- [ ] **Step 2: Lint the shipped SQL**

Run: `npm run lint:distribution && npm run lint:migrations`
Expected: both clean. If `lint:distribution` flags a placeholder, you wrote a third `${…}` form (only `${flyway:defaultSchema}` and `${mjSchema}` are allowed) — including in a comment.

- [ ] **Step 3: Prove idempotency without touching the shared database**

Run the file twice against a scratch database (or a restored copy). Expected: the second run
changes nothing and throws nothing. The guards are the `IF NOT EXISTS` column checks and the
INSERT-if-missing/absolute-UPDATE filter pairs.

- [ ] **Step 4: Apply and run CodeGen** *(see the hazard note above)*

```bash
pnpm run mj:migrate
pnpm run mj:codegen
```
Expected: `packages/Entities/src/generated/entity_subclasses.ts` now declares
`FormDistributionID` on the response entity and `AllowDeviceResume` on the distribution entity.
Append the CodeGen output to the migration under a `-- CodeGen output (appended)` banner, exactly
as `V202608252340` does — without the `EntityField` row, `BaseEntity` silently drops the value on
every save.

- [ ] **Step 5: Build and commit**

```bash
cd packages/Entities && pnpm run build && cd ../..
git add migrations/V202609031200__v0.12.x__Resume_Own_Response.sql packages/Entities/src/generated
git commit -m "feat(migration): a response knows its distribution, and a scoped session may read its own draft"
```

---

## Task 2: The `ResumeSnapshot` contract, and the inverse of the date parse

**Files:**
- Create: `packages/Entities/src/contracts/resume.ts`
- Create: `packages/Entities/src/contracts/resume.spec.ts`
- Modify: `packages/Entities/src/contracts/index.ts` (add `export * from './resume';`)
- Modify: `packages/Entities/src/contracts/answer-date.ts` + its spec

**Interfaces:**
- Consumes: `StoredAnswerRow`, `mjBizAppsFormsFormResponseEntity['Status']` (existing contract).
- Produces: `ResumeSnapshot` (Tasks 5, 10, 12), `answerTextFromInstant` (Task 10).

- [ ] **Step 1: Write the failing test for the snapshot shape lock**

`resume.spec.ts` — the snapshot is a wire contract two packages parse, so pin its field set the way
`submission-mapping.spec.ts` pins the submission input:

```ts
import { describe, it, expect } from 'vitest';
import { RESUME_SNAPSHOT_FIELDS, type ResumeSnapshot } from './resume';

describe('ResumeSnapshot', () => {
  it('carries exactly the fields both ends agree on', () => {
    const snapshot: ResumeSnapshot = {
      responseId: '9DA322E6-0000-4000-8000-000000000001',
      status: 'Partial',
      formVersionId: '33910B9E-0000-4000-8000-000000000002',
      startedAt: '2026-09-03T10:00:00.000Z',
      answers: [{ QuestionID: 'Q1', TextValue: 'Ada' }],
    };
    expect(Object.keys(snapshot).sort()).toEqual([...RESUME_SNAPSHOT_FIELDS].sort());
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/Entities && npx vitest run src/contracts/resume.spec.ts`
Expected: FAIL — `Cannot find module './resume'`.

- [ ] **Step 3: Write `resume.ts`**

```ts
/**
 * What a resumed session is handed back for a draft it owns — the ONE shape both ends parse.
 *
 * The answers are the STORED rows (`StoredAnswerRow`, PascalCase columns) rather than the
 * transport's `FormAnswerInput` spelling, deliberately: this is a read of the database, the
 * contract already carries `collapseAnswer` for that shape, and inventing a third spelling of an
 * answer would be a third place for the six typed columns to drift.
 *
 * It is delivered as a JSON STRING on `PublishedFormType.resumeJSON`, the same way the definition
 * travels, so the GraphQL schema does not duplicate — and drift from — this tree.
 */
import type { mjBizAppsFormsFormResponseEntity } from '../generated/entity_subclasses';
import type { StoredAnswerRow } from './answer-canonical';

/** The persisted status of the draft being resumed. Derived, never restated (CHECK constraint). */
export type ResumeStatus = mjBizAppsFormsFormResponseEntity['Status'];

export interface ResumeSnapshot {
  /** The row's own id. The widget ADOPTS this as its clientResponseId, which is what makes every
   *  later save land on this row and what keeps the file-provenance ledger's proof matching. */
  responseId: string;
  /** `Partial` resumes; anything terminal is a SEALED screen, decided at mount and never learned
   *  from a save (the pipeline answers a partial against a sealed row with success: true). */
  status: ResumeStatus;
  /** The version the row was created on — may be RETIRED; the first save re-stamps the current one. */
  formVersionId: string;
  /** The first sitting's start instant, preserved across resumes. */
  startedAt?: string;
  answers: StoredAnswerRow[];
}

/** The exact top-level field set of {@link ResumeSnapshot}; pinned by its spec. */
export const RESUME_SNAPSHOT_FIELDS: readonly (keyof ResumeSnapshot)[] = [
  'responseId',
  'status',
  'formVersionId',
  'startedAt',
  'answers',
] as const;
```

Add `export * from './resume';` to `packages/Entities/src/contracts/index.ts`.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd packages/Entities && npx vitest run src/contracts/resume.spec.ts` → PASS.

- [ ] **Step 5: Write the failing round-trip test for the date inverse**

Prefill has to put a stored `DATETIMEOFFSET` back into the widget's answer map in the SPELLING the
question's control emits — `'14:30'` for a `Time`, an ISO instant for a `DateTime`. Guessing that
encoding is how `new Date('14:30')` reached production (#116), so prove it instead. In
`packages/Entities/src/contracts/answer-date.spec.ts`:

```ts
import { answerTextFromInstant, dateAnswerInstant } from './answer-date';

describe('answerTextFromInstant', () => {
  it.each([
    ['Time', '14:30'],
    ['Date', '2026-09-03'],
    ['DateTime', '2026-09-03T14:30:00.000Z'],
  ] as const)('round-trips a %s answer', (type, text) => {
    const instant = dateAnswerInstant(type, text);
    expect(instant).toBeInstanceOf(Date);
    expect(answerTextFromInstant(type, instant as Date)).toBe(text);
  });

  it('answers undefined for a value it cannot round-trip', () => {
    expect(answerTextFromInstant('Time', new Date('nonsense'))).toBeUndefined();
  });
});
```

> Read `dateAnswerInstant` before implementing: the inverse must undo exactly what it does (which
> anchor date a `Time` is stored against, and in which zone). If the round trip cannot be made exact
> for a type, return `undefined` for that type and let prefill skip those questions rather than
> putting a wrong-looking value in front of the respondent. Say so in the JSDoc.

- [ ] **Step 6: Run, implement, run**

Run: `cd packages/Entities && npx vitest run src/contracts/answer-date.spec.ts` → FAIL, then implement
`answerTextFromInstant` beside `dateAnswerInstant`, then → PASS.

- [ ] **Step 7: Build, typecheck, commit**

```bash
cd packages/Entities && pnpm run build && npx vitest run && cd ../..
npm run typecheck
git add packages/Entities/src/contracts
git commit -m "feat(contract): a resumed draft has a wire shape, and a stored date has a way back"
```

---

## Task 3: The ownership rule takes a caller, not a header

**Files:**
- Modify: `packages/Server/src/public-submit/persistence.service.ts` (`responseIsOurs`, `refuseIfNotOurs`, `applyResponseIdentity`, `PersistenceInputs`)
- Modify: `packages/Server/src/public-submit/submit-pipeline.ts` (the one `responseIsOurs` call in `checkDuplicate`, and the `persistSubmission` call site)
- Test: `packages/Server/src/public-submit/__tests__/session-ownership.spec.ts` (extend), `packages/Server/src/public-submit/__tests__/response-scope-ownership.spec.ts` (new)

**Interfaces:**
- Produces: `ResponseCaller`, `responseIsOurs(response: Pick<mjBizAppsFormsFormResponseEntityType, 'ID' | 'AnonymousSessionID'>, caller: ResponseCaller): boolean`; `PersistenceInputs` gains `scopedResponseId?: string`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

`__tests__/response-scope-ownership.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { responseIsOurs } from '../persistence.service';

const ROW = { ID: '9DA322E6-0000-4000-8000-000000000001', AnonymousSessionID: 's1' };

describe('responseIsOurs with a response-scoped caller', () => {
  it('admits the session that owns the row, as before', () => {
    expect(responseIsOurs(ROW, { sessionId: 's1' })).toBe(true);
  });

  it('admits a caller whose JWT scope names this row, whatever header they sent', () => {
    expect(responseIsOurs(ROW, { sessionId: 's2', scopedResponseId: ROW.ID })).toBe(true);
    expect(responseIsOurs(ROW, { sessionId: '', scopedResponseId: ROW.ID })).toBe(true);
  });

  it('compares the scope case-insensitively, because SQL Server returns a GUID uppercased', () => {
    expect(responseIsOurs(ROW, { sessionId: '', scopedResponseId: ROW.ID.toLowerCase() })).toBe(true);
  });

  it('refuses a scope that names a DIFFERENT row', () => {
    expect(responseIsOurs(ROW, { sessionId: 's2', scopedResponseId: '00000000-0000-4000-8000-000000000009' })).toBe(false);
  });

  it('refuses an absent scope exactly as it refuses a wrong header', () => {
    expect(responseIsOurs(ROW, { sessionId: 's2' })).toBe(false);
    expect(responseIsOurs(ROW, { sessionId: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Server && npx vitest run src/public-submit/__tests__/response-scope-ownership.spec.ts`
Expected: FAIL — `responseIsOurs` still takes a string.

- [ ] **Step 3: Change the rule**

```ts
/**
 * WHO is asking. Two credentials, and the difference between them is the whole of #138: the
 * session id is a header the caller chooses and can replay, while `scopedResponseId` comes off the
 * verified JWT (`UserInfo.MagicLinkScope.ResourceID`) and names exactly one row.
 *
 * An OBJECT rather than two string parameters because two strings are interchangeable to the
 * compiler, and transposing them here inverts the gate silently — the same reason this function
 * takes the row rather than its owner column.
 */
export interface ResponseCaller {
  readonly sessionId: string;
  readonly scopedResponseId?: string;
}

export function responseIsOurs(
  response: Pick<mjBizAppsFormsFormResponseEntityType, 'ID' | 'AnonymousSessionID'>,
  caller: ResponseCaller,
): boolean {
  const owner = foldSessionId(response.AnonymousSessionID);
  if (owner === '' || owner === foldSessionId(caller.sessionId)) {
    return true;
  }
  // The new clause. Folded the same way the owner is, because SQL Server hands a uniqueidentifier
  // back uppercased while MJ mints it lowercased client-side — the case mismatch that once refused
  // every anonymous submission with `version-mismatch`.
  return caller.scopedResponseId !== undefined && foldSessionId(response.ID) === foldSessionId(caller.scopedResponseId);
}
```

`refuseIfNotOurs` builds the caller from `inputs`: `{ sessionId: inputs.sessionId, scopedResponseId: inputs.scopedResponseId }`. Add `scopedResponseId?: string` to `PersistenceInputs` with a JSDoc saying it is the JWT-carried response scope and is never taken from the request body. Update `checkDuplicate`'s call in `submit-pipeline.ts` to `responseIsOurs(byId.response, { sessionId: ctx.sessionId, scopedResponseId: ctx.scopedResponseId })` (the field arrives in Task 4; for now thread `undefined` and let Task 4 populate it).

- [ ] **Step 4: Stamp the distribution, and stop rewriting the first sitting**

In `applyResponseIdentity`, beside the write-once owner stamp:

```ts
  // WRITE-ONCE, like the owner beside it. The FK is the authorization key a resumed session reads
  // its own distribution through, so a later save must not be able to move a row to another link.
  if (!response.FormDistributionID) {
    response.FormDistributionID = inputs.distributionId;
  }
  // The FIRST sitting's facts, kept (review finding 9). These used to be rewritten on every save,
  // so after a resume the row said it started at the second sitting and carried the second
  // session's metadata while the owner column still named the first. The client-id proof stays
  // correct because the widget adopts the row id, which IS the first sitting's client id.
  if (foldSessionId(response.AnonymousSessionID) === '') {
    response.AnonymousSessionID = foldSessionId(inputs.sessionId);
    if (inputs.startedAt) {
      response.StartedAt = new Date(inputs.startedAt);
    }
    response.SourceMetadata = JSON.stringify(inputs.sourceMetadata);
  }
```

Extend `session-ownership.spec.ts` with: a second save from a different session under a matching
scope leaves `StartedAt` and `SourceMetadata` unchanged and stamps `FormDistributionID` only once.

- [ ] **Step 5: Run the package suite**

Run: `cd packages/Server && npx vitest run && cd ../.. && npm run typecheck`
Expected: PASS. Existing ownership specs that passed a bare string must be updated to the object —
that is the change, not a break.

- [ ] **Step 6: Commit**

```bash
git add packages/Server/src/public-submit
git commit -m "feat(server): ownership asks who is calling, and a row remembers which link it came through"
```

---

## Task 4: What the scope claim names, and the scoped row winning explicitly

**Files:**
- Create: `packages/Server/src/public-submit/scope-response.service.ts` + `__tests__/scope-response.service.spec.ts`
- Modify: `packages/Server/src/public-submit/response-lookup.service.ts` (add `findScopedResponse`)
- Modify: `packages/Server/src/public-submit/submit-pipeline.ts` (`PipelineContext.scopeResourceId`, `resolveExistingPartial`, the hint-mismatch refusal)
- Modify: `packages/Server/src/public-submit/PublicFormResolver.ts` (pass the scope onto the context)
- Test: `__tests__/submit-pipeline-scoped-resume.spec.ts` (new), `__tests__/submit-pipeline-partial-cap.spec.ts` (extend)

**Interfaces:**
- Consumes: `ResponseCaller` (Task 3), `RESUMABLE_RESPONSE_STATUSES`.
- Produces: `scopeNamesDistribution(scopeResourceId: string | undefined, distributionId: string): boolean`; `resolveScopedResponseId(provider, args, contextUser): Promise<{ ok: boolean; responseId?: string }>`; `findScopedResponse(provider, { responseId }, contextUser): Promise<ResponseLookupResult>`; `PipelineContext.scopeResourceId?: string`; `PipelineContext.scopedResponseId?: string` (resolved inside the pipeline).

- [ ] **Step 1: Write the failing test for scope classification**

```ts
import { describe, it, expect } from 'vitest';
import { scopeNamesDistribution } from '../scope-response.service';

const DIST = 'D1111111-0000-4000-8000-000000000001';

describe('scopeNamesDistribution', () => {
  it('is the ordinary public link when the claim is this distribution', () => {
    expect(scopeNamesDistribution(DIST, DIST)).toBe(true);
    expect(scopeNamesDistribution(DIST.toLowerCase(), DIST)).toBe(true);
  });

  it('is not, for a claim naming anything else — including nothing', () => {
    expect(scopeNamesDistribution('R2222222-0000-4000-8000-000000000002', DIST)).toBe(false);
    expect(scopeNamesDistribution(undefined, DIST)).toBe(false);
    expect(scopeNamesDistribution('', DIST)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Server && npx vitest run src/public-submit/__tests__/scope-response.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

```ts
/**
 * What the one untyped scope claim names.
 *
 * `mj_scopes[].resourceId` carries a distribution id today, a FormResponse id for a resume link,
 * and (once #137 lands) a FormDistributionRecipient id — in ONE claim, because the pinned core's
 * `RedeemInvite` passes only `resourceId` and never populates `ResourceType`.
 *
 * Resolved in a FIXED ORDER rather than by type, and the order is chosen so the public path pays
 * nothing: the distribution id is already in hand from the definition load, so a public-link
 * session is settled by a string comparison and never reaches the database. Only a claim that is
 * NOT this distribution costs one narrow read. A claim that is neither (a #137 recipient id, a
 * stale id) misses and the request behaves exactly as it does today.
 *
 * When core learns to populate `ResourceType` (follow-up 4), this collapses into a switch and the
 * read disappears. Until then this is the whole of the dispatch, in one place, so there is no
 * second spelling of it to drift.
 */
export function scopeNamesDistribution(scopeResourceId: string | undefined, distributionId: string): boolean {
  const scope = (scopeResourceId ?? '').trim().toLowerCase();
  return scope !== '' && scope === distributionId.trim().toLowerCase();
}

export async function resolveScopedResponseId(
  provider: DefinitionRunViewProvider,
  args: { scopeResourceId?: string; distributionId: string },
  contextUser: UserInfo,
): Promise<{ ok: boolean; responseId?: string }> {
  const scope = (args.scopeResourceId ?? '').trim();
  if (scope === '' || scopeNamesDistribution(scope, args.distributionId)) {
    return { ok: true };
  }
  const found = await findScopedResponse(provider, { responseId: scope }, contextUser);
  if (!found.ok) {
    // The lookup itself failed. Fail SOFT to "no scope": the caller then behaves as an ordinary
    // public-link session, which writes a fresh row rather than adopting an unverified one. The
    // write gate is unchanged either way — `responseIsOurs` still refuses a foreign row.
    return { ok: false };
  }
  return { ok: true, responseId: found.response?.ID };
}
```

`findScopedResponse` in `response-lookup.service.ts` — **no version filter and no SourceMetadata
proof**, and the JSDoc must say why: the JWT is the proof (a scoped session was minted from an
invite whose `ResourceID` is this row), and a draft whose form has been republished must still be
found, which is decision 7's whole point.

```ts
export async function findScopedResponse(
  provider: DefinitionRunViewProvider,
  key: { responseId: string },
  contextUser: UserInfo,
): Promise<ResponseLookupResult> {
  if (!key.responseId) {
    return { ok: true, response: undefined };
  }
  const result = await provider.RunView<mjBizAppsFormsFormResponseEntityType>(
    {
      EntityName: FORM_RESPONSE_ENTITY,
      ExtraFilter:
        `ID=${quoteSqlString(key.responseId)} ` +
        `AND Status IN (${RESUMABLE_RESPONSE_STATUSES.map(quoteSqlString).join(', ')})`,
      ResultType: 'entity_object',
      MaxRows: 1,
    },
    contextUser,
  );
  return result.Success ? { ok: true, response: result.Results[0] } : { ok: false };
}
```

- [ ] **Step 4: Write the failing pipeline tests**

`__tests__/submit-pipeline-scoped-resume.spec.ts`, driven by the existing fakes in
`__tests__/fakes.ts`:

```ts
it('updates the scoped row in place, without a duplicate-key collision', async () => {
  // A resumed session: new x-session-id, scope naming the row S1 owns.
  const result = await runSubmitPipeline(ctxWithScope(ROW_ID, { sessionId: 's2' }), partialSubmission());
  expect(result.success).toBe(true);
  expect(result.responseId).toBe(ROW_ID);
  expect(fakes.inserts).toHaveLength(0);          // no failed INSERT, no regex over SQL error text
  expect(fakes.updatedRowIds).toEqual([ROW_ID]);
});

it('does not charge a resumed autosave against the per-version draft ceiling', async () => {
  // The bug this pins: `partialCapExceeded` runs whenever no existing partial was resolved, so a
  // resumed save that missed the lookup was refused on a saturated form while adding no row.
  fakes.partialCount = 10_000;
  const result = await runSubmitPipeline(ctxWithScope(ROW_ID, { sessionId: 's2' }), partialSubmission());
  expect(result.success).toBe(true);
});

it('refuses a responseId hint the scope does not cover, and writes nothing', async () => {
  const result = await runSubmitPipeline(
    ctxWithScope(ROW_ID, { sessionId: 's2' }),
    { ...partialSubmission(), clientResponseId: OTHER_ROW_ID },
  );
  expect(result.success).toBe(false);
  expect(fakes.writes).toHaveLength(0);
});

it('ignores the version filter, so a draft on a retired version still resolves', async () => {
  fakes.rowVersionId = 'V1';
  const result = await runSubmitPipeline(ctxWithScope(ROW_ID, { sessionId: 's2', versionId: 'V2' }), partialSubmission());
  expect(result.responseId).toBe(ROW_ID);
});
```

- [ ] **Step 5: Run them to verify they fail**

Run: `cd packages/Server && npx vitest run src/public-submit/__tests__/submit-pipeline-scoped-resume.spec.ts`
Expected: FAIL — the scoped branch does not exist; the first case falls through to CREATE and collides.

- [ ] **Step 6: Wire the pipeline**

In `PipelineContext` add `scopeResourceId?: string` with a JSDoc explaining it is the verified JWT
claim (unlike `sessionId` beside it, which is a header the caller chose). In
`PublicFormResolver.submitResponse`, pass `scopeResourceId: contextUser.MagicLinkScope?.ResourceID`.

In `runSubmitPipelineInner`, immediately after the definition resolves (so `distribution.ID` is in
hand) and **before** the dedupe gate:

```ts
  // WHOSE session this is, settled once. Everything downstream — dedupe's ownership question, the
  // row this save updates, and the write gate — reads this one value rather than re-deriving it.
  const scoped = await resolveScopedResponseId(
    ctx.provider,
    { scopeResourceId: ctx.scopeResourceId, distributionId: resolved.distribution.ID },
    ctx.elevatedUser,
  );
  const scopedResponseId = scoped.responseId;
```

Give `resolveExistingPartial` the explicit branch, at the TOP:

```ts
  // THE SCOPED ROW WINS, explicitly. Without this branch a resumed save missed all three lookups
  // (every one of them filters FormVersionID, and the owner column still names the first sitting),
  // fell through to CREATE at the row's own id, collided on the primary key, and was rescued by
  // `reconcileDuplicate` — a recovery that depends on a REGEX over the driver's error text and
  // issues a failed INSERT on every autosave. It also left `partialCapExceeded` counting a resumed
  // autosave as a new draft, so a saturated form refused a save that adds no row.
  if (scopedResponseId) {
    const scopedRow = await findScopedResponse(ctx.provider, { responseId: scopedResponseId }, ctx.elevatedUser);
    if (scopedRow.ok && scopedRow.response) {
      return { response: scopedRow.response };
    }
  }
```

and the hint refusal, in `runSubmitPipelineInner` right after `scopedResponseId` is settled:

```ts
  // A scoped session naming SOMEBODY ELSE'S id. The hint is ignored for row selection above, so
  // this would otherwise write to the caller's own row and answer success — which is not what a
  // caller who named a different row asked for, and reads as the row having been updated. Refused
  // with the one sentence every ownership failure gets. A resumed widget always adopts the row id
  // (it re-reads `resumeJSON` on every load, including a retry), so no real client reaches this.
  if (scopedResponseId && submission.clientResponseId &&
      submission.clientResponseId.trim().toLowerCase() !== scopedResponseId.trim().toLowerCase()) {
    return report(fail(FOREIGN_RESPONSE_MESSAGE));
  }
```

Export `FOREIGN_RESPONSE_MESSAGE` from `persistence.service.ts` so both sites use one sentence.
Thread `scopedResponseId` into the `persistSubmission` inputs and into `checkDuplicate`'s
`responseIsOurs` call.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd packages/Server && npx vitest run && cd ../.. && npm run typecheck`
Expected: PASS, including the untouched `submit-pipeline*.spec.ts` files — a public-link submission
must be byte-for-byte unchanged (no scope → no extra read, no new branch taken).

- [ ] **Step 8: Commit**

```bash
git add packages/Server/src/public-submit
git commit -m "feat(server): a response-scoped session resolves its own draft, on any version"
```

---

## Task 5: `resumeJSON` — the anonymous read of your own draft

**Files:**
- Create: `packages/Server/src/public-submit/resume-snapshot.service.ts` + `__tests__/resume-snapshot.service.spec.ts`
- Modify: `packages/Server/src/public-submit/graphql-types.ts` (`PublishedFormType.resumeJSON`)
- Modify: `packages/Server/src/public-submit/PublicFormResolver.ts`
- Modify (widget side): `packages/Angular/src/lib/widget/api/forms-api.interface.ts`, `forms-api.graphql.service.ts`, `forms-api.mock.service.ts`

**Interfaces:**
- Consumes: `ResumeSnapshot` (Task 2), `scopeNamesDistribution` (Task 4).
- Produces: `loadResumeSnapshot(provider, scopeResourceId, contextUser): Promise<ResumeSnapshot | undefined>`; `PublishedFormType.resumeJSON?: string`; `IFormsApiService.loadPublishedForm(slug): Promise<PublishedFormLoad | null>` where `PublishedFormLoad = { definition: PublishedFormDefinition; resume?: ResumeSnapshot }`.

- [ ] **Step 1: Write the failing test**

```ts
describe('loadResumeSnapshot', () => {
  it('returns the row and its answers for a session scoped to it', async () => {
    const provider = fakeProvider({
      responses: [{ ID: ROW_ID, Status: 'Partial', FormVersionID: 'V1', StartedAt: '2026-09-03T10:00:00.000Z' }],
      answers: [{ QuestionID: 'Q1', TextValue: 'Ada' }],
    });
    const snapshot = await loadResumeSnapshot(provider, ROW_ID, anonymousUser);
    expect(snapshot).toEqual({
      responseId: ROW_ID, status: 'Partial', formVersionId: 'V1',
      startedAt: '2026-09-03T10:00:00.000Z', answers: [{ QuestionID: 'Q1', TextValue: 'Ada' }],
    });
  });

  it('returns undefined when the row filter answers zero rows — the public-link case', async () => {
    expect(await loadResumeSnapshot(fakeProvider({ responses: [] }), DIST_ID, anonymousUser)).toBeUndefined();
  });

  it('returns undefined, and never throws, when the read fails', async () => {
    expect(await loadResumeSnapshot(failingProvider(), ROW_ID, anonymousUser)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Server && npx vitest run src/public-submit/__tests__/resume-snapshot.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement the service**

Two `RunView`s under the **anonymous** `contextUser` — that is the design, not an oversight: the
row-level-security filters added in Task 1 are the gate, and running this under the elevated user
would move the gate into application code where the read path and the write rule could disagree.
Say that in the header. `RunView` never throws — check `.Success` and log a failure with the scope
id (never the token).

- [ ] **Step 4: Expose it**

`graphql-types.ts`:

```ts
  @Field({ nullable: true, description:
    'JSON-encoded ResumeSnapshot for a session whose magic-link scope names a Form Response — the ' +
    'draft this respondent may continue. Null for an ordinary public-link session, whose scope is a ' +
    'distribution id and therefore matches no response row under the read filter.' })
  resumeJSON?: string;
```

`PublicFormResolver.PublishedForm`, after the definition resolves:

```ts
      // Only a claim that is not this distribution can name a response, so an ordinary public link
      // pays nothing here — see `scopeNamesDistribution`.
      const scope = contextUser.MagicLinkScope?.ResourceID;
      const resume = scope && !scopeNamesDistribution(scope, loaded.value.distribution.ID)
        ? await loadResumeSnapshot(provider, scope, contextUser)
        : undefined;
```

and set `resumeJSON: resume ? JSON.stringify(resume) : undefined`.

- [ ] **Step 5: Carry it to the widget transport**

`forms-api.interface.ts` — `loadPublishedForm` now resolves `PublishedFormLoad | null`. Update the
GraphQL service (select `resumeJSON`, parse it), the mock service (`resume: undefined`), and every
caller. Document in the interface why the resume rides the load rather than a second call: it is
decided by the same session that resolved the definition, and a second round trip could observe a
different one.

- [ ] **Step 6: Run everything**

Run: `cd packages/Server && npx vitest run && cd ../Angular && npx vitest run && cd ../.. && npm run typecheck`
Expected: PASS. The widget component still compiles because Task 10 has not changed its behaviour
yet — adjust only the call site's destructuring here.

- [ ] **Step 7: Commit**

```bash
git add packages/Server/src/public-submit packages/Angular/src/lib/widget/api
git commit -m "feat(server): PublishedForm returns the draft a scoped session owns"
```

---

## Task 6: Response-scoped invites — mint, rotate, revoke by resource, prune

**Files:**
- Create: `packages/Server/src/magic-link/resume-invites.service.ts` + `__tests__/resume-invites.service.spec.ts`
- Read first: `packages/Server/src/magic-link/MagicLinkInviteMinter.ts`, `token.ts`

**Interfaces:**
- Consumes: `MagicLinkInviteMinter.MintAnonymousInvite` / `RevokeAnonymousInvite`, `hashToken`, `getMagicLinkProvisioningConfig()` (`applicationName`, `roleName`), `FORM_RESPONSE_ENTITY`.
- Produces:
  - `mintResponseInvite(params: { responseId: string; channel: 'device' | 'email'; email?: string; closeAt?: Date | null }, contextUser): Promise<{ ok: boolean; inviteId?: string; rawToken?: string; expiresAt?: Date; message?: string }>`
  - `revokeResponseInvites(responseId: string, opts: { deviceOnly: boolean }, contextUser): Promise<{ revoked: number; failed: number }>`
  - `findInviteByRawToken(rawToken: string, contextUser): Promise<{ ok: boolean; inviteId?: string; resourceId?: string; status?: string }>`
  - `pruneSpentDeviceInvites(responseId: string, contextUser): Promise<void>`

- [ ] **Step 1: Establish whether a spent invite can be deleted**

Run against the dev database (read-only):

```sql
SELECT fk.name, OBJECT_NAME(fk.parent_object_id) AS ChildTable
FROM sys.foreign_keys fk
WHERE fk.referenced_object_id = OBJECT_ID('__mj.MagicLinkInvite');
```

- **If a child table references it** (an audit/use table): `pruneSpentDeviceInvites` does **not**
  delete. It logs once per response at `LogStatus` and returns — and its JSDoc records the finding
  and points at follow-up 1. Growth stays one row per sitting.
- **If nothing references it:** prune deletes this response's `Consumed`/`Expired` invites with
  `Email IS NULL`, capped at `MAX_PRUNE = 50` rows per call, each `Delete()` boolean checked and a
  failure logged and swallowed (a prune is never allowed to fail a save).

Either way, write the outcome into the file's header so the next reader does not repeat the query.

- [ ] **Step 2: Write the failing tests**

```ts
describe('mintResponseInvite', () => {
  it('mints a device invite: one use, no email, expiry capped at the link close date', async () => {
    const closeAt = new Date('2026-09-10T00:00:00.000Z');   // sooner than 15 days
    const result = await mintResponseInvite({ responseId: ROW_ID, channel: 'device', closeAt }, user);
    expect(minter.lastParams).toMatchObject({
      resourceTypeName: 'MJ_BizApps_Forms: Form Responses',
      resourceId: ROW_ID, maxUses: 1, expiresAt: closeAt,
    });
    expect(result.rawToken).toMatch(/^mj_ml_[0-9a-f]{64}$/);
  });

  it('mints an email invite with the configured uses and the address recorded', async () => {
    const result = await mintResponseInvite({ responseId: ROW_ID, channel: 'email', email: 'a@b.test' }, user);
    expect(minter.lastParams).toMatchObject({ maxUses: 25 });
    expect(result.ok).toBe(true);
  });
});

describe('revokeResponseInvites', () => {
  it('revokes every Active invite for the response on submit', async () => {
    expect(await revokeResponseInvites(ROW_ID, { deviceOnly: false }, user)).toEqual({ revoked: 2, failed: 0 });
  });

  it('revokes ONLY the device invites for a start-over, so the owner keeps their emailed link', async () => {
    // "Not you? Start over" is pressed by somebody who is NOT the owner — on a shared device, by
    // definition. Killing the owner's emailed link from there would be a stranger revoking their
    // access to their own draft.
    await revokeResponseInvites(ROW_ID, { deviceOnly: true }, user);
    expect(minter.revoked).toEqual([DEVICE_INVITE_ID]);
  });
});

describe('findInviteByRawToken', () => {
  it('matches on the hash, never on the raw token', async () => {
    await findInviteByRawToken(RAW, user);
    expect(rv.lastFilter).toContain(hashToken(RAW));
    expect(rv.lastFilter).not.toContain(RAW);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd packages/Server && npx vitest run src/magic-link/__tests__/resume-invites.service.spec.ts` → FAIL.

- [ ] **Step 4: Implement**

- `mintResponseInvite` composes `MintAnonymousInviteParams` from `getMagicLinkProvisioningConfig()`
  plus the channel's numbers from config (Task 7): device `maxUses: 1`, `expiresAt = earliest(closeAt, now + deviceResumeDays)`; email `maxUses: resumeLinkMaxUses`, `earliest(closeAt, now + resumeLinkDays)`. `Email` is set through the minter for the email channel only — extend
  `MintAnonymousInviteParams` with an optional `email` and have `createInviteRecord` assign
  `invite.Email` when present (the one change to the minter, per the spec's coupling list).
- `revokeResponseInvites` — `RunView` on `MJ: Magic Link Invites`, `ResourceID = <id> AND Status = 'Active'`, plus `AND Email IS NULL` when `deviceOnly`, then `RevokeAnonymousInvite({ inviteId, resourceId }, contextUser)` per row. **This is why the "revoke by token" core follow-up is not needed** — say so in the header.
- `findInviteByRawToken` — `TokenHash = hashToken(rawToken)`, `MaxRows: 1`, returns ids only, never the token; used by `/remember` to compare the incoming cookie's `ResourceID`.

- [ ] **Step 5: Run, typecheck**

Run: `cd packages/Server && npx vitest run && cd ../.. && npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/Server/src/magic-link packages/CoreEntitiesServer/src
git commit -m "feat(server): a response can be given, and taken back, a magic-link credential"
```

---

## Task 7: The cookie, and the knobs

**Files:**
- Create: `packages/Server/src/respondent-host/resume-cookie.ts` + `__tests__/resume-cookie.spec.ts`
- Modify: `packages/Server/src/respondent-host/config.ts` + `__tests__` (new spec if none exists)
- Modify: `packages/Server/src/public-submit/config.ts` (the re-send cap, review finding 8)

**Interfaces:**
- Produces: `RESUME_COOKIE_NAME = 'mjf_resume'`; `buildResumeCookie(args: { token: string; slug: string; maxAgeSeconds: number; secure: boolean }): string`; `clearResumeCookieHeader(slug: string, secure: boolean): string`; `readResumeCookie(cookieHeader: string | undefined): string | undefined`; config fields `deviceResumeDays`, `deviceResumeEnabled`, `resumeCookieSecure`, `resumeLinkDays`, `resumeLinkMaxUses`, `resumeSendMaxPerDay`.

- [ ] **Step 1: Write the failing test**

```ts
describe('buildResumeCookie', () => {
  it('is HttpOnly, Secure, SameSite=Lax and scoped to this form only', () => {
    expect(buildResumeCookie({ token: 'mj_ml_abc', slug: 'share-link-3gc41', maxAgeSeconds: 1296000, secure: true }))
      .toBe('mjf_resume=mj_ml_abc; Path=/f/share-link-3gc41; Max-Age=1296000; HttpOnly; Secure; SameSite=Lax');
  });

  it('drops Secure only when the host configured it off, for an http harness', () => {
    expect(buildResumeCookie({ token: 't', slug: 's', maxAgeSeconds: 60, secure: false })).not.toContain('Secure');
  });

  it('percent-encodes the path so a slug can never inject a cookie attribute', () => {
    expect(buildResumeCookie({ token: 't', slug: 'a; Domain=evil.test', maxAgeSeconds: 60, secure: true }))
      .not.toContain('Domain=');
  });

  it('clears by expiring in the past, with the SAME path — a mismatched path clears nothing', () => {
    expect(clearResumeCookieHeader('share-link-3gc41', true))
      .toBe('mjf_resume=; Path=/f/share-link-3gc41; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  });
});

describe('readResumeCookie', () => {
  it('finds the pointer among other cookies, and answers undefined when absent or empty', () => {
    expect(readResumeCookie('a=1; mjf_resume=mj_ml_abc; b=2')).toBe('mj_ml_abc');
    expect(readResumeCookie('a=1')).toBeUndefined();
    expect(readResumeCookie(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Server && npx vitest run src/respondent-host/__tests__/resume-cookie.spec.ts` → FAIL.

- [ ] **Step 3: Implement, then run**

Hand-rolled — no cookie library. The header must document why `Path` is the form's own route (two
forms on one host never see each other's pointer, and the GraphQL layer never receives it) and why
`SameSite=Lax` makes the resume route CSRF-safe by default. Run again → PASS.

- [ ] **Step 4: Add the config knobs**

In `respondent-host/config.ts`, following the file's existing memoized/frozen pattern and its env
documentation block:

| Env var | Field | Default |
|---|---|---|
| `FORMS_DEVICE_RESUME_ENABLED` | `deviceResumeEnabled` | on unless `'false'` |
| `FORMS_DEVICE_RESUME_DAYS` | `deviceResumeDays` | `15` |
| `FORMS_RESUME_COOKIE_SECURE` | `resumeCookieSecure` | on unless `'false'` |
| `FORMS_RESUME_LINK_DAYS` | `resumeLinkDays` | `30` |
| `FORMS_RESUME_LINK_MAX_USES` | `resumeLinkMaxUses` | `25` |

and in `public-submit/config.ts`: `FORMS_RESUME_SEND_MAX_PER_DAY` → `resumeSendMaxPerDay`, default
`5`, documented as **per `ResourceID`, not per IP** — a forwarded email carries both the expired link
and the address it went to, so an IP-keyed limit alone does not stop a hundred re-sends from a
hundred addresses (review finding 8).

Document `FORMS_RESUME_COOKIE_SECURE` with the reason it exists: Chrome and Firefox accept a
`Secure` cookie on `http://localhost`, but not every harness browser does, and a host serving over
plain http in a private network needs a way in that is not "turn resume off" (review, decision 6).

- [ ] **Step 5: Run, typecheck, commit**

```bash
cd packages/Server && npx vitest run && cd ../.. && npm run typecheck
git add packages/Server/src/respondent-host packages/Server/src/public-submit/config.ts
git commit -m "feat(server): the device pointer's cookie, and the knobs that bound it"
```

---

## Task 8: The three host routes — where both must-fixes live

**Files:**
- Create: `packages/Server/src/respondent-host/resume-routes.ts` + `__tests__/resume-routes.spec.ts`
- Create: `packages/Server/src/respondent-host/device-resume.service.ts` + `__tests__/device-resume.service.spec.ts`
- Modify: `packages/Server/src/respondent-host/RespondentHostMiddleware.ts`
- Modify: `packages/Server/src/respondent-host/host-page.ts` (the `data-has-draft` stamp) + `__tests__/host-page.spec.ts`

**Interfaces:**
- Consumes: `readResumeCookie`/`buildResumeCookie`/`clearResumeCookieHeader` (Task 7), `mintResponseInvite`/`findInviteByRawToken`/`revokeResponseInvites`/`pruneSpentDeviceInvites` (Task 6), `responseIsOurs` (Task 3), `redeemSlugToToken`'s door predicates, `FormsRateLimiter`, `readCappedBody`/`sendJsonError`/`userPayloadOf` (`http/request-body.ts`).
- Produces: `matchResumeRoute(method: string, path: string): { action: 'resume' | 'remember' | 'forget'; slug: string } | undefined`; and three bodies each returning `{ status: number; body?: object; setCookie?: string; reason?: string }`:
  - `runResume(deps, { slug: string; cookieToken?: string; bodyToken?: string })` — **one redeem path, two sources.** The cookie is the device channel; `bodyToken` is the emailed link's interstitial handing over the token it read from the URL fragment (Task 12). `bodyToken` wins when both are present, and either way the route ends by minting the rotation invite and setting the cookie, which is what gives an emailed respondent same-device resume on the device they opened it on (AC 7). A fourth route for the emailed case would be a second spelling of the same redeem.
  - `runRemember(deps, { slug: string; responseId: string; sessionId: string; scopeId: string; cookieToken?: string })`
  - `runForget(deps, { slug: string; cookieToken?: string })`

**Route mounting:** `/resume` registers **pre-auth** in `ConfigureExpressApp` (there is no JWT yet —
the cookie is the credential, and the redeem is what mints the session). `/remember` and `/forget`
register **post-auth** via `GetPostAuthMiddleware()` (they carry the distribution JWT, and identity
is the guard) — the same split `UploadMiddleware` uses and for the same reason. Copy its handler
shape: filter on method + path, delegate, and never let a throw escape.

- [ ] **Step 1: Write the failing route-matcher test**

```ts
describe('matchResumeRoute', () => {
  it.each([
    ['POST', '/f/share-link-3gc41/resume',   { action: 'resume',   slug: 'share-link-3gc41' }],
    ['POST', '/f/share-link-3gc41/remember', { action: 'remember', slug: 'share-link-3gc41' }],
    ['POST', '/f/share-link-3gc41/forget',   { action: 'forget',   slug: 'share-link-3gc41' }],
  ])('matches %s %s', (method, path, expected) => expect(matchResumeRoute(method, path)).toEqual(expected));

  it.each([
    ['GET',  '/f/share-link-3gc41/resume'],   // GET must stay side-effect-free
    ['POST', '/f/share-link-3gc41'],
    ['POST', '/f//resume'],
    ['POST', '/f/a/b/resume'],
  ])('does not match %s %s', (method, path) => expect(matchResumeRoute(method, path)).toBeUndefined());
});
```

- [ ] **Step 2: Run it, implement the matcher, run it again**

Run: `cd packages/Server && npx vitest run src/respondent-host/__tests__/resume-routes.spec.ts` → FAIL → implement → PASS.

- [ ] **Step 3: Write the failing behaviour tests — the two must-fixes first**

`__tests__/device-resume.service.spec.ts`, everything injected (no HTTP server, no database):

```ts
describe('runResume', () => {
  it('refuses a closed distribution BEFORE redeeming, so no use is burned', async () => {
    const deps = fakeDeps({ distribution: { closed: true } });
    const out = await runResume(deps, { slug: SLUG, cookieToken: TOKEN });
    expect(out.status).toBe(410);
    expect(deps.redeem.calls).toHaveLength(0);
  });

  it('rotates the pointer on success and returns the response-scoped JWT', async () => {
    const out = await runResume(fakeDeps(), { slug: SLUG, cookieToken: TOKEN });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ token: 'JWT-2' });
    expect(out.setCookie).toContain('mjf_resume=mj_ml_rotated');
  });

  // ── review finding 1, the must-fix ──────────────────────────────────────────────────────────
  it('does NOT clear the cookie when core says the token was already consumed', async () => {
    // Two tabs, or a session restore: the other tab won the compare-and-swap and has ALREADY
    // rotated this jar's cookie. Clearing here discards the winner's fresh pointer, and the loser
    // then starts a SECOND Partial row that the next reopen resumes — orphaning the real draft.
    const out = await runResume(fakeDeps({ redeem: { errorCode: 'consumed' } }), { slug: SLUG, cookieToken: TOKEN });
    expect(out.status).toBe(410);
    expect(out.reason).toBe('open-elsewhere');
    expect(out.setCookie).toBeUndefined();
  });

  it('clears the cookie when the pointer is genuinely dead', async () => {
    for (const errorCode of ['expired', 'revoked', 'not-found']) {
      const out = await runResume(fakeDeps({ redeem: { errorCode } }), { slug: SLUG, cookieToken: TOKEN });
      expect(out.setCookie).toContain('Max-Age=0');
    }
  });

  it('clears the cookie without redeeming when the owner turned device resume off', async () => {
    const deps = fakeDeps({ distribution: { allowDeviceResume: false } });
    const out = await runResume(deps, { slug: SLUG, cookieToken: TOKEN });
    expect(deps.redeem.calls).toHaveLength(0);
    expect(out.setCookie).toContain('Max-Age=0');
  });

  it('still resumes when the rotation mint fails, and clears the spent pointer', async () => {
    const out = await runResume(fakeDeps({ mint: { fails: true } }), { slug: SLUG, cookieToken: TOKEN });
    expect(out.status).toBe(200);
    expect(out.setCookie).toContain('Max-Age=0');
  });

  it("accepts the emailed link's token from the body, and gives that device the cookie too", async () => {
    // AC 7 and the rule that unifies the channels: EVERY successful response-scoped redeem on the
    // host ends by minting a device invite, so opening the emailed link on a new device earns
    // same-device resume there with no further step.
    const deps = fakeDeps();
    const out = await runResume(deps, { slug: SLUG, bodyToken: EMAILED_TOKEN });
    expect(deps.redeem.calls[0].token).toBe(EMAILED_TOKEN);
    expect(out.setCookie).toContain('mjf_resume=mj_ml_rotated');
  });

  it('prefers the body token over the cookie when both arrive', async () => {
    const deps = fakeDeps();
    await runResume(deps, { slug: SLUG, cookieToken: TOKEN, bodyToken: EMAILED_TOKEN });
    expect(deps.redeem.calls[0].token).toBe(EMAILED_TOKEN);
  });
});

describe('runRemember', () => {
  // ── review finding 2, the must-fix ──────────────────────────────────────────────────────────
  it('mints nothing without the owning session id, however valid the JWT and the row', async () => {
    const deps = fakeDeps();
    const out = await runRemember(deps, { slug: SLUG, responseId: ROW_ID, sessionId: '', scopeId: DIST_ID });
    expect(out.status).toBe(400);
    expect(deps.mint.calls).toHaveLength(0);
  });

  it('mints nothing for a row owned by a different session', async () => {
    const deps = fakeDeps({ row: { AnonymousSessionID: 'somebody-else' } });
    const out = await runRemember(deps, { slug: SLUG, responseId: ROW_ID, sessionId: 's2', scopeId: DIST_ID });
    expect(out.status).toBe(403);
    expect(deps.mint.calls).toHaveLength(0);
  });

  it('mints nothing when the row came through a DIFFERENT distribution than the JWT names', async () => {
    const deps = fakeDeps({ row: { FormDistributionID: 'another-link' } });
    expect((await runRemember(deps, { slug: SLUG, responseId: ROW_ID, sessionId: 's1', scopeId: DIST_ID })).status).toBe(403);
    expect(deps.mint.calls).toHaveLength(0);
  });

  it('mints nothing for a row that is not Partial', async () => {
    const deps = fakeDeps({ row: { Status: 'Complete' } });
    expect((await runRemember(deps, { slug: SLUG, responseId: ROW_ID, sessionId: 's1', scopeId: DIST_ID })).status).toBe(409);
  });

  // ── review finding 1, the other half ────────────────────────────────────────────────────────
  it('refuses to replace a cookie that names a DIFFERENT live draft', async () => {
    // The loser tab's first autosave arrives holding the winner's rotated pointer. Overwriting it
    // is what points the jar at the second row and abandons the first.
    const deps = fakeDeps({ cookieNames: { responseId: OTHER_ROW_ID, status: 'Partial' } });
    const out = await runRemember(deps, { slug: SLUG, responseId: ROW_ID, sessionId: 's1', scopeId: DIST_ID, cookieToken: TOKEN });
    expect(out.status).toBe(409);
    expect(out.setCookie).toBeUndefined();
    expect(deps.mint.calls).toHaveLength(0);
  });

  it('replaces a cookie that names a draft which is no longer live', async () => {
    const deps = fakeDeps({ cookieNames: { responseId: OTHER_ROW_ID, status: 'Complete' } });
    expect((await runRemember(deps, { slug: SLUG, responseId: ROW_ID, sessionId: 's1', scopeId: DIST_ID, cookieToken: TOKEN })).status).toBe(204);
  });

  it('mints nothing and sets no cookie when the switch is off', async () => {
    const deps = fakeDeps({ distribution: { allowDeviceResume: false } });
    const out = await runRemember(deps, { slug: SLUG, responseId: ROW_ID, sessionId: 's1', scopeId: DIST_ID });
    expect(out.status).toBe(204);
    expect(out.setCookie).toBeUndefined();
    expect(deps.mint.calls).toHaveLength(0);
  });
});

describe('runForget', () => {
  it('revokes only the device invites, and clears the cookie', async () => {
    const deps = fakeDeps();
    const out = await runForget(deps, { slug: SLUG, cookieToken: TOKEN });
    expect(deps.revoke.calls).toEqual([{ responseId: ROW_ID, deviceOnly: true }]);
    expect(out.setCookie).toContain('Max-Age=0');
  });

  it('clears the cookie even when the revoke fails', async () => {
    const out = await runForget(fakeDeps({ revoke: { fails: true } }), { slug: SLUG, cookieToken: TOKEN });
    expect(out.status).toBe(204);
    expect(out.setCookie).toContain('Max-Age=0');
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `cd packages/Server && npx vitest run src/respondent-host/__tests__/device-resume.service.spec.ts` → FAIL (module not found).

- [ ] **Step 5: Implement the three bodies**

Guard order is the spec's §3.7 table and is load-bearing — the door's own predicates
(`distributionWindowRefusal`, `distributionQuotaExceeded`, the `AllowDeviceResume` switch) run
**before** any redeem, so a closed or full link never burns a use. Reuse those predicates; do not
write a second spelling of them at this door (that is the drift `redeem.service.ts` documents).

Rate-limit both mint points through `FormsRateLimiter.Instance.charge()`, keyed per
(caller IP hash, distribution) like the submit path's ceilings.

Add each of these to `scripts/check-guard-mutants.mjs`: the `consumed` non-clear, the cookie-replace
refusal, the session-id requirement, and the pre-redeem door check.

- [ ] **Step 6: Stamp `data-has-draft` on the GET**

`host-page.ts` gains `hasDraft?: boolean` on `RespondentHostPageOptions` and emits
` data-has-draft="1"` when true; the boot script reads it with `dataset`/`getAttribute` like every
other value. In `handleRequest`, pass `hasDraft: readResumeCookie(req.headers.cookie) !== undefined`.
Presence ONLY — no redeem on GET, so the route stays side-effect-free and a mail scanner or a
prefetch cannot spend a use. Extend `__tests__/host-page.spec.ts`:

```ts
it('stamps data-has-draft only when the cookie is present', () => {
  expect(renderRespondentHostPage({ ...base, hasDraft: true })).toContain('data-has-draft="1"');
  expect(renderRespondentHostPage(base)).not.toContain('data-has-draft');
});
```

- [ ] **Step 7: Mount the routes**

Pre-auth in `ConfigureExpressApp` for `/resume`; `GetPostAuthMiddleware()` for `/remember` and
`/forget`, using `matchResumeRoute` and `userPayloadOf<VerifiedUserPayload>(req)` for the
`UserInfo` + `sessionId`. Bodies through `readCappedBody` with a small cap (these carry two UUIDs —
2 KB is generous); errors through `sendJsonError`. Every response gets `Cache-Control: no-store`.

- [ ] **Step 8: Run the suite, typecheck, commit**

```bash
cd packages/Server && npx vitest run && cd ../.. && npm run typecheck && npm run lint:guard-mutants
git add packages/Server/src/respondent-host scripts/check-guard-mutants.mjs
git commit -m "feat(server): remember, resume and forget — and a second tab no longer orphans the draft"
```

---

## Task 9: Revoke on submit (decision 3, flipped)

**Files:**
- Modify: `packages/Server/src/public-submit/submit-pipeline.ts`
- Test: `packages/Server/src/public-submit/__tests__/submit-pipeline-revoke-on-seal.spec.ts` (new)

**Interfaces:**
- Consumes: `revokeResponseInvites` (Task 6).
- Produces: `PipelineContext.revokeInvites?` — an injectable seam, defaulting to the real service, matching how `fireHooks` is injected.

- [ ] **Step 1: Write the failing test**

```ts
it('revokes every live invite for the response once it is sealed', async () => {
  const ctx = ctxWith({ revokeInvites: spy });
  await runSubmitPipeline(ctx, finalSubmission());
  expect(spy.calls).toEqual([{ responseId: ROW_ID, deviceOnly: false }]);
});

it('revokes on a disqualification too — it is terminal, and nothing more is coming', async () => {
  await runSubmitPipeline(ctxWith({ revokeInvites: spy }), knockoutSubmission());
  expect(spy.calls).toHaveLength(1);
});

it('does not revoke on a partial save', async () => {
  await runSubmitPipeline(ctxWith({ revokeInvites: spy }), partialSubmission());
  expect(spy.calls).toHaveLength(0);
});

it('does not revoke on a recognised repeat — the winning request already did', async () => {
  await runSubmitPipeline(ctxWith({ revokeInvites: spy, deduped: true }), finalSubmission());
  expect(spy.calls).toHaveLength(0);
});

it('answers the respondent even when the revoke throws', async () => {
  const result = await runSubmitPipeline(ctxWith({ revokeInvites: throwing }), finalSubmission());
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Server && npx vitest run src/public-submit/__tests__/submit-pipeline-revoke-on-seal.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

After a successful non-deduped terminal persist, beside the hooks dispatch, detached and wrapped:

```ts
  // DECISION 3, flipped on review: a sealed response's links die with it. As filed, an Active
  // bearer sat in an inbox for up to 30 days and opened the sealed answers read-only, so forwarding
  // the email was disclosure — and "refusing tells the respondent nothing" is not quite true: a 410
  // can say the response was submitted, and on what date. #136 mints its own edit-window link when
  // it lands, which is the right place for that decision to be made deliberately.
  //
  // Best-effort and detached, like the hooks: the row is already written, and nothing the
  // respondent is shown depends on this.
```

Revoke on **any** terminal seal, not only a completion: a `Disqualified` row is terminal too, nothing
more is coming for it, and leaving its links live would keep a bearer to a screened-out respondent's
answers in an inbox. Skip it on `deduped` — the request that actually sealed the row already revoked.

The respondent-facing sentence a revoked link now earns (`This response was submitted on <date>.`) is
rendered by Task 12's interstitial; this task only makes it true.

- [ ] **Step 4: Run, commit**

```bash
cd packages/Server && npx vitest run && cd ../..
git add packages/Server/src/public-submit
git commit -m "feat(server): sealing a response retires the links that could reopen it"
```

---

## Task 10: The widget — adopt, prefill, seal at mount, three events

**Files:**
- Create: `packages/Angular/src/lib/widget/core/resume-prefill.ts` + `resume-prefill.spec.ts`
- Modify: `packages/Angular/src/lib/widget/mj-form.component.ts` (+ `.html` for the start-over control and the hint)
- Test: `packages/Angular/src/lib/widget/resume.wiring.spec.ts` (new; follow `disqualification.wiring.spec.ts`)

**Interfaces:**
- Consumes: `ResumeSnapshot` (Task 2), `PublishedFormLoad` (Task 5), `FormRuntime.setValue(questionId, value)`, `answerColumnFor`, `answerTextFromInstant`.
- Produces: `prefillFromResume(runtime, definition, snapshot): { applied: number; dropped: string[] }`; the DOM events `mjf-partial-saved`, `mjf-start-over`, `mjf-submitted`.

- [ ] **Step 1: Write the failing prefill test**

```ts
describe('prefillFromResume', () => {
  it('routes each stored column into the answer its question type expects', () => {
    const result = prefillFromResume(runtime, definition, snapshotWith([
      { QuestionID: TEXT_Q, TextValue: 'Ada' },
      { QuestionID: NUM_Q, NumericValue: 42 },
      { QuestionID: BOOL_Q, BooleanValue: true },
      { QuestionID: MULTI_Q, JSONValue: '["a","b"]' },
      { QuestionID: FILE_Q, FileID: FILE_ID },
    ]));
    expect(runtime.valueFor(TEXT_Q)).toBe('Ada');
    expect(runtime.valueFor(MULTI_Q)).toEqual(['a', 'b']);
    expect(runtime.valueFor(FILE_Q)).toBe(FILE_ID);
    expect(result.applied).toBe(5);
  });

  it('keeps only answers whose question still exists in this version, and says which it dropped', () => {
    const result = prefillFromResume(runtime, definition, snapshotWith([{ QuestionID: 'gone', TextValue: 'x' }]));
    expect(result.applied).toBe(0);
    expect(result.dropped).toEqual(['gone']);
  });

  it('matches question ids case-insensitively, because the two sides mint and read GUIDs differently', () => {
    const result = prefillFromResume(runtime, definition, snapshotWith([{ QuestionID: TEXT_Q.toUpperCase(), TextValue: 'Ada' }]));
    expect(result.applied).toBe(1);
  });

  it("drops a value it cannot put back in the control's own spelling, rather than showing a wrong one", () => {
    const result = prefillFromResume(runtime, definition, snapshotWith([{ QuestionID: TIME_Q, DateValue: 'not-a-date' }]));
    expect(runtime.valueFor(TIME_Q)).toBeUndefined();
    expect(result.dropped).toEqual([TIME_Q]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement**

Run: `cd packages/Angular && npx vitest run src/lib/widget/core/resume-prefill.spec.ts` → FAIL → implement
(route on `answerColumnFor(question.type)`, `foldQuestionId` for matching, `answerTextFromInstant`
for the date column) → PASS.

- [ ] **Step 3: Write the failing component wiring tests**

```ts
it('adopts the resumed row id, so every later save lands on it', async () => {
  api.load = { definition, resume: { responseId: ROW_ID, status: 'Partial', formVersionId: 'V1', answers: [] } };
  await mount();
  expect(component.currentResponseId()).toBe(ROW_ID);
});

it('emits mjf-partial-saved ONCE, carrying both correlators the host route needs', async () => {
  // Both, deliberately: the boot script cannot see the API service's private x-session-id, so a
  // `/remember` given only a response id would be minting a bearer on a bare row id — the header
  // replay this whole issue exists to close.
  await firstAutosave();
  await secondAutosave();
  expect(events('mjf-partial-saved')).toEqual([{ responseId: ROW_ID, sessionId: SESSION_ID }]);
});

it('shows the sealed screen from the mount, and never submits, when the resumed row is terminal', async () => {
  api.load = { definition, resume: { responseId: ROW_ID, status: 'Complete', formVersionId: 'V1', answers: [] } };
  await mount();
  expect(component.phase()).not.toBe('ready');
  await attemptSubmit();
  expect(api.submitCalls).toHaveLength(0);   // savePartial ignores res.status; sealed is decided HERE
});

it('renders "Not you? Start over" only in a resumed session, and emits on press', async () => {
  api.load = { definition, resume: { responseId: ROW_ID, status: 'Partial', formVersionId: 'V1', answers: [] } };
  await mount();
  expect(startOverControl()).not.toBeNull();
  startOverControl().click();
  expect(events('mjf-start-over')).toHaveLength(1);
});

it('does not render start over in an ordinary first sitting', async () => {
  await mount();                       // no resume on the load
  expect(startOverControl()).toBeNull();
});

it('emits mjf-submitted after a successful final submit', async () => {
  await submitSuccessfully();
  expect(events('mjf-submitted')).toHaveLength(1);
});

it('shows one line, and still renders the form, when the host says the reopen failed', async () => {
  component.setInput('resume-notice', "We couldn't reopen your saved answers on this device.");
  await mount();
  expect(component.phase()).toBe('ready');            // the respondent ALWAYS gets a form
  expect(noticeText()).toContain("couldn't reopen");
});

// AC 13 — an embed has no boot script, so nothing must call a host route from inside the widget.
it('never calls a host route itself; it only announces', async () => {
  await firstAutosave();
  await submitSuccessfully();
  expect(fetchSpy.calls.filter((c) => /\/f\/[^/]+\/(remember|resume|forget)/.test(c.url))).toHaveLength(0);
});

// Review walkthrough E — a changed question type fails the whole autosave, silently, forever.
it('marks the question whose stored answer no longer fits this version', async () => {
  api.load = { definition: versionWhereQ1IsNowNumeric, resume: snapshotWith([{ QuestionID: Q1, TextValue: 'Ada' }]) };
  await mount();
  expect(component.resumeDropped()).toEqual([Q1]);
  expect(questionNotice(Q1)).toContain('needs answering again');
});
```

- [ ] **Step 4: Run them to verify they fail, then implement**

In `load()`: take `{ definition, resume }`; when `resume` is present, set `this.clientResponseId =
resume.responseId` **before** the runtime is built, prefill, set the autosave indicator to `saved`,
and — when `resume.status` is terminal — set the sealed phase instead of `initialPhaseFor(def)`. Add:

- a `resumed` signal gating the start-over control;
- a `resumeDropped` signal holding `prefillFromResume`'s `dropped` ids, which the question component
  reads to show *"This answer needs answering again — the form has changed."* beside the question.
  Without it a question whose type changed since the draft was saved fails **the whole autosave**,
  silently and on every attempt, because autosave is fail-soft — the respondent types on, nothing is
  ever saved again, and nothing on screen says so (review walkthrough E);
- a `resumeNotice` input-driven line for the `410` case;
- `emit()` helpers dispatching `CustomEvent`s from the host element with
  `{ bubbles: true, composed: true }` — they must cross the shadow boundary to reach the page.

Add `resume-notice` to `ATTRIBUTE_EFFECTS` in `element-attributes.ts` as an `'input'` effect — the
boot script sets it after a failed `/resume`, and an attribute the element observes but ignores is
exactly the bug that file exists to prevent.

- [ ] **Step 5: Run the suite and the token lint**

Run: `cd packages/Angular && npx vitest run && cd ../.. && npm run lint:ui && npm run typecheck`
Expected: PASS. `lint:ui` fails on any hardcoded colour in the new control or notice.

- [ ] **Step 6: Build the widget bundle and commit**

```bash
pnpm run build:widget
git add packages/Angular/src/lib/widget
git commit -m "feat(widget): a resumed draft is adopted, prefilled, and sealed before it can be typed into"
```

---

## Task 11: The boot script — the only thing that touches cookies

**Files:**
- Modify: `packages/Server/src/respondent-host/host-page.ts` (`BOOT_SCRIPT`)
- Test: `packages/Server/src/respondent-host/__tests__/host-page.spec.ts` (extend), `__tests__/boot-resume.spec.ts` (new)

**Interfaces:**
- Consumes: the three events (Task 10), the three routes (Task 8).
- Produces: nothing importable — the boot script is a static string. Its DECISIONS are extracted into
  a pure, testable module so they are not asserted by reading source text.

- [ ] **Step 1: Extract the decisions, and write the failing test**

`BOOT_SCRIPT` is a static string with no interpolation (that property is load-bearing — nothing
attacker-controlled is ever spliced into it), so its logic cannot be unit-tested in place. Put the
two decisions in a pure exported module and have the script's own copy be a thin transcription:

```ts
// resume-boot.ts
export function routeForEvent(event: 'mjf-partial-saved' | 'mjf-start-over' | 'mjf-submitted'): 'remember' | 'forget';
export function resumeNoticeFor(reason: string | undefined): string;
```

```ts
describe('resumeNoticeFor', () => {
  it('says the same neutral thing for every dead pointer, so it never reveals whether a draft exists', () => {
    for (const reason of ['expired', 'revoked', 'not-found', 'disabled', undefined]) {
      expect(resumeNoticeFor(reason)).toBe(
        "We couldn't reopen your saved answers on this device. Start fresh, or request a link by email.");
    }
  });

  it('says something DIFFERENT for a double open, because that is not a failure', () => {
    expect(resumeNoticeFor('open-elsewhere')).toBe('This form is already open in another tab.');
  });
});

describe('routeForEvent', () => {
  it('sends a first save to remember, and both endings to forget', () => {
    expect(routeForEvent('mjf-partial-saved')).toBe('remember');
    expect(routeForEvent('mjf-start-over')).toBe('forget');
    expect(routeForEvent('mjf-submitted')).toBe('forget');
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement, then run again**

Run: `cd packages/Server && npx vitest run src/respondent-host/__tests__/boot-resume.spec.ts` → FAIL → implement → PASS.

- [ ] **Step 3: Write the boot script's own logic**

Inside `BOOT_SCRIPT`, still interpolation-free:

- On load, if `data-has-draft` is `"1"`: `fetch('/f/' + slug + '/resume', { method: 'POST', credentials: 'same-origin' })` **before** mounting. `200` → mount with `body.token`. Anything else, including a network failure → mount with the baked-in distribution token and set `resume-notice` from the reason. **The respondent always gets a form.**
- `mjf-partial-saved` → POST `/remember` with `{ responseId, sessionId }`, `Authorization: Bearer <the token the widget is mounted with>` and the `x-session-id` header. Fire-and-forget; a failure changes nothing the respondent sees.
- `mjf-start-over` → POST `/forget`, then `window.location.reload()`. The reload is the point: under a response-scoped session the pipeline would update the scoped row rather than create a new one, so a genuine start-over needs a fresh distribution session, and the GET gives exactly that.
- `mjf-submitted` → POST `/forget`.
- Every call is `credentials: 'same-origin'` so the cookie rides, and none of them can read it.

Add a comment stating that a page WITHOUT this script — an embed — sends none of these calls, which
is why the widget needs no conditional code for embeds (decision 8).

- [ ] **Step 4: Extend the page spec**

```ts
it('asks the host to reopen the draft before mounting, and only when the page says there is one', () => {
  expect(renderRespondentHostPage({ ...base, hasDraft: true })).toContain("/resume");
});
it('never puts the cookie, or any token, into the boot script itself', () => {
  expect(renderRespondentHostPage({ ...base, hasDraft: true })).not.toContain('mjf_resume');
});
```

- [ ] **Step 5: Run, commit**

```bash
cd packages/Server && npx vitest run && cd ../..
git add packages/Server/src/respondent-host
git commit -m "feat(host): the page reopens the draft; the widget never learns how"
```

---

## Task 12: The emailed channel

**Files:**
- Create: `packages/Server/src/public-submit/resume-email.service.ts` + `__tests__/resume-email.service.spec.ts`
- Modify: `packages/Server/src/public-submit/PublicFormResolver.ts`, `graphql-types.ts`
- Modify: `packages/Server/src/respondent-host/RespondentHostMiddleware.ts` + `host-page.ts` (the interstitial)
- Modify: widget (the "Save and continue later" control) + `forms-api.interface.ts`

**Interfaces:**
- Consumes: `mintResponseInvite` (Task 6), `responseIsOurs` (Task 3), `FormsRateLimiter`, `CommunicationEngine.SendSingleMessage`, `installConfirmationEmailSender`'s config idiom for the From address/provider.
- Produces: `RequestResumeLink(input: { distributionSlug, formVersionId, responseId, email }): { success: boolean; message: string }` — **never the token**; `renderResumeInterstitial(...)`.

- [ ] **Step 1: Write the failing service tests**

```ts
it('mints one invite and sends one message, and returns no token', async () => {
  const result = await requestResumeLink(deps, input);
  expect(result).toEqual({ success: true, message: expect.any(String) });
  expect(JSON.stringify(result)).not.toContain('mj_ml_');
  expect(deps.mint.calls).toHaveLength(1);
  expect(deps.send.calls[0].body).toContain('#resume=');   // fragment, never a query parameter
});

it('answers identically for a row that exists and one that does not', async () => {
  expect(await requestResumeLink(deps, input)).toEqual(await requestResumeLink(deps, { ...input, responseId: UNKNOWN }));
});

it('refuses a row this caller does not own, and mints nothing', async () => { /* … */ });
it('refuses a row that is not Partial, and mints nothing', async () => { /* … */ });

it('revokes the invite when the send fails, and leaves the draft alone', async () => {
  const result = await requestResumeLink(depsWithFailingSend, input);
  expect(result.success).toBe(false);
  expect(deps.revoke.calls).toHaveLength(1);
  expect(deps.writes).toHaveLength(0);
});

// ── review finding 8 ──────────────────────────────────────────────────────────────────────────
it('caps re-sends per response id, whatever address the caller comes from', async () => {
  // A forwarded email carries BOTH the expired link and the address it went to, so an IP-keyed
  // limit alone does not stop a hundred re-sends from a hundred addresses into one inbox.
  for (let i = 0; i < 5; i++) await requestResumeLink(deps, input);
  const sixth = await requestResumeLink({ ...deps, ip: 'a-different-address' }, input);
  expect(sixth.success).toBe(false);
  expect(deps.send.calls).toHaveLength(5);
});
```

- [ ] **Step 2: Run to verify failure, then implement**

Gate order: scope check → resolve definition → **per-`ResourceID` daily cap** → per-IP rate limit →
`responseIsOurs` → row is `Partial` → mint → send. The mint uses the system user as
`CreatedByUserID`'s caller exactly as the distribution path does. On a send failure, revoke the
invite (Task 6) and log with the response id, **never the address**.

- [ ] **Step 3: Add the mutation and the widget control**

`RequestResumeLinkInputType` in `graphql-types.ts` (four fields, all required); the resolver wrapped
in `respondentSafe` like its neighbours, mapping to a `{ success, message }` output type. In the
widget, a "Save and continue later" control shown only once a partial has been acknowledged, which
collects an address and calls the mutation. Its copy says the link opens the hosted page (decision 8,
so an embed respondent is not surprised by where they land).

- [ ] **Step 4: The interstitial**

`GET /f/:slug?resume=…` is deliberately not used — the token rides the **fragment** (`#resume=`), so
the server never sees it and it cannot reach an access log, a proxy or a `Referer` header (decision 5
with the review's tweak). The GET therefore renders an interstitial page whose script reads
`location.hash`, POSTs the token as `{ token }` to the **existing** `POST /f/:slug/resume`, and mounts
with the returned JWT — `runResume`'s `bodyToken` branch from Task 8. **No fourth route:** a separate
`/resume-link` would be a second spelling of the same redeem, free to drift from the one that already
mints the rotation invite and sets the cookie (which is what earns this device same-device resume,
AC 7).

The interstitial itself is a new render in `host-page.ts`. Its script POSTs on load — a GET that
redeemed would let a mail scanner spend one of the 25 uses — and it renders:

- on `200`: the mounted `<mj-form>`, through the same mount routine as the ordinary page;
- on `410` for a dead link: "This link has expired. Enter the email you used and we'll send a fresh
  one", over an ordinary distribution session, wired to `RequestResumeLink`;
- on `410` for a sealed response (Task 9 revoked its invites at submit): "This response was submitted
  on `<date>`." — the sentence decision 3's flip makes possible, and the reason "refusing tells the
  respondent nothing" is no longer true.

Test the interstitial's render (pure, like `host-page.spec.ts`) and the body-token branch's guard
order the same way Task 8 tests the cookie branch.

- [ ] **Step 5: Run everything, commit**

```bash
cd packages/Server && npx vitest run && cd ../Angular && npx vitest run && cd ../.. && npm run typecheck && npm run lint:ui
git add packages/Server/src packages/Angular/src
git commit -m "feat(server): a respondent can ask for their draft by email, on any device"
```

---

## Task 13: The two smoke suites, the changeset, and the live verification

**Files:**
- Create: `smoke/device-resume-path.mjs`, `smoke/resume-link-path.mjs`
- Modify: `package.json` (`smoke:device-resume`, `smoke:resume-link`), `.claude/rules/testing.md` (add both to the manual list)
- Create: `.changeset/<two-words-about-the-change>.md`

**Interfaces:**
- Consumes: `smoke/lib/{fixture,session,sqlcmd,target}.mjs` — resolve the slug and question ids BY ROLE, never hardcoded; `smokeBaseUrl()`; `sessionIdFor(token)`; `sql()` with `-b` (sqlcmd exits 0 on a SQL error without it).

- [ ] **Step 1: Write `smoke/device-resume-path.mjs`**

Cover, in order, asserting SQL after each write (AC 8–16):

1. `GET /f/<slug>` → JWT A. `SubmitFormResponse` partial with `x-session-id: S1` → row R, `Partial`, `FormDistributionID` stamped.
2. `POST /f/<slug>/remember` with `{responseId: R, sessionId: S1}` → `204`, and a `Set-Cookie` matching `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/f/<slug>`. Assert the invite row: `MaxUses=1`, `Email IS NULL`, `ExpiresAt <= min(CloseAt, now+15d)`.
3. `POST /f/<slug>/remember` again with a DIFFERENT live response → `409`, cookie unchanged.
4. `POST /f/<slug>/resume` presenting the cookie → `200`, a new JWT, a NEW cookie value. `PublishedForm` under it returns `resumeJSON` with R and the saved answers.
5. Replay the PREVIOUS token → `410`, **and assert the response carried no `Set-Cookie` clearing the jar** (finding 1).
6. Partial save from the resumed session with a new `x-session-id` → same row R in SQL, `AnonymousSessionID` unchanged, `StartedAt` unchanged, no second row.
7. `POST /forget` → cookie cleared; a following `/resume` → `410`.
8. `UPDATE FormDistribution SET AllowDeviceResume = 0` → `/remember` mints nothing, `/resume` clears without redeeming (assert `UseCount` unchanged). Restore the flag.
9. Close the distribution → `/resume` refuses before redeeming (`UseCount` unchanged). Restore.
10. Final submit → row `Complete`, counted once, and **every invite for R is `Revoked`** (AC 20).
11. Clean up every row the script created and print what it deleted, as the sibling suites do.

- [ ] **Step 2: Write `smoke/resume-link-path.mjs`**

`RequestResumeLink` → exactly one invite (`Email` set, configured `MaxUses`/`ExpiresAt`), result
carries no token; redeem from a second session → scoped JWT + `resumeJSON`; the redeem also sets a
device cookie (AC 7); exhaustion and expiry → the friendly page, nothing minted; a re-send answers
identically for a known and an unknown address; the per-response daily cap refuses the sixth.

- [ ] **Step 3: Run both against a live harness**

Run the branch's own MJAPI on its own port so the shared `:4121` harness is untouched, and set
`MJAPI_PUBLIC_URL` to the same port — it is read at IMPORT time, so a late `process.env` assignment
is silently ignored and `.env`'s value leaks into the host page and the redeem:

```bash
set -a && . ./.env && set +a
FORMS_SMOKE_PORT=4131 MJAPI_PUBLIC_URL=http://localhost:4131 node apps/MJAPI/server.mjs &
FORMS_SMOKE_URL=http://localhost:4131 node smoke/device-resume-path.mjs
FORMS_SMOKE_URL=http://localhost:4131 node smoke/resume-link-path.mjs
```
Expected: every check `ok`, and the final cleanup reporting zero remaining rows.

- [ ] **Step 4: Run the finding-6 verification**

25 sequential `GET /f/<slug>` inside one minute, from one client:

```bash
for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4131/f/<slug>; done | sort | uniq -c
```
Expected: `25 200`. **If any are 429**, core's `redeemLimiter` is one bucket for the whole
deployment (it keys on `req.ip`, and the host's loopback POST carries no forwarded address). Then:
forward the client IP and user agent on the loopback POST in `redeem.service.ts` — which also fixes
the redemption audit rows, currently recording the server's own address for every Forms redeem —
and re-run. Record the result either way in the PR description.

- [ ] **Step 5: Run every gate**

```bash
npm test && npm run typecheck && npm run lint:distribution && npm run lint:migrations && npm run lint:ui && npm run lint:guard-mutants
```
Expected: all green. `npm test` covers `apps/MJAPI` too — the per-package loop misses it.

- [ ] **Step 6: One Playwright pass on the real page**

Fill two answers, wait for the autosave indicator to say saved, close the tab, reopen `/f/<slug>`,
and confirm the answers are on screen and "Not you? Start over" is offered. This is the one check
the unit suite structurally cannot make — version 0.2.1 shipped with the anonymous path completely
broken and the whole suite green.

- [ ] **Step 7: File the follow-ups the spec logs**

Open one issue per item in §9 of the spec, each linking back to #138 so the trail survives:

1. Purge exhausted and expired `MagicLinkInvite` rows deployment-wide (note in the body what Task 6
   step 1 found about deleting them, so nobody re-runs that query).
2. Retention for untouched `Partial` rows, which live forever while both links expire.
3. Same-device resume for embedded widgets — only if asked for; the one justified localStorage use,
   behind the owner switch, with a documented rule 8 deviation.
4. MJ core: populate `ResourceType` in `RedeemInvite` + the JWT builder, and expose `mj_sid` on
   `UserInfo`. Collapses the fixed-order lookup into a switch and makes the first sitting's ownership
   unforgeable.

Do **not** file "core: revoke by token" — review finding 5 removed the need for it.

- [ ] **Step 8: Write the changeset and commit**

`minor` (this ships a migration), naming only the packages actually touched, body in release-notes
prose: what a respondent can now do, that hosts get a new per-link `AllowDeviceResume` switch
defaulting on, and that a submitted response's resume links are revoked at submit.

```bash
git add smoke package.json .changeset .claude/rules/testing.md
git commit -m "test(smoke): the device and emailed resume paths, end to end"
```

---

## Self-review notes for the executor

- **The two must-fixes are Tasks 8 and 10, not an afterthought.** If you find yourself clearing the
  cookie on a `consumed` 410, or POSTing `/remember` with a bare response id, stop — those are the
  two defects the review found in the design as written.
- **Nothing on the public path may get slower.** A public-link session must take zero extra reads:
  `scopeNamesDistribution` settles it with a string comparison. If a public submission gains a query,
  the branch is in the wrong place.
- **The frozen contracts do not move.** `FormSubmissionInput` / `FormSubmissionResult` are untouched;
  `resumeJSON` is a new nullable field on the READ type, and the cookie is not in the GraphQL contract
  at all. The compile-time locks in `graphql-types.ts` and `submission-mapping.ts` will tell you
  loudly if you get this wrong.
- **Two rules hold every failure path:** the respondent always gets a form, and a resume failure never
  harms the draft row. If a test you write has a respondent seeing an error page instead of a form,
  re-read §3.9 of the spec.
