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

const source = (): string =>
  readFileSync(join(__dirname, 'mj-form.component.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

/** The body of the method that ends the form on a knockout. */
function knockoutMethod(): string {
  const src = source();
  // The DECLARATION, not the call site in `onProgress` that precedes it in the file.
  const start = src.indexOf('private async endAsDisqualified');
  expect(start, 'no endAsDisqualified method declaration found').toBeGreaterThan(-1);
  const body = src.slice(start);
  const end = body.indexOf('\n  }');
  return body.slice(0, end);
}

describe('a knockout banks before it ends the form', () => {
  it('awaits the flush rather than firing it and moving on', () => {
    const body = knockoutMethod();
    expect(body).toMatch(/await this\.autosave\?\.flushNow\(\)/);
    expect(body).not.toMatch(/void this\.autosave\?\.flushNow\(\)/);
  });

  it('banks while the phase still permits a partial save', () => {
    const body = knockoutMethod();
    const flushAt = body.indexOf('flushNow()');
    const phaseAt = body.indexOf("this.phase.set('done')");
    expect(flushAt).toBeGreaterThan(-1);
    expect(phaseAt).toBeGreaterThan(-1);
    expect(flushAt).toBeLessThan(phaseAt);
  });

  it('navigates only after the bank has resolved', () => {
    const body = knockoutMethod();
    const flushAt = body.indexOf('flushNow()');
    const redirectAt = body.indexOf('this.redirect(');
    expect(redirectAt).toBeGreaterThan(-1);
    expect(flushAt).toBeLessThan(redirectAt);
  });

  it('cannot be re-entered while its own bank is in flight', () => {
    // The await hands control back to the template, which keeps firing progress events at a
    // respondent who is still typing. Without a latch each one starts another knockout.
    expect(source()).toMatch(/disqualifying/);
  });
});
