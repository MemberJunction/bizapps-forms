import { describe, it, expect } from 'vitest';
import { settingsFor, settingText, withSetting } from './question-settings';
import { doodlePen, type JSONValue } from '@mj-biz-apps/forms-entities';

const numberField = { key: 'max', label: 'Max', kind: 'number' } as const;
const textField = { key: 'labelMin', label: 'Low label', kind: 'text' } as const;

describe('settingsFor', () => {
  it('offers the scale bounds and end labels on OpinionScale', () => {
    expect(settingsFor('OpinionScale').map((f) => f.key)).toEqual(['min', 'max', 'labelMin', 'labelMax']);
  });

  it('offers the star count on Rating, which the widget already read and nothing could write', () => {
    expect(settingsFor('Rating').map((f) => f.key)).toEqual(['max']);
  });

  it('offers terms on Legal and nothing on a plain choice question', () => {
    expect(settingsFor('Legal').map((f) => f.key)).toEqual(['terms']);
    expect(settingsFor('SingleChoice')).toEqual([]);
  });

  it('offers the pen, the width and what the respondent may change on Doodle', () => {
    expect(settingsFor('Doodle').map((f) => f.key)).toEqual(['penColor', 'penWidth', 'penControls']);
  });

  it('every declared key is non-empty and labelled', () => {
    for (const type of ['ShortText', 'LongText', 'Rating', 'OpinionScale', 'Legal', 'Checkbox', 'FileUpload', 'Doodle'] as const) {
      for (const field of settingsFor(type)) {
        expect(field.key.length, `${type}.${field.key}`).toBeGreaterThan(0);
        expect(field.label.length, `${type}.${field.key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('settingText', () => {
  it('reads strings and numbers alike, because an input shows both as text', () => {
    expect(settingText({ max: 7 }, 'max')).toBe('7');
    expect(settingText({ labelMin: 'Low' }, 'labelMin')).toBe('Low');
  });

  it('returns empty for an absent key or a value of the wrong shape', () => {
    expect(settingText({}, 'max')).toBe('');
    expect(settingText({ max: { nested: true } as JSONValue }, 'max')).toBe('');
  });
});

describe('withSetting', () => {
  it('writes a number as a number, not as the typed string', () => {
    expect(withSetting({}, numberField, '7')).toEqual({ max: 7 });
  });

  it('writes text verbatim, whitespace included', () => {
    // Only the emptiness test trims; a label of "  Low  " is the author's spacing to keep.
    expect(withSetting({}, textField, '  Low  ')).toEqual({ labelMin: '  Low  ' });
  });

  it('DELETES the key when the value is cleared, rather than storing 0 or an empty string', () => {
    // The load-bearing case: the widget's defaults (5 stars, a 1..10 scale) apply only when the
    // key is ABSENT. Storing 0 for a cleared field pins the rating to zero stars — a control
    // with nothing to click, on a question that may be required.
    expect(withSetting({ max: 7 }, numberField, '')).toEqual({});
    expect(withSetting({ max: 7 }, numberField, '   ')).toEqual({});
    expect(withSetting({ labelMin: 'Low' }, textField, '')).toEqual({});
  });

  it('leaves the stored value alone when a number field gets non-numeric text', () => {
    // Writing NaN would serialize to `null`, which the widget reads as unset one render later —
    // so a typo would silently reset the setting instead of being ignored.
    expect(withSetting({ max: 7 }, numberField, 'abc')).toEqual({ max: 7 });
  });

  it('preserves the other settings', () => {
    expect(withSetting({ min: 1, labelMin: 'Low' }, numberField, '9')).toEqual({
      min: 1,
      labelMin: 'Low',
      max: 9,
    });
  });

  it('is pure — the input map is not mutated', () => {
    const original: Record<string, JSONValue> = { max: 7 };
    withSetting(original, numberField, '9');
    expect(original).toEqual({ max: 7 });
  });
});

describe('the Doodle pen rows and the pad agree, by construction', () => {
  /**
   * The failure this pairing exists to prevent: the panel offers a value the widget does not
   * recognise, so the author picks a pen, the pad silently falls back, and nothing anywhere says
   * why. `doodlePen` is the widget's own validator — running the panel's own options through it
   * is the only check that cannot be satisfied by a stale copy of the list.
   */
  it('offers only pens, widths and control modes the widget accepts', () => {
    const [color, width, controls] = settingsFor('Doodle');

    for (const choice of color.choices ?? []) {
      const expected = choice.value === '' ? 'Ink' : choice.value;
      expect(doodlePen({ penColor: choice.value }).color, choice.value).toBe(expected);
    }
    for (const choice of width.choices ?? []) {
      const expected = choice.value === '' ? 'Medium' : choice.value;
      expect(doodlePen({ penWidth: choice.value }).width, choice.value).toBe(expected);
    }
    for (const choice of controls.choices ?? []) {
      const pen = doodlePen({ penControls: choice.value });
      expect(pen.offerColor || pen.offerWidth, choice.value).toBe(choice.value !== '');
    }
  });

  it('gives every choice a label, so no option renders blank in the dropdown', () => {
    for (const field of settingsFor('Doodle')) {
      expect(field.choices, field.key).toBeDefined();
      for (const choice of field.choices ?? []) {
        expect(choice.label.length, `${field.key}=${choice.value}`).toBeGreaterThan(0);
      }
    }
  });

  it('deletes the key when the author picks the blank option, so the default applies', () => {
    // The `choice` kind inherits the blank-means-default rule the text fields follow, which is
    // what makes "Follow the form" and "an unset question" the same stored state.
    const [color] = settingsFor('Doodle');
    expect(withSetting({ penColor: 'Blue' }, color, '')).toEqual({});
  });
});
