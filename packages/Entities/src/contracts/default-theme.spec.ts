import { describe, it, expect } from 'vitest';
import { contrastRatio, parseCssColor } from './readable-ink';
import { DEFAULT_FORM_THEME, THEME_LAYOUT_TOKENS, defaultThemeJSON } from './default-theme';

const ratio = (a: string, b: string): number => {
  const ca = parseCssColor(a);
  const cb = parseCssColor(b);
  expect(ca, a).toBeTruthy();
  expect(cb, b).toBeTruthy();
  return contrastRatio(ca!, cb!);
};

const token = (name: string): string => DEFAULT_FORM_THEME[name];

describe('the default form theme', () => {
  it('is the palette that was asked for', () => {
    expect(token('--mjf-page-bg')).toBe('#ffffff');
    expect(token('--mjf-accent')).toBe('#1b7fa8');
    expect(token('--mjf-choice-selected-bg')).toBe('#bfd2df');
    expect(token('--mjf-page-ink')).toBe('#373530');
    expect(token('--mjf-font-body')).toBe('system-ui, sans-serif');
    expect(token('--mjf-font-display')).toBe('system-ui, sans-serif');
  });

  it('uses the exact values the Design tab controls read back', () => {
    // A default expressed in values the panel cannot recognise leaves every control showing a
    // fallback, which reads to an author as the panel being out of sync with their form.
    expect(token('--mjf-btn-radius')).toBe('999px'); // RADIUS_STEPS 'round'
    expect(token('--mjf-title-size')).toBe('2.25rem'); // TITLE_SIZES.lg
    expect(token('--mjf-title-align')).toBe('center');
    expect(token('--mjf-question-size')).toBe('1.0625rem'); // QUESTION_SIZES.md
    expect(token('--mjf-question-align')).toBe('flex-start'); // QUESTION_ALIGN_VALUES.left
  });

  it('clears WCAG AA on every pair a respondent reads', () => {
    // The shipped default must not be something the accessibility gate would have to repair —
    // a house style that trips our own guard is not a house style.
    expect(ratio(token('--mjf-page-ink'), token('--mjf-page-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('--mjf-page-ink'), token('--mjf-card-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('--mjf-on-accent'), token('--mjf-accent'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('--mjf-page-ink'), token('--mjf-choice-selected-bg'))).toBeGreaterThanOrEqual(4.5);
    // The accent is a large element, so it only has to be distinguishable from the page.
    expect(ratio(token('--mjf-accent'), token('--mjf-page-bg'))).toBeGreaterThanOrEqual(3);
    // And the hover shade has to keep its label readable too.
    expect(ratio(token('--mjf-on-accent'), token('--mjf-accent-strong'))).toBeGreaterThanOrEqual(4.5);
  });

  it('serializes to the JSON both creation paths store', () => {
    expect(JSON.parse(defaultThemeJSON())).toEqual(DEFAULT_FORM_THEME);
  });
});

