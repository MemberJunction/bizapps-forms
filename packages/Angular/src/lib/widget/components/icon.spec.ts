/**
 * Regression guards for #115: every icon on the respondent page rendered at 0 × 0.
 *
 * The widget drew its icons as Font Awesome `<i class="fa-…">` elements — a glyph that only
 * exists once a host page loads the icon font. The builder preview renders the same component
 * inside Explorer, which loads Font Awesome globally; the public `/f/:slug` host page is
 * deliberately shell-free and loads NO stylesheet at all. Same markup, two hosts: stars, the
 * Ranking grip and chevrons, the FileUpload paperclip and the Doodle Undo/Clear all measured
 * `0 × 0` on a live link while the state machine underneath them was flawless.
 *
 * The fix makes the widget carry its own icons as inline SVG (`<mjf-icon>`), so what these
 * specs pin is the invariant, not the fix: the widget must not depend on ANY host-supplied
 * font, stylesheet or origin to draw an icon.
 *
 * Layout cannot be measured in this node environment (no jsdom, no browser; see
 * `vitest.config.ts`), so "non-zero size" is asserted at the two layers that make it true by
 * construction: the element has an intrinsic `1em` box, and the geometry it paints has a
 * positive `viewBox` and a real path. The live measurement is in the issue's smoke test.
 *
 * Comments are stripped before every assertion — the source explains these same decisions,
 * and a guard that matches its own documentation proves nothing.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { WIDGET_ICON_GLYPHS, type WidgetIconName } from './icon-glyphs';

const WIDGET_ROOT = join(__dirname, '..');

/** The component's source; its stylesheet is an inline `styles:` string, read here as text. */
const componentSource = (): string => stripComments(readFileSync(join(__dirname, 'icon.component.ts'), 'utf8'));

/** Every non-spec source file under `src/lib/widget/`, comments stripped. */
function widgetSources(): ReadonlyArray<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(html|ts|css)$/.test(name) && !name.endsWith('.spec.ts')) {
        out.push({ file: full.slice(WIDGET_ROOT.length + 1), text: stripComments(readFileSync(full, 'utf8')) });
      }
    }
  };
  walk(WIDGET_ROOT);
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/[^\n]*/gm, '');
}

describe('the widget draws its icons without a host-supplied font', () => {
  it('has no Font Awesome markup anywhere in the widget', () => {
    // The whole defect in one assertion: a `fa-*` class is a promise that some host will load
    // the font, and the respondent host page never does.
    const offenders = widgetSources()
      .filter(({ text }) => /\bfa-(solid|regular|brands|light|thin|duotone|spin)\b/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('renders no <i> element at all', () => {
    // An empty `<i>` is only ever an icon-font hook. Anything the widget wants a reader to see
    // as an icon must be markup with its own geometry.
    const offenders = widgetSources()
      .filter(({ file }) => file.endsWith('.html') || file.endsWith('.ts'))
      .filter(({ text }) => /<i\b[^>]*>/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('references no third-party origin for anything it draws', () => {
    // Acceptance criterion: no icon is loaded from a CDN on an anonymous public form.
    const offenders = widgetSources()
      .filter(({ text }) => /cdnjs\.cloudflare\.com|fontawesome\.com\/|fonts\.googleapis\.com|unpkg\.com|cdn\.jsdelivr\.net/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

describe('every icon has non-zero size by construction', () => {
  it('gives the host element an intrinsic box, before and regardless of what paints inside it', () => {
    // A `0 × 0` icon is what a missing font produces. The host box must not depend on content.
    const host = componentSource().match(/:host\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(host).toMatch(/display:\s*inline-flex/);
    expect(host).toMatch(/width:\s*1em/);
    expect(host).toMatch(/height:\s*1em/);
  });

  it('carries a positive viewBox and a real path for every glyph in the catalogue', () => {
    for (const [name, glyph] of Object.entries(WIDGET_ICON_GLYPHS)) {
      const box = /^0 0 (\d+) (\d+)$/.exec(glyph.viewBox);
      expect(box, `${name}: viewBox "${glyph.viewBox}"`).not.toBeNull();
      expect(Number(box?.[1]), `${name}: viewBox width`).toBeGreaterThan(0);
      expect(Number(box?.[2]), `${name}: viewBox height`).toBeGreaterThan(0);
      expect(glyph.path, `${name}: path`).toMatch(/^M[\d.\s-]/);
      expect(glyph.path.length, `${name}: path length`).toBeGreaterThan(20);
    }
  });

  it('fills the glyph from the surrounding text colour, so theme tokens still apply', () => {
    // Rating's selected/unselected state is a colour flip on the button; the SVG must inherit it.
    expect(componentSource()).toMatch(/fill:\s*currentColor/);
  });
});

describe('every icon the templates ask for exists', () => {
  // strictTemplates already makes an unknown name a compile error; this keeps the same fact
  // visible in `pnpm test`, where a red run is cheaper to read than a failed ngc.
  it('uses only catalogued names', () => {
    const used = new Set<string>();
    for (const { text } of widgetSources()) {
      for (const m of text.matchAll(/<mjf-icon\b[^>]*\bname="([^"]+)"/g)) {
        used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    const unknown = [...used].filter((name) => !(name in WIDGET_ICON_GLYPHS));
    expect(unknown).toEqual([]);
  });

  it('marks every icon decorative', () => {
    // All 22 original sites were `aria-hidden` (or inside an `aria-hidden` container): the
    // accessible name always comes from `aria-label` or the adjacent text. A host binding
    // makes that true for every future site without each one remembering.
    expect(componentSource()).toMatch(/'aria-hidden':\s*'true'/);
  });

  it('spells the catalogue name type from its keys', () => {
    // Compile-time: a typo in `name="…"` fails ngc. This is the runtime mirror of that contract.
    const name: WidgetIconName = 'star';
    expect(WIDGET_ICON_GLYPHS[name]).toBeDefined();
  });
});

describe('Ranking reorder buttons meet the tap-target minimum', () => {
  // Contract test (documents rather than drove the number): WCAG 2.5.5 / the widget's own bar
  // is 44 CSS px = 2.75rem, which every other control in the widget already meets. The arrows
  // are the ONLY path for a respondent who cannot drag, and they measured 36 × 36 on a phone.
  it('sizes .mjf-rank__move at 2.75rem square', () => {
    const css = stripComments(readFileSync(join(__dirname, 'questions/form-question.component.css'), 'utf8'));
    const rule = css.match(/\.mjf-rank__move\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/width:\s*2\.75rem/);
    expect(rule).toMatch(/height:\s*2\.75rem/);
  });
});
