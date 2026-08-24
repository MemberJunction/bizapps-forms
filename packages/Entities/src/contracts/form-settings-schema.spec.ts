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

  it('drops a mode it does not recognise rather than rejecting the whole settings blob', () => {
    // This asserted `.toThrow()` when the field was added, and that was the wrong call.
    // `parseFormSettings` is what the SERVER runs over a stored snapshot, and a throw there fails
    // the whole settings parse, which fails the whole snapshot, which serves every respondent
    // "Form unavailable" — taking a live form offline over a side-effect flag they cannot see.
    //
    // Dropping it degrades to absent, which means "infer" — the behaviour every form had before
    // the field existed. `snapshot-parser.spec.ts` pins the consequence end to end.
    //
    // The authoring paths do NOT share this leniency, and they differ from each other on purpose:
    // `applyOnSubmitConfig` case-folds before matching, so a caller passing `configured` on an
    // Action param gets the canonical `Configured` rather than an error, and anything it cannot
    // map is rejected outright. `formBlueprintSchema` is exact, because a blueprint is machine
    // output and a mode it did not spell correctly is a mistake worth surfacing. Both tell the
    // caller; only this reader, which serves a live form to a respondent, degrades quietly.
    expect(parseFormSettings({ ...base, onSubmitMode: 'Configuered' }).onSubmitMode).toBeUndefined();
    expect(parseFormSettings({ ...base, onSubmitMode: 'configured' }).onSubmitMode).toBeUndefined();
  });

  it('keeps the rest of the settings when an unreadable mode is dropped', () => {
    const settings = parseFormSettings({ ...base, quota: 5, onSubmitMode: 'nonsense' });

    expect(settings.quota).toBe(5);
    expect(settings.anonymousAllowed).toBe(true);
  });
});
