import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logError, logErrorEx } = vi.hoisted(() => ({ logError: vi.fn(), logErrorEx: vi.fn() }));
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: logError,
  LogErrorEx: logErrorEx,
}));

import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

import { resetDownloadConfigCache } from '../config';
import { resetUploadConfigForTests } from '../../upload/config';
import {
  loadResponseFile,
  type DownloadContext,
  type StoredFileRow,
  type UploadProvenanceRow,
} from '../download.service';
import { resetRememberedReadsForTests, type StorageReadEngine } from '../../storage/read-object';

const FILE_ID = '11111111-2222-4333-8444-555555555555';
const CALLER = { ID: 'caller' } as unknown as UserInfo;
const SYSTEM = { ID: 'system' } as unknown as UserInfo;

function provenance(over: Partial<UploadProvenanceRow> = {}): UploadProvenanceRow {
  return { FileID: FILE_ID, FileName: 'resume.pdf', ContentType: 'application/pdf', Status: 'Active', ...over };
}

function fileRow(over: Partial<StoredFileRow> = {}): StoredFileRow {
  return {
    ID: FILE_ID,
    Name: 'resume.pdf',
    ContentType: 'application/pdf',
    ProviderID: 'provider-1',
    ProviderKey: 'forms-uploads/2026-08-19/abc/resume.pdf',
    Status: 'Active',
    ...over,
  };
}

/**
 * A complete `RunViewResult`, built rather than cast. The two helpers used to assert their way to
 * the type with `as`, which silently stopped being checkable once `strictNullChecks` was on — and
 * a cast that no longer overlaps is a fixture that can drift from the interface it stands in for.
 */
function runViewResult<T>(rows: T[], errorMessage = ''): RunViewResult<T> {
  return {
    Success: errorMessage === '',
    Results: rows,
    RowCount: rows.length,
    TotalRowCount: rows.length,
    ExecutionTime: 0,
    ErrorMessage: errorMessage,
  };
}

function ok<T>(rows: T[]): RunViewResult<T> {
  return runViewResult(rows);
}

function denied<T>(): RunViewResult<T> {
  return runViewResult<T>([], 'no read permission');
}

interface Stubs {
  upload?: RunViewResult<UploadProvenanceRow>;
  file?: RunViewResult<StoredFileRow>;
  storage?: Partial<StorageReadEngine>;
}

/** Records which principal each read ran as — the authorization split is the point of this file. */
const readAs: { upload?: UserInfo; file?: UserInfo } = {};

function context(stubs: Stubs = {}): DownloadContext {
  return {
    contextUser: CALLER,
    elevatedUser: SYSTEM,
    runViewProvider: {
      RunView: (async (params: RunViewParams, user?: UserInfo) => {
        if (params.EntityName === 'MJ_BizApps_Forms: Form Uploads') {
          readAs.upload = user;
          return stubs.upload ?? ok([provenance()]);
        }
        readAs.file = user;
        return stubs.file ?? ok([fileRow()]);
      }) as DownloadContext['runViewProvider']['RunView'],
    },
    storage: {
      Config: vi.fn(async () => undefined),
      Loaded: true,
      GetAccountsByProviderID: () => [{ ID: 'account-1', Name: 'Account 1' }],
      GetProviderById: () => ({ ID: 'provider-1', Name: 'Provider 1' }),
      ResolveStorageAccount: () => ({
        account: { ID: 'account-1', Name: 'Account 1' },
        provider: { ID: 'provider-1', Name: 'Provider 1' },
      }),
      GetDriver: async () => ({ GetObject: async () => Buffer.from('PDF BYTES') }),
      ...stubs.storage,
    } as StorageReadEngine,
  };
}

beforeEach(() => {
  resetDownloadConfigCache();
  resetUploadConfigForTests();
  resetRememberedReadsForTests();
  logError.mockClear();
  logErrorEx.mockClear();
  delete readAs.upload;
  delete readAs.file;
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDownloadConfigCache();
  resetUploadConfigForTests();
});

