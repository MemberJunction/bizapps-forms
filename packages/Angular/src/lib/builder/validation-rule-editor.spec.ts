/**
 * The validation-rule editor, driven the way its template drives it.
 *
 * Unusual for this suite, which normally tests pure modules and reads component SOURCE for the
 * wiring: this component has no constructor injection and no template to compile at runtime, so
 * the real class runs here and the assertions are about what it actually emits. That matters for
 * issue #80, which is entirely about an emission that should not happen — a source-level guard
 * would prove the guard exists, not that the pair never gets out.
 *
 * `@angular/compiler` is imported for its side effect only: `@angular/common` partially compiles
 * its own injectables and needs the JIT compiler present to finish them at import time.
 */
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { mjBizAppsFormsFormQuestionEntity, ValidationRule } from '@mj-biz-apps/forms-entities';
import type { QuestionNode } from './builder-models';
import { QuestionEditorComponent } from './question-editor.component';
import { ValidationRuleEditorComponent } from './validation-rule-editor.component';

/**
 * The template's entry points. They are `protected` so nothing but the template calls them in
 * production; element access is TypeScript's sanctioned way to reach them from a test, and it is
 * the same interface the author drives — typing in a box and blurring it.
 */
const typeInto = (
  editor: ValidationRuleEditorComponent,
  field: 'minLength' | 'maxLength' | 'min' | 'max',
  raw: string,
): void => editor['setNumber'](field, raw);

const conflictOf = (editor: ValidationRuleEditorComponent): string | null => editor['conflict'];

/** An editor for one question type, holding the rule already stored on that question. */
const editorFor = (
  questionType: ValidationRuleEditorComponent['questionType'],
  rule: ValidationRule | undefined,
): { editor: ValidationRuleEditorComponent; emitted: (ValidationRule | undefined)[] } => {
  const editor = new ValidationRuleEditorComponent();
  editor.questionType = questionType;
  editor.rule = rule;
  const emitted: (ValidationRule | undefined)[] = [];
  editor.ruleChange.subscribe((next: ValidationRule | undefined) => emitted.push(next));
  return { editor, emitted };
};

describe('a range no answer could satisfy is refused where it is authored', () => {
  let editor: ValidationRuleEditorComponent;
  let emitted: (ValidationRule | undefined)[];

  beforeEach(() => {
    ({ editor, emitted } = editorFor('Number', { min: 500 }));
  });

  it('does not emit a maximum that sits below the minimum already set', () => {
    // Issue #80, exactly: min 500 then max 120 was accepted and shipped, and the widget then told
    // the respondent "Must be at least 500." for 100 and "Must be at most 120." for 500.
    typeInto(editor, 'max', '120');

    expect(emitted).toEqual([]);
  });

  it('says so, naming both numbers', () => {
    typeInto(editor, 'max', '120');

    expect(conflictOf(editor)).toBe(
      'Minimum (500) is above maximum (120), so no answer can satisfy this range.',
    );
  });

  it('refuses the same pair typed in the other order', () => {
    const other = editorFor('Number', { max: 120 });

    typeInto(other.editor, 'min', '500');

    expect(other.emitted).toEqual([]);
    expect(conflictOf(other.editor)).toContain('Minimum (500) is above maximum (120)');
  });

  it('keeps what was typed on screen, so the author can see the pair they must reconcile', () => {
    // The refused bound is held, not discarded: an editor that dropped it would show an empty box
    // beside a complaint about a number that is no longer anywhere.
    typeInto(editor, 'max', '120');

    typeInto(editor, 'min', '100');

    expect(emitted).toEqual([{ min: 100, max: 120 }]);
    expect(conflictOf(editor)).toBeNull();
  });

  it('lets the author out of it by clearing either bound', () => {
    // The one escape that always exists, and the reason an inherited contradiction is not a trap:
    // an open-ended range is valid, so emptying a box is never itself refused.
    const inherited = editorFor('Number', { min: 500, max: 120 });

    typeInto(inherited.editor, 'max', '');

    expect(inherited.emitted).toEqual([{ min: 500 }]);
  });

  it('accepts equal bounds — "exactly 5" is a rule authors write on purpose', () => {
    const exact = editorFor('Number', { min: 5 });

    typeInto(exact.editor, 'max', '5');

    expect(exact.emitted).toEqual([{ min: 5, max: 5 }]);
    expect(conflictOf(exact.editor)).toBeNull();
  });

  it('compares the bounds as numbers, not as text', () => {
    // '9' > '120' as strings, and 9 < 120 as numbers. A rating scored 9 out of 120 is fine.
    const rating = editorFor('Rating', { min: 9 });

    typeInto(rating.editor, 'max', '120');

    expect(rating.emitted).toEqual([{ min: 9, max: 120 }]);
  });

  it('holds for fractional and negative bounds too', () => {
    const fractional = editorFor('Number', { min: 1.5 });
    typeInto(fractional.editor, 'max', '1.25');
    expect(fractional.emitted).toEqual([]);

    const negative = editorFor('Number', { min: -1 });
    typeInto(negative.editor, 'max', '-5');
    expect(negative.emitted).toEqual([]);
  });

  it('leaves the other constraints alone', () => {
    const text = editorFor('ShortText', { pattern: '^A' });

    typeInto(text.editor, 'minLength', '3');

    expect(text.emitted).toEqual([{ pattern: '^A', minLength: 3 }]);
  });
});

