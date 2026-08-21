import { describe, it, expect, vi, beforeEach } from 'vitest';

interface SavedRow { entity: string; fields: Record<string, unknown> }
const saved: SavedRow[] = [];
const deleted: Array<{ entity: string; id: string }> = [];
const rows = new Map<string, Array<Record<string, unknown>>>();
let minted = 0;
/** Entity whose next read reports failure, for the fail-closed tests. */
let readFailsFor: string | null = null;
/**
 * Row id whose `Delete()` reports failure.
 *
 * `BaseEntity.Delete()` returns `false` on a logical failure — an FK the caller did not expect,
 * a permission denial — rather than throwing. A fake that always succeeds cannot exercise the
 * only path where a multi-row delete can destroy some rows and keep others.
 */
let deleteFailsFor: string | null = null;
/**
 * Row id whose grouped `Delete()` refuses at QUEUE time rather than at submit.
 *
 * `BaseEntity.Delete()` reaches `ProviderToUse.Delete()` even when a TransactionGroup is set —
 * that call is what enrols the row — and it returns `false` on a permission or provider refusal.
 * A row that returns false was never queued, so `Submit()` then succeeds having silently skipped
 * it. Distinct from `deleteFailsFor`, which models a failure the SUBMIT discovers.
 */
let queueRefusesFor: string | null = null;

const guid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

class FakeEntity {
  ID = '';
  constructor(private readonly entityName: string) {}
  get LatestResult() { return { Message: 'forced', CompleteMessage: 'forced' }; }
  NewRecord(): void { this.ID = guid(++minted); }
  async Load(id: string): Promise<boolean> {
    const row = (rows.get(this.entityName) ?? []).find((r) => r.ID === id);
    if (!row) return false;
    Object.assign(this, row);
    return true;
  }
  async Save(): Promise<boolean> {
    if (!this.ID) this.ID = guid(++minted);
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this)) if (k !== 'entityName') fields[k] = v;
    saved.push({ entity: this.entityName, fields });
    const table = rows.get(this.entityName) ?? [];
    const existing = table.find((r) => r.ID === this.ID);
    if (existing) Object.assign(existing, fields);
    else { table.push(fields); rows.set(this.entityName, table); }
    return true;
  }
  /**
   * Set by a caller that wants the delete queued rather than written. Mirrors `BaseEntity`:
   * `Delete()` on an entity holding a group registers the work and returns without touching
   * the database, and `Submit()` is what executes it.
   */
  TransactionGroup: FakeTransactionGroup | null = null;
  async Delete(): Promise<boolean> {
    if (this.TransactionGroup) {
      if (queueRefusesFor === this.ID) {
        return false;
      }
      this.TransactionGroup.queue(this);
      return true;
    }
    return this.deleteNow();
  }
  /** The write itself, so the group can run exactly what a groupless caller would have run. */
  deleteNow(): boolean {
    if (deleteFailsFor === this.ID) {
      return false;
    }
    deleted.push({ entity: this.entityName, id: this.ID });
    const table = rows.get(this.entityName) ?? [];
    rows.set(this.entityName, table.filter((r) => r.ID !== this.ID));
    return true;
  }
}

/**
 * All-or-nothing, like the provider-side transaction it stands in for.
 *
 * `Submit()` first asks every queued row whether its delete would succeed; only if all of them
 * would does it apply any. That is the property the production code depends on and the reason
 * the applier uses a group at all.
 */
