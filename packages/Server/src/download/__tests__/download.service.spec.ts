import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

import { resetDownloadConfigCache } from '../config';
import {
  loadResponseFile,
  type DownloadContext,
  type StoredFileRow,
  type UploadProvenanceRow,
} from '../download.service';
import type { StorageReadEngine } from '../../storage/read-object';

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

function ok<T>(rows: T[]): RunViewResult<T> {
  return { Success: true, Results: rows } as RunViewResult<T>;
}

function denied<T>(): RunViewResult<T> {
  return { Success: false, Results: [], ErrorMessage: 'no read permission' } as RunViewResult<T>;
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
      GetAccountsByProviderID: () => [{ ID: 'account-1' }],
      ResolveStorageAccount: () => ({ account: { ID: 'account-1' } }),
      GetDriver: async () => ({ GetObject: async () => Buffer.from('PDF BYTES') }),
      ...stubs.storage,
    } as StorageReadEngine,
  };
}

beforeEach(() => {
  resetDownloadConfigCache();
  delete readAs.upload;
  delete readAs.file;
});

describe('loadResponseFile — the authorization', () => {
  it('serves the bytes to a caller who can read the provenance row', async () => {
    const result = await loadResponseFile(context(), FILE_ID);
    expect(result.ok).toBe(true);
    expect(result.payload?.content.toString()).toBe('PDF BYTES');
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
      context({ upload: ok([provenance({ FileName: 'signature.png' })]), file: ok([fileRow({ Name: 'blob' })]) }),
      FILE_ID,
    );
    expect(result.payload?.fileName).toBe('signature.png');
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
