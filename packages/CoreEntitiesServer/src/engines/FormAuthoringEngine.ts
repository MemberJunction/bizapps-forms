/**
 * `FormAuthoringEngine` — server-side form authoring (spec #303 §4). Every verb is one unit of work
 * (`runEngineUnitOfWork`): it lands whole or not at all, and a failure is logged once with what was
 * being attempted, for whom.
 *
 *  - {@link FormAuthoringEngine.BuildFromBlueprint} — the deterministic Builder half of the AI
 *    Designer→Builder split, shared by the two authoring Actions and the starter templates.
 *  - {@link FormAuthoringEngine.Clone} — the deep copy (`form-clone.ts`): form → form, form →
 *    template ("save as template", name checked here), template → form.
 *  - {@link FormAuthoringEngine.CreateFromTemplate} — a saved template (a clone) or a starter
 *    blueprint (a build).
 *  - {@link FormAuthoringEngine.Archive} / {@link FormAuthoringEngine.Restore} — `Form.Status`
 *    moves the engine decides and `FormEntityServer` enforces (`form-status-rules.ts`).
 *
 * It does NO LLM work and NO guessing: a blueprint must pass `formBlueprintSchema`, checked again
 * here because this is the boundary every blueprint crosses.
 */
import { LogError, LogStatus, type BaseEntity, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
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
  type mjBizAppsFormsFormVersionEntityType,
} from '@mj-biz-apps/forms-entities';
import { FormEntityServer } from '../entities/FormEntityServer.js';
import type { FormStatus } from '../entities/form-status-rules.js';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { isGuid } from '../shared/guid.js';
import { FormAuthoringError, saveOrThrow } from './authoring-errors.js';
import { readSourceForm, writeCopy, type ClonedForm, type CopyPlan, type SourceForm } from './form-clone.js';
import { FormPublishingEngine, FormPublishError, type FormPublishResult } from './FormPublishingEngine.js';
import { getStarterTemplate, STARTER_TEMPLATES } from './starter-templates.js';
import { EngineTransactionFailure, requireEntityTransactions, requireServerEntity, runEngineUnitOfWork, saveFailure } from './engine-guards.js';

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

/** How to copy a form. */
export interface CloneFormOptions {
  /** `true` makes a template whose `TemplateSourceFormID` is the source; `false` a working Draft form. */
  asTemplate: boolean;
  /**
   * Name for the copy. Absent or blank: a form saved as a template keeps the form's name; anything
   * else — a working copy, or a template copied as a template — is "<name> (copy)".
   */
  name?: string;
  /** Description for the copy. Absent keeps the source's; `null` clears it. */
  description?: string | null;
}

/** Which template to start a form from: a saved one (a `Form` row) or a starter gallery key. */
export type TemplateSource = { templateFormId: string } | { templateKey: string };

/** What creating a form from a template produced. */
export interface FormFromTemplate {
  formId: string;
  /**
   * References a saved template's copy could not carry over (see `ClonedForm.warnings`); always
   * empty for a starter, whose blueprint names nothing by id.
   */
  warnings: string[];
}

/** A form's status after `Archive` or `Restore`. */
export interface FormLifecycleResult {
  formId: string;
  status: FormStatus;
}

