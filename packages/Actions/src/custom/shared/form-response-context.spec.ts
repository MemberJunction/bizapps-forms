import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

/** Rows the mocked RunView hands back, shaped like the generated answer/question entities. */
interface MockState {
  answers: Record<string, unknown>[];
  questions: Record<string, unknown>[];
  answersReadSucceeds: boolean;
  questionsReadSucceeds: boolean;
  responseLoads: boolean;
}

const state: MockState = {
  answers: [],
  questions: [],
  answersReadSucceeds: true,
  questionsReadSucceeds: true,
  responseLoads: true,
};

/** Spy on the real LogError so the failure paths can assert they actually reported. */
const logError = vi.fn();

// Partial mock — see the note in upsert-respondent-person.action.spec.ts: the real module must be
// spread back in so the generated entity classes can reach `BaseEntity` at runtime.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    async GetEntityObject<T>(entityName: string): Promise<T> {
      if (entityName === 'MJ_BizApps_Forms: Form Responses') {
        return { ID: 'resp-1', FormID: 'form-1', Load: async () => state.responseLoads } as unknown as T;
      }
      if (entityName === 'MJ_BizApps_Forms: Forms') {
        return { ID: 'form-1', Load: async () => true } as unknown as T;
      }
      throw new Error(`Unexpected GetEntityObject('${entityName}')`);
    }
  }
  class RunView {
    async RunView<T>(opts: { EntityName: string }): Promise<{ Success: boolean; ErrorMessage?: string; Results: T[] }> {
      if (opts.EntityName === 'MJ_BizApps_Forms: Form Response Answers') {
        return state.answersReadSucceeds
          ? { Success: true, Results: state.answers as T[] }
          : { Success: false, ErrorMessage: 'connection reset', Results: [] };
      }
      if (opts.EntityName === 'MJ_BizApps_Forms: Form Questions') {
        return state.questionsReadSucceeds
          ? { Success: true, Results: state.questions as T[] }
          : { Success: false, ErrorMessage: 'deadlock victim', Results: [] };
      }
      throw new Error(`Unexpected RunView('${opts.EntityName}')`);
    }
  }
  return { ...actual, Metadata, RunView, LogError: logError };
});

// Import AFTER the mock is declared so the loader binds to the mocked core.
const { loadFormResponseContext } = await import('./form-response-context');

const fakeUser = { Name: 'tester' } as unknown as UserInfo;

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
  logError.mockClear();
});

describe('loadFormResponseContext', () => {
  it('returns null when the response cannot be loaded', async () => {
    state.responseLoads = false;
    expect(await loadFormResponseContext('resp-1', fakeUser)).toBeNull();
  });

  describe('typed-column projection (the columns hooks used to be blind to)', () => {
    it('projects a Date answer', async () => {
      const when = new Date('2026-08-07T09:30:00Z');
      state.answers = [answerRow({ QuestionID: 'q-date', DateValue: when })];
      state.questions = [{ ID: 'q-date', QuestionType: 'Date', Prompt: 'Start date' }];

      const ctx = await loadFormResponseContext('resp-1', fakeUser);

      expect(ctx?.answers[0].dateValue).toEqual(when);
      expect(ctx?.answers[0].questionType).toBe('Date');
    });

    it('projects a File answer', async () => {
      state.answers = [answerRow({ QuestionID: 'q-file', FileID: 'file-guid-1' })];
      state.questions = [{ ID: 'q-file', QuestionType: 'FileUpload', Prompt: 'Resume' }];

      const ctx = await loadFormResponseContext('resp-1', fakeUser);

      expect(ctx?.answers[0].fileId).toBe('file-guid-1');
    });

    it('projects a Score', async () => {
      state.answers = [answerRow({ QuestionID: 'q-text', TextValue: 'an essay', Score: 4.5 })];
      state.questions = [{ ID: 'q-text', QuestionType: 'LongText', Prompt: 'Tell us more' }];

      const ctx = await loadFormResponseContext('resp-1', fakeUser);

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

      const ctx = await loadFormResponseContext('resp-1', fakeUser);

      // stored uppercase, looked up lowercase — the defect class this folding exists to kill
      expect(ctx?.canonicalAnswers.Get('3e4f1a2b-0000-4000-8000-000000000001')).toBe('a@b.com');
      expect(ctx?.canonicalAnswers.Get('q-file')).toEqual({ fileId: 'file-guid-1' });
      expect(ctx?.canonicalAnswers.Get('q-date')).toBe('2026-08-07T09:30:00.000Z');
      expect(ctx?.canonicalAnswers.Size).toBe(3);
    });

    it('omits an answer row that holds no value', async () => {
      state.answers = [answerRow({ QuestionID: 'q-skipped' })];
      state.questions = [];

      const ctx = await loadFormResponseContext('resp-1', fakeUser);

      expect(ctx?.answers).toHaveLength(1);
      expect(ctx?.canonicalAnswers.Has('q-skipped')).toBe(false);
    });
  });

  describe('read failures are reported, never silently degraded', () => {
    it('reports a failed answer read instead of presenting it as an unanswered response', async () => {
      state.answersReadSucceeds = false;

      const ctx = await loadFormResponseContext('resp-1', fakeUser);

      expect(ctx).not.toBeNull();
      expect(ctx?.answers).toEqual([]);
      expect(ctx?.canonicalAnswers.Size).toBe(0);
      // The degradation above is what the code did BEFORE the failure was reported, so asserting
      // only that would leave the log free to be deleted by a later tidy-up. This is the assertion
      // that actually pins the change.
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError.mock.calls[0][0]).toContain('resp-1');
      expect(logError.mock.calls[0][0]).toContain('connection reset');
    });

    it('reports a failed question read, which would otherwise relabel every answer as ShortText', async () => {
      state.answers = [answerRow({ QuestionID: 'q-email', TextValue: 'a@b.com' })];
      state.questionsReadSucceeds = false;

      const ctx = await loadFormResponseContext('resp-1', fakeUser);

      // The answer itself still survives — the value was read fine, only its metadata was lost.
      expect(ctx?.canonicalAnswers.Get('q-email')).toBe('a@b.com');
      // ...but the type is now a fallback, not a fact, so the failure has to be on the record.
      expect(ctx?.answers[0].questionType).toBe('ShortText');
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError.mock.calls[0][0]).toContain('resp-1');
      expect(logError.mock.calls[0][0]).toContain('deadlock victim');
    });
  });
});