describe('loadResponseFile — the authorization', () => {
  it('serves the bytes to a caller who can read the provenance row', async () => {
    const result = await loadResponseFile(context(), FILE_ID);
    expect(result.ok).toBe(true);
    expect(result.payload?.content.toString()).toBe('PDF BYTES');
  });

  it('reads the object by its storage path, never as a provider-native id (#261)', async () => {
    const getObject = vi.fn(async () => Buffer.from('PDF BYTES'));
    const result = await loadResponseFile(
      context({ storage: { GetDriver: async () => ({ GetObject: getObject }) } }),
      FILE_ID,
    );
    expect(result.ok).toBe(true);
    expect(getObject).toHaveBeenCalledWith({ fullPath: 'forms-uploads/2026-08-19/abc/resume.pdf' });
  });

  it('checks the provenance row AS THE CALLER, which is what makes it an authorization', async () => {
    await loadResponseFile(context(), FILE_ID);
    expect(readAs.upload).toBe(CALLER);
  });

  it('reads the MJ: Files row elevated, because authors hold no grant on it', async () => {
    await loadResponseFile(context(), FILE_ID);
    expect(readAs.file).toBe(SYSTEM);
  });

  it('refuses a caller whose provenance read is denied', async () => {
    // A magic-link respondent lands here: "Form Respondent" grants CanCreate on two entities and
    // no reads at all.
    const result = await loadResponseFile(context({ upload: denied() }), FILE_ID);
    expect(result.failure).toMatchObject({ status: 404 });
  });

  it('refuses a file that is not a Forms upload, whatever its id', async () => {
    // Without this the route would read any MJ: Files record by id.
    const result = await loadResponseFile(context({ upload: ok([]) }), FILE_ID);
    expect(result.failure).toMatchObject({ status: 404 });
  });

  it('never reaches storage for a caller it refused', async () => {
    const getDriver = vi.fn();
    const result = await loadResponseFile(
      context({ upload: ok([]), storage: { GetDriver: getDriver as never } }),
      FILE_ID,
    );
    expect(result.ok).toBe(false);
    expect(getDriver).not.toHaveBeenCalled();
  });

  it('says the same thing for a denial, a missing row and a malformed id', async () => {
    const denials = await Promise.all([
      loadResponseFile(context({ upload: denied() }), FILE_ID),
      loadResponseFile(context({ upload: ok([]) }), FILE_ID),
      loadResponseFile(context(), 'not-a-guid'),
    ]);
    const messages = new Set(denials.map((d) => d.failure?.error));
    // Distinguishable errors would let a caller probe which file ids exist.
    expect(messages.size).toBe(1);
  });
});

describe('loadResponseFile — files that cannot be served', () => {
  it('answers 410 for a revoked upload, not 404', async () => {
    // It demonstrably existed and the reader is entitled to it; "not found" would send them
    // looking for a mistake they did not make. Matches the badge the detail view already shows.
    const result = await loadResponseFile(context({ upload: ok([provenance({ Status: 'Revoked' })]) }), FILE_ID);
    expect(result.failure).toMatchObject({ status: 410 });
    expect(result.failure?.error).toMatch(/revoked/i);
  });

  it('refuses a file record with no stored object behind it', async () => {
    const result = await loadResponseFile(context({ file: ok([fileRow({ ProviderKey: null })]) }), FILE_ID);
    expect(result.failure).toMatchObject({ status: 404 });
  });

  it('refuses a deleted file record', async () => {
    const result = await loadResponseFile(context({ file: ok([fileRow({ Status: 'Deleted' })]) }), FILE_ID);
    expect(result.failure).toMatchObject({ status: 404 });
  });

  it('reports a storage failure as a 500, distinct from a refusal', async () => {
    const result = await loadResponseFile(
      context({
        storage: {
          GetDriver: (async () => ({
            GetObject: async () => {
              throw new Error('disk gone');
            },
          })) as never,
        },
      }),
      FILE_ID,
    );
    expect(result.failure).toMatchObject({ status: 500 });
  });

  it('reports no resolvable storage account rather than throwing at the route', async () => {
    const result = await loadResponseFile(
      context({ storage: { GetAccountsByProviderID: () => [], ResolveStorageAccount: () => null } }),
      FILE_ID,
    );
    expect(result.failure).toMatchObject({ status: 500 });
  });
});

