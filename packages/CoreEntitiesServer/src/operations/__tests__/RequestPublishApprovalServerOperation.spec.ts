/**
 * `Forms.RequestPublishApproval` through `ExecuteServer`, over the emulated database: an Authorize
 * refusal, an input refusal, an engine refusal and a happy path. The workflow submission is stubbed;
 * `FormPublishReview.spec.ts` covers what it submits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { AUTHOR, FORMS, VERSIONS, draftTables, formRow, formsWorld, rowsOf, type ServerSubclasses } from '../../testing/forms-world.js';

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
  return { ...actual, mjBizAppsFormsFormEntity: WriteThroughEntityBase, mjBizAppsFormsFormVersionEntity: WriteThroughEntityBase };
});

vi.mock('@memberjunction/task-graph', () => ({
  TaskGraphService: class {
    public async Submit() {
      return { Success: true, ParentTaskID: 'b2b2b2b2-0000-4000-8000-000000000002' };
    }
  },
}));

const { RequestPublishApprovalServerOperation, LoadRequestPublishApprovalOperation } = await import('../RequestPublishApprovalServerOperation.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;
const FORM_ID = '4d81af18-d0fe-5b39-b7de-6a0eb70c5766';

function world(canUpdateForms = true, requiresApproval = true) {
  const tables = draftTables();
  tables[FORMS] = [formRow({ RequiresPublishApproval: requiresApproval, PublishApproverRoleID: 'a1a1a1a1-0000-4000-8000-000000000001' })];
  const db = formsWorld(SUBCLASSES, tables, { updatePermissions: { [FORMS]: canUpdateForms } });
  Metadata.Provider = db.provider;
  return db;
}

function run(db: ReturnType<typeof world>, input: { FormID: string }, user: UserInfo = AUTHOR) {
  return new RequestPublishApprovalServerOperation().ExecuteServer(input, { provider: db.provider, user, emitProgress: () => undefined });
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

describe('Forms.RequestPublishApproval', () => {
  it('is registered under its operation key, with an anchor the server bootstrap calls', () => {
    expect(new RequestPublishApprovalServerOperation().OperationKey).toBe('Forms.RequestPublishApproval');
    expect(LoadRequestPublishApprovalOperation()).toBeUndefined();
  });

  it('holds the new version for review and returns it with its workflow', async () => {
    const db = world();

    const result = await run(db, { FormID: FORM_ID });

    expect(result.ResultCode).toBe('SUCCESS');
    const held = rowsOf(db, VERSIONS)[0];
    expect(held.Status).toBe('InReview');
    expect(result.Output).toEqual({ FormVersionID: held.ID, VersionNumber: 1, WorkflowTaskID: 'b2b2b2b2-0000-4000-8000-000000000002' });
  });

  it('refuses an author without Update on Forms, and an anonymous session, with FORBIDDEN', async () => {
    expect((await run(world(false), { FormID: FORM_ID })).ResultCode).toBe('FORBIDDEN');
    const anonymous = { ...AUTHOR, IsMagicLinkAnonymous: true } as unknown as UserInfo;
    expect((await run(world(), { FormID: FORM_ID }, anonymous)).ResultCode).toBe('FORBIDDEN');
  });

  it('refuses a missing FormID, naming the operation', async () => {
    const result = await run(world(), { FormID: ' ' });
    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toBe('Forms.RequestPublishApproval: FormID is required.');
  });

  it('carries the engine\'s refusal back for a form that does not require approval', async () => {
    const db = world(true, false);

    const result = await run(db, { FormID: FORM_ID });

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toMatch(/does not require approval/);
    expect(rowsOf(db, VERSIONS)).toEqual([]);
  });
});
