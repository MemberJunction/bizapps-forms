/**
 * The builder's verbs, EXECUTED: publish, save-as-template, an option's own edit, inserting at a
 * seam, a refused reorder, and the header's share-link reach (spec #303 DW18).
 *
 * These replace source-regex guards (`publish-reach.wiring`, the publish section of
 * `rule-badges.wiring`, `option-persistence.wiring`, the insert path in `insert-affordance.wiring`)
 * that were pinned to code #303 moved: publishing and cloning are Remote Operations now, the
 * structural writes are one graph save each, and the share-link header hears operations through
 * `shared/forms-writes.ts`. The component turned out to construct in this node environment once
 * its injected services are stubbed (`runInInjectionContext`), so what used to be read out of its
 * source can simply be run.
 *
 * The operations go through the REAL generated classes and `runOperation`; only the provider they
 * route through is faked (`shared/testing/fake-operations.ts`). Plain reads go through a mocked
 * `RunView` that answers by entity name.
 */
import '@angular/compiler';
import { ChangeDetectorRef, ElementRef, Injector, runInInjectionContext } from '@angular/core';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { FormStateService } from '@memberjunction/ng-base-forms';
import type { RunViewParams } from '@memberjunction/core';
import type {
  ConditionalRule,
  FormQuestionType,
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
} from '@mj-biz-apps/forms-entities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brokenRuleLines, brokenRuleRefusal } from '@mj-biz-apps/forms-entities/contracts';
import { adoptStoredValues } from '@mj-biz-apps/forms-entities';
import { installFakeOperations, refused, succeeded, type FakeOperations } from '../shared/testing/fake-operations';
import type { FormTree, PageNode, QuestionNode } from './builder-models';
import type { ShareLinkFacts } from './share-state';

/** Rows the mocked RunView answers with, by entity name. */
const views = new Map<string, unknown[]>();
/** The template-lookup answer (`IsTemplate = 1` reads of Forms), kept apart from other Form reads. */
let templateRows: unknown[] = [];
const viewsAsked: RunViewParams[] = [];

// `afterNextRender` needs the renderer's own manager, which a component built outside a view does not
// have; the focus move it schedules is not under test here.
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return { ...actual, afterNextRender: () => ({ destroy: () => undefined }) };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class RunView {
    public async RunView(params: RunViewParams) {
      viewsAsked.push(params);
      const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
      if (params.EntityName === 'MJ_BizApps_Forms: Forms' && filter.includes('IsTemplate = 1')) {
        return { Success: true, Results: templateRows, ErrorMessage: '' };
      }
      return { Success: true, Results: views.get(params.EntityName ?? '') ?? [], ErrorMessage: '' };
    }
    public async RunViews(params: RunViewParams[]) {
      return Promise.all(params.map((p) => this.RunView(p)));
    }
  }
  return { ...actual, RunView, LogError: () => undefined, LogStatus: () => undefined };
});

const { FormBuilderComponent } = await import('./form-builder.component');
const { BuilderStateService } = await import('./builder-state.service');
const { DesignStateService } = await import('./design-state.service');
const { DistributionService } = await import('./distribution.service');
const { announceWrites } = await import('../shared/forms-writes');

const FORMS = 'MJ_BizApps_Forms: Forms';
const DISTRIBUTIONS = 'MJ_BizApps_Forms: Form Distributions';

// --- the tree -----------------------------------------------------------------------------------

function question(id: string, order: number, rule: ConditionalRule | null = null, type: FormQuestionType = 'ShortText') {
  return {
    ID: id,
    QuestionType: type,
    Prompt: `Prompt ${id}`,
    HelpText: null,
    IsRequired: false,
    DisplayOrder: order,
    PageID: 'p1',
    ConditionalRule: rule ? JSON.stringify(rule) : null,
    ValidationRule: null,
    ScoringConfig: null,
    Settings: null,
  };
}

function page(id: string, order: number) {
  return { ID: id, Title: `Page ${id}`, Description: null, DisplayOrder: order, IsPartialSubmitPoint: false, ConditionalRule: null };
}

function node(row: ReturnType<typeof question>): QuestionNode {
  return { entity: row, options: [] } as unknown as QuestionNode;
}

