/**
 * Shrinks an author's image in the browser before it is uploaded, so a published form does not
 * make every respondent download the original (bizapps-forms perf, 2026-09-28: a 907 KB welcome
 * photo painted 5.8 s after its text on Slow 4G; the server answered in 5 ms).
 *
 * Why in the builder and not on the server: server-side resizing needs a native image library
 * (`sharp`) on every host that installs Forms. The builder already holds the `File`, and every
 * modern browser can decode and re-encode it with a canvas.
 *
 * The contract is "never worse than today": anything this module cannot do (an animated GIF, WebP
 * or PNG, a file whose header does not say whether it is animated, a browser without
 * `createImageBitmap`, a file it cannot decode, a result that is not smaller) falls back to the
 * original file, which uploads exactly as before. The server's type and size checks remain the
 * authority.
 *
 * How far an image is shrunk depends on where it is shown ({@link ImageUse}): screen media and
 * option pictures render at most 352 CSS px wide, but a page background covers the whole viewport.
 *
 * A plain module, not a component, so the decisions are testable in the package's node-only Vitest.
 */

/**
 * Longest side, in pixels, after resizing a CONTENT image. Screen media shows at most 352 CSS px
 * (`form-screen.component.ts`, `min(100%, 22rem)`), about 1056 device px at 3×.
 */
export const MAX_IMAGE_EDGE_PX = 1600;
/** An image within the edge cap AND at or under this many bytes is uploaded as-is. */
export const SKIP_BELOW_BYTES = 300 * 1024;
export const WEBP_QUALITY = 0.82;
/**
 * Measured in WebKit 26.5 on the 1408×768 welcome photo (906,835 B, the fixture `MJ: Files`
 * C15F7D76): q0.85 gave 413,531 B at full size, q0.80 gave 350,236 B, and q0.80 at 1200 px gave
 * 239,767 B. Chrome's WebP path is unaffected.
 */
export const JPEG_QUALITY = 0.8;
/**
 * Longest side of a CONTENT image when the browser cannot encode WebP (Safari). Its JPEG/PNG
 * fallback is far heavier than WebP: at full size the same photo was 350,236 B at q0.80.
 * 1200 px is still above what the widest screen media needs (about 1056 device px at 3×).
 */
export const FALLBACK_MAX_EDGE_PX = 1200;

/**
 * Longest side of a PAGE BACKGROUND, WebP or not. It is drawn `cover` across the whole viewport
 * (`mj-form.component.css`), so a 1920 CSS px desktop at 2× needs 3840 device px; the content cap
 * would stretch it 2.4× (3.2× on Safari) where the original used to render 1:1.
 */
export const MAX_BACKGROUND_EDGE_PX = 3840;

/** Where an uploaded image will be shown, which decides how far it can be shrunk. */
export type ImageUse = 'content' | 'page-background';

export interface ImageLimits {
  /** Longest side when the browser encodes WebP. */
  maxEdgePx: number;
  /** Longest side when it cannot (Safari), for the heavier JPEG/PNG fallback. */
  fallbackMaxEdgePx: number;
}

export const IMAGE_LIMITS: Readonly<Record<ImageUse, ImageLimits>> = Object.freeze({
  content: { maxEdgePx: MAX_IMAGE_EDGE_PX, fallbackMaxEdgePx: FALLBACK_MAX_EDGE_PX },
  'page-background': { maxEdgePx: MAX_BACKGROUND_EDGE_PX, fallbackMaxEdgePx: MAX_BACKGROUND_EDGE_PX },
});

/** Header bytes read to look for animation markers; both formats put them before the pixel data. */
export const ANIMATION_SNIFF_BYTES = 64 * 1024;
/** Cap on chunks visited while sniffing, so a hostile header cannot keep the scan spinning. */
const MAX_HEADER_CHUNKS = 64;

export type OutputImageType = 'image/webp' | 'image/jpeg' | 'image/png';

/** What a file's header says about animation. `unknown`: the header ended before it could tell. */
export type AnimationSniff = 'animated' | 'still' | 'unknown';

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

const readAscii = (b: Uint8Array, at: number, len: number): string => String.fromCharCode(...b.subarray(at, at + len));
const readLe32 = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const readBe32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

function sniffWebp(h: Uint8Array): AnimationSniff {
  if (h.length < 12 || readAscii(h, 0, 4) !== 'RIFF' || readAscii(h, 8, 4) !== 'WEBP') {
    return 'unknown';
  }
  // VP8X's animation flag is authoritative, so once it has been read as clear, running out of
  // header (a large ICCP chunk) still means still. The ANIM check covers a file that sets no flag.
  let flagSaysStill = false;
  let at = 12;
  for (let n = 0; n < MAX_HEADER_CHUNKS && at + 8 <= h.length; n++) {
    const id = readAscii(h, at, 4);
    if (id === 'ANIM' || id === 'ANMF') {
      return 'animated';
    }
    if (id === 'VP8X' && at + 8 < h.length) {
      if ((h[at + 8] & 0x02) !== 0) {
        return 'animated';
      }
      flagSaysStill = true;
    }
    if (id === 'VP8 ' || id === 'VP8L') {
      return 'still'; // image data before any animation chunk
    }
    const size = readLe32(h, at + 4);
    at += 8 + size + (size % 2); // payloads are padded to even length
  }
  return flagSaysStill ? 'still' : 'unknown';
}

