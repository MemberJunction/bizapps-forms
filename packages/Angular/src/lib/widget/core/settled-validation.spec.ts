import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedFormDefinition, PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';

import { UploadError, type UploadedFile } from '../api/form-upload.interface';
import { FormRuntime } from './form-runtime';
import { judgeWhenSettled, StepJudge } from './settled-validation';
import { FormUploadStore, UPLOAD_RETRY_DELAYS_MS, type UploadSend } from './upload-store';
import { fullForm } from './widget-form';

/** One required Doodle — the question #248 was reported against — and one optional text. */
function doodleForm(): PublishedFormDefinition {
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Drawing',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          { id: 'q-doodle', type: 'Doodle', prompt: 'Draw', isRequired: true, displayOrder: 1, options: [] },
          { id: 'q-note', type: 'ShortText', prompt: 'Note', isRequired: false, displayOrder: 2, options: [] },
        ],
      },
    ],
    endScreens: [],
  };
}

/** A real runtime with a real store connected to it — the only wiring that ships. */
function connected(): { store: FormUploadStore; runtime: FormRuntime; questions: PublishedFormQuestion[] } {
  const runtime = new FormRuntime(fullForm(doodleForm()));
  const store = new FormUploadStore();
  store.connect(runtime);
  return { store, runtime, questions: runtime.visibleAnswerableQuestions() };
}

const drawing = (): File => new File(['png'], 'drawing.png');
const stored = (fileId: string): UploadedFile => ({ fileId, name: 'drawing.png', size: 3, contentType: 'image/png' });

/** A transport call that stays on the wire until the test settles it. */
function heldSend() {
  let settle: { resolve: (f: UploadedFile) => void; reject: (e: unknown) => void } | null = null;
  const send = vi.fn<UploadSend>(() => new Promise<UploadedFile>((resolve, reject) => (settle = { resolve, reject })));
  return { send, resolve: (fileId: string) => settle?.resolve(stored(fileId)) };
}

/** Has `promise` settled yet, and with what? Reads it without waiting for it. */
async function peek<T>(promise: Promise<T>): Promise<{ done: false } | { done: true; value: T }> {
  let result: { done: false } | { done: true; value: T } = { done: false };
  void promise.then((value) => (result = { done: true, value }));
  await vi.advanceTimersByTimeAsync(0);
  return result;
}

