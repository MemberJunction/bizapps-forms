import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

/** Rows the mocked RunView hands back, shaped like the generated answer/question entities. */
interface MockState {
  answers: Record<string, unknown>[];
  questions: Record<string, unknown>[];
  answersReadSucceeds: boolean;
  questionsReadSucceeds: boolean;
  responseLoads: boolean;
  /** When set, the response `Load` THROWS with this message — what BaseEntity does without Read permission. */
  responseLoadThrows: string | undefined;
  /**
   * The `ExtraFilter` each read actually sent. `RunView` takes SQL TEXT and offers no parameter
   * binding, so the filter string is this module's real contract with the database — asserting on
   * the rows it returns cannot tell a quoted literal from an interpolated one.
   */
  filters: { answers?: string; questions?: string };
}

const state: MockState = {
  answers: [],
  questions: [],
  answersReadSucceeds: true,
  questionsReadSucceeds: true,
  responseLoads: true,
  responseLoadThrows: undefined,
  filters: {},
};

// Partial mock — see the note in upsert-respondent-person.action.spec.ts: the real module must be
// spread back in so the generated entity classes can reach `BaseEntity` at runtime.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    async GetEntityObject<T>(entityName: string): Promise<T> {
      if (entityName === 'MJ_BizApps_Forms: Form Responses') {
        return {
          ID: 'resp-1',
          FormID: 'form-1',
          Load: async () => {
            if (state.responseLoadThrows) throw new Error(state.responseLoadThrows);
            return state.responseLoads;
          },
        } as unknown as T;
      }
      if (entityName === 'MJ_BizApps_Forms: Forms') {
        return { ID: 'form-1', Load: async () => true } as unknown as T;
      }
      throw new Error(`Unexpected GetEntityObject('${entityName}')`);
    }
  }
  class RunView {
    async RunView<T>(opts: { EntityName: string; ExtraFilter?: string }): Promise<{ Success: boolean; ErrorMessage?: string; Results: T[] }> {
      if (opts.EntityName === 'MJ_BizApps_Forms: Form Response Answers') {
        state.filters.answers = opts.ExtraFilter;
        return state.answersReadSucceeds
          ? { Success: true, Results: state.answers as T[] }
          : { Success: false, ErrorMessage: 'connection reset', Results: [] };
      }
      if (opts.EntityName === 'MJ_BizApps_Forms: Form Questions') {
        state.filters.questions = opts.ExtraFilter;
        return state.questionsReadSucceeds
          ? { Success: true, Results: state.questions as T[] }
          : { Success: false, ErrorMessage: 'deadlock victim', Results: [] };
      }
      throw new Error(`Unexpected RunView('${opts.EntityName}')`);
    }
  }
  return { ...actual, Metadata, RunView };
});

// Import AFTER the mock is declared so the loader binds to the mocked core.
const { loadFormResponseContext } = await import('./form-response-context');
type FormResponseContext = import('./form-response-context').FormResponseContext;

const fakeUser = { Name: 'tester' } as unknown as UserInfo;

/** Load and insist on the `loaded` outcome — the shape every projection test below reads. */
async function loadedContext(): Promise<FormResponseContext> {
  const result = await loadFormResponseContext('resp-1', fakeUser);
  if (result.status !== 'loaded') {
    throw new Error(`expected a loaded context, got ${JSON.stringify(result)}`);
  }
  return result.context;
}

/** A fully-populated answer row, one typed column at a time. */
function answerRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    ID: 'a1',
    ResponseID: 'resp-1',
    QuestionID: 'q1',
    TextValue: null,
    NumericValue: null,
    DateValue: null,
    BooleanValue: null,
    JSONValue: null,
    FileID: null,
    Score: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.answers = [];
  state.questions = [];
  state.answersReadSucceeds = true;
  state.questionsReadSucceeds = true;
  state.responseLoads = true;
  state.responseLoadThrows = undefined;
  state.filters = {};
});

