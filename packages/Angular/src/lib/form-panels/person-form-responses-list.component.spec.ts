/**
 * The Person Forms list, driven for real: load failure and Retry, the host form's record
 * refresh, a change of person, and a superseded load.
 *
 * Like `validation-rule-editor.spec.ts`, this instantiates the component class directly, because
 * the behaviour under test is an emission sequence a source-level assertion could only claim
 * exists. `@angular/compiler` is imported for its side effect: `@angular/common` needs the JIT
 * compiler present to finish its partially-compiled injectables at import time.
 *
 * The component injects MJ's `FormRecordRefreshCoordinator`, so it is constructed inside an
 * `Injector.create` injection context. `@memberjunction/ng-base-forms` itself cannot load in this
 * node suite (its partially-compiled components need the Angular Linker), so it is mocked down to
 * the one token the list imports; the test provides its own stand-in with the same `Refreshed$`
 * shape, so what is exercised is the real subscription, not a source pattern.
 */
import '@angular/compiler';
import { EventEmitter, Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonFormResponseRaw } from './person-form-responses.model';

interface FakeRunViewResult {
  Success: boolean;
  ErrorMessage: string;
  Results: PersonFormResponseRaw[];
}

const runViewMock = vi.fn<(params: { ExtraFilter?: string }) => Promise<FakeRunViewResult>>();
const logErrorMock = vi.fn<(message: string) => void>();

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return {
    ...actual,
    RunView: class {
      RunView(params: { ExtraFilter?: string }): Promise<FakeRunViewResult> {
        return runViewMock(params);
      }
    },
    LogError: (message: string) => logErrorMock(message),
  };
});

vi.mock('@memberjunction/ng-base-forms', () => ({
  FormRecordRefreshCoordinator: class FormRecordRefreshCoordinator {},
}));

const { FormRecordRefreshCoordinator } = await import('@memberjunction/ng-base-forms');
const { PersonFormResponsesListComponent } = await import('./person-form-responses-list.component');

type ListComponent = InstanceType<typeof PersonFormResponsesListComponent>;

const PERSON_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER_PERSON_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const row = (id: string): PersonFormResponseRaw => ({
  ID: id, FormID: 'f', Form: 'Intake', Status: 'Complete',
  StartedAt: '2026-01-02T10:00:00Z', SubmittedAt: '2026-01-02T10:05:00Z',
  __mj_CreatedAt: '2026-01-02T10:00:00Z',
});

const ok = (...ids: string[]): FakeRunViewResult => ({ Success: true, ErrorMessage: '', Results: ids.map(row) });

/** Lets the awaited RunView promise and the code after it run. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A list wired to a stand-in refresh broadcast, with its Loaded emissions captured. */
function createList(): { list: ListComponent; refreshed: EventEmitter<object>; loaded: number[] } {
  // EventEmitter is an rxjs Subject; rxjs itself is not a direct dependency of this package.
  const refreshed = new EventEmitter<object>();
  const injector = Injector.create({
    providers: [{ provide: FormRecordRefreshCoordinator, useValue: { Refreshed$: refreshed.asObservable() } }],
  });
  const list = runInInjectionContext(injector, () => new PersonFormResponsesListComponent());
  list.PersonID = PERSON_ID;
  const loaded: number[] = [];
  list.Loaded.subscribe((n: number) => loaded.push(n));
  return { list, refreshed, loaded };
}

