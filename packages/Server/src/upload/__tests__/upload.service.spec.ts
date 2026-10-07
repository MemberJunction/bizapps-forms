/**
 * Unit tests for the public upload flow (auth scope, file validation, distribution resolution,
 * and storage) with the storage provider + auth mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityInfo, EntityUserPermissionInfo, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { runUpload, UPLOAD_FAILED_MESSAGE, type UploadContext, type UploadRequest, type UploadStorageEngine } from '../upload.service';
import { resetUploadConfigForTests } from '../config';
import { FOREIGN_ORIGIN_MESSAGE } from '../../http/embed-origin';
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

/**
 * The published definition the fake distribution serves: the shared fake's ShortText question
 * plus the two file-answer questions the requests here upload against — the endpoint verifies
 * the question exists on the definition AND that its answer lands in the file column.
 */
function makeUploadDefinition() {
  const definition = makeDefinition();
  definition.pages[0].questions.push({
    id: 'q-file',
    type: 'FileUpload',
    prompt: 'Upload your résumé',
    isRequired: false,
    displayOrder: 2,
    options: [],
  });
  // A Doodle answer IS a file answer — the pad exports a PNG and sends it down this same
  // route — so the definition carries one to upload against.
  definition.pages[0].questions.push({
    id: 'q-sign',
    type: 'Doodle',
    prompt: 'Sign here',
    isRequired: false,
    displayOrder: 3,
    options: [],
  });
  return definition;
}

