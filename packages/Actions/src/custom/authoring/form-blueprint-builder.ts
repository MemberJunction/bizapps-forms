/**
 * Deterministic Builder — persists a validated {@link FormBlueprint} into the live
 * `Form / FormPage / FormQuestion / FormQuestionOption` rows (plus a Draft
 * `FormVersion`). This is the code-agent half of the Designer→Builder split; it does
 * NO LLM work and NO guessing. Everything it writes comes straight from the blueprint
 * the Designer already validated against the §5.3 taxonomy.
 *
 * All entity I/O goes through `Metadata.GetEntityObject` with the context user, and
 * every `Save()` return value is checked (CLAUDE.md MJ patterns).
 */
import { Metadata } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormVersionEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
} from '@mj-biz-apps/forms-entities';
import { CHOICE_QUESTION_TYPES, type FormBlueprint, type BlueprintPage, type BlueprintQuestion } from './form-blueprint';

const ENTITY = {
  Form: 'MJ_BizApps_Forms: Forms',
  FormVersion: 'MJ_BizApps_Forms: Form Versions',
  FormPage: 'MJ_BizApps_Forms: Form Pages',
  FormQuestion: 'MJ_BizApps_Forms: Form Questions',
  FormQuestionOption: 'MJ_BizApps_Forms: Form Question Options',
} as const;

/** What the builder created — surfaced back to the calling action's output params. */
export interface BuiltFormResult {
  formId: string;
  formVersionId: string;
  pageCount: number;
  questionCount: number;
  optionCount: number;
}

/** Raised with a clear message when a `Save()` returns false. */
export class FormPersistError extends Error {}

/**
 * Persist a blueprint as a brand-new Draft form. Returns the created ids/counts.
 * Throws {@link FormPersistError} on any failed Save so the caller maps it to a
 * failed action result (rather than half-writing silently).
 */
export async function buildFormFromBlueprint(
  blueprint: FormBlueprint,
  contextUser: UserInfo,
  ownerUserId?: string,
): Promise<BuiltFormResult> {
  const md = new Metadata();
  const form = await createForm(md, blueprint, contextUser, ownerUserId);
  const version = await createDraftVersion(md, form.ID, contextUser);

  let questionCount = 0;
  let optionCount = 0;
  for (let pageIndex = 0; pageIndex < blueprint.pages.length; pageIndex++) {
    const page = await createPage(md, form.ID, blueprint.pages[pageIndex], pageIndex, contextUser);
    const counts = await createQuestionsForPage(md, form.ID, page.ID, blueprint.pages[pageIndex], contextUser);
    questionCount += counts.questions;
    optionCount += counts.options;
  }

  return {
    formId: form.ID,
    formVersionId: version.ID,
    pageCount: blueprint.pages.length,
    questionCount,
    optionCount,
  };
}

async function createForm(
  md: Metadata,
  blueprint: FormBlueprint,
  contextUser: UserInfo,
  ownerUserId?: string,
): Promise<mjBizAppsFormsFormEntity> {
  const form = await md.GetEntityObject<mjBizAppsFormsFormEntity>(ENTITY.Form, contextUser);
  form.NewRecord();
  form.Name = blueprint.name;
  if (blueprint.description) {
    form.Description = blueprint.description;
  }
  form.Status = 'Draft';
  form.RenderMode = blueprint.renderMode ?? 'Scroll';
  if (ownerUserId) {
    form.OwnerUserID = ownerUserId;
  }
  form.Settings = buildFormSettingsJSON(blueprint);
  await save(form, 'Form');
  return form;
}

/** Build the `Form.Settings` JSON (matches the contract's `FormSettings` shape). */
function buildFormSettingsJSON(blueprint: FormBlueprint): string {
  const settings: Record<string, string | boolean> = {
    anonymousAllowed: true,
    captchaRequired: false,
  };
  if (blueprint.confirmationMessage) {
    settings.confirmationMessage = blueprint.confirmationMessage;
  }
  return JSON.stringify(settings);
}

