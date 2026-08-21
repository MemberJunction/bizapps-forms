import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isThreadWarm } from '@mj-biz-apps/forms-entities';
import { FormChatService } from './form-chat.service';
import { parseChatMarkdown } from './chat-markdown';
import { FORM_CHAT_STYLES } from './form-chat.styles';

/**
 * "Chat to create" — the one way AI authoring is reached.
 *
 * ── IT REPLACED A BUTTON, AND THAT IS THE POINT. ─────────────────────────────────────────────
 * The old surface was a button that opened a panel with a textarea and a Generate button: one
 * shot, no memory, and nothing to do afterwards but start again. A box that stays where it is and
 * remembers what you said is a different affordance — the second message ("make it warmer", "what
 * goes with navy?") is the one the old surface could not accept at all.
 *
 * ── THE PANEL IS IN THE TOP LAYER, NOT IN THE HOST'S BOX. ────────────────────────────────────
 * It opens as a popover, positioned over the pill it grew from. That is not decoration: all three
 * hosts sit inside `overflow: hidden` containers — the Design tab's rail is 340px wide and clips
 * everything — so a panel drawn in normal flow is either cropped or forced to be as narrow as its
 * narrowest home. The top layer escapes every ancestor's clipping and stacking context at once,
 * which is the only reason one component can be the same size in all three places.
 *
 * The panel covers the pill and carries its own composer in the same spot, so the box you were
 * typing in stays where your eyes already are and the conversation grows upward out of it.
 *
 * ── IT OPENS ITSELF WHEN THE CONVERSATION IS STILL WARM. ─────────────────────────────────────
 * An author who says "create a form that collects name, email and address" on the forms list is
 * carried into the form that was made — and the thread, which the server re-files onto the new
 * form, has to be visible when they arrive or it reads as having been thrown away. Rather than
 * plumb "I just navigated" between two components, the thread's own last timestamp answers it:
 * spoken in a moment ago means still mid-conversation, spoken in last week means leave it shut.
 */
