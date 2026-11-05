/**
 * One structural edit to a form's authored tree, committed as ONE unit of work through the Form root.
 *
 * WHAT IT IS FOR. Adding, deleting and reordering pages, questions, options and screens are
 * multi-row writes: deleting a page deletes its questions and their options, a reorder rewrites
 * every sibling's `DisplayOrder`, a cross-page move rewrites two pages, and moving the default
 * ending clears one row and sets another under a one-per-form unique index. The builder used to
 * issue those as separate saves, so a failure part-way left the tree half-changed (spec #303 §3).
 * Here every row an edit touches is staged under a Form root through the generated related-record
 * collections (`Form.Pages`, `Form.Screens`, `FormPage.Questions`, `FormQuestion.Options`), and the
 * root's one `Save()` commits them together: in the browser MJ ships the whole graph as one
 * `MJ.SaveEntityGraph` remote operation, which the server runs in one transaction; on a server
 * provider the same executor runs locally in one transaction. Either way it is all or nothing.
 *
 * WHY A TRANSIENT ROOT, AND STAGED COPIES. Two properties of MJ's graph save decide the shape:
 *  1. A collection serializes EVERY item it holds, and the server re-loads each one by key. A
 *     root holding the whole tree would ship and re-read every row of the form for a one-row edit.
 *     So the root here is a fresh copy of the form, and its collections hold only the rows this
 *     edit touches.
 *  2. After a remote graph save, MJ REPLACES the collections' items with new objects built from the
 *     server's result. Objects the caller holds (the builder's tree) are never updated in place, so
 *     staging the caller's own objects would strand them: still marked unsaved, re-inserted by the
 *     next save. So the graph stages its own HANDLES for the caller's rows, and after a successful
 *     save writes the stored state back into the caller's rows itself (see {@link adoptStoredValues}).
 *
 * KEY-ONLY HANDLES — what travels is what the edit changes, never what the caller last saw.
 * `MJ.SaveEntityGraph` loads every shipped row and then applies EVERY field it was sent, and a row
 * whose collection holds work is written whether or not its own fields changed. A root built from
 * the builder's copy of the form therefore wrote the form's whole row back from the builder's last
 * read on every reorder: a rename committed meanwhile was reverted, and a form archived from another
 * tab came back as Draft (proven against SQL Server; see the opt-in
 * `form-structure-graph.integration.spec.ts`). So the root, and every staged handle, starts as its
 * primary key ALONE: every other field is not-loaded, which `GetAll()` — what the wire carries —
 * omits. A handle then carries exactly the fields the edit sets on it (`DisplayOrder`, `PageID`,
 * `IsDefault`), so the server applies those over the row as it is stored now and leaves every other
 * column as it found it. The row is still re-written with its stored values (MJ writes a parent
 * whose children changed), so the remaining exposure is the moment between the server reading the
 * row and its transaction writing it — not the life of the builder's tab.
 *
 * A removed row ships only its key; the server re-loads it and runs its own delete, which cascades
 * through the collections it loads there (a page's questions; `FormQuestionEntityServer` loads a
 * question's options before deleting it). So a removal never needs the client to hold the subtree.
 *
 * SINGLE USE. Stage, then `Save()` once. A graph is not reusable after a save, failed or not.
 */
import { BaseEntity, type IMetadataProvider, type RelatedRecordCollection, type UserInfo } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  mjBizAppsFormsFormScreenEntity,
} from './generated/entity_subclasses';

/** Every row this graph stages: all four structural entities carry an `ID` and a `DisplayOrder`. */
type StructureRow = BaseEntity & { ID: string; DisplayOrder: number };

/** How the root reaches the database. `root.Save()` everywhere except a spec standing in for the wire. */
export type StructureGraphCommit = (root: mjBizAppsFormsFormEntity) => Promise<boolean>;

/** The outcome of {@link FormStructureGraph.Save}. `error` is the database's or validator's reason. */
export type StructureSaveResult = { ok: true } | { ok: false; error: string };

