# Redeem Failure Diagnostics Implementation Plan (bizapps-forms#140)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Written 2026-09-09, against a base that has since moved.** This plan was made at branch point
> `ed26f16`, where a tripped redemption rate limit genuinely was `redeem-failed` and a 502. #139
> shipped in #188 on 2026-09-11 and is now in this branch's base, so that one shape already answers
> the respondent 429 with a retry hint, and `postRedeem` gained a 10s deadline. What this plan still
> describes correctly is everything else; where it says splitting the page is "#139's decision, not
> this one", read that as done rather than pending. The plan is left as written — it is the record of
> a decision made on a date, not a description of the merged result.

**Goal:** Make every way `/f/:slug` can fail to redeem a magic link say so in the API log and in its returned reason, instead of collapsing four unrelated causes into one silent `redeem-failed`.

**Architecture:** `postRedeem` in `packages/Server/src/respondent-host/redeem.service.ts` stops returning `RedeemMagicLinkJsonResult | undefined` and starts returning a string-discriminated `PostRedeemOutcome` — either the minted token, or the typed reason there is none. Every failure branch inside it emits one `LogError` carrying the slug, the endpoint, and whatever core actually said, and never the raw `PublicLinkToken` or the minted JWT. `RedeemFailureReason` gains two members — `redeem-unreachable` (we never got a usable answer) and `redeem-refused` (core answered and said no) — so `error-view.ts` has something to branch on; both keep today's 502 view, because splitting the *page* is bizapps-forms#139's decision, not this one.

**Tech Stack:** TypeScript (no `strictNullChecks` in the build config), Vitest (`.spec.ts` under `__tests__/`), `LogError` from `@memberjunction/core`, captured in tests with `vi.mock` + `vi.hoisted`.

