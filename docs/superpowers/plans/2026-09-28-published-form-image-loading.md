# Published-form image loading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Images on published forms paint with their screen's text: shrink uploads in the builder, and prefetch later screens' images in the widget.

**Architecture:**
- **Part 1 (PR 1):** a deep module `builder/image-optimize.ts` behind the unchanged `FormAssetService.upload()`. It is pure decision functions plus an injectable browser codec.
- **Part 2 (PR 2):** a pure URL collector in `widget/core/asset-ref.ts`, a sequential, capped prefetch queue in `widget/core/image-prefetch.ts`, and start/stop wiring in `MjFormComponent` / `FormScreenComponent`.
- The two parts are independent and ship as two PRs from `next`.

**Tech Stack:** Angular 21 standalone components (signals, `input()`/`output()`), TypeScript 5.9 (`lib: es2022, dom`), Vitest in a **node** environment (no DOM, no Angular JIT), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-28-published-form-image-loading-design.md`. Read it before starting any task.

## Global Constraints

- Scope is `packages/Angular` (`@mj-biz-apps/forms-ng`) only. No server, schema, migration or metadata change.
- No new npm dependency.
- No `any`, no `as any`, and no `unknown` as a lazy alternative (CLAUDE.md rule 2).
- Never swallow an error. Every `catch` logs with context (what we were doing, and for which file or URL) or rethrows.
- Cap every loop or queue with a named constant, and handle hitting the cap explicitly.
- Comments capture the non-obvious *why*. Update any comment you make stale (for example `FormAssetService`'s header).
- `MAX_IMAGE_EDGE_PX = 1600`, `SKIP_BELOW_BYTES = 300 * 1024`, `WEBP_QUALITY = 0.82`, `JPEG_QUALITY = 0.85`.
- `MAX_PREFETCH_IMAGES = 12`, `PREFETCH_TIMEOUT_MS = 15_000`.
- One `patch` changeset per PR for `'@mj-biz-apps/forms-ng'` (`.claude/rules/changesets.md`).
- Tests are `.spec.ts`, colocated. Component wiring is checked by source-reading `*.wiring.spec.ts`, following `src/lib/builder/asset-ref-wiring.spec.ts`.
- Gates for every task:
  - `pnpm test` (Vitest);
  - `pnpm run typecheck`, which compiles the specs; Vitest does not typecheck;
  - for any task touching a component, `pnpm run build` (`ngc` with strictTemplates, then the widget bundle). The Vitest suite never compiles components.
- **Git:** never `git commit` unless Soham has approved commits for this run (CLAUDE.md rule 1). A "Commit" step below means: if approved, commit exactly the listed files; otherwise leave them unstaged and report the file list.
- **Never** run `pnpm install` inside the worktree or a package. Use `node scripts/link-worktree-deps.mjs` (Task 0).

## Review Focus

1. **A phone photo with EXIF rotation** (portrait shot stored landscape plus an orientation tag) must upload upright. Task 1 pins that the browser codec decodes with `imageOrientation: 'from-image'`.
2. **A transparent PNG on Safari**, where WebP encoding silently returns PNG, must stay PNG, not JPEG (JPEG turns transparency black). Task 1 pins `pickOutputType('image/png', 'image/png') === 'image/png'`, and pins that a returned blob already of the chosen type is not re-encoded.
3. **A very thin image** (for example 10 000 × 10) must not scale to a 0 px dimension, which would throw in the canvas. Task 1 pins `planResize` returning at least 1 px.
4. **A respondent who taps "Start" before the welcome image loads** must still get later images prefetched. Task 5 pins `startIntake()` starting the prefetch, and the once-per-load guard.
5. **The form reloading mid-prefetch** ("Try again", "Start over", or a new definition in the builder preview) must not leave the old queue running, or let a stale idle callback start one. Task 5 pins `cancelPrefetch()` in `load()` and `ngOnDestroy`, and the generation guard on the idle start.

---

## Task 0: Worktrees (main session, not a subagent)

Two isolated branches, both cut from `origin/next`.

- [ ] **Step 1: Create both worktrees**

```bash
cd ~/Projects/mj-dev/bizapps-forms
git fetch origin next
git worktree add -b perf/image-upload-optimize ../bizapps-forms-wt/image-upload-optimize origin/next
git worktree add -b perf/image-prefetch ../bizapps-forms-wt/image-prefetch origin/next
```

- [ ] **Step 2: Make each worktree buildable, then confirm a green baseline**

For each worktree `W` in `../bizapps-forms-wt/image-upload-optimize` and `../bizapps-forms-wt/image-prefetch`:

```bash
cd W && node scripts/link-worktree-deps.mjs && pnpm run build:packages
cd packages/Angular && pnpm test && pnpm run typecheck
```

Expected: tests pass and typecheck exits 0. If about 38 test files fail to import, `packages/Entities/dist` is missing: re-run `pnpm run build:packages`.

- [ ] **Step 3: Branch tracking**

Run `git -C W branch -vv`. Each branch must NOT track `origin/next`. Unset it with `git -C W branch --unset-upstream`; the upstream is set to `origin/<branch>` on first push, which happens outside this plan.

---

## Task 1: `image-optimize.ts` — decisions, codec seam, orchestration (PR 1)

**Worktree:** `../bizapps-forms-wt/image-upload-optimize`

**Files:**
- Create: `packages/Angular/src/lib/builder/image-optimize.ts`
- Test: `packages/Angular/src/lib/builder/image-optimize.spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `optimizeImageForUpload(file: File, codec?: ImageCodec): Promise<File>` (Task 2 calls it);
  - exported constants `MAX_IMAGE_EDGE_PX`, `SKIP_BELOW_BYTES`, `WEBP_QUALITY`, `JPEG_QUALITY`;
  - `planResize`, `pickOutputType`, `renameForType`;
  - the types `ImageCodec`, `DecodedImage`, `ResizePlan`, `OutputImageType`;
  - `browserCodec: ImageCodec`.

- [ ] **Step 1: Write the failing tests**

