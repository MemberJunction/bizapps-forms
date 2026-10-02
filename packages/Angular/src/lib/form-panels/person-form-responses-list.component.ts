import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LogError, RunView } from '@memberjunction/core';
import { FormRecordRefreshCoordinator } from '@memberjunction/ng-base-forms';
import { FORMS_UI_CSS } from '../shared';
import { FORMS_ENTITY } from '../shared/entity-names';
import {
  BuildPersonFormResponsesFilter,
  PERSON_FORM_RESPONSE_FIELDS,
  ToPersonFormResponseRows,
  type PersonFormResponseRaw,
  type PersonFormResponseRow,
} from './person-form-responses.model';

type ListState = 'loading' | 'ready' | 'error';

// No "reload the record" advice: the Retry button rendered beside it is the direct action.
const LOAD_FAILED_MESSAGE = "This person's form responses could not be loaded.";

/**
 * The body of the Person "Forms" section: every form response linked to one person, newest
 * first. Loads when mounted (the panel mounts it on first expansion and keeps it mounted), and
 * reloads on Retry, on a change of person, and when the host form refreshes its record from the
 * database. Reports each loaded row count so the section header can show it.
 */
@Component({
  selector: 'mjf-person-form-responses-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (State()) {
      @case ('loading') {
        <div class="pfr-state">
          <p class="pfr-loading" role="status">
            <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
            Loading forms…
          </p>
        </div>
      }
      @case ('error') {
        <div class="pfr-state">
          <div class="mjf-empty" role="alert">
            <span class="mjf-empty-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span>
            <span class="mjf-empty-title">Forms could not be loaded</span>
            <p class="mjf-empty-body">{{ ErrorMessage() }}</p>
            <button type="button" class="mjf-btn mjf-btn--sm" (click)="Retry()">
              <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
              Retry
            </button>
          </div>
        </div>
      }
      @default {
        @if (Rows().length === 0) {
          <div class="pfr-state">
            <div class="mjf-empty">
              <span class="mjf-empty-icon"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i></span>
              <span class="mjf-empty-title">No forms yet</span>
              <p class="mjf-empty-body">Responses this person submits will appear here.</p>
            </div>
          </div>
        } @else {
          <div class="mjf-table-wrap">
            <table class="mjf-table">
              <thead>
                <tr>
                  <th scope="col">Form</th>
                  <th scope="col">Status</th>
                  <th scope="col">Started</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                @for (r of Rows(); track r.ResponseID) {
                  <tr class="is-clickable" (click)="OpenResponse.emit(r.ResponseID)">
                    <td>
                      <!-- The button is the keyboard path; the row click is the pointer convenience. -->
                      <button
                        type="button"
                        class="pfr-open"
                        [attr.aria-label]="'Open response to ' + r.FormName"
                        (click)="$event.stopPropagation(); OpenResponse.emit(r.ResponseID)">
                        {{ r.FormName }}
                      </button>
                    </td>
                    <td>
                      <!-- Neutral is the plain badge, matching Forms' own Responses list. -->
                      <span
                        class="mjf-badge"
                        [class.mjf-badge--success]="r.Tone === 'success'"
                        [class.mjf-badge--warning]="r.Tone === 'warning'">{{ r.Status }}</span>
                    </td>
                    <td class="pfr-when">{{ r.StartedText }}</td>
                    <td class="pfr-when">
                      @if (r.IsInProgress) {
                        <span class="pfr-progress">
                          <i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>
                          In progress
                        </span>
                      } @else {
                        {{ r.SubmittedText }}
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    }
  `,
  styles: [
    FORMS_UI_CSS,
    `
      :host { display: block; }

      /* A related-entity panel has zero content padding, so the non-table states supply their
         own; the table pads its cells and is left alone. */
      .pfr-state { padding: var(--mjf-gap) var(--mjf-card-pad-sm); }

      .pfr-loading {
        display: flex;
        align-items: center;
        gap: var(--mjf-gap-sm);
        margin: 0;
        font-size: var(--mjf-meta);
        color: var(--mj-text-secondary);
      }

      .pfr-open {
        min-height: var(--mjf-tap);
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-weight: 600;
        text-align: left;
        color: var(--mj-text-link);
        cursor: pointer;
      }
      .pfr-open:hover { text-decoration: underline; }
      .pfr-open:focus-visible {
        outline: 2px solid var(--mjf-focus-ring);
        outline-offset: 2px;
        border-radius: 2px;
      }

      .pfr-when { color: var(--mj-text-secondary); white-space: nowrap; }
      .pfr-progress {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--mj-status-warning-text);
      }
    `,
  ],
})
export class PersonFormResponsesListComponent implements OnInit, OnChanges {
  @Input({ required: true }) PersonID!: string;
  @Output() Loaded = new EventEmitter<number>();
  @Output() OpenResponse = new EventEmitter<string>();

  public readonly State = signal<ListState>('loading');
  public readonly Rows = signal<PersonFormResponseRow[]>([]);
  public readonly ErrorMessage = signal<string>('');

  /** Bumped by every load; a result is applied only if no later load has started since. */
  private loadSequence = 0;

  constructor() {
    // Optional: absent when the list is shown outside an MJ record form.
    inject(FormRecordRefreshCoordinator, { optional: true })
      ?.Refreshed$.pipe(takeUntilDestroyed())
      .subscribe(() => this.reloadIfLoaded());
  }

  public ngOnInit(): void {
    void this.load();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    // The first PersonID is loaded by ngOnInit; a later one means a different person.
    if (changes['PersonID'] && !changes['PersonID'].firstChange) void this.load();
  }

  /** Re-runs the load from the error state; back to loading, then ready or error. */
  public Retry(): void {
    void this.load();
  }

  /** The coordinator's contract: a listener that has never loaded must not start loading on a refresh. */
  private reloadIfLoaded(): void {
    if (this.loadSequence > 0) void this.load();
  }

  private async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.State.set('loading');
    try {
      const result = await new RunView().RunView<PersonFormResponseRaw>({
        EntityName: FORMS_ENTITY.FormResponse,
        Fields: [...PERSON_FORM_RESPONSE_FIELDS],
        ExtraFilter: BuildPersonFormResponsesFilter(this.PersonID),
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'simple',
      });
      if (!result.Success) {
        this.fail(sequence, result.ErrorMessage || 'the view reported a failure with no error message');
        return;
      }
      if (sequence !== this.loadSequence) return; // superseded: a newer load owns the state
      const rows = ToPersonFormResponseRows(result.Results);
      this.Rows.set(rows);
      this.State.set('ready');
      this.Loaded.emit(rows.length);
    } catch (error) {
      // RunView reports query failures in the result; a throw here is infrastructure (no
      // provider, network) or a non-GUID person id refused by the filter builder.
      this.fail(sequence, error instanceof Error ? error.message : String(error));
    }
  }

  /** Always logs; only the latest load may put the list into the error state. */
  private fail(sequence: number, reason: string): void {
    LogError(`PersonFormResponses: loading responses for person ${this.PersonID} failed — ${reason}`);
    if (sequence !== this.loadSequence) return;
    this.ErrorMessage.set(LOAD_FAILED_MESSAGE);
    this.State.set('error');
  }
}
