/**
 * Paste-a-list-of-questions dialog.
 *
 * Shows a live preview of what the paste WILL create before anything is written, because the
 * alternative — import, then discover it read your headings as questions — means deleting rows
 * one at a time. All parsing is {@link parseImportedQuestions}; this component only collects
 * text and renders the outcome.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FORMS_UI_CSS } from '../shared';
import { questionTypeMeta } from './question-type-catalog';
import {
  MAX_IMPORTED_QUESTIONS,
  parseImportedQuestions,
  type ImportResult,
} from './question-import';

const IMPORT_CSS = /* css */ `
:host { display: block; }

.iq-backdrop {
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

.iq-modal {
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  max-height: min(85vh, 720px);
  overflow: hidden;
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-radius);
  box-shadow: 0 24px 60px -20px color-mix(in srgb, var(--mj-text-primary) 45%, transparent);
}

.iq-head {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-card-pad);
  border-bottom: 1px solid var(--mjf-rule);
}
.iq-head h2 { flex: 1; margin: 0; font-size: 1rem; font-weight: 650; color: var(--mj-text-primary); }
.iq-close { padding: 6px 10px; }

.iq-body { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: var(--mjf-gap); padding: var(--mjf-card-pad); overflow: auto; }
@media (max-width: 720px) { .iq-body { grid-template-columns: 1fr; } }

.iq-col { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); min-width: 0; }
.iq-col-title { margin: 0; font-size: var(--mjf-label); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mj-text-muted); }

.iq-input { min-height: 260px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem; resize: vertical; }

.iq-syntax { margin: 0; font-size: var(--mjf-label); line-height: 1.7; color: var(--mj-text-muted); }
.iq-syntax code { padding: 1px 4px; border-radius: 4px; background: var(--mj-bg-surface-sunken); }

.iq-preview { display: flex; flex-direction: column; gap: 4px; }
.iq-page-title { margin: 8px 0 2px; font-size: var(--mjf-label); font-weight: 700; color: var(--mj-text-secondary); }
.iq-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--mj-border-subtle); border-radius: var(--mjf-radius-sm); }
.iq-row i { color: var(--mj-text-muted); width: 1rem; text-align: center; }
.iq-row-prompt { flex: 1; min-width: 0; font-size: var(--mjf-meta); color: var(--mj-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iq-row-type { font-size: var(--mjf-label); color: var(--mj-text-muted); }
.iq-req { color: var(--mj-status-error-text); font-weight: 700; }

.iq-empty { padding: 24px; text-align: center; font-size: var(--mjf-meta); color: var(--mj-text-muted); }
.iq-warn { margin: 0; font-size: var(--mjf-label); color: var(--mj-status-warning-text); }

.iq-foot {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-card-pad);
  border-top: 1px solid var(--mjf-rule);
}
.iq-count { flex: 1; font-size: var(--mjf-meta); color: var(--mj-text-muted); }
`;

@Component({
  selector: 'mjf-import-questions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styles: [FORMS_UI_CSS, IMPORT_CSS],
  template: `
    <div class="iq-backdrop" role="dialog" aria-modal="true" aria-labelledby="iq-title" (keydown.escape)="cancelled.emit()">
      <div class="iq-modal">
        <div class="iq-head">
          <i class="fa-solid fa-file-import" aria-hidden="true"></i>
          <h2 id="iq-title">Import questions</h2>
          <button type="button" class="mjf-btn mjf-btn--ghost iq-close" aria-label="Close" (click)="cancelled.emit()">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div class="iq-body">
          <div class="iq-col">
            <p class="iq-col-title">Paste your questions</p>
            <textarea
              class="mjf-input iq-input"
              aria-label="Questions to import, one per line"
              [value]="text()"
              (input)="onText($any($event.target).value)"
            ></textarea>
            <p class="iq-syntax">
              One question per line. Add <code>*</code> to make it required,
              <code>#&nbsp;Heading</code> to start a new page, and
              <code>[type]</code> to set the type —
              <code>[choice] red | green | blue</code> also creates the options.
            </p>
          </div>

          <div class="iq-col">
            <p class="iq-col-title">Preview</p>
            @if (result().count === 0) {
              <p class="iq-empty">Nothing to import yet.</p>
            } @else {
              <div class="iq-preview">
                @for (page of result().pages; track $index) {
                  @if (page.title) {
                    <p class="iq-page-title">{{ page.title }}</p>
                  }
                  @for (q of page.questions; track $index) {
                    <div class="iq-row">
                      <i [class]="iconFor(q.type)" aria-hidden="true"></i>
                      <span class="iq-row-prompt">{{ q.prompt }}</span>
                      @if (q.isRequired) { <span class="iq-req" aria-label="required">*</span> }
                      <span class="iq-row-type">{{ labelFor(q.type) }}</span>
                    </div>
                  }
                }
              </div>
            }
            @if (result().truncatedAt; as cap) {
              <p class="iq-warn">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                Only the first {{ cap }} questions will be imported.
              </p>
            }
          </div>
        </div>

        <div class="iq-foot">
          <span class="iq-count">
            {{ result().count }} question{{ result().count === 1 ? '' : 's' }} across
            {{ result().pages.length }} page{{ result().pages.length === 1 ? '' : 's' }}
          </span>
          <button type="button" class="mjf-btn mjf-btn--primary" [disabled]="result().count === 0"
            (click)="confirm()">Import</button>
          <button type="button" class="mjf-btn" (click)="cancelled.emit()">Cancel</button>
        </div>
      </div>
    </div>
  `,
})
export class ImportQuestionsComponent {
  /** Emitted with the parsed pages when the author confirms. */
  @Output() imported = new EventEmitter<ImportResult>();
  /** Emitted when the dialog is dismissed. */
  @Output() cancelled = new EventEmitter<void>();

  protected readonly maxQuestions = MAX_IMPORTED_QUESTIONS;
  protected readonly text = signal('');
  protected readonly result = signal<ImportResult>({ pages: [], count: 0 });

  protected onText(value: string): void {
    this.text.set(value);
    this.result.set(parseImportedQuestions(value));
  }

  protected confirm(): void {
    const parsed = this.result();
    if (parsed.count > 0) {
      this.imported.emit(parsed);
    }
  }

  protected iconFor(type: Parameters<typeof questionTypeMeta>[0]): string {
    return questionTypeMeta(type).icon;
  }

  protected labelFor(type: Parameters<typeof questionTypeMeta>[0]): string {
    return questionTypeMeta(type).label;
  }
}
