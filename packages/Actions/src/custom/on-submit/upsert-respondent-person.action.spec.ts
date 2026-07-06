/**
 * Unit tests for the **Forms: Upsert Respondent Person** on-submit action.
 *
 * The action's collaborators are MJ's `Metadata` (GetEntityObject) and `RunView`,
 * so we mock `@memberjunction/core` and drive the action through its public `Run()`
 * entry point. We assert the three behaviours that the seam-S3 hook must guarantee:
 *   1. new email  → creates a Person AND stamps FormResponse.RespondentPersonID
 *   2. known email → links the EXISTING Person (no duplicate create)
 *   3. a failed response Save surfaces the error (does not silently succeed)
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
  FormID = 'form-1';
  RespondentPersonID: string | null = null;
  FirstName: string | null = null;
  LastName: string | null = null;
  Email: string | null = null;
  Phone: string | null = null;
  Status: string | null = null;
  LatestResult: { CompleteMessage: string } | null = null;
  private _saveResult: boolean;
  private _idOnSave?: string;

  constructor(opts: { saveResult?: boolean; idOnSave?: string; saveError?: string } = {}) {
    this._saveResult = opts.saveResult ?? true;
    this._idOnSave = opts.idOnSave;
    if (opts.saveError) {
      this.LatestResult = { CompleteMessage: opts.saveError };
    }
  }

  NewRecord(): void {
    /* no-op for the fake */
  }

  async Load(id: string): Promise<boolean> {
    this.ID = id;
    return true;
  }

  async Save(): Promise<boolean> {
    if (this._saveResult && this._idOnSave) {
      this.ID = this._idOnSave;
    }
    return this._saveResult;
  }
}

interface RunViewResult {
  Success: boolean;
  Results: unknown[];
}

// State the mock implementation reads — reset per test.
const state: {
  formResponse: FakeEntity;
  form: FakeEntity;
  personOnCreate: FakeEntity;
  answers: unknown[];
  questions: unknown[];
  existingPeople: unknown[];
  getEntityCalls: string[];
} = {
  formResponse: new FakeEntity(),
  form: new FakeEntity(),
  personOnCreate: new FakeEntity(),
  answers: [],
  questions: [],
  existingPeople: [],
  getEntityCalls: [],
};

vi.mock('@memberjunction/core', () => {
  class Metadata {
    async GetEntityObject<T>(entityName: string): Promise<T> {
      state.getEntityCalls.push(entityName);
      if (entityName === 'MJ_BizApps_Forms: Form Responses') {
        return state.formResponse as unknown as T;
      }
      if (entityName === 'MJ_BizApps_Forms: Forms') {
        return state.form as unknown as T;
      }
      if (entityName === 'MJ_BizApps_Common: People') {
        return state.personOnCreate as unknown as T;
      }
      throw new Error(`Unexpected GetEntityObject('${entityName}')`);
    }
  }
  class RunView {
    async RunView<T>(opts: { EntityName: string }): Promise<RunViewResult & { Results: T[] }> {
      let results: unknown[] = [];
      if (opts.EntityName === 'MJ_BizApps_Forms: Form Response Answers') results = state.answers;
      else if (opts.EntityName === 'MJ_BizApps_Forms: Form Questions') results = state.questions;
      else if (opts.EntityName === 'MJ_BizApps_Common: People') results = state.existingPeople;
      return { Success: true, Results: results as T[] };
    }
  }
  return { Metadata, RunView };
});

// Import the action AFTER the mock is declared so it binds to the mocked core.
const { UpsertRespondentPersonAction } = await import('./upsert-respondent-person.action');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeUser = { Name: 'tester' } as unknown as UserInfo;

function makeParams(): RunActionParams {
  return Object.assign(new RunActionParams(), {
    ContextUser: fakeUser,
    Filters: [],
    Params: [Object.assign(new ActionParam(), { Name: 'FormResponseID', Value: 'resp-1', Type: 'Input' })],
  });
}

/** An email answer paired with its question, in the RunView-shaped rows. */
function emailAnswerFixture(email: string): void {
  state.answers = [{ QuestionID: 'q-email', TextValue: email, NumericValue: null, BooleanValue: null, JSONValue: null }];
  state.questions = [{ ID: 'q-email', QuestionType: 'Email', Prompt: 'Email Address' }];
}

function outValue(params: RunActionParams, name: string): unknown {
  return params.Params.find((p) => p.Name === name)?.Value;
}

beforeEach(() => {
  state.formResponse = new FakeEntity();
  state.form = new FakeEntity();
  state.personOnCreate = new FakeEntity({ idOnSave: 'person-new' });
  state.answers = [];
  state.questions = [];
  state.existingPeople = [];
  state.getEntityCalls = [];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Forms: Upsert Respondent Person', () => {
  it('new email → creates a Person and stamps RespondentPersonID on the response', async () => {
    emailAnswerFixture('newperson@example.com');
    const params = makeParams();

    const result = await new UpsertRespondentPersonAction().Run(params);

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    // Person was created (People GetEntityObject was reached) and got an id.
    expect(state.getEntityCalls).toContain('MJ_BizApps_Common: People');
    expect(state.personOnCreate.Email).toBe('newperson@example.com');
    // The response was stamped + saved with the new person's id.
    expect(state.formResponse.RespondentPersonID).toBe('person-new');
    expect(outValue(params, 'PersonID')).toBe('person-new');
    expect(outValue(params, 'Created')).toBe(true);
  });

  it('known email → links the existing Person without creating a duplicate', async () => {
    emailAnswerFixture('known@example.com');
    state.existingPeople = [{ ID: 'person-existing', Email: 'known@example.com' }];
    const params = makeParams();

    const result = await new UpsertRespondentPersonAction().Run(params);

    expect(result.Success).toBe(true);
    expect(outValue(params, 'Created')).toBe(false);
    // No People create entity was fetched (match short-circuits create).
    expect(state.getEntityCalls).not.toContain('MJ_BizApps_Common: People');
    expect(state.formResponse.RespondentPersonID).toBe('person-existing');
    expect(outValue(params, 'PersonID')).toBe('person-existing');
  });

  it('surfaces a failure when stamping the response Save() returns false', async () => {
    emailAnswerFixture('savefail@example.com');
    // Response that refuses to save and exposes a message via LatestResult.
    state.formResponse = Object.assign(new FakeEntity({ saveResult: false, saveError: 'permission denied' }), {
      FormID: 'form-1',
    });
    const params = makeParams();

    const result = await new UpsertRespondentPersonAction().Run(params);

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('RESPONSE_SAVE_FAILED');
    expect(result.Message).toContain('permission denied');
  });

  it('requires the FormResponseID param (the seam-S3 input contract)', async () => {
    const params = Object.assign(new RunActionParams(), { ContextUser: fakeUser, Filters: [], Params: [] });

    const result = await new UpsertRespondentPersonAction().Run(params);

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_PARAMETERS');
  });
});
