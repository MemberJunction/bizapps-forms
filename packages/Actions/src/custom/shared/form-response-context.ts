/**
 * Shared loader for the on-submit actions. Given a FormResponse id, it resolves the
 * response, its answers, the questions (so we know each answer's type/prompt), and the
 * owning form — everything the Upsert-Person / Email / Task hooks need, loaded once.
 *
 * All reads go through RunView with `.Success` checks (RunView never throws);
 * `contextUser` is always passed (CLAUDE.md MJ patterns).
 */
import { Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  mjBizAppsFormsFormResponseEntity,
  mjBizAppsFormsFormResponseAnswerEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormEntity,
  type FormQuestionType,
} from '@mj-biz-apps/forms-entities';

const ENTITY = {
  FormResponse: 'MJ_BizApps_Forms: Form Responses',
  FormResponseAnswer: 'MJ_BizApps_Forms: Form Response Answers',
  FormQuestion: 'MJ_BizApps_Forms: Form Questions',
  Form: 'MJ_BizApps_Forms: Forms',
} as const;

/** One answer paired with the type of the question it answers. */
export interface AnswerWithType {
  answerId: string;
  questionId: string;
  questionType: FormQuestionType;
  prompt: string;
  textValue: string | null;
  numericValue: number | null;
  booleanValue: boolean | null;
  jsonValue: string | null;
}

/** Everything an on-submit hook needs about a submitted response. */
export interface FormResponseContext {
  response: mjBizAppsFormsFormResponseEntity;
  form: mjBizAppsFormsFormEntity;
  answers: AnswerWithType[];
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

  const answers = await loadAnswers(responseId, contextUser);
  return { response, form, answers };
}

async function loadAnswers(responseId: string, contextUser: UserInfo): Promise<AnswerWithType[]> {
  const rv = new RunView();
  const answerResult = await rv.RunView<mjBizAppsFormsFormResponseAnswerEntity>(
    {
      EntityName: ENTITY.FormResponseAnswer,
      ExtraFilter: `ResponseID='${responseId}'`,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!answerResult.Success || answerResult.Results.length === 0) {
    return [];
  }

  const questionsById = await loadQuestionsById(
    answerResult.Results.map((a) => a.QuestionID),
    contextUser,
  );

  return answerResult.Results.map((a) => {
    const q = questionsById.get(a.QuestionID);
    return {
      answerId: a.ID,
      questionId: a.QuestionID,
      questionType: q?.QuestionType ?? 'ShortText',
      prompt: q?.Prompt ?? '',
      textValue: a.TextValue,
      numericValue: a.NumericValue,
      booleanValue: a.BooleanValue,
      jsonValue: a.JSONValue,
    };
  });
}

async function loadQuestionsById(
  questionIds: string[],
  contextUser: UserInfo,
): Promise<Map<string, mjBizAppsFormsFormQuestionEntity>> {
  const map = new Map<string, mjBizAppsFormsFormQuestionEntity>();
  const unique = Array.from(new Set(questionIds));
  if (unique.length === 0) {
    return map;
  }
  const inList = unique.map((id) => `'${id}'`).join(',');
  const rv = new RunView();
  const result = await rv.RunView<mjBizAppsFormsFormQuestionEntity>(
    {
      EntityName: ENTITY.FormQuestion,
      ExtraFilter: `ID IN (${inList})`,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (result.Success) {
    for (const q of result.Results) {
      map.set(q.ID, q);
    }
  }
  return map;
}
