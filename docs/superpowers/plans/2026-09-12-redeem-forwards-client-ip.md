# Redeem Forwards the Client IP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make core's per-IP magic-link redeem cap apply per respondent instead of once per deployment, by forwarding the respondent's already-resolved address on the server-side redeem POST.

**Architecture:** `requestIdentityHandler` already resolves the client address and then discards it after hashing. Keep it on the request-scoped `RequestIdentity` alongside the hash, thread it to both redeem call sites, and let `postRedeem` — which already owns everything the door knows about how core spells a refusal — own the one header that says who is asking. Nothing above `postRedeem` learns that a header exists.

**Tech Stack:** TypeScript (no `strictNullChecks` in this package), Vitest (`.spec.ts`, colocated in `__tests__/`), Express 5, `express-rate-limit` v8, `@memberjunction/server` 6.1.0-edge.5.

**Spec:** `docs/superpowers/specs/2026-09-12-redeem-forwards-client-ip-design.md` — read it first. It carries the reproduction, the three measured constraints, and the one correction to the filed issue (the trust-proxy half is **not** an MJ change; Forms sets it itself).

## Global Constraints

- **Working tree:** the worktree `.claude/worktrees/f2-redeem-client-ip` on branch `fix/redeem-forwards-no-client-ip`, cut from `origin/next`. `cd` to it at the start of every command — the Bash cwd silently resets to the main checkout after some calls.
- **Never run `pnpm install`** anywhere. The worktree is already installed. Installing in `bizapps-forms` unlinks MJ source and kills the shared host.
- **No `any`.** No `as any`, `: any`, `<any>`, and no `unknown` as a lazy substitute. No `BaseEntity.Get()/.Set()` in place of generated types.
- **Never hand-edit anything under `packages/*/src/**/generated/**`.** A hook refuses it. No task here touches generated code.
- **Never `git commit` beyond the commits this plan specifies**, and never `git push`. Never `git checkout --`, `git restore`, or `git reset --hard`.
- **Never use bare `git stash` / `git stash pop`** — the stash stack is shared with other worktrees.
- **Comments carry the non-obvious *why*.** This file's existing comments are long and argue from specific past defects; match that register. Update or delete any comment whose claim your change makes false.
- **Build after changing a package's source:** `cd packages/Server && pnpm run build`.
- **Run the package's tests** with `cd packages/Server && pnpm test`. Collection is slow (~90s) before any test runs; that is normal, not a hang.
- **Changeset level is `patch`** — this ships no migration and no metadata.
- **Do not modify anything in `/Users/sohamdesai/Projects/mj-dev/MJ`.** That checkout serves a live host.

---

### Task 1: `RequestIdentity` keeps the resolved address, not only its hash

**Files:**
- Modify: `packages/Server/src/http/request-identity.ts` (the `RequestIdentity` interface, ~line 185)
- Modify: `packages/Server/src/http/RequestIdentityMiddleware.ts:92`
- Test: `packages/Server/src/http/__tests__/request-identity.spec.ts`
- Test: `packages/Server/src/http/__tests__/RequestIdentityMiddleware.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `interface RequestIdentity { ip: string; ipHash: string }`, reachable as
  `currentRequestIdentity()?.ip` (type `string | undefined`). `ip` is **required**, so every
  construction site must supply it — that is deliberate, it makes the compiler find them.

> **Read this before Step 1.** Vitest in this package has no `typecheck` config, so esbuild strips
> types without checking them. A type error therefore does **not** fail a test run, and a test whose
> only novelty is a new property on an object literal is GREEN before the implementation exists.
> The red test here has to be one that fails on *behaviour*: the middleware not putting the address
> in the store. That is Step 1. The round-trip shape test is a companion, and it is expected to
> pass from the start — do not report it as your red.

- [ ] **Step 1: Write the failing test**

In `packages/Server/src/http/__tests__/RequestIdentityMiddleware.spec.ts`, change the `/whoami`
route at line 37 from:

```ts
    res.json({ ipHash: currentRequestIdentity()?.ipHash ?? null });
```

to:

```ts
    res.json({ ip: currentRequestIdentity()?.ip ?? null, ipHash: currentRequestIdentity()?.ipHash ?? null });
```

Then add this test to that file's existing outer `describe`, following the file's own style of
fetching `${baseUrl}/whoami`. Import `hashClientIp` from `'../request-identity'` if it is not
already imported there.

```ts
    it('publishes the resolved address it derived the hash from', async () => {
      // The redeem forwards `.ip` while every bucket keys on `.ipHash`. If those two could come
      // from different addresses, core's audit trail and Forms' rate limit would disagree about
      // who the caller was — the exact drift `ConfigureExpressApp`'s trust-proxy line exists to
      // prevent, restored one layer up.
      const body = await (await fetch(`${baseUrl}/whoami`)).json();

      expect(body.ip).toBeTruthy();
      expect(body.ipHash).toBe(hashClientIp(body.ip));
    });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip/packages/Server
