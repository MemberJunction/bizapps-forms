/**
 * SOURCE-TEXT CHECK of the rows that used to be buttons containing buttons (UI audit F05, axe
 * `nested-interactive`, WCAG 4.1.2): the Forms home row, the template card, the builder question
 * card and the builder's welcome/ending screen cards. It asserts the markup is present, not how
 * it behaves — `row-activate.spec.ts` holds the click decision, and the live smoke checks axe.
 * The components use `inject()` and signal inputs with templates this node suite cannot render.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

const home = read('../home/forms-home-dashboard.component.html');
const templates = read('../templates/templates-gallery.component.html');
const builder = read('../builder/form-builder.component.html');

/** Every opening tag whose attributes contain `marker`. */
function tagsWith(html: string, marker: string): string[] {
  const tags: string[] = [];
  for (let at = html.indexOf(marker); at !== -1; at = html.indexOf(marker, at + 1)) {
    const start = html.lastIndexOf('<', at);
    tags.push(html.slice(start, html.indexOf('>', at) + 1));
  }
  return tags;
}

const ROWS: Array<[string, string, string]> = [
  ['Forms home row', home, 'class="mjf-row"'],
  ['template card', templates, 'class="tg-card"'],
  ['builder question card', builder, 'class="fb-q"'],
];

describe('rows activate without being buttons (source-text check)', () => {
  it.each(ROWS)('the %s is not itself a button or a tab stop', (_name, html, marker) => {
    const [row] = tagsWith(html, marker);
    expect(row, `no ${marker}`).toBeDefined();
    expect(row).not.toContain('role="button"');
    expect(row).not.toContain('tabindex="0"');
    expect(row).not.toContain('(keydown.enter)');
    expect(row).toContain('(mjfRowActivate)=');
  });

  it('the builder screen cards activate the same way', () => {
    const screens = tagsWith(builder, '(mjfRowActivate)="selectScreen(');
    expect(screens.length).toBe(2);
    for (const tag of screens) {
      expect(tag).not.toContain('tabindex="0"');
      expect(tag).not.toContain('(keydown.enter)');
    }
  });

  it('each row has a real button as its keyboard path', () => {
    expect(home).toMatch(/<button[^>]*class="mjf-row-primary"[^>]*\(click\)="openForm\(row\)"/);
    expect(templates).toMatch(/<button[^>]*class="[^"]*mjf-row-primary[^"]*"[^>]*\(click\)="chooseSaved\(row\)"/);
    expect(builder).toMatch(/<button[^>]*class="fb-q-label"[^>]*\(click\)="selectQuestion\(node\)"/);
  });

  it('no inner control has to stop the row any more', () => {
    expect(builder).not.toContain('stopPropagation()');
    expect(templates).not.toContain('stopPropagation()');
    expect(home).not.toContain('(keydown)="$event.stopPropagation()"');
  });

  it('the builder title buttons are at least 24px tall (WCAG 2.5.8; one text line measured 19px live)', () => {
    const css = readFileSync(join(__dirname, '../builder/form-builder.styles.ts'), 'utf8');
    const rule = (selector: string): string => {
      const at = css.indexOf(`${selector} {`);
      expect(at, `no ${selector} rule`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf('}', at));
    };
    expect(rule('button.fb-q-label')).toMatch(/min-height:\s*24px/);
    expect(rule('.fb-screen-title')).toMatch(/min-height:\s*24px/);
  });

  it('a click on the section title selects the section, but tabbing past it does not (final review #3)', () => {
    // `(focus)` made a keyboard author tabbing through the canvas lose the selected question at every
    // section title. The click is exactly what the old head-wide (click) did for a mouse.
    const [title] = tagsWith(builder, '#pageTitle');
    expect(title).toContain('(click)="selectPage(page)"');
    expect(title).not.toContain('(focus)=');
  });

  it('move buttons name the question they move', () => {
    expect(builder).toContain(`[attr.aria-label]="'Move ' + node.entity.Prompt + ' up'"`);
    expect(builder).toContain(`[attr.aria-label]="'Move ' + node.entity.Prompt + ' down'"`);
  });
});
