/**
 * Structural guards for the condition editor's source-aware behaviour
 * (plans/RULES_SIMPLIFICATION_PLAN.md Phase 2).
 *
 * The component uses decorated inputs and cannot be instantiated in this suite's node
 * environment, so what is checkable is the source. Comments are stripped before every assertion:
 * the source explains these decisions in prose, and a guard that matches its own documentation
 * proves nothing.
 *
 * The pure decisions themselves — which operators a kind offers, which value editor an operator
 * gets — are tested for real in `condition-sources.spec.ts`. What is left to prove here is that
 * the component ASKS, per source, rather than rendering one fixed menu.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const editor = (): string => stripped('conditional-rule-editor.component.ts');
const editorHtml = (): string => stripped('conditional-rule-editor.component.html');

describe('the operator menu is per-source, not per-form', () => {
  it('the template loops a per-condition operator list, never the whole union', () => {
    // `@for (op of operators; ...)` rendered all twelve against every question — which is how
    // `equals` reached a multi-select, where it can never match.
    const html = editorHtml();
    expect(html).toMatch(/@for \(op of operatorsFor\(cond\); track op\.op\)/);
    expect(html).not.toMatch(/@for \(op of operators;/);
  });

  it('the component derives that list from the source kind', () => {
    expect(editor()).toMatch(/operatorChoicesFor\(/);
  });

  it("hands the row's own operator to the menu, so the select can never render blank", () => {
    // A <select> whose [value] is absent from its <option>s renders EMPTY — the author sees a
    // blank operator box on a rule that reads fine in the database. `operatorChoicesFor` carries
    // the stale entry itself (tested for real in condition-sources.spec.ts); what has to be true
    // HERE is that the component actually hands it the current operator.
    expect(editor()).toMatch(/operatorChoicesFor\(this\.sourceKind\(condition\), condition\.op\)/);
  });
});

describe('changing a source cannot strand the condition on it', () => {
  it('re-picks the operator when the new source does not offer the old one', () => {
    const source = editor();
    expect(source).toMatch(/setQuestion[\s\S]*?operatorOfferedFor\(/);
  });

  it('a new condition starts on an operator its own source offers', () => {
    // Hardcoding 'equals' is the same defect one step earlier: add a condition while the first
    // source is a multi-select and the row opens on an operator that can never fire.
    const source = editor();
    expect(source).toMatch(/addCondition\(\)[\s\S]*?defaultOperatorFor\(/);
    expect(source).not.toMatch(/conditionForSource\(this\.sources\[0\]\?\.id \?\? '', 'equals'/);
  });
});

describe('the value is picked, not typed, wherever the answer set is fixed', () => {
  it('the value editor is chosen from the source kind, not from whether options happen to exist', () => {
    // It used to read `this.optionsFor(condition).length > 0`, so a choice question whose
    // options the author had not written yet fell through to free text.
    const source = editor();
    expect(source).toMatch(/valueEditorKind\(condition\.op, this\.sourceKind\(condition\)\)/);
    expect(source).not.toMatch(/valueEditorKind\(condition\.op, this\.optionsFor/);
  });

  it('a number condition raises a numeric keypad', () => {
    expect(editorHtml()).toMatch(/inputmode/);
    expect(editor()).toMatch(/valueInputMode\(/);
  });

  it('an option question with no options authored yet says so instead of dead-ending', () => {
    // With free text unreachable for a choice source, an unauthored options list would leave
    // only a disabled placeholder and no explanation of what to do about it.
    expect(editorHtml()).toMatch(/needsOptions\(cond\)/);
  });
});