/**
 * The rows one collection will hold for the save, kept apart from the collection until then.
 *
 * Held apart because the collection's own `Add` and `Remove` renumber every item's `DisplayOrder`
 * by its index (the generated collections declare a `Sequence`), and a staged collection holds only
 * the rows an edit touches — so index-renumbering would write wrong orders over rows that were
 * never meant to move. {@link materialize} fills the collection in one step and then puts every
 * handle back to exactly what the edit set on it.
 */
class StagedRows {
  public readonly items: StructureRow[] = [];
  public readonly removed: StructureRow[] = [];

  constructor(public readonly collection: RelatedRecordCollection<StructureRow>) {}

  public async materialize(): Promise<void> {
    // What each item ships, taken BEFORE the collection's own renumbering touches it. For a staged
    // handle that is its key plus the fields the edit set; for a created row, every column.
    const intended = this.items.map((row) => ({ fields: row.GetAll() as Record<string, unknown>, order: row.DisplayOrder }));
    this.collection.SetLoadedItems([...this.items, ...this.removed]);
    for (const row of this.removed) {
      this.collection.Remove(row);
    }
    for (const [index, row] of this.items.entries()) {
      if (!row.IsSaved) {
        row.DisplayOrder = intended[index].order;
        continue;
      }
      // Re-hydrated from the snapshot: fields it does not name go back to not-loaded, so a
      // `DisplayOrder` the renumbering set on a handle the edit never reordered does not ship.
      await row.LoadFromData(intended[index].fields, false);
    }
  }
}

export class FormStructureGraph {
  /** Every collection something was staged into, in staging order. */
  private readonly stagings: StagedRows[] = [];
  /** Staged copy → the caller's row it was copied from (the root's is the form record). */
  private readonly origins = new Map<BaseEntity, BaseEntity>();
  /** Rows this graph created, which become saved rows in place after a successful save. */
  private readonly created: StructureRow[] = [];
  private state: 'open' | 'saving' | 'done' = 'open';

  private constructor(
    private readonly root: mjBizAppsFormsFormEntity,
    private readonly provider: IMetadataProvider,
    private readonly user: UserInfo | undefined,
  ) {}

  /**
   * Open a graph for one structural edit of `form`.
   *
   * The root is the form's KEY and nothing else (see the class note): the structural edit sends
   * none of the form's own columns, so it can neither carry a field edit still waiting on its own
   * autosave nor put back a value someone else has written since the builder read the row.
   */
  public static async Open(
    form: mjBizAppsFormsFormEntity,
    provider: IMetadataProvider,
    user?: UserInfo,
  ): Promise<FormStructureGraph> {
    if (!form?.IsSaved) {
      throw new Error(
        `FormStructureGraph: form ${form?.ID ?? '(none)'} has never been saved, so it has no stored rows to change. Save the form first.`,
      );
    }
    const root = await provider.GetEntityObject<mjBizAppsFormsFormEntity>(form.EntityInfo.Name, user);
    await root.LoadFromData(keyOf(form), true);
    const graph = new FormStructureGraph(root, provider, user);
    graph.origins.set(root, form);
    return graph;
  }

  /** The transient root the edit is staged under — read it, never save it directly. */
  public get Root(): mjBizAppsFormsFormEntity {
    return this.root;
  }

  // --- pages -------------------------------------------------------------------------------------

  /** Stage an existing page so it (or its questions) can change. Returns its handle (key only) to edit. */
  public StagePage(page: mjBizAppsFormsFormPageEntity): Promise<mjBizAppsFormsFormPageEntity> {
    return this.stage(this.root, this.root.Pages, page);
  }

  /** A new page on the form. The caller sets its fields; the keys that place it are set here. */
  public async AddPage(): Promise<mjBizAppsFormsFormPageEntity> {
    const page = await this.create(this.root, this.root.Pages);
    page.FormID = this.root.ID;
    return page;
  }

  /** Delete a staged page; the server deletes its questions and their options with it. */
  public RemovePage(staged: mjBizAppsFormsFormPageEntity): void {
    this.remove(this.root.Pages, staged);
  }