Create `packages/Angular/src/lib/builder/image-optimize.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  JPEG_QUALITY,
  MAX_IMAGE_EDGE_PX,
  SKIP_BELOW_BYTES,
  WEBP_QUALITY,
  optimizeImageForUpload,
  pickOutputType,
  planResize,
  renameForType,
  type DecodedImage,
  type ImageCodec,
} from './image-optimize';

const KB = 1024;

describe('planResize', () => {
  it('skips a GIF whatever its size, so an animation survives', () => {
    expect(planResize(4000, 3000, 4_000 * KB, 'image/gif')).toEqual({ action: 'skip' });
  });

  it('skips an image that is already small in both pixels and bytes', () => {
    expect(planResize(1200, 800, 200 * KB, 'image/jpeg')).toEqual({ action: 'skip' });
  });

  it('skips exactly at the edge cap when the bytes are small', () => {
    expect(planResize(MAX_IMAGE_EDGE_PX, 900, SKIP_BELOW_BYTES, 'image/png')).toEqual({ action: 'skip' });
  });

  it('re-encodes a heavy image that is within the edge cap at its own size (never upscales)', () => {
    expect(planResize(1408, 768, 927 * KB, 'image/jpeg')).toEqual({ action: 'resize', width: 1408, height: 768 });
  });

  it('caps a landscape photo on its width', () => {
    expect(planResize(4032, 3024, 3_000 * KB, 'image/jpeg')).toEqual({ action: 'resize', width: 1600, height: 1200 });
  });

  it('caps a portrait photo on its height', () => {
    expect(planResize(3024, 4032, 3_000 * KB, 'image/jpeg')).toEqual({ action: 'resize', width: 1200, height: 1600 });
  });

  it('never rounds a thin image down to a zero-pixel side', () => {
    const plan = planResize(10_000, 10, 400 * KB, 'image/png');
    expect(plan).toEqual({ action: 'resize', width: 1600, height: 2 });
    const thinner = planResize(100_000, 10, 400 * KB, 'image/png');
    expect(thinner).toEqual({ action: 'resize', width: 1600, height: 1 });
  });

  it('never returns a dimension larger than the input', () => {
    for (const [w, h] of [[1601, 1], [800, 600], [5000, 5000]] as const) {
      const plan = planResize(w, h, 1_000 * KB, 'image/jpeg');
      if (plan.action === 'resize') {
        expect(plan.width).toBeLessThanOrEqual(w);
        expect(plan.height).toBeLessThanOrEqual(h);
      }
    }
  });

  it('refuses non-positive or non-finite dimensions with a descriptive error', () => {
    expect(() => planResize(0, 100, 1, 'image/png')).toThrow(/invalid image dimensions 0×100/);
    expect(() => planResize(Number.NaN, 100, 1, 'image/png')).toThrow(/invalid image dimensions/);
  });
});

describe('pickOutputType', () => {
  it('keeps WebP when the browser encoded WebP', () => {
    expect(pickOutputType('image/jpeg', 'image/webp')).toBe('image/webp');
    expect(pickOutputType('image/png', 'image/webp')).toBe('image/webp');
  });

  it('falls back to JPEG for a JPEG source when WebP was refused (Safari returns PNG)', () => {
    expect(pickOutputType('image/jpeg', 'image/png')).toBe('image/jpeg');
  });

  it('falls back to PNG for every non-JPEG source, preserving transparency', () => {
    expect(pickOutputType('image/png', 'image/png')).toBe('image/png');
    expect(pickOutputType('image/webp', 'image/png')).toBe('image/png');
    expect(pickOutputType('image/png', '')).toBe('image/png');
  });
});

describe('renameForType', () => {
  it('swaps the extension for the output type', () => {
    expect(renameForType('photo.jpeg', 'image/webp')).toBe('photo.webp');
    expect(renameForType('Welcome Screen.PNG', 'image/jpeg')).toBe('Welcome Screen.jpg');
    expect(renameForType('logo.png', 'image/png')).toBe('logo.png');
  });

  it('adds an extension to a bare name and names a nameless file', () => {
    expect(renameForType('scan', 'image/webp')).toBe('scan.webp');
    expect(renameForType('', 'image/webp')).toBe('image.webp');
  });
});

/** A fake codec: records calls, returns blobs of a chosen size and type. */
function fakeCodec(opts: {
  width: number;
  height: number;
  encoded: Array<{ type: string; bytes: number }>;
  decodeError?: Error;
  encodeError?: Error;
}): ImageCodec & { encodeCalls: Array<{ width: number; height: number; type: string; quality: number | undefined }>; closed: number } {
  const encodeCalls: Array<{ width: number; height: number; type: string; quality: number | undefined }> = [];
  let call = 0;
  const codec = {
    encodeCalls,
    closed: 0,
    async decode(): Promise<DecodedImage> {
      if (opts.decodeError) {
        throw opts.decodeError;
      }
      return { width: opts.width, height: opts.height, source: {} as CanvasImageSource, close: () => { codec.closed++; } };
    },
    async encode(_img: DecodedImage, width: number, height: number, type: string, quality?: number): Promise<Blob> {
      encodeCalls.push({ width, height, type, quality });
      if (opts.encodeError) {
        throw opts.encodeError;
      }
      const out = opts.encoded[Math.min(call++, opts.encoded.length - 1)];
      return new Blob([new Uint8Array(out.bytes)], { type: out.type });
    },
  };
  return codec;
}

const jpeg = (bytes: number, name = 'welcome.jpg'): File =>
  new File([new Uint8Array(bytes)], name, { type: 'image/jpeg', lastModified: 1 });

describe('optimizeImageForUpload', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns a smaller WebP named after the original', async () => {
    const codec = fakeCodec({ width: 1408, height: 768, encoded: [{ type: 'image/webp', bytes: 150 * KB }] });
    const out = await optimizeImageForUpload(jpeg(927 * KB), codec);
    expect(out.type).toBe('image/webp');
    expect(out.name).toBe('welcome.webp');
    expect(out.size).toBe(150 * KB);
    expect(codec.encodeCalls).toEqual([{ width: 1408, height: 768, type: 'image/webp', quality: WEBP_QUALITY }]);
    expect(codec.closed).toBe(1);
  });

  it('re-encodes as JPEG when the browser refused WebP for a JPEG source', async () => {
    const codec = fakeCodec({
      width: 4032,
      height: 3024,
      encoded: [{ type: 'image/png', bytes: 2_000 * KB }, { type: 'image/jpeg', bytes: 180 * KB }],
    });
    const out = await optimizeImageForUpload(jpeg(3_000 * KB, 'IMG_0001.JPG'), codec);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.jpg');
    expect(codec.encodeCalls[1]).toEqual({ width: 1600, height: 1200, type: 'image/jpeg', quality: JPEG_QUALITY });
  });

  it('keeps the PNG the browser already returned instead of encoding twice (transparent PNG on Safari)', async () => {
    const png = new File([new Uint8Array(2_000 * KB)], 'logo.png', { type: 'image/png' });
    const codec = fakeCodec({ width: 3000, height: 1000, encoded: [{ type: 'image/png', bytes: 400 * KB }] });
    const out = await optimizeImageForUpload(png, codec);
    expect(out.type).toBe('image/png');
    expect(codec.encodeCalls).toHaveLength(1);
  });

  it('returns the original when the result would not be smaller', async () => {
    const original = jpeg(400 * KB);
    const codec = fakeCodec({ width: 1408, height: 768, encoded: [{ type: 'image/webp', bytes: 500 * KB }] });
    expect(await optimizeImageForUpload(original, codec)).toBe(original);
  });

  it('returns a GIF untouched without decoding it', async () => {
    const gif = new File([new Uint8Array(900 * KB)], 'party.gif', { type: 'image/gif' });
    const codec = fakeCodec({ width: 1, height: 1, encoded: [], decodeError: new Error('must not decode') });
    expect(await optimizeImageForUpload(gif, codec)).toBe(gif);
  });

  it('returns a small image untouched', async () => {
    const small = jpeg(100 * KB);
    const codec = fakeCodec({ width: 800, height: 600, encoded: [{ type: 'image/webp', bytes: 1 }] });
    expect(await optimizeImageForUpload(small, codec)).toBe(small);
    expect(codec.encodeCalls).toHaveLength(0);
  });

  it('uploads the original and warns with the file name when decoding fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const original = jpeg(927 * KB, 'broken.jpg');
    const codec = fakeCodec({ width: 1, height: 1, encoded: [], decodeError: new Error('The source image cannot be decoded.') });
    expect(await optimizeImageForUpload(original, codec)).toBe(original);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"broken.jpg"');
    expect(String(warn.mock.calls[0][0])).toContain('cannot be decoded');
  });

  it('uploads the original and warns when encoding fails, and still releases the bitmap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const original = jpeg(927 * KB);
    const codec = fakeCodec({ width: 1408, height: 768, encoded: [], encodeError: new Error('canvas.toBlob returned null') });
    expect(await optimizeImageForUpload(original, codec)).toBe(original);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(codec.closed).toBe(1);
  });
});

describe('browserCodec — source smoke (no canvas in the node test environment)', () => {
  const src = readFileSync(join(__dirname, 'image-optimize.ts'), 'utf8');

  it('decodes with EXIF orientation applied, so phone photos stay upright', () => {
    expect(src).toContain("imageOrientation: 'from-image'");
  });

  it('fails loudly, not silently, when the browser lacks createImageBitmap', () => {
    expect(src).toContain("typeof createImageBitmap !== 'function'");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd packages/Angular && pnpm exec vitest run src/lib/builder/image-optimize.spec.ts`
