import { Injectable, signal } from '@angular/core';
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
  mjBizAppsFormsFormScreenEntity,
  FormQuestionType,
} from '@mj-biz-apps/forms-entities';
import { questionTypeBehavior } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';

/**
 * How long an edit waits for a follow-up before it is written.
 *
 * Short enough that a save always lands well before an author reaches for Publish, long enough to
 * swallow a burst of keystrokes across sibling fields — which is the burst that used to lose data.
 */
const SAVE_DEBOUNCE_MS = 400;

/**
 * How many times {@link BuilderStateService.flushPendingSaves} will drain the save chains before
 * giving up.
 *
 * Generous on purpose — a real flush finishes in one or two passes, and every extra pass here
 * costs nothing unless something is genuinely re-queueing without end.
 */
const MAX_FLUSH_PASSES = 50;

/** Anything the builder persists in place. */
type SaveableEntity =
  | mjBizAppsFormsFormEntity
  | mjBizAppsFormsFormPageEntity
  | mjBizAppsFormsFormQuestionEntity
  | mjBizAppsFormsFormQuestionOptionEntity
  | mjBizAppsFormsFormScreenEntity;

import type { FormTree, PageNode, QuestionNode } from './builder-models';

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
    const screens = await this.loadScreens(form.ID);

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

    return { form, pages: pageNodes, screens };
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

  private async loadScreens(formId: string): Promise<mjBizAppsFormsFormScreenEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<mjBizAppsFormsFormScreenEntity>(
      {
        EntityName: FORMS_ENTITY.FormScreen,
        ExtraFilter: `FormID='${formId}'`,
        OrderBy: 'DisplayOrder',
        ResultType: 'entity_object',
      },
      this.user,
    );
    if (!result.Success) {
      // A failed read is NOT "this form has no screens", and the difference bites: `addScreen`
      // guards against a second Welcome by looking for an existing one in this list, and computes
      // a new Ending's `IsDefault` as "no Ending exists yet". An empty list defeats both.
      //
      // Reported rather than thrown, deliberately. `loadPages`, `loadQuestions` and `loadOptions`
      // all answer a failed read the same way, and `loadTree`'s caller does not catch — so
      // throwing only here would take the whole builder down over the least important of the
      // four, while a failed QUESTIONS read still loaded fine. Making all four fail loudly is the
      // right fix and is bigger than this change; tracked rather than half-done here.
      LogError(`Failed to load form screens: ${result.ErrorMessage}`);
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
    await this.seedDefaultOptions(node, type);
    return node;
  }

  /**
   * Seed starter options appropriate to the type's option mode.
   *
   * A Matrix seeded with the flat "Option 1 / Option 2" pair renders as a grid with two rows and
   * NO columns — an empty table with no cell to click, which reads as a broken question rather
   * than as one needing configuration. Ranking and PictureChoice are fine with plain options; only
   * the matrix needs both axes present to be a coherent starting point.
   */
  private async seedDefaultOptions(node: QuestionNode, type: FormQuestionType): Promise<void> {
    const mode = questionTypeBehavior(type).optionMode;
    if (mode === 'none') {
      return;
    }
    const seeds: ReadonlyArray<{ label: string; axis?: 'Row' | 'Column' }> =
      mode === 'matrix'
        ? [
            { label: 'Row 1', axis: 'Row' },
            { label: 'Row 2', axis: 'Row' },
            { label: 'Column 1', axis: 'Column' },
            { label: 'Column 2', axis: 'Column' },
          ]
        : [{ label: 'Option 1' }, { label: 'Option 2' }];

    for (const seed of seeds) {
      const option = await this.addOption(node, seed.label, seed.axis);
      if (option) {
        node.options.push(option);
      }
    }
  }

  /** Create + save a new option at the end of a question. */
  public async addOption(
    node: QuestionNode,
    label: string,
    matrixAxis?: 'Row' | 'Column',
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
    if (matrixAxis) {
      option.MatrixAxis = matrixAxis;
    }
    if (!(await this.saveChecked(option, 'create option'))) {
      return undefined;
    }
    return option;
  }

  /**
   * Create + save a Welcome or Ending screen.
   *
   * A second Welcome screen is refused here rather than left to the database: the filtered unique
   * index does reject it, but as a duplicate-key error with no indication of which of the author's
   * two clicks was the problem. The form only has room for one, so the honest answer is to hand
   * back the one that already exists.
   */
  public async addScreen(
    tree: FormTree,
    screenType: 'Welcome' | 'Ending',
    title: string,
  ): Promise<mjBizAppsFormsFormScreenEntity | undefined> {
    if (screenType === 'Welcome') {
      const existing = tree.screens.find((s) => s.ScreenType === 'Welcome');
      if (existing) {
        return existing;
      }
    }
    const screen = await this.md.GetEntityObject<mjBizAppsFormsFormScreenEntity>(
      FORMS_ENTITY.FormScreen,
      this.user,
    );
    screen.NewRecord();
    screen.FormID = tree.form.ID;
    screen.ScreenType = screenType;
    screen.Title = title;
    screen.DisplayOrder = tree.screens.filter((s) => s.ScreenType === screenType).length;
    // The first ending an author creates is the catch-all. Without this a form whose only ending
    // carries a condition silently shows nothing when the condition misses.
    screen.IsDefault = screenType === 'Ending' && !tree.screens.some((s) => s.ScreenType === 'Ending');
    if (!(await this.saveChecked(screen, 'create screen'))) {
      return undefined;
    }
    return screen;
  }

  /** Delete a screen. Screens own nothing, so there is no cascade. */
  public async deleteScreen(screen: mjBizAppsFormsFormScreenEntity): Promise<boolean> {
    return this.deleteChecked(screen, 'delete screen');
  }

  // -------------------------------------------------------------------------
  // Coalesced saves
  // -------------------------------------------------------------------------

  /**
   * Pending debounced saves, keyed by the entity instance being saved.
   *
   * A `Map` keyed by the object rather than by ID, because two different entity types can share
   * an id space only by accident but the same OBJECT is exactly what must not be saved twice
   * concurrently.
   */
  /** Debounce timers, keyed by the entity instance awaiting a write. */
  private readonly saveTimers = new Map<SaveableEntity, ReturnType<typeof setTimeout>>();

  /**
   * The in-flight save chain per entity.
   *
   * Keyed by the OBJECT, not by id: two entity types can share an id space by accident, but the
   * same object is exactly what must never be saved twice at once.
   */
  private readonly saveChains = new Map<SaveableEntity, Promise<void>>();

  /**
   * Persist an entity the UI has mutated in place, coalescing rapid edits into one save.
   *
   * WHY THIS EXISTS. Every edit used to call {@link save} directly, and two edits landing in the
   * same tick — which is what filling in a question's four Opinion-scale settings looks like —
   * raced and SILENTLY LOST the second one. `BaseEntity.Save()` re-reads the record from the row
   * it gets back, so a value written while a save was in flight is overwritten the moment that
   * save returns; the template then re-renders from the entity and wipes the input too, so the
   * author watches their own typing disappear with no error anywhere. Reproduced deterministically
   * in the running Explorer: two `change` events in one tick, second value gone from both the
   * input and the database.
   *
   * Serializing alone would NOT fix it — a queued save starts from an entity the previous save has
   * already reset. Coalescing does: the timer restarts on every edit, so one save eventually runs
   * against the entity's final state. The chain below then guarantees that even a flush arriving
   * mid-write cannot start a second concurrent save of the same record.
   */
  public saveDebounced(entity: SaveableEntity): void {
    const existing = this.saveTimers.get(entity);
    if (existing) {
      clearTimeout(existing);
    }
    this.saveTimers.set(
      entity,
      setTimeout(() => {
        this.saveTimers.delete(entity);
        void this.chainSave(entity);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  /**
   * Await every coalesced save, running any still on its timer immediately.
   *
   * Call before anything that reads the PERSISTED form — publishing above all. The builder's
   * in-memory tree is always current, so a pending save never changes what gets published; what it
   * changes is whether the database agrees with it afterwards.
   */
  public async flushPendingSaves(): Promise<void> {
    for (const [entity, timer] of [...this.saveTimers]) {
      clearTimeout(timer);
      this.saveTimers.delete(entity);
      void this.chainSave(entity);
    }
    // Loop rather than one `Promise.all`: awaiting a chain can let a queued save start, and the
    // caller asked for "nothing pending", not "nothing pending a moment ago".
    //
    // Capped, because the exit condition depends on something this method does not control:
    // edits arriving during the drain re-arm the debounce and put a new chain in the map. A
    // steady enough stream keeps it non-empty indefinitely, and since publish AWAITS this, an
    // uncapped loop would hang Publish with no error and no way out but a reload. No path in the
    // builder saves on save today, so the cap is a backstop rather than a fix for a live hang —
    // but "no caller does this yet" is not something a loop should rely on.
    for (let pass = 0; pass < MAX_FLUSH_PASSES && this.saveChains.size > 0; pass++) {
      await Promise.all([...this.saveChains.values()]);
    }
    if (this.saveChains.size > 0) {
      // Surfaced, never swallowed: the caller is about to publish, and it has to be able to say
      // that what it publishes may not match what is stored.
      this._lastFailure.set(
        'Some changes were still being saved and could not be confirmed. Reload the builder and check the form before sharing it.',
      );
    }
  }

  /** Queue a save behind any save already running for the same entity. */
  private chainSave(entity: SaveableEntity): Promise<void> {
    const previous = this.saveChains.get(entity) ?? Promise.resolve();
    const next = previous
      .then(() => this.saveChecked(entity, 'save'))
      .then(() => undefined)
      .finally(() => {
        // Only clear the slot if no later edit has chained onto it meanwhile.
        if (this.saveChains.get(entity) === next) {
          this.saveChains.delete(entity);
        }
      });
    this.saveChains.set(entity, next);
    return next;
  }

  /**
   * The most recent mutation the database refused, phrased for the author, or null when there is
   * nothing outstanding. One signal for every path — direct save, debounced autosave, delete —
   * because they all funnel through the same two checked helpers, and a second place to publish
   * from is a second place to forget.
   */
  private readonly _lastFailure = signal<string | null>(null);
  public readonly lastFailure = this._lastFailure.asReadonly();

  /** Clear the reported failure — the author has read it. */
  public dismissFailure(): void {
    this._lastFailure.set(null);
  }

  /** Persist an entity that the UI has mutated in place. */
  public async save(entity: SaveableEntity): Promise<boolean> {
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
      this.reportFailure(action, entity);
    }
    return ok;
  }

  private async deleteChecked(
    entity: Parameters<BuilderStateService['save']>[0],
    action: string,
  ): Promise<boolean> {
    const ok = await entity.Delete();
    if (!ok) {
      this.reportFailure(action, entity);
    }
    return ok;
  }

  /**
   * Record a refusal where the AUTHOR can see it, as well as in the log.
   *
   * `BaseEntity` refuses by returning false, never by throwing, so nothing upstream notices
   * unless it is told — and until this existed, nothing told it. A delete looked like a button
   * that did nothing; an autosave looked like nothing at all, and the edit the author had just
   * typed was simply gone. The reason is included verbatim rather than softened: this surface is
   * for people who build forms, and "conflicted with a FOREIGN KEY constraint" is the difference
   * between fixing it and filing a bug.
   */
  private reportFailure(action: string, entity: Parameters<BuilderStateService['save']>[0]): void {
    const reason = entity.LatestResult?.CompleteMessage ?? 'unknown error';
    LogError(`Forms builder failed to ${action}: ${reason}`);
    this._lastFailure.set(`Could not ${action}. ${reason}`);
  }
}
