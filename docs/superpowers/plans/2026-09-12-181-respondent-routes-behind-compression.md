# `/f/:slug` and the asset GET behind MJ's compression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the respondent host page, the favicon and the public asset read out of `ConfigureExpressApp` and into `GetPreAuthMiddleware`, so MJ's `compression()` wraps them — without narrowing which URLs they answer.

**Architecture:** MJServer calls `ConfigureExpressApp` at `index.ts:824` while collecting middleware, and mounts `compression()` at `index.ts:1129`. Express dispatches in registration order, so a route registered in the first hook can never be compressed. `GetPreAuthMiddleware` is documented as running *"after compression but before OAuth/REST/GraphQL routes"*. A handler in that slot has no route pattern, so each route must match its own path — with the same case-insensitivity, trailing-slash tolerance and percent-decoding Express's router gave it. That matching rule is extracted once into `http/route-match.ts` and shared by all three middlewares that need it.

**Tech Stack:** TypeScript (ESM, `NodeNext`), Express 5.2.1, `compression` 1.x, Vitest 3.2.7, pnpm workspace.

**Spec:** [`docs/superpowers/specs/2026-09-12-181-respondent-routes-behind-compression-design.md`](../specs/2026-09-12-181-respondent-routes-behind-compression-design.md) — read it first. It carries the reproduction, the verified route-parity table, and the four design decisions this plan implements.