/** RunView provider that resolves an open published distribution for slug 'public-1'. */
function runViewProvider(options: { openDistribution?: boolean; allowedOrigins?: string | null } = {}) {
  const open = options.openDistribution ?? true;
  return {
    RunView: async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
      let rows: unknown[] = [];
      if (params.EntityName === FORM_DISTRIBUTION_ENTITY && open) {
        rows = [makeDistribution({ AllowedOrigins: options.allowedOrigins ?? null })];
      } else if (params.EntityName === FORM_VERSION_ENTITY && open) {
        rows = [makeVersion(makeUploadDefinition())];
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
  return { file: pngFile(), distributionSlug: 'public-1', distributionId: undefined, questionId: 'q-file', responseId: undefined, ...overrides };
}

/** Provenance rows recorded by the stub, so tests can assert what the endpoint wrote. */
const recordedProvenance: { fileId: string; responseId?: string; distributionId: string; questionId?: string }[] = [];

function context(opts: {
  perms?: Record<string, boolean>;
  open?: boolean;
  storage?: UploadStorageEngine;
  provenanceFails?: boolean;
  allowedOrigins?: string | null;
  requestOrigin?: string;
}): UploadContext {
  return {
    contextUser: USER,
    requestOrigin: opts.requestOrigin,
    metadataProvider: metadataProvider(opts.perms ?? respondentPerms()),
    runViewProvider: runViewProvider({ openDistribution: opts.open, allowedOrigins: opts.allowedOrigins }),
    storage: opts.storage ?? storageEngine().engine,
    // Stubbed rather than hitting the database. The endpoint fails closed when provenance cannot
    // be recorded, so without a substitute every upload test would fail for the wrong reason.
    recordProvenance: async (input) => {
      if (opts.provenanceFails) {
        return false;
      }
      recordedProvenance.push({
        fileId: input.fileId,
        responseId: input.responseId,
        distributionId: input.distributionId,
        questionId: input.questionId,
      });
      return true;
    },
  };
}

beforeEach(() => {
  recordedProvenance.length = 0;
  resetUploadConfigForTests();
});
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

  it('rejects (400) a questionId that is not on the published definition — before storing bytes', async () => {
    const { engine, upload } = storageEngine();
    const result = await runUpload(context({ storage: engine }), request({ questionId: 'q-not-real' }));
    expect(result.failure?.status).toBe(400);
    expect(result.failure?.error).toMatch(/Unknown "questionId"/);
    // The whole point: an unknown question must never reach storage (it used to travel all the
    // way to the provenance insert and orphan the stored bytes + MJ: Files row on the way out).
    expect(upload).not.toHaveBeenCalled();
  });

  it('says what a refused file type should have been instead', async () => {
    // "Content type "text/markdown" is not allowed." names the problem and stops. The
    // respondent is now holding a file they cannot use and no idea what would work, so
    // the next thing they try is a guess.
    const { engine } = storageEngine();
    const file = { ...pngFile(), filename: 'notes.md', contentType: 'text/markdown' };
    const result = await runUpload(context({ storage: engine }), request({ file }));
    expect(result.failure?.status).toBe(415);
    expect(result.failure?.error).toMatch(/text\/markdown/);
    expect(result.failure?.error.toLowerCase()).toMatch(/pdf|image/);
  });

  it('states the size cap in units a person reads, not raw bytes', async () => {
    // "10485760 bytes" is a number from a spec sheet. The respondent has to divide by
    // 1048576 to learn their file is 3 MB over — and this exact rawness was already fixed
    // once on the authoring asset route, so the fix belongs in one place, not two.
    const { engine } = storageEngine();
    const result = await runUpload(context({ storage: engine }), request({ file: pngFile(50 * 1024 * 1024) }));
    expect(result.failure?.status).toBe(413);
    expect(result.failure?.error).toMatch(/\bMB\b/);
    expect(result.failure?.error).not.toMatch(/\d{7,}/);
  });

  it('gives every upload its own storage path, even for identical filenames', async () => {
    // DATA LOSS. The prefix was `forms-uploads/<date>` with nothing unique in it, and the
    // doodle pad names every file it exports `doodle.png` — so every drawing made
    // on a given day, by every respondent, on every form, wrote to the SAME object path.
    // Each upload silently overwrote the last, and the MJ: Files rows all pointed at one
    // set of bytes, so a response ended up showing a stranger's drawing. Verified on a
    // real host: five uploads, one file on disk. MJ's own default prefix carries a UUID
    // for exactly this reason; this one dropped it.
    const { engine, upload } = storageEngine();
    await runUpload(context({ storage: engine }), request());
    await runUpload(context({ storage: engine }), request());
    const [first, second] = upload.mock.calls.map((c) => c[0].pathPrefix);
    expect(first).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it('gives every upload its own path even when an operator configures the prefix', async () => {
    // The fix above lived in the `?? defaultPathPrefix()` FALLBACK, so it only protected hosts
    // that had not configured anything. `FORMS_UPLOAD_PATH_PREFIX` is a documented, supported
    // setting, and setting it put back the exact data loss the fallback had just removed:
    // `cfg.pathPrefix` is a constant string, so every `doodle.png` writes to one object and
    // the new download route hands a reviewer whichever respondent's drawing landed last.
    // Uniqueness has to be an invariant of the path builder, not of one branch of it.
    process.env.FORMS_UPLOAD_PATH_PREFIX = 'forms-uploads';
    resetUploadConfigForTests();
    try {
      const { engine, upload } = storageEngine();
      await runUpload(context({ storage: engine }), request());
      await runUpload(context({ storage: engine }), request());
      const [first, second] = upload.mock.calls.map((c) => c[0].pathPrefix);
      expect(first).toMatch(/^forms-uploads\//);
      expect(second).not.toBe(first);
    } finally {
      delete process.env.FORMS_UPLOAD_PATH_PREFIX;
      resetUploadConfigForTests();
    }
  });

  it('accepts a Doodle question, whose answer is a file drawn on a canvas', async () => {
    // The shipped bug: the guard hardcoded 'FileUpload', so every drawing came back 400
    // and the respondent saw "Upload failed (HTTP 400)" under a drawing they had just
    // made, with no way forward. Doodle and FileUpload both declare answerColumn:
    // 'file' in the question-type contract, which is the thing this should be asking.
    const { engine, upload } = storageEngine();
    const result = await runUpload(context({ storage: engine }), request({ questionId: 'q-sign' }));
    expect(result.failure).toBeUndefined();
    expect(result.success?.fileId).toBeTruthy();
    expect(upload).toHaveBeenCalled();
  });

  it('rejects (400) a questionId whose answer is not a file at all', async () => {
    // Still fail-closed for a text question: a ledger row minted against one could never be
    // matched to a file answer at submit. Only the reason changed — the guard now asks the
    // contract which column the answer lands in instead of naming a single type.
    const { engine, upload } = storageEngine();
    const result = await runUpload(context({ storage: engine }), request({ questionId: 'q-name' }));
    expect(result.failure?.status).toBe(400);
    expect(result.failure?.error).toMatch(/does not take a file answer/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('accepts a questionId differing only by GUID case, and records the definition spelling', async () => {
    const { engine, upload } = storageEngine();
    const result = await runUpload(context({ storage: engine }), request({ questionId: 'Q-FILE' }));

    expect(result.ok).toBe(true);
    // Reached storage — an accepted upload must actually store, not merely avoid rejection.
    expect(upload).toHaveBeenCalledOnce();
    // The LEDGER carries the definition's spelling, not whatever case the client sent. The id is
    // matched case-folded (client mints lowercase, SQL Server returns uppercase) but written
    // canonically, so `FormUpload.QuestionID` cannot disagree with the published definition about
    // which question an upload answered.
    expect(recordedProvenance).toHaveLength(1);
    expect(recordedProvenance[0].questionId).toBe('q-file');
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
    expect(result.failure?.error).toBe(UPLOAD_FAILED_MESSAGE);
  });
});

/**
 * Issue #142. This endpoint is reachable with the anonymous session a public form link mints, and the
 * widget shows the body's `error` verbatim (`uploadErrorMessage` → `serverErrorText`). Its storage
 * catch used to interpolate the provider's exception into that body — an account name, an endpoint
 * host, a bucket, a credentials failure, and, from MJ's own `UploadFile`, the object path ending in
 * the respondent's file name. The respondent now reads one authored sentence and the operator reads
 * the detail, tied to the response and question, with that file name taken out of it.
 */
describe('runUpload — a storage failure tells the respondent nothing about the host (#142)', () => {
  /** Kept as a literal: the smoke suite and the widget see this exact text, not the constant. */
  const AUTHORED = 'Your file could not be uploaded. Please try again.';
  const PROVIDER_DETAIL = 'AuthorizationFailure: account acme-prod at https://acme-prod.blob.core.windows.net/forms rejected the SAS';

  let logged: string[];
  beforeEach(() => {
    logged = [];
    // `LogError` reaches console.error in production too, which is what the operator relies on.
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function failingStorage(where: 'UploadFile' | 'Config', thrown: unknown): UploadStorageEngine {
    const throws = vi.fn(async () => {
      throw thrown;
    });
    return where === 'UploadFile'
      ? storageEngine({ UploadFile: throws as unknown as UploadStorageEngine['UploadFile'] }).engine
      : storageEngine({ Config: throws as unknown as UploadStorageEngine['Config'] }).engine;
  }

  it('exports the authored sentence the smoke suite and widget depend on', () => {
    expect(UPLOAD_FAILED_MESSAGE).toBe(AUTHORED);
  });

  it.each([
    ['the upload throws', 'UploadFile' as const],
    ['configuring the engine throws', 'Config' as const],
  ])('returns the authored sentence, not the provider text, when %s', async (_what, where) => {
    const result = await runUpload(context({ storage: failingStorage(where, new Error(PROVIDER_DETAIL)) }), request());

    expect(result.ok).toBe(false);
    expect(result.failure).toEqual({ status: 500, error: AUTHORED });
  });

  it('does not echo a thrown non-Error value either', async () => {
    const result = await runUpload(context({ storage: failingStorage('UploadFile', PROVIDER_DETAIL) }), request());

    expect(result.failure).toEqual({ status: 500, error: AUTHORED });
  });

  it('logs the provider detail with the response, question and distribution it was for', async () => {
    await runUpload(
      context({ storage: failingStorage('UploadFile', new Error(PROVIDER_DETAIL)) }),
      request({ responseId: '0a1b2c3d-0000-4000-8000-000000000142', questionId: 'Q-FILE' }),
    );

    const line = logged.find((l) => l.includes(PROVIDER_DETAIL));
    expect(line).toBeDefined();
    expect(line).toContain('0a1b2c3d-0000-4000-8000-000000000142');
    // The definition's spelling, the same id the provenance ledger records.
    expect(line).toContain('q-file');
    expect(line).toContain('dist-1');
  });

  it("keeps the respondent's file name out of the logged detail", async () => {
    // MJ's own UploadFile names the object path in its errors, and the path ends in the file name.
    const file: ParsedFile = { ...pngFile(), filename: 'Jane Doe passport.png' };
    const upload = vi.fn(async (options: { fileName: string; pathPrefix?: string }) => {
      throw new Error(`FileStorageEngine.UploadFile: PutObject returned false for path '${options.pathPrefix}/${options.fileName}'`);
    });
    const storage = storageEngine({ UploadFile: upload as unknown as UploadStorageEngine['UploadFile'] }).engine;

    const result = await runUpload(context({ storage }), request({ file }));

    expect(result.failure).toEqual({ status: 500, error: AUTHORED });
    const line = logged.find((l) => l.includes('PutObject returned false'));
    expect(line).toBeDefined();
    expect(line).not.toContain('Jane Doe');
    expect(line).toContain('<storage key>');
  });

  it('keeps a dot-prefixed file name out of the logged detail, in either spelling MJ quotes', async () => {
    // MJ strips leading dots before it builds the key, so `PutObject` quotes the stripped name, while
    // its `MJ: Files` save failure quotes the name exactly as it was passed. Both in one message.
    const file: ParsedFile = { ...pngFile(), filename: '.Jane-Doe-resume.png' };
    const upload = vi.fn(async (options: { fileName: string; pathPrefix?: string }) => {
      const cleaned = options.fileName.replace(/^\.+/, '');
      throw new Error(
        `PutObject returned false for path '${options.pathPrefix}/${cleaned}'; `
          + `failed to save MJ: Files record for '${options.fileName}'`,
      );
    });
    const storage = storageEngine({ UploadFile: upload as unknown as UploadStorageEngine['UploadFile'] }).engine;

    await runUpload(context({ storage }), request({ file }));

    const line = logged.find((l) => l.includes('PutObject returned false'));
    expect(line).toBeDefined();
    expect(line).not.toContain('Jane-Doe');
  });

  it('keeps a dots-then-space file name out of the logged detail, as MJ trims it after stripping the dots', async () => {
    // MJ cleans the name as strip-leading-dots THEN trim, so `. Jane-Doe.png` is quoted as
    // `Jane-Doe.png` in the PutObject path but as the raw `. Jane-Doe.png` in the Files-record clause.
    const file: ParsedFile = { ...pngFile(), filename: '. Jane-Doe.png' };
    const upload = vi.fn(async (options: { fileName: string; pathPrefix?: string }) => {
      const cleaned = options.fileName.replace(/^\.+/, '').trim();
      throw new Error(
        `PutObject returned false for path '${options.pathPrefix}/${cleaned}'; `
          + `failed to save MJ: Files record for '${options.fileName}'`,
      );
    });
    const storage = storageEngine({ UploadFile: upload as unknown as UploadStorageEngine['UploadFile'] }).engine;

    await runUpload(context({ storage }), request({ file }));

    const line = logged.find((l) => l.includes('PutObject returned false'));
    expect(line).toBeDefined();
    expect(line).not.toContain('Jane-Doe');
  });

  it('does not let a response id with a line break forge a log line', async () => {
    // responseId is a raw multipart field; it reaches the log only when it is GUID-shaped.
    await runUpload(
      context({ storage: failingStorage('UploadFile', new Error(PROVIDER_DETAIL)) }),
      request({ responseId: 'resp\n[Forms] forged line' }),
    );

    const line = logged.find((l) => l.includes(PROVIDER_DETAIL));
    expect(line).toContain('response (invalid)');
    expect(line).not.toContain('forged');
    expect(line).not.toContain('\n[Forms] forged');
  });

  it('logs (none) when the widget sent no response id', async () => {
    await runUpload(context({ storage: failingStorage('UploadFile', new Error(PROVIDER_DETAIL)) }), request());

    const line = logged.find((l) => l.includes(PROVIDER_DETAIL));
    expect(line).toContain('response (none)');
    expect(line).not.toContain('undefined');
  });

  it('keeps the fields of a thrown non-Error object in the log', async () => {
    await runUpload(
      context({ storage: failingStorage('UploadFile', { code: 'AccountNotFound', detail: 'acme-prod' }) }),
      request(),
    );

    const line = logged.find((l) => l.includes('[Forms] upload storage failed'));
    expect(line).toContain('AccountNotFound');
    expect(line).toContain('acme-prod');
  });

  it('does not report a provenance writer that throws as a storage failure', async () => {
    // The writer's contract is to return false (see writeProvenanceRow). One that throws instead
    // propagates to the middleware's outer catch, which logs it and answers with its own sentence.
    const ctx = { ...context({}), recordProvenance: async (): Promise<boolean> => { throw new Error('ledger exploded'); } };

    await expect(runUpload(ctx, request())).rejects.toThrow('ledger exploded');
    expect(logged.some((l) => l.includes('upload storage failed'))).toBe(false);
  });
});

describe('runUpload — provenance', () => {
  it('records the upload so the file can later be proved to be this respondent’s', async () => {
    const result = await runUpload(context({}), request({ responseId: 'resp-42' }));

    expect(result.ok).toBe(true);
    expect(recordedProvenance).toHaveLength(1);
    expect(recordedProvenance[0]).toMatchObject({ responseId: 'resp-42' });
  });

  it('fails the upload when provenance cannot be recorded', async () => {
    const result = await runUpload(context({ provenanceFails: true }), request());

    // Fail closed. A file with no provenance row is unusable — submit will reject it — so
    // returning its id would hand the respondent a successful-looking upload that then silently
    // breaks their submission.
    expect(result.ok).toBe(false);
    expect(result.failure?.status).toBe(500);
  });

  /**
   * #203 closed this door LAST. The embed-origin gate shipped on `PublishedForm` and
   * `SubmitFormResponse` -- the "two doors" the change reasons about -- while `/forms/upload` is a
   * third door on the same public path, reached by the same widget with the same anonymous session
   * and resolved through the SAME `resolvePublishedDefinition`. Measured on a live branch host
   * before this gate existed: with AllowedOrigins=["https://careers.acme.com"] a caller on
   * https://evil.example was refused by the submit and still stored bytes plus an `MJ: Files` row
   * here. A refusal that only covers some of a distribution's doors is not fail-closed.
   */
  describe('embed origin (#203)', () => {
    it('refuses an upload whose Origin is not on the distribution allowlist', async () => {
      const { engine, upload } = storageEngine();
      const result = await runUpload(
        context({
          storage: engine,
          allowedOrigins: '["https://careers.acme.com"]',
          requestOrigin: 'https://evil.example',
        }),
        request(),
      );
      expect(result.ok).toBe(false);
      expect(result.failure?.status).toBe(403);
      // The respondent-facing sentence is the SAME one the submit door uses, so a prober cannot
      // tell the two apart and a respondent is not taught a second vocabulary.
      expect(result.failure?.error).toBe(FOREIGN_ORIGIN_MESSAGE);
      // The point of the gate: nothing was stored.
      expect(upload).not.toHaveBeenCalled();
      expect(recordedProvenance).toHaveLength(0);
    });

    it('refuses an upload that sends no Origin at all once a list is authored', async () => {
      const { engine, upload } = storageEngine();
      const result = await runUpload(
        context({ storage: engine, allowedOrigins: '["https://careers.acme.com"]' }),
        request(),
      );
      expect(result.ok).toBe(false);
      expect(result.failure?.status).toBe(403);
      expect(upload).not.toHaveBeenCalled();
    });

    it('admits an upload from an origin the author listed', async () => {
      const { engine, upload } = storageEngine();
      const result = await runUpload(
        context({
          storage: engine,
          allowedOrigins: '["https://careers.acme.com"]',
          requestOrigin: 'https://careers.acme.com',
        }),
        request(),
      );
      expect(result.ok).toBe(true);
      expect(upload).toHaveBeenCalledTimes(1);
    });

    it('admits an upload when the distribution authored nothing, whatever the Origin', async () => {
      const { engine, upload } = storageEngine();
      const result = await runUpload(
        context({ storage: engine, allowedOrigins: null, requestOrigin: 'https://evil.example' }),
        request(),
      );
      expect(result.ok).toBe(true);
      expect(upload).toHaveBeenCalledTimes(1);
    });

    it('refuses everyone when the authored value parses to nothing usable', async () => {
      const { engine, upload } = storageEngine();
      const result = await runUpload(
        context({ storage: engine, allowedOrigins: 'not json', requestOrigin: 'https://careers.acme.com' }),
        request(),
      );
      expect(result.ok).toBe(false);
      expect(result.failure?.status).toBe(403);
      expect(upload).not.toHaveBeenCalled();
    });
  });
});
