/**
 * A draw-your-signature pad that hands back a PNG `File` — and shows the one it was given.
 *
 * Its own component rather than another arm of `form-question`'s `@switch`, because it is the
 * one control here with real internal machinery — a bitmap, a pointer-drag state machine and a
 * canvas-to-blob export — none of which the surrounding component has any reason to see. What
 * it exposes is two lines wide: "here is the signature for this question" in, "the respondent
 * drew something, here is the file" out.
 *
 * The question component then uploads that file through the SAME path a `FileUpload` answer
 * takes, which is why `Signature` needs no server work at all: it is a file answer whose file
 * happens to be produced by a canvas instead of a file picker.
 *
 * IT IS CONTROLLED, like every other control in this widget, and that is not decoration. The
 * pad used to be write-only: ink lived in the canvas bitmap and in a private `hasInk` flag, both
 * of which die with the component. Angular destroys it whenever the respondent leaves the
 * section (Scroll) or steps to a question of another type (OneQuestion), so coming back built a
 * blank pad reading "Draw your signature above." over an answer that was, in fact, safely
 * stored — the respondent's signature "disappearing". The mirror-image failure was worse: in
 * OneQuestion mode two consecutive Signature questions share ONE pad instance, so the first
 * question's ink stayed on screen for the second, which then read "Signed." while unanswered.
 * Painting from {@link image} on every (re)binding is one mechanism that closes both.
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

/**
 * Bitmap resolution of the exported signature, independent of the CSS size the pad is drawn at.
 *
 * Fixed rather than derived from the element's layout size so the stored artifact does not
 * change resolution with the viewport — a signature captured on a phone and one captured on a
 * desktop should be the same document. Coordinates are scaled from CSS pixels on the way in.
 */
const PAD_WIDTH = 600;
const PAD_HEIGHT = 200;

const SIGNATURE_PAD_CSS = /* css */ `
:host { display: block; }

.mjf-sig {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap-sm, 8px);
}

/* The pad is a FIELD, and looks like the other fields. It used to be a hardcoded white
   rectangle on the theory that a signature is paper — which read as a hole punched through any
   themed form, most obviously a dark one, where it was the single brightest thing on the page.

   The export is what that white was really protecting, and it does not need it: toPNG composites
   an OPAQUE fill of whatever the canvas resolves to, so the stored image carries its own
   background and is legible wherever it is later opened. Following the page instead is therefore
   safe AND self-correcting on contrast — --mjf-page-ink is the one colour the widget already
   guarantees is readable on --mjf-page-bg, so ink-on-paper here inherits that guarantee rather
   than restating it. Defined as tokens, not literals, so the canvas can read them back with
   getComputedStyle instead of the component hardcoding a colour. */
.mjf-sig__pad {
  --mjf-sig-paper: var(--mjf-input-bg);
  --mjf-sig-ink: var(--mjf-page-ink);
  width: 100%;
  max-width: 100%;
  height: auto;
  aspect-ratio: 3 / 1;
  touch-action: none;
  cursor: crosshair;
  border: 1px dashed var(--mjf-page-edge);
  border-radius: var(--mjf-input-radius, 8px);
  background: var(--mjf-sig-paper);
  color: var(--mjf-sig-ink);
}
.mjf-sig__pad:focus-visible { outline: none; border-color: var(--mjf-accent); box-shadow: var(--mjf-focus-ring); }

.mjf-sig__bar { display: flex; align-items: center; gap: var(--mjf-gap-sm, 8px); }
.mjf-sig__hint { flex: 1; margin: 0; font-size: var(--mjf-label, 0.8125rem); color: var(--mjf-page-ink-muted); }
.mjf-sig__clear {
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
.mjf-sig__clear:hover:not(:disabled) { background: var(--mjf-page-sunken); }
.mjf-sig__clear:disabled { opacity: 0.5; cursor: default; }
`;

@Component({
  selector: 'mjf-signature-pad',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [SIGNATURE_PAD_CSS],
  template: `
    <div class="mjf-sig">
      <canvas
        class="mjf-sig__pad"
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
      <div class="mjf-sig__bar">
        <p class="mjf-sig__hint">{{ hint() }}</p>
        <button type="button" class="mjf-sig__clear" [disabled]="!hasInk() && !recorded()" (click)="clear()">
          <i class="fa-solid fa-eraser" aria-hidden="true"></i> Clear
        </button>
      </div>
    </div>
  `,
})
export class SignaturePadComponent {
  /** Accessible name for the canvas. */
  public readonly label = input<string>('Signature');
  /**
   * The signature already held for {@link subject}, or `null` for an unsigned question.
   *
   * The same `File` this pad last emitted for it, handed back by whoever is holding the answer.
   * Painted onto the canvas whenever the pad is bound to a subject — see the constructor.
   */
  public readonly image = input<File | null>(null);
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
   * would otherwise lie: a signature captured in an earlier session (the widget holds the answer
   * id, not the artifact) and one whose repaint failed to decode. Both leave a pad with no ink
   * over an answer that stands, and "Draw your signature above." invites the respondent to redo
   * work that is already done — or worse, reads as the signature having been lost again.
   */
  public readonly recorded = input<boolean>(false);
  /** Emitted once a stroke settles, carrying the signature as a PNG file. */
  public readonly drawn = output<File>();
  /** Emitted when the respondent clears the pad. */
  public readonly cleared = output<void>();