**Issue:** [MemberJunction/bizapps-forms#181](https://github.com/MemberJunction/bizapps-forms/issues/181)

## Global Constraints

- **Worktree:** `/Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-181`, branch `fix/181-respondent-host-asset-compression`, cut from `origin/next` @ `7db7d8c`. Work only here; never `cd` to the main checkout.
- **Never run `pnpm install` anywhere but this worktree root or `/Users/sohamdesai/Projects/mj-dev`.** Dependencies are already installed here, and `packages/Entities` + `packages/CoreEntitiesServer` are already built (`pnpm run build` in each) — the Server suite cannot resolve `@mj-biz-apps/forms-core-entities-server` without that, and the failure reads as an unrelated Vite resolution error.
- **Run tests from `packages/Server`:** `pnpm exec vitest run <path>`. Whole package: `pnpm test` from `packages/Server`.
- **NO `any`.** No `as any`, `: any`, `<any>`, and no `unknown` as a lazy substitute. No BaseEntity `.Get()`/`.Set()` in place of generated types.
- **NO re-exports between packages.** All new code here is intra-package.
- **Functions stay small and named for an abstraction** (~30–40 lines is a smell to investigate, not a rule).
- **Never swallow an error.** Every `catch` logs with context or returns a failure result.
- **Comments carry the non-obvious *why*.** Any comment you invalidate, you rewrite — a stale comment misleads humans and agents alike. This package's comment density is high and deliberate; match it.
- **Commit message trailers** — every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GuWF5NqHohrUnasHifnChf
  ```
- **Do not `git push`, do not open a PR.** The coordinating session does that.
- **A pre-commit hook (`require-green-before-git.mjs`) runs before every git write.** If it refuses, read its message and fix the tree — do not work around it.

---

### Task 1: Extract the Express-parity route matcher

The rule that a moved route must reproduce — one optional trailing slash, case-insensitive literal — exists today as a private function in `WidgetBundleMiddleware`. Two more middlewares are about to need it, and one of them needs the `:param` variant that does not exist yet. Extract first, move routes second: a behaviour-preserving refactor in its own commit, with the widget's existing 14-case route suite as the safety net.

**Files:**
- Create: `packages/Server/src/http/route-match.ts`
- Create: `packages/Server/src/http/__tests__/route-match.spec.ts`
- Modify: `packages/Server/src/widget-bundle/WidgetBundleMiddleware.ts` (delete the private `matchesRoute`, import the shared one)

**Interfaces:**
- Produces:
  - `matchesExactRoute(requestPath: string, route: string): boolean`
  - `matchSingleSegmentRoute(requestPath: string, prefix: string): string | undefined`
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing test**

Create `packages/Server/src/http/__tests__/route-match.spec.ts`. Every case below was probed against a real Express 5.2.1 app; this file is that table.

```ts
/**
 * The URL grammar Express's router gave these routes, as a table.
 *
 * Every expectation here was probed against a real `app.get('/f/:slug', …)` /
 * `app.get('/forms/asset/:fileId', …)` before it was written down (design doc §4.1), because the
 * failure this file exists to prevent is silent: a moved route that answers slightly fewer URLs
 * than it used to sends a respondent to MJAPI's authenticated routes and a bare 401.
 */
import { describe, expect, it } from 'vitest';

import { matchesExactRoute, matchSingleSegmentRoute } from '../route-match';

describe('matchesExactRoute', () => {
  it.each([
    ['/favicon.ico', true],
    ['/favicon.ico/', true],
    ['/FAVICON.ICO', true],
    ['/Favicon.Ico/', true],
  ])('claims %s', (path, expected) => {
    expect(matchesExactRoute(path, '/favicon.ico')).toBe(expected);
  });

  it.each([
    ['/favicon.ico//'],
    ['/favicon'],
    ['/favicon.ico.map'],
    ['/a/favicon.ico'],
    // Not percent-decoded, exactly as the router was not: this stayed unclaimed before the move.
    ['/favicon%2Eico'],
  ])('leaves %s to the next handler', (path) => {
    expect(matchesExactRoute(path, '/favicon.ico')).toBe(false);
  });
});

describe('matchSingleSegmentRoute', () => {
  it.each([
    ['/f/abc', 'abc'],
    ['/f/abc/', 'abc'],
    // The literal is case-insensitive; the segment keeps the case it arrived in, because it is a
    // lookup key and `Slug` is not necessarily case-insensitive in the database.
    ['/F/ABC', 'ABC'],
    ['/f/ABC', 'ABC'],
    ['/f/a%20b', 'a b'],
    // Decoded AFTER the split, so an encoded slash is a character in the slug, not a separator.
    ['/f/a%2Fb', 'a/b'],
    // `+` is not a space in a path segment.
    ['/f/a+b', 'a+b'],
  ])('reads %s as the slug %j', (path, slug) => {
    expect(matchSingleSegmentRoute(path, '/f')).toBe(slug);
  });

  it.each([
    ['/f/abc//'],
    ['/f/'],
    ['/f'],
    ['/f//'],
    ['/f/a/b'],
    ['/fx/abc'],
    ['/'],
    [''],
    // The one deliberate divergence from the router, which answered 400 (design doc §4.2):
    // a segment that cannot be decoded names no distribution, so this is not our route.
    ['/f/%zz'],
    ['/f/%2'],
  ])('leaves %s to the next handler', (path) => {
    expect(matchSingleSegmentRoute(path, '/f')).toBeUndefined();
  });

  it('works for a multi-segment prefix', () => {
    expect(matchSingleSegmentRoute('/forms/asset/xyz', '/forms/asset')).toBe('xyz');
    expect(matchSingleSegmentRoute('/FORMS/ASSET/xyz', '/forms/asset')).toBe('xyz');
    expect(matchSingleSegmentRoute('/forms/asset/xyz/', '/forms/asset')).toBe('xyz');
    expect(matchSingleSegmentRoute('/forms/asset', '/forms/asset')).toBeUndefined();
    expect(matchSingleSegmentRoute('/forms/asset/', '/forms/asset')).toBeUndefined();
    expect(matchSingleSegmentRoute('/forms/asset/a/b', '/forms/asset')).toBeUndefined();
  });

  it('keeps a NUL byte in the slug rather than inventing a rule the router did not have', () => {
    // `/f/abc%00` matched and yielded "abc\0" before the move. Refusing it here would be a new
    // policy smuggled in as a refactor; if that byte is unwanted, it is the slug lookup's business.
    expect(matchSingleSegmentRoute('/f/abc%00', '/f')).toBe('abc ');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/Server && pnpm exec vitest run src/http/__tests__/route-match.spec.ts
```
Expected: FAIL — `Failed to resolve import "../route-match"`.

- [ ] **Step 3: Write the implementation**

Create `packages/Server/src/http/route-match.ts`:

```ts
/**
 * What `app.get(route, …)` claimed, as functions a plain `app.use` handler can call.
 *
 * A route moved out of Express's router into a pre-auth handler (#121, #181) loses path-to-regexp,
 * and with it three behaviours the app's defaults gave it for free: `case sensitive routing` and
 * `strict routing` are both OFF, and a `:param` arrives percent-decoded. Re-deriving those rules at
 * each call site is how a move quietly narrows what a public URL answers — a mis-cased link then
 * falls through to MJAPI's authenticated routes and returns a 401 nobody can explain.
 *
 * Deliberately no WIDER than the router was either, which is why neither function is a general
 * path normaliser: exactly one trailing slash is dropped (`…/abc//` stays unclaimed, as it was) and
 * the literal part is never percent-decoded (`/favicon%2Eico` stays unclaimed, as it was).
 *
 * Verified against a live Express 5.2.1 app case by case — see the design doc's parity table and
 * `__tests__/route-match.spec.ts`, which is that table.
 */

/**
 * Drop at most ONE trailing slash.
 *
 * That is the whole of Express's non-strict tolerance: `/f/abc/` is `/f/abc`, and `/f/abc//` is
 * neither. A loop here would be the easy mistake — it would claim URLs the router refused.
 */
function withoutOneTrailingSlash(requestPath: string): string {
  return requestPath.endsWith('/') ? requestPath.slice(0, -1) : requestPath;
}

/** Does `requestPath` name `route`, on the terms `app.get(route, …)` used? */
export function matchesExactRoute(requestPath: string, route: string): boolean {
  return withoutOneTrailingSlash(requestPath).toLowerCase() === route.toLowerCase();
}

/**
 * The single decoded segment under `prefix` — the `:param` of `app.get(`${prefix}/:param`, …)` —
 * or `undefined` when this request is not that route.
 *
 * `prefix` is a literal path with no trailing slash (`/f`, `/forms/asset`). The segment must be
 * exactly one non-empty path segment, so `/f/`, `/f/a/b` and `/f/abc//` all decline, as they did.
 *
 * THE ONE DIVERGENCE: a segment that cannot be percent-decoded declines here, where the router
 * threw a `URIError` that Express turned into a 400. It is a deliberate, documented choice — a
 * malformed escape names no distribution and no real link produces one, and `resume-routes.ts`
 * already made exactly this choice for the sibling routes, so the package has one rule rather
 * than two. See the design doc §4.2.
 */
export function matchSingleSegmentRoute(requestPath: string, prefix: string): string | undefined {
  const path = withoutOneTrailingSlash(requestPath);
  if (path.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase() || path[prefix.length] !== '/') {
    return undefined;
  }
  const segment = path.slice(prefix.length + 1);
  if (segment.length === 0 || segment.includes('/')) {
    return undefined;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/Server && pnpm exec vitest run src/http/__tests__/route-match.spec.ts
```
Expected: PASS, all cases.

- [ ] **Step 5: Rewire `WidgetBundleMiddleware` onto the shared matcher**

In `packages/Server/src/widget-bundle/WidgetBundleMiddleware.ts`:
1. Add to the imports: `import { matchesExactRoute } from '../http/route-match.js';`
2. Delete the private `function matchesRoute(requestPath, lowercaseRoute)` **and its doc comment** at the bottom of the file — the comment's content now lives on the shared module, which is where the next reader will look for it.
3. In `serveStaticAsset`, delete the `const route = asset.route.toLowerCase();` line and change the guard to:

```ts
      if ((req.method !== 'GET' && req.method !== 'HEAD') || !matchesExactRoute(req.path, asset.route)) {
```

4. In the class header comment, leave the `── Why the routes are PRE-AUTH MIDDLEWARE…` block exactly as it is. It is still true and is the precedent this change follows.

- [ ] **Step 6: Run the widget route suite to prove the refactor changed nothing**

```bash
cd packages/Server && pnpm exec vitest run src/widget-bundle src/http
```
Expected: PASS. This suite covers 14 method/URL cases against a live server; it is the safety net for the extraction.

- [ ] **Step 7: Commit**

```bash
git add packages/Server/src/http/route-match.ts \
        packages/Server/src/http/__tests__/route-match.spec.ts \
        packages/Server/src/widget-bundle/WidgetBundleMiddleware.ts
git commit -m "$(cat <<'EOF'
refactor(server): one place knows what a route claimed before it moved

The trailing-slash and case rules Express's router applied are about to be needed by two more
routes. Extracted from WidgetBundleMiddleware unchanged, plus the single-segment variant `/f/:slug`
and the asset read need, and pinned to the parity table they were probed against. No behaviour
change: the widget's own 14-case route suite is the proof.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuWF5NqHohrUnasHifnChf
EOF
)"
```

---

### Task 2: Teach the respondent-host harnesses MJServer's real order

Three existing test harnesses mount `ConfigureExpressApp(app)` and then request `/f/…`. When the route moves in Task 3 they would all 404, and it would look like the move broke the page. Make them mount the whole pipeline **first**, while the routes are still where they are: this task must be green before and after, which is exactly what proves the harness change is not hiding anything.

**Files:**
- Modify: `packages/Server/src/respondent-host/__tests__/RespondentHostMiddleware.spec.ts` (the `withServer` helper, ~line 76)
- Modify: `packages/Server/src/respondent-host/__tests__/redeem-rate-limit.spec.ts` (two ad-hoc mounts, ~line 203 and ~line 262)

**Interfaces:**
- Consumes: nothing.
- Produces: a `mountLikeMJServer(app, middleware)` helper in each of the two spec files (spec-local; specs do not import from each other in this repo).

- [ ] **Step 1: Add the pipeline-shaped mount to `RespondentHostMiddleware.spec.ts`**

The base is mocked as `class {}` in this file. `GetPreAuthMiddleware` is about to be *defined* by `RespondentHostMiddleware` itself, so the mock needs no change — but add the default anyway so the helper is honest about calling a base-class hook:

```ts
vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {
    GetPreAuthMiddleware(): unknown[] {
      return [];
    }
  },
  configInfo: { magicLink: { enabled: true, grantableRoleNames: ['Form Respondent'] } },
}));
```

Add `import compression from 'compression';` beside the `express` import, then replace `withServer` with:

```ts
/**
 * Mount the middleware in the ORDER MJServer's `serve()` does, because the order is the thing this
 * package keeps getting wrong. `serve()` calls `ConfigureExpressApp` while it is still collecting
 * middleware contributions (`index.ts:824`), then mounts `compression()` (`index.ts:1129`), then
 * the pre-auth handlers, and only then its own routes — the ones that answer 401 to anything
 * unauthenticated. The trailing 401 stands in for those, so "the route fell through" shows up here
 * as the 401 it really produces rather than as a bare 404 from an empty app.
 */
function mountLikeMJServer(app: Express, middleware: RespondentHostMiddleware): Promise<void> {
  return Promise.resolve(middleware.ConfigureExpressApp?.(app)).then(() => {
    app.use(compression({ threshold: MJ_COMPRESSION_THRESHOLD_BYTES, level: MJ_COMPRESSION_LEVEL }));
    for (const handler of middleware.GetPreAuthMiddleware()) {
      app.use(handler);
    }
    app.use((_req, res) => {
      res.status(401).type('text/plain').send('Unauthorized');
    });
  });
}

/** Boot the middleware's routes on a real express server and always close the listener. */
async function withServer(assertions: (get: (route: string) => Promise<Response>) => Promise<void>): Promise<void> {
  const app = express();
  await mountLikeMJServer(app, new RespondentHostMiddleware());
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    await assertions((route) => fetch(`http://127.0.0.1:${port}${route}`));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}
```

Add the two constants above it, with the note that says why they are copied rather than imported:

```ts
/**
 * The compression MJServer mounts (`MJServer/src/index.ts`, "Fix #8"): a 1 KB threshold, level 6.
 * Copied rather than imported because MJServer does not export it; what matters to these tests is
 * the POSITION it is mounted in, which `mountLikeMJServer` reproduces.
 */
const MJ_COMPRESSION_THRESHOLD_BYTES = 1024;
const MJ_COMPRESSION_LEVEL = 6;
```

Change the `express` import to also bring the type: `import express, { type Express } from 'express';`

- [ ] **Step 2: Run it — still green, with the routes still in their old slot**

```bash
cd packages/Server && pnpm exec vitest run src/respondent-host/__tests__/RespondentHostMiddleware.spec.ts
```
Expected: PASS (all 6 tests). If anything fails here, the harness change is wrong — fix it before touching production code.

- [ ] **Step 3: Do the same for the two mounts in `redeem-rate-limit.spec.ts`**

At ~line 203 (`RespondentHostMiddleware wiring`) and ~line 262 (`releases a slot on the ERROR path`), both build an app by hand. Add the same helper to this file (it mocks `@memberjunction/server` as `class {}` too, so add the `GetPreAuthMiddleware` default there as well):

```ts
/** MJServer's order — see the note in `RespondentHostMiddleware.spec.ts`. */
async function mountRespondentHostLikeMJServer(app: Application, middleware: RespondentHostMiddleware): Promise<void> {
  await middleware.ConfigureExpressApp?.(app);
  for (const handler of middleware.GetPreAuthMiddleware()) {
    app.use(handler);
  }
}
```

No `compression()` here: this file is about identity and metering, and a compressor in the chain would only add a variable. Use the helper at both sites in place of the bare `await new RespondentHostMiddleware().ConfigureExpressApp(app);`.

Note the `RequestIdentityMiddleware` pre-auth handlers those tests mount stay exactly where they are — *after* the middleware's own contributions. That ordering is the point of the file and Task 4 depends on it.

- [ ] **Step 4: Run it — still green**

```bash
cd packages/Server && pnpm exec vitest run src/respondent-host/__tests__/redeem-rate-limit.spec.ts
```
Expected: PASS, including the structural `mounts the identity handler ON the route it registers` test — it is still true at this commit.

- [ ] **Step 5: Commit**

```bash
git add packages/Server/src/respondent-host/__tests__/RespondentHostMiddleware.spec.ts \
        packages/Server/src/respondent-host/__tests__/redeem-rate-limit.spec.ts
git commit -m "$(cat <<'EOF'
test(server): the respondent-host harnesses mount the pipeline MJServer actually builds

ConfigureExpressApp, then compression(), then the pre-auth chain, then the 401 that stands in for
MJAPI's authenticated routes. Green before and after, with the routes still in their old slot —
which is what makes it a harness change rather than a hidden behaviour change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuWF5NqHohrUnasHifnChf
EOF
)"
```

---

### Task 3: Move `GET /f/:slug` and `GET /favicon.ico` into the pre-auth slot

The defect itself. Red first: a test that asks for the page with `Accept-Encoding: gzip` and expects `Content-Encoding`, plus the parity cases that keep the move from narrowing the URL set.

**Files:**
- Create: `packages/Server/src/respondent-host/__tests__/respondent-host-routes.spec.ts`
- Modify: `packages/Server/src/respondent-host/RespondentHostMiddleware.ts`
- Modify: `packages/Server/src/respondent-host/__tests__/redeem-rate-limit.spec.ts` (the one structural assertion that cannot survive — see Step 6)

**Interfaces:**
- Consumes: `matchesExactRoute`, `matchSingleSegmentRoute` from Task 1.
- Produces: `RESPONDENT_HOST_PREFIX = '/f'` exported from `RespondentHostMiddleware.ts`; `RESPONDENT_HOST_ROUTE` stays `'/f/:slug'` and stays exported (it is the shape the log line and the docs name).

- [ ] **Step 1: Write the failing test**

Create `packages/Server/src/respondent-host/__tests__/respondent-host-routes.spec.ts`:

```ts
/**
 * What the respondent host page and the favicon answer, and how they are transferred (#181).
 *
 * Separate from `RespondentHostMiddleware.spec.ts`, which is about what the page SAYS (title,
 * og: tags, token). This file is about the route: which URLs it claims, and whether the bytes are
 * compressed — the two things the move out of `ConfigureExpressApp` could break.
 *
 * The whole pipeline is mounted in `serve()`'s order, because the position of the route relative to
 * `compression()` IS the bug: `ConfigureExpressApp` runs at MJServer `index.ts:824`, compression is
 * mounted at `index.ts:1129`, and Express dispatches layers in registration order.
 *
 * `@memberjunction/server` is mocked because importing it for real runs `loadConfig()` at module
 * load and throws without a live MJ config — same as `WidgetBundleMiddleware.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';

vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {
    GetPreAuthMiddleware(): unknown[] {
      return [];
    }
  },
  configInfo: { magicLink: { enabled: true, grantableRoleNames: ['Form Respondent'] } },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { GetSystemUser: () => ({ ID: 'system-user-id' }) } },
}));

const rowsByEntity: Record<string, unknown[]> = {};

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class RunView {
    async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
      const rows = (rowsByEntity[params.EntityName ?? ''] ?? []) as T[];
      return {
        Success: true,
        Results: rows,
        RowCount: rows.length,
        TotalRowCount: rows.length,
        ExecutionTime: 0,
        ErrorMessage: '',
      } as RunViewResult<T>;
    }
  }
  return { ...actual, RunView, LogStatus: () => undefined, LogError: () => undefined };
});

/** The slug the faked redeem was asked for, so the parity cases can assert what the route read. */
let redeemedSlug: string | undefined;
let redeemOutcome: { ok: boolean; token?: string; distribution?: mjBizAppsFormsFormDistributionEntityType };

vi.mock('../redeem.service', () => ({
  redeemSlugToToken: async (_deps: unknown, slug: string) => {
    redeemedSlug = slug;
    return redeemOutcome;
  },
}));

import express, { type Express } from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { RespondentHostMiddleware } from '../RespondentHostMiddleware';
import { resetRespondentHostConfigForTests } from '../config';

/**
 * The compression MJServer mounts (`MJServer/src/index.ts`, "Fix #8"): a 1 KB threshold, level 6.
 * Copied rather than imported because MJServer does not export it; what matters is the POSITION,
 * which `mountLikeMJServer` reproduces.
 */
const MJ_COMPRESSION_THRESHOLD_BYTES = 1024;
const MJ_COMPRESSION_LEVEL = 6;

const DISTRIBUTION = {
  ID: 'dist-1',
  FormID: 'form-1',
  Name: 'Share link',
  Slug: 'customer-survey',
  Form: 'Customer Satisfaction Survey',
  PublicLinkToken: 'raw',
} as unknown as mjBizAppsFormsFormDistributionEntityType;

beforeEach(() => {
  redeemedSlug = undefined;
  redeemOutcome = { ok: true, token: 'session-jwt', distribution: DISTRIBUTION };
  rowsByEntity['MJ_BizApps_Forms: Forms'] = [{ Description: 'Tell us how we did. Takes two minutes.' }];
});

afterEach(() => {
  resetRespondentHostConfigForTests();
});

/** ConfigureExpressApp → compression() → pre-auth → the 401 that stands in for MJAPI's routes. */
async function mountLikeMJServer(app: Express, middleware: RespondentHostMiddleware): Promise<void> {
  await middleware.ConfigureExpressApp?.(app);
  app.use(compression({ threshold: MJ_COMPRESSION_THRESHOLD_BYTES, level: MJ_COMPRESSION_LEVEL }));
  for (const handler of middleware.GetPreAuthMiddleware()) {
    app.use(handler);
  }
  app.use((_req, res) => {
    res.status(401).type('text/plain').send('Unauthorized');
  });
}

type Fetch = (route: string, init?: RequestInit) => Promise<Response>;

async function withServer(assertions: (get: Fetch) => Promise<void>): Promise<void> {
  const app = express();
  await mountLikeMJServer(app, new RespondentHostMiddleware());
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    await assertions((route, init) => fetch(`http://127.0.0.1:${port}${route}`, init));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

describe('respondent host page transfer (#181)', () => {
  // The bug: ~9 KB of text/html served with no Content-Encoding to a client that offered gzip,
  // on the first byte of every shared form link. The decoded body is asserted too, so a route that
  // set the header without encoding could not pass.
  it('serves the page gzip-encoded when the client offers gzip', async () => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey', { headers: { 'Accept-Encoding': 'gzip' } });
      const html = await res.text();

      expect(res.status).toBe(200);
      // Guards against passing by absence: a fixture under MJ's threshold would be skipped by
      // compression and this whole file would prove nothing.
      expect(Buffer.byteLength(html)).toBeGreaterThan(MJ_COMPRESSION_THRESHOLD_BYTES);
      expect(res.headers.get('content-encoding')).toBe('gzip');
      expect(res.headers.get('vary')).toContain('Accept-Encoding');
      expect(html).toContain('<title>Customer Satisfaction Survey</title>');
    });
  });

  it('still answers a client that offers no encoding, uncompressed', async () => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey', { headers: { 'Accept-Encoding': 'identity' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-encoding')).toBeNull();
      expect(await res.text()).toContain('<title>Customer Satisfaction Survey</title>');
    });
  });

  it('keeps the page out of shared caches', async () => {
    // The page carries a per-respondent session JWT. Compression sits in front of it now; that must
    // not have disturbed the header that keeps it from being cached for somebody else.
    await withServer(async (get) => {
      const res = await get('/f/customer-survey', { headers: { 'Accept-Encoding': 'gzip' } });
      await res.text();
      expect(res.headers.get('cache-control')).toBe('no-store');
    });
  });
});