pnpm vitest run src/http/__tests__/RequestIdentityMiddleware.spec.ts
```

Expected: FAIL on `expect(body.ip).toBeTruthy()` — the middleware stores only `ipHash`, so `.ip` is
`null`. If this test passes, stop: you are not testing what you think you are.

- [ ] **Step 3: Write minimal implementation**

In `packages/Server/src/http/request-identity.ts`, replace the `RequestIdentity` interface and
its doc comment with:

```ts
/** What the public routes know about a caller, independent of anything the caller told us. */
export interface RequestIdentity {
  /**
   * The resolved client address itself, request-scoped and never persisted by Forms.
   *
   * Kept alongside the hash for ONE reason: the server-side redeem in `respondent-host/
   * redeem.service.ts` POSTs to core from inside this process, so without an address forwarded
   * on it core keys its per-IP redeem cap on the loopback peer — one bucket for every respondent
   * in the deployment (bizapps-forms register row 29). A hash cannot be forwarded: core reads the
   * value as an address, writes it to the magic-link redemption audit trail, and Express has to
   * parse it before `req.ip` exists at all.
   *
   * Everything that STORES or BUCKETS still uses `ipHash`. This field must not leak into a log
   * line, a bucket key or a database column — see `hashClientIp` for why that rule exists.
   */
  ip: string;
  /** Salted one-way hash of the resolved client IP (IPv6 reduced to its /64). */
  ipHash: string;
}
```

In `packages/Server/src/http/RequestIdentityMiddleware.ts`, change line 92 from:

```ts
    runWithRequestIdentity({ ipHash: hashClientIp(ip) }, next);
```

to:

```ts
    runWithRequestIdentity({ ip, ipHash: hashClientIp(ip) }, next);
```

- [ ] **Step 4: Fix the two now-broken test literals**

`packages/Server/src/http/__tests__/request-identity.spec.ts:96-97` construct identities without
an address. Change:

```ts
      runWithRequestIdentity({ ipHash: 'hash-slow' }, () => observe(20)),
      runWithRequestIdentity({ ipHash: 'hash-fast' }, () => observe(1)),
```

to:

```ts
      runWithRequestIdentity({ ip: '203.0.113.20', ipHash: 'hash-slow' }, () => observe(20)),
      runWithRequestIdentity({ ip: '203.0.113.1', ipHash: 'hash-fast' }, () => observe(1)),
```

- [ ] **Step 5: Add the companion shape test**

Add to `packages/Server/src/http/__tests__/request-identity.spec.ts`, inside the existing
`describe('runWithRequestIdentity', …)` block. This one is expected to pass from the start (types
are stripped at runtime) — it exists so the ALS contract is pinned in the file that owns it:

```ts
  it('carries the resolved address as well as its hash', () => {
    // The hash is what buckets and log lines may keep. The address itself is needed for exactly
    // one thing — the `X-Forwarded-For` on the server-side redeem, which is how core learns which
    // respondent is asking (bizapps-forms register row 29). Request-scoped, never persisted.
    const seen = runWithRequestIdentity({ ip: '203.0.113.7', ipHash: 'hash-7' }, () =>
      currentRequestIdentity(),
    );

    expect(seen).toEqual({ ip: '203.0.113.7', ipHash: 'hash-7' });
  });
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip/packages/Server
pnpm vitest run src/http/__tests__/request-identity.spec.ts src/http/__tests__/RequestIdentityMiddleware.spec.ts
```

Expected: PASS, all tests in both files.

- [ ] **Step 7: Commit**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip
git add packages/Server/src/http/request-identity.ts packages/Server/src/http/RequestIdentityMiddleware.ts packages/Server/src/http/__tests__/request-identity.spec.ts packages/Server/src/http/__tests__/RequestIdentityMiddleware.spec.ts
git commit -m "refactor(server): the request identity keeps the address, not only its hash"
```

---

### Task 2: `postRedeem` tells core which respondent is asking

**Files:**
- Modify: `packages/Server/src/respondent-host/redeem.service.ts` (the `RedeemDeps` interface ~line 145; `redeemRawToken` ~line 372; `postRedeem` ~line 398)
- Test: `packages/Server/src/respondent-host/__tests__/redeem.service.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly — this task only widens the injected dependency set.
- Produces:
  - `RedeemDeps` gains `clientIp?: string`.
  - `redeemRawToken(deps: Pick<RedeemDeps, 'redeemUrl' | 'fetchImpl' | 'clientIp'>, rawToken: string, slug: string)`.
  - `postRedeem` sends header `X-Forwarded-For: <clientIp>` when `clientIp` is a non-empty string, and sends no such header otherwise.

- [ ] **Step 1: Add a capturing fetch stub to the spec**

The existing `fakeFetch` ignores its arguments, which is why no test can see what the door sends.
Add this beside it in `packages/Server/src/respondent-host/__tests__/redeem.service.spec.ts`,
directly after the `fakeFetch` definition (~line 119):

```ts
/**
 * A `fetch` stub that also RECORDS what it was called with.
 *
 * `fakeFetch` above asserts only on what core answers, which is why the door shipped for months
 * sending core no client identity at all: every test passed because every test looked the other
 * way (bizapps-forms register row 29). Anything asserting on the REQUEST uses this.
 */
