/**
 * Shared loader for the on-submit actions. Given a FormResponse id, it resolves the
 * response, its answers, the questions (so we know each answer's type/prompt), and the
 * owning form — everything the Upsert-Person / Email / Task hooks need, loaded once.
 *
 * All reads go through RunView with `.Success` checks (RunView never throws);
 * `contextUser` is always passed (CLAUDE.md MJ patterns).
 *
 * The outcome distinguishes a response that does not exist (`absent` — a hook skips) from one
 * that could not be READ (`failed` — a hook fails, with the reason). They used to share `null`,
 * and a failed answer or question read degraded to an empty list; on a host where the automation
 * principal lacked a grant (#239) both presented as "nothing to do", which is the one reading an
 * operator can never trace back to a permission.
 */
import { Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  CanonicalAnswers,
  mjBizAppsFormsFormResponseEntity,
  mjBizAppsFormsFormResponseAnswerEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormEntity,
  dateAnswerText,
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
 *
 * `dateText` is the one derived member: the date column stores an instant whose reading depends on
 * the question's type, so a faithful projection of the COLUMN is not a faithful projection of the
 * ANSWER. See its comment.
 */
export interface AnswerWithType {
  answerId: string;
  questionId: string;
  questionType: FormQuestionType;
  prompt: string;
  textValue: string | null;
  numericValue: number | null;
  dateValue: Date | null;
  /**
   * The date-column answer as the RESPONDENT gave it — `14:30` for a Time, `2026-08-07` for a
   * Date — or `null` when the answer populates another column.
   *
   * Beside `dateValue` rather than replacing it, because the two answer different questions. An
   * action doing date arithmetic or writing a datetime field wants the instant; an action putting
   * the answer in front of a human wants this. Without it every consumer had to know that a Time
   * is stored as the clock on the epoch date (#116) and re-derive the reading, and the failure was
   * silent and plausible: a confirmation email saying "your appointment is at 1 Jan 1970".
   */
  dateText: string | null;
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
 * What {@link loadFormResponseContext} found. Switch on `status`:
 * - `loaded` — everything read; `context` is complete.
 * - `absent` — the response does not exist. Hooks skip cleanly (idempotent/safe).
 * - `failed` — something exists but could not be read; `error` says what and why. Never treat it
 *   as `absent`: the usual cause is a missing grant, and a skip hides it.
 */
export type FormResponseContextResult =
  | { status: 'loaded'; context: FormResponseContext }
  | { status: 'absent' }
  | { status: 'failed'; error: string };

/** A read that did not produce its rows: the message for a `failed` outcome. */
type ReadOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

/** Load the response + answers + questions + form for a response id. */
export async function loadFormResponseContext(
  responseId: string,
  contextUser: UserInfo,
): Promise<FormResponseContextResult> {
  const md = new Metadata();
  const response = await md.GetEntityObject<mjBizAppsFormsFormResponseEntity>(ENTITY.FormResponse, contextUser);
  // `Load` returns false only when no row came back; a refused read (no Read grant) THROWS.
  const responseLoad = await loadRecord(response, responseId, ENTITY.FormResponse);
  if (!responseLoad.ok) {
    return { status: 'failed', error: responseLoad.error };
  }
  if (!responseLoad.value) {
    return { status: 'absent' };
  }

  const form = await md.GetEntityObject<mjBizAppsFormsFormEntity>(ENTITY.Form, contextUser);
  const formLoad = await loadRecord(form, response.FormID, ENTITY.Form);
  if (!formLoad.ok || !formLoad.value) {
    // The response exists, so a missing form is not "nothing to do" — it is a read that failed.
    const why = formLoad.ok ? 'no such record' : formLoad.error;
    return { status: 'failed', error: `form ${response.FormID} of response ${responseId} could not be loaded: ${why}` };
  }

  const answerRows = await loadAnswerRows(responseId, contextUser);
  if (!answerRows.ok) {
    return { status: 'failed', error: answerRows.error };
  }
  const questionsById = await loadQuestionsById(
    answerRows.value.map((a) => a.QuestionID),
    responseId,
    contextUser,
  );
  if (!questionsById.ok) {
    return { status: 'failed', error: questionsById.error };
  }
  const answers = answerRows.value.map((a) => toAnswerWithType(a, questionsById.value.get(a.QuestionID)));

  // The generated answer entities structurally satisfy `StoredAnswerRow` (same column names and
  // types), so the canonical view is built straight from the rows — no second projection to keep
  // in step with the first.
  return {
    status: 'loaded',
    context: { response, form, answers, canonicalAnswers: new CanonicalAnswers(answerRows.value) },
  };
}

/**
 * `entity.Load(id)`, with its two failure modes kept apart: `{ ok: true, value: false }` is "no
 * such row", while a throw (BaseEntity's CheckPermissions refusing the read) becomes `{ ok: false }`
 * carrying the entity, the id and the reason.
 */
async function loadRecord(
  entity: { Load(id: string): Promise<boolean> },
  id: string,
  entityName: string,
): Promise<ReadOutcome<boolean>> {
  try {
    return { ok: true, value: await entity.Load(id) };
  } catch (e) {
    return { ok: false, error: `could not read ${entityName} ${id}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function loadAnswerRows(
  responseId: string,
  contextUser: UserInfo,
): Promise<ReadOutcome<mjBizAppsFormsFormResponseAnswerEntity[]>> {
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
    // A failed read is NOT an unanswered response: consumers WRITE from these answers, and a
    // binding handed `[]` would create a record with every mapped field blank.
    return {
      ok: false,
      error: `could not read ${ENTITY.FormResponseAnswer} for response ${responseId}: ${answerResult.ErrorMessage}`,
    };
  }
  return { ok: true, value: answerResult.Results };
}

function toAnswerWithType(
  answer: mjBizAppsFormsFormResponseAnswerEntity,
  question: mjBizAppsFormsFormQuestionEntity | undefined,
): AnswerWithType {
  const questionType = question?.QuestionType ?? 'ShortText';
  return {
    answerId: answer.ID,
    questionId: answer.QuestionID,
    questionType,
    prompt: question?.Prompt ?? '',
    textValue: answer.TextValue,
    numericValue: answer.NumericValue,
    dateValue: answer.DateValue,
    dateText: answer.DateValue ? dateAnswerText(questionType, answer.DateValue) : null,
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
): Promise<ReadOutcome<Map<string, mjBizAppsFormsFormQuestionEntity>>> {
  const map = new Map<string, mjBizAppsFormsFormQuestionEntity>();
  const unique = Array.from(new Set(questionIds));
  if (unique.length === 0) {
    return { ok: true, value: map };
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
    // Without the questions EVERY answer would fall back to `questionType: 'ShortText'` and an
    // empty prompt, indistinguishable from a form genuinely built that way — and
    // `Forms: Analyze Written Responses` would score every one of them.
    return {
      ok: false,
      error: `could not read ${ENTITY.FormQuestion} for response ${responseId}: ${result.ErrorMessage}`,
    };
  }
  for (const q of result.Results) {
    map.set(q.ID, q);
  }
  return { ok: true, value: map };
}