async function createDraftVersion(
  md: Metadata,
  formId: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormVersionEntity> {
  const version = await md.GetEntityObject<mjBizAppsFormsFormVersionEntity>(ENTITY.FormVersion, contextUser);
  version.NewRecord();
  version.FormID = formId;
  version.VersionNumber = 1;
  version.Status = 'Draft';
  await save(version, 'FormVersion');
  return version;
}

async function createPage(
  md: Metadata,
  formId: string,
  page: BlueprintPage,
  index: number,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormPageEntity> {
  const pageEntity = await md.GetEntityObject<mjBizAppsFormsFormPageEntity>(ENTITY.FormPage, contextUser);
  pageEntity.NewRecord();
  pageEntity.FormID = formId;
  if (page.title) {
    pageEntity.Title = page.title;
  }
  if (page.description) {
    pageEntity.Description = page.description;
  }
  pageEntity.DisplayOrder = index;
  await save(pageEntity, 'FormPage');
  return pageEntity;
}

async function createQuestionsForPage(
  md: Metadata,
  formId: string,
  pageId: string,
  page: BlueprintPage,
  contextUser: UserInfo,
): Promise<{ questions: number; options: number }> {
  let optionCount = 0;
  for (let i = 0; i < page.questions.length; i++) {
    const question = await createQuestion(md, formId, pageId, page.questions[i], i, contextUser);
    optionCount += await createOptions(md, question.ID, page.questions[i], contextUser);
  }
  return { questions: page.questions.length, options: optionCount };
}

async function createQuestion(
  md: Metadata,
  formId: string,
  pageId: string,
  question: BlueprintQuestion,
  index: number,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormQuestionEntity> {
  const q = await md.GetEntityObject<mjBizAppsFormsFormQuestionEntity>(ENTITY.FormQuestion, contextUser);
  q.NewRecord();
  q.FormID = formId;
  q.PageID = pageId;
  q.QuestionType = question.type;
  q.Prompt = question.prompt;
  if (question.helpText) {
    q.HelpText = question.helpText;
  }
  q.IsRequired = question.isRequired ?? false;
  q.DisplayOrder = index;
  if (question.settings && Object.keys(question.settings).length > 0) {
    q.Settings = JSON.stringify(question.settings);
  }
  await save(q, 'FormQuestion');
  return q;
}

/**
 * Create options for choice-style questions only. Non-choice questions never get
 * options even if the Designer mistakenly supplied them (defensive — the blueprint
 * is validated for shape, but type/option coherence is enforced here).
 */
async function createOptions(
  md: Metadata,
  questionId: string,
  question: BlueprintQuestion,
  contextUser: UserInfo,
): Promise<number> {
  if (!CHOICE_QUESTION_TYPES.has(question.type) || !question.options?.length) {
    return 0;
  }
  let count = 0;
  for (let i = 0; i < question.options.length; i++) {
    const opt = question.options[i];
    const optEntity = await md.GetEntityObject<mjBizAppsFormsFormQuestionOptionEntity>(
      ENTITY.FormQuestionOption,
      contextUser,
    );
    optEntity.NewRecord();
    optEntity.QuestionID = questionId;
    optEntity.Label = opt.label;
    optEntity.Value = opt.value ?? opt.label;
    optEntity.DisplayOrder = i;
    optEntity.IsDefault = opt.isDefault ?? false;
    await save(optEntity, 'FormQuestionOption');
    count++;
  }
  return count;
}

/** Save and throw a descriptive {@link FormPersistError} on failure. */
async function save(
  entity: mjBizAppsFormsFormEntity
    | mjBizAppsFormsFormVersionEntity
    | mjBizAppsFormsFormPageEntity
    | mjBizAppsFormsFormQuestionEntity
    | mjBizAppsFormsFormQuestionOptionEntity,
  label: string,
): Promise<void> {
  const ok = await entity.Save();
  if (!ok) {
    const detail = entity.LatestResult?.Message ?? 'unknown error';
    throw new FormPersistError(`Failed to save ${label}: ${detail}`);
  }
}
