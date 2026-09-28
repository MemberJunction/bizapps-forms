/**
 * Structural guard for #268: an autofilled value must reach the runtime.
 *
 * iOS Safari fills a contact card into fields that are NOT focused, and WebKit dispatches only
 * `change` for those (TextFieldInputType::setValue, DispatchChangeEvent + !focused). A control
 * bound only to `(input)` shows the value and never tells the runtime, so required validation
 * fails on a field the respondent can see is filled.
 *
 * The component cannot be instantiated in this node suite, so the template is what is checked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const template = (): string =>
  readFileSync(join(__dirname, 'form-question.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

/** Every opening tag (from `<name` to the first `>` that ends it) that binds `(input)`. */
const tagsBindingInput = (): string[] =>
  (template().match(/<(input|textarea)\b[^>]*>/g) ?? []).filter((tag) => tag.includes('(input)='));

describe('autofilled text reaches the form (#268)', () => {
  it('finds the text-style controls it is guarding', () => {
    // LongText, Number, the default text input, and the composite part input.
    expect(tagsBindingInput().length).toBeGreaterThanOrEqual(4);
  });

  it('binds (change) to the same handler on every control that binds (input)', () => {
    for (const tag of tagsBindingInput()) {
      const onInput = /\(input\)="([^"]+)"/.exec(tag)?.[1];
      const onChange = /\(change\)="([^"]+)"/.exec(tag)?.[1];
      expect(onChange, tag).toBe(onInput);
    }
  });
});

const source = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

/** The body of `name(...) {` up to the next method at the same indent — enough for ordering checks. */
const methodBody = (file: string, name: string): string => {
  const src = source(file);
  const start = src.search(new RegExp(`\\n  (protected |private |public )?${name}\\(`));
  expect(start, `${file} declares ${name}`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const end = rest.search(/\n  (protected |private |public )?[A-Za-z]+\(/);
  return end === -1 ? rest : rest.slice(0, end);
};

describe('Next and Submit judge what the respondent can see (#268)', () => {
  it('the question exposes a command that re-reads its own controls', () => {
    expect(source('form-question.component.ts')).toMatch(/\n  syncFromDom\(\): void \{/);
  });

  it.each([
    ['../form-scroll.component.ts', 'onNext', /touchAll|areValid/],
    ['../form-scroll.component.ts', 'onSubmit', /touchAll|areValid/],
    ['../form-one-question.component.ts', 'onNext', /markTouched|errorFor/],
  ])('%s %s commits visible values before validating', (file, method, validation) => {
    const body = methodBody(file, method);
    const commit = body.indexOf('this.commitVisibleValues()');
    expect(commit, body).toBeGreaterThan(-1);
    expect(commit).toBeLessThan(body.search(validation));
  });
});