class FakeTransactionGroup {
  private readonly pending: FakeEntity[] = [];
  queue(entity: FakeEntity): void { this.pending.push(entity); }
  async Submit(): Promise<boolean> {
    if (this.pending.some((e) => deleteFailsFor === e.ID)) {
      return false;
    }
    for (const entity of this.pending) {
      entity.deleteNow();
    }
    return true;
  }
}

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  Metadata: class {
    async GetEntityObject(name: string) { return new FakeEntity(name); }
    async CreateTransactionGroup() { return new FakeTransactionGroup(); }
  },
  RunView: class {
    /** The batched form. Production issues these together; the applier and loader both use it. */
    async RunViews(all: Array<{ EntityName: string; ExtraFilter?: string; ResultType?: string }>) {
      return Promise.all(all.map((p) => new (this.constructor as never as { new (): { RunView(p: unknown): Promise<unknown> } })().RunView(p)));
    }
    async RunView(params: { EntityName: string; ExtraFilter?: string; ResultType?: string }) {
      if (readFailsFor === params.EntityName) {
        readFailsFor = null;
        return { Success: false, ErrorMessage: 'connection reset', Results: [] };
      }
      const table = rows.get(params.EntityName) ?? [];
      const filter = (params.ExtraFilter ?? '').trim();
      const eq = /^(\w+)='([^']*)'$/.exec(filter);
      const notEq = /^(\w+)\s*<>\s*'([^']*)'$/.exec(filter);
      const inList = /^(\w+) IN \(([^)]*)\)$/.exec(filter);
      let matched = table;
      if (eq) {
        matched = table.filter((r) => String(r[eq[1]]) === eq[2]);
      } else if (notEq) {
        matched = table.filter((r) => String(r[notEq[1]]) !== notEq[2]);
      } else if (inList) {
        const allowed = new Set([...inList[2].matchAll(/'([^']*)'/g)].map((m) => m[1]));
        matched = table.filter((r) => allowed.has(String(r[inList[1]])));
      } else if (filter) {
        throw new Error(`the fake RunView does not understand this filter: ${filter}`);
      }
      // `entity_object` returns REAL entities in production — rows with Save() and Delete() on
      // them. A fake handing back plain objects cannot exercise a caller that mutates what it
      // read, which is exactly what the applier does.
      // `count_only` returns NO rows and a total, which is the whole point of asking for it — a
      // fake that hands back rows anyway cannot catch a caller that reads `.Results.length`.
      if (params.ResultType === 'count_only') {
        return { Success: true, Results: [], TotalRowCount: matched.length };
      }
      if (params.ResultType === 'entity_object') {
        return {
          Success: true,
          Results: matched.map((row) => {
            const entity = new FakeEntity(params.EntityName);
            Object.assign(entity, row);
            return entity;
          }),
        };
      }
      return { Success: true, Results: matched };
    }
  },
  UserInfo: class { ID = 'user-1' },
}));

import { UserInfo } from '@memberjunction/core';
import { buildFormSnapshot, describeFormSnapshot, planEdits } from '@mj-biz-apps/forms-entities';
import { applyEdits } from './apply-edits';
import { MAX_ANSWER_ROWS_SCANNED } from './limits';
import { loadFormList, loadFormSnapshot } from './load-snapshot';

const FORM = '11111111-2222-4333-8444-555555555555';
const PAGE = '22222222-3333-4444-8555-666666666666';
const Q_NAME = '33333333-4444-4555-8666-777777777777';
const Q_MAIL = '44444444-5555-4666-8777-888888888888';
const OPT = '55555555-6666-4777-8888-999999999999';
const SCREEN = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const STYLE = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';
const user = new UserInfo();

const snapshot = (answerCount = 0) =>
  buildFormSnapshot({
    formId: FORM, name: 'Assessment', status: 'Draft', responseCount: answerCount,
    cssVariables: {},
    pages: [{
      id: PAGE, title: 'Details',
      questions: [
        { id: Q_NAME, type: 'ShortText', prompt: 'Your name', isRequired: false, answerCount, options: [] },
        { id: Q_MAIL, type: 'Email', prompt: 'Email', isRequired: true, answerCount: 0, options: [{ id: OPT, label: 'x' }] },
      ],
    }],
    screens: [{ id: SCREEN, role: 'welcome', title: 'Hello', isDefault: false }],
  });

