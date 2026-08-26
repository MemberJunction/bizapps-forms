/**
 * Ordering guards for the knockout path (RULES_AND_BRANCHING_PLAN C3).
 *
 * `MjFormComponent` uses `inject()` and cannot be instantiated in this suite's node environment
 * — the same constraint `submit-overlay.wiring.spec.ts` documents — and what is at stake here is
 * an ORDER of three statements, so what is checkable is the source.
 *
 * The order is load-bearing because the knockout write can be lost two independent ways, and
 * both of them look fine in manual testing:
 *
 *  1. `savePartial()` returns early unless `phase() === 'ready'`. So the bank has to complete
 *     while the form is still in intake. Setting the phase first turns the save into a no-op.
 *  2. `flushNow()` awaits any save already in flight BEFORE it issues its own. Firing it
 *     unawaited therefore yields, the caller's remaining statements run in the same tick, and by
 *     the time the real write is attempted the phase has already moved — so the write is dropped
 *     precisely when the respondent has been typing (the only time a save IS in flight).
 *     With the autosave idle it works, which is why this survived review.
 *  3. `window.location.assign` aborts requests still on the wire. Navigating before the bank
 *     resolves cancels it.
 *
 * The server is what actually marks the row `Disqualified`, and it only ever sees this save. A
 * lost bank means the response stays a stale `Partial` — or is never written at all — while the
 * respondent has been shown a screen telling them they are screened out.
 *
 * Comments are stripped before every assertion: the source explains these same decisions, and a
 * guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

const source = (): string => stripped(join(__dirname, 'mj-form.component.ts'));

/** The body of one method of `src`, from its declaration to its closing brace. */
function methodIn(src: string, declaration: string): string {
  const start = src.indexOf(declaration);
  expect(start, `${declaration} not found`).toBeGreaterThan(-1);
  const body = src.slice(start);
  return body.slice(0, body.indexOf('\n  }\n'));
}

/** The body of one method of `mj-form.component.ts`. */
function methodBody(declaration: string): string {
  return methodIn(source(), declaration);
}

/** The body of the method that ends the form on a knockout. */
function knockoutMethod(): string {
  // The DECLARATION, not a call site that precedes it in the file.
  return methodBody('private async endAsDisqualified');
}

describe('a knockout is judged on a finished answer, never a half-typed one', () => {
  /**
   * `Scroll` is the database default render mode, and there a text/number field is bound with
   * `(input)`, so `progressChange` fires on EVERY KEYSTROKE. Resolving the knockout from that
   * signal means a respondent answering `18` to a question gated on `age lessThan 18` is
   * disqualified the instant they type `1` — irreversibly, since `endAsDisqualified` latches,
   * seals the row and leaves intake. The re-entrancy latch guards the second trigger; nothing
   * guarded the first.
   *
   * So the knockout hangs off a COMMIT signal — the respondent left the question, or advanced
   * past it — while autosave keeps its own per-change signal. The server re-runs the same rule
   * on the save either way, so nothing about enforcement depends on this; what depends on it is
   * whether the form is usable.
   */
  it('does not resolve the knockout from the per-change progress signal', () => {
    const body = methodBody('protected onProgress');
    expect(body).not.toMatch(/disqualifyingScreen\(\)/);
    expect(body).not.toMatch(/endAsDisqualified/);
  });

  it('resolves it from a commit signal instead', () => {
    const body = methodBody('protected onCommit');
    expect(body).toMatch(/disqualifyingScreen\(\)/);
    expect(body).toMatch(/endAsDisqualified/);
  });

  it('both render modes report a commit, and the host listens for it', () => {
    const template = stripped(join(__dirname, 'mj-form.component.html'));
    expect([...template.matchAll(/\(commitChange\)="onCommit\(\)"/g)]).toHaveLength(2);
    for (const file of ['form-scroll.component.ts', 'form-one-question.component.ts']) {
      const src = stripped(join(__dirname, 'components', file));
      expect(src, `${file} declares no commitChange output`).toMatch(/commitChange\s*=\s*output<void>\(\)/);
      expect(src, `${file} never emits commitChange`).toMatch(/commitChange\.emit\(\)/);
    }
  });

  it('scroll mode commits on blur, not on value change', () => {
    const src = stripped(join(__dirname, 'components', 'form-scroll.component.ts'));
    expect(methodIn(src, 'protected onValueChange')).not.toMatch(/commitChange\.emit/);
    expect(methodIn(src, 'protected onBlur')).toMatch(/commitChange\.emit/);
  });
});

describe('a knockout records itself before it ends the form', () => {
  it('sends a FINISHED submission, not just an autosave', () => {
    // Only a finished submission seals a knockout server-side — a partial deliberately does not,
    // because the rule would otherwise be judged on a half-typed value the autosave happened to
    // carry. So the client's terminal write has to BE a completion; leaving this as a flush of
    // the autosave meant the row stayed `Partial` and the screening was never recorded.
    const body = knockoutMethod();
    expect(body).toMatch(/this\.sealDisqualified\(\)/);
    const seal = methodBody('private async sealDisqualified');
    expect(seal).toMatch(/buildSubmission\(def, rt, false\)/);
  });

  it('awaits that write rather than firing it and moving on', () => {
    const body = knockoutMethod();
    expect(body).toMatch(/await this\.sealDisqualified\(\)/);
    expect(body).not.toMatch(/void this\.sealDisqualified\(\)/);
  });

  it('quiesces the autosave first, so two writes never share the response id', () => {
    const body = knockoutMethod();
    const settleAt = body.indexOf('settle()');
    const sealAt = body.indexOf('sealDisqualified()');
    expect(settleAt).toBeGreaterThan(-1);
    expect(settleAt).toBeLessThan(sealAt);
  });

  it('records before it leaves intake', () => {
    const body = knockoutMethod();
    const sealAt = body.indexOf('sealDisqualified()');
    const phaseAt = body.indexOf("this.phase.set('done')");
    expect(sealAt).toBeGreaterThan(-1);
    expect(phaseAt).toBeGreaterThan(-1);
    expect(sealAt).toBeLessThan(phaseAt);
  });

  it('navigates only after the write has resolved', () => {
    const body = knockoutMethod();
    const sealAt = body.indexOf('sealDisqualified()');
    const redirectAt = body.indexOf('this.redirect(');
    expect(redirectAt).toBeGreaterThan(-1);
    expect(sealAt).toBeLessThan(redirectAt);
  });

  it('is fail-soft — a refused write still shows the respondent their screen', () => {
    // A captcha-gated form with an unsolved challenge lands here: the server refuses a
    // completion without a token. Stranding the respondent mid-form would be the worse outcome.
    expect(methodBody('private async sealDisqualified')).toMatch(/catch/);
  });

  it('cannot be re-entered while its own bank is in flight', () => {
    // The await hands control back to the template, which keeps firing events at a respondent
    // who is still typing. Without a latch each one starts another knockout.
    //
    // Asserting the GUARD, not merely that the word appears somewhere in the file: the previous
    // version of this test was `expect(source()).toMatch(/disqualifying/)`, which the latch's
    // own declaration satisfies — so deleting every early-return would have left it green.
    expect(knockoutMethod()).toMatch(/this\.disqualifying = true/);
    expect(methodBody('protected onCommit')).toMatch(/if \(this\.disqualifying\)\s*\{?\s*return/);
    expect(methodBody('protected onProgress')).toMatch(/if \(this\.disqualifying\)\s*\{?\s*return/);
  });
});
