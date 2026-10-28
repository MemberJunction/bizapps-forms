import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  computed,
  signal,
} from '@angular/core';
import { LogError } from '@memberjunction/core';
import { FORMS_UI_CSS, failureMessage } from '../shared';
import { FORMS_ENTITY } from '../shared/entity-names';
import { onFormsWrite, type FormsWriteSubscription } from '../shared/forms-writes';
import { resolveResponsesView } from './responses-view-state';
import { readResponseDetail, readResponsePage } from './response-reads';
import type { DetailPosition, ResponseDetail, ResponseListRow, ResponseRecordLink } from './response-models';
import { FormsResponseListComponent } from './response-list.component';
import { FormsResponseDetailComponent } from './response-detail.component';
import { DEFAULT_RESPONSE_QUERY, pageCount, type ResponseQuery } from './responses-query';

/** How long a burst of Form Response writes settles before the list re-reads once. */
const WRITE_REFRESH_DEBOUNCE_MS = 300;

/** What the tab shows, as its host keeps it in the URL: the list's query and the open response. */
export interface ResponsesTabState {
  query: ResponseQuery;
  responseId: string | null;
}

/**
 * A form's submissions, list plus drill-down, scoped to one form.
 *
 * Mounted twice: as the builder's fifth tab, so an author can read what a form collected without
 * leaving the form they are editing, and as the Responses view of Responses & Analytics
 * (`Embedded`, under the dashboard's own header). Data loads when this component is created — on
 * tab activation, not on builder open, because the builder's hot path is editing.
 *
 * The list shows ONE page of `Forms.ListResponses` at a time, searched, sorted and paged by the
 * server (`ResponseQuery`). It used to append 200-row pages and search only what it had loaded, so a
 * search on a larger form said "nothing found" for a respondent the form did have (UI audit F08).
 * Each page now replaces the last, so there is no appended list for a moved row to corrupt; a page
 * past the end (the list shrank) lands on the last page instead.
 *
 * It re-reads by itself only when a Form Response is written in this browser; a submission from a
 * respondent reaches the list through Refresh, which both mounts offer.
 *
 * Question labels come from the form's PUBLISHED version, not from the draft being edited: an
 * unpublished rename or deletion in the draft must not relabel or hide an answer someone already
 * gave. Responses themselves are scoped by form and therefore span every published version.
 */