  // --- questions ---------------------------------------------------------------------------------

  /**
   * Stage an existing question under a STAGED page. Staging it under a page other than its own is a
   * move: its `PageID` becomes that page's.
   */
  public async StageQuestion(
    page: mjBizAppsFormsFormPageEntity,
    question: mjBizAppsFormsFormQuestionEntity,
  ): Promise<mjBizAppsFormsFormQuestionEntity> {
    const staged = await this.stage(page, page.Questions, question);
    staged.PageID = page.ID;
    return staged;
  }

  /**
   * A new question on a staged page. `FormID` is set here because the collection stamps only its
   * own join field (`PageID`), and the column is required.
   */
  public async AddQuestion(page: mjBizAppsFormsFormPageEntity): Promise<mjBizAppsFormsFormQuestionEntity> {
    const question = await this.create(page, page.Questions);
    question.FormID = this.root.ID;
    question.PageID = page.ID;
    return question;
  }

  /** Delete a staged question; the server deletes its options with it. */
  public RemoveQuestion(page: mjBizAppsFormsFormPageEntity, staged: mjBizAppsFormsFormQuestionEntity): void {
    this.remove(page.Questions, staged);
  }

  // --- options -----------------------------------------------------------------------------------

  /** Stage an existing option under a STAGED question. */
  public StageOption(
    question: mjBizAppsFormsFormQuestionEntity,
    option: mjBizAppsFormsFormQuestionOptionEntity,
  ): Promise<mjBizAppsFormsFormQuestionOptionEntity> {
    return this.stage(question, question.Options, option);
  }

  /** A new option on a staged (or newly added) question. */
  public async AddOption(question: mjBizAppsFormsFormQuestionEntity): Promise<mjBizAppsFormsFormQuestionOptionEntity> {
    const option = await this.create(question, question.Options);
    option.QuestionID = question.ID;
    return option;
  }

  public RemoveOption(question: mjBizAppsFormsFormQuestionEntity, staged: mjBizAppsFormsFormQuestionOptionEntity): void {
    this.remove(question.Options, staged);
  }

  // --- screens -----------------------------------------------------------------------------------

  /**
   * Stage an existing screen. Screens are written in STAGING ORDER, which matters for the default
   * ending: stage the screens losing the flag before the one gaining it, so the one-default index
   * never sees two.
   */
  public StageScreen(screen: mjBizAppsFormsFormScreenEntity): Promise<mjBizAppsFormsFormScreenEntity> {
    return this.stage(this.root, this.root.Screens, screen);
  }

  public async AddScreen(): Promise<mjBizAppsFormsFormScreenEntity> {
    const screen = await this.create(this.root, this.root.Screens);
    screen.FormID = this.root.ID;
    return screen;
  }

  public RemoveScreen(staged: mjBizAppsFormsFormScreenEntity): void {
    this.remove(this.root.Screens, staged);
  }

  // --- commit ------------------------------------------------------------------------------------

  /**
   * Commit everything staged, as one unit of work.
   *
   * On success the caller's own rows hold what was stored: every row staged from one adopts the
   * stored values of the fields the caller has not changed since (an edit typed while the save was
   * in flight is kept, not overwritten), and every row this graph created becomes a saved row in
   * place. On failure nothing was written and the caller's rows are untouched.
   *
   * @param commit - How the root is saved. Omitted: `root.Save()`, which from the browser is one
   *   `MJ.SaveEntityGraph`. A caller on a provider with its own transactions must pass one that sends
   *   the root through `SaveEntityGraphOperation` (the opt-in integration spec does).
   */
  public async Save(commit?: StructureGraphCommit): Promise<StructureSaveResult> {
    if (this.state !== 'open') {
      throw new Error('FormStructureGraph: this graph was already saved; open a new one for the next edit.');
    }
    if (!commit && this.root.ProviderToUse?.SupportsEntityTransactions === true) {
      // `root.Save()` on a provider with its own transactions runs the graph LOCALLY, over these
      // key-only handles rather than rows the server rebuilt from the wire — and nothing here has
      // proven what a provider writes for a handle's not-loaded columns. The builder saves from the
      // browser, where `root.Save()` is one `MJ.SaveEntityGraph`; a server caller passes a commit.
      throw new Error(
        'FormStructureGraph: on a provider with entity transactions, pass a commit that sends the root through MJ.SaveEntityGraph.',
      );
    }
    this.state = 'saving';
    try {
      for (const staged of this.stagings) {
        await staged.materialize();
      }
      if (!this.root.Dirty) {
        return { ok: true };
      }
      if (!(await (commit ?? ((root: mjBizAppsFormsFormEntity) => root.Save()))(this.root))) {
        return { ok: false, error: this.root.LatestResult?.CompleteMessage || 'the save was refused with no reason given' };
      }
      return await this.applySaved();
    } finally {
      this.state = 'done';
    }
  }

