import { describe, it, expect } from 'vitest';

import { computeProgress, type ProgressQuestion } from './progress';

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
  it('reads full the moment the required set is done, whatever optional work is left', () => {
    expect(computeProgress([q(true, true), q(false, false), q(false, false)])).toBe(1);
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
      const wasComplete = previous === 1;
      form[i] = { ...form[i], completeness: 1 };
      const next = computeProgress(form);
      if (wasComplete) {
        // Already full — the remaining optional answers have nowhere to go, which is the
        // readiness semantic working, not a stall.
        expect(next).toBe(1);
      } else {
        expect(next, `answering question ${i} did not move the bar`).toBeGreaterThan(previous);
      }
      previous = next;
    }
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

  it('reports complete for a form with nothing to answer', () => {
    expect(computeProgress([])).toBe(1);
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

  it('still reads full once every required question is satisfied', () => {
    // A composite counts as SATISFIED on any part — the form is submittable — so the bar is full
    // even though two of its five fields are blank.
    expect(computeProgress([part(true, 0.4), part(false, 0)])).toBe(1);
  });
});
