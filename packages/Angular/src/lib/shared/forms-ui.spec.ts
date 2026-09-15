import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { FORMS_UI_CSS, FORMS_UI_PRIMITIVES, FORMS_UI_TOKENS } from './forms-ui';

/**
 * Guards on the shared design layer.
 *
 * The failure these exist to catch is silent: `var(--mjf-guttre)` does not error, it
 * renders as nothing — a card with no padding, a control with no radius — and the
 * `lint:ui` colour gate has no opinion about it, because no colour is involved. With
 * ~16 tokens now referenced from ten files, a typo is a matter of time.
 *
 * There are TWO `--mjf-*` families in this package and the sweep below has to know the
 * difference:
 *
 *  1. The **authoring** layer defined in `forms-ui.ts` — Explorer surfaces. Every
 *     reference must resolve to a definition, because nothing supplies these at runtime.
 *  2. The **widget theming contract** (`BRAND_TOKENS` in builder/style-tokens.ts,
 *     consumed by lib/widget and previewed by the Design panel). These are supplied at
 *     render time from `FormStyle.CSSVariables`, so they are *deliberately* undefined in
 *     CSS — which is exactly why every one of them must carry a `var(--x, fallback)`.
 *
 * These are string assertions, not rendering assertions: the package's vitest runs in a
 * node environment where Angular components cannot be instantiated.
 */

const LIB_DIR = join(__dirname, '..');

/** `--mjf-foo` on the left of a colon, i.e. a definition rather than a reference. */
function definedTokens(css: string): Set<string> {
  return new Set([...css.matchAll(/(--mjf-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

/** Every `var(--mjf-foo …)`, paired with whether a fallback follows the comma. */
function tokenReferences(css: string): { token: string; hasFallback: boolean }[] {
  return [...css.matchAll(/var\(\s*(--mjf-[a-z0-9-]+)\s*([,)])/g)].map((m) => ({
    token: m[1],
    hasFallback: m[2] === ',',
  }));
}

/** Every non-generated source file under lib/, so no consumer escapes the sweep. */
function libSources(dir = LIB_DIR): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === 'generated' || name === 'node_modules' ? [] : libSources(full);
    }
    return /\.(ts|html|css)$/.test(name) && !name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('the Forms design layer', () => {
  it('defines every token its own primitives reference', () => {
    const defined = definedTokens(FORMS_UI_TOKENS);
    const dangling = tokenReferences(FORMS_UI_PRIMITIVES)
      .filter((r) => !defined.has(r.token))
      .map((r) => r.token);
    expect([...new Set(dangling)]).toEqual([]);
  });

  it('leaves no --mjf-* reference that is neither defined nor given a fallback', () => {
    const sources = libSources();
    // The union of everything defined anywhere: the authoring layer plus the widget's
    // own defaults, which one widget file sets on :host and its children inherit.
    const defined = new Set(definedTokens(FORMS_UI_CSS));
    for (const file of sources) {
      for (const token of definedTokens(readFileSync(file, 'utf8'))) defined.add(token);
    }

    const dangling = new Map<string, string[]>();
    for (const file of sources) {
      for (const { token, hasFallback } of tokenReferences(readFileSync(file, 'utf8'))) {
        if (hasFallback || defined.has(token)) continue;
        dangling.set(token, [...(dangling.get(token) ?? []), file.slice(LIB_DIR.length + 1)]);
      }
    }

    expect(Object.fromEntries(dangling)).toEqual({});
  });

  it('resolves every scale token to an MJ token or a plain number, never to a colour', () => {
    // A literal colour here would defeat dark mode for every surface at once, which is
    // the one thing this file exists to make impossible.
    const definitions = [...FORMS_UI_TOKENS.matchAll(/--mjf-[a-z0-9-]+\s*:\s*([^;]+);/g)].map(
      (m) => m[1].trim(),
    );
    expect(definitions.length).toBeGreaterThan(10);
    for (const value of definitions) {
      expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    }
  });

  it('keeps --mjf-rule off --mj-border-subtle', () => {
    // --mj-border-subtle is byte-identical to --mj-bg-surface in MJ's dark theme, so a
    // hairline drawn on a card with it is invisible there and correct in light mode.
    // That asymmetry is exactly why this token exists; pointing it back at the subtle
    // border would silently reintroduce the bug across every surface at once.
    expect(FORMS_UI_TOKENS).toMatch(/--mjf-rule:\s*var\(--mj-border-default\)/);
  });
});
