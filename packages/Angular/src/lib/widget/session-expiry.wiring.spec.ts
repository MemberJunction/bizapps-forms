/**
 * Structural guards for what the respondent sees when their anonymous session has expired
 * (bizapps-forms#123).
 *
 * `MjFormComponent` uses `inject()` and cannot be instantiated in this suite's node environment,
 * and most of what is at stake is a TEMPLATE decision anyway — so, as in
 * `submit-overlay.wiring.spec.ts`, what is checkable is the source. The behaviour these guard was
 * verified in a real browser against a real server (the PR records the run); these keep the
 * decisions from being quietly undone.
 *
 * The decisions:
 *   - Expiry is recognised by TYPE (`SessionExpiredError`) on every path that talks to the API —
 *     the final submit, the background autosave, and the load — because whichever request
 *     happens to discover it, the session is equally over. A respondent left typing into a form
 *     whose autosaves were all silently failing is the failure the autosave path guards against.
 *   - The notice is an OVERLAY over the still-mounted form, never an `@case` of its own (the same
 *     reason the sending state is a scrim: a branch would unmount the intake and discard the
 *     drawing, the uploads and the cursor).
 *   - The form underneath is `inert` and submit is withdrawn (`submitAllowed`), so nothing on the
 *     page still claims "You can submit now." or accepts a click that can only produce a 401.
 *   - It is an `alertdialog` that takes focus, with one action: reload. `GET /f/:slug` mints a
 *     fresh session on every fetch, so the page is the re-mint — MJ issues no refresh tokens and
 *     the widget invents none.
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
const component = (): string => stripped('mj-form.component.ts');

describe('the widget recognises an expired session on every path that talks to the API', () => {
  it('reacts to the transport error by type, not by message', () => {
    expect(component()).toMatch(/import \{[^}]*\bSessionExpiredError\b[^}]*\} from '\.\/api\/forms-api\.interface'/);
    expect(component()).toMatch(/err instanceof SessionExpiredError/);
  });

  it('routes the submit, the autosave and the load through the same reaction', () => {
    // One decision — "an expired session ends the fill" — made in one place and reached from
    // each request that can discover it. Three call sites, not three copies of the rule.
    const calls = component().match(/this\.endSessionIfExpired\(err\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it('withdraws submit while the session is expired', () => {
    // `submitAllowed` feeds the children's `submitDisabled`, which is what silences their
    // "You can submit now." line and disables the Submit control — without touching them.
    expect(component()).toMatch(/submitAllowed = computed\(\s*\(\)\s*=>[\s\S]*?this\.phase\(\) !== 'expired'/);
  });

  it('offers a reload, which is the only thing that mints a new session', () => {
    expect(component()).toMatch(/startAgain\(\)[^{]*\{[\s\S]*?window\.location\.reload\(\)/);
  });
});

describe('the expiry notice is an overlay over the still-mounted form', () => {
  it('has no phase branch that replaces the form', () => {
    expect(template()).not.toMatch(/@case\s*\(\s*'expired'\s*\)/);
  });

  it('renders the notice only while expired, and outside the shell it makes inert', () => {
    const html = template();
    expect(html).toMatch(/@if \(phase\(\) === 'expired'\)\s*\{[\s\S]*?class="mjf-expired"/);
    // `inert` on the shell removes the whole form from interaction AND the accessibility tree —
    // so the notice must not be inside it, or it would be inert too.
    expect(html).toMatch(/class="mjf-shell"[^>]*\[attr\.inert\]="phase\(\) === 'expired' \? '' : null"/);
    expect(html.indexOf('class="mjf-expired"')).toBeLessThan(html.indexOf('class="mjf-shell"'));
  });

  it('is an alert dialog with a name, a description and one action', () => {
    const html = template();
    const dialog = html.match(/<div\s+class="mjf-expired"[^>]*>/)?.[0] ?? '';
    expect(dialog).toContain('role="alertdialog"');
    expect(dialog).toContain('aria-modal="true"');
    for (const attr of ['aria-labelledby', 'aria-describedby']) {
      const id = dialog.match(new RegExp(`${attr}="([^"]+)"`))?.[1];
      expect(id, `${attr} names an element`).toBeTruthy();
      expect(html).toContain(`id="${id}"`);
    }
    const button = html.match(/<button[^>]*class="mjf-retry mjf-expired__action"[^>]*>\s*Start again\s*<\/button>/)?.[0] ?? '';
    expect(button).toContain('type="button"');
    expect(button).toContain('(click)="startAgain()"');
  });

  it('keeps focus on its only action', () => {
    // Tab from the one tabbable element would land on <body> — the shell is inert — which to a
    // keyboard or screen-reader user reads as the notice having gone. So it stays.
    const button = template().match(/<button[^>]*class="mjf-retry mjf-expired__action"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('(keydown.tab)="$event.preventDefault()"');
    expect(button).toContain('(keydown.shift.tab)="$event.preventDefault()"');
  });

  it('moves focus into the dialog when it appears', () => {
    // With the shell inert, focus would otherwise fall to <body>: a keyboard or screen-reader
    // user gets an announcement and nowhere to go.
    expect(component()).toMatch(/querySelector<HTMLElement>\('\.mjf-expired__action'\)\?\.focus\(\)/);
  });
});

describe('the notice stays in view', () => {
  it('is anchored to the viewport, above the sticky progress bar, like the sending scrim', () => {
    expect(css()).toMatch(/\.mjf-expired\s*\{[^}]*position:\s*fixed/);
    expect(css()).toMatch(/\.mjf-expired\s*\{[^}]*inset:\s*0/);
    expect(css()).toMatch(/\.mjf-expired\s*\{[^}]*z-index:\s*5/);
  });
});
