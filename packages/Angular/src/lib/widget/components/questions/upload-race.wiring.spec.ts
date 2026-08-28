/**
 * Structural guards for the file/signature upload race.
 *
 * These classes use `inject()` and cannot be instantiated in this suite's node environment, so
 * what is checkable is the source. The decisions below are invisible to a unit test of the pure
 * helpers and produce silently wrong DATA when they regress, on the one answer type where the
 * artifact's exact content is the entire point.
 *
 * THE RACE. `onPointerUp` exports the pad whenever there is ink on it, and `hasInk` stays true
 * after the first stroke — so a two-word signature fires an upload per stroke. `uploadFile` had
 * no sequencing, so those uploads ran concurrently and the last `valueChange.emit` to arrive won,
 * not the last one started. On a lossy mobile link that is routinely the FIRST stroke: the stored
 * answer becomes a partial signature the respondent never agreed to. The same gap let a cleared
 * signature come back — `clear()` emits null, then a still-running upload resolves and emits its
 * fileId over the top, leaving a stored signature beside an empty pad reading "Draw your
 * signature above."
 *
 * The race rules themselves now live in `core/upload-store.ts` and are unit-tested directly in
 * `upload-store.spec.ts`, which is a stronger check than any regex over this file. What is left
 * for these guards is the WIRING: that this component hands every upload outcome to the store —
 * which commits the answer itself, so a result that resolves late cannot be routed by the view to
 * the wrong question — and that it keeps no upload state of its own, the state that used to bleed
 * between questions when Angular reused an instance.
 *
 * Comments are stripped before every assertion — the source explains these same decisions, and a
 * guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const question = (): string => stripped('form-question.component.ts');
const pad = (): string => stripped('signature-pad.component.ts');

describe('only the newest upload may write the answer', () => {
  it('takes a token from the store for every upload', () => {
    expect(question()).toMatch(/const token = this\.uploads\.begin\(questionId, file\);/);
  });

  it('hands both outcomes to the store, which owns the supersede decision', () => {
    // Both paths matter: a stale SUCCESS overwrites the good answer, and a stale FAILURE clears
    // an answer the newer upload just stored correctly.
    expect(question()).toMatch(/this\.uploads\.succeed\(token, result\.fileId\)/);
    expect(question()).toMatch(/this\.uploads\.fail\(token, message\)/);
  });

  it('never routes an upload result back through the view', () => {
    // `valueChange` is routed by whichever question the TEMPLATE is bound to when it fires, which
    // after an await is not reliably the question the upload was for. In OneQuestion mode one
    // component serves the whole deck, so the answer landed on the next question; in Scroll the
    // component is destroyed on leaving the page, so the answer was dropped while the store still
    // showed "done". The upload path must not emit at all.
    const uploadPath = question().slice(question().indexOf('private async uploadFile'));
    expect(uploadPath).not.toMatch(/valueChange\.emit/);
  });

  it('routes progress through the token too, so the bar cannot run backwards', () => {
    expect(question()).toMatch(/\(fraction\) => this\.uploads\.setProgress\(token, fraction\)/);
  });
});

describe('upload state belongs to a question, not to this component', () => {
  it('keeps no upload state of its own', () => {
    // The defect these replaced: six private fields outlived the question they described, so a
    // recycled instance announced one file question's upload against another's.
    expect(question()).not.toMatch(/private uploadGeneration/);
    expect(question()).not.toMatch(/private lastFile/);
    expect(question()).not.toMatch(/uploadStatus = signal/);
    expect(question()).not.toMatch(/uploadFileName = signal/);
  });

  it('reads what it displays from the store, keyed by the question it is rendering', () => {
    expect(question()).toMatch(/this\.uploads\.viewFor\(this\.question\(\)\.id\)/);
  });

  it('retrieves the file it retries — and the one it repaints — by question, not by remembering it', () => {
    // One projection, from the store's record for THIS question: `viewFor(...).file`. A field on
    // the component would be the recycled-instance defect again, one indirection further out.
    expect(question()).toMatch(/uploadedFile = computed\(\(\) => this\.upload\(\)\.file\)/);
    expect(question()).toMatch(/const last = this\.uploadedFile\(\);/);
  });
});

describe('clearing a signature cannot be undone by an upload already in flight', () => {
  it('clears through the store, which retires the running upload', () => {
    expect(question()).toMatch(/onSignatureCleared\(\)[\s\S]{0,300}this\.uploads\.clear\(this\.question\(\)\.id\);/);
  });
});

describe('a multi-stroke signature stays correct without deferring the export', () => {
  it('exports on pointer-up rather than on a timer', () => {
    // A settle timer was tried and removed. It opens a window of real time in which the pad reads
    // "Signed." and the respondent can tap Next or Submit — destroying the component with the
    // export pending — and it CANNOT be flushed on destroy, because `output()` registers its own
    // destroy hook in a field initializer that runs before any constructor hook, so `emit()` by
    // then only warns and returns. A null answer under a pad claiming "Signed." is worse than the
    // duplicate uploads the timer saved.
    expect(pad()).not.toMatch(/setTimeout\(/);
    expect(pad()).not.toMatch(/SIGNATURE_SETTLE_MS/);
    expect(pad()).toMatch(/onPointerUp\([\s\S]{0,1400}void this\.emitPng\(\);/);
  });

  it('relies on the store\'s token, not on ordering, for which image wins', () => {
    // This is what makes exporting per stroke safe: the last upload STARTED wins regardless of
    // which arrives first, and that is the most complete drawing.
    expect(question()).toMatch(/const token = this\.uploads\.begin\(questionId, file\);/);
  });
});

describe('the pad shows the signature already held for the question it is bound to', () => {
  it('takes the drawing and the subject as inputs, rather than trusting its own canvas', () => {
    // The canvas and `hasInk` die with the component, and Angular destroys this one on every
    // section change. A pad that can only render what it was drawn on shows an empty box over a
    // stored answer — the "my signature disappeared" report. Controlled, like every other control
    // in `form-question.component.html`.
    expect(pad()).toMatch(/image = input<File \| null>\(null\)/);
    expect(pad()).toMatch(/subject = input<string>\(''\)/);
  });

  it('repaints on the subject, never on the image', () => {
    // Every stroke starts an upload that rewrites the held file. Repainting on `image()` would
    // therefore wipe the drawing out from under the respondent mid-signature; repainting on the
    // subject fires exactly when the pad changes what it stands for.
    const repaintEffect = /effect\(\(\) => \{[\s\S]{0,400}this\.subject\(\)[\s\S]{0,400}untracked\([\s\S]{0,200}this\.repaint\(/;
    expect(pad()).toMatch(repaintEffect);
  });

  it('never claims "Signed." over paper it failed to draw on', () => {
    // `hasInk` drives both the hint and the Clear button, so a decode that fails has to leave it
    // false — and say why, since the respondent's only remaining move is to sign again.
    expect(pad()).toMatch(/catch \(err\) \{\s*this\.hasInk\.set\(false\);\s*console\.warn\(/);
  });

  it('is handed the file and the id by the question component', () => {
    const template = stripped('form-question.component.html');
    expect(template).toMatch(/<mjf-signature-pad[\s\S]{0,200}\[subject\]="q\.id"/);
    expect(template).toMatch(/<mjf-signature-pad[\s\S]{0,200}\[image\]="uploadedFile\(\)"/);
  });
});

describe('a control never renders empty over an answer that stands', () => {
  it('asks the ANSWER whether one is on record, not the upload store', () => {
    // The store is per-widget memory; the answer outlives it. A control reading only the store
    // shows nothing for a file attached in an earlier session — the signature-pad bug one level
    // up, and the reason this reads `value()`.
    expect(question()).toMatch(/answerRecorded = computed\(\(\) => \{[\s\S]{0,200}const value = this\.value\(\);/);
  });

  it('gives the pad the fact, and the pad a third thing to say', () => {
    expect(stripped('form-question.component.html')).toMatch(/\[recorded\]="answerRecorded\(\)"/);
    expect(pad()).toMatch(/recorded = input<boolean>\(false\)/);
    // Three states, because there are three: signed and shown, signed and not shown, unsigned.
    expect(pad()).toMatch(/return this\.recorded\(\) \? 'Signed[^']*' : 'Draw your signature above\.'/);
  });

  it('lets a respondent withdraw a signature they cannot see', () => {
    expect(pad()).toMatch(/\[disabled\]="!hasInk\(\) && !recorded\(\)"/);
  });

  it('says so on a file question too', () => {
    expect(stripped('form-question.component.html')).toMatch(
      /@case \('idle'\) \{[\s\S]{0,300}answerRecorded\(\)[\s\S]{0,200}A file is attached to this answer\./,
    );
  });
});

describe('the file control has ONE status display', () => {
  it('hides the native input, whose "No file chosen" it cannot write to', () => {
    // The input keeps the id, the aria and the focus — it is still the control. Only its
    // browser-drawn status text goes, because that text contradicted ours after every remount
    // and no API can set it.
    const template = stripped('form-question.component.html');
    expect(template).toMatch(/<input\s+class="mjf-visually-hidden"[\s\S]{0,200}type="file"/);
    expect(template).toMatch(/<label class="mjf-file__pick" \[attr\.for\]="inputId\(\)" aria-hidden="true">/);
  });

  it('draws the focus ring on the stand-in, since the input is off screen', () => {
    const css = stripped('form-question.component.css');
    expect(css).toMatch(/\.mjf-file:focus-within \.mjf-file__pick \{[\s\S]{0,160}--mjf-focus-ring/);
    // And positions the clipped input where the control is, so focusing it scrolls to the right
    // place on a failed submit.
    expect(css).toMatch(/\.mjf-file \{[\s\S]{0,300}position: relative;/);
  });
});
