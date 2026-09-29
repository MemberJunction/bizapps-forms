# Published-form images render late — design

**Date:** 2026-09-28 · **Scope:** `packages/Angular` (forms-ng) only · **Ships as:** two PRs into `next`, one `patch` changeset each

## The problem

On a published form (`/f/:slug`), an image on the welcome screen, on a PictureChoice question, or on an
ending screen appears seconds after the screen's text. It is invisible on a dev laptop and severe on a phone.

Measured 2026-09-28 with a fixture form (welcome image, three PictureChoice option images, ending image),
Chrome, cold cache, 390×844 @3x, `slow4g-cpu4` (DevTools Slow 4G: 562.5 ms latency, 180 000 B/s; CPU ×4).
Three runs agreed within ~20 ms.

| Screen | Text visible | Image request starts | Image painted | Text → image gap |
|---|---|---|---|---|
| Welcome (907 KB JPEG — 906,835 B, `MJ: Files` C15F7D76 — 1408×768) | 2.80 s | 2.79 s | 8.63 s | **5.8 s** |
| Question (886 KB / 99 KB / 18 KB options) | click + 0.09 s | when the page renders | up to +6.3 s | **6.3 s** |
| Ending (949 KB JPEG) | after submit | when the screen renders | +6.0 s | **6.0 s** |

Unthrottled on localhost, every image paints within ~20 ms of its text, which is why this is easy to miss.

The server is not the cause: across 48 requests, `GET /forms/asset/:id` answered in a median of 4.9 ms
(p90 6.3 ms) with one SQL statement each, and it already returns `Cache-Control: public, max-age=31536000, immutable`.

Also observed: the welcome `<img>` has no reserved box, so when the image's header arrives (~3.4 s) the
title moves down 84 px (one layout shift, value 0.048).

Evidence: `~/.mj-perf/runs/bizapps-forms/forms-images-{welcome,question,ending}/` (baselines saved for
throttle `none` and `slow4g-cpu4`).

## Root causes, by weight

1. **Uploads are stored and served byte-for-byte.** Nothing in the builder or forms-server resizes or
   re-encodes an image:
   - `buildAssetFormData` appends the raw `File` (`builder/form-asset.service.ts:50-55`);
   - `runAssetUpload` validates only size and type before `UploadFile` (`Server/src/asset/asset.service.ts`).

   The welcome photo displays at most 352 CSS px wide (`.mjf-screen__media { max-width: min(100%, 22rem) }`)
   but ships at 1408 px and 907 KB. Uploads up to 5 MB are accepted (`FORMS_ASSET_MAX_BYTES`), which is
   ~29 s on Slow 4G. Cause 1 accounts for ~5.2 s of the welcome screen's 5.8 s.
2. **Later screens are never prefetched.** Question images are requested only when the page renders
   after "Start"; the ending image only after submit. Nothing in the widget or the host page preloads or
   prefetches (`new Image`, `rel=preload`/`prefetch`, `fetchpriority` appear nowhere).
3. **The welcome image is discovered late.** Its URL exists only after the HTML, the 174 KB widget bundle,
   and the `PublishedForm` GraphQL query. The host page cannot hint it: its published-version check is an
   existence read (`redeem.service.ts:278-290`), and `form-identity.ts:6-10` deliberately avoids loading
   the definition on that path. **Out of scope here** (see Follow-up).

## Goals

- A welcome image paints at most ~1.7 s after its text on `slow4g-cpu4`, cold (today 5.8 s).
- Question and ending images paint with their screen when the respondent spent a few seconds on the
  previous screen.
- No new runtime dependency on any host, and no server, schema, or metadata change.
- Neither change can make an image fail to appear, or make an upload larger than it is today.

## Non-goals

- **Re-processing images already uploaded.** They stay large until an author re-uploads them. A batch
  re-process needs a server-side image library, which this design rules out (see Alternatives).