beforeEach(() => {
  saved.length = 0; deleted.length = 0; rows.clear(); minted = 0; readFailsFor = null; deleteFailsFor = null; queueRefusesFor = null;
  rows.set('MJ_BizApps_Forms: Form Questions', [
    { ID: Q_NAME, FormID: FORM, PageID: PAGE, QuestionType: 'ShortText', Prompt: 'Your name', DisplayOrder: 0, IsRequired: false },
    { ID: Q_MAIL, FormID: FORM, PageID: PAGE, QuestionType: 'Email', Prompt: 'Email', DisplayOrder: 1, IsRequired: true },
  ]);
  rows.set('MJ_BizApps_Forms: Form Question Options', [
    { ID: OPT, QuestionID: Q_MAIL, Label: 'x', DisplayOrder: 0 },
  ]);
  rows.set('MJ_BizApps_Forms: Form Pages', [{ ID: PAGE, FormID: FORM, Title: 'Details', DisplayOrder: 0 }]);
  rows.set('MJ_BizApps_Forms: Form Screens', [
    { ID: SCREEN, FormID: FORM, ScreenType: 'Welcome', Title: 'Hello', DisplayOrder: 0 },
  ]);
  rows.set('MJ_BizApps_Forms: Forms', [{ ID: FORM, Name: 'Assessment', StyleID: STYLE }]);
  rows.set('MJ_BizApps_Forms: Form Styles', [
    { ID: STYLE, Name: 'theme', CSSVariables: JSON.stringify({ '--mjf-accent': '#1b7fa8', '--mjf-btn-radius': '999px' }) },
  ]);
});

/**
 * The tracer for the applier.
 *
 * `planEdits` already decided WHAT may happen; everything here is persistence. So the property
 * worth pinning first is that a resolved operation reaches the right row and reports itself — an
 * applier that writes correctly and says nothing is indistinguishable, to the author, from one
 * that did nothing.
 */
describe('applyEdits', () => {
  it('rewords the question the plan resolved, and says what it did', async () => {
    const plan = planEdits(snapshot(), [
      { op: 'updateQuestion', handle: 'q1', prompt: 'What is your full name?' },
    ]);

    const outcome = await applyEdits(FORM, plan, user);

    const written = saved.filter((r) => r.entity === 'MJ_BizApps_Forms: Form Questions').at(-1);
    expect(written?.fields.Prompt).toBe('What is your full name?');
    expect(written?.fields.ID).toBe(Q_NAME);
    expect(outcome.applied).toHaveLength(1);
    expect(outcome.applied[0]).toMatch(/full name/i);
  });

  it("carries the plan's refusals through untouched", async () => {
    // The applier does not re-decide anything. A refusal reached it already worded for the reply.
    const plan = planEdits(snapshot(32), [{ op: 'deleteQuestion', handle: 'q1' }]);
    const outcome = await applyEdits(FORM, plan, user);
    expect(outcome.applied).toEqual([]);
    expect(outcome.refused[0]).toContain('32');
    expect(deleted).toEqual([]);
  });
});

const questionRows = () => rows.get('MJ_BizApps_Forms: Form Questions') ?? [];
const orderOf = (id: string) => questionRows().find((r) => r.ID === id)?.DisplayOrder;

describe('applyEdits — adding a question', () => {
  it('puts a new one at the end of the page by default', async () => {
    const plan = planEdits(snapshot(), [
      { op: 'addQuestion', handle: 'p1', type: 'Rating', prompt: 'Rate us' },
    ]);
    await applyEdits(FORM, plan, user);

    const added = questionRows().find((r) => r.Prompt === 'Rate us');
    expect(added?.PageID).toBe(PAGE);
    expect(added?.QuestionType).toBe('Rating');
    // Two questions already sit at 0 and 1, so the end is 2.
    expect(added?.DisplayOrder).toBe(2);
  });

  it('inserts after a named question and shifts what follows', async () => {
    // The part worth testing: everything after the insertion point has to move, or two questions
    // share a DisplayOrder and the form renders them in whatever order SQL felt like.
    const plan = planEdits(snapshot(), [
      { op: 'addQuestion', handle: 'p1', type: 'Phone', prompt: 'Phone', after: 'q1' },
    ]);
    await applyEdits(FORM, plan, user);

    const added = questionRows().find((r) => r.Prompt === 'Phone');
    expect(added?.DisplayOrder).toBe(1);
    expect(orderOf(Q_NAME)).toBe(0);
    expect(orderOf(Q_MAIL)).toBe(2);
  });

  it('creates the choices a choice question was given', async () => {
    const plan = planEdits(snapshot(), [
      { op: 'addQuestion', handle: 'p1', type: 'Dropdown', prompt: 'Pick', options: ['A', 'B'] },
    ]);
    await applyEdits(FORM, plan, user);

    // Matching by LABEL alone said nothing about what the choices were attached to: pointing
    // `option.QuestionID` at a constant wrong id left this green, and an orphaned choice renders
    // as a dropdown with nothing in it. The FK is the assertion that matters here.
    const added = (rows.get('MJ_BizApps_Forms: Form Questions') ?? []).find((q) => q.Prompt === 'Pick');
    expect(added).toBeDefined();

    const choices = (rows.get('MJ_BizApps_Forms: Form Question Options') ?? [])
      .filter((o) => o.QuestionID === added!.ID)
      .sort((a, b) => Number(a.DisplayOrder) - Number(b.DisplayOrder));

    expect(choices.map((o) => o.Label)).toEqual(['A', 'B']);
    expect(choices.map((o) => o.DisplayOrder)).toEqual([0, 1]);
  });
});

