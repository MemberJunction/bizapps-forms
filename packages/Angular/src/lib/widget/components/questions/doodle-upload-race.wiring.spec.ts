/**
 * Structural guards for the file/doodle upload race.
 *
 * These classes use `inject()` and cannot be instantiated in this suite's node environment, so
 * what is checkable is the source. The decisions below are invisible to a unit test of the pure
 * helpers and produce silently wrong DATA when they regress, on the one answer type where the
 * artifact's exact content is the entire point.
 *
 * THE RACE. `onPointerUp` exports the pad whenever there is ink on it, and `hasInk` stays true
 * after the first stroke — so a many-stroke drawing fires an upload per stroke. `uploadFile` had
 * no sequencing, so those uploads ran concurrently and the last `valueChange.emit` to arrive won,
 * not the last one started. On a lossy mobile link that is routinely the FIRST stroke: the stored
 * answer becomes a partial drawing the respondent never settled on. The same gap let a cleared
 * drawing come back — `clear()` emits null, then a still-running upload resolves and emits its
 * fileId over the top, leaving a stored drawing beside an empty pad reading "Draw here."
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
const pad = (): string => stripped('doodle-pad.component.ts');

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
    expect(question()).toMatch(/localFile = computed\(\(\) => this\.upload\(\)\.file\)/);
    expect(question()).toMatch(/const last = this\.localFile\(\);/);
  });
});

describe('clearing a drawing cannot be undone by an upload already in flight', () => {
  it('clears through the store, which retires the running upload', () => {
    expect(question()).toMatch(/onDoodleCleared\(\)[\s\S]{0,300}this\.uploads\.clear\(this\.question\(\)\.id\);/);
  });
});

describe('a multi-stroke drawing stays correct without deferring the export', () => {
  it('exports on pointer-up rather than on a timer', () => {
    // A settle timer was tried and removed. It opens a window of real time in which the pad reads
    // "Drawn." and the respondent can tap Next or Submit — destroying the component with the
    // export pending — and it CANNOT be flushed on destroy, because `output()` registers its own
    // destroy hook in a field initializer that runs before any constructor hook, so `emit()` by
    // then only warns and returns. A null answer under a pad claiming "Drawn." is worse than the
    // duplicate uploads the timer saved.
    expect(pad()).not.toMatch(/setTimeout\(/);
    expect(pad()).not.toMatch(/DOODLE_SETTLE_MS/);
    expect(pad()).toMatch(/onPointerUp\([\s\S]{0,1400}void this\.emitPng\(\);/);
  });

  it('relies on the store\'s token, not on ordering, for which image wins', () => {
    // This is what makes exporting per stroke safe: the last upload STARTED wins regardless of
    // which arrives first, and that is the most complete drawing.
    expect(question()).toMatch(/const token = this\.uploads\.begin\(questionId, file\);/);
  });
});

describe('the pad shows the drawing already held for the question it is bound to', () => {
  it('takes the drawing and the subject as inputs, rather than trusting its own canvas', () => {
    // The canvas and `hasInk` die with the component, and Angular destroys this one on every
    // section change. A pad that can only render what it was drawn on shows an empty box over a
    // stored answer — the "my drawing disappeared" report. Controlled, like every other control
    // in `form-question.component.html`.
    expect(pad()).toMatch(/drawing = input<File \| null>\(null\)/);
    expect(pad()).toMatch(/subject = input<string>\(''\)/);
  });

  it('repaints on the subject, never on the image', () => {
    // Every stroke starts an upload that rewrites the held file. Repainting on `image()` would
    // therefore wipe the drawing out from under the respondent mid-stroke; repainting on the
    // subject fires exactly when the pad changes what it stands for.
    const repaintEffect = /effect\(\(\) => \{[\s\S]{0,400}this\.subject\(\)[\s\S]{0,400}untracked\([\s\S]{0,200}this\.repaint\(/;
    expect(pad()).toMatch(repaintEffect);
  });

  it('never claims "Drawn." over paper it failed to draw on', () => {
    // `hasInk` drives both the hint and the Clear button, so a decode that fails has to leave it
    // empty — and say why, since the respondent's only remaining move is to draw again. It must
    // do neither for a pad that has moved on: a rejection from the PREVIOUS question would
    // otherwise mark a visible drawing as missing.
    //
    // `hasInk` is DERIVED from the model now, so "leave it false" is structural rather than a
    // `.set` to remember: the model is emptied before the decode starts and only a SUCCESSFUL
    // decode puts a base back. These two assertions are that pair.
    expect(pad()).toMatch(/this\.resetModel\(\);[\s\S]{0,300}await createImageBitmap\(drawing\)/);
    expect(pad()).toMatch(
      /catch \(err\) \{[\s\S]{0,400}mayPaint\(claim, this\.subject\(\)\)[\s\S]{0,400}console\.warn\(/,
    );
  });

  it('is handed the file and the id by the question component', () => {
    const template = stripped('form-question.component.html');
    expect(template).toMatch(/<mjf-doodle-pad[\s\S]{0,200}\[subject\]="q\.id"/);
    expect(template).toMatch(/<mjf-doodle-pad[\s\S]{0,200}\[drawing\]="localFile\(\)"/);
  });
});

describe('a control never renders empty over an answer that stands', () => {
  it('asks the ANSWER whether one is on record, not the upload store', () => {
    // The store is per-widget memory; the answer outlives it. A control reading only the store
    // shows nothing for a file attached in an earlier session — the doodle-pad bug one level
    // up, and the reason this reads `value()`.
    expect(question()).toMatch(/answerRecorded = computed\(\(\) => \{[\s\S]{0,200}const value = this\.value\(\);/);
  });

  it('gives the pad the fact, and the pad a third thing to say', () => {
    expect(stripped('form-question.component.html')).toMatch(/\[recorded\]="answerRecorded\(\)"/);
    expect(pad()).toMatch(/recorded = input<boolean>\(false\)/);
    // Three states, because there are three: drawn and shown, drawn and not shown, blank.
    expect(pad()).toMatch(/return this\.recorded\(\) \? 'Drawn[^']*' : 'Draw here\.'/);
  });

  it('lets a respondent withdraw a drawing they cannot see', () => {
    expect(pad()).toMatch(/\[disabled\]="!hasInk\(\) && !recorded\(\)"/);
  });

  it('says so on a file question too', () => {
    expect(stripped('form-question.component.html')).toMatch(
      /@case \('idle'\) \{[\s\S]{0,300}answerRecorded\(\)[\s\S]{0,200}A file is attached to this answer\./,
    );
  });
});

describe('the file control has ONE status display', () => {
  it('makes the native input transparent rather than hiding it', () => {
    // The input keeps the id, the aria, the focus AND ITS SIZE — it is still the control, and a
    // file input is a native drop target. Clipping it to 1×1 removed drag-and-drop from every
    // desktop respondent while looking like a pure styling change; only its browser-drawn status
    // text should go, because that text contradicted ours after every remount.
    const template = stripped('form-question.component.html');
    const css = stripped('form-question.component.css');
    expect(template).toMatch(/<input\s+class="mjf-file__input"[\s\S]{0,200}type="file"/);
    expect(template).not.toMatch(/<input\s+class="mjf-visually-hidden"[\s\S]{0,200}type="file"/);
    expect(css).toMatch(/\.mjf-file__input \{[\s\S]{0,220}opacity: 0;/);
    expect(css).toMatch(/\.mjf-file__input \{[\s\S]{0,220}inset: 0;/);
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

describe('nothing that finishes late may speak for a pad that has moved on', () => {
  it('claims the pad before every export and repaint', () => {
    expect(pad()).toMatch(/const claim = this\.captures\.claim\(this\.subject\(\)\);/);
    expect(pad()).toMatch(/const claim = this\.captures\.claim\(subject\);/);
  });

  it('retires them when the respondent clears the pad', () => {
    // The parent retires the running UPLOAD, which is a different thing: an export still
    // encoding has not started one yet, so it begins a fresh upload afterwards and commits the
    // drawing that was just withdrawn.
    expect(pad()).toMatch(/public clear\(\): void \{\s*this\.captures\.supersede\(\);/);
  });

  it('retires them when a new stroke begins', () => {
    expect(pad()).toMatch(/this\.captures\.supersede\(\);\s*this\.penDown = true;/);
  });

  it('checks the claim before emitting an export', () => {
    expect(pad()).toMatch(/if \(!this\.captures\.mayEmit\(claim\)\) \{\s*return;\s*\}/);
  });

  it('sends the subject with the file rather than letting the view choose one', () => {
    // `output()` is routed by whatever the template is bound to when it fires, which after an
    // await is not reliably the question the drawing was made on.
    expect(pad()).toMatch(/this\.drawn\.emit\(\{\s*subject: claim\.subject,/);
    expect(question()).toMatch(/await this\.uploadFile\(capture\.file, capture\.subject\);/);
  });
});

describe('undo is a change of meaning, so it plays by the same rules as a stroke and Clear', () => {
  /**
   * Undo does three things beyond removing a stroke, and each one is a silent defect if dropped.
   * None is reachable from this package's node test environment (there is no canvas), so they are
   * guarded here at the source — the same posture the rest of this file takes.
   */
  it('retires whatever is in flight, as a new stroke and Clear do', () => {
    // Without it, the export started by the stroke being REMOVED lands afterwards and uploads the
    // drawing that just went away, and a repaint still decoding buries the corrected canvas.
    expect(pad()).toMatch(/public undo\(\): void \{[\s\S]{0,200}this\.captures\.supersede\(\);/);
  });

  it('re-exports, so the stored file never disagrees with the screen', () => {
    // The response carries the FILE. Leaving it showing the undone stroke would be a discrepancy
    // the respondent has no way to see, and the reviewer no way to question.
    expect(pad()).toMatch(/public undo\(\)[\s\S]{0,700}if \(this\.hasInk\(\)\) \{\s*void this\.emitPng\(\);/);
  });

  it('drops the answer when it empties the pad, exactly as Clear does', () => {
    // Otherwise undoing back to blank leaves a stored file behind with nothing on screen to
    // explain it — the mirror of the bug `clear()` exists to prevent.
    expect(pad()).toMatch(/public undo\(\)[\s\S]{0,800}\} else \{\s*this\.cleared\.emit\(\);/);
  });

  it('stops at the restored image rather than erasing it', () => {
    // A repainted PNG is flat pixels with no stroke history, so there is nothing in it to undo.
    // Undo reads THIS SESSION's strokes and nothing else; `base` is only reachable through Clear.
    expect(pad()).toMatch(/canUndo = computed\(\(\) => this\.strokes\(\)\.length > 0\)/);
    expect(pad()).toMatch(/public undo\(\): void \{\s*if \(this\.strokes\(\)\.length === 0\) \{\s*return;/);
    // And the button says so, rather than presenting a no-op.
    expect(pad()).toMatch(/\[disabled\]="!canUndo\(\)"/);
  });

  it('keeps a stroke that ages out of the cap ON the drawing', () => {
    // The cap bounds memory, not the picture. An evicted stroke is baked into the base image on
    // its way out; dropping it instead would make a long drawing erase its own beginning.
    expect(pad()).toMatch(/for \(const old of evicted\) \{\s*this\.bakeIntoBase\(old\);/);
  });
});

describe('the pen the author configured reaches the pad already validated', () => {
  it('parses the open settings blob through the shared contract, not in the pad', () => {
    // `Settings` is reachable by paste and by API. Validating at the boundary is what lets the
    // pad assume every value it is handed is renderable — an unknown colour never gets that far.
    expect(question()).toMatch(/doodlePen = computed\(\(\) => doodlePen\(this\.question\(\)\.settings\)\)/);
    expect(stripped('form-question.component.html')).toMatch(/\[pen\]="doodlePen\(\)"/);
  });
});

describe('the file status is part of what the input announces', () => {
  it('gives the status line an id and describes the input with it', () => {
    // A re-created file input reports "No file chosen" whatever is stored, and `aria-live` only
    // covers changes — not text already on the page when the control is rendered.
    expect(stripped('form-question.component.html')).toMatch(
      /<p class="mjf-file__status" \[id\]="statusId\(\)"/,
    );
    expect(question()).toMatch(/if \(this\.hasFileStatus\(\)\) \{\s*ids\.push\(this\.statusId\(\)\);/);
  });
});
