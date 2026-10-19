/**
 * `FormsResponseDetailComponent`'s dead-letter retry (#311), exercised as a class.
 *
 * This suite runs in node with no DOM, so the component is constructed in an injection context (the
 * same construction as `responses-tab.component.spec.ts`) and its operation is answered by
 * `installFakeOperations`, so the REAL `runOperation` and generated operation class run. What the
 * template draws is pinned against its source, comments stripped: a guard that matched its own
 * documentation would prove nothing.
 */
import '@angular/compiler';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteOpResult } from '@memberjunction/core';
import { installFakeOperations, refused, succeeded, type FakeOperations } from '../shared/testing/fake-operations';
import { FormsResponseDetailComponent } from './response-detail.component';
import { ResponseFileDownloadService } from './response-file-download.service';
import type { ResponseAutomationEventView, ResponseDetail } from './response-models';

let operations: FakeOperations | null = null;
let answer: () => RemoteOpResult<unknown> | Promise<RemoteOpResult<unknown>>;

beforeEach(() => {
  answer = () => succeeded({ FormAutomationEventID: 'evt-dead', Status: 'Pending' });
  operations = installFakeOperations(() => answer());
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  operations?.restore();
  operations = null;
  vi.restoreAllMocks();
});

function event(overrides: Partial<ResponseAutomationEventView> = {}): ResponseAutomationEventView {
  return {
    eventId: 'evt-dead',
    trigger: 'OnComplete',
    status: 'DeadLetter',
    attemptCount: 5,
    lastError: 'Provider timed out',
    completedAt: null,
    ...overrides,
  };
}

function detail(events: ResponseAutomationEventView[]): ResponseDetail {
  return {
    responseId: 'resp-1',
    status: 'Complete',
    startedAt: null,
    submittedAt: null,
    respondent: 'Respondent',
    answers: [],
    unlabelledAnswerCount: 0,
    labelsMissing: false,
    unavailableSections: [],
    automationRuns: [],
    automationEvents: events,
    bindingRecords: [],
  };
}

function construct(d: ResponseDetail): FormsResponseDetailComponent {
  const injector = Injector.create({
    providers: [
      { provide: ResponseFileDownloadService, useValue: {} },
      { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined } },
    ],
  });
  const c = runInInjectionContext(injector, () => new FormsResponseDetailComponent());
  c.Detail = d;
  return c;
}

const template = (): string =>
  readFileSync(join(__dirname, 'response-detail.component.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

/** The markup drawn once per dead-lettered event: from its loop to the loop's close. */
const deadLetterBlock = (): string => {
  const source = template();
  const start = source.indexOf('@for (e of DeadLetters');
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('@for (r of Detail.automationRuns', start));
};

describe('a dead-lettered automation event', () => {
  it('is listed with its last error, under a danger badge, beside a Retry automations button', () => {
    const c = construct(detail([event()]));

    expect(c.DeadLetters.map((e) => [e.eventId, e.lastError])).toEqual([['evt-dead', 'Provider timed out']]);
    const block = deadLetterBlock();
    expect(block).toMatch(/class="mjf-badge mjf-badge--danger"[^>]*>[\s\S]*?Automations failed/);
    expect(block).toContain('{{ e.lastError }}');
    expect(block).toMatch(/\(click\)="RetryAutomations\(e\)"[\s\S]*?Retry automations/);
  });

  it('opens the "what this submission did" section even when it is the only thing to show', () => {
    expect(template()).toContain(
      '@if (Detail.automationRuns.length > 0 || Detail.bindingRecords.length > 0 || DeadLetters.length > 0)',
    );
  });

  it.each(['Complete', 'Abandoned', 'Pending', 'Running'] as const)('is the only status offered a retry, never %s', (status) => {
    const c = construct(detail([event({ status })]));

    expect(c.DeadLetters).toEqual([]);
  });

  it('holds the button while the replay runs, and says so', () => {
    const block = deadLetterBlock();
    expect(block).toMatch(/\[disabled\]="RetryingEventId !== ''"/);
    expect(block).toMatch(/\[attr\.aria-busy\]="RetryingEventId === e\.eventId"/);
  });
});

describe('Retry automations', () => {
  it('replays that event once and asks the host to reload the detail', async () => {
    const c = construct(detail([event()]));
    const reloads: unknown[] = [];
    c.Reload.subscribe(() => reloads.push(true));

    const retry = c.RetryAutomations(event());
    expect(c.RetryingEventId).toBe('evt-dead');
    await retry;

    expect(operations?.calls).toEqual([{ key: 'Forms.ReplayAutomationEvent', input: { FormAutomationEventID: 'evt-dead' } }]);
    expect(reloads).toHaveLength(1);
    expect(c.RetryingEventId).toBe('');
    expect(c.RetryError).toBe('');
  });

  it('shows a refusal beside the event and does not reload', async () => {
    answer = () => refused('Automation event evt-dead was already replayed or changed, so it was not replayed.');
    const c = construct(detail([event()]));
    const reloads: unknown[] = [];
    c.Reload.subscribe(() => reloads.push(true));

    await c.RetryAutomations(event());

    expect(reloads).toHaveLength(0);
    expect(c.RetryError).toContain('already replayed');
    expect(c.RetryErrorEventId).toBe('evt-dead');
    expect(c.RetryingEventId).toBe('');
    expect(deadLetterBlock()).toMatch(/@if \(RetryError && RetryErrorEventId === e\.eventId\)[\s\S]*?role="alert"[\s\S]*?\{\{ RetryError \}\}/);
  });

  it('ignores a second click while a replay is in flight', async () => {
    let settle: (r: RemoteOpResult<unknown>) => void = () => undefined;
    answer = () => new Promise((resolve) => (settle = resolve));
    const c = construct(detail([event()]));

    const first = c.RetryAutomations(event());
    await c.RetryAutomations(event());
    settle(succeeded({ FormAutomationEventID: 'evt-dead', Status: 'Pending' }));
    await first;

    expect(operations?.calls).toHaveLength(1);
  });

  it('refuses an event that is not dead-lettered without calling the server', async () => {
    const c = construct(detail([event({ status: 'Complete' })]));

    await c.RetryAutomations(event({ status: 'Complete' }));

    expect(operations?.calls).toEqual([]);
  });
});
