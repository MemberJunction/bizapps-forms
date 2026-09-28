/**
 * Shrinks an author's image in the browser before it is uploaded, so a published form does not
 * make every respondent download the original (bizapps-forms perf, 2026-09-28: a 927 KB welcome
 * photo painted 5.8 s after its text on Slow 4G; the server answered in 5 ms).
 *
 * Why in the builder and not on the server: server-side resizing needs a native image library
 * (`sharp`) on every host that installs Forms. The builder already holds the `File`, and every
 * modern browser can decode and re-encode it with a canvas.
 *
 * The contract is "never worse than today": anything this module cannot do (an animated GIF, WebP
 * or PNG, a browser without `createImageBitmap`, a file it cannot decode, a result that is not smaller) falls back
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

/** Header bytes read to look for animation markers; both formats put them before the pixel data. */
export const ANIMATION_SNIFF_BYTES = 64 * 1024;
/** Cap on chunks visited while sniffing, so a hostile header cannot keep the scan spinning. */
const MAX_HEADER_CHUNKS = 64;

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

const readAscii = (b: Uint8Array, at: number, len: number): string => String.fromCharCode(...b.subarray(at, at + len));
const readLe32 = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const readBe32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

function isAnimatedWebp(h: Uint8Array): boolean {
  if (h.length < 12 || readAscii(h, 0, 4) !== 'RIFF' || readAscii(h, 8, 4) !== 'WEBP') {
    return false;
  }
  let at = 12;
  for (let n = 0; n < MAX_HEADER_CHUNKS && at + 8 <= h.length; n++) {
    const id = readAscii(h, at, 4);
    if (id === 'ANIM') {
      return true;
    }
    if (id === 'VP8X' && at + 8 < h.length && (h[at + 8] & 0x02) !== 0) {
      return true;
    }
    const size = readLe32(h, at + 4);
    at += 8 + size + (size % 2); // payloads are padded to even length
  }
  return false;
}

function isAnimatedPng(h: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (h.length < signature.length || signature.some((byte, i) => h[i] !== byte)) {
    return false;
  }
  let at = signature.length;
  for (let n = 0; n < MAX_HEADER_CHUNKS && at + 8 <= h.length; n++) {
    const type = readAscii(h, at + 4, 4);
    if (type === 'acTL') {
      return true;
    }
    if (type === 'IDAT') {
      return false; // acTL is only meaningful before the first IDAT
    }
    at += 12 + readBe32(h, at); // length + type + data + CRC
  }
  return false;
}

/**
 * True when `header` (the first bytes of a file) marks an animated WebP or APNG. Pure. Truncated
 * or malformed headers, and every other type, answer false: the caller then treats the image as
 * a still one, which is the same as before this check existed.
 */
export function isAnimatedImage(header: Uint8Array, contentType: string): boolean {
  switch (bareType(contentType)) {
    case 'image/webp':
      return isAnimatedWebp(header);
    case 'image/png':
      return isAnimatedPng(header);
    default:
      return false;
  }
}

/** Decide whether and how to resize. Pure. Throws on dimensions no real image has. */
export function planResize(width: number, height: number, bytes: number, contentType: string): ResizePlan {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`invalid image dimensions ${width}×${height}`);
  }
  // Resizing a GIF keeps only its first frame, so an animated one would silently stop moving.
  // (Animated WebP/APNG are caught earlier, by their header, in optimizeImageForUpload.)
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
    // Animated WebP and APNG decode to frame 0 like a GIF does, so they are left alone too.
    if ((sourceType === 'image/webp' || sourceType === 'image/png') && isAnimatedImage(new Uint8Array(await file.slice(0, ANIMATION_SNIFF_BYTES).arrayBuffer()), sourceType)) {
      return file;
    }
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