/** A form record with just enough `BaseEntity` for the builder: fields, and taking stored values back. */
function formRecord(): mjBizAppsFormsFormEntity {
  const record = {
    ID: 'form-1',
    Name: 'Intake',
    Description: null,
    RenderMode: 'Scroll',
    Settings: null,
    StyleID: null,
    Status: 'Draft',
    IsSaved: true,
    GetFieldByName: () => ({ Dirty: false, ResetNeverSetFlag: () => undefined }),
    SetMany(values: Record<string, unknown>) {
      Object.assign(record, values);
    },
  };
  return record as unknown as mjBizAppsFormsFormEntity;
}

/** Two sections: p1 = [q1, q2, q3], p2 = [q4]. `q3` shows only when `q1` is answered. */
function treeFor(record: mjBizAppsFormsFormEntity): FormTree {
  const showsAfterQ1: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'isAnswered' }] } };
  const p2Question = { ...question('q4', 0), PageID: 'p2' };
  return {
    form: record,
    pages: [
      { entity: page('p1', 0), questions: [node(question('q1', 0)), node(question('q2', 1)), node(question('q3', 2, showsAfterQ1))] },
      { entity: page('p2', 1), questions: [node(p2Question)] },
    ],
    screens: [],
  } as unknown as FormTree;
}

// --- the services ---------------------------------------------------------------------------------

class FakeState {
  public tree: FormTree | null = null;
  public readonly calls: string[] = [];
  public persistOk = true;
  public saveDebounced = vi.fn();
  public lastFailure = () => this.failure;
  public dismissFailure = vi.fn(() => {
    this.failure = null;
  });
  public async loadTree(): Promise<FormTree> {
    this.calls.push('loadTree');
    if (!this.tree) throw new Error('no tree');
    return this.tree;
  }
  public async flushPendingSaves(): Promise<void> {
    this.calls.push('flush');
  }
  public saveOk = true;
  public failure: string | null = null;
  /** Like the real service: a successful save of a new record leaves it saved. */
  public save = vi.fn(async (entity: { IsSaved: boolean }): Promise<boolean> => {
    this.calls.push('save');
    if (this.saveOk) {
      entity.IsSaved = true;
    }
    return this.saveOk;
  });
  /** Like the real service, minus the queue: read, then adopt what is stored. */
  public async adoptStored(entity: mjBizAppsFormsFormEntity, read: () => Promise<Record<string, unknown> | null>): Promise<boolean> {
    const row = await read();
    if (!row) {
      return false;
    }
    adoptStoredValues(entity, row);
    return true;
  }
  /** Like the real service, puts the saved node into the page itself. */
  public addQuestion = vi.fn(async (_tree: FormTree, page: PageNode, type: FormQuestionType, _prompt: string, index?: number) => {
    const at = index ?? page.questions.length;
    this.calls.push(`addQuestion@${at}`);
    const added = node({ ...question('new', at), QuestionType: type });
    page.questions.splice(at, 0, added);
    return added;
  });
  public async persistQuestionOrder(): Promise<boolean> {
    this.calls.push('persistQuestionOrder');
    return this.persistOk;
  }
  public async persistCrossPageMove(): Promise<boolean> {
    this.calls.push('persistCrossPageMove');
    return this.persistOk;
  }
}

class FakeDistributions {
  public readonly shareLinkFacts = vi.fn(async (): Promise<ShareLinkFacts[] | null> => []);
}

let operations: FakeOperations | null = null;
/** Every builder a test made, torn down after it so no test's listeners hear the next test's writes. */
const live: { ngOnDestroy(): void }[] = [];

type Builder = InstanceType<typeof FormBuilderComponent>;