- **Pasted external image URLs.** We do not control those bytes.
- **Reserving layout space for the welcome image.** CLS 0.048 is under the 0.1 "good" threshold, and
  recording dimensions would need new columns and a migration. Revisit if it is ever reported.
- **Responsive variants (`srcset`).** Would need server-side processing.
- **Host-page preload of the welcome image** (Follow-up).

## Alternatives considered

- **Server-side resize with `sharp`, at upload time.** Consistent output and could fix existing files.
  Rejected: every host that installs Forms would carry a native binary (per-platform builds, Alpine/Docker
  images, install size) for an Open App. No MJ server package depends on `sharp`; the workspace has it
  only transitively, via `@xenova/transformers` in `MJ/packages/AI/Providers/LocalEmbeddings`.
- **Resize on the fly at `GET /forms/asset/:id?w=`.** Rejected: CPU work on an anonymous route, which
  is a denial-of-service surface.
- **Per-surface size caps** (screen 1200 px, option 900 px, logo 400 px, background 2048 px). Rejected
  for one cap. A per-surface cap would thread a new input through `image-field` → `image-picker-dialog`
  → the service for a small saving. Logos are small already and are never upscaled.

---

## Part 1 — shrink images in the builder before upload (PR 1)

### Where it lives

Every upload surface (welcome/ending `MediaURL`, PictureChoice `ImageURL`, logo, page background)
already goes through `FormAssetService.upload(file, formId, onProgress)` (`builder/form-asset.service.ts`),
via `<mjf-image-picker-dialog>` → `screenThenUpload`. `upload()` calls the optimizer before
`buildAssetFormData`. Its signature and every caller are unchanged.

New module `builder/image-optimize.ts`, a plain module (not a component) so it is importable from a
node-environment spec:

```ts
/** Returns a smaller File, or `file` itself when it cannot do better. Never rejects. */
export function optimizeImageForUpload(file: File, codec?: ImageCodec): Promise<File>;
```

`ImageCodec` is the browser seam: `decode(file) → DecodedImage` (`{ width, height, source, close() }`)
and `encode(image, width, height, type, quality) → Blob`. The default implementation uses
`createImageBitmap(file, { imageOrientation: 'from-image' })` plus an `OffscreenCanvas`, falling back to
a `<canvas>` when `OffscreenCanvas` is unavailable. Tests pass a fake.

The decisions are pure exported functions, so they are testable without a canvas:

```ts
export const MAX_IMAGE_EDGE_PX = 1600;
export const SKIP_BELOW_BYTES = 300 * 1024;
export const WEBP_QUALITY = 0.82;
export const JPEG_QUALITY = 0.8;
export const FALLBACK_MAX_EDGE_PX = 1200; // long edge when the browser cannot encode WebP

planResize(width, height, bytes, type): { action: 'skip' } | { action: 'resize'; width; height }
pickOutputType(sourceType, encodedType): 'image/webp' | 'image/jpeg' | 'image/png'
fallbackSize(width, height): { width; height } // long edge <= FALLBACK_MAX_EDGE_PX, never upscales
```

### Behaviour

1. **Skip, returning `file` unchanged:**
   - `image/gif` (resizing would drop the animation);
   - an animated WebP or APNG, found by sniffing the first 64 KB of the file (`sniffAnimation`; WebP:
     `VP8X` animation flag or an `ANIM` chunk; PNG: an `acTL` chunk before the first `IDAT`). Resizing
     would keep only frame 0;
   - a WebP or PNG whose first 64 KB do not answer that (`unknown`): a PNG whose ancillary chunks —
     XMP, an ICC profile — run past the window before its first `IDAT` may still carry an `acTL`.
     Logged with `console.warn`, then uploaded as it is;
   - any file whose longer side is ≤ `MAX_IMAGE_EDGE_PX` **and** whose size is ≤ `SKIP_BELOW_BYTES`.
2. **Decode** with EXIF orientation applied, so phone photos stay upright. Re-encoding drops all
   metadata, including GPS location.
