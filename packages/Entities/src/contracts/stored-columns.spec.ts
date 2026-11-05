import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FORM_SETTINGS,
  buildStyleTokens,
  parseQuestionSettings,
  parseStyleTokens,
  readStoredConditionalRule,
  readStoredFormSettings,
  readStoredValidationRule,
} from './stored-columns';

/**
 * The readers that replaced the builder's tolerant `parseConditionalRule` / `parseValidationRule` /
 * `parseFormSettings` (#303). Those cast any JSON object through as a valid value; these validate
 * with the zod schemas and REPORT a bad column rather than throwing or defaulting, so each caller
 * decides — publish refuses, the badge reports, an editor shows no rule.
 */
describe('readStoredConditionalRule', () => {
  it('reads an empty column as no rule', () => {
    for (const raw of [null, undefined, '', '   ']) {
      expect(readStoredConditionalRule(raw)).toEqual({ ok: true, value: undefined });
    }
  });

  it('reads a valid rule', () => {
    const raw = '{"show":{"all":[{"questionId":"q1","op":"equals","value":"Other"}]}}';
    expect(readStoredConditionalRule(raw)).toEqual({
      ok: true,
      value: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] } },
    });
  });

  it('normalises a legacy page-only jump, as every other reader of a rule does', () => {
    const read = readStoredConditionalRule('{"jump":[{"when":{"all":[{"questionId":"q","op":"isAnswered"}]},"toPageId":"p2"}]}');
    expect(read.ok && read.value?.jump?.[0].target).toEqual({ kind: 'page', id: 'p2' });
  });

  it('reports a rule the schema rejects, with the path to the bad field', () => {
    const read = readStoredConditionalRule('{"show":{"all":[{"questionId":"q1","op":"bogus"}]}}');
    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason).toMatch(/^show\.all\.0\.op: /);
  });

  it('reports text that is not JSON, and JSON that is not an object', () => {
    const notJson = readStoredConditionalRule('not json');
    expect(!notJson.ok && notJson.reason).toMatch(/^not valid JSON/);
    expect(readStoredConditionalRule('[1,2]')).toEqual({ ok: false, reason: 'not a JSON object' });
    expect(readStoredConditionalRule('"show"')).toEqual({ ok: false, reason: 'not a JSON object' });
  });
});

describe('readStoredValidationRule', () => {
  it('reads a valid rule and reports a mistyped one', () => {
    expect(readStoredValidationRule('{"minLength":2,"pattern":"^a+$"}')).toEqual({
      ok: true,
      value: { minLength: 2, pattern: '^a+$' },
    });
    const bad = readStoredValidationRule('{"minLength":"two"}');
    expect(!bad.ok && bad.reason).toMatch(/^minLength: /);
  });
});

describe('readStoredFormSettings', () => {
  it('reads a never-written column as the defaults', () => {
    expect(readStoredFormSettings(null)).toEqual({ ok: true, value: { ...DEFAULT_FORM_SETTINGS } });
  });

  it('lays a stored object over the defaults, so a row written before a field existed still reads', () => {
    expect(readStoredFormSettings('{"quota":5}')).toEqual({
      ok: true,
      value: { anonymousAllowed: true, captchaRequired: false, quota: 5 },
    });
  });

  it('keeps every setting it is given', () => {
    const stored = {
      anonymousAllowed: false,
      captchaRequired: true,
      quota: 100,
      opensAt: '2026-01-01T00:00:00Z',
      closesAt: '2026-12-31T00:00:00Z',
      confirmationMessage: 'Thanks!',
      redirectUrl: 'https://example.test/done',
      onSubmitMode: 'Configured',
    };
    expect(readStoredFormSettings(JSON.stringify(stored))).toEqual({ ok: true, value: stored });
  });

  it('degrades an unrecognised on-submit mode to absent rather than failing the settings', () => {
    for (const bad of ['configured', 'Legcy', '', 'null']) {
      const read = readStoredFormSettings(JSON.stringify({ onSubmitMode: bad }));
      expect(read.ok && read.value.onSubmitMode).toBeUndefined();
    }
  });

  it('reports a setting of the wrong type', () => {
    const read = readStoredFormSettings('{"captchaRequired":"yes"}');
    expect(!read.ok && read.reason).toMatch(/^captchaRequired: /);
  });
});

describe('parseQuestionSettings', () => {
  it('reads an object, and anything else as no settings', () => {
    expect(parseQuestionSettings('{"scaleMax":5,"npsLabels":["low","high"]}')).toEqual({ scaleMax: 5, npsLabels: ['low', 'high'] });
    expect(parseQuestionSettings(null)).toEqual({});
    expect(parseQuestionSettings('not json')).toEqual({});
  });
});

describe('style tokens', () => {
  it('keeps only string values', () => {
    expect(parseStyleTokens(JSON.stringify({ '--mj-brand-primary': '#fff', bad: 5 }))).toEqual({ '--mj-brand-primary': '#fff' });
  });

  it('builds resolved tokens with optional custom css + logo', () => {
    const tokens = buildStyleTokens('{"--mj-brand-primary":"#000"}', '.x{}', 'http://logo');
    expect(tokens).toEqual({ cssVariables: { '--mj-brand-primary': '#000' }, customCSS: '.x{}', logoURL: 'http://logo' });
  });

  it('omits empty custom css / logo', () => {
    expect(buildStyleTokens(null, null, null)).toEqual({ cssVariables: {} });
  });
});