/** The component's protected and private surface the specs drive, named once. */
interface BuilderInternals {
  tree: FormTree | null;
  statusMessage: string;
  templateDialogOpen: boolean;
  templateDialogError: string | null;
  pickerSeam: { pageId: string; index: number } | null;
  loadBuilder(): Promise<void>;
  awaitingCreate: boolean;
  createError: string | null;
  createForm(name: string): Promise<void>;
  publish(): Promise<void>;
  saveAsTemplate(request: { name: string; description: string | null }): Promise<void>;
  onOptionChanged(option: mjBizAppsFormsFormQuestionOptionEntity): void;
  onQuestionChanged(node: QuestionNode): void;
  insertQuestionAt(type: FormQuestionType): Promise<void>;
  selectQuestion(node: QuestionNode): void;
  offersInsertAbove(page: PageNode, node: QuestionNode): boolean;
  openTypePicker(page: PageNode, index: number): void;
  dropQuestion(page: PageNode, event: CdkDragDrop<PageNode>): Promise<void>;
  ngOnDestroy(): void;
  publishReach: { kind: string };
  templateState: string;
}

function makeBuilder(): { builder: BuilderInternals; state: FakeState; distributions: FakeDistributions; record: mjBizAppsFormsFormEntity } {
  const state = new FakeState();
  const distributions = new FakeDistributions();
  const injector = Injector.create({
    providers: [
      { provide: ElementRef, useValue: new ElementRef({ querySelector: () => null }) },
      { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
      { provide: FormStateService, useValue: {} },
      { provide: BuilderStateService, useValue: state },
      { provide: DesignStateService, useValue: { loadStyleById: async () => null, UseSaveQueue: () => undefined } },
      { provide: DistributionService, useValue: distributions },
    ],
  });
  const component: Builder = runInInjectionContext(injector, () => new FormBuilderComponent());
  const record = formRecord();
  component.record = record;
  live.push(component as unknown as { ngOnDestroy(): void });
  state.tree = treeFor(record);
  return { builder: component as unknown as BuilderInternals, state, distributions, record };
}

beforeEach(() => {
  templateRows = [];
  views.clear();
  viewsAsked.length = 0;
  views.set(FORMS, []);
});

afterEach(() => {
  operations?.restore();
  operations = null;
  for (const builder of live.splice(0)) {
    builder.ngOnDestroy();
  }
});

async function loaded() {
  const made = makeBuilder();
  await made.builder.loadBuilder();
  return made;
}

// --- publish -------------------------------------------------------------------------------------

describe('Publish', () => {
  it('lands every pending edit, THEN asks Forms.PublishForm for this form', async () => {
    const { builder, state } = await loaded();
    views.set(FORMS, [{ ID: 'form-1', Status: 'Published' }]);
    operations = installFakeOperations((key) => {
      state.calls.push(key);
      return succeeded({ FormVersionID: 'v-4', VersionNumber: 4, RetiredVersionIDs: ['v-3'] });
    });

    await builder.publish();

    expect(state.calls.slice(-2)).toEqual(['flush', 'Forms.PublishForm']);
    expect(operations.calls).toEqual([{ key: 'Forms.PublishForm', input: { FormID: 'form-1' } }]);
    expect(builder.statusMessage).toBe('Published version 4.');
  });

  it('takes the status the server wrote back into the record, so its next save cannot send Draft', async () => {
    const { builder, record } = await loaded();
    operations = installFakeOperations(() => succeeded({ FormVersionID: 'v-1', VersionNumber: 1, RetiredVersionIDs: [] }));
    views.set(FORMS, [{ ID: 'form-1', Status: 'Published' }]);

    await builder.publish();

    expect(record.Status).toBe('Published');
  });

  it("re-reads the record ONCE — its own announcement does not trigger a second read", async () => {
    const { builder } = await loaded();
    operations = installFakeOperations(() => succeeded({ FormVersionID: 'v-1', VersionNumber: 1, RetiredVersionIDs: [] }));
    views.set(FORMS, [{ ID: 'form-1', Status: 'Published' }]);
    viewsAsked.length = 0;

    await builder.publish();
    await new Promise((r) => setTimeout(r, 0));

    const recordReads = viewsAsked.filter((p) => p.EntityName === FORMS && p.ExtraFilter === "ID='form-1'");
    expect(recordReads).toHaveLength(1);
    builder.ngOnDestroy();
  });

  it('says so when the record could not be re-read, rather than leaving a stale status to be sent back', async () => {
    const { builder } = await loaded();
    operations = installFakeOperations(() => succeeded({ FormVersionID: 'v-1', VersionNumber: 1, RetiredVersionIDs: [] }));

    await builder.publish();

    expect(builder.statusMessage).toBe("Published version 1. Reload the builder before editing the form's settings.");
  });

  it('shows the server\'s refusal as it is', async () => {
    const { builder } = await loaded();
    operations = installFakeOperations(() => refused('Another publish is in progress; reload and try again.'));

    await builder.publish();

    expect(builder.statusMessage).toBe('Another publish is in progress; reload and try again.');
  });
});

describe('a publish refusal is retracted when its rules are fixed', () => {
  /** Break q3's rule: it reads q9, which no longer exists. */
  function breakRule(tree: FormTree): void {
    const q3 = tree.pages[0].questions[2].entity;
    q3.ConditionalRule = JSON.stringify({ show: { all: [{ questionId: 'q9', op: 'isAnswered' }] } } satisfies ConditionalRule);
  }

  it('drops the refusal on the next edit once no rule is broken — however they were fixed', async () => {
    const { builder } = await loaded();
    const tree = builder.tree as FormTree;
    breakRule(tree);
    // The server's refusal, as `FormPublishingEngine` words it for these rules.
    const refusal = brokenRuleRefusal(brokenRuleLines(tree));
    operations = installFakeOperations(() => refused(refusal));
    await builder.publish();
    expect(builder.statusMessage).toBe(refusal);

    // Still broken: an unrelated edit must not retract it.
    builder.onQuestionChanged(tree.pages[0].questions[1]);
    expect(builder.statusMessage).toBe(refusal);

    // Fixed by any route — here, the rule is simply cleared.
    tree.pages[0].questions[2].entity.ConditionalRule = null;
    builder.onQuestionChanged(tree.pages[0].questions[2]);
    expect(builder.statusMessage).toBe('');
  });

  it('keeps a refusal for another reason standing even on a form that also had a broken rule', async () => {
    // The browser does not infer the server's reason from its own walk: only the broken-rule
    // refusal, word for word, is retracted when the rules are fixed.
    const { builder } = await loaded();
    const tree = builder.tree as FormTree;
    breakRule(tree);
    operations = installFakeOperations(() => refused('Form form-1 is archived; restore it before publishing.'));
    await builder.publish();

    tree.pages[0].questions[2].entity.ConditionalRule = null;
    builder.onQuestionChanged(tree.pages[0].questions[2]);

    expect(builder.statusMessage).toBe('Form form-1 is archived; restore it before publishing.');
  });

  it('keeps a refusal that was never about rules standing across edits', async () => {
    const { builder } = await loaded();
    const tree = builder.tree as FormTree;
    operations = installFakeOperations(() => refused("The form's settings cannot be read; nothing was published."));
    await builder.publish();

    builder.onQuestionChanged(tree.pages[0].questions[0]);

    expect(builder.statusMessage).toBe("The form's settings cannot be read; nothing was published.");
  });
});

// --- save as template ----------------------------------------------------------------------------

describe('Save as template', () => {
  it('asks Forms.CloneForm for a template copy of this form, after landing pending edits', async () => {
    const { builder, state } = await loaded();
    operations = installFakeOperations((key) => {
      state.calls.push(key);
      return succeeded({
        FormID: 't-1',
        TemplateSourceFormID: 'form-1',
        PageCount: 2,
        QuestionCount: 4,
        OptionCount: 0,
        ScreenCount: 0,
        AutomationCount: 0,
        BindingCount: 0,
        Warnings: [],
      });
    });
    builder.templateDialogOpen = true;

    await builder.saveAsTemplate({ name: 'Client intake', description: 'For new clients' });

    expect(state.calls.slice(-2)).toEqual(['flush', 'Forms.CloneForm']);
    expect(operations.calls[0].input).toEqual({
      SourceFormID: 'form-1',
      Name: 'Client intake',
      Description: 'For new clients',
      AsTemplate: true,
    });
    expect(builder.templateDialogOpen).toBe(false);
    expect(builder.statusMessage).toBe('Saved "Client intake" to your templates.');
  });

  it('keeps the dialog open with the server\'s reason when the name is taken', async () => {
    const { builder } = await loaded();
    operations = installFakeOperations(() => refused('A template called “Client intake” already exists.'));
    builder.templateDialogOpen = true;

    await builder.saveAsTemplate({ name: 'Client intake', description: null });

    expect(builder.templateDialogOpen).toBe(true);
    expect(builder.templateDialogError).toBe('A template called “Client intake” already exists.');
  });

  it('shows the notes the copy came back with', async () => {
    const { builder } = await loaded();
    operations = installFakeOperations(() =>
      succeeded({
        FormID: 't-1',
        TemplateSourceFormID: 'form-1',
        PageCount: 1,
        QuestionCount: 1,
        OptionCount: 0,
        ScreenCount: 0,
        AutomationCount: 0,
        BindingCount: 0,
        Warnings: ['Rule on q3 named a question that no longer exists.'],
      }),
    );

    await builder.saveAsTemplate({ name: 'X', description: null });

    expect(builder.statusMessage).toBe('Saved as a template, with notes: Rule on q3 named a question that no longer exists.');
  });
});

// --- field and structural edits ------------------------------------------------------------------

describe('an option edit reaches the database', () => {
  it('saves the OPTION, not the question that owns it', async () => {
    const { builder, state } = await loaded();
    const option = { ID: 'o1', Label: 'Yes' } as unknown as mjBizAppsFormsFormQuestionOptionEntity;

    builder.onOptionChanged(option);

    expect(state.saveDebounced).toHaveBeenCalledWith(option);
  });
});

describe('inserting a question at a seam', () => {
  it('asks for it AT the seam — one save that also renumbers below — and puts it there', async () => {
    const { builder, state } = await loaded();
    const tree = builder.tree as FormTree;
    builder.pickerSeam = { pageId: 'p1', index: 1 };

    await builder.insertQuestionAt('LongText');

    expect(state.addQuestion).toHaveBeenCalledTimes(1);
    expect(state.addQuestion.mock.calls[0][4]).toBe(1);
    expect(state.calls).not.toContain('persistQuestionOrder');
    expect(tree.pages[0].questions.map((q) => q.entity.ID)).toEqual(['q1', 'new', 'q2', 'q3']);
  });
});

describe('inserting above the first question of a section', () => {
  // Click-through step 5: the only seams a non-empty section offered were "after the selected
  // question", so nothing could land above question 1 without an insert and a Move up.
  it('offers the seam above only on the selected FIRST question', async () => {
    const { builder } = await loaded();
    const [p1] = (builder.tree as FormTree).pages;
    const [q1, q2] = p1.questions;

    expect(builder.offersInsertAbove(p1, q1)).toBe(false);
    builder.selectQuestion(q1);
    expect(builder.offersInsertAbove(p1, q1)).toBe(true);
    builder.selectQuestion(q2);
    // Above q2 is the seam "after q1" already offers; a second opener for one seam would render
    // the picker twice.
    expect(builder.offersInsertAbove(p1, q2)).toBe(false);
  });

  it('puts the new question first, in one save', async () => {
    const { builder, state } = await loaded();
    const [p1] = (builder.tree as FormTree).pages;
    builder.selectQuestion(p1.questions[0]);

    builder.openTypePicker(p1, 0);
    await builder.insertQuestionAt('LongText');

    expect(state.addQuestion).toHaveBeenCalledTimes(1);
    expect(state.addQuestion.mock.calls[0][4]).toBe(0);
    expect(p1.questions.map((q) => q.entity.ID)).toEqual(['new', 'q1', 'q2', 'q3']);
  });
});

describe('a new, unsaved form record', () => {
  // Click-through observation 9: Explorer restored a pinned "New Forms Record" tab, and the
  // builder it mounted saved an "Untitled form" row before the author touched anything. A new
  // record now writes nothing until the author asks for the form.
  async function opened() {
    const made = makeBuilder();
    Object.assign(made.record, { IsSaved: false, Name: '' });
    await made.builder.loadBuilder();
    return made;
  }

  it('writes nothing when the builder opens it', async () => {
    const { builder, state } = await opened();

    expect(state.save).not.toHaveBeenCalled();
    expect(state.calls).not.toContain('loadTree');
    expect(builder.awaitingCreate).toBe(true);
    expect(builder.tree).toBeNull();
  });

  it('creates the form with the name the author typed, then loads the builder', async () => {
    const { builder, state, record } = await opened();

    await builder.createForm('  Volunteer intake ');

    expect(state.save).toHaveBeenCalledTimes(1);
    expect(record.Name).toBe('Volunteer intake');
    expect(state.calls.indexOf('save')).toBeLessThan(state.calls.indexOf('loadTree'));
    expect(builder.awaitingCreate).toBe(false);
    expect(builder.tree).not.toBeNull();
  });

  it('names a form created with a blank name "Untitled form"', async () => {
    const { builder, record } = await opened();

    await builder.createForm('   ');

    expect(record.Name).toBe('Untitled form');
  });

  it('stays on the start step with the reason when the create is refused', async () => {
    const { builder, state } = await opened();
    state.saveOk = false;
    state.failure = 'Could not save. You do not have permission to create this record.';

    await builder.createForm('Volunteer intake');

    expect(builder.awaitingCreate).toBe(true);
    expect(builder.createError).toBe('This form could not be created: You do not have permission to create this record.');
    expect(state.calls).not.toContain('loadTree');
  });

  it("says MJ's refusal once, on one line, without its trailing brace (click-through observation 4)", async () => {
    const { builder, state } = await opened();
    state.saveOk = false;
    state.failure =
      'Could not save. User: Ada (ID: 1, Email: ada@example.org)\n                         Does NOT have permission to Create MJ_BizApps_Forms: Forms records.\n                         If you believe this is an error, please contact your system administrator.}';

    await builder.createForm('Volunteer intake');

    expect(builder.createError).toBe(
      'This form could not be created: User: Ada (ID: 1, Email: ada@example.org) Does NOT have permission to Create MJ_BizApps_Forms: Forms records. If you believe this is an error, please contact your system administrator.',
    );
  });

  it('leaves no stale failure for the builder banner once a retried create succeeds', async () => {
    const { builder, state } = await opened();
    state.saveOk = false;
    state.failure = 'Could not save. The database was unreachable.';
    await builder.createForm('Volunteer intake');

    state.saveOk = true;
    await builder.createForm('Volunteer intake');

    expect(builder.awaitingCreate).toBe(false);
    expect(builder.createError).toBeNull();
    expect(state.lastFailure()).toBeNull();
  });

  it('opens a saved form straight into the builder, as before', async () => {
    const { builder, state } = await loaded();

    expect(state.save).not.toHaveBeenCalled();
    expect(builder.awaitingCreate).toBe(false);
    expect(builder.tree).not.toBeNull();
  });
});

describe('a refused reorder', () => {
  const drop = (from: PageNode, previousIndex: number, currentIndex: number, to = from) =>
    ({ previousContainer: { data: from }, container: { data: to }, previousIndex, currentIndex }) as unknown as CdkDragDrop<PageNode>;

  it('puts an in-section move back, since nothing was written', async () => {
    const { builder, state } = await loaded();
    const tree = builder.tree as FormTree;
    const p1 = tree.pages[0];
    // Same container object on both sides marks an in-section drop.
    const event = drop(p1, 0, 2);
    (event as unknown as { previousContainer: unknown }).previousContainer = event.container;
    state.persistOk = false;

    await builder.dropQuestion(p1, event);

    expect(state.calls).toContain('persistQuestionOrder');
    expect(p1.questions.map((q) => q.entity.ID)).toEqual(['q1', 'q2', 'q3']);
  });

  it('puts a cross-section move back, since nothing was written', async () => {
    const { builder, state } = await loaded();
    const tree = builder.tree as FormTree;
    const [p1, p2] = tree.pages;
    state.persistOk = false;

    await builder.dropQuestion(p2, drop(p1, 1, 0, p2));

    expect(state.calls).toContain('persistCrossPageMove');
    expect(p1.questions.map((q) => q.entity.ID)).toEqual(['q1', 'q2', 'q3']);
    expect(p2.questions.map((q) => q.entity.ID)).toEqual(['q4']);
  });

  it('moves a question into an EMPTY section (click-through observation 10)', async () => {
    const { builder, state } = await loaded();
    const tree = builder.tree as FormTree;
    const [p1, p2] = tree.pages;
    p2.questions.splice(0);

    await builder.dropQuestion(p2, drop(p1, 0, 0, p2));

    expect(state.calls).toContain('persistCrossPageMove');
    expect(p1.questions.map((q) => q.entity.ID)).toEqual(['q2', 'q3']);
    expect(p2.questions.map((q) => q.entity.ID)).toEqual(['q1']);
  });

  it('keeps a successful move', async () => {
    const { builder } = await loaded();
    const tree = builder.tree as FormTree;
    const [p1, p2] = tree.pages;

    await builder.dropQuestion(p2, drop(p1, 1, 0, p2));

    expect(p2.questions.map((q) => q.entity.ID)).toEqual(['q2', 'q4']);
  });
});

// --- the header's reach --------------------------------------------------------------------------

describe('the reach the header renders', () => {
  it('is read from the share links, and re-read when an operation writes one anywhere in the app', async () => {
    const { builder, distributions } = await loaded();
    expect(distributions.shareLinkFacts).toHaveBeenCalledTimes(1);
    expect(distributions.shareLinkFacts).toHaveBeenCalledWith('form-1');

    announceWrites([DISTRIBUTIONS]);
    await Promise.resolve();

    expect(distributions.shareLinkFacts).toHaveBeenCalledTimes(2);
    builder.ngOnDestroy();
  });

  it('survives a failed read as "unknown" — never as "no links", which would invite a duplicate', async () => {
    const made = makeBuilder();
    made.distributions.shareLinkFacts.mockResolvedValueOnce(null);
    await made.builder.loadBuilder();

    expect(made.builder.publishReach.kind).toBe('unknown');
    made.builder.ngOnDestroy();
  });

  it('reads "not shared" only when the read succeeded and found no links', async () => {
    const { builder } = await loaded();
    expect(builder.publishReach.kind).not.toBe('unknown');
    builder.ngOnDestroy();
  });

  it('stops listening once the builder is gone', async () => {
    const { builder, distributions } = await loaded();
    builder.ngOnDestroy();

    announceWrites([DISTRIBUTIONS]);
    await Promise.resolve();

    expect(distributions.shareLinkFacts).toHaveBeenCalledTimes(1);
  });
});

describe('the record catches up with what operations write', () => {
  it("adopts the form row after an announced Form write — the automation tab's Settings mark, an archive from home", async () => {
    const { builder, record } = await loaded();
    views.set(FORMS, [{ ID: 'form-1', Status: 'Closed', Settings: '{"onSubmitMode":"Configured"}' }]);

    announceWrites([FORMS]);
    await new Promise((r) => setTimeout(r, 0));

    expect(record.Status).toBe('Closed');
    expect(record.Settings).toBe('{"onSubmitMode":"Configured"}');
    builder.ngOnDestroy();
  });
});

describe("the 'Saved as template' indicator", () => {
  it('goes back to offering Save as template when the gallery deletes the template — without a reload', async () => {
    // The template was saved from this form; the builder shows it as current.
    templateRows = [{ ID: 't1' }];
    views.set(FORMS, [{ ID: 't1', Name: 'Intake template', StyleID: null }]);
    const { builder } = await loaded();
    expect(builder.templateState).toBe('current');

    // The gallery, on another tab, deletes it through Forms.DeleteTemplate.
    const { TemplatesGalleryComponent } = await import('../templates/templates-gallery.component');
    const gallery = runInInjectionContext(
      Injector.create({ providers: [{ provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined } }] }),
      () => new TemplatesGalleryComponent(),
    );
    operations = installFakeOperations(() =>
      succeeded({ TemplateFormID: 't1', PageCount: 1, QuestionCount: 1, OptionCount: 0, ScreenCount: 0, AutomationCount: 0, BindingCount: 0 }),
    );
    templateRows = [];
    gallery.askDelete({ id: 't1', name: 'Intake template', description: null, questionCount: 1, pageCount: 1, updatedAt: null });
    await gallery.confirmDelete();
    await new Promise((r) => setTimeout(r, 0));

    expect(builder.templateState).toBe('none');
    builder.ngOnDestroy();
  });
});
