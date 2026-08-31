import { describe, expect, it } from 'vitest';

import {
  DOODLE_PEN_COLORS,
  DOODLE_PEN_WIDTHS,
  DOODLE_PEN_WIDTH_NAMES,
  DOODLE_PEN_CONTROL_CHOICES,
  DOODLE_PEN_DEFAULTS,
  doodlePen,
} from './doodle-pen';
import type { JSONValue } from './json-value';

describe('doodlePen — what an unset question means', () => {
  it('is today’s pad exactly: theme ink, medium stroke, no controls offered', () => {
    // The bar this whole feature has to clear: a Doodle question authored before pen settings
    // existed, and one authored after and left alone, must behave identically.
    expect(doodlePen()).toEqual({ color: 'Ink', width: 'Medium', offerColor: false, offerWidth: false });
    expect(doodlePen({})).toEqual({ color: 'Ink', width: 'Medium', offerColor: false, offerWidth: false });
  });

  it('reads the same defaults for a question whose settings are about something else', () => {
    expect(doodlePen({ placeholder: 'unrelated', max: 5 })).toEqual(
      { color: 'Ink', width: 'Medium', offerColor: false, offerWidth: false },
    );
  });
});

describe('doodlePen — what the author chose', () => {
  it('takes a named colour and a named width', () => {
    expect(doodlePen({ penColor: 'Blue', penWidth: 'Broad' })).toMatchObject({ color: 'Blue', width: 'Broad' });
  });

  it('opens the controls the author opened, and only those', () => {
    expect(doodlePen({ penControls: 'Colour' })).toMatchObject({ offerColor: true, offerWidth: false });
    expect(doodlePen({ penControls: 'Width' })).toMatchObject({ offerColor: false, offerWidth: true });
    expect(doodlePen({ penControls: 'Colour and width' })).toMatchObject({ offerColor: true, offerWidth: true });
  });
});

describe('doodlePen — Settings is reachable by paste and by API', () => {
  /**
   * `FormQuestion.Settings` is an open JSON blob. Nothing between a hand-edited row, a scripted
   * import or a mistyped API call and this function, so every value has to be treated as
   * untrusted: the pad must always render, and it must render as if the bad key were absent.
   */
  const junk: JSONValue[] = ['Purple', '', 'ink', 42, true, null, ['Blue'], { name: 'Blue' }];

  it('falls back to the default for any colour it does not know', () => {
    for (const bad of junk) {
      expect(doodlePen({ penColor: bad }).color, JSON.stringify(bad)).toBe('Ink');
    }
  });

  it('falls back to the default for any width it does not know', () => {
    for (const bad of [...junk, 2.5, 'medium']) {
      expect(doodlePen({ penWidth: bad }).width, JSON.stringify(bad)).toBe('Medium');
    }
  });

  it('offers nothing for a control setting it does not know', () => {
    for (const bad of [...junk, 'colour', 'both', 'true']) {
      expect(doodlePen({ penControls: bad }), JSON.stringify(bad)).toMatchObject({
        offerColor: false,
        offerWidth: false,
      });
    }
  });

  it('keeps the good half of a half-broken settings blob', () => {
    // Rejecting the whole blob would punish an author for one typo by silently reverting every
    // other choice they made.
    expect(doodlePen({ penColor: 'Green', penWidth: 'enormous' })).toMatchObject(
      { color: 'Green', width: 'Medium' },
    );
  });
});

describe('the pen tables', () => {
  it('names Ink first, because it is the default and the only theme-following pen', () => {
    expect(DOODLE_PEN_COLORS[0]).toBe('Ink');
  });

  it('keeps Medium at the width the pad has always drawn at', () => {
    // 2.5 was hardcoded in `beginStroke`. An unset question must not visibly change.
    expect(DOODLE_PEN_WIDTHS.Medium).toBe(2.5);
  });

  it('orders the widths so a wider name is a wider line', () => {
    expect(DOODLE_PEN_WIDTHS.Fine).toBeLessThan(DOODLE_PEN_WIDTHS.Medium);
    expect(DOODLE_PEN_WIDTHS.Medium).toBeLessThan(DOODLE_PEN_WIDTHS.Broad);
  });

  it('offers every width the table defines — the list is derived, not restated', () => {
    // The failure a hand-written list has no way to prevent: a fourth width added to the table
    // compiles cleanly and simply never appears in the picker or the author's dropdown.
    expect([...DOODLE_PEN_WIDTH_NAMES].sort()).toEqual(Object.keys(DOODLE_PEN_WIDTHS).sort());
  });

  it('names a default that is itself on offer', () => {
    // A default outside its own list would be unreachable from the picker: a respondent who moved
    // off it could never get back, and the author's dropdown could not describe it.
    expect(DOODLE_PEN_COLORS).toContain(DOODLE_PEN_DEFAULTS.color);
    expect(DOODLE_PEN_WIDTH_NAMES).toContain(DOODLE_PEN_DEFAULTS.width);
  });

  it('offers the empty choice first, so "no controls" is what an author lands on', () => {
    expect(DOODLE_PEN_CONTROL_CHOICES[0]).toBe('');
  });
});