describe('applyEdits — removing a question', () => {
  it('takes its options with it', async () => {
    // FK_FormQuestionOption_Question is NOT NULL, so the options have to go first or the delete
    // fails on the constraint.
    const plan = planEdits(snapshot(0), [{ op: 'deleteQuestion', handle: 'q2' }]);
    await applyEdits(FORM, plan, user);

    expect(deleted.map((d) => d.id)).toEqual([OPT, Q_MAIL]);
  });

  it('closes the gap it left', async () => {
    const plan = planEdits(snapshot(0), [{ op: 'deleteQuestion', handle: 'q1' }]);
    await applyEdits(FORM, plan, user);
    expect(orderOf(Q_MAIL)).toBe(0);
  });
});

describe('applyEdits — moving a question', () => {
  it('reorders within a page', async () => {
    const plan = planEdits(snapshot(), [{ op: 'moveQuestion', handle: 'q2', after: 'q1' }]);
    await applyEdits(FORM, plan, user);
    expect(orderOf(Q_NAME)).toBe(0);
    expect(orderOf(Q_MAIL)).toBe(1);
  });

  it('moves one to the top when no position is named', async () => {
    const plan = planEdits(snapshot(), [{ op: 'moveQuestion', handle: 'q2' }]);
    await applyEdits(FORM, plan, user);
    expect(orderOf(Q_MAIL)).toBe(0);
    expect(orderOf(Q_NAME)).toBe(1);
  });
});

describe('applyEdits — relabelling a choice', () => {
  it('writes the new label onto the option row the handle named, keeping its id', async () => {
    const plan = planEdits(snapshot(), [{ op: 'updateOption', handle: 'o1', label: 'Maybe' }]);

    const outcome = await applyEdits(FORM, plan, user);

    const option = (rows.get('MJ_BizApps_Forms: Form Question Options') ?? [])[0];
    // The id is the point: FormResponseAnswer stores it, so relabelling must not mint a new row.
    expect(option.ID).toBe(OPT);
    expect(option.Label).toBe('Maybe');
    expect(outcome.applied).toHaveLength(1);
  });
});

describe('applyEdits — naming the style row a layout change touched', () => {
  it('reports the style id when setLayout landed, so the change can be undone', async () => {
    // `setLayout` writes `FormStyle.CSSVariables` — the same row and the same field a restyle
    // writes — so it is exactly as undoable. The turn only reported `ChangedFormID`, so the undo
    // path, which keys on the style row, never saw it: "make the questions smaller" was silently
    // the one theme change with no way back.
    const plan = planEdits(snapshot(), [
      { op: 'setLayout', tokens: { '--mjf-question-size': '0.9375rem' } },
    ]);

    const outcome = await applyEdits(FORM, plan, user);

    expect(outcome.applied).toHaveLength(1);
    expect(outcome.styleId).toBe(STYLE);
  });

  it('reports no style id when the turn changed no layout', async () => {
    const plan = planEdits(snapshot(), [{ op: 'updatePage', handle: 'p1', title: 'About you' }]);

    const outcome = await applyEdits(FORM, plan, user);

    expect(outcome.applied).toHaveLength(1);
    expect(outcome.styleId).toBeUndefined();
  });
});

