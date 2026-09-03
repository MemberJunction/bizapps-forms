/**
 * The progress bar reports FILL; a separate line reports SUBMITTABILITY.
 *
 * `progress.spec.ts` and `form-runtime.spec.ts` prove the number. What they cannot reach is
 * whether the two render modes ask for both facts — `FormScrollComponent` and
 * `FormOneQuestionComponent` use `input.required` and cannot be instantiated in this suite's node
 * environment (the constraint `submit-overlay.wiring.spec.ts` documents), so what is checkable
 * here is the source. Both modes render the same `<mjf-form-progress>`, and #88 was reported
 * against both, so a fix that reached only one of them is the regression worth guarding.
 *
 * Comments are stripped before every assertion: the source explains these decisions in prose, and
 * a guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const renderModes = [
  { mode: 'scroll', ts: 'form-scroll.component.ts', html: 'form-scroll.component.html' },
  { mode: 'one-question', ts: 'form-one-question.component.ts', html: 'form-one-question.component.html' },
] as const;

describe.each(renderModes)('$mode mode asks the bar for both facts', ({ ts, html }) => {
  it('passes a readiness flag alongside the fill', () => {
    expect(stripped(html)).toMatch(/<mjf-form-progress[^>]*\[ready\]="readyToSubmit\(\)"/);
  });

  it('derives readiness from validity AND the respondent standing on the submit step', () => {
    // Any one of these alone is a different claim: `isFormValid` on section one still needs three
    // Nexts, and a captcha-blocked last step has a Submit that does nothing.
    const source = stripped(ts);
    const declaration = source.slice(source.indexOf('readyToSubmit'));
    const body = declaration.slice(0, declaration.indexOf(';'));

    expect(body).toMatch(/isLast\(\)/);
    expect(body).toMatch(/primaryDisabled\(\)/);
    expect(body).toMatch(/isFormValid\(\)/);
  });

  it('does not promise a submit the widget itself would refuse (#124)', () => {
    // "You can submit now." and "Please answer at least one question before submitting." were on
    // screen together: nothing is INVALID on a form of optional questions, so `isFormValid` is
    // true, while the #124 gate refuses the submit. Readiness has to mean the submit would be
    // accepted, not merely that no field is in error.
    const source = stripped(ts);
    const declaration = source.slice(source.indexOf('readyToSubmit'));
    const body = declaration.slice(0, declaration.indexOf(';'));

    expect(body).toMatch(/wouldSubmitNothing\(\)/);
  });

  it('renders no bar at all when the form has nothing to answer', () => {
    // One predicate, read off the runtime, so the two modes cannot drift into disagreeing about
    // when the bar is worth showing. A bar over an empty set reports either "done" or "not
    // started", and both are noise above "This form has no questions to display."
    expect(stripped(html)).toMatch(/@if \(runtime\(\)\.hasAnswerableQuestions\(\)\)/);
  });
});

describe('the readiness line is reachable by a screen reader', () => {
  it('sits outside the progressbar, which is children-presentational', () => {
    // `role="progressbar"` drops its subtree from the accessibility tree, so a line rendered
    // inside it would be invisible to exactly the respondents who cannot see the bar's fill.
    const template = stripped('form-progress.component.ts');
    const before = template.slice(0, template.indexOf('mjf-progress__ready'));

    expect(before).toContain('role="progressbar"');
    expect(
      (before.match(/<div/g) ?? []).length,
      'the readiness line is nested inside an element it should be a sibling of',
    ).toBe((before.match(/<\/div>/g) ?? []).length);
  });
});
