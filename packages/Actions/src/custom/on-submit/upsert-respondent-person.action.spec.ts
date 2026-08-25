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
// PRECONDITION, not decoration. The action refuses to run when no generated class is registered
// for `MJ_BizApps_Common: People`, because MJ's fallback would silently discard every field it
// sets (#60). In production `custom/register.ts` imports this package for exactly that reason,
// and `register.spec.ts` is what pins that it still does; here we only need the precondition met.
import '@mj-biz-apps/common-entities';

// ---------------------------------------------------------------------------
// Fakes for the entity / RunView layer.
// ---------------------------------------------------------------------------

/** MJ's own not-null validation error shape, as `CompleteMessage` renders it. */
function nullFieldError(field: string): string {
  return JSON.stringify({ Source: field, Message: `${field} cannot be null`, Value: null, Type: 'Failure' });
}

/** The nullable columns this fake carries — the only fields it can be asked to require. */
type FakeEntityField = 'RespondentPersonID' | 'FirstName' | 'LastName' | 'Email' | 'Phone' | 'Status';

/**
 * A field-bag entity stand-in with a controllable Save() result.
 *
 * `requiredFields` exists because this fake used to accept anything. `MJ_BizApps_Common: People`
 * declares FirstName and LastName NOT NULL with no default, so a real save rejects a Person
 * missing either — but the fake returned true regardless, which meant the suite could not tell a
 * populated Person from an empty one. Modelling the rejection is what makes "the action must
 * produce a Person with a name" a claim these tests can fail on.
 */
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
  private _requiredFields: readonly FakeEntityField[];

  constructor(
    opts: {
      saveResult?: boolean;
      idOnSave?: string;
      saveError?: string;
      requiredFields?: readonly FakeEntityField[];
    } = {},
  ) {
    this._saveResult = opts.saveResult ?? true;
    this._idOnSave = opts.idOnSave;
    this._requiredFields = opts.requiredFields ?? [];
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
    const missing = this._requiredFields.filter((f) => this[f] === null || this[f] === undefined);
    if (missing.length > 0) {
      // Errors joined by newline, exactly as BaseEntityResult.CompleteMessage does it.
      this.LatestResult = { CompleteMessage: missing.map(nullFieldError).join('\n') };
      return false;
    }
    if (this._saveResult && this._idOnSave) {
      this.ID = this._idOnSave;
    }
    return this._saveResult;
  }
}

/** What `MJ_BizApps_Common: People` refuses to save without. */
const PERSON_REQUIRED_FIELDS = ['FirstName', 'LastName'] as const;

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

// Partial mock: the real module is spread back in, and only the two data-access classes are
// replaced. A from-scratch `{ Metadata, RunView }` module worked only while nothing on this
// import graph used @memberjunction/core at RUNTIME — the generated entity classes reach for
// `BaseEntity` the moment the forms-entities barrel is actually loaded, which it now is.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
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
  return { ...actual, Metadata, RunView };
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

/**
 * The answer shape issue #60 was reported against — a form that collects the name rather than
 * leaving the action to derive one from the email address.
 */
function namedRespondentFixture(first: string, last: string, email: string): void {
  state.answers = [
    { QuestionID: 'q-first', TextValue: first, NumericValue: null, BooleanValue: null, JSONValue: null },
    { QuestionID: 'q-last', TextValue: last, NumericValue: null, BooleanValue: null, JSONValue: null },
    { QuestionID: 'q-email', TextValue: email, NumericValue: null, BooleanValue: null, JSONValue: null },
  ];
  state.questions = [
    { ID: 'q-first', QuestionType: 'ShortText', Prompt: 'First name' },
    { ID: 'q-last', QuestionType: 'ShortText', Prompt: 'Last name' },
    { ID: 'q-email', QuestionType: 'Email', Prompt: 'Email address' },
  ];
}

function outValue(params: RunActionParams, name: string): unknown {
  return params.Params.find((p) => p.Name === name)?.Value;
}

beforeEach(() => {
  state.formResponse = new FakeEntity();
  state.form = new FakeEntity();
  state.personOnCreate = new FakeEntity({ idOnSave: 'person-new', requiredFields: PERSON_REQUIRED_FIELDS });
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
    // The NOT NULL columns carry values. Only Email was asserted here before, which is why a
    // deployment writing every Person as all-nulls looked identical to a healthy one (#60): the
    // form collected no name in this fixture, so these prove the email-derived fallbacks land.
    expect(state.personOnCreate.FirstName).toBe('newperson');
    expect(state.personOnCreate.LastName).toBe('(unknown)');
    // The response was stamped + saved with the new person's id.
    expect(state.formResponse.RespondentPersonID).toBe('person-new');
    expect(outValue(params, 'PersonID')).toBe('person-new');
    expect(outValue(params, 'Created')).toBe(true);
  });

  it('a form that collects a name puts that name on the Person', async () => {
    namedRespondentFixture('Grace', 'Hopper', 'grace@example.com');
    const params = makeParams();

    const result = await new UpsertRespondentPersonAction().Run(params);

    expect(result.Success).toBe(true);
    expect(state.personOnCreate.FirstName).toBe('Grace');
    expect(state.personOnCreate.LastName).toBe('Hopper');
    expect(state.personOnCreate.Email).toBe('grace@example.com');
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
