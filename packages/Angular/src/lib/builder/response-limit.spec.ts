import { describe, expect, it } from 'vitest';

import { readResponseLimit } from './response-limit';

describe('readResponseLimit', () => {
  it('sets the cap to a plain whole number', () => {
    expect(readResponseLimit('5')).toEqual({ action: 'set', value: 5 });
  });

  it('does not read unparseable typing as an empty box', () => {
    // A number input refuses to expose text it cannot parse — `value` comes back as ''
    // for "abc", which is indistinguishable from the author clearing the field. So the
    // caller passes the element's own badInput flag, which is the only thing that can
    // tell "I typed rubbish" from "I emptied it". Without this, typing a letter into the
    // box silently uncapped a live link.
    expect(readResponseLimit('', true).action).toBe('ignore');
    expect(readResponseLimit('', false)).toEqual({ action: 'clear' });
  });

  it('takes a fraction down, never up', () => {
    // "2.7 responses" is not a thing. Rounding UP would let one more response through
    // than the number the author typed, which is the wrong direction for a cap.
    expect(readResponseLimit('2.7')).toEqual({ action: 'set', value: 2 });
    expect(readResponseLimit('0.9')).toEqual({ action: 'set', value: 0 });
  });

  it('ignores something it cannot read as a number', () => {
    expect(readResponseLimit('abc').action).toBe('ignore');
    expect(readResponseLimit('1e999').action).toBe('ignore');
  });

  it('keeps the cap inside what the column can hold', () => {
    // MaxResponses is a SQL INT. 2147483648 reached the server and came back as a
    // validation failure, and the box went on displaying the number that was refused.
    // Clamping means the value shown is always the value stored.
    expect(readResponseLimit('2147483647')).toEqual({ action: 'set', value: 2147483647 });
    expect(readResponseLimit('2147483648')).toEqual({ action: 'set', value: 2147483647 });
    expect(readResponseLimit('99999999999999')).toEqual({ action: 'set', value: 2147483647 });
  });

  it('refuses a negative rather than reading it as no limit', () => {
    // The shipped bug: a typed "-5" fell through to null, which the UI renders as
    // "no limit" — the exact opposite of the restriction the number was reaching for.
    // Nothing is written, so a typo cannot quietly uncap a live link.
    const edit = readResponseLimit('-5');
    expect(edit.action).toBe('ignore');
  });

  it('reads an empty box as no limit at all', () => {
    // The one deliberate way to say "unlimited", so it has to keep working.
    expect(readResponseLimit('')).toEqual({ action: 'clear' });
    expect(readResponseLimit('   ')).toEqual({ action: 'clear' });
  });
});
