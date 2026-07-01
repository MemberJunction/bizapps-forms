/**
 * Unit tests for the **Forms: Analyze Written Responses** on-submit action.
 *
 * The action's collaborators are MJ's `Metadata`/`RunView` (mocked here) and the
 * {@link ResponseAnalyzerModel} AI seam (injected as a stub via
 * `setResponseAnalyzerModel`). This exercises the deterministic
 * select → single-call → map-back-by-index → persist path offline (no network, no
 * API key, no AIEngine config). We assert:
 *   1. only ShortText/LongText answers with content are analyzed (one prompt call)
 *   2. Score + ScoreRationale are mapped back BY INDEX onto the right answer
 *   3. no free-text answers → SKIPPED, no prompt call
 *   4. a per-answer Save failure is best-effort (logged, counted out, still succeeds)
 *   5. FormResponseID is required
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type {
  AnalyzedAnswer,
  AnalyzerInputAnswer,
  ResponseAnalyzerModel,
} from './response-analyzer-model';

// ---------------------------------------------------------------------------
// Fakes for the entity / RunView layer.
// ---------------------------------------------------------------------------

/** A FormResponseAnswer stand-in with controllable Save() + score capture. */
class FakeAnswerEntity {
  ID = '';
  Score: number | null = null;
  ScoreRationale: string | null = null;
  LatestResult: { CompleteMessage: string } | null = null;
  private _saveResult: boolean;

  constructor(saveResult = true, saveError?: string) {
    this._saveResult = saveResult;
    if (saveError) {
      this.LatestResult = { CompleteMessage: saveError };
    }
  }

  async Load(id: string): Promise<boolean> {
    this.ID = id;
    return true;
  }

  async Save(): Promise<boolean> {
    return this._saveResult;
  }
}

/** A simple field-bag for the FormResponse + Form loads. */
class FakeEntity {
  ID = '';
  FormID = 'form-1';
  Name = 'Feedback Form';
  async Load(id: string): Promise<boolean> {
    this.ID = id;
    return true;
  }
}

interface AnswerRow {
  ID: string;
  QuestionID: string;
  TextValue: string | null;
  NumericValue: number | null;
  BooleanValue: boolean | null;
  JSONValue: string | null;
}
interface QuestionRow {
  ID: string;
  QuestionType: string;
  Prompt: string;
}

const state: {
  answerRows: AnswerRow[];
  questionRows: QuestionRow[];
  savedAnswers: Map<string, FakeAnswerEntity>;
  answerSaveResult: (id: string) => boolean;
} = {
  answerRows: [],
  questionRows: [],
  savedAnswers: new Map(),
  answerSaveResult: () => true,
};

vi.mock('@memberjunction/core', () => {
  class Metadata {
    async GetEntityObject<T>(entityName: string): Promise<T> {
      if (entityName === 'MJ_BizApps_Forms: Form Responses' || entityName === 'MJ_BizApps_Forms: Forms') {
        return new FakeEntity() as unknown as T;
      }
      if (entityName === 'MJ_BizApps_Forms: Form Response Answers') {
        // Each GetEntityObject returns a fresh answer entity; capture it by the id it loads.
        const entity = new CapturingAnswerEntity();
        return entity as unknown as T;
      }
      throw new Error(`Unexpected GetEntityObject('${entityName}')`);
    }
  }
  class RunView {
    async RunView<T>(opts: { EntityName: string }): Promise<{ Success: boolean; Results: T[] }> {
      let results: unknown[] = [];
      if (opts.EntityName === 'MJ_BizApps_Forms: Form Response Answers') results = state.answerRows;
      else if (opts.EntityName === 'MJ_BizApps_Forms: Form Questions') results = state.questionRows;
      return { Success: true, Results: results as T[] };
    }
  }
  return { Metadata, RunView };
});

/** An answer entity that records its saved state into shared `state.savedAnswers`. */
class CapturingAnswerEntity extends FakeAnswerEntity {
  async Load(id: string): Promise<boolean> {
    this.ID = id;
    // Apply the per-test configured save result for this id.
    (this as unknown as { _apply: () => void })._apply?.();
    return true;
  }
  async Save(): Promise<boolean> {
    const ok = state.answerSaveResult(this.ID);
    state.savedAnswers.set(this.ID, this);
    if (!ok) {
      this.LatestResult = { CompleteMessage: 'save refused' };
    }
    return ok;
  }
}

// Import the action AFTER the mock is declared so it binds to the mocked core.
const { AnalyzeWrittenResponsesAction, setResponseAnalyzerModel } = await import('./analyze-written-responses.action');

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

