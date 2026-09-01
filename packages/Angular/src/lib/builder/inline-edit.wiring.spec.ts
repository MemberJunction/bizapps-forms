/**
 * The form-name box's three bindings, and the one write path behind them.
 *
 * `inline-edit.spec.ts` proves the DECISION. This proves the box is actually wired to it — the
 * half a pure test cannot see, and the half that was missing: the input had no keydown handler
 * at all, so Escape did nothing and an emptied box committed on blur.
 *
 * MJ ALREADY SOLVED THIS, in `Generic/whiteboard/src/lib/whiteboard-pages.component.ts`: focus
 * selects the whole value, Enter commits, Escape abandons, and the commit ignores an empty box
 * and keeps the previous name. `base-forms/form-field.component.ts` (`OnFKFocus`),
 * `conversations/services/dialog.service.ts` and the theme-studio rename all select on focus too.
 * This is that pattern, not a new one.
 *
 * Source-reading, like `reorder-affordance.wiring.spec.ts` and for the same reason: the builder
 * uses `inject()` and `templateUrl` and cannot be instantiated in a node environment.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const builderHtml = (): string => stripped('form-builder.component.html');
const builder = (): string => stripped('form-builder.component.ts');

/** The `<input class="fb-name" …>` tag, which is where every binding under test lives. */
function nameInputTag(): string {
  const html = builderHtml();
  const start = html.indexOf('class="fb-name"');
  expect(start).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<input', start);
  const close = html.indexOf('>', start);
  return html.slice(open, close + 1);
}

describe('the form name edits in place', () => {
  it('selects the whole name on focus, so the first keystroke replaces it', () => {
    // A caret says "type into this field"; the whole value highlighted says "this is one value
    // you are replacing". That cue is the reason select-on-focus is the fix and not a nicety —
    // and it is what every MJ inline rename does.
    expect(nameInputTag()).toMatch(/\(focus\)="[^"]*\.select\(\)"/);
  });

  it('abandons the edit on Escape', () => {
    expect(nameInputTag()).toMatch(/\(keydown\.escape\)=/);
  });

  it('commits on Enter without waiting for a click elsewhere', () => {
    expect(nameInputTag()).toMatch(/\(keydown\.enter\)=/);
  });

  it('routes every exit from the box through the same decision', () => {
    // Escape restores the saved name and blurs, and blur fires `change` — so the refusal path
    // and the commit path meet in one function. That is deliberate: a separate "cancel" write
    // path could disagree with the commit path about what an empty box means.
    expect(nameInputTag()).toMatch(/\(change\)="setName\(/);
    expect(builder()).toMatch(/resolveInlineEdit\(/);
  });

  it('never writes a name the decision refused', () => {
    // The guard IS the decision — a second, hand-rolled emptiness check in the writer would be
    // free to disagree with it. So `setName` must reach the entity only on the commit arm.
    const setName = /protected async setName\([\s\S]*?\n  \}/.exec(builder())?.[0] ?? '';
    expect(setName).toMatch(/resolveInlineEdit\(/);
    const guardAt = setName.search(/kind !== 'commit'|kind === 'commit'/);
    const writeAt = setName.indexOf('this.record.Name =');
    expect(guardAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(guardAt);
  });

  it('puts the box back to the name the form actually has', () => {
    // `[value]="record.Name"` only rewrites the DOM when the bound expression CHANGES, and a
    // refused edit leaves it identical — so Angular writes nothing and the box would sit there
    // holding the refused text over a form still called something else. The assignment is what
    // makes the revert visible.
    const setName = /protected async setName\([\s\S]*?\n  \}/.exec(builder())?.[0] ?? '';
    expect(setName).toMatch(/\.value = outcome\.value/);
  });
});
