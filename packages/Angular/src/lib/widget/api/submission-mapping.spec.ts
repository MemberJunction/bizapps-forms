import { describe, it, expect } from 'vitest';
import type { FormAnswerInput, FormSubmissionInput, FormSubmissionResult } from '@mj-biz-apps/forms-entities';
import { toInputType, toAnswerInputType, SUBMISSION_INPUT_FIELDS, ANSWER_INPUT_FIELDS } from './submission-mapping';

// NOTE: the COMPILE-TIME contract lock lives in submission-mapping.ts (built by ngc); these are
// the runtime field-set assertions that additionally verify the mapping emits exactly those keys.

function submission(overrides?: Partial<FormSubmissionInput>): FormSubmissionInput {
  return {
    distributionSlug: 'slug-1',
    formVersionId: 'ver-1',
    partial: true,
    startedAt: '2026-01-01T00:00:00Z',
    clientMeta: { referrer: 'r', userAgent: 'ua' },
    answers: [{ questionId: 'q1', textValue: 'hi' }],
    ...overrides,
  };
}

describe('widget submission mapping — field-for-field shape lock', () => {
  it('produces EXACTLY the server input field set (no missing, no extra keys)', () => {
    const wire = toInputType(submission(), 'client-id-1');
    expect(new Set(Object.keys(wire))).toEqual(new Set(SUBMISSION_INPUT_FIELDS));
  });

  it('threads the transport upsert target through as responseId', () => {
    const wire = toInputType(submission(), 'client-id-1');
    expect(wire.responseId).toBe('client-id-1');
  });

  it('maps each answer to EXACTLY the server answer field set', () => {
    const wire = toAnswerInputType({ questionId: 'q1', textValue: 'x' } satisfies FormAnswerInput);
    expect(new Set(Object.keys(wire))).toEqual(new Set(ANSWER_INPUT_FIELDS));
  });

  it('stringifies a structured jsonValue (the one deliberate wire divergence)', () => {
    const wire = toAnswerInputType({ questionId: 'q1', jsonValue: ['a', 'b'] });
    expect(wire.jsonValue).toBe(JSON.stringify(['a', 'b']));
  });

  it('leaves jsonValue undefined (not "undefined") when the answer has none', () => {
    const wire = toAnswerInputType({ questionId: 'q1', textValue: 'x' });
    expect(wire.jsonValue).toBeUndefined();
  });

  it('carries the top-level fields verbatim', () => {
    const wire = toInputType(submission({ turnstileToken: 'tok' }), undefined);
    expect(wire.distributionSlug).toBe('slug-1');
    expect(wire.formVersionId).toBe('ver-1');
    expect(wire.partial).toBe(true);
    expect(wire.turnstileToken).toBe('tok');
    expect(wire.clientMeta).toEqual({ referrer: 'r', userAgent: 'ua' });
  });
});

describe('result contract lock (fields the widget reads)', () => {
  it('the widget reads only fields present on FormSubmissionResult', () => {
    // A compile-time-checked object: if a field the widget relies on is removed from the
    // contract, this stops compiling.
    const res: FormSubmissionResult = {
      success: true,
      responseId: 'r',
      status: 'Complete',
      confirmationMessage: 'ty',
      redirectUrl: undefined,
      errors: [{ questionId: 'q', message: 'm' }],
    };
    expect(res.success).toBe(true);
  });
});
