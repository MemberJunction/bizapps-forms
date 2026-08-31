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

import {
  DOODLE_PEN_COLORS,
  DOODLE_PEN_WIDTH_NAMES,
  doodlePenLineWidth,
  type DoodlePen,
  type DoodlePenColor,
  type DoodlePenWidth,
} from '@mj-biz-apps/forms-entities';

import { PadCaptures, type CaptureClaim } from './pad-captures';
import { addStroke, drawStroke, type DoodlePoint, type DoodleStroke } from './doodle-strokes';

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

/* THE PEN PALETTE, and why every hue is mixed toward the page ink.

   These five are hues, and a hue cannot be guaranteed legible on a page whose colour the AUTHOR
   picks — a fixed red pen on a deep-red form is invisible, and the exported PNG composites onto
   that same page colour (see emitPng), so it is invisible in the stored artifact too. Mixing each
   hue toward --mjf-page-ink pulls it toward the one colour the widget already guarantees reads on
   this page (theming.ts repairs the ink when it does not), which is the same construction
   --mjf-status-error uses one file over and for the same reason.

   MEASURED, at 65% hue / 35% ink, as a WCAG contrast ratio against the composited background —
   3:1 is the bar for a non-text graphic (WCAG 1.4.11), and a pen stroke is one:

                                Ink    Blue   Green  Amber  Red    Violet
     white page (the default)   16.91  6.16   5.91   6.37   6.60   6.32
     dark form (#12151a)        18.29  8.27   8.47   8.12   7.73   8.24
     deep red form (#7a1020)    10.92  4.94   5.06   4.85   4.61   4.92
     navy form (#0d2a4a)        14.51  6.56   6.72   6.44   6.13   6.54
     cream form (#faf3e0)       15.27  5.56   5.34   5.75   5.96   5.70

   THE KNOWN FLOOR: a page at MID luminance (a flat #808080) defeats every hue at every mix —
   the pens measure ~1.5 there and no ratio of hue to ink fixes it without collapsing all five
   into the ink. The Ink pen still clears (4.28), it is the default, and the coloured pens only appear
   when an author turns them on, so the failure needs a deliberately chosen mid-grey page AND a
   deliberately opened palette. Widening the mix to rescue that case would make all five pens look
   alike on every other form, which is the whole point of having five.

   The five hues are the Insights chart palette's, by value rather than by import: forms-viz.ts
   says not to import it from lib/widget/ (the widget is themed from FormStyle.Tokens, not from
   the Explorer cascade), but a doodle pen and a chart series should still look like the same
   product. */
