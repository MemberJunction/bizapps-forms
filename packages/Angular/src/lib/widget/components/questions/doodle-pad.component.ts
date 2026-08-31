/**
 * A freehand drawing pad that hands back a PNG `File` — and shows the one it was given.
 *
 * Its own component rather than another arm of `form-question`'s `@switch`, because it is the
 * one control here with real internal machinery — a bitmap, a pointer-drag state machine and a
 * canvas-to-blob export — none of which the surrounding component has any reason to see. What
 * it exposes is two lines wide: "here is the drawing for this question" in, "the respondent
 * drew something, here is the file" out.
 *
 * The question component then uploads that file through the SAME path a `FileUpload` answer
 * takes, which is why `Doodle` needs no server work at all: it is a file answer whose file
 * happens to be produced by a canvas instead of a file picker.
 *
 * IT IS CONTROLLED, like every other control in this widget, and that is not decoration. The
 * pad used to be write-only: ink lived in the canvas bitmap and in a private `hasInk` flag, both
 * of which die with the component. Angular destroys it whenever the respondent leaves the
 * section (Scroll) or steps to a question of another type (OneQuestion), so coming back built a
 * blank pad reading "Draw here." over an answer that was, in fact, safely stored — the
 * respondent's drawing "disappearing". The mirror-image failure was worse: in OneQuestion mode
 * two consecutive Doodle questions share ONE pad instance, so the first question's ink stayed on
 * screen for the second, which then read "Drawn." while unanswered. Painting from
 * {@link drawing} on every (re)binding is one mechanism that closes both.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { PadCaptures, type CaptureClaim } from './pad-captures';

/**
 * Bitmap resolution of the exported drawing, independent of the CSS size the pad is drawn at.
 *
 * Fixed rather than derived from the element's layout size so the stored artifact does not
 * change resolution with the viewport — a drawing captured on a phone and one captured on a
 * desktop should be the same artifact. Coordinates are scaled from CSS pixels on the way in.
 */
const PAD_WIDTH = 600;
const PAD_HEIGHT = 200;

const DOODLE_PAD_CSS = /* css */ `
:host { display: block; }

.mjf-doodle {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap-sm, 8px);
}

/* The pad is a FIELD, and looks like the other fields. It used to be a hardcoded white
   rectangle on the theory that a drawing wants paper — which read as a hole punched through any
   themed form, most obviously a dark one, where it was the single brightest thing on the page.

   The export is what that white was really protecting, and it does not need it: toPNG composites
   an OPAQUE fill of whatever the canvas resolves to, so the stored image carries its own
   background and is legible wherever it is later opened. Following the page instead is therefore
   safe AND self-correcting on contrast — --mjf-page-ink is the one colour the widget already
   guarantees is readable on --mjf-page-bg, so ink-on-paper here inherits that guarantee rather
   than restating it. Defined as tokens, not literals, so the canvas can read them back with
   getComputedStyle instead of the component hardcoding a colour. */
.mjf-doodle__pad {
  --mjf-doodle-paper: var(--mjf-input-bg);
  --mjf-doodle-ink: var(--mjf-page-ink);
  width: 100%;
  max-width: 100%;
  height: auto;
  aspect-ratio: 3 / 1;
  touch-action: none;
  cursor: crosshair;
  border: 1px dashed var(--mjf-page-edge);
  border-radius: var(--mjf-input-radius, 8px);
  background: var(--mjf-doodle-paper);
  color: var(--mjf-doodle-ink);
}
.mjf-doodle__pad:focus-visible { outline: none; border-color: var(--mjf-accent); box-shadow: var(--mjf-focus-ring); }

.mjf-doodle__bar { display: flex; align-items: center; gap: var(--mjf-gap-sm, 8px); }
.mjf-doodle__hint { flex: 1; margin: 0; font-size: var(--mjf-label, 0.8125rem); color: var(--mjf-page-ink-muted); }
.mjf-doodle__clear {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font: inherit;
  font-size: var(--mjf-label, 0.8125rem);
  border: 1px solid var(--mjf-page-edge);
  border-radius: var(--mjf-input-radius, 8px);
  background: var(--mjf-page-bg);
  color: var(--mjf-page-ink-soft);
}
.mjf-doodle__clear:hover:not(:disabled) { background: var(--mjf-page-sunken); }
.mjf-doodle__clear:disabled { opacity: 0.5; cursor: default; }
`;