describe('loadFormResponseContext', () => {
  it("reports 'absent' when the response genuinely does not exist, so hooks can skip", async () => {
    state.responseLoads = false;
    expect(await loadFormResponseContext('resp-1', fakeUser)).toEqual({ status: 'absent' });
  });

  it("reports 'failed' — not 'absent' — when the response cannot be READ (#239)", async () => {
    // BaseEntity.Load throws on a missing Read grant; that used to escape as an exception, and the
    // caller's only other answer was "not found", which would tell a hook to skip quietly.
    state.responseLoadThrows = 'User does not have read permissions on MJ_BizApps_Forms: Form Responses';

    const result = await loadFormResponseContext('resp-1', fakeUser);

    expect(result.status).toBe('failed');
    expect(result.status === 'failed' && result.error).toContain('resp-1');
    expect(result.status === 'failed' && result.error).toContain(state.responseLoadThrows);
  });

  describe('typed-column projection (the columns hooks used to be blind to)', () => {
    it('projects a Date answer', async () => {
      const when = new Date('2026-08-07T09:30:00Z');
      state.answers = [answerRow({ QuestionID: 'q-date', DateValue: when })];
      state.questions = [{ ID: 'q-date', QuestionType: 'Date', Prompt: 'Start date' }];

      const ctx = await loadedContext();

      expect(ctx?.answers[0].dateValue).toEqual(when);
      expect(ctx?.answers[0].questionType).toBe('Date');
    });

    it('reads a Time answer back as the clock, so an action never renders "1970"', async () => {
      // A Time is STORED as the clock on the epoch date (#116), so the raw `dateValue` an action
      // receives is `1970-01-01T14:30:00.000Z`. Any date formatter turns that into "Jan 1, 1970"
      // in a confirmation email. `dateText` is the respondent's own reading, alongside the raw
      // instant rather than replacing it — an action doing date arithmetic still wants the Date.
      state.answers = [answerRow({ QuestionID: 'q-time', DateValue: new Date('1970-01-01T14:30:00.000Z') })];
      state.questions = [{ ID: 'q-time', QuestionType: 'Time', Prompt: 'What time suits you' }];

      const ctx = await loadedContext();

      expect(ctx?.answers[0].dateText).toBe('14:30');
      expect(ctx?.answers[0].dateValue).toEqual(new Date('1970-01-01T14:30:00.000Z'));
    });

    it('reads a Date answer back as the calendar day', async () => {
      state.answers = [answerRow({ QuestionID: 'q-date', DateValue: new Date('2026-08-07T00:00:00Z') })];
      state.questions = [{ ID: 'q-date', QuestionType: 'Date', Prompt: 'Start date' }];

      const ctx = await loadedContext();

      expect(ctx?.answers[0].dateText).toBe('2026-08-07');
    });

    it('leaves dateText null when the answer populates another column', async () => {
      state.answers = [answerRow({ QuestionID: 'q-text', TextValue: 'hello' })];
      state.questions = [{ ID: 'q-text', QuestionType: 'ShortText', Prompt: 'Name' }];

      const ctx = await loadedContext();

      expect(ctx?.answers[0].dateText).toBeNull();
    });

    it('projects a File answer', async () => {
      state.answers = [answerRow({ QuestionID: 'q-file', FileID: 'file-guid-1' })];
      state.questions = [{ ID: 'q-file', QuestionType: 'FileUpload', Prompt: 'Resume' }];

      const ctx = await loadedContext();

      expect(ctx?.answers[0].fileId).toBe('file-guid-1');
    });

    it('projects a Score', async () => {
      state.answers = [answerRow({ QuestionID: 'q-text', TextValue: 'an essay', Score: 4.5 })];
      state.questions = [{ ID: 'q-text', QuestionType: 'LongText', Prompt: 'Tell us more' }];

      const ctx = await loadedContext();

      expect(ctx?.answers[0].score).toBe(4.5);
    });
  });

  describe('canonical answers', () => {
    it('collapses each answer and folds the question GUID for lookup', async () => {
      state.answers = [
        answerRow({ ID: 'a1', QuestionID: '3E4F1A2B-0000-4000-8000-000000000001', TextValue: 'a@b.com' }),
        answerRow({ ID: 'a2', QuestionID: 'q-file', FileID: 'file-guid-1' }),
        answerRow({ ID: 'a3', QuestionID: 'q-date', DateValue: new Date('2026-08-07T09:30:00Z') }),
      ];
      state.questions = [];

      const ctx = await loadedContext();

      // stored uppercase, looked up lowercase — the defect class this folding exists to kill
      expect(ctx?.canonicalAnswers.Get('3e4f1a2b-0000-4000-8000-000000000001')).toBe('a@b.com');
      expect(ctx?.canonicalAnswers.Get('q-file')).toEqual({ fileId: 'file-guid-1' });
      expect(ctx?.canonicalAnswers.Get('q-date')).toBe('2026-08-07T09:30:00.000Z');
      expect(ctx?.canonicalAnswers.Size).toBe(3);
    });

    it('omits an answer row that holds no value', async () => {
      state.answers = [answerRow({ QuestionID: 'q-skipped' })];
      state.questions = [];

      const ctx = await loadedContext();

      expect(ctx?.answers).toHaveLength(1);
      expect(ctx?.canonicalAnswers.Has('q-skipped')).toBe(false);
    });
  });

  describe('ids reach the filters as quoted literals, not as interpolation', () => {
    // Both ids are DB-sourced validated GUIDs on today's only caller, so neither of these is
    // reachable in production — which is exactly why the escaping had nothing holding it in place.
    // This is a SHARED loader on the on-submit automation path, and the next caller to pass it a
    // less-constrained id inherits whatever this file does. Asserting the filter text is the only
    // assertion that can tell the two apart: the rows come back identical either way.

    it('escapes a quote in the response id rather than letting it close the literal', async () => {
      await loadFormResponseContext("resp-1' OR '1'='1", fakeUser);

      expect(state.filters.answers).toBe("ResponseID='resp-1'' OR ''1''=''1'");
    });

    it('escapes a quote in every question id of the IN list', async () => {
      state.answers = [answerRow({ QuestionID: "q1' OR '1'='1" })];

      await loadFormResponseContext('resp-1', fakeUser);

      expect(state.filters.questions).toBe("ID IN ('q1'' OR ''1''=''1')");
    });

    it('quotes each id separately when several questions are read', async () => {
      state.answers = [answerRow({ ID: 'a1', QuestionID: 'q1' }), answerRow({ ID: 'a2', QuestionID: "q2'" })];

      await loadFormResponseContext('resp-1', fakeUser);

      expect(state.filters.questions).toBe("ID IN ('q1','q2''')");
    });
  });

  describe('read failures fail the load, never degrade silently (#239)', () => {
    // These used to degrade to an empty answer list / typeless answers and log. That was the best
    // the old `context | null` contract could express, and its own comments named the harm: a
    // binding would create a record with every mapped field blank, and Analyze would score every
    // answer as ShortText. With an outcome callers switch on, the honest answer is a failure.
    it('fails when the answers cannot be read, instead of presenting an unanswered response', async () => {
      state.answersReadSucceeds = false;

      const result = await loadFormResponseContext('resp-1', fakeUser);

      expect(result.status).toBe('failed');
      expect(result.status === 'failed' && result.error).toContain('MJ_BizApps_Forms: Form Response Answers');
      expect(result.status === 'failed' && result.error).toContain('resp-1');
      expect(result.status === 'failed' && result.error).toContain('connection reset');
    });

    it('fails when the questions cannot be read, instead of relabelling every answer ShortText', async () => {
      state.answers = [answerRow({ QuestionID: 'q-email', TextValue: 'a@b.com' })];
      state.questionsReadSucceeds = false;

      const result = await loadFormResponseContext('resp-1', fakeUser);

      expect(result.status).toBe('failed');
      expect(result.status === 'failed' && result.error).toContain('MJ_BizApps_Forms: Form Questions');
      expect(result.status === 'failed' && result.error).toContain('deadlock victim');
    });
  });
});
