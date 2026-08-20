import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { contrastRatio, parseCssColor } from '@mj-biz-apps/forms-entities';
import {
  PRESET_SWATCHES,
  hexToHsv,
  hsvToHex,
  isCompleteHex,
  normalizeHexInput,
} from './color-model';
import { COLOR_PICKER_STYLES } from './color-picker.styles';

/** WCAG AA for body text; the threshold the contrast note reports against. */
const AA_BODY = 4.5;

/**
 * One colour control: a swatch that opens a picker.
 *
 * It replaces a swatch sitting beside a hex box. Two controls editing one value is a question
 * the author should never have been asked — which of these is the real one? — and the native
 * `<input type="color">` behind the swatch made it worse by handing off to an OS dialog that
 * looks nothing like the rest of the builder and, on macOS, floats detached from the form being
 * designed. The hex has not gone away; it has moved INSIDE, where it belongs: the plane and the
 * hue slider are the path for an author choosing a colour, the hex field is the path for one who
 * already has a brand code, and the presets are the path for the majority who just want a good
 * colour fast.
 *
 * The contrast note is the other half of the legibility story. The widget used to silently swap
 * an unreadable colour for near-black, which reads as the control being broken; now it honours
 * what the author picked and this says, in a number, what it will cost them.
 */
@Component({
  selector: 'mjf-color-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <button
      type="button"
      class="cp-swatch"
      [style.background]="value()"
      [attr.aria-label]="label() + ': ' + value()"
      [attr.aria-expanded]="open()"
      [attr.title]="value()"
      aria-haspopup="dialog"
      (click)="toggle()"
    ></button>

    @if (open()) {
      <div class="cp-pop" role="dialog" [attr.aria-label]="label()">
        <!-- Saturation across, value down: the arrangement every picker an author has met uses,
             so the muscle memory transfers and nothing has to be learned here. -->
        <div
          #plane
          class="cp-plane"
          [style.background-color]="hueHex()"
          role="application"
          tabindex="0"
          [attr.aria-label]="'Saturation and brightness for ' + label()"
          (pointerdown)="startPlaneDrag($event)"
          (keydown)="onPlaneKeydown($event)"
        >
          <span class="cp-plane__dot" [style.left.%]="sat() * 100" [style.top.%]="(1 - val()) * 100"></span>
        </div>

        <input
          type="range"
          class="cp-hue"
          min="0"
          max="360"
          step="1"
          [attr.aria-label]="'Hue for ' + label()"
          [value]="hue()"
          (input)="onHue($event)"
        />

        <div class="cp-entry">
          <span class="cp-entry__chip" [style.background]="value()" aria-hidden="true"></span>
          <input
            type="text"
            class="cp-hex"
            spellcheck="false"
            autocomplete="off"
            maxlength="7"
            [attr.aria-label]="label() + ' hex code'"
            placeholder="#RRGGBB"
            [value]="draft()"
            (input)="onHexInput($event)"
            (blur)="onHexBlur()"
          />
        </div>

        @if (contrastNote(); as note) {
          <p class="cp-warn" role="status">
            <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
            <span>{{ note }}</span>
          </p>
        }

        <div class="cp-presets" role="group" aria-label="Suggested colours">
          @for (p of presets; track p) {
            <button
              type="button"
              class="cp-preset"
              [class.is-on]="p === value()"
              [style.background]="p"
              [attr.aria-label]="p"
              [attr.aria-pressed]="p === value()"
              [attr.title]="p"
              (click)="commit(p)"
            ></button>
          }
        </div>
      </div>
    }
  `,
  styles: [COLOR_PICKER_STYLES],
})
export class ColorPickerComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Current colour, `#rrggbb`. */
  public readonly value = input.required<string>();

  /** What this colour is for — used for every accessible name in the control. */
  public readonly label = input.required<string>();

  /**
   * The colour this one will be read against, when there is a meaningful pairing.
   *
   * Only supplied where the answer is unambiguous — titles against the page, button text
   * against the button. Left empty elsewhere rather than guessed, because a contrast warning
   * about the wrong pair is worse than none: it trains the author to ignore the real ones.
   */
  public readonly against = input<string>('');

  /** Emitted continuously while the author is choosing, so the preview tracks the drag. */
  public readonly valueChange = output<string>();

  private readonly planeRef = viewChild<ElementRef<HTMLElement>>('plane');

  protected readonly presets = PRESET_SWATCHES;
  protected readonly open = signal(false);

  /**
   * Hue is held separately from `value`, and is authoritative while the popover is open.
   *
   * Black and white have no hue to recover, so deriving it from the colour on every render
   * would snap the slider back to red the moment the author dragged brightness to the floor —
   * losing the hue they were half-way through choosing.
   */
  protected readonly hue = signal(0);
  private dragging = false;

  /** The hex field's live text, which is allowed to be incomplete while being typed. */
  protected readonly draft = signal('');

  protected readonly sat = computed(() => hexToHsv(this.value()).s);
  protected readonly val = computed(() => hexToHsv(this.value()).v);

  /** Pure hue at full saturation — the plane's base colour, over which the two ramps sit. */
  protected readonly hueHex = computed(() => hsvToHex({ h: this.hue(), s: 1, v: 1 }));

  /**
   * What this colour will cost in legibility, or null when it is fine (or has no known pairing).
   *
   * A number, not an adjective. "Low contrast" is advice an author can argue with; "2.1:1, AA
   * needs 4.5:1" is a fact they can act on, and it is the same figure any accessibility audit
   * will hand them later.
   */
  protected readonly contrastNote = computed<string | null>(() => {
    const other = parseCssColor(this.against());
    const mine = parseCssColor(this.value());
    if (!other || !mine) {
      return null;
    }
    const ratio = contrastRatio(other, mine);
    if (ratio >= AA_BODY) {
      return null;
    }
    return `${ratio.toFixed(1)}:1 — hard to read. AA needs ${AA_BODY}:1.`;
  });

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.hue.set(hexToHsv(this.value()).h);
    this.draft.set(this.value());
    this.open.set(true);
  }

  protected close(): void {
    this.open.set(false);
  }

  /** Dismiss on a click anywhere else — the behaviour every popover has trained authors to expect. */
  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.close();
    }
  }

  protected onHue(event: Event): void {
    const h = Number((event.target as HTMLInputElement).value);
    this.hue.set(h);
    this.commit(hsvToHex({ h, s: this.sat(), v: this.val() }));
  }

  protected startPlaneDrag(event: PointerEvent): void {
    const plane = this.planeRef()?.nativeElement;
    if (!plane) {
      return;
    }
    // Pointer CAPTURE, so a drag that leaves the little square keeps updating instead of
    // stopping dead at the edge — picking a colour is a gesture people overshoot constantly.
    plane.setPointerCapture(event.pointerId);
    this.dragging = true;
    this.applyPlanePoint(event);

    const move = (e: PointerEvent): void => {
      if (this.dragging) {
        this.applyPlanePoint(e);
      }
    };
    const up = (): void => {
      this.dragging = false;
      plane.removeEventListener('pointermove', move);
      plane.removeEventListener('pointerup', up);
      plane.removeEventListener('pointercancel', up);
    };
    plane.addEventListener('pointermove', move);
    plane.addEventListener('pointerup', up);
    plane.addEventListener('pointercancel', up);
  }

  /** Arrow keys nudge the plane, so the control is usable without a pointer at all. */
  protected onPlaneKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    this.commit(hsvToHex({ h: this.hue(), s: this.sat() + move[0], v: this.val() + move[1] }));
  }

  private applyPlanePoint(event: PointerEvent): void {
    const plane = this.planeRef()?.nativeElement;
    if (!plane) {
      return;
    }
    const box = plane.getBoundingClientRect();
    const s = (event.clientX - box.left) / box.width;
    const v = 1 - (event.clientY - box.top) / box.height;
    this.commit(hsvToHex({ h: this.hue(), s, v }));
  }

  protected onHexInput(event: Event): void {
    const typed = normalizeHexInput((event.target as HTMLInputElement).value);
    this.draft.set(typed);
    if (isCompleteHex(typed)) {
      this.hue.set(hexToHsv(typed).h);
      this.valueChange.emit(typed);
    }
  }

  /** An abandoned partial entry snaps back rather than sitting there looking like a value. */
  protected onHexBlur(): void {
    if (!isCompleteHex(this.draft())) {
      this.draft.set(this.value());
    }
  }

  protected commit(hex: string): void {
    this.draft.set(hex);
    this.valueChange.emit(hex);
  }
}
