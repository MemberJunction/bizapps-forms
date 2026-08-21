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
import { LogError } from '@memberjunction/core';
import { ImagePickerDialogComponent } from '../builder/image-picker-dialog.component';
import {
  ASSISTANT_CAN,
  ASSISTANT_CANNOT,
  isThreadWarm,
  withAttachedImage,
  type FormChatTurn,
  type GenerateFormStage,
} from '@mj-biz-apps/forms-entities';
import { FormChatService, type ChatSendResult } from './form-chat.service';
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
  imports: [FormsModule, ImagePickerDialogComponent],
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
        [attr.aria-controls]="panelId"
        [attr.aria-label]="pillLabel()"
        (click)="expand()"
      >
        <span class="fc-mark" aria-hidden="true">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
        </span>
        <span class="fc-pill-text">{{ draft.trim() || placeholder() }}</span>
        <!-- aria-hidden, and the count said in the button's own label instead: an aria-label on a
             <span> is on an element with no role and is ignored, and the button's label replaces
             its descendants in the name computation regardless. The badge was therefore visible
             only to people who could see it — which is not who it is for. -->
        @if (unread()) {
          <span class="fc-unread" aria-hidden="true">1</span>
        }
        <span class="fc-go fc-go--ghost" aria-hidden="true">
          <i class="fa-solid fa-arrow-up"></i>
        </span>
      </button>

      <div
        class="fc-panel"
        #panel
        [id]="panelId"
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
          <!-- Put the thread away rather than delete it: it is archived, so it is still there for
               anyone who needs to know what was asked, just not in front of the author. -->
          @if (chat.turns().length > 0) {
            <button
              type="button"
              class="fc-icon-btn"
              [disabled]="chat.busy()"
              (click)="newThread()"
              aria-label="Start a new conversation"
              title="New conversation"
            >
              <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
            </button>
          }
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
          (scroll)="onThreadScroll()"
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
              <!-- The boundary, stated before it is hit. An author who asks for a share link and
                   is told "I can't do that yet" has spent a turn finding out something the panel
                   could have said for free — and every dead end costs a little more trust than the
                   one before it. -->
              <dl class="fc-can">
                <dt>I can</dt>
                <dd>{{ canDo }}</dd>
                <dt>I can't</dt>
                <dd>{{ cannotDo }}</dd>
              </dl>
            </div>
          }
          @for (turn of chat.turns(); track $index) {
            <!-- A day only, and only when it changes. A thread here spans weeks — the panel
                 reopens on a form months later — so "was this yesterday or in March" is a real
                 question, while a date on every turn is noise nobody reads. -->
            @if (dayBreakBefore($index); as day) {
              <p class="fc-day" role="separator">{{ day }}</p>
            }
            @if (turn.role === 'User') {
              <div class="fc-said">
                <span class="fc-who fc-who--mine">You <time class="fc-at">{{ timeOf(turn) }}</time></span>
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
                  <span class="fc-who"
                    >{{ turn.role === 'Error' ? 'Form assistant — failed' : 'Form assistant' }}
                    <time class="fc-at">{{ timeOf(turn) }}</time></span
                  >
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

                  <div class="fc-turn-actions">
                    @if (turn.retryOf; as failed) {
                      <button type="button" class="fc-turn-btn" [disabled]="chat.busy()" (click)="retry(failed)">
                        <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Try again
                      </button>
                    }
                    <button
                      type="button"
                      class="fc-turn-btn"
                      (click)="copy($index, turn.message)"
                      [attr.aria-label]="'Copy this reply'"
                    >
                      <i class="fa-solid" [class.fa-copy]="copied() !== $index" [class.fa-check]="copied() === $index" aria-hidden="true"></i>
                      {{ copied() === $index ? 'Copied' : 'Copy' }}
                    </button>
                  </div>
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
                    [attr.aria-label]="'Build progress'"
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

        <!-- Only when the author has scrolled away from the newest turn. It is the other half of
             not auto-scrolling: reading is never interrupted, and getting back is one click. -->
        @if (!atNewest()) {
          <button type="button" class="fc-jump" (click)="jumpToNewest()">
            <i class="fa-solid fa-arrow-down" aria-hidden="true"></i> Latest
          </button>
        }

        <!-- What is going with the next message. Shown above the box rather than inside it so a
             long message does not push it out of sight. -->
        @if (attached(); as image) {
          <div class="fc-attached">
            <img class="fc-attached-thumb" [src]="image" alt="" />
            <span class="fc-attached-label">Picture attached</span>
            <button type="button" class="fc-turn-btn" (click)="clearAttachment()" aria-label="Remove the attached picture">
              Remove
            </button>
          </div>
        }

        <div class="fc-composer">
          <!-- Only where a picture has somewhere to go: on the forms list there is no form yet,
               so there is no screen to put one on. -->
          @if (formId()) {
            <button
              type="button"
              class="fc-go fc-go--ghost fc-attach"
              [disabled]="chat.busy()"
              (click)="openPicker()"
              aria-label="Attach a picture"
              title="Attach a picture"
            >
              <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
            </button>
          }
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
            [maxlength]="MAX_MESSAGE"
            (input)="fitToDraft()"
            (keydown.enter)="onEnter($event)"
            (keydown.escape)="collapse()"
            [attr.aria-label]="placeholder()"
          ></textarea>
          <!-- Silent until it is nearly relevant. A counter on an empty box is a rule being
               waved at someone who has not broken it. -->
          @if (draft.length >= COUNTER_FROM) {
            <span class="fc-count" [class.fc-count--full]="draft.length >= MAX_MESSAGE" aria-live="polite">
              {{ draft.length }}/{{ MAX_MESSAGE }}
            </span>
          }
          <!-- One button, two jobs: while a turn is in flight it stops waiting for it. Send and
               Stop are never both available, so there is never a question of which one acts. -->
          @if (chat.busy()) {
            <button
              type="button"
              class="fc-go fc-go--solid"
              (click)="chat.stop()"
              aria-label="Stop waiting for the reply"
              title="Stop"
            >
              <i class="fa-solid fa-stop" aria-hidden="true"></i>
            </button>
          } @else {
            <button
              type="button"
              class="fc-go fc-go--solid"
              [disabled]="!draft.trim()"
              (click)="send()"
              aria-label="Send"
              title="Send"
            >
              <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
            </button>
          }
        </div>
        <!--
          The picker, INSIDE the panel and in a popover of its own.

          Both halves are load-bearing. The panel is a popover, so it lives in the TOP LAYER, and
          the top layer beats every z-index there is — the picker's own z-index:1000 put it
          behind the panel, which is exactly what it looked like. And the picker was a DOM SIBLING
          of the panel, so clicking it counted as clicking outside an 'auto' popover and light-
          dismissed the whole conversation.

          A 'manual' popover nested here fixes both: it is promoted to the top layer itself (shown
          after the panel, so painted above it) and it is a descendant, so the light-dismiss walk
          finds the panel as its ancestor and leaves it open. Verified in a browser rather than
          reasoned about. The shared mjf-image-picker-dialog is untouched — five other hosts use
          it as an ordinary fixed overlay and it still is one.

          No display rule here, for the reason in form-chat.styles.ts's header: setting it would beat
          the UA's own popover hide rule and pin this open forever.
        -->
        <div class="fc-picker" #pickerHost popover="manual">
          @if (picking) {
            <mjf-image-picker-dialog
              subject="a picture for this form"
              [formId]="formId() ?? ''"
              (picked)="onPicked($event)"
              (closed)="closePicker()"
            />
          }
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
  private readonly pickerHost = viewChild<ElementRef<HTMLElement>>('pickerHost');

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

  /** Longest message the box accepts. Six or seven sentences — past that it is a brief, not a chat. */
  protected readonly MAX_MESSAGE = 2000;
  /** Where the counter starts showing: close enough to the cap for it to be information. */
  protected readonly COUNTER_FROM = 1600;

  /**
   * What this assistant can and cannot do, said before the author finds out by being refused.
   *
   * From the contract, not written here: the boundary is a property of the assistant, not of this
   * panel, and it was stale within a day of being stated in two places. The prompt template holds
   * the third copy and no import can reach it — see the note in `form-chat.ts`.
   */
  protected readonly canDo = ASSISTANT_CAN;
  protected readonly cannotDo = ASSISTANT_CANNOT;

  /** Ties the pill's `aria-controls` to the panel it opens. */
  protected readonly panelId = `fc-panel-${nextPanelId++}`;

  /**
   * The pill's accessible name, carrying the unread state.
   *
   * The badge cannot say it — a button's own label replaces its descendants when a screen reader
   * computes the name — so the one place it can be said is here.
   */
  protected readonly pillLabel = computed(() =>
    this.unread()
      ? `${this.placeholder()} — open the form assistant, 1 new reply`
      : `${this.placeholder()} — open the form assistant`,
  );

  /** Open while the author is choosing a picture. */
  protected picking = false;

  /**
   * The picture that will travel with the next message, if any.
   *
   * It goes out INSIDE the message ({@link withAttachedImage}) rather than as a new action
   * parameter, because a parameter is metadata and metadata ships in a migration — this works on
   * an instance that has not been re-seeded, and the assistant can see the attachment for itself.
   */
  private readonly _attached = signal<string | null>(null);
  protected readonly attached = this._attached.asReadonly();

  /** Which reply's Copy button has just been pressed, so it can say so for a moment. */
  private readonly _copied = signal<number | null>(null);
  protected readonly copied = this._copied.asReadonly();
  private copiedTimer?: ReturnType<typeof setTimeout>;

  /**
   * Whether the thread is scrolled to the newest turn.
   *
   * It gates the auto-scroll. Following the newest turn is right when the author is AT the newest
   * turn and an interruption when they are not: scrolling up to re-read what was said two turns
   * ago during a fifty-second build used to be undone by the next progress tick, once a second.
   */
  private readonly _atNewest = signal(true);
  protected readonly atNewest = this._atNewest.asReadonly();

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
      if (this._atNewest()) {
        requestAnimationFrame(() => this.scrollToNewest());
      }
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

  /** Open the panel because the author asked for it, and put them in the box to type. */
  protected expand(): void {
    this.open(true);
  }

  /**
   * Open the panel, taking the caret only when the author asked for it.
   *
   * The distinction is the whole of WCAG 3.2.1: this component also opens itself when it finds a
   * thread that is still warm, and that happens a network round-trip after the form loaded — long
   * enough that the author has started typing the form's title. Moving focus into the composer
   * then takes the rest of their sentence with it. Opening uninvited is fine; the popover is
   * non-modal and sits beside what they are doing. Grabbing the caret uninvited is not.
   */
  private open(takeFocus: boolean): void {
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
      if (takeFocus) {
        this.box()?.nativeElement.focus();
      }
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
    //
    // After the frame, for the same reason expand() defers: the pill is `visibility: hidden` while
    // `expanded()` is true, a hidden element cannot take focus, and OnPush has not yet removed the
    // class at the moment this line runs. Focusing here directly did nothing at all — the comment
    // above described a behaviour the code was not producing.
    requestAnimationFrame(() => this.anchor().nativeElement.focus());
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
    // Not while an IME is mid-composition. A Japanese, Chinese or Korean author presses Enter to
    // CONFIRM the candidate the IME is offering; that keypress is not a send, and treating it as
    // one fires off a half-finished word and empties the box under them. `isComposing` is true for
    // exactly that keystroke.
    if (event instanceof KeyboardEvent && event.isComposing) {
      return;
    }
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

  /** Remember whether the author is at the newest turn, which is what gates the auto-scroll. */
  protected onThreadScroll(): void {
    const el = this.thread()?.nativeElement;
    if (el) {
      this._atNewest.set(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX);
    }
  }

  protected jumpToNewest(): void {
    this._atNewest.set(true);
    this.scrollToNewest();
  }

  /** The time of a turn, or '' for one that predates timestamps being read back. */
  protected timeOf(turn: FormChatTurn): string {
    return turn.at ? turn.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  }

  /**
   * The day to announce before turn `index`, or '' when it falls on the same day as the one
   * before it. Today and yesterday are named rather than dated — a date is a lookup, a name is not.
   */
  protected dayBreakBefore(index: number): string {
    const turns = this.chat.turns();
    const at = turns[index]?.at;
    if (!at) {
      return '';
    }
    const previous = index > 0 ? turns[index - 1]?.at : undefined;
    if (previous && sameDay(previous, at)) {
      return '';
    }
    const today = new Date();
    if (sameDay(at, today)) {
      return 'Today';
    }
    const yesterday = new Date(today.getTime() - DAY_MS);
    return sameDay(at, yesterday)
      ? 'Yesterday'
      : at.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /**
   * Send a message that failed, again.
   *
   * Straight past the draft, not through it: the author may well have started typing something
   * else while the failure sat there, and a Retry button that silently replaces what is in the box
   * loses a second message while recovering the first.
   */
  protected retry(message: string): void {
    void this.sendMessage(message, null);
  }

  protected async copy(index: number, message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(message);
    } catch (error) {
      // Clipboard access is refused in some embeddings and over plain http. Saying nothing would
      // leave the author believing they had copied it.
      LogError(`[Forms chat] Copy failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    this._copied.set(index);
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => this._copied.set(null), COPIED_FOR_MS);
  }

  protected openPicker(): void {
    this.picking = true;
    this.pickerHost()?.nativeElement.showPopover();
  }

  /** Close the picker without touching the panel it sits inside. */
  protected closePicker(): void {
    this.picking = false;
    const host = this.pickerHost()?.nativeElement;
    if (host?.matches(':popover-open')) {
      host.hidePopover();
    }
  }

  protected onPicked(url: string): void {
    this.closePicker();
    this._attached.set(url);
    this.box()?.nativeElement.focus();
  }

  protected clearAttachment(): void {
    this._attached.set(null);
  }

  /** Archive this thread and start an empty one. */
  protected async newThread(): Promise<void> {
    await this.chat.startNewThread(this.formId());
    this._atNewest.set(true);
    this.box()?.nativeElement.focus();
  }

  protected async send(): Promise<void> {
    const typed = this.draft.trim();
    if (!typed || this.chat.busy()) {
      return;
    }
    const image = this._attached();
    this.draft = '';
    this._attached.set(null);
    // The box grew with the message; emptying `draft` does not shrink it back on its own.
    this.fitToDraft();
    await this.sendMessage(typed, image);
  }

  /** The one path a message takes, whether it was typed, suggested, or retried after a failure. */
  private async sendMessage(typed: string, image: string | null): Promise<void> {
    if (this.chat.busy()) {
      return;
    }
    const message = image ? withAttachedImage(typed, image) : typed;
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
      // Shown, not seized: the author did not ask for this panel, so it does not take their caret.
      this.open(false);
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

/** Distinguishes two chats on one page — the builder mounts one per surface. */
let nextPanelId = 0;

/** Within this many pixels of the bottom counts as "at the newest turn". */
const NEAR_BOTTOM_PX = 48;
/** How long a Copy button says "Copied" before going back to saying what it does. */
const COPIED_FOR_MS = 1600;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether two moments fall on the same calendar day, in the reader's own timezone. */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

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
