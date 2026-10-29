/**
 * Source-text smoke: the builder's deletes go through the undo hold (UI audit F07).
 *
 * The behaviour — held, written before anything that needs it, never written when undone, put back
 * when refused, no deadlock — is specced against the real service in
 * builder-state.held-delete.spec.ts and pending-delete.spec.ts. The builder component cannot be
 * compiled in this suite, so what is checkable here is that each delete handler still asks for the
 * hold, that the browser's confirm() is gone, and that the toast and the teardown are wired.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ts = readFileSync(join(__dirname, 'form-builder.component.ts'), 'utf8');
const html = readFileSync(join(__dirname, 'form-builder.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const editor = readFileSync(join(__dirname, 'question-editor.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

function body(name: string): string {
  const start = ts.indexOf(`protected async ${name}(`) >= 0 ? ts.indexOf(`protected async ${name}(`) : ts.indexOf(`protected ${name}(`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  return ts.slice(start, ts.indexOf('\n  }\n', start));
}

describe('builder deletes can be undone (source-text smoke)', () => {
  it.each(['deleteQuestion', 'deleteScreen', 'deletePage', 'onRemoveOption'])('%s holds the delete instead of writing it', (name) => {
    expect(body(name)).toContain('this.holdDelete(');
  });

  it('no longer asks through the browser confirm box', () => {
    expect(ts).not.toMatch(/[^.\w]confirm\(/);
  });

  it('renders the toast for the held delete, re-created per delete', () => {
    expect(html).toMatch(/@for \(held of heldToasts\(\); track held\)\s*\{\s*<mjf-undo-toast \[Label\]="held\.label" \(Undo\)="undoDelete\(\)"/);
  });

  it('writes the held delete when the builder goes away', () => {
    expect(ts).toMatch(/ngOnDestroy\(\): void \{[\s\S]*?void this\.state\.releaseHeldDelete\(\)/);
  });

  it('writes the held delete before re-reading the tree', () => {
    expect(ts).toMatch(/private async loadBuilder\(\): Promise<void> \{[\s\S]*?await this\.state\.releaseHeldDelete\(\);[\s\S]*?this\.state\.loadTree\(/);
  });

  // Review of PR #350. These pin wiring only; the ordering they protect is specced against the
  // real service in builder-state.held-delete.spec.ts ("a second delete while one is held").
  it.each(['deleteQuestion', 'deleteScreen', 'deletePage', 'onRemoveOption'])(
    '%s takes the item out of the tree inside the hold, after the held delete is written',
    (name) => {
      const b = body(name);
      const handoff = b.indexOf('this.holdDelete(');
      expect(b.slice(0, handoff)).not.toMatch(/\.(questions|screens|pages|options) = /);
      expect(b.slice(handoff)).toMatch(/\.(questions|screens|pages|options) = /);
    },
  );

  it('marks the form changed when the item leaves the canvas and when Undo brings it back', () => {
    const wrapper = ts.slice(ts.indexOf('private async holdDelete('), ts.indexOf('\n  }\n', ts.indexOf('private async holdDelete(')));
    expect(wrapper).toMatch(/taken\.restore\(\);\s*this\.markDirty\(\);/);
    expect(wrapper).toMatch(/if \(held\) \{\s*this\.markDirty\(\);/);
  });

  it('writes the held delete before building the preview', () => {
    expect(ts).toMatch(/protected async openPreview\(\): Promise<void> \{[\s\S]*?await this\.state\.releaseHeldDelete\(\);[\s\S]*?tryBuildPublishedDefinition\(/);
  });

  it('names the option a remove button removes', () => {
    expect(editor).not.toMatch(/aria-label="Remove (option|row|column)"/);
    for (const kind of ['row', 'column', 'option']) {
      expect(editor).toContain(`[attr.aria-label]="'Remove ${kind} ' + optionName(opt)"`);
    }
  });

  it.each(['deleteQuestion', 'deletePage'])('%s asks whether respondents answered it before holding the delete', (name) => {
    const b = body(name);
    expect(b).toContain('await this.deletable(');
    expect(b.indexOf('this.deletable(')).toBeLessThan(b.indexOf('this.holdDelete('));
    const check = ts.slice(ts.indexOf('private async deletable('), ts.indexOf('\n  }\n', ts.indexOf('private async deletable(')));
    expect(check).toContain('await this.state.answerCount(');
    expect(check).toContain('answeredRefusal(');
    expect(check).toContain('this.state.showRefusal(');
  });
});

describe('the undo toast follows the theme (source-text smoke)', () => {
  const toast = readFileSync(join(__dirname, 'undo-toast.component.ts'), 'utf8');
  const rule = toast.match(/\.ut \{[^}]*\}/)?.[0] ?? '';

  it('is a raised surface in the page\'s own colours, not an inverted block', () => {
    expect(rule).toContain('background: var(--mj-bg-surface-elevated)');
    expect(rule).toContain('color: var(--mj-text-primary)');
    expect(rule).not.toContain('background: var(--mj-text-primary)');
  });
});

