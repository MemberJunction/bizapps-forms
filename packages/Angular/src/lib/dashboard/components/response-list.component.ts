import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ResponseListRow } from '../models/reporting.model';

/** Status filter values for the response list. */
type StatusFilter = 'all' | 'Complete' | 'Partial';

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
    <div class="toolbar">
      <input
        class="search"
        type="search"
        placeholder="Search respondent..."
        [ngModel]="search()"
        (ngModelChange)="search.set($event)"
        aria-label="Search responses by respondent" />
      <div class="filters" role="group" aria-label="Filter by status">
        @for (f of statusFilters; track f.value) {
          <button
            type="button"
            class="chip"
            [class.chip--active]="statusFilter() === f.value"
            (click)="statusFilter.set(f.value)">
            {{ f.label }}
          </button>
        }
      </div>
    </div>

    @if (filtered().length === 0) {
      <p class="empty">No responses match.</p>
    } @else {
      <div class="table-scroll">
        <table class="grid">
          <thead>
            <tr>
              <th>Status</th>
              <th>Respondent</th>
              <th>Answered</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of filtered(); track r.responseId) {
              <tr (click)="open.emit(r.responseId)" tabindex="0"
                  (keydown.enter)="open.emit(r.responseId)">
                <td>
                  <span class="status" [class.status--complete]="r.status === 'Complete'">
                    {{ r.status }}
                  </span>
                </td>
                <td>{{ r.respondent }}</td>
                <td class="num">{{ r.answeredCount }}</td>
                <td>{{ submittedLabel(r) }}</td>
                <td class="open-cell"><i class="fa-solid fa-chevron-right"></i></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .toolbar {
        display: flex;
        gap: var(--mj-space-2);
        flex-wrap: wrap;
        align-items: center;
        margin-bottom: var(--mj-space-3);
      }
      .search {
        flex: 1 1 220px;
        padding: var(--mj-space-2);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-size: 13px;
      }
      .filters {
        display: flex;
        gap: var(--mj-space-1);
      }
      .chip {
        padding: var(--mj-space-1) var(--mj-space-2-5);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-full);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        font-size: 12px;
        cursor: pointer;
      }
      .chip--active {
        background: var(--mj-brand-primary);
        border-color: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
      }
      .empty {
        color: var(--mj-text-muted);
        font-style: italic;
        margin: 0;
      }
      .table-scroll {
        overflow-x: auto;
      }
      .grid {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .grid th {
        text-align: left;
        padding: var(--mj-space-2);
        color: var(--mj-text-muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-bottom: 1px solid var(--mj-border-default);
      }
      .grid td {
        padding: var(--mj-space-2);
        color: var(--mj-text-primary);
        border-bottom: 1px solid var(--mj-border-subtle);
      }
      .grid tbody tr {
        cursor: pointer;
      }
      .grid tbody tr:hover {
        background: var(--mj-bg-surface-hover);
      }
      .num {
        font-variant-numeric: tabular-nums;
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
      .open-cell {
        color: var(--mj-text-muted);
        text-align: right;
      }
    `,
  ],
})
export class FormsResponseListComponent {
  @Output() open = new EventEmitter<string>();

  public readonly search = signal('');
  public readonly statusFilter = signal<StatusFilter>('all');

  public readonly statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'Complete', label: 'Complete' },
    { value: 'Partial', label: 'Partial' },
  ];

  private readonly _rows = signal<ResponseListRow[]>([]);
  @Input({ required: true })
  set rows(value: ResponseListRow[]) {
    this._rows.set(value ?? []);
  }

  public readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
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