**Spec:** [bizapps-forms#140](https://github.com/MemberJunction/bizapps-forms/issues/140) — "The respondent-host redeem discards every failure reason into two bare `catch {}`, so a 502 on /f/:slug logs nothing at all"

## Global Constraints

- **Never swallow errors** (`.claude/rules/design-principles.md`): every `catch` logs, throws, or returns a failure result *with context*. No empty catch, no silent fallback.
- **No `any`** — no `as any`, `: any`, `<any>`; `unknown` only where it is genuinely unknown (the `catch (e: unknown)` idiom already used in `captcha-demand.ts:79` and `host-readiness.ts:124`).
- **No log line may contain the raw `PublicLinkToken` or the minted session JWT.** Both are credentials. The slug is the safe handle.
- **String discriminants only** for new union types in this package. `packages/Server` builds without `strictNullChecks` (it changes `emitDecoratorMetadata` output, which type-graphql reads at runtime — see the note at `redeem.service.ts:86-89`), and TypeScript narrows a boolean-literal discriminant only *with* it. The existing `DistributionRowVerdict` is the pattern to copy.
- **`LogError`, not `LogStatus`.** MJ silences `LogStatus` under `NODE_ENV=production`; `LogError` always reaches `console.error`. Production diagnosability is the entire point of this change (see the notes in `public-submit/__tests__/respondent-safe.spec.ts:26`).
- **Capture `LogError` in tests with `vi.mock('@memberjunction/core', …)` + `vi.hoisted`, never `vi.spyOn`.** `vi.spyOn` on a module export passes in this dev workspace (MJ resolves to linked source, a transformable namespace) and fails in CI (published tarball, externalised as real ESM, frozen namespace) with `Cannot redefine property: LogError`. The reasoning is written out at `public-submit/__tests__/default-salt-warning.spec.ts:12-18`.
- **Changeset level: `patch`.** `.claude/rules/changesets.md` — `minor` only when the change ships `migrations/**.sql` or `metadata/**`. This ships neither. Every package is in one *fixed* changeset group, so one unjustified `minor` moves all four.
- **No user-visible behaviour change.** Every reason still renders the same page with the same status it renders today. This is a diagnosability change; #139 is the one that changes what a respondent sees.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `packages/Server/src/respondent-host/redeem.service.ts` | Slug → redeemed session JWT, and the typed reason when it cannot be | Modify: reasons list, `PostRedeemOutcome`, `postRedeem` logging, caller simplification |
| `packages/Server/src/respondent-host/error-view.ts` | Pure `RedeemFailureReason` → respondent-facing message + status | Modify: two new `case` arms (the compile-time exhaustiveness assert forces this) |
| `packages/Server/src/respondent-host/__tests__/redeem.service.spec.ts` | Unit spec for the redeem flow | Modify: `LogError` capture, reasons updated, new log + credential-safety tests |
| `packages/Server/src/respondent-host/__tests__/middleware-error-view.spec.ts` | Unit spec for the error view | Modify: hand-maintained reason lists derived from the exported array; two new status assertions |
| `.changeset/redeem-failures-say-why.md` | Release note | Create |

Nothing else changes. `RespondentHostMiddleware.ts:217` already passes `outcome.reason` straight through to `redeemFailureToView`, so the two new reasons reach the view with no edit there.

---

### Task 1: Make the reason list one value, and add the two new reasons

The union is about to gain two members, and three hand-maintained copies of it live in `middleware-error-view.spec.ts` (lines 120, 153, 167). That is the "decision duplicated in two places" the repo's design principles forbid: adding a member today means editing four places and nothing fails if you miss three. Derive the type from an exported array first, so the rest of the plan cannot drift.

**Files:**
- Modify: `packages/Server/src/respondent-host/redeem.service.ts:50-58`
- Modify: `packages/Server/src/respondent-host/error-view.ts:76-91`
- Modify: `packages/Server/src/respondent-host/__tests__/middleware-error-view.spec.ts:118-172`
- Test: `packages/Server/src/respondent-host/__tests__/middleware-error-view.spec.ts`

**Interfaces:**
- Produces: `export const REDEEM_FAILURE_REASONS` (a `readonly string[]` literal tuple) and `export type RedeemFailureReason = (typeof REDEEM_FAILURE_REASONS)[number]` from `redeem.service.ts`. Task 2 returns `'redeem-unreachable'` and `'redeem-refused'` from this union; Task 3's tests import the array.

- [ ] **Step 1: Write the failing test**

In `packages/Server/src/respondent-host/__tests__/middleware-error-view.spec.ts`, add to the top-level `import` of `../redeem.service` (add the import if the file has none):

```ts
import { REDEEM_FAILURE_REASONS } from '../redeem.service';
```

Add this test inside the outer `describe` (put it just above the existing `it('still falls back to 502 for a reason it does not know', …)`):

```ts
  // Every reason must reach a deliberate arm of the switch. The `default` answers 502 at runtime
  // for a value from outside the union, so a NEW member silently inheriting 502 is exactly the
  // failure this pins — the compile-time assert cannot see a member that was never added here.
  it('gives every declared reason a view, including the two redeem outcomes', () => {
    expect(REDEEM_FAILURE_REASONS).toContain('redeem-unreachable');
    expect(REDEEM_FAILURE_REASONS).toContain('redeem-refused');
    for (const reason of REDEEM_FAILURE_REASONS) {
      const view = redeemFailureToView(reason);
      expect(view.message.length).toBeGreaterThan(0);
      expect(view.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('keeps both new redeem reasons on the generic 502 (#139 splits the page, not this change)', () => {
    expect(redeemFailureToView('redeem-unreachable').status).toBe(502);
    expect(redeemFailureToView('redeem-refused').status).toBe(502);
    expect(redeemFailureToView('redeem-unreachable').message).toBe(redeemFailureToView('redeem-failed').message);
    expect(redeemFailureToView('redeem-refused').message).toBe(redeemFailureToView('redeem-failed').message);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/Server && npx vitest run src/respondent-host/__tests__/middleware-error-view.spec.ts --reporter=basic`

Expected: FAIL — `REDEEM_FAILURE_REASONS` is not exported (`No matching export` / `is not defined`).

- [ ] **Step 3: Write minimal implementation**

Replace `packages/Server/src/respondent-host/redeem.service.ts:50-58` with:

```ts
/**
 * Every reason a slug can fail to become a redeemed session token — as a VALUE, with the union
 * derived from it. One list, not two: `error-view.ts` proves at compile time that it handles each
 * member, and its spec iterates this array, so a new reason cannot be added without both a view
 * and a test. Three hand-maintained copies of this list used to live in that spec, and nothing
 * failed when one of them fell out of step.
 */
export const REDEEM_FAILURE_REASONS = [
  'distribution-not-found',
  'distribution-not-yet-open',
  'distribution-closed',
  'distribution-full',
  'form-unpublished',
  'no-token',
  // The door's own pre-redeem read failed — a database problem, not a redeem one. Logged by
  // `hasPublishedVersion`, which is the frame that knows what it was reading.
  'redeem-failed',
  // The three below the redeem endpoint: we asked and never got a usable answer (connect refused,
  // DNS, TLS, a truncated body, an HTML error page from a proxy, a JSON body of some other shape).
  'redeem-unreachable',
  // Core answered and said no — a revoked token, an exhausted invite, a tripped rate limit — or
  // answered "success" while returning no token, which is the same thing from here.
  'redeem-refused',
] as const;

/** Why a slug could not be turned into a redeemed session token. */
export type RedeemFailureReason = (typeof REDEEM_FAILURE_REASONS)[number];
```

In `packages/Server/src/respondent-host/error-view.ts`, replace the single `case 'redeem-failed':` arm at line 76-77 with:

```ts
    // All three keep the generic 502 the single reason had. The pair exists so the operator's LOG
    // can tell an unreachable endpoint from a refusal (bizapps-forms#140); telling the RESPONDENT
    // apart is a separate decision, and bizapps-forms#139 makes it for the refusal case — someone
    // who tripped the redeem rate limit should hear 429 "try again", not "we are broken". Two
    // changes on purpose: this one is not user-visible, so it cannot regress a respondent.
    case 'redeem-failed':
    case 'redeem-unreachable':
    case 'redeem-refused':
      return redeemFailedView();
```

And update the helper's doc comment at line 88:

```ts
/** The generic failure view, shared by the three failure reasons and the unreachable default. */
```

- [ ] **Step 4: Replace the three hand-maintained reason lists in the spec**

In `middleware-error-view.spec.ts`, replace the array literal at line 120 with a derivation:

```ts
    it('leaves the states it does not speak for on the default title', () => {
      // Derived, not listed: a reason added later lands here automatically and must either have a
      // title of its own (add it to the exclusion) or prove it wants the default.
      const speaksForItself = new Set(['distribution-not-yet-open', 'form-unpublished']);
      for (const reason of REDEEM_FAILURE_REASONS.filter((r) => !speaksForItself.has(r))) {
        expect(redeemFailureToView(reason).title).toBeUndefined();
      }
    });
```

Replace the array literal at line 153 (`sets no Retry-After on any reason but not-yet-open`):

```ts
  it('sets no Retry-After on any reason but not-yet-open', () => {
    for (const reason of REDEEM_FAILURE_REASONS.filter((r) => r !== 'distribution-not-yet-open')) {
      expect(redeemFailureToView(reason).retryAfter).toBeUndefined();
    }
  });
```

Replace the array literal at line 167 (`returns a non-empty respondent-facing message for every reason`):

```ts
  it('returns a non-empty respondent-facing message for every reason', () => {
    for (const reason of REDEEM_FAILURE_REASONS) {
      expect(redeemFailureToView(reason).message.length).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/Server && npx vitest run src/respondent-host/__tests__/middleware-error-view.spec.ts --reporter=basic`

Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add packages/Server/src/respondent-host/redeem.service.ts packages/Server/src/respondent-host/error-view.ts packages/Server/src/respondent-host/__tests__/middleware-error-view.spec.ts
git commit -m "refactor(server): one list of redeem failure reasons, plus the two the redeem needs"
```

---

### Task 2: Log every redeem failure, and return the reason it was

**Files:**
- Modify: `packages/Server/src/respondent-host/redeem.service.ts:223-250` (`postRedeem`) and `:288-292` (its caller)
- Test: `packages/Server/src/respondent-host/__tests__/redeem.service.spec.ts`

**Interfaces:**
- Consumes: `RedeemFailureReason` from Task 1, including `'redeem-unreachable'` and `'redeem-refused'`.
- Produces: `postRedeem(deps: RedeemDeps, rawToken: string, slug: string): Promise<PostRedeemOutcome>` where `type PostRedeemOutcome = { outcome: 'ok'; token: string } | { outcome: 'failed'; reason: RedeemFailureReason }`. Module-private — nothing outside the file consumes it. `redeemSlugToToken`'s exported signature is unchanged.

- [ ] **Step 1: Write the failing tests**

First, add the `LogError` capture at the very top of `redeem.service.spec.ts`, **above** the existing `import` of `../redeem.service` (hoisting order matters — the mock must be registered before the module under test is imported):

```ts
/**
 * `LogError` is captured with `vi.mock` + `vi.hoisted`, NOT `vi.spyOn(core, 'LogError')`. A spy on
 * a module export passes here and fails in CI: in this dev workspace `@memberjunction/core`
 * resolves to MJ's linked source, which Vitest transforms into a redefinable namespace; on a clean
 * install it resolves to the published tarball, externalised as real ESM, whose namespace object is
 * frozen — `Cannot redefine property: LogError`. See `default-salt-warning.spec.ts`.
 */
const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: logError,
}));
```

Add `beforeEach(() => { logError.mockClear(); });` inside the `describe('redeemSlugToToken', …)` block if one is not already present, and a helper beside the other helpers:

```ts
/** Every line `LogError` was handed, joined — for asserting what a log does and does not contain. */
function loggedLines(): string {
  return logError.mock.calls.map((c) => String(c[0])).join('\n');
}
```

Give the existing `fakeFetch` helper an HTTP status, so the log lines under test carry a real one:

```ts
/** A `fetch` stub returning the given JSON body + ok/status. */
function fakeFetch(body: unknown, init: { ok?: boolean; status?: number } = {}): typeof fetch {
  return vi.fn(async () => {
    return {
      ok: init.ok ?? true,
      status: init.status ?? (init.ok === false ? 500 : 200),
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}
```

Now change the four existing assertions that name the reason (they are correct about failing, wrong about which reason it now is):

- `it('returns redeem-failed when core reports success=false', …)` → rename to `returns redeem-refused …`, expect `'redeem-refused'`.
- `it('returns redeem-failed when core succeeds but returns no token', …)` → rename to `returns redeem-refused …`, expect `'redeem-refused'`.
- `it('returns redeem-failed when fetch throws (network down — fail-safe)', …)` → rename to `returns redeem-unreachable …`, expect `'redeem-unreachable'`.
- `it('returns redeem-failed when the response body is not the expected shape', …)` → rename to `returns redeem-unreachable …`, expect `'redeem-unreachable'`.

Leave `it('fails closed as redeem-failed, minting no token, when the version read fails', …)` expecting `'redeem-failed'` — that one is the door's own read, not the redeem.

Then add this block at the end of the `describe('redeemSlugToToken', …)`:

```ts
  // bizapps-forms#140. `/f/:slug` is the anonymous public entry point: a production failure has no
  // reproduction steps and no user to interview, so the log line IS the diagnosis. These assert
  // that one is emitted and what it carries — never that the source contains a `LogError` call.
  describe('says why the redeem failed', () => {
    /** A `fetch` stub that rejects the way a connect failure actually arrives. */
    function refusingFetch(): typeof fetch {
      return vi.fn(async () => {
        throw new Error('fetch failed: ECONNREFUSED 127.0.0.1:4121');
      }) as unknown as typeof fetch;
    }

    /** A `fetch` stub whose body is not JSON — a proxy's HTML error page, say. */
    function unparseableFetch(): typeof fetch {
      return vi.fn(async () => {
        return {
          ok: false,
          status: 502,
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON at position 0');
          },
        } as Response;
      }) as unknown as typeof fetch;
    }

    it('logs the slug, the endpoint and the error when the transport fails', async () => {
      const out = await redeemSlugToToken(deps({ fetchImpl: refusingFetch() }), 'customer-survey');
      expect(out.reason).toBe('redeem-unreachable');
      const logged = loggedLines();
      expect(logged).toContain('customer-survey');
      expect(logged).toContain('http://localhost:4121/magic-link/redeem');
      expect(logged).toContain('ECONNREFUSED');
    });

    it('logs the slug, the endpoint and the parse error when the body is not JSON', async () => {
      const out = await redeemSlugToToken(deps({ fetchImpl: unparseableFetch() }), 'customer-survey');
      expect(out.reason).toBe('redeem-unreachable');
      const logged = loggedLines();
      expect(logged).toContain('customer-survey');
      expect(logged).toContain('http://localhost:4121/magic-link/redeem');
      expect(logged).toContain('Unexpected token <');
    });

    it('logs the slug and the endpoint when the body is JSON of some other shape', async () => {
      const out = await redeemSlugToToken(
        deps({ fetchImpl: fakeFetch({ notARedeemResult: true }) }),
        'customer-survey',
      );
      expect(out.reason).toBe('redeem-unreachable');
      const logged = loggedLines();
      expect(logged).toContain('customer-survey');
      expect(logged).toContain('http://localhost:4121/magic-link/redeem');
    });

    // The line whose absence cost a two-repository source read to learn that the answer had been
    // "Too many redemption attempts. Try again later." all along. Core sends the sentence; the door
    // threw it away unread.
    it("logs core's own errorCode and message when the endpoint refuses", async () => {
      const out = await redeemSlugToToken(
        deps({
          fetchImpl: fakeFetch(
            { success: false, errorCode: 'rate_limited', error: 'Too many redemption attempts. Try again later.' },
            { status: 429 },
          ),
        }),
        'customer-survey',
      );
      expect(out.reason).toBe('redeem-refused');
      const logged = loggedLines();
      expect(logged).toContain('customer-survey');
      expect(logged).toContain('rate_limited');
      expect(logged).toContain('Too many redemption attempts. Try again later.');
    });

    it('logs the refusal when core reports success with no token', async () => {
      const out = await redeemSlugToToken(deps({ fetchImpl: fakeFetch({ success: true }) }), 'customer-survey');
      expect(out.reason).toBe('redeem-refused');
      expect(loggedLines()).toContain('customer-survey');
    });

    it('distinguishes an unreachable endpoint from a refusal', async () => {
      const unreachable = await redeemSlugToToken(deps({ fetchImpl: refusingFetch() }), 'customer-survey');
      const refused = await redeemSlugToToken(
        deps({ fetchImpl: fakeFetch({ success: false, errorCode: 'revoked', error: 'Revoked.' }) }),
        'customer-survey',
      );
      expect(unreachable.reason).not.toBe(refused.reason);
    });

    // Both are credentials. A log line is durable, is shipped to aggregators, and outlives the
    // session — the one place a magic-link token must never be written.
    it('never writes the raw PublicLinkToken or the minted JWT to the log', async () => {
      const shapes: Array<typeof fetch> = [
        refusingFetch(),
        unparseableFetch(),
        fakeFetch({ notARedeemResult: true }),
        fakeFetch({ success: false, errorCode: 'revoked', error: 'This link has been revoked.' }),
        fakeFetch({ success: true }),
        fakeFetch({ success: true, token: 'minted-session-jwt' }),
      ];
      for (const fetchImpl of shapes) {
        await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
      }
      const logged = loggedLines();
      expect(logged).not.toContain('raw-public-token');
      expect(logged).not.toContain('minted-session-jwt');
    });
  });
```

`'raw-public-token'` is the `PublicLinkToken` the existing `fakeDistribution()` helper already sets — do not change it, this test depends on that value.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/Server && npx vitest run src/respondent-host/__tests__/redeem.service.spec.ts --reporter=basic`

Expected: FAIL. The reason assertions fail with `expected 'redeem-failed' to be 'redeem-unreachable'`, and every log assertion fails with `expected '' to contain 'customer-survey'` — nothing is logged today.

- [ ] **Step 3: Write the implementation**

Replace `postRedeem` (`redeem.service.ts:223-250`) entirely with:

```ts
/**
 * The answer from core's redeem endpoint, reduced to the only thing the caller must decide on:
 * the minted token, or the typed reason there is none.
 *
 * A STRING discriminant, like {@link DistributionRowVerdict} above and for the same reason spelled
 * out there: this package compiles without `strictNullChecks`, and TypeScript narrows a
 * boolean-literal discriminant only under it.
 */
type PostRedeemOutcome =
  | { outcome: 'ok'; token: string }
  | { outcome: 'failed'; reason: RedeemFailureReason };

/**
 * POST the raw token to core's redeem endpoint with `format=json` and judge the answer.
 *
 * Every way this can fail is logged HERE, once, with the slug and the endpoint that was called —
 * this is the last frame that still holds both. `/f/:slug` is the anonymous public entry point, so
 * a production failure arrives with no reproduction steps and no user to interview: the log line is
 * the whole diagnosis. Both catches used to be bare and a refusal body was discarded unread, which
 * made an unreachable API, an HTML error page, a revoked token and a tripped rate limit the same
 * silent 502 — and core had already sent the sentence explaining which (bizapps-forms#140).
 *
 * Never logs `rawToken` or the minted JWT. Both are credentials, and a log line is durable, shipped
 * onward, and outlives the session; the slug is the safe handle, and it is already in the URL the
 * operator is looking at.
 *
 * Returning the reason rather than `undefined` is what lets the caller stop guessing: it used to
 * re-derive the failure from three separate falsy checks on a value that had already thrown its
 * evidence away.
 */
async function postRedeem(
  deps: RedeemDeps,
  rawToken: string,
  slug: string,
): Promise<PostRedeemOutcome> {
  // Core reads `format` from the query string only; the body carries `{ token }` as JSON.
  // POST only — a GET with format=json is 405 by design.
  const url = `${deps.redeemUrl}?format=json`;
  let response: Response;
  try {
    response = await deps.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    });
  } catch (e: unknown) {
    LogError(
      `[Forms] Redeem transport failure for distribution '${slug}' (POST ${url}): ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
    return { outcome: 'failed', reason: 'redeem-unreachable' };
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (e: unknown) {
    LogError(
      `[Forms] Redeem response was not readable JSON for distribution '${slug}' ` +
        `(POST ${url}, HTTP ${response.status}): ${e instanceof Error ? e.message : String(e)}`,
    );
    return { outcome: 'failed', reason: 'redeem-unreachable' };
  }
  if (!isRedeemResult(parsed)) {
    // Readable JSON of the wrong shape almost always means the URL points somewhere that is not
    // core's redeem endpoint, so name the configured value rather than only the failure.
    LogError(
      `[Forms] Redeem response was JSON but not a redeem result for distribution '${slug}' ` +
        `(POST ${url}, HTTP ${response.status}). Check that FORMS_MAGICLINK_REDEEM_URL ` +
        `('${deps.redeemUrl}') is core's magic-link redeem endpoint.`,
    );
    return { outcome: 'failed', reason: 'redeem-unreachable' };
  }
  if (!parsed.success || !parsed.token) {
    // Core's own words, verbatim. "success without a token" is folded in here rather than given a
    // reason of its own: from this side it is the same event — the endpoint answered and we hold
    // no session — and it is a core bug, which the parenthetical says so an operator does not go
    // looking for a revoked link.
    LogError(
      `[Forms] Redeem refused for distribution '${slug}' (POST ${url}, HTTP ${response.status}): ` +
        `errorCode=${parsed.errorCode || 'none'} error=${parsed.error || 'none'}` +
        (parsed.success ? ' — core reported success but returned no token' : ''),
    );
    return { outcome: 'failed', reason: 'redeem-refused' };
  }
  return { outcome: 'ok', token: parsed.token };
}
```

Then replace the caller at `redeem.service.ts:288-292`:

```ts
  const redeemed = await postRedeem(deps, judged.rawToken, slug);
  if (redeemed.outcome === 'failed') {
    return { ok: false, reason: redeemed.reason };
  }
  return { ok: true, token: redeemed.token, distribution: dist };
```

The three-way `if (!result || !result.success || !result.token)` is gone: `postRedeem` owns the whole question now, and each of those three states already had a different log line and a different reason inside it.

Finally, update the class comment on `redeemSlugToToken` (`:261-265`) so it stays true — append to the existing paragraph:

```
 * route can render the matching error page and stay fail-safe. Each failure is logged where it
 * happens, by the frame that still holds the context; nothing is discarded on the way up.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/Server && npx vitest run src/respondent-host/__tests__/redeem.service.spec.ts --reporter=basic`

Expected: PASS, all tests.

- [ ] **Step 5: Confirm no bare catch survives under `respondent-host/`**

Run: `grep -rn 'catch\s*{' packages/Server/src/respondent-host/`

Expected: no output. (Acceptance criterion 6.)

- [ ] **Step 6: Commit**

```bash
git add packages/Server/src/respondent-host/redeem.service.ts packages/Server/src/respondent-host/__tests__/redeem.service.spec.ts
git commit -m "fix(server): a failed redeem says which failure it was, in the log and in its reason"
```

---

### Task 3: Verify the whole package, and write the changeset

**Files:**
- Create: `.changeset/redeem-failures-say-why.md`
- Delete: `packages/Server/src/respondent-host/__tests__/repro-140.spec.ts` (the temporary reproduction probe, if it is still on disk)

- [ ] **Step 1: Delete the reproduction probe**

```bash
rm -f packages/Server/src/respondent-host/__tests__/repro-140.spec.ts
```

- [ ] **Step 2: Run the full Server suite**

Run: `cd packages/Server && npx vitest run --reporter=basic`

Expected: PASS. Nothing outside `respondent-host/` reads `RedeemFailureReason`, so no other suite should move.

- [ ] **Step 3: Typecheck and build the package**

Run: `cd packages/Server && npm run typecheck && npm run build`

Expected: both clean. The typecheck config is the one with `strictNullChecks`; it is what proves the string discriminant narrows and that `error-view.ts`'s `assertEveryReasonIsHandled(reason: never)` sees an exhausted union.

- [ ] **Step 4: Write the changeset**

Create `.changeset/redeem-failures-say-why.md`:

```markdown
---
"@mj-biz-apps/forms-server": patch
---

**A failed redeem on `/f/:slug` now says which failure it was.** The server-side magic-link redeem discarded every reason it was given — two bare `catch {}` around the POST and its JSON parse, and a third discard where a *successful* response carrying an explicit `errorCode` and message was collapsed into one enum member. An unreachable API, a proxy's HTML error page, a revoked token and a tripped redemption rate limit were the same 502 to the respondent and, more to the point, the same **nothing** in the log: not one line, at any level, about a request that had just failed.

That is the failure mode where it hurts most. `/f/:slug` is the anonymous public entry point, so a production failure arrives with no reproduction steps and no user to interview; the log is the whole diagnosis. Diagnosing one of these took a source read across two repositories to discover that core had been sending "Too many redemption attempts. Try again later." the entire time, and the door threw the sentence away unread.

Each failure is now logged once, by the frame that still holds the context, with the slug, the endpoint that was called, the HTTP status, and whatever core actually said. Never the raw `PublicLinkToken` and never the minted session JWT — both are credentials, and a log line is durable, shipped onward and outlives the session. A test pins that, rather than trusting a reviewer to notice.

`RedeemFailureReason` gains `redeem-unreachable` (we asked and never got a usable answer) beside `redeem-refused` (core answered and said no), so the difference survives up to the view. **Nothing a respondent sees changes**: both render the same 502 page as before. Splitting the page is the next change — a rate-limited caller should hear 429 "try again shortly" rather than "we are broken" — and it is deliberately not this one, so this fix cannot regress a respondent.

Internally the reason list is now one exported value with the union derived from it. Three hand-maintained copies of that list lived in the error-view spec, and nothing failed when one fell out of step; adding a reason without giving it a view or a test is now a broken build and a red test. Closes #140.
```

- [ ] **Step 5: Commit**

```bash
git add .changeset/redeem-failures-say-why.md
git rm --cached --ignore-unmatch packages/Server/src/respondent-host/__tests__/repro-140.spec.ts
git commit -m "chore(changeset): redeem failures say why"
```

---

## Self-Review

**1. Spec coverage** — every acceptance criterion in #140 maps to a step:

| Acceptance criterion | Where |
|---|---|
| Neither `catch` in `postRedeem` is bare; each logs slug, redeem URL, error message | Task 2 Step 3 (both `catch (e: unknown)` blocks) |
| A parsed body reporting `success: false` logs its `errorCode` and `error` | Task 2 Step 3 (the `!parsed.success \|\| !parsed.token` branch) |
| `RedeemFailureReason` distinguishes transport failed from endpoint refused | Task 1 Step 3 (`redeem-unreachable` / `redeem-refused`) |
| No log line contains the raw `PublicLinkToken` or the minted JWT | Task 2 Step 1, `never writes the raw PublicLinkToken or the minted JWT to the log` |
| A test asserts a log is emitted for each failure shape, not on source text | Task 2 Step 1, the five `logs …` tests (they assert on captured `LogError` calls) |
| Grep confirms no other bare `catch {}` under `respondent-host/` | Task 2 Step 5 |

**2. Placeholder scan** — no TBDs; every code step carries the literal code.

**3. Type consistency** — `REDEEM_FAILURE_REASONS` / `RedeemFailureReason` (Task 1) are the names Task 2 and Task 3 use. `PostRedeemOutcome`'s members (`outcome: 'ok' | 'failed'`, `token`, `reason`) match between its declaration and both call sites. `postRedeem`'s third parameter is `slug` in the declaration and in the caller.

## Execution Handoff

Inline execution, per the requesting engineer — REQUIRED SUB-SKILL: `superpowers:executing-plans`.
