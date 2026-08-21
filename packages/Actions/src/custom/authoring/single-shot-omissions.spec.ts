/**
 * What the single-shot route admits it did not build.
 *
 * The image and theme stages live inside `runStagedAuthoring` only, so a caller with no
 * `SessionID` gets the house palette and no pictures however hard the blueprint asked for them.
 * That is a deliberate cost trade — pictures are billed per picture — but a `Degraded` of `[]`
 * told the caller nothing was missing. Deleting the whole list left every test in this package
 * green, which is why it now lives in a pure function with cases of its own.
 */
import { describe, expect, it } from 'vitest';
import { singleShotOmissions } from './generate-form.action';
import type { FormBlueprint } from './form-blueprint';

const blueprint = (over: Partial<FormBlueprint> = {}): FormBlueprint =>
  ({ name: 'RSVP', pages: [], ...over }) as FormBlueprint;

describe('singleShotOmissions', () => {
  it('says nothing was skipped when the blueprint wanted neither pictures nor a palette', () => {
    expect(singleShotOmissions(blueprint())).toEqual([]);
  });

  it('names the palette when the designer asked for one', () => {
    const out = singleShotOmissions(blueprint({ theme: { brandAdjectives: ['warm'] } } as Partial<FormBlueprint>));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/colours/);
  });

  it('names the pictures when a screen asked for one', () => {
    const out = singleShotOmissions(
      blueprint({ screens: { welcome: { imagePrompt: 'a sunlit hall' } } } as Partial<FormBlueprint>),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/pictures/);
  });

  it('counts a picture asked for by a picture-choice option', () => {
    const out = singleShotOmissions(
      blueprint({
        pages: [{ questions: [{ options: [{ label: 'Ramen', imagePrompt: 'a bowl of ramen' }] }] }],
      } as unknown as Partial<FormBlueprint>),
    );
    expect(out.some((line) => /pictures/.test(line))).toBe(true);
  });

  it('names both when the blueprint asked for both', () => {
    const out = singleShotOmissions(
      blueprint({
        theme: { brandAdjectives: ['warm'] },
        screens: { endings: [{ imagePrompt: 'confetti' }] },
      } as unknown as Partial<FormBlueprint>),
    );
    expect(out).toHaveLength(2);
  });
});
