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
import { isThreadWarm, type GenerateFormStage } from '@mj-biz-apps/forms-entities';
import { FormChatService } from './form-chat.service';
import { parseChatMarkdown } from './chat-markdown';
import { FORM_CHAT_STYLES } from './form-chat.styles';
import { PHONE_WIDTH, ownerArea, panelGeometry } from './panel-geometry';

/**
 * "Chat to create" — the one way AI authoring is reached.
 *
 * ── IT REPLACED A BUTTON, AND THAT IS THE POINT. ─────────────────────────────────────────────
 * The old surface was a button that opened a panel with a textarea and a Generate button: one
 * shot, no memory, and nothing to do afterwards but start again. A box that stays where it is and
 * remembers what you said is a different affordance — the second message ("make it warmer", "what
 * goes with navy?") is the one the old surface could not accept at all.
 *
 * ── THE PANEL IS IN THE TOP LAYER, BUT IT STILL BELONGS TO ITS PANE. ────────────────────────
 * It opens as a popover, positioned over the pill it grew from. The top layer is what lets it
 * paint over the panes around it — all three hosts sit inside clipping containers, so a panel in
 * normal flow would be cropped by its own rail — but escaping the clip is NOT permission to
 * ignore where it came from. {@link ownerArea} measures the pane holding the pill and the panel
 * is sized and placed inside that box, so it reads as that pane opening up rather than as a
 * dialog that happens to have been launched from it. The Design rail is where the difference is
 * unmissable: 380px of controls beside a live preview, and a viewport-sized panel lands straight
 * across the preview the author opened it to talk about.
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
                <span class="fc-who fc-who--mine">You</span>
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
                  <span class="fc-who">{{ turn.role === 'Error' ? 'Form assistant — failed' : 'Form assistant' }}</span>
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
                <span class="fc-who">Form assistant</span>
                @if (chat.progress(); as p) {
                  <div class="fc-steps">
                    @for (step of buildSteps(p.stage); track step.key) {
                      <div class="fc-step" [class.fc-step--done]="step.done" [class.fc-step--now]="step.now">
                        <i
                          class="fa-solid fc-step-tick"
                          [class.fa-check]="step.done"
                          [class.fa-circle-notch]="step.now"
                          [class.fa-circle]="!step.done && !step.now"
                          aria-hidden="true"
                        ></i>
                        <span class="fc-step-name">{{ step.label }}</span>
                      </div>
                    }
                  </div>
                  <span class="fc-working-line">{{ p.label }}</span>
                  <span
                    class="fc-meter"
                    role="progressbar"
                    [attr.aria-valuenow]="p.percent"
                    [attr.aria-valuetext]="p.label"
                  >
                    <span class="fc-meter-fill" [style.width.%]="p.percent"></span>
                  </span>
                } @else {
                  <span class="fc-working-line">{{ workingLine() }}</span>
                  <span class="fc-dots" aria-hidden="true">
                    <span class="fc-dot"></span><span class="fc-dot"></span><span class="fc-dot"></span>
                  </span>
                }
              </div>
            </div>
          }
        </div>

        <div class="fc-composer">
          <!--
            A textarea, not a one-line input, so a message can have more than one line in it.
            Enter still sends — that is the gesture people arrive with — and Shift+Enter breaks the
            line, which an <input> cannot do at all no matter what you bind to it.

            The (keydown.enter) binding fires only for an UNMODIFIED Enter: Angular builds the key
            name from
            the event's modifiers, so a shifted press does not match this binding and falls through
            to the browser, which inserts the newline itself. The preventDefault in onEnter is what
            stops a plain Enter doing both — sending AND leaving a stray newline behind in the box.
          -->
          <textarea
            #box
            rows="1"
            class="fc-input"
            enterkeyhint="send"
            autocomplete="off"
            [placeholder]="placeholder()"
            [(ngModel)]="draft"
            [disabled]="chat.busy()"
            (input)="fitToDraft()"
            (keydown.enter)="onEnter($event)"
            (keydown.escape)="collapse()"
            [attr.aria-label]="placeholder()"
          ></textarea>
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

  /** Fired when a turn changed the form's content — a picture, or a structural edit. */
  public readonly formChanged = output<void>();

  /**
   * Fired when a turn asked to open a different form.
   *
   * Navigation only: the server wrote nothing to it. The host moves, and the next turn's snapshot
   * is the form the author arrived at — which is what keeps every write on something visible.
   */
  public readonly formOpened = output<string>();

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

  /** Set once the component is gone, so nothing awaited across its lifetime writes to a corpse. */
  private destroyed = false;

  private readonly anchor = viewChild.required<ElementRef<HTMLElement>>('anchor');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

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
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
    });

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

  /**
   * The build's stages, with the one running now marked.
   *
   * A bar alone answers "how far" and not "at what", which is the question somebody staring at a
   * fifty-second build actually has — and the server already names every stage it enters. Showing
   * the whole list also makes the wait finite-looking: four steps you can see is a different
   * feeling from a bar that could stop anywhere.
   */
  protected buildSteps(stage: GenerateFormStage): readonly BuildStep[] {
    const at = BUILD_STAGES.findIndex((s) => s.key === stage);
    return BUILD_STAGES.map((s, i) => ({
      ...s,
      done: at > i || stage === 'complete',
      now: at === i && stage !== 'complete',
    }));
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

  /**
   * Enter sends; the newline belongs to Shift+Enter.
   *
   * Only reached for an unmodified Enter — Angular's key bindings carry the modifier set, so a
   * shifted press never arrives here. Default prevented, because a textarea would otherwise insert
   * the newline as well and leave it sitting in a box that has just been emptied and sent.
   */
  protected onEnter(event: Event): void {
    event.preventDefault();
    void this.send();
  }

  /**
   * Grow the box to the message, up to the point where it would eat the thread above it.
   *
   * Height is reset to `auto` first: `scrollHeight` is the content's height OR the current height,
   * whichever is larger, so measuring without the reset makes a box that only ever grows — delete
   * three lines and it stays three lines tall. Past the cap the textarea scrolls, which is the
   * right trade for a composer that has to leave the conversation visible.
   *
   * Done in script rather than with `field-sizing: content`, which does exactly this natively but
   * is not in Safari or Firefox yet; a composer that only grows in Chrome is worse than one that
   * grows everywhere.
   */
  protected fitToDraft(): void {
    const box = this.box()?.nativeElement;
    if (!box) {
      return;
    }
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }

  protected async send(): Promise<void> {
    const message = this.draft.trim();
    if (!message || this.chat.busy()) {
      return;
    }
    this.draft = '';
    // The box grew with the message; emptying `draft` does not shrink it back on its own.
    this.fitToDraft();
    this.expand();
    const result = await this.chat.send(message, this.formId());
    // An image turn runs for the better part of a minute, and the Build tab's chat is destroyed by
    // the tab switch. `OutputEmitterRef.emit` on a destroyed component DISCARDS the value in
    // silence, so the picture was written server-side and the host was never told to reload it.
    if (this.destroyed) {
      return;
    }
    if (!this.panel().nativeElement.matches(':popover-open')) {
      this._unread.set(true);
    }
    if (result.createdFormId) {
      this.formCreated.emit(result.createdFormId);
    }
    if (result.restyledStyleId) {
      this.formRestyled.emit(result.restyledStyleId);
    }
    if (result.imagedScreenId || result.changedFormId) {
      this.formChanged.emit();
    }
    if (result.openFormId) {
      this.formOpened.emit(result.openFormId);
    }
  }

  /** Load this scope's thread, and open the panel if the author is plainly still in it. */
  private async showThreadFor(formId: string | null): Promise<void> {
    await this.chat.load(formId);
    // `viewChild.required` hands back a detached ElementRef after destroy, and `showPopover()` on
    // a disconnected node throws InvalidStateError as an unhandled rejection.
    if (this.destroyed) {
      return;
    }
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
   * Put the panel over the pill, inside the pane that owns it.
   *
   * ── IT OPENS WHERE IT LIVES. ───────────────────────────────────────────────────────────────
   * Every measurement is taken against {@link ownerArea} — the scrolling pane the pill sits in —
   * and not against the window. The Design tab is what makes the difference visible: its pill is
   * in a 380px rail beside a live preview, and a panel sized off the viewport opened 1040px wide
   * and most of the window tall, straight across the preview it was there to help the author
   * judge. A panel that big is not "the rail's assistant expanded", it is a takeover that happens
   * to have been launched from the rail. Bounded by the pane, the same component opens as the
   * rail widening on the forms list, as the canvas column in Build, and as the rail itself in
   * Design — one rule, three surfaces, no per-surface flag.
   *
   * ── AT LEAST AS WIDE AS THE BOX IT GREW OUT OF, AND WIDER WHEN THE PANE ALLOWS. ────────────
   * The pill is the affordance the author clicked; a panel narrower than it reads as a tooltip
   * that happened to appear nearby rather than as that box opening up. So the anchor's width is a
   * FLOOR, not the answer — the pill itself stops growing at 720px, and in a 2000px-wide pane a
   * 720px panel is a postage stamp. Above that the width tracks the pane, up to a cap where a
   * line of chat stops being comfortable to read back. In a pane narrower than the readable
   * minimum, the pane wins: overflowing the rail is the bug being fixed.
   *
   * ── AND TALL ENOUGH TO BE A CONVERSATION. ──────────────────────────────────────────────────
   * Sized to its content, a two-turn thread produced a box a few lines high — fine for a
   * notification and wrong for something you are meant to read and reply in. A floor of two
   * thirds of the pane means there is always room, and the empty state centres itself rather
   * than clinging to the top of an empty box.
   *
   * The pane is clipped to `visualViewport` where it exists: on a phone that is the part of the
   * page NOT covered by the keyboard, which is the only rectangle the composer may sit in.
   */
  private positionPanel(): void {
    const panel = this.panel().nativeElement;
    if (!panel.matches(':popover-open')) {
      return;
    }
    const view = window.visualViewport;
    const viewWidth = view?.width ?? window.innerWidth;
    const viewHeight = view?.height ?? window.innerHeight;
    const anchor = this.anchor().nativeElement;
    const phone = viewWidth <= PHONE_WIDTH;

    // On a phone the panel is a sheet and the screen IS the pane; anywhere else it belongs to the
    // pane that holds the pill.
    const area = phone
      ? { left: 0, top: 0, right: viewWidth, bottom: viewHeight }
      : ownerArea(anchor, viewWidth, viewHeight);
    const at = panelGeometry(anchor.getBoundingClientRect(), area, viewHeight, phone);

    panel.style.left = `${at.left}px`;
    panel.style.width = `${at.width}px`;
    panel.style.bottom = `${at.bottom}px`;
    panel.style.minHeight = `${at.minHeight}px`;
    panel.style.maxHeight = `${at.maxHeight}px`;
  }
}

/**
 * How tall the composer may grow before it starts scrolling instead, in pixels.
 *
 * Roughly six lines. The panel's height is fixed while it is open, so every pixel the composer
 * takes is one the conversation loses — and a composer that can swallow the thread it belongs to
 * is a worse failure than one that scrolls a long message.
 */
const COMPOSER_MAX_HEIGHT = 160;

/** One stage of a build, as the panel shows it. */
interface BuildStep {
  key: GenerateFormStage;
  label: string;
  done: boolean;
  now: boolean;
}

/**
 * The stages a staged build moves through, in order, named for an author rather than for the code.
 *
 * `complete` is deliberately absent: it is the state where all four are done, not a fifth thing to
 * wait for. The server's own per-event label ("Filled in Travel") shows underneath and says which
 * page — this list is the shape of the whole job.
 */
const BUILD_STAGES: ReadonlyArray<{ key: GenerateFormStage; label: string }> = [
  { key: 'outline', label: 'Planning the questions' },
  { key: 'page', label: 'Writing each page' },
  { key: 'image', label: 'Making pictures' },
  { key: 'theme', label: 'Choosing colours' },
];
