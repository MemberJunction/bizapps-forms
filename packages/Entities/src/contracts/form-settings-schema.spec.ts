import { describe, expect, it } from 'vitest';
import { parseFormSettings } from './schemas';

/**
 * `onSubmitMode` must survive the zod round-trip, and the compile-time drift guard in
 * `schemas.ts` cannot be trusted to enforce that: `AssertExtends` compares assignability, and an
 * OPTIONAL property that exists on one side and not the other is assignable in both directions.
 * The guard therefore passes vacuously for every optional field — including this one. A runtime
 * test is what actually holds the schema and the interface together here.
 */
describe('parseFormSettings + onSubmitMode', () => {
  const base = { anonymousAllowed: true, captchaRequired: false };

  it('preserves an authoritative-automations declaration', () => {
    // A schema that merely tolerated this key while stripping it would be the worst outcome:
    // the form would parse, publish, and quietly run the legacy hooks it declined.
    expect(parseFormSettings({ ...base, onSubmitMode: 'Configured' }).onSubmitMode).toBe('Configured');
  });

  it('preserves an explicit Legacy declaration', () => {
    expect(parseFormSettings({ ...base, onSubmitMode: 'Legacy' }).onSubmitMode).toBe('Legacy');
  });

  it('leaves the mode absent when a form does not declare one', () => {
    expect(parseFormSettings(base).onSubmitMode).toBeUndefined();
  });

  it('rejects a mode it does not recognise rather than guessing', () => {
    expect(() => parseFormSettings({ ...base, onSubmitMode: 'Configuered' })).toThrow();
  });
});
