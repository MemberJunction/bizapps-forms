/**
 * Structural guard: `<mj-form>` re-renders when its host hands it a DIFFERENT definition.
 *
 * `MjFormComponent` uses `inject()` and cannot be instantiated in this suite's node environment
 * (see `vitest.config.ts` — Angular component classes are exercised by the Explorer ngc build, not
 * here), so what is checkable HERE is the source. That is a real limit and worth stating: this
 * proves the lifecycle hook exists and is wired to the reload path; it does not prove Angular
 * calls it. The manual builder smoke is what proves the latter.
 *
 * WHAT THIS FILE NO LONGER TRIES TO DO. The reload DECISION — first change, wrong input key —
 * moved to `definition-change.ts` and is tested for real in `definition-change.spec.ts`. It used
 * to be asserted here as `expect(body).toMatch(/firstChange/)`, which is a test that the word
 * appears: inverting the guard so it never reloaded left the word in place and this file green.
 * A regex over source can check that two things are CONNECTED; it cannot check what either does.
 * Everything below is the connection, and nothing below is the behaviour.
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

  it('delegates the decision to the predicate that is actually tested', () => {
    // Both facts this used to assert as text — key off `definitionInput`, skip the first change —
    // are branches of `shouldReloadOnDefinitionChange`, covered in `definition-change.spec.ts`.
    // What is left to check here is that the component asks it rather than re-deciding inline.
    const body = /ngOnChanges\([\s\S]*?\n  \}/.exec(source())?.[0] ?? '';
    expect(body).toMatch(/shouldReloadOnDefinitionChange\(changes\)/);
    expect(body, 'the decision must not be re-implemented here').not.toMatch(/firstChange/);
  });

  it('still loads once from ngOnInit, so a slug-driven respondent is unaffected', () => {
    // A real respondent passes `slug` and never `definition`, so ngOnChanges never fires for
    // them; ngOnInit remains their only load.
    expect(source()).toMatch(/ngOnInit\(\)[\s\S]{0,120}this\.load\(\)/);
  });
});
