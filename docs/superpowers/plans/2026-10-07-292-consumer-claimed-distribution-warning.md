# #292 — Warn on the Distribute tab when another app owns a share link: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Distribute tab tells the author, on the link itself, when another Open App (Caliber today) uses that share link's slug as its own intake. The warning says that submissions on the Forms link stay plain responses, and it hands over the consumer's own link when the consumer gives one.

**Architecture:** Forms publishes a small, versioned **claim protocol**: a well-known slot in MJ's global object store where a co-installed app's server registers a provider object. The provider answers one question: "which of these slugs are yours, under what name, with what public link (if any)?" Forms imports nothing from the consumer and the consumer imports nothing from Forms (Caliber's DG-6 rule). A new authenticated GraphQL query, `FormDistributionClaims(formId)`, asks every registered provider about the form's slugs. It reports what each provider answered and which providers failed, and is available only to callers who may edit share links. The Distribute tab reads it after the links load and shows the warning on the claimed link.

**Tech Stack:** TypeScript, TypeGraphQL resolvers on MJServer (`@memberjunction/server` 6.1.5), `GetGlobalObjectStore` from `@memberjunction/global`, Angular 21 standalone component (Explorer-hosted builder), `GraphQLDataProvider.ExecuteGQL`, Vitest.

**Spec:** GitHub issue #292, plus the decisions agreed in the session of 2026-10-07 (*Design decisions* below).

## Root cause (verified in both repos)

1. **Caliber renders the form on its own page.** Caliber's front door, `/interview?blueprint=<stepId>` (`bizapps-caliber/packages/Server/src/session-host/InterviewHostMiddleware.ts:134-249`), redeems the **same** Forms distribution's `PublicLinkToken` itself (`session-host/forms-token.service.ts:175-205`). It then renders the Forms widget on a Caliber page.
2. **Caliber records are created after the submit, from that page.** The page wraps `fetch`. When `SubmitFormResponse` returns Complete, it POSTs `{protocolId, formResponseId}` to `/interview/claim` (`host-page.ts:343-412`). The claim creates the IntakeSubmission, the applicant and the application (`runtime/intake/intake-claim-driver.ts:251-305`).
3. **Caliber registers nothing on Forms' side.** It has no server-side hook on Forms submits (`forms-intake-driver.ts:8-9`; `intake-claim-driver.ts:12-16` explains why: the claim needs the browser).
4. **So `/f/<slug>` stops at the FormResponse.** Forms' own page (`packages/Server/src/respondent-host/RespondentHostMiddleware.ts:424-511`) runs the submit pipeline (`public-submit/submit-pipeline.ts:709-775`), stores the response and its answers, fires Forms' own automations, and stops. No claim ever happens.
5. **Forms cannot know a link is owned elsewhere.** It has no column, registry or config for "owned by another app". The only link between the two is Caliber's `Caliber: Steps.MJFormsDistributionSlug`, which is a loose reference by design (DG-6, migration description at `bizapps-caliber/migrations/V202607061200…:739-741`). A child step inherits that slug through `BasedOnID` (`merge-policy.ts:151`), so only Caliber can say which step owns a slug.
6. **The tab tells the author the opposite.** The Distribute tab presents the link with "Send this to anyone. They open the form without signing in." (`packages/Angular/src/lib/builder/distribution-manager.component.html:173`).

## Design decisions (agreed 2026-10-07)

- **Claim source: an in-process registry.** It is a versioned key in MJ's global object store that either side may create, so module load order does not matter.
  - Rejected: new `FormDistribution` columns written by Caliber. That needs a migration, cross-schema write grants, a backfill, and an unbind path that can go stale.
  - Rejected: host config describing Caliber's schema. It misses inherited slugs and puts consumer knowledge into Forms.
- **Respondent behaviour unchanged.** `/f/<slug>` keeps accepting responses. Refusing or redirecting is a later decision, and the warning ships first.
- **Scope:** this Forms PR, plus a bizapps-caliber issue describing the provider Caliber should register. No Caliber code in this PR.

## Design

### The protocol (what a consumer implements)

```ts
// Slot: GetGlobalObjectStore()['__mjBizAppsForms.distributionClaimProviders.v1']
// Value: an array the consumer creates if absent and pushes onto. It never replaces the array.
interface DistributionClaimProvider {
  /** The app the author will recognise, e.g. "Caliber". */
  readonly AppName: string;
  /** Read-only. Return a claim for each asked slug this app owns; omit the rest. */
  FindClaims(slugs: readonly string[], contextUser: UserInfo): Promise<DistributionClaim[]>;
}
interface DistributionClaim {
  slug: string;                 // must be one of the asked slugs
  ownerLabel: string;           // what in the consumer owns it, e.g. the step name
  respondentUrl: string | null; // the consumer's public link, or null when it must not be published
}
```

- `respondentUrl: null` covers Caliber's rule that only a Deferred-handoff front door is safe to publish (`bizapps-caliber/packages/Angular/src/lib/studio/shared/blueprint-front-door.ts:43-56`). The tab then tells the author to use the link the consumer gives them, and shows no URL.
- `contextUser` is the builder user. The provider decides what that user may learn.

### What Forms does with it

- **`readClaimProviders(store)`** reads the slot. Each entry is validated: `AppName` must be a non-blank string and `FindClaims` a function. A malformed entry becomes a reported failure; it is never ignored silently.
- **`findDistributionClaims(slugs, contextUser, providers)`** asks every provider in parallel.
  - Each call is capped at `CLAIM_PROVIDER_TIMEOUT_MS = 5000`.
  - A throw, a rejection or a timeout becomes a `{ appName, message }` failure and is logged with the slugs and the app.
  - A claim for a slug that was not asked is dropped and reported.
  - A `respondentUrl` that is not absolute `http:`/`https:` is nulled and reported. The tab renders it as a link, so a `javascript:` URL must never reach it.
- **`loadFormDistributionClaims(deps, formId, contextUser)`** is the authorization and data boundary:
  1. It requires `CanUpdate` on `MJ_BizApps_Forms: Form Distributions`. This is the same eligibility rule as `asset/asset.service.ts:203`. The anonymous "Form Respondent" role has scope-filtered **read** on distributions (`migrations/V202608131600…:180`) but no update, so a magic-link session is refused. A second "is anonymous" check would be a second definition of the same fact (`download/download.service.ts:34-39`).
  2. It reads the form's slugs itself (`RunView`, `simple`, `Fields: ['Slug']`, `Slug IS NOT NULL`, under `contextUser`). A caller therefore cannot use the query to probe arbitrary slugs.
  3. It returns `{ claims, failures }`. No slugs means no provider calls.
- **`FormDistributionClaims(formId: String!)`** is the GraphQL query: a thin TypeGraphQL resolver over the service. It gets its own `RESOLVER_PATHS` glob entry.

### What the builder shows

- After every successful `reload()`, the tab calls `DistributionService.claims(formId)`. It never raises `loading`, and a stale answer is discarded by a generation counter.
- **Selected link, when claimed:** a warning between the header and the Link / QR / Embed switcher, so it covers all three. The text is built by the pure helper `claimNotice(claims)`:
  - Line 1: "**Caliber** uses this link for **Technology Fellow screen**. Responses sent here are saved as form responses only. Caliber never sees them."
  - Line 2 with a URL: "Send people to Caliber's link instead:", then a readonly field and a "Copy link" button.
  - Line 2 without a URL: "Share the link Caliber gives you instead."
  - If two apps claim one slug, it shows one line per claim.
- **Claimed link:** the "Send this to anyone…" note is replaced with "This link stores responses only."
- **Rail row of a claimed link:** "· used by Caliber" is added to the meta line.
- **Provider failures:** one muted note above the panes: "Couldn't check whether Caliber uses these links: <message>." The links still render, because a failed check must not hide them.
- **The claims request itself fails** (network, permission): the same muted note, with the error. Never silence.

## Files

| File | Responsibility |
|---|---|
| Create `packages/Server/src/distribution-claims/claim-contract.ts` | Protocol types, slot key, timeout constant |
| Create `packages/Server/src/distribution-claims/find-claims.ts` | `readClaimProviders`, `findDistributionClaims` (validation, timeout, failure capture) |
| Create `packages/Server/src/distribution-claims/claims.service.ts` | `loadFormDistributionClaims` (permission + slug read + find) |
| Create `packages/Server/src/distribution-claims/graphql-types.ts` | `DistributionClaimType`, `DistributionClaimFailureType`, `DistributionClaimsResultType` |
| Create `packages/Server/src/distribution-claims/DistributionClaimsResolver.ts` | `FormDistributionClaims` query |
| Modify `packages/Server/src/index.ts:101-104` | Add the resolver glob to `RESOLVER_PATHS` |
| Test `packages/Server/src/distribution-claims/__tests__/find-claims.spec.ts`, `claims.service.spec.ts`, `resolver-registration.spec.ts` | |
| Create `packages/Angular/src/lib/builder/distribution-claims.ts` | Client types, `parseClaimsPayload`, `claimsBySlug`, `claimNotice`, `failureNotice` (pure) |
| Modify `packages/Angular/src/lib/builder/distribution.service.ts` | `claims(formId)` over `ExecuteGQL` |
| Modify `packages/Angular/src/lib/builder/distribution-manager.component.{ts,html}`, `distribution-manager.styles.ts` | Load + render |
| Test `packages/Angular/src/lib/builder/distribution-claims.spec.ts`; extend `distribution-manager.behaviour.spec.ts`, `distribution-manager.spec.ts` | |
| Create `docs/distribution-claims.md` | The protocol for consumer apps (they cannot import our types) |
| Create `.changeset/distribution-claims-warning.md` | `patch` (no migration, no metadata) |

## Global Constraints

- No `any`. `unknown` is used only at the two genuinely untrusted boundaries: the global-store slot, whose `GlobalObjectStore` index type is `any` (`MJGlobal/src/util.ts:8-11`), and the GraphQL payload. Each is narrowed by a type guard on the next line, with a comment saying why.
- No re-exports between packages. Static imports only. Forms imports nothing from Caliber, and the protocol is documented rather than shared as a package.
- Never swallow errors. Every failure becomes a reported `failures[]` entry and a `LogError` that names the app, the form or slugs, and the cause.
- Every wait is capped: `CLAIM_PROVIDER_TIMEOUT_MS = 5000`.
- Command–query separation: `FindClaims` / `find*` / `read*` / `load*` / `parse*` are reads. The builder issues no writes for this feature.
- Builder CSS uses `--mj-*` / `--mjf-*` tokens only (`npm run lint:ui`). Font Awesome icons are allowed here, since the builder is Explorer-hosted.
- PascalCase public members on classes and interfaces the consumer implements (`AppName`, `FindClaims`). camelCase for data fields (`slug`, `ownerLabel`, `respondentUrl`), matching the GraphQL field style of `graphql-types.ts`.
- Changeset level: `patch` (`.claude/rules/changesets.md`).
- Tests: `.spec.ts`, Server tests in `__tests__/`, builder tests colocated. A green Angular `pnpm test` does not compile the builder component, so `pnpm run typecheck` and `ngc` (`pnpm run build`) are gates too.

## Review Focus

1. **A provider that hangs.** The query must still answer after the timeout, with that app listed under failures, so the tab cannot sit waiting forever. → Task 1 test "times out a provider that never answers".
2. **An anonymous magic-link session calls the query.** It must be refused. The respondent role can read distributions, so a check on *read* permission would let it through. → Task 2 test "refuses a caller who cannot update share links".
3. **A provider returns a `javascript:` or relative `respondentUrl`.** It must never be rendered as a link. → Task 1 test "nulls a respondentUrl that is not absolute http(s)".
4. **A provider claims a slug it was not asked about**, such as another form's link. It must not appear. → Task 1 test "drops a claim for a slug that was not asked".
5. **The author switches forms or reloads while claims are in flight.** A stale answer must not paint the wrong form's links. → Task 4 test "ignores a claims answer that arrives after a newer reload".

---

### Task 1: Server — protocol, provider registry read, and the claim fan-out

**Files:**
- Create: `packages/Server/src/distribution-claims/claim-contract.ts`
- Create: `packages/Server/src/distribution-claims/find-claims.ts`
- Test: `packages/Server/src/distribution-claims/__tests__/find-claims.spec.ts`

**Interfaces:**
- Produces: `DISTRIBUTION_CLAIM_PROVIDERS_KEY: string`, `CLAIM_PROVIDER_TIMEOUT_MS: number`, `DistributionClaim`, `DistributionClaimProvider`, `ClaimFailure { appName: string; message: string }`, `ClaimLookup { claims: AttributedClaim[]; failures: ClaimFailure[] }`, `AttributedClaim = DistributionClaim & { appName: string }`, `readClaimProviders(store: GlobalObjectStore | null): { providers: DistributionClaimProvider[]; failures: ClaimFailure[] }`, `findDistributionClaims(slugs: readonly string[], contextUser: UserInfo, providers: readonly DistributionClaimProvider[], timeoutMs?: number): Promise<ClaimLookup>`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/Server/src/distribution-claims/__tests__/find-claims.spec.ts
import { describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { DISTRIBUTION_CLAIM_PROVIDERS_KEY, type DistributionClaimProvider } from '../claim-contract';
import { findDistributionClaims, readClaimProviders } from '../find-claims';

vi.mock('@memberjunction/core', async (orig) => ({ ...(await orig<typeof import('@memberjunction/core')>()), LogError: vi.fn() }));

const user = { ID: 'u1' } as UserInfo;
const provider = (over: Partial<DistributionClaimProvider> = {}): DistributionClaimProvider => ({
  AppName: 'Caliber',
  FindClaims: async (slugs) => slugs.filter((s) => s === 'intake').map((slug) => ({ slug, ownerLabel: 'Screen step', respondentUrl: 'https://host.example/interview?blueprint=1' })),
  ...over,
});

describe('readClaimProviders', () => {
  it('returns no providers and no failures when nothing is registered', () => {
    expect(readClaimProviders({})).toEqual({ providers: [], failures: [] });
    expect(readClaimProviders(null)).toEqual({ providers: [], failures: [] });
  });
  it('returns well-formed providers from the slot', () => {
    const p = provider();
    expect(readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: [p] }).providers).toEqual([p]);
  });
  it('reports a malformed entry instead of skipping it silently', () => {
    const out = readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: [{ AppName: 'X' }, 42] });
    expect(out.providers).toEqual([]);
    expect(out.failures).toHaveLength(2);
    expect(out.failures[0]).toEqual({ appName: 'X', message: expect.stringContaining('FindClaims') });
  });
  it('reports a slot that is not an array', () => {
    expect(readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: { AppName: 'X' } }).failures).toHaveLength(1);
  });
});