@Component({
  selector: 'mjf-responses-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsResponseListComponent, FormsResponseDetailComponent],
  template: `
    <section class="rt" [class.mjf-page]="!Embedded">
      @if (!Embedded) {
        <header class="mjf-page-head">
          <div class="mjf-page-headings">
            <h2 class="mjf-page-title rt-title">Responses</h2>
            @if ((View() === 'list' || View() === 'detail' || View() === 'no-responses') && !Query().search.trim()) {
              <p class="mjf-page-sub">
                {{ Total() }} {{ Total() === 1 ? 'response' : 'responses' }} across every
                published version of this form.
              </p>
            }
          </div>
          <div class="mjf-page-actions">
            <button type="button" class="mjf-btn mjf-btn--ghost" [disabled]="Loading()" (click)="Refresh()">
              <i class="fa-solid fa-rotate-right" [class.fa-spin]="Loading()" aria-hidden="true"></i> Refresh
            </button>
          </div>
        </header>
      }

      @if (Embedded) {
        <!-- Under the dashboard's header, whose own refresh re-reads the summary and this list
             and keeps the reader on Responses: this one re-reads only the list. -->
        <div class="rt-bar">
          <button type="button" class="mjf-btn mjf-btn--ghost mjf-btn--sm" [disabled]="Loading() || OpeningResponse()" (click)="Refresh()">
            <i class="fa-solid fa-rotate-right" [class.fa-spin]="Loading()" aria-hidden="true"></i> Refresh
          </button>
        </div>
      }

      @if (Error(); as e) {
        <p class="mjf-alert" role="alert">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <span>{{ e }}</span>
        </p>
      }

      @switch (View()) {
      @case ('loading') {
        <p class="mjf-state"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading responses…</p>
      }
      @case ('failed') {
        <!-- The error banner above already says what went wrong; adding an empty state here
             would guess at a cause we do not have. -->
      }
      @case ('never-published') {
        <div class="mjf-empty">
          <span class="mjf-empty-icon"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></span>
          <span class="mjf-empty-title">Not published yet</span>
          <p class="mjf-empty-body">
            Publish and distribute this form to start collecting responses. The Distribute tab
            creates the link people fill in.
          </p>
        </div>
      }
      @case ('no-responses') {
        <div class="mjf-empty">
          <span class="mjf-empty-icon"><i class="fa-solid fa-inbox" aria-hidden="true"></i></span>
          <span class="mjf-empty-title">No responses yet</span>
          <p class="mjf-empty-body">
            This form is published; submissions will appear here as they come in.
          </p>
        </div>
      }
      @case ('detail') {
        @if (Detail(); as d) {
          <mj-forms-response-detail
            [Detail]="d"
            (Back)="CloseDetail()"
            (Reload)="ReloadDetail()"
            [Position]="DetailPosition()"
          (Adjacent)="OpenAdjacent($event)"
          (OpenRecord)="OpenRecord.emit($event)"></mj-forms-response-detail>
        }
      }
      @case ('list') {
        @if (OpeningResponse()) {
          <p class="mjf-state" role="status"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Opening response…</p>
        }
        <mj-forms-response-list
          [Rows]="Rows()"
          [Total]="Total()"
          [Query]="Query()"
          [Busy]="OpeningResponse() || Paging()"
          (QueryChange)="SetQuery($event)"
          (Open)="OpenResponse($event)"></mj-forms-response-list>
      }
      }
    </section>
  `,
  styles: [
    FORMS_UI_CSS,
    `
      :host { display: block; background: var(--mj-bg-page); }
      .rt:not(.mjf-page) { display: flex; flex-direction: column; gap: var(--mjf-gap); }
      .rt-bar { display: flex; justify-content: flex-end; }

      /* The tab is embedded under a builder header that already names the form, so the
         page title steps down a size from a standalone page's. */
      .rt-title { font-size: 1.375rem; }
    `,
  ],
})
export class ResponsesTabComponent implements OnInit, OnDestroy {
  /** The form whose responses to show. */
  @Input({ required: true }) FormID!: string;

  /**
   * True when mounted under a host's own header (Responses & Analytics), which already names the
   * form and offers a refresh: the tab then drops its page header and keeps only the list.
   */
  @Input() Embedded = false;

  /**
   * Relayed upward so the host can navigate. The builder maps this to
   * `BaseFormComponent.Navigate`; the dashboard maps it to `OpenEntityRecord`.
   */
  @Output() OpenRecord = new EventEmitter<ResponseRecordLink>();

  /**
   * True while a response is opening, false when it has. The dashboard holds its own refresh and
   * export controls meanwhile, as it did when it opened responses itself.
   */
  @Output() BusyChange = new EventEmitter<boolean>();

  /** What the tab shows changed — a new page, sort or search, or a response opened or closed. */
  @Output() StateChange = new EventEmitter<ResponsesTabState>();

  /** What to show first, from the host's URL. Read once, on init. */
  @Input() InitialState: ResponsesTabState | null = null;

  public readonly Loading = signal(true);
  public readonly Error = signal<string | null>(null);
  public readonly Rows = signal<ResponseListRow[]>([]);
  /** Complete responses matching the search, across every page. */
  public readonly Total = signal(0);
  /** The page, sort and search on screen. */
  public readonly Query = signal<ResponseQuery>(DEFAULT_RESPONSE_QUERY);
  public readonly PageCount = computed(() => pageCount(this.Total(), this.Query().pageSize));
  /** While a page other than the first load is being read; the rows on screen stay, held. */
  public readonly Paging = signal(false);
  public readonly Detail = signal<ResponseDetail | null>(null);
  /** While one response's detail loads; the list stays on screen under the reader's cursor. */
  public readonly OpeningResponse = signal(false);

  /** Where the open response sits in the whole list; null while none is open or it is not on this page. */
  public readonly DetailPosition = computed<DetailPosition | null>(() => {
    const open = this.Detail();
    const at = open ? this.Rows().findIndex((r) => r.responseId === open.responseId) : -1;
    if (at < 0) {
      return null;
    }
    const q = this.Query();
    const index = (q.page - 1) * q.pageSize + at + 1;
    return { index, total: this.Total(), hasPrevious: index > 1, hasNext: index < this.Total() };
  });

