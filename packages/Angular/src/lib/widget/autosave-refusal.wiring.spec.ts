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

/**
 * #303 Task 8 fix round 4 (re-review R3-1/R3-2). When a field the autosave would have to leave out is
 * one a rule may read, `FormRuntime.buildDraftInputs()` answers HELD (spec'd for real in
 * `core/form-runtime.spec.ts`). The component must then send NOTHING — a trimmed draft is what hides
 * a dependent question on the server and deletes its saved row, or trips a knockout — and must not
 * report the hold as a save. Throwing is both: the payload is built as the argument of the request,
 * so a throw while building it means the request is never made, and the controller records `'error'`.
 */
describe('a held autosave sends nothing and is not reported as saved (fix round 4)', () => {
  it('the partial payload is built through the hold check, never straight from the runtime', () => {
    const body = methodBody('private buildSubmission');
    expect(body).toMatch(/answers:\s*partial\s*\?\s*this\.draftAnswers\(rt\)\s*:\s*rt\.buildAnswerInputs\(\)/);
  });

  it('a held draft throws before any answers are returned', () => {
    const body = methodBody('private draftAnswers');
    const check = body.indexOf('if (draft.held) {');
    expect(check).toBeGreaterThan(-1);
    expect(body.slice(check)).toMatch(/^if \(draft\.held\) \{\s*throw new Error\(/);
    expect(check).toBeLessThan(body.indexOf('return draft.answers;'));
  });

  it('the payload is built inside the request call, so the throw comes before the request is made', () => {
    const body = methodBody('private async savePartial');
    expect(body).toMatch(/await this\.api\.submitResponse\(this\.buildSubmission\(def, rt, true\), this\.responseTarget\(\)\)/);
  });
});
