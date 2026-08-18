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

/* The pad is a piece of PAPER, not a themed surface, and these two tokens are why the ink is
   readable in the exported PNG. A signature drawn with the page's --mj-text-primary would be
   near-white in dark mode, and the stored image would then be invisible to whoever opens the
   response later on a white background. Defining them here also lets the canvas read them back
   with getComputedStyle instead of the component hardcoding a colour. */
.mjf-sig__pad {
  --mjf-sig-paper: #ffffff;
  --mjf-sig-ink: #101828;
  width: 100%;
  max-width: 100%;
  height: auto;
  aspect-ratio: 3 / 1;
  touch-action: none;
  cursor: crosshair;
  border: 1px dashed var(--mj-border-default);
  border-radius: var(--mjf-input-radius, 8px);
  background: var(--mjf-sig-paper);
  color: var(--mjf-sig-ink);
}
.mjf-sig__pad:focus-visible { outline: none; border-color: var(--mjf-accent); box-shadow: var(--mjf-focus-ring); }

.mjf-sig__bar { display: flex; align-items: center; gap: var(--mjf-gap-sm, 8px); }
.mjf-sig__hint { flex: 1; margin: 0; font-size: var(--mjf-label, 0.8125rem); color: var(--mj-text-muted); }
.mjf-sig__clear {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font: inherit;
  font-size: var(--mjf-label, 0.8125rem);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-input-radius, 8px);
  background: var(--mj-bg-surface);
  color: var(--mj-text-secondary);
}
.mjf-sig__clear:hover:not(:disabled) { background: var(--mj-bg-surface-sunken); }
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
