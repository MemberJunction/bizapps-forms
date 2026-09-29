/**
 * Structural guard for the widget half of bizapps-forms#271.
 *
 * A server-REFUSED autosave (e.g. the autosave rate-limit bucket landed by
 * `packages/Server/src/public-submit`) used to look identical to a server-ACCEPTED one to the
 * respondent: `savePartial()` returned normally whenever the transport succeeded, regardless of
 * `res.success`, so `AutosaveController.runSave()` always recorded `'saved'` — the indicator said
 * "Saved" for a save the server had just thrown away.
 *
 * `MjFormComponent` uses `inject()` and cannot be instantiated in this suite's node environment
 * (the constraint `submit-overlay.wiring.spec.ts` documents), so what is checkable here is the
 * SOURCE: that `savePartial()` throws on a refusal rather than returning normally. The other half
 * of the behaviour — that a `save()` which throws makes the controller record `'error'` (never
 * `'saved'`) and retries on a capped backoff — is exercised for real, with fake timers and no
 * component, in `core/autosave-controller.spec.ts`. Together the two seams cover the same path
 * `savePartial()` actually runs in production; neither alone would.
 *
 * Comments are stripped before every assertion — the source explains this same decision, and a
 * guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

const source = (): string => stripped('mj-form.component.ts');

/** The body of one method of `mj-form.component.ts`, so an assertion cannot bind elsewhere. */
function methodBody(declaration: string): string {
  const src = source();
  const start = src.indexOf(declaration);
  expect(start, `${declaration} not found`).toBeGreaterThan(-1);
  const body = src.slice(start);
  return body.slice(0, body.indexOf('\n  }\n'));
}

describe('a refused autosave is an error, not a save (#271)', () => {
  it('throws when the server refuses the save, instead of returning as if it landed', () => {
    const body = methodBody('private async savePartial');
    expect(body).toMatch(
      /if\s*\(!res\.success\)\s*\{\s*throw new Error\(`Autosave refused: \$\{res\.errors\?\.\[0\]\?\.message \?\? 'no reason given'\}`\);/,
    );
  });

  it('still keeps the existing success branch that threads the responseId through', () => {
    const body = methodBody('private async savePartial');
    expect(body).toMatch(/if\s*\(res\.responseId\)\s*\{/);
    expect(body).toMatch(/this\.responseId = res\.responseId;/);
    expect(body).toMatch(/this\.announceFirstPartial\(res\.responseId\);/);
  });

  it('the throw happens before the success branch, so a refusal never reaches it', () => {
    const body = methodBody('private async savePartial');
    const throwIndex = body.indexOf('throw new Error(`Autosave refused:');
    const successIndex = body.indexOf('if (res.responseId)');
    expect(throwIndex).toBeGreaterThan(-1);
    expect(successIndex).toBeGreaterThan(-1);
    expect(throwIndex).toBeLessThan(successIndex);
  });
});
