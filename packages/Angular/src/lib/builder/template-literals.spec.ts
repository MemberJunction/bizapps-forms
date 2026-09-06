/**
 * No stray backticks inside the CSS and template literals the builder's components carry.
 *
 * WHY THIS EXISTS. Component CSS and inline templates in this package live in TypeScript template
 * literals. A backtick written inside one — the natural way to quote an identifier in a comment,
 * `like this` — TERMINATES the literal, and the rest of the stylesheet is parsed as TypeScript.
 * The failure is loud but distant: `ngc` reports "Property 'fb' does not exist on type" or
 * "',' expected" pointing at prose, tens of lines from the quote that caused it.
 *
 * It happened three times while this feature was being built, each time in a comment explaining
 * something, each time costing a full Angular compile to discover. The unit suite could not see
 * it: these components are never imported here (no DOM, and the decorators need the compiler), so
 * a broken stylesheet stayed green until the slow gate ran.
 *
 * This is a text check on purpose. It is not trying to parse TypeScript — it walks each file's
 * template literals and fails on a backtick inside one, which is the whole bug class.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Files here that carry a `/* css *\/` or inline-template literal. */
function filesWithLiterals(): string[] {
  return readdirSync(__dirname)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .filter((f) => {
      const text = readFileSync(join(__dirname, f), 'utf8');
      return text.includes('/* css */ `') || /\n\s*template: `/.test(text);
    });
}

/**
 * The offending quotes inside one file's literals, as `line: text` for a readable failure.
 *
 * Walks the source once, tracking whether it is inside a literal that began with a `/* css *\/`
 * or `template:` marker.
 *
 * ESCAPED BACKTICKS ARE FINE and are stripped before the scan. A first cut of this guard flagged
 * three of them — in `design-panel.styles.ts` and `form-preview-stage.styles.ts`, where a comment
 * legitimately quotes a CSS property — and those files compile perfectly. A guard that fires on
 * correct code is worse than none: it teaches people to edit the guard instead of the bug.
 */
function straysIn(file: string): string[] {
  const lines = readFileSync(join(__dirname, file), 'utf8').split('\n');
  const strays: string[] = [];
  let open = false;
  lines.forEach((raw, i) => {
    const line = raw.replace(/\\`/g, '');
    const opens = /(\/\* css \*\/ `|template: `)/.exec(line);
    if (!open && opens) {
      open = true;
      return;
    }
    if (!open) {
      return;
    }
    if (/^\s*`[,;)]?\s*$/.test(line)) {
      open = false;
      return;
    }
    if (line.includes('`')) {
      strays.push(`${file}:${i + 1}  ${line.trim()}`);
    }
  });
  return strays;
}

describe('component CSS and inline templates', () => {
  it('has files to check, so a broken finder cannot pass vacuously', () => {
    expect(filesWithLiterals().length).toBeGreaterThan(0);
  });

  it('contains no backtick that would end the literal early', () => {
    expect(filesWithLiterals().flatMap(straysIn)).toEqual([]);
  });
});
