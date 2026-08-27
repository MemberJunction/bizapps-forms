/**
 * What a section shows, including a word about what it is NOT showing.
 *
 * Section-at-a-time scroll removed most of the retroactive-removal problem — a jump to another
 * section now moves the respondent rather than deleting things in front of them. One case
 * survives: a `Go to` pointing at a question in the SAME section makes the questions between it
 * disappear from the screen they are looking at, instantly, with no explanation. That reads as a
 * glitch, and on a form asking for a resume it reads as a form that is broken.
 *
 * The distinction this module exists to draw is which absences are worth mentioning. A question
 * hidden by its own `show` rule is ordinary progressive disclosure: it was never on screen, the
 * respondent is not missing anything, and announcing it would narrate the form's structure at
 * them ("1 question skipped") every time a follow-up did not apply. A question a JUMP passed
 * over is different — it was visible a moment ago, and it went away because of something they
 * just typed.
 */
import { describe, expect, it } from 'vitest';
import type { AnswerValue, PublishedFormPage, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

import { entryKey, sectionEntries, skippedMessage } from './section-content';

function q(id: string, order: number, extra?: Partial<PublishedFormQuestion>): PublishedFormQuestion {
  return { id, type: 'ShortText', prompt: id, isRequired: false, displayOrder: order, options: [], ...extra };
}

/** A jump from this question to `target`, fired when q1 answers "skip". */
const jumpTo = (target: string): PublishedFormQuestion['conditionalRule'] => ({
  jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'skip' }] }, target: { kind: 'question', id: target } }],
});

const page = (questions: PublishedFormQuestion[]): PublishedFormPage => ({ id: 'p1', displayOrder: 0, questions });

const answers = (record: Record<string, AnswerValue>) => new Map(Object.entries(record));

const shape = (entries: ReturnType<typeof sectionEntries>) =>
  entries.map((e) => (e.kind === 'question' ? e.question.id : `skipped:${e.count}:${e.afterPrompt ?? '-'}`));

describe('sectionEntries', () => {
  describe('happy', () => {
    it('marks the run a jump passed over, where it was', () => {
      const p = page([q('q1', 0, { conditionalRule: jumpTo('q4') }), q('q2', 1), q('q3', 2), q('q4', 3)]);
      const rendered = [p.questions[0], p.questions[3]];
      expect(shape(sectionEntries(p, rendered, answers({ q1: 'skip' })))).toEqual([
        'q1',
        'skipped:2:q1',
        'q4',
      ]);
    });

    it('says nothing at all when nothing was skipped', () => {
      const p = page([q('q1', 0), q('q2', 1)]);
      expect(shape(sectionEntries(p, p.questions, answers({})))).toEqual(['q1', 'q2']);
    });
  });

  describe('edge', () => {
    it('a question hidden by its OWN show rule gets no marker', () => {
      // Progressive disclosure. It was never on screen, so there is nothing to explain — and a
      // marker here would narrate the form's structure on every follow-up that did not apply.
      const hidden = q('q2', 1, { conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'yes' }] } } });
      const p = page([q('q1', 0), hidden, q('q3', 2)]);
      const rendered = [p.questions[0], p.questions[2]];
      expect(shape(sectionEntries(p, rendered, answers({ q1: 'no' })))).toEqual(['q1', 'q3']);
    });

    it('a terminal jump leaves its run at the end of the section', () => {
      const p = page([q('q1', 0, { conditionalRule: { jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'skip' }] }, target: { kind: 'submit' } }] } }), q('q2', 1)]);
      expect(shape(sectionEntries(p, [p.questions[0]], answers({ q1: 'skip' })))).toEqual([
        'q1',
        'skipped:1:q1',
      ]);
    });
  });

  describe('worst', () => {
    it('does not blame a question that carries no rule', () => {
      // The run is attributed to the question immediately before it, because that is where the
      // jump fired. When a jump from an earlier SECTION lands mid-page, the question before the
      // run is an innocent bystander — naming it would tell the respondent their answer to a
      // question they never touched caused this.
      const p = page([q('q1', 0), q('q2', 1), q('q3', 2)]);
      const rendered = [p.questions[0], p.questions[2]];
      expect(shape(sectionEntries(p, rendered, answers({})))).toEqual(['q1', 'skipped:1:-', 'q3']);
    });

    it('attributes nothing when the run opens the section', () => {
      const p = page([q('q1', 0), q('q2', 1)]);
      expect(shape(sectionEntries(p, [p.questions[1]], answers({})))).toEqual(['skipped:1:-', 'q2']);
    });

    it('counts one run per gap, not one for the whole section', () => {
      const p = page([
        q('q1', 0, { conditionalRule: jumpTo('q3') }),
        q('q2', 1),
        q('q3', 2, { conditionalRule: jumpTo('q5') }),
        q('q4', 3),
        q('q5', 4),
      ]);
      const rendered = [p.questions[0], p.questions[2], p.questions[4]];
      expect(shape(sectionEntries(p, rendered, answers({ q1: 'skip' })))).toEqual([
        'q1',
        'skipped:1:q1',
        'q3',
        'skipped:1:q3',
        'q5',
      ]);
    });
  });
});

