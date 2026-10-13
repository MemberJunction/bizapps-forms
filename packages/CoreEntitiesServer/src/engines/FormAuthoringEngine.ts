/**
 * `FormAuthoringEngine` — server-side form authoring (spec #303 §4).
 *
 * Today: {@link FormAuthoringEngine.BuildFromBlueprint}, the deterministic Builder half of the AI
 * Designer→Builder split, moved here from forms-actions so the two authoring Actions, the template
 * operation and anything else that authors a form share one implementation. Clone, template
 * instantiation, archive and restore join it in later #303 tasks.
 *
 * It does NO LLM work and NO guessing: everything it writes comes from a blueprint that passes
 * `formBlueprintSchema`, checked again here because this is the boundary every blueprint crosses.
 */
import { LogError, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import {
  blueprintOnSubmitMode,
  CHOICE_QUESTION_TYPES,
  formBlueprintSchema,
  quoteSqlString,
  type BlueprintPage,
  type BlueprintQuestion,
  type FormBlueprint,
  type FormSettings,
  type mjBizAppsFormsFormAutomationEntity,
  type mjBizAppsFormsFormEntity,
  type mjBizAppsFormsFormPageEntity,
  type mjBizAppsFormsFormQuestionEntity,
  type mjBizAppsFormsFormQuestionOptionEntity,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { FormPublishingEngine, type FormPublishResult } from './FormPublishingEngine.js';
import { requireEntityTransactions, runEngineUnitOfWork, saveFailure } from './engine-guards.js';

const ENTITY = { ...FORMS_ENTITY, Action: 'MJ: Actions' } as const;

/** How to build. */
export interface BuildFromBlueprintOptions {
  /** Stamped on the created form. */
  ownerUserId?: string;
  /**
   * Publish the built form in the SAME transaction: the caller gets a published form or nothing,
   * so a refused publish never strands a draft the caller then re-creates on retry.
   */
  publishImmediately?: boolean;
}

/** What a build created. */
export interface BuiltForm {
  formId: string;
  pageCount: number;
  questionCount: number;
  optionCount: number;
  /** On-submit steps written from the blueprint; 0 when it authored none. */
  automationCount: number;
  /** The publish, when `publishImmediately` asked for one; `null` otherwise. */
  published: FormPublishResult | null;
}

/** A build that did not happen: a blueprint the schema rejects, an Action that cannot be resolved, a failed save. */
export class FormAuthoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormAuthoringError';
  }
}

type AuthoredEntity =
  | mjBizAppsFormsFormEntity
  | mjBizAppsFormsFormPageEntity
  | mjBizAppsFormsFormQuestionEntity
  | mjBizAppsFormsFormQuestionOptionEntity
  | mjBizAppsFormsFormAutomationEntity;

export class FormAuthoringEngine extends BaseSingleton<FormAuthoringEngine> {
  public static get Instance(): FormAuthoringEngine {
    return super.getInstance<FormAuthoringEngine>();
  }

