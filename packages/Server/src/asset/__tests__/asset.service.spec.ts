import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { logError, logErrorEx } = vi.hoisted(() => ({ logError: vi.fn(), logErrorEx: vi.fn() }));
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: logError,
  LogErrorEx: logErrorEx,
}));

import type { EntityInfo, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { ParsedFile } from '../../upload/multipart';
import { resetAssetConfigForTests } from '../config';
import { resetRememberedReadsForTests } from '../../storage/read-object';
import {
  checkAuthorScope,
  loadAssetBytes,
  runAssetUpload,
  validateImage,
  type AssetReadContext,
  type AssetReadStorage,
  type AssetRunViewProvider,
  type AssetUploadContext,
  type StoredAssetRecord,
} from '../asset.service';

const FORM_ID = '11111111-1111-1111-1111-111111111111';
const FILE_ID = '22222222-2222-2222-2222-222222222222';

const AUTHOR = { ID: 'author-1' } as UserInfo;
const SYSTEM = { ID: 'system' } as UserInfo;

function png(bytes = 32, filename = 'logo.png'): ParsedFile {
  return { fieldName: 'file', filename, contentType: 'image/png', data: Buffer.alloc(bytes, 1) };
}

/** Metadata whose Forms entity reports the given permissions. */
function metadataWith(permissions: { CanUpdate: boolean } | undefined) {
  return {
    EntityByName: (): EntityInfo | undefined =>
      permissions ? ({ GetUserPermisions: () => permissions } as unknown as EntityInfo) : undefined,
  };
}

/**
 * RunView returning one form row (or none), counting its calls.
 *
 * Not a `vi.fn`: `Mock<…>` instantiates the generic once, so a mocked `RunView<T>` does not satisfy
 * `AssetRunViewProvider`'s generic signature. A plain generic function plus a counter does, and
 * the one assertion that cared about calls reads the counter.
 */
function runViewWith(rows: Array<{ ID: string }>, success = true): AssetRunViewProvider & { calls: number } {
  const provider = {
    calls: 0,
    async RunView<T = unknown>(_p: RunViewParams, _u?: UserInfo): Promise<RunViewResult<T>> {
      provider.calls++;
      return { Success: success, Results: rows as unknown as T[], ErrorMessage: success ? '' : 'boom' } as RunViewResult<T>;
    },
  };
  return provider;
}

function uploadContext(overrides: Partial<AssetUploadContext> = {}): AssetUploadContext {
  return {
    contextUser: AUTHOR,
    metadataProvider: metadataWith({ CanUpdate: true }),
    runViewProvider: runViewWith([{ ID: FORM_ID }]),
    storage: {
      Config: vi.fn(async () => undefined),
      HasStorageAccounts: true,
      UploadFile: vi.fn(async () => ({ FileID: FILE_ID, StoragePath: `forms-assets/${FORM_ID}/logo.png` })),
    },
    elevatedUser: SYSTEM,
    ...overrides,
  };
}

beforeEach(() => {
  resetAssetConfigForTests();
  resetRememberedReadsForTests();
  logError.mockClear();
  logErrorEx.mockClear();
});
afterEach(() => {
  delete process.env.FORMS_ASSET_STORAGE_ACCOUNT;
  delete process.env.FORMS_ASSET_MAX_BYTES;
  resetAssetConfigForTests();
});

describe('checkAuthorScope', () => {
  it('allows a caller holding Update on Forms', () => {
    expect(checkAuthorScope(metadataWith({ CanUpdate: true }), AUTHOR).ok).toBe(true);
  });

  it('rejects a caller without it — which is what rejects an anonymous respondent session', () => {
    // The respondent role grants CanCreate on the two response entities and nothing else, so a
    // respondent's perfectly valid magic-link JWT fails HERE rather than needing a special case.
    const result = checkAuthorScope(metadataWith({ CanUpdate: false }), AUTHOR);
    expect(result.failure?.status).toBe(403);
  });

  it('fails closed when the Forms entity is missing from metadata', () => {
    expect(checkAuthorScope(metadataWith(undefined), AUTHOR).failure?.status).toBe(500);
  });
});

describe('validateImage', () => {
  it('accepts an allowed image within the cap', () => {
    expect(validateImage(png()).ok).toBe(true);
  });

  it('rejects a missing, empty, oversized or non-image file', () => {
    expect(validateImage(undefined).failure?.status).toBe(400);
    expect(validateImage(png(0)).failure?.status).toBe(400);

    process.env.FORMS_ASSET_MAX_BYTES = '10';
    resetAssetConfigForTests();
    expect(validateImage(png(11)).failure?.status).toBe(413);

    delete process.env.FORMS_ASSET_MAX_BYTES;
    resetAssetConfigForTests();
    const script = { ...png(), contentType: 'text/html', filename: 'x.html' };
    expect(validateImage(script).failure?.status).toBe(415);
  });

  it('states the cap in units an author reads, not in bytes', () => {
    process.env.FORMS_ASSET_MAX_BYTES = String(5 * 1024 * 1024);
    resetAssetConfigForTests();
    expect(validateImage(png(6 * 1024 * 1024)).failure?.error).toContain('5 MB');
  });
});

describe('runAssetUpload', () => {
  it('stores the bytes under the public asset prefix for the form', async () => {
    const ctx = uploadContext();
    const result = await runAssetUpload(ctx, { file: png(), formId: FORM_ID });

    expect(result.success).toEqual({ fileId: FILE_ID, name: 'logo.png', size: 32, contentType: 'image/png' });
    expect(ctx.storage.UploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        // Prefix-match, not equality: every asset gets its own trailing segment so two
        // same-named images on one form cannot resolve to one object.
        pathPrefix: expect.stringMatching(new RegExp(`^forms-assets/${FORM_ID}/[0-9a-f-]{36}$`)),
        contextUser: SYSTEM,
      }),
    );
  });

  it('checks permission BEFORE touching storage', async () => {
    // Order matters: a denied caller must not be able to make us write anything at all.
    const ctx = uploadContext({ metadataProvider: metadataWith({ CanUpdate: false }) });
    const result = await runAssetUpload(ctx, { file: png(), formId: FORM_ID });

    expect(result.failure?.status).toBe(403);
    expect(ctx.storage.UploadFile).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed formId before running any query', async () => {
    const ctx = uploadContext();
    expect((await runAssetUpload(ctx, { file: png(), formId: undefined })).failure?.status).toBe(400);
    expect((await runAssetUpload(ctx, { file: png(), formId: 'not-a-guid' })).failure?.status).toBe(400);
    expect((ctx.runViewProvider as AssetRunViewProvider & { calls: number }).calls).toBe(0);
  });

  it('404s a form the caller cannot see', async () => {
    // The lookup runs under the CALLER's context, so an invisible form is indistinguishable from
    // a missing one — which is the point: an author cannot write into another tenant's folder.
    const ctx = uploadContext({ runViewProvider: runViewWith([]) });
    expect((await runAssetUpload(ctx, { file: png(), formId: FORM_ID })).failure?.status).toBe(404);
  });

  it('reports a failed lookup as a server error rather than a missing form', async () => {
    const ctx = uploadContext({ runViewProvider: runViewWith([], false) });
    expect((await runAssetUpload(ctx, { file: png(), formId: FORM_ID })).failure?.status).toBe(500);
  });

  it('writes the DATABASE spelling of the form id into the path', async () => {
    // The path must not be able to disagree with the row about which form owns the asset.
    const ctx = uploadContext({ runViewProvider: runViewWith([{ ID: FORM_ID.toUpperCase() }]) });
    await runAssetUpload(ctx, { file: png(), formId: FORM_ID });
    expect(ctx.storage.UploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        pathPrefix: expect.stringMatching(
          new RegExp(`^forms-assets/${FORM_ID.toUpperCase()}/[0-9a-f-]{36}$`),
        ),
      }),
    );
  });

  it('sanitises a path-traversing filename to a bare basename', async () => {
    const ctx = uploadContext();
    await runAssetUpload(ctx, { file: { ...png(), filename: '../../etc/pa$$wd.png' }, formId: FORM_ID });
    expect(ctx.storage.UploadFile).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'pawd.png' }));
  });

  it('never stores a dot-segment filename, which the read guard would refuse to serve', async () => {
    for (const filename of ['..', '.']) {
      const ctx = uploadContext();
      await runAssetUpload(ctx, { file: { ...png(), filename }, formId: FORM_ID });
      expect(ctx.storage.UploadFile).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'image' }));
    }
  });

  it('turns a storage failure into a 500 instead of throwing out of the route', async () => {
    const ctx = uploadContext({
      storage: {
        Config: vi.fn(async () => undefined),
        HasStorageAccounts: true,
        UploadFile: vi.fn(async () => {
          throw new Error('the bucket is on fire');
        }),
      },
    });
    const result = await runAssetUpload(ctx, { file: png(), formId: FORM_ID });
    expect(result.failure?.status).toBe(500);
    expect(result.failure?.error).toContain('the bucket is on fire');
  });

  it('tells the author what is wrong when the instance has no storage account at all', async () => {
    // The likeliest failure on a fresh install: MJ seeds seven storage PROVIDERS but no ACCOUNT,
    // so the engine throws a message about its own internals. An author reads this one instead,
    // and it names both the fix and the workaround.
    const ctx = uploadContext();
    ctx.storage = { ...ctx.storage, HasStorageAccounts: false };
    const result = await runAssetUpload(ctx, { file: png(), formId: FORM_ID });

    expect(result.failure?.status).toBe(503);
    expect(result.failure?.error).toMatch(/administrator/i);
    expect(result.failure?.error).toMatch(/paste an image URL/i);
    expect(ctx.storage.UploadFile).not.toHaveBeenCalled();
  });
});

