# `/f/:slug` and the asset GET behind MJ's compression — design of record

**Issue:** [MemberJunction/bizapps-forms#181](https://github.com/MemberJunction/bizapps-forms/issues/181)
**Precedent:** [#121](https://github.com/MemberJunction/bizapps-forms/issues/121) / PR #130, which fixed the identical defect for the widget bundle and scoped these two routes out on purpose.
**Reproduced:** 2026-09-12, against `origin/next` @ `7db7d8c` and against the live MJ host on `:4000`.
**Decisions locked in this document:** everything below is settled. An executor does not need GitHub.

---

## 1. The defect, reproduced

`RespondentHostMiddleware` and `AssetMiddleware` register their public GET routes through
`BaseServerMiddleware.ConfigureExpressApp`. MJServer calls that hook at
`MJ/packages/MJServer/src/index.ts:824`, inside the loop that is still *collecting* middleware
contributions, and does not mount its own `compression()` until `index.ts:1129`. Express dispatches
layers in registration order, so these routes finish their responses before `compression` ever wraps
`res.write`. They are served uncompressed however much the client offers.

**Live host, `:4000` (serving `next`), 2026-09-12:**

```
GET /f/all-types-smoke      Accept-Encoding: gzip, br
  → HTTP/1.1 200 OK
  → Content-Length: 9262
  → (no Content-Encoding, no Vary)
gzip -9 of the same body → 4363 bytes  (47%)

GET /forms/widget/mj-form.js   Accept-Encoding: gzip, br     ← the route #130 already moved
  → HTTP/1.1 200 OK
  → Vary: Accept-Encoding
  → Content-Encoding: br
```

One route compressed, the other not, on the same server, in the same second, differing only in
which hook registered them. The page has grown since the issue was filed (5,658 → 9,262 bytes), so
the waste is now **~4.9 KB on every open of every shared form link**, not the ~2.7 KB the issue
measured.

**In-process control** (the scratch repro kept at
`/tmp/…/scratchpad/issue-181/repro-181.spec.ts.reference`): mount `RespondentHostMiddleware` in
`serve()`'s order — `ConfigureExpressApp` → `compression({threshold: 1024, level: 6})` → pre-auth →
a trailing 401 — and request `/f/:slug` alongside an 8,041-byte body served from a handler in the
*pre-auth* slot of the same app:

```
[control] status=200 bytes=8041 content-encoding=gzip vary=Accept-Encoding   ← pre-auth slot
[repro]   status=200 bytes=8051 content-encoding=null vary=null              ← ConfigureExpressApp slot
```

Same server, same client, same size, same content type. **The registration slot is the whole
variable.** That is the root cause; nothing about the payload, the headers, or the negotiation is
involved.

## 2. Design decision 1 — move the routes, do not mount our own `compression()`

Two ways to put these responses behind a compressor:

**A. Move the routes to `GetPreAuthMiddleware()`.** The base class documents that slot as running
*"after compression but before OAuth/REST/GraphQL routes"*. One-line change in posture; the
compressor, its threshold, its level and its filter stay MJ's.

**B. Have Forms mount its own `compression()` inside `ConfigureExpressApp`, ahead of its own
routes.** Also works, and keeps the routes as Express layers with their `:param` matching intact —
which is the real cost of A (see §4).

**A is chosen.** B duplicates a decision — threshold 1024, level 6, the binary-type filter — into a
second place that no test keeps in step with MJ's, so the day MJ retunes its compressor Forms
silently does not follow. It also leaves the *other* half of the registration-order trap in place:
a route in that slot still never sees any pre-auth handler, which is precisely why
`requestIdentityHandler()` has to be mounted by hand today. A is the change #130 already made and
proved, and this issue exists to finish it rather than to invent a second answer.

## 3. Design decision 2 — what moves, and what deliberately does not

| Route | Hook today | After | Why |
|---|---|---|---|
| `GET /f/:slug` | `ConfigureExpressApp` | `GetPreAuthMiddleware` | The defect. 9.2 KB of `text/html`, well over the 1 KB threshold. |
| `GET /favicon.ico` | `ConfigureExpressApp` | `GetPreAuthMiddleware` | Travels with the page (disabling the page must still disable it). Its body is a 204 with nothing in it, so compression is irrelevant — it moves so the middleware has **one** registration slot rather than two, and its matching is the exact-path rule already proved by #130. |
| `GET /forms/asset/:fileId` | `ConfigureExpressApp` | `GetPreAuthMiddleware` | Same defect, honest accounting in §5. |
| `POST /f/:slug/resume` | `ConfigureExpressApp` | **stays**, but gains an identity handler (§3.1) | Stays for ONE reason, not two. Its refusal bodies are tiny (23 bytes), but its success body is `{ token }` carrying core's RS256 magic-link session JWT — measured at 1,238 chars, so ~1.25 KB, **over** the 1,024-byte threshold; compressing it would save ~320 bytes on every returning-respondent load. The surviving reason is that moving it forces a case-sensitivity decision on `matchResumeRoute` (§4.3), which claims the post-auth `/remember` and `/forget` too, so the decision is not local to this route. That belongs to its own change. |
| `POST /f/:slug/{remember,forget}` | `GetPostAuthMiddleware` | unchanged | Already post-auth, already behind compression, and identity is their gate. |
| `POST /forms/asset` | `GetPostAuthMiddleware` | unchanged | Same. |

Because `POST /f/:slug/resume` stays, `RespondentHostMiddleware.ConfigureExpressApp` **survives** —
smaller, carrying one route and the boot-time readiness report. That is deliberate: the hook is kept
on purpose rather than left behind.

### 3.1 A second defect of the same root cause, found while auditing the identity mounts

The issue directs us to check what happens to `requestIdentityHandler()` once a route leaves
`ConfigureExpressApp`. Checking that turned up the mirror-image bug in the route that is staying:
`POST /f/:slug/resume` is registered there **without** the handler, so `currentRequestIdentity()` is
always `undefined` inside it and `resumeDeps` takes its documented fallback,
`` callerKey = `slug:${slug}` ``.

That fallback is not a per-caller bucket. It is **one bucket for the whole form**, shared by every
respondent of that link, so a single caller can spend the entire resume budget and lock legitimate
respondents out of their own drafts — `runResume` refuses with 429 at
`deps.allowRequest(\`resume:${deps.callerKey}\`)`. Its two siblings are unaffected: `/remember` and
`/forget` are post-auth, so they see the global handler and already key per peer.

The fix is the same one argument the page route already carries, so it ships here rather than as a
follow-up issue — it is the same root cause, in the same method, found by the audit this issue asked
for. It is a separate commit so it can be reverted on its own.

## 4. Design decision 3 — reproducing what `app.get` claimed

A handler contributed to `GetPreAuthMiddleware` is mounted with `app.use(handler)`. It gets no
route pattern, so **`req.params` is empty** and the handler must read the path itself. `app.get`
compiled its path through path-to-regexp under the app's `case sensitive routing` and `strict
routing` settings — both **off** by default — so the move must not quietly narrow what the route
answers. This is the parity trap #130 hit and fixed for an equality match; `:slug` needs more.

### 4.1 The verified table

Probed against a real Express 5.2.1 app in this worktree (`scratchpad/issue-181/route-parity-table.txt`):

| Request | Today | Note |
|---|---|---|
| `GET /f/abc` | 200, slug `abc` | |
| `GET /f/abc/` | 200, slug `abc` | exactly one trailing slash is tolerated |
| `GET /f/abc//` | no match | two are not |
| `GET /F/ABC` | 200, slug `ABC` | literal is case-**insensitive**; the slug keeps its own case |
| `GET /f/` · `GET /f` · `GET /f//` | no match | the slug is one **non-empty** segment |
| `GET /f/a/b` | no match | exactly one segment |
| `GET /f/a%20b` | 200, slug `a b` | the param is percent-**decoded** |
| `GET /f/a%2Fb` | 200, slug `a/b` | decoded after the segment split, so an encoded slash is not a separator |
| `GET /f/a+b` | 200, slug `a+b` | `+` is not a space in a path |
| `GET /f/abc?x=1` | 200, slug `abc` | the query is not part of `req.path` |
| `HEAD /f/abc` | 200, no body | `app.get` answers HEAD too |
| `POST /f/abc` · `OPTIONS /f/abc` | no match | falls through |
| `GET /favicon.ico` · `/FAVICON.ICO` · `/favicon.ico/` | 204 | |
| `GET /forms/asset/xyz` · `/forms/asset/xyz/` · `/FORMS/ASSET/xyz` | 200 | |
| `GET /forms/asset` · `/forms/asset/` · `/forms/asset/a/b` | no match | |

Two entries of the probe are **client-side** artefacts, not Express semantics, and must not be
written into a test that uses `fetch`: undici normalises dot segments, so `/f/.`, `/f/..` and
`/f/%2e%2e` never reach the server as written. Use `node:http` if a test ever needs them — the
widget spec already does exactly that for its conditional GET, and for the same class of reason.

### 4.2 The one deliberate divergence

`GET /f/%zz` answers **400** today: path-to-regexp's `decodeParam` throws `URIError` and Express's
final handler turns it into a 400. A matcher that cannot decode the segment has no slug to hand on,
and will report **no match**, so that request will fall through and get MJAPI's 401 instead.

This is accepted, documented and pinned by a test rather than discovered later, because:
- `resume-routes.ts:64` (`decodeSegment`) already made exactly this choice for the sibling routes,
  so the repo has one rule for a malformed escape rather than two;
- a malformed percent-escape is not a slug any `FormDistribution` could hold, so no real link
  reaches it; and
- 400 → 401 on a URL nothing generates is a smaller cost than a second decoding rule.

### 4.3 Why `matchResumeRoute` is not reused or widened

`matchResumeRoute` is case-**sensitive** on its literals (`segments[1] !== 'f'`, `ACTIONS[segments[3]]`),
so `POST /F/abc/remember` does not match it today while `POST /F/abc/resume` — an Express layer —
does. That inconsistency is real and pre-exists this change. It is **left alone**: widening it would
change what the post-auth `/remember` and `/forget` routes claim, which is a behaviour change with
nothing to do with compression. `/resume` staying in `ConfigureExpressApp` (§3) is what makes
leaving it alone possible.

### 4.4 The shared matcher

Three middlewares now need Express-parity path matching: the widget bundle (exact), the respondent
host (exact for the favicon, one-segment for `/f/`), and the asset read (one-segment). Today one of
them owns a private copy. The rule — *one optional trailing slash, case-insensitive literal, no
percent-decoding of the literal* — is Express trivia that belongs in one place:

`packages/Server/src/http/route-match.ts`

```ts
/** Does `requestPath` name `route`, on the terms `app.get(route, …)` used? */
export function matchesExactRoute(requestPath: string, route: string): boolean;

/** The single decoded segment under `prefix`, or undefined when this is not that route. */
export function matchSingleSegmentRoute(requestPath: string, prefix: string): string | undefined;
```

`WidgetBundleMiddleware`'s private `matchesRoute` is deleted in favour of the first, as a
behaviour-preserving refactor in its own commit, with its existing 14-case route suite as the safety
net. Its long comment travels with it — it is the reason the function is not a general normaliser.

## 5. The asset half, accounted honestly

The issue calls this "a weaker case that needs judgement". Measured rather than argued:

| Content type | `mime-db` `compressible` | Compressed after the move? |
|---|---|---|
| `image/png` | `false` | no |
| `image/jpeg` | `false` | no |
| `image/gif` | `false` | no |
| `image/webp` | *(absent)* | no |
| `image/svg+xml` | `true` | **yes** |
| `application/json` | `true` | only over 1,024 bytes — the route's error bodies are far under |

`FORMS_ASSET_ALLOWED_TYPES` defaults to exactly the four incompressible types, so **on a default
host this move saves zero bytes today.** It is taken anyway, for two reasons that are not about
bytes: the defect is the slot rather than the payload, and an operator who adds `image/svg+xml` to
the allowlist — which `config.ts:52` explicitly contemplates — would otherwise silently inherit the
bug; and leaving one of the two named routes in the broken slot preserves the trap the issue exists
to remove.

A correction worth recording, because the issue repeats a claim the code does not support: MJ's
custom `filter` reads **`req.headers['content-type']`** — the *request's* type, which a GET does not
send — so its `image/`/`video/`/`audio/` skip never fires on these routes. What actually decides is
`compression.filter`, which reads the *response's* `Content-Type` and consults `mime-db`. The table
above is that decision, not MJ's filter.

## 6. Consequence accepted: the pre-auth chain is ordered, and these routes join its tail

`GetPreAuthMiddleware` contributions are mounted as one ordered `app.use` chain, so a moved route is
no longer ahead of every other pre-auth handler — it is behind them. That includes MJ's
`RateLimitMiddleware`, a global IP-keyed limiter which is **`enabled: false` by default**
(`MJServer/src/middleware/RateLimitMiddleware.ts:21`). On a host that switches rate limiting on,
`/f/:slug` and the asset GET are now counted and can answer 429. This is the same trade #130 took
for the bundle and it is the right one — a public unauthenticated route is exactly what a global
limiter is for — but the failure mode is worth knowing: a respondent refused there sees an error
page or a broken image, not a rate-limit explanation.

## 7. Decision 4 — the local `requestIdentityHandler()` stays

The issue asks whether the route's own `requestIdentityHandler()` mount becomes redundant once the
route is pre-auth. Traced rather than assumed:

- MJServer builds its middleware list from ClassFactory registration order, which is module import
  order; `packages/Server/src/index.ts` imports `RequestIdentityMiddleware` at line 35, before
  `RespondentHostMiddleware` at line 48. So the identity handler *is* mounted first today, and
  removing the local mount would work — **today**.
- It would work by accident. Reordering two imports in a barrel file, or a future middleware that
  registers earlier, silently returns `currentRequestIdentity()` to `undefined`, and
  `checkRedeemRateLimit(undefined)` takes its deliberate "cannot identify the caller, admit
  everything" branch. That is a gate that reports itself installed and is not — the exact failure
  `redeem-rate-limit.spec.ts`'s header says the tests exist to prevent.
- Mounting it twice is documented harmless: `AsyncLocalStorage.run` nests and the inner store wins.

**It stays**, its comment is rewritten to say *this* reason instead of the stale MJServer-ordering
one, and the assumption becomes a test: mount the host's pre-auth handler **before** the identity
middleware's (the adversarial order) and assert the route still sees an `ipHash`. That converts an
implicit ordering dependency into a pinned property, which is strictly better than either removing
the mount or keeping it silently.

## 8. Test ripple — what must change, and why that does not violate the DoD

The issue's definition of done says *"no changed expectation in an existing test"*. One existing
expectation cannot survive, and the plan changes it deliberately:

`redeem-rate-limit.spec.ts:200-216` — *"mounts the identity handler ON the route it registers"* —
reaches into Express's private router stack, finds the layer whose `route.path` is `/f/:slug`, and
asserts it carries two handlers. After the move there is no such layer: the route is a handler in a
`use` chain, not a routed layer. The assertion is replaced by a **behavioural** one that tests the
same fact better — request the page with the identity middleware mounted after the host's handlers
and assert the per-IP meter actually refuses at `FORMS_REDEEM_IP_MAX`. Structural test out,
behavioural test in; the guard it protects stays covered.

Three harnesses also mount `ConfigureExpressApp(app)` and then request `/f/…`. They must additionally
mount the pre-auth contributions or every one of their assertions evaporates into a 404:

- `respondent-host/__tests__/RespondentHostMiddleware.spec.ts:80` (`withServer`)
- `respondent-host/__tests__/redeem-rate-limit.spec.ts:203` and `:262`

`asset/__tests__/*` never mounts an Express app, so the asset move has no ripple — and no route-level
coverage at all today, which this change also fixes.

## 9. Definition of done (from the issue, unchanged)

- A failing test first, mounting in `serve()`'s order as `WidgetBundleMiddleware.spec.ts` does, with
  a fixture body over 1,024 bytes so it cannot pass by absence.
- `GET /f/<slug>` with `Accept-Encoding: gzip, br` → 200, `Content-Encoding` set, `Vary: Accept-Encoding`.
- The routes still claim the same URLs, including a mis-cased path and one trailing slash.
- `npm run smoke:respondent` passes end to end; the anonymous session/redeem path is unchanged.
- Suite and gates green.