  /**
   * Persist a blueprint as a brand-new Draft form — and publish it, when asked — in one transaction.
   *
   * Throws {@link FormAuthoringError} for a blueprint it refuses or a row it cannot write, and
   * `FormPublishError` for a publish the publishing engine refuses; either way nothing is left
   * behind. A failure is logged once, with the form name and the user (`runEngineUnitOfWork`).
   */
  public async BuildFromBlueprint(
    blueprint: FormBlueprint,
    provider: DatabaseProviderBase,
    user: UserInfo,
    options: BuildFromBlueprintOptions = {},
  ): Promise<BuiltForm> {
    if (!user) {
      throw new FormAuthoringError('Building a form from a blueprint needs the acting user; none was given.');
    }
    const valid = formBlueprintSchema.safeParse(blueprint);
    if (!valid.success) {
      const issues = valid.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      throw new FormAuthoringError(`The blueprint cannot be built: ${issues}`);
    }
    requireEntityTransactions(provider, `Building form "${valid.data.name}"`);
    const context = `[FormAuthoringEngine] form "${valid.data.name}" was not built (user ${user.ID})`;
    // Resolved BEFORE the transaction opens. Inside one transaction a late failure would roll the
    // form back anyway, so this is no longer what keeps a half-built form out of the database —
    // but a blueprint naming an Action this host lacks is a refusal, and refusing before the first
    // write means a refusal never opens (and rolls back) a transaction at all.
    let actionIdByName: Map<string, string>;
    try {
      actionIdByName = await this.resolveActionIds(valid.data, provider, user);
    } catch (err) {
      LogError(`${context}: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
    return runEngineUnitOfWork(provider, context, async () => {
      const built = await this.writeBlueprint(valid.data, actionIdByName, provider, user, options.ownerUserId);
      const published = options.publishImmediately
        ? await FormPublishingEngine.Instance.Publish(built.formId, provider, user)
        : null;
      return { ...built, published };
    });
  }

  private async writeBlueprint(
    blueprint: FormBlueprint,
    actionIdByName: ReadonlyMap<string, string>,
    provider: DatabaseProviderBase,
    user: UserInfo,
    ownerUserId: string | undefined,
  ): Promise<Omit<BuiltForm, 'published'>> {
    const form = await this.createForm(blueprint, provider, user, ownerUserId);
    let questionCount = 0;
    let optionCount = 0;
    for (let pageIndex = 0; pageIndex < blueprint.pages.length; pageIndex++) {
      const page = blueprint.pages[pageIndex];
      const pageId = await this.createPage(form.ID, page, pageIndex, provider, user);
      for (let questionIndex = 0; questionIndex < page.questions.length; questionIndex++) {
        const question = page.questions[questionIndex];
        const questionId = await this.createQuestion(form.ID, pageId, question, questionIndex, provider, user);
        optionCount += await this.createOptions(questionId, question, provider, user);
      }
      questionCount += page.questions.length;
    }
    const automationCount = await this.createAutomations(form.ID, blueprint, actionIdByName, provider, user);
    return { formId: form.ID, pageCount: blueprint.pages.length, questionCount, optionCount, automationCount };
  }

  /**
   * Map the named Actions to their ids in THIS deployment, or throw naming what is missing.
   *
   * Action ids differ per environment, so a blueprint can only travel by name. The read is scoped
   * to the names asked for: an unfiltered read of the Action catalogue would work and would quietly
   * become a full-table scan on every authored form. No steps authored: nothing is read.
   */
  private async resolveActionIds(blueprint: FormBlueprint, provider: DatabaseProviderBase, user: UserInfo): Promise<Map<string, string>> {
    const wanted = [...new Set((blueprint.automations ?? []).map((a) => a.actionName))];
    if (wanted.length === 0) {
      return new Map();
    }
    const result = await provider.RunView<{ ID: string; Name: string }>(
      {
        EntityName: ENTITY.Action,
        ExtraFilter: `Name IN (${wanted.map(quoteSqlString).join(',')})`,
        Fields: ['ID', 'Name'],
        ResultType: 'simple',
        BypassCache: true,
      },
      user,
    );
    if (!result.Success) {
      throw new FormAuthoringError(
        `Could not read the Action catalogue to resolve this form's on-submit steps: ${result.ErrorMessage || 'unknown error'}`,
      );
    }
    const byName = new Map((result.Results ?? []).map((a) => [a.Name, a.ID]));
    const missing = wanted.filter((n) => !byName.has(n));
    if (missing.length > 0) {
      throw new FormAuthoringError(
        `This deployment has no Action named ${missing.map((n) => `"${n}"`).join(', ')}, so the form was not created.`,
      );
    }
    return byName;
  }

  private async createForm(
    blueprint: FormBlueprint,
    provider: DatabaseProviderBase,
    user: UserInfo,
    ownerUserId: string | undefined,
  ): Promise<mjBizAppsFormsFormEntity> {
    const form = await provider.GetEntityObject<mjBizAppsFormsFormEntity>(ENTITY.Form, user);
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
    form.Settings = JSON.stringify(blueprintSettings(blueprint));
    await save(form, 'Form');
    return form;
  }

