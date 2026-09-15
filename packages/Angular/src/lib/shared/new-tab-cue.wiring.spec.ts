/**
 * Structural guard: every link that opens a new tab tells a screen-reader user that it does.
 *
 * The sighted cue for "this leaves the page" is always a glyph — the arrow on the five help
 * links, the square-out arrow on "Open it yourself", the logo on an ending screen's social row —
 * and every one of those glyphs is `aria-hidden`, correctly, because it is decoration. What is
 * left for everyone else is a link that silently replaces their context. WCAG 3.2.5 asks for the
 * warning; the practical version is that a respondent halfway through a form, or an author
 * halfway through publishing, does not get to notice a new tab by looking at it.
 *
 * The five empty-state links were fixed one at a time and the sixth was missed, which is the
 * whole reason this is a test rather than a convention: the markup is spread across six files in
 * three surfaces (builder, dashboards, widget) and nothing tied them together.
 *
 * The contract is per FILE, not per element: a `target="_blank"` needs a matching
 * "(opens in a new tab)" in the same file. In a template that is the `.mjf-visually-hidden` span
 * beside the link text; in the widget's inline-template component it is the `aria-label` built in
 * the component class, because an icon-only link has no text to hang a span on. Counting rather
 * than matching pairs keeps this readable — a file with two such links needs two cues — and the
 * direction it errs in is a false failure, which is the safe one.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LIB_DIR = join(__dirname, '..');
const SOURCE_EXTENSIONS = ['.html', '.ts'];
const NEW_TAB_CUE = '(opens in a new tab)';
const OPENS_NEW_TAB = /target="_blank"/g;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    if (entry.name.endsWith('.spec.ts')) return [];
    return SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

/** A commented-out cue is not a cue, and a comment explaining the rule is not an instance of it. */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

const files = listSourceFiles(LIB_DIR).map((path) => ({
  path,
  source: stripComments(readFileSync(path, 'utf8')),
}));

const opensNewTab = files
  .map((file) => ({ ...file, links: file.source.match(OPENS_NEW_TAB)?.length ?? 0 }))
  .filter((file) => file.links > 0);

describe('links that open a new tab', () => {
  it('exist, so this guard is checking something', () => {
    // Without this, renaming the attribute or moving every link would leave a green suite that
    // asserts nothing — the failure mode a structural guard is most prone to.
    expect(opensNewTab.length).toBeGreaterThanOrEqual(6);
  });

  it.each(opensNewTab)('$path warns a screen-reader user on each of its $links link(s)', (file) => {
    const cues = file.source.split(NEW_TAB_CUE).length - 1;
    expect(cues).toBeGreaterThanOrEqual(file.links);
  });
});
