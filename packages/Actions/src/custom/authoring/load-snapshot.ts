/**
 * Reading a form back OUT, as the assistant sees it.
 *
 * The reverse of the authoring pipeline: that turns a brief into rows, this turns rows into
 * something a model can reason about and point at. It is what makes editing an existing form
 * possible at all — a model cannot change what it cannot address.
 *
 * ── ONE BATCH, NOT A WALK. ───────────────────────────────────────────────────────────────────
 * Six reads issued together rather than a query per page and another per question. A twelve-page
 * form would otherwise cost twenty-five round trips on EVERY chat turn, and the whole point of
 * this being cheap is that it ships with every message.
 */
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  buildFormList,
  buildFormSnapshot,
  isGuid,
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormStyleEntity,
  type FormListEntry,
  type FormSnapshot,
} from '@mj-biz-apps/forms-entities';
import { errorText } from '../shared/error-text';

const ENTITY = {
  page: 'MJ_BizApps_Forms: Form Pages',
  question: 'MJ_BizApps_Forms: Form Questions',
  option: 'MJ_BizApps_Forms: Form Question Options',
  screen: 'MJ_BizApps_Forms: Form Screens',
  response: 'MJ_BizApps_Forms: Form Responses',
  answer: 'MJ_BizApps_Forms: Form Response Answers',
} as const;

/** The form with handles minted, or `undefined` when it cannot be read. */
export async function loadFormSnapshot(
  formId: string,
  contextUser: UserInfo,
): Promise<FormSnapshot | undefined> {
  if (!isGuid(formId)) {
    return undefined;
  }
  try {
    const md = new Metadata();
    const form = await md.GetEntityObject<mjBizAppsFormsFormEntity>(
      'MJ_BizApps_Forms: Forms',
      contextUser,
    );
    if (!(await form.Load(formId))) {
      return undefined;
    }

    const rv = new RunView();
    const filter = `FormID='${formId}'`;
    const [pages, questions, screens, responses] = await rv.RunViews(
      [
        { EntityName: ENTITY.page, ExtraFilter: filter, OrderBy: 'DisplayOrder', ResultType: 'simple', Fields: ['ID', 'Title'] },
        { EntityName: ENTITY.question, ExtraFilter: filter, OrderBy: 'DisplayOrder', ResultType: 'simple', Fields: ['ID', 'PageID', 'QuestionType', 'Prompt', 'IsRequired'] },
        { EntityName: ENTITY.screen, ExtraFilter: filter, OrderBy: 'DisplayOrder', ResultType: 'simple', Fields: ['ID', 'ScreenType', 'Title', 'ConditionalRule'] },
        { EntityName: ENTITY.response, ExtraFilter: filter, ResultType: 'simple', Fields: ['ID'] },
      ],
      contextUser,
    );
    for (const [name, view] of [['pages', pages], ['questions', questions], ['screens', screens], ['responses', responses]] as const) {
      if (!view.Success) {
        LogError(`[Forms snapshot] Could not read ${name} for form ${formId}: ${view.ErrorMessage}`);
        return undefined;
      }
    }

    const questionRows = (questions.Results ?? []) as Array<{
      ID: string; PageID: string; QuestionType: string; Prompt: string; IsRequired: boolean;
    }>;
    const [options, answers] = await Promise.all([
      readOptions(questionRows.map((q) => q.ID), contextUser),
      readAnswerCounts(questionRows.map((q) => q.ID), contextUser),
    ]);

    const pageRows = (pages.Results ?? []) as Array<{ ID: string; Title: string | null }>;
    const screenRows = (screens.Results ?? []) as Array<{ ID: string; ScreenType: string; Title: string | null; ConditionalRule: string | null }>;

    return buildFormSnapshot({
      formId,
      name: form.Name,
      status: form.Status ?? 'Draft',
      responseCount: (responses.Results ?? []).length,
      cssVariables: await readStyleTokens(form.StyleID, contextUser),
      pages: pageRows.map((page) => ({
        id: page.ID,
        ...(page.Title ? { title: page.Title } : {}),
        questions: questionRows
          .filter((q) => q.PageID === page.ID)
          .map((q) => ({
            id: q.ID,
            type: q.QuestionType,
            prompt: q.Prompt,
            isRequired: Boolean(q.IsRequired),
            answerCount: answers.get(q.ID) ?? 0,
            options: options.get(q.ID) ?? [],
          })),
      })),
      screens: screenRows.map((screen) => ({
        id: screen.ID,
        role: screen.ScreenType === 'Welcome' ? 'welcome' : 'ending',
        ...(screen.Title ? { title: screen.Title } : {}),
        // An ending with no rule is the fallback everybody reaches; one with a rule is a branch.
        isDefault: screen.ScreenType !== 'Welcome' && !screen.ConditionalRule,
      })),
    });
  } catch (error) {
    LogError(`[Forms snapshot] Could not read form ${formId}: ${errorText(error)}`);
    return undefined;
  }
}

