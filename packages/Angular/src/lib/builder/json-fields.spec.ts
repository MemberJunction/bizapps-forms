import { describe, it, expect } from 'vitest';
import {
  parseQuestionSettings,
  readStoredConditionalRule,
  readStoredFormSettings,
  readStoredValidationRule,
  withVerbGroup,
  type ConditionalRule,
  type FormSettings,
  type ValidationRule,
} from '@mj-biz-apps/forms-entities/contracts';
import {
  editableConditionalRule,
  editableValidationRule,
  serializeConditionalRule,
  serializeValidationRule,
  serializeFormSettings,
  serializeQuestionSettings,
} from './json-fields';

/**
 * The builder WRITES these columns and the contracts READ them (#303), so what is pinned here is
 * the round trip: whatever a serializer writes, the reader publish uses reads back unchanged. The
 * readers' own cases — empty, invalid, defaults — live in the contracts' `stored-columns.spec.ts`.
 */

/** Read a column back through the publish reader, failing the test if it does not read. */
function readBack<T>(read: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!read.ok) {
    throw new Error(`did not read back: ${read.reason}`);
  }
  return read.value;
}
const parseConditionalRule = (raw: string | null): ConditionalRule | undefined => readBack(readStoredConditionalRule(raw));
const parseValidationRule = (raw: string | null): ValidationRule | undefined => readBack(readStoredValidationRule(raw));
const parseFormSettings = (raw: string | null): FormSettings => readBack(readStoredFormSettings(raw));

describe('conditional rule round-trip', () => {
  it('parses valid JSON', () => {
    const raw = '{"show":{"all":[{"questionId":"q1","op":"equals","value":"Other"}]}}';
    const rule = parseConditionalRule(raw);
    expect(rule?.show?.all?.[0].questionId).toBe('q1');
  });

  it('shows an editor no rule for an empty or unreadable column', () => {
    // Unreadable is reported elsewhere (the canvas badge, the publish refusal); the editor's job
    // is to offer a working control, so it shows none rather than throwing on render.
    expect(editableConditionalRule(null)).toBeUndefined();
    expect(editableConditionalRule('')).toBeUndefined();
    expect(editableConditionalRule('not json')).toBeUndefined();
    expect(editableConditionalRule('{"show":{"all":[{"questionId":"q1","op":"bogus"}]}}')).toBeUndefined();
    expect(editableValidationRule('{"minLength":"two"}')).toBeUndefined();
    expect(editableValidationRule('{"minLength":2}')).toEqual({ minLength: 2 });
  });

  it('serializes to null only when the rule carries no verb at all', () => {
    expect(serializeConditionalRule(undefined)).toBeNull();
    expect(serializeConditionalRule({})).toBeNull();
  });

  it('keeps a rule whose only verb is jump', () => {
    // The guard used to be `!rule.show`, written when `show` was the only verb. A page whose
    // author added a jump and no show rule therefore serialized to `null`: the jump was
    // discarded on save and no respondent ever skipped anything.
    const rule: ConditionalRule = {
      jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'skip' }] }, target: { kind: 'page', id: 'p3' } }],
    };
    expect(parseConditionalRule(serializeConditionalRule(rule))).toEqual(rule);
  });

  it('removing the show verb leaves the other verbs standing', () => {
    // The destructive half of the same defect: `withVerbGroup` correctly returns the remaining
    // verbs, and the serializer then threw them away because `show` was gone.
    const rule: ConditionalRule = {
      show: { all: [{ questionId: 'q1', op: 'isAnswered' }] },
      jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'skip' }] }, target: { kind: 'page', id: 'p3' } }],
    };
    const withoutShow = withVerbGroup(rule, 'show', undefined);
    expect(parseConditionalRule(serializeConditionalRule(withoutShow))).toEqual({ jump: rule.jump });
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
  it('preserves an on-submit mode through a round-trip', () => {
    // The builder marks a form `Configured` the moment it writes its first automation row. This
    // parser is a whitelist, so a field missing from it is dropped on the next save — the form
    // would silently revert to inferring its dispatch, and deleting the last step would bring all
    // four legacy hooks back (bizapps-forms#47).
    const raw = serializeFormSettings({
      anonymousAllowed: true,
      captchaRequired: false,
      onSubmitMode: 'Configured',
    });

    expect(parseFormSettings(raw).onSubmitMode).toBe('Configured');
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
  it('serializes empty to null', () => {
    expect(serializeQuestionSettings({})).toBeNull();
  });

  it('round-trips structured settings', () => {
    const settings = { scaleMax: 5, npsLabels: ['low', 'high'] };
    const json = serializeQuestionSettings(settings);
    expect(parseQuestionSettings(json)).toEqual(settings);
  });
});