describe('findDistributionClaims', () => {
  it('attributes each claim to the app that made it', async () => {
    const out = await findDistributionClaims(['intake', 'survey'], user, [provider()]);
    expect(out).toEqual({ claims: [{ appName: 'Caliber', slug: 'intake', ownerLabel: 'Screen step', respondentUrl: 'https://host.example/interview?blueprint=1' }], failures: [] });
  });
  it('asks nobody when there are no slugs', async () => {
    const FindClaims = vi.fn();
    expect(await findDistributionClaims([], user, [provider({ FindClaims })])).toEqual({ claims: [], failures: [] });
    expect(FindClaims).not.toHaveBeenCalled();
  });
  it('turns a throwing provider into a failure and keeps the other answers', async () => {
    const bad = provider({ AppName: 'Broken', FindClaims: async () => { throw new Error('db down'); } });
    const out = await findDistributionClaims(['intake'], user, [bad, provider()]);
    expect(out.claims).toHaveLength(1);
    expect(out.failures).toEqual([{ appName: 'Broken', message: 'db down' }]);
  });
  it('times out a provider that never answers', async () => {
    const hung = provider({ AppName: 'Hung', FindClaims: () => new Promise(() => undefined) });
    const out = await findDistributionClaims(['intake'], user, [hung], 20);
    expect(out.failures).toEqual([{ appName: 'Hung', message: expect.stringContaining('did not answer within') }]);
  });
  it('drops a claim for a slug that was not asked', async () => {
    const greedy = provider({ FindClaims: async () => [{ slug: 'someone-elses', ownerLabel: 'x', respondentUrl: null }] });
    const out = await findDistributionClaims(['intake'], user, [greedy]);
    expect(out.claims).toEqual([]);
    expect(out.failures[0].message).toContain('someone-elses');
  });
  it('nulls a respondentUrl that is not absolute http(s)', async () => {
    for (const bad of ['javascript:alert(1)', '/interview?blueprint=1', 'ftp://x/y', '']) {
      const p = provider({ FindClaims: async () => [{ slug: 'intake', ownerLabel: 'S', respondentUrl: bad }] });
      const out = await findDistributionClaims(['intake'], user, [p]);
      expect(out.claims[0].respondentUrl).toBeNull();
      expect(out.failures).toHaveLength(1);
    }
  });
  it('reports a provider that returns something other than an array', async () => {
    const odd = provider({ FindClaims: async () => 'yes' as never });
    expect((await findDistributionClaims(['intake'], user, [odd])).failures).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (modules missing): `cd packages/Server && pnpm exec vitest run src/distribution-claims/__tests__/find-claims.spec.ts`

- [ ] **Step 3: Implement**

`claim-contract.ts`: the protocol types exactly as in *Design → The protocol*, plus:
```ts
export const DISTRIBUTION_CLAIM_PROVIDERS_KEY = '__mjBizAppsForms.distributionClaimProviders.v1';
export const CLAIM_PROVIDER_TIMEOUT_MS = 5000;
export interface ClaimFailure { appName: string; message: string }
export type AttributedClaim = DistributionClaim & { appName: string };
export interface ClaimLookup { claims: AttributedClaim[]; failures: ClaimFailure[] }
```
The TSDoc on the key must say: versioned, an array that consumers create if absent and push onto, never replaced, and read lazily on each query so load order does not matter.

`find-claims.ts`:
- `readClaimProviders(store)`:
  - Return `[]/[]` for a null store or a missing slot.
  - A non-array slot → one failure, `appName: 'unknown'`.
  - Each entry goes through `isProvider(entry: unknown)`. A bad entry → a failure named after its `AppName` if that is a string, else `'unknown'`, with the message `"registered a claim provider without a FindClaims function"` or `"…without an AppName"`.
- `findDistributionClaims`:
  - Return early on no slugs.
  - Otherwise `Promise.all(providers.map(askOne))`.
  - `askOne` races `FindClaims` against a `setTimeout` reject and clears the timer in `finally`.
  - It validates the array and each claim: the slug must be asked, `ownerLabel` a non-blank string, and the URL must pass `isPublicHttpUrl` (`new URL()` in a try/catch; protocol `http:` or `https:`). A failed `new URL` returns `false`, and that is not a swallow: the caller records it as a failure.
  - Every failure is passed to `LogError` with `[Forms] distribution claims: <app> for slugs <list>: <message>`.

- [ ] **Step 4: Run, expect PASS.** Then `pnpm run typecheck` in `packages/Server`.
- [ ] **Step 5: Commit** `feat(forms-server): distribution claim protocol and provider fan-out (#292)`

### Task 2: Server — the authorized query

**Files:**
- Create: `packages/Server/src/distribution-claims/claims.service.ts`
- Create: `packages/Server/src/distribution-claims/graphql-types.ts`
- Create: `packages/Server/src/distribution-claims/DistributionClaimsResolver.ts`
- Modify: `packages/Server/src/index.ts` (RESOLVER_PATHS)
- Test: `packages/Server/src/distribution-claims/__tests__/claims.service.spec.ts`, `__tests__/resolver-registration.spec.ts`

**Interfaces:**
- Consumes: Task 1's `findDistributionClaims`, `readClaimProviders`, `ClaimLookup`.
- Produces:
  - `ClaimsServiceDeps { canUpdateDistributions(user: UserInfo): boolean; readSlugs(formId: string, user: UserInfo): Promise<{ ok: true; slugs: string[] } | { ok: false; error: string }>; providers(): { providers: DistributionClaimProvider[]; failures: ClaimFailure[] } }`
  - `loadFormDistributionClaims(deps, formId, user): Promise<ClaimLookup>`. It throws `Error` on refusal or a failed read; the resolver lets that reach the caller, which is an authenticated author, not a respondent.
  - `defaultClaimsServiceDeps(): ClaimsServiceDeps` wires `Metadata.EntityByName(FORM_DISTRIBUTION_ENTITY)?.GetUserPermisions(user).CanUpdate`, the `RunView`, and `readClaimProviders(GetGlobalObjectStore())`.
  - GraphQL: `FormDistributionClaims(formId: String!): DistributionClaimsResult!` with `claims { appName slug ownerLabel respondentUrl }` and `failures { appName message }`.

- [ ] **Step 1: Write the failing tests**

```ts
// claims.service.spec.ts
import { describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { loadFormDistributionClaims, type ClaimsServiceDeps } from '../claims.service';

vi.mock('@memberjunction/core', async (orig) => ({ ...(await orig<typeof import('@memberjunction/core')>()), LogError: vi.fn() }));
const user = { ID: 'u1' } as UserInfo;
const caliber = { AppName: 'Caliber', FindClaims: vi.fn(async (slugs: readonly string[]) => slugs.map((slug) => ({ slug, ownerLabel: 'Step', respondentUrl: null }))) };
const deps = (over: Partial<ClaimsServiceDeps> = {}): ClaimsServiceDeps => ({
  canUpdateDistributions: () => true,
  readSlugs: async () => ({ ok: true, slugs: ['intake'] }),
  providers: () => ({ providers: [caliber], failures: [] }),
  ...over,
});

describe('loadFormDistributionClaims', () => {
  it('refuses a caller who cannot update share links', async () => {
    const readSlugs = vi.fn();
    await expect(loadFormDistributionClaims(deps({ canUpdateDistributions: () => false, readSlugs }), 'f1', user)).rejects.toThrow(/not allowed/i);
    expect(readSlugs).not.toHaveBeenCalled();
  });
  it('rejects a blank form id before reading anything', async () => {
    await expect(loadFormDistributionClaims(deps(), '  ', user)).rejects.toThrow(/formId/);
  });
  it('asks providers only about this form\'s own slugs', async () => {
    const out = await loadFormDistributionClaims(deps(), 'f1', user);
    expect(caliber.FindClaims).toHaveBeenCalledWith(['intake'], user);
    expect(out.claims).toEqual([{ appName: 'Caliber', slug: 'intake', ownerLabel: 'Step', respondentUrl: null }]);
  });
  it('throws with context when the slug read fails, rather than answering "no claims"', async () => {
    await expect(loadFormDistributionClaims(deps({ readSlugs: async () => ({ ok: false, error: 'timeout' }) }), 'f1', user)).rejects.toThrow(/f1.*timeout/);
  });
  it('carries registry failures through to the answer', async () => {
    const out = await loadFormDistributionClaims(deps({ providers: () => ({ providers: [], failures: [{ appName: 'X', message: 'bad' }] }) }), 'f1', user);
    expect(out.failures).toEqual([{ appName: 'X', message: 'bad' }]);
  });
});
```

```ts
// resolver-registration.spec.ts: the resolver is only live if RESOLVER_PATHS globs its file.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
describe('FormDistributionClaims registration', () => {
  it('is discovered by RESOLVER_PATHS', () => {
    const index = readFileSync(resolve(__dirname, '../../index.ts'), 'utf8');
    expect(index).toMatch(/distribution-claims\/\*Resolver\.\{js,ts\}/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - The service guards the blank `formId` first, then the permission (`'Not allowed to read share-link claims for form <id>'`), then `readSlugs`. On a read failure it throws `Error('Could not read share links for form <id>: <error>')`.
  - It finds claims and merges the registry failures first.
  - The resolver mirrors `PublicFormResolver`: `@Resolver() extends ResolverBase`, `this.GetUserFromPayload(userPayload)` (throw when absent), and maps to the GraphQL types with `Object.assign`.
  - `index.ts`: `RESOLVER_PATHS.push(resolve(__dirname, 'distribution-claims/*Resolver.{js,ts}'));`, with a comment that it is an authenticated author query, not a respondent one.
- [ ] **Step 4: Run, expect PASS.** Then `pnpm run typecheck && pnpm run build` in `packages/Server`.
- [ ] **Step 5: Commit** `feat(forms-server): FormDistributionClaims query for share-link owners (#292)`

### Task 3: Builder — client read and pure presentation helpers

**Files:**
- Create: `packages/Angular/src/lib/builder/distribution-claims.ts`
- Modify: `packages/Angular/src/lib/builder/distribution.service.ts` (add `claims`)
- Test: `packages/Angular/src/lib/builder/distribution-claims.spec.ts`

**Interfaces:**
- Produces:
  - `ShareLinkClaim { appName: string; slug: string; ownerLabel: string; respondentUrl: string | null }`
  - `ClaimsResult = { ok: true; claims: ShareLinkClaim[]; failures: { appName: string; message: string }[] } | { ok: false; error: string }`
  - `parseClaimsPayload(payload: unknown): ClaimsResult`
  - `claimsBySlug(claims): Map<string, ShareLinkClaim[]>`
  - `claimNotice(claims: ShareLinkClaim[]): { headline: string; lines: { appName: string; ownerLabel: string; respondentUrl: string | null }[] }`
  - `failureNotice(result: ClaimsResult): string | null`
  - `DistributionService.claims(formId: string): Promise<ClaimsResult>`
  - `FORM_DISTRIBUTION_CLAIMS_QUERY: string`

- [ ] **Step 1: Write the failing tests.** The cases:
  - The parse accepts the server shape.
  - The parse turns a missing or garbled payload into `{ ok: false }` with a message, never into `{ ok: true, claims: [] }`.
  - `claimsBySlug` groups two apps on one slug.
  - `claimNotice` names the app and the owner, with a single headline for one claim and one line per claim for two.
  - `failureNotice` returns `null` when nothing failed, and otherwise `Couldn't check whether Caliber uses these links: db down`.
  - `failureNotice` on `{ ok: false, error }` returns `Couldn't check whether another app uses these links: <error>`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - `claims(formId)`: `try { const data = await GraphQLDataProvider.Instance.ExecuteGQL(FORM_DISTRIBUTION_CLAIMS_QUERY, { formId }); return parseClaimsPayload(data); } catch (e) { LogError(...form id...); return { ok: false, error: message }; }`
  - `parseClaimsPayload` narrows `unknown` with guards; the comment states it is the network boundary.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(forms-ng): read share-link claims for the Distribute tab (#292)`

### Task 4: Builder — render the warning

**Files:**
- Modify: `packages/Angular/src/lib/builder/distribution-manager.component.ts`, `.html`, `distribution-manager.styles.ts`
- Test: extend `distribution-manager.behaviour.spec.ts` (service double gains `claims`), `distribution-manager.spec.ts` (template text)

**Interfaces:**
- Consumes: Task 3's `DistributionService.claims`, `claimsBySlug`, `claimNotice`, `failureNotice`.
- Produces (component, protected):
  - `claimsFor(link): ShareLinkClaim[]`
  - `claimCheckNote: string | null`
  - `CopyTarget` gains `'consumer'`

- [ ] **Step 1: Write the failing tests.**
  - Behaviour:
    - After `ngOnInit`, `claims` was called with the form id.
    - `claimsFor(link)` returns the claim for a claimed slug and `[]` for others.
    - A `{ ok:false }` answer sets `claimCheckNote` and leaves `links` rendered.
    - **"ignores a claims answer that arrives after a newer reload".** The first `claims()` resolves after the second; only the second's answer applies.
    - A claims failure never sets `loadError`.
  - Template:
    - The warning block is inside `@if (claimsFor(link).length)` and sits before `dm-views`.
    - It shows the app name and owner label.
    - It binds the consumer link in a readonly input with a copy button using `copy('consumer', …)`.
    - The "Send this to anyone" note is conditional on no claims.
    - The rail meta shows "used by".
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - `private claimsGeneration = 0`.
  - At the end of a successful `reload()`: `void this.loadClaims()`.
  - `loadClaims` increments the generation, awaits `service.claims(formId)`, drops the answer if the generation moved, and sets `claimIndex` and `claimCheckNote`.
  - The template uses `mjf-alert mjf-alert--warn` if that modifier exists in `FORMS_UI_CSS`, else a new `.dm-claim` with `--mj-status-warning*` tokens. Run `npm run lint:ui`.
- [ ] **Step 4: Run tests, then `pnpm run typecheck` and `pnpm run build` (ngc) in `packages/Angular`.**
- [ ] **Step 5: Commit** `feat(forms-ng): warn on a share link another app owns (#292)`

### Task 5: Consumer documentation and changeset

**Files:**
- Create: `docs/distribution-claims.md`. It covers: the slot key; an example provider written without importing Forms; the rules (read-only, answer only for asked slugs, `respondentUrl` absolute http(s) or null, 5 s cap); and what Forms shows.
- Create: `.changeset/distribution-claims-warning.md`. Bump `'@mj-biz-apps/forms-server': patch` and `'@mj-biz-apps/forms-ng': patch`. The prose says what an author now sees, and that it needs the consumer to register a provider.
- [ ] Commit `docs: the distribution claim protocol for consumer apps (#292)`

## Non-goals

- Changing what `/f/<slug>` does for a claimed link (no refuse and no redirect).
- Making a Forms-link submission run Caliber's intake.
- Caliber's provider. That goes in the bizapps-caliber issue filed with the PR.
- Any schema, migration or metadata change.
- Detecting orphaned FormResponses already collected on claimed links.

## Done-condition (falsifiable)

1. With a provider registered that claims slug S of form F, `FormDistributionClaims(formId: F)` run by an author returns S with the app name, owner label and URL.
2. The same query from a session without `CanUpdate` on Form Distributions is refused.
3. The Distribute tab of F shows the warning on S's link, naming the app and offering the consumer's link. It shows nothing new on F's other links.
4. With no provider registered, the query returns `{claims: [], failures: []}` and the tab is unchanged.
5. A provider that throws or hangs produces a visible note, and the links still render.
6. `grep -rn caliber packages/*/src` (case-insensitive) finds no new import.