describe('judgeWhenSettled — Next waits for the section’s uploads before judging it', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    warn.mockRestore();
  });

  it('judges at once when nothing is uploading', async () => {
    const { store, runtime, questions } = connected();

    const verdict = await peek(judgeWhenSettled(store, runtime, questions));

    // A required drawing nobody drew is still required — waiting must not excuse it.
    expect(verdict).toEqual({ done: true, value: false });
    expect(runtime.visibleErrorFor(questions[0])).not.toBeNull();
  });

  it('does not call a drawing on the wire "required", and passes once it lands', async () => {
    const { store, runtime, questions } = connected();
    const wire = heldSend();
    void store.upload('q-doodle', drawing(), wire.send);

    const judged = judgeWhenSettled(store, runtime, questions);

    // The defect: the respondent tapped Next while the drawing uploaded and was told it was
    // required. Nothing is judged — nor touched — until the upload settles.
    expect(await peek(judged)).toEqual({ done: false });
    expect(runtime.isTouched('q-doodle')).toBe(false);
    expect(runtime.visibleErrorFor(questions[0])).toBeNull();

    wire.resolve('file-drawing');

    expect(await peek(judged)).toEqual({ done: true, value: true });
    expect(runtime.valueFor('q-doodle')).toBe('file-drawing');
  });

  it('keeps waiting through the retries, then refuses once they are spent — without calling the drawing "required"', async () => {
    const { store, runtime, questions } = connected();
    const send = vi.fn<UploadSend>(() => Promise.reject(new UploadError('Network down.', 'transient')));
    void store.upload('q-doodle', drawing(), send);

    const judged = judgeWhenSettled(store, runtime, questions);
    await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS[0] + UPLOAD_RETRY_DELAYS_MS[1]);
    expect(await peek(judged)).toEqual({ done: false });
    expect(runtime.visibleErrorFor(questions[0])).toBeNull();

    await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS[2]);

    expect(await peek(judged)).toEqual({ done: true, value: false });
    // The quiet "Your file did not save…" line explains this question; "This question is
    // required." beside it would contradict it — the respondent DID draw something.
    expect(runtime.isTouched('q-doodle')).toBe(false);
    expect(runtime.visibleErrorFor(questions[0])).toBeNull();
  });

  it('refuses a failed upload on an OPTIONAL question too, and still touches the rest', async () => {
    const { store, runtime, questions } = connected();
    const optional = questions.map((question) => (question.id === 'q-doodle' ? { ...question, isRequired: false } : question));
    await store.upload('q-doodle', drawing(), () => Promise.reject(new UploadError('Too big.', 'refused')));

    // Skipping the drawing would be fine; a drawing that failed to save is not a skipped one.
    expect(await peek(judgeWhenSettled(store, runtime, optional))).toEqual({ done: true, value: false });
    expect(runtime.isTouched('q-doodle')).toBe(false);
    expect(runtime.isTouched('q-note')).toBe(true);
  });

  it('restarts an upload whose retries were spent, waits for it, and passes once it lands', async () => {
    const { store, runtime, questions } = connected();
    let online = false;
    const send = vi.fn<UploadSend>(() =>
      online ? Promise.resolve(stored('file-drawing')) : Promise.reject(new UploadError('Network down.', 'transient')),
    );
    void store.upload('q-doodle', drawing(), send);
    await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0));
    expect(store.failureAmong(['q-doodle'])?.kind).toBe('unsaved');
    const attemptsBefore = send.mock.calls.length;

    // Next (or Submit) again is the respondent saying "try again". Without the restart a REQUIRED
    // drawing is judged empty here, no submit is ever emitted, and nothing downstream can retry it.
    online = true;
    const judged = judgeWhenSettled(store, runtime, questions);

    expect(await peek(judged)).toEqual({ done: true, value: true });
    expect(send).toHaveBeenCalledTimes(attemptsBefore + 1);
    expect(runtime.valueFor('q-doodle')).toBe('file-drawing');
  });

  it('does not restart a refused upload — the same bytes get the same verdict', async () => {
    const { store, runtime, questions } = connected();
    const send = vi.fn<UploadSend>(() => Promise.reject(new UploadError('Too big.', 'refused')));
    await store.upload('q-doodle', drawing(), send);

    expect(await peek(judgeWhenSettled(store, runtime, questions))).toEqual({ done: true, value: false });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('waits only for the questions it judges', async () => {
    const { store, runtime, questions } = connected();
    const wire = heldSend();
    void store.upload('q-doodle', drawing(), wire.send);

    // A section without the drawing on it has nothing to wait for.
    const note = questions.filter((question) => question.id === 'q-note');

    expect(await peek(judgeWhenSettled(store, runtime, note))).toEqual({ done: true, value: true });
  });
});

