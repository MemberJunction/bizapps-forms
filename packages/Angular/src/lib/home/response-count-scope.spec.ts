/**
 * The Forms home list and Responses & Analytics must agree on what "a response" is.
 *
 * They once disagreed on live data — the same form read "43 responses" on the home list and
 * "32" on the analytics rail, because only one excluded partial (in-progress) autosaves. Later
 * both tallied downloaded rows, which the 1000-row view cap silently truncated (#247). Both now
 * count through `loadCompleteResponseCounts`, so the definition lives in one place.
 *
 * Source-text checks: they assert the wiring exists, not how it behaves. The behaviour is
 * covered by `complete-response-counts.spec.ts` and the two services' own specs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

const SERVICES = {
  home: 'forms-home.service.ts',
  reporting: '../dashboard/services/forms-reporting.service.ts',
} as const;

describe('both surfaces count responses the same way', () => {
  it.each(Object.entries(SERVICES))('%s counts through the shared counter', (_, file) => {
    const text = source(file);
    expect(text).toMatch(
      /import \{ loadCompleteResponseCounts \} from '(\.\.\/)+shared\/complete-response-counts';/,
    );
    expect(text).toMatch(/loadCompleteResponseCounts\(/);
  });

  it.each(Object.entries(SERVICES))('%s no longer queries response rows itself', (_, file) => {
    const text = source(file);
    expect(text).not.toMatch(/FORMS_ENTITY\.FormResponse\b|HOME_ENTITY\.responses/);
    expect(text).not.toMatch(/Form Responses/);
  });

  it('the shared counter holds the Complete-only predicate', () => {
    expect(source('../shared/complete-response-counts.ts')).toMatch(
      /ExtraFilter: `Status='Complete'`/,
    );
  });
});
