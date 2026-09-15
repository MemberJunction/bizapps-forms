import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FORMS_UI_CSS } from '../shared';
import type { ResponseListRow, ResponseStatus } from './response-models';

/** Status filter values for the response list: any status, or one specific one. */
type StatusFilter = 'all' | ResponseStatus;

/**
 * Individual-response list with text search + status filter (simple cross-tab).
 * A semantic, token-styled table — clicking a row emits the response id so the
 * dashboard can open the detail view. Horizontal scroll is contained.
 */
@Component({
  selector: 'mj-forms-response-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="rl-toolbar">
      <div class="mjf-search">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input
          class="mjf-input"
          type="search"
          placeholder="Search respondent"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
          aria-label="Search responses by respondent" />
      </div>
      @if (StatusFiltersApply()) {
      <div class="mjf-seg" role="group" aria-label="Filter by status">
        @for (f of statusFilters; track f.value) {
          <button
            type="button"
            [class.is-on]="statusFilter() === f.value"
            [attr.aria-pressed]="statusFilter() === f.value"
            (click)="statusFilter.set(f.value)">
            {{ f.label }}
          </button>
        }
      </div>
      }
    </div>

    @if (filtered().length === 0) {
      <div class="mjf-empty">
        <span class="mjf-empty-icon"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
        <span class="mjf-empty-title">No responses match</span>
        <p class="mjf-empty-body">Clear the search or the status filter to see them all.</p>
      </div>
    } @else {
      <div class="mjf-table-wrap">
        <table class="mjf-table">
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Respondent</th>
              <th scope="col" class="is-num">Answered</th>
              <th scope="col">Submitted</th>
              <th scope="col"><span class="rl-sr">Open</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of filtered(); track r.responseId) {
              <tr class="is-clickable" (click)="Open.emit(r.responseId)">
                <td>
                  <span class="mjf-badge" [class.mjf-badge--success]="r.status === 'Complete'">
                    {{ r.status }}
                  </span>
                </td>
                <td>{{ r.respondent }}</td>
                <td class="is-num">{{ r.answeredCount }}</td>
                <td class="rl-when">{{ submittedLabel(r) }}</td>
                <td class="rl-open-cell">
                  <button
                    type="button"
                    class="mjf-btn mjf-btn--quiet mjf-btn--icon mjf-btn--sm"
                    [attr.aria-label]="'Open response from ' + r.respondent"
                    (click)="$event.stopPropagation(); Open.emit(r.responseId)">
                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    FORMS_UI_CSS,
    `
      :host { display: block; }

      .rl-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--mjf-gap-sm);
        margin-bottom: var(--mjf-gap);
      }
      .rl-toolbar .mjf-search { flex: 1 1 240px; max-width: 360px; }

      .rl-when { color: var(--mj-text-secondary); white-space: nowrap; }
      .rl-open-cell { width: 1%; text-align: right; padding-left: 0; }

      /* The header cell above the open button needs an accessible name without a
         visible one; an empty <th> announces as a blank column. */
      .rl-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
    `,
  ],
})
export class FormsResponseListComponent {
  @Output() Open = new EventEmitter<string>();

  public readonly search = signal('');
  public readonly statusFilter = signal<StatusFilter>('all');

  public readonly statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'Complete', label: 'Complete' },
    { value: 'Partial', label: 'Partial' },
  ];

  private readonly _rows = signal<ResponseListRow[]>([]);
  @Input({ required: true })
  set Rows(value: ResponseListRow[]) {
    this._rows.set(value ?? []);
  }

  /**
   * Whether the status filter is worth offering.
   *
   * All three callers build their rows with `buildResponseRows`, which lists COMPLETE
   * responses only — so against them the Partial chip can never match and the filter is
   * dead controls. The component still takes arbitrary `Rows`, so rather than delete a
   * working capability we show the filter only when the rows actually span more than one
   * status. Today that means it is hidden; a caller that passes Partials gets it back.
   */
  public readonly StatusFiltersApply = computed(
    () => new Set(this._rows().map((r) => r.status)).size > 1,
  );

  public readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    // Ignore a status selection whose chips are not on screen. Otherwise a caller that
    // swaps mixed-status rows for single-status ones strands the user on an empty list
    // with no visible control to clear the filter they can no longer see.
    const status = this.StatusFiltersApply() ? this.statusFilter() : 'all';
    return this._rows().filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (term && !r.respondent.toLowerCase().includes(term)) return false;
      return true;
    });
  });

  public submittedLabel(r: ResponseListRow): string {
    return r.submittedAt ? r.submittedAt.toLocaleString() : '—';
  }
}
