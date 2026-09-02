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
 * is unit-tested directly in `core/form-runtime.spec.ts`. What is left, and what broke in review,
 * is the WIRING: where the gate sits relative to the phase flip, and whether the banner it raises
 * goes away again.
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

describe('the widget refuses a submit that would store nothing (#124)', () => {
  it('asks the runtime, rather than spelling the predicate a second time', () => {
    expect(source()).toMatch(/wouldSubmitNothing\(\)/);
  });

  it('uses the SHARED sentence, so the two sides cannot drift apart', () => {
    // The server raises the same constant from @mj-biz-apps/forms-entities. Two string literals in
    // two packages would drift silently into disagreeing about one rule.
    expect(source()).toMatch(/NOTHING_TO_SUBMIT_MESSAGE/);
    expect(source()).not.toMatch(/'Please answer at least one question before submitting\.'/);
  });

  it('refuses BEFORE the phase flip, so the form stays exactly where it was', () => {
    // A refusal to start is not a failed submit: flipping to 'submitting' first would settle the
    // autosave and rebuild the children for a request that is never going to be sent.
    const src = source();
    const gate = src.indexOf('wouldSubmitNothing()');
    const flip = src.indexOf("this.phase.set('submitting')");
    expect(gate).toBeGreaterThan(-1);
    expect(flip).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(flip);
  });

  it('drops the banner once it has stopped being true', () => {
    // The respondent types something and the accusation must go, or it sits on screen beside "You
    // can submit now." — the widget asserting both halves of a contradiction it can resolve.
    // Every OTHER refusal legitimately persists until the next attempt, so this is scoped to the
    // one message the widget can re-evaluate on its own.
    expect(source()).toMatch(/bannerText\s*=\s*computed/);
    expect(template()).toMatch(/@if \(bannerText\(\)\)/);
    // Scoped to the in-form banner. The `error` PHASE renders `errorText()` directly and must keep
    // doing so: that is a form that failed to load, where there is no runtime to ask and no
    // question on screen for the respondent to have answered.
    expect(template()).toMatch(/class="mjf-banner-error" role="alert">\{\{ bannerText\(\) \}\}/);
    expect(template()).not.toMatch(/class="mjf-banner-error" role="alert">\{\{ errorText\(\) \}\}/);
  });
});
