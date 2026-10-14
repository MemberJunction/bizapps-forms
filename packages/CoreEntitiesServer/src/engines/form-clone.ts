/**
 * The deep copy of a form: form → new form, form → template, template → form. Driven by
 * `FormAuthoringEngine` (`Clone`, `CreateFromTemplate`), which owns the transaction; everything
 * here runs inside it, so a failure at any row leaves no copy at all.
 *
 * ONE routine serves every direction because they are the same operation with a different flag on
 * the root row. That symmetry is the reason a template is a `Form` with `IsTemplate = 1` rather
 * than a serialized blueprint: a blueprint carries pages, questions and options and nothing else
 * (`form-blueprint.ts`), so saving a real form through one would discard its branching,
 * validation, scoring, screens, theme, automations and entity bindings without a word.
 *
 * WHAT IS DELIBERATELY NOT COPIED, and why:
 *   - `FormVersion` — versions are publish artifacts. Publish mints `max + 1`, so a copy that
 *     inherited them would start life claiming to be version 4 of a form never published.
 *   - `FormDistribution` — a distribution is a live public URL with its own credential. Copying
 *     one would hand two different forms the same link.
 *   - `FormResponse` / `FormResponseAnswer` / `FormAutomationRun` / `FormEntityBindingRecord` —
 *     history belongs to the form that produced it. A new form has none, and a template must have
 *     none for deletion to stay safe.
 *
 * Ported from the browser's `FormCloneService` (#303) rule for rule; the one change is that the
 * whole copy is now one transaction, where the browser committed row by row and a failure part-way
 * left a half-copied form behind.
 */
