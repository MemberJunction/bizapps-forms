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
import { MAX_RESPONSE_PAGE_SIZE } from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS, failureMessage } from '../shared';
import { FORMS_ENTITY } from '../shared/entity-names';
import { onFormsWrite, type FormsWriteSubscription } from '../shared/forms-writes';
import { resolveResponsesView } from './responses-view-state';
import { readResponseDetail, readResponsePage } from './response-reads';
import type { ResponseDetail, ResponseListRow, ResponseRecordLink } from './response-models';
import { FormsResponseListComponent } from './response-list.component';
import { FormsResponseDetailComponent } from './response-detail.component';

/** How long a burst of Form Response writes settles before the list re-reads once. */
const WRITE_REFRESH_DEBOUNCE_MS = 300;

/** Shown in place of "Load more" once paging can no longer be trusted. */
export const LIST_CHANGED_NOTICE = 'The list changed — refresh to see it.';

/**
 * A form's submissions, list plus drill-down, scoped to one form.
 *
 * Mounted twice: as the builder's fifth tab, so an author can read what a form collected without
 * leaving the form they are editing, and as the Responses view of Responses & Analytics
 * (`Embedded`, under the dashboard's own header). Data loads when this component is created — on
 * tab activation, not on builder open, because the builder's hot path is editing.
 *
 * The list pages through `Forms.ListResponses` (one page at a time, "Load more" for the next), so a
 * form with thousands of responses costs one page, not every answer it ever collected. Paging is by
 * offset, so a response that arrives or is deleted between pages would shift the next page by a row
 * (repeating one, or skipping one): when a page's count differs from the list's, or hands back a row
 * already shown, the tab stops paging and says the list changed, and a refresh starts it over.
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
            @if (View() === 'list' || View() === 'detail' || View() === 'no-responses') {
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
          [CanLoadMore]="HasMore()"
          [LoadingMore]="LoadingMore()"
          [Busy]="OpeningResponse()"
          [Notice]="ListChanged() ? listChangedNotice : null"
          (LoadMore)="LoadMore()"
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

  public readonly listChangedNotice = LIST_CHANGED_NOTICE;

  public readonly Loading = signal(true);
  public readonly Error = signal<string | null>(null);
  public readonly Rows = signal<ResponseListRow[]>([]);
  /** Complete responses across every page. */
  public readonly Total = signal(0);
  public readonly LoadingMore = signal(false);
  public readonly Detail = signal<ResponseDetail | null>(null);
  /** While one response's detail loads; the list stays on screen under the reader's cursor. */
  public readonly OpeningResponse = signal(false);

  /** Set when a page disagreed with the list (see the class doc); paging stops until a refresh. */
  public readonly ListChanged = signal(false);

  /** Set when a page came back shorter than asked for: the server has nothing after it. */
  private readonly exhausted = signal(false);

  /** Whether "Load more" may be offered. */
  public readonly HasMore = computed(() => !this.ListChanged() && !this.exhausted() && this.Rows().length < this.Total());

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
      hasDetail: this.Detail() !== null,
    }),
  );

  public async ngOnInit(): Promise<void> {
    // A Form Response written in this browser (deleted from its record, say) re-reads the list. The
    // open detail, if any, stays: the reader did not ask to leave it.
    this.writes = onFormsWrite(FORMS_ENTITY.FormResponse, ['save', 'delete'], () => void this.load(), {
      debounceMs: WRITE_REFRESH_DEBOUNCE_MS,
    });
    await this.load();
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
   * The next page, appended — unless it shows the list moved under the reader (a different count, or
   * a row already shown), in which case nothing is appended and paging stops (`ListChanged`).
   */
  public async LoadMore(): Promise<void> {
    if (this.LoadingMore() || this.Loading() || !this.HasMore()) {
      return;
    }
    const generation = this.generation;
    this.LoadingMore.set(true);
    this.Error.set(null);
    try {
      const page = await readResponsePage(this.FormID, this.Rows().length);
      if (generation !== this.generation) {
        return;
      }
      const held = new Set(this.Rows().map((r) => r.responseId));
      if (page.total !== this.Total() || page.rows.some((r) => held.has(r.responseId))) {
        this.ListChanged.set(true);
        return;
      }
      this.Rows.set([...this.Rows(), ...page.rows]);
      this.exhausted.set(page.rows.length < MAX_RESPONSE_PAGE_SIZE);
    } catch (err) {
      this.failUnlessSuperseded(generation, err, 'Failed to load more responses.');
    } finally {
      if (generation === this.generation) {
        this.LoadingMore.set(false);
      }
    }
  }

  /**
   * Open one response, labelled from the form's Published version.
   *
   * A click while another response is opening is ignored: two loads in flight settle in network
   * order, and the reader could land on the response they did not pick.
   */
  public async OpenResponse(responseId: string): Promise<void> {
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
      }
    } catch (err) {
      this.failUnlessSuperseded(generation, err, 'Failed to load that response.');
    } finally {
      this.OpeningResponse.set(false);
      this.BusyChange.emit(false);
    }
  }

  public CloseDetail(): void {
    this.Detail.set(null);
  }

  private async load(): Promise<void> {
    const generation = ++this.generation;
    this.Loading.set(true);
    this.LoadingMore.set(false);
    this.ListChanged.set(false);
    this.Error.set(null);
    this.loadFailed.set(false);
    try {
      const page = await readResponsePage(this.FormID, 0);
      if (generation !== this.generation) {
        return;
      }
      this.LabelVersionID.set(page.labelVersionId);
      this.Rows.set(page.rows);
      this.Total.set(page.total);
      this.exhausted.set(page.rows.length < MAX_RESPONSE_PAGE_SIZE);
    } catch (err) {
      if (generation === this.generation) {
        this.loadFailed.set(true);
      }
      this.failUnlessSuperseded(generation, err, 'Failed to load this form’s responses.');
    } finally {
      if (generation === this.generation) {
        this.Loading.set(false);
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
