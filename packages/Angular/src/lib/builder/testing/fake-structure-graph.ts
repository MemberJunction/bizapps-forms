/**
 * A stand-in for `FormStructureGraph`, for specs of `BuilderStateService`.
 *
 * The real graph needs a live metadata provider (its rows are generated entity classes), which no
 * unit test here has; what it does against a real database is proven by the opt-in integration
 * spec in forms-core-entities-server. This fake keeps the three properties the builder RELIES on,
 * so a spec can catch the builder breaking them:
 *
 *  1. Staging hands back a KEY-ONLY HANDLE, as the real graph does: `{ ID }` plus whatever the edit
 *     sets on it, which is all that ships. Mutating it changes nothing the caller holds until the
 *     save commits — so a refused save leaves the tree exactly as it was — and a field the edit did
 *     not set is never written from the caller's copy (fix round 1 of #303 Task 10a).
 *  2. The save is all or nothing, against a {@link FakeStore} that holds what is "stored": the
 *     staged writes are applied in staging order to a scratch copy, and committed only if every
 *     one is accepted.
 *  3. The FORM ROOT is written too, as MJ writes a parent whose children changed — with nothing
 *     from the caller, because the real root is its key alone.
 *  4. After a commit, every row staged from the caller's tree — the form included — takes the
 *     stored values back (the real graph's `adoptStoredValues`), and rows the graph created are the
 *     caller's to keep.
 *
 * The store can refuse a row (`refuse`) and can model the one-default-ending-per-form unique index
 * (`enforceOneDefaultEnding`), so ORDER inside a save is observable the way the database sees it.
 *
 * Excluded from the build (`src/**\/testing/**`).
 */
import { BuilderStateService, type StructureGraph } from '../builder-state.service';
import type { FormTree } from '../builder-models';
import type { mjBizAppsFormsFormEntity } from '@mj-biz-apps/forms-entities';

/** A row as these specs build it: a plain object carrying whatever columns the test needs. */
export type FakeRow = { ID: string; DisplayOrder: number } & Record<string, unknown>;

type Kind = 'page' | 'question' | 'option' | 'screen';

interface StagedRow {
  kind: Kind;
  /** The caller's row this was copied from; null for a row the graph created. */
  origin: FakeRow | null;
  copy: FakeRow;
  removed: boolean;
  /** The staged parent (page for a question, question for an option). */
  parent: FakeRow | null;
}

/** What the "database" holds, and how it refuses. */
export class FakeStore {
  /** Stored rows by id. */
  public readonly rows = new Map<string, FakeRow>();
  /** Ids whose write (save or delete) the store refuses, with the reason. */
  public readonly refuse = new Map<string, string>();
  /** Model `UQ_FormScreen_OneDefaultEndingPerForm`: at most one stored Ending with IsDefault. */
  public enforceOneDefaultEnding = false;
  /** When set, the next graph save waits on it before writing — a save held in flight. */
  public hold: Promise<void> | null = null;
  /** Every save that reached the store, in order: one entry per graph save. */
  public readonly saves: { written: string[]; deleted: string[] }[] = [];

  /** Seed stored rows from the tree's rows (a snapshot, not the same objects). */
  public seed(...rows: FakeRow[]): this {
    for (const row of rows) {
      this.rows.set(row.ID, { ...row });
    }
    return this;
  }

  public stored(id: string): FakeRow | undefined {
    return this.rows.get(id);
  }
}

let created = 0;

export class FakeStructureGraph {
  public readonly staged: StagedRow[] = [];
  public saved = false;

  constructor(
    private readonly store: FakeStore,
    /** The caller's form row, which the root stands for. */
    private readonly form: FakeRow | null = null,
  ) {}

  /** The graph as the builder's port type. */
  public asPort(): StructureGraph {
    return this as unknown as StructureGraph;
  }

  public async StagePage(page: FakeRow): Promise<FakeRow> {
    return this.stage('page', page, null);
  }
  public async AddPage(): Promise<FakeRow> {
    return this.add('page', null);
  }
  public RemovePage(staged: FakeRow): void {
    this.remove(staged);
  }
  public async StageQuestion(page: FakeRow, question: FakeRow): Promise<FakeRow> {
    const copy = this.stage('question', question, page);
    copy['PageID'] = page.ID;
    return copy;
  }
  public async AddQuestion(page: FakeRow): Promise<FakeRow> {
    const question = this.add('question', page);
    question['PageID'] = page.ID;
    return question;
  }
  public RemoveQuestion(_page: FakeRow, staged: FakeRow): void {
    this.remove(staged);
  }
  public async StageOption(question: FakeRow, option: FakeRow): Promise<FakeRow> {
    return this.stage('option', option, question);
  }
  public async AddOption(question: FakeRow): Promise<FakeRow> {
    const option = this.add('option', question);
    option['QuestionID'] = question.ID;
    return option;
  }
  public RemoveOption(_question: FakeRow, staged: FakeRow): void {
    this.remove(staged);
  }
  public async StageScreen(screen: FakeRow): Promise<FakeRow> {
    return this.stage('screen', screen, null);
  }
  public async AddScreen(): Promise<FakeRow> {
    return this.add('screen', null);
  }
  public RemoveScreen(staged: FakeRow): void {
    this.remove(staged);
  }

