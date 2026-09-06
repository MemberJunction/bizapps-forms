/**
 * Structural guard: the widget renders the scale the CONTRACT defines, not one of its own.
 *
 * A `Rating`'s star count and an `NPS`'s 0–10 range are now answerable without a widget in hand
 * (`ratingScaleMax` / `numericScalePoints` in forms-entities), because the condition editor has
 * to offer exactly the points a respondent can click — a rule naming a sixth star on a five-star
 * question can never fire, and there is nothing on either screen to say why.
 *
 * The widget had those numbers written down separately, which is the arrangement `OpinionScale`
 * already had a comment about ("derived twice, they drift, and the respondent gets told that the
 * number they were just shown and allowed to click is out of range"). Same trap, two more types.
 *
 * `FormQuestionComponent` uses signals and `inject()` and cannot be instantiated in this suite's
 * node environment, so what is checkable is the source. Comments are stripped before every
 * assertion — the source explains this same decision in prose, and a guard that matches its own
 * documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const component = (): string =>
  readFileSync(join(__dirname, 'form-question.component.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

describe('the rendered scale and the rule editor read one definition', () => {
  it('takes a rating’s star count from the contract', () => {
    const source = component();
    expect(source).toMatch(/ratingScaleMax\(/);
    expect(source).not.toMatch(/raw > 0 \? raw : 5/);
  });

  it('takes the NPS range from the contract rather than counting to eleven here', () => {
    const source = component();
    expect(source).toMatch(/numericScalePoints\('NPS'\)/);
    expect(source).not.toMatch(/length: 11/);
  });

  it('still reads the opinion scale from the bounds it always did', () => {
    // Unchanged, and named here so a later tidy-up cannot quietly localise it again.
    expect(component()).toMatch(/opinionScaleBounds\(/);
  });
});
