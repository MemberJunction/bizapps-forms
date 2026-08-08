import { describe, expect, it } from 'vitest';
import { planMerge, resolveMappedValues } from './entity-binding-merge';
import { CanonicalAnswers } from './answer-canonical';
import { parseFieldMappings, parseMergePolicy } from './entity-binding';
import type { CanonicalAnswerValue } from './answer-canonical';

function mapped(record: Record<string, CanonicalAnswerValue>): Map<string, CanonicalAnswerValue> {
  return new Map(Object.entries(record));
}

function existing(record: Record<string, unknown>): Map<string, unknown> {
  return new Map(Object.entries(record));
}

const neverBlank = parseMergePolicy(null);

describe('planMerge', () => {
  describe('creating a record', () => {
    it('writes every supplied value', () => {
      const plan = planMerge({
        mapped: mapped({ Email: 'a@b.com', FirstName: 'Ada' }),
        existing: null,
        policy: neverBlank,
        identityFields: ['Email'],
      });

      expect(Object.fromEntries(plan)).toEqual({ Email: 'a@b.com', FirstName: 'Ada' });
    });

    it('writes the identity field, which later lookups have to match on', () => {
      const plan = planMerge({
        mapped: mapped({ Email: 'a@b.com' }),
        existing: null,
        policy: neverBlank,
        identityFields: ['Email'],
      });

      expect(plan.get('Email')).toBe('a@b.com');
    });

    it('does not write a blank, which would record an answer nobody gave', () => {
      const plan = planMerge({
        mapped: mapped({ Email: 'a@b.com', Notes: '' }),
        existing: null,
        policy: neverBlank,
        identityFields: ['Email'],
      });

      expect(plan.has('Notes')).toBe(false);
    });
  });

  describe('absent is not empty', () => {
    it('never writes a field the form did not ask about, whatever the rule', () => {
      for (const rule of ['neverBlank', 'latestWins', 'writeOnce']) {
        const plan = planMerge({
          mapped: mapped({ FirstName: 'Ada' }), // Notes is ABSENT, not blank
          existing: existing({ FirstName: 'Ada', Notes: 'a real note' }),
          policy: parseMergePolicy({ default: rule }),
          identityFields: [],
        });

        expect(plan.has('Notes'), `rule ${rule} must not touch an unasked field`).toBe(false);
      }
    });
  });

  describe('merge rules', () => {
    it('neverBlank refuses to clear an existing value with a blank answer', () => {
      const plan = planMerge({
        mapped: mapped({ Phone: '' }),
        existing: existing({ Phone: '555-0100' }),
        policy: neverBlank,
        identityFields: [],
      });

      expect(plan.has('Phone')).toBe(false);
    });

    it('neverBlank still writes a non-blank answer over an existing value', () => {
      const plan = planMerge({
        mapped: mapped({ Phone: '555-0199' }),
        existing: existing({ Phone: '555-0100' }),
        policy: neverBlank,
        identityFields: [],
      });

      expect(plan.get('Phone')).toBe('555-0199');
    });

    it('latestWins is the only rule that can clear a field', () => {
      const plan = planMerge({
        mapped: mapped({ Phone: '' }),
        existing: existing({ Phone: '555-0100' }),
        policy: parseMergePolicy({ default: 'latestWins' }),
        identityFields: [],
      });

      expect(plan.get('Phone')).toBe('');
    });

    it('writeOnce fills a blank but never overwrites an existing value', () => {
      const policy = parseMergePolicy({ default: 'writeOnce' });

      const fillsBlank = planMerge({
        mapped: mapped({ Source: 'Web Form' }),
        existing: existing({ Source: null }),
        policy,
        identityFields: [],
      });
      const refusesOverwrite = planMerge({
        mapped: mapped({ Source: 'Web Form' }),
        existing: existing({ Source: 'Referral' }),
        policy,
        identityFields: [],
      });

      expect(fillsBlank.get('Source')).toBe('Web Form');
      expect(refusesOverwrite.has('Source')).toBe(false);
    });

    it('applies a per-field rule over the default', () => {
      const plan = planMerge({
        mapped: mapped({ Phone: '', Notes: '' }),
        existing: existing({ Phone: '555-0100', Notes: 'old note' }),
        policy: parseMergePolicy({ default: 'neverBlank', fields: { Notes: 'latestWins' } }),
        identityFields: [],
      });

      expect(plan.has('Phone')).toBe(false);
      expect(plan.get('Notes')).toBe('');
    });
  });

  describe('identity fields are structurally immutable on update', () => {
    it('never rewrites the field the record was matched on', () => {
      const plan = planMerge({
        mapped: mapped({ Email: 'somebody-else@b.com', FirstName: 'Ada' }),
        existing: existing({ Email: 'a@b.com', FirstName: 'Someone' }),
        policy: parseMergePolicy({ default: 'latestWins' }),
        identityFields: ['Email'],
      });

      // Even latestWins does not get to repoint identity: the new address may belong to another
      // real person, and merging two records that way is not recoverable.
      expect(plan.has('Email')).toBe(false);
      expect(plan.get('FirstName')).toBe('Ada');
    });

    it('matches identity fields case-insensitively', () => {
      const plan = planMerge({
        mapped: mapped({ email: 'somebody-else@b.com' }),
        existing: existing({ email: 'a@b.com' }),
        policy: parseMergePolicy({ default: 'latestWins' }),
        identityFields: ['Email'],
      });

      expect(plan.has('email')).toBe(false);
    });
  });

  describe('no-op submissions', () => {
    it('plans nothing when every value already matches, so no save happens', () => {
      const plan = planMerge({
        mapped: mapped({ Email: 'a@b.com', FirstName: 'Ada' }),
        existing: existing({ Email: 'a@b.com', FirstName: 'Ada' }),
        policy: neverBlank,
        identityFields: ['Email'],
      });

      expect(plan.size).toBe(0);
    });

    it('treats a stored number and its string answer as unchanged', () => {
      const plan = planMerge({
        mapped: mapped({ Headcount: '42' }),
        existing: existing({ Headcount: 42 }),
        policy: neverBlank,
        identityFields: [],
      });

      expect(plan.size).toBe(0);
    });

    it('treats a stored Date and its ISO answer as unchanged', () => {
      const plan = planMerge({
        mapped: mapped({ StartDate: '2026-08-07T09:30:00.000Z' }),
        existing: existing({ StartDate: new Date('2026-08-07T09:30:00.000Z') }),
        policy: neverBlank,
        identityFields: [],
      });

      expect(plan.size).toBe(0);
    });

    it('treats null and blank as the same nothing', () => {
      const plan = planMerge({
        mapped: mapped({ Notes: '' }),
        existing: existing({ Notes: null }),
        policy: parseMergePolicy({ default: 'latestWins' }),
        identityFields: [],
      });

      expect(plan.size).toBe(0);
    });
  });

  describe('falsy values are real answers', () => {
    it('writes 0 and false rather than treating them as blank', () => {
      const plan = planMerge({
        mapped: mapped({ Score: 0, OptedIn: false }),
        existing: existing({ Score: 5, OptedIn: true }),
        policy: neverBlank,
        identityFields: [],
      });

      expect(plan.get('Score')).toBe(0);
      expect(plan.get('OptedIn')).toBe(false);
    });
  });
});

