/**
 * The saved-template gallery: what is in it, and how one leaves it.
 *
 * A saved template is a `Form` row with `IsTemplate = 1` — see `form-clone.service.ts` for why
 * a template is a form rather than a serialized blueprint. This service is the read side of that
 * (the cards, with the counts a card shows) plus the one destructive operation Forms has.
 *
 * DELETION IS REAL HERE, AND ONLY HERE. Ordinary forms are archived, never deleted, because
 * every child table FKs to `Form(ID)` with no cascade and a form that collected responses must
 * not lose them (`FormsHomeService.setStatus`). A template is the one form that provably has no
 * responses: `CK_Form_TemplateNotPublished` refuses to let it be Published, an unpublished form
 * has no published version, and the public submit path resolves a distribution to a published
 * version. {@link deleteTemplate} still re-checks that on the row in front of it rather than
 * trusting the invariant, because the cost of being wrong is destroying someone's data.
 */
import { Injectable } from '@angular/core';
import {
  LogError,
  Metadata,
  RunView,
  type RunViewResult,
  type TransactionGroupBase,
  type UserInfo,
} from '@memberjunction/core';
import { escapeSqlString } from '@mj-biz-apps/forms-entities';
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

/** One card in the "Your templates" section. */
export interface SavedTemplateRow {
  id: string;
  name: string;
  description: string | null;
  questionCount: number;
  pageCount: number;
  updatedAt: Date | null;
}

/** Raw columns the gallery reads. */
interface TemplateSimpleRecord {
  ID: string;
  Name: string;
  Description: string | null;
  __mj_UpdatedAt: Date | string | null;
}

interface QuestionSimpleRecord {
  FormID: string;
}

interface PageSimpleRecord {
  FormID: string;
}

@Injectable()
export class FormTemplatesService {
  private readonly md = new Metadata();
  private readonly rv = new RunView();

  private get user(): UserInfo {
    return this.md.CurrentUser;
  }

  /**
   * Load every saved template with the counts its card shows.
   *
   * Two round-trips rather than one: the template ids have to exist before the counts can be
   * asked for. The alternative — a `FormID IN (SELECT ... WHERE IsTemplate = 1)` subquery — would
   * hardcode the Forms schema name into an ExtraFilter, and the schema name is configuration
   * (`mj.config.cjs`), not a constant this layer is entitled to know.
   */
  public async loadSavedTemplates(): Promise<SavedTemplateRow[]> {
    const formsRes = (await this.rv.RunView(
      {
        EntityName: FORMS_ENTITY.Form,
        ExtraFilter: 'IsTemplate = 1',
        ResultType: 'simple',
        Fields: ['ID', 'Name', 'Description', '__mj_UpdatedAt'],
        // Newest first. A template you just saved is the one you are most likely looking for, and
        // finding it at the top confirms the save landed — alphabetical order hides it mid-list.
        OrderBy: '__mj_UpdatedAt DESC',
      },
      this.user,
    )) as RunViewResult<TemplateSimpleRecord>;

    if (!formsRes.Success) {
      throw new Error(formsRes.ErrorMessage || 'Failed to load saved templates.');
    }
    if (formsRes.Results.length === 0) {
      return [];
    }

    const inList = formsRes.Results.map((f) => `'${f.ID}'`).join(',');
    const [questionsRes, pagesRes] = (await this.rv.RunViews([
      {
        EntityName: FORMS_ENTITY.FormQuestion,
        ExtraFilter: `FormID IN (${inList})`,
        ResultType: 'simple',
        Fields: ['FormID'],
      },
      {
        EntityName: FORMS_ENTITY.FormPage,
        ExtraFilter: `FormID IN (${inList})`,
        ResultType: 'simple',
        Fields: ['FormID'],
      },
    ])) as [RunViewResult<QuestionSimpleRecord>, RunViewResult<PageSimpleRecord>];

    // Counts are decoration on a card; a failure there must not empty the gallery.
    if (!questionsRes.Success) {
      LogError(`Template gallery: question counts unavailable — ${questionsRes.ErrorMessage}`);
    }
    if (!pagesRes.Success) {
      LogError(`Template gallery: page counts unavailable — ${pagesRes.ErrorMessage}`);
    }
    const questions = countByForm(questionsRes.Success ? questionsRes.Results : []);
    const pages = countByForm(pagesRes.Success ? pagesRes.Results : []);

    return formsRes.Results.map((f) => ({
      id: f.ID,
      name: f.Name,
      description: f.Description,
      questionCount: questions.get(f.ID) ?? 0,
      pageCount: pages.get(f.ID) ?? 0,
      updatedAt: toDate(f.__mj_UpdatedAt),
    }));
  }

