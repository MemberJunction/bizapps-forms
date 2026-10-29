/**
 * Template text only. The person panel lists a person's RESPONSES, so its loading, error and
 * empty states name responses. They said "Loading forms…" and "No forms yet", which reads as the
 * person having no forms. Source-text, because the copy is all there is to assert.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'person-form-responses-list.component.ts'), 'utf8');

describe('the person panel names responses, not forms', () => {
  it('says responses in its loading, error and empty states', () => {
    expect(source).toContain('Loading responses…');
    expect(source).toContain('Responses could not be loaded');
    expect(source).toContain('No responses from this person yet');
  });

  it('never claims the person has no forms', () => {
    expect(source).not.toMatch(/Loading forms…|Forms could not be loaded|No forms yet/);
  });
});