describe('StepJudge — a Next that waits can be tapped twice, or walked away from', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A judge over a step cursor the test moves by hand, as a renderer's Back would. */
  function judgeOnStep(initial: string) {
    const { store, runtime, questions } = connected();
    let step: string | null = initial;
    const judge = new StepJudge(store, () => step);
    return { store, runtime, questions, judge, moveTo: (next: string | null) => (step = next) };
  }

  it('answers once for a double tap while the upload is on the wire', async () => {
    const { store, runtime, questions, judge } = judgeOnStep('p1');
    const wire = heldSend();
    void store.upload('q-doodle', drawing(), wire.send);

    const first = judge.judge(runtime, questions);
    const second = judge.judge(runtime, questions);

    // The second tap has nothing to add: it is dropped at once rather than queued behind the
    // first, which would resume on the same step and advance a second time.
    expect(await peek(second)).toEqual({ done: true, value: 'stale' });
    expect(await peek(first)).toEqual({ done: false });

    wire.resolve('file-drawing');

    expect(await peek(first)).toEqual({ done: true, value: 'valid' });
  });

  it('judges again once the previous judgement has answered', async () => {
    const { runtime, questions, judge } = judgeOnStep('p1');

    expect(await judge.judge(runtime, questions)).toBe('invalid');
    // The in-flight flag must clear, or one refused Next would freeze the button for good.
    expect(await judge.judge(runtime, questions)).toBe('invalid');
  });

  it('is stale when the respondent left the step during the wait', async () => {
    const { store, runtime, questions, judge, moveTo } = judgeOnStep('p1');
    const wire = heldSend();
    void store.upload('q-doodle', drawing(), wire.send);

    const verdict = judge.judge(runtime, questions);
    moveTo('p0');
    wire.resolve('file-drawing');

    // Valid, but about a screen the respondent is no longer on: advancing now would move them
    // forward from wherever Back took them.
    expect(await peek(verdict)).toEqual({ done: true, value: 'stale' });
  });

  it('judges the step Back led to at once, while the abandoned step still waits', async () => {
    const { store, runtime, questions, judge, moveTo } = judgeOnStep('p1');
    const wire = heldSend();
    void store.upload('q-doodle', drawing(), wire.send);
    const doodle = questions.filter((question) => question.id === 'q-doodle');
    const note = questions.filter((question) => question.id === 'q-note');

    const abandoned = judge.judge(runtime, doodle);
    moveTo('p0'); // Back, by keyboard: the scrim blocks the pointer, not the form
    // Next on the earlier step has nothing to wait for. The in-flight judgement belongs to a step
    // the respondent left, so it must not swallow this one.
    expect(await peek(judge.judge(runtime, note))).toEqual({ done: true, value: 'valid' });

    wire.resolve('file-drawing');
    expect(await peek(abandoned)).toEqual({ done: true, value: 'stale' });
  });

  it('touches nothing on a step the respondent left during the wait', async () => {
    const { store, runtime, questions, judge, moveTo } = judgeOnStep('p1');
    const wire = heldSend();
    void store.upload('q-doodle', drawing(), wire.send);
    // `q-note` made required so an error would show the moment it is touched.
    const strict = questions.map((question) => (question.id === 'q-note' ? { ...question, isRequired: true } : question));

    const verdict = judge.judge(runtime, strict);
    moveTo('p0');
    wire.resolve('file-drawing');

    expect(await peek(verdict)).toEqual({ done: true, value: 'stale' });
    // A stale verdict acts on nothing — including marking the old step's fields touched, which
    // would greet the respondent with "required" errors when they come back to it.
    expect(runtime.isTouched('q-note')).toBe(false);
    expect(runtime.isTouched('q-doodle')).toBe(false);
  });
});

describe('StepJudge.firstProblemIn — where focus goes after an invalid verdict', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('names a question whose upload failed even when it has no validation error', async () => {
    const { store, runtime, questions } = connected();
    const optional = questions.map((question) => (question.id === 'q-doodle' ? { ...question, isRequired: false } : question));
    await store.upload('q-doodle', drawing(), () => Promise.reject(new UploadError('Too big.', 'refused')));
    const judge = new StepJudge(store, () => 'p1');

    // `errorFor` is null for an optional, unanswered drawing, so a renderer that looked only at
    // it would refuse Next and then focus nothing.
    expect(runtime.errorFor(optional[0])).toBeNull();
    expect(judge.firstProblemIn(runtime, optional)?.id).toBe('q-doodle');
  });

  it('names the first question with a validation error, in the order given', () => {
    const { runtime, questions } = connected();
    const judge = new StepJudge(new FormUploadStore(), () => 'p1');

    expect(judge.firstProblemIn(runtime, questions)?.id).toBe('q-doodle');
    expect(judge.firstProblemIn(runtime, questions.filter((q) => q.id === 'q-note'))).toBeNull();
  });
});
