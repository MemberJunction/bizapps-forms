import { Injectable } from '@angular/core';
import {
  Metadata,
  RunView,
  LogError,
  type UserInfo,
} from '@memberjunction/core';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  FormQuestionType,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from './entity-names';
import type { FormTree, PageNode, QuestionNode } from './builder-models';
import { questionTypeHasOptions } from './question-type-catalog';

/**
 * Loads and persists the editable form tree (Form + Pages + Questions + Options).
 *
 * The service owns NO global state — it is a stateless set of operations over MJ
 * entity objects, instantiated per builder component. Every create goes through
 * `Metadata.GetEntityObject` (never `new`); every read through `RunView` (checked
 * for `.Success`); every save/delete checks the returned boolean and surfaces the
 * `LatestResult.CompleteMessage` on failure.
 */
@Injectable()
export class BuilderStateService {
  private readonly md = new Metadata();

  private get user(): UserInfo {
    return this.md.CurrentUser;
  }

  /** Load the full form tree for an already-loaded Form entity. */
  public async loadTree(form: mjBizAppsFormsFormEntity): Promise<FormTree> {
    const pages = await this.loadPages(form.ID);
    const questions = await this.loadQuestions(form.ID);
    const optionsByQuestion = await this.loadOptions(questions.map((q) => q.ID));

    const pageNodes: PageNode[] = pages.map((p) => ({
      entity: p,
      questions: questions
        .filter((q) => q.PageID === p.ID)
        .map((q) => this.toQuestionNode(q, optionsByQuestion)),
    }));

    // Questions with no PageID land on the first page (defensive — the builder
    // always assigns a PageID, but legacy/imported rows may not).
    const orphans = questions.filter((q) => !q.PageID);
    if (orphans.length > 0 && pageNodes.length > 0) {
      for (const orphan of orphans) {
        pageNodes[0].questions.push(this.toQuestionNode(orphan, optionsByQuestion));
      }
      this.sortQuestions(pageNodes[0]);
    }

    return { form, pages: pageNodes };
  }

  private toQuestionNode(
    q: mjBizAppsFormsFormQuestionEntity,
    optionsByQuestion: Map<string, mjBizAppsFormsFormQuestionOptionEntity[]>,
  ): QuestionNode {
    return { entity: q, options: optionsByQuestion.get(q.ID) ?? [] };
  }

  private sortQuestions(page: PageNode): void {
    page.questions.sort((a, b) => a.entity.DisplayOrder - b.entity.DisplayOrder);
  }