@Component({
  selector: 'mjf-form-chat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  styles: [FORM_CHAT_STYLES],
  template: `
    <div class="fc">
      <!-- The anchor. Always in flow, so the host's layout never moves; hidden while the panel
           sits on top of it, so there is only ever one input on screen. -->
      <button
        type="button"
        class="fc-pill"
        #anchor
        [class.fc-pill--covered]="expanded()"
        [class.fc-pill--drafting]="!!draft.trim()"
        [attr.aria-expanded]="expanded()"
        [attr.aria-label]="placeholder() + ' — open the form assistant'"
        (click)="expand()"
      >
        <span class="fc-mark" aria-hidden="true">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
        </span>
        <span class="fc-pill-text">{{ draft.trim() || placeholder() }}</span>
        @if (unread()) {
          <span class="fc-unread" aria-label="New reply">1</span>
        }
        <span class="fc-go fc-go--ghost" aria-hidden="true">
          <i class="fa-solid fa-arrow-up"></i>
        </span>
      </button>

      <div
        class="fc-panel"
        #panel
        popover="auto"
        role="dialog"
        aria-label="Form assistant"
        [attr.aria-busy]="chat.busy()"
        (toggle)="onToggle($event)"
      >
        <header class="fc-head">
          <span class="fc-mark fc-mark--head" aria-hidden="true">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
          </span>
          <h2 class="fc-title">Form assistant</h2>
          <span class="fc-badge">Beta</span>
          <button
            type="button"
            class="fc-icon-btn"
            (click)="collapse()"
            aria-label="Close the form assistant"
            title="Close"
          >
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
          </button>
        </header>

        <div
          class="fc-thread"
          #thread
          [class.fc-thread--filled]="chat.turns().length > 0 || chat.busy()"
          role="log"
          aria-live="polite"
          aria-label="Conversation"
        >
          @if (chat.turns().length === 0) {
            <div class="fc-blank">
              <p class="fc-blank-line">{{ blankLine() }}</p>
              <div class="fc-chips">
                @for (chip of suggestions(); track chip) {
                  <button type="button" class="fc-chip" (click)="askFor(chip)">
                    <i class="fa-solid fa-arrow-right fc-chip-arrow" aria-hidden="true"></i>
                    {{ chip }}
                  </button>
                }
              </div>
            </div>
          }
          @for (turn of chat.turns(); track $index) {
            @if (turn.role === 'User') {
              <div class="fc-said">
                <div class="fc-bubble">{{ turn.message }}</div>
              </div>
            } @else {
              <div class="fc-reply" [class.fc-reply--failed]="turn.role === 'Error'">
                <span class="fc-mark fc-mark--turn" aria-hidden="true">
                  <i
                    class="fa-solid"
                    [class.fa-wand-magic-sparkles]="turn.role !== 'Error'"
                    [class.fa-triangle-exclamation]="turn.role === 'Error'"
                  ></i>
                </span>
                <div class="fc-prose">
                  @for (block of blocksFor(turn.message); track $index) {
                    @if (block.kind === 'paragraph') {
                      <p class="fc-p">
                        @for (span of block.spans; track $index) {
                          @if (span.bold) { <strong>{{ span.text }}</strong> }
                          @else if (span.code) { <code>{{ span.text }}</code> }
                          @else { <span>{{ span.text }}</span> }
                        }
                      </p>
                    } @else {
                      <ul class="fc-ul">
                        @for (item of block.items; track $index) {
                          <li>
                            @for (span of item; track $index) {
                              @if (span.bold) { <strong>{{ span.text }}</strong> }
                              @else if (span.code) { <code>{{ span.text }}</code> }
                              @else { <span>{{ span.text }}</span> }
                            }
                          </li>
                        }
                      </ul>
                    }
                  }
                </div>
              </div>
            }
          }
          @if (chat.busy()) {
            <div class="fc-reply">
              <span class="fc-mark fc-mark--turn fc-mark--busy" aria-hidden="true">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
              </span>
              <div class="fc-working">
                <span class="fc-working-line">{{ workingLine() }}</span>
                @if (chat.progress(); as p) {
                  <span class="fc-meter" role="progressbar" [attr.aria-valuenow]="p.percent">
                    <span class="fc-meter-fill" [style.width.%]="p.percent"></span>
                  </span>
                } @else {
                  <span class="fc-dots" aria-hidden="true">
                    <span class="fc-dot"></span><span class="fc-dot"></span><span class="fc-dot"></span>
                  </span>
                }
              </div>
            </div>
          }
        </div>

        <div class="fc-composer">
          <input
            #box
            type="text"
            class="fc-input"
            enterkeyhint="send"
            autocomplete="off"
            [placeholder]="placeholder()"
            [(ngModel)]="draft"
            [disabled]="chat.busy()"
            (keydown.enter)="send()"
            (keydown.escape)="collapse()"
            [attr.aria-label]="placeholder()"
          />
          <button
            type="button"
            class="fc-go fc-go--solid"
            [disabled]="!draft.trim() || chat.busy()"
            (click)="send()"
            aria-label="Send"
            title="Send"
          >
            <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class FormChatComponent {
  protected readonly chat = inject(FormChatService);

  /** The form on screen, or null on the forms list. Scopes the thread and the assistant's context. */
  public readonly formId = input<string | null>(null);

  /** Fired when a turn created a form, so the host can open it. */
  public readonly formCreated = output<string>();

  /** Fired when a turn restyled the open form, so the host can reload its style. */
  public readonly formRestyled = output<string>();

  /** Fired when a turn changed the form's content — today, a picture on a screen. */
  public readonly formChanged = output<void>();

  protected draft = '';
  private readonly _expanded = signal(false);
  protected readonly expanded = this._expanded.asReadonly();

  /**
   * A reply arrived while the panel was shut.
   *
   * The unfinished exchange is the thing an author is most likely to be holding in their head, and
   * a closed panel gives it nowhere to show. One dot on the pill is enough to close that loop; it
   * clears the moment the panel is opened, because at that point they can see it.
   */
  private readonly _unread = signal(false);
  protected readonly unread = this._unread.asReadonly();

  private readonly anchor = viewChild.required<ElementRef<HTMLElement>>('anchor');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');

  protected readonly placeholder = computed(() =>
    this.formId() ? 'Chat to change' : 'Chat to create',
  );

  protected readonly blankLine = computed(() =>
    this.formId()
      ? 'Ask about the form you are looking at, or tell me what to change.'
      : 'Describe the form you want and I will build it.',
  );

  /**
   * What the assistant is doing, said in words.
   *
   * The server's own stage label when there is one, and an honest generic when there is not. Never
   * a spinner alone: a build runs the better part of a minute and silence for that long reads as a
   * hang, not as work.
   */
  protected readonly workingLine = computed(() => {
    const progress = this.chat.progress();
    return progress ? `${progress.label}…` : 'Thinking…';
  });

  /**
   * Openers, chosen for what they TEACH rather than for how often they are wanted.
   *
   * Three, because a menu you have to read is a menu you skip. Each names a different thing the
   * assistant can do, because the capabilities are otherwise invisible — an author has no way to
   * guess that "add a photo of a conference hall to the start screen" is a sentence this
   * box understands.
   */
  protected readonly suggestions = computed<readonly string[]>(() =>
    this.formId()
      ? ['Make it warmer', 'Add a picture to the start screen', 'What should I ask next?']
      : ['A contact form', 'An event RSVP with dietary needs', 'A customer feedback survey'],
  );

  constructor() {
    // Re-load the thread whenever the host points us at a different form. Reading history from the
    // database rather than carrying it means switching forms shows that form's conversation.
    effect(() => {
      const id = this.formId();
      void this.showThreadFor(id);
    });

    // Keep the newest turn in view. Runs after each render pass rather than inside send(), so it
    // also fires for the optimistic user turn and the working indicator.
    effect(() => {
      this.chat.turns();
      this.chat.busy();
      this.chat.progress();
      requestAnimationFrame(() => this.scrollToNewest());
    });

    // The panel is positioned from the pill's box, so anything that moves the pill has to move the
    // panel with it. Capture-phase scroll because the hosts that place this are themselves inside
    // scrolling panes, and a scroll event on those does not bubble to the window. `visualViewport`
    // is what fires when a mobile keyboard opens — without it the composer sits under the keyboard.
    const reposition = (): void => this.positionPanel();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
    });
  }

  protected blocksFor(message: string): ReturnType<typeof parseChatMarkdown> {
    return parseChatMarkdown(message);
  }

  protected expand(): void {
    const panel = this.panel().nativeElement;
    if (!panel.matches(':popover-open')) {
      panel.showPopover();
      this.positionPanel();
    }
    this._expanded.set(true);
    this._unread.set(false);
    // After layout, not merely after the microtask queue: the panel has just been moved into the
    // top layer and given its size, and scrolling a box that has not been laid out does nothing.
    requestAnimationFrame(() => {
      this.box()?.nativeElement.focus();
      this.scrollToNewest();
    });
  }

  protected collapse(): void {
    const panel = this.panel().nativeElement;
    if (panel.matches(':popover-open')) {
      panel.hidePopover();
    }
    this._expanded.set(false);
    // Focus returns to the control that opened it — a keyboard user who closes the panel would
    // otherwise be dropped at the top of the document.
    this.anchor().nativeElement.focus();
  }

  /**
   * Follow the popover's own state.
   *
   * A popover closes on Escape and on a click outside without telling anyone, so the signal that
   * hides the pill has to be driven by what actually happened rather than by our own calls — else
   * the pill stays hidden behind a panel that is no longer there.
   */
  protected onToggle(event: Event): void {
    const open = (event as ToggleEvent).newState === 'open';
    this._expanded.set(open);
    if (open) {
      this._unread.set(false);
      this.positionPanel();
    }
  }

  protected askFor(text: string): void {
    this.draft = text;
    void this.send();
  }

  protected async send(): Promise<void> {
    const message = this.draft.trim();
    if (!message || this.chat.busy()) {
      return;
    }
    this.draft = '';
    this.expand();
    const result = await this.chat.send(message, this.formId());
    if (!this.panel().nativeElement.matches(':popover-open')) {
      this._unread.set(true);
    }
    if (result.createdFormId) {
      this.formCreated.emit(result.createdFormId);
    }
    if (result.restyledStyleId) {
      this.formRestyled.emit(result.restyledStyleId);
    }
    if (result.imagedScreenId) {
      this.formChanged.emit();
    }
  }

  /** Load this scope's thread, and open the panel if the author is plainly still in it. */
  private async showThreadFor(formId: string | null): Promise<void> {
    await this.chat.load(formId);
    if (isThreadWarm(this.chat.turns(), Date.now())) {
      this.expand();
    }
  }

  private scrollToNewest(): void {
    const el = this.thread()?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  /**
   * Put the panel over the pill.
   *
   * ── AT LEAST AS WIDE AS THE BOX IT GREW OUT OF, AND WIDER ON A BIG SCREEN. ─────────────────
   * The pill is the affordance the author clicked; a panel narrower than it reads as a tooltip
   * that happened to appear nearby rather than as that box opening up. So the anchor's width is a
   * FLOOR, not the answer — the pill itself stops growing at 720px, and on a 2560px display a
   * 720px panel is a postage stamp in the middle of the screen. Above that the width tracks the
   * viewport instead, up to a cap where a line of chat stops being comfortable to read back.
   *
   * ── AND TALL ENOUGH TO BE A CONVERSATION. ──────────────────────────────────────────────────
   * Sized to its content, a two-turn thread produced a box a few lines high — fine for a
   * notification and wrong for something you are meant to read and reply in. A floor of two
   * thirds of the viewport means there is always room, and the empty state centres itself rather
   * than clinging to the top of an empty box.
   *
   * Everything is measured against `visualViewport` where it exists: on a phone that is the part
   * of the page NOT covered by the keyboard, which is the only rectangle the composer may sit in.
   */
  private positionPanel(): void {
    const panel = this.panel().nativeElement;
    if (!panel.matches(':popover-open')) {
      return;
    }
    const view = window.visualViewport;
    const viewWidth = view?.width ?? window.innerWidth;
    const viewHeight = view?.height ?? window.innerHeight;
    const box = this.anchor().nativeElement.getBoundingClientRect();
    const phone = viewWidth <= PHONE_WIDTH;

    // --- width: the anchor's, or a share of a big screen, whichever is more generous ----------
    const room = viewWidth - PANEL_GUTTER * 2;
    const roomy = Math.max(box.width, viewWidth * WIDTH_SHARE, PANEL_MIN_WIDTH);
    const width = phone ? room : Math.min(roomy, PANEL_MAX_WIDTH, room);
    // Centred on the anchor, then pulled back inside the viewport if that pushed it out.
    const centred = box.left + box.width / 2 - width / 2;
    const left = Math.min(Math.max(centred, PANEL_GUTTER), viewWidth - width - PANEL_GUTTER);

    // --- height: at least half the screen, never more than the room above the anchor -----------
    const bottom = Math.max(PANEL_GUTTER, viewHeight - box.bottom);
    const available = viewHeight - bottom - PANEL_GUTTER;
    const share = phone ? PHONE_HEIGHT_SHARE : MIN_HEIGHT_SHARE;
    const minHeight = Math.min(Math.max(PANEL_MIN_HEIGHT, viewHeight * share), available);
    const maxHeight = Math.min(available, viewHeight * MAX_HEIGHT_SHARE);

    panel.style.left = `${Math.round(left)}px`;
    panel.style.width = `${Math.round(width)}px`;
    panel.style.bottom = `${Math.round(bottom)}px`;
    panel.style.minHeight = `${Math.round(minHeight)}px`;
    // Never below the floor: a max under the min would collapse the panel on a very short window.
    panel.style.maxHeight = `${Math.round(Math.max(minHeight, maxHeight))}px`;
  }
}

/** Breathing room kept between the panel and every viewport edge. */
const PANEL_GUTTER = 12;
/** At or below this the panel becomes a full-width sheet. Matches the CSS breakpoint. */
const PHONE_WIDTH = 640;
/** Narrower than this and a reply with a bullet list stops being readable. */
const PANEL_MIN_WIDTH = 380;
/**
 * How much of a wide screen the panel takes, once the anchor has stopped growing.
 *
 * The pill caps at 720px (`.fc { max-width }`), so past roughly a 1400px viewport the anchor stops
 * being a useful measure and this takes over.
 */
const WIDTH_SHARE = 0.52;
/**
 * Widest the panel goes.
 *
 * Not a layout limit but a reading one: much past this a line of chat is long enough that the eye
 * loses the start of the next one, which is the thing every measure of body text is chosen to
 * avoid. The thread's own content stays comfortable because the panel never exceeds it.
 */
const PANEL_MAX_WIDTH = 1040;
/** The floor, for a window too short for a share of it to mean anything. */
const PANEL_MIN_HEIGHT = 320;
/** Two thirds of the viewport, so a conversation always has room to be one. */
const MIN_HEIGHT_SHARE = 0.66;
/** Above this a panel stops reading as a panel and starts reading as a takeover. */
const MAX_HEIGHT_SHARE = 0.86;
/** On a phone there is nothing behind worth preserving, so the sheet takes most of the screen. */
const PHONE_HEIGHT_SHARE = 0.76;