  /**
   * Write the stored state back into the caller's rows, after checking the save returned them.
   *
   * The check is a postcondition, not paranoia: a created row the result does not contain would be
   * left looking unsaved, and the next save would insert it a second time.
   */
  private async applySaved(): Promise<StructureSaveResult> {
    const stored = storedRowsOf(this.root);
    const missing = this.created.filter((row) => !stored.has(normalizedId(row.ID)));
    if (missing.length > 0) {
      return {
        ok: false,
        error:
          `The change was saved, but the server did not return ${missing.length} new row(s) ` +
          `(${missing.map((r) => `${r.EntityInfo.Name} ${r.ID}`).join(', ')}). Reload the form before editing it further.`,
      };
    }
    for (const row of this.created) {
      const saved = stored.get(normalizedId(row.ID));
      if (saved) {
        await row.LoadFromData(saved.GetAll(), true);
      }
    }
    for (const [copy, origin] of this.origins) {
      const saved = copy === this.root ? this.root : stored.get(normalizedId(String(origin.FirstPrimaryKey?.Value ?? '')));
      if (saved) {
        adoptStoredValues(origin, saved.GetAll());
      }
    }
    return { ok: true };
  }

  // --- staging internals -------------------------------------------------------------------------

  private async stage<T extends StructureRow>(
    owner: BaseEntity,
    collection: RelatedRecordCollection<T>,
    row: T,
  ): Promise<T> {
    this.assertOpen();
    this.assertStagedOwner(owner, collection.Name);
    if (!row?.IsSaved) {
      throw new Error(
        `FormStructureGraph: ${row?.EntityInfo?.Name ?? 'row'} ${row?.ID ?? ''} has never been saved, so it cannot be staged as an existing row.`,
      );
    }
    const rows = this.rowsOf(collection);
    if ([...this.origins.values()].includes(row)) {
      // Two copies of one row would race each other in the same save, and the later one would win
      // silently. Staging a row is done once per edit; keep the copy the first call returned.
      throw new Error(`FormStructureGraph: ${row.EntityInfo.Name} ${row.ID} is already staged in this graph.`);
    }
    const copy = await this.provider.GetEntityObject<T>(row.EntityInfo.Name, this.user);
    await copy.LoadFromData(keyOf(row), true);
    this.origins.set(copy, row);
    rows.items.push(copy);
    return copy;
  }

  private async create<T extends StructureRow>(owner: BaseEntity, collection: RelatedRecordCollection<T>): Promise<T> {
    this.assertOpen();
    this.assertStagedOwner(owner, collection.Name);
    const row = await this.provider.GetEntityObject<T>(collection.RelatedEntityName, this.user);
    row.NewRecord();
    this.rowsOf(collection).items.push(row);
    this.created.push(row);
    return row;
  }

