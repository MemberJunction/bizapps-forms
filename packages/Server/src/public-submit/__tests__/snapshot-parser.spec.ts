import { describe, expect, it } from 'vitest';
import { parsePublishedDefinition } from '../snapshot-parser';
import { makeDefinition } from './fakes';

describe('parsePublishedDefinition', () => {
  it('round-trips a valid snapshot', () => {
    const def = makeDefinition();
    const parsed = parsePublishedDefinition(JSON.stringify(def));
    expect(parsed?.formId).toBe('form-1');
    expect(parsed?.pages[0].questions[0].type).toBe('ShortText');
  });

  it('returns undefined for null/empty input', () => {
    expect(parsePublishedDefinition(null)).toBeUndefined();
    expect(parsePublishedDefinition('')).toBeUndefined();
  });

  it('returns undefined for malformed JSON (fail closed)', () => {
    expect(parsePublishedDefinition('{not json')).toBeUndefined();
  });

  it('returns undefined when a required top-level field is missing', () => {
    expect(parsePublishedDefinition(JSON.stringify({ formId: 'x' }))).toBeUndefined();
  });

  it('rejects an unknown question type', () => {
    const def = makeDefinition();
    const broken = JSON.parse(JSON.stringify(def));
    broken.pages[0].questions[0].type = 'Hologram';
    expect(parsePublishedDefinition(JSON.stringify(broken))).toBeUndefined();
  });
});
