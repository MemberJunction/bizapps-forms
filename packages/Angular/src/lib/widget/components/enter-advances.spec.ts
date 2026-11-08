/**
 * Which Enter presses move a one-question respondent forward.
 *
 * The defect this pins (UI audit F03): the card's keydown handler advanced on Enter from ANY target
 * except a textarea. Enter on Back therefore went forward, and on the last question Enter on Back
 * submitted the form. Enter on a choice, on Retry or on "Choose a file" advanced instead of
 * activating the control. Only a single-line text field has no Enter action of its own, so only
 * there may Enter mean "next".
 */
import { describe, expect, it } from 'vitest';
import { advancesOnEnter, type EnterTarget } from './enter-advances';

function el(tagName: string, attrs: Record<string, string> = {}): EnterTarget {
  return { tagName, getAttribute: (name: string) => attrs[name] ?? null };
}

const input = (type?: string): EnterTarget => el('INPUT', type === undefined ? {} : { type });

describe('advancesOnEnter', () => {
  it.each(['text', 'email', 'tel', 'url', 'number', 'search', 'password', 'date', 'time'])(
    'advances from a single-line %s field',
    (type) => {
      expect(advancesOnEnter(input(type))).toBe(true);
    },
  );

  it('advances from an input with no type attribute, which the browser treats as text', () => {
    expect(advancesOnEnter(input())).toBe(true);
  });

  it.each(['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'image', 'range', 'color'])(
    'leaves Enter to an input of type %s',
    (type) => {
      expect(advancesOnEnter(input(type))).toBe(false);
    },
  );

  it.each(['TEXTAREA', 'BUTTON', 'A', 'SELECT', 'DIV', 'CANVAS'])('leaves Enter to a %s', (tag) => {
    expect(advancesOnEnter(el(tag))).toBe(false);
  });

  it.each(['radio', 'checkbox', 'option', 'button', 'region', 'switch'])(
    'leaves Enter to an element with role=%s',
    (role) => {
      expect(advancesOnEnter(el('DIV', { role }))).toBe(false);
    },
  );

  it('reads the type case-insensitively, as the browser does', () => {
    expect(advancesOnEnter(input('EMAIL'))).toBe(true);
    expect(advancesOnEnter(input('Checkbox'))).toBe(false);
  });

  it('does not advance when there is no target', () => {
    expect(advancesOnEnter(null)).toBe(false);
  });
});
