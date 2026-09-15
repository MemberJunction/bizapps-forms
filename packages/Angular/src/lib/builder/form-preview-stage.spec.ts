import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PREVIEW_STAGE_STYLES } from './form-preview-stage.styles';
import { DESIGN_PANEL_STYLES } from './design-panel.styles';

/**
 * The stage is a rendering contract, and the two ways it can be broken are both invisible to
 * the type checker: a host pane that re-declares how `<mj-form>` lays out, or a host that
 * renders the widget bare and skips the stage entirely. Both happened — the Design tab did both
 * at once — so both are asserted here.
 *
 * Read as source text rather than exercised through a component: these components cannot be
 * instantiated in the vitest node env (no Angular JIT), and the failure being guarded is a CSS
 * cascade one that a DOM-free component test would not have caught anyway.
 */
const here = __dirname;
const source = (file: string): string => readFileSync(join(here, file), 'utf8');

/** Strip block comments — they discuss `display: block` at length and must not match. */
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every declaration a rule whose selector mentions `mj-form` makes. */
function declarationsTargetingWidget(css: string): string[] {
  const out: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rule.exec(withoutComments(css))) !== null) {
    const [, selector, body] = match;
    // `mj-form` as an element selector, not `mjf-form-…` component names.
    if (/(^|[\s>+~,])mj-form(?![\w-])/.test(selector)) {
      out.push(...body.split(';').map((d) => d.trim().toLowerCase()).filter(Boolean));
    }
  }
  return out;
}

describe('preview stage CSS', () => {
  it('gives the widget a full-height box to centre screens in', () => {
    expect(declarationsTargetingWidget(PREVIEW_STAGE_STYLES)).toContain('min-height: 100%');
  });

  it('never overrides the widget host display, which would break screen centring', () => {
    // `:host { display: flex; flex-direction: column }` in mj-form.component.css compiles to a
    // bare `[_nghost-x]` attribute selector, so ANY host rule naming the element out-competes it.
    // Setting `display: block` there left welcome and ending screens pinned to the top of a tall
    // empty pane instead of centred in it.
    const displays = declarationsTargetingWidget(PREVIEW_STAGE_STYLES).filter((d) =>
      d.startsWith('display:'),
    );
    expect(displays).toEqual([]);
  });
});

describe('design panel preview', () => {
  it('renders the shared stage rather than a bare widget', () => {
    // The regression this replaces: the Design tab hosted `<mj-form>` directly, so it had no
    // device switcher, no fixed-height frame and no sunken desk — the author designed against a
    // layout Preview then contradicted.
    const template = source('design-panel.component.html');
    expect(template).toContain('<mjf-form-preview-stage');
    expect(template).not.toMatch(/<mj-form[\s>]/);
  });

  it('leaves the widget layout alone in its own stylesheet', () => {
    expect(declarationsTargetingWidget(DESIGN_PANEL_STYLES)).toEqual([]);
  });
});

describe('screen strip', () => {
  it('lives in the shared stage, so both preview surfaces get it', () => {
    // Putting it in one host would recreate exactly the divergence the stage was extracted to
    // end: an author who styles an ending screen in Design and cannot reach it in Preview.
    const stage = withoutComments(source('form-preview-stage.component.ts'));
    expect(stage).toContain('class="ps-screens"');
    expect(withoutComments(source('design-panel.component.html'))).not.toContain('ps-screens');
    expect(withoutComments(source('form-preview-modal.component.ts'))).not.toContain('ps-screens');
  });

  it('commands the widget instead of remembering a selection of its own', () => {
    // The highlight must come from the widget's live state: a stored selection goes stale the
    // moment the respondent presses Start or a submit lands on its ending screen.
    const stage = withoutComments(source('form-preview-stage.component.ts'));
    expect(stage).toContain('this.form()?.showScreen(');
    expect(stage).toContain('this.form()?.shownScreen()');
  });
});

describe('design panel theming', () => {
  it('styles the form through the widget, not by writing on its element', () => {
    // Writing custom properties onto the element from outside can only carry the CSS half of a
    // style. The logo is an <img> the widget renders from its own state, so an author picked one
    // and nothing appeared while every colour beside it updated live.
    const panel = withoutComments(source('design-panel.component.ts'));
    expect(panel).toContain('this.preview?.applyPreviewStyle(tokens)');
    expect(panel).not.toContain('applyStyleTokens(host');
  });
});

describe('preview modal', () => {
  it('renders the shared stage rather than its own copy of one', () => {
    const modal = withoutComments(source('form-preview-modal.component.ts'));
    expect(modal).toContain('<mjf-form-preview-stage');
    expect(modal).not.toMatch(/<mj-form[\s>]/);
  });
});
