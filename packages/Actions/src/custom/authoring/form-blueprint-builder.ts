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
import { Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormVersionEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  mjBizAppsFormsFormAutomationEntity,
  type FormSettings,
} from '@mj-biz-apps/forms-entities';
import {
  blueprintOnSubmitMode,
  CHOICE_QUESTION_TYPES,
  type FormBlueprint,
  type BlueprintPage,
  type BlueprintQuestion,
} from './form-blueprint';

const ENTITY = {
  Form: 'MJ_BizApps_Forms: Forms',
  FormVersion: 'MJ_BizApps_Forms: Form Versions',
  FormPage: 'MJ_BizApps_Forms: Form Pages',
  FormQuestion: 'MJ_BizApps_Forms: Form Questions',
  FormQuestionOption: 'MJ_BizApps_Forms: Form Question Options',
  FormAutomation: 'MJ_BizApps_Forms: Form Automations',
} as const;

/** What the builder created — surfaced back to the calling action's output params. */
export interface BuiltFormResult {
  formId: string;
  formVersionId: string;
  pageCount: number;
  questionCount: number;
  optionCount: number;
  /** On-submit steps written from the blueprint; 0 when it authored none. */
  automationCount: number;
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

  // BEFORE anything is written. Resolving names here rather than inside `createAutomations` is the
  // whole difference between a refusal and a half-built form: the Form row carries
  // `onSubmitMode: 'Configured'` in its settings, so a resolve that fails after it is saved leaves
  // a draft that is marked authoritative with zero automations — publish that and nothing runs at
  // all, neither configured steps nor the legacy fallback. There is no transaction spanning these
  // saves, so ordering is the only thing that can prevent it.
  const actionIdByName = await resolveActionIds(
    (blueprint.automations ?? []).map((a) => a.actionName),
    contextUser,
  );

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

  const automationCount = await createAutomations(md, form.ID, blueprint, actionIdByName, contextUser);

  return {
    formId: form.ID,
    formVersionId: version.ID,
    pageCount: blueprint.pages.length,
    questionCount,
    optionCount,
    automationCount,
  };
}

/**
 * Persist the blueprint's on-submit steps, resolving each Action BY NAME.
 *
 * Takes the already-resolved name→id map rather than resolving here, because resolution must
 * happen before the Form row exists — see {@link buildFormFromBlueprint}. By the time this runs,
 * every authored name is known to be resolvable, so it cannot write a partial set.
 *
 * Returns the number of rows written (0 when the blueprint authors none).
 */
async function createAutomations(
  md: Metadata,
  formId: string,
  blueprint: FormBlueprint,
  actionIdByName: ReadonlyMap<string, string>,
  contextUser: UserInfo,
): Promise<number> {
  const authored = blueprint.automations ?? [];
  if (authored.length === 0) {
    return 0;
  }

  for (let index = 0; index < authored.length; index++) {
    const step = authored[index];
    const automation = await md.GetEntityObject<mjBizAppsFormsFormAutomationEntity>(
      ENTITY.FormAutomation,
      contextUser,
    );
    automation.NewRecord();
    automation.FormID = formId;
    automation.Name = step.actionName;
    automation.TargetType = 'Action';
    automation.ActionID = actionIdByName.get(step.actionName) as string;
    // The legacy runner's behaviour is the default: fire on a completed submission only, one after
    // another, logging a failure and continuing. A partial autosave firing a confirmation email on
    // every keystroke is what the other trigger values cost if defaulted differently.
    automation.Trigger = step.trigger ?? 'OnComplete';
    automation.ExecutionMode = step.executionMode ?? 'Sync';
    automation.DisplayOrder = index + 1;
    automation.ContinueOnError = step.continueOnError ?? true;
    automation.IsActive = step.isActive ?? true;
    await save(automation, 'FormAutomation');
  }
  return authored.length;
}

/**
 * Map the named Actions to their ids in THIS deployment, or throw naming what is missing.
 *
 * Action ids differ per environment, so a blueprint can only travel by name. The read is scoped to
 * the names asked for: an unfiltered read of the Action catalogue would work and would quietly
 * become a full-table scan on every authored form.
 */
async function resolveActionIds(
  names: readonly string[],
  contextUser: UserInfo,
): Promise<Map<string, string>> {
  const wanted = [...new Set(names)];
  if (wanted.length === 0) {
    // No steps authored: read nothing. Called unconditionally now that it runs before the Form is
    // created, so this is what keeps an ordinary form from querying the Action catalogue at all.
    return new Map();
  }
  const filter = wanted.map((n) => `Name='${n.replace(/'/g, "''")}'`).join(' OR ');
  const result = await new RunView().RunView<{ ID: string; Name: string }>(
    {
      EntityName: 'MJ: Actions',
      ExtraFilter: filter,
      Fields: ['ID', 'Name'],
      ResultType: 'simple',
    },
    contextUser,
  );
  if (!result.Success) {
    throw new FormPersistError(
      `Could not read the Action catalogue to resolve this form's on-submit steps: ${result.ErrorMessage ?? 'unknown error'}`,
    );
  }

  const byName = new Map((result.Results ?? []).map((a) => [a.Name, a.ID]));
  const missing = wanted.filter((n) => !byName.has(n));
  if (missing.length > 0) {
    throw new FormPersistError(
      `This deployment has no Action named ${missing.map((n) => `"${n}"`).join(', ')}, so the form's on-submit steps were not written.`,
    );
  }
  return byName;
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
  const settings: FormSettings = {
    anonymousAllowed: true,
    captchaRequired: false,
  };
  if (blueprint.confirmationMessage) {
    settings.confirmationMessage = blueprint.confirmationMessage;
  }
  // Only when the blueprint actually says something. An absent mode is what every form authored
  // before this carried, and it is what keeps the server inferring dispatch exactly as it did.
  const mode = blueprintOnSubmitMode(blueprint);
  if (mode) {
    settings.onSubmitMode = mode;
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
    if (opt.imageURL) {
      optEntity.ImageURL = opt.imageURL;
    }
    if (opt.matrixAxis) {
      optEntity.MatrixAxis = opt.matrixAxis;
    }
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
    | mjBizAppsFormsFormQuestionOptionEntity
    | mjBizAppsFormsFormAutomationEntity,
  label: string,
): Promise<void> {
  const ok = await entity.Save();
  if (!ok) {
    const detail = entity.LatestResult?.Message ?? 'unknown error';
    throw new FormPersistError(`Failed to save ${label}: ${detail}`);
  }
}