/** A stored file row, defaulting to a legitimate asset. */
function fileRecord(overrides: Partial<StoredAssetRecord> = {}): StoredAssetRecord {
  return {
    ID: FILE_ID,
    Name: 'logo.png',
    ContentType: 'image/png',
    ProviderID: 'provider-1',
    ProviderKey: `forms-assets/${FORM_ID}/logo.png`,
    Status: 'Uploaded',
    ...overrides,
  };
}

function readContext(file: StoredAssetRecord | undefined, storage?: Partial<AssetReadStorage>): AssetReadContext {
  const getObject = vi.fn(async () => Buffer.from('PNGDATA'));
  return {
    systemUser: SYSTEM,
    storage: {
      Config: vi.fn(async () => undefined),
      Loaded: true,
      GetAccountsByProviderID: () => [{ ID: 'account-1', Name: 'Account 1' }],
      GetProviderById: () => ({ ID: 'provider-1', Name: 'Provider 1' }),
      ResolveStorageAccount: () => ({
        account: { ID: 'fallback-account', Name: 'Fallback' },
        provider: { ID: 'provider-1', Name: 'Provider 1' },
      }),
      GetDriver: vi.fn(async () => ({ GetObject: getObject })),
      ...storage,
    },
    loadFile: vi.fn(async () => file),
  };
}

