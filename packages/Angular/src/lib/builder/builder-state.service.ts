import { Injectable, signal } from '@angular/core';
import { EntitySaveOptions, LogError, Metadata, RunView } from '@memberjunction/core';
import {
  adoptStoredValues,
  FormStructureGraph,
  quoteSqlString,
  questionTypeBehavior,
  type FormQuestionType,
  type mjBizAppsFormsFormEntity,
  type mjBizAppsFormsFormPageEntity,
  type mjBizAppsFormsFormQuestionEntity,
  type mjBizAppsFormsFormQuestionOptionEntity,
  type mjBizAppsFormsFormScreenEntity,
  type mjBizAppsFormsFormStyleEntity,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import type { FormTree, PageNode, QuestionNode } from './builder-models';
import { defaultEndingChanges, defaultEndingId, vacantDefaultEnding } from './default-ending';

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
export type SaveableEntity =
  | mjBizAppsFormsFormEntity
  | mjBizAppsFormsFormStyleEntity
  | mjBizAppsFormsFormPageEntity
  | mjBizAppsFormsFormQuestionEntity
  | mjBizAppsFormsFormQuestionOptionEntity
  | mjBizAppsFormsFormScreenEntity;

/**
 * The part of {@link FormStructureGraph} the builder drives — named so a spec can stand in for it
 * (a real graph needs a live metadata provider, which no unit test here has).
 */
export type StructureGraph = Pick<
  FormStructureGraph,
  | 'StagePage'
  | 'AddPage'
  | 'RemovePage'
  | 'StageQuestion'
  | 'AddQuestion'
  | 'RemoveQuestion'
  | 'StageOption'
  | 'AddOption'
  | 'RemoveOption'
  | 'StageScreen'
  | 'AddScreen'
  | 'RemoveScreen'
  | 'Save'
>;

/**
 * Loads the editable form tree and persists every change to it.
 *
 * Two kinds of write, deliberately different:
 *
 * - FIELD edits (a prompt, a page title, a setting) are single-row saves, coalesced per row by
 *   {@link saveDebounced}. They are saved with `SkipRelatedCollections`, so a row's collections —
 *   which the builder loads — can never turn one field's autosave into a multi-row graph.
 * - STRUCTURAL edits (add, delete, reorder, move, the default-ending pair) touch several rows and
 *   go through ONE {@link FormStructureGraph}: every row the edit touches is staged under the Form
 *   root and saved as one `MJ.SaveEntityGraph` call, in one server transaction. A refusal leaves the
 *   database AND the tree exactly as they were — the graph stages copies, so nothing in memory moves
 *   until the save has committed (spec #303 §3, closes #103). A staged row travels as its key plus
 *   only what the edit sets, so a structural save never writes back a column changed elsewhere.
 *
 * The two meet in one place: a field autosave never runs while a structural save is in flight (see
 * {@link runStructural}), because its payload carries the row's pre-edit `DisplayOrder` and would
 * undo the structural write it raced.
 */
@Injectable()
export class BuilderStateService {
  private readonly md = new Metadata();

  /**
   * Load the full tree for an already-saved Form.
   *
   * Three reads, issued together: the form's `Pages` and `Screens` collections (forced, because a
   * record the host loaded earlier holds whatever was stored THEN), and every question of the form
   * with its `Options` collection batched in by MJ (`IncludeRelatedRecords`, one query for all
   * options rather than one per question). They replaced four sequential reads.
   *
   * A failed read THROWS, naming what failed. It used to come back as an empty list, and an empty
   * page list is what tells the builder to create "Page 1" — so a failed read wrote a page into a
   * form that already had pages.
   */
  public async loadTree(form: mjBizAppsFormsFormEntity): Promise<FormTree> {
    const [questions] = await Promise.all([
      this.loadQuestions(form.ID),
      form.Pages.Load(true),
      form.Screens.Load(true),
    ]);
    const pageNodes: PageNode[] = form.Pages.Items.map((page) => ({
      entity: page,
      questions: questions.filter((q) => q.PageID === page.ID).map(toQuestionNode),
    }));

    // Questions with no PageID land on the first page (defensive — the builder always assigns a
    // PageID, but legacy/imported rows may not).
    const orphans = questions.filter((q) => !q.PageID);
    if (orphans.length > 0 && pageNodes.length > 0) {
      pageNodes[0].questions.push(...orphans.map(toQuestionNode));
      pageNodes[0].questions.sort((a, b) => a.entity.DisplayOrder - b.entity.DisplayOrder);
    }
    return { form, pages: pageNodes, screens: [...form.Screens.Items] };
  }

  private async loadQuestions(formId: string): Promise<mjBizAppsFormsFormQuestionEntity[]> {
    const result = await new RunView().RunView<mjBizAppsFormsFormQuestionEntity>(
      {
        EntityName: FORMS_ENTITY.FormQuestion,
        ExtraFilter: `FormID=${quoteSqlString(formId)}`,
        OrderBy: 'DisplayOrder',
        ResultType: 'entity_object',
        IncludeRelatedRecords: ['Options'],
      },
      this.md.CurrentUser,
    );
    if (!result.Success) {
      throw new Error(`The questions of form ${formId} could not be read: ${result.ErrorMessage || 'no reason given'}`);
    }
    return result.Results ?? [];
  }

  // -------------------------------------------------------------------------
  // Structural edits — one graph save each.
  // -------------------------------------------------------------------------

  /** A new page at the end of the form. */
  public async addPage(tree: FormTree, title: string): Promise<PageNode | undefined> {
    return this.runStructural(tree, 'create page', undefined, async (graph) => {
      const page = await graph.AddPage();
      page.Title = title;
      page.DisplayOrder = tree.pages.length;
      return (await this.commit(graph, 'create page')) ? { entity: page, questions: [] } : undefined;
    });
  }

  /**
   * A new question of `type` at `index` on `page` (the end, by default), with its starter options.
   *
   * The question, its options AND the renumbering of every question it pushes down are one save,
   * so an insert between two questions cannot leave two rows sharing a `DisplayOrder`. Once saved,
   * the node is put into `page.questions` HERE, at the index as it stands when the save runs —
   * the caller does not splice it in, because another structural edit queued ahead of this one may
   * have changed the page by then.
   */
  public async addQuestion(
    tree: FormTree,
    page: PageNode,
    type: FormQuestionType,
    prompt: string,
    index?: number,
  ): Promise<QuestionNode | undefined> {
    return this.runStructural(tree, 'create question', undefined, async (graph) => {
      // The end of the page as it stands when the save runs, unless the caller named a seam.
      const at = Math.max(0, Math.min(index ?? page.questions.length, page.questions.length));
      const stagedPage = await graph.StagePage(page.entity);
      const question = await graph.AddQuestion(stagedPage);
      question.QuestionType = type;
      question.Prompt = prompt;
      question.IsRequired = false;
      question.DisplayOrder = at;
      const after = page.questions.map((n) => n.entity);
      after.splice(at, 0, question);
      await this.stageRenumber(after, (q) => (q === question ? null : graph.StageQuestion(stagedPage, q)));
      const options = await this.seedDefaultOptions(graph, question, type);
      if (!(await this.commit(graph, 'create question'))) {
        return undefined;
      }
      const node: QuestionNode = { entity: question, options };
      page.questions.splice(at, 0, node);
      return node;
    });
  }

  /**
   * Seed starter options appropriate to the type's option mode, in the question's own save.
   *
   * A Matrix seeded with the flat "Option 1 / Option 2" pair renders as a grid with two rows and
   * NO columns — an empty table with no cell to click, which reads as a broken question rather
   * than as one needing configuration. Ranking and PictureChoice are fine with plain options; only
   * the matrix needs both axes present to be a coherent starting point.
   */
  private async seedDefaultOptions(
    graph: StructureGraph,
    question: mjBizAppsFormsFormQuestionEntity,
    type: FormQuestionType,
  ): Promise<mjBizAppsFormsFormQuestionOptionEntity[]> {
    const mode = questionTypeBehavior(type).optionMode;
    if (mode === 'none') {
      return [];
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
    const options: mjBizAppsFormsFormQuestionOptionEntity[] = [];
    for (const [index, seed] of seeds.entries()) {
      const option = await graph.AddOption(question);
      fillOption(option, seed.label, index, seed.axis);
      options.push(option);
    }
    return options;
  }

  /** A new option at the end of a question, put into `node.options` here once it is saved. */
  public async addOption(
    tree: FormTree,
    node: QuestionNode,
    label: string,
    matrixAxis?: 'Row' | 'Column',
  ): Promise<mjBizAppsFormsFormQuestionOptionEntity | undefined> {
    return this.runStructural(tree, 'create option', undefined, async (graph) => {
      const stagedQuestion = await this.stageQuestionOf(graph, tree, node);
      const option = await graph.AddOption(stagedQuestion);
      fillOption(option, label, node.options.length, matrixAxis);
      if (!(await this.commit(graph, 'create option'))) {
        return undefined;
      }
      node.options.push(option);
      return option;
    });
  }

  /**
   * A new Welcome or Ending screen.
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
    return this.runStructural(tree, 'create screen', undefined, async (graph) => {
      const screen = await graph.AddScreen();
      screen.ScreenType = screenType;
      screen.Title = title;
      screen.DisplayOrder = tree.screens.filter((s) => s.ScreenType === screenType).length;
      // A new ending becomes the catch-all when the form does not already have one. The question is
      // "does this form HAVE a default", not "does it have any endings": a form whose only ending
      // is screened out has an ending and no default, and must still get one.
      screen.IsDefault = screenType === 'Ending' && defaultEndingId(tree.screens) === null;
      return (await this.commit(graph, 'create screen')) ? screen : undefined;
    });
  }

  /**
   * Delete a screen and leave the form's ending invariant intact, in ONE save.
   *
   * Deleting the DEFAULT ending leaves the form with none, and the survivor then reads "Never shown
   * — add a condition" on a form where it is the only place a respondent can land. So the survivor
   * that takes the flag is promoted in the same save as the delete: both happen or neither does,
   * and there is no half-state to report or to undo. Takes the tree, and removes the screen from
   * it, because the delete and the repair cannot be separated.
   */
  public async deleteScreen(tree: FormTree, screen: mjBizAppsFormsFormScreenEntity): Promise<boolean> {
    const survivors = tree.screens.filter((s) => s.ID !== screen.ID);
    const promote = vacantDefaultEnding(survivors);
    const deleted = await this.runStructural(tree, 'delete screen', false, async (graph) => {
      graph.RemoveScreen(await graph.StageScreen(screen));
      const promoted = promote ? await graph.StageScreen(promote) : null;
      if (promoted) {
        promoted.IsDefault = true;
      }
      await this.stageRenumber(
        survivors.filter((s) => s.ScreenType === screen.ScreenType),
        (s) => s === promote && promoted ? Promise.resolve(promoted) : graph.StageScreen(s),
      );
      return this.commit(graph, 'delete screen');
    });
    if (deleted) {
      tree.screens = survivors;
    }
    return deleted;
  }

  /**
   * Move the form's default ending to one screen, clearing whichever screens held it — one save.
   *
   * The screens losing the flag are staged before the one gaining it, and the graph writes them in
   * that order: the filtered unique index permits one default per form, so "set the new one"
   * landing first is a save the database refuses. Inside one transaction the order is all that
   * matters, and a refusal leaves both the rows and the builder's flags as they were.
   */
  public async setDefaultEnding(tree: FormTree, screenId: string): Promise<boolean> {
    const changes = defaultEndingChanges(tree.screens, screenId);
    if (changes.set === null && changes.clear.length === 0) {
      return true;
    }
    return this.runStructural(tree, 'change the default ending', false, async (graph) => {
      for (const screen of changes.clear) {
        (await graph.StageScreen(screen)).IsDefault = false;
      }
      if (changes.set !== null) {
        (await graph.StageScreen(changes.set)).IsDefault = true;
      }
      return this.commit(graph, 'change the default ending');
    });
  }

  /** Delete a page and close its order gap; the server cascades its children in the same transaction. */
  public async deletePage(tree: FormTree, page: PageNode): Promise<boolean> {
    return this.runStructural(tree, 'delete page', false, async (graph) => {
      graph.RemovePage(await graph.StagePage(page.entity));
      await this.stageRenumber(tree.pages.filter((p) => p !== page).map((p) => p.entity), (p) => graph.StagePage(p));
      return this.commit(graph, 'delete page');
    });
  }

  /**
   * Delete a question (the server deletes its options with it) and close the gap it leaves in the
   * page's order, in one save. Removes the node from `page.questions` once it is gone.
   */
  public async deleteQuestion(tree: FormTree, page: PageNode, node: QuestionNode): Promise<boolean> {
    return this.runStructural(tree, 'delete question', false, async (graph) => {
      // Read when the save RUNS, not when it was asked for: a delete queued behind another one
      // must renumber, and leave on screen, what the first left — not a list from before it.
      if (!page.questions.includes(node)) {
        return true;
      }
      const survivors = page.questions.filter((q) => q !== node);
      const stagedPage = await graph.StagePage(page.entity);
      graph.RemoveQuestion(stagedPage, await graph.StageQuestion(stagedPage, node.entity));
      await this.stageRenumber(survivors.map((q) => q.entity), (q) => graph.StageQuestion(stagedPage, q));
      if (!(await this.commit(graph, 'delete question'))) {
        return false;
      }
      page.questions = page.questions.filter((q) => q !== node);
      return true;
    });
  }

  /** Delete one option and close the gap in its question's order, in one save. */
  public async deleteOption(
    tree: FormTree,
    node: QuestionNode,
    option: mjBizAppsFormsFormQuestionOptionEntity,
  ): Promise<boolean> {
    return this.runStructural(tree, 'delete option', false, async (graph) => {
      // Read when the save runs — see deleteQuestion.
      if (!node.options.includes(option)) {
        return true;
      }
      const survivors = node.options.filter((o) => o !== option);
      const stagedQuestion = await this.stageQuestionOf(graph, tree, node);
      graph.RemoveOption(stagedQuestion, await graph.StageOption(stagedQuestion, option));
      await this.stageRenumber(survivors, (o) => graph.StageOption(stagedQuestion, o));
      if (!(await this.commit(graph, 'delete option'))) {
        return false;
      }
      node.options = node.options.filter((o) => o !== option);
      return true;
    });
  }

  /** Persist `page.questions`' array order as `DisplayOrder` — every changed row in one save. */
  public async persistQuestionOrder(tree: FormTree, page: PageNode): Promise<boolean> {
    if (!needsRenumber(page.questions.map((q) => q.entity))) {
      return true;
    }
    return this.runStructural(tree, 'reorder questions', false, async (graph) => {
      const stagedPage = await graph.StagePage(page.entity);
      await this.stageRenumber(page.questions.map((q) => q.entity), (q) => graph.StageQuestion(stagedPage, q));
      return this.commit(graph, 'reorder questions');
    });
  }

  /**
   * Persist a question's move to another page, and the renumbering of BOTH pages, as ONE save
   * (issue #149).
   *
   * The caller has already moved it in the in-memory tree — this persists that, it does not decide
   * it. The preconditions are asserted rather than assumed because getting them wrong is silent:
   * renumbering a page the question is still in writes the collision this exists to avoid.
   *
   * Staging the question under the DESTINATION page is the move: the page's collection stamps its
   * `PageID` on save. It used to be one `PageID` write and up to N+M `DisplayOrder` writes, ordered
   * so a failure part-way left a tree that still reloaded; in one transaction there is no part-way.
   */
  public async persistCrossPageMove(
    tree: FormTree,
    node: QuestionNode,
    source: PageNode,
    destination: PageNode,
  ): Promise<boolean> {
    if (source.entity.ID === destination.entity.ID) {
      throw new Error(
        `persistCrossPageMove: source and destination are the same page (${source.entity.ID}); ` +
          'an in-page reorder is persistQuestionOrder.',
      );
    }
    if (destination.questions.indexOf(node) < 0) {
      throw new Error(
        `persistCrossPageMove: question ${node.entity.ID} is not in destination page ` +
          `${destination.entity.ID}; the caller moves it in memory first.`,
      );
    }
    if (source.questions.includes(node)) {
      throw new Error(
        `persistCrossPageMove: question ${node.entity.ID} is still in source page ` +
          `${source.entity.ID}; renumbering it there would write the collision this avoids.`,
      );
    }
    return this.runStructural(tree, 'move question to another section', false, async (graph) => {
      const stagedDestination = await graph.StagePage(destination.entity);
      await this.stageRenumber(
        destination.questions.map((q) => q.entity),
        (q) => graph.StageQuestion(stagedDestination, q),
        node.entity,
      );
      const stagedSource = await graph.StagePage(source.entity);
      await this.stageRenumber(source.questions.map((q) => q.entity), (q) => graph.StageQuestion(stagedSource, q));
      return this.commit(graph, 'move question to another section');
    });
  }

  /** Persist `node.options`' array order as `DisplayOrder` — every changed row in one save. */
  public async persistOptionOrder(tree: FormTree, node: QuestionNode): Promise<boolean> {
    if (!needsRenumber(node.options)) {
      return true;
    }
    return this.runStructural(tree, 'reorder options', false, async (graph) => {
      const stagedQuestion = await this.stageQuestionOf(graph, tree, node);
      await this.stageRenumber(node.options, (o) => graph.StageOption(stagedQuestion, o));
      return this.commit(graph, 'reorder options');
    });
  }

  /**
   * Stage every row whose `DisplayOrder` is not its index in `rows`, and set it on the staged copy.
   *
   * `alwaysStage` is staged even when its order already matches — a moved question still has to be
   * staged under its new page for the move itself to be written. `stage` answers null for a row
   * the graph created in this edit, which is numbered in place.
   */
  private async stageRenumber<T extends { DisplayOrder: number }>(
    rows: readonly T[],
    stage: (row: T) => Promise<T> | null,
    alwaysStage?: T,
  ): Promise<void> {
    for (const [index, row] of rows.entries()) {
      if (row.DisplayOrder === index && row !== alwaysStage) {
        continue;
      }
      const staged = await stage(row);
      (staged ?? row).DisplayOrder = index;
    }
  }

  /** Stage `node`'s question under its staged page — the parents an option edit needs. */
  private async stageQuestionOf(
    graph: StructureGraph,
    tree: FormTree,
    node: QuestionNode,
  ): Promise<mjBizAppsFormsFormQuestionEntity> {
    const page = tree.pages.find((p) => p.questions.includes(node));
    if (!page) {
      throw new Error(`Question ${node.entity.ID} is not on any page of form ${tree.form.ID}.`);
    }
    return graph.StageQuestion(await graph.StagePage(page.entity), node.entity);
  }

  /** Opens the graph a structural edit is staged in. A spec overrides this with a stand-in. */
  protected openGraph(form: mjBizAppsFormsFormEntity): Promise<StructureGraph> {
    return FormStructureGraph.Open(form, Metadata.Provider, this.md.CurrentUser);
  }

  /** The one structural save in flight, or null. Field autosaves wait for it (see the class note). */
  private structuralInFlight: Promise<void> | null = null;
  /** Structural edits run one at a time, in the order they were asked for. */
  private structuralQueue: Promise<unknown> = Promise.resolve();

  /**
   * Run one structural edit: after every pending field save has landed, alone, and with field
   * autosaves held until it finishes.
   *
   * Pending saves are flushed FIRST because a save already in flight carries its row's pre-edit
   * `DisplayOrder` and would undo the structural write if it landed second. (An edit still on its
   * timer is safe either way: the graph stages rows as STORED and never overwrites a field the
   * caller has changed, so that edit is still there to be saved.) Holding later autosaves until the
   * graph has committed, and its rows have adopted the stored values, closes the same race from the
   * other side.
   *
   * A throw while staging (a read the graph needed failed, or a staging mistake) is reported like a
   * refused save — logged, and shown to the author — and answers `failed`.
   */
  private runStructural<T>(
    tree: FormTree,
    action: string,
    failed: T,
    work: (graph: StructureGraph) => Promise<T>,
  ): Promise<T> {
    const run = this.structuralQueue.then(async () => {
      let release = (): void => undefined;
      try {
        await this.flushPendingSaves();
        this.structuralInFlight = new Promise<void>((resolve) => {
          release = resolve;
        });
        return await work(await this.openGraph(tree.form));
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        LogError(`Forms builder failed to ${action} on form ${tree.form.ID}: ${reason}`);
        this._lastFailure.set(`Could not ${action}. ${reason}`);
        return failed;
      } finally {
        this.structuralInFlight = null;
        release();
      }
    });
    // The queue only needs to know the edit has SETTLED; its outcome goes to the caller through `run`.
    this.structuralQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Save the graph; report a refusal to the author. */
  private async commit(graph: StructureGraph, action: string): Promise<boolean> {
    const result = await graph.Save();
    if (result.ok) {
      return true;
    }
    LogError(`Forms builder failed to ${action}: ${result.error}`);
    this._lastFailure.set(`Could not ${action}. ${result.error}`);
    return false;
  }

  // -------------------------------------------------------------------------
  // Field edits — coalesced single-row saves
  // -------------------------------------------------------------------------

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
        // Not awaited, and safe to drop: `saveChecked` reports a refused OR thrown save to the
        // author (`lastFailure`) and the log itself, so this promise never rejects.
        void this.chainSave(entity);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  /**
   * Await every coalesced save, running any still on its timer immediately.
   *
   * Call before anything that reads the PERSISTED form — publishing above all, which the server
   * builds from the stored rows alone, so an edit still on its timer would be missing from the
   * published version.
   */
  public async flushPendingSaves(): Promise<void> {
    for (const [entity, timer] of [...this.saveTimers]) {
      clearTimeout(timer);
      this.saveTimers.delete(entity);
      // Awaited through `saveChains` below; its failure is reported by `saveChecked` (see above).
      void this.chainSave(entity);
    }
    // Loop rather than one `Promise.all`: awaiting a chain can let a queued save start, and the
    // caller asked for "nothing pending", not "nothing pending a moment ago".
    //
    // Capped, because the exit condition depends on something this method does not control:
    // edits arriving during the drain re-arm the debounce and put a new chain in the map. A
    // steady enough stream keeps it non-empty indefinitely, and since publish AWAITS this, an
    // uncapped loop would hang Publish with no error and no way out but a reload.
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
   * Queue a save behind any save already running for the same entity — and behind any structural
   * save in flight — and report whether it stuck.
   */
  private chainSave(entity: SaveableEntity, action = 'save'): Promise<boolean> {
    return this.inQueue(entity, () => this.saveChecked(entity, action));
  }

  /**
   * Re-read one row and take what is stored into it — INSIDE its save chain.
   *
   * Outside the chain, a read could return a row from before a save of the same entity that then
   * committed and resolved first; adopting it would put the pre-save value back into a field the
   * save had just made clean, and the next whole-row save would write it. In the chain, no save of
   * this row runs between the read and the adopt, and saves asked for later run after it. Fields
   * the author has changed since are kept (`adoptStoredValues`).
   *
   * @param read - The stored row, or null when it could not be read (the caller has logged why).
   * @returns Whether the row was read and adopted.
   */
  public adoptStored(entity: SaveableEntity, read: () => Promise<Record<string, unknown> | null>): Promise<boolean> {
    return this.inQueue(entity, async () => {
      const row = await read();
      if (!row) {
        return false;
      }
      adoptStoredValues(entity, row);
      return true;
    });
  }

  /**
   * Run `work` for `entity` behind its earlier queued work and any structural save in flight.
   *
   * The slot waits for the earlier step to SETTLE, never for it to succeed: that step's outcome —
   * a thrown re-read included — already went to its own caller through `result`. Chaining on its
   * success instead made one failure reject every save queued behind it on that row, dropping the
   * author's edits with an unhandled rejection and no `lastFailure` (final review I3).
   */
  private inQueue<T>(entity: SaveableEntity, work: () => Promise<T>): Promise<T> {
    const previous = this.saveChains.get(entity) ?? Promise.resolve();
    const result = previous
      .then(() => this.structuralInFlight ?? undefined)
      .then(work);
    // Settles on BOTH outcomes, which is what makes `previous` above never reject: every slot in the
    // map is one of these. It is also why a rejected step raises no unhandled rejection here.
    const next = result
      .then(
        () => undefined,
        () => undefined,
      )
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
   * nothing outstanding. One signal for every path — field save, autosave, structural save —
   * because a second place to publish from is a second place to forget.
   */
  private readonly _lastFailure = signal<string | null>(null);
  public readonly lastFailure = this._lastFailure.asReadonly();

  /** Clear the reported failure — the author has read it. */
  public dismissFailure(): void {
    this._lastFailure.set(null);
  }

  /**
   * Persist a field edit to one entity now (not debounced) — through the same queue as every other
   * builder write, so it is flushed before a publish, never runs twice at once for one row, and
   * never runs while a structural save is in flight (and vice versa).
   */
  public async save(entity: SaveableEntity): Promise<boolean> {
    return this.chainSave(entity, 'save');
  }

  /**
   * One row's save, never a graph: `SkipRelatedCollections` keeps a row's loaded collections (a
   * question's options, a form's pages) out of a field edit. Without it, a prompt's autosave that
   * happened to find one of its options dirty would ship both as a graph, and MJ would replace the
   * question's option objects with new ones the builder's tree does not hold.
   */
  private async saveChecked(entity: SaveableEntity, action: string): Promise<boolean> {
    const options = new EntitySaveOptions();
    options.SkipRelatedCollections = true;
    let ok: boolean;
    try {
      ok = await entity.Save(options);
    } catch (err) {
      // A THROWN save (a dropped connection, a provider bug) is the same news to the author as a
      // refused one, and most callers never await this: the debounce timer and the flush drop the
      // promise. Reported here, so it reaches the log and the builder's error banner either way.
      const reason = err instanceof Error ? err.message : String(err);
      LogError(`Forms builder failed to ${action}: ${reason}`);
      this._lastFailure.set(`Could not ${action}. ${reason}`);
      return false;
    }
    if (!ok) {
      this.reportFailure(action, entity);
    }
    return ok;
  }

  /**
   * Record a refusal where the AUTHOR can see it, as well as in the log.
   *
   * `BaseEntity` refuses by returning false, never by throwing, so nothing upstream notices
   * unless it is told. The reason is included verbatim rather than softened: this surface is for
   * people who build forms, and "conflicted with a FOREIGN KEY constraint" is the difference
   * between fixing it and filing a bug.
   */
  private reportFailure(action: string, entity: SaveableEntity): void {
    const reason = entity.LatestResult?.CompleteMessage ?? 'unknown error';
    LogError(`Forms builder failed to ${action}: ${reason}`);
    this._lastFailure.set(`Could not ${action}. ${reason}`);
  }
}

function toQuestionNode(question: mjBizAppsFormsFormQuestionEntity): QuestionNode {
  return { entity: question, options: [...question.Options.Items] };
}

function fillOption(
  option: mjBizAppsFormsFormQuestionOptionEntity,
  label: string,
  displayOrder: number,
  matrixAxis?: 'Row' | 'Column',
): void {
  option.Label = label;
  option.DisplayOrder = displayOrder;
  option.IsDefault = false;
  if (matrixAxis) {
    option.MatrixAxis = matrixAxis;
  }
}

/** Whether any row's `DisplayOrder` differs from its index. */
function needsRenumber(rows: readonly { DisplayOrder: number }[]): boolean {
  return rows.some((row, index) => row.DisplayOrder !== index);
}