3. **Scale** so the longer side is at most the cap for the image's use (`ImageUse`, `IMAGE_LIMITS`):
   `MAX_IMAGE_EDGE_PX` (1600) for screen media, options and the logo; `MAX_BACKGROUND_EDGE_PX` (3840)
   for the page background, which is drawn `cover` across the viewport (a 1920 CSS px desktop at 2×
   needs 3840 device px; the content cap would stretch it 2.4×). The Design tab's background field
   passes `use="page-background"` through `ImageFieldComponent` → `ImagePickerDialogComponent` →
   `FormAssetService.upload(…, use)`. Preserve aspect ratio and round to whole pixels. Never upscale: a large-bytes file within the edge cap is re-encoded at its own size.
4. **Encode** as `image/webp` at `WEBP_QUALITY`. Safari's canvas cannot encode WebP and returns PNG
   instead, which shows as the blob's `type` differing from the requested type. In that case,
   `pickOutputType` chooses:
   - `image/jpeg` at `JPEG_QUALITY` for a JPEG source;
   - `image/png` for every other source, which keeps transparency.

   The fallback is much heavier than WebP, so it is encoded at `fallbackSize` (long edge at most
   `FALLBACK_MAX_EDGE_PX`, 1200 px) and JPEG uses `JPEG_QUALITY` 0.8. A PNG the browser already
   returned is reused only when it was drawn at that size; otherwise it is encoded again.
   The WebP path stays at 1600 px and `WEBP_QUALITY`.

   *Measured 2026-09-28 on the welcome photo C15F7D76 (906,835 B):* Chromium 151 makes it a
   142,166 B WebP; the E2E upload from Chrome 154 stored a 166,176 B `welcome.webp`. WebKit 26.5 JPEG:
   1408 px q0.85 = 413,531 B, 1408 px q0.80 = 350,236 B, 1200 px q0.85 = 284,329 B, 1200 px q0.80 =
   239,767 B, 1056 px q0.80 = 195,574 B. (An earlier sweep, 434/368/303/257/211 KB, came from a different
   source file and does not reproduce on C15F7D76.) Safari's PNG for a 3000×1000 transparent PNG at
   1600 px: 1231 KB (not re-measured). For a page background both caps are 3840 px.
5. **Keep whichever is smaller:** if the encoded blob is not smaller than `file`, return `file`.
6. **Name the result** after the original with the new extension (`photo.jpg` → `photo.webp`). The server
   stores `Name` and `ContentType` from the multipart part.

### Failure handling

If `decode` or `encode` throws, or `createImageBitmap` does not exist, the function:

- logs `console.warn('[Forms] Image optimization skipped for "<name>" (<type>, <bytes> B): <reason>')`;
- resolves with the original `file`.

The upload then proceeds exactly as today. The server's size and type checks remain the authority; a
5 MB original still gets the server's existing 413 message.

**Server refuses the shrunk type.** `FORMS_ASSET_ALLOWED_TYPES` is operator-configurable and may omit
`image/webp`. If the upload of a changed file fails with HTTP 415, `upload()` retries **once** with the
original file (`shouldRetryWithOriginal`), logging a `console.warn` with the file name and rejected
type. Any other failure, or a 415 on the original itself, is reported as before. To carry the status,
`send()` rejects with `AssetUploadError` (a subclass of `Error`, so callers reading `.message` are
unaffected).

### Progress UI

Unchanged. Decoding and re-encoding a 5 MB photo takes on the order of 100–300 ms, before the existing
upload progress starts.

### Tests (`builder/image-optimize.spec.ts`)

- **`planResize`:**
  - GIF → skip;
  - 1200×800 at 200 KB → skip;
  - exactly 1600 px on the long side at 200 KB → skip;
  - 1408×768 at 927 KB → resize to 1408×768 (a re-encode, not an upscale);
  - 4032×3024 → 1600×1200;
  - 3024×4032 portrait → 1200×1600;
  - never returns a dimension larger than the input.
