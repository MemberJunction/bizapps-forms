/**
 * `ResponseFormComponent`'s reload (#311): the detail's `(Reload)` after a replay must leave the
 * open detail mounted while it re-reads, as the Responses tab does. The template draws "Loading…"
 * INSTEAD of the detail while `busy` is set, so a reload that set it would destroy the detail (its
 * inline refusal, its scroll) for the length of the read.
 *
 * Instantiated as a class, like `person-form-responses-list.component.spec.ts`:
 * `@memberjunction/ng-base-forms` cannot load in this node suite, so `BaseFormComponent` is mocked
 * down to a bare base. The handler exercised is the one the template binds to `(Reload)`, read from
 * the source, so the wiring and the behaviour are pinned together.
 */
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import type { mjBizAppsFormsFormResponseEntity } from '@mj-biz-apps/forms-entities';
import type { ResponseDetail } from './response-models';

const readResponseDetail = vi.fn<(responseId: string) => Promise<ResponseDetail>>();
vi.mock('./response-reads', () => ({ readResponseDetail: (responseId: string) => readResponseDetail(responseId) }));

vi.mock('@memberjunction/ng-base-forms', () => ({
  BaseFormComponent: class BaseFormComponent {
    async ngOnInit(): Promise<void> {
      // the real base loads the record; the spec sets it instead
    }
  },
}));

const { ResponseFormComponent } = await import('./response-form.component');

/** The members the template reads, which the component keeps protected. */
interface FormView {
  record: Pick<mjBizAppsFormsFormResponseEntity, 'ID'>;
  cdr: Pick<ChangeDetectorRef, 'markForCheck'>;
  busy: boolean;
  detail: ResponseDetail | null;
  error: string | null;
  ngOnInit(): Promise<void>;
}

const RESPONSE_ID = 'resp-1';

function detail(respondent: string): ResponseDetail {
  return {
    responseId: RESPONSE_ID,
    status: 'Complete',
    startedAt: null,
    submittedAt: null,
    respondent,
    answers: [],
    unlabelledAnswerCount: 0,
    labelsMissing: false,
    unavailableSections: [],
    automationRuns: [],
    automationEvents: [],
    bindingRecords: [],
  };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(err: Error): void } {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The method the template's `(Reload)` calls, comments stripped so a commented-out binding cannot match. */
function reloadHandler(): string {
  const source = readFileSync(join(__dirname, 'response-form.component.ts'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const handler = /\(Reload\)="(\w+)\(\)"/.exec(source)?.[1];
  if (!handler) {
    throw new Error('response-form.component.ts binds no (Reload) handler');
  }
  return handler;
}

/** An opened form, its first read already landed with `first`. */
async function opened(first: ResponseDetail): Promise<{ view: FormView; reload: () => Promise<void> }> {
  const component = new ResponseFormComponent();
  const view = component as unknown as FormView;
  view.record = { ID: RESPONSE_ID };
  view.cdr = { markForCheck: vi.fn() };
  readResponseDetail.mockResolvedValueOnce(first);
  await view.ngOnInit();
  const handler = reloadHandler();
  const reload = (component as unknown as Record<string, () => Promise<void>>)[handler];
  if (typeof reload !== 'function') {
    throw new Error(`the (Reload) handler ${handler} is not a method of ResponseFormComponent`);
  }
  return { view, reload: () => reload.call(component) };
}

beforeEach(() => {
  readResponseDetail.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('ResponseFormComponent', () => {
  it('shows Loading on the first open, then the detail', async () => {
    const component = new ResponseFormComponent();
    const view = component as unknown as FormView;
    view.record = { ID: RESPONSE_ID };
    view.cdr = { markForCheck: vi.fn() };
    const read = deferred<ResponseDetail>();
    readResponseDetail.mockReturnValueOnce(read.promise);

    const init = view.ngOnInit();
    expect(view.busy).toBe(true);
    read.resolve(detail('First'));
    await init;

    expect(view.busy).toBe(false);
    expect(view.detail?.respondent).toBe('First');
  });

  it('keeps the open detail mounted while a reload re-reads, then swaps in the new one', async () => {
    const old = detail('Old');
    const { view, reload } = await opened(old);
    const read = deferred<ResponseDetail>();
    readResponseDetail.mockReturnValueOnce(read.promise);

    const reloading = reload();
    // `@if (busy)` would replace the detail with "Loading…"; `@else if (detail)` keeps it.
    expect(view.busy).toBe(false);
    expect(view.detail).toBe(old);
    read.resolve(detail('New'));
    await reloading;

    expect(readResponseDetail).toHaveBeenLastCalledWith(RESPONSE_ID);
    expect(view.detail?.respondent).toBe('New');
    expect(view.error).toBeNull();
  });

  it('keeps the old detail and shows the error when a reload fails', async () => {
    const old = detail('Old');
    const { view, reload } = await opened(old);
    readResponseDetail.mockRejectedValueOnce(new Error('network down'));

    await reload();

    expect(view.busy).toBe(false);
    expect(view.detail).toBe(old);
    expect(view.error).toContain('network down');
  });

  it('lets the latest of two overlapping reloads win', async () => {
    const { view, reload } = await opened(detail('Old'));
    const slow = deferred<ResponseDetail>();
    const fast = deferred<ResponseDetail>();
    readResponseDetail.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const first = reload();
    const second = reload();
    fast.resolve(detail('Latest'));
    await second;
    slow.resolve(detail('Stale'));
    await first;

    expect(view.detail?.respondent).toBe('Latest');
  });
});