.mjf-doodle__pad {
  --mjf-doodle-pen-Ink: var(--mjf-doodle-ink);
  --mjf-doodle-pen-Blue: color-mix(in srgb, #378ADD 65%, var(--mjf-doodle-ink));
  --mjf-doodle-pen-Green: color-mix(in srgb, #1D9E75 65%, var(--mjf-doodle-ink));
  --mjf-doodle-pen-Amber: color-mix(in srgb, #BA7517 65%, var(--mjf-doodle-ink));
  --mjf-doodle-pen-Red: color-mix(in srgb, #D85A30 65%, var(--mjf-doodle-ink));
  --mjf-doodle-pen-Violet: color-mix(in srgb, #7F77DD 65%, var(--mjf-doodle-ink));
}

.mjf-doodle__bar { display: flex; align-items: center; gap: var(--mjf-gap-sm, 8px); flex-wrap: wrap; }

/* The pen controls. 44px is the WCAG 2.5.8 / platform minimum for a touch target, and these are
   the controls a respondent uses one-handed while their other hand holds the phone — so they are
   sized for a thumb, not for a cursor. flex-wrap on the row is what keeps them from overflowing
   a narrow embed rather than shrinking below that. */
.mjf-doodle__tools { display: flex; align-items: center; gap: var(--mjf-gap-sm, 8px); flex-wrap: wrap; }
.mjf-doodle__pens, .mjf-doodle__widths { display: flex; gap: 4px; }
.mjf-doodle__pen, .mjf-doodle__width {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  font: inherit;
  background: var(--mjf-page-bg);
  border: 1px solid var(--mjf-page-edge);
  border-radius: var(--mjf-input-radius, 8px);
  color: var(--mjf-page-ink-soft);
}
/* Selected is a BORDER and a ring, never colour alone: the swatch is already carrying a hue as
   data, so using hue to also mean "chosen" would be unreadable to anyone who cannot compare the
   two (WCAG 1.4.1). The width buttons get the same treatment for consistency. */
.mjf-doodle__pen[aria-pressed='true'], .mjf-doodle__width[aria-pressed='true'] {
  border-color: var(--mjf-accent);
  box-shadow: var(--mjf-focus-ring);
}
.mjf-doodle__pen:focus-visible, .mjf-doodle__width:focus-visible {
  outline: none;
  border-color: var(--mjf-accent);
  box-shadow: var(--mjf-focus-ring);
}
/* The swatch itself — a dot of the pen's own colour, ringed so a pen that nearly matches the
   button background still has an edge. */
.mjf-doodle__swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--mjf-page-edge-strong);
}
/* The width buttons show the line they draw, at the width they draw it. */
.mjf-doodle__rule { width: 22px; border-radius: 999px; background: currentColor; }
.mjf-doodle__hint { flex: 1; margin: 0; font-size: var(--mjf-label, 0.8125rem); color: var(--mjf-page-ink-muted); }
/* Undo and Clear are the same button in two moods, so they share one class. 44px minimum height
   for the same touch-target reason as the pen controls. */
.mjf-doodle__action {
  flex: none;
  min-height: 44px;
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
.mjf-doodle__action:hover:not(:disabled) { background: var(--mjf-page-sunken); }
.mjf-doodle__action:focus-visible { outline: none; border-color: var(--mjf-accent); box-shadow: var(--mjf-focus-ring); }
.mjf-doodle__action:disabled, .mjf-doodle__pen:disabled, .mjf-doodle__width:disabled { opacity: 0.5; cursor: default; }
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
      @if (pen().offerColor || pen().offerWidth) {
        <div class="mjf-doodle__tools">
          @if (pen().offerColor) {
            <div class="mjf-doodle__pens" role="group" aria-label="Pen colour">
              @for (color of penColors; track color) {
                <button
                  type="button"
                  class="mjf-doodle__pen"
                  [attr.aria-pressed]="color === activeColor()"
                  [attr.aria-label]="color === 'Ink' ? 'Default pen' : color + ' pen'"
                  [title]="color === 'Ink' ? 'Default pen' : color + ' pen'"
                  (click)="chooseColor(color)"
                >
                  <span class="mjf-doodle__swatch" [style.background]="cssPen(color)"></span>
                </button>
              }
            </div>
          }
          @if (pen().offerWidth) {
            <div class="mjf-doodle__widths" role="group" aria-label="Stroke width">
              @for (width of penWidths; track width) {
                <button
                  type="button"
                  class="mjf-doodle__width"
                  [attr.aria-pressed]="width === activeWidth()"
                  [attr.aria-label]="width + ' stroke'"
                  [title]="width + ' stroke'"
                  (click)="chooseWidth(width)"
                >
                  <span class="mjf-doodle__rule" [style.height.px]="ruleHeight(width)"></span>
                </button>
              }
            </div>
          }
        </div>
      }
      <div class="mjf-doodle__bar">
        <p class="mjf-doodle__hint">{{ hint() }}</p>
        <button type="button" class="mjf-doodle__action" [disabled]="!canUndo()" (click)="undo()">
          <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Undo
        </button>
        <button type="button" class="mjf-doodle__action mjf-doodle__clear" [disabled]="!hasInk() && !recorded()" (click)="clear()">
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
  /** Emitted when the respondent clears the pad, or undoes back to an empty one. */
  public readonly cleared = output<void>();
  /**
   * The pen this question draws with, and which controls the respondent gets.
   *
   * ONE input rather than four, and validated before it arrives: `FormQuestionComponent` parses
   * it out of the question's open `Settings` blob with `doodlePen`, which falls back key by key,
   * so everything reaching this component is already a value the pad can render. That is what
   * keeps "an unknown colour must not break the pad" out of the pad entirely.
   */
  public readonly pen = input<DoodlePen>({ color: 'Ink', width: 'Medium', offerColor: false, offerWidth: false });

  protected readonly padWidth = PAD_WIDTH;
  protected readonly padHeight = PAD_HEIGHT;
  protected readonly penColors = DOODLE_PEN_COLORS;
  protected readonly penWidths = DOODLE_PEN_WIDTH_NAMES;

  /**
   * The drawing, as data. THE change #98 turns on.
   *
   * The pad used to keep only a `hasInk` boolean, with the ink itself living in the canvas
   * bitmap — which meant there was nothing to undo FROM. These two signals are the drawing now,
   * and the bitmap is a render of them:
   *
   *   - {@link base} is everything the respondent did NOT draw this session: a restored PNG, plus
   *     any stroke that has aged out of {@link strokes}. Flat pixels, no history, and undo stops
   *     at it — see {@link undo}.
   *   - {@link strokes} is this session's undo history, capped by `MAX_RETAINED_STROKES`.
   */
  private readonly base = signal<HTMLCanvasElement | null>(null);
  private readonly strokes = signal<readonly DoodleStroke[]>([]);

  /**
   * Whether there is anything on the pad — DERIVED, where it used to be a fourth piece of state.
   *
   * A `hasInk` that had to be `.set` correctly from the repaint, the pointer handler, the failed
   * decode and Clear is a fact stated in four places; asking the model removes three of them.
   */
  protected readonly hasInk = computed(() => this.base() !== null || this.strokes().length > 0);

  /** Whether undo has anything left to take back — this session's strokes, and nothing else. */
  protected readonly canUndo = computed(() => this.strokes().length > 0);

  /**
   * The pen in the respondent's hand: their pick, or the author's default until they pick.
   *
   * `null` rather than seeding the signal with the author's colour, because the author's default
   * arrives as an input and a signal initialised from an input freezes at whatever it was on the
   * first render — this pad is re-pointed at the next question without being destroyed.
   */
  private readonly chosenColor = signal<DoodlePenColor | null>(null);
  private readonly chosenWidth = signal<DoodlePenWidth | null>(null);
  protected readonly activeColor = computed(() => this.chosenColor() ?? this.pen().color);
  protected readonly activeWidth = computed(() => this.chosenWidth() ?? this.pen().width);

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
  /**
   * The stroke being drawn right now, accumulating points until the pen lifts.
   *
   * It carries its own colour and width, fixed at pointer-DOWN. Reading the pen at commit time
   * instead would let a stroke be stored in a pen it was not drawn in — the respondent draws,
   * taps another swatch, lifts, and the model disagrees with what they watched appear.
   */
  private current: { color: string; width: number; points: DoodlePoint[] } | null = null;
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

  /**
   * Extend the stroke in progress — recorded AND drawn, in that order.
   *
   * Still an incremental `lineTo`/`stroke` rather than a repaint per sample, deliberately: this
   * is the hot path on a phone, and repainting the whole model on every pointer move would make
   * a long drawing progressively laggier. Only undo and eviction repaint from the model.
   */
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
    this.current?.points.push(point);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
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
    // A tap that never moved is not a stroke — the same as before this pad had a model, where
    // `hasInk` was only set on pointer MOVE. Committing one would make a stray finger-brush on a
    // scrolling page an answer, and start an upload for it.
    const stroke = this.current;
    this.current = null;
    if (stroke && stroke.points.length > 1) {
      this.commitStroke(stroke);
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
   * Take back the last stroke of THIS session.
   *
   * WHERE UNDO STOPS, and why that is the only coherent answer. The pad is controlled: it repaints
   * from a stored PNG whenever it binds to a subject, and a PNG is flat pixels with no history in
   * it. So a restored drawing cannot be un-drawn stroke by stroke — there are no strokes. Undo
   * therefore reaches back through {@link strokes} (this session) and stops at {@link base} (the
   * restored image, plus anything aged out of the cap). Erasing the base instead would mean Undo
   * silently destroying work from an earlier visit that the respondent cannot see it about to
   * destroy; Clear is the control that removes everything, and it says so.
   *
   * EVERY UNDO RE-EXPORTS. The stored file is what the response actually carries, so leaving it
   * showing the stroke just removed would put the artifact and the screen quietly out of step —
   * and the respondent would have no way to tell. Undoing back to a genuinely empty pad drops the
   * answer instead, exactly as Clear does, so no orphan file is left behind.
   */
  public undo(): void {
    if (this.strokes().length === 0) {
      return;
    }
    // An undo changes what the pad MEANS, so it retires the in-flight work for the same reasons a
    // new stroke and Clear do: a repaint would bury the result under the stored image, and the
    // previous stroke's export describes a drawing that no longer exists.
    this.captures.supersede();
    this.strokes.update((strokes) => strokes.slice(0, -1));
    this.paint();
    if (this.hasInk()) {
      void this.emitPng();
    } else {
      this.cleared.emit();
    }
  }

  /** Pick a pen. Affects the NEXT stroke only — strokes already drawn keep what they were drawn with. */
  protected chooseColor(color: DoodlePenColor): void {
    this.chosenColor.set(color);
  }

  protected chooseWidth(width: DoodlePenWidth): void {
    this.chosenWidth.set(width);
  }

  /** The CSS a swatch shows, so the button is painted with the pen it selects. */
  protected cssPen(color: DoodlePenColor): string {
    return `var(--mjf-doodle-pen-${color})`;
  }

  /** The line a width button draws, at least 2px so `Fine` is visible as a button glyph. */
  protected ruleHeight(width: DoodlePenWidth): number {
    return Math.max(2, Math.round(doodlePenLineWidth(width)));
  }

  /**
   * Retain a finished stroke, making room by baking the oldest into the base image.
   *
   * The cap bounds memory; it must not bound the DRAWING. An evicted stroke is rendered into
   * {@link base} on its way out, so it stays on screen and in every export — it simply stops
   * being reachable by undo.
   */
  private commitStroke(stroke: DoodleStroke): void {
    const { strokes, evicted } = addStroke(this.strokes(), stroke);
    for (const old of evicted) {
      this.bakeIntoBase(old);
    }
    this.strokes.set(strokes);
  }

  /** Render a stroke permanently into the base image, creating one if this is the first. */
  private bakeIntoBase(stroke: DoodleStroke): void {
    const base = this.base() ?? this.newBaseCanvas();
    const ctx = base.getContext('2d');
    if (!ctx) {
      return;
    }
    drawStroke(ctx, stroke);
    this.base.set(base);
  }

  /** A blank offscreen canvas at the pad's bitmap resolution. */
  private newBaseCanvas(): HTMLCanvasElement {
    const base = document.createElement('canvas');
    base.width = PAD_WIDTH;
    base.height = PAD_HEIGHT;
    return base;
  }

  /** Repaint the visible canvas from the model: base image first, then every retained stroke. */
  private paint(): void {
    const canvas = this.pad()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const base = this.base();
    if (base) {
      ctx.drawImage(base, 0, 0);
    }
    for (const stroke of this.strokes()) {
      drawStroke(ctx, stroke);
    }
  }

  /**
   * Draw `drawing` onto the pad, or empty it when there is none.
   *
   * `createImageBitmap` rather than an `Image` + object URL: it decodes the same PNG with no URL
   * whose lifetime someone then has to own. A decode that fails leaves the model EMPTY and stops
   * there, which lands the pad on the {@link recorded} wording — "drawn, just not shown" — and
   * never on "Draw here.", because the answer is still there and inviting the
   * respondent to redo it would be the original bug wearing a different face.
   *
   * The decoded image becomes {@link base}, not a stroke: a PNG has no stroke history, so undo
   * has nothing in it to take back and correctly stops here. The session's own strokes are
   * dropped too — they belong to whatever this pad stood for a moment ago.
   */
  private async repaint(canvas: HTMLCanvasElement, subject: string, drawing: File | null): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    // Synchronously, before the decode: on a re-point the previous question's ink has to leave
    // the screen NOW, not whenever the next image finishes decoding.
    this.resetModel();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!drawing) {
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
      const base = this.newBaseCanvas();
      base.getContext('2d')?.drawImage(bitmap, 0, 0, base.width, base.height);
      bitmap.close();
      this.base.set(base);
      this.paint();
    } catch (err) {
      if (!this.captures.mayPaint(claim, this.subject())) {
        // A rejection for a pad that has moved on says nothing about the pad now on screen —
        // reporting it would mark a visible drawing as missing, or stop a stroke in progress
        // from being emitted.
        return;
      }
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
    this.resetModel();
    const canvas = this.pad()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.cleared.emit();
  }

  /**
   * Forget the whole drawing — base image and undo history together.
   *
   * Both, always. A reset that kept the base would leave a restored image under a pad that has
   * moved to another question, and one that kept the strokes would replay them onto it.
   */
  private resetModel(): void {
    this.base.set(null);
    this.strokes.set([]);
    this.current = null;
  }

  /** Start a stroke, configuring the brush from the pen currently in the respondent's hand. */
  private beginStroke(event: PointerEvent): CanvasRenderingContext2D | undefined {
    const canvas = this.pad()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return undefined;
    }
    canvas.setPointerCapture(event.pointerId);
    const color = this.strokeColor(canvas);
    const width = this.strokeWidth();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const point = this.toBitmapPoint(canvas, event);
    this.current = { color, width, points: [point] };
    ctx.moveTo(point.x, point.y);
    return ctx;
  }

  /**
   * The RESOLVED colour the next stroke draws in.
   *
   * Still read out of CSS rather than named in TypeScript, which is what keeps the tokens the
   * single place a colour is defined and lets an installer restyle the pad without touching this
   * file — the default pen is literally the pad's own `color`. A chosen pen resolves its
   * `--mjf-doodle-pen-*` token the same way, so both pens come from the same mechanism and both
   * arrive here as an `rgb(...)` the canvas and a stored stroke can hold.
   */
  private strokeColor(canvas: HTMLCanvasElement): string {
    const style = getComputedStyle(canvas);
    const color = this.activeColor();
    if (color === 'Ink') {
      return style.color;
    }
    // A token the stylesheet somehow does not define resolves to '' — fall back to the ink rather
    // than handing the canvas an empty strokeStyle, which it ignores, leaving an invisible stroke.
    return style.getPropertyValue(`--mjf-doodle-pen-${color}`).trim() || style.color;
  }

  private strokeWidth(): number {
    return doodlePenLineWidth(this.activeWidth());
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
