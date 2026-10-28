/**
 * `ResponsesTabComponent` exercised as a class — the paged list and detail that both the builder's
 * Responses tab and Responses & Analytics mount.
 *
 * Constructed in an injection context (no TestBed, the same construction as the dashboard's
 * selection spec), with its operations answered by `installFakeOperations`, so the REAL reads run.
 * Each answer can be held open (a deferred), so the order loads settle in is the test's choice.
 */
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteOpResult } from '@memberjunction/core';
import type { FormsGetResponseDetailOutput, FormsListResponsesInput, FormsListResponsesOutput, FormsResponseListRow } from '@mj-biz-apps/forms-entities';
import { installFakeOperations, refused, succeeded, type FakeOperations } from '../shared/testing/fake-operations';
import { ResponsesTabComponent } from './responses-tab.component';
import { announceWrites } from '../shared/forms-writes';
import { FORMS_ENTITY } from '../shared/entity-names';

interface Call {
  key: string;
  input: unknown;
  settle(result: RemoteOpResult<unknown>): void;
}

let operations: FakeOperations | null = null;
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  operations = installFakeOperations(
    (key, input) =>
      new Promise<RemoteOpResult<unknown>>((settle) => {
        calls.push({ key, input, settle });
      }),
  );
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  // Each tab listens for writes from ngOnInit on; one left listening would re-read in a later test.
  constructed.splice(0).forEach((c) => c.ngOnDestroy());
  operations?.restore();
  operations = null;
  vi.restoreAllMocks();
});

function row(n: number): FormsResponseListRow {
  return { ResponseID: `r-${n}`, Status: 'Complete', FormVersionID: 'v1', StartedAt: null, SubmittedAt: null, RespondentPersonID: null, Respondent: `P${n}`, AnsweredCount: 1 };
}

const range = (from: number, count: number): number[] => Array.from({ length: count }, (_, i) => from + i);

function listPage(ns: number[], total: number, labelVersionId: string | null = 'v1'): RemoteOpResult<FormsListResponsesOutput> {
  return succeeded({ Rows: ns.map(row), TotalRowCount: total, LabelVersionID: labelVersionId });
}

function detail(id: string): RemoteOpResult<FormsGetResponseDetailOutput> {
  return succeeded({
    Response: { ID: id, FormID: 'form-1', FormVersionID: 'v1', Status: 'Complete', StartedAt: null, SubmittedAt: null, RespondentPersonID: null, RespondentPerson: null },
    Answers: [],
    Uploads: [],
    AutomationRuns: [],
    AutomationEvents: [],
    BindingRecords: [],
    LabelFormVersionID: 'v1',
    DefinitionJSON: '{"pages":[]}',
    UnavailableSections: [],
  });
}

const constructed: ResponsesTabComponent[] = [];

function construct(): ResponsesTabComponent {
  const c = runInInjectionContext(Injector.create({ providers: [] }), () => new ResponsesTabComponent());
  c.FormID = 'form-1';
  constructed.push(c);
  return c;
}