- **`pickOutputType`:** WebP honoured → `image/webp`; WebP refused (PNG returned) → `image/jpeg` for a
  JPEG source and `image/png` for PNG and WebP sources.
- **`optimizeImageForUpload` with a fake codec:**
  - happy path returns a `File` with the new type, name and bytes;
  - a result larger than the original returns the original;
  - `decode` throws → original returned plus exactly one warning naming the file;
  - `encode` throws → the same;
  - missing `createImageBitmap` → the same.
- **`sniffAnimation`** with hand-built headers: animated WebP (VP8X flag; ANIM chunk alone), still WebP
  (including a VP8X-flagged still whose ICCP runs past the window), APNG, still PNG (an `acTL` after
  `IDAT` does not count), a PNG whose `acTL` lies past 64 KB (`unknown`), truncated input (`unknown`),
  other types (`still`); an animated WebP and a late-`acTL` APNG `File` are returned as the same object
  without decoding.
- **Per-use limits:** a 3840×2160 page background is encoded at its own size, and on the no-WebP path
  too; an 8000 px one is capped at 3840; content keeps 1600/1200.
- **`FormAssetService.upload` (`builder/form-asset.upload.spec.ts`, the real service over a fake XHR):**
  `use` reaches the optimizer; a 415 on the optimized file re-sends the original once; a 413 is not
  retried.
- **`shouldRetryWithOriginal`:** 415 with a changed file → true; 415 for the original itself, 413, and a
  non-upload error → false.
- **Wiring (`builder/image-optimize.wiring.spec.ts`, the source-reading pattern of `asset-ref-wiring.spec.ts`):**
  `upload()` awaits `optimizeImageForUpload` before `buildAssetFormData`, sends the optimized file first,
  and sends the original only in the one retry branch. As template text, the Design tab's background
  field is the only `use="page-background"`, and the field and picker pass `use` on.

---

## Part 2 — prefetch later images; welcome image first (PR 2)

### Welcome priority

`components/form-screen.component.ts`: the media `<img>` gains
`[attr.fetchpriority]="isWelcome() ? 'high' : null"` and `decoding="async"`. The component also gains
`readonly mediaSettled = output<void>()`, emitted from the image's `(load)` and `(error)`.

### What to prefetch

A new pure function in `widget/core/asset-ref.ts`, next to `mapDefinitionAssets`, which already knows
every image field:

```ts
/** Images the respondent sees AFTER the first screen, in the order they will see them. */
export function collectLaterImageUrls(def: PublishedFormDefinition): string[];
```

- It returns the `imageURL` of every option of a **PictureChoice** question (the only type that
  renders option images; the snapshot builder copies `imageURL` onto any option), page by page, question by question and option by option.
  Pages and questions are sorted by `displayOrder` as the renderer sorts them (`form-runtime.ts:381`,
  `section-content.ts:76`); options are taken in published array order, because the renderer does not
  sort them (`form-question.component.html` iterates `q.options`). Then every ending screen's
  `mediaURL` sorted by `displayOrder` (`shown-screen.ts:52`). It includes **all** endings, because which one shows depends on
  the answers.
- It deduplicates, keeping the first occurrence.
- It leaves out the welcome `mediaURL`, `styleTokens.logoURL`, and CSS asset URLs, which the first screen
  requests itself.
- It is called on the definition **after** `resolveDefinitionForRender`, so the URLs already point at
  the widget's own API origin.

### How to prefetch

New module `widget/core/image-prefetch.ts`:

```ts
export const MAX_PREFETCH_IMAGES = 12;
export const PREFETCH_TIMEOUT_MS = 15_000;

export interface PrefetchEnv {
  createImage(): PrefetchImage;          // default: () => new Image()
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  saveData(): boolean;                   // default: navigator.connection?.saveData === true
}
export interface PrefetchHandle { cancel(): void }

export function prefetchImages(urls: readonly string[], env?: PrefetchEnv): PrefetchHandle;
```

