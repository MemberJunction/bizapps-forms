/**
 * Deep-copies a form: template → new form, and form → new template.
 *
 * ONE routine serves both directions because they are the same operation with a different flag
 * on the root row. That symmetry is not a coincidence — it is the reason a template is a `Form`
 * with `IsTemplate = 1` rather than a serialized blueprint in a side table. A blueprint carries
 * pages, questions and options and nothing else (see `form-blueprint.ts`), so saving a real form
 * through one would discard its branching, validation, scoring, screens, theme, automations and
 * entity bindings without a word.
 *
 * WHAT IS DELIBERATELY NOT COPIED, and why:
 *   - `FormVersion` — versions are publish artifacts. `PublishService` mints `max+1` on publish,
 *     so a copy that inherited them would start life claiming to be version 4 of a form that has
 *     never been published.
 *   - `FormDistribution` — a distribution is a live public URL with its own token. Copying one
 *     would hand two different forms the same link.
 *   - `FormResponse` / `FormResponseAnswer` / `FormAutomationRun` / `FormEntityBindingRecord` —
 *     history belongs to the form that produced it. A new form has none, and a template must
 *     have none for deletion to stay safe.
 *
 * Runs in the browser, like the rest of the builder, which already creates every one of these
 * row types through `BuilderStateService`. There is no server-only capability in a deep copy, and
 * an Action would have bought a metadata-seed regeneration for nothing.
 */