/** Lets a settled operation's continuation run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ResponsesTabComponent', () => {
  it('loads the first page of Complete responses and shows the form-wide total', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1, 2], 450));
    await loading;

    expect(calls[0]).toMatchObject({ key: 'Forms.ListResponses', input: { FormID: 'form-1', Status: 'Complete', StartRow: 0 } });
    expect(c.Rows().map((r) => r.responseId)).toEqual(['r-1', 'r-2']);
    expect(c.Total()).toBe(450);
    expect(c.View()).toBe('list');
  });

  it('reads "never published" from the missing label version, not from a failure', async () => {
    const unpublished = construct();
    const a = unpublished.ngOnInit();
    calls[0].settle(listPage([], 0, null));
    await a;

    const failing = construct();
    const b = failing.ngOnInit();
    calls[1].settle(refused('The server is down.'));
    await b;

    expect(unpublished.View()).toBe('never-published');
    expect(failing.View()).toBe('failed');
    expect(failing.Error()).toContain('The server is down.');
  });

  it('asks the server for the page, sort and search the table shows (F08)', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage(range(0, 25), 217));
    await loading;
    expect(calls[0].input).toMatchObject({ StartRow: 0, MaxRows: 25, OrderBy: 'SubmittedAt DESC', Search: null });

    // A new sort or page size starts again on page 1 …
    const sorted = c.SetQuery({ ...c.Query(), page: 3, pageSize: 50, sort: 'oldest' });
    calls[1].settle(listPage(range(0, 50), 217));
    await sorted;
    expect(calls[1].input).toMatchObject({ StartRow: 0, MaxRows: 50, OrderBy: 'SubmittedAt ASC' });

    // … and a page turn keeps them.
    const paged = c.SetQuery({ ...c.Query(), page: 3 });
    calls[2].settle(listPage(range(100, 50), 217));
    await paged;

    expect(calls[2].input).toMatchObject({ StartRow: 100, MaxRows: 50, OrderBy: 'SubmittedAt ASC' });
    expect(c.Rows()).toHaveLength(50);
    expect(c.PageCount()).toBe(5);
  });

  it('sends a search to the server and starts it on page 1', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage(range(0, 25), 217));
    await loading;
    const paged = c.SetQuery({ ...c.Query(), page: 4 });
    calls[1].settle(listPage(range(75, 25), 217));
    await paged;

    const searched = c.SetQuery({ ...c.Query(), search: 'ann' });
    calls[2].settle(listPage([7], 1));
    await searched;

    expect(calls[2].input).toMatchObject({ Search: 'ann', StartRow: 0 });
    expect(c.Query().page).toBe(1);
    expect(c.Total()).toBe(1);
  });

  it('shows "no match" in the list, not "no responses yet", when a search finds nothing', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1));
    await loading;

    const searched = c.SetQuery({ ...c.Query(), search: 'zzz' });
    calls[1].settle(listPage([], 0));
    await searched;

    expect(c.View()).toBe('list');
  });

  it('never lets a slower, earlier page overwrite a later one', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 60));
    await loading;

    const first = c.SetQuery({ ...c.Query(), page: 2 });
    const second = c.SetQuery({ ...c.Query(), page: 3 });
    calls[2].settle(listPage([51], 60));
    calls[1].settle(listPage([26], 60));
    await Promise.all([first, second]);

    expect(c.Rows().map((r) => r.responseId)).toEqual(['r-51']);
    expect(c.Query().page).toBe(3);
  });

  it('lands on the last page when the one asked for is past the end', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 30));
    await loading;

    const states: { query: { page: number } }[] = [];
    c.StateChange.subscribe((st) => states.push(st));
    const paged = c.SetQuery({ ...c.Query(), page: 9 });
    calls[1].settle(listPage([], 30));
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2].input).toMatchObject({ StartRow: 25 });
    calls[2].settle(listPage([26, 27, 28, 29, 30], 30));
    await paged;

    expect(c.Query().page).toBe(2);
    expect(c.Rows()).toHaveLength(5);
    // …and tells the host, so the URL does not keep the page that was past the end.
    expect(states.at(-1)?.query.page).toBe(2);
  });

  it('opens the next response on the page, and says where it is', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1, 2, 3], 3));
    await loading;
    const opening = c.OpenResponse('r-2');
    calls[1].settle(detail('r-2'));
    await opening;
    expect(c.DetailPosition()).toEqual({ index: 2, total: 3, hasPrevious: true, hasNext: true });

    const next = c.OpenAdjacent(1);
    calls[2].settle(detail('r-3'));
    await next;

    expect(calls[2].input).toMatchObject({ ResponseID: 'r-3' });
    expect(c.DetailPosition()).toEqual({ index: 3, total: 3, hasPrevious: true, hasNext: false });
  });

  it('crosses to the next page to open the response after the last one on it', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage(range(1, 25), 30));
    await loading;
    const opening = c.OpenResponse('r-25');
    calls[1].settle(detail('r-25'));
    await opening;

    const next = c.OpenAdjacent(1);
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2].input).toMatchObject({ StartRow: 25 });
    calls[2].settle(listPage(range(26, 5), 30));
    await vi.waitFor(() => expect(calls).toHaveLength(4));
    calls[3].settle(detail('r-26'));
    await next;

    expect(c.Query().page).toBe(2);
    expect(c.Detail()?.responseId).toBe('r-26');
    expect(c.DetailPosition()?.index).toBe(26);
  });

  it('tells its host what it shows, so the host can keep it in the URL (F09)', async () => {
    const c = construct();
    const states: unknown[] = [];
    c.StateChange.subscribe((s) => states.push(s));
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1));
    await loading;
    const opening = c.OpenResponse('r-1');
    calls[1].settle(detail('r-1'));
    await opening;
    c.CloseDetail();

    expect(states).toEqual([
      { query: c.Query(), responseId: 'r-1' },
      { query: c.Query(), responseId: null },
    ]);
  });

  it('opens what a deep link names: its page, then its response', async () => {
    const c = construct();
    c.InitialState = { query: { search: '', sort: 'newest', page: 2, pageSize: 25 }, responseId: 'r-30' };
    const loading = c.ngOnInit();
    expect(calls[0].input).toMatchObject({ StartRow: 25 });
    calls[0].settle(listPage(range(26, 5), 30));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1].settle(detail('r-30'));
    await loading;

    expect(c.Detail()?.responseId).toBe('r-30');
  });

  it('re-reads the list when a Form Response is written elsewhere', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1));
    await loading;

    announceWrites([FORMS_ENTITY.FormResponse], 'delete');

    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({ key: 'Forms.ListResponses', input: { StartRow: 0 } });
    c.ngOnDestroy();
  });

  it('tells its host while a response is opening, so the host can hold its own controls', async () => {
    const c = construct();
    const busy: boolean[] = [];
    c.BusyChange.subscribe((b: boolean) => busy.push(b));
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1));
    await loading;

    const open = c.OpenResponse('r-1');
    expect(c.OpeningResponse()).toBe(true);
    calls[1].settle(detail('r-1'));
    await open;

    expect(busy).toEqual([true, false]);
    expect(c.OpeningResponse()).toBe(false);
  });

  it('labels an opened response from the form\'s Published version', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1, 'published-v'));
    await loading;

    const open = c.OpenResponse('r-1');
    calls[1].settle(detail('r-1'));
    await open;

    expect(calls[1]).toMatchObject({ key: 'Forms.GetResponseDetail', input: { ResponseID: 'r-1', LabelFormVersionID: 'published-v' } });
    expect(c.View()).toBe('detail');
  });

  it('re-reads the open response, labelled the same way, when the detail asks to reload (#311)', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1, 'published-v'));
    await loading;
    const open = c.OpenResponse('r-1');
    calls[1].settle(detail('r-1'));
    await open;

    const reload = c.ReloadDetail();
    expect(calls[2]).toMatchObject({ key: 'Forms.GetResponseDetail', input: { ResponseID: 'r-1', LabelFormVersionID: 'published-v' } });
    calls[2].settle(detail('r-1'));
    await reload;

    expect(c.View()).toBe('detail');
    expect(c.Detail()?.responseId).toBe('r-1');
  });

  it('keeps a detail the reader closed closed when its reload lands afterwards', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1));
    await loading;
    const open = c.OpenResponse('r-1');
    calls[1].settle(detail('r-1'));
    await open;

    const reload = c.ReloadDetail();
    c.CloseDetail();
    calls[2].settle(detail('r-1'));
    await reload;

    expect(c.Detail()).toBeNull();
    expect(c.View()).toBe('list');
  });

  it('opens the response the reader picks while a reload is in flight, and drops the reload', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1, 2], 2));
    await loading;
    const open = c.OpenResponse('r-1');
    calls[1].settle(detail('r-1'));
    await open;

    const reload = c.ReloadDetail();
    c.CloseDetail();
    const pick = c.OpenResponse('r-2');
    expect(calls.filter((x) => x.key === 'Forms.GetResponseDetail')).toHaveLength(3);
    calls[3].settle(detail('r-2'));
    await pick;
    calls[2].settle(detail('r-1'));
    await reload;

    expect(c.Detail()?.responseId).toBe('r-2');
  });

  it('keeps the open detail under the error when its reload fails', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1));
    await loading;
    const open = c.OpenResponse('r-1');
    calls[1].settle(detail('r-1'));
    await open;

    const reload = c.ReloadDetail();
    calls[2].settle(refused('Too slow.'));
    await reload;

    expect(c.Detail()?.responseId).toBe('r-1');
    expect(c.Error()).toContain('Too slow.');
  });

  it('clears an earlier reload failure when the next reload succeeds', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1));
    await loading;
    const open = c.OpenResponse('r-1');
    calls[1].settle(detail('r-1'));
    await open;
    const failed = c.ReloadDetail();
    calls[2].settle(refused('Too slow.'));
    await failed;

    const retried = c.ReloadDetail();
    calls[3].settle(detail('r-1'));
    await retried;

    expect(c.Error()).toBeNull();
  });

  it('wires the detail\'s Reload in both of its hosts', () => {
    const source = (file: string): string => readFileSync(join(__dirname, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    expect(source('responses-tab.component.ts')).toContain('(Reload)="ReloadDetail()"');
    expect(source('response-form.component.ts')).toContain('(Reload)="reloadDetail()"');
  });

  it('ignores a second click while a response is opening, so the reader lands on the one they picked', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1, 2], 2));
    await loading;

    const first = c.OpenResponse('r-1');
    await c.OpenResponse('r-2');
    calls[1].settle(detail('r-1'));
    await first;

    expect(calls.filter((x) => x.key === 'Forms.GetResponseDetail')).toHaveLength(1);
    expect(c.Detail()?.responseId).toBe('r-1');
  });

  it('drops a detail that arrives after a refresh started a new list, and logs its failure instead of showing it', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1));
    await loading;

    const open = c.OpenResponse('r-1');
    const refresh = c.Refresh();
    calls[1].settle(refused('Too slow.'));
    await open;
    calls[2].settle(listPage([1], 1));
    await refresh;
    await flush();

    expect(c.Detail()).toBeNull();
    expect(c.Error()).toBeNull();
    expect(vi.mocked(console.error).mock.calls.flat().map(String).join('\n')).toContain('Too slow.');
  });

  it('does not open a response over a list the reader refreshed while it loaded', async () => {
    const c = construct();
    const loading = c.ngOnInit();
    calls[0].settle(listPage([1], 1));
    await loading;

    const open = c.OpenResponse('r-1');
    const refresh = c.Refresh();
    calls[1].settle(detail('r-1'));
    await open;
    calls[2].settle(listPage([1], 1));
    await refresh;

    expect(c.Detail()).toBeNull();
    expect(c.View()).toBe('list');
  });
});
