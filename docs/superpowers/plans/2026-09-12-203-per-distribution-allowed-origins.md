# Per-distribution AllowedOrigins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `FormDistribution` name the browser origins permitted to embed it, and enforce that list on the two doors a third-party embed actually goes through — the respondent host page's framing, and the public GraphQL API.

**Architecture:** A new `FormDistribution.AllowedOrigins` column holds a JSON array of full browser origins. A pure contract in `forms-entities` owns the grammar and the parse; a small server module composes it with the API's own origin into one verdict; three call sites consume that verdict. NULL/empty means unrestricted, so no live embed changes behaviour; an authored list is fail-closed.

**Tech Stack:** TypeScript, MemberJunction 6.1 (`BaseEntity`/`RunView`), type-graphql, Express, Angular 21 standalone, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-12-203-per-distribution-allowed-origins.md`](../specs/2026-09-12-203-per-distribution-allowed-origins.md)

**Issue:** https://github.com/MemberJunction/bizapps-forms/issues/203

## Global Constraints

- **No `any`.** No `as any`, `: any`, `<any>`, or `unknown` used as a lazy stand-in. Ask rather than widen.
- **No weak typing.** Never `.Get()`/`.Set()` where a generated property exists. `AllowedOrigins` already exists on `mjBizAppsFormsFormDistributionEntity` and on `mjBizAppsFormsFormDistributionEntityType` as `string | null` — Task 0 landed it.
- **Never hand-edit anything under `packages/*/src/**/generated/`.** A hook refuses it. Task 0 already ran CodeGen; no task below regenerates.
- **Never swallow an error.** Every `catch` logs with context or returns a typed failure. No silent fallback to `[]`/`null`.
- **Command–query separation.** `is`/`get`/`find`/`parse` are pure reads. Side effects live in action verbs.
- **Tests are `*.spec.ts`.** Entities + Angular co-locate them beside the source; Server puts them in the nearest `__tests__/` directory. There is no `@memberjunction/test-utils` in this repo.
- **Design tokens only in CSS** — `--mj-*` / `--mjf-*`. No hardcoded colours.
- **Angular:** `@if`/`@for` control flow, `inject()`, standalone for new leaf components. Follow the pattern already in the package you are editing.
- **Do not commit.** Leave every task's work staged-but-uncommitted unless the step says otherwise; the coordinator commits.
- **Build after editing a package:** `cd packages/<Pkg> && pnpm run build`, then `pnpm test` in that package.
- **`packages/Server` compiles without `strictNullChecks`.** Prefer flat result objects with optional fields over discriminated unions whose narrowing depends on strict mode — `DefinitionLoadResult` in `public-submit/definition-loader.service.ts` documents why. `packages/Entities` **does** compile strict, so a discriminated union is fine there.

---

## Background you need before Task 1

Read these three things before writing any code. They are short and each one prevents a specific wrong turn.

**1. What an embed actually is here.** `packages/Angular/src/lib/builder/distribution.service.ts:423` builds the embed snippet, and it is an **`<iframe>`** pointing at `${base}/f/${slug}`. So a "third-party embed" is: the customer's page frames our host page. The form's document origin is **ours**, not the customer's.

**2. Therefore the Origin header does not carry the customer's origin.** This was measured in a real browser against the running host on 2026-09-12:

```
Origin header the SERVER sees, per caller:
  {"from":"TOP-LEVEL-CUSTOMER-PAGE",      "origin":"http://127.0.0.1:8917"}
  {"from":"INSIDE-THE-EMBEDDED-WIDGET",   "origin":"http://localhost:4000"}
```

A `fetch` issued from inside the embedded widget reports **the API's own origin**. This is the single most load-bearing fact in this plan:

- The **framing** control (which customer sites may embed the link) can only be enforced with `Content-Security-Policy: frame-ancestors`, which the browser evaluates against the framing ancestor. That is Task 5.
- The **API** control can therefore never see a legitimate embed's customer origin. What it *can* refuse is a caller that is neither our own page nor a declared origin — i.e. a leaked link replayed from someone else's page, or a direct-element embed if one ever ships. That is Task 4, and it is why the gate admits the API's own origin.

Do not "fix" Task 4 by trying to read the customer's origin from `Referer`. The iframe's `Referer` is our own page too (same measurement, second column of the probe).

**3. The gap reproduces today, on `next`.** All four were confirmed on 2026-09-12 against the shared host at `:4000`:

| Probe | Result |
|---|---|
| `GET /f/<slug>` response headers | no `X-Frame-Options`, no `Content-Security-Policy` — any site may frame it |
| A real third-party page framing `/f/<slug>` | iframe loaded and rendered a live, fillable form |
| `POST /graphql` `PublishedForm` with `Origin: https://evil.example` | `200`, full definition returned |
| `POST /graphql` `SubmitFormResponse` with `Origin: https://evil.example` | `success: true`, row written |

---

## Task 0 — DONE, do not redo

Commit `45c2f26` already landed, on this branch:

- `migrations/V202609121200__v0.12.x__Distribution_Allowed_Origins.sql` — the guarded `ALTER TABLE ... ADD [AllowedOrigins] NVARCHAR(MAX) NULL` plus its extended property. Read its header comment; it carries the design rationale you will be echoing in code comments.
- The CodeGen regeneration of that one column across `packages/Entities/src/generated/entities/__mj_BizAppsForms.ts`, `packages/Server/src/generated/graphql-schemas/__mj_BizAppsForms.ts`, and `packages/Angular/src/lib/generated/Entities/mjBizAppsFormsFormDistribution/mjbizappsformsformdistribution.form.component.html`.

So `dist.AllowedOrigins` is a real, typed `string | null` property **now**. Use it directly. Do not run `mj codegen`, do not run `mj migrate`, do not touch any database.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/Entities/src/contracts/allowed-origins.ts` (create) | The grammar, the parse, the match, the CSP directive. Pure — no I/O, no MJ types. |
| `packages/Entities/src/contracts/allowed-origins.spec.ts` (create) | Grammar + policy tests. |
| `packages/Entities/src/contracts/index.ts` (modify) | Re-export the new contract. |
| `packages/Server/src/http/embed-origin.ts` (create) | The API's own origin, and the one verdict function that composes it with a distribution's policy. |
| `packages/Server/src/http/__tests__/embed-origin.spec.ts` (create) | Verdict tests. |
| `packages/Server/src/http/request-identity.ts` (modify) | `RequestIdentity` gains `origin`. |
| `packages/Server/src/http/RequestIdentityMiddleware.ts` (modify) | Populate it. |
| `packages/Server/src/public-submit/submit-pipeline.ts` (modify) | The submit gate. |
| `packages/Server/src/public-submit/PublicFormResolver.ts` (modify) | Thread the origin in; gate the read. |
| `packages/Server/src/respondent-host/RespondentHostMiddleware.ts` (modify) | Emit `frame-ancestors` on the host page. |
| `packages/Angular/src/lib/builder/distribution.service.ts` (modify) | Read/write the authored list. |
| `packages/Angular/src/lib/builder/distribution-manager.component.{ts,html,css}` (modify) | Author it, beside the embed snippet. |
| `.changeset/*.md` (create) | `minor` — this PR ships a migration. |

---

### Task 1: The origin grammar contract

**Files:**
- Create: `packages/Entities/src/contracts/allowed-origins.ts`
- Create: `packages/Entities/src/contracts/allowed-origins.spec.ts`
- Modify: `packages/Entities/src/contracts/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, and every later task imports these from `@mj-biz-apps/forms-entities`:
  - `ALLOWED_ORIGIN_GRAMMAR: string`
  - `normalizeOrigin(raw: string): string | null`
  - `type EmbedOriginPolicy = { kind: 'unrestricted' } | { kind: 'allowlist'; origins: readonly string[] } | { kind: 'closed'; reason: string }`
  - `parseAllowedOrigins(raw: string | null | undefined): EmbedOriginPolicy`
  - `isOriginAdmitted(origin: string | null | undefined, policy: EmbedOriginPolicy): boolean`
  - `frameAncestorsDirective(policy: EmbedOriginPolicy): string | undefined`
  - `authorAllowedOrigins(authored: string): { origins: string[]; rejected: string[] }`
  - `serializeAllowedOrigins(origins: readonly string[]): string | null`

**Why the grammar is Caliber's, verbatim.** `bizapps-caliber/packages/Entities/src/config/allowed-origins.ts` already settled every rule below and wrote down why. Read it before you start — it is 150 lines and its header comment is the argument. Reuse its refusals exactly: no wildcards in any position, no path/query/fragment, no credentials, `http` only for loopback, and the browser's own canonical spelling (lowercase scheme and host, port kept only when non-default, no trailing slash). Issue #203's third acceptance criterion is that the two agree or the difference is documented; the per-entry grammar agrees, and the only divergence is the container, which the migration header already documents.

- [ ] **Step 1: Write the failing test**

Create `packages/Entities/src/contracts/allowed-origins.spec.ts`:

```ts
/**
 * `FormDistribution.AllowedOrigins` — the grammar one entry is held to, and what an authored
 * list means on the request path (#203).
 *
 * The grammar half mirrors `bizapps-caliber`'s `allowed-origins.spec.ts` deliberately: the two
 * apps must refuse the same strings, or an operator who learns one learns the other wrong.
 */
