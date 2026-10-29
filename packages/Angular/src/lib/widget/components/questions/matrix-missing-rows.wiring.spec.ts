/**
 * Source-text smoke: a required Matrix marks the rows it still needs.
 *
 * WHICH rows are missing is decided by the shared contract (`missingMatrixRows`, specced in
 * forms-entities with the required rule that uses it), so the widget and the server's submit check
 * cannot disagree. What this pins is only that the template still asks it, and only while the
 * question's error is showing — a respondent who has not tried to continue yet is not shown red rows.
 * `FormQuestionComponent` cannot be rendered in this node suite (see aria-idrefs.wiring.spec.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ts = readFileSync(join(__dirname, 'form-question.component.ts'), 'utf8');
const html = readFileSync(join(__dirname, 'form-question.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const css = readFileSync(join(__dirname, 'form-question.component.css'), 'utf8');

describe('matrix rows that still need an answer (source-text smoke)', () => {
  it('derives them from the shared contract, only while an error is shown', () => {
    expect(ts).toMatch(/missingMatrixRows\(/);
    expect(ts).toMatch(/matrixMissing = computed\(\(\) =>\s*this\.errorMessage\(\)/);
  });

  it('marks the row and its radios', () => {
    expect(html).toContain('[class.mjf-matrix__row--missing]="matrixMissing().has(row.value)"');
    expect(html).toContain('[attr.aria-invalid]="matrixMissing().has(row.value) || null"');
  });

  it('styles a missing row with tokens only', () => {
    const rule = css.match(/\.mjf-matrix__row--missing[^{]*\{[^}]*\}/g)?.join('\n') ?? '';
    expect(rule).not.toBe('');
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });
});