import { Injectable } from '@angular/core';
import { LogError, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  mjBizAppsFormsFormScreenEntity,
  mjBizAppsFormsFormAutomationEntity,
  mjBizAppsFormsFormEntityBindingEntity,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { remapConditionalRule, remapFieldMappings, type RemapResult } from './clone-remap';

/** What the caller wants the copy to be. */
export interface CloneOptions {
  /**
   * Template rows only: the form this template was saved from. Lets the builder show "Saved"
   * instead of offering to save the same form again, across reloads.
   */
  sourceFormId?: string;
  /** Name for the copy. Required — neither direction has a sensible silent default. */
  name: string;
  /** Description override; when omitted the source's description carries over. */
  description?: string | null;
  /** `true` produces a template, `false` a working form. */
  isTemplate: boolean;
}

/** What a clone produced, including anything it had to discard on the way. */
export interface CloneResult {
  formId: string;
  pageCount: number;
  questionCount: number;
  optionCount: number;
  screenCount: number;
  automationCount: number;
  bindingCount: number;
  /** Human-readable notes about references that could not be carried over. Usually empty. */
  warnings: string[];
}

/** Raised when a read or a save fails; the caller turns it into a message on screen. */
export class FormCloneError extends Error {}

/** Every row type this service writes. Named rather than structural so a shape change is caught. */
type CopiedRow =
  | mjBizAppsFormsFormEntity
  | mjBizAppsFormsFormPageEntity
  | mjBizAppsFormsFormQuestionEntity
  | mjBizAppsFormsFormQuestionOptionEntity
  | mjBizAppsFormsFormScreenEntity
  | mjBizAppsFormsFormAutomationEntity
  | mjBizAppsFormsFormEntityBindingEntity;

/** The subset of copied rows whose `ConditionalRule` may name questions. */
type ConditionalRuleRow =
  | mjBizAppsFormsFormPageEntity
  | mjBizAppsFormsFormQuestionEntity
  | mjBizAppsFormsFormScreenEntity
  | mjBizAppsFormsFormAutomationEntity;

@Injectable()
export class FormCloneService {
  private readonly md = new Metadata();

  private get user(): UserInfo {
    return this.md.CurrentUser;
  }

  /**
   * Copy `sourceFormId` into a brand-new form (or template).
   *
   * Two passes, and the second one is the point. Pass one writes the rows and builds an
   * old-id → new-id map; pass two rewrites every JSON payload that referenced a question by id.
   * They cannot be one pass, because a rule on the first question may reference the last.
   */
  public async cloneForm(sourceFormId: string, options: CloneOptions): Promise<CloneResult> {
    if (!options.name.trim()) {
      throw new FormCloneError('A name is required to copy a form.');
    }

    const source = await this.loadForm(sourceFormId);
    const warnings: string[] = [];

    const copy = await this.createFormCopy(source, options);
    const pages = await this.copyPages(sourceFormId, copy.ID);
    const questions = await this.copyQuestions(sourceFormId, copy.ID, pages.idMap);
    const optionCount = await this.copyOptions(questions.sourceIds, questions.idMap);
    const screens = await this.copyScreens(sourceFormId, copy.ID);
    const bindings = await this.copyBindings(sourceFormId, copy.ID);
    const automations = await this.copyAutomations(sourceFormId, copy.ID, bindings.idMap);

    // Pass two — every id-bearing payload, now that the map is complete.
    await this.rewriteConditionalRules(pages.copies, questions.idMap, warnings, 'page', pages.idMap);
    await this.rewriteConditionalRules(questions.copies, questions.idMap, warnings, 'question', pages.idMap);
    await this.rewriteConditionalRules(screens.copies, questions.idMap, warnings, 'screen', pages.idMap);
    await this.rewriteConditionalRules(automations.copies, questions.idMap, warnings, 'automation', pages.idMap);
    await this.rewriteFieldMappings(bindings.copies, questions.idMap, warnings);

    return {
      formId: copy.ID,
      pageCount: pages.copies.length,
      questionCount: questions.copies.length,
      optionCount,
      screenCount: screens.copies.length,
      automationCount: automations.copies.length,
      bindingCount: bindings.copies.length,
      warnings,
    };
  }

  // --- Root ------------------------------------------------------------------

  private async loadForm(formId: string): Promise<mjBizAppsFormsFormEntity> {
    const form = await this.md.GetEntityObject<mjBizAppsFormsFormEntity>(FORMS_ENTITY.Form, this.user);
    if (!(await form.Load(formId))) {
      throw new FormCloneError(`Could not load form ${formId} to copy it.`);
    }
    return form;
  }

  private async createFormCopy(
    source: mjBizAppsFormsFormEntity,
    options: CloneOptions,
  ): Promise<mjBizAppsFormsFormEntity> {
    const copy = await this.md.GetEntityObject<mjBizAppsFormsFormEntity>(FORMS_ENTITY.Form, this.user);
    copy.NewRecord();
    copy.Name = options.name.trim();
    copy.Description = options.description === undefined ? source.Description : options.description;
    copy.CategoryID = source.CategoryID;
    copy.StyleID = source.StyleID;
    copy.RenderMode = source.RenderMode;
    copy.Settings = source.Settings;
    copy.IsTemplate = options.isTemplate;
    // Provenance is recorded on templates ONLY. A form created FROM a template is an independent
    // copy that diverges immediately; a link there would imply edits propagate, which they do not.
    copy.TemplateSourceFormID = options.isTemplate ? (options.sourceFormId ?? null) : null;
    // Always Draft, in both directions. A template may not be Published at all
    // (CK_Form_TemplateNotPublished), and a form created from one must not inherit a live
    // status it has no published version to back.
    copy.Status = 'Draft';
    copy.OwnerUserID = this.user.ID;
    await this.save(copy, `form "${copy.Name}"`);
    return copy;
  }

  // --- Children --------------------------------------------------------------

  private async copyPages(
    sourceFormId: string,
    newFormId: string,
  ): Promise<{ copies: mjBizAppsFormsFormPageEntity[]; idMap: Map<string, string> }> {
    const sources = await this.loadChildren<mjBizAppsFormsFormPageEntity>(
      FORMS_ENTITY.FormPage,
      `FormID='${sourceFormId}'`,
      'DisplayOrder',
    );
    const copies: mjBizAppsFormsFormPageEntity[] = [];
    const idMap = new Map<string, string>();
    for (const source of sources) {
      const copy = await this.md.GetEntityObject<mjBizAppsFormsFormPageEntity>(
        FORMS_ENTITY.FormPage,
        this.user,
      );
      copy.NewRecord();
      copy.FormID = newFormId;
      copy.Title = source.Title;
      copy.Description = source.Description;
      copy.DisplayOrder = source.DisplayOrder;
      copy.ConditionalRule = source.ConditionalRule;
      // Pre-dates the rule verbs and was missed the same way `IsDisqualification` was: a cloned
      // page that loses this silently stops banking a partial where its author put a checkpoint.
      copy.IsPartialSubmitPoint = source.IsPartialSubmitPoint;
      await this.save(copy, `page "${source.Title ?? source.ID}"`);
      idMap.set(source.ID, copy.ID);
      copies.push(copy);
    }
    return { copies, idMap };
  }

  private async copyQuestions(
    sourceFormId: string,
    newFormId: string,
    pageIdMap: ReadonlyMap<string, string>,
  ): Promise<{
    copies: mjBizAppsFormsFormQuestionEntity[];
    idMap: Map<string, string>;
    sourceIds: string[];
  }> {
    const sources = await this.loadChildren<mjBizAppsFormsFormQuestionEntity>(
      FORMS_ENTITY.FormQuestion,
      `FormID='${sourceFormId}'`,
      'DisplayOrder',
    );
    const copies: mjBizAppsFormsFormQuestionEntity[] = [];
    const idMap = new Map<string, string>();
    for (const source of sources) {
      const copy = await this.md.GetEntityObject<mjBizAppsFormsFormQuestionEntity>(
        FORMS_ENTITY.FormQuestion,
        this.user,
      );
      copy.NewRecord();
      copy.FormID = newFormId;
      // A question with no page keeps none; the builder folds those onto the first page.
      copy.PageID = source.PageID ? (pageIdMap.get(source.PageID) ?? null) : null;
      copy.QuestionType = source.QuestionType;
      copy.Prompt = source.Prompt;
      copy.HelpText = source.HelpText;
      copy.IsRequired = source.IsRequired;
      copy.DisplayOrder = source.DisplayOrder;
      copy.ValidationRule = source.ValidationRule;
      copy.ScoringConfig = source.ScoringConfig;
      copy.Settings = source.Settings;
      copy.ConditionalRule = source.ConditionalRule;
      await this.save(copy, `question "${source.Prompt}"`);
      idMap.set(source.ID, copy.ID);
      copies.push(copy);
    }
    return { copies, idMap, sourceIds: sources.map((q) => q.ID) };
  }

  private async copyOptions(
    sourceQuestionIds: string[],
    questionIdMap: ReadonlyMap<string, string>,
  ): Promise<number> {
    if (sourceQuestionIds.length === 0) {
      return 0;
    }
    const inList = sourceQuestionIds.map((id) => `'${id}'`).join(',');
    const sources = await this.loadChildren<mjBizAppsFormsFormQuestionOptionEntity>(
      FORMS_ENTITY.FormQuestionOption,
      `QuestionID IN (${inList})`,
      'DisplayOrder',
    );
    let count = 0;
    for (const source of sources) {
      const newQuestionId = questionIdMap.get(source.QuestionID);
      if (!newQuestionId) {
        // Cannot happen — the options were read from these very questions — but writing an
        // option onto the SOURCE question would corrupt the form being copied, so it stops here.
        throw new FormCloneError(
          `Option "${source.Label}" belongs to question ${source.QuestionID}, which was not copied.`,
        );
      }
      const copy = await this.md.GetEntityObject<mjBizAppsFormsFormQuestionOptionEntity>(
        FORMS_ENTITY.FormQuestionOption,
        this.user,
      );
      copy.NewRecord();
      copy.QuestionID = newQuestionId;
      copy.Label = source.Label;
      copy.Value = source.Value;
      copy.DisplayOrder = source.DisplayOrder;
      copy.IsDefault = source.IsDefault;
      copy.ImageURL = source.ImageURL;
      copy.MatrixAxis = source.MatrixAxis;
      await this.save(copy, `option "${source.Label}"`);
      count++;
    }
    return count;
  }

  private async copyScreens(
    sourceFormId: string,
    newFormId: string,
  ): Promise<{ copies: mjBizAppsFormsFormScreenEntity[] }> {
    const sources = await this.loadChildren<mjBizAppsFormsFormScreenEntity>(
      FORMS_ENTITY.FormScreen,
      `FormID='${sourceFormId}'`,
      'DisplayOrder',
    );
    const copies: mjBizAppsFormsFormScreenEntity[] = [];
    for (const source of sources) {
      const copy = await this.md.GetEntityObject<mjBizAppsFormsFormScreenEntity>(
        FORMS_ENTITY.FormScreen,
        this.user,
      );
      copy.NewRecord();
      copy.FormID = newFormId;
      copy.ScreenType = source.ScreenType;
      copy.Title = source.Title;
      copy.Body = source.Body;
      copy.ButtonLabel = source.ButtonLabel;
      copy.MediaURL = source.MediaURL;
      copy.RedirectURL = source.RedirectURL;
      copy.DisplayOrder = source.DisplayOrder;
      copy.IsDefault = source.IsDefault;
      copy.SocialLinks = source.SocialLinks;
      copy.ConditionalRule = source.ConditionalRule;
      // The screened-out flag lives on the COLUMN, not in the ConditionalRule JSON that
      // `rewriteConditionalRules` handles below. Copying the rule alone left the copy with a
      // knockout's wiring and none of its meaning: `resolveEndingScreen` excludes only flagged
      // screens, so the cloned screen became a NORMAL ending. The respondent still saw "not
      // eligible", while the response was recorded Complete, stamped SubmittedAt, counted
      // against the quota and fired every on-submit automation.
      copy.IsDisqualification = source.IsDisqualification;
      await this.save(copy, `${source.ScreenType.toLowerCase()} screen "${source.Title}"`);
      copies.push(copy);
    }
    return { copies };
  }

  private async copyBindings(
    sourceFormId: string,
    newFormId: string,
  ): Promise<{ copies: mjBizAppsFormsFormEntityBindingEntity[]; idMap: Map<string, string> }> {
    const sources = await this.loadChildren<mjBizAppsFormsFormEntityBindingEntity>(
      FORMS_ENTITY.FormEntityBinding,
      `FormID='${sourceFormId}'`,
      'Name',
    );
    const copies: mjBizAppsFormsFormEntityBindingEntity[] = [];
    const idMap = new Map<string, string>();
    for (const source of sources) {
      const copy = await this.md.GetEntityObject<mjBizAppsFormsFormEntityBindingEntity>(
        FORMS_ENTITY.FormEntityBinding,
        this.user,
      );
      copy.NewRecord();
      copy.FormID = newFormId;
      copy.Name = source.Name;
      copy.Description = source.Description;
      copy.TargetEntityID = source.TargetEntityID;
      copy.TargetEntityName = source.TargetEntityName;
      copy.FieldMappings = source.FieldMappings;
      copy.IdentityRule = source.IdentityRule;
      copy.MergePolicy = source.MergePolicy;
      copy.Status = source.Status;
      await this.save(copy, `entity binding "${source.Name}"`);
      idMap.set(source.ID, copy.ID);
      copies.push(copy);
    }
    return { copies, idMap };
  }

  private async copyAutomations(
    sourceFormId: string,
    newFormId: string,
    bindingIdMap: ReadonlyMap<string, string>,
  ): Promise<{ copies: mjBizAppsFormsFormAutomationEntity[] }> {
    const sources = await this.loadChildren<mjBizAppsFormsFormAutomationEntity>(
      FORMS_ENTITY.FormAutomation,
      `FormID='${sourceFormId}'`,
      'DisplayOrder',
    );
    const copies: mjBizAppsFormsFormAutomationEntity[] = [];
    for (const source of sources) {
      const copy = await this.md.GetEntityObject<mjBizAppsFormsFormAutomationEntity>(
        FORMS_ENTITY.FormAutomation,
        this.user,
      );
      copy.NewRecord();
      copy.FormID = newFormId;
      copy.Name = source.Name;
      copy.Description = source.Description;
      copy.TargetType = source.TargetType;
      copy.ActionID = source.ActionID;
      copy.AgentID = source.AgentID;
      // The COPY's binding, never the source's — CK_FormAutomation_SingleTarget would happily
      // accept the old id, leaving the new form's automation writing through the old form's map.
      copy.BindingID = source.BindingID ? (bindingIdMap.get(source.BindingID) ?? null) : null;
      copy.Trigger = source.Trigger;
      copy.ExecutionMode = source.ExecutionMode;
      copy.DisplayOrder = source.DisplayOrder;
      copy.ParameterMapping = source.ParameterMapping;
      copy.ContinueOnError = source.ContinueOnError;
      copy.TimeoutMS = source.TimeoutMS;
      copy.IsActive = source.IsActive;
      copy.ConditionalRule = source.ConditionalRule;
      await this.save(copy, `automation "${source.Name}"`);
      copies.push(copy);
    }
    return { copies };
  }

  // --- Pass two: id-bearing payloads ----------------------------------------

  /** Anything whose `ConditionalRule` may name questions. */
  private async rewriteConditionalRules(
    copies: readonly ConditionalRuleRow[],
    questionIdMap: ReadonlyMap<string, string>,
    warnings: string[],
    label: string,
    pageIdMap?: ReadonlyMap<string, string>,
  ): Promise<void> {
    for (const copy of copies) {
      const original = copy.ConditionalRule;
      if (original === null || original.trim() === '') {
        continue;
      }
      const result = remapConditionalRule(original, questionIdMap, pageIdMap);
      this.collect(result, warnings, `${label} visibility rule`);
      if (result.json === original) {
        continue;
      }
      copy.ConditionalRule = result.json;
      if (!(await copy.Save())) {
        throw new FormCloneError(
          `Failed to rewrite the ${label} visibility rule on the copy: ${
            copy.LatestResult?.CompleteMessage ?? 'unknown error'
          }`,
        );
      }
    }
  }

  private async rewriteFieldMappings(
    copies: readonly mjBizAppsFormsFormEntityBindingEntity[],
    questionIdMap: ReadonlyMap<string, string>,
    warnings: string[],
  ): Promise<void> {
    for (const copy of copies) {
      const result = remapFieldMappings(copy.FieldMappings, questionIdMap);
      this.collect(result, warnings, `entity binding "${copy.Name}"`);
      if (result.json === null) {
        // FieldMappings is NOT NULL. A binding we cannot rewrite is disabled rather than left
        // pointing at another form's questions, where it would write blanks into real records.
        copy.Status = 'Disabled';
        warnings.push(
          `Entity binding "${copy.Name}" was copied as Disabled because its field mappings could not be carried over.`,
        );
      } else if (result.json !== copy.FieldMappings) {
        copy.FieldMappings = result.json;
      } else {
        continue;
      }
      if (!(await copy.Save())) {
        throw new FormCloneError(
          `Failed to rewrite the field mappings on copied binding "${copy.Name}": ${
            copy.LatestResult?.CompleteMessage ?? 'unknown error'
          }`,
        );
      }
    }
  }

  private collect(result: RemapResult, warnings: string[], what: string): void {
    if (result.error) {
      LogError(`Form clone: ${what} — ${result.error}`);
      warnings.push(`${what}: ${result.error}`);
    } else if (result.dropped > 0) {
      const note = `${what}: ${result.dropped} reference${
        result.dropped === 1 ? '' : 's'
      } to a question that was not copied ${result.dropped === 1 ? 'was' : 'were'} removed.`;
      LogError(`Form clone: ${note}`);
      warnings.push(note);
    }
  }

  // --- Plumbing --------------------------------------------------------------

  private async loadChildren<T>(entityName: string, filter: string, orderBy: string): Promise<T[]> {
    const rv = new RunView();
    const result = await rv.RunView<T>(
      { EntityName: entityName, ExtraFilter: filter, OrderBy: orderBy, ResultType: 'entity_object' },
      this.user,
    );
    if (!result.Success) {
      throw new FormCloneError(
        `Failed to read ${entityName} (${filter}): ${result.ErrorMessage ?? 'unknown error'}`,
      );
    }
    return result.Results ?? [];
  }

  private async save(entity: CopiedRow, what: string): Promise<void> {
    if (!(await entity.Save())) {
      const detail = entity.LatestResult?.CompleteMessage ?? 'unknown error';
      throw new FormCloneError(`Failed to save ${what}: ${detail}`);
    }
  }
}
