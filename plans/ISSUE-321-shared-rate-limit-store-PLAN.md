# Shared rate-limit window store (#321) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `FormsRateLimiter` shares its window counts across API instances through MJ's Redis cache provider when the host has one, and keeps today's per-process store otherwise.

**Architecture:** A `RateLimitStore` seam with two stores beside the limiter: `MemoryRateLimitStore` (today's `Map` logic, moved verbatim) and `RedisRateLimitStore` (one atomic Lua script per charge over sorted sets). The limiter picks a store lazily on its first `charge` from `Metadata.Provider.LocalStorageProvider`, and falls back to the memory store per call during a Redis outage. `charge` becomes async; the five call sites await it.

**Tech Stack:** TypeScript (ESM), Vitest, `@memberjunction/redis-provider` (ioredis client), Redis Lua.

**Spec:** the brief in issue #321 ("Design decided" and "Done when").

## Global Constraints

- `@memberjunction/redis-provider` is a caret **peer** of `packages/CoreEntitiesServer` at `^6.1.0-edge.6`, and a caret dependency of `apps/MJAPI` at `^6.1.6`. No MJ `dependencies` in `packages/*`.
- Bucket key: `forms:ratelimit:<gate key>`. Score = hit timestamp. TTL `PEXPIRE windowMs`.
- No change to: `InFlightLimiter` or its three instances; any default, env var name or key format in `config.ts` / `save-gates.ts`; the quota logic; `rateLimitedMessage`.
- No Forms-owned Redis connection or env var. The store comes only from `Metadata.Provider.LocalStorageProvider`.
- `.github/workflows/build.yml` job name stays exactly `build-and-test`.
- No migration, no `metadata/` change.

## Review Focus

1. **Two hits in the same millisecond** (two instances, or one busy instance). A sorted set member equal to the timestamp would merge them into one hit and undercount. Member is `<now>:<per-call nonce>`; score is `now`. Pinned by the Redis spec test "two charges at the same now count twice".
2. **Redis provider installed but not yet connected / connection lost.** ioredis's offline queue never settles a command while disconnected (`maxRetriesPerRequest: null`), so the limiter must read `IsConnected` BEFORE it sends the script, or every request hangs. Pinned by the outage spec "IsConnected false never calls the Redis store".
3. **`Metadata.Provider` unset** (unit tests, early boot). Pick the memory store; never throw. Pinned by the store-selection spec.
4. **A pick made too early is permanent.** The pick happens once, on the first charge; `resetForTests` clears it so specs can re-pick. Pinned by "pick happens on first charge, not construction".
5. **Refusal charges nothing on any gate**, in Redis as in memory. Pinned by the Redis spec "two gates where only the second is over".

---

### Task 1: Store seam, memory store, async `charge`, call sites

**Files:**
- Modify: `packages/CoreEntitiesServer/src/submission/rate-limit.ts`
- Modify: `packages/CoreEntitiesServer/src/engines/FormSubmissionEngine.ts:377`
- Modify: `packages/Server/src/respondent-host/redeem-rate-limit.ts:81`, `RespondentHostMiddleware.ts:385`
- Modify: `packages/Server/src/respondent-host/resume-deps.ts:99`, `device-resume.service.ts:105,135,250`
- Modify: `packages/Server/src/upload/upload-rate-limit.ts:43`, `UploadMiddleware.ts:204`
- Modify tests: `rate-limit-overrides.spec.ts`, `rate-limit.key-space.spec.ts`, `redeem-rate-limit.spec.ts`, `upload-rate-limit.spec.ts`, `device-resume.service.spec.ts` (only `await` / `async` added)

**Interfaces — Produces:**
- `export interface RateLimitStore { charge(gates: readonly RateLimitGate[], windowMs: number, now: number): Promise<RateLimitResult>; }`
- `export class MemoryRateLimitStore implements RateLimitStore` with `reset(): void`.
- `FormsRateLimiter.charge(gates, now = Date.now()): Promise<RateLimitResult>`
- `checkRedeemRateLimit(...)`, `checkUploadRateLimit(...)`: `Promise<RateLimitResult>`; `DeviceResumeDeps.allowRequest(key): Promise<boolean>`.

- [ ] Step 1: add `await` to existing spec call sites; run them; they fail (a Promise has no `.allowed` → `undefined`).
- [ ] Step 2: move the `Map` logic into `MemoryRateLimitStore` unchanged (windowMs passed in; key cap still read from config). Limiter delegates to it.
- [ ] Step 3: await at every call site; `allowRequest` returns `Promise<boolean>`.
- [ ] Step 4: run CoreEntitiesServer and Server suites; typecheck both packages; commit.

### Task 2: Redis store

**Files:**
- Create: `packages/CoreEntitiesServer/src/submission/redis-rate-limit-store.ts`
- Test: `packages/CoreEntitiesServer/src/submission/__tests__/rate-limit.redis-store.spec.ts`

**Interfaces — Produces:**
- `export interface RateLimitRedisClient { eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>; }` (ioredis `Redis` satisfies it).
- `export class RedisRateLimitStore implements RateLimitStore { constructor(client: RateLimitRedisClient) }`
- `export const RATE_LIMIT_KEY_PREFIX = 'forms:ratelimit:'`

Lua (KEYS = bucket keys; ARGV = now, windowMs, member, max per key): per key `ZREMRANGEBYSCORE key -inf now-window`, `ZCARD`; if count >= max, wait = oldest score + window - now floored at 0, keep the max. Any refusal → return wait, add nothing. Else `ZADD key now member` + `PEXPIRE key window` for every key; return -1.

- [ ] Step 1: write the spec, `describe.skipIf(!process.env.FORMS_TEST_REDIS_URL)`, client from `new RedisLocalStorageProvider({ url, enablePubSub: false }).Client`, unique key per test, `afterAll` disconnect. Tests: at-max refused & nothing charged; two gates only second over → first gate's ZCARD unchanged; retryAfterMs = longest wait; hit older than window no longer counts; `PTTL` in (0, window]; two store instances combined count; two charges at the same `now` count twice.
- [ ] Step 2: implement; run with and without the env var (skipped, not failed).
- [ ] Step 3: commit.

### Task 3: Lazy store pick and outage fallback

**Files:**
- Modify: `packages/CoreEntitiesServer/src/submission/rate-limit.ts`
- Test: `rate-limit.store-selection.spec.ts`, `rate-limit.outage.spec.ts`
- Modify: `packages/CoreEntitiesServer/package.json` (peer), `apps/MJAPI/package.json` (dep)

Behaviour: on first `charge`, read `Metadata.Provider?.LocalStorageProvider`; `instanceof RedisLocalStorageProvider` → `RedisRateLimitStore(provider.Client)`, else memory. `LogStatus` one line naming the store. Each charge on Redis: `provider.IsConnected === false` → memory (no Redis call); Redis throws → memory. First fallback of an outage → `LogError` once; first Redis success after → `LogStatus` once, outage cleared. `resetForTests()` clears the memory store, the pick and the outage flag. Test-only `activeStoreForTests()` returns the picked store or `undefined`.

- [ ] Step 1: selection spec: in-memory provider → `MemoryRateLimitStore`; a `RedisLocalStorageProvider` (prototype instance with stubbed `Client`/`IsConnected`, no socket) → `RedisRateLimitStore`; nothing picked after construction, picked after first charge.
- [ ] Step 2: outage spec: Redis store throws → result is memory store's, `LogError` called once; second failing call no new log; `IsConnected` true and store healthy → next call reaches Redis (spy).
- [ ] Step 3: implement; run; typecheck; commit.

### Task 4: CI, docs, comments

- `.github/workflows/build.yml` `build-and-test`: `services: redis: image: redis:7-alpine, ports: ['6379:6379']` with a health check; `Run tests` step `env: FORMS_TEST_REDIS_URL: redis://localhost:6379`.
- `docs/install.md` paragraph after the rate-limit table (shared store when `REDIS_URL` set; `FORMS_RATELIMIT_MAX_KEYS` per-process only; in-flight caps per-process by design). Edit the `FORMS_RATELIMIT_MAX_KEYS` row to say "per-process".
- Module comment at top of `rate-limit.ts` updated.
- Run `npm run lint:peer-ranges`, `npm run lint:mj-ranges`, `npm run typecheck`; commit.
