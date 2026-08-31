/**
 * Shared loader for the on-submit actions. Given a FormResponse id, it resolves the
 * response, its answers, the questions (so we know each answer's type/prompt), and the
 * owning form — everything the Upsert-Person / Email / Task hooks need, loaded once.
 *
 * All reads go through RunView with `.Success` checks (RunView never throws);
 * `contextUser` is always passed (CLAUDE.md MJ patterns).
 */
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  CanonicalAnswers,
  mjBizAppsFormsFormResponseEntity,
  mjBizAppsFormsFormResponseAnswerEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormEntity,
  quoteSqlString,
  type FormQuestionType,
} from '@mj-biz-apps/forms-entities';

const ENTITY = {
  FormResponse: 'MJ_BizApps_Forms: Form Responses',
  FormResponseAnswer: 'MJ_BizApps_Forms: Form Response Answers',
  FormQuestion: 'MJ_BizApps_Forms: Form Questions',
  Form: 'MJ_BizApps_Forms: Forms',
} as const;

/**
 * One answer paired with the type of the question it answers.
 *
 * Carries a faithful projection of every typed column. `dateValue`, `fileId` and `score` were
 * missing until entity binding needed them, which meant a Date or FileUpload answer was
 * invisible to every on-submit hook — a response could contain a resume and an appointment date
 * and a hook reading this shape would see neither, with nothing to indicate they had been
 * dropped rather than left unanswered.
 */
export interface AnswerWithType {
  answerId: string;
  questionId: string;
  questionType: FormQuestionType;
  prompt: string;
  textValue: string | null;
  numericValue: number | null;
  dateValue: Date | null;
  booleanValue: boolean | null;
  jsonValue: string | null;
  fileId: string | null;
  score: number | null;
}

/** Everything an on-submit hook needs about a submitted response. */
export interface FormResponseContext {
  response: mjBizAppsFormsFormResponseEntity;
  form: mjBizAppsFormsFormEntity;
  answers: AnswerWithType[];
  /**
   * The same answers collapsed to one value each and addressable by question GUID in any
   * casing — the shape a consumer wants when it is writing answers ONWARD (parameter mapping,
   * entity binding) rather than inspecting them column by column. Built once here so no
   * consumer re-derives the collapse or forgets to case-fold the lookup.
   */
  canonicalAnswers: CanonicalAnswers;
}

/**
 * Load the response + answers + questions + form for a response id. Returns null if
 * the response can't be found, so each hook can skip cleanly (idempotent/safe).
 */
export async function loadFormResponseContext(
  responseId: string,
  contextUser: UserInfo,
): Promise<FormResponseContext | null> {
  const md = new Metadata();
  const response = await md.GetEntityObject<mjBizAppsFormsFormResponseEntity>(ENTITY.FormResponse, contextUser);
  const loaded = await response.Load(responseId);
  if (!loaded) {
    return null;
  }

  const form = await md.GetEntityObject<mjBizAppsFormsFormEntity>(ENTITY.Form, contextUser);
  const formLoaded = await form.Load(response.FormID);
  if (!formLoaded) {
    return null;
  }

  const answerRows = await loadAnswerRows(responseId, contextUser);
  const questionsById = await loadQuestionsById(
    answerRows.map((a) => a.QuestionID),
    responseId,
    contextUser,
  );
  const answers = answerRows.map((a) => toAnswerWithType(a, questionsById.get(a.QuestionID)));

  // The generated answer entities structurally satisfy `StoredAnswerRow` (same column names and
  // types), so the canonical view is built straight from the rows — no second projection to keep
  // in step with the first.
  return { response, form, answers, canonicalAnswers: new CanonicalAnswers(answerRows) };
}

async function loadAnswerRows(
  responseId: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormResponseAnswerEntity[]> {
  const rv = new RunView();
  const answerResult = await rv.RunView<mjBizAppsFormsFormResponseAnswerEntity>(
    {
      EntityName: ENTITY.FormResponseAnswer,
      ExtraFilter: `ResponseID=${quoteSqlString(responseId)}`,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!answerResult.Success) {
    // A failed read and a genuinely unanswered response both used to return `[]`, which is a
    // dangerous pair to conflate now that consumers WRITE from these answers: a transient read
    // failure would present as "the respondent answered nothing" and a binding would happily
    // create a record with every mapped field blank. The callers' contract still degrades to an
    // empty list, but the failure is no longer silent.
    LogError(
      `loadFormResponseContext: failed to read answers for response ${responseId}: ${answerResult.ErrorMessage}`,
    );
    return [];
  }
  return answerResult.Results;
}

function toAnswerWithType(
  answer: mjBizAppsFormsFormResponseAnswerEntity,
  question: mjBizAppsFormsFormQuestionEntity | undefined,
): AnswerWithType {
  return {
    answerId: answer.ID,
    questionId: answer.QuestionID,
    questionType: question?.QuestionType ?? 'ShortText',
    prompt: question?.Prompt ?? '',
    textValue: answer.TextValue,
    numericValue: answer.NumericValue,
    dateValue: answer.DateValue,
    booleanValue: answer.BooleanValue,
    jsonValue: answer.JSONValue,
    fileId: answer.FileID,
    score: answer.Score,
  };
}

async function loadQuestionsById(
  questionIds: string[],
  responseId: string,
  contextUser: UserInfo,
): Promise<Map<string, mjBizAppsFormsFormQuestionEntity>> {
  const map = new Map<string, mjBizAppsFormsFormQuestionEntity>();
  const unique = Array.from(new Set(questionIds));
  if (unique.length === 0) {
    return map;
  }
  const inList = unique.map((id) => quoteSqlString(id)).join(',');
  const rv = new RunView();
  const result = await rv.RunView<mjBizAppsFormsFormQuestionEntity>(
    {
      EntityName: ENTITY.FormQuestion,
      ExtraFilter: `ID IN (${inList})`,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!result.Success) {
    // Same hazard as the answer read above, and worth stating separately because the degradation
    // is quieter: without the questions, EVERY answer falls back to `questionType: 'ShortText'`
    // and an empty prompt, which no consumer can tell apart from a form genuinely built that way.
    // `Forms: Analyze Written Responses` treats ShortText as analyzable, so it would ship every
    // answer to the scoring prompt and persist a Score against it.
    LogError(
      `loadFormResponseContext: failed to read questions for response ${responseId}: ${result.ErrorMessage}`,
    );
    return map;
  }
  for (const q of result.Results) {
    map.set(q.ID, q);
  }
  return map;
}
