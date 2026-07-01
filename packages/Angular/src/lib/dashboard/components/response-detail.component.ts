import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ResponseDetail } from '../models/reporting.model';

/** Single-response detail: each answer labelled by its question from the snapshot. */
@Component({
  selector: 'mj-forms-response-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="detail">
      <header class="detail-head">
        <button type="button" class="back" (click)="back.emit()">
          <i class="fa-solid fa-arrow-left"></i> Back to responses
        </button>
        <div class="meta">
          <span class="status" [class.status--complete]="detail.status === 'Complete'">{{ detail.status }}</span>
          <span class="respondent">{{ detail.respondent }}</span>
          @if (detail.submittedAt) {
            <span class="ts">Submitted {{ detail.submittedAt.toLocaleString() }}</span>
          }
        </div>
      </header>

      @if (detail.answers.length === 0) {
        <p class="empty">This response has no answers.</p>
      } @else {
        <dl class="answers">
          @for (a of detail.answers; track a.questionId) {
            <div class="answer">
              <dt>{{ a.prompt }}</dt>
              <dd>{{ a.displayValue || '—' }}</dd>
            </div>
          }
        </dl>
      }
    </div>
  `,
  styles: [
    `
      .detail-head {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-2);
        margin-bottom: var(--mj-space-4);
      }
      .back {
        align-self: flex-start;
        background: none;
        border: none;
        color: var(--mj-brand-primary);
        cursor: pointer;
        font-size: 13px;
        padding: 0;
      }
      .meta {
        display: flex;
        gap: var(--mj-space-2);
        align-items: center;
        flex-wrap: wrap;
      }
      .respondent {
        font-weight: 600;
        color: var(--mj-text-primary);
      }
      .ts {
        font-size: 12px;
        color: var(--mj-text-muted);
      }
      .status {
        display: inline-block;
        padding: 2px var(--mj-space-2);
        border-radius: var(--mj-radius-full);
        font-size: 11px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
      }
      .status--complete {
        background: var(--mj-status-success);
        color: var(--mj-text-inverse);
      }
      .empty {
        color: var(--mj-text-muted);
        font-style: italic;
      }
      .answers {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-3);
      }
      .answer dt {
        font-size: 13px;
        font-weight: 600;
        color: var(--mj-text-secondary);
        margin-bottom: var(--mj-space-1);
      }
      .answer dd {
        margin: 0;
        font-size: 14px;
        color: var(--mj-text-primary);
        white-space: pre-wrap;
      }
    `,
  ],
})
export class FormsResponseDetailComponent {
  @Input({ required: true }) detail!: ResponseDetail;
  @Output() back = new EventEmitter<void>();
}