describe('applyEdits — a layout change that did NOT land', () => {
  it('names no style row when the write failed', async () => {
    // The id was reported before the write, so a setLayout that threw still told the caller a
    // style row had been touched. `EditOutcome.styleId` is documented as "the row a setLayout in
    // this turn WROTE TO, when one landed" — the client offers an Undo on the strength of it.
    rows.set('MJ_BizApps_Forms: Forms', [{ ID: FORM, Name: 'Assessment', StyleID: guid(4242) }]);
    const plan = planEdits(snapshot(), [
      { op: 'setLayout', tokens: { '--mjf-question-size': '0.9375rem' } },
    ]);

    const outcome = await applyEdits(FORM, plan, user);

    expect(outcome.applied).toHaveLength(0);
    expect(outcome.refused).toHaveLength(1);
    expect(outcome.styleId).toBeUndefined();
  });
});

describe('applyEdits — a delete that fails partway', () => {
  /**
   * The property both of these pin: a multi-row delete either happens or does not. There is no
   * third outcome where some rows are gone and the author is told the edit was refused, because
   * a delete has no undo and the author has no way to discover what went missing.
   */
  it('destroys nothing on the page when one of its questions cannot be deleted', async () => {
    // Q_MAIL picks up an answer between the snapshot and the write — the exact race the gate
    // cannot close, because the gate reads a snapshot taken before the model was even called.
    deleteFailsFor = Q_MAIL;
    const plan = planEdits(snapshot(0), [{ op: 'deletePage', handle: 'p1' }]);

    const outcome = await applyEdits(FORM, plan, user);

    const questions = rows.get('MJ_BizApps_Forms: Form Questions') ?? [];
    expect(questions.map((q) => q.ID).sort()).toEqual([Q_NAME, Q_MAIL].sort());
    expect(rows.get('MJ_BizApps_Forms: Form Pages') ?? []).toHaveLength(1);
    expect(outcome.applied).toHaveLength(0);
    expect(outcome.refused.join(' ')).toMatch(/could not be removed|Nothing was removed/i);
  });

  it('writes nothing when a row refuses to join the group in the first place', async () => {
    // The failure the group cannot catch: a row whose Delete() returns false was never enrolled,
    // so Submit() commits the REST of them and reports success. Discarding that boolean rebuilds
    // the partial delete the group exists to prevent, one layer up.
    queueRefusesFor = Q_MAIL;
    const plan = planEdits(snapshot(0), [{ op: 'deletePage', handle: 'p1' }]);

    const outcome = await applyEdits(FORM, plan, user);

    const questions = rows.get('MJ_BizApps_Forms: Form Questions') ?? [];
    expect(questions.map((q) => q.ID).sort()).toEqual([Q_NAME, Q_MAIL].sort());
    expect(rows.get('MJ_BizApps_Forms: Form Pages') ?? []).toHaveLength(1);
    expect(rows.get('MJ_BizApps_Forms: Form Question Options') ?? []).toHaveLength(1);
    expect(outcome.applied).toHaveLength(0);
  });

  it('keeps a question usable when the question itself cannot be deleted', async () => {
    // Options carry no FK from FormResponseAnswer, so they delete happily even when the question
    // they belong to cannot. Deleting them first leaves a choice question with no choices.
    deleteFailsFor = Q_MAIL;
    const plan = planEdits(snapshot(0), [{ op: 'deleteQuestion', handle: 'q2' }]);

    const outcome = await applyEdits(FORM, plan, user);

    expect(rows.get('MJ_BizApps_Forms: Form Question Options') ?? []).toHaveLength(1);
    expect((rows.get('MJ_BizApps_Forms: Form Questions') ?? []).some((q) => q.ID === Q_MAIL)).toBe(true);
    expect(outcome.applied).toHaveLength(0);
  });
});

