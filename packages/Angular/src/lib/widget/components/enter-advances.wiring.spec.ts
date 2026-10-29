/**
 * SOURCE-TEXT CHECK that the one-question card asks `advancesOnEnter` before treating Enter as
 * "next". It asserts the call is present, not how it behaves — `enter-advances.spec.ts` holds the
 * behaviour. `FormOneQuestionComponent` uses signal inputs, which this node suite cannot render.
 *
 * The defect (UI audit F03): the old guard was `tagName !== 'TEXTAREA'`, so Enter on Back advanced
 * and, on the last question, submitted.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'form-one-question.component.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

function bodyOf(method: string): string {
  const start = source.indexOf(`${method}(`);
  expect(start, `no ${method} in the component`).toBeGreaterThan(-1);
  const open = source.indexOf('{', start);
  let depth = 1;
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unbalanced braces in ${method}`);
}

describe('one-question Enter handling (source-text check)', () => {
  it('onKeydown advances only when advancesOnEnter allows it', () => {
    expect(bodyOf('onKeydown')).toContain('advancesOnEnter(');
  });

  it('ignores the Enter that confirms an IME composition (final review #5)', () => {
    // Safari, iOS included, reports key === 'Enter' with isComposing while a Japanese or Chinese
    // respondent confirms a word; advancing then would cut them off mid-word.
    expect(bodyOf('onKeydown')).toContain('event.isComposing');
  });

  it('no longer uses the textarea-only guard that let Enter on Back submit', () => {
    expect(source).not.toContain("tagName !== 'TEXTAREA'");
  });
});
