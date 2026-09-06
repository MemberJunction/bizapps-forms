import { describe, it, expect } from 'vitest';

import { computeProgress, progressPercent, type ProgressQuestion } from './progress';

const q = (required: boolean, answered: boolean): ProgressQuestion => ({
  required,
  completeness: answered ? 1 : 0,
});

describe('computeProgress', () => {
  it('moves when an OPTIONAL question is answered, so no answer is a dead zone', () => {
    const before = computeProgress([q(true, false), q(false, false), q(false, false)]);
    const after = computeProgress([q(true, false), q(false, true), q(false, false)]);

    expect(after).toBeGreaterThan(before);
  });
});

describe('computeProgress feel', () => {
  /**
   * This used to read `reads full the moment the required set is done, whatever optional work is
   * left`, and asserted `toBe(1)`. That WAS the reported bug (#88): on the seeded nine-question
   * form with one required email, answering the email alone painted the bar 100% full above eight
   * visibly blank questions. Kept as the same case, flipped, so the change of meaning is legible.
   */
  it('does not read full while optional questions are still blank', () => {
    // The reported form: nine questions, exactly one of them required.
    const eightBlankOptionals = Array.from({ length: 8 }, () => q(false, false));

    expect(computeProgress([q(true, true), ...eightBlankOptionals])).toBeLessThan(1);
  });

  it('reads full only once every visible question is answered', () => {
    const eightAnsweredOptionals = Array.from({ length: 8 }, () => q(false, true));

    expect(computeProgress([q(true, true), ...eightAnsweredOptionals])).toBe(1);
  });

  it('weights a required answer above an optional one', () => {
    const optional = computeProgress([q(true, false), q(true, false), q(false, true)]);
    const required = computeProgress([q(true, true), q(true, false), q(false, false)]);

    expect(required).toBeGreaterThan(optional);
  });

  it('never stalls: every answer on a long form produces movement', () => {
    // The shape that broke: a few required fields with optional ones between them.
    const form = [q(true, false), q(false, false), q(false, false), q(true, false), q(false, false)];
    let previous = computeProgress(form);

    for (let i = 0; i < form.length; i++) {
      form[i] = { ...form[i], completeness: 1 };
      const next = computeProgress(form);
      expect(next, `answering question ${i} did not move the bar`).toBeGreaterThan(previous);
      previous = next;
    }
    // This loop used to carry an exemption: once the required set was done the bar was already
    // full, so the last optional answer had nowhere to go and the test accepted a stall. There is
    // no room left at the top now until the LAST question is in, so the exemption is gone and
    // "every answer moves it" holds without one.
    expect(previous).toBe(1);
  });

  it('never goes backwards as answers accumulate on a fixed form', () => {
    const form = [q(true, false), q(false, false), q(true, false), q(false, false)];
    let previous = 0;
    for (let i = 0; i < form.length; i++) {
      form[i] = { ...form[i], completeness: 1 };
      const next = computeProgress(form);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  it('stays inside 0..1, which is what it is rendered as a percentage from', () => {
    const cases: ProgressQuestion[][] = [
      [],
      [q(true, false)],
      [q(false, false)],
      [q(true, true), q(false, true)],
      Array.from({ length: 50 }, (_, i) => q(i % 3 === 0, i % 2 === 0)),
    ];
    for (const c of cases) {
      expect(computeProgress(c)).toBeGreaterThanOrEqual(0);
      expect(computeProgress(c)).toBeLessThanOrEqual(1);
    }
  });

  it('treats an all-optional form as a plain proportion, since nothing is gating a submit', () => {
    expect(computeProgress([q(false, true), q(false, false), q(false, false), q(false, false)])).toBe(0.25);
  });

  /**
   * Decided deliberately: vacuously complete, since no unanswered question is left, which keeps
   * the function total rather than growing a null case for the callers to unwrap. Nothing paints
   * this number — both renderers suppress the bar when `FormRuntime.hasAnswerableQuestions` is
   * false, because a bar over an empty set reads either "done" or "not started" and both are noise
   * above "This form has no questions to display."
   */
  it('reports complete for a form with nothing to answer', () => {
    expect(computeProgress([])).toBe(1);
  });
});

describe('progressPercent', () => {
  it('reaches 100 only from an exactly-complete form', () => {
    // `Math.round` reported 100 from 99.5% up, so a long form could paint a full bar, glow
    // `is-complete` and publish `aria-valuenow="100"` with questions still blank — #88 one layer
    // down, and `aria-valuenow` is the yardstick the issue measured it with.
    expect(progressPercent(0.996)).toBe(99);
    expect(progressPercent(0.999999)).toBe(99);
    expect(progressPercent(1)).toBe(100);
  });

  it('a fully answered long form still lands on exactly 100', () => {
    // The floor is only safe because the quotient is exact: same weights, same summation order on
    // both sides of the division. A 99 here would be the floor eating a real completion.
    const everythingAnswered = Array.from({ length: 97 }, (_, i) => q(i % 3 === 0, true));

    expect(progressPercent(computeProgress(everythingAnswered))).toBe(100);
  });

  it('holds the 0..100 range whatever it is handed', () => {
    expect(progressPercent(-1)).toBe(0);
    expect(progressPercent(2)).toBe(100);
    expect(progressPercent(Number.NaN)).toBe(0);
  });
});

describe('computeProgress with partly-filled questions', () => {
  const part = (required: boolean, completeness: number): ProgressQuestion => ({ required, completeness });

  it('moves for each sub-field of a composite instead of once for the whole thing', () => {
    // The reported bug: a 5-field contact block that moved the bar once and then sat still.
    const seen: number[] = [];
    for (let filled = 0; filled <= 5; filled++) {
      seen.push(computeProgress([part(true, filled / 5), part(true, 0), part(false, 0)]));
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `filling sub-field ${i} did not move the bar`).toBeGreaterThan(seen[i - 1]);
    }
  });

  /**
   * This used to read `still reads full once every required question is satisfied` and assert
   * `toBe(1)` on exactly these inputs. Same inputs, opposite verdict, so the semantic change is
   * legible in the diff: a composite counts as SATISFIED on any one part, which is what lets the
   * respondent submit — but three of its five fields are still blank, and the bar reports fill.
   */
  it('does not read full on a composite the respondent could submit but has barely filled in', () => {
    expect(computeProgress([part(true, 0.4), part(false, 0)])).toBeLessThan(1);
  });
});
