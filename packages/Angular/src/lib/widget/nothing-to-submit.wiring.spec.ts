/**
 * Structural guards for the client half of #124.
 *
 * The server refuses a final submit that would store nothing on a form that asked something. The
 * widget mirrors that so the respondent is answered without a round trip — every other validation
 * rule in this widget blocks or annotates inline, and this one had them press Submit, wait, and
 * read a banner.
 *
 * `MjFormComponent` uses `inject()` and cannot be instantiated in this suite's node environment
 * (the constraint `submit-overlay.wiring.spec.ts` documents), and `FormRuntime.wouldSubmitNothing`
 * is unit-tested directly in `core/form-runtime.spec.ts`. What is left is the WIRING: where the
 * gate sits in `onSubmit`, and how the banner it raises is cleared again.
 *
 * EVERY assertion here slices to ONE method body first. The first version of this file did not,
 * and matched `wouldSubmitNothing()` file-wide — which found the `bannerText` computed near the
 * top of the class instead of the gate 490 lines below it. All four assertions then passed with
 * the entire gate deleted, so the file that exists to pin the gate was measuring an unrelated
 * line. `disqualification.wiring.spec.ts` already had the right instrument; this now borrows it.
 *
 * Comments are stripped before every assertion — the source explains these decisions in prose, and
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

const source = (): string => stripped('mj-form.component.ts');
const template = (): string => stripped('mj-form.component.html');

/** The body of one method or member of `mj-form.component.ts`, so an assertion cannot bind elsewhere. */
function methodBody(declaration: string): string {
  const src = source();
  const start = src.indexOf(declaration);
  expect(start, `${declaration} not found`).toBeGreaterThan(-1);
  const body = src.slice(start);
  return body.slice(0, body.indexOf('\n  }\n'));
}

describe('the widget refuses a submit that would store nothing (#124)', () => {
  it('gates inside onSubmit, asking the runtime rather than spelling the predicate again', () => {
    expect(methodBody('protected async onSubmit')).toMatch(/rt\.wouldSubmitNothing\(\)/);
  });

  it('uses the SHARED sentence, so the two sides cannot drift apart', () => {
    // The server raises the same constant from @mj-biz-apps/forms-entities. Two string literals in
    // two packages would drift silently into disagreeing about one rule.
    expect(methodBody('private refuseWithNothingToSubmit')).toMatch(/NOTHING_TO_SUBMIT_MESSAGE/);
    expect(source()).not.toMatch(/'Please answer at least one question before submitting\.'/);
  });

  it('refuses BEFORE the phase flip, so the form stays exactly where it was', () => {
    // A refusal to start is not a failed submit: flipping to 'submitting' first would settle the
    // autosave and rebuild the children for a request that is never going to be sent.
    const body = methodBody('protected async onSubmit');
    const gate = body.indexOf('wouldSubmitNothing()');
    const flip = body.indexOf("this.phase.set('submitting')");
    expect(gate).toBeGreaterThan(-1);
    expect(flip).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(flip);
  });

  it('refuses BEFORE the captcha gate, because this refusal costs the respondent nothing', () => {
    // Solving a challenge and only then being told to answer a question is two round trips of the
    // respondent's effort to deliver one fact the widget already had.
    const body = methodBody('protected async onSubmit');
    expect(body.indexOf('wouldSubmitNothing()')).toBeLessThan(body.indexOf('submitAllowed()'));
  });

  it('moves the respondent to the refusal instead of only rendering it', () => {
    // The banner is at the top of the shell and Submit is at the bottom of a scroll-mode form, so
    // without this the press produces no visible change at all for a sighted respondent.
    expect(methodBody('private refuseWithNothingToSubmit')).toMatch(/focusBanner\(\)/);
    // ...and the banner must be focusable for that to do anything.
    expect(template()).toMatch(/class="mjf-banner-error"[^>]*tabindex="-1"/);
  });

  it('clears the banner on an answer commit, not by suppressing it in the view', () => {
    // A view-level `text === NOTHING_TO_SUBMIT_MESSAGE` suppression would also blank the SERVER's
    // copy of the same sentence whenever the two predicates disagree — and the server's exists
    // precisely to catch what the client missed, so the respondent would see nothing at all. It
    // would also re-mount the `role="alert"` node whenever the condition became true again,
    // re-announcing mid-edit with no submit attempt in between. Clearing on commit is a one-way
    // transition driven by the respondent's own action.
    expect(methodBody('private clearNothingToSubmitIfAnswered')).toMatch(/NOTHING_TO_SUBMIT_MESSAGE/);
    // Both answer-change entry points, or the banner outlives the ready line on the other one.
    expect(methodBody('protected onCommit')).toMatch(/clearNothingToSubmitIfAnswered\(\)/);
    expect(methodBody('protected onProgress')).toMatch(/clearNothingToSubmitIfAnswered\(\)/);
    expect(source()).not.toMatch(/bannerText/);
    expect(template()).toMatch(/@if \(errorText\(\)\)/);
  });
});
