/**
 * SOURCE-TEXT CHECK of the question template's labelling (UI audit F11). It asserts markup is
 * present, not how it behaves — `FormQuestionComponent` uses signal inputs, which this node suite
 * cannot render; the live smoke runs axe on every question type. `question-shape.spec.ts` holds
 * the classification itself.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const template = readFileSync(join(__dirname, 'form-question.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

/** The body of `@case ('type') { … }`. */
function caseBody(type: string): string {
  const open = template.indexOf(`@case ('${type}') {`);
  expect(open, `no @case ('${type}')`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = template.indexOf('{', open); i < template.length; i++) {
    if (template[i] === '{') depth++;
    else if (template[i] === '}' && --depth === 0) return template.slice(open, i);
  }
  throw new Error(`unbalanced @case ('${type}')`);
}

/** The shared composite template. */
const composite = (): string => {
  const start = template.indexOf('<ng-template #compositeControl>');
  expect(start).toBeGreaterThan(-1);
  return template.slice(start, template.indexOf('</ng-template>', start));
};

describe('question labelling follows its shape (source-text check)', () => {
  it('the question header is a <label for> only for a single control', () => {
    const header = template.indexOf('<label class="mjf-question__label"');
    expect(header).toBeGreaterThan(-1);
    expect(template.indexOf('<label class="mjf-question__label"', header + 1), 'a second <label> header').toBe(-1);
    const guard = template.lastIndexOf('@if', header);
    expect(template.slice(guard, header)).toContain("shape() === 'control'");
  });

  it.each(['SingleChoice', 'Rating', 'NPS', 'YesNo', 'PictureChoice', 'OpinionScale', 'Legal'])(
    'the %s radio group says whether it is required',
    (type) => {
      expect(caseBody(type)).toMatch(/role="radiogroup"[^>]*\[attr\.aria-required\]="q\.isRequired"/);
    },
  );

  it('the ranking list is named by the question', () => {
    expect(caseBody('Ranking')).toMatch(/<ol[^>]*\[attr\.aria-labelledby\]="labelId\(\)"/);
  });

  it('each matrix row is a native radio group, and the table is named by the question', () => {
    const matrix = caseBody('Matrix');
    expect(matrix).toMatch(/<table[^>]*\[attr\.aria-labelledby\]="labelId\(\)"/);
    expect(matrix).toContain('type="radio"');
    expect(matrix).toContain('[name]="matrixName(row.value)"');
    expect(matrix).not.toContain('role="radio"');
  });

  it('address and contact fields sit in a fieldset whose legend is the question', () => {
    const body = composite();
    expect(body).toContain('<fieldset');
    expect(body).toMatch(/<legend[^>]*\[id\]="labelId\(\)">\s*<ng-container \*ngTemplateOutlet="questionHeading"/);
  });

  it('each address field keeps the help text in its description, valid or not', () => {
    expect(composite()).toContain('[attr.aria-describedby]="compositeDescribedBy(field)"');
  });

  it("each address field's description comes from compositeFieldDescribedBy, including the question error", () => {
    const component = readFileSync(join(__dirname, 'form-question.component.ts'), 'utf8');
    const at = component.indexOf('protected compositeDescribedBy(');
    const body = component.slice(at, component.indexOf('\n  }\n', at));
    expect(body).toContain('compositeFieldDescribedBy(');
    expect(body).toContain('this.errorId()');
  });
});
