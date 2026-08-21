/**
 * The respondent widget may not depend on an icon FONT for anything it draws.
 *
 * WHY. This element is published as a custom element and dropped onto pages we do not control —
 * the public `/f/:slug` host page, and third-party embeds. That page loads ZERO stylesheets, so a
 * `<i class="fa-solid fa-star">` is a 0×0 element with no glyph: present in the DOM, invisible on
 * screen. Explorer, meanwhile, loads Font Awesome 6.5.2 from cdnjs, so the builder's preview
 * mounts the SAME component and looks perfect. Every icon in here was in that state, and it was
 * reported as "the rating stars are gone in the real link but fine in the preview".
 *
 * The worst of it was never the stars. `Ranking` draws its two reorder buttons as nothing but a
 * chevron each, with the help text "Drag to rank them, or use the arrows" pointing straight at
 * six blank 36×36 boxes — and those buttons are the only way to reorder without a drag.
 *
 * WHY A DIRECTORY SWEEP AND NOT A LIST OF FILES. This exact diagnosis was already written down
 * in `form-screen.component.ts`, correctly, on the social links: "the respondent host page loads
 * no stylesheet, so an icon font renders as an empty square there while looking perfect in the
 * builder." It was applied to that one element. The `fa-circle-check` FOUR LINES ABOVE it, and
 * 17 more across four other files, kept the font. A guard naming today's files would have the
 * same shape as the mistake, so this enumerates the directory instead and covers a file nobody
 * has written yet.
 *
 * Comments are stripped first, this one included: a guard that matches its own prose proves
 * nothing.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every source file under the widget, recursively, excluding this suite's own kind. */
function widgetSources(dir: string = __dirname): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return widgetSources(full);
    }
    const isSource = /\.(ts|html|css)$/.test(entry) && !/\.spec\.ts$/.test(entry);
    return isSource ? [full] : [];
  });
}

const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

/**
 * Font Awesome's class families, plus any `fa-` token inside a class attribute.
 *
 * Both halves matter. The families catch the usual `fa-solid fa-star`; the class-attribute form
 * catches a bare `class="fa-star"` and a `[class]="'fa-' + name"` built at runtime, which is how
 * an icon font creeps back in without ever naming a family.
 */
const ICON_FONT_PATTERNS: ReadonlyArray<{ what: string; re: RegExp }> = [
  { what: 'a Font Awesome family class', re: /\bfa-(solid|regular|brands|light|thin|duotone)\b/ },
  { what: 'a fa-* token in a class binding', re: /class[^=]*=\s*["'][^"']*\bfa-/ },
];

describe('the respondent widget ships its own icons', () => {
  it('finds the widget sources it is supposed to be guarding', () => {
    // A sweep that silently matched nothing would pass forever. This is the assertion that says
    // the sweep is actually looking at something — the failure mode of a directory walk is an
    // empty list, not a wrong answer.
    const files = widgetSources();
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith('form-question.component.html'))).toBe(true);
  });

  it('draws no icon with an icon-font class', () => {
    const offenders: string[] = [];
    for (const file of widgetSources()) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const line of source.split('\n')) {
        for (const { what, re } of ICON_FONT_PATTERNS) {
          if (re.test(line)) {
            offenders.push(`${file.replace(__dirname, 'widget')}: ${what} — ${line.trim()}`);
          }
        }
      }
    }
    expect(
      offenders,
      `these render nothing on the public form and in every embed; use <mjf-icon name="…"> instead:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