describe('the URLs /f/:slug still claims', () => {
  it.each([
    ['/f/customer-survey', 'customer-survey'],
    // Express's router was case-insensitive and strict routing was off. A mis-cased or
    // trailing-slashed share link answered before the move and must answer after it.
    ['/f/customer-survey/', 'customer-survey'],
    ['/F/customer-survey', 'customer-survey'],
    // The slug keeps its own case — it is a database lookup key, not part of the route literal.
    ['/f/Customer-Survey', 'Customer-Survey'],
    ['/f/a%20b', 'a b'],
  ])('answers %s with the slug %j', async (path, slug) => {
    await withServer(async (get) => {
      const res = await get(path);
      await res.text();
      expect(res.status).toBe(200);
      expect(redeemedSlug).toBe(slug);
    });
  });

  it.each([
    ['/f/abc//'],
    ['/f/'],
    ['/f'],
    ['/f/a/b'],
  ])('leaves %s to the routes behind it', async (path) => {
    await withServer(async (get) => {
      const res = await get(path);
      await res.text();
      expect(res.status).toBe(401);
    });
  });

  it('answers HEAD, as app.get did', async () => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey', { method: 'HEAD' });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });
  });

  it.each(['POST', 'PUT', 'DELETE'])('leaves %s to the routes behind it', async (method) => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey', { method });
      await res.text();
      expect(res.status).toBe(401);
    });
  });
});