function outValue(params: RunActionParams, name: string): unknown {
  return params.Params.find((p) => p.Name === name)?.Value;
}

/** A stub analyzer model that returns a fixed analysis array and records its input. */
function stubModel(analysis: AnalyzedAnswer[]): ResponseAnalyzerModel & { analyze: ReturnType<typeof vi.fn> } {
  return { analyze: vi.fn(async () => analysis) };
}

beforeEach(() => {
  state.answerRows = [];
  state.questionRows = [];
  state.savedAnswers = new Map();
  state.answerSaveResult = () => true;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Forms: Analyze Written Responses', () => {
  it('analyzes only free-text answers in ONE call and maps scores back by index', async () => {
    state.answerRows = [
      { ID: 'a-short', QuestionID: 'q1', TextValue: 'Great venue', NumericValue: null, BooleanValue: null, JSONValue: null },
      { ID: 'a-num', QuestionID: 'q2', TextValue: null, NumericValue: 5, BooleanValue: null, JSONValue: null },
      { ID: 'a-long', QuestionID: 'q3', TextValue: 'Could be shorter', NumericValue: null, BooleanValue: null, JSONValue: null },
    ];
    state.questionRows = [
      { ID: 'q1', QuestionType: 'ShortText', Prompt: 'What worked?' },
      { ID: 'q2', QuestionType: 'Rating', Prompt: 'Rate us' },
      { ID: 'q3', QuestionType: 'LongText', Prompt: 'What to improve?' },
    ];
    const model = stubModel([
      { score: 90, rationale: 'Clear and positive.' },
      { score: 55, rationale: 'Somewhat vague.' },
    ]);
    setResponseAnalyzerModel(model);

    const params = makeParams();
    const result = await new AnalyzeWrittenResponsesAction().Run(params);

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    // ONE prompt call for the whole response.
    expect(model.analyze).toHaveBeenCalledTimes(1);
    // Only the two free-text answers were sent, in order.
    const sent = model.analyze.mock.calls[0][0] as AnalyzerInputAnswer[];
    expect(sent).toEqual([
      { questionPrompt: 'What worked?', text: 'Great venue' },
      { questionPrompt: 'What to improve?', text: 'Could be shorter' },
    ]);
    // Scores mapped back BY INDEX onto the right answers (the Rating answer is untouched).
    expect(state.savedAnswers.get('a-short')?.Score).toBe(90);
    expect(state.savedAnswers.get('a-short')?.ScoreRationale).toBe('Clear and positive.');
    expect(state.savedAnswers.get('a-long')?.Score).toBe(55);
    expect(state.savedAnswers.has('a-num')).toBe(false);
    expect(outValue(params, 'AnalyzedCount')).toBe(2);
  });

  it('SKIPS with no prompt call when there are no free-text answers', async () => {
    state.answerRows = [
      { ID: 'a-num', QuestionID: 'q2', TextValue: null, NumericValue: 5, BooleanValue: null, JSONValue: null },
    ];
    state.questionRows = [{ ID: 'q2', QuestionType: 'Rating', Prompt: 'Rate us' }];
    const model = stubModel([]);
    setResponseAnalyzerModel(model);

    const result = await new AnalyzeWrittenResponsesAction().Run(makeParams());

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SKIPPED');
    expect(model.analyze).not.toHaveBeenCalled();
  });

  it('best-effort: a failed answer Save is skipped, others still count', async () => {
    state.answerRows = [
      { ID: 'a1', QuestionID: 'q1', TextValue: 'first', NumericValue: null, BooleanValue: null, JSONValue: null },
      { ID: 'a2', QuestionID: 'q2', TextValue: 'second', NumericValue: null, BooleanValue: null, JSONValue: null },
    ];
    state.questionRows = [
      { ID: 'q1', QuestionType: 'LongText', Prompt: 'Q1' },
      { ID: 'q2', QuestionType: 'LongText', Prompt: 'Q2' },
    ];
    state.answerSaveResult = (id) => id !== 'a1'; // a1 refuses to save
    setResponseAnalyzerModel(
      stubModel([
        { score: 70, rationale: 'ok' },
        { score: 80, rationale: 'good' },
      ]),
    );

    const params = makeParams();
    const result = await new AnalyzeWrittenResponsesAction().Run(params);

    expect(result.Success).toBe(true);
    expect(outValue(params, 'AnalyzedCount')).toBe(1);
  });

  it('requires the FormResponseID param', async () => {
    const params = Object.assign(new RunActionParams(), { ContextUser: fakeUser, Filters: [], Params: [] });
    const result = await new AnalyzeWrittenResponsesAction().Run(params);
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_PARAMETERS');
  });
});