  private async loadPages(formId: string): Promise<mjBizAppsFormsFormPageEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<mjBizAppsFormsFormPageEntity>(
      {
        EntityName: FORMS_ENTITY.FormPage,
        ExtraFilter: `FormID='${formId}'`,
        OrderBy: 'DisplayOrder',
        ResultType: 'entity_object',
      },
      this.user,
    );
    if (!result.Success) {
      LogError(`Failed to load form pages: ${result.ErrorMessage}`);
      return [];
    }
    return result.Results ?? [];
  }

  private async loadQuestions(formId: string): Promise<mjBizAppsFormsFormQuestionEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<mjBizAppsFormsFormQuestionEntity>(
      {
        EntityName: FORMS_ENTITY.FormQuestion,
        ExtraFilter: `FormID='${formId}'`,
        OrderBy: 'DisplayOrder',
        ResultType: 'entity_object',
      },
      this.user,
    );
    if (!result.Success) {
      LogError(`Failed to load form questions: ${result.ErrorMessage}`);
      return [];
    }
    return result.Results ?? [];
  }

  private async loadOptions(
    questionIds: string[],
  ): Promise<Map<string, mjBizAppsFormsFormQuestionOptionEntity[]>> {
    const byQuestion = new Map<string, mjBizAppsFormsFormQuestionOptionEntity[]>();
    if (questionIds.length === 0) {
      return byQuestion;
    }
    const idList = questionIds.map((id) => `'${id}'`).join(',');
    const rv = new RunView();
    const result = await rv.RunView<mjBizAppsFormsFormQuestionOptionEntity>(
      {
        EntityName: FORMS_ENTITY.FormQuestionOption,
        ExtraFilter: `QuestionID IN (${idList})`,
        OrderBy: 'DisplayOrder',
        ResultType: 'entity_object',
      },
      this.user,
    );
    if (!result.Success) {
      LogError(`Failed to load question options: ${result.ErrorMessage}`);
      return byQuestion;
    }
    for (const opt of result.Results ?? []) {
      const list = byQuestion.get(opt.QuestionID) ?? [];
      list.push(opt);
      byQuestion.set(opt.QuestionID, list);
    }
    return byQuestion;
  }

  // -------------------------------------------------------------------------
  // Mutations — each returns the new entity (already saved) or a boolean.
  // -------------------------------------------------------------------------

  /** Create + save a new page at the end of the form. */
  public async addPage(tree: FormTree, title: string): Promise<PageNode | undefined> {
    const page = await this.md.GetEntityObject<mjBizAppsFormsFormPageEntity>(
      FORMS_ENTITY.FormPage,
      this.user,
    );
    page.NewRecord();
    page.FormID = tree.form.ID;
    page.Title = title;
    page.DisplayOrder = tree.pages.length;
    if (!(await this.saveChecked(page, 'create page'))) {
      return undefined;
    }
    return { entity: page, questions: [] };
  }

  /** Create + save a new question of the given type at the end of a page. */
  public async addQuestion(
    tree: FormTree,
    page: PageNode,
    type: FormQuestionType,
    prompt: string,
  ): Promise<QuestionNode | undefined> {
    const question = await this.md.GetEntityObject<mjBizAppsFormsFormQuestionEntity>(
      FORMS_ENTITY.FormQuestion,
      this.user,
    );
    question.NewRecord();
    question.FormID = tree.form.ID;
    question.PageID = page.entity.ID;
    question.QuestionType = type;
    question.Prompt = prompt;
    question.IsRequired = false;
    question.DisplayOrder = page.questions.length;
    if (!(await this.saveChecked(question, 'create question'))) {
      return undefined;
    }

    const node: QuestionNode = { entity: question, options: [] };
    if (questionTypeHasOptions(type)) {
      await this.seedDefaultOptions(node);
    }
    return node;
  }

  /** Seed two starter options for a newly-added choice question. */
  private async seedDefaultOptions(node: QuestionNode): Promise<void> {
    const first = await this.addOption(node, 'Option 1');
    const second = await this.addOption(node, 'Option 2');
    if (first) {
      node.options.push(first);
    }
    if (second) {
      node.options.push(second);
    }
  }

  /** Create + save a new option at the end of a question. */
  public async addOption(
    node: QuestionNode,
    label: string,
  ): Promise<mjBizAppsFormsFormQuestionOptionEntity | undefined> {
    const option = await this.md.GetEntityObject<mjBizAppsFormsFormQuestionOptionEntity>(
      FORMS_ENTITY.FormQuestionOption,
      this.user,
    );
    option.NewRecord();
    option.QuestionID = node.entity.ID;
    option.Label = label;
    option.DisplayOrder = node.options.length;
    option.IsDefault = false;
    if (!(await this.saveChecked(option, 'create option'))) {
      return undefined;
    }
    return option;
  }

  /** Persist an entity that the UI has mutated in place. */
  public async save(
    entity:
      | mjBizAppsFormsFormEntity
      | mjBizAppsFormsFormPageEntity
      | mjBizAppsFormsFormQuestionEntity
      | mjBizAppsFormsFormQuestionOptionEntity,
  ): Promise<boolean> {
    return this.saveChecked(entity, 'save');
  }

  /** Delete a page and all its questions/options (cascade handled in order). */
  public async deletePage(page: PageNode): Promise<boolean> {
    for (const q of [...page.questions]) {
      if (!(await this.deleteQuestion(q))) {
        return false;
      }
    }
    return this.deleteChecked(page.entity, 'delete page');
  }

  /** Delete a question and all its options. */
  public async deleteQuestion(node: QuestionNode): Promise<boolean> {
    for (const opt of [...node.options]) {
      if (!(await this.deleteChecked(opt, 'delete option'))) {
        return false;
      }
    }
    return this.deleteChecked(node.entity, 'delete question');
  }

  /** Delete a single option. */
  public async deleteOption(option: mjBizAppsFormsFormQuestionOptionEntity): Promise<boolean> {
    return this.deleteChecked(option, 'delete option');
  }

  /** Renumber + persist DisplayOrder on a page's questions to match array order. */
  public async persistQuestionOrder(page: PageNode): Promise<boolean> {
    let ok = true;
    for (let i = 0; i < page.questions.length; i++) {
      const q = page.questions[i].entity;
      if (q.DisplayOrder !== i) {
        q.DisplayOrder = i;
        ok = (await this.saveChecked(q, 'reorder question')) && ok;
      }
    }
    return ok;
  }

  /** Renumber + persist DisplayOrder on a question's options to match array order. */
  public async persistOptionOrder(node: QuestionNode): Promise<boolean> {
    let ok = true;
    for (let i = 0; i < node.options.length; i++) {
      const opt = node.options[i];
      if (opt.DisplayOrder !== i) {
        opt.DisplayOrder = i;
        ok = (await this.saveChecked(opt, 'reorder option')) && ok;
      }
    }
    return ok;
  }

  // -------------------------------------------------------------------------
  // Internal checked save/delete (CLAUDE.md: check the boolean + LatestResult).
  // -------------------------------------------------------------------------

  private async saveChecked(
    entity: Parameters<BuilderStateService['save']>[0],
    action: string,
  ): Promise<boolean> {
    const ok = await entity.Save();
    if (!ok) {
      LogError(`Forms builder failed to ${action}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return ok;
  }

  private async deleteChecked(
    entity: Parameters<BuilderStateService['save']>[0],
    action: string,
  ): Promise<boolean> {
    const ok = await entity.Delete();
    if (!ok) {
      LogError(`Forms builder failed to ${action}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return ok;
  }
}
