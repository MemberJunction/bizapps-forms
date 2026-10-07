# #291 — Asset read latency and the welcome-image pop-in: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A respondent's welcome screen appears complete — logo, text and image together, no layout jump — and `GET /forms/asset/<id>` stops paying a storage-provider round trip on every request.

**Architecture:** Server: an in-process, byte-budgeted LRU of asset bytes inside `loadAssetBytes`, single-flight for concurrent misses, warmed by the authoring upload; the `MJ: Files` guard still runs on every request. Widget: one off-DOM image loader (`core/image-load.ts`, synchronous callbacks) used by the existing prefetch queue and by a new pure welcome gate (`core/welcome-gate.ts`) that keeps `<mj-form>` in `loading` — showing the MJ logo loader — until the welcome image (and the form's logo, if any) is ready or 3 s pass.

**Tech Stack:** TypeScript, Express middleware on MJServer (`@memberjunction/server` 6.1.5), Angular 21 standalone components in a zoneless custom element, Vitest.

**Spec:** GitHub issue #291 plus the design agreed in the session of 2026-10-07 (*Design decisions* below).

## Root cause

1. `packages/Server/src/storage/read-object.ts` `readStoredObject` calls `driver.GetObject({ fullPath })` on every request; Forms keeps no copy of the bytes. In `@memberjunction/storage@6.1.5`, `BoxFileStorage.js:1230` `GetObject` resolves a `fullPath` through `_getItemInfoFromPath` (`:407-470`: folder listings via `getFolderItems`) and then downloads. An asset key is `forms-assets/<formId>/<uuid>/<name>`, so every request is several Box calls ≈ 2.5–3 s.
2. `packages/Angular/src/lib/widget/components/form-screen.component.ts:229` renders the welcome `<img>` with no intrinsic size and `height: auto` (`:50-56`), so it takes no space until its bytes arrive. The form logo has the same shape (`mj-form.component.html:56-58`, `.mjf-logo` sets only `max-height`).
3. The earlier work (#277 upload shrinking, #278 later-screen prefetch + `fetchpriority="high"`) was measured against local-disk storage, where the server answers in milliseconds. It cannot help the welcome image: that image is the first one requested, and its cost is server-side.

Repro (on the branch, red): `packages/Server/src/asset/__tests__/asset.service.spec.ts` — *"serves the second request for the same asset without reading storage again"*; `GetObject` called 2×, expected 1×.

## Design decisions (agreed 2026-10-07)

- **A. Server byte cache** in `loadAssetBytes`, asset route only (respondent downloads are personal data, permission-checked per request — not cached). Fixed budget, no env knob.
- **B1. Warm on upload:** a successful `POST /forms/asset` puts its bytes in the same cache.
- **Gate:** only when the form opens on the **welcome** phase **and** the welcome screen has an image. `<mj-form>` stays in `loading` until that image — and the form's logo, if it has one, since the logo is part of the welcome screen — has loaded or failed, or **3 s** pass. Then the welcome screen shows. No gate for endings, questions, or a welcome screen without an image.
- **Loader:** the **MJ logo loader** only while the gate waits; every other loading state keeps the neutral spinner.
- **Dropped:** recording image dimensions at upload.
- **Not in this PR:** `/f/:slug` warming the welcome image server-side (B2); an MJ issue for Box path→ID caching (declined).
- **Rejected:** redirecting to a signed provider URL (Box still resolves the path; exposes provider URLs; breaks `immutable`).

## Plan review (independent Claude reviewer — `/council` was blocked by a PreToolUse hook)

Accepted (each confirmed in code):
1. Promise-based `ready` would make the prefetch queue advance asynchronously and break `core/image-prefetch.spec.ts:48-49, 59, 70-71, 82-83, 101-103` → `preloadImage` uses **synchronous callbacks**; the queue keeps today's semantics and its spec stays untouched.
2. `image-prefetch.wiring.spec.ts:48` and `:63` reference `planPrefetch(def)` and its old signature → Task 5 updates both.
3. The logo renders during `loading` (`mj-form.component.html:56-58`) with no reserved space and outside the hero layout (`mj-form.component.ts:120`, `.css:200-242`), so it would jump at reveal → the gate also waits on the logo, and the logo bar is hidden while the gate waits.
4. Gate races would be pinned only by source-text smokes, which `.claude/rules/testing.md` says assert presence, not behaviour → the gate is a pure function in `core/welcome-gate.ts` with behaviour tests; guard-mutant entries added (Task 6).
5. The waiting flag was never reset and the gate borrowed `prefetchGeneration` → a dedicated `loadGeneration`, and `load()` resets the flag.
6. An optional upload `cache` would let a missed wiring compile → required on both contexts; `asset-pipeline.spec.ts:42` updated.
7. `file.data` is a `subarray` of the multipart body (`multipart.ts:139-143`) → warm with `Buffer.from(file.data)`.
8. The MJ mark's paths carry `transform="translate(47.5625,10.875)"` / `translate(150,69)` → copied with them, asserted.
9. The cache key omitted `ProviderID`; `.finally` could delete a newer in-flight entry after `Clear()` → key includes it; delete only if still the same promise.
10. Root-cause citation corrected (above).

Rejected:
- *Env override / off switch for the budget* — the fixed budget was the agreed recommendation; 50 MB bounded, a knob is unowned surface.
- *Bring back B2 because a cold Box read ≈ the 3 s cap* — deferred by the user's decision; recorded as a known gap and measured in the smoke.
- *`img.decode()` before reveal* — speculative; the smoke checks same-frame paint and this is revisited only if it fails.

## Global Constraints

- No `any`, no lazy `unknown` (CLAUDE.md rule 2). Explicit types on exports.
- Singletons extend `BaseSingleton` (rule 6); precedent `packages/Server/src/public-submit/rate-limit.service.ts:34`.
- No re-exports between packages; static imports only.
- Widget stays free of MJ Angular libraries and the Explorer shell: the MJ mark is copied as inline SVG, not imported from `@memberjunction/ng-shared-generic`.
- Widget CSS uses `--mjf-*` / `--mj-*` tokens only (`npm run lint:ui`); respect `prefers-reduced-motion`.
- Never swallow errors: every `catch` logs with context or rethrows.
- Every wait is capped: gate `WELCOME_IMAGE_WAIT_MS = 3000`; prefetch keeps `PREFETCH_TIMEOUT_MS = 15_000`.
- Changesets: `patch` — `.claude/rules/changesets.md`.
- `.spec.ts`; Server tests in `__tests__/`, widget core tests colocated.
- Commits: one coherent step each, conventional prefix, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. A refactor commit carries no behaviour change.

## Review Focus

1. **A deleted or re-pointed asset must stop being served even when its bytes are cached** — `Status = 'Deleted'`, a key that left `forms-assets/`, a different key, or a different provider: 404 or a fresh read on the next request. (Task 2.)
2. **Concurrent first requests cost one storage read; a failed read is not kept and does not poison retries.** (Tasks 1, 2.)
3. **Memory is bounded:** over-cap object served but not kept; total ≤ budget; LRU order; the upload does not pin its multipart body. (Tasks 1, 2.)
4. **The gate never hangs and never overrides the author:** broken image, stalled image, `load()` re-run, destroy, or the builder preview's `showScreen()` during the wait. (Tasks 4, 5.)
5. **The prefetch queue behaves exactly as before** — `core/image-prefetch.spec.ts` passes unmodified. (Task 3.)

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `packages/Server/src/asset/asset-byte-cache.ts` | Create | `ByteBudgetCache` (pure LRU + single-flight) and `AssetByteCache` (`BaseSingleton`) |
| `packages/Server/src/asset/__tests__/asset-byte-cache.spec.ts` | Create | LRU, budget, entry cap, single-flight, failure-not-kept |
| `packages/Server/src/asset/asset.service.ts` | Modify | required `cache` on both contexts; read after the guard; warm after upload; `assetCacheKey` |
| `packages/Server/src/asset/AssetMiddleware.ts` | Modify | pass `AssetByteCache.Instance.Bytes` into both contexts |
| `packages/Server/src/asset/__tests__/asset.service.spec.ts` | Modify | repro (exists), cache-vs-guard, warm-on-upload |
| `packages/Server/src/asset/__tests__/asset-pipeline.spec.ts` | Modify | its `uploadContext()` gains `cache` |
| `packages/Angular/src/lib/widget/core/image-load.ts` | Create | `preloadImage` — the widget's one off-DOM image load |
| `packages/Angular/src/lib/widget/core/image-load.spec.ts` | Create | outcomes, timeout without abort, settle after timeout, cancel |
| `packages/Angular/src/lib/widget/core/image-prefetch.ts` | Modify | queue built on `preloadImage` (no behaviour change) |
| `packages/Angular/src/lib/widget/core/welcome-gate.ts` | Create | `gateWelcomeScreen(urls, hooks, env)` + `WELCOME_IMAGE_WAIT_MS` |
| `packages/Angular/src/lib/widget/core/welcome-gate.spec.ts` | Create | reveal/settle/stale/timeout behaviour |
| `packages/Angular/src/lib/widget/components/mj-loader.component.ts` (+ `mj-loader.spec.ts`) | Create | MJ logo loader |
| `packages/Angular/src/lib/widget/mj-form.component.ts` / `.html` | Modify | wire the gate; hide logo while waiting; remove `onWelcomeMediaSettled` |
| `packages/Angular/src/lib/widget/components/form-screen.component.ts` | Modify | remove the unused `mediaSettled` output |
| `packages/Angular/src/lib/widget/image-prefetch.wiring.spec.ts` | Modify | follow the new seams |
| `scripts/check-guard-mutants.mjs` | Modify | four new mutants |
| `.changeset/asset-cache-and-welcome-gate.md` | Create | patch, forms-server + forms-ng |

---

### Task 1: `ByteBudgetCache` + `AssetByteCache`

**Files:** Create `packages/Server/src/asset/asset-byte-cache.ts`; Test `packages/Server/src/asset/__tests__/asset-byte-cache.spec.ts`

**Interfaces — produces:**
```ts
export const MAX_CACHED_ASSET_BYTES: number;        // 50 * 1024 * 1024
export const MAX_CACHED_ASSET_ENTRY_BYTES: number;  // 8 * 1024 * 1024
export class ByteBudgetCache {
  constructor(maxTotalBytes: number, maxEntryBytes: number);   // throws unless 0 < entry <= total
  get TotalBytes(): number;
  Get(key: string): Buffer | undefined;                       // refreshes recency
  Put(key: string, bytes: Buffer): void;                      // no-op over the entry cap
  GetOrLoad(key: string, load: () => Promise<Buffer>): Promise<Buffer>;
  Clear(): void;
}
export class AssetByteCache extends BaseSingleton<AssetByteCache> {
  static get Instance(): AssetByteCache;
  readonly Bytes: ByteBudgetCache;
}
```

- [ ] **Step 1: Write the failing tests**

> **Superseded during implementation (do not build from this snippet as written).** The shipped `asset-byte-cache.spec.ts` is the authority: its `Clear()` race test makes the stale load FAIL (`failOld(new Error('stale load failed'))`, `rejects.toThrow`). Resolving it, as below, cannot see the `.finally` ownership guard the test exists for (final review of #291, `21c4245`).

```ts
import { describe, it, expect, vi } from 'vitest';
import { ByteBudgetCache } from '../asset-byte-cache';

const bytes = (n: number, fill = 1): Buffer => Buffer.alloc(n, fill);

describe('ByteBudgetCache', () => {
  it('returns what was put', () => {
    const cache = new ByteBudgetCache(100, 50);
    cache.Put('a', bytes(10));
    expect(cache.Get('a')?.length).toBe(10);
  });

  it('never holds more than the budget, dropping the least recently used first', () => {
    const cache = new ByteBudgetCache(30, 20);
    cache.Put('a', bytes(10));
    cache.Put('b', bytes(10));
    cache.Get('a');
    cache.Put('c', bytes(15));
    expect(cache.Get('b')).toBeUndefined();
    expect(cache.Get('a')).toBeDefined();
    expect(cache.Get('c')).toBeDefined();
    expect(cache.TotalBytes).toBeLessThanOrEqual(30);
  });

  it('does not keep an object over the per-entry cap, and evicts nothing for it', () => {
    const cache = new ByteBudgetCache(100, 20);
    cache.Put('a', bytes(10));
    cache.Put('big', bytes(21));
    expect(cache.Get('big')).toBeUndefined();
    expect(cache.Get('a')).toBeDefined();
  });

  it('replacing a key does not double-count its bytes', () => {
    const cache = new ByteBudgetCache(100, 50);
    cache.Put('a', bytes(10));
    cache.Put('a', bytes(20));
    expect(cache.TotalBytes).toBe(20);
  });

  it('refuses limits that cannot hold anything', () => {
    expect(() => new ByteBudgetCache(10, 0)).toThrow();
    expect(() => new ByteBudgetCache(10, 20)).toThrow();
  });

  it('shares one load between concurrent misses for the same key', async () => {
    const cache = new ByteBudgetCache(100, 50);
    let release!: (b: Buffer) => void;
    const load = vi.fn(() => new Promise<Buffer>((resolve) => (release = resolve)));
    const first = cache.GetOrLoad('a', load);
    const second = cache.GetOrLoad('a', load);
    release(bytes(5));
    expect((await first).length).toBe(5);
    expect((await second).length).toBe(5);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a failed load is not kept: every waiter sees the error and the next call loads again', async () => {
    const cache = new ByteBudgetCache(100, 50);
    const failing = vi.fn(async (): Promise<Buffer> => {
      throw new Error('provider down');
    });
    await expect(Promise.all([cache.GetOrLoad('a', failing), cache.GetOrLoad('a', failing)])).rejects.toThrow('provider down');
    expect(failing).toHaveBeenCalledTimes(1);
    const ok = vi.fn(async () => bytes(3));
    expect((await cache.GetOrLoad('a', ok)).length).toBe(3);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('serves a kept key without calling the loader', async () => {
    const cache = new ByteBudgetCache(100, 50);
    cache.Put('a', bytes(4));
    const load = vi.fn(async () => bytes(9));
    expect((await cache.GetOrLoad('a', load)).length).toBe(4);
    expect(load).not.toHaveBeenCalled();
  });

  it('a load that finishes after Clear() does not remove a newer load for the same key', async () => {
    const cache = new ByteBudgetCache(100, 50);
    let releaseOld!: (b: Buffer) => void;
    const old = cache.GetOrLoad('a', () => new Promise<Buffer>((r) => (releaseOld = r)));
    cache.Clear();
    let releaseNew!: (b: Buffer) => void;
    const newer = cache.GetOrLoad('a', () => new Promise<Buffer>((r) => (releaseNew = r)));
    releaseOld(bytes(1));
    await old;
    const joined = vi.fn(async () => bytes(9));
    const third = cache.GetOrLoad('a', joined); // must join `newer`, not start a load
    releaseNew(bytes(2));
    expect((await newer).length).toBe(2);
    expect((await third).length).toBe(2);
    expect(joined).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** `cd packages/Server && npx vitest run src/asset/__tests__/asset-byte-cache.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

> **Superseded during implementation (do not build from this snippet as written).** The shipped `asset-byte-cache.ts` is the authority; its `GetOrLoad` doc comment also says the returned Buffer is the kept copy and must not be mutated.

```ts
/**
 * Asset bytes held in process (#291).
 *
 * Why: `GET /forms/asset/<id>` re-read the object from the storage provider on every request, and
 * on Box a path read lists folders before it downloads (~2.5–3 s), so every respondent's welcome
 * image paid that round trip. An asset's bytes never change under its `MJ: Files` id — a new image
 * is a new upload, so a new id — so a copy is safe to keep.
 *
 * Bounded twice: a total budget with least-recently-used eviction, and a per-object cap so one
 * large image cannot flush the rest. A process-local copy, not a record: losing it (restart,
 * eviction, a second host) costs one provider read. It decides nothing about WHETHER a caller may
 * read an object — `loadAssetBytes` runs its guard before it asks.
 */
import { BaseSingleton } from '@memberjunction/global';

/** Total bytes kept across all assets. */
export const MAX_CACHED_ASSET_BYTES = 50 * 1024 * 1024;
/** Largest single object kept; a bigger one is served but not kept. */
export const MAX_CACHED_ASSET_ENTRY_BYTES = 8 * 1024 * 1024;

export class ByteBudgetCache {
  /** Map insertion order is recency order: re-inserted on every hit, oldest first. */
  private readonly entries = new Map<string, Buffer>();
  /** Loads in flight, so concurrent misses for one key share one provider read. */
  private readonly inFlight = new Map<string, Promise<Buffer>>();
  private totalBytes = 0;

  constructor(
    private readonly maxTotalBytes: number,
    private readonly maxEntryBytes: number,
  ) {
    if (!(maxEntryBytes > 0) || !(maxTotalBytes >= maxEntryBytes)) {
      throw new Error(`ByteBudgetCache: need 0 < maxEntryBytes (${maxEntryBytes}) <= maxTotalBytes (${maxTotalBytes}).`);
    }
  }

  public get TotalBytes(): number {
    return this.totalBytes;
  }

  public Get(key: string): Buffer | undefined {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
    }
    return hit;
  }

  public Put(key: string, bytes: Buffer): void {
    if (bytes.length > this.maxEntryBytes) return;
    this.remove(key);
    this.entries.set(key, bytes);
    this.totalBytes += bytes.length;
    this.evictOverBudget();
  }

  /** The kept bytes, else ONE shared `load()` whose result is kept on success only. */
  public GetOrLoad(key: string, load: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.Get(key);
    if (hit) return Promise.resolve(hit);
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const started: Promise<Buffer> = load()
      .then((loaded) => {
        this.Put(key, loaded);
        return loaded;
      })
      .finally(() => {
        // Only our own entry: after Clear() a newer load for this key may be in flight.
        if (this.inFlight.get(key) === started) this.inFlight.delete(key);
      });
    this.inFlight.set(key, started);
    return started;
  }

  public Clear(): void {
    this.entries.clear();
    this.inFlight.clear();
    this.totalBytes = 0;
  }

  private remove(key: string): void {
    const old = this.entries.get(key);
    if (old) {
      this.entries.delete(key);
      this.totalBytes -= old.length;
    }
  }

  private evictOverBudget(): void {
    while (this.totalBytes > this.maxTotalBytes) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.remove(oldest.value);
    }
  }
}

/** The process-wide asset cache, shared by the read route and the upload that warms it. */
export class AssetByteCache extends BaseSingleton<AssetByteCache> {
  public readonly Bytes = new ByteBudgetCache(MAX_CACHED_ASSET_BYTES, MAX_CACHED_ASSET_ENTRY_BYTES);

  protected constructor() {
    super();
  }

  public static get Instance(): AssetByteCache {
    return super.getInstance<AssetByteCache>();
  }
}
```

(Note: a stale load that finishes after `Clear()` still `Put`s its bytes. That is correct — asset bytes are immutable by id — and the test above only pins that it does not remove the newer in-flight entry.)

- [ ] **Step 4: Run** → PASS (9 tests).
- [ ] **Step 5: Commit** `feat(forms-server): a byte-budgeted, single-flight cache for asset bytes (#291)`

---

### Task 2: Read through the cache; warm it on upload

**Files:** Modify `packages/Server/src/asset/asset.service.ts`, `packages/Server/src/asset/AssetMiddleware.ts`, `packages/Server/src/asset/__tests__/asset.service.spec.ts`, `packages/Server/src/asset/__tests__/asset-pipeline.spec.ts`

**Interfaces:**
- Consumes: `ByteBudgetCache`, `AssetByteCache` (Task 1).
- Produces: `AssetReadContext.cache: ByteBudgetCache` and `AssetUploadContext.cache: ByteBudgetCache` (both **required**); exported pure `assetCacheKey(fileId: string, providerId: string, providerKey: string): string`.

- [ ] **Step 1: Write the failing tests.** In `asset.service.spec.ts`: import `ByteBudgetCache` from `../asset-byte-cache`; give `readContext()` a fresh `cache: new ByteBudgetCache(1024 * 1024, 1024 * 1024)` and `uploadContext()` the same (a fresh one per call, so tests stay independent). In `asset-pipeline.spec.ts` `uploadContext()` (line ~42) add the same `cache` (and in its read context if it builds one). Append:

```ts
describe('loadAssetBytes — kept bytes never bypass the guard (#291)', () => {
  const KEY = `forms-assets/${FORM_ID}/0b6f3c1e-2d4a-4f5b-9c8d-7e6f5a4b3c2d/logo.png`;
  const driverWith = (getObject: () => Promise<Buffer>) => ({ GetDriver: vi.fn(async () => ({ GetObject: getObject })) });

  it('404s an asset deleted after its bytes were kept', async () => {
    const ctx = readContext(fileRecord({ ProviderKey: KEY }));
    expect((await loadAssetBytes(ctx, FILE_ID)).ok).toBe(true);
    ctx.loadFile = vi.fn(async () => fileRecord({ ProviderKey: KEY, Status: 'Deleted' }));
    expect((await loadAssetBytes(ctx, FILE_ID)).failure).toEqual({ status: 404, error: 'Not found.' });
  });

  it('404s a row whose key left the public prefix, though the old key is kept', async () => {
    const ctx = readContext(fileRecord({ ProviderKey: KEY }));
    await loadAssetBytes(ctx, FILE_ID);
    ctx.loadFile = vi.fn(async () => fileRecord({ ProviderKey: 'forms-uploads/2026-08-18/resume.pdf' }));
    expect((await loadAssetBytes(ctx, FILE_ID)).failure?.status).toBe(404);
  });

  it('reads storage again when the row now names a different key', async () => {
    const getObject = vi.fn(async () => Buffer.from('PNGDATA'));
    const ctx = readContext(fileRecord({ ProviderKey: KEY }), driverWith(getObject));
    await loadAssetBytes(ctx, FILE_ID);
    ctx.loadFile = vi.fn(async () => fileRecord({ ProviderKey: KEY.replace('logo.png', 'logo-2.png') }));
    await loadAssetBytes(ctx, FILE_ID);
    expect(getObject).toHaveBeenCalledTimes(2);
  });

  it('reads storage again when the row now names a different provider', async () => {
    const getObject = vi.fn(async () => Buffer.from('PNGDATA'));
    const ctx = readContext(fileRecord({ ProviderKey: KEY }), driverWith(getObject));
    await loadAssetBytes(ctx, FILE_ID);
    ctx.loadFile = vi.fn(async () => fileRecord({ ProviderKey: KEY, ProviderID: 'provider-2' }));
    await loadAssetBytes(ctx, FILE_ID);
    expect(getObject).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failed read: the next request tries storage again', async () => {
    const getObject = vi
      .fn<() => Promise<Buffer>>()
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce(Buffer.from('PNGDATA'));
    const ctx = readContext(fileRecord({ ProviderKey: KEY }), driverWith(getObject));
    expect((await loadAssetBytes(ctx, FILE_ID)).failure?.status).toBe(500);
    expect((await loadAssetBytes(ctx, FILE_ID)).asset?.content.toString()).toBe('PNGDATA');
  });

  it('shares one storage read between concurrent first requests', async () => {
    const getObject = vi.fn(async () => Buffer.from('PNGDATA'));
    const ctx = readContext(fileRecord({ ProviderKey: KEY }), driverWith(getObject));
    const results = await Promise.all([loadAssetBytes(ctx, FILE_ID), loadAssetBytes(ctx, FILE_ID)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(getObject).toHaveBeenCalledTimes(1);
  });
});

describe('runAssetUpload — warms the read cache (#291)', () => {
  const KEY = `forms-assets/${FORM_ID}/logo.png`; // what uploadContext()'s UploadFile reports
  const readingFrom = (cache: ByteBudgetCache, getObject: () => Promise<Buffer>) => ({
    ...readContext(fileRecord({ ProviderKey: KEY }), { GetDriver: vi.fn(async () => ({ GetObject: getObject })) }),
    cache,
  });

  it('a later read of the uploaded asset does not go to storage', async () => {
    const up = uploadContext();
    expect((await runAssetUpload(up, { file: png(32), formId: FORM_ID })).ok).toBe(true);
    const getObject = vi.fn(async () => Buffer.from('FROM-STORAGE'));
    const read = await loadAssetBytes(readingFrom(up.cache, getObject), FILE_ID);
    expect(getObject).not.toHaveBeenCalled();
    expect(read.asset?.content.equals(png(32).data)).toBe(true);
  });

  it('keeps a copy of the file, not a view into the request body', async () => {
    const up = uploadContext();
    const file = png(32);
    await runAssetUpload(up, { file, formId: FORM_ID });
    file.data.fill(0); // the multipart body is reused/freed by the caller; the kept copy must not move
    const read = await loadAssetBytes(readingFrom(up.cache, vi.fn(async () => Buffer.from('X'))), FILE_ID);
    expect(read.asset?.content.equals(png(32).data)).toBe(true);
  });

  it('does not warm when the engine reports no storage path', async () => {
    const up = uploadContext();
    up.storage.UploadFile = vi.fn(async () => ({ FileID: FILE_ID }));
    await runAssetUpload(up, { file: png(32), formId: FORM_ID });
    const getObject = vi.fn(async () => Buffer.from('FROM-STORAGE'));
    await loadAssetBytes(readingFrom(up.cache, getObject), FILE_ID);
    expect(getObject).toHaveBeenCalledTimes(1);
  });

  it('a failed upload warms nothing', async () => {
    const up = uploadContext();
    up.storage.UploadFile = vi.fn(async () => {
      throw new Error('provider down');
    });
    await runAssetUpload(up, { file: png(32), formId: FORM_ID });
    expect(up.cache.TotalBytes).toBe(0);
  });
});
```

(`fileRecord()` defaults `ProviderID: 'provider-1'`, which is what the upload path's key must match: `uploadContext()`'s `UploadFile` must therefore also report the provider — see Step 3: the warm key uses `stored.Provider?.ID`. Update `uploadContext()`'s `UploadFile` mock to resolve `{ FileID: FILE_ID, StoragePath: KEY, Provider: { ID: 'provider-1', Name: 'Provider 1' } }`, and add `Provider?: { ID: string; Name: string }` to `AssetUploadStorage.UploadFile`'s return type — `FileStorageEngine.js:310-315` returns it.)

- [ ] **Step 2: Run** `cd packages/Server && npx vitest run src/asset/` → the #291 tests FAIL.

- [ ] **Step 3: Implement** in `asset.service.ts`:

```ts
import type { ByteBudgetCache } from './asset-byte-cache.js';

/**
 * Pure. The cache key for one asset: its id plus WHERE its row says the bytes are now. The row is
 * read on every request, so a row re-pointed at another object or provider is never answered with
 * the old bytes.
 */
export function assetCacheKey(fileId: string, providerId: string, providerKey: string): string {
  return `${fileId.toUpperCase()}|${providerId.toUpperCase()}|${providerKey}`;
}
```

- `AssetReadContext`: add `cache: ByteBudgetCache;` — doc: *process-wide copy of served bytes; consulted only after the guard.*
- `AssetUploadContext`: add `cache: ByteBudgetCache;` — doc: *the same cache the read route uses; a successful upload warms it.*
- `AssetUploadStorage.UploadFile` return type: `Promise<{ FileID: string; StoragePath?: string; Provider?: { ID: string; Name: string } }>`.
- `loadAssetBytes`: guard block unchanged. Replace the storage `try` body:

> **Superseded during implementation (do not build from this snippet as written).** The shipped `loadAssetBytes` is the authority; its catch comment now points at `readAssetFromStorage` for why the key stays in the log line.

```ts
  try {
    const providerKey = file.ProviderKey;
    const content = await ctx.cache.GetOrLoad(assetCacheKey(wanted, file.ProviderID, providerKey), () =>
      readAssetFromStorage(ctx, wanted, file.ProviderID, providerKey),
    );
    return {
      ok: true,
      asset: {
        content,
        contentType: file.ContentType?.trim() || 'application/octet-stream',
        fileName: file.Name?.trim() || 'image',
      },
    };
  } catch (error) {
    // unchanged LogError (key + provider) and failRead(500, 'Could not read the image.')
  }
```

- New function (the existing pins / `readStoredObject` / fallback-warning code moved, its two comments kept):

> **Superseded during implementation (do not build from this snippet as written).** The shipped `readAssetFromStorage` is the authority; only its doc comment's wording differs.

```ts
/** One provider read, warning when an account other than the first tried served it. */
async function readAssetFromStorage(
  ctx: AssetReadContext,
  fileId: string,
  providerId: string,
  providerKey: string,
): Promise<Buffer> {
  const pins = [{ envVar: 'FORMS_ASSET_STORAGE_ACCOUNT', value: getAssetConfig().storageAccountId, legacyFallback: true }];
  const read = await readStoredObject(ctx.storage, ctx.systemUser, { providerId, providerKey }, pins);
  const fallback = describeReadFallback('Asset', fileId, providerKey, read, pins);
  if (fallback) LogErrorEx({ severity: 'warning', message: fallback });
  return read.content;
}
```

- `storeAsset`, after `stored` and before `return`:

> **Superseded during implementation (do not build from this snippet as written).** The shipped `storeAsset` is the authority: it also skips the copy when `file.data.length > MAX_CACHED_ASSET_ENTRY_BYTES` (the cache would refuse it anyway), and its comment says so (`21c4245`).

```ts
    // Warm the read cache with bytes already in hand, so the author's preview and the first
    // respondent on this host skip the provider round trip (#291). A copy: `file.data` is a view
    // into the whole multipart body. No path or provider reported → no key → nothing kept.
    if (stored.StoragePath && stored.Provider?.ID) {
      ctx.cache.Put(assetCacheKey(stored.FileID, stored.Provider.ID, stored.StoragePath), Buffer.from(file.data));
    }
```

- File header READ paragraph: add *"Bytes are served from the process-wide `AssetByteCache` once read; the guard runs on every request first."*
- `AssetMiddleware.ts`: `import { AssetByteCache } from './asset-byte-cache.js';` and `cache: AssetByteCache.Instance.Bytes` in the `handleUpload` and `handleFetch` contexts.

- [ ] **Step 4: Run** `cd packages/Server && npx vitest run && npm run typecheck` → all pass (the repro test included).
- [ ] **Step 5: Commit** `fix(forms-server): serve a repeat asset read from memory, and warm it on upload (#291)`

---

### Task 3: `preloadImage`, and the prefetch queue built on it

**Files:** Create `packages/Angular/src/lib/widget/core/image-load.ts`, `core/image-load.spec.ts`; Modify `core/image-prefetch.ts` (body of `prefetchImages`, types)

**Interfaces — produces:**
```ts
export type ImageOutcome = 'loaded' | 'failed';
export interface LoadableImage { src: string; fetchPriority: 'high' | 'low' | 'auto'; decoding: 'async' | 'sync' | 'auto';
  onload: ((ev: Event) => void) | null; onerror: ((ev: Event) => void) | null; }
export interface ImageLoadEnv { createImage(): LoadableImage; setTimeout(fn: () => void, ms: number): number; clearTimeout(handle: number): void; }
export interface PreloadOptions {
  priority: 'high' | 'low';
  /** How long `onReady` waits before reporting 'timed out'. The download is never aborted by it. */
  waitMs: number;
  /** Called once, synchronously, with the first of: loaded, failed, timed out. */
  onReady(outcome: ImageOutcome | 'timed out'): void;
  /** Called once when the download itself finishes, even after a time-out. Omit it to stop listening at the time-out. */
  onSettle?(outcome: ImageOutcome): void;
}
export interface ImagePreload { /** Abort the download, drop the handlers, call nothing more. Idempotent. */ cancel(): void; }
export const browserImageEnv: ImageLoadEnv;
export function preloadImage(url: string, options: PreloadOptions, env?: ImageLoadEnv): ImagePreload;
```
`image-prefetch.ts` keeps every export name: `PrefetchImage = LoadableImage` (type alias), `interface PrefetchEnv extends ImageLoadEnv { saveData(): boolean }`.

- [ ] **Step 1: Write the failing tests** (`image-load.spec.ts`)

```ts
import { describe, it, expect, vi } from 'vitest';
import { preloadImage, type ImageLoadEnv, type LoadableImage } from './image-load';

function fakeEnv() {
  const images: LoadableImage[] = [];
  const timers = new Map<number, () => void>();
  let next = 1;
  const env: ImageLoadEnv = {
    createImage: () => {
      const img: LoadableImage = { src: '', fetchPriority: 'auto', decoding: 'auto', onload: null, onerror: null };
      images.push(img);
      return img;
    },
    setTimeout: (fn) => { const h = next++; timers.set(h, fn); return h; },
    clearTimeout: (h) => { timers.delete(h); },
  };
  const fireTimers = (): void => { const fns = [...timers.values()]; timers.clear(); fns.forEach((fn) => fn()); };
  return { env, images, timers, fireTimers };
}

describe('preloadImage', () => {
  it('requests the url at the given priority, decoded off the main thread', () => {
    const { env, images } = fakeEnv();
    preloadImage('/a', { priority: 'high', waitMs: 3000, onReady: () => undefined }, env);
    expect(images[0]).toMatchObject({ src: '/a', fetchPriority: 'high', decoding: 'async' });
  });

  it('a load reports ready and settled synchronously, once, and clears its timer', () => {
    const { env, images, timers } = fakeEnv();
    const onReady = vi.fn();
    const onSettle = vi.fn();
    preloadImage('/a', { priority: 'high', waitMs: 3000, onReady, onSettle }, env);
    images[0].onload?.(new Event('load'));
    expect(onReady).toHaveBeenCalledExactlyOnceWith('loaded');
    expect(onSettle).toHaveBeenCalledExactlyOnceWith('loaded');
    expect(timers.size).toBe(0);
    expect(images[0].onload).toBeNull();
  });

  it('an error reports failed — a broken image never holds anything up', () => {
    const { env, images } = fakeEnv();
    const onReady = vi.fn();
    preloadImage('/a', { priority: 'high', waitMs: 3000, onReady }, env);
    images[0].onerror?.(new Event('error'));
    expect(onReady).toHaveBeenCalledExactlyOnceWith('failed');
  });

  it('a time-out reports timed out without aborting; onSettle still hears the real outcome', () => {
    const { env, images, fireTimers } = fakeEnv();
    const onReady = vi.fn();
    const onSettle = vi.fn();
    preloadImage('/a', { priority: 'high', waitMs: 3000, onReady, onSettle }, env);
    fireTimers();
    expect(onReady).toHaveBeenCalledExactlyOnceWith('timed out');
    expect(images[0].src).toBe('/a');
    images[0].onload?.(new Event('load'));
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledExactlyOnceWith('loaded');
  });

  it('without onSettle, a time-out stops listening but leaves the download running', () => {
    const { env, images, fireTimers } = fakeEnv();
    preloadImage('/a', { priority: 'low', waitMs: 15000, onReady: () => undefined }, env);
    fireTimers();
    expect(images[0].src).toBe('/a');
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
  });

  it('cancel aborts, calls nothing, and is idempotent', () => {
    const { env, images, timers } = fakeEnv();
    const onReady = vi.fn();
    const p = preloadImage('/a', { priority: 'low', waitMs: 3000, onReady }, env);
    p.cancel();
    p.cancel();
    expect(images[0].src).toBe('');
    expect(images[0].onload).toBeNull();
    expect(timers.size).toBe(0);
    expect(onReady).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** `cd packages/Angular && npx vitest run src/lib/widget/core/image-load.spec.ts` → FAIL.

- [ ] **Step 3: Implement `image-load.ts`**

```ts
/**
 * Load one image off-DOM into the browser's cache, and say when it is ready (#291).
 *
 * The widget's one place for this, with two callers of different patience:
 * - the welcome gate (`welcome-gate.ts`) waits up to 3 s, at high priority, before showing the
 *   welcome screen, and wants to know when the download really finishes so the prefetch can start;
 * - the prefetch queue (`image-prefetch.ts`) waits up to 15 s per later-screen image, low priority.
 * Both stop WAITING at the limit but let the download finish: assets carry a weak ETag and no Range
 * support, so an aborted download cannot resume, while a finished one lands in the HTTP cache
 * (`immutable`) where the real `<img>` finds it. Only `cancel()` aborts.
 *
 * Callbacks, not promises, on purpose: the queue advances synchronously inside `onload`, and its
 * spec pins that ordering.
 */
export type ImageOutcome = 'loaded' | 'failed';

export interface LoadableImage {
  src: string;
  fetchPriority: 'high' | 'low' | 'auto';
  decoding: 'async' | 'sync' | 'auto';
  onload: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

export interface ImageLoadEnv {
  createImage(): LoadableImage;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export interface PreloadOptions {
  priority: 'high' | 'low';
  waitMs: number;
  onReady(outcome: ImageOutcome | 'timed out'): void;
  onSettle?(outcome: ImageOutcome): void;
}

export interface ImagePreload {
  cancel(): void;
}

export const browserImageEnv: ImageLoadEnv = {
  createImage: () => new Image(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

export function preloadImage(url: string, options: PreloadOptions, env: ImageLoadEnv = browserImageEnv): ImagePreload {
  const img = env.createImage();
  let readyReported = false;
  let finished = false;
  let timer: number | null = null;

  const detach = (): void => {
    finished = true;
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
    img.onload = null;
    img.onerror = null;
  };
  const settle = (outcome: ImageOutcome): void => {
    if (finished) return;
    detach();
    if (!readyReported) {
      readyReported = true;
      options.onReady(outcome);
    }
    options.onSettle?.(outcome);
  };

  img.onload = () => settle('loaded');
  img.onerror = () => settle('failed');
  timer = env.setTimeout(() => {
    timer = null;
    if (finished || readyReported) return;
    readyReported = true;
    if (!options.onSettle) detach(); // nobody wants the outcome: stop listening, keep downloading
    options.onReady('timed out');
  }, options.waitMs);
  img.fetchPriority = options.priority;
  img.decoding = 'async';
  img.src = url;

  return {
    cancel: () => {
      if (finished) return;
      detach();
      img.src = '';
    },
  };
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(forms-ng): preloadImage, one off-DOM image load with a bounded wait (#291)`
- [ ] **Step 6: Refactor `prefetchImages` onto it (no behaviour change).** Keep the cancelled flag, empty/Save-Data/cap logic and every log line verbatim. Replace `startNext`'s per-image block with:

> **Superseded during implementation (do not build from this snippet as written).** The shipped `image-prefetch.ts` is the authority; it keeps braced, multi-line `if` blocks. Behaviour is as below — `image-prefetch.spec.ts` is unmodified.

```ts
    const url = queue[index++];
    current = preloadImage(
      url,
      {
        priority: 'low',
        waitMs: PREFETCH_TIMEOUT_MS,
        onReady: (outcome) => {
          if (cancelled) return;
          if (outcome === 'timed out') {
            // Stop the queue, but leave the download running so it lands in the HTTP cache.
            current = null;
            console.debug(
              `[Forms] Image prefetch stopped: ${url} took longer than ${PREFETCH_TIMEOUT_MS} ms; skipped ${queue.length - index} remaining`,
            );
            return;
          }
          if (outcome === 'failed') console.debug(`[Forms] Image prefetch failed: ${url}`);
          startNext();
        },
      },
      env,
    );
```

`current` becomes `ImagePreload | null`; `handle.cancel()` calls `current?.cancel()` then nulls it (the `clearTimer`/`timer` locals go — `preloadImage` owns the timer). `browserEnv` = `{ ...browserImageEnv, saveData: () => … }`. `PrefetchImage` becomes `export type PrefetchImage = LoadableImage;` and `PrefetchEnv` `extends ImageLoadEnv`. Update the module header's last paragraph to point at `image-load.ts` for the timeout/abort rule.
- [ ] **Step 7: Run** `npx vitest run src/lib/widget/core/` → all pass with **`image-prefetch.spec.ts` unmodified** (`git diff --stat` must not list it).
- [ ] **Step 8: Commit** `refactor(forms-ng): build the prefetch queue on preloadImage (#291)`

---

### Task 4: `gateWelcomeScreen` — the pure welcome gate

**Files:** Create `packages/Angular/src/lib/widget/core/welcome-gate.ts`, `core/welcome-gate.spec.ts`

**Interfaces:**
- Consumes: `preloadImage`, `ImageLoadEnv`, `browserImageEnv` (Task 3).
- Produces:
> **Superseded during implementation (do not build from this snippet as written).** The shipped `welcome-gate.ts` is the authority: `reveal` takes `failed: ReadonlySet<string>`, the images the gate saw fail, so the shell does not render a logo it already saw fail and then drop it (PR #296 review).

```ts
export const WELCOME_IMAGE_WAIT_MS = 3000;
export interface WelcomeGateHooks {
  /** False once this load is stale (a newer load() ran) or the widget was destroyed. */
  isCurrent(): boolean;
  /** Stop waiting and show the welcome screen. Called at most once. */
  reveal(): void;
  /** Every gated image has finished (loaded or failed): later screens may use the network. Called at most once. */
  imagesSettled(): void;
}
export function gateWelcomeScreen(urls: readonly string[], hooks: WelcomeGateHooks, env?: ImageLoadEnv): void;
```

- [ ] **Step 1: Write the failing tests**

> **Superseded during implementation (do not build from this snippet as written).** The shipped `welcome-gate.spec.ts` is the authority: the stale-load test is named "…reveals nothing and starts no prefetch", and two tests pin `reveal(failed)` (PR #296 review).

```ts
import { describe, it, expect, vi } from 'vitest';
import { gateWelcomeScreen, WELCOME_IMAGE_WAIT_MS, type WelcomeGateHooks } from './welcome-gate';
import type { ImageLoadEnv, LoadableImage } from './image-load';

function fakeEnv() {
  const images: LoadableImage[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const env: ImageLoadEnv = {
    createImage: () => {
      const img: LoadableImage = { src: '', fetchPriority: 'auto', decoding: 'auto', onload: null, onerror: null };
      images.push(img);
      return img;
    },
    setTimeout: (fn, ms) => { const h = next++; timers.set(h, { fn, ms }); return h; },
    clearTimeout: (h) => { timers.delete(h); },
  };
  const fireTimers = (): void => { const t = [...timers.values()]; timers.clear(); t.forEach((x) => x.fn()); };
  return { env, images, timers, fireTimers };
}
const hooks = (current = true): WelcomeGateHooks & { reveal: ReturnType<typeof vi.fn>; imagesSettled: ReturnType<typeof vi.fn> } => ({
  isCurrent: () => current,
  reveal: vi.fn(),
  imagesSettled: vi.fn(),
});

describe('gateWelcomeScreen', () => {
  it('waits three seconds at most', () => {
    expect(WELCOME_IMAGE_WAIT_MS).toBe(3000);
  });

  it('asks for every gated image at high priority, with the 3 s wait', () => {
    const { env, images, timers } = fakeEnv();
    gateWelcomeScreen(['/welcome', '/logo'], hooks(), env);
    expect(images.map((i) => [i.src, i.fetchPriority])).toEqual([['/welcome', 'high'], ['/logo', 'high']]);
    expect([...timers.values()].every((t) => t.ms === WELCOME_IMAGE_WAIT_MS)).toBe(true);
  });

  it('asks once for a url listed twice', () => {
    const { env, images } = fakeEnv();
    gateWelcomeScreen(['/same', '/same'], hooks(), env);
    expect(images).toHaveLength(1);
  });

  it('reveals only when the LAST image is ready, then reports them settled', () => {
    const { env, images } = fakeEnv();
    const h = hooks();
    gateWelcomeScreen(['/welcome', '/logo'], h, env);
    images[0].onload?.(new Event('load'));
    expect(h.reveal).not.toHaveBeenCalled();
    images[1].onerror?.(new Event('error'));
    expect(h.reveal).toHaveBeenCalledTimes(1);
    expect(h.imagesSettled).toHaveBeenCalledTimes(1);
  });

  it('a stalled image reveals at the wait limit, and settles only when it really finishes', () => {
    const { env, images, fireTimers } = fakeEnv();
    const h = hooks();
    gateWelcomeScreen(['/welcome'], h, env);
    fireTimers();
    expect(h.reveal).toHaveBeenCalledTimes(1);
    expect(h.imagesSettled).not.toHaveBeenCalled();
    expect(images[0].src).toBe('/welcome'); // never aborted: the <img> about to render wants these bytes
    images[0].onload?.(new Event('load'));
    expect(h.reveal).toHaveBeenCalledTimes(1);
    expect(h.imagesSettled).toHaveBeenCalledTimes(1);
  });

  it('a stale or destroyed load reveals nothing and starts nothing', () => {
    const { env, images } = fakeEnv();
    const h = hooks(false);
    gateWelcomeScreen(['/welcome'], h, env);
    images[0].onload?.(new Event('load'));
    expect(h.reveal).not.toHaveBeenCalled();
    expect(h.imagesSettled).not.toHaveBeenCalled();
  });

  it('with nothing to wait for, reveals and settles at once', () => {
    const { env } = fakeEnv();
    const h = hooks();
    gateWelcomeScreen([], h, env);
    expect(h.reveal).toHaveBeenCalledTimes(1);
    expect(h.imagesSettled).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/widget/core/welcome-gate.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

> **Superseded during implementation (do not build from this snippet as written).** The shipped `welcome-gate.ts` is the authority: each URL's `onReady` records a `'failed'` outcome and `reveal(failed)` receives the set; a timed-out image is not reported (PR #296 review).

```ts
/**
 * Hold the welcome screen until its images are ready (#291).
 *
 * A welcome screen used to render its text at once and its image whenever the image arrived —
 * seconds later on Box-backed storage — pushing the text down when it did. The form's logo, which
 * sits above the welcome screen, had the same problem. So `<mj-form>` stays on its loading screen
 * while these load, and shows the welcome screen whole when the LAST of them is ready, or after
 * WELCOME_IMAGE_WAIT_MS, whichever comes first. A broken image counts as ready: it must never hold
 * the form hostage. Nothing is ever aborted — the real `<img>` is about to ask for the same URL.
 *
 * `imagesSettled` is separate from `reveal` so the later-screen prefetch still waits for the
 * welcome download itself, not just for the wait to run out.
 */
import { browserImageEnv, preloadImage, type ImageLoadEnv } from './image-load';

/** The longest a respondent looks at the loader before the welcome screen shows anyway. */
export const WELCOME_IMAGE_WAIT_MS = 3000;

export interface WelcomeGateHooks {
  isCurrent(): boolean;
  reveal(): void;
  imagesSettled(): void;
}

export function gateWelcomeScreen(urls: readonly string[], hooks: WelcomeGateHooks, env: ImageLoadEnv = browserImageEnv): void {
  const unique = [...new Set(urls)];
  let waitingReady = unique.length;
  let waitingSettled = unique.length;
  const readyOne = (): void => {
    if (--waitingReady === 0 && hooks.isCurrent()) hooks.reveal();
  };
  const settledOne = (): void => {
    if (--waitingSettled === 0 && hooks.isCurrent()) hooks.imagesSettled();
  };
  if (unique.length === 0) {
    waitingReady = waitingSettled = 1;
    readyOne();
    settledOne();
    return;
  }
  for (const url of unique) {
    preloadImage(url, { priority: 'high', waitMs: WELCOME_IMAGE_WAIT_MS, onReady: readyOne, onSettle: settledOne }, env);
  }
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(forms-ng): a welcome gate that waits for the welcome screen's images (#291)`

---

### Task 5: MJ logo loader, and wiring the gate into `<mj-form>`

**Files:**
- Create `packages/Angular/src/lib/widget/components/mj-loader.component.ts`, `components/mj-loader.spec.ts`
- Modify `packages/Angular/src/lib/widget/mj-form.component.ts`, `mj-form.component.html`, `components/form-screen.component.ts`, `image-prefetch.wiring.spec.ts`

**Interfaces:** consumes `gateWelcomeScreen` (Task 4). Produces `MjLoaderComponent` (`mjf-mj-loader`), and in `MjFormComponent`: `protected readonly waitingForWelcomeImage = signal(false)`, `protected readonly shownLogoUrl` (computed), `private loadGeneration = 0`.

- [ ] **Step 1: Write the failing tests.**

`mj-loader.spec.ts` (source smoke — the component cannot be compiled in node, as `icon.spec.ts` notes):

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const src = readFileSync(join(__dirname, 'mj-loader.component.ts'), 'utf8');

describe('mjf-mj-loader — source smoke', () => {
  it('draws the MJ mark inline, because the host page loads no icon font or MJ stylesheet', () => {
    expect(src).toContain("selector: 'mjf-mj-loader'");
    expect(src).toContain('viewBox="0 0 230 128"');
    expect(src).toContain('transform="translate(47.5625,10.875)"');
    expect(src).toContain('transform="translate(150,69)"');
    expect(src).not.toMatch(/\bfa-[a-z]/);
    expect(src).not.toContain('@memberjunction/ng-');
  });
  it('colours the mark from a token, never a literal', () => {
    expect(src).toMatch(/fill:\s*var\(--mjf-accent\)/);
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it('stops pulsing for a respondent who asked for reduced motion', () => {
    expect(src).toContain('prefers-reduced-motion: reduce');
  });
  it('is decorative: the status text beside it is what a screen reader announces', () => {
    expect(src).toContain('aria-hidden="true"');
  });
});
```

`image-prefetch.wiring.spec.ts` — remove the `mediaSettled` assertions (lines 33-37) and the `(mediaSettled)="onWelcomeMediaSettled()"` test (41-43); change `:48` to `load.indexOf('this.planPrefetch(def, opening)')` and `:63` to the signature `private planPrefetch(def: PublishedFormDefinition, opening: WidgetPhase): void` with the check `opening !== 'welcome' && opening !== 'ready'`; add:

> **Superseded during implementation (do not build from this snippet as written).** The shipped `image-prefetch.wiring.spec.ts` is the authority: it pins `const generation = ++this.loadGeneration`, `holdForWelcomeImages(welcomeImage, generation)`, planning before holding, and that a logo the gate saw fail is marked broken before the reveal.

```ts
describe('welcome gate wiring — source smoke (#291)', () => {
  it('gates only a load that opens on a welcome screen with an image', () => {
    const load = body(form, 'private async load(): Promise<void>');
    expect(load).toMatch(/opening === 'welcome' \? def\.welcomeScreen\?\.mediaURL/);
    expect(load).toContain('this.holdForWelcomeImages(');
  });
  it('every load starts a new generation and clears the wait', () => {
    const load = body(form, 'private async load(): Promise<void>');
    expect(load).toContain('this.loadGeneration++');
    expect(load).toContain('this.waitingForWelcomeImage.set(false)');
  });
  it('the gate is current only for this load and a live widget, and never overrides an author command', () => {
    const hold = body(form, 'private holdForWelcomeImages(welcomeImage: string): void');
    expect(hold).toContain('!this.destroyed && generation === this.loadGeneration');
    expect(hold).toContain("if (this.phase() === 'loading') this.phase.set('welcome')");
    expect(hold).toContain('imagesSettled: () => this.startPrefetch()');
  });
  it('the MJ loader shows only while waiting for the welcome images; the neutral spinner otherwise', () => {
    expect(html).toMatch(/@if \(waitingForWelcomeImage\(\)\) \{\s*<mjf-mj-loader \/>\s*\} @else \{\s*<span class="mjf-spinner"/);
  });
  it('the logo bar stays hidden while the gate waits, so it arrives with the welcome screen', () => {
    expect(html).toContain('@if (shownLogoUrl(); as logo)');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/widget/image-prefetch.wiring.spec.ts src/lib/widget/components/mj-loader.spec.ts` → FAIL.

- [ ] **Step 3: Implement.**

`mj-loader.component.ts` — copy the two `<path>` elements of the MJ mark verbatim **including their `transform` attributes** from `@memberjunction/ng-shared-generic@6.1.5` `dist/lib/loading/loading.component.js` (the `<svg viewBox="0 0 230 128">` in its template); drop only the gradient `@if` block, Angular bindings and `class`/`[attr.fill]` attributes. Both packages are BUSL-1.1 from the same owner.

> **Superseded during implementation (do not build from this snippet as written).** The shipped `mj-loader.component.ts` is the authority; only its doc comment's wording differs.

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The MemberJunction mark, pulsing — shown only while a form waits for its welcome screen's images
 * (#291, `core/welcome-gate.ts`). Every other wait keeps the neutral spinner. Inline SVG and own
 * CSS because this renders in the respondent widget's shadow root, on a page that loads no MJ
 * stylesheet or icon font; the shape is copied from `<mj-loading>` (`@memberjunction/ng-shared-generic`),
 * not imported, to keep the widget free of MJ Angular libraries.
 */
@Component({
  selector: 'mjf-mj-loader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: inline-flex; width: 5rem; height: 2.8rem; }
    svg { width: 100%; height: 100%; animation: mjf-mj-pulse 1.5s ease-in-out infinite; }
    path { fill: var(--mjf-accent); }
    @keyframes mjf-mj-pulse { 0%, 100% { opacity: 0.4; transform: scale(0.95); } 50% { opacity: 1; transform: scale(1); } }
    @media (prefers-reduced-motion: reduce) { svg { animation: none; opacity: 1; } }
  `],
  template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 128" aria-hidden="true" focusable="false">
    <path transform="translate(47.5625,10.875)" d="…copied…" />
    <path transform="translate(150,69)" d="…copied…" />
  </svg>`,
})
export class MjLoaderComponent {}
```

`mj-form.component.ts`:

> **Superseded during implementation (do not build from this snippet as written).** The shipped `mj-form.component.ts` is the authority; the import carries no trailing comment.

```ts
import { gateWelcomeScreen } from './core/welcome-gate';
import { MjLoaderComponent } from './components/mj-loader.component';   // add to `imports`

  /** True while a welcome screen waits for its images (core/welcome-gate.ts): the MJ loader shows. */
  protected readonly waitingForWelcomeImage = signal(false);
  /** The logo, held back while the welcome gate waits so it arrives with the welcome screen. */
  protected readonly shownLogoUrl = computed(() => (this.waitingForWelcomeImage() ? undefined : this.logoUrl()));
  /** Bumped by every load(): the welcome gate of an earlier load must not reveal this one. */
  private loadGeneration = 0;
```

In `load()`: as the first lines after `this.cancelPrefetch();` add `this.loadGeneration++;` and `this.waitingForWelcomeImage.set(false);`. Replace

```ts
      this.phase.set(this.adoptResume(loaded.resume, def, runtime) ?? initialPhaseFor(def));
      this.planPrefetch(def);
```

with

> **Superseded during implementation (do not build from this snippet as written).** The shipped `load()` is the authority: it captures `const generation = ++this.loadGeneration` at the start of `load()`, calls `planPrefetch(def, opening, gated)` BEFORE holding, and passes `generation` to `holdForWelcomeImages` (`2ec3f8c`, `21c4245`).

```ts
      const opening = this.adoptResume(loaded.resume, def, runtime) ?? initialPhaseFor(def);
      const welcomeImage = opening === 'welcome' ? def.welcomeScreen?.mediaURL?.trim() : undefined;
      if (welcomeImage) {
        this.holdForWelcomeImages(welcomeImage); // phase stays 'loading' until the gate reveals
      } else {
        this.phase.set(opening);
      }
      this.planPrefetch(def, opening);
```

New method (after `startIntake`), replacing `onWelcomeMediaSettled`:

> **Superseded during implementation (do not build from this snippet as written).** The shipped `holdForWelcomeImages(welcomeImage, generation)` is the authority: the generation is a parameter, `planPrefetch` takes `(def, opening, gated)`, and the gate's `reveal(failed)` first marks a logo the gate saw fail as broken (PR #296 review).

```ts
  /**
   * Keep the loader up until the welcome screen's image (and the form's logo, which sits above it)
   * is ready, or WELCOME_IMAGE_WAIT_MS passes — see core/welcome-gate.ts. A preview's showScreen()
   * during the wait moves the phase itself; the reveal then leaves that choice alone.
   */
  private holdForWelcomeImages(welcomeImage: string): void {
    const generation = this.loadGeneration;
    this.waitingForWelcomeImage.set(true);
    const logo = this.logoUrl();
    gateWelcomeScreen(logo ? [welcomeImage, logo] : [welcomeImage], {
      isCurrent: () => !this.destroyed && generation === this.loadGeneration,
      reveal: () => {
        this.waitingForWelcomeImage.set(false);
        if (this.phase() === 'loading') this.phase.set('welcome');
      },
      imagesSettled: () => this.startPrefetch(),
    });
  }
```

> **Superseded during implementation (do not build from this snippet as written).** The shipped `planPrefetch` takes a third parameter, `gated: boolean`: the caller decides whether the welcome gate holds, and `planPrefetch` only returns early when it does.

`planPrefetch(def: PublishedFormDefinition, opening: WidgetPhase)`: use `opening` instead of `this.phase()` in both checks; the welcome-with-image early return's comment now says *the welcome gate's `imagesSettled` starts it*. Update the `prefetch` field comment the same way. `startIntake()` keeps `this.startPrefetch()` (a respondent can tap Start while a timed-out image still downloads); update its comment — the trigger it backs up is now the gate, not `(mediaSettled)`.

`mj-form.component.html`: the logo bar's `@if (logoUrl(); as logo)` → `@if (shownLogoUrl(); as logo)`; the welcome case loses `(mediaSettled)="onWelcomeMediaSettled()"`; the loading case becomes

```html
    @case ('loading') {
      <div class="mjf-state" role="status" aria-live="polite">
        @if (waitingForWelcomeImage()) {
          <mjf-mj-loader />
        } @else {
          <span class="mjf-spinner" aria-hidden="true"></span>
        }
        <span>Loading form…</span>
      </div>
    }
```

`form-screen.component.ts`: delete `public readonly mediaSettled = output<void>();` and the `(load)`/`(error)` bindings on the `<img>` (keep `fetchpriority`, `decoding`); rewrite the comment above the `<img>`: priority still matters on the welcome screen because a gate that timed out leaves the download running; the prefetch trigger now lives in `core/welcome-gate.ts`. Remove `output` from its imports if now unused.

- [ ] **Step 4: Run** `cd packages/Angular && npx vitest run && npm run typecheck && npm run build` (`ngc` + widget bundle — vitest never compiles a component) and `cd ../.. && npm run lint:ui`. All pass.
- [ ] **Step 5: Commit** `fix(forms-ng): show the welcome screen with its images, not before them (#291)`

---

### Task 6: Guard mutants + changeset

**Files:** Modify `scripts/check-guard-mutants.mjs`; Create `.changeset/asset-cache-and-welcome-gate.md`

- [ ] **Step 1: Add four mutants** to `MUTANTS` (same shape as the existing entries):

> **Superseded during implementation (do not build from this snippet as written).** The shipped `check-guard-mutants.mjs` is the authority: the welcome-gate `find` strings read `hooks.reveal(failed)`, and two more mutants pin the PR #296 review fix (`welcome-gate/failure-not-reported`, `welcome-gate/known-broken-logo-rendered`).

```js
  // --- #291: the asset byte cache and the welcome gate ---------------------------------------
  {
    name: 'asset-cache/key-ignores-where-the-row-points',
    behaviour: 'kept bytes are found only under the id AND the provider and key the row names now',
    file: 'packages/Server/src/asset/asset.service.ts',
    find: '  return `${fileId.toUpperCase()}|${providerId.toUpperCase()}|${providerKey}`;',
    replace: '  return `${fileId.toUpperCase()}`;',
    suite: 'packages/Server',
    killedBy: ['src/asset/__tests__/asset.service.spec.ts'],
  },
  {
    name: 'asset-cache/no-single-flight',
    behaviour: 'concurrent first requests for one asset share one storage read',
    file: 'packages/Server/src/asset/asset-byte-cache.ts',
    find: '    if (pending) return pending;',
    replace: '    if (false && pending) return pending;',
    suite: 'packages/Server',
    killedBy: ['src/asset/__tests__/asset-byte-cache.spec.ts', 'src/asset/__tests__/asset.service.spec.ts'],
  },
  {
    name: 'welcome-gate/stale-load-reveals',
    behaviour: 'an earlier or destroyed load never reveals the welcome screen',
    file: 'packages/Angular/src/lib/widget/core/welcome-gate.ts',
    find: '    if (--waitingReady === 0 && hooks.isCurrent()) hooks.reveal();',
    replace: '    if (--waitingReady === 0) hooks.reveal();',
    suite: 'packages/Angular',
    killedBy: ['src/lib/widget/core/welcome-gate.spec.ts'],
  },
  {
    name: 'welcome-gate/first-image-reveals',
    behaviour: 'the welcome screen waits for the LAST of its images, not the first',
    file: 'packages/Angular/src/lib/widget/core/welcome-gate.ts',
    find: '    if (--waitingReady === 0 && hooks.isCurrent()) hooks.reveal();',
    replace: '    if (--waitingReady >= 0 && hooks.isCurrent()) hooks.reveal();',
    suite: 'packages/Angular',
    killedBy: ['src/lib/widget/core/welcome-gate.spec.ts'],
  },
```

(Check `scripts/check-guard-mutants.spec.mjs` for any count or name assertion that needs updating, and keep it green: `npm run lint:guard-mutants:test`.)

- [ ] **Step 2: Changeset**

> **Superseded during implementation (do not build from this snippet as written).** The shipped `.changeset/asset-cache-and-welcome-gate.md` is the authority: it also says a logo that fails to load is left out rather than shown and then removed (PR #296 review).

```md
---
"@mj-biz-apps/forms-server": patch
"@mj-biz-apps/forms-ng": patch
---

Uploaded form images load faster and the welcome screen no longer jumps (#291). `GET /forms/asset/<id>` now keeps a copy of each image it serves in memory (up to 50 MB in total, images up to 8 MB), so only the first request for an image on a server process reads it from the storage provider; on Box that read took about 3 seconds. An image an author uploads is kept from the upload itself. Concurrent first requests share one read, a failed read is not kept, and the check that the file is a live public asset still runs on every request. On a published form whose welcome screen has an image, the widget now keeps its loading screen — showing the MemberJunction logo — until that image and the form's logo have loaded, or 3 seconds have passed, and then shows the welcome screen whole. Every other loading state keeps the existing spinner.
```

- [ ] **Step 3: Run** `npm run lint:guard-mutants:test` (and `npm run lint:guard-mutants` from the main checkout only — it is meaningless in a worktree; record that).
- [ ] **Step 4: Commit** `test: guard mutants for the asset cache and welcome gate; changeset (#291)`

---

## Verification (run step 6)

`cd packages/Server && npx vitest run` · `cd packages/Angular && npx vitest run` · `npm run typecheck` · `TURBO_FORCE=1 pnpm run build` · `npm run lint:ui` · `npm run lint:distribution` · `npm run lint:guard-mutants:test`.

## Smoke (run step 7)

Private MJAPI for this branch on `:4131` per `~/Projects/mj-dev/WORKSPACE.md` §3 (`GRAPHQL_PORT=4131 MJAPI_PUBLIC_URL=http://localhost:4131`, `.env` sourced; confirm the readiness line names `:4131`). Latency simulated in the harness only — a `node --import` preload that wraps the storage driver's `GetObject` with a ~2.5 s delay; no product code, no DB writes. Check:
1. `curl -w %{time_total}` one asset three times: first ≈ 2.5 s, then < 0.1 s.
2. Upload through `POST /forms/asset` (`x-mj-api-key` on the private harness), then GET: < 0.1 s on the first GET; delete the test file afterwards.
3. Browser (Playwright, own Chromium), cold cache, a published form with a welcome image: MJ loader visible; title, image and logo appear together (title `offsetTop` unchanged after the image's `load`); one request for the welcome image; prefetch requests start after it.
4. Delay raised to 6 s: welcome screen shows at ≈ 3 s, image later (one shift — the accepted cap).
5. A form with no welcome image, and a resumed response: neutral spinner, no MJ loader, no added wait.

## Non-goals

Recording image dimensions; server-side warming from `/f/:slug` (B2); MJ storage-driver changes; caching respondent downloads; any header change on the asset route; gating endings or question screens.

## Known gaps

- A cold server cache (first view after a restart, on another host, or after eviction) with Box at ~2.5–3 s sits right at the 3 s cap: that respondent may still see the image arrive after the welcome text. B2 closes it.
- A welcome screen with a logo but no image is not gated; its logo can still pop in (pre-existing).