  private writes: FormsWriteSubscription | null = null;

  /**
   * Whether the LIST load failed, as opposed to a single response failing to open. Only
   * this drives the view; a detail failure leaves the list on screen under its banner.
   */
  private readonly loadFailed = signal(false);

  /**
   * The form's Published version — what labels every response's answers — or null when the form
   * has never been published, which is a distinct empty state from "published, no responses yet",
   * and the only one with an action attached.
   */
  public readonly LabelVersionID = signal<string | null>(null);

  /**
   * Bumped by every (re)load. A page or a detail that arrives for an older generation belongs to a
   * list the reader has since refreshed, and is dropped rather than mixed into the new one.
   */
  private generation = 0;

  /**
   * Which single view to show. Resolved by a pure function rather than a chain of template
   * conditions, because "no published version" and "the load failed" both look like an
   * absent label version — and reading the second as the first told authors their live form
   * had never been published.
   */
  public readonly View = computed(() =>
    resolveResponsesView({
      loading: this.Loading(),
      failed: this.loadFailed(),
      isPublished: this.LabelVersionID() !== null,
      rowCount: this.Rows().length,
      searching: this.Query().search.trim() !== '',
      hasDetail: this.Detail() !== null,
    }),
  );

  public async ngOnInit(): Promise<void> {
    // A Form Response written in this browser (deleted from its record, say) re-reads the list. The
    // open detail, if any, stays: the reader did not ask to leave it.
    this.writes = onFormsWrite(FORMS_ENTITY.FormResponse, ['save', 'delete'], () => void this.load(), {
      debounceMs: WRITE_REFRESH_DEBOUNCE_MS,
    });
    const initial = this.InitialState;
    if (initial) {
      this.Query.set(initial.query);
    }
    await this.load();
    if (initial?.responseId && this.Rows().some((r) => r.responseId === initial.responseId)) {
      await this.OpenResponse(initial.responseId);
    }
  }

  public ngOnDestroy(): void {
    this.writes?.unsubscribe();
    this.writes = null;
  }

  /** Re-queries from the first page; the author may be watching submissions arrive. */
  public async Refresh(): Promise<void> {
    this.Detail.set(null);
    await this.load();
  }

  /**
   * Show another page, sort or search. A new search or sort starts on page 1. The rows on screen
   * stay, held, until the page lands; a page asked for after this one wins, whatever order they
   * arrive in.
   */
  public async SetQuery(next: ResponseQuery): Promise<void> {
    const current = this.Query();
    const restart = next.search.trim() !== current.search.trim() || next.sort !== current.sort || next.pageSize !== current.pageSize;
    this.Query.set(restart ? { ...next, page: 1 } : next);
    this.Detail.set(null);
    this.emitState();
    await this.load(true);
  }

  /** Open the response before (`-1`) or after (`1`) the open one, crossing to the neighbouring page at an edge. */
  public async OpenAdjacent(direction: -1 | 1): Promise<void> {
    const position = this.DetailPosition();
    if (!position || this.OpeningResponse() || (direction < 0 ? !position.hasPrevious : !position.hasNext)) {
      return;
    }
    const rows = this.Rows();
    const at = rows.findIndex((r) => r.responseId === this.Detail()?.responseId);
    const neighbour = rows[at + direction];
    if (neighbour) {
      await this.OpenResponse(neighbour.responseId);
      return;
    }
    const q = this.Query();
    this.Query.set({ ...q, page: q.page + direction });
    await this.load(true);
    const landed = this.Rows();
    const target = direction > 0 ? landed[0] : landed[landed.length - 1];
    if (target) {
      await this.OpenResponse(target.responseId);
    }
  }

  /**
   * Open one response, labelled from the form's Published version.
   *
   * A click while another response is opening is ignored: two loads in flight settle in network
   * order, and the reader could land on the response they did not pick.
   */
  public async OpenResponse(responseId: string, announce = true): Promise<void> {
    if (this.OpeningResponse() || this.LabelVersionID() === null) {
      return;
    }
    const generation = this.generation;
    this.OpeningResponse.set(true);
    this.BusyChange.emit(true);
    this.Error.set(null);
    try {
      const detail = await readResponseDetail(responseId, this.LabelVersionID());
      if (generation === this.generation) {
        this.Detail.set(detail);
        if (announce) {
          this.emitState();
        }
      }
    } catch (err) {
      this.failUnlessSuperseded(generation, err, 'Failed to load that response.');
    } finally {
      this.OpeningResponse.set(false);
      this.BusyChange.emit(false);
    }
  }

