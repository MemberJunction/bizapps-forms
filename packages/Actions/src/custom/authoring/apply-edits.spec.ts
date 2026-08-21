import { describe, it, expect, vi, beforeEach } from 'vitest';

interface SavedRow { entity: string; fields: Record<string, unknown> }
const saved: SavedRow[] = [];
const deleted: Array<{ entity: string; id: string }> = [];
const rows = new Map<string, Array<Record<string, unknown>>>();
let minted = 0;
/** Entity whose next read reports failure, for the fail-closed tests. */
let readFailsFor: string | null = null;

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
  async Delete(): Promise<boolean> {
    deleted.push({ entity: this.entityName, id: this.ID });
    const table = rows.get(this.entityName) ?? [];
    rows.set(this.entityName, table.filter((r) => r.ID !== this.ID));
    return true;
  }
}

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  Metadata: class { async GetEntityObject(name: string) { return new FakeEntity(name); } },
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
      const inList = /^(\w+) IN \(([^)]*)\)$/.exec(filter);
      let matched = table;
      if (eq) {
        matched = table.filter((r) => String(r[eq[1]]) === eq[2]);
      } else if (inList) {
        const allowed = new Set([...inList[2].matchAll(/'([^']*)'/g)].map((m) => m[1]));
        matched = table.filter((r) => allowed.has(String(r[inList[1]])));
      } else if (filter) {
        throw new Error(`the fake RunView does not understand this filter: ${filter}`);
      }
      // `entity_object` returns REAL entities in production — rows with Save() and Delete() on
      // them. A fake handing back plain objects cannot exercise a caller that mutates what it
      // read, which is exactly what the applier does.
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
import { buildFormSnapshot, planEdits } from '@mj-biz-apps/forms-entities';
import { applyEdits } from './apply-edits';
import { loadFormSnapshot } from './load-snapshot';

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
  saved.length = 0; deleted.length = 0; rows.clear(); minted = 0; readFailsFor = null;
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

    const labels = (rows.get('MJ_BizApps_Forms: Form Question Options') ?? [])
      .filter((o) => o.Label === 'A' || o.Label === 'B')
      .map((o) => o.Label);
    expect(labels.sort()).toEqual(['A', 'B']);
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
