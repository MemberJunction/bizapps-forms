import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { LogError, RunView } from '@memberjunction/core';
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

// No advice to reload the record: a record refresh does not remount this list. Retry does.
const LOAD_FAILED_MESSAGE = "This person's form responses could not be loaded.";

/**
 * The body of the Person "Forms" section: every form response linked to one person, newest
 * first. Loads when mounted (the panel mounts it only while the section is expanded) and again on Retry,
 * and reports the row count so the section header can show it.
 */
@Component({
  selector: 'mjf-person-form-responses-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (State()) {
      @case ('loading') {
        <p class="pfr-loading" role="status">
          <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
          Loading forms…
        </p>
      }
      @case ('error') {
        <div class="mjf-empty" role="alert">
          <span class="mjf-empty-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span>
          <span class="mjf-empty-title">Forms could not be loaded</span>
          <p class="mjf-empty-body">{{ ErrorMessage() }}</p>
          <button type="button" class="mjf-btn mjf-btn--sm" (click)="Retry()">
            <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
            Retry
          </button>
        </div>
      }
      @default {
        @if (Rows().length === 0) {
          <div class="mjf-empty">
            <span class="mjf-empty-icon"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i></span>
            <span class="mjf-empty-title">No forms yet</span>
            <p class="mjf-empty-body">Responses this person submits will appear here.</p>
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
                      <span class="mjf-badge mjf-badge--{{ r.Tone }}">{{ r.Status }}</span>
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

      .pfr-loading {
        display: flex;
        align-items: center;
        gap: var(--mjf-gap-sm);
        margin: 0;
        padding: var(--mjf-gap) 0;
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
export class PersonFormResponsesListComponent implements OnInit {
  @Input({ required: true }) PersonID!: string;
  @Output() Loaded = new EventEmitter<number>();
  @Output() OpenResponse = new EventEmitter<string>();

  public readonly State = signal<ListState>('loading');
  public readonly Rows = signal<PersonFormResponseRow[]>([]);
  public readonly ErrorMessage = signal<string>('');

  public ngOnInit(): void {
    void this.load();
  }

  /** Re-runs the load from the error state; back to loading, then ready or error. */
  public Retry(): void {
    void this.load();
  }

  private async load(): Promise<void> {
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
        this.fail(result.ErrorMessage || 'the view reported a failure with no error message');
        return;
      }
      const rows = ToPersonFormResponseRows(result.Results);
      this.Rows.set(rows);
      this.State.set('ready');
      this.Loaded.emit(rows.length);
    } catch (error) {
      // RunView reports query failures in the result; a throw here is infrastructure (no
      // provider, network) or a non-GUID person id refused by the filter builder.
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private fail(reason: string): void {
    LogError(`PersonFormResponses: loading responses for person ${this.PersonID} failed — ${reason}`);
    this.ErrorMessage.set(LOAD_FAILED_MESSAGE);
    this.State.set('error');
  }
}
