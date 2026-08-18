import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MJ_CORE_ENTITY } from '../shared/entity-names';
import type {
  ResponseAnswerView,
  ResponseAutomationRunView,
  ResponseDetail,
  ResponseRecordLink,
} from './response-models';

/** Byte-size units, largest step first, for the human-readable file size. */
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/**
 * Single-response detail: each answer labelled by its question from the snapshot, with the
 * AI score behind it and the real file behind a file answer — plus what the submission
 * actually did (which automations ran, which business records they wrote).
 *
 * Deep links are emitted, not navigated: this component is mounted inside a dashboard
 * (which relays via `BaseDashboard.OpenEntityRecord`) and inside two `BaseFormComponent`
 * hosts (which relay via `Navigate`), and those are different idioms for the same intent.
 */
@Component({
  selector: 'mj-forms-response-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="detail">
      <header class="detail-head">
        @if (ShowBack) {
          <button type="button" class="back" (click)="Back.emit()">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to responses
          </button>
        }
        <div class="meta">
          <span class="status" [class.status--complete]="Detail.status === 'Complete'">{{ Detail.status }}</span>
          <span class="respondent">{{ Detail.respondent }}</span>
          @if (Detail.submittedAt) {
            <span class="ts">Submitted {{ Detail.submittedAt.toLocaleString() }}</span>
          }
        </div>
      </header>

      @if (Detail.answers.length === 0) {
        <p class="empty">This response has no answers.</p>
      } @else {
        <dl class="answers">
          @for (a of Detail.answers; track a.questionId) {
            <div class="answer">
              <dt>{{ a.prompt }}</dt>
              <dd>
                @if (a.file; as f) {
                  <button type="button" class="file" (click)="OpenFile(f.fileId)">
                    <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
                    <span class="file-name" [class.file-name--unresolved]="!f.isResolved">{{ f.fileName }}</span>
                    @if (f.sizeBytes !== null) {
                      <span class="file-size">{{ FileSize(f.sizeBytes) }}</span>
                    }
                  </button>
                  @if (f.isRevoked) {
                    <span class="badge badge--revoked" title="This file has been revoked and is no longer retrievable">Revoked</span>
                  }
                  @if (!f.isResolved) {
                    <span
                      class="badge badge--unresolved"
                      title="A file was submitted, but its upload record could not be read. The link still opens the file record.">Details unavailable</span>
                  }
                } @else {
                  {{ a.displayValue || '—' }}
                }

                @if (a.score !== null) {
                  <div class="score-row">
                    <span class="score" title="AI score">
                      <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> {{ a.score }}
                    </span>
                    @if (a.scoreRationale) {
                      <button
                        type="button"
                        class="score-toggle"
                        [attr.aria-expanded]="IsRationaleOpen(a)"
                        (click)="ToggleRationale(a)">
                        {{ IsRationaleOpen(a) ? 'Hide' : 'Why?' }}
                      </button>
                    }
                  </div>
                  @if (a.scoreRationale && IsRationaleOpen(a)) {
                    <p class="rationale">{{ a.scoreRationale }}</p>
                  }
                }
              </dd>
            </div>
          }
        </dl>
      }

      @if (Detail.automationRuns.length > 0 || Detail.bindingRecords.length > 0) {
        <section class="did">
          <h3 class="did-title">What this submission did</h3>

          @for (r of Detail.automationRuns; track r.runId) {
            <div class="run">
              <span class="pill" [class]="'pill--' + r.status.toLowerCase()">{{ r.status }}</span>
              <span class="run-name">{{ r.automationName }}</span>
              <span class="run-meta">
                @if (r.durationSeconds !== null) {
                  {{ r.durationSeconds }}s ·
                }
                {{ r.attemptCount }} {{ r.attemptCount === 1 ? 'attempt' : 'attempts' }}
              </span>
              @if (r.actionExecutionLogId) {
                <button type="button" class="link" (click)="OpenActionLog(r)">Action log</button>
              }
              @if (r.aiAgentRunId) {
                <button type="button" class="link" (click)="OpenAgentRun(r)">Agent run</button>
              }
              @if (r.errorMessage) {
                <p class="run-error">{{ r.errorMessage }}</p>
              }
              @if (r.outputSummary) {
                <p class="run-output">{{ r.outputSummary }}</p>
              }
            </div>
          }

          @for (b of Detail.bindingRecords; track b.bindingRecordId) {
            <div class="bind">
              <span class="pill" [class]="'pill--' + b.outcome.toLowerCase()">{{ b.outcome }}</span>
              <span class="bind-entity">{{ b.targetEntityName ?? b.targetEntityId }}</span>
              @if (b.targetEntityName && b.targetRecordId) {
                <button type="button" class="link" (click)="OpenBoundRecord(b.targetEntityName, b.targetRecordId)">
                  Open record
                </button>
              }
              @if (b.writtenFields.length > 0) {
                <span class="bind-fields">Wrote {{ b.writtenFields.join(', ') }}</span>
              }
            </div>
          }
        </section>
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

      /* File answers */
      .file {
        display: inline-flex;
        align-items: center;
        gap: var(--mj-space-2);
        font: inherit;
        min-height: 44px;
        padding: var(--mj-space-1) var(--mj-space-2);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface);
        color: var(--mj-text-link, var(--mj-brand-primary));
        cursor: pointer;
        text-align: left;
      }
      .file:hover {
        background: var(--mj-bg-surface-hover);
      }
      .file-name {
        overflow-wrap: anywhere;
      }
      .file-name--unresolved {
        font-style: italic;
        color: var(--mj-text-muted);
      }
      .file-size {
        color: var(--mj-text-muted);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      .badge {
        display: inline-block;
        margin-left: var(--mj-space-2);
        padding: 2px var(--mj-space-2);
        border-radius: var(--mj-radius-full);
        font-size: 11px;
      }
      .badge--unresolved {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-muted);
        border: 1px solid var(--mj-border-default);
      }
      .badge--revoked {
        background: var(--mj-status-warning-bg, var(--mj-bg-surface-sunken));
        color: var(--mj-status-warning-text, var(--mj-text-secondary));
        border: 1px solid var(--mj-status-warning-border, var(--mj-border-default));
      }

      /* AI scoring */
      .score-row {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2);
        margin-top: var(--mj-space-1);
      }
      .score {
        display: inline-flex;
        align-items: center;
        gap: var(--mj-space-1);
        padding: 2px var(--mj-space-2);
        border-radius: var(--mj-radius-full);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        background: var(--mj-status-info-bg, var(--mj-bg-surface-sunken));
        color: var(--mj-status-info-text, var(--mj-text-secondary));
      }
      .score-toggle {
        font: inherit;
        font-size: 12px;
        min-height: 44px;
        padding: 0 var(--mj-space-1);
        background: none;
        border: none;
        color: var(--mj-brand-primary);
        cursor: pointer;
      }
      .rationale {
        margin: var(--mj-space-1) 0 0;
        font-size: 13px;
        color: var(--mj-text-secondary);
        white-space: pre-wrap;
      }

      /* What this submission did */
      .did {
        margin-top: var(--mj-space-5, var(--mj-space-4));
        padding-top: var(--mj-space-4);
        border-top: 1px solid var(--mj-border-subtle);
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-2);
      }
      .did-title {
        margin: 0 0 var(--mj-space-1);
        font-size: 13px;
        font-weight: 600;
        color: var(--mj-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .run,
      .bind {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2);
        flex-wrap: wrap;
        font-size: 13px;
        color: var(--mj-text-primary);
      }
      .run-name,
      .bind-entity {
        font-weight: 600;
      }
      .run-meta,
      .bind-fields {
        color: var(--mj-text-muted);
        font-size: 12px;
      }
      .run-error,
      .run-output {
        flex-basis: 100%;
        margin: 0;
        font-size: 12px;
        white-space: pre-wrap;
      }
      .run-error {
        color: var(--mj-status-error-text, var(--mj-status-error));
      }
      .run-output {
        color: var(--mj-text-muted);
      }
      .link {
        font: inherit;
        font-size: 12px;
        min-height: 44px;
        padding: 0 var(--mj-space-1);
        background: none;
        border: none;
        color: var(--mj-brand-primary);
        cursor: pointer;
      }

      /*
       * Run/outcome states are SEMANTIC status colors, never the brand accent — a green
       * "Succeeded" and a red "Failed" must read as status even when the accent is red.
       */
      .pill {
        display: inline-block;
        padding: 2px var(--mj-space-2);
        border-radius: var(--mj-radius-full);
        font-size: 11px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
      }
      .pill--succeeded,
      .pill--created {
        background: var(--mj-status-success-bg, var(--mj-bg-surface-sunken));
        color: var(--mj-status-success-text, var(--mj-text-secondary));
      }
      .pill--failed {
        background: var(--mj-status-error-bg, var(--mj-bg-surface-sunken));
        color: var(--mj-status-error-text, var(--mj-text-secondary));
      }
      .pill--running,
      .pill--merged {
        background: var(--mj-status-info-bg, var(--mj-bg-surface-sunken));
        color: var(--mj-status-info-text, var(--mj-text-secondary));
      }
      .pill--pending {
        background: var(--mj-status-warning-bg, var(--mj-bg-surface-sunken));
        color: var(--mj-status-warning-text, var(--mj-text-secondary));
      }

      @media (max-width: 600px) {
        .run,
        .bind {
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class FormsResponseDetailComponent {
  @Input({ required: true }) Detail!: ResponseDetail;

  /**
   * Whether to offer "Back to responses". True inside the list-and-detail mounts (the
   * dashboard and builder tabs); false when the detail IS the page, as in the Form Response
   * entity-form override, where there is no list to go back to.
   */
  @Input() ShowBack = true;

  @Output() Back = new EventEmitter<void>();

  /**
   * A record the user asked to open. The host maps it to its own navigation:
   * `OpenEntityRecord` on a dashboard, `Navigate` on a form component.
   */
  @Output() OpenRecord = new EventEmitter<ResponseRecordLink>();

  /** Question ids whose score rationale is expanded. */
  private readonly openRationales = new Set<string>();

  public IsRationaleOpen(a: ResponseAnswerView): boolean {
    return this.openRationales.has(a.questionId);
  }

  public ToggleRationale(a: ResponseAnswerView): void {
    if (!this.openRationales.delete(a.questionId)) {
      this.openRationales.add(a.questionId);
    }
  }

  public OpenFile(fileId: string): void {
    this.OpenRecord.emit({ entityName: MJ_CORE_ENTITY.File, recordId: fileId });
  }

  public OpenActionLog(r: ResponseAutomationRunView): void {
    if (r.actionExecutionLogId) {
      this.OpenRecord.emit({
        entityName: MJ_CORE_ENTITY.ActionExecutionLog,
        recordId: r.actionExecutionLogId,
      });
    }
  }

  public OpenAgentRun(r: ResponseAutomationRunView): void {
    if (r.aiAgentRunId) {
      this.OpenRecord.emit({ entityName: MJ_CORE_ENTITY.AIAgentRun, recordId: r.aiAgentRunId });
    }
  }

  public OpenBoundRecord(entityName: string, recordId: string): void {
    this.OpenRecord.emit({ entityName, recordId });
  }

  /** Human-readable byte size, e.g. `180 KB`. */
  public FileSize(bytes: number): string {
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${unit === 0 ? value : value.toFixed(1)} ${SIZE_UNITS[unit]}`;
  }
}