/**
 * The words the respondent reads where the questions were.
 *
 * Written from their side of the screen: they did not "trigger a conditional branch", they
 * answered a question and the form stopped asking things that no longer applied. It says WHY
 * wherever it honestly can, because the why is also the fix — if the skip was not what they
 * meant, the answer above it is the thing to change.
 */
describe('skippedMessage', () => {
  describe('happy', () => {
    it('names the answer that caused it', () => {
      expect(skippedMessage({ kind: 'skipped', count: 3, afterPrompt: 'First name' })).toBe(
        '3 questions skipped based on your answer to “First name”',
      );
    });

    it('reads as one question when it is one', () => {
      expect(skippedMessage({ kind: 'skipped', count: 1, afterPrompt: 'First name' })).toBe(
        '1 question skipped based on your answer to “First name”',
      );
    });
  });

  describe('edge', () => {
    it('says it plainly when it cannot name a cause', () => {
      expect(skippedMessage({ kind: 'skipped', count: 2 })).toBe('2 questions skipped based on your answers');
    });
  });

  describe('worst', () => {
    it('does not name a prompt that is blank', () => {
      // An untitled question would produce 'your answer to “”', which reads as a bug.
      expect(skippedMessage({ kind: 'skipped', count: 1, afterPrompt: '  ' })).toBe(
        '1 question skipped based on your answers',
      );
    });
  });
});

describe('entryKey — happy path', () => {
  it('identifies a question entry by its question id, wherever it sits', () => {
    const question = { id: 'q-resume', type: 'FileUpload', prompt: 'Resume', displayOrder: 1 } as PublishedFormQuestion;

    expect(entryKey({ kind: 'question', question })).toBe('q-resume');
  });

  it('gives a skipped run a key that cannot collide with a question id', () => {
    const key = entryKey({ kind: 'skipped', count: 2, afterPrompt: 'First name' });

    expect(key).not.toBe('q-resume');
    expect(key).toContain('skipped');
  });
});

describe('entryKey — worst case', () => {
  it('keeps two file questions at the same position in different sections apart', () => {
    const transcript = { id: 'q-transcript', type: 'FileUpload', prompt: 'Transcript', displayOrder: 4 } as PublishedFormQuestion;
    const resume = { id: 'q-resume', type: 'FileUpload', prompt: 'Resume', displayOrder: 4 } as PublishedFormQuestion;

    // Both sit at index 3 of their own section. Tracking on `$index` made these the same row,
    // so Angular reused one component for both and the resume announced the transcript's file.
    expect(entryKey({ kind: 'question', question: transcript }))
      .not.toBe(entryKey({ kind: 'question', question: resume }));
  });
});
