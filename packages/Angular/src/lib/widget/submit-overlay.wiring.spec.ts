/**
 * Structural guards for what the respondent sees while a submit is in flight.
 *
 * `MjFormComponent` uses `inject()` and cannot be instantiated in this suite's node
 * environment, and the thing at stake here is a TEMPLATE decision anyway — which branch of the
 * phase `@switch` renders. So what is checkable is the source.
 *
 * The decision being guarded: the sending state is an OVERLAY on top of the still-mounted form,
 * never a branch that replaces it. Angular's `@switch` renders exactly one branch, so putting the
 * spinner in its own `@case ('submitting')` destroys `mjf-form-scroll` / `mjf-form-one-question`
 * for the duration of the request — and a failed submit sets phase back to 'ready', which builds
 * BRAND NEW children. In one-question mode `index` is `signal(0)`, so a respondent who filled in
 * twenty questions and lost the network on the last one is returned to question one; in scroll
 * mode the viewport jumps to the top; and in both, the uploaded-file confirmation and the drawn
 * signature bitmap disappear while the answers themselves survive. That converts a recoverable
 * network failure into "fill the form in again", which is the exact loss the sending state was
 * added to prevent, on the connection profile most likely to hit it.
 *
 * Comments are stripped before every assertion — the source explains these same decisions, and a
 * guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const template = (): string => stripped('mj-form.component.html');
const css = (): string => stripped('mj-form.component.css');

describe('the form survives its own submit', () => {
  it('has no phase branch that replaces the form while sending', () => {
    // The whole defect in one assertion: a `@case ('submitting')` sibling of `@default` is what
    // unmounts the intake components mid-request.
    expect(template()).not.toMatch(/@case\s*\(\s*'submitting'\s*\)/);
  });

  it('still renders the intake components when the phase is submitting', () => {
    // `@default` must be reachable while sending, which is what keeps the children alive.
    expect(template()).toMatch(/@default\s*\{/);
    expect(template()).toMatch(/<mjf-form-scroll/);
    expect(template()).toMatch(/<mjf-form-one-question/);
  });

  it('shows the sending state from inside the branch that renders the form', () => {
    const html = template();
    const defaultAt = html.indexOf('@default');
    const sendingAt = html.indexOf('mjf-sending');
    expect(defaultAt).toBeGreaterThan(-1);
    expect(sendingAt).toBeGreaterThan(defaultAt);
  });

  it('keeps the submitting binding the children actually use', () => {
    // These bindings drive the buttons' disabled state. With a `@case ('submitting')` branch they
    // could never be true while the child existed — the PR had made existing code unreachable.
    expect(template()).toMatch(/\[submitting\]="phase\(\) === 'submitting'"/);
  });
});

describe('the sending state is a scrim, as its own comment claims', () => {
  it('is positioned over the form rather than laid out in flow', () => {
    // A plain in-flow block with `min-height: 40vh` is not a scrim: it pushes the page around
    // instead of covering it. The comment beside this CSS promised an overlay.
    expect(css()).toMatch(/\.mjf-sending\s*\{[^}]*position:\s*(absolute|fixed)/);
  });

  it('sits above the form it covers', () => {
    expect(css()).toMatch(/\.mjf-sending\s*\{[^}]*z-index:/);
  });

  it('still announces itself to a screen reader', () => {
    expect(template()).toMatch(/class="mjf-sending"[^>]*role="status"[^>]*aria-live="polite"/);
  });
});
