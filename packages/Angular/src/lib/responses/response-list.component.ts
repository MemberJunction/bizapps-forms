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
 *
 * The host pages the rows (`Forms.ListResponses`, 200 at a time) and says how many there are in
 * all (`Total`) and whether another page may be asked for (`CanLoadMore` — the host knows when a
 * page came back short, or when the list changed under it, and then says why in `Notice`). The
 * search says it searches only the rows loaded so far, which is the truth until every page is in.
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
          [placeholder]="AllLoaded() ? 'Search respondent' : 'Search the loaded responses'"
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
      <div class="mjf-table-wrap" [class.rl-busy]="Busy" [attr.aria-busy]="Busy">
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

    @if (Total !== null && Total > 0) {
      <div class="rl-more">
        <span class="rl-count">{{ countLine() }}</span>
        @if (Notice) {
          <span class="rl-notice" role="status">{{ Notice }}</span>
        } @else if (CanLoadMore) {
          <button type="button" class="mjf-btn mjf-btn--ghost mjf-btn--sm" [disabled]="LoadingMore" (click)="LoadMore.emit()">
            @if (LoadingMore) {
              <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading…
            } @else {
              <i class="fa-solid fa-chevron-down" aria-hidden="true"></i> Load more
            }
          </button>
        }
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

      .rl-more {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--mjf-gap-sm);
        margin-top: var(--mjf-gap);
      }
      .rl-count { font-size: var(--mjf-meta); color: var(--mj-text-muted); font-variant-numeric: tabular-nums; }
      .rl-notice { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-status-warning-text); }
      /* While a response opens: the rows stay where the reader clicked, visibly on hold. */
      .rl-busy { opacity: 0.6; pointer-events: none; }
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

  /** Asks the host for the next page. Offered only while fewer than `Total` rows are loaded. */
  @Output() LoadMore = new EventEmitter<void>();

  /** While the host is fetching the next page. */
  @Input() LoadingMore = false;

  /** Whether the host can fetch another page. */
  @Input() CanLoadMore = false;

  /** While the host is opening a response: the rows are held, dimmed, and announced busy. */
  @Input() Busy = false;

  /** A sentence shown where "Load more" would be, when paging has stopped for a reason. */
  @Input() Notice: string | null = null;

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

  private readonly _total = signal<number | null>(null);
  /** How many rows the list has in all, across pages; `null` when the host does not page. */
  @Input()
  set Total(value: number | null) {
    this._total.set(value);
  }
  get Total(): number | null {
    return this._total();
  }

  /** Whether every row is loaded (always, when the host does not page). */
  public readonly AllLoaded = computed(() => {
    const total = this._total();
    return total === null || this._rows().length >= total;
  });

  /** "Showing 200 of 1,204 responses" while paging; "1,204 responses" once all are in. */
  public readonly countLine = computed(() => responseCountLine(this._rows().length, this._total() ?? this._rows().length));

  /**
   * Whether the status filter is worth offering.
   *
   * Every caller lists COMPLETE responses only (`Forms.ListResponses` with `Status: 'Complete'`),
   * so against them the Partial chip can never match and the filter is dead controls. The component still takes arbitrary `Rows`, so rather than delete a
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

/** The paging line under the list. */
export function responseCountLine(loaded: number, total: number): string {
  const all = `${total.toLocaleString()} ${total === 1 ? 'response' : 'responses'}`;
  return loaded >= total ? all : `Showing ${loaded.toLocaleString()} of ${all}`;
}
