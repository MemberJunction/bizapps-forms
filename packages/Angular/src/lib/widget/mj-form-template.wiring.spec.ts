/**
 * The TEMPLATE half of the respondent flows — what the executing component specs cannot reach.
 *
 * `disqualification.spec.ts`, `nothing-to-submit.spec.ts`, `submit-overlay.spec.ts` and
 * `autosave-refusal.spec.ts` run the component itself (#303 DW18). What stays here is markup, CSS and
 * child-component wiring this node suite cannot render: which outputs the host listens to, which
 * `@switch` branch keeps the form mounted while it sends, and what the confirmation arm shows a
 * screened-out respondent. `ngc`'s strict template check compiles the bindings; these pin which
 * ones exist.
 *
 * Gathered unchanged in substance from the four wiring specs those replaced — the markup they read
 * did not move. Comments are stripped before every assertion: a guard that matches its own
 * documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const template = (): string => stripped(join(__dirname, 'mj-form.component.html'));
const css = (): string => stripped(join(__dirname, 'mj-form.component.css'));

const stripped = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

/** The body of one method of `src`, from its declaration to its closing brace. */
function methodIn(src: string, declaration: string): string {
  const start = src.indexOf(declaration);
  expect(start, `${declaration} not found`).toBeGreaterThan(-1);
  const body = src.slice(start);
  return body.slice(0, body.indexOf('\n  }\n'));
}

describe('both render modes report a commit, apart from every change', () => {
  it('both report it, and the host listens for it', () => {
    expect([...template().matchAll(/\(commitChange\)="onCommit\(\)"/g)]).toHaveLength(2);
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

describe('a screened-out respondent is never shown a success tick', () => {
  it('the confirmation arm gates the tick on the result being a screening', () => {
    const html = template();
    const doneArm = html.slice(html.indexOf("@case ('done')"), html.indexOf('@default'));
    expect(doneArm).toMatch(/@if \(!screenedOut\(\)\)\s*\{\s*<mjf-icon name="circle-check"/);
  });
});

describe('the banner a refusal moves focus to (#124)', () => {
  it('is focusable without being a tab stop, and renders whenever there is something to say', () => {
    expect(template()).toMatch(/class="mjf-banner-error"[^>]*tabindex="-1"/);
    expect(template()).toMatch(/@if \(errorText\(\)\)/);
  });
});

/**
 * The sending state is an OVERLAY on the still-mounted form, never a branch that replaces it.
 * Angular's `@switch` renders exactly one branch, so a `@case ('submitting')` would destroy the intake
 * components for the length of the request, and a failed submit would build brand-new ones — question
 * one again in one-question mode, the top of the page in scroll mode, the drawing and the upload
 * confirmation gone.
 */
describe('the form survives its own submit', () => {
  it('has no phase branch that replaces the form while sending', () => {
    expect(template()).not.toMatch(/@case\s*\(\s*'submitting'\s*\)/);
  });

  it('shows the sending state from inside the branch that renders the form', () => {
    const html = template();
    expect(html).toMatch(/@default\s*\{/);
    expect(html).toMatch(/<mjf-form-scroll/);
    expect(html).toMatch(/<mjf-form-one-question/);
    expect(html.indexOf('mjf-sending')).toBeGreaterThan(html.indexOf('@default'));
  });

  it('keeps the submitting binding the children use', () => {
    expect(template()).toMatch(/\[submitting\]="phase\(\) === 'submitting'"/);
  });

  it('renders one overlay from the overlay phase, naming the file wait apart from the send (#248)', () => {
    const html = template();
    expect([...html.matchAll(/class="mjf-sending"/g)]).toHaveLength(1);
    expect(html).toMatch(/@if \(overlay\(\); as o\)\s*\{\s*<div class="mjf-sending"/);
    expect(html).toMatch(/class="mjf-sending__msg">\{\{ o === 'saving-file' \? savingFileMessage : waitMessage\(\) \}\}</);
    const ts = stripped(join(__dirname, 'mj-form.component.ts'));
    expect(ts).toMatch(/protected readonly savingFileMessage = SAVING_FILE_MESSAGE/);
  });

  it('anchors the scrim to the viewport, above the sticky progress bar, and announces it', () => {
    // `absolute` would size it to a ~4000px form and centre the spinner off screen (see the CSS).
    expect(css()).toMatch(/\.mjf-sending\s*\{[^}]*position:\s*fixed/);
    expect(css()).toMatch(/\.mjf-sending\s*\{[^}]*inset:\s*0/);
    expect(Number(css().match(/\.mjf-sending\s*\{[^}]*z-index:\s*(\d+)/)?.[1])).toBeGreaterThan(2);
    expect(template()).toMatch(/class="mjf-sending"[^>]*role="status"[^>]*aria-live="polite"/);
  });
});
