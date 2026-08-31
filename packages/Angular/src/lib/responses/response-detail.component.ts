import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { FORMS_UI_CSS } from '../shared';
import { MJ_CORE_ENTITY } from '../shared/entity-names';
import type {
  ResponseAnswerView,
  ResponseFileView,
  ResponseAutomationRunView,
  ResponseBindingRecordView,
  ResponseDetail,
  ResponseRecordLink,
} from './response-models';
import { ResponseFileDownloadService } from './response-file-download.service';

/** Byte-size units, largest step first, for the human-readable file size. */
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/**
 * Run status / binding outcome -> badge tone.
 *
 * These map to SEMANTIC status tones, never the brand accent — "Succeeded" and "Failed"
 * have to read as status even on a tenant whose accent happens to be the same hue as
 * one of them. Both maps are total over their CodeGen union, so a new value in the
 * CHECK constraint fails the build here instead of silently rendering as neutral.
 */
const RUN_TONE: Record<ResponseAutomationRunView['status'], string> = {
  Succeeded: 'mjf-badge--success',
  Failed: 'mjf-badge--danger',
  Running: 'mjf-badge--info',
  Pending: 'mjf-badge--warning',
  Skipped: '',
};

const OUTCOME_TONE: Record<ResponseBindingRecordView['outcome'], string> = {
  Created: 'mjf-badge--success',
  Merged: 'mjf-badge--info',
  Unchanged: '',
  Skipped: '',
};

/**
 * Single-response detail: each answer labelled by its question from the snapshot, with the
 * real file behind a file answer — plus what the submission actually did (which automations
 * ran, which business records they wrote).
 *
 * Deep links are emitted, not navigated: this component is mounted inside a dashboard
 * (which relays via `BaseDashboard.OpenEntityRecord`) and inside two `BaseFormComponent`
 * hosts (which relay via `Navigate`), and those are different idioms for the same intent.
 */
