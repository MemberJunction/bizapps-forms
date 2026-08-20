/**
 * "Save as template" — the dialog the builder opens at the moment a form is worth reusing.
 *
 * Deliberately thin. Asking for a name and a description is the whole job; anything more turns
 * a two-second decision into a form about forms. The name pre-fills from the form so the common
 * case is one click, and the note under the fields states what actually carries over, because
 * "will it keep my logic and my theme?" is the question every author has and none of them ask.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FORMS_UI_CSS } from '../shared';

/** What the author confirmed. */
export interface SaveAsTemplateRequest {
  name: string;
  description: string | null;
}

const SAVE_TEMPLATE_CSS = /* css */ `
:host { display: block; }

.st-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--mj-text-primary) 60%, transparent);
  backdrop-filter: blur(2px);
}

.st-modal {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap);
  width: min(460px, 100%);
  padding: var(--mjf-card-pad);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-radius);
  box-shadow: 0 24px 60px -20px color-mix(in srgb, var(--mj-text-primary) 45%, transparent);
}

.st-head { display: flex; align-items: center; gap: var(--mjf-gap-sm); }
.st-head i { color: var(--mjf-viz-fill); }
.st-head h2 { flex: 1; margin: 0; font-size: 1rem; font-weight: 650; color: var(--mj-text-primary); }

.st-note {
  margin: 0;
  font-size: var(--mjf-label);
  line-height: 1.6;
  color: var(--mj-text-muted);
}

.st-actions { display: flex; gap: var(--mjf-gap-sm); }
@media (max-width: 600px) { .st-actions .mjf-btn { flex: 1 1 auto; } }
`;

@Component({
  selector: 'mjf-save-as-template',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  styles: [FORMS_UI_CSS, SAVE_TEMPLATE_CSS],
  template: `
    <div
      class="st-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="st-title"
      (keydown.escape)="Cancelled.emit()"
    >
      <div class="st-modal">
        <div class="st-head">
          <i class="fa-solid fa-bookmark mjf-viz-2" aria-hidden="true"></i>
          <h2 id="st-title">Save as template</h2>
        </div>

        <div class="mjf-field">
          <label class="mjf-field-label" for="st-name">Template name</label>
          <input
            id="st-name"
            class="mjf-input"
            type="text"
            [(ngModel)]="name"
            [disabled]="Busy"
            autocomplete="off"
          />
        </div>

        <div class="mjf-field">
          <label class="mjf-field-label" for="st-desc">What is it for? <span class="mjf-field-hint">Optional</span></label>
          <textarea
            id="st-desc"
            class="mjf-textarea"
            rows="2"
            placeholder="e.g. Our standard client intake, with the consent block legal signed off"
            [(ngModel)]="description"
            [disabled]="Busy"
          ></textarea>
        </div>

        @if (ErrorMessage) {
          <div class="mjf-alert" role="alert">
            <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
            <span>{{ ErrorMessage }}</span>
          </div>
        }

        <p class="st-note">
          The whole form is copied — questions, pages, branching logic, validation, welcome and
          ending screens, theme, and any automations. Responses and share links are not.
        </p>

        <!-- Confirm left, cancel right (repo convention). -->
        <div class="st-actions">
          <button
            type="button"
            class="mjf-btn mjf-btn--primary"
            [disabled]="Busy || !name.trim()"
            (click)="confirm()"
          >
            @if (Busy) {
              <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Saving…
            } @else {
              <i class="fa-solid fa-bookmark" aria-hidden="true"></i> Save template
            }
          </button>
          <button type="button" class="mjf-btn mjf-btn--quiet" [disabled]="Busy" (click)="Cancelled.emit()">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SaveAsTemplateDialogComponent {
  /** Pre-fills the name; the common case is accepting it unchanged. */
  @Input() public set FormName(value: string) {
    this.name = value;
  }

  @Input() public set FormDescription(value: string | null) {
    this.description = value ?? '';
  }

  @Input() public Busy = false;

  /** A problem with the last attempt — a name already in use. Shown above the actions. */
  @Input() public ErrorMessage: string | null = null;

  @Output() public readonly Confirmed = new EventEmitter<SaveAsTemplateRequest>();
  @Output() public readonly Cancelled = new EventEmitter<void>();

  protected name = '';
  protected description = '';

  protected confirm(): void {
    const name = this.name.trim();
    if (!name) {
      return;
    }
    const description = this.description.trim();
    this.Confirmed.emit({ name, description: description === '' ? null : description });
  }
}
