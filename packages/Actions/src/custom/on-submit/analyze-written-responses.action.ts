/**
 * On-submit action: **Forms: Analyze Written Responses**.
 *
 * Runs a metadata-driven AI Prompt over a response's free-text answers (ShortText /
 * LongText only) to score them and explain the score, persisting `Score` +
 * `ScoreRationale` onto each `FormResponseAnswer`.
 *
 * Efficiency: ONE prompt call per response — the prompt takes an `Answers` array and
 * returns a parallel `answers` array (same order); results are mapped back by index.
 * This avoids N API calls per submission.
 *
 * Model selection is metadata-driven: the `Forms: Response Analyzer` AI Prompt
 * (`SelectionStrategy='Specific'` + its related AI Prompt Model row) pins the model —
 * no vendor/model is named in this file. The prompt run sits behind the injectable
 * {@link ResponseAnalyzerModel} seam so the map-back/persistence path is unit-testable
 * with a stub (no network, no API key, no AIEngine config).
 *
 * Contract: invoked BY NAME by the submit endpoint's on-submit hooks. Do not rename.
 *
 * Input params:
 *   - `FormResponseID` (string, required)
 * Output params: `AnalyzedCount`, `SkippedCount`, `AnalysisSummary`.
 *
 * Best-effort: a per-answer Save failure is logged and skipped; the action still
 * succeeds for the answers that persisted (hooks are best-effort side effects).
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { mjBizAppsFormsFormResponseAnswerEntity, type FormQuestionType } from '@mj-biz-apps/forms-entities';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { loadFormResponseContext, type AnswerWithType } from '../shared/form-response-context';
import {
  AIPromptResponseAnalyzerModel,
  type ResponseAnalyzerModel,
  type AnalyzerInputAnswer,
  type AnalyzedAnswer,
} from './response-analyzer-model';

const ENTITY = {
  FormResponseAnswer: 'MJ_BizApps_Forms: Form Response Answers',
} as const;

/** Free-text question types this action scores; others are skipped. */
const ANALYZABLE_TYPES: ReadonlySet<FormQuestionType> = new Set<FormQuestionType>(['ShortText', 'LongText']);

/** Test seam: default runs the named MJ AI Prompt; specs inject a stub. */
let analyzerModel: ResponseAnalyzerModel = new AIPromptResponseAnalyzerModel();

/** Override the analyzer model (unit tests inject a stub returning canned analysis). */
export function setResponseAnalyzerModel(model: ResponseAnalyzerModel): void {
  analyzerModel = model;
}

/** One free-text answer selected for analysis, kept alongside its source context row. */
interface SelectedAnswer {
  source: AnswerWithType;
  input: AnalyzerInputAnswer;
}

@RegisterClass(BaseAction, 'Forms: Analyze Written Responses')
export class AnalyzeWrittenResponsesAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const responseId = getStringParam(params, 'FormResponseID');
    if (!responseId) {
      return fail('FormResponseID parameter is required', 'MISSING_PARAMETERS');
    }

    const ctx = await loadFormResponseContext(responseId, params.ContextUser);
    if (!ctx) {
      return skip(`FormResponse '${responseId}' not found; nothing to analyze.`);
    }

    const selected = selectFreeTextAnswers(ctx.answers);
    if (selected.length === 0) {
      setOutputParam(params, 'AnalyzedCount', 0);
      setOutputParam(params, 'SkippedCount', ctx.answers.length);
      setOutputParam(params, 'AnalysisSummary', 'No free-text answers to analyze.');
      return skip('No ShortText/LongText answers with content; nothing to analyze.');
    }

    return this.analyzeAndPersist(selected, ctx.answers.length, ctx.form.Name, params);
  }

  /** Run the single prompt call, then map results back and persist per answer. */
  private async analyzeAndPersist(
    selected: SelectedAnswer[],
    totalAnswers: number,
    formName: string,
    params: RunActionParams,
  ): Promise<ActionResultSimple> {
    const analyzed = await analyzerModel.analyze(
      selected.map((s) => s.input),
      formName,
      params.ContextUser,
    );

    const persisted = await persistAnalysis(selected, analyzed, params.ContextUser);
    const skipped = totalAnswers - persisted;
    setOutputParam(params, 'AnalyzedCount', persisted);
    setOutputParam(params, 'SkippedCount', skipped);
    setOutputParam(params, 'AnalysisSummary', `Scored ${persisted} of ${selected.length} free-text answer(s).`);
    return {
      Success: true,
      ResultCode: 'SUCCESS',
      Message: `Analyzed ${persisted} free-text answer(s) for the response.`,
    };
  }
}

/** Keep only ShortText/LongText answers that actually have text. */
function selectFreeTextAnswers(answers: AnswerWithType[]): SelectedAnswer[] {
  const selected: SelectedAnswer[] = [];
  for (const a of answers) {
    const text = a.textValue?.trim();
    if (ANALYZABLE_TYPES.has(a.questionType) && text) {
      selected.push({ source: a, input: { questionPrompt: a.prompt, text } });
    }
  }
  return selected;
}

/**
 * Map the model's parallel `answers` array back to each selected answer BY INDEX and
 * persist `Score` + `ScoreRationale`. Returns the count that saved. A missing analysis
 * entry or a failed Save is logged and skipped (best-effort).
 */
async function persistAnalysis(
  selected: SelectedAnswer[],
  analyzed: AnalyzedAnswer[],
  contextUser: UserInfo,
): Promise<number> {
  let saved = 0;
  for (let i = 0; i < selected.length; i++) {
    const analysis = analyzed[i];
    if (!analysis) {
      console.warn(`[forms] Analyzer returned no entry for answer index ${i}; skipping.`);
      continue;
    }
    if (await saveAnswerScore(selected[i].source.answerId, analysis, contextUser)) {
      saved++;
    }
  }
  return saved;
}

/** Load one FormResponseAnswer by its id and stamp `Score` + `ScoreRationale`. */
async function saveAnswerScore(
  answerId: string,
  analysis: AnalyzedAnswer,
  contextUser: UserInfo,
): Promise<boolean> {
  const md = new Metadata();
  const answer = await md.GetEntityObject<mjBizAppsFormsFormResponseAnswerEntity>(
    ENTITY.FormResponseAnswer,
    contextUser,
  );
  const loaded = await answer.Load(answerId);
  if (!loaded) {
    console.warn(`[forms] FormResponseAnswer '${answerId}' could not be loaded; skipping score.`);
    return false;
  }
  answer.Score = analysis.score;
  answer.ScoreRationale = analysis.rationale;
  const ok = await answer.Save();
  if (!ok) {
    console.warn(
      `[forms] Failed to save score for FormResponseAnswer '${answerId}': ${answer.LatestResult?.CompleteMessage ?? 'unknown error'}`,
    );
  }
  return ok;
}

function fail(message: string, resultCode: string): ActionResultSimple {
  return { Success: false, Message: message, ResultCode: resultCode };
}

function skip(message: string): ActionResultSimple {
  return { Success: true, Message: message, ResultCode: 'SKIPPED' };
}
