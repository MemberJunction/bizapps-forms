/**
 * Publish approval in `FormPublishingEngine` — `SubmitForReview` and `SettleReview` — against the
 * emulated database, with the REAL Form / Form Version server subclasses, so each test also proves
 * the version rules let the engine make the move (and only the engine).
 *
 * The workflow itself is a stub here (`startWorkflow`): what it is asked to start, and what happens
 * when it cannot start, are the engine's business; the graph's shape is `FormPublishReview.spec.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
  AUTHOR,
  FORMS,
  VERSIONS,
  draftTables,
  formRow,
  formsWorld,
  rowsOf,
  versionRow,
  type ServerSubclasses,
} from '../../testing/forms-world.js';
import type { FakeProviderConfig, FakeRow } from '../../testing/index.js';

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

const { FormPublishingEngine, FormPublishError, REVIEW_IN_PROGRESS_MESSAGE } = await import('../FormPublishingEngine.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;
const FORM_ID = '4d81af18-d0fe-5b39-b7de-6a0eb70c5766';
const ROLE_ID = 'a1a1a1a1-0000-4000-8000-000000000001';
const WORKFLOW_ID = 'b2b2b2b2-0000-4000-8000-000000000002';
const REVIEWED_ID = 'c3c3c3c3-0000-4000-8000-000000000003';

function reviewTables(form: Partial<FakeRow> = { RequiresPublishApproval: true, PublishApproverRoleID: ROLE_ID }): Record<string, FakeRow[]> {
  const tables = draftTables();
  tables[FORMS] = [formRow(form)];
  return tables;
}

function world(tables = reviewTables(), config: Partial<FakeProviderConfig> = {}) {
  return formsWorld(SUBCLASSES, tables, config);
}

function submit(db: ReturnType<typeof world>, startWorkflow = vi.fn(async () => WORKFLOW_ID), user: UserInfo = AUTHOR) {
  return FormPublishingEngine.Instance.SubmitForReview(FORM_ID, db.provider, user, startWorkflow);
}

function versions(db: ReturnType<typeof world>): FakeRow[] {
  return rowsOf(db, VERSIONS);
}

describe('SubmitForReview', () => {
  it('writes the next version InReview with its snapshot and the workflow, and asks the approver role', async () => {
    const tables = reviewTables();
    tables[VERSIONS] = [versionRow('v1', 1, 'Published')];
    const db = world(tables);
    const startWorkflow = vi.fn(async () => WORKFLOW_ID);

    const result = await submit(db, startWorkflow);

    const held = versions(db).find((v) => v.ID === result.formVersionId);
    expect(held).toMatchObject({ VersionNumber: 2, Status: 'InReview', ApprovalWorkflowTaskID: WORKFLOW_ID });
    expect(JSON.parse(String(held?.DefinitionSnapshot)).formVersionId).toBe(result.formVersionId);
    expect(startWorkflow).toHaveBeenCalledWith({
      formId: FORM_ID, formName: 'Intake', formVersionId: result.formVersionId, versionNumber: 2, approverRoleId: ROLE_ID,
    });
    expect(result).toEqual({ formVersionId: result.formVersionId, versionNumber: 2, workflowTaskId: WORKFLOW_ID });
    expect(versions(db).find((v) => v.ID === 'v1')?.Status).toBe('Published');
    expect(db.transactions).toEqual(['begin', 'commit']);
  });

  it('refuses a form that does not require approval, and one with no approver role — before writing anything', async () => {
    for (const form of [{ RequiresPublishApproval: false }, { RequiresPublishApproval: true, PublishApproverRoleID: null }]) {
      const db = world(reviewTables(form));
      const startWorkflow = vi.fn(async () => WORKFLOW_ID);
      await expect(submit(db, startWorkflow)).rejects.toThrow(form.RequiresPublishApproval ? /names no approver role/ : /does not require approval/);
      expect(versions(db)).toEqual([]);
      expect(startWorkflow).not.toHaveBeenCalled();
    }
  });

  it('a workflow that cannot start leaves no version behind', async () => {
    const db = world();
    const startWorkflow = vi.fn(async (): Promise<string> => {
      throw new FormPublishError('The approval request could not be started, so nothing was requested.', { fault: true });
    });

    await expect(submit(db, startWorkflow)).rejects.toThrow(/could not be started/);

    expect(versions(db)).toEqual([]);
    expect(db.transactions).toEqual(['begin', 'rollback']);
  });

  it('names a second request for the same form in plain words', async () => {
    const db = world(reviewTables(), {
      failSaveWhen: (entity, values) => (entity === VERSIONS && values.Status === 'InReview' ? 'Violation of UNIQUE KEY constraint \'UQ_FormVersion_OneInReview\'' : false),
    });

    await expect(submit(db)).rejects.toThrow(REVIEW_IN_PROGRESS_MESSAGE);
  });
});

describe('Publish on a form that requires approval', () => {
  it('is refused, pointing the author at approval', async () => {
    const db = world();
    await expect(FormPublishingEngine.Instance.Publish(FORM_ID, db.provider, AUTHOR)).rejects.toThrow(/requires approval before it is published/);
    expect(versions(db)).toEqual([]);
  });
});

describe('SettleReview', () => {
  function reviewing(): ReturnType<typeof world> {
    const tables = reviewTables();
    tables[VERSIONS] = [
      versionRow('v1', 1, 'Published'),
      { ...versionRow(REVIEWED_ID, 2, 'InReview'), PublishedAt: null, ApprovalWorkflowTaskID: WORKFLOW_ID, ReviewNotes: null },
    ];
    return world(tables);
  }

  function settle(db: ReturnType<typeof world>, approved: boolean, notes: string | null = null) {
    return FormPublishingEngine.Instance.SettleReview(REVIEWED_ID, { approved, notes }, db.provider, AUTHOR);
  }

  it('approved: the reviewed version goes live in place of the current one, and the form is Published', async () => {
    const db = reviewing();

    const result = await settle(db, true, 'Looks good');

    expect(result).toEqual({ formVersionId: REVIEWED_ID, outcome: 'Published', alreadySettled: false, retiredVersionIds: ['v1'] });
    expect(versions(db).map((v) => [v.ID, v.Status])).toEqual([['v1', 'Retired'], [REVIEWED_ID, 'Published']]);
    expect(versions(db)[1]).toMatchObject({ ReviewNotes: 'Looks good', DefinitionSnapshot: JSON.stringify({ formVersionId: REVIEWED_ID }) });
    expect(versions(db)[1].PublishedAt).toBeInstanceOf(Date);
    expect(rowsOf(db, FORMS)[0].Status).toBe('Published');
  });

  it('rejected: the version is Rejected with the notes, and the live version keeps serving', async () => {
    const db = reviewing();

    const result = await settle(db, false, 'Question 3 is unclear');

    expect(result).toMatchObject({ outcome: 'Rejected', alreadySettled: false, retiredVersionIds: [] });
    expect(versions(db).map((v) => [v.ID, v.Status, v.ReviewNotes ?? null])).toEqual([
      ['v1', 'Published', null],
      [REVIEWED_ID, 'Rejected', 'Question 3 is unclear'],
    ]);
  });

  it('is idempotent: settling a settled version again writes nothing and reports what it was settled as', async () => {
    const db = reviewing();
    await settle(db, true);
    const writesAfterFirst = db.saved.length;

    expect(await settle(db, false)).toEqual({ formVersionId: REVIEWED_ID, outcome: 'Published', alreadySettled: true, retiredVersionIds: [] });
    expect(db.saved.length).toBe(writesAfterFirst);
  });

  it('refuses a version that is not in review', async () => {
    const tables = reviewTables();
    tables[VERSIONS] = [versionRow(REVIEWED_ID, 1, 'Draft')];
    const db = world(tables);

    await expect(settle(db, true)).rejects.toThrow(/is Draft, not waiting for approval/);
  });
});

describe('the review columns are the engine\'s alone', () => {
  it('an ordinary writer cannot point a version at a workflow', async () => {
    const db = world(reviewTables());
    const version = (await db.provider.GetEntityObject(VERSIONS, AUTHOR)) as unknown as Record<string, unknown> & {
      NewRecord(): boolean;
      Save(): Promise<boolean>;
      LatestResult: { CompleteMessage: string } | null;
    };
    version.NewRecord();
    Object.assign(version, { FormID: FORM_ID, VersionNumber: 1, Status: 'Draft', ApprovalWorkflowTaskID: WORKFLOW_ID });

    expect(await version.Save()).toBe(false);
    expect(version.LatestResult?.CompleteMessage).toMatch(/only the publishing engine writes it/);
  });
});