- **Sequential, one image at a time.** Each image gets `fetchPriority = 'low'`, `decoding = 'async'` and
  `src = url`; the next starts after `load`, `error`, or the timeout. On Slow 4G, parallel downloads
  would split bandwidth with whatever the respondent is doing, including a submit.
- **Capped at `MAX_PREFETCH_IMAGES`.** URLs past the cap are not requested, with one
  `console.debug('[Forms] Image prefetch capped at 12; skipped N')`.
- **`PREFETCH_TIMEOUT_MS` per image stops the queue.** A stall that long means prefetching cannot pay
  off on this link. The in-flight image is **not** aborted (assets carry a weak ETag, so a partial
  download cannot resume and aborting would waste the bytes already fetched); its handlers are detached
  and the browser finishes it into the HTTP cache. One `console.debug` reports the stop and the number
  skipped.
- **`saveData()` true → nothing is requested**, with one `console.debug` saying so.
- **Failures never reach the respondent.** A failed image logs
  `console.debug('[Forms] Image prefetch failed: <url>')` and the queue continues. The real `<img>` on
  that screen handles its own failure.
- **`cancel()`** stops the queue, clears the pending timer, and aborts the in-flight image by clearing its `src`. It is
  idempotent.
- **The HTTP cache does the rest.** Asset responses are `immutable`, so the later `<img>` with the same
  URL is served from cache. Picture options keep `loading="lazy"`: a prefetched lazy image finds the file
  in cache, and lazy still saves bandwidth when a prefetch was skipped.

### When it starts and stops (`mj-form.component.ts`)

`MjFormComponent` holds one `PrefetchHandle | undefined`.

- In `load()`, the previous handle is cancelled first, next to the existing `this.autosave?.dispose()`.
  This covers "Try again", "Start over" and resume re-loads.
- After `this.definition.set(def)` and the phase is chosen, **only if intake is still ahead** (phase
  `welcome` or `ready`). A response resumed onto `done`, or a load that ended in `error`/`expired`, can
  never show these images, so nothing is planned:
  - **the phase is `welcome` and the welcome screen has a `mediaURL`:** start on
    `<mjf-form-screen (mediaSettled)>`, which is wired in `mj-form.component.html` on the welcome case
    only. It starts once; later emissions are ignored.
    If the respondent leaves the welcome screen before its image settles (taps "Start" early), the
    component is destroyed and never emits, so `startIntake()` also starts the prefetch when it has not
    started yet. Starting is guarded by one "started for this load" flag, so it happens at most once.
  - **any other case** (no welcome screen, no welcome image, resumed past the welcome screen): start on
    the next idle callback (`requestIdleCallback`, falling back to `setTimeout(…, 0)`).
- `ngOnDestroy` sets a `destroyed` flag and cancels the handle; `startPrefetch()` returns early once
  destroyed, so a `load()` still awaiting the network cannot start a queue after teardown.

### Tests

- **`widget/core/asset-ref.spec.ts`**, `collectLaterImageUrls`:
  - order follows `displayOrder` for pages, questions and endings, even when those arrays are stored out
    of order, while options stay in array order;
  - duplicates are removed, keeping the first;
  - welcome media, logo and CSS URLs are excluded;
  - options without `imageURL` are skipped;
  - option images on a non-PictureChoice question are ignored;
  - an empty definition → `[]`.
- **`widget/core/image-prefetch.spec.ts`**, with a fake `PrefetchEnv`:
  - one image at a time, in order;
  - 13 URLs → 12 requested and one debug line;
  - a stalled image stops the queue: no further image, the in-flight `src` untouched, one debug line;
  - a late load after the timeout starts nothing;
  - `error` moves on;
  - `saveData` → zero images created;
  - `cancel()` mid-queue → no further images and the in-flight `src` cleared;
  - a second `cancel()` is a no-op.
