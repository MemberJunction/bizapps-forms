import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FALLBACK_MAX_EDGE_PX,
  JPEG_QUALITY,
  MAX_IMAGE_EDGE_PX,
  SKIP_BELOW_BYTES,
  WEBP_QUALITY,
  IMAGE_LIMITS,
  fallbackSize,
  sniffAnimation,
  optimizeImageForUpload,
  pickOutputType,
  planResize,
  renameForType,
  type DecodedImage,
  type ImageCodec,
} from './image-optimize';

const KB = 1024;

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const le32 = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];

/** A RIFF/WEBP header whose chunks are `[fourcc, payload]`; payloads are padded to even length. */
function webp(chunks: Array<[string, number[]]>): Uint8Array {
  const body = chunks.flatMap(([id, data]) => [...ascii(id), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])]);
  return Uint8Array.from([...ascii('RIFF'), ...le32(body.length + 4), ...ascii('WEBP'), ...body]);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A PNG header whose chunks are `[type, data]`, each with a (dummy) CRC. */
function png(chunks: Array<[string, number[]]>): Uint8Array {
  const body = chunks.flatMap(([id, data]) => [...be32(data.length), ...ascii(id), ...data, 0, 0, 0, 0]);
  return Uint8Array.from([...PNG_SIGNATURE, ...body]);
}

