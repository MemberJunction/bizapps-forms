/**
 * The Forms home list and Responses & Analytics must agree on what "a response" is.
 *
 * `responseCountMap` counts whatever rows it is handed, so the definition lives entirely in
 * the QUERY — which is why this guards the service's view spec rather than the pure helper.
 * The two surfaces disagreed on live data: the same form read "43 responses" on the home
 * list and "32 responses" on the analytics rail, because only one of them excluded partial
 * (in-progress) autosaves. Two numbers for one fact sends the reader hunting for the missing
 * eleven, and the reporting side's reading is the documented one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

describe('the home list counts submitted responses only', () => {
  it('counts through the shared Complete-only counter', () => {
    expect(source('forms-home.service.ts')).toMatch(/loadCompleteResponseCounts\(/);
  });

  it('uses the same predicate the reporting dashboard uses', () => {
    const reporting = source('../dashboard/services/forms-reporting.service.ts');
    const shared = source('../shared/complete-response-counts.ts');
    const predicate = /ExtraFilter: `Status='Complete'`/;
    expect(reporting).toMatch(predicate);
    expect(shared).toMatch(predicate);
  });
});