/** Options by question id. */
async function readOptions(
  questionIds: readonly string[],
  contextUser: UserInfo,
): Promise<Map<string, Array<{ id: string; label: string }>>> {
  const byQuestion = new Map<string, Array<{ id: string; label: string }>>();
  if (questionIds.length === 0) {
    return byQuestion;
  }
  const view = await new RunView().RunView<{ ID: string; QuestionID: string; Label: string }>(
    {
      EntityName: ENTITY.option,
      ExtraFilter: `QuestionID IN (${questionIds.map((id) => `'${id}'`).join(',')})`,
      OrderBy: 'DisplayOrder',
      ResultType: 'simple',
      Fields: ['ID', 'QuestionID', 'Label'],
    },
    contextUser,
  );
  if (!view.Success) {
    LogError(`[Forms snapshot] Could not read options: ${view.ErrorMessage}`);
    return byQuestion;
  }
  for (const row of view.Results ?? []) {
    const list = byQuestion.get(row.QuestionID) ?? [];
    list.push({ id: row.ID, label: row.Label });
    byQuestion.set(row.QuestionID, list);
  }
  return byQuestion;
}

/**
 * How many answers each question already holds.
 *
 * PER QUESTION, not per form. A form-wide count would refuse to delete a question nobody has
 * reached on a busy form, and permit deleting an answered one on a quiet form — wrong in both
 * directions, and the gate turns entirely on this number.
 */
async function readAnswerCounts(
  questionIds: readonly string[],
  contextUser: UserInfo,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (questionIds.length === 0) {
    return counts;
  }
  const view = await new RunView().RunView<{ QuestionID: string }>(
    {
      EntityName: ENTITY.answer,
      ExtraFilter: `QuestionID IN (${questionIds.map((id) => `'${id}'`).join(',')})`,
      ResultType: 'simple',
      Fields: ['QuestionID'],
    },
    contextUser,
  );
  if (!view.Success) {
    // Fail CLOSED: an unknown count must not read as zero, or a failed query becomes permission to
    // delete answered questions. Every question is treated as answered until proven otherwise.
    LogError(`[Forms snapshot] Could not count answers; treating every question as answered: ${view.ErrorMessage}`);
    for (const id of questionIds) {
      counts.set(id, Number.MAX_SAFE_INTEGER);
    }
    return counts;
  }
  for (const row of view.Results ?? []) {
    counts.set(row.QuestionID, (counts.get(row.QuestionID) ?? 0) + 1);
  }
  return counts;
}

/** A style's `--mjf-*` tokens, or an empty map. */
async function readStyleTokens(
  styleId: string | null,
  contextUser: UserInfo,
): Promise<Record<string, string>> {
  if (!styleId) {
    return {};
  }
  const style = await new Metadata().GetEntityObject<mjBizAppsFormsFormStyleEntity>(
    'MJ_BizApps_Forms: Form Styles',
    contextUser,
  );
  if (!(await style.Load(styleId)) || !style.CSSVariables) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(style.CSSVariables);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch (error) {
    LogError(`[Forms snapshot] Style ${styleId} has unreadable tokens: ${errorText(error)}`);
    return {};
  }
}

/**
 * The author's forms, newest first, with handles.
 *
 * Capped: the list ships on every turn alongside the open form's snapshot and ten turns of
 * history, and an author with four hundred forms would spend the whole context window on a list
 * they asked about once. Twenty-five is more than anyone names from memory.
 */
export const MAX_LISTED_FORMS = 25;

export async function loadFormList(contextUser: UserInfo): Promise<FormListEntry[]> {
  const view = await new RunView().RunView<{ ID: string; Name: string; Status: string }>(
    {
      EntityName: 'MJ_BizApps_Forms: Forms',
      ExtraFilter: 'IsArchived = 0',
      OrderBy: '__mj_UpdatedAt DESC',
      ResultType: 'simple',
      Fields: ['ID', 'Name', 'Status'],
      MaxRows: MAX_LISTED_FORMS,
    },
    contextUser,
  );
  if (!view.Success) {
    // Degraded, not fatal: an assistant that cannot list forms can still answer and still edit the
    // one on screen. Only "what forms do I have" stops working.
    LogError(`[Forms snapshot] Could not list forms: ${view.ErrorMessage}`);
    return [];
  }
  return buildFormList(
    (view.Results ?? []).map((f) => ({ id: f.ID, name: f.Name, status: f.Status ?? 'Draft' })),
  );
}
