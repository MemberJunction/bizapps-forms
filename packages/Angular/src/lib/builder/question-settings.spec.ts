import { describe, it, expect } from 'vitest';
import { settingsFor, settingText, withSetting } from './question-settings';
import type { JSONValue } from '@mj-biz-apps/forms-entities';

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

  it('every declared key is non-empty and labelled', () => {
    for (const type of ['ShortText', 'LongText', 'Rating', 'OpinionScale', 'Legal', 'Checkbox', 'FileUpload'] as const) {
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
