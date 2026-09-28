import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  JPEG_QUALITY,
  MAX_IMAGE_EDGE_PX,
  SKIP_BELOW_BYTES,
  WEBP_QUALITY,
  isAnimatedImage,
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

describe('isAnimatedImage', () => {
  const vp8xFlags = (flags: number): number[] => [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  it('detects an animated WebP by the VP8X animation flag', () => {
    expect(isAnimatedImage(webp([['VP8X', vp8xFlags(0x02)], ['VP8 ', [1, 2, 3, 4]]]), 'image/webp')).toBe(true);
  });

  it('detects an animated WebP by an ANIM chunk alone', () => {
    expect(isAnimatedImage(webp([['VP8X', vp8xFlags(0)], ['ANIM', [0, 0, 0, 0, 0, 0]]]), 'image/webp')).toBe(true);
  });

  it('treats a still WebP as still (VP8X without the flag, and plain VP8)', () => {
    expect(isAnimatedImage(webp([['VP8X', vp8xFlags(0x10)], ['VP8 ', [1, 2, 3, 4]]]), 'image/webp')).toBe(false);
    expect(isAnimatedImage(webp([['VP8 ', [1, 2, 3, 4]]]), 'image/webp')).toBe(false);
  });

  it('detects an APNG by acTL before the first IDAT', () => {
    const header = png([['IHDR', new Array(13).fill(0)], ['acTL', [0, 0, 0, 2, 0, 0, 0, 0]], ['IDAT', [1, 2]]]);
    expect(isAnimatedImage(header, 'image/png')).toBe(true);
  });

  it('treats a still PNG as still, even with an acTL after IDAT', () => {
    expect(isAnimatedImage(png([['IHDR', new Array(13).fill(0)], ['IDAT', [1, 2]]]), 'image/png')).toBe(false);
    expect(isAnimatedImage(png([['IHDR', new Array(13).fill(0)], ['IDAT', [1, 2]], ['acTL', [0, 0, 0, 2, 0, 0, 0, 0]]]), 'image/png')).toBe(false);
  });

  it('returns false for truncated or malformed input rather than throwing', () => {
    expect(isAnimatedImage(new Uint8Array(0), 'image/webp')).toBe(false);
    expect(isAnimatedImage(webp([['VP8X', vp8xFlags(0x02)]]).slice(0, 14), 'image/webp')).toBe(false);
    expect(isAnimatedImage(png([['IHDR', new Array(13).fill(0)]]).slice(0, 10), 'image/png')).toBe(false);
    expect(isAnimatedImage(Uint8Array.from(PNG_SIGNATURE.slice(0, 5)), 'image/png')).toBe(false);
    expect(isAnimatedImage(Uint8Array.from([...ascii('RIFF'), ...le32(4), ...ascii('WAVE')]), 'image/webp')).toBe(false);
  });

  it('stops at a chunk that claims to run past the header', () => {
    const huge = Uint8Array.from([...ascii('RIFF'), ...le32(0), ...ascii('WEBP'), ...ascii('JUNK'), ...le32(0xffffffff)]);
    expect(isAnimatedImage(huge, 'image/webp')).toBe(false);
  });

  it('returns false for any other content type, whatever the bytes', () => {
    expect(isAnimatedImage(webp([['VP8X', vp8xFlags(0x02)]]), 'image/jpeg')).toBe(false);
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

  it('returns an animated WebP untouched without decoding it', async () => {
    const header = webp([['VP8X', [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0]]]);
    const animated = new File([header.slice().buffer, new Uint8Array(400 * KB)], 'spin.webp', { type: 'image/webp' });
    const codec = fakeCodec({ width: 1, height: 1, encoded: [], decodeError: new Error('must not decode') });
    const decode = vi.spyOn(codec, 'decode');
    expect(await optimizeImageForUpload(animated, codec)).toBe(animated);
    expect(decode).not.toHaveBeenCalled();
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
    expect(await optimizeImageForUpload(original, codec)).toBe(original);
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