  /**
   * Re-read the open response after the detail changed it on the server (a replayed dead letter),
   * labelled the way it was opened. The stale detail stays on screen until the new one lands, and
   * under the error if the read fails.
   *
   * Not an open: it holds no `OpeningResponse`, so the reader can still pick another row, and it
   * lands only while the detail it re-reads is still the one on screen. `generation` alone cannot
   * say that — closing a detail is not a list reload — so a reader who pressed Back, or opened
   * another response, before the read returned would otherwise have this one opened over them.
   */
  public async ReloadDetail(): Promise<void> {
    const open = this.Detail();
    const labelVersionId = this.LabelVersionID();
    if (!open || labelVersionId === null) {
      return;
    }
    const generation = this.generation;
    const stillOpen = (): boolean => generation === this.generation && this.Detail() === open;
    this.Error.set(null);
    try {
      const detail = await readResponseDetail(open.responseId, labelVersionId);
      if (stillOpen()) {
        this.Detail.set(detail);
      }
    } catch (err) {
      const message = failureMessage(err, 'Failed to reload this response.');
      if (stillOpen()) {
        this.Error.set(message);
      } else {
        LogError(`Superseded reload of response ${open.responseId} (form ${this.FormID}): ${message}`);
      }
    }
  }

  public CloseDetail(): void {
    this.Detail.set(null);
    this.emitState();
  }

  /**
   * Apply a state the host read from its URL (back / forward): the query, then the response.
   * Nothing is announced back, so the host's URL is not rewritten with what it just supplied.
   */
  public async ApplyState(state: ResponsesTabState): Promise<void> {
    const sameQuery = JSON.stringify(state.query) === JSON.stringify(this.Query());
    if (!sameQuery) {
      this.Query.set(state.query);
      this.Detail.set(null);
      await this.load(true);
    }
    if (!state.responseId) {
      this.Detail.set(null);
    } else if (state.responseId !== this.Detail()?.responseId && this.Rows().some((r) => r.responseId === state.responseId)) {
      await this.OpenResponse(state.responseId, false);
    }
  }

  private emitState(): void {
    this.StateChange.emit({ query: this.Query(), responseId: this.Detail()?.responseId ?? null });
  }

  /**
   * Read the page the query names. `paging` keeps the current rows on screen (held) instead of the
   * full-surface loading state, for a page turn, a sort or a search.
   *
   * A page past the end — the list shrank since the link was made, or since the reader paged — is
   * read again as the last page, once.
   */
  private async load(paging = false): Promise<void> {
    const generation = ++this.generation;
    (paging ? this.Paging : this.Loading).set(true);
    this.Error.set(null);
    this.loadFailed.set(false);
    try {
      let page = await readResponsePage(this.FormID, this.Query());
      const last = pageCount(page.total, this.Query().pageSize);
      if (generation === this.generation && page.rows.length === 0 && page.total > 0 && this.Query().page > last) {
        this.Query.set({ ...this.Query(), page: last });
        this.emitState();
        page = await readResponsePage(this.FormID, this.Query());
      }
      if (generation !== this.generation) {
        return;
      }
      this.LabelVersionID.set(page.labelVersionId);
      this.Rows.set(page.rows);
      this.Total.set(page.total);
    } catch (err) {
      if (generation === this.generation) {
        this.loadFailed.set(true);
      }
      this.failUnlessSuperseded(generation, err, 'Failed to load this form’s responses.');
    } finally {
      if (generation === this.generation) {
        this.Loading.set(false);
        this.Paging.set(false);
      }
    }
  }

  /** Show a failure of the current list; log (never show) one that belongs to a list since replaced. */
  private failUnlessSuperseded(generation: number, err: unknown, action: string): void {
    const message = failureMessage(err, action);
    if (generation !== this.generation) {
      LogError(`Superseded responses read for form ${this.FormID}: ${message}`);
      return;
    }
    this.Error.set(message);
  }
}