  /**
   * Whether this form has already been saved as a template, and which one.
   *
   * Read from `TemplateSourceFormID` rather than by matching names: the copy is independent and
   * either side can be renamed, so a name match would go wrong in both directions — claiming
   * "Saved" for an unrelated template, and offering to save again for one that exists.
   */
  public async findTemplateSavedFrom(formId: string): Promise<string | null> {
    const res = (await this.rv.RunView(
      {
        EntityName: FORMS_ENTITY.Form,
        ExtraFilter: `IsTemplate = 1 AND TemplateSourceFormID='${formId}'`,
        ResultType: 'simple',
        Fields: ['ID'],
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: 1,
      },
      this.user,
    )) as RunViewResult<{ ID: string }>;
    if (!res.Success) {
      // Not knowing is not the same as "no". Logged and reported as unknown so the caller shows
      // the plain offer rather than a confident "Saved" it cannot back up.
      LogError(`Could not check whether form ${formId} has a saved template: ${res.ErrorMessage}`);
      return null;
    }
    return res.Results.length > 0 ? res.Results[0].ID : null;
  }

  /**
   * Whether a template already goes by this name (case-insensitive, trimmed).
   *
   * Two templates called "Client intake" are indistinguishable in a gallery of cards, and the
   * author who saved the second one has no way to tell which is which afterwards. Checked before
   * anything is written, so a rejected name costs nothing.
   *
   * Returns null when the check itself could not run — the caller lets the save proceed rather
   * than blocking on an unavailable read, since a duplicate name is untidy and a blocked save is
   * lost work.
   */
  public async templateNameTaken(name: string): Promise<boolean | null> {
    const trimmed = name.trim();
    if (!trimmed) {
      return false;
    }
    const escaped = escapeSqlString(trimmed);
    const res = (await this.rv.RunView(
      {
        EntityName: FORMS_ENTITY.Form,
        ExtraFilter: `IsTemplate = 1 AND LOWER(Name) = LOWER('${escaped}')`,
        ResultType: 'simple',
        Fields: ['ID'],
        MaxRows: 1,
      },
      this.user,
    )) as RunViewResult<{ ID: string }>;
    if (!res.Success) {
      LogError(`Could not check template name "${trimmed}" for duplicates: ${res.ErrorMessage}`);
      return null;
    }
    return res.Results.length > 0;
  }

  /** Load a template's Form row, for fingerprinting it against the form it came from. */
  public async loadTemplateForm(templateId: string): Promise<mjBizAppsFormsFormEntity | null> {
    const form = await this.md.GetEntityObject<mjBizAppsFormsFormEntity>(FORMS_ENTITY.Form, this.user);
    return (await form.Load(templateId)) ? form : null;
  }

  /**
   * Permanently delete a template and everything under it, as ONE database transaction.
   *
   * Children first, in FK order, because nothing cascades. Refuses outright — before deleting
   * anything — if the row is not a template or has any response, version or distribution
   * attached: those are the things that make a form undeletable, and a guard that runs after
   * the first child is gone is not a guard.
   *
   * WHY A TRANSACTION GROUP. This used to delete row by row, awaiting each `Delete()` in turn.
   * Every one of those commits on its own, so a failure partway through — an FK the guard does
   * not cover, a permission denial, a dropped connection between the questions and the pages —
   * left the earlier children permanently gone while the template row itself survived. The
   * gallery then still listed it, and opening it showed a form whose questions had silently
   * evaporated: worse than either outcome the author was choosing between, and unrecoverable,
   * because a delete has no undo. `Metadata.CreateTransactionGroup()` bundles the whole walk into
   * a single provider-side transaction, so the outcomes are exactly "gone" or "untouched".
   *
   * `Delete()` on an entity holding a `TransactionGroup` QUEUES the delete and returns without
   * writing; `Submit()` is what executes them, in the order they were queued. That ordering is
   * why the FK sequence below still matters inside the group.
   *
   * Returns null on success, or a message explaining the refusal or failure.
   */
  public async deleteTemplate(templateId: string): Promise<string | null> {
    const form = await this.md.GetEntityObject<mjBizAppsFormsFormEntity>(FORMS_ENTITY.Form, this.user);
    if (!(await form.Load(templateId))) {
      return `Could not load template ${templateId}.`;
    }
    if (!form.IsTemplate) {
      const message = `"${form.Name}" is a form, not a template, and forms are archived rather than deleted.`;
      LogError(`deleteTemplate refused: ${message}`);
      return message;
    }
    const attached = await this.countAttachedRecords(templateId);
    if (attached !== null) {
      LogError(`deleteTemplate refused for ${templateId}: ${attached}`);
      return attached;
    }

    const group = await this.md.CreateTransactionGroup();
    try {
      // Queued in FK order: options before their questions, every FormID-owned child before the
      // pages and the form itself. Nothing is written until Submit().
      await this.queueOptionDeletes(group, templateId);
      await this.queueChildDeletes<mjBizAppsFormsFormQuestionEntity>(group, FORMS_ENTITY.FormQuestion, templateId);
      await this.queueChildDeletes<mjBizAppsFormsFormAutomationEntity>(group, FORMS_ENTITY.FormAutomation, templateId);
      await this.queueChildDeletes<mjBizAppsFormsFormEntityBindingEntity>(group, FORMS_ENTITY.FormEntityBinding, templateId);
      await this.queueChildDeletes<mjBizAppsFormsFormScreenEntity>(group, FORMS_ENTITY.FormScreen, templateId);
      await this.queueChildDeletes<mjBizAppsFormsFormPageEntity>(group, FORMS_ENTITY.FormPage, templateId);
      form.TransactionGroup = group;
      await form.Delete();
    } catch (err) {
      // Nothing has been written — the group is abandoned unsubmitted, so the template is intact.
      const message = err instanceof Error ? err.message : String(err);
      LogError(`deleteTemplate(${templateId}) failed while preparing the delete: ${message}`);
      return `Could not delete "${form.Name}": ${message}`;
    }

    if (!(await group.Submit())) {
      const detail = form.LatestResult?.CompleteMessage ?? 'the transaction was rolled back';
      LogError(`deleteTemplate(${templateId}) failed on submit: ${detail}`);
      return `Could not delete "${form.Name}": ${detail}. Nothing was removed.`;
    }
    return null;
  }

