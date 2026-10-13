/**
 * `Forms.PublishForm` through `ExecuteServer` — the path MJ's resolver and an in-process
 * `.Execute()` both take: `Authorize`, then `InternalExecute`, wrapped into a `RemoteOpResult`.
 * Runs over the emulated database with the real entity server subclasses (`forms-world.ts`).
 *
 * DW17 for this operation: an Authorize refusal, an input refusal and a happy path, plus an
 * anonymous session getting FORBIDDEN.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { AUTHOR, FORMS, VERSIONS, draftTables, formRow, formsWorld, rowsOf, type ServerSubclasses } from '../../testing/forms-world.js';
import type { FakeProviderConfig } from '../../testing/index.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  const { WriteThroughEntityBase } = await import('../../testing/write-through-entity.js');
  return {
    ...actual,
    mjBizAppsFormsFormEntity: WriteThroughEntityBase,
    mjBizAppsFormsFormVersionEntity: WriteThroughEntityBase,
  };
});

const { PublishFormServerOperation, LoadPublishFormOperation } = await import('../PublishFormServerOperation.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;

/** The world, with the acting author granted (or denied) Update on Forms. */
function world(canUpdateForms = true, config: Partial<FakeProviderConfig> = {}, tables = draftTables()) {
  const db = formsWorld(SUBCLASSES, tables, { updatePermissions: { [FORMS]: canUpdateForms }, ...config });
  // `Authorize` receives no provider, so it reads permissions from the process metadata.
  Metadata.Provider = db.provider;
  return db;
}

function run(db: ReturnType<typeof world>, input: { FormID: string }, user: UserInfo = AUTHOR) {
  return new PublishFormServerOperation().ExecuteServer(input, {
    provider: db.provider,
    user,
    emitProgress: () => undefined,
  });
}

let original: IMetadataProvider | undefined;
beforeEach(() => {
  try {
    original = Metadata.Provider;
  } catch {
    original = undefined;
  }
});
afterEach(() => {
  Metadata.Provider = original as IMetadataProvider;
});

describe('Forms.PublishForm', () => {
  it('is registered under its operation key, with an anchor the server bootstrap calls', () => {
    expect(new PublishFormServerOperation().OperationKey).toBe('Forms.PublishForm');
    expect(LoadPublishFormOperation()).toBeUndefined();
  });

  it('publishes and returns the new version, its number and what it retired', async () => {
    const tables = draftTables();
    tables[VERSIONS] = [{ ID: 'v1', FormID: 'form-1', VersionNumber: 1, Status: 'Published', PublishedAt: new Date(), DefinitionSnapshot: '{}' }];
    tables[FORMS] = [formRow({ Status: 'Published' })];
    const db = world(true, {}, tables);

    const result = await run(db, { FormID: 'form-1' });

    expect(result.ResultCode).toBe('SUCCESS');
    const published = rowsOf(db, VERSIONS).find((v) => v.Status === 'Published');
    expect(result.Output).toEqual({ FormVersionID: published?.ID, VersionNumber: 2, RetiredVersionIDs: ['v1'] });
  });

  describe('Authorize', () => {
    it('refuses an anonymous magic-link session with FORBIDDEN, and writes nothing', async () => {
      const db = world();
      const anonymous = { ...AUTHOR, IsMagicLinkAnonymous: true } as unknown as UserInfo;

      const result = await run(db, { FormID: 'form-1' }, anonymous);

      expect(result.ResultCode).toBe('FORBIDDEN');
      expect(rowsOf(db, VERSIONS)).toEqual([]);
    });

    it('refuses a respondent\'s magic-link scope with FORBIDDEN', async () => {
      const db = world();
      const scoped = { ...AUTHOR, MagicLinkScope: { ResourceID: 'dist-1', ResourceType: 'Form Distribution' } } as unknown as UserInfo;

      expect((await run(db, { FormID: 'form-1' }, scoped)).ResultCode).toBe('FORBIDDEN');
    });

    it('refuses an author without Update on Forms with FORBIDDEN', async () => {
      const db = world(false);

      expect((await run(db, { FormID: 'form-1' })).ResultCode).toBe('FORBIDDEN');
      expect(rowsOf(db, VERSIONS)).toEqual([]);
    });
  });

  describe('input', () => {
    it.each([[{ FormID: '' }], [{ FormID: '   ' }], [{} as { FormID: string }], [null as unknown as { FormID: string }]])(
      'refuses a missing FormID, naming the operation (%j)',
      async (input) => {
        const db = world();

        const result = await run(db, input);

        expect(result.ResultCode).toBe('EXECUTION_ERROR');
        expect(result.ErrorMessage).toBe('Forms.PublishForm: FormID is required.');
      },
    );

    it('refuses a provider that is not a server database provider', async () => {
      const db = world();
      const client = { EntityByName: db.provider.EntityByName } as unknown as IMetadataProvider;

      const result = await new PublishFormServerOperation().ExecuteServer(
        { FormID: 'form-1' },
        { provider: client, user: AUTHOR, emitProgress: () => undefined },
      );

      expect(result.ResultCode).toBe('EXECUTION_ERROR');
      expect(result.ErrorMessage).toMatch(/Forms\.PublishForm needs a server database provider/);
    });
  });

  it('carries the engine\'s refusal back as the error message', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ IsTemplate: true })];
    const db = world(true, {}, tables);

    const result = await run(db, { FormID: 'form-1' });

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toMatch(/is a template/);
  });
});
