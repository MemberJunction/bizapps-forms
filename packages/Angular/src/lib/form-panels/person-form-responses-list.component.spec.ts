/**
 * The Person Forms list, driven for real: load failure, then Retry.
 *
 * Like `validation-rule-editor.spec.ts`, this instantiates the component class directly — it has
 * no constructor injection — because the behaviour under test (a failed load is logged and can be
 * retried in place) is an emission sequence a source-level assertion could only claim exists.
 * `@angular/compiler` is imported for its side effect: `@angular/common` needs the JIT compiler
 * present to finish its partially-compiled injectables at import time.
 */
import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonFormResponseRaw } from './person-form-responses.model';

interface FakeRunViewResult {
  Success: boolean;
  ErrorMessage: string;
  Results: PersonFormResponseRaw[];
}

const runViewMock = vi.fn<(params: object) => Promise<FakeRunViewResult>>();
const logErrorMock = vi.fn<(message: string) => void>();

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return {
    ...actual,
    RunView: class {
      RunView(params: object): Promise<FakeRunViewResult> {
        return runViewMock(params);
      }
    },
    LogError: (message: string) => logErrorMock(message),
  };
});

const { PersonFormResponsesListComponent } = await import('./person-form-responses-list.component');

const PERSON_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const row = (id: string): PersonFormResponseRaw => ({
  ID: id, FormID: 'f', Form: 'Intake', Status: 'Complete',
  StartedAt: '2026-01-02T10:00:00Z', SubmittedAt: '2026-01-02T10:05:00Z',
  __mj_CreatedAt: '2026-01-02T10:00:00Z',
});

/** Lets the awaited RunView promise and the code after it run. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('PersonFormResponsesListComponent', () => {
  beforeEach(() => {
    runViewMock.mockReset();
    logErrorMock.mockReset();
  });

  it('logs a failed load with the person id, and Retry loads again into ready', async () => {
    runViewMock.mockResolvedValueOnce({ Success: false, ErrorMessage: 'boom', Results: [] });
    const list = new PersonFormResponsesListComponent();
    list.PersonID = PERSON_ID;
    const loaded: number[] = [];
    list.Loaded.subscribe((n: number) => loaded.push(n));

    list.ngOnInit();
    await settle();
    expect(list.State()).toBe('error');
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0][0]).toContain(PERSON_ID);
    expect(logErrorMock.mock.calls[0][0]).toContain('boom');
    expect(list.ErrorMessage()).not.toMatch(/reload/i);
    expect(loaded).toEqual([]);

    runViewMock.mockResolvedValueOnce({ Success: true, ErrorMessage: '', Results: [row('1'), row('2')] });
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
    const list = new PersonFormResponsesListComponent();
    list.PersonID = PERSON_ID;

    list.ngOnInit();
    await settle();
    expect(list.State()).toBe('error');
    expect(logErrorMock.mock.calls[0][0]).toContain('no provider');
  });
});