function capturingFetch(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): { fetchImpl: typeof fetch; sent: Array<{ url: string; headers: Record<string, string> }> } {
  const status = init.status ?? 200;
  const sent: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, options?: RequestInit) => {
    sent.push({
      url: String(input),
      // Normalised through `Headers` so a test asserts on the header NAME, not on whichever
      // casing the caller happened to type.
      headers: Object.fromEntries(new Headers(options?.headers ?? {}).entries()),
    });
    return {
      ok: status < 400,
      status,
      headers: new Headers(init.headers ?? {}),
      json: async () => body,
    } as Response;
  }) as typeof fetch;
  return { fetchImpl, sent };
}
```

- [ ] **Step 2: Write the failing tests**

Add a new `describe` block at the end of `redeem.service.spec.ts`:

```ts
// Core rate-limits /magic-link/redeem per `req.ip`, and this POST is made from inside the MJAPI
// process — so with no address forwarded, every respondent in the deployment shares one bucket and
// the 21st form open per minute is refused for everyone (bizapps-forms register row 29). Forms
// already sets `trust proxy` itself (http/RequestIdentityMiddleware.ts), so core honours what is
// forwarded here; nothing in MJ has to change.
describe('the address the door forwards to core', () => {
  it('sends the resolved respondent address as X-Forwarded-For', async () => {
    const { fetchImpl, sent } = capturingFetch({ success: true, token: 'redeemed-jwt' });

    await redeemSlugToToken(deps({ fetchImpl, clientIp: '198.51.100.7' }), 'customer-survey');

    expect(sent).toHaveLength(1);
    expect(sent[0].headers['x-forwarded-for']).toBe('198.51.100.7');
  });

  it('sends exactly one entry, so the hop arithmetic is the same at every trusted hop count', async () => {
    // Express's proxy-addr clamps to the LEFT-MOST address available, so a single entry resolves
    // to `req.ip` at trust-proxy 1, 2 and 3 alike. Appending to an inbound header instead would
    // make the result depend on FORMS_TRUSTED_PROXY_HOPS matching a chain this call never took.
    const { fetchImpl, sent } = capturingFetch({ success: true, token: 'redeemed-jwt' });

    await redeemSlugToToken(deps({ fetchImpl, clientIp: '198.51.100.7' }), 'customer-survey');

    expect(sent[0].headers['x-forwarded-for']).not.toContain(',');
  });

  it('omits the header when the caller could not be identified', async () => {
    // No address is a real, expected state: a socket already gone, or a deployment that has not
    // mounted the identity middleware. Forwarding an empty or invented value would be worse than
    // forwarding nothing — Express would parse it and core would bucket and AUDIT the fiction.
    const { fetchImpl, sent } = capturingFetch({ success: true, token: 'redeemed-jwt' });

    await redeemSlugToToken(deps({ fetchImpl, clientIp: undefined }), 'customer-survey');

    expect(sent[0].headers['x-forwarded-for']).toBeUndefined();
  });

  it('still sends content-type and accept', async () => {
    const { fetchImpl, sent } = capturingFetch({ success: true, token: 'redeemed-jwt' });

    await redeemSlugToToken(deps({ fetchImpl, clientIp: '198.51.100.7' }), 'customer-survey');

    expect(sent[0].headers['content-type']).toBe('application/json');
    expect(sent[0].headers.accept).toBe('application/json');
  });

  it('forwards the address on the resume path too', async () => {
    // `redeemRawToken` is the resume routes' redeem and goes through the same `postRedeem`, so it
    // had the identical defect. One door, one fix.
    const { fetchImpl, sent } = capturingFetch({ success: true, token: 'redeemed-jwt' });

    await redeemRawToken(
      { redeemUrl: 'http://localhost:4121/magic-link/redeem', fetchImpl, clientIp: '198.51.100.9' },
      'mj_ml_rawtoken',
      'customer-survey',
    );

    expect(sent[0].headers['x-forwarded-for']).toBe('198.51.100.9');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip/packages/Server
pnpm vitest run src/respondent-host/__tests__/redeem.service.spec.ts -t 'the address the door forwards to core'
```

Expected: FAIL. TypeScript rejects `clientIp` as an unknown property on `RedeemDeps`; once that
compiles, the header assertions fail because no `X-Forwarded-For` is sent.

- [ ] **Step 4: Write the implementation**

In `packages/Server/src/respondent-host/redeem.service.ts`, add to the `RedeemDeps` interface,
after the `fetchImpl` field:

```ts
  /**
   * The respondent's resolved client address, forwarded to core so its per-IP redeem cap applies
   * per respondent rather than once per deployment (bizapps-forms register row 29).
   *
   * Optional because "no address" is a real state, not a misconfiguration: a socket already gone,
   * or a unit test. Absent means the header is omitted and core buckets on its own peer, which is
   * the behaviour this field replaces — a degradation, never an invention.
   */
  clientIp?: string;
```

Change `redeemRawToken`'s signature from:

```ts
export async function redeemRawToken(
  deps: Pick<RedeemDeps, 'redeemUrl' | 'fetchImpl'>,
```

to:

```ts
export async function redeemRawToken(
  deps: Pick<RedeemDeps, 'redeemUrl' | 'fetchImpl' | 'clientIp'>,
```

Change `postRedeem`'s signature from:

```ts
async function postRedeem(
  deps: Pick<RedeemDeps, 'redeemUrl' | 'fetchImpl'>,
```

to:

```ts
async function postRedeem(
  deps: Pick<RedeemDeps, 'redeemUrl' | 'fetchImpl' | 'clientIp'>,
```

Inside `postRedeem`, replace the `headers` property of the `fetchImpl` call:

```ts
      headers: { 'content-type': 'application/json', accept: 'application/json' },
```

with:

```ts
      headers: forwardedHeaders(deps.clientIp),
```

Add this function immediately after `postRedeem`, before `isRateLimitRefusal`:

```ts
/**
 * The headers this POST carries, including the one that says WHICH respondent is asking.
 *
 * Core keys its magic-link redeem cap on `req.ip`, and this request is made by the MJAPI process
 * itself — so with nothing forwarded, `req.ip` is the same loopback peer for every respondent in
 * the deployment and a 20-per-minute abuse control becomes a 20-per-minute ceiling on form opens
 * for the whole install (bizapps-forms register row 29). Core also writes `req.ip` to the
 * magic-link redemption audit trail, which until now recorded the loopback address every time.
 *
 * EXACTLY ONE entry, never appended to an inbound header. Express's `proxy-addr` clamps to the
 * left-most address available, so a single entry resolves to `req.ip` identically at every
 * `trust proxy` setting of 1 or more; appending would make the answer depend on the hop count
 * matching a chain this internal call never travelled. Forms sets `trust proxy` itself
 * (`http/RequestIdentityMiddleware.ts` `ConfigureExpressApp`), so core honours this without any
 * change in MJ — but only at a hop count of 1 or more. At 0, Express ignores the header entirely
 * and the bucket stays global; that is forms#202's precondition, not a second defect here. Sending
 * it anyway at 0 is measured harmless — though not via the validator this line once named: the
 * ERR_ERL_UNEXPECTED_X_FORWARDED_FOR check tests `trust proxy === false` and Forms always sets a
 * NUMBER, so it never fires. Express simply ignores the header at 0 (corrected, gauntlet #207 F4).
 *
 * No address means no header. An empty or invented value would be worse than silence, because
 * Express would parse it and core would bucket and audit the fiction.
 */
function forwardedHeaders(clientIp: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (clientIp) {
    headers['x-forwarded-for'] = clientIp;
  }
  return headers;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip/packages/Server
pnpm vitest run src/respondent-host/__tests__/redeem.service.spec.ts
```

Expected: PASS, every test in the file — the new block and all pre-existing ones.

- [ ] **Step 6: Commit**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip
git add packages/Server/src/respondent-host/redeem.service.ts packages/Server/src/respondent-host/__tests__/redeem.service.spec.ts
git commit -m "fix(server): the redeem tells core which respondent is asking"
```

---

### Task 3: Both call sites hand the address to the door

**Files:**
- Modify: `packages/Server/src/respondent-host/RespondentHostMiddleware.ts` (~line 241 `redeemSlugToToken` call; ~line 403 `resumeDeps`)
- Modify: `packages/Server/src/respondent-host/resume-deps.ts` (`ResumeDepsContext` ~line 33; `redeem` adapter ~line 49)
- Test: `packages/Server/src/respondent-host/__tests__/RespondentHostMiddleware.spec.ts`

**Interfaces:**
- Consumes: `currentRequestIdentity()?.ip` (Task 1); `RedeemDeps.clientIp` and
  `redeemRawToken`'s widened `Pick` (Task 2).
- Produces: `ResumeDepsContext` gains `callerIp?: string`. No other task depends on this.

- [ ] **Step 1: Open the existing seam so the test can see what the route hands the door**

`RespondentHostMiddleware.spec.ts` drives real HTTP through the real route and already fakes the
redeem at line 46. Two small changes make it observable.

Replace the `../redeem.service` mock (line 46) with one that records its dependency argument:

```ts
/** The deps the route handed the redeem on the last request — the seam for what it forwards. */
let redeemDeps: { clientIp?: string } | undefined;

vi.mock('../redeem.service', () => ({
  redeemSlugToToken: async (deps: { clientIp?: string }) => {
    redeemDeps = deps;
    return redeemOutcome;
  },
}));
```

Let `withServer`'s `get` carry request headers, so a test can present itself as a forwarded caller.
Change its signature and the one line that builds the fetch:

```ts
async function withServer(
  assertions: (get: (route: string, init?: RequestInit) => Promise<Response>) => Promise<void>,
): Promise<void> {
```

```ts
    await assertions((route, init) => fetch(`http://127.0.0.1:${port}${route}`, init));
```

Add `redeemDeps = undefined;` to the existing `beforeEach`.

- [ ] **Step 2: Write the failing tests**

Add a new `describe` block at the end of the file:

```ts
describe('GET /f/:slug — the door tells core which respondent is asking', () => {
  afterEach(() => {
    delete process.env.FORMS_TRUSTED_PROXY_HOPS;
  });

  it('forwards the resolved respondent address to the redeem', async () => {
    // Core keys its own redeem cap on this. Without it every respondent in the deployment shares
    // one bucket and the 21st form open per minute is refused for everyone (register row 29).
    process.env.FORMS_TRUSTED_PROXY_HOPS = '1';
    await withServer(async (get) => {
      await get('/f/customer-survey', { headers: { 'x-forwarded-for': '198.51.100.7' } });

      expect(redeemDeps?.clientIp).toBe('198.51.100.7');
    });
  });

  it('forwards the socket peer, never an address the caller typed, when no hop is trusted', async () => {
    // The whole point of keying on a resolved address is that the caller cannot choose it. If the
    // header could reach core unfiltered, a caller would mint themselves a fresh bucket per
    // request — the `x-session-id` rotation bypass, rebuilt one layer down.
    await withServer(async (get) => {
      await get('/f/customer-survey', { headers: { 'x-forwarded-for': '9.9.9.9' } });

      expect(redeemDeps?.clientIp).not.toBe('9.9.9.9');
      expect(redeemDeps?.clientIp).toMatch(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip/packages/Server
pnpm vitest run src/respondent-host/__tests__/RespondentHostMiddleware.spec.ts
```

Expected: FAIL — `redeemDeps.clientIp` is `undefined` because nothing passes it yet.

- [ ] **Step 4: Write the implementation**

In `RespondentHostMiddleware.ts`, in `handleRequest`, change the `redeemSlugToToken` dependency
literal from:

```ts
      {
        provider: this.systemProvider(),
        contextUser: this.systemUser(),
        redeemUrl: cfg.magicLinkRedeemUrl,
        fetchImpl: fetch,
      },
```

to:

```ts
      {
        provider: this.systemProvider(),
        contextUser: this.systemUser(),
        redeemUrl: cfg.magicLinkRedeemUrl,
        fetchImpl: fetch,
        // The same resolved peer the meter above was charged against — never a header the caller
        // chose. Core keys its own redeem cap on this; without it every respondent in the
        // deployment shares one bucket (register row 29).
        clientIp: currentRequestIdentity()?.ip,
      },
```

In the same file, in `resumeDeps`, add to the `makeDeviceResumeDeps` literal, after `callerKey`:

```ts
      // Forwarded to core on the resume redeem for the same reason `callerKey` exists here: the
      // resolved peer is the one caller attribute they did not choose.
      callerIp: currentRequestIdentity()?.ip,
```

In `resume-deps.ts`, add to `ResumeDepsContext` after `callerKey`:

```ts
  /** The resolved peer address, forwarded to core so its redeem cap is per respondent. */
  callerIp?: string;
```

and change the `redeem` adapter's dependency literal from:

```ts
        { redeemUrl: config.magicLinkRedeemUrl, fetchImpl: fetch },
```

to:

```ts
        { redeemUrl: config.magicLinkRedeemUrl, fetchImpl: fetch, clientIp: ctx.callerIp },
```

- [ ] **Step 5: Run the whole package suite**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip/packages/Server
pnpm test
```

Expected: PASS. Collection takes ~90s before the first test runs.

- [ ] **Step 6: Build and typecheck**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip
pnpm run typecheck && cd packages/Server && pnpm run build
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip
git add packages/Server/src/respondent-host/RespondentHostMiddleware.ts packages/Server/src/respondent-host/resume-deps.ts packages/Server/src/respondent-host/__tests__/RespondentHostMiddleware.spec.ts
git commit -m "fix(server): both redeem call sites hand the door the respondent's address"
```

---

### Task 4: Forms' own redeem meter can fire before core's

**Files:**
- Modify: `packages/Server/src/respondent-host/redeem-rate-limit.ts` (module doc ~line 28; `redeemRateLimitMax` ~line 47)
- Modify: `.env.example` (after the `FORMS_UPLOAD_IP_MAX` block, ~line 132)
- Modify: `guides/ENTITY_BINDING_GUIDE.md` (the env table that lists `FORMS_TRUSTED_PROXY_HOPS`, ~line 179)
- Create: `.changeset/redeem-forwards-client-ip.md`
- Test: `packages/Server/src/respondent-host/__tests__/redeem-rate-limit.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `redeemRateLimitMax()` returns `20` by default instead of `30`.

- [ ] **Step 1: Amend the two existing tests that pin the old default**

`redeem-rate-limit.spec.ts:177-185` already owns this property and asserts the old number twice. Do
**not** add a third test beside them — that would leave the file asserting 30 and 20 at once.
Replace the `describe('redeemRateLimitMax', …)` block's first two tests:

```ts
  it('defaults to 30', () => {
    expect(redeemRateLimitMax()).toBe(30);
  });

  it.each(['', '   ', '0', '-5', 'abc'])('falls back to 30 for %j', (raw) => {
    process.env.FORMS_REDEEM_IP_MAX = raw;
    expect(redeemRateLimitMax()).toBe(30);
  });
```

with:

```ts
  // Core caps /magic-link/redeem at 20 per 60s per IP, and this gate sits in front of it: every
  // request that gets past here spends a DB read and an outbound POST to core's redeem. A default
  // above core's made this meter unreachable — core refused at 21 first, after the work was
  // already done, so the friendlier 429 this door composes could never fire on its own account.
  it("defaults to core's own redeem cap, so this meter refuses first", () => {
    expect(redeemRateLimitMax()).toBe(20);
  });

  it.each(['', '   ', '0', '-5', 'abc'])('falls back to 20 for %j', (raw) => {
    process.env.FORMS_REDEEM_IP_MAX = raw;
    expect(redeemRateLimitMax()).toBe(20);
  });
```

Leave the third test (`honours a valid override`, asserting `7`) exactly as it is.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip/packages/Server
pnpm vitest run src/respondent-host/__tests__/redeem-rate-limit.spec.ts
```

Expected: FAIL — six failures, all `expected 30 to be 20` (the default plus the five `it.each` rows).

- [ ] **Step 3: Write the implementation**

In `packages/Server/src/respondent-host/redeem-rate-limit.ts`, change:

```ts
/** Max `/f/:slug` requests one caller may make per rate-limit window. Read per call (see upload/config). */
export function redeemRateLimitMax(): number {
  return numberFromEnv('FORMS_REDEEM_IP_MAX', 30);
}
```

to:

```ts
/**
 * Max `/f/:slug` requests one caller may make per rate-limit window. Read per call (see upload/config).
 *
 * The default matches CORE's own `magicLink.redeemRateLimitMax` (20 per 60s), because this gate
 * sits in front of it: every `/f/:slug` that gets past here spends a DB read and an outbound POST
 * to core's redeem. A looser number here made this meter unreachable — core refused at 21 first,
 * after the work had already been done, and the friendlier 429 this door composes could never fire
 * on its own account. Raising this above core's puts that dead path back; a deployment that wants
 * a higher ceiling has to raise core's too.
 */
export function redeemRateLimitMax(): number {
  return numberFromEnv('FORMS_REDEEM_IP_MAX', 20);
}
```

In the same file's module doc, replace the line:

```
 *                                     Default 30 (matches the upload route's per-IP ceiling).
```

with:

```
 *                                     Default 20 — core's own redeem cap, which this gate fronts.
```

- [ ] **Step 4: Document both knobs in `.env.example`**

Neither `FORMS_REDEEM_IP_MAX` nor `FORMS_REDEEM_MAX_IN_FLIGHT` is documented. Insert after the
`FORMS_UPLOAD_IP_MAX` block:

```
# The public GET /f/:slug respondent-host route. Every hit costs a DB read plus a server-side
# POST to core's /magic-link/redeem, which mints a session JWT.
#   IP_MAX          per client IP per rate-limit window. Default 20, which is CORE's own redeem
#                   cap — this gate fronts it, so a looser number here is never reached. Raise
#                   core's magicLink.redeemRateLimitMax first if you raise this.
#   MAX_IN_FLIGHT   simultaneous redeems process-wide. Bounds concurrency, which the per-caller
#                   window does not: one caller inside their window can still open many at once.
# Both ceilings key on the address FORMS_TRUSTED_PROXY_HOPS resolves — set that first or every
# respondent shares one bucket.
# FORMS_REDEEM_IP_MAX=20
# FORMS_REDEEM_MAX_IN_FLIGHT=25
```

- [ ] **Step 5: Add the two rows to the guide's env table**

In `guides/ENTITY_BINDING_GUIDE.md`, directly after the `FORMS_TRUSTED_PROXY_HOPS` row, add:

```
| `FORMS_REDEEM_IP_MAX` | `/f/:slug` opens per window per client IP (default 20 — core's own redeem cap, which this gate fronts). |
| `FORMS_REDEEM_MAX_IN_FLIGHT` | Simultaneous server-side redeems, process-wide (default 25). |
```

- [ ] **Step 6: Write the changeset**

Create `.changeset/redeem-forwards-client-ip.md`:

```markdown
---
"@mj-biz-apps/forms-server": patch
---

The server-side redeem now tells core which respondent is asking, so core's per-IP redeem cap applies per respondent instead of once per deployment.

`/f/:slug` redeems on the respondent's behalf: it POSTs the link's token to core's `/magic-link/redeem` from inside the MJAPI process. That POST carried `content-type` and `accept` and no client identity, and core keys that endpoint's 20-per-minute cap on `req.ip` — so every redeem in the install arrived from the same peer and shared one bucket. Measured on a branch harness: 25 different respondents opening the same form, each with their own Forms bucket, and the deployment was refused from the 16th onward, 20 requests into the window. A classroom, an office behind NAT or a conference wifi did not have to be involved; ordinary traffic across unrelated forms was enough.

The redeem now forwards the already-resolved respondent address as a single `X-Forwarded-For` entry. Forms sets Express's `trust proxy` itself (`RequestIdentityMiddleware`), so core honours it with no change in MemberJunction, and core's magic-link redemption audit trail records the respondent instead of the loopback address. One entry, never appended to an inbound header: `proxy-addr` clamps to the left-most address, so the result is the same at every trusted hop count of 1 or more.

**Deployment note:** this is correct wherever `FORMS_TRUSTED_PROXY_HOPS` is set to the number of proxies you operate. At the default of 0 Express ignores the header and the bucket stays global — the same precondition every other Forms rate-limit ceiling already has.

`FORMS_REDEEM_IP_MAX` now defaults to 20 rather than 30, matching core's cap. Above it, this gate was unreachable: core refused first, after Forms had already spent a DB read and an outbound POST. Both redeem knobs are now documented in `.env.example`.
```

- [ ] **Step 7: Run tests, lints and build**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip
cd packages/Server && pnpm test && cd ../.. && pnpm run typecheck
```

Expected: PASS, exit 0.

- [ ] **Step 8: Commit**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip
git add packages/Server/src/respondent-host/redeem-rate-limit.ts packages/Server/src/respondent-host/__tests__/redeem-rate-limit.spec.ts .env.example guides/ENTITY_BINDING_GUIDE.md .changeset/redeem-forwards-client-ip.md
git commit -m "fix(server): the door's own redeem meter can fire before core's"
```

---

### Task 5: Prove it against a live core, because the unit suite structurally cannot

**Files:**
- Create: none in the repo. Scripts go in the session scratchpad.
- Modify: none.

**Interfaces:**
- Consumes: everything from Tasks 1–4, built.
- Produces: the evidence that closes the issue. No code.

Every test in `redeem.service.spec.ts` stubs `fetch`. A green `pnpm test` says nothing about what
core does with what the door sends. This task is the real gate.

- [ ] **Step 1: Repair the duplicate `@memberjunction/server` symlink**

The worktree's standalone install resolves two peer-variants of the same version. The harness then
dies at boot with `Schema must contain uniquely named types "RunViewByIDInput"` — and, worse,
sometimes half-survives it and serves **wrong** results (it answered 502 where a healthy process
answers 429). Repoint one symlink so both load one instance. Read the target first; the hash
differs per install.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip
ls -l apps/MJAPI/node_modules/@memberjunction/server            # note the .pnpm dir it points at
rm packages/Server/node_modules/@memberjunction/server
ln -s ../../../../node_modules/.pnpm/<that same dir>/node_modules/@memberjunction/server \
      packages/Server/node_modules/@memberjunction/server
```

- [ ] **Step 2: Rebuild, and stop any harness already holding the port**

The harness runs `packages/Server/dist`, not the TypeScript sources. Booting without rebuilding
tests the OLD code and every result below is meaningless while looking perfectly healthy — the
single most likely way to get a confident wrong answer here.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip/packages/Server
pnpm run build
```

A harness from an earlier run is probably still listening on `:4131`. Stop it **by PID**, never by
process name — `pkill -f node` has killed the developer's own `:4121` server before:

```bash
lsof -nP -iTCP:4131 -sTCP:LISTEN    # then: kill <that pid>
```

- [ ] **Step 3: Boot the branch harness on its own port**

Never use `:4121` — that is the developer's own server running `next`. `MJAPI_PUBLIC_URL` is
separate from `GRAPHQL_PORT` and is read at import time; without it the host page and the
server-side redeem both point at `:4121` and the run silently tests the wrong branch.

Launch it detached (`nohup … & disown`) and redirect to a file — a foreground background-job has
died mid-boot in this worktree, leaving a half-started process:

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/f2-redeem-client-ip/apps/MJAPI
set -a && . /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.env && set +a
GRAPHQL_PORT=4131 MJAPI_PUBLIC_URL=http://localhost:4131 FORMS_TRUSTED_PROXY_HOPS=1 \
  FORMS_REDEEM_IP_MAX=1000 nohup node server.mjs > /tmp/f2-harness.log 2>&1 & disown
```

`FORMS_REDEEM_IP_MAX=1000` is set here rather than in a later step: Task 4 lowered the default to
20, which now EQUALS core's cap, so Forms' own meter would refuse first and you would never observe
core's bucket at all. Raising it for the probe is what keeps this test pointed at core.

Boot takes 60-90s. Wait for the port with a loop, never a fixed sleep:

```bash
until lsof -nP -iTCP:4131 -sTCP:LISTEN >/dev/null 2>&1; do sleep 3; done; echo LISTENING
```

- [ ] **Step 4: Verify the harness is the one you meant to test**

```bash
grep -c 'RunViewByIDInput' /tmp/f2-harness.log   # must be 0
grep -c '4121' /tmp/f2-harness.log               # must be 0
grep 'redeem: http' /tmp/f2-harness.log          # must say :4131
```

If any of the three disagrees, stop and fix it. A half-booted harness produces confident wrong
answers.

- [ ] **Step 5: Run the 25-respondent probe**

Wait 65s first so no earlier request is still inside the 60s window.

```bash
for i in $(seq 1 25); do
  code=$(curl -s -o /tmp/f2-body.html -w '%{http_code}' \
         -H "X-Forwarded-For: 198.51.100.$i" http://localhost:4131/f/all-types-smoke)
  tok=$(grep -c 'data-token=' /tmp/f2-body.html)
  echo "$i 198.51.100.$i http=$code token=$tok"
done
```

Expected after the fix: **all 25 report `http=200 token=1`.** Before the fix the same probe
refused from the 16th onward with `http=429`.

- [ ] **Step 6: Confirm core stopped sharing the bucket**

```bash
grep -c 'Redeem rate-limited' /tmp/f2-harness.log
```

Expected: `0` new occurrences during the probe. That line is written only inside `postRedeem`, so
any hit means core still refused.

- [ ] **Step 7: Confirm the audit trail records the respondent**

Core writes `row.IPAddress = audit?.ipAddress ?? null` into `__mj.MagicLinkRedemption`
(`MagicLinkService.ts:346`, entity `MJ: Magic Link Redemptions`). Before this change every row from
the reproduction read `"::1"` — the loopback peer, for every respondent. Read the rows back.

`mssql` is not installed in this repo; use the shared workspace's copy by absolute path from a
scratch `.mjs`, with this repo's `.env` credentials (`DB_HOST/DB_PORT/DB_DATABASE/DB_USERNAME/
DB_PASSWORD`, `trustServerCertificate: true, encrypt: false`):

```js
import sql from '/Users/sohamdesai/Projects/mj-dev/node_modules/.pnpm/mssql@12.7.0/node_modules/mssql/index.js';
```

```sql
SELECT TOP 25 AttemptedAt, Outcome, IPAddress
FROM __mj.MagicLinkRedemption
WHERE InviteID = 'A11C0DE0-0000-4000-8000-000000000004'
ORDER BY AttemptedAt DESC;
```

Expected after the fix: the newest 25 rows carry `198.51.100.1` … `198.51.100.25`, not `::1`.
Read-only — do not write to this table.

- [ ] **Step 8: Stop the harness**

Kill it **by PID or port**, never by process name — `pkill -f node` has killed the developer's own
`:4121` server before.

```bash
lsof -nP -iTCP:4131 -sTCP:LISTEN   # then: kill <that pid>
```

- [ ] **Step 9: Report, do not commit**

This task produces no commit. Report: the 25-row table, the two `grep -c` counts, and what the
audit rows showed. If any row is not `200`, the fix is not done — say so plainly with the output
rather than explaining it away.

---

## What is deliberately NOT in this plan

- **Anything in `/Users/sohamdesai/Projects/mj-dev/MJ`.** The measured evidence says no MJ change
  is needed; the spec records why the filed issue's "that half is an MJ change" is wrong.
- **Setting `FORMS_TRUSTED_PROXY_HOPS` on the AIDP host.** That is forms#202.
- **Opening a PR.** Stop after Task 5 and report.