function sniffPng(h: Uint8Array): AnimationSniff {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (h.length < signature.length || signature.some((byte, i) => h[i] !== byte)) {
    return 'unknown';
  }
  let at = signature.length;
  for (let n = 0; n < MAX_HEADER_CHUNKS && at + 8 <= h.length; n++) {
    const type = readAscii(h, at + 4, 4);
    if (type === 'acTL') {
      return 'animated';
    }
    if (type === 'IDAT') {
      return 'still'; // acTL is only meaningful before the first IDAT
    }
    at += 12 + readBe32(h, at); // length + type + data + CRC
  }
  // Out of header before the first IDAT: acTL may still follow (APNG only requires it to precede
  // IDAT, and 70 KB of XMP or an ICC profile can come first). Treating that as still dropped frames.
  return 'unknown';
}

/**
 * What `header` (the first bytes of a file) says about animation, for WebP and PNG. Pure. A header
 * that ends before the answer, or is malformed, is `unknown`; the caller keeps such a file as it
 * is. Every other type is `still` here (GIF is handled by type, before this is called).
 */
export function sniffAnimation(header: Uint8Array, contentType: string): AnimationSniff {
  switch (bareType(contentType)) {
    case 'image/webp':
      return sniffWebp(header);
    case 'image/png':
      return sniffPng(header);
    default:
      return 'still';
  }
}

/** Decide whether and how to resize, to at most `maxEdgePx` on the longest side. Pure. Throws on dimensions no real image has. */
export function planResize(width: number, height: number, bytes: number, contentType: string, maxEdgePx: number = MAX_IMAGE_EDGE_PX): ResizePlan {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`invalid image dimensions ${width}×${height}`);
  }
  // Resizing a GIF keeps only its first frame, so an animated one would silently stop moving.
  // (Animated WebP/APNG are caught earlier, by their header, in optimizeImageForUpload.)
  // The skip rule stays on the CONTENT cap for every use: a small file is not worth re-encoding.
  if (bareType(contentType) === 'image/gif') {
    return { action: 'skip' };
  }
  const longest = Math.max(width, height);
  if (longest <= MAX_IMAGE_EDGE_PX && bytes <= SKIP_BELOW_BYTES) {
    return { action: 'skip' };
  }
  const scale = Math.min(1, maxEdgePx / longest);
  return {
    action: 'resize',
    // At least 1 px: a 10 000 × 10 banner scales to a fraction of a pixel, and a 0-sized canvas throws.
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Dimensions for the no-WebP fallback encode: the original scaled to at most `maxEdgePx` ({@link FALLBACK_MAX_EDGE_PX} by default). Pure. */
export function fallbackSize(width: number, height: number, maxEdgePx: number = FALLBACK_MAX_EDGE_PX): { width: number; height: number } {
  const scale = Math.min(1, maxEdgePx / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
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
 * `use` sets how far it may shrink ({@link IMAGE_LIMITS}).
 * Never rejects: a failure is logged with the file's name and the original is returned.
 */
export async function optimizeImageForUpload(file: File, use: ImageUse = 'content', codec: ImageCodec = browserCodec): Promise<File> {
  const limits = IMAGE_LIMITS[use];
  const sourceType = bareType(file.type);
  if (sourceType === 'image/gif') {
    return file; // checked before decoding: no point paying for a decode we will not use
  }
  let decoded: DecodedImage | undefined;
  try {
    // Animated WebP and APNG decode to frame 0 like a GIF does, so they are left alone too, and so
    // is a file whose header does not say: re-encoding it could drop frames nobody saw.
    if (sourceType === 'image/webp' || sourceType === 'image/png') {
      const sniff = sniffAnimation(new Uint8Array(await file.slice(0, ANIMATION_SNIFF_BYTES).arrayBuffer()), sourceType);
      if (sniff === 'unknown') {
        console.warn(`[Forms] Image optimization skipped for "${file.name}" (${sourceType}, ${file.size} B): its first ${ANIMATION_SNIFF_BYTES} B do not show whether it is animated, so it is uploaded as it is.`);
      }
      if (sniff !== 'still') {
        return file;
      }
    }
    decoded = await codec.decode(file);
    const plan = planResize(decoded.width, decoded.height, file.size, sourceType, limits.maxEdgePx);
    if (plan.action === 'skip') {
      return file;
    }
    let blob = await codec.encode(decoded, plan.width, plan.height, 'image/webp', WEBP_QUALITY);
    const outputType = pickOutputType(sourceType, blob.type);
    // The browser could not encode WebP: its JPEG/PNG is much heavier, so encode at the smaller
    // fallback size. A PNG the browser already returned is reused only when that size is the one it
    // was drawn at; otherwise it is encoded again, at the fallback size.
    if (outputType !== 'image/webp') {
      const size = fallbackSize(decoded.width, decoded.height, limits.fallbackMaxEdgePx);
      const alreadyEncoded = bareType(blob.type) === outputType && size.width === plan.width && size.height === plan.height;
      if (!alreadyEncoded) {
        blob = await codec.encode(decoded, size.width, size.height, outputType, outputType === 'image/jpeg' ? JPEG_QUALITY : undefined);
      }
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
    // A throw from a `finally` would replace the return value and make this function reject.
    try {
      decoded?.close();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[Forms] Releasing the decoded image for "${file.name}" failed: ${reason}`);
    }
  }
}