@Component({
  selector: 'mjf-doodle-pad',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [DOODLE_PAD_CSS],
  template: `
    <div class="mjf-doodle">
      <canvas
        class="mjf-doodle__pad"
        #pad
        tabindex="0"
        role="img"
        [attr.aria-label]="label()"
        [width]="padWidth"
        [height]="padHeight"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
      ></canvas>
      <div class="mjf-doodle__bar">
        <p class="mjf-doodle__hint">{{ hint() }}</p>
        <button type="button" class="mjf-doodle__clear" [disabled]="!hasInk() && !recorded()" (click)="clear()">
          <i class="fa-solid fa-eraser" aria-hidden="true"></i> Clear
        </button>
      </div>
    </div>
  `,
})
export class DoodlePadComponent {
  /** Accessible name for the canvas. */
  public readonly label = input<string>('Doodle');
  /**
   * The drawing already held for {@link subject}, or `null` for an unanswered question.
   *
   * The same `File` this pad last emitted for it, handed back by whoever is holding the answer.
   * Painted onto the canvas whenever the pad is bound to a subject — see the constructor.
   */
  public readonly drawing = input<File | null>(null);
  /**
   * WHAT this pad is currently signing — the question id, in the widget.
   *
   * The repaint key, and the reason it is an input rather than something the pad infers: the pad
   * cannot tell a new instance apart from an old one re-pointed at the next question, and those
   * need the same response. A value it has never seen means the canvas belongs to something else
   * now and must be redrawn from {@link image}.
   */
  public readonly subject = input<string>('');
  /**
   * Whether an answer is on record for {@link subject}, whether or not it can be shown.
   *
   * A separate fact from {@link image}, and it earns its place on exactly the occasions the pad
   * would otherwise lie: a drawing captured in an earlier session (the widget holds the answer
   * id, not the artifact) and one whose repaint failed to decode. Both leave a pad with no ink
   * over an answer that stands, and "Draw here." invites the respondent to redo work that is
   * already done — or worse, reads as the drawing having been lost again.
   */
  public readonly recorded = input<boolean>(false);
  /**
   * Emitted once a stroke settles, carrying the drawing AND the subject it was drawn on.
   *
   * The subject travels with the file because the export finishes later than the gesture that
   * started it, and an `output()` is routed by whatever the view is bound to when it fires. In
   * OneQuestion mode one pad instance serves consecutive Doodle questions, so a respondent
   * who advances while `toBlob` is still encoding had the first question's drawing stored as the
   * SECOND question's answer. Naming the subject here is what makes that impossible to express.
   */
  public readonly drawn = output<DoodleCapture>();
  /** Emitted when the respondent clears the pad. */
  public readonly cleared = output<void>();

  protected readonly padWidth = PAD_WIDTH;
  protected readonly padHeight = PAD_HEIGHT;
  protected readonly hasInk = signal(false);

  /**
   * What the pad says about itself — three states, because there are three.
   *
   * The middle one is the honest answer to "there is an answer here but no picture of it": the
   * respondent is told their drawing stands, and Clear stays available so they can withdraw a
   * drawing they cannot see. Saying nothing, or saying "Draw here.", would both be the control
   * claiming an empty answer that is not empty.
   */
  protected readonly hint = computed(() => {
    if (this.hasInk()) {
      return 'Drawn.';
    }
    return this.recorded() ? 'Drawn — your saved drawing is not shown here.' : 'Draw here.';
  });

  private readonly pad = viewChild<ElementRef<HTMLCanvasElement>>('pad');
  /** Whether the pen is currently down — a stroke is being drawn right now. */
  private penDown = false;
  /** Which outstanding exports and repaints still speak for this pad. See {@link PadCaptures}. */
  private readonly captures = new PadCaptures();

  constructor() {
    // Put the stored drawing back whenever this pad starts standing for a subject — a fresh
    // instance after the section was left and re-entered, or the same instance re-pointed at the
    // next question without being destroyed.
    //
    // `subject()` and the canvas are the only things tracked, deliberately. The canvas is tracked
    // because a view query resolves after construction and the repaint has to wait for it.
    // `drawing()` is NOT: every stroke starts an upload that rewrites the held file, so
    // repainting on it would wipe the drawing out from under the respondent mid-stroke.
    // Reading it untracked means this fires exactly when the pad changes what it stands for.
    effect(() => {
      const canvas = this.pad()?.nativeElement;
      const subject = this.subject();
      if (canvas) {
        void untracked(() => this.repaint(canvas, subject, this.drawing()));
      }
    });
  }