import type { BaseEntity, DatabaseProviderBase, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
  quoteSqlString,
  remapConditionalRule,
  remapFieldMappings,
  type RemapResult,
  type mjBizAppsFormsFormAutomationEntity,
  type mjBizAppsFormsFormAutomationEntityType,
  type mjBizAppsFormsFormEntity,
  type mjBizAppsFormsFormEntityBindingEntity,
  type mjBizAppsFormsFormEntityBindingEntityType,
  type mjBizAppsFormsFormEntityType,
  type mjBizAppsFormsFormPageEntity,
  type mjBizAppsFormsFormPageEntityType,
  type mjBizAppsFormsFormQuestionEntity,
  type mjBizAppsFormsFormQuestionEntityType,
  type mjBizAppsFormsFormQuestionOptionEntity,
  type mjBizAppsFormsFormQuestionOptionEntityType,
  type mjBizAppsFormsFormScreenEntity,
  type mjBizAppsFormsFormScreenEntityType,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { FormAuthoringError, saveOrThrow } from './authoring-errors.js';

const ENTITY = FORMS_ENTITY;

/** The source form as read: its row and every authored child, each in display order. */
export interface SourceForm {
  form: mjBizAppsFormsFormEntityType;
  pages: mjBizAppsFormsFormPageEntityType[];
  questions: mjBizAppsFormsFormQuestionEntityType[];
  options: mjBizAppsFormsFormQuestionOptionEntityType[];
  screens: mjBizAppsFormsFormScreenEntityType[];
  bindings: mjBizAppsFormsFormEntityBindingEntityType[];
  automations: mjBizAppsFormsFormAutomationEntityType[];
}

/** What the copy's root row should be. Decided by the engine; applied here verbatim. */
export interface CopyPlan {
  /** Final, trimmed and — for a template — already checked to be free. */
  name: string;
  /** `undefined` keeps the source's description; `null` clears it. */
  description?: string | null;
  asTemplate: boolean;
}

/** What a copy produced, including anything it had to discard on the way. */
export interface ClonedForm {
  formId: string;
  /** The copy's `TemplateSourceFormID`: the source's id for a template, `null` for a working form. */
  templateSourceFormId: string | null;
  pageCount: number;
  questionCount: number;
  optionCount: number;
  screenCount: number;
  automationCount: number;
  bindingCount: number;
  /** References that could not be carried over, in words an author can act on. Usually empty. */
  warnings: string[];
}

/**
 * Read `formId` and its whole authored tree in two batches — the form-keyed reads, then the options
 * (keyed by question, so not addressable until the first batch answers). Throws a refusal when the
 * form does not exist, and a fault when any read fails: copying around a gap would produce a form
 * that silently differs from its source.
 *
 * Every column is read (no `Fields` list) on purpose: a copy must carry every column, and a second
 * hand-kept list of them is exactly the list a new column gets forgotten from.
 */
export async function readSourceForm(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<SourceForm> {
  const byForm = `FormID=${quoteSqlString(formId)}`;
  const [forms, pages, questions, screens, bindings, automations] = await provider.RunViews<unknown>(
    [
      sourceRead(ENTITY.Form, `ID=${quoteSqlString(formId)}`),
      sourceRead(ENTITY.FormPage, byForm, 'DisplayOrder'),
      sourceRead(ENTITY.FormQuestion, byForm, 'DisplayOrder'),
      sourceRead(ENTITY.FormScreen, byForm, 'DisplayOrder'),
      sourceRead(ENTITY.FormEntityBinding, byForm, 'Name'),
      sourceRead(ENTITY.FormAutomation, byForm, 'DisplayOrder'),
    ],
    user,
  );
  const [form] = rowsOrThrow<mjBizAppsFormsFormEntityType>(forms, 'the form');
  if (!form) {
    throw new FormAuthoringError(`Form ${formId} does not exist, so it cannot be copied.`);
  }
  const questionRows = rowsOrThrow<mjBizAppsFormsFormQuestionEntityType>(questions, "the form's questions");
  return {
    form,
    pages: rowsOrThrow(pages, "the form's pages"),
    questions: questionRows,
    options: await readOptions(questionRows, provider, user),
    screens: rowsOrThrow(screens, "the form's screens"),
    bindings: rowsOrThrow(bindings, "the form's entity bindings"),
    automations: rowsOrThrow(automations, "the form's automations"),
  };
}

/** Write `source` as a new form per `plan`, inside the caller's transaction. */
export async function writeCopy(
  source: SourceForm,
  plan: CopyPlan,
  provider: DatabaseProviderBase,
  user: UserInfo,
): Promise<ClonedForm> {
  return new FormTreeCopier(source, provider, user).write(plan);
}

async function readOptions(
  questions: readonly mjBizAppsFormsFormQuestionEntityType[],
  provider: DatabaseProviderBase,
  user: UserInfo,
): Promise<mjBizAppsFormsFormQuestionOptionEntityType[]> {
  if (questions.length === 0) {
    return [];
  }
  const inList = questions.map((q) => quoteSqlString(q.ID)).join(',');
  const [options] = await provider.RunViews<unknown>([sourceRead(ENTITY.FormQuestionOption, `QuestionID IN (${inList})`, 'DisplayOrder')], user);
  return rowsOrThrow(options, "the form's answer options");
}

/** A fresh read of every column — inside the transaction, so it sees the rows as they are now. */
function sourceRead(entityName: string, filter: string, orderBy?: string): RunViewParams {
  return { EntityName: entityName, ExtraFilter: filter, OrderBy: orderBy, ResultType: 'simple', BypassCache: true };
}

/**
 * A view's rows, or a fault naming what could not be read. The one place a batched `RunViews`
 * result is narrowed to its row type: each call site names the entity whose rows it asked for.
 */
function rowsOrThrow<T>(result: RunViewResult<unknown> | undefined, what: string): T[] {
  if (!result?.Success) {
    throw new FormAuthoringError(`Could not read ${what} (${result?.ErrorMessage || 'no result'}); nothing was copied.`, { fault: true });
  }
  return (result.Results ?? []) as T[];
}

/** Old-id → new-id maps for everything a `ConditionalRule` can name: conditions, and jump targets. */
interface CloneIdMaps {
  questions: ReadonlyMap<string, string>;
  pages: ReadonlyMap<string, string>;
  screens: ReadonlyMap<string, string>;
}

/** The subset of copied rows whose `ConditionalRule` may name questions, pages and endings. */
type ConditionalRuleRow =
  | mjBizAppsFormsFormPageEntity
  | mjBizAppsFormsFormQuestionEntity
  | mjBizAppsFormsFormScreenEntity
  | mjBizAppsFormsFormAutomationEntity;

/**
 * One copy in progress: the source, the provider it writes through, and the copies and old-id →
 * new-id maps it builds. Two passes, and the second one is the point: pass one writes the rows and
 * builds the maps; pass two rewrites every JSON payload that referenced a question, page or ending by id.
 * They cannot be one pass, because a rule on the first page may reference the last question.
 */
class FormTreeCopier {
  private readonly warnings: string[] = [];

  constructor(
    private readonly source: SourceForm,
    private readonly provider: DatabaseProviderBase,
    private readonly user: UserInfo,
  ) {}

  public async write(plan: CopyPlan): Promise<ClonedForm> {
    const copy = await this.copyForm(plan);
    const pages = await this.copyPages(copy.ID);
    const questions = await this.copyQuestions(copy.ID, pages.idMap);
    const optionCount = await this.copyOptions(questions.idMap);
    const screens = await this.copyScreens(copy.ID);
    const bindings = await this.copyBindings(copy.ID);
    const automations = await this.copyAutomations(copy.ID, bindings.idMap);

    // Pass two — every id-bearing payload, now that the maps are complete.
    const maps: CloneIdMaps = { questions: questions.idMap, pages: pages.idMap, screens: screens.idMap };
    await this.rewriteConditionalRules(pages.copies, maps, 'page');
    await this.rewriteConditionalRules(questions.copies, maps, 'question');
    await this.rewriteConditionalRules(screens.copies, maps, 'screen');
    await this.rewriteConditionalRules(automations, maps, 'automation');
    await this.rewriteFieldMappings(bindings.copies, questions.idMap);

    return {
      formId: copy.ID,
      templateSourceFormId: copy.TemplateSourceFormID,
      pageCount: pages.copies.length,
      questionCount: questions.copies.length,
      optionCount,
      screenCount: screens.copies.length,
      automationCount: automations.length,
      bindingCount: bindings.copies.length,
      warnings: this.warnings,
    };
  }

  // --- Root ------------------------------------------------------------------

  private async copyForm(plan: CopyPlan): Promise<mjBizAppsFormsFormEntity> {
    const source = this.source.form;
    const copy = await this.newRow<mjBizAppsFormsFormEntity>(ENTITY.Form);
    copy.Name = plan.name;
    copy.Description = plan.description === undefined ? source.Description : plan.description;
    copy.CategoryID = source.CategoryID;
    // Shared on purpose, even a per-form style: the copy LOOKS the same until its author restyles
    // it, and the builder's Design tab forks any style another form also points at before it
    // writes, so one form's edit never restyles the other.
    copy.StyleID = source.StyleID;
    copy.RenderMode = source.RenderMode;
    copy.Settings = source.Settings;
    copy.IsTemplate = plan.asTemplate;
    // Provenance is recorded on templates ONLY — it is what the builder's "Saved as template"
    // indicator looks up. A form created FROM a template is an independent copy that diverges at
    // once; a link there would imply edits propagate, which they do not.
    copy.TemplateSourceFormID = plan.asTemplate ? source.ID : null;
    // Always Draft, in every direction. A template may never be Published
    // (CK_Form_TemplateNotPublished), and a copy has no published version to back a live status.
    copy.Status = 'Draft';
    copy.OwnerUserID = this.user.ID;
    await saveOrThrow(copy, `form "${copy.Name}"`);
    return copy;
  }

  // --- Children (pass one) ----------------------------------------------------

  private async copyPages(newFormId: string): Promise<{ copies: mjBizAppsFormsFormPageEntity[]; idMap: Map<string, string> }> {
    const copies: mjBizAppsFormsFormPageEntity[] = [];
    const idMap = new Map<string, string>();
    for (const source of this.source.pages) {
      const copy = await this.newRow<mjBizAppsFormsFormPageEntity>(ENTITY.FormPage);
      copy.FormID = newFormId;
      copy.Title = source.Title;
      copy.Description = source.Description;
      copy.DisplayOrder = source.DisplayOrder;
      copy.ConditionalRule = source.ConditionalRule;
      // Missed once, the same way IsDisqualification was: a cloned page that loses this silently
      // stops banking a partial where its author put a checkpoint.
      copy.IsPartialSubmitPoint = source.IsPartialSubmitPoint;
      await saveOrThrow(copy, `page "${source.Title ?? source.ID}"`);
      idMap.set(source.ID, copy.ID);
      copies.push(copy);
    }
    return { copies, idMap };
  }

  private async copyQuestions(
    newFormId: string,
    pageIdMap: ReadonlyMap<string, string>,
  ): Promise<{ copies: mjBizAppsFormsFormQuestionEntity[]; idMap: Map<string, string> }> {
    const copies: mjBizAppsFormsFormQuestionEntity[] = [];
    const idMap = new Map<string, string>();
    for (const source of this.source.questions) {
      const copy = await this.newRow<mjBizAppsFormsFormQuestionEntity>(ENTITY.FormQuestion);
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
      await saveOrThrow(copy, `question "${source.Prompt}"`);
      idMap.set(source.ID, copy.ID);
      copies.push(copy);
    }
    return { copies, idMap };
  }

  private async copyOptions(questionIdMap: ReadonlyMap<string, string>): Promise<number> {
    for (const source of this.source.options) {
      const newQuestionId = questionIdMap.get(source.QuestionID);
      if (!newQuestionId) {
        // Cannot happen — the options were read from these very questions — but writing an option
        // onto the SOURCE question would corrupt the form being copied, so it stops here.
        throw new FormAuthoringError(`Option "${source.Label}" belongs to question ${source.QuestionID}, which was not copied.`, {
          fault: true,
        });
      }
      const copy = await this.newRow<mjBizAppsFormsFormQuestionOptionEntity>(ENTITY.FormQuestionOption);
      copy.QuestionID = newQuestionId;
      copy.Label = source.Label;
      copy.Value = source.Value;
      copy.DisplayOrder = source.DisplayOrder;
      copy.IsDefault = source.IsDefault;
      copy.ImageURL = source.ImageURL;
      copy.MatrixAxis = source.MatrixAxis;
      await saveOrThrow(copy, `option "${source.Label}"`);
    }
    return this.source.options.length;
  }

  private async copyScreens(newFormId: string): Promise<{ copies: mjBizAppsFormsFormScreenEntity[]; idMap: Map<string, string> }> {
    const copies: mjBizAppsFormsFormScreenEntity[] = [];
    // A jump can target one of these endings; without the map its rule could only be dropped.
    const idMap = new Map<string, string>();
    for (const source of this.source.screens) {
      const copy = await this.newRow<mjBizAppsFormsFormScreenEntity>(ENTITY.FormScreen);
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
      // The screened-out flag lives on the COLUMN, not in the ConditionalRule JSON the remap
      // rewrites. Copying the rule alone left a knockout's wiring without its meaning: the ending
      // resolver excludes only flagged screens, so the copy became a NORMAL ending — the respondent
      // saw "not eligible" while the response was recorded Complete, counted against the quota and
      // fired every on-submit automation.
      copy.IsDisqualification = source.IsDisqualification;
      await saveOrThrow(copy, `${source.ScreenType.toLowerCase()} screen "${source.Title}"`);
      idMap.set(source.ID, copy.ID);
      copies.push(copy);
    }
    return { copies, idMap };
  }

  private async copyBindings(newFormId: string): Promise<{ copies: mjBizAppsFormsFormEntityBindingEntity[]; idMap: Map<string, string> }> {
    const copies: mjBizAppsFormsFormEntityBindingEntity[] = [];
    const idMap = new Map<string, string>();
    for (const source of this.source.bindings) {
      const copy = await this.newRow<mjBizAppsFormsFormEntityBindingEntity>(ENTITY.FormEntityBinding);
      copy.FormID = newFormId;
      copy.Name = source.Name;
      copy.Description = source.Description;
      copy.TargetEntityID = source.TargetEntityID;
      copy.TargetEntityName = source.TargetEntityName;
      copy.FieldMappings = source.FieldMappings;
      copy.IdentityRule = source.IdentityRule;
      copy.MergePolicy = source.MergePolicy;
      copy.Status = source.Status;
      await saveOrThrow(copy, `entity binding "${source.Name}"`);
      idMap.set(source.ID, copy.ID);
      copies.push(copy);
    }
    return { copies, idMap };
  }

  private async copyAutomations(newFormId: string, bindingIdMap: ReadonlyMap<string, string>): Promise<mjBizAppsFormsFormAutomationEntity[]> {
    const copies: mjBizAppsFormsFormAutomationEntity[] = [];
    for (const source of this.source.automations) {
      const copy = await this.newRow<mjBizAppsFormsFormAutomationEntity>(ENTITY.FormAutomation);
      copy.FormID = newFormId;
      copy.Name = source.Name;
      copy.Description = source.Description;
      copy.TargetType = source.TargetType;
      copy.ActionID = source.ActionID;
      copy.AgentID = source.AgentID;
      // The COPY's binding, never the source's — CK_FormAutomation_SingleTarget would happily accept
      // the old id, leaving the new form's automation writing through the old form's map.
      copy.BindingID = source.BindingID ? (bindingIdMap.get(source.BindingID) ?? null) : null;
      copy.Trigger = source.Trigger;
      copy.ExecutionMode = source.ExecutionMode;
      copy.DisplayOrder = source.DisplayOrder;
      copy.ParameterMapping = source.ParameterMapping;
      copy.ContinueOnError = source.ContinueOnError;
      copy.TimeoutMS = source.TimeoutMS;
      copy.IsActive = source.IsActive;
      copy.ConditionalRule = source.ConditionalRule;
      await saveOrThrow(copy, `automation "${source.Name}"`);
      copies.push(copy);
    }
    return copies;
  }

  // --- Pass two: id-bearing payloads ------------------------------------------

  private async rewriteConditionalRules(
    copies: readonly ConditionalRuleRow[],
    maps: CloneIdMaps,
    label: string,
  ): Promise<void> {
    for (const copy of copies) {
      const original = copy.ConditionalRule;
      if (original === null || original.trim() === '') {
        continue;
      }
      const result = remapConditionalRule(original, maps.questions, maps.pages, maps.screens);
      this.note(result, `${label} visibility rule`, 'a question, page or ending');
      if (result.json === original) {
        continue;
      }
      copy.ConditionalRule = result.json;
      await saveOrThrow(copy, `the rewritten ${label} visibility rule on the copy`);
    }
  }

  private async rewriteFieldMappings(copies: readonly mjBizAppsFormsFormEntityBindingEntity[], questionIdMap: ReadonlyMap<string, string>): Promise<void> {
    for (const copy of copies) {
      const result = remapFieldMappings(copy.FieldMappings, questionIdMap);
      this.note(result, `entity binding "${copy.Name}"`, 'a question');
      if (result.json === null) {
        // FieldMappings is NOT NULL. A binding whose mappings cannot be rewritten is disabled rather
        // than left pointing at another form's questions, where it would write blanks into real
        // records on every submission.
        copy.Status = 'Disabled';
        this.warnings.push(`Entity binding "${copy.Name}" was copied as Disabled because its field mappings could not be carried over.`);
      } else if (result.json !== copy.FieldMappings) {
        copy.FieldMappings = result.json;
      } else {
        continue;
      }
      await saveOrThrow(copy, `the rewritten field mappings on copied binding "${copy.Name}"`);
    }
  }

  /**
   * Record what a remap had to discard, in words the author can act on. `refersTo` names only the
   * kinds that payload can reference — a binding's mappings name questions, a rule also pages and
   * endings — so the warning never blames a kind of reference that was not there.
   */
  private note(result: RemapResult, what: string, refersTo: string): void {
    if (result.error) {
      this.warnings.push(`${what}: ${result.error}`);
    } else if (result.dropped > 0) {
      const one = result.dropped === 1;
      this.warnings.push(
        `${what}: ${result.dropped} reference${one ? '' : 's'} to ${refersTo} that was not copied ${one ? 'was' : 'were'} removed.`,
      );
    }
  }

  // --- Plumbing ---------------------------------------------------------------

  private async newRow<T extends BaseEntity>(entityName: string): Promise<T> {
    const row = await this.provider.GetEntityObject<T>(entityName, this.user);
    row.NewRecord();
    return row;
  }
}
