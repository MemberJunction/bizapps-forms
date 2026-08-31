import { Injectable, signal } from '@angular/core';
import {
  Metadata,
  RunView,
  LogError,
  type TransactionGroupBase,
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

/**
 * Anything a structural change deletes.
 *
 * Narrower than {@link SaveableEntity} on purpose: these three are the tree the cascade walks, and
 * a Form or a Screen appearing in a delete plan would mean the caller built the wrong list.
 */
type DeletableEntity =
  | mjBizAppsFormsFormPageEntity
  | mjBizAppsFormsFormQuestionEntity
  | mjBizAppsFormsFormQuestionOptionEntity;

/** A row whose position among its siblings is stored as `DisplayOrder`. */
type SequencedEntity = mjBizAppsFormsFormQuestionEntity | mjBizAppsFormsFormQuestionOptionEntity;

/** Whether a transaction group committed, and the reason it did not. */
type CommitOutcome = { Committed: boolean; Detail: string | null };

import type { FormTree, PageNode, QuestionNode } from './builder-models';
import { defaultEndingChanges, defaultEndingId, vacantDefaultEnding } from './default-ending';

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
    // A new ending becomes the catch-all when the form does not already have one. Without this a
    // form whose only ending carries a condition silently shows nothing when the condition misses.
    //
    // The question is "does this form HAVE a default", not "does it have any endings" — which is
    // what it used to ask, and the two differ exactly where it matters: a form whose only ending
    // is screened out has an ending and no default, so the next one added was left un-flagged and
    // the form kept no catch-all at all.
    screen.IsDefault = screenType === 'Ending' && defaultEndingId(tree.screens) === null;
    if (!(await this.saveChecked(screen, 'create screen'))) {
      return undefined;
    }
    return screen;
  }

  /**
   * Delete a screen and leave the form's ending invariant intact.
   *
   * Takes the tree, and removes the screen from it, because the two cannot be separated: deleting
   * the DEFAULT ending leaves the form with none, and the survivor then reads "Never shown — add
   * a condition" on a form where it is the only place a respondent can land. Handing the caller a
   * boolean and letting it splice the tree itself is what made that possible — the repair had no
   * obvious owner, so nobody did it.
   *
   * Screens own nothing, so there is still no cascade; the only follow-on is the promotion.
   */
  public async deleteScreen(
    tree: FormTree,
    screen: mjBizAppsFormsFormScreenEntity,
  ): Promise<boolean> {
    if (!(await this.deleteChecked(screen, 'delete screen'))) {
      return false;
    }
    tree.screens = tree.screens.filter((s) => s.ID !== screen.ID);
    const promote = vacantDefaultEnding(tree.screens);
    if (promote === null) {
      return true;
    }
    promote.IsDefault = true;
    // Reported but not fatal: the screen IS deleted, and saying otherwise would offer an undo
    // that cannot happen. `saveChecked` has already surfaced why the promotion did not stick.
    //
    // The flag comes back off when it does not stick, though. Left on, the builder shows a
    // catch-all the database never recorded — the form reads as repaired while every respondent
    // who finishes still falls through to the confirmation message.
    if (!(await this.chainSave(promote, 'promote default ending'))) {
      promote.IsDefault = false;
    }
    return true;
  }

  /**
   * Move the form's default ending to one screen, clearing whichever screens held it.
   *
   * NOT `saveDebounced`, and that is the whole reason this method exists rather than the caller
   * flipping two flags. The debounce keys a timer per entity OBJECT with no ordering between
   * them, so the two writes could land in either order — and a filtered unique index permits one
   * default per form, so "set the new one" landing first is a save the database REFUSES. The
   * author sees a switch that flipped itself back, with the failure reported against the wrong
   * screen. Cleared first, awaited, then set.
   *
   * Every write goes through {@link chainSave} rather than saving directly, for the reason the
   * chain exists: `BaseEntity.Save()` re-reads the record from the row it gets back, so a save
   * running concurrently with a pending autosave of the SAME screen overwrites whichever landed
   * first. Making a screen the default while its title edit is still settling is an ordinary
   * thing to do, and it used to be the one case that skipped the queue.
   *
   * Returns false if any write fails, and puts the form back the way it was — in the database via
   * {@link restoreDefaultEnding}, and in memory, so the builder does not go on showing a move
   * that did not happen. `saveChecked` has already surfaced why.
   */
  public async setDefaultEnding(tree: FormTree, screenId: string): Promise<boolean> {
    const changes = defaultEndingChanges(tree.screens, screenId);
    const cleared: mjBizAppsFormsFormScreenEntity[] = [];
    for (const screen of changes.clear) {
      screen.IsDefault = false;
      if (!(await this.chainSave(screen, 'clear default ending'))) {
        // The row still holds the flag, so the builder must too. Dropped in memory BEFORE the
        // save is attempted, a refused clear otherwise leaves the author looking at a form with
        // no default while the database has one, and nothing later corrects it.
        screen.IsDefault = true;
        return false;
      }
      cleared.push(screen);
    }
    if (changes.set === null) {
      return true;
    }
    changes.set.IsDefault = true;
    if (await this.chainSave(changes.set, 'set default ending')) {
      return true;
    }
    await this.restoreDefaultEnding(changes.set, cleared);
    return false;
  }

  /**
   * Put the default back after a move that got halfway.
   *
   * The two halves of this invariant fail differently, and only one of them is noisy. The unique
   * index refuses a SECOND default, so a bad `set` is reported; NOTHING refuses a form with none,
   * which is exactly what a successful clear followed by a refused set leaves behind. Without
   * this the method's own contract — "leaves the form as it was" — was false in the one case it
   * was written for.
   *
   * ONE screen is restored, never all of them. `clear` holds more than one row only on a form
   * that was already carrying several defaults, and re-setting those would ask the index to
   * accept the very state it exists to refuse. The first is the lowest `DisplayOrder`, because
   * `defaultEndingChanges` orders them the way `resolveEndingScreen` reads them — so the row that
   * comes back is the one respondents were already landing on.
   *
   * Best effort, and deliberately not retried: if the restore is refused too, `saveChecked` has
   * reported it and the author has to fix the form by hand. Looping here would spin on a database
   * that is saying no.
   */
  private async restoreDefaultEnding(
    failed: mjBizAppsFormsFormScreenEntity,
    cleared: readonly mjBizAppsFormsFormScreenEntity[],
  ): Promise<void> {
    failed.IsDefault = false;
    const restore = cleared[0];
    if (restore === undefined) {
      return;
    }
    restore.IsDefault = true;
    await this.chainSave(restore, 'restore default ending');
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

  /**
   * Queue a save behind any save already running for the same entity, and report whether it stuck.
   *
   * The boolean is what lets the default-ending writes use this instead of calling `saveChecked`
   * directly. They have to know: moving the default is two writes whose order the unique index
   * enforces, so a caller that cannot tell the first one failed will go on to make the second.
   */
  private chainSave(entity: SaveableEntity, action = 'save'): Promise<boolean> {
    const previous = this.saveChains.get(entity) ?? Promise.resolve();
    const result = previous.then(() => this.saveChecked(entity, action));
    const next = result
      .then(() => undefined)
      .finally(() => {
        // Only clear the slot if no later edit has chained onto it meanwhile.
        if (this.saveChains.get(entity) === next) {
          this.saveChains.delete(entity);
        }
      });
    this.saveChains.set(entity, next);
    return result;
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

  /**
   * Delete a page with everything under it, as one transaction.
   *
   * The list is built deepest-first — every option, then its question, then the page — because a
   * foreign key points at each row from the ones that must go before it.
   */
  public async deletePage(page: PageNode): Promise<boolean> {
    if (!(await this.beginStructuralChange())) {
      return false;
    }
    const rows: DeletableEntity[] = [];
    for (const question of page.questions) {
      rows.push(...question.options, question.entity);
    }
    rows.push(page.entity);
    return this.deleteAsOneTransaction(rows, 'delete page');
  }

  /** Delete a question and all its options, as one transaction. */
  public async deleteQuestion(node: QuestionNode): Promise<boolean> {
    if (!(await this.beginStructuralChange())) {
      return false;
    }
    return this.deleteAsOneTransaction([...node.options, node.entity], 'delete question');
  }

  /**
   * Drain anything the debounce is still holding, and report whether it is safe to restructure.
   *
   * A field edit sits on a 400ms timer. Restructuring the tree while one is pending races it: the
   * pending save may target a row this transaction is about to delete, and whichever lands second
   * fails, reporting against a record the author has already moved on from.
   *
   * Compared against the failure signal's value BEFORE the flush, not against null. A refusal the
   * author has not yet dismissed is still sitting on that signal, and treating it as a reason to
   * refuse every later delete would make the builder progressively unusable after one unrelated
   * foreign-key error.
   */
  private async beginStructuralChange(): Promise<boolean> {
    const before = this._lastFailure();
    await this.flushPendingSaves();
    return this._lastFailure() === before;
  }

  /**
   * Delete rows as ONE database transaction, in the order given.
   *
   * A `TransactionGroup` rather than `entity.Delete()`, and the difference is the whole of issue
   * #103. Declaring the children as an owned `RelatedRecordCollection` and letting `Delete()`
   * cascade looks like the framework-native answer, but core says otherwise in its own doc comment
   * on `deleteGraph`: a delete graph has no remote counterpart, so on a client provider "the nodes
   * execute in order over ordinary mutations. That is not atomic — a failure partway leaves earlier
   * deletions committed." That is the defect, relocated. `GraphQLTransactionGroup` bundles every
   * enlisted mutation into one `ExecuteTransactionGroup` call the server runs inside a real
   * database transaction, so a refusal rolls back all of it.
   *
   * MJ's own guide calls a transaction group "NOT a composite-save engine" and points parent/child
   * work at an entity graph instead. Its four objections are all about SAVES — no primary key after
   * the parent, no read-your-writes, `Save()` returning true early, no dependency graph — and a
   * delete needs none of them: no key is minted, nothing is read back, and the ordering is a flat
   * deepest-first list this method builds itself. The third objection does bite, which is why
   * failure here is read from `Submit()` and the notification stream, never from `Delete()`'s
   * return value.
   *
   * The cost is the message. A refused group reports "Transaction failed to commit" against every
   * row rather than the specific constraint — the provider asks the server for `ErrorMessages` and
   * then discards them — so the detail survives only on the throw path, where the notification
   * carries it. Worth it: a wrong-but-specific message about a half-deleted page describes a state
   * the product should never have been able to reach.
   */
  private async deleteAsOneTransaction(rows: DeletableEntity[], action: string): Promise<boolean> {
    const group = await this.md.CreateTransactionGroup();
    for (const row of rows) {
      row.TransactionGroup = group;
      // `IsGraphNodeDelete` means "this is one node of a plan somebody already built", and here
      // that somebody is this method. Without it, a row whose owned collection happens to be
      // loaded takes BaseEntity's own graph path — which never reaches the provider's
      // transaction-group deferral, silently undoing everything above.
      //
      // On a newer core this should become `SkipRelatedCollections: true`, which says the same
      // thing without borrowing the graph executor's private vocabulary; MJ's transactions guide
      // names the save-path equivalent of this flag an anti-pattern for exactly that reason. That
      // option does not exist at our pin (6.1.0-edge.2) — check for it on the next MJ upgrade.
      if (!(await row.Delete({ IsGraphNodeDelete: true }))) {
        this.reportFailure(action, row);
        return false;
      }
    }

    const outcome = await this.submitGroup(group);
    if (outcome.Committed) {
      return true;
    }
    // Reported against the row the author acted on — the last one, since the list is deepest-first.
    // Every row in a refused group carries the same generic message, so there is no better one to
    // pick, and naming an option the author never touched would only confuse.
    this.reportFailure(action, rows[rows.length - 1], outcome.Detail);
    return false;
  }

  /**
   * Submit a transaction group, and recover the reason when it refuses.
   *
   * The reason needs recovering because nothing else carries it: a refused group stamps the same
   * generic "Transaction failed to commit" on every enlisted record, and the server's
   * `ErrorMessages` are asked for by the provider's mutation and then dropped on the floor. The
   * notification stream is what is left, and it carries a real error on the throw path — a dropped
   * connection, a rejected mutation. On an ordinary refusal it stays quiet and the caller falls
   * back to the record's own `LatestResult`.
   *
   * The subscription is released in a `finally` so a throwing submit cannot leak it.
   */
  private async submitGroup(group: TransactionGroupBase): Promise<CommitOutcome> {
    let detail: string | null = null;
    const notifications = group.TransactionNotifications$.subscribe((status) => {
      if (!status.success && status.error) {
        detail = status.error instanceof Error ? status.error.message : String(status.error);
      }
    });
    try {
      const committed = await group.Submit();
      return { Committed: committed, Detail: committed ? null : detail };
    } finally {
      notifications.unsubscribe();
    }
  }

  /** Delete a single option. */
  public async deleteOption(option: mjBizAppsFormsFormQuestionOptionEntity): Promise<boolean> {
    return this.deleteChecked(option, 'delete option');
  }

  /** Renumber + persist DisplayOrder on a page's questions to match array order. */
  public async persistQuestionOrder(page: PageNode): Promise<boolean> {
    if (!(await this.beginStructuralChange())) {
      return false;
    }
    return this.persistSequence(
      page.questions.map((q) => q.entity),
      'reorder question',
    );
  }

  /** Renumber + persist DisplayOrder on a question's options to match array order. */
  public async persistOptionOrder(node: QuestionNode): Promise<boolean> {
    if (!(await this.beginStructuralChange())) {
      return false;
    }
    return this.persistSequence(node.options, 'reorder option');
  }

  /**
   * Renumber rows to match their array order and persist the move as one transaction.
   *
   * Only rows that actually moved are written — `DisplayOrder` is compared against the position
   * before anything is assigned — which is the one virtue the row-at-a-time loop this replaces
   * had. What it lacked was rollback: a refusal halfway left `DisplayOrder` matching neither the
   * old order nor the new one, in the database AND in memory, with no way back.
   *
   * A transaction group is the right mechanism here rather than a borrowed one. These are sibling
   * rows with no structural relationship to each other, which is precisely what MJ's guide says a
   * group is for; the parent is not written at all.
   *
   * The in-memory values are restored on refusal. Without that the builder keeps rendering the new
   * order — the tree it draws from is not put back either — so the author is looking at an
   * arrangement the database never accepted and has no reason to doubt it.
   */
  private async persistSequence(rows: SequencedEntity[], action: string): Promise<boolean> {
    const moved = rows
      .map((entity, position) => ({ entity, position, previous: entity.DisplayOrder }))
      .filter((row) => row.previous !== row.position);
    if (moved.length === 0) {
      return true; // a drag that ended where it started: no rows to write, no round trip to make
    }

    for (const row of moved) {
      row.entity.DisplayOrder = row.position;
    }
    const group = await this.md.CreateTransactionGroup();
    for (const row of moved) {
      row.entity.TransactionGroup = group;
      // Not checked: under a group `Save()` returns true before anything is written. The commit
      // is the only place that knows, which is why the outcome is read from `submitGroup`.
      await row.entity.Save();
    }

    const outcome = await this.submitGroup(group);
    if (outcome.Committed) {
      return true;
    }
    for (const row of moved) {
      row.entity.DisplayOrder = row.previous;
    }
    this.reportFailure(action, moved[0].entity, outcome.Detail);
    return false;
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
   *
   * @param detail - An explicit reason, for the one caller that has a better one than the entity
   *                 does: a transaction group attaches only a generic message to its rows, while
   *                 the real error arrives on the group's notification stream.
   */
  private reportFailure(
    action: string,
    entity: Parameters<BuilderStateService['save']>[0],
    detail?: string | null,
  ): void {
    const reason = detail ?? entity.LatestResult?.CompleteMessage ?? 'unknown error';
    LogError(`Forms builder failed to ${action}: ${reason}`);
    this._lastFailure.set(`Could not ${action}. ${reason}`);
  }
}
