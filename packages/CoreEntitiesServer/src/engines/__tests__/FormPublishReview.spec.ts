/**
 * The publish-approval workflow: the graph it submits, how it reads the approver's decision, and the
 * settle path end to end over the emulated database (the version rules run for real).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidateTaskGraphSpec } from '@memberjunction/ai-core-plus';
import { AUTHOR, FORMS, VERSIONS, draftTables, formRow, formsWorld, rowsOf, versionRow, type ServerSubclasses } from '../../testing/forms-world.js';
import type { FakeRow } from '../../testing/index.js';

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

const submitted = vi.hoisted(() => ({ result: { Success: true, ParentTaskID: 'b2b2b2b2-0000-4000-8000-000000000002' } as { Success: boolean; ParentTaskID?: string; ErrorMessage?: string }, calls: [] as unknown[][] }));
vi.mock('@memberjunction/task-graph', () => ({
  TaskGraphService: class {
    public async Submit(...args: unknown[]) {
      submitted.calls.push(args);
      return submitted.result;
    }
  },
}));
vi.mock('@memberjunction/core-entities', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core-entities')>('@memberjunction/core-entities');
  return { ...actual, MJEnvironmentEntityExtended: { DefaultEnvironmentID: 'env-default' } };
});

const {
  BuildPublishReviewSpec,
  FormPublishReview,
  PUBLISH_REVIEW_PROVIDER,
  ReadReviewDecision,
  SETTLE_PUBLISH_REVIEW_ACTION,
} = await import('../FormPublishReview.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;
const FORM_ID = '4d81af18-d0fe-5b39-b7de-6a0eb70c5766';
const ROLE_ID = 'a1a1a1a1-0000-4000-8000-000000000001';
const WORKFLOW_ID = 'b2b2b2b2-0000-4000-8000-000000000002';
const VERSION_ID = 'c3c3c3c3-0000-4000-8000-000000000003';
const TASKS = 'MJ: Tasks';

const REVIEW = { formId: FORM_ID, formName: 'Intake', formVersionId: VERSION_ID, versionNumber: 2, approverRoleId: ROLE_ID };

beforeEach(() => {
  submitted.calls = [];
  submitted.result = { Success: true, ParentTaskID: WORKFLOW_ID };
});

describe('BuildPublishReviewSpec', () => {
  const spec = BuildPublishReviewSpec(REVIEW);

  it('is a graph MJ accepts', () => {
    expect(ValidateTaskGraphSpec(spec).Valid).toBe(true);
  });

  it('asks the approver role through bizapps-tasks, linked to the version, and settles even if the review fails', () => {
    const [review, settle] = spec.tasks;
    expect(review).toMatchObject({
      kind: 'Human',
      policy: { onError: 'continue' },
      configuration: {
        provider: PUBLISH_REVIEW_PROVIDER,
        providerConfiguration: {
          assignees: [{ entity: 'MJ: Roles', recordID: ROLE_ID }],
          linkedRecord: { entity: 'MJ_BizApps_Forms: Form Versions', recordID: VERSION_ID },
          outputKey: 'approval',
        },
      },
    });
    expect(settle).toMatchObject({ kind: 'Action', dependsOn: [review.tempId], configuration: { actionName: SETTLE_PUBLISH_REVIEW_ACTION } });
    expect(JSON.parse(String((settle.configuration as { inputMapping: string }).inputMapping))).toEqual({ FormVersionID: VERSION_ID });
  });
});

describe('ReadReviewDecision', () => {
  const step = (Status: string, approval?: unknown, ErrorMessage: string | null = null) => ({
    ID: 's', Status, ErrorMessage, OutputPayload: approval === undefined ? null : JSON.stringify({ approval }),
  });

  it('publishes only on an explicit Approved: true, carrying the notes', () => {
    expect(ReadReviewDecision(step('Complete', { Approved: true, Notes: ' Fine ' }))).toEqual({ approved: true, notes: 'Fine' });
    expect(ReadReviewDecision(step('Complete', { Approved: 'true' }))).toEqual({ approved: false, notes: null });
    expect(ReadReviewDecision(step('Complete', { Approved: false, Notes: 'No' }))).toEqual({ approved: false, notes: 'No' });
    expect(ReadReviewDecision(step('Complete'))).toEqual({ approved: false, notes: null });
    expect(ReadReviewDecision({ ...step('Complete'), OutputPayload: '{not json' })).toEqual({ approved: false, notes: null });
  });

  it('rejects a review that failed, and waits while one is open', () => {
    expect(ReadReviewDecision(step('Failed', undefined, 'expired'))).toEqual({ approved: false, notes: 'The approval request did not complete: expired.' });
    expect(ReadReviewDecision(step('Waiting'))).toMatchObject({ settled: false });
    expect(ReadReviewDecision(undefined)).toMatchObject({ settled: false });
  });

  it('rejects a review that was cancelled or skipped, so the version does not stay in review forever', () => {
    expect(ReadReviewDecision(step('Cancelled'))).toEqual({ approved: false, notes: 'The approval request was cancelled before anyone decided.' });
    expect(ReadReviewDecision(step('Skipped'))).toEqual({ approved: false, notes: 'The approval request was skipped before anyone decided.' });
  });
});

describe('FormPublishReview', () => {
  function world(tasks: FakeRow[], versionStatus = 'InReview') {
    const tables = draftTables();
    tables[FORMS] = [formRow({ RequiresPublishApproval: true, PublishApproverRoleID: ROLE_ID })];
    tables[VERSIONS] = [
      versionRow('v1', 1, 'Published'),
      { ...versionRow(VERSION_ID, 2, versionStatus), ApprovalWorkflowTaskID: WORKFLOW_ID, ReviewNotes: null },
    ];
    tables[TASKS] = tasks;
    return formsWorld(SUBCLASSES, tables);
  }

  const reviewStep = (Status: string, approval?: unknown): FakeRow => ({
    ID: 'step-1', ParentID: WORKFLOW_ID, StepType: 'Human', Status, ErrorMessage: null,
    OutputPayload: approval === undefined ? null : JSON.stringify({ approval }),
  });

  it('RequestApproval submits the review graph as the author, in the default environment', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ RequiresPublishApproval: true, PublishApproverRoleID: ROLE_ID })];
    const db = formsWorld(SUBCLASSES, tables);

    const result = await FormPublishReview.Instance.RequestApproval(FORM_ID, db.provider, AUTHOR);

    expect(result.workflowTaskId).toBe(WORKFLOW_ID);
    expect(submitted.calls[0][1]).toMatchObject({ EnvironmentID: 'env-default', ContextUser: AUTHOR, Provider: db.provider });
  });

  it('RequestApproval leaves nothing behind when the workflow is refused', async () => {
    submitted.result = { Success: false, ErrorMessage: 'provider BizAppsTasks is not registered' };
    const tables = draftTables();
    tables[FORMS] = [formRow({ RequiresPublishApproval: true, PublishApproverRoleID: ROLE_ID })];
    const db = formsWorld(SUBCLASSES, tables);

    await expect(FormPublishReview.Instance.RequestApproval(FORM_ID, db.provider, AUTHOR)).rejects.toThrow(/could not be started/);
    expect(rowsOf(db, VERSIONS)).toEqual([]);
  });

  it('SettleReview publishes on the decision its own review step recorded', async () => {
    const db = world([reviewStep('Complete', { Approved: true, Notes: 'Ship it' })]);

    const result = await FormPublishReview.Instance.SettleReview(VERSION_ID, db.provider, AUTHOR);

    expect(result).toMatchObject({ settled: true, outcome: 'Published', retiredVersionIds: ['v1'] });
    expect(rowsOf(db, VERSIONS).map((v) => v.Status)).toEqual(['Retired', 'Published']);
  });

  it('SettleReview writes nothing while the approver has not decided', async () => {
    const db = world([reviewStep('Waiting')]);

    expect(await FormPublishReview.Instance.SettleReview(VERSION_ID, db.provider, AUTHOR)).toMatchObject({ settled: false });
    expect(rowsOf(db, VERSIONS).map((v) => v.Status)).toEqual(['Published', 'InReview']);
  });

  it('SettleReview on a version already settled reports it without reading the workflow', async () => {
    const db = world([], 'Rejected');

    expect(await FormPublishReview.Instance.SettleReview(VERSION_ID, db.provider, AUTHOR)).toMatchObject({
      settled: true, outcome: 'Rejected', alreadySettled: true,
    });
  });
});