Expected: FAIL — `Failed to resolve import "./image-optimize"`.

- [ ] **Step 3: Write the implementation**

Create `packages/Angular/src/lib/builder/image-optimize.ts`:

```ts
/**
 * Shrinks an author's image in the browser before it is uploaded, so a published form does not
 * make every respondent download the original (bizapps-forms perf, 2026-09-28: a 927 KB welcome
 * photo painted 5.8 s after its text on Slow 4G; the server answered in 5 ms).
 *
 * Why in the builder and not on the server: server-side resizing needs a native image library
 * (`sharp`) on every host that installs Forms. The builder already holds the `File`, and every
 * modern browser can decode and re-encode it with a canvas.
 *
 * The contract is "never worse than today": anything this module cannot do (a GIF, a browser
 * without `createImageBitmap`, a file it cannot decode, a result that is not smaller) falls back
 * to the original file, which uploads exactly as before. The server's type and size checks remain
 * the authority.
 *
 * A plain module, not a component, so the decisions are testable in the package's node-only Vitest.
 */

/** Longest side, in pixels, after resizing. Screen media shows at most 352 CSS px (~1056 device px at 3×). */
export const MAX_IMAGE_EDGE_PX = 1600;
/** An image within the edge cap AND at or under this many bytes is uploaded as-is. */
export const SKIP_BELOW_BYTES = 300 * 1024;
export const WEBP_QUALITY = 0.82;
export const JPEG_QUALITY = 0.85;

export type OutputImageType = 'image/webp' | 'image/jpeg' | 'image/png';

export type ResizePlan = { action: 'skip' } | { action: 'resize'; width: number; height: number };

/** A decoded image and how to release it. `source` is whatever the codec's `encode` can draw. */
export interface DecodedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
  close(): void;
}

/** The browser seam. Tests pass a fake; production uses {@link browserCodec}. */
export interface ImageCodec {
  decode(file: Blob): Promise<DecodedImage>;
  encode(image: DecodedImage, width: number, height: number, type: OutputImageType, quality?: number): Promise<Blob>;
}

const EXTENSION: Readonly<Record<OutputImageType, string>> = {
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

function bareType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}

/** Decide whether and how to resize. Pure. Throws on dimensions no real image has. */
export function planResize(width: number, height: number, bytes: number, contentType: string): ResizePlan {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`invalid image dimensions ${width}×${height}`);
  }
  // Resizing a GIF keeps only its first frame, so an animated one would silently stop moving.
  if (bareType(contentType) === 'image/gif') {
    return { action: 'skip' };
  }
  const longest = Math.max(width, height);
  if (longest <= MAX_IMAGE_EDGE_PX && bytes <= SKIP_BELOW_BYTES) {
    return { action: 'skip' };
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE_PX / longest);
  return {
    action: 'resize',
    // At least 1 px: a 10 000 × 10 banner scales to a fraction of a pixel, and a 0-sized canvas throws.
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Which type to keep, given what the browser produced when asked for WebP.
 * Safari's canvas cannot encode WebP and returns PNG instead. A JPEG source then goes back to JPEG,
 * and everything else stays PNG, because JPEG would turn transparency black.
 */
export function pickOutputType(sourceType: string, encodedType: string): OutputImageType {
  if (bareType(encodedType) === 'image/webp') {
    return 'image/webp';
  }
  return bareType(sourceType) === 'image/jpeg' ? 'image/jpeg' : 'image/png';
}

/** `photo.jpeg` → `photo.webp`. The server stores this name on the `MJ: Files` row. */
export function renameForType(name: string, type: OutputImageType): string {
  const stem = name.replace(/\.[^./\\]*$/, '') || 'image';
  return `${stem}${EXTENSION[type]}`;
}

/** Draw onto a canvas and encode. OffscreenCanvas where available, a detached <canvas> otherwise. */
async function drawAndEncode(image: DecodedImage, width: number, height: number, type: OutputImageType, quality?: number): Promise<Blob> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('a 2D canvas context is not available');
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, 0, 0, width, height);
    return canvas.convertToBlob({ type, quality });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('a 2D canvas context is not available');
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.source, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))), type, quality);
  });
}

/** The production codec. */
export const browserCodec: ImageCodec = {
  async decode(file: Blob): Promise<DecodedImage> {
    if (typeof createImageBitmap !== 'function') {
      throw new Error('this browser has no createImageBitmap');
    }
    // `from-image` applies the EXIF orientation, so a portrait phone photo is not uploaded sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  },
  encode: drawAndEncode,
};

/**
 * Return a smaller version of `file` for upload, or `file` itself when it cannot do better.
 * Never rejects: a failure is logged with the file's name and the original is returned.
 */
export async function optimizeImageForUpload(file: File, codec: ImageCodec = browserCodec): Promise<File> {
  const sourceType = bareType(file.type);
  if (sourceType === 'image/gif') {
    return file; // checked before decoding: no point paying for a decode we will not use
  }
  let decoded: DecodedImage | undefined;
  try {
    decoded = await codec.decode(file);
    const plan = planResize(decoded.width, decoded.height, file.size, sourceType);
    if (plan.action === 'skip') {
      return file;
    }
    let blob = await codec.encode(decoded, plan.width, plan.height, 'image/webp', WEBP_QUALITY);
    const outputType = pickOutputType(sourceType, blob.type);
    // Re-encode only when the browser's answer is not already the type we are keeping; a PNG the
    // browser returned in place of WebP is kept as-is rather than encoded a second time.
    if (bareType(blob.type) !== outputType) {
      blob = await codec.encode(decoded, plan.width, plan.height, outputType, outputType === 'image/jpeg' ? JPEG_QUALITY : undefined);
    }
    if (blob.size >= file.size) {
      return file;
    }
    return new File([blob], renameForType(file.name, outputType), { type: outputType, lastModified: file.lastModified });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[Forms] Image optimization skipped for "${file.name}" (${file.type || 'unknown type'}, ${file.size} B): ${reason}`);
    return file;
  } finally {
    decoded?.close();
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd packages/Angular && pnpm exec vitest run src/lib/builder/image-optimize.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck, including the spec**

Run: `cd packages/Angular && pnpm run typecheck`
Expected: exit 0. `{} as CanvasImageSource` is a legal assertion, because `{}` is a supertype of every member of the union. If the compiler rejects it anyway, report the exact message rather than reaching for `unknown` or `any` (Global Constraints).

- [ ] **Step 6: Commit (only if approved; see Global Constraints)**

```bash
git add packages/Angular/src/lib/builder/image-optimize.ts packages/Angular/src/lib/builder/image-optimize.spec.ts
git commit -m "feat(forms-ng): shrink images in the browser before upload"
```

---

## Task 2: Use the optimizer in `FormAssetService.upload`, plus a changeset (PR 1)

**Worktree:** `../bizapps-forms-wt/image-upload-optimize`

**Files:**
- Modify: `packages/Angular/src/lib/builder/form-asset.service.ts` (the `upload` method, and the file header comment)
- Test: `packages/Angular/src/lib/builder/image-optimize.wiring.spec.ts` (create)
- Create: `.changeset/shrink-images-before-upload.md`

**Interfaces:**
- Consumes: `optimizeImageForUpload(file: File, codec?: ImageCodec): Promise<File>` from `./image-optimize` (Task 1).
- Produces: nothing new. `FormAssetService.upload(file, formId, onProgress?)` keeps its signature and its `Promise<UploadedAsset>` result.

- [ ] **Step 1: Write the failing wiring test**

Create `packages/Angular/src/lib/builder/image-optimize.wiring.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SOURCE-PRESENCE SMOKE: `FormAssetService` cannot be instantiated in this node environment
 * (XHR, Angular DI), so this guards the seam a refactor could silently drop. It checks that every
 * upload goes through the optimizer, and that the OPTIMIZED file, not the original, is what gets
 * sent. The behaviour itself is covered in `image-optimize.spec.ts`.
 */
const code = readFileSync(join(__dirname, 'form-asset.service.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('FormAssetService uses the image optimizer — source smoke', () => {
  it('imports the optimizer from its own module', () => {
    expect(code).toContain("import { optimizeImageForUpload } from './image-optimize'");
  });

  it('optimizes before building the multipart body, and sends the optimized file', () => {
    const optimizeAt = code.indexOf('await optimizeImageForUpload(file)');
    const buildAt = code.indexOf('buildAssetFormData(optimized, formId)');
    expect(optimizeAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(optimizeAt);
    expect(code).not.toContain('buildAssetFormData(file, formId)');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/Angular && pnpm exec vitest run src/lib/builder/image-optimize.wiring.spec.ts`
Expected: FAIL on the import assertion.

- [ ] **Step 3: Change `upload()`**

In `packages/Angular/src/lib/builder/form-asset.service.ts`, add next to the other imports:

```ts
import { optimizeImageForUpload } from './image-optimize';
```

Replace the `upload` method with:

```ts
  /**
   * Upload one image for a form. Resolves with the stored asset, or rejects with a usable Error.
   * The file is shrunk first (`image-optimize.ts`); when shrinking cannot help, the original is sent.
   */
  public async upload(file: File, formId: string, onProgress?: AssetUploadProgress): Promise<UploadedAsset> {
    // The API BASE, not its origin: an MJAPI reverse-proxied at `/api` takes the upload at
    // `/api/forms/asset`, and the bare origin would post past it (#270).
    const apiBase = resolveApiBase();
    if (!apiBase) {
      throw new Error('Cannot upload: the MemberJunction API location is not configured.');
    }
    const optimized = await optimizeImageForUpload(file);
    return this.send(`${apiBase}${ASSET_ROUTE}`, buildAssetFormData(optimized, formId), onProgress);
  }
```

(`async` + `throw` rejects exactly as the old `Promise.reject` did; callers are unchanged.)

In the file's header comment, after the paragraph that ends "…every renderer resolves that against the API it is talking to…", add:

```ts
 * Before sending, the image is shrunk in the browser (`image-optimize.ts`): at most 1600 px on its
 * longest side, re-encoded as WebP where the browser can. Published forms otherwise made every
 * respondent download the author's original, often a multi-megabyte phone photo.
```

- [ ] **Step 4: Run the package suite and the gates**

```bash
cd packages/Angular
pnpm test
pnpm run typecheck
pnpm run build
```

Expected: all pass. `pnpm test` includes the existing `form-asset.spec.ts` and `asset-ref-wiring.spec.ts`. The latter still asserts `resolveApiBase()` in `form-asset.service.ts`, which is unchanged.

- [ ] **Step 5: Add the changeset**

Create `.changeset/shrink-images-before-upload.md`:

```md
---
'@mj-biz-apps/forms-ng': patch
---

Images added in the form builder (welcome and ending screens, picture-choice options, logo, page background) are now shrunk in the browser before upload: at most 1600 px on the longest side, and re-encoded as WebP where the browser supports it (JPEG or PNG otherwise, so transparency is kept). A published form no longer makes each respondent download the author's original photo; a 927 KB welcome photo previously took 5.8 s longer than its text to appear on a slow mobile connection. GIFs, small images, and images that would not get smaller are uploaded unchanged. Images uploaded before this change keep their original size until they are re-uploaded.
```

- [ ] **Step 6: Commit (only if approved)**

```bash
git add packages/Angular/src/lib/builder/form-asset.service.ts packages/Angular/src/lib/builder/image-optimize.wiring.spec.ts .changeset/shrink-images-before-upload.md
git commit -m "feat(forms-ng): upload the shrunk image from every builder image field"
```

---

## Task 3: `collectLaterImageUrls` (PR 2)

**Worktree:** `../bizapps-forms-wt/image-prefetch`

**Files:**
- Modify: `packages/Angular/src/lib/widget/core/asset-ref.ts` (append a function after `resolveDefinitionForRender`)
- Test: `packages/Angular/src/lib/widget/core/asset-ref.spec.ts` (append a `describe`)

**Interfaces:**
- Consumes: `PublishedFormDefinition` from `@mj-biz-apps/forms-entities/contracts` (already imported in `asset-ref.ts`).
- Produces: `collectLaterImageUrls(def: PublishedFormDefinition): string[]` (Task 5 calls it).

- [ ] **Step 1: Write the failing tests**

Append to `packages/Angular/src/lib/widget/core/asset-ref.spec.ts`, and add `collectLaterImageUrls` to the existing import from `./asset-ref`:

```ts
describe('collectLaterImageUrls', () => {
  const opt = (id: string, displayOrder: number, imageURL?: string) => ({
    id,
    label: id,
    value: id,
    displayOrder,
    ...(imageURL ? { imageURL } : {}),
  });
  const question = (id: string, displayOrder: number, options: ReturnType<typeof opt>[]) => ({
    id,
    type: 'PictureChoice' as const,
    prompt: id,
    isRequired: false,
    displayOrder,
    options,
  });
  const screen = (id: string, screenType: 'Welcome' | 'Ending', displayOrder: number, mediaURL?: string) => ({
    id,
    screenType,
    title: id,
    displayOrder,
    ...(mediaURL ? { mediaURL } : {}),
  });
  const base = (over: Partial<PublishedFormDefinition>): PublishedFormDefinition =>
    ({
      formId: 'f',
      formVersionId: 'v',
      name: 'n',
      renderMode: 'Scroll',
      settings: {},
      styleTokens: { cssVariables: {} },
      pages: [],
      endScreens: [],
      ...over,
    }) as PublishedFormDefinition;

  it('lists option images, then ending images, in the order the respondent meets them', () => {
    const def = base({
      // Pages, questions and endings are stored out of order on purpose: the renderer sorts those by
      // displayOrder, so the prefetch must too. Options are NOT sorted by the renderer
      // (`form-question.component.html` iterates `q.options`), so they stay in array order: b, then a.
      pages: [
        { id: 'p2', displayOrder: 1, questions: [question('q3', 0, [opt('e', 0, '/img/e')])] },
        {
          id: 'p1',
          displayOrder: 0,
          questions: [
            question('q2', 1, [opt('d', 0, '/img/d')]),
            question('q1', 0, [opt('b', 1, '/img/b'), opt('a', 0, '/img/a')]),
          ],
        },
      ],
      endScreens: [screen('end2', 'Ending', 1, '/img/end2'), screen('end1', 'Ending', 0, '/img/end1')],
    });
    expect(collectLaterImageUrls(def)).toEqual(['/img/b', '/img/a', '/img/d', '/img/e', '/img/end1', '/img/end2']);
  });

  it('leaves out the welcome image, the logo and CSS assets: the first screen loads those itself', () => {
    const def = base({
      welcomeScreen: screen('w', 'Welcome', 0, '/img/welcome'),
      styleTokens: { cssVariables: { '--mjf-page-bg-image': 'url(/img/bg)' }, logoURL: '/img/logo' },
      endScreens: [screen('end', 'Ending', 0, '/img/end')],
    });
    expect(collectLaterImageUrls(def)).toEqual(['/img/end']);
  });

  it('drops duplicates, keeping the first place an image is needed', () => {
    const def = base({
      pages: [{ id: 'p', displayOrder: 0, questions: [question('q', 0, [opt('a', 0, '/img/same'), opt('b', 1, '/img/same')])] }],
      endScreens: [screen('end', 'Ending', 0, '/img/same')],
    });
    expect(collectLaterImageUrls(def)).toEqual(['/img/same']);
  });

  it('skips options and endings without an image, and returns [] for a form with none', () => {
    const def = base({
      pages: [{ id: 'p', displayOrder: 0, questions: [question('q', 0, [opt('a', 0)])] }],
      endScreens: [screen('end', 'Ending', 0)],
    });
    expect(collectLaterImageUrls(def)).toEqual([]);
    expect(collectLaterImageUrls(base({}))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd packages/Angular && pnpm exec vitest run src/lib/widget/core/asset-ref.spec.ts`
Expected: FAIL — `collectLaterImageUrls` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/Angular/src/lib/widget/core/asset-ref.ts`:

```ts
/** Ascending by `displayOrder`, without mutating the input (the renderer sorts pages, questions and endings the same way). */
function byDisplayOrder<T extends { displayOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * The images a respondent sees AFTER the first screen, in the order they will see them: every
 * question option's image (pages and questions by `displayOrder`, matching `form-runtime.ts` and
 * `section-content.ts`; options in published array order, because the renderer does not sort them),
 * then every ending screen's image by `displayOrder`. All endings are
 * included because which one shows depends on the answers.
 *
 * Deliberately excludes the welcome image, the logo and CSS assets: the first screen requests
 * those itself, and listing them would queue a second request for bytes already in flight.
 *
 * Call it on the definition AFTER {@link resolveDefinitionForRender}, so the URLs point at the
 * API this widget is talking to — the same URLs its `<img>` tags will ask for, which is what lets
 * the browser cache serve them.
 */
export function collectLaterImageUrls(def: PublishedFormDefinition): string[] {
  const urls: string[] = [];
  for (const page of byDisplayOrder(def.pages)) {
    for (const question of byDisplayOrder(page.questions)) {
      for (const option of question.options) {
        if (option.imageURL) {
          urls.push(option.imageURL);
        }
      }
    }
  }
  for (const ending of byDisplayOrder(def.endScreens)) {
    if (ending.mediaURL) {
      urls.push(ending.mediaURL);
    }
  }
  return [...new Set(urls)];
}
```

- [ ] **Step 4: Run the tests and the typecheck**

```bash
cd packages/Angular
pnpm exec vitest run src/lib/widget/core/asset-ref.spec.ts
pnpm run typecheck
```

Expected: PASS, exit 0. If the typecheck rejects the spec's hand-built definition (for example a missing required field on `PublishedFormDefinition`), add the missing field to `base()`. Do not loosen the types.

- [ ] **Step 5: Commit (only if approved)**

```bash
git add packages/Angular/src/lib/widget/core/asset-ref.ts packages/Angular/src/lib/widget/core/asset-ref.spec.ts
git commit -m "feat(forms-ng): list the images a respondent sees after the first screen"
```

---

## Task 4: `image-prefetch.ts` — sequential, capped, cancellable queue (PR 2)

**Worktree:** `../bizapps-forms-wt/image-prefetch`

**Files:**
- Create: `packages/Angular/src/lib/widget/core/image-prefetch.ts`
- Test: `packages/Angular/src/lib/widget/core/image-prefetch.spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (Task 5 uses `prefetchImages` and `PrefetchHandle`):
  - `prefetchImages(urls: readonly string[], env?: PrefetchEnv): PrefetchHandle`
  - `interface PrefetchHandle { cancel(): void }`
  - `interface PrefetchEnv`
  - `interface PrefetchImage`
  - constants `MAX_PREFETCH_IMAGES`, `PREFETCH_TIMEOUT_MS`

- [ ] **Step 1: Write the failing tests**

Create `packages/Angular/src/lib/widget/core/image-prefetch.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_PREFETCH_IMAGES,
  PREFETCH_TIMEOUT_MS,
  prefetchImages,
  type PrefetchEnv,
  type PrefetchImage,
} from './image-prefetch';

/** A fake image: records what the queue set, and lets the test fire load/error by hand. */
class FakeImage implements PrefetchImage {
  public src = '';
  public fetchPriority: 'high' | 'low' | 'auto' = 'auto';
  public decoding: 'async' | 'sync' | 'auto' = 'auto';
  public onload: ((ev: Event) => void) | null = null;
  public onerror: ((ev: Event) => void) | null = null;
  public load(): void { this.onload?.(new Event('load')); }
  public fail(): void { this.onerror?.(new Event('error')); }
}

function fakeEnv(opts: { saveData?: boolean } = {}) {
  const images: FakeImage[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const env: PrefetchEnv = {
    createImage: () => { const img = new FakeImage(); images.push(img); return img; },
    setTimeout: (fn, _ms) => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    saveData: () => opts.saveData === true,
  };
  const fireTimers = (): void => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  return { env, images, timers, fireTimers };
}

const urls = (n: number): string[] => Array.from({ length: n }, (_, i) => `/forms/asset/img-${i}`);

describe('prefetchImages', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requests one image at a time, in order, at low priority', () => {
    const { env, images } = fakeEnv();
    prefetchImages(urls(3), env);
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe('/forms/asset/img-0');
    expect(images[0].fetchPriority).toBe('low');
    expect(images[0].decoding).toBe('async');
    images[0].load();
    expect(images.map((i) => i.src)).toEqual(['/forms/asset/img-0', '/forms/asset/img-1']);
    images[1].load();
    images[2].load();
    expect(images).toHaveLength(3);
  });

  it(`stops at ${MAX_PREFETCH_IMAGES} images and says how many it skipped`, () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { env, images } = fakeEnv();
    prefetchImages(urls(MAX_PREFETCH_IMAGES + 1), env);
    for (let i = 0; i < MAX_PREFETCH_IMAGES + 1 && images[i]; i++) {
      images[i].load();
    }
    expect(images).toHaveLength(MAX_PREFETCH_IMAGES);
    expect(debug).toHaveBeenCalledWith(`[Forms] Image prefetch capped at ${MAX_PREFETCH_IMAGES}; skipped 1`);
  });

  it('moves on when an image fails, and logs the URL', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { env, images } = fakeEnv();
    prefetchImages(urls(2), env);
    images[0].fail();
    expect(images).toHaveLength(2);
    expect(debug).toHaveBeenCalledWith('[Forms] Image prefetch failed: /forms/asset/img-0');
  });

  it(`abandons an image that stalls for ${PREFETCH_TIMEOUT_MS} ms and starts the next`, () => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { env, images, fireTimers } = fakeEnv();
    prefetchImages(urls(2), env);
    fireTimers();
    expect(images[0].src).toBe('');
    expect(images).toHaveLength(2);
    expect(images[1].src).toBe('/forms/asset/img-1');
  });

  it('a late load after the timeout does not start a second copy of the next image', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { env, images, fireTimers } = fakeEnv();
    prefetchImages(urls(3), env);
    fireTimers();
    images[0].load();
    expect(images).toHaveLength(2);
  });

  it('requests nothing when the browser asked to save data', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { env, images } = fakeEnv({ saveData: true });
    prefetchImages(urls(3), env);
    expect(images).toHaveLength(0);
    expect(debug).toHaveBeenCalledWith('[Forms] Image prefetch skipped: the browser asked to save data');
  });

  it('cancel() stops the queue, clears the timer and the in-flight image, and is idempotent', () => {
    const { env, images, timers } = fakeEnv();
    const handle = prefetchImages(urls(3), env);
    handle.cancel();
    expect(images[0].src).toBe('');
    expect(timers.size).toBe(0);
    images[0].load();
    expect(images).toHaveLength(1);
    expect(() => handle.cancel()).not.toThrow();
  });

  it('does nothing for an empty list', () => {
    const { env, images } = fakeEnv();
    prefetchImages([], env).cancel();
    expect(images).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd packages/Angular && pnpm exec vitest run src/lib/widget/core/image-prefetch.spec.ts`
Expected: FAIL — `Failed to resolve import "./image-prefetch"`.

- [ ] **Step 3: Implement**

Create `packages/Angular/src/lib/widget/core/image-prefetch.ts`:

```ts
/**
 * Warm the browser cache with images the respondent will see on LATER screens, so a question
 * page or an ending screen does not wait for its image after it appears. Measured 2026-09-28 on
 * Slow 4G: an ending image painted 6.0 s after its text, because nothing asked for it until then.
 *
 * Why this works: asset responses are `Cache-Control: public, max-age=31536000, immutable`, so an
 * `<img>` created later with the same URL is served from cache with no request.
 *
 * One image at a time, on purpose. On a slow connection, parallel downloads split the bandwidth
 * with whatever the respondent is doing now, including submitting. A failed or stalled image is
 * skipped; the real `<img>` on that screen deals with its own failure.
 */

/** Most images one form load will prefetch. */
export const MAX_PREFETCH_IMAGES = 12;
/** An image still downloading after this long is abandoned so the queue keeps moving. */
export const PREFETCH_TIMEOUT_MS = 15_000;

/** The slice of `HTMLImageElement` the queue uses; a real `Image` satisfies it. */
export interface PrefetchImage {
  src: string;
  fetchPriority: 'high' | 'low' | 'auto';
  decoding: 'async' | 'sync' | 'auto';
  onload: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

/** Everything browser-specific, injectable so the queue is testable in node. */
export interface PrefetchEnv {
  createImage(): PrefetchImage;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  /** True when the respondent's browser asked sites to save data. */
  saveData(): boolean;
}

export interface PrefetchHandle {
  /** Stop the queue and abandon the in-flight image. Safe to call more than once. */
  cancel(): void;
}

/** `navigator.connection` is not in TypeScript's DOM lib (Chromium-only API). */
type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean } };

const browserEnv: PrefetchEnv = {
  createImage: () => new Image(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
  saveData: () => (navigator as NavigatorWithConnection).connection?.saveData === true,
};

/** Start prefetching `urls` in order. Returns a handle that stops it. */
export function prefetchImages(urls: readonly string[], env: PrefetchEnv = browserEnv): PrefetchHandle {
  let cancelled = false;
  let current: PrefetchImage | null = null;
  let timer: number | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      env.clearTimeout(timer);
      timer = null;
    }
  };
  const handle: PrefetchHandle = {
    cancel: () => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      clearTimer();
      if (current) {
        current.onload = null;
        current.onerror = null;
        current.src = '';
        current = null;
      }
    },
  };

  if (urls.length === 0) {
    return handle;
  }
  if (env.saveData()) {
    console.debug('[Forms] Image prefetch skipped: the browser asked to save data');
    return handle;
  }
  const queue = urls.slice(0, MAX_PREFETCH_IMAGES);
  if (urls.length > MAX_PREFETCH_IMAGES) {
    console.debug(`[Forms] Image prefetch capped at ${MAX_PREFETCH_IMAGES}; skipped ${urls.length - MAX_PREFETCH_IMAGES}`);
  }

  let index = 0;
  const startNext = (): void => {
    if (cancelled || index >= queue.length) {
      current = null;
      return;
    }
    const url = queue[index++];
    const img = env.createImage();
    current = img;
    let settled = false;
    const settle = (outcome: 'loaded' | 'failed' | 'timed out'): void => {
      if (settled || cancelled) {
        return;
      }
      settled = true;
      clearTimer();
      img.onload = null;
      img.onerror = null;
      if (outcome === 'failed') {
        console.debug(`[Forms] Image prefetch failed: ${url}`);
      } else if (outcome === 'timed out') {
        img.src = ''; // after the handlers are detached, so the abort's own error event is ignored
        console.debug(`[Forms] Image prefetch timed out after ${PREFETCH_TIMEOUT_MS} ms: ${url}`);
      }
      startNext();
    };
    img.onload = () => settle('loaded');
    img.onerror = () => settle('failed');
    timer = env.setTimeout(() => settle('timed out'), PREFETCH_TIMEOUT_MS);
    img.fetchPriority = 'low';
    img.decoding = 'async';
    img.src = url;
  };

  startNext();
  return handle;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

```bash
cd packages/Angular
pnpm exec vitest run src/lib/widget/core/image-prefetch.spec.ts
pnpm run typecheck
```

Expected: PASS, exit 0. If `new Image()` is rejected as not assignable to `PrefetchImage` (for example because of the event-handler `this` typing), keep `PrefetchImage` as it is and write `createImage: (): PrefetchImage => new Image()`. If that still fails, report the exact compiler message. Do not use `any`.

- [ ] **Step 5: Commit (only if approved)**

```bash
git add packages/Angular/src/lib/widget/core/image-prefetch.ts packages/Angular/src/lib/widget/core/image-prefetch.spec.ts
git commit -m "feat(forms-ng): sequential, capped image prefetch queue"
```

---

## Task 5: Start and stop the prefetch; welcome image first, plus a changeset (PR 2)

**Worktree:** `../bizapps-forms-wt/image-prefetch`

**Files:**
- Modify: `packages/Angular/src/lib/widget/components/form-screen.component.ts` (the `<img>` at ~line 222, and the class near `activated` at ~line 270)
- Modify: `packages/Angular/src/lib/widget/mj-form.component.ts`:
  - imports (~line 46);
  - fields (near `private autosave`, ~line 305);
  - `ngOnDestroy` (~line 327);
  - `load()` (~lines 332-379);
  - `startIntake()` (~line 461)
- Modify: `packages/Angular/src/lib/widget/mj-form.component.html` (the welcome case, ~line 111)
- Test: `packages/Angular/src/lib/widget/image-prefetch.wiring.spec.ts` (create)
- Create: `.changeset/prefetch-later-form-images.md`

**Interfaces:**
- Consumes:
  - `collectLaterImageUrls(def: PublishedFormDefinition): string[]` from `./core/asset-ref` (Task 3);
  - `prefetchImages(urls: readonly string[], env?: PrefetchEnv): PrefetchHandle` and `type PrefetchHandle` from `./core/image-prefetch` (Task 4).
- Produces: `FormScreenComponent.mediaSettled` (`output<void>()`).

- [ ] **Step 1: Write the failing wiring test**

Create `packages/Angular/src/lib/widget/image-prefetch.wiring.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SOURCE-PRESENCE SMOKE for the prefetch lifecycle. These components cannot be instantiated in the
 * node test environment, so this guards the seams a refactor could silently drop:
 * - a queue that is never started;
 * - one started twice;
 * - one left running after the form reloads;
 * - a welcome image that loses its head start.
 * The queue's behaviour is covered in `core/image-prefetch.spec.ts`.
 */
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (file: string): string => strip(readFileSync(join(__dirname, file), 'utf8'));
const screen = read('components/form-screen.component.ts');
const form = read('mj-form.component.ts');
const html = readFileSync(join(__dirname, 'mj-form.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

/** The body of a method, from its signature to the next method-level closing brace. */
function body(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  const end = source.indexOf('\n  }\n', start);
  return source.slice(start, end);
}

describe('welcome image priority — source smoke', () => {
  it('asks for high priority only on the welcome screen', () => {
    expect(screen).toContain(`[attr.fetchpriority]="isWelcome() ? 'high' : null"`);
  });

  it('reports the image settling on load AND on error, so a broken image still releases the queue', () => {
    expect(screen).toContain('(load)="mediaSettled.emit()"');
    expect(screen).toContain('(error)="mediaSettled.emit()"');
    expect(screen).toContain('public readonly mediaSettled = output<void>()');
  });
});

describe('prefetch lifecycle — source smoke', () => {
  it('the welcome case starts the prefetch when its image settles', () => {
    expect(html).toContain('(mediaSettled)="onWelcomeMediaSettled()"');
  });

  it('load() cancels the previous queue before anything else can start one', () => {
    const load = body(form, 'private async load(): Promise<void>');
    expect(load).toContain('this.cancelPrefetch()');
    expect(load.indexOf('this.cancelPrefetch()')).toBeLessThan(load.indexOf('this.planPrefetch(def)'));
  });

  it('ngOnDestroy cancels the queue', () => {
    expect(body(form, 'public ngOnDestroy(): void')).toContain('this.cancelPrefetch()');
  });

  it('leaving the welcome screen early still starts the prefetch', () => {
    expect(body(form, 'protected startIntake(): void')).toContain('this.startPrefetch()');
  });

  it('starts at most once per load', () => {
    const start = body(form, 'private startPrefetch(): void');
    expect(start).toContain('if (this.prefetchStarted)');
    expect(start).toContain('this.prefetchStarted = true');
  });

  it('a stale idle callback from an earlier load cannot start a queue', () => {
    const schedule = body(form, 'private schedulePrefetchWhenIdle(): void');
    expect(schedule).toContain('const generation = this.prefetchGeneration');
    expect(schedule).toContain('generation === this.prefetchGeneration');
    expect(body(form, 'private cancelPrefetch(): void')).toContain('this.prefetchGeneration++');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/Angular && pnpm exec vitest run src/lib/widget/image-prefetch.wiring.spec.ts`
Expected: FAIL on the first assertion.

- [ ] **Step 3: Update `FormScreenComponent`**

In `packages/Angular/src/lib/widget/components/form-screen.component.ts`, replace the media `<img>` line:

```html
        <img class="mjf-screen__media" [src]="s.mediaURL" alt="" />
```

with:

```html
        <!--
          fetchpriority only on the welcome screen: it is the first thing a respondent sees, and it
          competes with the rest of the page for bandwidth. By the time an ending shows, its image
          has been prefetched (core/image-prefetch.ts). (load)/(error) both report "settled", so a
          broken image still lets the prefetch queue start.
        -->
        <img
          class="mjf-screen__media"
          [src]="s.mediaURL"
          alt=""
          decoding="async"
          [attr.fetchpriority]="isWelcome() ? 'high' : null"
          (load)="mediaSettled.emit()"
          (error)="mediaSettled.emit()"
        />
```

Directly after `public readonly activated = output<void>();`, add:

```ts
  /**
   * This screen's image finished loading, or failed. The shell starts prefetching later screens'
   * images only after this, so they do not take bandwidth from the image the respondent sees now.
   */
  public readonly mediaSettled = output<void>();
```

- [ ] **Step 4: Update `MjFormComponent`**

In `packages/Angular/src/lib/widget/mj-form.component.ts`, first change the imports.

Change the existing line

```ts
import { resolveDefinitionForRender, resolveStyleTokensForRender } from './core/asset-ref';
```

to

```ts
import { collectLaterImageUrls, resolveDefinitionForRender, resolveStyleTokensForRender } from './core/asset-ref';
import { prefetchImages, type PrefetchHandle } from './core/image-prefetch';
```

Next, the fields. After `private autosave: AutosaveController | null = null;`, add:

```ts
  /**
   * Prefetch of later screens' images (core/image-prefetch.ts). One queue per load: `load()`
   * cancels it first, and `prefetchGeneration` makes an idle callback scheduled by an EARLIER load
   * a no-op.
   */
  private prefetch: PrefetchHandle | undefined;
  private prefetchUrls: string[] = [];
  private prefetchStarted = false;
  private prefetchGeneration = 0;
```

Next, `ngOnDestroy`. Change it to:

```ts
  public ngOnDestroy(): void {
    this.autosave?.dispose();
    this.cancelPrefetch();
  }
```

Next, `load()`. As the first statement inside `load()`, before `this.phase.set('loading');`, add:

```ts
    this.cancelPrefetch();
```

Then, directly after the line

```ts
      this.phase.set(this.adoptResume(loaded.resume, def, runtime) ?? initialPhaseFor(def));
```

add:

```ts
      this.planPrefetch(def);
```

Next, `startIntake()`. Change it to:

```ts
  protected startIntake(): void {
    if (this.phase() === 'welcome') {
      this.phase.set('ready');
      // Leaving the welcome screen before its image settled destroys the screen, so its
      // (mediaSettled) will never fire. Start here instead; startPrefetch() runs once per load.
      this.startPrefetch();
    }
  }
```

Finally, add these methods directly after `startIntake()`:

```ts
  /** The welcome image loaded or failed: later screens' images may now use the network. */
  protected onWelcomeMediaSettled(): void {
    this.startPrefetch();
  }

  /**
   * Decide when this load's prefetch starts. A welcome screen with an image gets the network to
   * itself until that image settles (or the respondent leaves it). In every other case (no welcome
   * screen, no welcome image, resumed past it), start when the browser is idle.
   */
  private planPrefetch(def: PublishedFormDefinition): void {
    this.prefetchUrls = collectLaterImageUrls(def);
    if (this.phase() === 'welcome' && def.welcomeScreen?.mediaURL) {
      return;
    }
    this.schedulePrefetchWhenIdle();
  }

  private schedulePrefetchWhenIdle(): void {
    const generation = this.prefetchGeneration;
    const start = (): void => {
      if (generation === this.prefetchGeneration) {
        this.startPrefetch();
      }
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(start);
    } else {
      setTimeout(start, 0); // Safari before 18 has no requestIdleCallback
    }
  }

  private startPrefetch(): void {
    if (this.prefetchStarted) {
      return;
    }
    this.prefetchStarted = true;
    this.prefetch = prefetchImages(this.prefetchUrls);
  }

  private cancelPrefetch(): void {
    this.prefetchGeneration++;
    this.prefetch?.cancel();
    this.prefetch = undefined;
    this.prefetchStarted = false;
    this.prefetchUrls = [];
  }
```

If `PublishedFormDefinition` is not already imported as a type in this file, add it to the existing `@mj-biz-apps/forms-entities/contracts` type import. Do not add a second import line from that module.

- [ ] **Step 5: Wire the template**

In `packages/Angular/src/lib/widget/mj-form.component.html`, in the `@case ('welcome')` block, change:

```html
        <mjf-form-screen [screen]="ws" (activated)="startIntake()" />
```

to:

```html
        <mjf-form-screen [screen]="ws" (activated)="startIntake()" (mediaSettled)="onWelcomeMediaSettled()" />
```

Leave the `@case ('done')` ending `<mjf-form-screen>` unchanged. Its image is prefetched, so it needs no binding.

- [ ] **Step 6: Run the suite and all three gates**

```bash
cd packages/Angular
pnpm exec vitest run src/lib/widget/image-prefetch.wiring.spec.ts
pnpm test
pnpm run typecheck
pnpm run build
```

Expected:
- all pass;
- `pnpm run build` compiles the templates under strictTemplates, which is the only gate that checks `(mediaSettled)` and `[attr.fetchpriority]`;
- `src/lib/widget/components/icon.spec.ts` still passes, since no `fa-*` class was added.

- [ ] **Step 7: Add the changeset**

Create `.changeset/prefetch-later-form-images.md`:

```md
---
'@mj-biz-apps/forms-ng': patch
---

Published forms now load the images for later screens in the background, so picture-choice options and ending-screen images appear with their screen instead of several seconds after it on a slow mobile connection. Prefetching waits until the welcome image has loaded (the welcome image is also requested at high priority), fetches one image at a time so it never slows down what the respondent is doing, stops after 12 images, and is skipped entirely when the respondent's browser asks to save data.
```

- [ ] **Step 8: Commit (only if approved)**

```bash
git add packages/Angular/src/lib/widget/components/form-screen.component.ts packages/Angular/src/lib/widget/mj-form.component.ts packages/Angular/src/lib/widget/mj-form.component.html packages/Angular/src/lib/widget/image-prefetch.wiring.spec.ts .changeset/prefetch-later-form-images.md
git commit -m "feat(forms-ng): prefetch later screens' images after the welcome image"
```

---

## Task 6: Real-browser verification (main session, after the branch reviews)

Not delegated. It needs the shared hosts, the database, and one browser, which is an exclusive lock.

- [ ] **Step 1: Unblock Explorer.** Rebuild bizapps-caliber's Angular package (`pnpm --filter <caliber angular package> run build` from `~/Projects/mj-dev`), then confirm `/tmp/mj-explorer.log` shows a fresh `Application bundle generation complete`. If caliber fails to build against MJ `next`, stop and report it; it is out of scope.
- [ ] **Step 2: PR 1 upload check.** Serve the PR 1 branch's builder in Explorer; the workspace links forms-ng from the main checkout, so switch the main checkout to the branch or link the worktree, with Soham's OK because it is shared. In the builder, upload the fixture's 927 KB JPEG (`C15F7D76-…`) to a welcome screen, a PictureChoice option and an ending screen, plus a transparent PNG and an animated GIF.
  - Also upload a portrait phone JPEG stored landscape with EXIF Orientation=6 and over 300 KB (it must upload upright), and an animated WebP (it must come back byte-identical).
  - Do it in Chrome and in WebKit (playwright-core webkit, iPhone profile).
  - For each upload, record `MJ: Files.ContentType` and the served byte size.
  - Pass: JPEG ≤ 250 KB; PNG alpha preserved; GIF byte-identical.
- [ ] **Step 3: PR 2 timing check.** Serve the PR 2 widget bundle (`pnpm run build` in the worktree, then serve that `dist/widget/mj-form.js`, or run the branch harness on :4131). Seed the fixture from `perf-images` again, with Soham's OK.
  - Run the probe and the three mj-perf journeys at `none` and `slow4g-cpu4`, spacing the runs to stay under the redeem rate limit.
  - Run `compare.mjs` against the 2026-09-28 baselines.
  - Pass: the table in the spec's Verification section.
- [ ] **Step 4:** Tear the fixture down, restore anything switched in Step 2, and report the numbers.
