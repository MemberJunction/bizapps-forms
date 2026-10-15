/**
 * The start step a new, unsaved Form record shows — the template half.
 *
 * What it does is executed in `form-builder.verbs.spec.ts` ("a new, unsaved form record"): opening
 * writes nothing, and `createForm` writes the row and loads the builder. This pins only that the
 * template shows the step instead of the builder while `awaitingCreate` holds, and wires its one
 * button and its refusal to the component.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = (): string =>
  readFileSync(join(__dirname, 'form-builder.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

describe('the start step of a new form', () => {
  const step = (): string => {
    const source = html();
    const start = source.indexOf('@if (awaitingCreate)');
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('} @else {', start));
  };

  it('replaces the whole builder, so no builder control can write before the form exists', () => {
    expect(html().trimStart().startsWith('@if (awaitingCreate)')).toBe(true);
    expect(html()).toMatch(/\}\s*@else\s*\{\s*<div class="fb">/);
  });

  it('creates the form with the typed name from its one button', () => {
    expect(step()).toMatch(/#newFormName/);
    expect(step()).toMatch(/\(click\)="createForm\(newFormName\.value\)"/);
    expect(step()).toMatch(/\(keydown\.enter\)="createForm\(newFormName\.value\)"/);
    expect(step()).toMatch(/\[disabled\]="busy"/);
  });

  it('says why a create was refused', () => {
    expect(step()).toMatch(/@if \(createError\)\s*\{\s*<p[^>]*role="alert"[^>]*>\{\{ createError \}\}<\/p>/);
  });
});
