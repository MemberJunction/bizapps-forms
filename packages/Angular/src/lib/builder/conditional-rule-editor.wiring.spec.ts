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
    // The choice itself now lives in `newCondition`, which reads the source's kind (proven in
    // condition-sources.spec.ts). What must be true HERE is that adding a row goes through it
    // rather than assembling a condition — and an operator — of its own.
    const source = editor();
    expect(source).toMatch(/addCondition\(\)[\s\S]*?newCondition\(/);
    expect(source).not.toMatch(/addCondition\(\)[\s\S]*?op: 'equals'/);
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

  it('every editor kind has an arm to render it', () => {
    // A kind with no @case renders NOTHING — a condition row with an operator, no value box and
    // no explanation. Silent, and the row still saves.
    const html = editorHtml();
    for (const kind of ['select', 'checklist', 'text', 'number', 'date', 'time']) {
      expect(html, kind).toMatch(new RegExp(`@case \\('${kind}'\\)`));
    }
  });

  it('an open number is typed into a number box, not a text box with a keyboard hint', () => {
    // `inputmode` suggests a keypad and accepts letters anyway. `type="number"` is what stops
    // "excellent" being stored as the comparison value for a numeric answer.
    const html = editorHtml();
    expect(html).toMatch(/type="number"/);
    expect(html).toMatch(/type="date"/);
    expect(html).toMatch(/type="time"/);
  });

  it('a value the author picks is stored as the option carries it, not as its spelling', () => {
    // A Rating answers the NUMBER 5. A condition holding the string '5' can never match it, and
    // `notEquals` — its negation — then matches everyone.
    const source = editor();
    expect(source).toMatch(/conditionValueFor\(/);
    expect(source).not.toMatch(/setValue\([\s\S]{0,200}?coerceConditionValue\(c\.op, raw\)/);
  });

  it('an option question with no options authored yet says so instead of dead-ending', () => {
    // With free text unreachable for a choice source, an unauthored options list would leave
    // only a disabled placeholder and no explanation of what to do about it.
    expect(editorHtml()).toMatch(/needsOptions\(cond\)/);
  });
});

describe('a condition naming a source the list no longer carries', () => {
  it('says so in the question picker instead of pointing somewhere else', () => {
    // Two ways to get here: the question was deleted, or it stopped being readable at all —
    // a `Statement` collects no answer and is no longer offered, so a rule written against one
    // before that is now dangling. Either way the select has no option matching the stored id,
    // and a select whose value matches no option falls back to the FIRST one: the row would
    // read "Full name" while storing a rule about something else entirely. Same failure the
    // value picker's "(deleted option)" entry exists to prevent, one control to the left.
    const source = editor();
    expect(source).toMatch(/staleQuestion\(/);
    expect(editorHtml()).toMatch(/staleQuestion\(cond\)/);
  });

  it('does not let the author choose it again', () => {
    expect(editorHtml()).toMatch(/staleQuestion\(cond\); as gone[\s\S]{0,200}?disabled/);
  });
});

describe('a fresh condition opens on the item the rule is about', () => {
  it('the editor is told which item that is', () => {
    // Without it the component can only guess from the list, and the list alone cannot tell a
    // question's own jump ("read MY answer") from a show gate that must read someone else's.
    expect(editor()).toMatch(/@Input\(\) subjectSourceId/);
  });

  it('a new condition is pointed at the subject rather than the top of the form', () => {
    // `this.sources[0]` is the FIRST question of the whole form. On a jump rule for question 12
    // that is never what the author meant, and they had to repoint every row by hand.
    const source = editor();
    expect(source).toMatch(/addCondition\(\)[\s\S]*?defaultConditionSource\(/);
    expect(source).not.toMatch(/addCondition\(\)[\s\S]*?this\.sources\[0\]/);
  });

  it('it refuses to add a row when there is no source to point it at', () => {
    // A condition naming no question is dropped on emit anyway; adding one puts an unfillable
    // row on screen and calls it a rule.
    expect(editor()).toMatch(/addCondition\(\)[\s\S]*?return;[\s\S]*?newCondition\(/);
  });

  it('one builder makes the condition object, so the score sentinel is read in one place', () => {
    const source = editor();
    expect(source).toMatch(/conditionForSource\(/);
    expect(source).not.toMatch(/function conditionForSource/);
  });
});

describe('the condition reads as a sentence on two lines, not three columns', () => {
  const areas = (): string =>
    /grid-template-areas:([\s\S]*?);/.exec(stripped('conditional-rule-editor.component.ts'))?.[1] ?? '';

  it('the question gets a line of its own', () => {
    // Three side-by-side selects truncated the one control whose text is a full sentence — the
    // question prompt — to match two that read as three words.
    const rows = [...areas().matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    expect(rows.length).toBeGreaterThan(0);
    const cells = rows[0].split(/\s+/).filter(Boolean);
    expect(cells.length).toBeGreaterThan(1);
    expect(cells.every((cell) => cell === 'question')).toBe(true);
  });

  it('the operator and the value share the line below it', () => {
    const rows = [...areas().matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[1]).toMatch(/\bop\b/);
    expect(rows[1]).toMatch(/\bvalue\b/);
  });

  it('every control in the row is placed by name, so no cell can land by accident', () => {
    const css = stripped('conditional-rule-editor.component.ts');
    for (const area of ['question', 'op', 'value', 'remove']) {
      expect(css).toMatch(new RegExp(`grid-area: ${area}`));
    }
  });
});

describe('every select shows the value its condition actually holds', () => {
  // Angular compiles `<select [value]>` with `@for` options as: write the select's `value`,
  // THEN create the options. Verified in the built output — `ɵɵproperty("value", …)` precedes
  // `ɵɵrepeater(ctx.sources)`. A `value` written while the list is empty does not stick, and
  // when the options arrive the browser's own "ask for a reset" step selects the FIRST one:
  //
  //   sel.value = 'q7'           -> value "",  selectedIndex -1
  //   append q1, q4, q7          -> value "q1", selectedIndex 0     (confirmed in Chrome)
  //
  // So a rule reading question 7 rendered as question 1, and the author's only clue was that
  // it looked wrong. `[selected]` on the option is what fixes it: it is written during the
  // option's OWN update pass, which cannot run before the option exists.
  const html = (): string => editorHtml();

  it('the question option knows whether it is the one', () => {
    expect(html()).toMatch(/\[selected\]="src\.id === questionSelectValue\(cond\)"/);
  });

  it('the operator option knows whether it is the one', () => {
    expect(html()).toMatch(/\[selected\]="op\.op === cond\.op"/);
  });

  it('the value option knows whether it is the one, placeholder and deleted entry included', () => {
    const source = html();
    // Compared through `isChosen`, not inline: an option's value is `5` or `true` on a scale
    // or boolean source, and `5 === '5'` in a template is false — which blanks the select and
    // loses the author's stored choice on every render. The DOM spelling is the comparable one.
    expect(source).toMatch(/\[selected\]="isChosen\(cond, opt\)"/);
    expect(source).toMatch(/\[value\]="optionValue\(opt\)"/);
    // The disabled placeholder must claim the selection when there is no value, or the reset
    // step skips it (it is disabled) and lands on the first REAL option — showing a value the
    // rule does not hold.
    expect(source).toMatch(/<option value="" disabled \[selected\]="valueAsString\(cond\) === ''"/);
    expect(source).toMatch(/\[selected\]="true"[^>]*>\{\{ stale \}\}|\{\{ stale \}\}[^<]*<\/option>/);
  });
});