/** What deleting a template removed with it. */
export interface DeletedTemplate {
  templateFormId: string;
  pageCount: number;
  questionCount: number;
  optionCount: number;
  screenCount: number;
  automationCount: number;
  bindingCount: number;
}

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
      actionIdByName = await callerSafeAuthoring(() => this.resolveActionIds(valid.data, provider, user));
    } catch (err) {
      LogError(`${context}: ${err instanceof FormAuthoringError ? err.logDetail ?? err.message : String(err)}`);
      throw err;
    }
    return runAuthoringUnitOfWork(provider, context, async () => {
      const built = await this.writeBlueprint(valid.data, actionIdByName, provider, user, options.ownerUserId);
      const published = options.publishImmediately
        ? await FormPublishingEngine.Instance.Publish(built.formId, provider, user)
        : null;
      return { ...built, published };
    });
  }

  /**
   * Copy a form's whole authored tree into a new Draft form — or, with `asTemplate`, into a
   * template whose `TemplateSourceFormID` is the source (the builder's "save as template") — in one
   * transaction. A template's name must differ (trimmed, any case) from every other template's.
   *
   * Throws {@link FormAuthoringError} for a source that does not exist, a taken template name, an
   * unreadable source or a failed write; nothing is left behind. References the copy could not
   * carry over come back as `warnings` (and are logged once, with the forms and the user).
   */
  public async Clone(
    sourceFormId: string,
    provider: DatabaseProviderBase,
    user: UserInfo,
    options: CloneFormOptions,
  ): Promise<ClonedForm> {
    const id = requireFormId(sourceFormId, 'copy');
    requireUser(user, `Copying form ${id}`);
    return this.copyInUnitOfWork(id, provider, user, { doing: `Copying form ${id}`, failed: `form ${id} was not copied` }, (source) =>
      this.clonePlan(source, options, provider, user),
    );
  }

  /**
   * The blueprint a starter gallery key (any case) expands to, renamed when `name` is given — or a
   * refusal naming the keys there are. A pure read, and the ONE place a key is looked up: the
   * operation (through {@link CreateFromTemplate}) and the `Forms: Create Form From Template` Action
   * both expand keys here, so they refuse an unknown key in the same words.
   */
  public GetStarterBlueprint(templateKey: string, name?: string): FormBlueprint {
    const key = templateKey?.trim() ?? '';
    const template = getStarterTemplate(key);
    if (!template) {
      const known = STARTER_TEMPLATES.map((t) => t.key).join(', ');
      throw new FormAuthoringError(`Unknown template key '${key}'. Known templates: ${known}.`);
    }
    const rename = name?.trim();
    return rename ? { ...template.blueprint, name: rename } : template.blueprint;
  }

  /**
   * A new Draft form from a template: a SAVED template is deep-copied (`Clone` into a working form,
   * named after the template unless `name` is given); a STARTER key is expanded through
   * {@link BuildFromBlueprint}, exactly as the `Forms: Create Form From Template` Action does. Either
   * way it is one transaction and the caller owns the result.
   */
  public async CreateFromTemplate(
    source: TemplateSource,
    provider: DatabaseProviderBase,
    user: UserInfo,
    options: { name?: string } = {},
  ): Promise<FormFromTemplate> {
    requireUser(user, 'Creating a form from a template');
    const name = options.name?.trim() || undefined;
    if ('templateKey' in source) {
      return this.createFromStarter(source.templateKey, provider, user, name);
    }
    return this.createFromSavedTemplate(source.templateFormId, provider, user, name);
  }

  /**
   * Archive a form: `Closed`, and — in the same transaction, by `FormEntityServer` — every Active
   * share link of it closed with it.
   *
   * Archiving an already-archived form closes any link still Active (one written before archive
   * closed links, or reopened since), so a retry repairs instead of doing nothing; with none, nothing
   * is written.
   */
  public async Archive(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<FormLifecycleResult> {
    const id = requireFormId(formId, 'archive');
    requireUser(user, `Archiving form ${id}`);
    requireEntityTransactions(provider, `Archiving form ${id}`);
    return runAuthoringUnitOfWork(provider, `[FormAuthoringEngine] form ${id} was not archived (user ${user.ID})`, async () => {
      const form = await loadForm(id, provider, user, 'archived');
      if (form.Status === 'Closed') {
        await closeStrayLinks(form);
      } else {
        await saveStatus(form, 'Closed', 'archive');
      }
      return { formId: form.ID, status: form.Status };
    });
  }

  /**
   * Restore an archived form to what its versions say it is: `Published` when it has a Published
   * version, else `Draft` — and a template always `Draft`, since it is never published. Its share
   * links stay closed: reopening one is its own decision. A form that is not archived is returned
   * as it is, with nothing written.
   *
   * The engine reads the version to CHOOSE the destination; `FormEntityServer` reads it again to
   * CHECK the choice, because it holds that rule for every writer, not just this one. Two reads of
   * one row, on purpose.
   */
  public async Restore(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<FormLifecycleResult> {
    const id = requireFormId(formId, 'restore');
    requireUser(user, `Restoring form ${id}`);
    requireEntityTransactions(provider, `Restoring form ${id}`);
    return runAuthoringUnitOfWork(provider, `[FormAuthoringEngine] form ${id} was not restored (user ${user.ID})`, async () => {
      const form = await loadForm(id, provider, user, 'restored');
      if (form.Status !== 'Closed') {
        return { formId: form.ID, status: form.Status };
      }
      const live = await hasPublishedVersion(form.ID, provider, user);
      await saveStatus(form, live && !form.IsTemplate ? 'Published' : 'Draft', 'restore');
      return { formId: form.ID, status: form.Status };
    });
  }

  /**
   * Permanently delete a saved template and everything under it, in ONE unit of work.
   *
   * DELETION IS REAL HERE, AND ONLY HERE. A working form is archived, never deleted: every child
   * table holds a plain FK to `Form(ID)` and a form that collected responses must keep them. A
   * template provably has none — `CK_Form_TemplateNotPublished` keeps it from being published, and
   * the public path serves only published versions — but the rule is re-checked on the row in front
   * of it rather than trusted, because the cost of being wrong is destroying someone's data: a form
   * that is not a template, or a template with any response, version or share link, is refused
   * before anything is deleted.
   *
   * Children go first, in FK order (options through their questions, then questions, automations
   * before the bindings they run, screens, pages), the template last. Every row is read with a
   * view, not `Load()`, so no generated collection is filled and each delete is that one row.
   * Moved from the browser (`shared/template-deletion.ts`, a transaction group) by fix round 1 of
   * #303 Task 10a.
   */
  public async DeleteTemplate(templateFormId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<DeletedTemplate> {
    const id = requireFormId(templateFormId, 'delete');
    requireUser(user, `Deleting template ${id}`);
    requireEntityTransactions(provider, `Deleting template ${id}`);
    return runAuthoringUnitOfWork(provider, `[FormAuthoringEngine] template ${id} was not deleted (user ${user.ID})`, async () => {
      const form = await loadForm(id, provider, user, 'deleted');
      if (!form.IsTemplate) {
        throw new FormAuthoringError(`"${form.Name}" is a form, not a template, and forms are archived rather than deleted.`);
      }
      await refuseAttachedRecords(form.ID, provider, user);
      const byForm = `FormID=${quoteSqlString(form.ID)}`;
      const questions = await rowsToDelete(ENTITY.FormQuestion, byForm, provider, user);
      const options = questions.length
        ? await rowsToDelete(ENTITY.FormQuestionOption, `QuestionID IN (${questions.map((q) => quoteSqlString(q.ID)).join(',')})`, provider, user)
        : [];
      const automations = await rowsToDelete(ENTITY.FormAutomation, byForm, provider, user);
      const bindings = await rowsToDelete(ENTITY.FormEntityBinding, byForm, provider, user);
      const screens = await rowsToDelete(ENTITY.FormScreen, byForm, provider, user);
      const pages = await rowsToDelete(ENTITY.FormPage, byForm, provider, user);
      for (const rows of [options, questions, automations, bindings, screens, pages]) {
        await deleteEach(rows, form.ID);
      }
      // Captured before the delete: a successful BaseEntity.Delete() resets the object to a fresh key.
      const templateFormIdDeleted = form.ID;
      if (!(await form.Delete())) {
        throw new FormAuthoringError(`Could not delete template ${form.ID}. Nothing was deleted.`, { fault: true, logDetail: saveFailure(form) });
      }
      return {
        templateFormId: templateFormIdDeleted,
        pageCount: pages.length,
        questionCount: questions.length,
        optionCount: options.length,
        screenCount: screens.length,
        automationCount: automations.length,
        bindingCount: bindings.length,
      };
    });
  }

  /** The copy's root row: its name (checked, for a template), description and kind. */
  private async clonePlan(source: SourceForm, options: CloneFormOptions, provider: DatabaseProviderBase, user: UserInfo): Promise<CopyPlan> {
    const name = options.name?.trim() || derivedCopyName(source.form, options.asTemplate);
    if (options.asTemplate) {
      await requireFreeTemplateName(name, provider, user);
    }
    return { name, description: options.description, asTemplate: options.asTemplate };
  }

  private async createFromStarter(
    templateKey: string,
    provider: DatabaseProviderBase,
    user: UserInfo,
    name: string | undefined,
  ): Promise<FormFromTemplate> {
    const blueprint = this.GetStarterBlueprint(templateKey, name);
    // The caller owns what it creates — the rule a clone follows, so a form made from a starter and
    // one made from a saved template are owned alike. (The Action applies the same default, unless
    // its caller names an owner.)
    const built = await this.BuildFromBlueprint(blueprint, provider, user, { ownerUserId: user.ID });
    return { formId: built.formId, warnings: [] };
  }

  private async createFromSavedTemplate(
    templateFormId: string,
    provider: DatabaseProviderBase,
    user: UserInfo,
    name: string | undefined,
  ): Promise<FormFromTemplate> {
    const id = requireFormId(templateFormId, 'create a form from');
    const what = { doing: `Creating a form from template ${id}`, failed: `no form was created from template ${id}` };
    const copied = await this.copyInUnitOfWork(id, provider, user, what, async (source) => {
      if (!source.form.IsTemplate) {
        throw new FormAuthoringError(`Form ${id} is not a template, so no form was created from it. Copy a form with CloneForm instead.`);
      }
      return { name: name ?? source.form.Name, asTemplate: false };
    });
    return { formId: copied.formId, warnings: copied.warnings };
  }

  /**
   * The skeleton both copy verbs share, so the transaction and logging decisions live once: one
   * unit of work that reads the source, lets the verb decide the plan (or refuse, before the first
   * write), and writes the copy — then, once committed, logs what the copy could not carry over.
   */
  private async copyInUnitOfWork(
    sourceId: string,
    provider: DatabaseProviderBase,
    user: UserInfo,
    what: { doing: string; failed: string },
    planFor: (source: SourceForm) => Promise<CopyPlan>,
  ): Promise<ClonedForm> {
    requireEntityTransactions(provider, what.doing);
    const copied = await runAuthoringUnitOfWork(provider, `[FormAuthoringEngine] ${what.failed} (user ${user.ID})`, async () => {
      const source = await readSourceForm(sourceId, provider, user);
      return writeCopy(source, await planFor(source), provider, user);
    });
    logCopyNotes(sourceId, copied, user);
    return copied;
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
        `Could not read the Action catalogue to resolve this form's on-submit steps.`,
        { fault: true, logDetail: result.ErrorMessage || 'unknown error' },
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
    await saveOrThrow(form, 'Form');
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
    await saveOrThrow(entity, 'FormPage');
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
    await saveOrThrow(entity, 'FormQuestion');
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
      await saveOrThrow(entity, 'FormQuestionOption');
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
        throw new FormAuthoringError(`On-submit step "${step.actionName}" was not resolved to an Action.`, { fault: true });
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
      await saveOrThrow(automation, 'FormAutomation');
    }
    return authored.length;
  }
}

/** The id, trimmed, or a refusal naming the verb. */
function requireFormId(formId: string, verb: string): string {
  const id = formId?.trim() ?? '';
  if (!id) {
    throw new FormAuthoringError(`A form id is required to ${verb} a form.`);
  }
  if (!isGuid(id)) {
    throw new FormAuthoringError(`A valid form ID is required to ${verb} a form.`);
  }
  return id;
}

function requireUser(user: UserInfo | undefined, what: string): asserts user is UserInfo {
  if (!user) {
    throw new FormAuthoringError(`${what} needs the acting user; none was given.`);
  }
}

/**
 * The name a copy gets when the caller gave none. A form saved as a template keeps the form's name —
 * saving "Client intake" as a template is the natural reading. Anything else says it is a copy: a
 * working copy, so it is not mistaken for its source in the forms list, and a template copied as a
 * template, whose source's name is by definition already a template's and would refuse itself.
 */
function derivedCopyName(source: Pick<SourceForm['form'], 'Name' | 'IsTemplate'>, asTemplate: boolean): string {
  return asTemplate && !source.IsTemplate ? source.Name : `${source.Name} (copy)`;
}

/**
 * Refuse a template name another template already has (trimmed, any case): two cards reading
 * "Client intake" are indistinguishable in the gallery, and the author who saved the second has no
 * way to tell them apart afterwards. Checked inside the copy's transaction, before the first write.
 *
 * Unlike the builder's check it replaces — which let the save proceed when the read failed — an
 * unreadable list refuses: on the server a failed read inside the transaction is a fault, and the
 * writes behind it would be running on the same broken connection.
 *
 * The names are compared here rather than in SQL so trimming and case-folding mean the same thing
 * on every database; a host has tens of templates, not thousands.
 */
async function requireFreeTemplateName(name: string, provider: DatabaseProviderBase, user: UserInfo): Promise<void> {
  const result = await provider.RunView<{ ID: string; Name: string }>(
    { EntityName: ENTITY.Form, ExtraFilter: 'IsTemplate=1', Fields: ['ID', 'Name'], ResultType: 'simple', BypassCache: true },
    user,
  );
  if (!result.Success) {
    throw new FormAuthoringError(
      `The template names could not be read, so the template was not saved.`,
      { fault: true, logDetail: result.ErrorMessage || 'no detail' },
    );
  }
  const wanted = templateNameKey(name);
  if ((result.Results ?? []).some((template) => templateNameKey(template.Name) === wanted)) {
    throw new FormAuthoringError(`A template called “${name}” already exists. Give this one a name that tells them apart.`);
  }
}

function templateNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

/**
 * The form as its server subclass, read fresh. Through a view rather than `Load()`: `Load()` would
 * also fill the form's `immediate` page and screen collections, and a status change needs neither.
 */
async function loadForm(formId: string, provider: DatabaseProviderBase, user: UserInfo, verbed: string): Promise<FormEntityServer> {
  const result = await provider.RunView<unknown>(
    { EntityName: ENTITY.Form, ExtraFilter: `ID=${quoteSqlString(formId)}`, ResultType: 'entity_object', BypassCache: true },
    user,
  );
  if (!result.Success) {
    throw new FormAuthoringError(`Could not read form ${formId}, so it was not ${verbed}.`, {
      fault: true, logDetail: result.ErrorMessage || 'no detail',
    });
  }
  const [form] = result.Results ?? [];
  if (!form) {
    throw new FormAuthoringError(`Form ${formId} does not exist, so it cannot be ${verbed}.`);
  }
  // The subclass is what closes the links on archive and checks the restore: without it the verb
  // would write a bare status, so the engine refuses rather than write anyway.
  return requireServerEntity(form, FormEntityServer, ENTITY.Form);
}

/** A row the template delete removes: what `deleteEach` needs of it. */
type DeletableRow = BaseEntity & { ID: string };

/** Every row of `entityName` matching `filter`, as entities to delete — a failed read refuses. */
async function rowsToDelete(entityName: string, filter: string, provider: DatabaseProviderBase, user: UserInfo): Promise<DeletableRow[]> {
  const result = await provider.RunView<DeletableRow>({ EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true, IgnoreMaxRows: true }, user);
  if (!result.Success) {
    throw new FormAuthoringError(`Could not read ${entityName}, so nothing was deleted.`, { fault: true, logDetail: result.ErrorMessage || 'no detail' });
  }
  return result.Results ?? [];
}

/** Delete each row in order, or throw naming the one refused — which rolls the whole delete back. */
async function deleteEach(rows: readonly DeletableRow[], templateId: string): Promise<void> {
  for (const row of rows) {
    if (!(await row.Delete())) {
      throw new FormAuthoringError(
        `Could not delete ${row.EntityInfo?.Name ?? 'a row'} ${row.ID} of template ${templateId}. Nothing was deleted.`,
        { fault: true, logDetail: saveFailure(row) },
      );
    }
  }
}

/**
 * Refuse a template anything is attached to — the things that make a form undeletable. Checked
 * before the first delete, because a guard that runs after the first child is gone is not a guard.
 */
async function refuseAttachedRecords(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<void> {
  const byForm = `FormID=${quoteSqlString(formId)}`;
  const reads = await provider.RunViews<{ ID: string }>(
    [ENTITY.FormResponse, ENTITY.FormVersion, ENTITY.FormDistribution].map((EntityName) => ({
      EntityName,
      ExtraFilter: byForm,
      ResultType: 'simple' as const,
      Fields: ['ID'],
      BypassCache: true,
    })),
    user,
  );
  if (reads.some((read) => !read?.Success)) {
    throw new FormAuthoringError('Could not confirm this template has no responses attached, so it was not deleted.', { fault: true });
  }
  const [responses, versions, distributions] = reads.map((read) => read.Results.length);
  if (responses > 0) {
    throw new FormAuthoringError(`This template has ${responses} response(s) attached and cannot be deleted.`);
  }
  if (versions > 0) {
    throw new FormAuthoringError(`This template has ${versions} published version(s) attached and cannot be deleted.`);
  }
  if (distributions > 0) {
    throw new FormAuthoringError(`This template has ${distributions} distribution link(s) attached and cannot be deleted.`);
  }
}

async function hasPublishedVersion(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<boolean> {
  const result = await provider.RunView<Pick<mjBizAppsFormsFormVersionEntityType, 'ID'>>(
    {
      EntityName: ENTITY.FormVersion,
      ExtraFilter: `FormID=${quoteSqlString(formId)} AND Status='Published'`,
      Fields: ['ID'],
      ResultType: 'simple',
      MaxRows: 1,
      BypassCache: true,
    },
    user,
  );
  if (!result.Success) {
    throw new FormAuthoringError(
      `Could not read whether form ${formId} has a published version, so it was not restored.`,
      { fault: true, logDetail: result.ErrorMessage || 'no detail' },
    );
  }
  return (result.Results ?? []).length > 0;
}

/** Move the form to `status` through its server subclass, or throw with the subclass's reason. */
async function saveStatus(form: FormEntityServer, status: FormStatus, verb: string): Promise<void> {
  form.Status = status;
  if (!(await form.Save())) {
    throw new FormAuthoringError(`Could not ${verb} form ${form.ID}.`, { fault: true, logDetail: saveFailure(form) });
  }
}

/**
 * Close the links still Active under an archived form — the subclass's own close, so "what Closed
 * means for links" stays one implementation — or throw, which rolls back every link it closed.
 */
async function closeStrayLinks(form: FormEntityServer): Promise<void> {
  try {
    await form.CloseActiveDistributions();
  } catch (err) {
    throw new FormAuthoringError(
      `Could not close the links still open on archived form ${form.ID}. Nothing was changed.`,
      { fault: true, logDetail: err instanceof Error ? err.message : String(err) },
    );
  }
}

/** One log line for what a copy had to discard — the author sees it in the result; an operator here. */
function logCopyNotes(sourceFormId: string, copied: ClonedForm, user: UserInfo): void {
  if (copied.warnings.length === 0) {
    return;
  }
  LogStatus(
    `[FormAuthoringEngine] form ${sourceFormId} copied to ${copied.formId} for user ${user.ID} with ` +
      `${copied.warnings.length} note(s): ${copied.warnings.join(' ')}`,
  );
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

/** Keep unexpected provider exceptions out of the author-facing message, including before a build transaction. */
async function callerSafeAuthoring<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof FormAuthoringError || error instanceof FormPublishError || error instanceof EngineTransactionFailure) {
      throw error;
    }
    throw new FormAuthoringError('The form change failed on the server; the server log has the detail.', {
      fault: true,
      logDetail: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  }
}

/** Sanitize inside the logging boundary so the operator retains the original diagnostic. */
function runAuthoringUnitOfWork<T>(provider: DatabaseProviderBase, context: string, work: () => Promise<T>): Promise<T> {
  return runEngineUnitOfWork(provider, context, () => callerSafeAuthoring(work));
}