  private async createPage(
    formId: string,
    page: BlueprintPage,
    index: number,
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): Promise<string> {
    const entity = await provider.GetEntityObject<mjBizAppsFormsFormPageEntity>(ENTITY.FormPage, user);
    entity.NewRecord();
    entity.FormID = formId;
    if (page.title) {
      entity.Title = page.title;
    }
    if (page.description) {
      entity.Description = page.description;
    }
    entity.DisplayOrder = index;
    await save(entity, 'FormPage');
    return entity.ID;
  }

  private async createQuestion(
    formId: string,
    pageId: string,
    question: BlueprintQuestion,
    index: number,
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): Promise<string> {
    const entity = await provider.GetEntityObject<mjBizAppsFormsFormQuestionEntity>(ENTITY.FormQuestion, user);
    entity.NewRecord();
    entity.FormID = formId;
    entity.PageID = pageId;
    entity.QuestionType = question.type;
    entity.Prompt = question.prompt;
    if (question.helpText) {
      entity.HelpText = question.helpText;
    }
    entity.IsRequired = question.isRequired ?? false;
    entity.DisplayOrder = index;
    if (question.settings && Object.keys(question.settings).length > 0) {
      entity.Settings = JSON.stringify(question.settings);
    }
    await save(entity, 'FormQuestion');
    return entity.ID;
  }

  /**
   * Options for choice-style questions only. A non-choice question never gets options even if the
   * Designer supplied them: the blueprint schema checks shape, and type/option coherence is
   * enforced here.
   */
  private async createOptions(
    questionId: string,
    question: BlueprintQuestion,
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): Promise<number> {
    if (!CHOICE_QUESTION_TYPES.has(question.type) || !question.options?.length) {
      return 0;
    }
    for (let i = 0; i < question.options.length; i++) {
      const option = question.options[i];
      const entity = await provider.GetEntityObject<mjBizAppsFormsFormQuestionOptionEntity>(ENTITY.FormQuestionOption, user);
      entity.NewRecord();
      entity.QuestionID = questionId;
      entity.Label = option.label;
      entity.Value = option.value ?? option.label;
      entity.DisplayOrder = i;
      entity.IsDefault = option.isDefault ?? false;
      if (option.imageURL) {
        entity.ImageURL = option.imageURL;
      }
      if (option.matrixAxis) {
        entity.MatrixAxis = option.matrixAxis;
      }
      await save(entity, 'FormQuestionOption');
    }
    return question.options.length;
  }

  /** The blueprint's on-submit steps, in authored order. Returns how many rows were written. */
  private async createAutomations(
    formId: string,
    blueprint: FormBlueprint,
    actionIdByName: ReadonlyMap<string, string>,
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): Promise<number> {
    const authored = blueprint.automations ?? [];
    for (let index = 0; index < authored.length; index++) {
      const step = authored[index];
      const actionId = actionIdByName.get(step.actionName);
      if (!actionId) {
        // Unreachable when resolveActionIds ran over this blueprint; a postcondition, not a branch.
        throw new FormAuthoringError(`On-submit step "${step.actionName}" was not resolved to an Action.`);
      }
      const automation = await provider.GetEntityObject<mjBizAppsFormsFormAutomationEntity>(ENTITY.FormAutomation, user);
      automation.NewRecord();
      automation.FormID = formId;
      automation.Name = step.actionName;
      automation.TargetType = 'Action';
      automation.ActionID = actionId;
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
}

/** The `Form.Settings` a blueprint builds (the contract's `FormSettings` shape). */
function blueprintSettings(blueprint: FormBlueprint): FormSettings {
  const settings: FormSettings = { anonymousAllowed: true, captchaRequired: false };
  if (blueprint.confirmationMessage) {
    settings.confirmationMessage = blueprint.confirmationMessage;
  }
  // Only when the blueprint actually says something. An absent mode is what every form authored
  // before this carried, and it is what keeps the server inferring dispatch exactly as it did.
  const mode = blueprintOnSubmitMode(blueprint);
  if (mode) {
    settings.onSubmitMode = mode;
  }
  return settings;
}

/** Save, or throw naming the row and MJ's reason — which rolls the build back. */
async function save(entity: AuthoredEntity, label: string): Promise<void> {
  if (!(await entity.Save())) {
    throw new FormAuthoringError(`Failed to save ${label}: ${saveFailure(entity)}`);
  }
}
