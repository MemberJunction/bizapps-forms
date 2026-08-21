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

/**
 * `first` on p0; `middle` then `later_sibling` on p1; `last` on p2.
 *
 * Ordinals come from THIS, not from the order the detail happens to arrive in — `refineQuestion`
 * leaves `DisplayOrder` alone, so the outline is what a respondent actually sees.
 */
const outline = (): FormBlueprint =>
  ({
    name: 'Survey',
    pages: [
      { questions: [{ key: 'first', type: 'YesNo', prompt: 'First?' }] },
      {
        questions: [
          { key: 'middle', type: 'YesNo', prompt: 'Middle?' },
          { key: 'later_sibling', type: 'YesNo', prompt: 'Later?' },
        ],
      },
      { questions: [{ key: 'last', type: 'YesNo', prompt: 'Last?' }] },
    ],
  }) as unknown as FormBlueprint;

const keys = new Set(['first', 'middle', 'later_sibling', 'last']);
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
      positions: declaredKeyPositions(outline())
    });
    expect(page.questions).toHaveLength(1);
  });

  it('REFUSES a rule that references a later page', () => {
    // The failure this exists for: the question can never be shown, nothing logs it, and the
    // respondent simply never sees it.
    expect(() =>
      parsePageDetail(detail(gatedOn('last')), keys, {
        positions: declaredKeyPositions(outline())
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
      parsePageDetail(page, keys, { positions: declaredKeyPositions(outline()), pageIndex: 1 }),
    ).toThrow(/earlier/i);
  });

  it('accepts a rule referencing an EARLIER question on its own page', () => {
    const page = {
      questions: [
        { key: 'middle', type: 'YesNo', prompt: 'Middle?' },
        { key: 'later_sibling', type: 'YesNo', prompt: 'Later?', conditionalRule: gatedOn('middle') },
      ],
    };
    const parsed = parsePageDetail(page, keys, {
      positions: declaredKeyPositions(outline())
    });
    expect(parsed.questions).toHaveLength(2);
  });

  it('judges by the OUTLINE order, not the order the model returned', () => {
    // The regression this replaced: the check read the detail array index, so a model returning a
    // page's questions in a different order made a legal rule look illegal (and an illegal one
    // look legal). `refineQuestion` never touches DisplayOrder, so the outline order is what the
    // respondent sees and the only order worth judging.
    const reordered = {
      questions: [
        // Returned FIRST, but the outline puts it second — its rule on `middle` is still legal.
        { key: 'later_sibling', type: 'YesNo', prompt: 'Later?', conditionalRule: gatedOn('middle') },
        { key: 'middle', type: 'YesNo', prompt: 'Middle?' },
      ],
    };

    const parsed = parsePageDetail(reordered, keys, {
      positions: declaredKeyPositions(outline())
    });

    expect(parsed.questions).toHaveLength(2);
  });

  it('catches the illegal rule even when the model reorders it into a legal-looking position', () => {
    const reordered = {
      questions: [
        { key: 'later_sibling', type: 'YesNo', prompt: 'Later?' },
        // Returned SECOND, so a detail-index check would call this legal. The outline says
        // `middle` comes first, so gating it on `later_sibling` hides it forever.
        { key: 'middle', type: 'YesNo', prompt: 'Middle?', conditionalRule: gatedOn('later_sibling') },
      ],
    };

    expect(() =>
      parsePageDetail(reordered, keys, { positions: declaredKeyPositions(outline()), pageIndex: 1 }),
    ).toThrow(/earlier/i);
  });

  it('REFUSES a KEYLESS question gated on a later page — the normal shape', () => {
    // The case that matters most, and the one an earlier version of this check skipped entirely.
    // The outline prompt gives a key ONLY to questions a rule REFERENCES, so the question CARRYING
    // a rule is normally keyless. Judging only keyed questions made the check inert on the common
    // path: a page-0 question gated on a page-2 answer persisted and was hidden forever.
    const page = {
      questions: [{ type: 'YesNo', prompt: 'Unkeyed?', conditionalRule: gatedOn('last') }],
    };

    expect(() =>
      parsePageDetail(page, keys, { positions: declaredKeyPositions(outline()), pageIndex: 0 }),
    ).toThrow(/earlier/i);
  });

  it('accepts a KEYLESS question gated on an EARLIER page', () => {
    const page = {
      questions: [{ type: 'YesNo', prompt: 'Unkeyed?', conditionalRule: gatedOn('first') }],
    };

    const parsed = parsePageDetail(page, keys, {
      positions: declaredKeyPositions(outline()),
      pageIndex: 1,
    });
    expect(parsed.questions).toHaveLength(1);
  });

  it('leaves a KEYLESS question gated on its OWN page alone, rather than guessing', () => {
    // Its position on the page is unknowable here — it has no ordinal — so the reference may be
    // legal or not. Refusing would cost the author the whole page on a guess; the form-level
    // validator still covers it on the single-shot route.
    const page = {
      questions: [{ type: 'YesNo', prompt: 'Unkeyed?', conditionalRule: gatedOn('middle') }],
    };

    const parsed = parsePageDetail(page, keys, {
      positions: declaredKeyPositions(outline()),
      pageIndex: 1,
    });
    expect(parsed.questions).toHaveLength(1);
  });

  it('REFUSES a question gated on its own answer', () => {
    // The boundary. `<` versus `<=` is the whole difference, and without this case both pass —
    // a question cannot be shown based on an answer it is itself collecting.
    const page = {
      questions: [{ key: 'middle', type: 'YesNo', prompt: 'Middle?', conditionalRule: gatedOn('middle') }],
    };

    expect(() =>
      parsePageDetail(page, keys, { positions: declaredKeyPositions(outline()), pageIndex: 1 }),
    ).toThrow(/earlier/i);
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
