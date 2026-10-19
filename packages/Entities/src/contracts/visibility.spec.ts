import { describe, expect, it } from 'vitest';
import type { AnswerValue } from './conditional-rule';
import type { PublishedFormPage, PublishedFormQuestion } from './form-definition';
import { resolveVisibleQuestions } from './rule-verbs';
import { MAX_VISIBILITY_PASSES, settleVisibility } from './visibility';

/** One page holding these questions, each a ShortText unless it says otherwise. */
function formOf(questions: Array<Partial<PublishedFormQuestion> & { id: string }>): { pages: PublishedFormPage[] } {
  return {
    pages: [
      {
        id: 'p1',
        displayOrder: 0,
        questions: questions.map((q, i) => ({
          type: 'ShortText',
          prompt: q.id,
          isRequired: false,
          displayOrder: i,
          options: [],
          ...q,
        })) as PublishedFormQuestion[],
      },
    ],
  };
}

const answers = (entries: Record<string, AnswerValue>): Map<string, AnswerValue> => new Map(Object.entries(entries));
const ids = (questions: readonly PublishedFormQuestion[]): string[] => questions.map((q) => q.id);

/**
 * `settleVisibility` is the ONE visibility derivation both sides of the wire run — the widget over
 * its live answers, the server over the payload. It replaces the widget's fixed point
 * (`settledAnswers`) and its deliberate one-pass mirror of the server (`transmittedView`), and the
 * server's single `resolveRenderedQuestions` pass. These cases moved here from the widget's
 * `form-runtime.spec.ts` when the derivation did.
 */
describe('settleVisibility', () => {
  const chained = () =>
    formOf([
      { id: 'type' },
      { id: 'sector', conditionalRule: { show: { all: [{ questionId: 'type', op: 'equals', value: 'Company' }] } } },
      { id: 'risk', conditionalRule: { show: { all: [{ questionId: 'sector', op: 'equals', value: 'Energy' }] } } },
    ]);

  it('keeps every answer and question when nothing is hidden', () => {
    const settled = settleVisibility(chained(), answers({ type: 'Company', sector: 'Energy', risk: 'High' }));
    expect(settled.settled).toBe(true);
    expect(ids(settled.rendered)).toEqual(['type', 'sector', 'risk']);
    expect([...settled.answers.keys()]).toEqual(['type', 'sector', 'risk']);
  });

  it('drops an orphaned question whose rule reads an answer that is itself hidden', () => {
    // One pass over the raw map keeps `risk`: its rule reads `sector` = Energy, which is still in
    // the raw map even though `sector` is hidden. The fixed point drops `sector`'s answer, then
    // `risk` — so what renders is what the server derives from what is sent.
    const settled = settleVisibility(chained(), answers({ type: 'Individual', sector: 'Energy', risk: 'High' }));
    expect(settled.settled).toBe(true);
    expect(ids(settled.rendered)).toEqual(['type']);
    expect([...settled.answers.keys()]).toEqual(['type']);
  });

  it('reveals a question the server would require when a hidden answer stops counting', () => {
    // `why` shows when `detail` is NOT answered. The raw map still holds a stale `detail`, so one
    // pass hides `why`; the server, which never receives the hidden `detail`, shows and requires
    // it. The settled derivation agrees with the server.
    const form = formOf([
      { id: 'gate' },
      { id: 'detail', conditionalRule: { show: { all: [{ questionId: 'gate', op: 'equals', value: 'Company' }] } } },
      { id: 'why', isRequired: true, conditionalRule: { show: { all: [{ questionId: 'detail', op: 'isNotAnswered' }] } } },
    ]);
    const settled = settleVisibility(form, answers({ gate: 'Individual', detail: 'Acme' }));
    expect(ids(settled.rendered)).toEqual(['gate', 'why']);
  });

  it('is its own fixed point: settling the settled answers changes nothing', () => {
    // The property that makes the two sides agree. The widget sends `answers`; the server settles
    // THAT, and must reach the same set in one pass.
    const first = settleVisibility(chained(), answers({ type: 'Individual', sector: 'Energy', risk: 'High' }));
    const second = settleVisibility(chained(), first.answers);
    expect(ids(second.rendered)).toEqual(ids(first.rendered));
    expect(second.passes).toBe(1);
    expect(ids(resolveVisibleQuestions(chained().pages, first.answers))).toEqual(ids(first.rendered));
  });

  it('renders display-only questions but keeps them out of the answers', () => {
    const form = formOf([{ id: 'q1' }, { id: 'note', type: 'Statement' }]);
    const settled = settleVisibility(form, answers({ q1: 'x' }));
    expect(ids(settled.rendered)).toEqual(['q1', 'note']);
    expect(ids(settled.answerable)).toEqual(['q1']);
  });

  it('honours a jump that skips a typed answer, removing it from what is sent', () => {
    const form = formOf([
      {
        id: 'q1',
        conditionalRule: {
          jump: [{ when: { all: [{ questionId: 'q3', op: 'equals', value: 'yes' }] }, target: { kind: 'question', id: 'q3' } }],
        },
      },
      { id: 'q2' },
      { id: 'q3' },
    ]);
    const settled = settleVisibility(form, answers({ q1: 'a', q2: 'typed', q3: 'yes' }));
    expect(ids(settled.rendered)).toEqual(['q1', 'q3']);
    expect(settled.answers.has('q2')).toBe(false);
  });

  it('reports a cap hit EXPLICITLY when two rules can never agree, instead of looping or warning', () => {
    // Visibility is not monotone — `isNotAnswered` means removing an answer can REVEAL a question —
    // so `a` and `b` below flip each other forever. The result says so; the caller decides what to
    // do about it (the widget logs, the server keeps the last derivation like the widget does).
    const form = formOf([
      { id: 'a', conditionalRule: { show: { all: [{ questionId: 'b', op: 'isNotAnswered' }] } } },
      { id: 'b', conditionalRule: { show: { all: [{ questionId: 'a', op: 'isAnswered' }] } } },
    ]);
    const settled = settleVisibility(form, answers({ a: '1', b: '2' }));
    expect(settled.settled).toBe(false);
    expect(settled.passes).toBe(MAX_VISIBILITY_PASSES);
    // The last derivation is still a usable answer, restricted to its own question set.
    for (const id of settled.answers.keys()) {
      expect(ids(settled.answerable)).toContain(id);
    }
  });

  it('treats an empty answer map as settled in one pass', () => {
    const settled = settleVisibility(chained(), new Map());
    expect(settled.settled).toBe(true);
    expect(settled.passes).toBe(1);
    expect(ids(settled.rendered)).toEqual(['type']);
  });
});