describe('sniffAnimation', () => {
  const vp8xFlags = (flags: number): number[] => [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  it('detects an animated WebP by the VP8X animation flag', () => {
    expect(sniffAnimation(webp([['VP8X', vp8xFlags(0x02)], ['VP8 ', [1, 2, 3, 4]]]), 'image/webp')).toBe('animated');
  });

  it('detects an animated WebP by an ANIM chunk alone', () => {
    expect(sniffAnimation(webp([['VP8X', vp8xFlags(0)], ['ANIM', [0, 0, 0, 0, 0, 0]]]), 'image/webp')).toBe('animated');
  });

  it('treats a still WebP as still (VP8X without the flag, and plain VP8)', () => {
    expect(sniffAnimation(webp([['VP8X', vp8xFlags(0x10)], ['VP8 ', [1, 2, 3, 4]]]), 'image/webp')).toBe('still');
    expect(sniffAnimation(webp([['VP8 ', [1, 2, 3, 4]]]), 'image/webp')).toBe('still');
  });

  it('trusts the VP8X flag when the header ends before the image data (a large ICCP chunk)', () => {
    const header = webp([['VP8X', vp8xFlags(0x20)], ['ICCP', new Array(70_000).fill(0)]]).slice(0, 64 * 1024);
    expect(sniffAnimation(header, 'image/webp')).toBe('still');
  });

  it('detects an APNG by acTL before the first IDAT', () => {
    const header = png([['IHDR', new Array(13).fill(0)], ['acTL', [0, 0, 0, 2, 0, 0, 0, 0]], ['IDAT', [1, 2]]]);
    expect(sniffAnimation(header, 'image/png')).toBe('animated');
  });

  it('treats a still PNG as still, even with an acTL after IDAT', () => {
    expect(sniffAnimation(png([['IHDR', new Array(13).fill(0)], ['IDAT', [1, 2]]]), 'image/png')).toBe('still');
    expect(sniffAnimation(png([['IHDR', new Array(13).fill(0)], ['IDAT', [1, 2]], ['acTL', [0, 0, 0, 2, 0, 0, 0, 0]]]), 'image/png')).toBe('still');
  });

  it('cannot tell when the header ends before a PNG reaches its first IDAT (acTL may be further in)', () => {
    // A legal APNG: acTL need only precede IDAT, and 70 KB of XMP before it pushes it past the sniff window.
    const full = png([['IHDR', new Array(13).fill(0)], ['iTXt', new Array(70_000).fill(0)], ['acTL', [0, 0, 0, 2, 0, 0, 0, 0]], ['IDAT', [1, 2]]]);
    expect(sniffAnimation(full, 'image/png')).toBe('animated');
    expect(sniffAnimation(full.slice(0, 64 * 1024), 'image/png')).toBe('unknown');
  });

  it('answers unknown for truncated or malformed input rather than throwing', () => {
    expect(sniffAnimation(new Uint8Array(0), 'image/webp')).toBe('unknown');
    expect(sniffAnimation(webp([['VP8X', vp8xFlags(0x02)]]).slice(0, 14), 'image/webp')).toBe('unknown');
    expect(sniffAnimation(png([['IHDR', new Array(13).fill(0)]]).slice(0, 10), 'image/png')).toBe('unknown');
    expect(sniffAnimation(Uint8Array.from(PNG_SIGNATURE.slice(0, 5)), 'image/png')).toBe('unknown');
    expect(sniffAnimation(Uint8Array.from([...ascii('RIFF'), ...le32(4), ...ascii('WAVE')]), 'image/webp')).toBe('unknown');
  });

  it('stops at a chunk that claims to run past the header', () => {
    const huge = Uint8Array.from([...ascii('RIFF'), ...le32(0), ...ascii('WEBP'), ...ascii('JUNK'), ...le32(0xffffffff)]);
    expect(sniffAnimation(huge, 'image/webp')).toBe('unknown');
  });

  it('answers still for any other content type, whatever the bytes', () => {
    expect(sniffAnimation(webp([['VP8X', vp8xFlags(0x02)]]), 'image/jpeg')).toBe('still');
  });
});

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

describe('fallbackSize', () => {
  it('caps the long edge at FALLBACK_MAX_EDGE_PX', () => {
    expect(FALLBACK_MAX_EDGE_PX).toBe(1200);
    expect(fallbackSize(1408, 768)).toEqual({ width: 1200, height: 655 });
    expect(fallbackSize(4032, 3024)).toEqual({ width: 1200, height: 900 });
    expect(fallbackSize(3024, 4032)).toEqual({ width: 900, height: 1200 });
  });

  it('never upscales an image already within the cap', () => {
    expect(fallbackSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('never rounds a thin image down to a zero-pixel side', () => {
    expect(fallbackSize(10_000, 10)).toEqual({ width: 1200, height: 1 });
  });

  it('is pinned at JPEG quality 0.8', () => {
    expect(JPEG_QUALITY).toBe(0.8);
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

/** A still PNG's first bytes (IHDR then IDAT), so the animation sniff answers `still`. */
const STILL_PNG_HEADER = png([['IHDR', new Array(13).fill(0)], ['IDAT', [1, 2]]]);

const jpeg = (bytes: number, name = 'welcome.jpg'): File =>
  new File([new Uint8Array(bytes)], name, { type: 'image/jpeg', lastModified: 1 });

describe('optimizeImageForUpload', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns a smaller WebP named after the original', async () => {
    const codec = fakeCodec({ width: 1408, height: 768, encoded: [{ type: 'image/webp', bytes: 150 * KB }] });
    const out = await optimizeImageForUpload(jpeg(927 * KB), 'content', codec);
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
    const out = await optimizeImageForUpload(jpeg(3_000 * KB, 'IMG_0001.JPG'), 'content', codec);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.jpg');
    expect(codec.encodeCalls).toEqual([
      { width: 1600, height: 1200, type: 'image/webp', quality: WEBP_QUALITY },
      { width: 1200, height: 900, type: 'image/jpeg', quality: 0.8 },
    ]);
  });

  it('re-encodes a transparent PNG at the fallback size when WebP was refused (Safari)', async () => {
    const png = new File([STILL_PNG_HEADER.slice().buffer, new Uint8Array(2_000 * KB)], 'logo.png', { type: 'image/png' });
    const codec = fakeCodec({
      width: 3000,
      height: 1000,
      encoded: [{ type: 'image/png', bytes: 1_231 * KB }, { type: 'image/png', bytes: 400 * KB }],
    });
    const out = await optimizeImageForUpload(png, 'content', codec);
    expect(out.type).toBe('image/png');
    expect(out.size).toBe(400 * KB);
    expect(codec.encodeCalls).toEqual([
      { width: 1600, height: 533, type: 'image/webp', quality: WEBP_QUALITY },
      { width: 1200, height: 400, type: 'image/png', quality: undefined },
    ]);
  });

  it('reuses the PNG the browser returned when the fallback size equals the first encode', async () => {
    const png = new File([STILL_PNG_HEADER.slice().buffer, new Uint8Array(400 * KB)], 'badge.png', { type: 'image/png' });
    const codec = fakeCodec({ width: 1100, height: 1000, encoded: [{ type: 'image/png', bytes: 200 * KB }] });
    const out = await optimizeImageForUpload(png, 'content', codec);
    expect(out.type).toBe('image/png');
    expect(out.size).toBe(200 * KB);
    expect(codec.encodeCalls).toEqual([{ width: 1100, height: 1000, type: 'image/webp', quality: WEBP_QUALITY }]);
  });

  it('returns the original when the result would not be smaller', async () => {
    const original = jpeg(400 * KB);
    const codec = fakeCodec({ width: 1408, height: 768, encoded: [{ type: 'image/webp', bytes: 500 * KB }] });
    expect(await optimizeImageForUpload(original, 'content', codec)).toBe(original);
  });

  it('returns a GIF untouched without decoding it', async () => {
    const gif = new File([new Uint8Array(900 * KB)], 'party.gif', { type: 'image/gif' });
    const codec = fakeCodec({ width: 1, height: 1, encoded: [], decodeError: new Error('must not decode') });
    expect(await optimizeImageForUpload(gif, 'content', codec)).toBe(gif);
  });

  it('returns an animated WebP untouched without decoding it', async () => {
    const header = webp([['VP8X', [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0]]]);
    const animated = new File([header.slice().buffer, new Uint8Array(400 * KB)], 'spin.webp', { type: 'image/webp' });
    const codec = fakeCodec({ width: 1, height: 1, encoded: [], decodeError: new Error('must not decode') });
    const decode = vi.spyOn(codec, 'decode');
    expect(await optimizeImageForUpload(animated, 'content', codec)).toBe(animated);
    expect(decode).not.toHaveBeenCalled();
  });

  it('returns a small image untouched', async () => {
    const small = jpeg(100 * KB);
    const codec = fakeCodec({ width: 800, height: 600, encoded: [{ type: 'image/webp', bytes: 1 }] });
    expect(await optimizeImageForUpload(small, 'content', codec)).toBe(small);
    expect(codec.encodeCalls).toHaveLength(0);
  });

  it('uploads an APNG whose acTL lies past the sniff window unchanged, and says why', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const header = png([['IHDR', new Array(13).fill(0)], ['iTXt', new Array(70_000).fill(0)], ['acTL', [0, 0, 0, 2, 0, 0, 0, 0]], ['IDAT', [1, 2]]]);
    const apng = new File([header.slice().buffer, new Uint8Array(400 * KB)], 'spinner.png', { type: 'image/png' });
    const codec = fakeCodec({ width: 1, height: 1, encoded: [], decodeError: new Error('must not decode') });
    const decode = vi.spyOn(codec, 'decode');
    expect(await optimizeImageForUpload(apng, 'content', codec)).toBe(apng);
    expect(decode).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"spinner.png"');
  });

  it('keeps a page background sharp on a 2x desktop: caps it at the background edge, not the content edge', async () => {
    expect(IMAGE_LIMITS['page-background'].maxEdgePx).toBe(3840);
    const codec = fakeCodec({ width: 3840, height: 2160, encoded: [{ type: 'image/webp', bytes: 300 * KB }] });
    await optimizeImageForUpload(jpeg(760 * KB, 'bg.jpg'), 'page-background', codec);
    expect(codec.encodeCalls).toEqual([{ width: 3840, height: 2160, type: 'image/webp', quality: WEBP_QUALITY }]);
    const huge = fakeCodec({ width: 8000, height: 4500, encoded: [{ type: 'image/webp', bytes: 900 * KB }] });
    await optimizeImageForUpload(jpeg(4_000 * KB, 'bg.jpg'), 'page-background', huge);
    expect(huge.encodeCalls[0]).toMatchObject({ width: 3840, height: 2160 });
  });

  it('applies the background edge to the no-WebP fallback too (Safari)', async () => {
    const codec = fakeCodec({
      width: 3840,
      height: 2160,
      encoded: [{ type: 'image/png', bytes: 9_000 * KB }, { type: 'image/jpeg', bytes: 700 * KB }],
    });
    await optimizeImageForUpload(jpeg(2_000 * KB, 'bg.jpg'), 'page-background', codec);
    expect(codec.encodeCalls[1]).toEqual({ width: 3840, height: 2160, type: 'image/jpeg', quality: JPEG_QUALITY });
  });

  it('keeps the content caps for every other image', () => {
    expect(IMAGE_LIMITS.content).toEqual({ maxEdgePx: MAX_IMAGE_EDGE_PX, fallbackMaxEdgePx: FALLBACK_MAX_EDGE_PX });
  });

  it('uploads the original and warns with the file name when decoding fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const original = jpeg(927 * KB, 'broken.jpg');
    const codec = fakeCodec({ width: 1, height: 1, encoded: [], decodeError: new Error('The source image cannot be decoded.') });
    expect(await optimizeImageForUpload(original, 'content', codec)).toBe(original);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"broken.jpg"');
    expect(String(warn.mock.calls[0][0])).toContain('cannot be decoded');
  });

  it('uploads the original and warns when encoding fails, and still releases the bitmap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const original = jpeg(927 * KB);
    const codec = fakeCodec({ width: 1408, height: 768, encoded: [], encodeError: new Error('canvas.toBlob returned null') });
    expect(await optimizeImageForUpload(original, 'content', codec)).toBe(original);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(codec.closed).toBe(1);
  });
});

describe('optimizeImageForUpload — real environment edges', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uploads the original and warns once when the browser has no createImageBitmap (default codec)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const original = jpeg(927 * KB, 'old-browser.jpg');
    expect(typeof createImageBitmap).not.toBe('function'); // node: this really is the missing-API path
    expect(await optimizeImageForUpload(original)).toBe(original);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"old-browser.jpg"');
  });

  it('still returns the original, with a warning, when releasing the bitmap throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const original = jpeg(400 * KB, 'close-fails.jpg');
    const codec = fakeCodec({ width: 1408, height: 768, encoded: [{ type: 'image/webp', bytes: 500 * KB }] });
    const decode = codec.decode.bind(codec);
    codec.decode = async () => ({ ...(await decode(new Blob())), close: () => { throw new Error('bitmap already detached'); } });
    expect(await optimizeImageForUpload(original, 'content', codec)).toBe(original);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"close-fails.jpg"');
  });
});

describe('browserCodec — source smoke (no canvas in the node test environment)', () => {
  const src = readFileSync(join(__dirname, 'image-optimize.ts'), 'utf8');

  it('decodes with EXIF orientation applied, so phone photos stay upright', () => {
    expect(src).toContain("imageOrientation: 'from-image'");
  });

});