  protected onPointerDown(event: PointerEvent): void {
    const ctx = this.beginStroke(event);
    if (!ctx) {
      return;
    }
    // Without preventDefault a touch drag scrolls the page instead of drawing, and the stroke
    // arrives as a handful of disconnected points.
    event.preventDefault();
    // The respondent is drawing, so anything still in flight describes a pad that no longer
    // exists: a repaint would bury this stroke under the stored image, and the previous stroke's
    // export is about to be superseded by this one's anyway.
    this.captures.supersede();
    this.penDown = true;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.penDown) {
      return;
    }
    const canvas = this.pad()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return;
    }
    const point = this.toBitmapPoint(canvas, event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    this.hasInk.set(true);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.penDown) {
      return;
    }
    this.penDown = false;
    const canvas = this.pad()?.nativeElement;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    // Export on every stroke, deliberately.
    //
    // A settle timer looks like the obvious improvement here — a drawing is many strokes and
    // each one starts its own upload — and it was tried. It cannot be made safe. The
    // window it opens is real time in which the pad already reads "Drawn." and the respondent
    // can tap Next or Submit, which destroys this component with the export still pending; and it
    // cannot be flushed on the way out, because `output()` registers its OWN destroy hook in a
    // field initializer that runs BEFORE any hook a constructor adds, so by then `emit()` only
    // logs "Unexpected emit for destroyed OutputRef" and returns. `emitPng` is async besides, so
    // the emit lands after destruction regardless. The respondent would be left with a null answer
    // under a pad that says "Drawn." — a worse bug than the one being optimised away.
    //
    // Correctness does not depend on coalescing anyway: every upload carries a generation stamp
    // (see FormQuestionComponent.uploadFile), so the LAST one started wins no matter which
    // arrives first, and that is the most complete drawing. What the extra strokes cost is extra
    // stored files, which is quota, not data. Quota is the cheaper thing to lose.
    if (this.hasInk()) {
      void this.emitPng();
    }
  }

  /**
   * Draw `drawing` onto the pad, or empty it when there is none.
   *
   * `createImageBitmap` rather than an `Image` + object URL: it decodes the same PNG with no URL
   * whose lifetime someone then has to own. A decode that fails clears {@link hasInk} and stops
   * there, which lands the pad on the {@link recorded} wording — "drawn, just not shown" — and
   * never on "Draw here.", because the answer is still there and inviting the
   * respondent to redo it would be the original bug wearing a different face.
   */
  private async repaint(canvas: HTMLCanvasElement, subject: string, drawing: File | null): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    // Synchronously, before the decode: on a re-point the previous question's ink has to leave
    // the screen NOW, not whenever the next image finishes decoding.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!drawing) {
      this.hasInk.set(false);
      return;
    }
    const claim = this.captures.claim(subject);
    try {
      const bitmap = await createImageBitmap(drawing);
      // The pad may have been cleared, drawn on, or re-pointed while that decoded.
      if (!this.captures.mayPaint(claim, this.subject())) {
        bitmap.close();
        return;
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      this.hasInk.set(true);
    } catch (err) {
      if (!this.captures.mayPaint(claim, this.subject())) {
        // A rejection for a pad that has moved on says nothing about the pad now on screen —
        // reporting it would mark a visible drawing as missing, or stop a stroke in progress
        // from being emitted.
        return;
      }
      this.hasInk.set(false);
      console.warn(
        `[mj-form] could not redraw the stored drawing for "${subject}", so the pad shows it as ` +
          'recorded but not displayed. The answer itself is unaffected.',
        err,
      );
    }
  }

  /**
   * Wipe the pad and tell the parent the answer is gone.
   *
   * Superseding is half the work. The parent retires the running UPLOAD, which is not the same
   * thing: an export still encoding has not started its upload yet, so there is nothing there to
   * retire — it would begin a fresh one afterwards and commit the drawing the respondent has
   * just withdrawn, leaving a stored drawing under an empty pad.
   */
  public clear(): void {
    this.captures.supersede();
    const canvas = this.pad()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.hasInk.set(false);
    this.cleared.emit();
  }

  /** Start a stroke, configuring the brush from the pad's own computed colours. */
  private beginStroke(event: PointerEvent): CanvasRenderingContext2D | undefined {
    const canvas = this.pad()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return undefined;
    }
    canvas.setPointerCapture(event.pointerId);
    // Read the ink from CSS rather than naming a colour here, so the token stays the single
    // place it is defined and an installer can restyle the pad without touching TypeScript.
    ctx.strokeStyle = getComputedStyle(canvas).color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const point = this.toBitmapPoint(canvas, event);
    ctx.moveTo(point.x, point.y);
    return ctx;
  }

  /** CSS-pixel pointer position → bitmap coordinates, which differ whenever the pad is scaled. */
  private toBitmapPoint(canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  /**
   * Export the drawing as a PNG on an OPAQUE paper background.
   *
   * `toBlob` on the live canvas would export the strokes over transparency, and a dark-ink
   * drawing on a transparent background disappears entirely against a dark viewer. Compositing
   * onto the paper colour first makes the artifact self-contained.
   */
  private async emitPng(): Promise<void> {
    const claim = this.captures.claim(this.subject());
    const canvas = this.pad()?.nativeElement;
    if (!canvas) {
      return;
    }
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const ctx = flat.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.fillStyle = getComputedStyle(canvas).backgroundColor;
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => flat.toBlob(resolve, 'image/png'));
    if (!blob) {
      console.warn(
        `[mj-form] the browser could not encode the drawing made for "${claim.subject}", so ` +
          'this stroke was not stored. The respondent can draw again.',
      );
      return;
    }
    if (!this.captures.mayEmit(claim)) {
      return;
    }
    this.drawn.emit({
      subject: claim.subject,
      file: new File([blob], 'doodle.png', { type: 'image/png' }),
    });
  }
}

/** One finished capture: the drawing, and the subject it was made for. */
export interface DoodleCapture {
  readonly subject: string;
  readonly file: File;
}
