import { describe, it, expect } from 'vitest';

import { PadCaptures } from './pad-captures';

describe('a capture may finish when nothing has changed under it', () => {
  it('lets an export emit', () => {
    const captures = new PadCaptures();

    const claim = captures.claim('q-sign');

    expect(captures.mayEmit(claim)).toBe(true);
  });
});

describe('clearing the pad retires the export already under way', () => {
  it('refuses to emit a signature the respondent has withdrawn', () => {
    const captures = new PadCaptures();
    const claim = captures.claim('q-sign');

    // The pen has lifted and `toBlob` is encoding. The respondent taps Clear before it lands.
    captures.supersede();

    // Emitting now uploads the discarded drawing and commits it as the answer, leaving a stored
    // signature under a pad the respondent has just emptied. Reproduced in a browser with a
    // delayed `toBlob`: the pad read "Signed — your saved signature is not shown here."
    expect(captures.mayEmit(claim)).toBe(false);
  });
});

describe('an export belongs to the question it was drawn on', () => {
  it('still emits after the pad has been re-pointed at the next question', () => {
    const captures = new PadCaptures();
    const claim = captures.claim('q-sign');

    // OneQuestion mode serves consecutive Signature questions through ONE pad instance, so
    // advancing re-points this pad without destroying it — while the export is still encoding.
    // The drawing is `q-sign`'s and must still be stored; it is the claim that says so, which is
    // why the subject travels with the capture instead of being read from the view on arrival.
    expect(captures.mayEmit(claim)).toBe(true);
    expect(claim.subject).toBe('q-sign');
  });
});

describe('a repaint may only touch the canvas it was started for', () => {
  it('refuses to paint once the pad stands for another question', () => {
    const captures = new PadCaptures();
    const claim = captures.claim('q-sign');

    // Decoding finished after the respondent advanced. Painting now puts one question's
    // signature on another question's pad — the ink-bleed this whole mechanism exists to stop.
    expect(captures.mayPaint(claim, 'q-countersign')).toBe(false);
    expect(captures.mayPaint(claim, 'q-sign')).toBe(true);
  });
});

describe('a repaint of the SAME question can still go stale', () => {
  it('refuses to paint over ink the respondent has since drawn', () => {
    const captures = new PadCaptures();
    const claim = captures.claim('q-sign');

    // The stored signature was still decoding when the respondent started drawing on what
    // looked like a blank pad. Their stroke is what they can see; the late bitmap must not
    // bury it. `supersede` is called from the pointer-down that began the stroke.
    captures.supersede();

    expect(captures.mayPaint(claim, 'q-sign')).toBe(false);
  });

  it('refuses to bring back ink the respondent has cleared', () => {
    const captures = new PadCaptures();
    const claim = captures.claim('q-sign');

    // Reproduced in a browser with a delayed `createImageBitmap`: Clear emptied the pad and
    // dropped the answer, then the stale bitmap repainted the signature and set the hint back
    // to "Signed." — a signature on screen that no longer exists and will not submit.
    captures.supersede();

    expect(captures.mayPaint(claim, 'q-sign')).toBe(false);
  });
});