describe('applyEdits — pages, screens and layout', () => {
  it('adds a page at the end', async () => {
    const plan = planEdits(snapshot(), [{ op: 'addPage', title: 'Availability' }]);
    await applyEdits(FORM, plan, user);
    const added = (rows.get('MJ_BizApps_Forms: Form Pages') ?? []).find((p) => p.Title === 'Availability');
    expect(added?.FormID).toBe(FORM);
    expect(added?.DisplayOrder).toBe(1);
  });

  it('retitles a page', async () => {
    const plan = planEdits(snapshot(), [{ op: 'updatePage', handle: 'p1', title: 'About you' }]);
    await applyEdits(FORM, plan, user);
    expect((rows.get('MJ_BizApps_Forms: Form Pages') ?? [])[0].Title).toBe('About you');
  });

  it('rewords a screen', async () => {
    const plan = planEdits(snapshot(), [
      { op: 'updateScreen', handle: 's1', title: 'Become a Volunteer' },
    ]);
    await applyEdits(FORM, plan, user);
    expect((rows.get('MJ_BizApps_Forms: Form Screens') ?? [])[0].Title).toBe('Become a Volunteer');
  });

  it('MERGES a layout token rather than replacing the palette', async () => {
    // The whole reason setLayout is separate from restyle: it must not disturb the colours, and a
    // full write of CSSVariables would wipe them. This is the assertion that keeps the two apart.
    const plan = planEdits(snapshot(), [
      { op: 'setLayout', tokens: { '--mjf-question-size': '0.9375rem' } },
    ]);
    await applyEdits(FORM, plan, user);

    const written = JSON.parse(String((rows.get('MJ_BizApps_Forms: Form Styles') ?? [])[0].CSSVariables));
    expect(written['--mjf-question-size']).toBe('0.9375rem');
    expect(written['--mjf-accent']).toBe('#1b7fa8');
    expect(written['--mjf-btn-radius']).toBe('999px');
  });

  it('says what it did, one line per change', async () => {
    const plan = planEdits(snapshot(), [
      { op: 'updatePage', handle: 'p1', title: 'About you' },
      { op: 'updateScreen', handle: 's1', title: 'Welcome!' },
    ]);
    const outcome = await applyEdits(FORM, plan, user);
    expect(outcome.applied).toHaveLength(2);
    expect(outcome.applied.join(' ')).toContain('About you');
  });
});

describe('loadFormSnapshot', () => {
  beforeEach(() => {
    rows.set('MJ_BizApps_Forms: Form Responses', [
      { ID: 'r1', FormID: FORM, Status: 'Complete' },
      { ID: 'r2', FormID: FORM, Status: 'Complete' },
    ]);
    rows.set('MJ_BizApps_Forms: Form Response Answers', [
      { ID: 'a1', ResponseID: 'r1', QuestionID: Q_NAME },
      { ID: 'a2', ResponseID: 'r2', QuestionID: Q_NAME },
      { ID: 'a3', ResponseID: 'r1', QuestionID: Q_MAIL },
    ]);
  });

  it('reads the form back out with handles the assistant can use', async () => {
    const snap = await loadFormSnapshot(FORM, user);
    expect(snap?.name).toBe('Assessment');
    expect(snap?.pages[0].questions.map((q) => q.handle)).toEqual(['q1', 'q2']);
    expect(snap?.pages[0].questions[0].prompt).toBe('Your name');
  });

  it('counts answers PER QUESTION, not per form', async () => {
    // The number the deletion gate turns on. A form-wide count would refuse a brand-new question
    // on a busy form and permit an answered one on a quiet form — wrong in both directions.
    const snap = await loadFormSnapshot(FORM, user);
    const [name, email] = snap!.pages[0].questions;
    expect(name.answerCount).toBe(2);
    expect(email.answerCount).toBe(1);
  });

  it('reports zero for a question nobody has reached', async () => {
    rows.set('MJ_BizApps_Forms: Form Response Answers', []);
    const snap = await loadFormSnapshot(FORM, user);
    expect(snap!.pages[0].questions.every((q) => q.answerCount === 0)).toBe(true);
  });

  it('carries the style tokens through, so a restyle sees what is there', async () => {
    const snap = await loadFormSnapshot(FORM, user);
    expect(snap?.cssVariables['--mjf-accent']).toBe('#1b7fa8');
  });

  it('treats every question as answered when the count cannot be read', async () => {
    /**
     * FAIL CLOSED. `RunView` does not throw, so an unchecked failure reads as "no answers" — and
     * "no answers" is precisely the condition that PERMITS deletion. A dropped connection would
     * have become permission to delete every answered question on the form, silently, with no
     * undo. Wrong in the one direction that cannot be walked back.
     */
    readFailsFor = 'MJ_BizApps_Forms: Form Response Answers';
    const snap = await loadFormSnapshot(FORM, user);
    expect(snap!.pages[0].questions.every((q) => q.answerCount > 0)).toBe(true);

    // And the gate downstream actually refuses on it.
    const plan = planEdits(snap!, [{ op: 'deleteQuestion', handle: 'q1' }]);
    expect(plan.resolved).toEqual([]);
  });

  it('is undefined for a form that does not exist', async () => {
    expect(await loadFormSnapshot('99999999-9999-4999-8999-999999999999', user)).toBeUndefined();
  });
});

