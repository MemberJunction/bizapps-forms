/**
 * Source-text checks that the builder wires the Properties sheet (UI audit F14). Where focus goes
 * is behaviour-tested in `inspector-sheet.spec.ts`; the builder component cannot be compiled in
 * this suite, so this checks that the template and the selection setter use it. Comments are
 * stripped first, so a guard cannot pass against the prose that describes it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const strip = (s: string): string =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const html = strip(readFileSync(join(__dirname, 'form-builder.component.html'), 'utf8'));
const ts = strip(readFileSync(join(__dirname, 'form-builder.component.ts'), 'utf8'));
const css = strip(readFileSync(join(__dirname, 'form-builder.styles.ts'), 'utf8'));

describe('the Properties pane is a sheet below 900px', () => {
  it('the sheet shows while something is selected', () => {
    expect(html).toMatch(/class="fb-body" \[class\.has-selection\]="selection\.kind !== 'none'"/);
    expect(css).toMatch(/\.fb-body\.has-selection \.fb-pane--right \{ visibility: visible; transform: none;/);
  });

  it('hidden, it is out of the tab order, not just off screen', () => {
    const narrow = /@media \(max-width: 900px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(narrow).toMatch(/\.fb-pane--right \{[^}]*visibility: hidden;/);
  });

  it('Done and Escape close it', () => {
    expect(html).toMatch(/class="mjf-btn mjf-btn--sm fb-sheet-done" \(click\)="closeSheet\(\)"/);
    expect(html).toMatch(/\(keydown\.escape\)="onPropertiesEscape\(\)"/);
    expect(ts).toMatch(/onPropertiesEscape\(\): void \{\s*if \(this\.isNarrow\(\)/);
  });

  it('every selection change reaches the sheet, a delete included', () => {
    expect(ts).toMatch(/private _selection: BuilderSelection = NOTHING_SELECTED;/);
    expect(ts).toMatch(/set selection\(next: BuilderSelection\) \{[\s\S]{0,400}this\.moveFocusIntoSheet\(\)[\s\S]{0,80}this\.sheet\.Closed\(\)/);
  });

  it('its head is hidden at desktop width, where the pane is a column', () => {
    expect(css).toMatch(/@media \(min-width: 901px\) \{\s*\.fb-sheet-head \{ display: none; \}/);
  });
});
