/**
 * A draw-your-signature pad that hands back a PNG `File`.
 *
 * Its own component rather than another arm of `form-question`'s `@switch`, because it is the
 * one control here with real internal machinery — a bitmap, a pointer-drag state machine and a
 * canvas-to-blob export — none of which the surrounding component has any reason to see. What
 * it exposes is one line wide: "the respondent drew something, here is the file".
 *
 * The question component then uploads that file through the SAME path a `FileUpload` answer
 * takes, which is why `Signature` needs no server work at all: it is a file answer whose file
 * happens to be produced by a canvas instead of a file picker.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
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
        <p class="mjf-sig__hint">{{ hasInk() ? 'Signed.' : 'Draw your signature above.' }}</p>
        <button type="button" class="mjf-sig__clear" [disabled]="!hasInk()" (click)="clear()">
          <i class="fa-solid fa-eraser" aria-hidden="true"></i> Clear
        </button>
      </div>
    </div>
  `,
})
export class SignaturePadComponent {
  /** Accessible name for the canvas. */
  public readonly label = input<string>('Signature');
  /** Emitted once a stroke settles, carrying the signature as a PNG file. */
  public readonly drawn = output<File>();
  /** Emitted when the respondent clears the pad. */
  public readonly cleared = output<void>();

  protected readonly padWidth = PAD_WIDTH;
  protected readonly padHeight = PAD_HEIGHT;
  protected readonly hasInk = signal(false);

  private readonly pad = viewChild<ElementRef<HTMLCanvasElement>>('pad');
  private drawing = false;

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