describe('the same invariant on a text answer, which fails the same way', () => {
  it('refuses a maximum length below the minimum length', () => {
    // minLength/maxLength run through the same sequential validators as min/max, so 10..5 rejects
    // every possible answer just as 500..120 does. The issue reports the number pair because that
    // is the one that was tried.
    const { editor, emitted } = editorFor('LongText', { minLength: 10 });

    typeInto(editor, 'maxLength', '5');

    expect(emitted).toEqual([]);
    expect(conflictOf(editor)).toBe(
      'Minimum (10) is above maximum (5), so no answer can satisfy this range.',
    );
  });

  it('refuses an unrelated edit while the pair stands, rather than shipping it alongside', () => {
    // minLength, maxLength and pattern all live on one ShortText question, and every edit emits
    // the WHOLE rule. Letting a pattern through would carry the impossible pair out with it.
    const { editor, emitted } = editorFor('ShortText', { minLength: 10 });
    typeInto(editor, 'maxLength', '5');

    editor['setPattern']('^A');

    expect(emitted).toEqual([]);
    expect(conflictOf(editor)).not.toBeNull();
  });
});

describe('a contradiction the author inherited rather than typed', () => {
  it('states itself the moment the question is opened', () => {
    // Forms authored before this check existed, or written by mj-sync metadata or the AI builder,
    // are surfaced rather than left looking correct: the message is derived from the rule, not
    // recorded when an edit is refused.
    const { editor } = editorFor('Number', { min: 500, max: 120 });

    expect(conflictOf(editor)).toContain('no answer can satisfy this range');
  });

  it('is not claimed about a pair whose controls this question type does not show', () => {
    // A stored length pair on a Number question has no boxes on screen. Reporting it would be a
    // complaint about a control the author cannot reach, and blocking every edit on it would lock
    // them out of the range they CAN fix.
    const { editor, emitted } = editorFor('Number', { minLength: 10, maxLength: 5 });

    typeInto(editor, 'max', '120');

    expect(conflictOf(editor)).toBeNull();
    expect(emitted).toEqual([{ minLength: 10, maxLength: 5, max: 120 }]);
  });

  it('ignores a bound that is not a number at all', () => {
    // ValidationRule is parsed out of an unconstrained nvarchar(MAX) column. Both validators
    // compare with < and >, which a null fails, so the bound is inert rather than contradictory.
    const { editor, emitted } = editorFor('Number', JSON.parse('{"min":null}') as ValidationRule);

    typeInto(editor, 'max', '120');

    expect(conflictOf(editor)).toBeNull();
    expect(emitted).toEqual([{ min: null, max: 120 }]);
  });
});

/**
 * The other half of the refusal: the host must not take back what the editor is holding.
 *
 * `[rule]="validationRule"` is re-evaluated on every change-detection pass, and an `@Input`
 * setter fires whenever the bound expression is a new object. A getter that parsed the stored
 * JSON on every call therefore handed the editor a fresh object each pass and reset it — which
 * was invisible while the editor emitted everything it was given, and erases the number the
 * author is being asked to fix the moment it legitimately withholds one.
 */
describe('the rule the host hands down', () => {
  const nodeWith = (stored: string | null): QuestionNode => ({
    entity: { ValidationRule: stored } as unknown as mjBizAppsFormsFormQuestionEntity,
    options: [],
  });

  const ruleFrom = (host: QuestionEditorComponent): ValidationRule | undefined =>
    host['validationRule'];

  it('is the same object while the stored rule is unchanged', () => {
    const host = new QuestionEditorComponent();
    host.node = nodeWith('{"min":500}');

    expect(ruleFrom(host)).toBe(ruleFrom(host));
  });

  it('is a new object once the stored rule changes', () => {
    const host = new QuestionEditorComponent();
    host.node = nodeWith('{"min":500}');
    const before = ruleFrom(host);

    host.node = nodeWith('{"min":100,"max":120}');

    expect(ruleFrom(host)).not.toBe(before);
    expect(ruleFrom(host)).toEqual({ min: 100, max: 120 });
  });

  it('is a new object when a different question happens to store the same rule', () => {
    // Otherwise one question's unemitted contradiction follows the author to the next question,
    // which would show a complaint about a maximum that question does not have.
    const host = new QuestionEditorComponent();
    host.node = nodeWith('{"min":500}');
    const before = ruleFrom(host);

    host.node = nodeWith('{"min":500}');

    expect(ruleFrom(host)).not.toBe(before);
  });

  it('is absent when nothing is selected', () => {
    expect(ruleFrom(new QuestionEditorComponent())).toBeUndefined();
  });
});

/**
 * The template, read as source — the one part of this component the node environment cannot run.
 * A refusal the author is never shown is indistinguishable from the box quietly not working, so
 * the message reaching the screen is worth asserting even at this remove.
 */
describe('the conflict on screen', () => {
  const template = readFileSync(join(__dirname, 'validation-rule-editor.component.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');

  it('renders the message the component derives, not a restatement of it', () => {
    expect(template).toMatch(/@if \(conflict\) \{/);
    expect(template).toContain('{{ conflict }}');
  });

  it('says the rule is being withheld, so the refusal is not silent', () => {
    expect(template).toContain('Answer validation is not saved until this is fixed.');
  });

  it('marks both bounds of every pair invalid for a screen reader', () => {
    expect(template.match(/\[attr\.aria-invalid\]="conflict \? 'true' : null"/g)).toHaveLength(4);
  });
});