describe('loadAssetBytes — the anonymous read guard', () => {
  it('serves a file stored under the public asset prefix', async () => {
    const result = await loadAssetBytes(readContext(fileRecord()), FILE_ID);
    expect(result.asset?.content.toString()).toBe('PNGDATA');
    expect(result.asset?.contentType).toBe('image/png');
  });

  it('REFUSES a respondent-uploaded file, which is the whole point of the guard', async () => {
    // Without this, `GET /forms/asset/<id>` is an unauthenticated reader for every résumé,
    // ID scan and medical form any respondent ever attached to any form.
    const respondentUpload = fileRecord({ ProviderKey: 'forms-uploads/2026-08-18/resume.pdf' });
    const result = await loadAssetBytes(readContext(respondentUpload), FILE_ID);
    expect(result.failure).toEqual({ status: 404, error: 'Not found.' });
  });

  it('refuses a file with no provider key at all', async () => {
    const result = await loadAssetBytes(readContext(fileRecord({ ProviderKey: null })), FILE_ID);
    expect(result.failure?.status).toBe(404);
  });

  it('refuses a deleted asset', async () => {
    const result = await loadAssetBytes(readContext(fileRecord({ Status: 'Deleted' })), FILE_ID);
    expect(result.failure?.status).toBe(404);
  });

  it('gives an unknown id and a non-asset id the SAME answer', async () => {
    // Different wording here would make the route an oracle for which MJ: Files ids exist.
    const missing = await loadAssetBytes(readContext(undefined), FILE_ID);
    const notAnAsset = await loadAssetBytes(readContext(fileRecord({ ProviderKey: 'artifacts/x.png' })), FILE_ID);
    expect(missing.failure).toEqual(notAnAsset.failure);
  });

  it('rejects a malformed id without querying at all', async () => {
    const ctx = readContext(fileRecord());
    expect((await loadAssetBytes(ctx, 'not-a-guid')).failure?.status).toBe(404);
    expect((await loadAssetBytes(ctx, '')).failure?.status).toBe(404);
    expect(ctx.loadFile).not.toHaveBeenCalled();
  });

  it('reads through an account on the file’s own provider', async () => {
    const ctx = readContext(fileRecord());
    await loadAssetBytes(ctx, FILE_ID);
    expect(ctx.storage.GetDriver).toHaveBeenCalledWith('account-1', SYSTEM);
  });

  it('reads the object by its storage path, never as a provider-native id (#261)', async () => {
    const getObject = vi.fn(async () => Buffer.from('PNGDATA'));
    const ctx = readContext(fileRecord(), { GetDriver: vi.fn(async () => ({ GetObject: getObject })) });
    await loadAssetBytes(ctx, FILE_ID);
    expect(getObject).toHaveBeenCalledWith({ fullPath: `forms-assets/${FORM_ID}/logo.png` });
  });

  it('falls back to the configured account when the provider has none', async () => {
    const ctx = readContext(fileRecord(), { GetAccountsByProviderID: () => [] });
    await loadAssetBytes(ctx, FILE_ID);
    expect(ctx.storage.GetDriver).toHaveBeenCalledWith('fallback-account', SYSTEM);
  });

  it('500s cleanly when no account resolves at all', async () => {
    const ctx = readContext(fileRecord(), {
      GetAccountsByProviderID: () => [],
      ResolveStorageAccount: () => null,
    });
    expect((await loadAssetBytes(ctx, FILE_ID)).failure?.status).toBe(500);
  });

  it('turns a lookup or driver failure into a 500, never a throw', async () => {
    const thrower = readContext(fileRecord());
    thrower.loadFile = vi.fn(async () => {
      throw new Error('db down');
    });
    expect((await loadAssetBytes(thrower, FILE_ID)).failure?.status).toBe(500);

    const badDriver = readContext(fileRecord(), {
      GetDriver: vi.fn(async () => ({
        GetObject: async () => {
          throw new Error('object gone');
        },
      })),
    });
    expect((await loadAssetBytes(badDriver, FILE_ID)).failure?.status).toBe(500);
  });

  it('falls back to a safe content type when the row records none', async () => {
    const result = await loadAssetBytes(readContext(fileRecord({ ContentType: null, Name: null })), FILE_ID);
    expect(result.asset?.contentType).toBe('application/octet-stream');
    expect(result.asset?.fileName).toBe('image');
  });
});