describe('resolveMappedValues', () => {
  const mappings = parseFieldMappings({
    version: 1,
    fields: [
      { targetField: 'Email', source: { kind: 'question', questionId: 'q-email' }, required: true },
      { targetField: 'Notes', source: { kind: 'question', questionId: 'q-notes' } },
      { targetField: 'LeadSource', source: { kind: 'static', value: 'Web Form' } },
    ],
  });

  it('maps answers to target fields and includes static values', () => {
    const answers = new CanonicalAnswers([
      { QuestionID: 'Q-EMAIL', TextValue: 'a@b.com' },
      { QuestionID: 'q-notes', TextValue: 'hello' },
    ]);

    const resolved = resolveMappedValues(mappings, answers);

    expect(Object.fromEntries(resolved.values)).toEqual({
      Email: 'a@b.com',
      Notes: 'hello',
      LeadSource: 'Web Form',
    });
    expect(resolved.missingRequired).toEqual([]);
  });

  it('reports a required field the submission did not answer', () => {
    const answers = new CanonicalAnswers([{ QuestionID: 'q-notes', TextValue: 'hello' }]);

    const resolved = resolveMappedValues(mappings, answers);

    expect(resolved.missingRequired).toEqual(['Email']);
    expect(resolved.values.has('Email')).toBe(false);
  });

  it('treats a blank answer to a required field as missing', () => {
    const answers = new CanonicalAnswers([{ QuestionID: 'q-email', TextValue: '   ' }]);

    const resolved = resolveMappedValues(mappings, answers);

    expect(resolved.missingRequired).toEqual(['Email']);
  });

  it('keeps a blank answer to an OPTIONAL field, so latestWins can still clear', () => {
    const answers = new CanonicalAnswers([
      { QuestionID: 'q-email', TextValue: 'a@b.com' },
      { QuestionID: 'q-notes', TextValue: '' },
    ]);

    const resolved = resolveMappedValues(mappings, answers);

    expect(resolved.values.has('Notes')).toBe(true);
    expect(resolved.values.get('Notes')).toBe('');
  });

  it('omits an optional field the form never asked, so no rule can write it', () => {
    const answers = new CanonicalAnswers([{ QuestionID: 'q-email', TextValue: 'a@b.com' }]);

    const resolved = resolveMappedValues(mappings, answers);

    expect(resolved.values.has('Notes')).toBe(false);
  });
});
