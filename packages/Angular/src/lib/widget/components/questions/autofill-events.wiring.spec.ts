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

/**
 * Fix-round-1 finding #1: `onComposite(field, raw)` used to merge ONE freshly-changed field onto
 * `compositeValue()` — a snapshot of the `value` INPUT that only refreshes on the next
 * change-detection pass. This component is zoneless, so nothing schedules one between two DOM
 * events firing in the same task, and iOS AutoFill fills several ContactInfo/Address parts in
 * exactly that shape: each fired `change` merged its own field onto the SAME stale snapshot, so
 * only the last part to fire survived. `readCompositeParts` (control-answer.spec.ts) proves the
 * read-every-field algorithm is correct; these specs prove the component actually calls it from
 * both places that used to disagree, through one shared command.
 */
describe('a composite part change merges every part from the DOM, not a stale value (#268)', () => {
  it('the composite part input calls the same DOM-merge command for both events, not a per-field one', () => {
    const tag = tagsBindingInput().find((t) => t.includes("inputId() + '-' + field"));
    expect(tag, template()).toBeDefined();
    expect(tag).toMatch(/\(input\)="syncComposite\(\)"/);
    expect(tag).toMatch(/\(change\)="syncComposite\(\)"/);
  });

  it('syncFromDom delegates its composite branch to the same command', () => {
    const body = methodBody('form-question.component.ts', 'syncFromDom');
    expect(body).toMatch(/this\.syncComposite\(\)/);
  });

  it('the shared command reads every field through readCompositeParts, not a value() spread per field', () => {
    const body = methodBody('form-question.component.ts', 'syncComposite');
    expect(body).toMatch(/readCompositeParts\(/);
    // The exact bug shape: one field spread onto the rest of a stale compositeValue().
    expect(body).not.toMatch(/\.\.\.this\.compositeValue\(\),\s*\[field\]/);
  });

  it('onComposite no longer exists as a per-field merge handler', () => {
    expect(source('form-question.component.ts')).not.toMatch(/\n {2}protected onComposite\(/);
  });
});