  /** All or nothing, in staging order; then the caller's rows take the stored values back. */
  public async Save(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (this.saved) {
      throw new Error('FakeStructureGraph: saved twice');
    }
    this.saved = true;
    if (this.store.hold) {
      const held = this.store.hold;
      this.store.hold = null;
      await held;
    }
    const scratch = new Map([...this.store.rows].map(([id, row]) => [id, { ...row }]));
    const written: string[] = [];
    const deleted: string[] = [];
    for (const row of this.staged) {
      const refusal = this.store.refuse.get(row.copy.ID);
      if (refusal) {
        return { ok: false, error: refusal };
      }
      if (row.removed) {
        scratch.delete(row.copy.ID);
        deleted.push(row.copy.ID);
        continue;
      }
      // A handle ships its key and what the edit set; the row is otherwise as STORED, not as the
      // caller last read it. A created row ships every column it was given.
      scratch.set(row.copy.ID, { ...(scratch.get(row.copy.ID) ?? {}), ...row.copy });
      written.push(row.copy.ID);
      if (this.store.enforceOneDefaultEnding && twoDefaults(scratch)) {
        return { ok: false, error: `Cannot insert duplicate key in UQ_FormScreen_OneDefaultEndingPerForm (${row.copy.ID})` };
      }
    }
    this.store.rows.clear();
    for (const [id, row] of scratch) {
      this.store.rows.set(id, row);
    }
    this.store.saves.push({ written, deleted });
    for (const row of this.staged) {
      if (row.origin && !row.removed) {
        Object.assign(row.origin, this.store.rows.get(row.copy.ID));
      }
    }
    // The root: written as stored (nothing of the caller's ships), and the caller's form adopts it.
    const storedForm = this.form ? this.store.rows.get(this.form.ID) : undefined;
    if (this.form && storedForm) {
      Object.assign(this.form, storedForm);
    }
    return { ok: true };
  }

  private stage(kind: Kind, origin: FakeRow, parent: FakeRow | null): FakeRow {
    if (this.staged.some((s) => s.origin === origin)) {
      throw new Error(`FakeStructureGraph: ${origin.ID} staged twice`);
    }
    if (parent && !this.staged.some((s) => s.copy === parent)) {
      throw new Error(`FakeStructureGraph: the parent of ${origin.ID} was not staged in this graph`);
    }
    // Key only — exactly what the real graph's handle carries before the edit sets anything.
    const copy = { ID: origin.ID } as FakeRow;
    this.staged.push({ kind, origin, copy, removed: false, parent });
    return copy;
  }

  private add(kind: Kind, parent: FakeRow | null): FakeRow {
    created += 1;
    const copy: FakeRow = { ID: `new-${kind}-${created}`, DisplayOrder: -1 };
    this.staged.push({ kind, origin: null, copy, removed: false, parent });
    return copy;
  }

  private remove(staged: FakeRow): void {
    const row = this.staged.find((s) => s.copy === staged);
    if (!row) {
      throw new Error(`FakeStructureGraph: ${staged.ID} is not a staged copy`);
    }
    row.removed = true;
  }
}

function twoDefaults(rows: Map<string, FakeRow>): boolean {
  return [...rows.values()].filter((r) => r['ScreenType'] === 'Ending' && r['IsDefault'] === true).length > 1;
}

/**
 * `BuilderStateService` with its graphs drawn from a {@link FakeStore}. Every structural edit
 * opens one graph, so `graphs.length` is the number of graph saves an edit asked for.
 */
export class GraphedBuilderState extends BuilderStateService {
  public readonly graphs: FakeStructureGraph[] = [];

  constructor(public readonly store: FakeStore = new FakeStore()) {
    super();
  }

  protected override openGraph(form: mjBizAppsFormsFormEntity): Promise<StructureGraph> {
    const graph = new FakeStructureGraph(this.store, form as unknown as FakeRow);
    this.graphs.push(graph);
    return Promise.resolve(graph.asPort());
  }
}

/** A page of the tree, with its questions and their options, as plain rows. */
export interface FakePageSpec {
  id: string;
  order?: number;
  questions?: { id: string; order?: number; options?: { id: string; order?: number }[] }[];
}

/**
 * A tree of plain rows, cast to the builder's types — and the same rows seeded into a store, so
 * "what is stored" starts equal to "what is on screen", as it does after a load.
 */
export function fakeTree(
  pages: FakePageSpec[],
  screens: FakeRow[] = [],
  store: FakeStore = new FakeStore(),
): { tree: FormTree; store: FakeStore } {
  const form: FakeRow = { ID: 'form-1', DisplayOrder: 0, Name: 'Intake', Status: 'Draft' };
  store.seed(form);
  const pageNodes = pages.map((p, pi) => {
    const page: FakeRow = { ID: p.id, DisplayOrder: p.order ?? pi, FormID: 'form-1' };
    store.seed(page);
    return {
      entity: page,
      questions: (p.questions ?? []).map((q, qi) => {
        const question: FakeRow = { ID: q.id, DisplayOrder: q.order ?? qi, PageID: p.id, FormID: 'form-1', Prompt: `Prompt ${q.id}` };
        store.seed(question);
        const options = (q.options ?? []).map((o, oi) => {
          const option: FakeRow = { ID: o.id, DisplayOrder: o.order ?? oi, QuestionID: q.id, Label: o.id };
          store.seed(option);
          return option;
        });
        return { entity: question, options };
      }),
    };
  });
  store.seed(...screens);
  return { tree: { form, pages: pageNodes, screens } as unknown as FormTree, store };
}
