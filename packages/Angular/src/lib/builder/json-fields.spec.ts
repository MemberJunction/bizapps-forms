import { describe, it, expect } from 'vitest';
import type { ConditionalRule, ValidationRule, FormSettings } from '@mj-biz-apps/forms-entities';
import {
  parseConditionalRule,
  serializeConditionalRule,
  parseValidationRule,
  serializeValidationRule,
  parseFormSettings,
  serializeFormSettings,
  parseQuestionSettings,
  serializeQuestionSettings,
  parseStyleTokens,
  buildStyleTokens,
} from './json-fields';

describe('conditional rule round-trip', () => {
  it('parses valid JSON', () => {
    const raw = '{"show":{"all":[{"questionId":"q1","op":"equals","value":"Other"}]}}';
    const rule = parseConditionalRule(raw);
    expect(rule?.show?.all?.[0].questionId).toBe('q1');
  });

  it('returns undefined for null/blank/invalid', () => {
    expect(parseConditionalRule(null)).toBeUndefined();
    expect(parseConditionalRule('')).toBeUndefined();
    expect(parseConditionalRule('not json')).toBeUndefined();
  });

  it('serializes to null when there is no show group', () => {
    expect(serializeConditionalRule(undefined)).toBeNull();
    expect(serializeConditionalRule({})).toBeNull();
  });

  it('serializes a real rule', () => {
    const rule: ConditionalRule = { show: { any: [{ questionId: 'q', op: 'isAnswered' }] } };
    const json = serializeConditionalRule(rule);
    expect(json).not.toBeNull();
    expect(parseConditionalRule(json)).toEqual(rule);
  });
});

describe('validation rule round-trip', () => {
  it('serializes to null when empty', () => {
    expect(serializeValidationRule(undefined)).toBeNull();
    expect(serializeValidationRule({})).toBeNull();
  });

  it('round-trips a rule', () => {
    const rule: ValidationRule = { minLength: 2, maxLength: 10, pattern: '^a+$' };
    const json = serializeValidationRule(rule);
    expect(parseValidationRule(json)).toEqual(rule);
  });
});

describe('form settings', () => {
  it('applies defaults when blank', () => {
    const settings = parseFormSettings(null);
    expect(settings.anonymousAllowed).toBe(true);
    expect(settings.captchaRequired).toBe(false);
  });

  it('round-trips', () => {
    const settings: FormSettings = {
      anonymousAllowed: false,
      captchaRequired: true,
      quota: 100,
      confirmationMessage: 'Thanks!',
    };
    const json = serializeFormSettings(settings);
    expect(parseFormSettings(json)).toMatchObject(settings);
  });
});

describe('question settings', () => {
  it('defaults to empty object', () => {
    expect(parseQuestionSettings(null)).toEqual({});
  });

  it('serializes empty to null', () => {
    expect(serializeQuestionSettings({})).toBeNull();
  });

  it('round-trips structured settings', () => {
    const settings = { scaleMax: 5, npsLabels: ['low', 'high'] };
    const json = serializeQuestionSettings(settings);
    expect(parseQuestionSettings(json)).toEqual(settings);
  });
});

describe('style tokens', () => {
  it('keeps only string values', () => {
    const raw = JSON.stringify({ '--mj-brand-primary': '#fff', bad: 5 });
    expect(parseStyleTokens(raw)).toEqual({ '--mj-brand-primary': '#fff' });
  });

  it('builds resolved tokens with optional custom css + logo', () => {
    const tokens = buildStyleTokens('{"--mj-brand-primary":"#000"}', '.x{}', 'http://logo');
    expect(tokens.cssVariables['--mj-brand-primary']).toBe('#000');
    expect(tokens.customCSS).toBe('.x{}');
    expect(tokens.logoURL).toBe('http://logo');
  });

  it('omits empty custom css / logo', () => {
    const tokens = buildStyleTokens(null, null, null);
    expect(tokens.customCSS).toBeUndefined();
    expect(tokens.logoURL).toBeUndefined();
    expect(tokens.cssVariables).toEqual({});
  });
});
