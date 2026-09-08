/**
 * Every question renders something the renderers can move focus to.
 *
 * The defect this pins is #117 one layer up. `FormScrollComponent.focusFirstInvalidIn` resolves
 * the question that failed validation with `querySelector('#mjf-q-' + id)` — the id of the
 * *control*. Only the native branches of the question switch bind `[id]="inputId()"` on an
 * element; a grouped question renders a `role="radiogroup"` / `role="group"` div of buttons, and
 * Ranking, Matrix, Doodle and the composites bind nothing under that id either. So for thirteen
 * of the twenty-five types the lookup returned null, the optional chain swallowed it, and focus
 * stayed on the Next button — which is precisely the "form refuses to submit with no visible
 * reason" that `revealFirstInvalid` says it exists to prevent.
 *
 * The fix is a per-question container id that always renders, and a renderer that falls back to
 * it. Both halves are asserted here because either one alone is inert: an id nothing looks up,
 * or a lookup for an id nothing binds.
 *
 * `FormScrollComponent` uses `input.required` and `FormQuestionComponent` uses signal inputs, so
 * neither can be instantiated in this suite's node environment — the constraint
 * `scroll-stepper.wiring.spec.ts` and `aria-idrefs.wiring.spec.ts` both document. What is
 * checkable is the source. Comments are stripped before every assertion: both files explain this
 * decision in prose, and a guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (path: string): string =>
  readFileSync(join(__dirname, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const questionTemplate = stripped('questions/form-question.component.html');
const questionSource = stripped('questions/form-question.component.ts');
const scrollSource = stripped('form-scroll.component.ts');

/** The id expression the question container carries, e.g. `focusTargetId()`. */
const CONTAINER_ID_BINDING = /<div class="mjf-question"[^>]*\[id\]="(\w+)\(\)"/;

describe('a question that fails validation is something the renderer can focus', () => {
  it('gives the question container an id and makes it focusable', () => {
    const match = questionTemplate.match(CONTAINER_ID_BINDING);
    expect(match, 'the .mjf-question container binds no [id]').not.toBeNull();
    expect(
      questionTemplate.match(/<div class="mjf-question"[^>]*>/)?.[0],
      'the .mjf-question container is not programmatically focusable',
    ).toMatch(/tabindex="-1"/);
  });

  it('derives that id from inputId, so it cannot drift from the ids the renderers build', () => {
    const name = questionTemplate.match(CONTAINER_ID_BINDING)![1];
    const computed = questionSource.match(new RegExp(`${name} = computed\\(\\(\\) => \`([^\`]+)\``));
    expect(computed, `${name} is not a computed in the component`).not.toBeNull();
    expect(computed![1]).toBe('${this.inputId()}-question');
  });

  it('falls back to the container when the control does not carry the id', () => {
    const start = scrollSource.indexOf('private focusFirstInvalidIn');
    expect(start, 'focusFirstInvalidIn not found').toBeGreaterThan(-1);
    const body = scrollSource.slice(start, scrollSource.indexOf('\n  }\n', start));
    expect(body, 'the control lookup is gone').toMatch(/#mjf-q-\$\{first\.id\}`/);
    expect(
      body,
      'focusFirstInvalidIn looks up only the control id, which no grouped question binds — ' +
        'focus silently stays on the Next button for 13 of the 25 types',
    ).toMatch(/#mjf-q-\$\{first\.id\}-question`/);
  });

  it('keeps the one-question renderer on its own always-present fallback', () => {
    // Not the same fix: its card wraps exactly one question, so the card IS the question.
    expect(stripped('form-one-question.component.ts')).toMatch(/\?\?[\s\S]{0,80}mjf-oneq__card/);
  });
});