  /**
   * Whether anything is attached that makes this row undeletable. Returns the reason, or null
   * when the template is clear to remove.
   */
  private async countAttachedRecords(templateId: string): Promise<string | null> {
    const [responses, versions, distributions] = (await this.rv.RunViews([
      { EntityName: FORMS_ENTITY.FormResponse, ExtraFilter: `FormID='${templateId}'`, ResultType: 'simple', Fields: ['ID'] },
      { EntityName: FORMS_ENTITY.FormVersion, ExtraFilter: `FormID='${templateId}'`, ResultType: 'simple', Fields: ['ID'] },
      { EntityName: FORMS_ENTITY.FormDistribution, ExtraFilter: `FormID='${templateId}'`, ResultType: 'simple', Fields: ['ID'] },
    ])) as [RunViewResult<{ ID: string }>, RunViewResult<{ ID: string }>, RunViewResult<{ ID: string }>];

    // A read that FAILED is not a read that found nothing. Refusing here is the safe direction:
    // the alternative is deleting a template whose responses we simply could not see.
    if (!responses.Success || !versions.Success || !distributions.Success) {
      return 'Could not confirm this template has no responses attached, so it was not deleted.';
    }
    if (responses.Results.length > 0) {
      return `This template has ${responses.Results.length} response(s) attached and cannot be deleted.`;
    }
    if (versions.Results.length > 0) {
      return `This template has ${versions.Results.length} published version(s) attached and cannot be deleted.`;
    }
    if (distributions.Results.length > 0) {
      return `This template has ${distributions.Results.length} distribution link(s) attached and cannot be deleted.`;
    }
    return null;
  }

  /** Options hang off questions, not the form, so they are found through the questions. */
  private async queueOptionDeletes(group: TransactionGroupBase, templateId: string): Promise<void> {
    const questions = await this.loadChildren<mjBizAppsFormsFormQuestionEntity>(
      FORMS_ENTITY.FormQuestion,
      `FormID='${templateId}'`,
    );
    if (questions.length === 0) {
      return;
    }
    const inList = questions.map((q) => `'${q.ID}'`).join(',');
    const options = await this.loadChildren<mjBizAppsFormsFormQuestionOptionEntity>(
      FORMS_ENTITY.FormQuestionOption,
      `QuestionID IN (${inList})`,
    );
    await this.queueDeletes(group, options);
  }

  private async queueChildDeletes<T extends DeletableRow>(
    group: TransactionGroupBase,
    entityName: string,
    templateId: string,
  ): Promise<void> {
    await this.queueDeletes(group, await this.loadChildren<T>(entityName, `FormID='${templateId}'`));
  }

  /**
   * Enlist rows in the group and queue their deletes, in the order given.
   *
   * Sequential rather than `Promise.all`: the group executes in the order transactions were
   * added, and that order is the FK order the caller established.
   */
  private async queueDeletes(group: TransactionGroupBase, rows: readonly DeletableRow[]): Promise<void> {
    for (const row of rows) {
      row.TransactionGroup = group;
      await row.Delete();
    }
  }

  private async loadChildren<T>(entityName: string, filter: string): Promise<T[]> {
    const result = await this.rv.RunView<T>(
      { EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object' },
      this.user,
    );
    if (!result.Success) {
      throw new Error(`could not read ${entityName} (${result.ErrorMessage ?? 'unknown error'})`);
    }
    return result.Results ?? [];
  }

}

/** Anything the delete walk removes. */
type DeletableRow =
  | mjBizAppsFormsFormPageEntity
  | mjBizAppsFormsFormQuestionEntity
  | mjBizAppsFormsFormQuestionOptionEntity
  | mjBizAppsFormsFormScreenEntity
  | mjBizAppsFormsFormAutomationEntity
  | mjBizAppsFormsFormEntityBindingEntity;

function countByForm(rows: readonly { FormID: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.FormID, (counts.get(row.FormID) ?? 0) + 1);
  }
  return counts;
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
