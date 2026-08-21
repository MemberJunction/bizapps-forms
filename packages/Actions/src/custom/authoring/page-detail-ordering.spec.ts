/**
 * `parsePageDetail`, and the ordering rule the staged route was missing.
 *
 * The form-level validator refuses a question gated on an answer that comes LATER — a question
 * that can never be shown. `parsePageDetail` deliberately skipped that check, on the reasoning
 * that "a rule that was legal in the outline stays legal". That reasoning holds for PAGE rules and
 * not for question rules: the outline template emits only `key`, `type` and `prompt` per question,
 * so question-level rules are authored entirely by the detail pass and had never been checked at
 * all on the staged route. The single-shot route caught exactly this.
 */
import { describe, expect, it } from 'vitest';
import { declaredKeyPositions, parsePageDetail } from './form-blueprint';
import type { FormBlueprint } from './form-blueprint';

/** Three pages, one keyed question each: `first` on p0, `middle` on p1, `last` on p2. */
const outline = (): FormBlueprint =>
  ({
    name: 'Survey',
    pages: [
      { questions: [{ key: 'first', type: 'YesNo', prompt: 'First?' }] },
      { questions: [{ key: 'middle', type: 'YesNo', prompt: 'Middle?' }] },
      { questions: [{ key: 'last', type: 'YesNo', prompt: 'Last?' }] },
    ],
  }) as unknown as FormBlueprint;

const keys = new Set(['first', 'middle', 'last']);
const detail = (rule: unknown, extra: unknown[] = []) => ({
  questions: [
    ...extra,
    { key: 'middle', type: 'YesNo', prompt: 'Middle?', conditionalRule: rule },
  ],
});

const gatedOn = (key: string) => ({
  show: { all: [{ questionKey: key, op: 'equals', value: 'Yes' }] },
});

describe('parsePageDetail — question rules are ordering-checked', () => {
  it('accepts a rule that references an EARLIER page', () => {
    const page = parsePageDetail(detail(gatedOn('first')), keys, {
      positions: declaredKeyPositions(outline()),
      pageIndex: 1,
    });
    expect(page.questions).toHaveLength(1);
  });

  it('REFUSES a rule that references a later page', () => {
    // The failure this exists for: the question can never be shown, nothing logs it, and the
    // respondent simply never sees it.
    expect(() =>
      parsePageDetail(detail(gatedOn('last')), keys, {
        positions: declaredKeyPositions(outline()),
        pageIndex: 1,
      }),
    ).toThrow(/later|earlier/i);
  });

  it('REFUSES a rule that references a question further down its OWN page', () => {
    const page = {
      questions: [
        { key: 'middle', type: 'YesNo', prompt: 'Middle?', conditionalRule: gatedOn('later_sibling') },
        { key: 'later_sibling', type: 'YesNo', prompt: 'Later?' },
      ],
    };
    expect(() =>
      parsePageDetail(page, new Set([...keys, 'later_sibling']), {
        positions: declaredKeyPositions(outline()),
        pageIndex: 1,
      }),
    ).toThrow(/later|earlier/i);
  });

  it('accepts a rule referencing an EARLIER question on its own page', () => {
    const page = {
      questions: [
        { key: 'earlier_sibling', type: 'YesNo', prompt: 'Earlier?' },
        { key: 'middle', type: 'YesNo', prompt: 'Middle?', conditionalRule: gatedOn('earlier_sibling') },
      ],
    };
    const parsed = parsePageDetail(page, new Set([...keys, 'earlier_sibling']), {
      positions: declaredKeyPositions(outline()),
      pageIndex: 1,
    });
    expect(parsed.questions).toHaveLength(2);
  });

  it('still refuses a key that never existed, with or without ordering', () => {
    expect(() => parsePageDetail(detail(gatedOn('invented')), keys)).toThrow();
  });

  it('is unchanged when no ordering context is supplied', () => {
    // The parameter is optional so existing callers keep working; without it the ordering rule
    // simply is not applied, exactly as before.
    const page = parsePageDetail(detail(gatedOn('last')), keys);
    expect(page.questions).toHaveLength(1);
  });
});
