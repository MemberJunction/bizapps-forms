import {
  ChangeDetectionStrategy,
  Component,
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
 * ── TWO STATES, ONE COMPONENT. ───────────────────────────────────────────────────────────────
 * Collapsed it is a single input pill. Clicking or focusing it expands the thread above, in place,
 * without navigating: the form stays visible behind, which matters because most of what an author
 * asks about is on screen. Escape collapses it again.
 *
 * ── IT IS PLACED, NOT POSITIONED. ────────────────────────────────────────────────────────────
 * The component draws no fixed/absolute chrome of its own, so a host decides where it lives — the
 * forms list centres it, the builder centres it under the canvas, the Design tab drops it in the
 * left rail. One component, three placements, no variants.
 */
@Component({
  selector: 'mjf-form-chat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  styles: [FORM_CHAT_STYLES],
  template: `
    <div class="fc" [class.fc--open]="expanded()">
      @if (expanded()) {
        <div class="fc-thread" #thread role="log" aria-live="polite" aria-label="Conversation">
          @if (chat.turns().length === 0) {
            <p class="fc-empty">
              Describe the form you want, or ask me anything about the one you are looking at.
            </p>
          }
          @for (turn of chat.turns(); track $index) {
            <div
              class="fc-turn"
              [class.fc-turn--mine]="turn.role === 'User'"
              [class.fc-turn--failed]="turn.role === 'Error'"
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
            </div>
          }
          @if (chat.busy()) {
            <div class="fc-turn fc-turn--thinking" aria-label="Thinking">
              <span class="fc-dot"></span><span class="fc-dot"></span><span class="fc-dot"></span>
            </div>
          }
        </div>
      }

      <div class="fc-bar" [class.fc-bar--open]="expanded()">
        <i class="fa-solid fa-microphone fc-icon" aria-hidden="true" title="Voice input is not wired up yet"></i>
        <input
          #box
          type="text"
          class="fc-input"
          [placeholder]="placeholder()"
          [(ngModel)]="draft"
          [disabled]="chat.busy()"
          (focus)="expand()"
          (keydown.enter)="send()"
          (keydown.escape)="collapse()"
          [attr.aria-label]="placeholder()"
        />
        <button
          type="button"
          class="fc-send"
          [disabled]="!draft.trim() || chat.busy()"
          (click)="send()"
          aria-label="Send"
        >
          <i class="fa-regular fa-paper-plane" aria-hidden="true"></i>
        </button>
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

  /** Fired when a turn restyled the open form, so the host can reload what it is showing. */
  public readonly formRestyled = output<string>();

  protected draft = '';
  private readonly _expanded = signal(false);
  protected readonly expanded = this._expanded.asReadonly();

  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');

  protected readonly placeholder = computed(() =>
    this.formId() ? 'Chat to change' : 'Chat to create',
  );

  constructor() {
    // Re-load the thread whenever the host points us at a different form. Reading history from the
    // database rather than carrying it means switching forms shows that form's conversation.
    effect(() => {
      const id = this.formId();
      void this.chat.load(id);
    });

    // Keep the newest turn in view. Runs after each render pass rather than inside send(), so it
    // also fires for the optimistic user turn and the thinking indicator.
    effect(() => {
      this.chat.turns();
      this.chat.busy();
      queueMicrotask(() => {
        const el = this.thread()?.nativeElement;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      });
    });
  }

  protected blocksFor(message: string): ReturnType<typeof parseChatMarkdown> {
    return parseChatMarkdown(message);
  }

  protected expand(): void {
    this._expanded.set(true);
  }

  protected collapse(): void {
    this._expanded.set(false);
  }

  protected async send(): Promise<void> {
    const message = this.draft.trim();
    if (!message || this.chat.busy()) {
      return;
    }
    this.draft = '';
    this.expand();
    const result = await this.chat.send(message, this.formId());
    if (result.createdFormId) {
      this.formCreated.emit(result.createdFormId);
    }
    if (result.restyledStyleId) {
      this.formRestyled.emit(result.restyledStyleId);
    }
  }
}
