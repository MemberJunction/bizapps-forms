/**
 * `applyPageDetail` — the page-refinement step, which had no test of its own.
 *
 * Two defects lived here undetected because of that, and both are about which ROW a detailed
 * question lands on. `conditionalRule`s reference questions by key and every reader sorts on
 * `DisplayOrder`, so a question written to the wrong row, or two rows written to the same number,
 * silently reorders or misgates a published form.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

interface Row extends Record<string, unknown> {
  ID: string;
}
const rows = new Map<string, Row[]>();
let minted = 0;
const guid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

class FakeEntity {
  ID = '';
  constructor(private readonly entityName: string) {}
  get LatestResult() {
    return { Message: 'forced', CompleteMessage: 'forced' };
  }
  NewRecord(): void {
    this.ID = guid(++minted);
  }
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
    const table = rows.get(this.entityName) ?? [];
    const existing = table.find((r) => r.ID === this.ID);
    if (existing) Object.assign(existing, fields);
    else {
      table.push(fields as Row);
      rows.set(this.entityName, table);
    }
    return true;
  }
}

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  Metadata: class {
    async GetEntityObject(name: string) {
      return new FakeEntity(name);
    }
  },
  RunView: class {
    async RunView(params: { EntityName: string; ExtraFilter?: string; OrderBy?: string }) {
      const table = rows.get(params.EntityName) ?? [];
      const eq = /^(\w+)='([^']*)'$/.exec((params.ExtraFilter ?? '').trim());
      const inList = /^(\w+) IN \(([^)]*)\)$/.exec((params.ExtraFilter ?? '').trim());
      let matched = table;
      if (eq) {
        matched = table.filter((r) => String(r[eq[1]]) === eq[2]);
      } else if (inList) {
        const allowed = new Set([...inList[2].matchAll(/'([^']*)'/g)].map((m) => m[1]));
        matched = table.filter((r) => allowed.has(String(r[inList[1]])));
      }
      if (params.OrderBy?.startsWith('DisplayOrder')) {
        matched = [...matched].sort((a, b) => Number(a.DisplayOrder) - Number(b.DisplayOrder));
      }
      return {
        Success: true,
        Results: matched.map((row) => {
          const entity = new FakeEntity(params.EntityName);
          Object.assign(entity, row);
          return entity;
        }),
      };
    }
  },
  UserInfo: class {
    ID = 'user-1';
  },
}));

import { UserInfo } from '@memberjunction/core';
import { applyPageDetail } from './form-blueprint-builder';
import type { BlueprintPage } from './form-blueprint';

const FORM = guid(1);
const PAGE = guid(2);
const STUB_A = guid(10);
const STUB_B = guid(11);
const OTHER_PAGE = guid(20);
const OTHER_PAGE_Q = guid(21);
const QUESTION = 'MJ_BizApps_Forms: Form Questions';
const user = new UserInfo();

beforeEach(() => {
  rows.clear();
  minted = 100;
  rows.set(QUESTION, [
    { ID: STUB_A, FormID: FORM, PageID: PAGE, QuestionType: 'ShortText', Prompt: 'A', DisplayOrder: 0 },
    { ID: STUB_B, FormID: FORM, PageID: PAGE, QuestionType: 'ShortText', Prompt: 'B', DisplayOrder: 1 },
    // A SECOND PAGE, present in every case. With a single-page fixture the `PageID` filter is
    // untestable: a query that lost it would match the same rows and every assertion would still
    // pass. These rows exist to be left alone.
    { ID: OTHER_PAGE_Q, FormID: FORM, PageID: OTHER_PAGE, QuestionType: 'ShortText', Prompt: 'elsewhere', DisplayOrder: 0 },
  ]);
  rows.set('MJ_BizApps_Forms: Form Question Options', []);
});

const detail = (questions: unknown[]): BlueprintPage => ({ questions }) as unknown as BlueprintPage;

describe('applyPageDetail — every question lands on its own row', () => {
  it('appends a created question past every stub, never onto a number a stub holds', async () => {
    // Three detailed questions for two stubs, with the KEYED one last. The keyed question holds
    // stub B, so the second unkeyed one finds no free stub and is created — at index 1, which is
    // the number stub B still has. Passing the detail index put two rows on `DisplayOrder` 1, and
    // nothing renumbers this page afterwards: every reader sorts on that column alone, so the
    // order becomes whatever the query plan chose and is then frozen into the published snapshot.
    const result = await applyPageDetail(
      FORM,
      PAGE,
      detail([
        { type: 'ShortText', prompt: 'first' },
        { type: 'ShortText', prompt: 'created' },
        { key: 'b', type: 'ShortText', prompt: 'keyed' },
      ]),
      new Map([['b', STUB_B]]),
      user,
    );

    expect(result.questionsAdded).toBe(1);
    expect(result.questionsUpdated).toBe(2);

    const onPage = (rows.get(QUESTION) ?? []).filter((q) => q.PageID === PAGE);
    const orders = onPage.map((q) => Number(q.DisplayOrder)).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2]);
    expect(new Set(orders).size).toBe(orders.length);

    // And the keyed question still holds its OWN row. Without the reservation the second unkeyed
    // question takes stub B, the keyed one finds nothing and is created instead, and key "b" then
    // labels a row carrying different content — so every rule naming it gates on the wrong thing.
    expect((rows.get(QUESTION) ?? []).find((q) => q.ID === STUB_B)?.Prompt).toBe('keyed');
  });

  it('gives the keyed question its own stub even when it arrives last', async () => {
    await applyPageDetail(
      FORM,
      PAGE,
      detail([
        { type: 'ShortText', prompt: 'first' },
        { key: 'b', type: 'ShortText', prompt: 'keyed' },
      ]),
      new Map([['b', STUB_B]]),
      user,
    );

    // The key is the whole point: a rule naming "b" must gate on the question that carries it.
    const b = (rows.get(QUESTION) ?? []).find((q) => q.ID === STUB_B);
    expect(b?.Prompt).toBe('keyed');
    const a = (rows.get(QUESTION) ?? []).find((q) => q.ID === STUB_A);
    expect(a?.Prompt).toBe('first');
  });

  it('appends past the HIGHEST DisplayOrder, not past the stub count', async () => {
    // `createQuestionsForPage` numbers stubs densely from zero, so a count-based next number works
    // on the generation path — but `apply-edits.ts` writes this same column when the chat edits a
    // form, and this function is exported. Gapped numbers are reachable, and a count-based guess
    // lands on a live row.
    rows.set(QUESTION, [
      { ID: STUB_A, FormID: FORM, PageID: PAGE, QuestionType: 'ShortText', Prompt: 'A', DisplayOrder: 5 },
      { ID: STUB_B, FormID: FORM, PageID: PAGE, QuestionType: 'ShortText', Prompt: 'B', DisplayOrder: 9 },
    ]);

    await applyPageDetail(
      FORM,
      PAGE,
      detail([
        { type: 'ShortText', prompt: 'first' },
        { type: 'ShortText', prompt: 'created' },
        { key: 'b', type: 'ShortText', prompt: 'keyed' },
      ]),
      new Map([['b', STUB_B]]),
      user,
    );

    const onPage = (rows.get(QUESTION) ?? []).filter((q) => q.PageID === PAGE);
    const orders = onPage.map((q) => Number(q.DisplayOrder)).sort((a, b) => a - b);
    expect(new Set(orders).size).toBe(3);
    expect(Math.max(...orders)).toBe(10);
  });

  it('refines in place when the detail matches the stubs one for one', async () => {
    const result = await applyPageDetail(
      FORM,
      PAGE,
      detail([
        { type: 'ShortText', prompt: 'first' },
        { type: 'ShortText', prompt: 'second' },
      ]),
      new Map(),
      user,
    );

    expect(result.questionsAdded).toBe(0);
    expect(result.questionsUpdated).toBe(2);
    expect((rows.get(QUESTION) ?? []).filter((q) => q.PageID === PAGE)).toHaveLength(2);
  });
});

describe('applyPageDetail — scope and ordering', () => {
  it('touches only the page it was given', async () => {
    await applyPageDetail(
      FORM,
      PAGE,
      detail([{ type: 'ShortText', prompt: 'first' }, { type: 'ShortText', prompt: 'second' }]),
      new Map(),
      user,
    );

    const other = (rows.get(QUESTION) ?? []).find((q) => q.ID === OTHER_PAGE_Q);
    expect(other?.Prompt).toBe('elsewhere');
    expect((rows.get(QUESTION) ?? []).filter((q) => q.PageID === PAGE)).toHaveLength(2);
  });

  it('claims stubs in DisplayOrder, not in the order the rows happen to be stored', async () => {
    // `loadPageQuestions` sorts by DisplayOrder, and the whole ordering contract rests on that.
    // Stored back-to-front here, so a query that dropped its OrderBy would refine the wrong rows.
    rows.set(QUESTION, [
      { ID: STUB_B, FormID: FORM, PageID: PAGE, QuestionType: 'ShortText', Prompt: 'B', DisplayOrder: 1 },
      { ID: STUB_A, FormID: FORM, PageID: PAGE, QuestionType: 'ShortText', Prompt: 'A', DisplayOrder: 0 },
    ]);

    await applyPageDetail(
      FORM,
      PAGE,
      detail([{ type: 'ShortText', prompt: 'first' }, { type: 'ShortText', prompt: 'second' }]),
      new Map(),
      user,
    );

    expect((rows.get(QUESTION) ?? []).find((q) => q.ID === STUB_A)?.Prompt).toBe('first');
    expect((rows.get(QUESTION) ?? []).find((q) => q.ID === STUB_B)?.Prompt).toBe('second');
  });

  it('numbers SEVERAL created questions consecutively, never twice on one number', async () => {
    // One create can be right by accident. Two cannot: a `nextOrder` that does not advance puts
    // both new rows on the same number, which is the tie nothing here renumbers away.
    await applyPageDetail(
      FORM,
      PAGE,
      detail([
        { type: 'ShortText', prompt: 'one' },
        { type: 'ShortText', prompt: 'two' },
        { type: 'ShortText', prompt: 'three' },
        { type: 'ShortText', prompt: 'four' },
      ]),
      new Map(),
      user,
    );

    const orders = (rows.get(QUESTION) ?? [])
      .filter((q) => q.PageID === PAGE)
      .map((q) => Number(q.DisplayOrder))
      .sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2, 3]);
  });
});