- **Wiring (`*.wiring.spec.ts`):**
  - `fetchpriority` is bound only through `isWelcome()`;
  - `(mediaSettled)` is emitted from both `(load)` and `(error)`;
  - `mj-form.component.html` binds `(mediaSettled)` on the welcome case;
  - `load()` cancels the previous handle before starting;
  - `startIntake()` starts the prefetch when `(mediaSettled)` has not, and the start is guarded to happen
    once per load;
  - `ngOnDestroy` cancels and sets `destroyed`; `startPrefetch()` checks it;
  - `planPrefetch` returns early unless the phase is `welcome` or `ready`.

---

## Verification (both PRs)

**Unit tests are not enough on their own.** Vitest here does not typecheck, and the suite never compiles
the builder components. Each PR must also pass the package's typecheck and its `ngc` build.

**Real browser checks.** The implementer reproduces each claim; Soham runs the smoke test.

1. **Explorer has to build first.** At the time of writing, Explorer on :4201 fails because of stale
   bizapps-caliber build output (`BaseRealtimeChannelClient` is not exported by MJ `next`'s conversations
   package). Rebuild caliber before any builder check.
2. **PR 1 — upload.** In the builder in Explorer, upload the fixture's 907 KB JPEG (C15F7D76) to a welcome screen,
   a PictureChoice option and an ending screen. Do it once in Chrome and once in WebKit
   (playwright-core's `webkit` channel, which exercises the Safari fallback). For each upload, record the
   stored `MJ: Files.ContentType` and the served byte size. Also upload a transparent PNG and an animated
   GIF: transparency must survive, and the GIF must come back byte-identical. Also upload a portrait
   phone JPEG stored landscape with EXIF Orientation=6, over 300 KB (it must upload upright), and an
   animated WebP (it must come back byte-identical).
3. **PR 2 — timing.** Re-run the three mj-perf journeys (`bizapps-forms/forms-images-{welcome,question,ending}`)
   at `none` and `slow4g-cpu4`, then run `compare.mjs` against the 2026-09-28 baselines. Also re-run the
   text-vs-image probe (Chrome, 390×844 @3x). Space the runs out, or seed several distributions:
   ~80 loads in a few minutes tripped the magic-link redeem rate limit (429) on 2026-09-28.

**Pass criteria** (`slow4g-cpu4`, cold cache, median of 3 runs):

| Metric | Today | Target |
|---|---|---|
| Stored size of the 907 KB, 1408×768 JPEG after upload, measured per engine (Chrome WebP, Safari JPEG) | 907 KB | ≤ 250 KB |
| Welcome image painted | 8.63 s | ≤ 4.5 s |
| Welcome text visible | 2.80 s | ≤ 3.08 s (no regression > 10%) |
| Question images painted after the question page's text, with ≥ 3 s on the welcome screen | up to 6.3 s | ≤ 100 ms |
| Ending image painted after the ending text, with ≥ 3 s on the question page | 6.0 s | ≤ 100 ms |
| Transparent PNG after upload | — | alpha preserved |
| Animated GIF after upload | — | byte-identical |
| EXIF Orientation=6 JPEG over 300 KB after upload | — | displays upright |
| Animated WebP after upload | — | byte-identical |

## Shipping

- **PR 1** (Part 1) and **PR 2** (Part 2): separate PRs into `next`, each measured on its own, each
  independently revertible. Branches are cut from `next`.
- **One `patch` changeset per PR.** Neither ships a migration or metadata (`.claude/rules/changesets.md`).
- No commit without Soham's explicit request (CLAUDE.md rule 1).

## Follow-up (not in this work)

- **Host-page preload of the welcome image.** Add `DefinitionSnapshot` to the existing published-version
  read and emit `<link rel="preload" as="image" fetchpriority="high">` in the host page. Estimate: the
  request moves from 2.79 s to ~0.6 s.

  This reverses the deliberate choice in `form-identity.ts:6-10`. So after both PRs ship, re-measure: an
  issue for it is drafted, with the new numbers, **only if** the welcome image still paints more than
  1 s after its text. Filing it is Soham's call.
- **Existing large uploads** (non-goal above). An author re-upload fixes each one.