import { describe, expect, it } from 'vitest';
import {
  authorAllowedOrigins,
  frameAncestorsDirective,
  isOriginAdmitted,
  normalizeOrigin,
  parseAllowedOrigins,
  serializeAllowedOrigins,
} from './allowed-origins';

describe('normalizeOrigin — canonicalises to the browser\'s own spelling', () => {
  it('lowercases scheme and host and drops a default port', () => {
    expect(normalizeOrigin('HTTPS://Careers.ACME.com')).toBe('https://careers.acme.com');
    expect(normalizeOrigin('https://careers.acme.com:443')).toBe('https://careers.acme.com');
  });

  it('keeps a non-default port', () => {
    expect(normalizeOrigin('https://careers.acme.com:8443')).toBe('https://careers.acme.com:8443');
  });

  it('accepts the bare-origin trailing slash a browser never sends', () => {
    expect(normalizeOrigin('https://acme.com/')).toBe('https://acme.com');
  });

  it('refuses anything carrying a path, query or fragment', () => {
    for (const v of ['https://acme.com/careers', 'https://acme.com/?x=1', 'https://acme.com/#a']) {
      expect(normalizeOrigin(v)).toBeNull();
    }
  });

  it('refuses wildcards in every position', () => {
    for (const v of ['*', '*.acme.com', 'https://*.acme.com', 'https://acme.*']) {
      expect(normalizeOrigin(v)).toBeNull();
    }
  });

  it('accepts http only for loopback', () => {
    expect(normalizeOrigin('http://acme.com')).toBeNull();
    expect(normalizeOrigin('http://localhost:4200')).toBe('http://localhost:4200');
    expect(normalizeOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it('refuses credentials, empty strings and non-URLs', () => {
    for (const v of ['https://u:p@acme.com', '', '   ', 'acme.com', 'not a url']) {
      expect(normalizeOrigin(v)).toBeNull();
    }
  });
});

describe('parseAllowedOrigins — NULL is unrestricted, authored-but-unusable is closed', () => {
  it('treats NULL, undefined, blank and an empty array as unrestricted', () => {
    for (const v of [null, undefined, '', '   ', '[]']) {
      expect(parseAllowedOrigins(v)).toEqual({ kind: 'unrestricted' });
    }
  });

  it('normalises every usable entry and de-duplicates', () => {
    const policy = parseAllowedOrigins('["HTTPS://Acme.com", "https://acme.com:443", "https://b.example"]');
    expect(policy).toEqual({ kind: 'allowlist', origins: ['https://acme.com', 'https://b.example'] });
  });

  it('drops an unusable entry but keeps the usable ones — dropping only ever narrows', () => {
    const policy = parseAllowedOrigins('["https://acme.com", "*.acme.com"]');
    expect(policy).toEqual({ kind: 'allowlist', origins: ['https://acme.com'] });
  });

  it('is CLOSED, never unrestricted, when an authored value yields nothing usable', () => {
    expect(parseAllowedOrigins('["*.acme.com"]').kind).toBe('closed');
    expect(parseAllowedOrigins('not json').kind).toBe('closed');
    expect(parseAllowedOrigins('{"https://acme.com":{}}').kind).toBe('closed');
    expect(parseAllowedOrigins('"https://acme.com"').kind).toBe('closed');
  });

  it('names what was wrong, so the log line can be acted on', () => {
    const policy = parseAllowedOrigins('["*.acme.com"]');
    expect(policy.kind === 'closed' && policy.reason).toContain('*.acme.com');
  });
});

describe('isOriginAdmitted — unrestricted admits all, allowlist is exact, closed admits none', () => {
  it('admits anything under an unrestricted policy, including no Origin at all', () => {
    const policy = parseAllowedOrigins(null);
    expect(isOriginAdmitted('https://anywhere.example', policy)).toBe(true);
    expect(isOriginAdmitted(undefined, policy)).toBe(true);
  });

  it('matches an allowlist entry regardless of the caller\'s spelling', () => {
    const policy = parseAllowedOrigins('["https://careers.acme.com"]');
    expect(isOriginAdmitted('HTTPS://Careers.ACME.com', policy)).toBe(true);
  });

  it('refuses a subdomain, a different port and a different scheme', () => {
    const policy = parseAllowedOrigins('["https://acme.com"]');
    expect(isOriginAdmitted('https://evil.acme.com', policy)).toBe(false);
    expect(isOriginAdmitted('https://acme.com:8443', policy)).toBe(false);
    expect(isOriginAdmitted('http://acme.com', policy)).toBe(false);
  });

  it('refuses a caller that will not say where it came from', () => {
    const policy = parseAllowedOrigins('["https://acme.com"]');
    expect(isOriginAdmitted(undefined, policy)).toBe(false);
    expect(isOriginAdmitted(null, policy)).toBe(false);
    expect(isOriginAdmitted('null', policy)).toBe(false);
    expect(isOriginAdmitted('not-an-origin', policy)).toBe(false);
  });

  it('admits nobody under a closed policy', () => {
    const policy = parseAllowedOrigins('["*.acme.com"]');
    expect(isOriginAdmitted('https://acme.com', policy)).toBe(false);
    expect(isOriginAdmitted(undefined, policy)).toBe(false);
  });
});

describe('frameAncestorsDirective — what the host page sends', () => {
  it('sends nothing when unrestricted, so today\'s embeds are untouched', () => {
    expect(frameAncestorsDirective(parseAllowedOrigins(null))).toBeUndefined();
  });

  it('names self plus every authored origin', () => {
    const policy = parseAllowedOrigins('["https://a.example", "https://b.example"]');
    expect(frameAncestorsDirective(policy)).toBe(
      "frame-ancestors 'self' https://a.example https://b.example",
    );
  });

  it('refuses all framing when the policy is closed', () => {
    expect(frameAncestorsDirective(parseAllowedOrigins('["*.acme.com"]'))).toBe("frame-ancestors 'none'");
  });
});

describe('authoring round-trip', () => {
  it('splits an authored block on newlines and commas, reporting refusals', () => {
    const result = authorAllowedOrigins('https://a.example\n*.acme.com,  https://b.example:8443 \n\n');
    expect(result.origins).toEqual(['https://a.example', 'https://b.example:8443']);
    expect(result.rejected).toEqual(['*.acme.com']);
  });

  it('serializes to the column, and an empty list clears it back to unrestricted', () => {
    expect(serializeAllowedOrigins(['https://a.example'])).toBe('["https://a.example"]');
    expect(serializeAllowedOrigins([])).toBeNull();
  });

  it('round-trips through the column', () => {
    const authored = authorAllowedOrigins('https://a.example, https://b.example');
    const column = serializeAllowedOrigins(authored.origins);
    expect(parseAllowedOrigins(column)).toEqual({
      kind: 'allowlist',
      origins: ['https://a.example', 'https://b.example'],
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/Entities && pnpm vitest run src/contracts/allowed-origins.spec.ts
```

Expected: every test fails to even load — `Failed to resolve import "./allowed-origins"`.

- [ ] **Step 3: Write the contract**

Create `packages/Entities/src/contracts/allowed-origins.ts`. Write a file-level comment in this repo's voice — say what the thing is, what it is *not* (defense in depth behind the magic link, not a replacement for it), why wildcards are a refusal rather than an omission, and why an authored-but-unusable value is closed rather than unrestricted. The migration header (`migrations/V202609121200__*.sql`) has the full argument; do not simply copy it — cite it and keep this comment about the code.

```ts
import type { JSONValue } from './json-value';

/** Schemes an embed may use. `http` is permitted only for loopback — see {@link normalizeOrigin}. */
const ALLOWED_SCHEMES = ['https:', 'http:'] as const;

/** Hosts for which plain `http` is accepted, so local development is authorable without a proxy. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;

export const ALLOWED_ORIGIN_GRAMMAR =
  'a full browser origin — scheme://host with an optional port, no path, query, fragment or '
  + 'wildcard (e.g. https://careers.acme.com or https://careers.acme.com:8443). '
  + 'http is accepted only for localhost.';

export function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.includes('*')) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!(ALLOWED_SCHEMES as readonly string[]).includes(url.protocol)) {
    return null;
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return null;
  }
  // `new URL('https://acme.com')` yields pathname '/', which is the no-path case. Anything longer
  // — or any query/fragment — means the author wrote a page, not an origin.
  if (url.pathname !== '/' || url.search.length > 0 || url.hash.length > 0) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol === 'http:' && !(LOOPBACK_HOSTS as readonly string[]).includes(host)) {
    return null;
  }
  // `url.host` keeps a non-default port and drops a default one — exactly the browser's rule.
  return `${url.protocol}//${url.host.toLowerCase()}`;
}

/** What a distribution's `AllowedOrigins` column means for one request. */
export type EmbedOriginPolicy =
  | { kind: 'unrestricted' }
  | { kind: 'allowlist'; origins: readonly string[] }
  | { kind: 'closed'; reason: string };

export function parseAllowedOrigins(raw: string | null | undefined): EmbedOriginPolicy {
  if (raw === null || raw === undefined || raw.trim().length === 0) {
    return { kind: 'unrestricted' };
  }
  let parsed: JSONValue;
  try {
    parsed = JSON.parse(raw) as JSONValue;
  } catch {
    return { kind: 'closed', reason: `AllowedOrigins is not valid JSON: ${truncate(raw)}` };
  }
  if (!Array.isArray(parsed)) {
    return {
      kind: 'closed',
      reason: `AllowedOrigins must be a JSON array of origin strings; got ${typeof parsed}. ${ALLOWED_ORIGIN_GRAMMAR}`,
    };
  }
  if (parsed.length === 0) {
    return { kind: 'unrestricted' };
  }
  const origins: string[] = [];
  const rejected: string[] = [];
  for (const entry of parsed) {
    const normalized = typeof entry === 'string' ? normalizeOrigin(entry) : null;
    if (normalized === null) {
      rejected.push(typeof entry === 'string' ? entry : JSON.stringify(entry));
    } else if (!origins.includes(normalized)) {
      origins.push(normalized);
    }
  }
  if (origins.length === 0) {
    return {
      kind: 'closed',
      reason: `AllowedOrigins named ${rejected.length} entr${rejected.length === 1 ? 'y' : 'ies'} `
        + `and none is usable (${rejected.join(', ')}). Expected ${ALLOWED_ORIGIN_GRAMMAR}`,
    };
  }
  return { kind: 'allowlist', origins };
}

export function isOriginAdmitted(
  origin: string | null | undefined,
  policy: EmbedOriginPolicy,
): boolean {
  if (policy.kind === 'unrestricted') {
    return true;
  }
  if (policy.kind === 'closed' || typeof origin !== 'string') {
    return false;
  }
  const normalized = normalizeOrigin(origin);
  return normalized !== null && policy.origins.includes(normalized);
}

export function frameAncestorsDirective(policy: EmbedOriginPolicy): string | undefined {
  if (policy.kind === 'unrestricted') {
    return undefined;
  }
  if (policy.kind === 'closed') {
    return "frame-ancestors 'none'";
  }
  return `frame-ancestors 'self' ${policy.origins.join(' ')}`;
}

export function authorAllowedOrigins(authored: string): { origins: string[]; rejected: string[] } {
  const origins: string[] = [];
  const rejected: string[] = [];
  for (const entry of authored.split(/[\n,]/).map((part) => part.trim()).filter((part) => part.length > 0)) {
    const normalized = normalizeOrigin(entry);
    if (normalized === null) {
      rejected.push(entry);
    } else if (!origins.includes(normalized)) {
      origins.push(normalized);
    }
  }
  return { origins, rejected };
}

export function serializeAllowedOrigins(origins: readonly string[]): string | null {
  return origins.length === 0 ? null : JSON.stringify(origins);
}

/** Keep a refused value out of a log line's way while still naming it. */
function truncate(raw: string): string {
  const flat = raw.trim().replace(/\s+/g, ' ');
  return flat.length <= 80 ? flat : `${flat.slice(0, 77)}...`;
}
```

Three comments the code needs and the sketch above omits — write them:

- On `parseAllowedOrigins`, why a dropped entry narrows but an all-dropped list closes. Dropping one entry can only ever make the allowlist smaller, which is safe; falling back to `unrestricted` when nothing survives would turn an author's attempt to restrict into no restriction at all, which is the worst of the three possible answers.
- On `isOriginAdmitted`, why an absent `Origin` is refused under a list: a caller that will not say where it came from cannot be checked against a list of places, and admitting it would make the list decorative. Note the consequence out loud — a non-browser client (curl, server-to-server) sends no `Origin` and is therefore refused by a restricted link, and that is the intent.
- On `frameAncestorsDirective`, why `'self'` is always included (our own Explorer-side preview and any same-origin surface must keep working) and why `X-Frame-Options` is deliberately NOT emitted anywhere (it cannot express a list; a single `ALLOW-FROM` is unsupported in every current browser, and sending `SAMEORIGIN` beside a permissive CSP would break the very embeds this feature exists to enable).

- [ ] **Step 4: Export it**

Append to `packages/Entities/src/contracts/index.ts`, in the existing style:

```ts
export * from './allowed-origins';
```

- [ ] **Step 5: Run the tests and the build**

```bash
cd packages/Entities && pnpm vitest run src/contracts/allowed-origins.spec.ts && pnpm run build && pnpm test
```

Expected: the new spec passes, the package builds, and the whole `packages/Entities` suite is still green.

---

### Task 2: The request's Origin reaches the resolvers

**Files:**
- Modify: `packages/Server/src/http/request-identity.ts`
- Modify: `packages/Server/src/http/RequestIdentityMiddleware.ts`
- Modify: `packages/Server/src/http/__tests__/request-identity.spec.ts`
- Modify: `packages/Server/src/http/__tests__/RequestIdentityMiddleware.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `RequestIdentity` gains `origin?: string`; `ipHash` becomes optional (`ipHash?: string`). `currentRequestIdentity()?.origin` is how Tasks 4 read the header.

**Why here.** A type-graphql resolver's `AppContext` is `{dataSource, userPayload, queryRunner, dataSources, providers}` — there is no `req`, so there is no header to read at the point the decision is made. `request-identity.ts`'s own header comment explains why `AsyncLocalStorage` established in pre-auth middleware is the seam, and the store already carries exactly one such server-derived fact. The `Origin` header is a second one. Do not add a second ALS store, and do not fork `@memberjunction/server`.

**The one trap.** `requestIdentityHandler` currently calls `next()` *without* entering the store when it cannot resolve a peer IP. After this change the store must be entered whenever there is anything to carry, or a request with an `Origin` but no resolvable socket address would reach the resolver with no origin and be silently admitted by an allowlist it should have been checked against.

- [ ] **Step 1: Write the failing tests**

Append to `packages/Server/src/http/__tests__/RequestIdentityMiddleware.spec.ts` (match the existing file's imports and helper style — read it first):

```ts
  it('carries the request Origin to the resolver, alongside the IP hash', () => {
    const handler = requestIdentityHandler(0);
    let seen: RequestIdentity | undefined;
    handler(
      requestWith({ origin: 'https://careers.acme.com' }, '203.0.113.7'),
      {} as Response,
      () => { seen = currentRequestIdentity(); },
    );
    expect(seen?.origin).toBe('https://careers.acme.com');
    expect(seen?.ipHash).toEqual(expect.any(String));
  });

  it('still establishes the store when the peer address is gone but an Origin was sent', () => {
    const handler = requestIdentityHandler(0);
    let seen: RequestIdentity | undefined;
    handler(
      requestWith({ origin: 'https://careers.acme.com' }, undefined),
      {} as Response,
      () => { seen = currentRequestIdentity(); },
    );
    expect(seen?.origin).toBe('https://careers.acme.com');
    expect(seen?.ipHash).toBeUndefined();
  });

  it('leaves origin undefined when the caller sent no Origin header', () => {
    const handler = requestIdentityHandler(0);
    let seen: RequestIdentity | undefined;
    handler(requestWith({}, '203.0.113.7'), {} as Response, () => { seen = currentRequestIdentity(); });
    expect(seen?.origin).toBeUndefined();
  });
```

Write `requestWith(headers, socketIp)` as a local helper if the file does not already have an equivalent; it returns `{ headers, socket: socketIp ? { remoteAddress: socketIp } : undefined } as unknown as Request`.

- [ ] **Step 2: Run them and watch them fail**

```bash
cd packages/Server && pnpm vitest run src/http/__tests__/RequestIdentityMiddleware.spec.ts
```

Expected: the first two fail — `seen?.origin` is `undefined`, and the second sees no store at all.

- [ ] **Step 3: Widen the identity**

In `request-identity.ts`, change the interface and document both fields:

```ts
/** What the public routes know about a caller, independent of anything the caller told us. */
export interface RequestIdentity {
  /**
   * Salted one-way hash of the resolved client IP (IPv6 reduced to its /64). Absent when the peer
   * address is gone — the abuse ceilings drop rather than re-key onto something weaker.
   */
  ipHash?: string;
  /**
   * The caller's `Origin` header, VERBATIM and unnormalised.
   *
   * The caller DID choose this, unlike `ipHash` beside it — so it is not something to key an abuse
   * ceiling on, and nothing here treats it as identity. It is checked against a list the AUTHOR
   * wrote, which is what makes a value the caller controls useful: a browser will not let a page
   * lie about its own origin, and a non-browser client that forges one is refused by every other
   * gate it still has to pass.
   *
   * Normalisation is deliberately left to `normalizeOrigin` at the point of comparison, so this
   * field and the header are the same string when it reaches a log line.
   */
  origin?: string;
}
```

In `requestIdentityHandler`, always enter the store, carrying whichever facts exist:

```ts
export function requestIdentityHandler(hops: number = trustedProxyHops()): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = resolveClientIp(req, hops);
    const rawOrigin = req.headers['origin'];
    const origin = typeof rawOrigin === 'string' && rawOrigin.trim().length > 0 ? rawOrigin.trim() : undefined;
    // Entered UNCONDITIONALLY now. It used to be skipped when no peer address resolved, which was
    // harmless while `ipHash` was the only passenger — a missing hash and a missing store both read
    // as "no ceiling". It is not harmless for `origin`: a request whose socket had already gone
    // would reach the resolver with no origin and be admitted by an allowlist it was never checked
    // against. A store carrying two optional fields cannot make that mistake.
    runWithRequestIdentity({ ipHash: ip ? hashClientIp(ip) : undefined, origin }, next);
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
cd packages/Server && pnpm vitest run src/http/
```

Expected: the three new tests pass and every pre-existing `request-identity` / `RequestIdentityMiddleware` test still passes. If a pre-existing test asserted that no store exists without a peer IP, update it — the behaviour change is deliberate and the comment above is its justification. Do not weaken the new tests to keep an old one.

- [ ] **Step 5: Typecheck the package**

```bash
cd packages/Server && pnpm run build
```

Expected: clean. `ipHash` becoming optional must not break any consumer — every call site already reads it as `currentRequestIdentity()?.ipHash`, which was already `string | undefined`.

---

### Task 3: The embed-origin gate

**Files:**
- Create: `packages/Server/src/http/embed-origin.ts`
- Create: `packages/Server/src/http/__tests__/embed-origin.spec.ts`

**Interfaces:**
- Consumes: `parseAllowedOrigins`, `isOriginAdmitted`, `EmbedOriginPolicy` from Task 1.
- Produces:
  - `apiOwnOrigin(): string | undefined`
  - `resetEmbedOriginConfigForTests(): void`
  - `FOREIGN_ORIGIN_MESSAGE: string`
  - `interface EmbedOriginVerdict { allowed: boolean; policy: EmbedOriginPolicy; reason?: string }`
  - `checkEmbedOrigin(allowedOriginsColumn: string | null | undefined, requestOrigin: string | null | undefined): EmbedOriginVerdict`

**Why the gate is not just `isOriginAdmitted`.** A legitimate embed's API calls report **our own origin**, not the customer's (see Background §2). So the server-side verdict is "the distribution's policy, OR the API's own origin" — and that second half is a server fact the pure contract must not know about. This module is the seam where the two meet, and it is the only place that reads `MJAPI_PUBLIC_URL`.

- [ ] **Step 1: Write the failing test**

Create `packages/Server/src/http/__tests__/embed-origin.spec.ts`:

```ts
/**
 * The verdict that composes a distribution's authored policy with the API's OWN origin (#203).
 *
 * The own-origin half is the whole reason this module exists rather than the pure contract being
 * called directly: a browser inside a legitimate `<iframe>` embed reports the API's origin, never
 * the customer's, so a gate that only consulted the author's list would refuse every real embed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({ LogError: () => undefined, LogStatus: () => undefined }));

import { apiOwnOrigin, checkEmbedOrigin, resetEmbedOriginConfigForTests } from '../embed-origin';

const LIST = '["https://careers.acme.com"]';

beforeEach(() => {
  process.env.MJAPI_PUBLIC_URL = 'https://forms.ourhost.test';
  resetEmbedOriginConfigForTests();
});

afterEach(() => {
  delete process.env.MJAPI_PUBLIC_URL;
  resetEmbedOriginConfigForTests();
});

describe('apiOwnOrigin', () => {
  it('reduces MJAPI_PUBLIC_URL to a bare origin', () => {
    process.env.MJAPI_PUBLIC_URL = 'https://forms.ourhost.test/some/base/';
    resetEmbedOriginConfigForTests();
    expect(apiOwnOrigin()).toBe('https://forms.ourhost.test');
  });

  it('is undefined when the variable is unusable, rather than guessing', () => {
    process.env.MJAPI_PUBLIC_URL = 'not a url';
    resetEmbedOriginConfigForTests();
    expect(apiOwnOrigin()).toBeUndefined();
  });
});

describe('checkEmbedOrigin', () => {
  it('admits everything when the distribution authored nothing', () => {
    expect(checkEmbedOrigin(null, 'https://anywhere.example').allowed).toBe(true);
    expect(checkEmbedOrigin(null, undefined).allowed).toBe(true);
  });

  it('admits a declared origin', () => {
    expect(checkEmbedOrigin(LIST, 'https://careers.acme.com').allowed).toBe(true);
  });

  it('admits our OWN origin, which is what a real iframe embed reports', () => {
    expect(checkEmbedOrigin(LIST, 'https://forms.ourhost.test').allowed).toBe(true);
  });

  it('refuses an origin that is neither ours nor declared', () => {
    const verdict = checkEmbedOrigin(LIST, 'https://evil.example');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('https://evil.example');
  });

  it('refuses a caller that sent no Origin at all once a list exists', () => {
    expect(checkEmbedOrigin(LIST, undefined).allowed).toBe(false);
  });

  it('refuses everything, including our own origin, when the authored value is unusable', () => {
    expect(checkEmbedOrigin('["*.acme.com"]', 'https://forms.ourhost.test').allowed).toBe(false);
  });

  it('does not admit our own origin when MJAPI_PUBLIC_URL is unset — the fallback is refusal', () => {
    delete process.env.MJAPI_PUBLIC_URL;
    resetEmbedOriginConfigForTests();
    expect(checkEmbedOrigin(LIST, 'https://forms.ourhost.test').allowed).toBe(false);
    expect(checkEmbedOrigin(LIST, 'https://careers.acme.com').allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/Server && pnpm vitest run src/http/__tests__/embed-origin.spec.ts
```

Expected: `Failed to resolve import "../embed-origin"`.

- [ ] **Step 3: Write the module**

Create `packages/Server/src/http/embed-origin.ts`. Give it a file-level comment covering: the measured iframe fact and why the own-origin half exists; that `MJAPI_PUBLIC_URL` unset means own-origin cannot be recognised and the gate then relies on the author's list alone (fail-closed, loud at boot, never fail-open); and that the refusal sentence is deliberately identical for every reason so a prober learns nothing from it.

```ts
import { LogError, LogStatus } from '@memberjunction/core';
import {
  ALLOWED_ORIGIN_GRAMMAR,
  isOriginAdmitted,
  normalizeOrigin,
  parseAllowedOrigins,
  type EmbedOriginPolicy,
} from '@mj-biz-apps/forms-entities';

/**
 * What a refused caller is told — one sentence for every reason.
 *
 * A prober must not be able to tell "this link has an allowlist and you are not on it" from
 * "this link has an allowlist that does not parse", and a real respondent on a mis-embedded page
 * needs a sentence they can forward to whoever owns the page. The operator gets the specifics in
 * the log; the browser gets this.
 */
export const FOREIGN_ORIGIN_MESSAGE =
  'This form cannot be opened from this website. If you reached it from a link someone shared, open the link directly.';

export interface EmbedOriginVerdict {
  allowed: boolean;
  policy: EmbedOriginPolicy;
  /** Operator-facing detail. Present only on a refusal, and never shown to a respondent. */
  reason?: string;
}

let ownOrigin: { value: string | undefined } | undefined;

export function apiOwnOrigin(): string | undefined {
  if (ownOrigin) {
    return ownOrigin.value;
  }
  ownOrigin = { value: resolveOwnOrigin() };
  return ownOrigin.value;
}

export function checkEmbedOrigin(
  allowedOriginsColumn: string | null | undefined,
  requestOrigin: string | null | undefined,
): EmbedOriginVerdict {
  const policy = parseAllowedOrigins(allowedOriginsColumn);
  if (policy.kind === 'unrestricted') {
    return { allowed: true, policy };
  }
  if (policy.kind === 'closed') {
    return { allowed: false, policy, reason: policy.reason };
  }
  if (isOriginAdmitted(requestOrigin, policy)) {
    return { allowed: true, policy };
  }
  const own = apiOwnOrigin();
  if (own !== undefined && typeof requestOrigin === 'string' && normalizeOrigin(requestOrigin) === own) {
    return { allowed: true, policy };
  }
  return {
    allowed: false,
    policy,
    reason:
      `Origin ${requestOrigin ?? '(absent)'} is not this API's own origin (${own ?? 'UNKNOWN — MJAPI_PUBLIC_URL is not set'}) `
      + `and is not one of the ${policy.origins.length} the distribution allows (${policy.origins.join(', ')}). `
      + `Each allowed entry is ${ALLOWED_ORIGIN_GRAMMAR}`,
  };
}

/** Test-only: clear the memoized own-origin so an env change takes effect. */
export function resetEmbedOriginConfigForTests(): void {
  ownOrigin = undefined;
}

function resolveOwnOrigin(): string | undefined {
  const raw = process.env.MJAPI_PUBLIC_URL?.trim();
  if (!raw) {
    LogStatus(
      '[Forms] MJAPI_PUBLIC_URL is not set, so this API cannot recognise its own browser origin. '
        + 'Any distribution that authors AllowedOrigins must then list the origin its own host page '
        + 'is served from, or its embedded widget will be refused. Set MJAPI_PUBLIC_URL.',
    );
    return undefined;
  }
  const normalized = normalizeOrigin(raw);
  if (normalized === null) {
    LogError(
      `[Forms] MJAPI_PUBLIC_URL is not a usable origin ("${raw}"), so this API cannot recognise its own. `
        + `Expected ${ALLOWED_ORIGIN_GRAMMAR}`,
    );
    return undefined;
  }
  return normalized;
}
```

Note `normalizeOrigin('https://host/some/base/')` returns `null` (it has a path), so `resolveOwnOrigin` must reduce the URL to its origin **before** normalising. Use `new URL(raw).origin` inside a `try`, then normalise that, and keep the `LogError` for a value that is not a URL at all. Make the first spec case (`.../some/base/` → `https://forms.ourhost.test`) pass honestly.

- [ ] **Step 4: Run the tests**

```bash
cd packages/Server && pnpm vitest run src/http/__tests__/embed-origin.spec.ts
```

Expected: all pass.

- [ ] **Step 5: Build**

```bash
cd packages/Server && pnpm run build
```

---

### Task 4: Enforce on the public GraphQL API

**Files:**
- Modify: `packages/Server/src/public-submit/submit-pipeline.ts`
- Modify: `packages/Server/src/public-submit/PublicFormResolver.ts`
- Create: `packages/Server/src/public-submit/__tests__/embed-origin-gate.spec.ts`

**Interfaces:**
- Consumes: `checkEmbedOrigin`, `FOREIGN_ORIGIN_MESSAGE` (Task 3); `currentRequestIdentity()` (Task 2).
- Produces: `PipelineContext` gains `requestOrigin?: string`.

**Where the gate goes, and why exactly there.** In `runSubmitPipelineInner`, immediately **after** step 2 (`resolvePublishedDefinition`, which is what produces `resolved.distribution`) and **before** step 3 (rate-limit). Two reasons, and put both in the code comment:

1. It cannot run earlier — the policy lives on the distribution row, and the slug is what finds it.
2. It must run before the rate limiter, because the pipeline's existing rule is that a request one gate refuses does not eat the respondent's budget in another (`charge` consults every bucket before spending any). A foreign-origin caller is refused on a fact about the *link*, not about them, so charging them for it would let a mis-embedded page burn a real respondent's window.

- [ ] **Step 1: Write the failing test**

Create `packages/Server/src/public-submit/__tests__/embed-origin-gate.spec.ts`. Read `packages/Server/src/public-submit/__tests__/fakes.ts` first and reuse its fakes and its pipeline-context builder rather than inventing new ones — every other pipeline spec in that directory does, and a second set would drift. The test must cover:

```ts
/**
 * The submit pipeline refuses a caller whose Origin the distribution did not authorise (#203).
 *
 * Issue #203's second acceptance criterion, at the gate that actually writes rows. Verified by
 * reproduction on 2026-09-12 that `Origin: https://evil.example` previously returned
 * `success: true` and persisted a FormResponse.
 */
```

- an unrestricted distribution (`AllowedOrigins: null`) still accepts a submit from any origin, and from none — this is the regression guard for every live link;
- a distribution with `["https://careers.acme.com"]` accepts a submit carrying that origin;
- the same distribution accepts a submit carrying the API's own origin (`MJAPI_PUBLIC_URL`), because that is what a real iframe embed sends;
- the same distribution **refuses** `https://evil.example`, the result carries `FOREIGN_ORIGIN_MESSAGE`, and **no** response row is written (assert on the fake persistence, not just on the returned shape — the bug being fixed is a write);
- the same distribution refuses a submit with no `Origin` at all;
- a distribution whose column is `["*.acme.com"]` refuses everything, including the API's own origin;
- the refusal happens **before** the rate limiter charges anything — assert the rate-limit fake recorded no charge.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/Server && pnpm vitest run src/public-submit/__tests__/embed-origin-gate.spec.ts
```

Expected: the refusal cases fail with `success: true` — the same result the live reproduction produced.

- [ ] **Step 3: Add the field to the pipeline context**

In `submit-pipeline.ts`, add to `PipelineContext`, documented in the style of its neighbours:

```ts
  /**
   * The caller's `Origin` header, from `RequestIdentityMiddleware` via `currentRequestIdentity()`.
   *
   * UNLIKE `clientIpHash` beside it this IS caller-chosen, so nothing keys an abuse ceiling on it.
   * It is checked against a list the form's AUTHOR wrote, which is the only thing that makes a
   * caller-supplied value load-bearing: a browser will not let a page lie about its own origin.
   *
   * Absent in unit tests and for any non-browser client. Absent is a REFUSAL once a distribution
   * has authored a list, and admission when it has not — see `checkEmbedOrigin`.
   */
  requestOrigin?: string;
```

- [ ] **Step 4: Add the gate**

Between the `timer.mark('resolve-form')` line and the rate-limit block:

```ts
  // 2a. Embed origin. The distribution names who may embed it; this refuses everyone else.
  //
  //     BEFORE the rate limiter on purpose: this gate's verdict is a fact about the LINK, not
  //     about the caller, and the pipeline's rule is that a request one gate refuses does not eat
  //     the respondent's budget in another. A mis-embedded page would otherwise burn a real
  //     respondent's window on refusals they cannot influence.
  //
  //     It cannot run any earlier: the policy is a column on the distribution, and step 2 is what
  //     finds the row. Both of the doors this gate guards are named in #203 — the one that WRITES
  //     is here; the one that FRAMES is `Content-Security-Policy` on the respondent host page,
  //     which is the only control that can see a customer's origin at all.
  const embedOrigin = checkEmbedOrigin(resolved.distribution.AllowedOrigins, ctx.requestOrigin);
  if (!embedOrigin.allowed) {
    // The operator gets the specifics; the caller gets one sentence for every reason.
    LogError(
      `[Forms] submit refused for ${submission.distributionSlug}: ${embedOrigin.reason ?? 'origin not allowed'}`,
    );
    return report(fail(FOREIGN_ORIGIN_MESSAGE));
  }

  timer.mark('embed-origin');
```

Add the imports: `checkEmbedOrigin` and `FOREIGN_ORIGIN_MESSAGE` from `../http/embed-origin`.

- [ ] **Step 5: Thread it in from the resolver, and gate the read**

In `PublicFormResolver.ts`:

- in `submitResponse`, add `requestOrigin: currentRequestIdentity()?.origin,` to the `runSubmitPipeline` context object, beside `clientIpHash`;
- in `PublishedForm`, after `resolvePublishedDefinition` succeeds and before the resume snapshot read, add the same gate. `null` is already this field's answer for "no form to show", so a refusal is indistinguishable from a closed link to the caller and fully described in the log — which is exactly the posture `respondentSafe` already establishes for this query:

```ts
      // The same gate the submit runs, at the read. A widget that may not submit must not be able
      // to render either — otherwise a foreign page shows a working-looking form that fails only
      // at the end, which is a worse experience than a refusal and leaks the definition besides.
      const embedOrigin = checkEmbedOrigin(distribution.AllowedOrigins, currentRequestIdentity()?.origin);
      if (!embedOrigin.allowed) {
        LogError(
          `[Forms] PublishedForm refused for ${distributionSlug}: ${embedOrigin.reason ?? 'origin not allowed'}`,
        );
        return null;
      }
```

`LogError` must be imported from `@memberjunction/core` in that file if it is not already.

- [ ] **Step 6: Run the tests**

```bash
cd packages/Server && pnpm vitest run src/public-submit/
```

Expected: the new spec passes and every other `public-submit` spec is still green. Pay attention to any spec that builds a `PipelineContext` — none should need changing, because `requestOrigin` is optional and absent means unrestricted for a distribution that authored nothing.

- [ ] **Step 7: Build**

```bash
cd packages/Server && pnpm run build && pnpm test
```

---

### Task 5: Enforce framing on the respondent host page

**Files:**
- Modify: `packages/Server/src/respondent-host/RespondentHostMiddleware.ts`
- Modify: `packages/Server/src/respondent-host/__tests__/RespondentHostMiddleware.spec.ts`

**Interfaces:**
- Consumes: `parseAllowedOrigins`, `frameAncestorsDirective` (Task 1).
- Produces: nothing other tasks read.

**Why this is the real embed control.** `frame-ancestors` is the only mechanism in the stack that can see the customer's origin, because the browser evaluates it against the framing ancestor. Everything else in this PR sees our own origin (Background §2). Emit it from `handleRequest`, where `outcome.distribution` is already in hand — no extra read.

- [ ] **Step 1: Write the failing test**

Append to `packages/Server/src/respondent-host/__tests__/RespondentHostMiddleware.spec.ts`, using the file's existing real-express-app harness and its `DISTRIBUTION` fixture and `redeemOutcome` hook:

```ts
  it('sends no framing header when the link authored no origins, so existing embeds are untouched', async () => {
    redeemOutcome = { ok: true, token: 'jwt', distribution: { ...DISTRIBUTION, AllowedOrigins: null } };
    const res = await get('/f/demo');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBeNull();
  });

  it('names self plus the authored origins when the link declares them', async () => {
    redeemOutcome = {
      ok: true,
      token: 'jwt',
      distribution: { ...DISTRIBUTION, AllowedOrigins: '["https://careers.acme.com"]' },
    };
    const res = await get('/f/demo');
    expect(res.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'self' https://careers.acme.com",
    );
  });

  it('refuses all framing when the authored value is unusable, rather than falling open', async () => {
    redeemOutcome = {
      ok: true,
      token: 'jwt',
      distribution: { ...DISTRIBUTION, AllowedOrigins: '["*.acme.com"]' },
    };
    const res = await get('/f/demo');
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
  });

  it('never sends X-Frame-Options, which cannot express a list', async () => {
    redeemOutcome = {
      ok: true,
      token: 'jwt',
      distribution: { ...DISTRIBUTION, AllowedOrigins: '["https://careers.acme.com"]' },
    };
    const res = await get('/f/demo');
    expect(res.headers.get('x-frame-options')).toBeNull();
  });
```

Reuse whatever request helper the file already has instead of writing `get` if one exists; if it does not, add one alongside the existing server bootstrap.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/Server && pnpm vitest run src/respondent-host/__tests__/RespondentHostMiddleware.spec.ts
```

Expected: the two "names self" / "refuses all framing" cases fail with `null`.

- [ ] **Step 3: Emit the header**

In `handleRequest`, where the successful response is built:

```ts
    // The embed control that can actually SEE the customer's origin. A `<iframe>` embed is what
    // this product's embed snippet builds (`distribution.service.ts` embedSnippet), and the
    // framed document's own origin is OURS — so nothing on the API side can tell a legitimate
    // embed on customer A's site from one on anybody else's. `frame-ancestors` is evaluated by
    // the browser against the framing ANCESTOR, which is exactly the fact the author authorised.
    //
    // Deliberately no `X-Frame-Options` beside it: it cannot express a list (`ALLOW-FROM` is
    // unsupported in every current browser), and `SAMEORIGIN` would refuse the very embeds this
    // feature exists to permit. A browser old enough to lack `frame-ancestors` therefore gets no
    // framing control at all, which is today's behaviour and is stated rather than papered over.
    const frameAncestors = frameAncestorsDirective(parseAllowedOrigins(outcome.distribution.AllowedOrigins));
    if (frameAncestors) {
      res.set('Content-Security-Policy', frameAncestors);
    }
```

It must be set on the same response chain that already sets `Cache-Control: no-store`, before `.send(html)`.

- [ ] **Step 4: Run the tests**

```bash
cd packages/Server && pnpm vitest run src/respondent-host/
```

- [ ] **Step 5: Build and run the whole package suite**

```bash
cd packages/Server && pnpm run build && pnpm test
```

---

### Task 6: Author the allowlist in the builder

**Files:**
- Modify: `packages/Angular/src/lib/builder/distribution.service.ts`
- Modify: `packages/Angular/src/lib/builder/distribution-manager.component.ts`
- Modify: `packages/Angular/src/lib/builder/distribution-manager.component.html`
- Modify: `packages/Angular/src/lib/builder/distribution-manager.component.css`
- Modify: `packages/Angular/src/lib/builder/distribution.service.behaviour.spec.ts`

**Interfaces:**
- Consumes: `authorAllowedOrigins`, `serializeAllowedOrigins`, `parseAllowedOrigins`, `ALLOWED_ORIGIN_GRAMMAR` (Task 1).
- Produces: `DistributionService.setAllowedOrigins(dist, authored): Promise<MutationOutcome | { rejected: string[] }>` — see the exact signature in Step 3.

**Why in the Embed view specifically.** This is the one screen where an author is already thinking about a third-party site — they are copying the `<iframe>` snippet to paste into it. `distribution-manager.component.html` renders that snippet in `@case ('embed')`. The allowlist belongs directly under it, phrased as "which sites may show this form", never as the column name.

An author also reaches the field through Explorer's generated `FormDistribution` form, which Task 0's CodeGen run already added — that path needs no work and is not a substitute for this one.

- [ ] **Step 1: Write the failing test**

Append to `packages/Angular/src/lib/builder/distribution.service.behaviour.spec.ts`, following its existing `fakeDistribution` / `asEntity` helpers:

```ts
describe('allowed origins', () => {
  it('writes the normalised JSON array', async () => {
    const d = fakeDistribution({ AllowedOrigins: null });
    const out = await new DistributionService().setAllowedOrigins(
      asEntity(d),
      'HTTPS://Careers.ACME.com\nhttps://acme.com:8443',
    );
    expect(out.rejected).toEqual([]);
    expect(d.writes).toEqual({
      AllowedOrigins: '["https://careers.acme.com","https://acme.com:8443"]',
    });
  });

  it('clears the column back to NULL when the author empties the box', async () => {
    const d = fakeDistribution({ AllowedOrigins: '["https://careers.acme.com"]' });
    await new DistributionService().setAllowedOrigins(asEntity(d), '   \n  ');
    expect(d.writes).toEqual({ AllowedOrigins: null });
  });

  it('refuses a wildcard and saves NOTHING, rather than silently dropping it', async () => {
    const d = fakeDistribution({ AllowedOrigins: null });
    const out = await new DistributionService().setAllowedOrigins(asEntity(d), '*.acme.com');
    expect(out.rejected).toEqual(['*.acme.com']);
    expect(out.ok).toBe(false);
    expect(d.writes).toEqual({});
  });

  it('refuses the whole edit when only SOME entries are bad, so nothing is half-applied', async () => {
    const d = fakeDistribution({ AllowedOrigins: null });
    const out = await new DistributionService().setAllowedOrigins(
      asEntity(d),
      'https://good.example\n*.acme.com',
    );
    expect(out.rejected).toEqual(['*.acme.com']);
    expect(d.writes).toEqual({});
  });
});
```

The last two cases are the point of the whole task: an author who writes `*.acme.com`, is told nothing, and believes they restricted something is worse off than one with no allowlist at all. That is the doctrine `bizapps-caliber`'s contract states and this PR inherits.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/Angular && pnpm vitest run src/lib/builder/distribution.service.behaviour.spec.ts
```

Expected: `setAllowedOrigins is not a function`.

- [ ] **Step 3: Add the service method**

In `distribution.service.ts`, beside `setCaptchaRequired`. Match that method's documentation depth — say what the switch costs, not just what it sets:

```ts
  /**
   * Replace the list of sites permitted to embed this link.
   *
   * Refuses the WHOLE edit when any entry fails the grammar, and saves nothing. Accepting the good
   * entries and dropping the bad one is the tempting behaviour and the wrong one: an author who
   * writes `*.acme.com`, sees the dialog close, and is told nothing believes they restricted
   * something. They did not, and they will not look again.
   *
   * An empty box clears the column to NULL, which means unrestricted — the state every link is in
   * until somebody sets one, and the state that keeps existing embeds working.
   *
   * Turning this on is fail-closed and has a real cost: once ANY origin is named, the respondent
   * host page is served with a `frame-ancestors` directive naming exactly those origins, and the
   * public API refuses a caller whose Origin is neither one of them nor this API's own. A link
   * pasted into a page nobody listed stops working, with no warning beforehand.
   */
  public async setAllowedOrigins(
    dist: mjBizAppsFormsFormDistributionEntity,
    authored: string,
  ): Promise<MutationOutcome & { rejected: string[] }> {
    const { origins, rejected } = authorAllowedOrigins(authored);
    if (rejected.length > 0) {
      return {
        ok: false,
        error: `Not a usable site address: ${rejected.join(', ')}. Each entry must be ${ALLOWED_ORIGIN_GRAMMAR}`,
        rejected,
      };
    }
    dist.AllowedOrigins = serializeAllowedOrigins(origins);
    return { ...(await this.saveDist(dist, 'change which sites may show this form')), rejected: [] };
  }
```

Check `MutationOutcome`'s actual shape in that file before writing this — use its real fields rather than the `{ ok, error }` guessed above, and keep the `rejected` intersection.

- [ ] **Step 4: Add the editor to the Embed view**

In `distribution-manager.component.html`, inside `@case ('embed')` and below the existing "Paste this into your own page's HTML" note:

```html
                <div class="dm-origins">
                  <label class="dm-origins-label" for="dm-origins-input">
                    Sites allowed to show this form
                  </label>
                  <textarea
                    id="dm-origins-input"
                    class="mjf-textarea dm-origins-input"
                    rows="3"
                    placeholder="https://careers.acme.com&#10;https://www.acme.com"
                    [value]="authoredOrigins(link)"
                    (change)="saveOrigins(link, $event)"
                  ></textarea>
                  @if (originsError) {
                    <p class="dm-origins-error" role="alert">{{ originsError }}</p>
                  }
                  <p class="dm-note">
                    One address per line. Leave this empty to let the form be shown on any site.
                    Once you list a site, the form only opens inside the sites you list here.
                  </p>
                </div>
```

Note `(change)` fires on blur in this codebase — that is the existing convention in this component and it is what the other editors here use, so keep it.

In `distribution-manager.component.ts`, add:

```ts
  /** The refusal from the last origins edit, cleared on the next successful one. */
  protected originsError: string | undefined;

  /** The authored list as one address per line — the shape the box shows. */
  protected authoredOrigins(link: mjBizAppsFormsFormDistributionEntity): string {
    const policy = parseAllowedOrigins(link.AllowedOrigins);
    return policy.kind === 'allowlist' ? policy.origins.join('\n') : (link.AllowedOrigins ?? '');
  }

  /**
   * Save an edited list.
   *
   * A CLOSED policy (authored, but nothing in it parses) deliberately shows the raw column above
   * rather than an empty box: the author has to see what they typed to fix it, and an empty box
   * would read as "no restriction" while the link was in fact refusing everyone.
   */
  protected async saveOrigins(link: mjBizAppsFormsFormDistributionEntity, event: Event): Promise<void> {
    const authored = (event.target as HTMLTextAreaElement).value;
    const outcome = await this.run(() => this.service.setAllowedOrigins(link, authored));
    this.originsError = outcome?.rejected?.length ? outcome.error : undefined;
  }
```

Adapt to this component's real `run(...)` helper and error-surfacing convention — read the neighbouring `toggleCaptcha` / `rename` handlers and match them exactly rather than introducing a second pattern.

In `distribution-manager.component.css`, style `.dm-origins`, `.dm-origins-label`, `.dm-origins-input` and `.dm-origins-error` using only existing `--mj-*` / `--mjf-*` tokens already used in that file. No hardcoded colours. The error text must use the file's existing error token, whatever it is named there.

- [ ] **Step 5: Run the tests and build**

```bash
cd packages/Angular && pnpm vitest run src/lib/builder/ && pnpm run build
```

Expected: green. Note that `pnpm test` in this package does **not** compile the builder component — `pnpm run build` is the gate that does. Do not report this task done on a green test run alone.

---

### Task 7: Changeset and documentation

**Files:**
- Create: `.changeset/a-link-can-name-the-sites-that-may-show-it.md`
- Modify: `plans/FORMS_BUILD_PLAN.md`

- [ ] **Step 1: Write the changeset**

`minor`, because this PR ships a migration. That is the whole rule — see `.claude/rules/changesets.md`; do not reason about semver.

```markdown
---
'@mj-biz-apps/forms-entities': minor
'@mj-biz-apps/forms-server': minor
'@mj-biz-apps/forms-ng': minor
---

A share link can name the sites that may show it

A distribution now carries an `AllowedOrigins` list. Leave it empty and nothing changes — every
existing link is embeddable anywhere, as before. Name a site and the link only opens there: the
respondent page is served with a `frame-ancestors` directive naming exactly those origins, and the
public form API refuses a caller whose `Origin` is neither one of them nor the API's own.

Requires the `V202609121200` migration and a CodeGen run on the host.
```

Check `.changeset/config.json` for which packages are in the fixed group and list exactly the ones this PR touches.

- [ ] **Step 2: Record the DG-5 half that is now settled**

`plans/FORMS_BUILD_PLAN.md:675-676` lists DG-5 as open: *"Widget hosting/distribution. CDN host for the Angular element; versioning & cache strategy; iframe vs. direct-element embed default"*. One half of it is now decided by what shipped. Update that entry — do not delete it — to record:

- the embed default **is** the iframe (`distribution.service.ts`'s `embedSnippet` has built one all along, and this PR's enforcement model is built on it);
- the consequence that made it a decision rather than a detail: inside an iframe the widget's API calls report the API's own origin, so `frame-ancestors` is the only control that can constrain which customer sites may embed a link, and a direct-element embed would move that control to the `Origin` header instead;
- CDN hosting, versioning and cache strategy remain open.

Add a line to the plan's Progress Log in the format the surrounding entries use.

- [ ] **Step 3: Verify the whole repo**

```bash
pnpm run build && pnpm test
npm run lint:generated && npm run lint:distribution
```

Expected: all green. `lint:distribution` matters here because this PR ships SQL — it checks that only `${flyway:defaultSchema}` and `${mjSchema}` appear in it.

- [ ] **Step 4: Report, do not commit**

Summarise: every file touched, every test added and its result, and anything you could not verify. The coordinator commits and opens the PR.

---

## Out of scope, deliberately — say so if asked

**The `SameSite=Lax` resume cookie.** Issue #203 notes it as "a related consequence [that] is unaddressed": `resume-cookie.ts` sets `SameSite=Lax`, so the same-device resume pointer does not travel inside a cross-site embed. It is genuinely broken and it is genuinely related — but it is not inside this change's blast radius. This PR does not make it worse (a CSP header has no effect on cookie attributes), it is not named in any of the issue's three acceptance criteria, and the fix is a different feature's: `SameSite=None; Secure; Partitioned` can only be exercised over HTTPS, which this environment cannot provide, and it removes the `Lax` property that `resume-cookie.ts` currently names as what makes the resume route CSRF-safe without a token of its own. Shipping an unverifiable browser-behaviour change inside a security PR is the wrong trade. File it as a follow-up and cite this paragraph.

**Per-distribution control of the widget bundle route.** `/forms/widget/mj-form.js` is one static asset shared by every distribution, so there is no distribution in the request to look a policy up on — and a `<script src>` sends no `Origin` header at all, which was confirmed in the same browser probe (`"origin":"(none)"`). A per-link control is therefore not merely unimplemented there, it is unrepresentable. Nothing is lost: the bundle is the public, source-available widget, identical for every form, and it carries no per-link data. Say this in the PR rather than leaving the issue's third bullet looking unanswered.
