/**
 * Focus for the builder's Properties pane when it is a bottom sheet (UI audit F14). Below 900px
 * the pane opens over the canvas when something is selected; focus goes into it, and back to the
 * card that opened it when it closes. At desktop widths the pane is a column and focus never moves.
 */
import { describe, expect, it } from 'vitest';
import { InspectorSheet, type FocusTarget } from './inspector-sheet';

const target = (connected = true): FocusTarget & { focused: number } => ({
  isConnected: connected,
  focused: 0,
  focus() { this.focused++; },
});

describe('InspectorSheet', () => {
  it('on a narrow screen, opening says to move focus into the sheet', () => {
    expect(new InspectorSheet(() => true).Opened(target())).toBe(true);
  });

  it('at desktop width it never takes focus', () => {
    const sheet = new InspectorSheet(() => false);
    expect(sheet.Opened(target())).toBe(false);
    expect(sheet.Closed()).toBeNull();
  });

  it('closing hands focus back to the card that opened it, once', () => {
    const sheet = new InspectorSheet(() => true);
    const card = target();
    sheet.Opened(card);
    expect(sheet.Closed()).toBe(card);
    expect(sheet.Closed()).toBeNull();
  });

  it('a second selection while open keeps the FIRST opener, which is where the author came from', () => {
    // Selecting another question from inside the sheet (a rule's source link, say) must not make
    // the sheet's own button the place focus returns to.
    const sheet = new InspectorSheet(() => true);
    const card = target();
    sheet.Opened(card);
    expect(sheet.Opened(target())).toBe(false);
    expect(sheet.Closed()).toBe(card);
  });

  it('does not hand back an opener that has left the page (its card was deleted)', () => {
    const sheet = new InspectorSheet(() => true);
    sheet.Opened(target(false));
    expect(sheet.Closed()).toBeNull();
  });

  it('opening with nothing focused still opens the sheet', () => {
    const sheet = new InspectorSheet(() => true);
    expect(sheet.Opened(null)).toBe(true);
    expect(sheet.Closed()).toBeNull();
  });
});
