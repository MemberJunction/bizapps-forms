/**
 * Unit tests for the **Forms: Create Followup Task** on-submit action.
 *
 * The action's collaborators are MJ's `Metadata` (GetEntityObject + EntityByName) and
 * `RunView` (resolve the TaskType), so we mock `@memberjunction/core` and drive the action
 * through its public `Run()` entry point. We assert the seam-S3 behaviours:
 *   1. happy path → creates a Task AND a TaskLink pointing at the response, sets outputs
 *   2. no resolvable TaskType → fails loudly (does not create an orphaned/typeless task)
 *   3. a failed Task Save surfaces the failure (no silent success, no dangling link)
 *   4. missing FormResponseID → MISSING_PARAMETERS (the input contract)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';

// ---------------------------------------------------------------------------
// Fakes for the entity / RunView layer.
// ---------------------------------------------------------------------------

/** A field-bag entity stand-in with a controllable Save() result. */
class FakeEntity {
  ID = '';
  Name: string | null = null;
  Description: string | null = null;
  TypeID: string | null = null;
  Status: string | null = null;
  Priority: string | null = null;
  TaskID: string | null = null;
  EntityID: string | null = null;
  RecordID: string | null = null;
  private _saveResult: boolean;
  private _idOnSave?: string;

  constructor(opts: { saveResult?: boolean; idOnSave?: string } = {}) {
    this._saveResult = opts.saveResult ?? true;
    this._idOnSave = opts.idOnSave;
  }

  NewRecord(): void {
    /* no-op for the fake */
  }

  async Save(): Promise<boolean> {
    if (this._saveResult && this._idOnSave) {
      this.ID = this._idOnSave;
    }
    return this._saveResult;
  }
}

// State the mock implementation reads — reset per test.
const state: {
  form: { Name: string };
  response: { ID: string };
  answers: unknown[];
  questions: unknown[];
  taskTypes: unknown[];
  task: FakeEntity;
  taskLink: FakeEntity;
  responseEntityId: string | undefined;
  getEntityCalls: string[];
} = {
  form: { Name: 'Contact Us' },
  response: { ID: 'resp-1' },
  answers: [],
  questions: [],
  taskTypes: [],
  task: new FakeEntity(),
  taskLink: new FakeEntity(),
  responseEntityId: 'entity-form-responses',
  getEntityCalls: [],
};

vi.mock('@memberjunction/core', () => {
  class Metadata {
    async GetEntityObject<T>(entityName: string): Promise<T> {
      state.getEntityCalls.push(entityName);
      if (entityName === 'MJ_BizApps_Tasks: Tasks') {
        return state.task as unknown as T;
      }
      if (entityName === 'MJ_BizApps_Tasks: Task Links') {
        return state.taskLink as unknown as T;
      }
      throw new Error(`Unexpected GetEntityObject('${entityName}')`);
    }
    EntityByName(entityName: string): { ID: string } | undefined {
      if (entityName === 'MJ_BizApps_Forms: Form Responses' && state.responseEntityId) {
        return { ID: state.responseEntityId };
      }
      return undefined;
    }
  }
  class RunView {
    async RunView<T>(opts: { EntityName: string }): Promise<{ Success: boolean; Results: T[] }> {
      let results: unknown[] = [];
      if (opts.EntityName === 'MJ_BizApps_Tasks: Task Types') results = state.taskTypes;
      else if (opts.EntityName === 'MJ_BizApps_Forms: Form Response Answers') results = state.answers;
      else if (opts.EntityName === 'MJ_BizApps_Forms: Form Questions') results = state.questions;
      return { Success: true, Results: results as T[] };
    }
  }
  return { Metadata, RunView };
});

// The action loads the response via a shared helper; stub it to return our fake context.
vi.mock('../shared/form-response-context', () => ({
  loadFormResponseContext: async () => ({
    response: state.response,
    form: state.form,
    answers: state.answers,
    questions: state.questions,
  }),
}));

// Import the action AFTER the mocks are declared so it binds to the mocked modules.
const { CreateFollowupTaskAction } = await import('./create-followup-task.action');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeUser = { Name: 'tester' } as unknown as UserInfo;

function makeParams(extra: { Name: string; Value: unknown }[] = []): RunActionParams {
  const base = [{ Name: 'FormResponseID', Value: 'resp-1' }, ...extra];
  return Object.assign(new RunActionParams(), {
    ContextUser: fakeUser,
    Filters: [],
    Params: base.map((p) => Object.assign(new ActionParam(), { ...p, Type: 'Input' })),
  });
}

function outValue(params: RunActionParams, name: string): unknown {
  return params.Params.find((p) => p.Name === name)?.Value;
}

beforeEach(() => {
  state.form = { Name: 'Contact Us' };
  state.response = { ID: 'resp-1' };
  state.answers = [];
  state.questions = [];
  state.taskTypes = [{ ID: 'type-1', Name: 'General', IsActive: true }];
  state.task = new FakeEntity({ idOnSave: 'task-new' });
  state.taskLink = new FakeEntity({ idOnSave: 'link-new' });
  state.responseEntityId = 'entity-form-responses';
  state.getEntityCalls = [];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Forms: Create Followup Task', () => {
  it('creates a Task and a TaskLink to the response, returning both ids', async () => {
    const params = makeParams();

    const result = await new CreateFollowupTaskAction().Run(params);

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    // Both entities were created and linked.
    expect(state.getEntityCalls).toEqual(['MJ_BizApps_Tasks: Tasks', 'MJ_BizApps_Tasks: Task Links']);
    expect(state.task.TypeID).toBe('type-1');
    expect(state.task.Name).toBe('Follow up: Contact Us');
    expect(state.taskLink.TaskID).toBe('task-new');
    expect(state.taskLink.EntityID).toBe('entity-form-responses');
    expect(state.taskLink.RecordID).toBe('resp-1');
    expect(outValue(params, 'TaskID')).toBe('task-new');
    expect(outValue(params, 'TaskLinkID')).toBe('link-new');
  });

  it('fails when no TaskType can be resolved (never creates a typeless task)', async () => {
    state.taskTypes = [];
    const params = makeParams();

    const result = await new CreateFollowupTaskAction().Run(params);

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('NO_TASK_TYPE');
    // The Task entity was never fetched/created.
    expect(state.getEntityCalls).not.toContain('MJ_BizApps_Tasks: Tasks');
  });

  it('surfaces a failure when the Task Save() returns false (no dangling link)', async () => {
    state.task = new FakeEntity({ saveResult: false });
    const params = makeParams();

    const result = await new CreateFollowupTaskAction().Run(params);

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('TASK_SAVE_FAILED');
    // No link was attempted after the task failed to save.
    expect(state.getEntityCalls).not.toContain('MJ_BizApps_Tasks: Task Links');
  });

  it('requires the FormResponseID param (the seam-S3 input contract)', async () => {
    const params = Object.assign(new RunActionParams(), { ContextUser: fakeUser, Filters: [], Params: [] });

    const result = await new CreateFollowupTaskAction().Run(params);

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_PARAMETERS');
  });
});