describe('loadAssetBytes — the account the bytes are read from (#290)', () => {
  const ACCOUNT_A = 'AAAAAAAA-0000-4000-8000-00000000000A';
  const ACCOUNT_B = 'BBBBBBBB-0000-4000-8000-00000000000B';
  const twoAccounts = () => [
    { ID: ACCOUNT_A, Name: 'Account A' },
    { ID: ACCOUNT_B, Name: 'Account B' },
  ];

  /** A driver factory whose accounts hold bytes only when listed in `holders`. */
  function driversHolding(holders: string[]) {
    return vi.fn(async (accountId: string) => ({
      GetObject: async () => {
        if (!holders.includes(accountId)) throw new Error(`ENOENT in ${accountId}`);
        return Buffer.from('PNGDATA');
      },
    }));
  }

  it('reads a pinned host’s own upload even though the engine lists another account first', async () => {
    process.env.FORMS_ASSET_STORAGE_ACCOUNT = ACCOUNT_B.toLowerCase();
    resetAssetConfigForTests();
    const GetDriver = driversHolding([ACCOUNT_B]);
    const result = await loadAssetBytes(
      readContext(fileRecord(), { GetAccountsByProviderID: twoAccounts, GetDriver }),
      FILE_ID,
    );
    expect(result.ok).toBe(true);
    expect(GetDriver).toHaveBeenCalledTimes(1);
    expect(GetDriver).toHaveBeenNthCalledWith(1, ACCOUNT_B, SYSTEM);
    expect(logErrorEx).not.toHaveBeenCalled();
  });

  it('answers a generic 500 and logs every account tried, the key and the provider when none holds the bytes', async () => {
    const result = await loadAssetBytes(
      readContext(fileRecord(), { GetAccountsByProviderID: twoAccounts, GetDriver: driversHolding([]) }),
      FILE_ID,
    );
    expect(result.failure).toEqual({ status: 500, error: 'Could not read the image.' });
    expect(logError).toHaveBeenCalledTimes(1);
    const line = String(logError.mock.calls[0][0]);
    expect(line).toContain(ACCOUNT_A);
    expect(line).toContain(ACCOUNT_B);
    expect(line).toContain('Provider 1');
    expect(line).toContain(`key forms-assets/${FORM_ID}/logo.png`);
    expect(line).toContain('provider provider-1');
  });

  it('warns, naming the serving account, when a fallback account served the bytes', async () => {
    const result = await loadAssetBytes(
      readContext(fileRecord(), { GetAccountsByProviderID: twoAccounts, GetDriver: driversHolding([ACCOUNT_B]) }),
      FILE_ID,
    );
    expect(result.ok).toBe(true);
    expect(logErrorEx).toHaveBeenCalledTimes(1);
    const arg = logErrorEx.mock.calls[0][0] as { severity: string; message: string };
    expect(arg.severity).toBe('warning');
    expect(arg.message).toContain(`"Account B" (${ACCOUNT_B})`);
    expect(arg.message).toContain('(if any), then FORMS_ASSET_STORAGE_ACCOUNT, then');
    expect(arg.message).not.toMatch(/\bPin FORMS_/);
  });
});
