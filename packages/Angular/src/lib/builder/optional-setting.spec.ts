import { describe, it, expect } from 'vitest';
import { isOptionalOpen, toggleOptional } from './optional-setting';

describe('a panel row whose "on" is not stored anywhere', () => {
  it('is open when the setting holds a value', () => {
    expect(isOptionalOpen(true, false)).toBe(true);
  });

  it('is open while the author has asked for it but typed nothing yet', () => {
    // Without this the row would collapse the instant it rendered, because switching it on
    // stores nothing — there would be no way to reach the editor at all.
    expect(isOptionalOpen(false, true)).toBe(true);
  });

  it('is closed when there is neither', () => {
    expect(isOptionalOpen(false, false)).toBe(false);
  });

  it('CLEARS the value when switched off', () => {
    // The rule that matters. A validation rule left behind while the panel says "off" would go
    // on rejecting respondents' answers, with nothing on screen to explain why.
    expect(toggleOptional(true, false)).toEqual({ open: false, clear: true, requested: false });
  });

  it('has nothing to clear when switched off before anything was typed', () => {
    expect(toggleOptional(false, true)).toEqual({ open: false, clear: false, requested: false });
  });

  it('only reveals the editor when switched on, storing nothing yet', () => {
    // Switching on must not write a value: an empty rule saved on toggle would make every
    // question look configured, and would mark the form dirty for a change nobody made.
    expect(toggleOptional(false, false)).toEqual({ open: true, clear: false, requested: true });
  });

  it('round-trips: on, off, on again', () => {
    const on = toggleOptional(false, false);
    const off = toggleOptional(false, on.requested);
    expect(off.open).toBe(false);
    expect(toggleOptional(false, off.requested).open).toBe(true);
  });
});