@Component({
  selector: 'mj-forms-response-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ResponseFileDownloadService],
  template: `
    <div class="rd">
      <header class="rd-head">
        @if (ShowBack) {
          <button #backButton type="button" class="mjf-btn mjf-btn--quiet mjf-btn--sm rd-back" (click)="Back.emit()">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to responses
          </button>
        }
        <div class="meta">
          <span class="mjf-badge" [class.mjf-badge--success]="Detail.status === 'Complete'">{{ Detail.status }}</span>
          <span class="respondent">{{ Detail.respondent }}</span>
          @if (Detail.submittedAt) {
            <span class="ts">Submitted {{ Detail.submittedAt.toLocaleString() }}</span>
          }
        </div>
      </header>

      @if (Detail.unlabelledAnswerCount > 0) {
        <p class="rd-note" role="status">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          {{ Detail.unlabelledAnswerCount }}
          {{ Detail.unlabelledAnswerCount === 1 ? 'answer is' : 'answers are' }} not shown:
          the form version being used for labels has no matching question, so there is no
          truthful prompt to show them under.
        </p>
      }

      @if (Detail.answers.length === 0) {
        <p class="rd-empty">
          {{ Detail.unlabelledAnswerCount > 0
             ? 'None of this response’s answers could be labelled.'
             : 'This response has no answers.' }}
        </p>
      } @else {
        <dl class="answers">
          @for (a of Detail.answers; track a.questionId) {
            <div class="answer">
              <dt>{{ a.prompt }}</dt>
              <dd>
                @if (a.file; as f) {
                  <!-- Clicking downloads the file itself. It used to open the MJ: Files RECORD,
                       which is a metadata page about a row — never what someone reviewing an
                       application wanted from a résumé. A revoked file has no bytes left to
                       fetch, so it stays a plain label rather than a button that can only fail. -->
                  <button
                    type="button"
                    class="file"
                    [disabled]="f.isRevoked || DownloadingFileId === f.fileId"
                    [attr.aria-busy]="DownloadingFileId === f.fileId"
                    [title]="f.isRevoked ? 'This file was revoked and is no longer stored' : 'Download ' + f.fileName"
                    (click)="DownloadFile(f)"
                  >
                    @if (DownloadingFileId === f.fileId) {
                      <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                    } @else {
                      <i class="fa-solid fa-download" aria-hidden="true"></i>
                    }
                    <span class="file-name" [class.file-name--unresolved]="!f.isResolved">{{ f.fileName }}</span>
                    @if (f.sizeBytes !== null) {
                      <span class="file-size">{{ FileSize(f.sizeBytes) }}</span>
                    }
                  </button>
                  @if (f.isRevoked) {
                    <span class="mjf-badge mjf-badge--warning" title="This file has been revoked and is no longer retrievable">Revoked</span>
                  }
                  @if (!f.isResolved) {
                    <span
                      class="mjf-badge"
                      title="A file was submitted, but its upload record could not be read. Downloading it may still work.">Details unavailable</span>
                  }
                  <!-- The record is still one click away for anyone who wants the metadata; it
                       is just no longer what the filename does. -->
                  <button
                    type="button"
                    class="mjf-btn mjf-btn--quiet mjf-btn--sm"
                    [title]="'Open the file record for ' + f.fileName"
                    [attr.aria-label]="'Open the file record for ' + f.fileName"
                    (click)="OpenFile(f.fileId)"
                  >
                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                  </button>
                  @if (DownloadError && DownloadErrorFileId === f.fileId) {
                    <span class="file-error" role="alert">{{ DownloadError }}</span>
                  }
                } @else {
                  {{ a.displayValue || '—' }}
                }
              </dd>
            </div>
          }
        </dl>
      }

      @if (Detail.unavailableSections.length > 0) {
        <p class="rd-note" role="status">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          Could not load {{ Detail.unavailableSections.join(', ') }} for this response — your
          role may not have read access. What is shown below is incomplete rather than empty.
        </p>
      }

      @if (Detail.automationRuns.length > 0 || Detail.bindingRecords.length > 0) {
        <section class="rd-did">
          <h3 class="mjf-section-title rd-did-title">What this submission did</h3>

          @for (r of Detail.automationRuns; track r.runId) {
            <div class="run">
              <span class="mjf-badge" [class]="RunTone(r)">{{ r.status }}</span>
              <span class="run-name">{{ r.automationName }}</span>
              <span class="run-meta">
                @if (r.durationSeconds !== null) {
                  {{ r.durationSeconds }}s ·
                }
                {{ r.attemptCount }} {{ r.attemptCount === 1 ? 'attempt' : 'attempts' }}
              </span>
              @if (r.actionExecutionLogId) {
                <button type="button" class="mjf-btn mjf-btn--quiet mjf-btn--sm" (click)="OpenActionLog(r)">Action log</button>
              }
              @if (r.aiAgentRunId) {
                <button type="button" class="mjf-btn mjf-btn--quiet mjf-btn--sm" (click)="OpenAgentRun(r)">Agent run</button>
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
              <span class="mjf-badge" [class]="OutcomeTone(b)">{{ b.outcome }}</span>
              <span class="bind-entity">{{ b.targetEntityName ?? b.targetEntityId }}</span>
              @if (b.targetEntityName && b.targetRecordId) {
                <button type="button" class="mjf-btn mjf-btn--quiet mjf-btn--sm" (click)="OpenBoundRecord(b.targetEntityName, b.targetRecordId)">
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
    FORMS_UI_CSS,
    `
      :host { display: block; }
      .rd { display: flex; flex-direction: column; gap: var(--mjf-stack); }

      /* --- header --- */

      .rd-head { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mjf-gap-sm); }
      /* The sole escape from the detail view, so it is drawn as a real button rather than
         a bare link: a border, a radius and a hover it visibly responds to. The arrow
         slides on hover to say which way it goes. */
      .rd-back {
        padding: 0 14px;
        color: var(--mj-text-secondary);
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mjf-radius-pill);
      }
      .rd-back:hover:not(:disabled) {
        color: var(--mj-text-primary);
        background: var(--mj-bg-surface-hover);
        border-color: var(--mj-border-strong);
      }
      .rd-back i { transition: transform var(--mjf-ease); }
      .rd-back:hover i { transform: translateX(-2px); }
      .meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--mjf-gap-sm); }
      .respondent { font-size: var(--mjf-section); font-weight: 600; color: var(--mj-text-primary); }
      .ts { font-size: var(--mjf-meta); color: var(--mj-text-muted); }

      /* --- notes --- */

      .rd-note {
        display: flex;
        align-items: flex-start;
        gap: var(--mjf-gap-sm);
        margin: 0;
        padding: 12px 16px;
        font-size: var(--mjf-meta);
        line-height: 1.5;
        border: 1px solid var(--mj-status-warning-border);
        border-radius: var(--mjf-radius-sm);
        background: var(--mj-status-warning-bg);
        color: var(--mj-status-warning-text);
      }
      .rd-empty { margin: 0; font-size: var(--mjf-body); color: var(--mj-text-muted); }

      /* --- answers ---
         One card, one row per answer. Separating rows with a hairline rather than
         giving each answer its own card keeps a 20-question response readable as a
         single transcript instead of a stack of twenty boxes. */

      .answers {
        margin: 0;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mjf-radius);
        background: var(--mj-bg-surface);
        overflow: hidden;
      }
      .answer { padding: var(--mjf-card-pad); }
      .answer + .answer { border-top: 1px solid var(--mjf-rule); }
      .answer dt {
        margin: 0 0 6px;
        font-size: var(--mjf-meta);
        font-weight: 600;
        color: var(--mj-text-secondary);
      }
      .answer dd {
        margin: 0;
        font-size: var(--mjf-body);
        line-height: 1.55;
        color: var(--mj-text-primary);
        white-space: pre-wrap;
      }

      /* --- file answers --- */

      .file {
        display: inline-flex;
        align-items: center;
        gap: var(--mjf-gap-sm);
        min-height: var(--mjf-tap);
        padding: 0 12px;
        font: inherit;
        font-size: var(--mjf-meta);
        font-weight: 500;
        text-align: left;
        cursor: pointer;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mjf-radius-sm);
        background: var(--mj-bg-surface);
        color: var(--mj-text-link, var(--mj-brand-primary));
        transition: background var(--mjf-ease), border-color var(--mjf-ease);
      }
      .file:hover { background: var(--mj-bg-surface-hover); border-color: var(--mj-border-strong); }
      .file:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
      /* A revoked file has no bytes behind it, so the control reads as unavailable rather than
         as something that will work if pressed harder. */
      .file:disabled {
        cursor: not-allowed;
        color: var(--mj-text-muted);
        background: var(--mj-bg-surface-sunken);
      }
      .file:disabled:hover { background: var(--mj-bg-surface-sunken); border-color: var(--mj-border-default); }
      .file-name { overflow-wrap: anywhere; }
      .file-name--unresolved { font-style: italic; color: var(--mj-text-muted); }
      .file-size { color: var(--mj-text-muted); font-variant-numeric: tabular-nums; }
      /* Beside the file it belongs to, never as a page-level banner: which file failed is the
         first thing the reader needs to know. */
      .file-error { font-size: var(--mjf-meta); color: var(--mj-status-error-text); }

      /* --- what this submission did --- */

      .rd-did { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); }
      .rd-did-title { margin-bottom: var(--mjf-gap-xs); }
      .run,
      .bind {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--mjf-gap-sm);
        padding: 12px var(--mjf-card-pad-sm);
        font-size: var(--mjf-meta);
        color: var(--mj-text-primary);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mjf-radius-sm);
        background: var(--mj-bg-surface);
      }
      .run-name,
      .bind-entity { font-weight: 600; }
      .run-meta,
      .bind-fields { color: var(--mj-text-muted); }
      .run-error,
      .run-output { flex-basis: 100%; margin: 0; font-size: var(--mjf-label); line-height: 1.5; white-space: pre-wrap; }
      .run-error { color: var(--mj-status-error-text); }
      .run-output { color: var(--mj-text-muted); }

      @media (max-width: 600px) {
        .run,
        .bind { align-items: flex-start; }
      }
    `,
  ],
})
export class FormsResponseDetailComponent implements AfterViewInit {
  private readonly downloads = inject(ResponseFileDownloadService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** The file currently being fetched, so only its own row shows a spinner. */
  public DownloadingFileId = '';
  /** The last download failure, and which file it belongs to. */
  public DownloadError = '';
  public DownloadErrorFileId = '';

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

  @ViewChild('backButton') private backButton?: ElementRef<HTMLButtonElement>;

  /**
   * Opening a response destroys the row the user activated, which drops focus to `<body>` —
   * a keyboard user then has to tab from the top of the Explorer shell to get back. Moving
   * focus to Back both restores a sensible position and announces the view change.
   */
  public ngAfterViewInit(): void {
    this.backButton?.nativeElement.focus();
  }

  /** Badge tone for an automation run's status. See RUN_TONE. */
  public RunTone(r: ResponseAutomationRunView): string {
    return RUN_TONE[r.status] ?? '';
  }

  /** Badge tone for a binding record's outcome. See OUTCOME_TONE. */
  public OutcomeTone(b: ResponseBindingRecordView): string {
    return OUTCOME_TONE[b.outcome] ?? '';
  }

  /**
   * Download one file answer.
   *
   * State is kept per file id rather than as a single boolean so a failure lands next to the
   * file it belongs to. A reviewer looking at a response with a résumé and a drawing needs to
   * know which one did not arrive, and one shared error message beside both answers that
   * question wrongly half the time.
   */
  public async DownloadFile(file: ResponseFileView): Promise<void> {
    if (file.isRevoked || this.DownloadingFileId) {
      return;
    }
    this.DownloadingFileId = file.fileId;
    this.DownloadError = '';
    this.DownloadErrorFileId = '';
    try {
      const outcome = await this.downloads.download(file.fileId, file.fileName);
      if (!outcome.ok) {
        this.DownloadError = outcome.error ?? 'The download did not go through.';
        this.DownloadErrorFileId = file.fileId;
      }
    } finally {
      this.DownloadingFileId = '';
      // OnPush with an awaited handler: without this the spinner never clears, because nothing
      // else on this component changes when the promise settles.
      this.cdr.markForCheck();
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
