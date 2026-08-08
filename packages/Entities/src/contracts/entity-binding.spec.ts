import { describe, expect, it } from 'vitest';
import { BindingConfigError, parseIdentityRule, parseMergePolicy } from './entity-binding';

/**
 * These parsers make one promise in their module header: they refuse what they do not understand,
 * rather than falling back to a default. That promise is the whole safety argument for the config
 * vocabulary — a silent default here does not throw, does not log, and shows up months later as a
 * field that quietly stopped updating or a duplicate record nobody can explain.
 *
 * So the interesting cases are the near-misses: a value that is the right shape and the wrong
 * word. `'Newest'` for a rule whose only alternatives are `'Oldest'` and `'Fail'` is exactly what
 * an author writes from memory, and exactly what must not be accepted as `'Oldest'`.
 */
describe('parseIdentityRule', () => {
  it('accepts the documented resolution rules', () => {
    const rule = parseIdentityRule({
      mode: 'MatchThenCreate',
      match: [{ targetField: 'Email' }],
      onMultipleMatch: 'Fail',
      onMissingIdentityValue: 'Fail',
    });

    expect(rule.onMultipleMatch).toBe('Fail');
    expect(rule.onMissingIdentityValue).toBe('Fail');
  });

  it('applies the documented defaults when the rules are simply absent', () => {
    // Absent is not a mistake — it means "use the convergent default". Only a value that is
    // PRESENT and unrecognised indicates the author believed they configured something.
    const rule = parseIdentityRule({ mode: 'MatchThenCreate', match: [{ targetField: 'Email' }] });

    expect(rule.onMultipleMatch).toBe('Oldest');
    expect(rule.onMissingIdentityValue).toBe('Skip');
  });

  it('refuses an unrecognised onMultipleMatch instead of silently choosing Oldest', () => {
    expect(() =>
      parseIdentityRule({
        mode: 'MatchThenCreate',
        match: [{ targetField: 'Email' }],
        onMultipleMatch: 'Newest',
      }),
    ).toThrow(BindingConfigError);
  });

  it('refuses an unrecognised onMissingIdentityValue instead of silently choosing Skip', () => {
    expect(() =>
      parseIdentityRule({
        mode: 'MatchThenCreate',
        match: [{ targetField: 'Email' }],
        onMissingIdentityValue: 'Create',
      }),
    ).toThrow(BindingConfigError);
  });

  it('names the offending value so an author can find it', () => {
    expect(() =>
      parseIdentityRule({ mode: 'AlwaysCreate', onMultipleMatch: 'Newest' }),
    ).toThrow(/Newest/);
  });

  it('still refuses an unknown mode', () => {
    expect(() => parseIdentityRule({ mode: 'UpsertMaybe' })).toThrow(BindingConfigError);
  });
});

describe('parseMergePolicy', () => {
  it('refuses an unknown merge rule rather than treating it as the default', () => {
    // The header calls this out by name: a mistyped `neverBank` presents as a field that simply
    // stops updating, with nothing to notice until someone compares two records by hand.
    expect(() => parseMergePolicy({ fields: { Email: 'neverBank' } })).toThrow(BindingConfigError);
  });
});
