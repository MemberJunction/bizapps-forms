/**
 * The two rules that bracket the question region on the builder canvas.
 *
 * THE DEFECT. `.fb-endings` has always drawn a rule above itself, so an author reading down the
 * canvas is told where the questions stop. Nothing told them where the questions START: the
 * welcome block was one more item in the same flex column, separated from section 1 by the same
 * gap that separates any two items. The canvas therefore read as one undifferentiated list with
 * a line near the bottom, rather than as the three zones it actually is — the screens bracket
 * the intake, and the questions sit between them.
 *
 * WHY A MATCHED PAIR IS THE THING UNDER TEST, and not "the opening has a border". Two rules only
 * read as a pair while they are identical. A later change to one of them — a heavier weight, a
 * different token, more air — silently turns the frame back into a stray line unless the other
 * follows, and nothing about a border declaration three hundred lines from its twin makes that
 * obvious to the person changing it. So the assertions below compare the two DECLARATIONS
 * against each other rather than against literals: any drift fails, whatever direction it goes,
 * and a deliberate change to both keeps passing without anyone editing this file.
 *
 * WHY THE SPEC READS SOURCE. The builder uses `inject()` and `templateUrl` and cannot be
 * instantiated in this suite's node environment (see `vitest.config.ts`), so its stylesheet and
 * template are what there is to check — the same approach `reorder-affordance.wiring.spec.ts`
 * takes for a binding. The files are this repo's own checked-in sources, read off disk in a test
 * process; nothing here comes from a request.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string): string => readFileSync(join(__dirname, file), 'utf8');

/** The template with its comments stripped — a guard matching its own prose proves nothing. */
const templateHtml = (): string => read('form-builder.component.html').replace(/<!--[\s\S]*?-->/g, '');

const stylesheet = (): string => read('form-builder.styles.ts').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Every declaration that applies to one class, flattened across all the rules naming it.
 *
 * Selector lists are honoured (`.fb-opening,\n.fb-endings { … }` contributes to both), because
 * the whole point of the shared block is that it declares the pair's common half once. Later
 * declarations win, matching the cascade for equal specificity — the two classes are single
 * class selectors in one stylesheet, so that is the only rule needed here.
 */
function declarationsFor(css: string, className: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const names = selectors.split(',').map((s) => s.trim());
    if (!names.includes(`.${className}`)) {
      continue;
    }
    for (const declaration of body.split(';')) {
      const split = declaration.indexOf(':');
      if (split > 0) {
        found.set(declaration.slice(0, split).trim(), declaration.slice(split + 1).trim());
      }
    }
  }
  return found;
}

/**
 * The `border-<side>` a class draws, whether written as the shorthand or as longhands.
 *
 * Returned as `{ width, style, color }` so the two zones can be compared on what they LOOK like
 * rather than on how they were spelled — the shared-plus-longhand form this stylesheet uses and
 * a plain `border-top: 1px solid var(--mjf-rule)` are the same rule to a reader, and a spec that
 * could not see that would block the very refactor that removes the duplication.
 */
function borderOn(
  declarations: Map<string, string>,
  side: 'top' | 'bottom',
): { width: string; style: string; color: string } {
  const shorthand = declarations.get('border') ?? '';
  const [baseWidth = '', baseStyle = '', ...baseColor] = shorthand.split(/\s+/).filter(Boolean);
  const sideShorthand = declarations.get(`border-${side}`);
  if (sideShorthand) {
    const [width = '', style = '', ...color] = sideShorthand.split(/\s+/).filter(Boolean);
    return { width, style, color: color.join(' ') };
  }
  return {
    width: declarations.get(`border-${side}-width`) ?? baseWidth,
    style: declarations.get(`border-${side}-style`) ?? baseStyle,
    color: declarations.get(`border-${side}-color`) ?? baseColor.join(' '),
  };
}

describe('the canvas rules that bracket the question region', () => {
  it('draws a rule below the opening, mirroring the one above the endings', () => {
    const css = stylesheet();
    const opening = borderOn(declarationsFor(css, 'fb-opening'), 'bottom');
    const endings = borderOn(declarationsFor(css, 'fb-endings'), 'top');

    expect(endings.width).not.toBe('');
    expect(opening).toEqual(endings);
  });

  it('gives the opening the same air below its rule that the endings has above theirs', () => {
    const css = stylesheet();
    const opening = declarationsFor(css, 'fb-opening');
    const endings = declarationsFor(css, 'fb-endings');

    // Mirrored, so the pair sits symmetrically about the questions: the endings pads BELOW its
    // rule and clears space above it, and the opening does the same in reverse.
    expect(opening.get('padding-bottom')).toBe(endings.get('padding-top'));
    expect(opening.get('margin-bottom')).toBe(endings.get('margin-top'));
  });

  it('puts the opening rule in the same place whether or not a welcome screen is there', () => {
    // `.fb-screen-add` carries a bottom margin of its own, from before the canvas had a `gap`.
    // Left alone inside the zone it pushes the rule down in the no-welcome state only, so the
    // boundary would sit 8px lower on a form with no welcome screen than on one with — which
    // undoes the very claim the pair makes, that this is the FORM's boundary and not the card's.
    const declarations = declarationsFor(stylesheet(), 'fb-screen-add');
    expect(declarations.get('margin-bottom')).not.toBe(undefined);

    const scoped = /\.fb-opening\s+\.fb-screen-add\s*\{([^{}]*)\}/.exec(stylesheet());
    expect(scoped?.[1]).toMatch(/margin-bottom:\s*0/);
  });

  it('draws the opening rule whether or not the form has a welcome screen', () => {
    // The boundary belongs to the FORM, not to the card: a form with no welcome screen still
    // starts somewhere, and the frame that makes the canvas legible must not blink out when the
    // author deletes the screen. So the zone wraps the whole @if/@else, not just its first arm.
    const html = templateHtml();
    const opening = html.indexOf('class="fb-opening"');
    expect(opening).toBeGreaterThan(-1);

    const zone = html.slice(opening);
    const addWelcome = zone.indexOf(`addScreen('Welcome')`);
    const firstPage = zone.indexOf('@for (page of pages');
    expect(addWelcome).toBeGreaterThan(-1);
    expect(addWelcome).toBeLessThan(firstPage);
  });
});
