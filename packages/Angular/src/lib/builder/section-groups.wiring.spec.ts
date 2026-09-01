/**
 * That both rule pickers actually RENDER grouped, and that the sections reach them.
 *
 * `section-groups.spec.ts` proves the grouping. This proves it is plugged in — the half that was
 * missing before, since `groupedJumpTargets` already existed and the condition picker simply
 * never called anything like it.
 *
 * The chain is prop-drilling, three hops deep, because that is how every other list these
 * editors need already travels: form-builder owns the tree, the item editors receive what their
 * item may reference, and the panel hands it to the dialog. A `sections` input that stops
 * anywhere along it leaves a picker silently ungrouped — which looks exactly like the defect
 * being fixed — so each hop is checked.
 *
 * Source-reading for the same reason as its neighbours: these components use `inject()` and
 * cannot be instantiated in a node environment.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

/** The `<tag …>` element with all its bindings, from a template or an inline template string. */
function element(source: string, tag: string): string {
  const open = source.indexOf(`<${tag}`);
  expect(open).toBeGreaterThan(-1);
  return source.slice(open, source.indexOf('>', open) + 1);
}

describe('the sections reach both rule pickers', () => {
  it('builds them from the tree, once, where the tree lives', () => {
    // The builder is the only thing here that HAS the form. Each editor deriving its own would
    // be three chances to disagree about what a section is called or what it owns.
    //
    // Named `formSections`, not `sections`: MJ's `BaseFormComponent` — which this component
    // extends — already declares a `sections` PROPERTY, and TypeScript refuses to let an
    // accessor override one (TS2611). Only `ngc` sees that; no unit test can.
    const builder = stripped('form-builder.component.ts');
    expect(builder).toMatch(/get formSections\(\): FormSection\[\]/);
  });

  it.each([
    ['question-editor.component.html', 'question-editor.component.ts'],
    ['page-editor.component.ts', 'page-editor.component.ts'],
    ['screen-editor.component.ts', 'screen-editor.component.ts'],
  ])('hands them from %s to the rules panel', (templateFile, classFile) => {
    expect(element(stripped(templateFile), 'mjf-rules-panel')).toMatch(/\[sections\]="sections"/);
    expect(stripped(classFile)).toMatch(/@Input\(\)\s+sections/);
  });

  it('hands them from the panel to the logic dialog', () => {
    expect(element(stripped('rules-panel.component.html'), 'mjf-logic-editor')).toMatch(
      /\[sections\]="sections"/,
    );
    expect(stripped('rules-panel.component.ts')).toMatch(/@Input\(\)\s+sections/);
  });

  it('hands them from the logic dialog to the condition editor', () => {
    const logic = stripped('logic-editor.component.ts');
    expect(element(logic, 'mjf-conditional-rule-editor')).toMatch(/\[sections\]="sections"/);
    expect(logic).toMatch(/@Input\(\)\s+sections/);
  });
});

describe('neither picker renders a flat list any more', () => {
  it('groups the destinations by section', () => {
    expect(stripped('logic-editor.component.ts')).toMatch(/groupedJumpTargets\(this\.targets,\s*this\.sections\)/);
  });

  it('groups the condition sources by section', () => {
    const editor = stripped('conditional-rule-editor.component.ts');
    expect(editor).toMatch(/groupedConditionSources\(this\.sources,\s*this\.sections\)/);
  });

  it('renders the condition questions inside optgroups, not as a bare list', () => {
    // The defect in its most literal form: `@for (src of sources)` straight into <option>, with
    // no heading anywhere, on a picker spanning every section of the form.
    const html = stripped('conditional-rule-editor.component.html');
    expect(html).toMatch(/<optgroup/);
    expect(html).not.toMatch(/@for \(src of sources; track src\.id\)/);
  });

  it('still marks the stored question selected, now that the options moved into groups', () => {
    // Angular writes the select's [value] BEFORE the options exist, so it does not stick and the
    // browser selects the first option on its own — a rule reading question 7 rendered as
    // question 1. The per-option [selected] is what makes the binding true, and moving options
    // into optgroups is exactly the kind of edit that drops it.
    const html = stripped('conditional-rule-editor.component.html');
    expect(html).toMatch(/\[selected\]="src\.id === questionSelectValue\(cond\)"/);
  });
});