describe('GET /favicon.ico', () => {
  it.each(['/favicon.ico', '/FAVICON.ICO', '/favicon.ico/'])('answers 204 with no body for %s', async (path) => {
    await withServer(async (get) => {
      const res = await get(path);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });
  });

  it('leaves /favicon.ico// to the routes behind it', async () => {
    await withServer(async (get) => {
      const res = await get('/favicon.ico//');
      await res.text();
      expect(res.status).toBe(401);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/Server && pnpm exec vitest run src/respondent-host/__tests__/respondent-host-routes.spec.ts
```
Expected: FAIL. The compression test reports `expected null to be 'gzip'` — that is the reproduction. The parity and favicon tests pass already (the routes are still Express layers), which is fine and is the point: they are the ones that must *keep* passing.

- [ ] **Step 3: Move the two routes in `RespondentHostMiddleware.ts`**

Add to the imports:

```ts
import type { NextFunction } from 'express';
import { matchesExactRoute, matchSingleSegmentRoute } from '../http/route-match.js';
```

(`NextFunction` joins the existing `import type { Application, Request, RequestHandler, Response } from 'express';`.)

Add the prefix constant beside `RESPONDENT_HOST_ROUTE`:

```ts
/** Route the respondent host page is served from (matches the Forms `publicUrl()` shape). */
export const RESPONDENT_HOST_ROUTE = '/f/:slug';

/**
 * The literal half of {@link RESPONDENT_HOST_ROUTE}.
 *
 * The page is contributed as a pre-auth handler rather than an `app.get`, so there is no
 * path-to-regexp to split the path for us — {@link matchSingleSegmentRoute} does it, and this is
 * what it matches against.
 */
export const RESPONDENT_HOST_PREFIX = '/f';
```

Replace the two `app.get(...)` registrations in `ConfigureExpressApp` — the page and the favicon — with nothing (delete them, and delete the stale `requestIdentityHandler()` comment block above the page route). What remains in `ConfigureExpressApp` is the `app.post(RESPONDENT_RESUME_ROUTE, …)` registration, the two `LogStatus` calls and `await this.reportReadiness()`.

Rewrite the hook's doc comment to say what is left and why:

```ts
  /**
   * The one route that still registers here, and the boot-time readiness report.
   *
   * `POST /f/:slug/resume` stays in this hook deliberately (#181). Its body is a few hundred bytes
   * of JSON — under MJ's 1 KB compression threshold — so it gains nothing from the pre-auth slot,
   * while moving it would mean matching its path by hand and taking a case-sensitivity decision on
   * `matchResumeRoute`, which claims `/f/:slug/{remember,forget}` too. That belongs to its own
   * change. The page and the favicon moved because they DID gain: see {@link GetPreAuthMiddleware}.
   */
  public override async ConfigureExpressApp(app: Application): Promise<void> {
```

Now add the pre-auth contribution. Put it immediately after `ConfigureExpressApp` and before `reportReadiness`:

```ts
  /**
   * The public page and the origin's favicon, in the slot that sits BEHIND MJ's `compression()`.
   *
   * ── Why these are pre-auth middleware and not `ConfigureExpressApp` routes (#181) ─────────────
   * Both hooks run before auth; they differ in where the route lands in Express's stack. `serve()`
   * calls `ConfigureExpressApp` while it is still collecting middleware contributions
   * (`index.ts:824`), BEFORE it mounts its own `compression()` (`index.ts:1129`) — so an `app.get`
   * registered there finishes its response before compression ever wraps `res.write`, and ~9 KB of
   * HTML went out uncompressed to every respondent who opened a shared link, on the phones and
   * cellular connections this product is built for. `GetPreAuthMiddleware` is documented by the
   * base class as running "after compression but before OAuth/REST/GraphQL routes". Same
   * negotiation, threshold and level as everything else MJAPI serves; nothing compression-specific
   * lives here. This is the move #121 made for the widget bundle, finished.
   *
   * WHAT ELSE MOVING SLOTS DOES, ON PURPOSE. Pre-auth contributions are mounted as ONE ordered
   * `app.use` chain, so these routes are no longer ahead of every other pre-auth handler — they are
   * behind them. That includes MJ's own `RateLimitMiddleware`, a global IP-keyed limiter
   * (`enabled: false` by default). A host that switches rate limiting on will see the page counted
   * and eventually answer 429, where before it was exempt. That is the right trade for a public
   * unauthenticated route, but the failure mode is worth knowing: a respondent refused there gets
   * MJ's rate-limit response, not this middleware's error page.
   *
   * Forms cannot pick its position in that chain anyway — the order comes from ClassFactory
   * registration order across every middleware the host loads, which is why the page carries its
   * own identity handler rather than trusting the global one to have been mounted first (see
   * {@link hostPageHandler}).
   */
  public override GetPreAuthMiddleware(): RequestHandler[] {
    return [this.hostPageHandler(), faviconHandler()];
  }

  /**
   * `GET /f/:slug` as a handler that claims exactly the URLs `app.get('/f/:slug')` claimed.
   *
   * GET and HEAD, like the `app.get` this replaced (Express routes HEAD to GET handlers). Anything
   * else passes through untouched. What "exactly the URLs" means — one optional trailing slash, a
   * case-insensitive `/f`, a percent-decoded single segment — lives in {@link matchSingleSegmentRoute},
   * with the parity table it was probed against.
   *
   * WHY THE IDENTITY HANDLER IS STILL MOUNTED HERE. It is no longer for the reason it was: this
   * route now sits in the same `app.use` chain as `RequestIdentityMiddleware`'s global copy, and
   * that copy is mounted first today because `packages/Server/src/index.ts` imports it first. But
   * "today" is the problem — that ordering is module import order in a barrel file, and if it ever
   * changes, `currentRequestIdentity()` returns undefined, `checkRedeemRateLimit` takes its
   * deliberate "cannot identify the caller, admit everything" branch, and the per-IP meter reports
   * itself installed while admitting every caller at any `FORMS_REDEEM_IP_MAX`. Mounting it twice
   * is documented harmless — `AsyncLocalStorage.run` nests and the inner store wins — so the cheap
   * copy stays and the ordering assumption is pinned by a test rather than trusted
   * (`redeem-rate-limit.spec.ts`, "even when the global identity handler is mounted after it").
   */
  private hostPageHandler(): RequestHandler {
    const withIdentity = requestIdentityHandler();
    return (req: Request, res: Response, next: NextFunction): void => {
      const slug =
        req.method === 'GET' || req.method === 'HEAD'
          ? matchSingleSegmentRoute(req.path, RESPONDENT_HOST_PREFIX)
          : undefined;
      if (slug === undefined) {
        next();
        return;
      }
      withIdentity(req, res, () => {
        // PRESENCE of the pointer only. This route stays side-effect-free — a mail scanner or a
        // browser prefetch must not be able to spend a single-use invite — so nothing is redeemed
        // here and the token is never read.
        const hasDraft = readResumeCookie(req.headers.cookie) !== undefined;
        // Never let an unexpected error crash the route — always render a page.
        void this.handleMetered(slug, hasDraft, res).catch((e: unknown) => {
          LogError(`[Forms] Respondent host route error: ${e instanceof Error ? e.message : String(e)}`);
          this.sendError(res, {
            status: 500,
            message: 'We could not open this form right now. Please try again later.',
          });
        });
      });
    };
  }
```

And the favicon, as a module-level function below the class (it closes over nothing):

```ts
/**
 * `GET /favicon.ico` — an explicit "nothing to show" rather than an icon.
 *
 * There is no Forms icon asset to serve, and 204 is the answer every browser and fetcher treats as
 * "no icon" without logging an error. Origin-wide by nature of the path; contributed with the host
 * page so disabling the page (`FORMS_RESPONDENT_HOST_ENABLED=false`) takes this with it.
 */
function faviconHandler(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !matchesExactRoute(req.path, FAVICON_ROUTE)) {
      next();
      return;
    }
    res.status(204).end();
  };
}
```

Finally, update the class header comment: the sentence *"It adds a GET route (`/f/:slug`) through {@link ConfigureExpressApp}"* is now false. Replace that clause with *"It contributes a GET route (`/f/:slug`) through {@link GetPreAuthMiddleware}"*, and leave the rest of the paragraph (the route runs before auth, the path matches `publicUrl()`, the page reads slug + token) as it is. The `SEAM NOTE` block about `BaseServerExtension` stays: it is about a different migration and is still accurate.

- [ ] **Step 4: Run the new spec to verify it passes**

```bash
cd packages/Server && pnpm exec vitest run src/respondent-host/__tests__/respondent-host-routes.spec.ts
```
Expected: PASS, every case — the compression tests now green, the parity and favicon tests still green.

- [ ] **Step 5: Run the whole respondent-host directory**

```bash
cd packages/Server && pnpm exec vitest run src/respondent-host
```
Expected: one failure, in `redeem-rate-limit.spec.ts` → `RespondentHostMiddleware wiring` → *"mounts the identity handler ON the route it registers"*. It reaches into Express's private router stack for a layer whose `route.path` is `/f/:slug`; after the move there is no such layer. Step 6 replaces it. **If anything else fails, stop and diagnose — nothing else should.**

- [ ] **Step 6: Replace the structural wiring assertion with a behavioural one**

In `redeem-rate-limit.spec.ts`, delete the whole `describe('RespondentHostMiddleware wiring', …)` block (the one that reads `_router.stack`) and put this in its place. It tests the same fact — the route establishes an identity — through what the identity is *for*, which is stronger than counting handlers on a layer:

```ts
describe('RespondentHostMiddleware wiring', () => {
  // The route used to be an `app.get` layer and this test used to count the handlers on it. It is
  // a pre-auth handler now, so there is no layer to inspect — and the structural assertion was
  // always a proxy for the thing that matters: that the per-IP meter can SEE a caller. A guard
  // mutation run showed nothing else covers the wiring, so it is asserted here behaviourally:
  // drop the ceiling to 1 and the second request from the same peer must be refused. With no
  // identity, `checkRedeemRateLimit(undefined)` admits everything and both come back 200-or-5xx.
  it('meters the page per caller, which needs the identity the route establishes', async () => {
    process.env.FORMS_REDEEM_IP_MAX = '1';
    FormsRateLimiter.Instance.resetForTests();
    const { RespondentHostMiddleware } = await import('../RespondentHostMiddleware');

    const app = express();
    await mountRespondentHostLikeMJServer(app, new RespondentHostMiddleware());
    // Mounted the way MJServer does it — and, for this test, the way that would NOT help.
    for (const handler of new RequestIdentityMiddleware().GetPreAuthMiddleware()) {
      app.use(handler);
    }
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const first = await fetch(`${base}/f/anything`);
      const second = await fetch(`${base}/f/anything`);

      expect(first.status).not.toBe(429);
      expect(second.status).toBe(429);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
```

The redeem in that test throws (there is no database), so the first request takes the error path — which is why the first assertion is `not.toBe(429)` rather than `toBe(200)`. The meter runs *before* the redeem, so the second request is refused regardless.

- [ ] **Step 7: Run the whole respondent-host directory again**

```bash
cd packages/Server && pnpm exec vitest run src/respondent-host
```
Expected: PASS, everything.

- [ ] **Step 8: Commit**

```bash
git add packages/Server/src/respondent-host/RespondentHostMiddleware.ts \
        packages/Server/src/respondent-host/__tests__/respondent-host-routes.spec.ts \
        packages/Server/src/respondent-host/__tests__/redeem-rate-limit.spec.ts
git commit -m "$(cat <<'EOF'
fix(server): the respondent page is served compressed, like everything else MJAPI sends

MJServer mounts compression() long after it collects ConfigureExpressApp routes, and Express
dispatches in registration order — so /f/:slug finished its response before the compressor could
wrap it, and ~9 KB of HTML went out uncompressed on the first byte of every shared form link.
Moved to GetPreAuthMiddleware, the slot the base class documents as running after compression.

The page and the favicon match their own paths now, on the terms path-to-regexp gave them: a
case-insensitive literal, one optional trailing slash, a percent-decoded single segment. Those
cases are pinned, because a move that narrows a public URL sends a respondent to a bare 401.

Closes #181 (page half).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuWF5NqHohrUnasHifnChf
EOF
)"
```

---

### Task 4: Pin the ordering assumption the local identity mount exists for

Task 3's comment claims the route keeps its own `requestIdentityHandler()` because the global one's position depends on import order. Claims in comments rot. Make it a test: mount the host's handlers **before** the identity middleware's — the order that would break a route trusting the global copy — and show the meter still sees the caller.

**Files:**
- Modify: `packages/Server/src/respondent-host/__tests__/redeem-rate-limit.spec.ts`

**Interfaces:**
- Consumes: `mountRespondentHostLikeMJServer` (Task 2), the moved route (Task 3).

- [ ] **Step 1: Write the test**

Add inside the `describe('RespondentHostMiddleware wiring', …)` block from Task 3:

```ts
  // The reason the route carries its own identity handler even though it is pre-auth now. The
  // global copy's position in the chain is ClassFactory registration order, which is module import
  // order in `packages/Server/src/index.ts` — it happens to be first today. This mounts it LAST,
  // the order that would leave a trusting route unmetered, and the meter must still bite.
  it('meters per caller even when the global identity handler is mounted after it', async () => {
    process.env.FORMS_REDEEM_IP_MAX = '1';
    FormsRateLimiter.Instance.resetForTests();
    const { RespondentHostMiddleware } = await import('../RespondentHostMiddleware');

    const app = express();
    // Deliberately inverted: the host's pre-auth handlers first, the identity middleware after.
    await mountRespondentHostLikeMJServer(app, new RespondentHostMiddleware());
    for (const handler of new RequestIdentityMiddleware().GetPreAuthMiddleware()) {
      app.use(handler);
    }
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      await fetch(`${base}/f/anything`);
      expect((await fetch(`${base}/f/anything`)).status).toBe(429);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
```

- [ ] **Step 2: Run it**

```bash
cd packages/Server && pnpm exec vitest run src/respondent-host/__tests__/redeem-rate-limit.spec.ts
```
Expected: PASS.

- [ ] **Step 3: Prove the test is load-bearing (a two-minute mutation check)**

Temporarily delete `const withIdentity = requestIdentityHandler();` and call the continuation directly in `hostPageHandler` (i.e. remove the identity wrapper), re-run the file, and confirm **both** metering tests go red. Then restore the code exactly. A test that stays green here is worthless and must be strengthened before you move on.

```bash
cd packages/Server && pnpm exec vitest run src/respondent-host/__tests__/redeem-rate-limit.spec.ts
git diff --stat   # must be empty after you restore
```

- [ ] **Step 4: Commit**

```bash
git add packages/Server/src/respondent-host/__tests__/redeem-rate-limit.spec.ts
git commit -m "$(cat <<'EOF'
test(server): the page's own identity handler survives an inverted pre-auth chain

The route keeps a local requestIdentityHandler() because the global one's position is module import
order in a barrel file. That is a claim in a comment until something tests it, so: mount the
identity middleware LAST — the order that would leave a trusting route unmetered — and require the
per-IP ceiling to still refuse the second request.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuWF5NqHohrUnasHifnChf
EOF
)"
```

---

### Task 5: `POST /f/:slug/resume` gets an identity too

Found while auditing the identity mounts the issue asked about, and it is the same root cause: a route registered through `ConfigureExpressApp` never sees the global pre-auth handler, so `currentRequestIdentity()` inside `/resume` is always `undefined` and `resumeDeps` falls back to `` `slug:${slug}` ``. That is not a per-caller bucket — it is **one bucket for the whole form**, so a single abusive caller can rate-limit resume for every respondent of that link. One argument fixes it, exactly as the page route already does.

Kept as its own commit so it can be reverted independently of the compression fix.

**Files:**
- Modify: `packages/Server/src/respondent-host/RespondentHostMiddleware.ts`
- Modify: `packages/Server/src/respondent-host/__tests__/redeem-rate-limit.spec.ts`

**Interfaces:**
- Consumes: `requestIdentityHandler` (already imported in the middleware).

- [ ] **Step 1: Write the failing test**

Add to `redeem-rate-limit.spec.ts`. It captures what the route hands the resume service, which is where the key is decided. Put the mock with the other `vi.mock` calls at the top of the file:

```ts
/** The caller key the resume route built for its rate limiter — the fact under test. */
let capturedCallerKey: string | undefined;

vi.mock('../resume-deps', () => ({
  makeDeviceResumeDeps: (ctx: { callerKey: string }) => {
    capturedCallerKey = ctx.callerKey;
    // Every member of `DeviceResumeDeps`, read off the interface rather than guessed — the build
    // typechecks specs, and an incomplete stub fails there rather than here.
    return {
      loadDistribution: async () => undefined,
      loadResponse: async () => undefined,
      redeem: async () => ({ ok: false }),
      mint: async () => ({ ok: false }),
      revoke: async () => undefined,
      inviteFor: async () => ({ ok: false }),
      revokeInvite: async () => undefined,
      scopeOf: () => undefined,
      allowRequest: () => true,
      cookieFor: () => '',
      clearCookie: () => '',
      callerKey: ctx.callerKey,
    };
  },
}));
```

And the test itself, in a new `describe` at the end of the file:

```ts
describe('POST /f/:slug/resume', () => {
  // Same root cause as #181's compression bug: a route registered through `ConfigureExpressApp`
  // never sees the globally mounted pre-auth identity handler, so `currentRequestIdentity()` was
  // always undefined here and the rate-limit key fell back to the slug. That is ONE bucket for the
  // whole form — one caller could spend every respondent's resume budget.
  it('keys its rate limit on the caller, not on the form', async () => {
    capturedCallerKey = undefined;
    const { RespondentHostMiddleware } = await import('../RespondentHostMiddleware');

    const app = express();
    await mountRespondentHostLikeMJServer(app, new RespondentHostMiddleware());
    for (const handler of new RequestIdentityMiddleware().GetPreAuthMiddleware()) {
      app.use(handler);
    }
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      await fetch(`${base}/f/any-slug/resume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'mjf_resume=pointer' },
        body: '{}',
      });

      // A 64-hex peer hash, not `slug:any-slug`.
      expect(capturedCallerKey).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/Server && pnpm exec vitest run src/respondent-host/__tests__/redeem-rate-limit.spec.ts
```
Expected: FAIL — `expected 'slug:any-slug' to match /^[0-9a-f]{64}$/`. That string **is** the defect.

- [ ] **Step 3: Mount the identity handler on the route**

In `ConfigureExpressApp`, change the resume registration to carry the handler, and say why:

```ts
    // Pre-auth, like the page: this route's caller has no session — obtaining one is what it is
    // for. `requestIdentityHandler()` is mounted ON the route because this hook runs inside
    // MJServer's middleware-COLLECTION loop (`index.ts:824`) while the pre-auth handlers it gathers
    // are not `app.use`-d until `index.ts:1143`. Express dispatches in registration order, so the
    // global copy is added after this route and never runs for it. Without this argument
    // `currentRequestIdentity()` is undefined, `resumeDeps` falls back to keying on the slug, and
    // the rate limit becomes one bucket for the whole form — which any single caller can spend.
    app.post(RESPONDENT_RESUME_ROUTE, requestIdentityHandler(), (req: Request, res: Response) => {
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/Server && pnpm exec vitest run src/respondent-host
```
Expected: PASS, everything.

- [ ] **Step 5: Commit**

```bash
git add packages/Server/src/respondent-host/RespondentHostMiddleware.ts \
        packages/Server/src/respondent-host/__tests__/redeem-rate-limit.spec.ts
git commit -m "$(cat <<'EOF'
fix(server): the resume route meters the caller, not the form

Same registration-order root cause as the compression defect: a ConfigureExpressApp route never
sees the globally mounted identity handler, so currentRequestIdentity() was always undefined in
POST /f/:slug/resume and the key fell back to `slug:<slug>` — one bucket shared by every respondent
of that link, which any single caller could spend. One argument, the same one the page route
already carries.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuWF5NqHohrUnasHifnChf
EOF
)"
```

---

### Task 6: Move the public asset read into the pre-auth slot

The second route the issue names. It has **no route-level test at all** today, so this task adds one as well as moving it. Read design doc §5 before you start: on a default host this move saves zero bytes, because the four allowed image types are all incompressible — it is taken for the trap, not the bytes, and the test therefore uses the one allowed-by-configuration type that *is* compressible.

**Files:**
- Create: `packages/Server/src/asset/__tests__/AssetMiddleware.spec.ts`
- Modify: `packages/Server/src/asset/AssetMiddleware.ts`

**Interfaces:**
- Consumes: `matchSingleSegmentRoute` (Task 1); `loadAssetBytes(ctx, fileId): Promise<AssetReadResult>` from `../asset.service`.
- Produces: `AssetMiddleware.GetPreAuthMiddleware(): RequestHandler[]`; `ConfigureExpressApp` is removed from the class.

- [ ] **Step 1: Write the failing test**

Create `packages/Server/src/asset/__tests__/AssetMiddleware.spec.ts`:

```ts
/**
 * Route-level tests for the public asset read — the first this route has had.
 *
 * The bytes come from a faked `loadAssetBytes`, which is the whole I/O boundary: what is under test
 * is the ROUTE (which URLs it claims, and where it sits relative to MJ's `compression()`), not the
 * storage read, which `asset.service.spec.ts` already covers.
 *
 * The fixture is `image/svg+xml` on purpose. The four types in `FORMS_ASSET_ALLOWED_TYPES`'
 * default are all incompressible per `mime-db`, so a PNG fixture would pass this file by absence —
 * no `Content-Encoding` because nothing was ever going to be encoded. SVG is the compressible type
 * an operator can allow (`asset/config.ts:52` contemplates exactly that), so it is the one that can
 * tell a working route from a broken one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {
    GetPreAuthMiddleware(): unknown[] {
      return [];
    }
  },
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogStatus: () => undefined,
  LogError: () => undefined,
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { GetSystemUser: () => ({ ID: 'system-user-id' }) } },
}));

vi.mock('@memberjunction/storage', () => ({ FileStorageEngine: { Instance: {} } }));

/** An SVG comfortably over MJ's 1 KB threshold, so the compression assertion cannot pass by absence. */
const SVG_BYTES = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${'<rect width="1" height="1"/>'.repeat(60)}</svg>`,
);

/** The file id the route asked for, so the parity cases can assert what it read off the path. */
let requestedFileId: string | undefined;

vi.mock('../asset.service', () => ({
  loadAssetBytes: async (_ctx: unknown, fileId: string) => {
    requestedFileId = fileId;
    return { ok: true, asset: { contentType: 'image/svg+xml', content: SVG_BYTES } };
  },
}));

import express, { type Express } from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { AssetMiddleware } from '../AssetMiddleware';
import { ASSET_ROUTE, resetAssetConfigForTests } from '../config';

const MJ_COMPRESSION_THRESHOLD_BYTES = 1024;
const MJ_COMPRESSION_LEVEL = 6;

afterEach(() => {
  requestedFileId = undefined;
  resetAssetConfigForTests();
});

/** ConfigureExpressApp → compression() → pre-auth → the 401 standing in for MJAPI's routes. */
async function mountLikeMJServer(app: Express, middleware: AssetMiddleware): Promise<void> {
  await middleware.ConfigureExpressApp?.(app);
  app.use(compression({ threshold: MJ_COMPRESSION_THRESHOLD_BYTES, level: MJ_COMPRESSION_LEVEL }));
  for (const handler of middleware.GetPreAuthMiddleware()) {
    app.use(handler);
  }
  app.use((_req, res) => {
    res.status(401).type('text/plain').send('Unauthorized');
  });
}

type Fetch = (route: string, init?: RequestInit) => Promise<Response>;

async function withServer(assertions: (get: Fetch) => Promise<void>): Promise<void> {
  const app = express();
  await mountLikeMJServer(app, new AssetMiddleware());
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    await assertions((route, init) => fetch(`http://127.0.0.1:${port}${route}`, init));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

describe('public asset transfer (#181)', () => {
  it('serves a compressible asset gzip-encoded when the client offers gzip', async () => {
    expect(SVG_BYTES.byteLength).toBeGreaterThan(MJ_COMPRESSION_THRESHOLD_BYTES);
    await withServer(async (get) => {
      const res = await get(`${ASSET_ROUTE}/an-id`, { headers: { 'Accept-Encoding': 'gzip' } });
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get('content-encoding')).toBe('gzip');
      expect(res.headers.get('vary')).toContain('Accept-Encoding');
      expect(body).toBe(SVG_BYTES.toString('utf8'));
    });
  });

  it('keeps the headers that make a stored file safe to serve on this origin', async () => {
    // Compression sits in front of the route now. The CSP + nosniff pair and the immutable cache
    // policy are what keep a stored document from being treated as an active one; a transfer
    // change must not have disturbed them.
    await withServer(async (get) => {
      const res = await get(`${ASSET_ROUTE}/an-id`);
      await res.text();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    });
  });
});

describe('the URLs the asset read still claims', () => {
  it.each([
    [`${ASSET_ROUTE}/abc`, 'abc'],
    [`${ASSET_ROUTE}/abc/`, 'abc'],
    ['/FORMS/ASSET/abc', 'abc'],
    [`${ASSET_ROUTE}/AbC`, 'AbC'],
  ])('answers %s with the file id %j', async (path, fileId) => {
    await withServer(async (get) => {
      const res = await get(path);
      await res.text();
      expect(res.status).toBe(200);
      expect(requestedFileId).toBe(fileId);
    });
  });

  it.each([ASSET_ROUTE, `${ASSET_ROUTE}/`, `${ASSET_ROUTE}/a/b`, `${ASSET_ROUTE}/abc//`])(
    'leaves %s to the routes behind it',
    async (path) => {
      await withServer(async (get) => {
        const res = await get(path);
        await res.text();
        expect(res.status).toBe(401);
      });
    },
  );

  it('answers HEAD, as app.get did', async () => {
    await withServer(async (get) => {
      const res = await get(`${ASSET_ROUTE}/abc`, { method: 'HEAD' });
      expect(res.status).toBe(200);
    });
  });

  it('leaves POST to the authenticated upload handler behind it', async () => {
    // POST /forms/asset is the WRITE, contributed post-auth. The read must not swallow it.
    await withServer(async (get) => {
      const res = await get(`${ASSET_ROUTE}/abc`, { method: 'POST' });
      await res.text();
      expect(res.status).toBe(401);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/Server && pnpm exec vitest run src/asset/__tests__/AssetMiddleware.spec.ts
```
Expected: FAIL on the compression test (`expected null to be 'gzip'`). The parity cases pass already — they are what must keep passing.

- [ ] **Step 3: Move the route**

In `packages/Server/src/asset/AssetMiddleware.ts`:

1. Add `NextFunction` to the express type import, and `import { matchSingleSegmentRoute } from '../http/route-match.js';`
2. Delete `ConfigureExpressApp` entirely (the base declares it optional, and MJServer guards with `if (mw.ConfigureExpressApp)`), replacing it with:

```ts
  /**
   * The anonymous read route, in the slot that sits BEHIND MJ's `compression()`.
   *
   * ── Why this is pre-auth middleware and not a `ConfigureExpressApp` route (#181) ───────────────
   * Both hooks run before auth; they differ in where the route lands in Express's stack. `serve()`
   * calls `ConfigureExpressApp` while still collecting middleware contributions (`index.ts:824`),
   * BEFORE it mounts `compression()` (`index.ts:1129`), so a route registered there finishes its
   * response before the compressor can wrap it. This is the same defect #121 fixed for the widget
   * bundle and #181 fixed for the respondent page.
   *
   * WHAT THIS BUYS, HONESTLY. Today: nothing, in bytes. `FORMS_ASSET_ALLOWED_TYPES` defaults to
   * PNG/JPEG/GIF/WebP, and `compression.filter` consults `mime-db`, which marks all four
   * incompressible — so they were never going to be encoded in either slot. It is taken because the
   * defect is the SLOT rather than the payload: an operator who adds `image/svg+xml` to the
   * allowlist (which `config.ts` explicitly contemplates) would otherwise inherit the bug silently,
   * and leaving one of the two routes in the broken slot preserves the trap.
   *
   * (A correction, since the reverse is easy to assume: MJ's custom compression `filter` reads
   * `req.headers['content-type']` — the REQUEST's type, which a GET does not send — so its
   * `image/` skip never fires here. What decides is `compression.filter` on the RESPONSE type.)
   *
   * The read is anonymous because a published form's welcome image has to render for a respondent
   * with no session at all — an `<img>` cannot present a bearer token. Its guard is therefore not
   * identity but storage location: only objects under the public asset prefix are servable.
   *
   * MOVING SLOTS also puts this route behind every other pre-auth handler, including MJ's global
   * `RateLimitMiddleware` (`enabled: false` by default). On a host that turns rate limiting on, a
   * form's images are now counted and can answer 429 — which a respondent sees as a broken image,
   * not as a rate-limit message.
   */
  public override GetPreAuthMiddleware(): RequestHandler[] {
    LogStatus(`[Forms] Public asset endpoint registered at GET ${ASSET_ROUTE}/:fileId`);
    return [
      (req: Request, res: Response, next: NextFunction): void => {
        // GET and HEAD, like the `app.get` this replaced. `matchSingleSegmentRoute` reproduces what
        // path-to-regexp claimed: a case-insensitive literal, one optional trailing slash, and a
        // percent-decoded single segment — so a mis-cased asset URL in published HTML still renders
        // instead of falling through to a 401.
        const fileId =
          req.method === 'GET' || req.method === 'HEAD'
            ? matchSingleSegmentRoute(req.path, ASSET_ROUTE)
            : undefined;
        if (fileId === undefined) {
          next();
          return;
        }
        void this.handleFetch(fileId, res).catch((e: unknown) => {
          LogError(`[Forms] Asset fetch route error: ${e instanceof Error ? e.message : String(e)}`);
          sendJsonError(res, 500, 'Could not read the image.');
        });
      },
    ];
  }
```

3. Change `handleFetch` to take the id rather than the request, and delete the Express-5 `string | string[]` paragraph — `matchSingleSegmentRoute` returns a `string` or nothing, so the case it guarded no longer exists:

```ts
  /** Serve one stored asset's bytes to an anonymous caller. */
  private async handleFetch(fileId: string, res: Response): Promise<void> {
```

and inside it, replace the two `req.params.fileId` lines with:

```ts
    const result = await loadAssetBytes(ctx, fileId);
```

4. Update the class header comment. The clause *"The READ runs PRE-AUTH, contributed through {@link ConfigureExpressApp} exactly like the `/f/:slug` respondent host page"* is now false twice over — rewrite it as *"The READ runs PRE-AUTH, contributed through {@link GetPreAuthMiddleware} exactly like the `/f/:slug` respondent host page"*. Delete the `SEAM NOTE` paragraph's second sentence about *"moving both is a behaviour-preserving refactor that belongs in its own commit"* — this is that commit — and keep the first sentence about the `BaseServerExtension` migration, which is still outstanding.

5. Check whether `Request` is still used in the file after the change (the upload handler uses it) and whether `Application` is now unused — if it is, remove it from the import or the build will fail on `noUnusedLocals`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/Server && pnpm exec vitest run src/asset
```
Expected: PASS, everything in the directory.

- [ ] **Step 5: Commit**

```bash
git add packages/Server/src/asset/AssetMiddleware.ts \
        packages/Server/src/asset/__tests__/AssetMiddleware.spec.ts
git commit -m "$(cat <<'EOF'
fix(server): the public asset read moves behind compression too, and gains a route test

Same registration-order defect as the respondent page. Worth saying plainly: on a default host this
saves zero bytes, because the four allowed image types are all incompressible per mime-db. It is
taken because the defect is the SLOT and not the payload — an operator who allows image/svg+xml
would otherwise inherit the bug silently, and leaving one of the two named routes behind preserves
the trap the issue exists to remove.

The route had no route-level test at all; it has one now, including the URLs it must keep claiming
and the CSP/nosniff/immutable headers a transfer change must not disturb.

Closes #181 (asset half).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuWF5NqHohrUnasHifnChf
EOF
)"
```

---

### Task 7: Changeset

**Files:**
- Create: `.changeset/the-respondent-page-arrives-compressed.md`

**Interfaces:** none.

- [ ] **Step 1: Write it**

The rule (`.claude/rules/changesets.md`) is mechanical: **`patch` unless the change ships a migration or metadata.** This ships neither. Do not upgrade it because the blast radius feels large — that reasoning is exactly what the rule exists to stop. Every package in the fixed group takes the same level.

```markdown
---
"@mj-biz-apps/forms-core-entities-server": patch
"@mj-biz-apps/forms-entities": patch
"@mj-biz-apps/forms-server": patch
"@mj-biz-apps/forms-ng": patch
---

The respondent page and the public asset read are transferred compressed, like everything else MJAPI sends.

MJServer mounts `compression()` at `index.ts:1129`, long after it collects the routes contributed through `ConfigureExpressApp` at `index.ts:824`, and Express dispatches layers in registration order — so both routes finished their responses before the compressor could wrap `res.write`. `GET /f/:slug` went out as ~9 KB of uncompressed HTML to every respondent who opened a shared link, however much gzip and brotli their browser had offered, on the phones and cellular connections this product is built for. It compresses to about 47% of that. This is the same defect #121 fixed for the widget bundle; both routes were scoped out of that change on purpose and are finished here.

**Both routes moved to `GetPreAuthMiddleware`, the slot the base class documents as running "after compression but before OAuth/REST/GraphQL routes".** A handler in that slot has no route pattern, so each route now matches its own path — and the rules Express's router applied are not obvious ones to re-derive: the literal is case-insensitive, exactly one trailing slash is tolerated, and the `:param` arrives percent-decoded. Those rules live in one place (`http/route-match.ts`) shared by all three routes that need them, pinned to a table probed case by case against a live Express app, because a move that quietly narrows a public URL sends a respondent to MJAPI's authenticated routes and a bare 401 that nothing explains.

**The asset half saves nothing on a default host, and is taken anyway.** `FORMS_ASSET_ALLOWED_TYPES` defaults to PNG, JPEG, GIF and WebP; `mime-db` marks all four incompressible, so `compression.filter` was never going to encode them in either slot. The defect is the registration slot rather than the payload — an operator who adds `image/svg+xml` to the allowlist would otherwise inherit the bug with no sign of it, and leaving one route in the broken slot would preserve the trap for whoever next asks why the respondent path is slow.

**Operators should expect one behaviour change beyond the bytes.** Pre-auth contributions are mounted as one ordered chain, so these routes are no longer ahead of every other pre-auth handler — they are behind them, including MJ's global `RateLimitMiddleware` (off by default). A host that switches rate limiting on will see the respondent page and form images counted, where they were previously exempt. That is the right posture for public unauthenticated routes, but a respondent refused there sees an error page or a broken image rather than a rate-limit explanation.

Also fixed, same root cause: `POST /f/:slug/resume` never saw the globally mounted request-identity handler either, so its rate limit keyed on the form's slug instead of the caller — one bucket every respondent of a link shared, which a single caller could spend. It now keys on the resolved peer, as the page route already did.
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/the-respondent-page-arrives-compressed.md
git commit -m "$(cat <<'EOF'
chore(changeset): the respondent page and asset read arrive compressed

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuWF5NqHohrUnasHifnChf
EOF
)"
```

---

### Task 8: Verify the whole thing, in the repo and on a live host

Nothing here is optional, and nothing here is a claim you may make without the output in front of you (`superpowers:verification-before-completion`). Record each command's result in your final report.

**Files:** none (verification only).

- [ ] **Step 1: The Server package suite**

```bash
cd packages/Server && pnpm test 2>&1 | tail -30
```
Expected: all files pass. Collection takes ~90s before any test runs — that is normal here, not a hang.

- [ ] **Step 2: Typecheck and build**

Vitest does **not** typecheck in this repo, so a spec that only adds a property passes while the build fails. Both of these must be run:

```bash
cd packages/Server && pnpm run build 2>&1 | tail -20
```
Expected: clean. Watch for `noUnusedLocals` errors on imports left behind by Tasks 3 and 6 (`Application`, the deleted `matchesRoute`).

- [ ] **Step 3: The repo's own gates**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-181
pnpm run lint:distribution 2>&1 | tail -10
node scripts/check-migration-order.mjs 2>&1 | tail -5
```
Expected: pass. (No migration or metadata changed, so these should be trivially green — run them anyway; a surprise here means something was touched that should not have been.)

- [ ] **Step 4: Run the whole monorepo test suite**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-181 && pnpm test 2>&1 | tail -40
```
Expected: green. If the Angular package reports many "failed files", that is a missing `packages/Entities/dist` in this worktree, not a real failure — it is already built here, but rebuild it (`cd packages/Entities && pnpm run build`) before believing anything else.

- [ ] **Step 5: Reproduce the issue's own repro against this branch, on its own port**

Do **not** use ports 4000 or 4121 — both belong to running hosts that are not yours to restart. `MJAPI_PUBLIC_URL` is read at import time, so it must be set on the command line; a later `process.env` assignment is silently ignored and the host page ends up pointing at the wrong origin.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-181/apps/MJAPI
set -a && . ../../.env && set +a
GRAPHQL_PORT=4141 MJAPI_PUBLIC_URL=http://localhost:4141 node server.mjs
# wait for:  Ready     http://localhost:4141/
```

In another shell — a GET with `-D -`, never `curl -I`, because HEAD is never compressed:

```bash
curl -s -D - -o /tmp/181-page.html -H 'Accept-Encoding: gzip, br' \
  http://localhost:4141/f/all-types-smoke | grep -iE '^(HTTP|content-encoding|content-length|vary)'
```
Expected **after** the fix: `200`, a `Content-Encoding` line, `Vary: Accept-Encoding`, and a transferred size well under the ~9,262 bytes the uncompressed page measured on `:4000` before the change.

Then the parity checks the DoD names, on the same live host:

```bash
curl -s -o /dev/null -w '%{http_code} mis-cased\n' http://localhost:4141/F/all-types-smoke
curl -s -o /dev/null -w '%{http_code} trailing-slash\n' http://localhost:4141/f/all-types-smoke/
curl -s -o /dev/null -w '%{http_code} favicon\n'       http://localhost:4141/favicon.ico
```
Expected: `200`, `200`, `204`.

Kill the harness **by PID or port** when you are done — never by process name, which has killed the wrong host here before.

- [ ] **Step 6: The respondent smoke test**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-181 && pnpm run smoke:respondent 2>&1 | tail -30
```
Expected: passes end to end. It needs the harness from Step 5 running, and `.env` in the worktree root (already copied). If it needs a different port than the one the harness is on, read `smoke/respondent-path.mjs` for which variable it honours rather than guessing.

- [ ] **Step 7: Report**

Write a short report covering: which commands you ran and their actual output; whether Step 5 showed a `Content-Encoding` line and what the transferred size was; anything you changed from this plan and why; and anything you could not verify, stated plainly rather than assumed. Do **not** push and do **not** open a PR — the coordinating session does that.