  private remove<T extends StructureRow>(collection: RelatedRecordCollection<T>, staged: T): void {
    this.assertOpen();
    const rows = this.rowsOf(collection);
    const index = rows.items.indexOf(staged);
    if (index < 0) {
      throw new Error(
        `FormStructureGraph: ${staged?.EntityInfo?.Name ?? 'row'} ${staged?.ID ?? ''} is not staged in '${collection.Name}'. ` +
          'Remove the staged copy this graph returned, not the row it was copied from.',
      );
    }
    rows.items.splice(index, 1);
    if (staged.IsSaved) {
      rows.removed.push(staged);
      return;
    }
    // Created and removed in the same edit: it never reached the database, so there is nothing to delete.
    this.created.splice(this.created.indexOf(staged), 1);
  }

  private rowsOf<T extends StructureRow>(collection: RelatedRecordCollection<T>): StagedRows {
    const existing = this.stagings.find((s) => s.collection === collection);
    if (existing) {
      return existing;
    }
    const rows = new StagedRows(collection);
    this.stagings.push(rows);
    return rows;
  }

  /**
   * Refuse to stage under a row this graph does not own.
   *
   * Passing the caller's own page where its staged copy belongs would stage into the CALLER's
   * collection — mutating the builder's tree and saving nothing. That mistake is silent, so it is
   * refused here instead.
   */
  private assertStagedOwner(owner: BaseEntity, collectionName: string): void {
    if (owner === this.root || this.origins.has(owner) || this.created.some((row) => row === owner)) {
      return;
    }
    throw new Error(
      `FormStructureGraph: '${collectionName}' belongs to a row this graph did not stage. ` +
        'Stage the parent first and pass the copy it returns.',
    );
  }

  private assertOpen(): void {
    if (this.state !== 'open') {
      throw new Error('FormStructureGraph: this graph was already saved; open a new one for the next edit.');
    }
  }
}

/**
 * Every row the saved root's collections hold, by id. After a save these are the server's result
 * rows (in the browser MJ rebuilds them from the result; on a server provider they are the rows
 * that were written).
 */
function storedRowsOf(root: mjBizAppsFormsFormEntity): Map<string, BaseEntity> {
  const rows = new Map<string, BaseEntity>();
  const keep = (row: { ID: string } & BaseEntity) => rows.set(normalizedId(row.ID), row);
  for (const page of root.Pages.Items) {
    keep(page);
    for (const question of page.Questions.Items) {
      keep(question);
      question.Options.Items.forEach(keep);
    }
  }
  root.Screens.Items.forEach(keep);
  return rows;
}

/**
 * A row's primary key and nothing else, as a hydration source: loading an entity from it leaves
 * every other field not-loaded, so `GetAll()` — and therefore the wire — carries only the key.
 */
function keyOf(row: BaseEntity): Record<string, unknown> {
  return Object.fromEntries(row.PrimaryKey.KeyValuePairs.map((pair) => [pair.FieldName, pair.Value]));
}

/** SQL Server returns uniqueidentifiers upper-case; a client-minted one may be lower-case. */
function normalizedId(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Make `target` reflect `stored` — a row as the database now holds it — for every field the caller
 * has not changed.
 *
 * Old values are replaced too, so the row is clean against what is stored. Without that, its next
 * autosave sends every column back as the caller last saw it — a pre-edit `DisplayOrder` (or
 * `PageID`, `IsDefault`, or a `Status` the server moved) — and quietly undoes a write made
 * elsewhere. A field the caller HAS changed keeps the caller's value: it is an edit made while the
 * other write was in flight, and its own autosave is about to send it.
 *
 * Read-only columns (`__mj_UpdatedAt`) accept a value only once after creation, so their guard is
 * reset first, as MJ's own reload does.
 *
 * Exported for the other writer the builder has to catch up with: a Remote Operation that changes
 * the open form's row on the server (publishing moves `Form.Status`).
 */
export function adoptStoredValues(target: BaseEntity, stored: Record<string, unknown>): void {
  const values: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(stored)) {
    const field = target.GetFieldByName(name);
    if (!field || field.Dirty) {
      continue;
    }
    field.ResetNeverSetFlag();
    values[name] = value;
  }
  target.SetMany(values, true, true, true);
}
