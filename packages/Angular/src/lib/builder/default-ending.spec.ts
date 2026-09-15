import { describe, expect, it } from 'vitest';

import {
  defaultEndingChanges,
  defaultEndingId,
  vacantDefaultEnding,
  type DefaultEndingCandidate,
} from './default-ending';

function screen(overrides: Partial<DefaultEndingCandidate> = {}): DefaultEndingCandidate {
  return {
    ID: 'e1',
    ScreenType: 'Ending',
    DisplayOrder: 0,
    IsDefault: false,
    IsDisqualification: false,
    ...overrides,
  };
}

describe('defaultEndingId', () => {
  it('is the ending the author marked as the catch-all', () => {
    const screens = [
      screen({ ID: 'a', DisplayOrder: 0 }),
      screen({ ID: 'b', DisplayOrder: 1, IsDefault: true }),
    ];
    expect(defaultEndingId(screens)).toBe('b');
  });

  it('breaks a tie the way the runtime does — lowest display order wins', () => {
    // `resolveEndingScreen` sorts by display order and takes the first match, so a form that
    // somehow carries two defaults resolves to a specific one. The builder has to name the SAME
    // screen, or repairing the form would move the ending respondents were already getting.
    const screens = [
      screen({ ID: 'late', DisplayOrder: 3, IsDefault: true }),
      screen({ ID: 'early', DisplayOrder: 1, IsDefault: true }),
    ];
    expect(defaultEndingId(screens)).toBe('early');
  });

  it('ignores a screened-out ending, which can never be the catch-all', () => {
    // `resolveEndingScreen` excludes disqualification screens from the whole resolution, so one
    // flagged as the default is a setting that does nothing. Reporting it would tell the author
    // their form is configured when it is not.
    const screens = [
      screen({ ID: 'knockout', DisplayOrder: 0, IsDefault: true, IsDisqualification: true }),
      screen({ ID: 'thanks', DisplayOrder: 1 }),
    ];
    expect(defaultEndingId(screens)).toBeNull();
  });
});

describe('defaultEndingChanges', () => {
  it('clears the old default before setting the new one', () => {
    // Order is the whole point. A filtered unique index allows one default per form, so a write
    // that sets the new one first leaves the form momentarily holding two and the save is
    // REFUSED — which an author sees as a switch that flipped back on its own.
    const screens = [
      screen({ ID: 'a', DisplayOrder: 0, IsDefault: true }),
      screen({ ID: 'b', DisplayOrder: 1 }),
    ];
    const changes = defaultEndingChanges(screens, 'b');
    expect(changes.clear.map((s) => s.ID)).toEqual(['a']);
    expect(changes.set?.ID).toBe('b');
  });

  it('asks for no writes when the pick is already the default', () => {
    const screens = [screen({ ID: 'a', IsDefault: true }), screen({ ID: 'b', DisplayOrder: 1 })];
    const changes = defaultEndingChanges(screens, 'a');
    expect(changes.clear).toEqual([]);
    expect(changes.set).toBeNull();
  });

  it('clears every stale default, not just the first', () => {
    // A form authored before the choice was exclusive can hold several. Repairing only the first
    // would leave the form still carrying two, and the unique index would refuse the write.
    const screens = [
      screen({ ID: 'a', DisplayOrder: 0, IsDefault: true }),
      screen({ ID: 'b', DisplayOrder: 1, IsDefault: true }),
      screen({ ID: 'c', DisplayOrder: 2 }),
    ];
    expect(defaultEndingChanges(screens, 'c').clear.map((s) => s.ID)).toEqual(['a', 'b']);
  });

  it('refuses an id that names no eligible ending, rather than clearing the one there is', () => {
    // The dangerous shape: a stale id clears the current default and sets nothing, leaving the
    // form with NO catch-all — a silent downgrade nobody asked for and nothing reports.
    const screens = [screen({ ID: 'a', IsDefault: true })];
    expect(() => defaultEndingChanges(screens, 'deleted')).toThrow(/deleted/);
    expect(() => defaultEndingChanges(screens, 'deleted')).toThrow(/ending/i);
  });

  it('refuses a screened-out ending, which could never win at runtime', () => {
    const screens = [
      screen({ ID: 'a', DisplayOrder: 0, IsDefault: true }),
      screen({ ID: 'knockout', DisplayOrder: 1, IsDisqualification: true }),
    ];
    expect(() => defaultEndingChanges(screens, 'knockout')).toThrow(/knockout/);
  });
});

describe('vacantDefaultEnding', () => {
  it('names the ending that should take over when the form has none', () => {
    // The state a delete leaves behind: the screen holding the default is gone, an eligible
    // ending remains, and nothing promotes it — so the survivor reads "Never shown — add a
    // condition" on a form where it is the only place a respondent can land.
    const screens = [
      screen({ ID: 'b', DisplayOrder: 2 }),
      screen({ ID: 'a', DisplayOrder: 1 }),
    ];
    expect(vacantDefaultEnding(screens)?.ID).toBe('a');
  });

  it('leaves a form that already has a default alone', () => {
    const screens = [screen({ ID: 'a', IsDefault: true }), screen({ ID: 'b', DisplayOrder: 1 })];
    expect(vacantDefaultEnding(screens)).toBeNull();
  });

  it('has nothing to promote when every ending is screened out', () => {
    // Deliberately not "promote one anyway". A screened-out ending takes no part in resolution,
    // so flagging one would be a repair that repairs nothing — endingMessage already falls back
    // to the form-wide confirmation message, which is the honest answer here.
    const screens = [screen({ ID: 'k', IsDisqualification: true })];
    expect(vacantDefaultEnding(screens)).toBeNull();
  });

  it('has nothing to promote on a form with no endings at all', () => {
    expect(vacantDefaultEnding([screen({ ID: 'w', ScreenType: 'Welcome' })])).toBeNull();
  });
});