describe('PersonFormResponsesListComponent', () => {
  beforeEach(() => {
    runViewMock.mockReset();
    logErrorMock.mockReset();
  });

  it('logs a failed load with the person id, and Retry loads again into ready', async () => {
    runViewMock.mockResolvedValueOnce({ Success: false, ErrorMessage: 'boom', Results: [] });
    const { list, loaded } = createList();

    list.ngOnInit();
    await settle();
    expect(list.State()).toBe('error');
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0][0]).toContain(PERSON_ID);
    expect(logErrorMock.mock.calls[0][0]).toContain('boom');
    expect(list.ErrorMessage()).not.toMatch(/reload/i);
    expect(loaded).toEqual([]);

    runViewMock.mockResolvedValueOnce(ok('1', '2'));
    list.Retry();
    expect(list.State()).toBe('loading');
    await settle();

    expect(runViewMock).toHaveBeenCalledTimes(2);
    expect(list.State()).toBe('ready');
    expect(list.Rows().map((r) => r.ResponseID)).toEqual(['1', '2']);
    expect(loaded).toEqual([2]);
  });

  it('treats a thrown load the same way: logged, error state, retryable', async () => {
    runViewMock.mockRejectedValueOnce(new Error('no provider'));
    const { list } = createList();

    list.ngOnInit();
    await settle();
    expect(list.State()).toBe('error');
    expect(logErrorMock.mock.calls[0][0]).toContain('no provider');
  });

  it('reloads when the host form refreshes the record, and reports the new count', async () => {
    // Reproduced in Explorer: the Person toolbar's refresh left the section at the old count.
    runViewMock.mockResolvedValueOnce(ok('1', '2', '3'));
    const { list, refreshed, loaded } = createList();
    list.ngOnInit();
    await settle();
    expect(loaded).toEqual([3]);

    runViewMock.mockResolvedValueOnce(ok('4', '1', '2', '3'));
    refreshed.emit({});
    await settle();

    expect(runViewMock).toHaveBeenCalledTimes(2);
    expect(list.Rows().map((r) => r.ResponseID)).toEqual(['4', '1', '2', '3']);
    expect(loaded).toEqual([3, 4]);
  });

  it('ignores a refresh broadcast that arrives before it has ever loaded', async () => {
    // The coordinator's contract: listeners that never loaded must no-op.
    const { list, refreshed } = createList();
    refreshed.emit({});
    await settle();
    expect(runViewMock).not.toHaveBeenCalled();
    expect(list.State()).toBe('loading');
  });

  it('reloads for the new person when PersonID changes after the first load', async () => {
    runViewMock.mockResolvedValueOnce(ok('1'));
    const { list, loaded } = createList();
    list.ngOnInit();
    await settle();

    runViewMock.mockResolvedValueOnce(ok('9', '8'));
    list.PersonID = OTHER_PERSON_ID;
    list.ngOnChanges({
      PersonID: { previousValue: PERSON_ID, currentValue: OTHER_PERSON_ID, firstChange: false, isFirstChange: () => false },
    });
    await settle();

    expect(runViewMock.mock.calls[1][0].ExtraFilter).toContain(OTHER_PERSON_ID);
    expect(loaded).toEqual([1, 2]);
  });

  it('keeps the newer result when an earlier load fails after it', async () => {
    let resolveFirst: (r: FakeRunViewResult) => void = () => undefined;
    runViewMock.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    runViewMock.mockResolvedValueOnce(ok('new'));
    const { list, refreshed } = createList();

    list.ngOnInit();
    refreshed.emit({});
    await settle();
    resolveFirst({ Success: false, ErrorMessage: 'late failure', Results: [] });
    await settle();

    expect(list.State()).toBe('ready');
    expect(list.Rows().map((r) => r.ResponseID)).toEqual(['new']);
    // Still logged: a superseded failure is a real failure, it just no longer owns the screen.
    expect(logErrorMock.mock.calls[0][0]).toContain('late failure');
  });

  it('applies only the latest load when an earlier one resolves after it', async () => {
    let resolveFirst: (r: FakeRunViewResult) => void = () => undefined;
    runViewMock.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    runViewMock.mockResolvedValueOnce(ok('new'));
    const { list, refreshed, loaded } = createList();

    list.ngOnInit();
    refreshed.emit({});
    await settle();
    resolveFirst(ok('stale-a', 'stale-b'));
    await settle();

    expect(list.Rows().map((r) => r.ResponseID)).toEqual(['new']);
    expect(loaded).toEqual([1]);
  });
});