describe('loadFormSnapshot — the answer scan is bounded', () => {
  it('treats every question as answered when the scan hits its cap', async () => {
    // A capped result is an arbitrary subset, so a question missing from it may still hold
    // answers. Believing the subset is what would let the gate approve deleting an answered
    // question — and it would do so on exactly the busiest forms.
    const answers: Array<Record<string, unknown>> = [];
    for (let i = 0; i < MAX_ANSWER_ROWS_SCANNED; i++) {
      answers.push({ ID: guid(900000 + i), QuestionID: Q_NAME, ResponseID: guid(1) });
    }
    rows.set('MJ_BizApps_Forms: Form Response Answers', answers);

    const snap = await loadFormSnapshot(FORM, user);

    // Q_MAIL has no answers at all, and must still be treated as answered.
    const mail = snap!.pages[0].questions.find((q) => q.id === Q_MAIL);
    expect(mail!.answerCount).toBe(Number.MAX_SAFE_INTEGER);

    const plan = planEdits(snap!, [{ op: 'deleteQuestion', handle: 'q2' }]);
    expect(plan.resolved).toHaveLength(0);
    expect(plan.refused).toHaveLength(1);
  });
});

describe('loadFormSnapshot — the response count', () => {
  it('reports the true total, however many responses the form has', async () => {
    // It used to fetch one row per response and take `.length`, then took `.length` of a CAPPED
    // read — which turns a big number into a wrong one and prints it as a fact. A form with more
    // responses than the old cap reported exactly the cap.
    const responses = Array.from({ length: 20_050 }, (_, i) => ({ ID: guid(500000 + i), FormID: FORM }));
    rows.set('MJ_BizApps_Forms: Form Responses', responses);

    const snap = await loadFormSnapshot(FORM, user);

    expect(snap!.responseCount).toBe(20_050);
    expect(describeFormSnapshot(snap!)).toContain('20050 responses');
  });
});

describe('loadFormList', () => {
  beforeEach(() => {
    rows.set('MJ_BizApps_Forms: Forms', [
      { ID: FORM, Name: 'Assessment', Status: 'Draft' },
      { ID: '88888888-9999-4aaa-8bbb-cccccccccccc', Name: 'Old survey', Status: 'Closed' },
      { ID: '99999999-aaaa-4bbb-8ccc-dddddddddddd', Name: 'Event RSVP', Status: 'Published' },
    ]);
  });

  it('lists the forms with handles', async () => {
    const forms = await loadFormList(user);
    expect(forms.map((f) => f.handle)).toEqual(['f1', 'f2']);
    expect(forms.map((f) => f.name).sort()).toEqual(['Assessment', 'Event RSVP']);
  });

  it("leaves out the ones the list calls archived", async () => {
    /**
     * THE BUG THIS GUARDS. The filter was `IsArchived = 0`, a column `Form` does not have — so
     * every list read failed with "Invalid column name" and degraded to an empty list. The
     * assistant then told the author it could not see their forms, which is exactly the answer
     * this feature exists to stop it giving. Archived is `Status = 'Closed'`; the union is
     * Draft | Published | Closed, and the generated entity is the ground truth for that.
     */
    const forms = await loadFormList(user);
    expect(forms.map((f) => f.name)).not.toContain('Old survey');
  });

  it('degrades to an empty list rather than throwing', async () => {
    // An assistant that cannot list forms can still answer and still edit the one on screen.
    readFailsFor = 'MJ_BizApps_Forms: Forms';
    expect(await loadFormList(user)).toEqual([]);
  });
});