describe('loadResponseFile — what the reader gets', () => {
  it("prefers the provenance row's name, which is the name they clicked", async () => {
    const result = await loadResponseFile(
      context({ upload: ok([provenance({ FileName: 'doodle.png' })]), file: ok([fileRow({ Name: 'blob' })]) }),
      FILE_ID,
    );
    expect(result.payload?.fileName).toBe('doodle.png');
  });

  it('falls back to the file record when provenance recorded no name', async () => {
    const result = await loadResponseFile(
      context({ upload: ok([provenance({ FileName: null })]), file: ok([fileRow({ Name: 'resume.pdf' })]) }),
      FILE_ID,
    );
    expect(result.payload?.fileName).toBe('resume.pdf');
  });

  it('falls back to a generic content type rather than sending an empty one', async () => {
    const result = await loadResponseFile(
      context({ upload: ok([provenance({ ContentType: null })]), file: ok([fileRow({ ContentType: '  ' })]) }),
      FILE_ID,
    );
    expect(result.payload?.contentType).toBe('application/octet-stream');
  });
});

describe('loadResponseFile — the account the bytes are read from (#290)', () => {
  const UPLOAD_ACCOUNT = 'AAAAAAAA-0000-4000-8000-00000000000A';
  const DOWNLOAD_ACCOUNT = 'BBBBBBBB-0000-4000-8000-00000000000B';
  const OTHER_ACCOUNT = 'CCCCCCCC-0000-4000-8000-00000000000C';
  const accounts = () => [
    { ID: OTHER_ACCOUNT, Name: 'Other' },
    { ID: DOWNLOAD_ACCOUNT, Name: 'Download' },
    { ID: UPLOAD_ACCOUNT, Name: 'Upload' },
  ];

  function pins(): void {
    vi.stubEnv('FORMS_UPLOAD_STORAGE_ACCOUNT', UPLOAD_ACCOUNT);
    vi.stubEnv('FORMS_DOWNLOAD_STORAGE_ACCOUNT', DOWNLOAD_ACCOUNT);
    resetDownloadConfigCache();
    resetUploadConfigForTests();
  }

  it('tries the upload pin before the download pin, then the rest of the provider', async () => {
    pins();
    const GetDriver = vi.fn(async () => ({
      GetObject: async (): Promise<Buffer> => {
        throw new Error('nope');
      },
    }));
    await loadResponseFile(context({ storage: { GetAccountsByProviderID: accounts, GetDriver } }), FILE_ID);
    expect(GetDriver.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      UPLOAD_ACCOUNT,
      DOWNLOAD_ACCOUNT,
      OTHER_ACCOUNT,
    ]);
  });

  it('keeps the generic 500 on total failure and logs the accounts, key and provider', async () => {
    pins();
    const result = await loadResponseFile(
      context({
        storage: {
          GetAccountsByProviderID: accounts,
          GetDriver: async () => ({
            GetObject: async (): Promise<Buffer> => {
              throw new Error('disk gone');
            },
          }),
        },
      }),
      FILE_ID,
    );
    expect(result.failure).toEqual({ status: 500, error: 'That file could not be read from storage.' });
    const line = String(logError.mock.calls[0][0]);
    for (const id of [UPLOAD_ACCOUNT, DOWNLOAD_ACCOUNT, OTHER_ACCOUNT]) expect(line).toContain(id);
    expect(line).toContain('Provider 1');
    expect(line).toContain('key forms-uploads/2026-08-19/abc/resume.pdf');
  });

  it('warns when a fallback account served the file', async () => {
    pins();
    const result = await loadResponseFile(
      context({
        storage: {
          GetAccountsByProviderID: accounts,
          GetDriver: async (id: string) => ({
            GetObject: async (): Promise<Buffer> => {
              if (id !== OTHER_ACCOUNT) throw new Error('missing');
              return Buffer.from('PDF BYTES');
            },
          }),
        },
      }),
      FILE_ID,
    );
    expect(result.ok).toBe(true);
    const arg = logErrorEx.mock.calls[0][0] as { severity: string; message: string };
    expect(arg.severity).toBe('warning');
    expect(arg.message).toContain(OTHER_ACCOUNT);
    expect(arg.message).toContain('ordered by FORMS_UPLOAD_STORAGE_ACCOUNT, then FORMS_DOWNLOAD_STORAGE_ACCOUNT, then');
    expect(arg.message).not.toMatch(/\bPin FORMS_/);
  });
});
