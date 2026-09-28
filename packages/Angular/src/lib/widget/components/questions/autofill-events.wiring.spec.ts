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
