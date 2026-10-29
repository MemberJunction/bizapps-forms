import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, Output, computed, signal } from '@angular/core';
import { MAX_RESPONSE_SEARCH_LENGTH } from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import type { ResponseListRow } from './response-models';
import { DEFAULT_RESPONSE_QUERY, RESPONSE_PAGE_SIZES, pageCount, type ResponseQuery } from './responses-query';

/** How long typing pauses before the search goes to the server. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * One page of a form's responses, as a view of one `ResponseQuery`.
 *
 * The server searches, sorts and pages (UI audit F08); this component shows what it was given and
 * says what the reader asked for next, through `QueryChange`. It used to hold 200 rows and filter
 * them in the browser, so its search said "nothing found" for a respondent the form did have, its
 * status chips could never apply (the list is Complete responses only), and a load-more button was
 * the only way past row 200. Clicking a row emits its id so the host can open the detail.
 */
@Component({
  selector: 'mj-forms-response-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rl-toolbar">
      <div class="mjf-search">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input
          #searchBox
          class="mjf-input"
          type="search"
          placeholder="Search names, emails and answers"
          aria-label="Search names, emails and answers"
          [attr.maxlength]="maxSearchLength"
          [value]="searchText()"
          (input)="OnSearchInput(searchBox.value)" />
      </div>
      <span class="rl-count" role="status">{{ countLine() }}</span>
    </div>

    @if (rows().length === 0) {
      <div class="mjf-empty">
        <span class="mjf-empty-icon"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
        <span class="mjf-empty-title">No responses match</span>
        <p class="mjf-empty-body">The search looked at every response. Try a shorter or different term.</p>
      </div>
    } @else {
      <div class="mjf-table-wrap rl-scroll" [class.rl-busy]="Busy" [attr.aria-busy]="Busy">
        <table class="mjf-table">
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Respondent</th>
              <th scope="col" class="is-num">Answered</th>
              <th scope="col" [attr.aria-sort]="SubmittedSort()">
                <button type="button" class="rl-sort" (click)="ToggleSort()">
                  Submitted
                  <i class="fa-solid" [class.fa-arrow-down]="query().sort === 'newest'" [class.fa-arrow-up]="query().sort === 'oldest'" aria-hidden="true"></i>
                  <span class="rl-sr">{{ query().sort === 'newest' ? ', newest first' : ', oldest first' }}</span>
                </button>
              </th>
              <th scope="col"><span class="rl-sr">Open</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.responseId) {
              <tr class="is-clickable" (click)="Open.emit(r.responseId)">
                <td>
                  <span class="mjf-badge" [class.mjf-badge--success]="r.status === 'Complete'">{{ r.status }}</span>
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

      <nav class="rl-pager" aria-label="Pages of responses">
        <label class="rl-size">
          Rows per page
          <select #sizeSelect class="mjf-input" [value]="query().pageSize" (change)="SetPageSize(sizeSelect.value)">
            @for (size of pageSizes; track size) {
              <option [value]="size" [selected]="size === query().pageSize">{{ size }}</option>
            }
          </select>
        </label>
        <span class="rl-range">{{ RangeLine() }}</span>
        <button type="button" class="mjf-btn mjf-btn--ghost mjf-btn--icon mjf-btn--sm" aria-label="Previous page" [disabled]="query().page <= 1" (click)="GoToPage(query().page - 1)">
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
        <button type="button" class="mjf-btn mjf-btn--ghost mjf-btn--icon mjf-btn--sm" aria-label="Next page" [disabled]="query().page >= pages()" (click)="GoToPage(query().page + 1)">
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </nav>
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
        justify-content: space-between;
        gap: var(--mjf-gap-sm);
        margin-bottom: var(--mjf-gap);
      }
      .rl-toolbar .mjf-search { flex: 1 1 240px; max-width: 360px; }
      .rl-count { font-size: var(--mjf-meta); color: var(--mj-text-muted); font-variant-numeric: tabular-nums; }

      /* The table scrolls inside its own box so its header can stay in view: a sticky header
         sticks to the nearest scrolling ancestor, and the wrap's overflow already makes it one. */
      .rl-scroll { max-height: min(70vh, 720px); overflow: auto; }
      thead th { position: sticky; top: 0; z-index: 1; background: var(--mj-bg-surface); }

      .rl-sort {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 24px;
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        font-weight: inherit;
        cursor: pointer;
      }
      .rl-sort:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 2px; border-radius: 4px; }

      .rl-when { color: var(--mj-text-secondary); white-space: nowrap; }

      .rl-pager {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: var(--mjf-gap-sm);
        margin-top: var(--mjf-gap);
        font-size: var(--mjf-meta);
        color: var(--mj-text-secondary);
      }
      .rl-size { display: inline-flex; align-items: center; gap: 4px; }
      .rl-size select { width: auto; min-height: 32px; padding-block: 2px; }
      .rl-range { font-variant-numeric: tabular-nums; }
      /* While a response opens or a page turns: the rows stay where the reader clicked, visibly on hold. */
      .rl-busy { opacity: 0.6; pointer-events: none; }
      .rl-open-cell { width: 1%; text-align: right; padding-left: 0; }

      /* Names a control or a header cell for a screen reader without showing the words. */
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
export class FormsResponseListComponent implements OnDestroy {
  @Output() Open = new EventEmitter<string>();

  /** The reader asked for another page, sort, size or search. */
  @Output() QueryChange = new EventEmitter<ResponseQuery>();

  /** While the host is opening a response or reading a page: the rows are held, dimmed, and announced busy. */
  @Input() Busy = false;

  protected readonly maxSearchLength = MAX_RESPONSE_SEARCH_LENGTH;
  protected readonly pageSizes = RESPONSE_PAGE_SIZES;

  protected readonly rows = signal<ResponseListRow[]>([]);
  @Input({ required: true })
  set Rows(value: ResponseListRow[]) {
    this.rows.set(value ?? []);
  }

  private readonly total = signal(0);
  /** Responses matching the search, across every page. */
  @Input({ required: true })
  set Total(value: number) {
    this.total.set(value);
  }

  protected readonly query = signal<ResponseQuery>(DEFAULT_RESPONSE_QUERY);
  /** The page, sort and search on screen. */
  @Input({ required: true })
  set Query(value: ResponseQuery) {
    this.query.set(value);
    // Follow a search the host changed (back / forward through the URL), but never overwrite what
    // the reader is still typing.
    if (this.searchTimer === null) {
      this.searchText.set(value.search);
    }
  }

  /** What is in the search box, which leads the query by up to {@link SEARCH_DEBOUNCE_MS}. */
  protected readonly searchText = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly pages = computed(() => pageCount(this.total(), this.query().pageSize));

  protected readonly countLine = computed(() => responseCountLine(this.total(), this.query().search.trim()));

  /** `aria-sort` for the Submitted column. */
  public readonly SubmittedSort = computed(() => (this.query().sort === 'oldest' ? 'ascending' : 'descending'));

  /** "26–50 of 217". */
  public readonly RangeLine = computed(() => {
    const { page, pageSize } = this.query();
    const total = this.total();
    if (total === 0) {
      return '0 of 0';
    }
    const first = (page - 1) * pageSize + 1;
    return `${first.toLocaleString()}–${Math.min(total, page * pageSize).toLocaleString()} of ${total.toLocaleString()}`;
  });

  public ngOnDestroy(): void {
    this.clearSearchTimer();
  }

  /** Typing in the search box: shown at once, sent once typing pauses. */
  public OnSearchInput(text: string): void {
    this.searchText.set(text);
    this.clearSearchTimer();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.QueryChange.emit({ ...this.query(), search: text, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
  }

  public ToggleSort(): void {
    this.QueryChange.emit({ ...this.query(), sort: this.query().sort === 'newest' ? 'oldest' : 'newest', page: 1 });
  }

  public GoToPage(page: number): void {
    if (page < 1 || page > this.pages() || page === this.query().page) {
      return;
    }
    this.QueryChange.emit({ ...this.query(), page });
  }

  /** From the select's value; a size the server does not offer is ignored. */
  public SetPageSize(value: string): void {
    const size = RESPONSE_PAGE_SIZES.find((s) => s === Number(value));
    if (size && size !== this.query().pageSize) {
      this.QueryChange.emit({ ...this.query(), pageSize: size, page: 1 });
    }
  }

  public submittedLabel(r: ResponseListRow): string {
    return r.submittedAt ? r.submittedAt.toLocaleString() : '—';
  }

  private clearSearchTimer(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }
}

/** The line beside the search box: the whole list's size, or how many match the search. */
export function responseCountLine(total: number, search: string): string {
  const noun = total === 1 ? 'response' : 'responses';
  if (!search) {
    return `${total.toLocaleString()} ${noun}`;
  }
  return total === 0 ? `No responses match “${search}”` : `${total.toLocaleString()} ${noun} ${total === 1 ? 'matches' : 'match'} “${search}”`;
}
