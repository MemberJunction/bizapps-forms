/**
 * Unit tests for the public upload flow (auth scope, file validation, distribution resolution,
 * and storage) with the storage provider + auth mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityInfo, EntityUserPermissionInfo, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { runUpload, type UploadContext, type UploadRequest, type UploadStorageEngine } from '../upload.service';
import { resetUploadConfigForTests } from '../config';
import type { ParsedFile } from '../multipart';
import { makeDefinition, makeDistribution, makeVersion } from '../../public-submit/__tests__/fakes';

const USER = { ID: 'anon', Name: 'Anonymous' } as unknown as UserInfo;

const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
const FORM_RESPONSE_ANSWER_ENTITY = 'MJ_BizApps_Forms: Form Response Answers';
const FORM_DISTRIBUTION_ENTITY = 'MJ_BizApps_Forms: Form Distributions';
const FORM_VERSION_ENTITY = 'MJ_BizApps_Forms: Form Versions';

/** Scope-metadata provider granting the given per-entity CanCreate map. */
function metadataProvider(perms: Record<string, boolean>) {
  return {
    EntityByName: (name: string): EntityInfo => {
      const permissions = {
        CanCreate: perms[name] ?? false,
        CanRead: true,
        CanUpdate: false,
        CanDelete: false,
      } as EntityUserPermissionInfo;
      return { Name: name, GetUserPermisions: () => permissions } as unknown as EntityInfo;
    },
  };
}

/** Respondent scope: CanCreate on the two response entities only (no accretion). */
function respondentPerms(): Record<string, boolean> {
  return {
    [FORM_RESPONSE_ENTITY]: true,
    [FORM_RESPONSE_ANSWER_ENTITY]: true,
    'MJ_BizApps_Forms: Forms': false,
    [FORM_VERSION_ENTITY]: false,
    [FORM_DISTRIBUTION_ENTITY]: false,
  };
}

/** RunView provider that resolves an open published distribution for slug 'public-1'. */
function runViewProvider(options: { openDistribution?: boolean } = {}) {
  const open = options.openDistribution ?? true;
  return {
    RunView: async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
      let rows: unknown[] = [];
      if (params.EntityName === FORM_DISTRIBUTION_ENTITY && open) {
        rows = [makeDistribution()];
      } else if (params.EntityName === FORM_VERSION_ENTITY && open) {
        rows = [makeVersion(makeDefinition())];
      }
      return { Success: true, Results: rows as T[], RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    },
    RunViews: async () => [],
  };
}

/** A storage engine stub that records the upload and returns a fixed file id. */
function storageEngine(overrides?: Partial<UploadStorageEngine>): { engine: UploadStorageEngine; upload: ReturnType<typeof vi.fn> } {
  const upload = vi.fn(async () => ({ FileID: 'file-123' }));
  const engine: UploadStorageEngine = {
    Config: vi.fn(async () => undefined),
    UploadFile: upload as unknown as UploadStorageEngine['UploadFile'],
    ...overrides,
  };
  return { engine, upload };
}

function pngFile(size = 16): ParsedFile {
  return { fieldName: 'file', filename: 'pic.png', contentType: 'image/png', data: Buffer.alloc(size, 1) };
}

function request(overrides?: Partial<UploadRequest>): UploadRequest {
  return { file: pngFile(), distributionSlug: 'public-1', distributionId: undefined, questionId: 'q-file', ...overrides };
}

function context(opts: { perms?: Record<string, boolean>; open?: boolean; storage?: UploadStorageEngine }): UploadContext {
  return {
    contextUser: USER,
    metadataProvider: metadataProvider(opts.perms ?? respondentPerms()),
    runViewProvider: runViewProvider({ openDistribution: opts.open }),
    storage: opts.storage ?? storageEngine().engine,
  };
}

beforeEach(() => resetUploadConfigForTests());
afterEach(() => {
  resetUploadConfigForTests();
  delete process.env.FORMS_UPLOAD_MAX_BYTES;
  delete process.env.FORMS_UPLOAD_ALLOWED_TYPES;
});

describe('runUpload', () => {
  it('stores the file and returns the MJ Files id + contract fields (happy path)', async () => {
    const { engine, upload } = storageEngine();
    const result = await runUpload(context({ storage: engine }), request());

    expect(result.ok).toBe(true);
    expect(result.success).toEqual({ fileId: 'file-123', name: 'pic.png', size: 16, contentType: 'image/png' });
    expect(upload).toHaveBeenCalledOnce();
    const args = upload.mock.calls[0][0] as { fileName: string; mimeType: string; content: Buffer };
    expect(args.fileName).toBe('pic.png');
    expect(args.mimeType).toBe('image/png');
    expect(args.content.length).toBe(16);
  });

  it('rejects (403) when the session lacks CanCreate on response answers', async () => {
    const perms = respondentPerms();
    perms[FORM_RESPONSE_ANSWER_ENTITY] = false;
    const result = await runUpload(context({ perms }), request());
    expect(result.ok).toBe(false);
    expect(result.failure?.status).toBe(403);
  });

  it('rejects (403) on privilege accretion (create on a definition entity)', async () => {
    const perms = respondentPerms();
    perms['MJ_BizApps_Forms: Forms'] = true;
    const result = await runUpload(context({ perms }), request());
    expect(result.failure?.status).toBe(403);
  });

  it('rejects (400) when no file is present', async () => {
    const result = await runUpload(context({}), request({ file: undefined }));
    expect(result.failure?.status).toBe(400);
  });

  it('rejects (413) when the file exceeds the size cap', async () => {
    process.env.FORMS_UPLOAD_MAX_BYTES = '8';
    resetUploadConfigForTests();
    const result = await runUpload(context({}), request({ file: pngFile(64) }));
    expect(result.failure?.status).toBe(413);
  });

  it('rejects (415) a disallowed content type (fail-closed)', async () => {
    const evil: ParsedFile = { fieldName: 'file', filename: 'x.exe', contentType: 'application/x-msdownload', data: Buffer.alloc(4, 1) };
    const result = await runUpload(context({}), request({ file: evil }));
    expect(result.failure?.status).toBe(415);
  });

  it('rejects (400) when questionId is missing', async () => {
    const result = await runUpload(context({}), request({ questionId: undefined }));
    expect(result.failure?.status).toBe(400);
  });

  it('rejects (400) when the distribution slug/id is missing', async () => {
    const result = await runUpload(context({}), request({ distributionSlug: undefined, distributionId: undefined }));
    expect(result.failure?.status).toBe(400);
  });

  it('rejects (404) when the distribution does not resolve to an open form', async () => {
    const result = await runUpload(context({ open: false }), request());
    expect(result.failure?.status).toBe(404);
  });

  it('returns a clean 5xx (not a crash) when storage is unconfigured', async () => {
    const throwing = storageEngine({
      UploadFile: vi.fn(async () => {
        throw new Error('No storage accounts configured');
      }) as unknown as UploadStorageEngine['UploadFile'],
    }).engine;
    const result = await runUpload(context({ storage: throwing }), request());
    expect(result.ok).toBe(false);
    expect(result.failure?.status).toBe(500);
    expect(result.failure?.error).toMatch(/storage/i);
  });
});