  protected readonly padWidth = PAD_WIDTH;
  protected readonly padHeight = PAD_HEIGHT;
  protected readonly hasInk = signal(false);

  /**
   * What the pad says about itself — three states, because there are three.
   *
   * The middle one is the honest answer to "there is an answer here but no picture of it": the
   * respondent is told their signature stands, and Clear stays available so they can withdraw a
   * signature they cannot see. Saying nothing, or saying "Draw your signature above.", would
   * both be the control claiming an empty answer that is not empty.
   */
  protected readonly hint = computed(() => {
    if (this.hasInk()) {
      return 'Signed.';
    }
    return this.recorded() ? 'Signed — your saved signature is not shown here.' : 'Draw your signature above.';
  });

  private readonly pad = viewChild<ElementRef<HTMLCanvasElement>>('pad');
  private drawing = false;

  constructor() {
    // Put the stored signature back whenever this pad starts standing for a subject — a fresh
    // instance after the section was left and re-entered, or the same instance re-pointed at the
    // next question without being destroyed.
    //
    // `subject()` and the canvas are the only things tracked, deliberately. The canvas is tracked
    // because a view query resolves after construction and the repaint has to wait for it.
    // `image()` is NOT: every stroke starts an upload that rewrites the held file, so repainting
    // on the image would wipe the drawing out from under the respondent mid-signature. Reading it
    // untracked means this fires exactly when the pad changes what it stands for.
    effect(() => {
      const canvas = this.pad()?.nativeElement;
      const subject = this.subject();
      if (canvas) {
        void untracked(() => this.repaint(canvas, subject, this.image()));
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
    this.drawing = true;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.drawing) {
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
    if (!this.drawing) {
      return;
    }
    this.drawing = false;
    const canvas = this.pad()?.nativeElement;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    // Export on every stroke, deliberately.
    //
    // A settle timer looks like the obvious improvement here — a two-word signature is several
    // strokes and each one starts its own upload — and it was tried. It cannot be made safe. The
    // window it opens is real time in which the pad already reads "Signed." and the respondent
    // can tap Next or Submit, which destroys this component with the export still pending; and it
    // cannot be flushed on the way out, because `output()` registers its OWN destroy hook in a
    // field initializer that runs BEFORE any hook a constructor adds, so by then `emit()` only
    // logs "Unexpected emit for destroyed OutputRef" and returns. `emitPng` is async besides, so
    // the emit lands after destruction regardless. The respondent would be left with a null answer
    // under a pad that says "Signed." — a worse bug than the one being optimised away.
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
   * Draw `image` onto the pad, or empty it when there is none.
   *
   * `createImageBitmap` rather than an `Image` + object URL: it decodes the same PNG with no URL
   * whose lifetime someone then has to own. A decode that fails clears {@link hasInk} and stops
   * there, which lands the pad on the {@link recorded} wording — "signed, just not shown" — and
   * never on "Draw your signature above.", because the answer is still there and inviting the
   * respondent to redo it would be the original bug wearing a different face.
   */
  private async repaint(canvas: HTMLCanvasElement, subject: string, image: File | null): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!image) {
      this.hasInk.set(false);
      return;
    }
    try {
      const bitmap = await createImageBitmap(image);
      // The pad may have been re-pointed while that decoded, and the paint for the subject it
      // now stands for owns the canvas. Dropping this one is the whole guard: both paints are
      // idempotent, so a repeat of the SAME subject is harmless either way.
      if (this.subject() !== subject) {
        bitmap.close();
        return;
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      this.hasInk.set(true);
    } catch (err) {
      this.hasInk.set(false);
      console.warn(
        `[mj-form] could not redraw the stored signature for "${subject}", so the pad shows it as ` +
          'recorded but not displayed. The answer itself is unaffected.',
        err,
      );
    }
  }

  /** Wipe the pad and tell the parent the answer is gone. */
  public clear(): void {
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
   * signature on a transparent background disappears entirely against a dark viewer. Compositing
   * onto the paper colour first makes the artifact self-contained.
   */
  private async emitPng(): Promise<void> {
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
    if (blob) {
      this.drawn.emit(new File([blob], 'signature.png', { type: 'image/png' }));
    }
  }
}
