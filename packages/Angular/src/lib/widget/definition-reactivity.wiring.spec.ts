/**
 * Structural guard: `<mj-form>` re-renders when its host hands it a DIFFERENT definition.
 *
 * `MjFormComponent` uses `inject()` and cannot be instantiated in this suite's node environment
 * (see `vitest.config.ts` — Angular component classes are exercised by the Explorer ngc build, not
 * here), so what is checkable is the source. That is a real limit and worth stating: this proves
 * the lifecycle hook exists and is wired to the reload path; it does not prove Angular calls it.
 * The manual builder smoke is what proves the latter.
 *
 * WHAT WENT WRONG, so a future edit does not quietly undo it. The `definition` input was read
 * exactly once, inside `ngOnInit`. The Preview modal never showed the bug because `@if (previewDef)`
 * destroys and recreates the whole modal per open, so every open got a fresh `ngOnInit`. The Design
 * tab's stage is not gated that way — it lives as long as the tab — so an author editing a question
 * watched a preview of the form as it stood when they opened the tab. Streaming generation makes
 * this load-bearing rather than cosmetic: the whole point is a preview that fills in while the
 * server patches the tree, and a component that reads its input once shows an empty form for the
 * entire build.
 *
 * Comments are stripped before every assertion — the source explains these same decisions, and a
 * guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (): string =>
  readFileSync(join(__dirname, 'mj-form.component.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

describe('the definition input is the CURRENT definition, not the initial one', () => {
  it('declares OnChanges alongside OnInit', () => {
    expect(source()).toMatch(/class\s+MjFormComponent\s+implements[^{]*OnChanges/);
  });

  it('re-runs the load path from ngOnChanges', () => {
    const body = /ngOnChanges\([\s\S]*?\n  \}/.exec(source())?.[0] ?? '';
    expect(body, 'ngOnChanges must exist').not.toBe('');
    expect(body).toMatch(/this\.load\(\)/);
  });

  it('keys the change off the PROPERTY name, not the `definition` alias', () => {
    // SimpleChanges is keyed by the declared property. Reading `changes['definition']` compiles,
    // is always undefined, and turns this into a hook that never fires — the exact failure it
    // was added to fix, wearing a passing build.
    const body = /ngOnChanges\([\s\S]*?\n  \}/.exec(source())?.[0] ?? '';
    expect(body).toMatch(/changes\['definitionInput'\]/);
    expect(body).not.toMatch(/changes\['definition'\]/);
  });

  it('skips the first change, so a fresh component loads once and not twice', () => {
    // ngOnChanges fires before the first ngOnInit. Without this guard every mount loads twice,
    // minting two client response ids for one form.
    const body = /ngOnChanges\([\s\S]*?\n  \}/.exec(source())?.[0] ?? '';
    expect(body).toMatch(/firstChange/);
  });

  it('still loads once from ngOnInit, so a slug-driven respondent is unaffected', () => {
    // A real respondent passes `slug` and never `definition`, so ngOnChanges never fires for
    // them; ngOnInit remains their only load.
    expect(source()).toMatch(/ngOnInit\(\)[\s\S]{0,120}this\.load\(\)/);
  });
});
