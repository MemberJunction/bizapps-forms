/**
 * The asset upload as the ROUTE actually runs it: read the capped body, parse the multipart,
 * then run the service. Three steps that are individually tested elsewhere and were still
 * wrong together.
 *
 * This file exists because of a defect no unit test could have caught. `validateImage` returns
 * a friendly "Image exceeds the maximum size of 5 MB." and has a test proving it — but the
 * middleware capped the BODY at the same number as the FILE, so `readCappedBody` rejected the
 * request first with its own byte-shaped wording and `validateImage`'s branch was unreachable
 * in production. Every test passed; every author saw "5242880 bytes".
 *
 * So these tests compose the same three calls the middleware composes, against a real multipart
 * body, and assert on what an author would end up reading.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { RunViewParams, RunViewResult, UserInfo, EntityInfo } from '@memberjunction/core';

import { readCappedBody, type ReadableRequest } from '../../http/request-body';
import { parseMultipart } from '../../upload/multipart';
import { assetBodyCap, assetTooLargeMessage, getAssetConfig, resetAssetConfigForTests } from '../config';
import { runAssetUpload, type AssetUploadContext } from '../asset.service';

const BOUNDARY = '----formsAssetBoundary';
const CONTENT_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;
const FORM_ID = '11111111-1111-1111-1111-111111111111';

/** A browser-shaped multipart body: one `formId` field plus one image part. */
function buildBody(imageBytes: Buffer, filename = 'photo.png', type = 'image/png'): Buffer {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="formId"\r\n\r\n${FORM_ID}\r\n`),
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${type}\r\n\r\n`,
    ),
    imageBytes,
    Buffer.from('\r\n'),
    Buffer.from(`--${BOUNDARY}--\r\n`),
  ]);
}

function uploadContext(): AssetUploadContext {
  return {
    contextUser: { ID: 'author' } as UserInfo,
    metadataProvider: {
      EntityByName: (): EntityInfo => ({ GetUserPermisions: () => ({ CanUpdate: true }) }) as unknown as EntityInfo,
    },
    runViewProvider: {
      RunView: async <T,>(_p: RunViewParams): Promise<RunViewResult<T>> =>
        ({ Success: true, Results: [{ ID: FORM_ID }] as unknown as T[] }) as RunViewResult<T>,
    },
    storage: {
      Config: vi.fn(async () => undefined),
      HasStorageAccounts: true,
      UploadFile: vi.fn(async () => ({ FileID: 'file-1', StoragePath: 'forms-assets/x/photo.png' })),
    },
    elevatedUser: { ID: 'system' } as UserInfo,
  };
}

/**
 * Run the exact sequence `AssetMiddleware.handleUpload` runs, and report what the author reads.
 * Returns the error text for a rejection, or `null` when the upload succeeded.
 */
async function uploadThroughRoute(body: Buffer): Promise<string | null> {
  const req = new EventEmitter() as EventEmitter & ReadableRequest;
  req.headers = {};
  const pending = readCappedBody(req, assetBodyCap(), assetTooLargeMessage());
  req.emit('data', body);
  req.emit('end');

  const read = await pending;
  if (!read.ok || !read.body) {
    return read.error ?? 'unknown read failure';
  }
  const parsed = parseMultipart(read.body, CONTENT_TYPE);
  if (!parsed.ok) {
    return parsed.reason ?? 'unknown parse failure';
  }
  const result = await runAssetUpload(uploadContext(), { file: parsed.file, formId: parsed.fields.formId });
  return result.ok ? null : (result.failure?.error ?? 'unknown upload failure');
}

beforeEach(() => resetAssetConfigForTests());
afterEach(() => {
  delete process.env.FORMS_ASSET_MAX_BYTES;
  resetAssetConfigForTests();
});

describe('an oversized image, through the route', () => {
  it('tells the author the limit in the units the limit is written in', async () => {
    const overCap = Buffer.alloc(getAssetConfig().maxBytes + 1, 0x89);

    const error = await uploadThroughRoute(buildBody(overCap));

    expect(error).toBe('Image exceeds the maximum size of 5 MB.');
  });

  it('accepts a file of EXACTLY the advertised size', async () => {
    // The bug hiding behind the first one. The multipart envelope adds a few hundred bytes, so a
    // body capped at the file limit rejected a file that was precisely at the limit — the
    // advertised number was a lie, and the author had no way to tell why.
    const exactlyAtCap = Buffer.alloc(getAssetConfig().maxBytes, 0x89);

    expect(await uploadThroughRoute(buildBody(exactlyAtCap))).toBeNull();
  });

  it('still refuses a body far too large to be one of ours, in the same voice', async () => {
    // The memory guard has to keep firing — headroom is not an amnesty. But when it fires, an
    // author must not suddenly be reading a different vocabulary than the one the size check
    // uses two lines further down.
    const absurd = Buffer.alloc(assetBodyCap() + 1, 0x89);

    const error = await uploadThroughRoute(buildBody(absurd));

    expect(error).toBe('Image exceeds the maximum size of 5 MB.');
  });
});
