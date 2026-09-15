import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { PublishedFormQuestion } from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import { ResponsesDataService } from './responses-data.service';
import { resolveResponsesView } from './responses-view-state';
import { buildResponseRows } from './response-aggregations';
import type { ResponseDetail, ResponseListRow, ResponseRecordLink } from './response-models';
import { FormsResponseListComponent } from './response-list.component';
import { FormsResponseDetailComponent } from './response-detail.component';

/**
 * A form's submissions, list plus drill-down, scoped to one form.
 *
 * Mounted as the builder's fifth tab so an author can read what a form collected without
 * leaving the form they are editing. Data loads when this component is created — i.e. on
 * tab activation, not on builder open, because the builder's hot path is editing and a
 * form with thousands of responses must not tax it.
 *
 * Question labels come from the form's LATEST PUBLISHED version, not from the draft being
 * edited: an unpublished rename or deletion in the draft must not relabel or hide an answer
 * someone already gave. Responses themselves are scoped by FormID and therefore span every
 * published version.
 */
@Component({
  selector: 'mjf-responses-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ResponsesDataService],
  imports: [FormsResponseListComponent, FormsResponseDetailComponent],
  template: `
    <section class="mjf-page rt">
      <header class="mjf-page-head">
        <div class="mjf-page-headings">
          <h2 class="mjf-page-title rt-title">Responses</h2>
          @if (View() === 'list' || View() === 'detail' || View() === 'no-responses') {
            <p class="mjf-page-sub">
              {{ Rows().length }} {{ Rows().length === 1 ? 'response' : 'responses' }} across every
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
        <mj-forms-response-list [Rows]="Rows()" (Open)="OpenResponse($event)"></mj-forms-response-list>
      }
      }
    </section>
  `,
  styles: [
    FORMS_UI_CSS,
    `
      :host { display: block; background: var(--mj-bg-page); }

      /* The tab is embedded under a builder header that already names the form, so the
         page title steps down a size from a standalone page's. */
      .rt-title { font-size: 1.375rem; }
    `,
  ],
})
export class ResponsesTabComponent implements OnInit {
  /** The form whose responses to show. */
  @Input({ required: true }) FormID!: string;

  /**
   * Relayed upward so the host can navigate. The builder maps this to
   * `BaseFormComponent.Navigate`; a dashboard host would map it to `OpenEntityRecord`.
   */
  @Output() OpenRecord = new EventEmitter<ResponseRecordLink>();

  private readonly data = inject(ResponsesDataService);

  public readonly Loading = signal(true);
  public readonly Error = signal<string | null>(null);
  public readonly Rows = signal<ResponseListRow[]>([]);
  public readonly Detail = signal<ResponseDetail | null>(null);

  /**
   * Whether the LIST load failed, as opposed to a single response failing to open. Only
   * this drives the view; a detail failure leaves the list on screen under its banner.
   */
  private readonly loadFailed = signal(false);

  /**
   * The published questions used to label answers, or null when the form has never been
   * published — which is a distinct empty state from "published, no responses yet", and the
   * only one with an action attached.
   */
  public readonly Questions = signal<PublishedFormQuestion[] | null>(null);

  /**
   * Which single view to show. Resolved by a pure function rather than a chain of template
   * conditions, because "no published version" and "the load failed" both look like an
   * absent question list — and reading the second as the first told authors their live form
   * had never been published.
   */
  public readonly View = computed(() =>
    resolveResponsesView({
      loading: this.Loading(),
      failed: this.loadFailed(),
      isPublished: this.Questions() !== null,
      rowCount: this.Rows().length,
      hasDetail: this.Detail() !== null,
    }),
  );

  public async ngOnInit(): Promise<void> {
    await this.load();
  }

  /** Re-queries; the author may be watching submissions arrive. */
  public async Refresh(): Promise<void> {
    this.Detail.set(null);
    await this.load();
  }

  public async OpenResponse(responseId: string): Promise<void> {
    const questions = this.Questions();
    if (!questions) {
      return;
    }
    this.Loading.set(true);
    this.Error.set(null);
    try {
      this.Detail.set(await this.data.loadResponseDetail(responseId, questions));
    } catch (err) {
      this.fail(err, 'Failed to load that response.');
    } finally {
      this.Loading.set(false);
    }
  }

  public CloseDetail(): void {
    this.Detail.set(null);
  }

  private async load(): Promise<void> {
    this.Loading.set(true);
    this.Error.set(null);
    this.loadFailed.set(false);
    try {
      const questions = await this.data.loadLatestPublishedQuestions(this.FormID);
      this.Questions.set(questions);
      if (questions === null) {
        // Unpublished forms cannot have responses; skip the query entirely.
        this.Rows.set([]);
        return;
      }
      const { responses, answers } = await this.data.loadResponsesForForm(this.FormID);
      this.Rows.set(buildResponseRows(responses, answers, questions));
    } catch (err) {
      this.loadFailed.set(true);
      this.fail(err, 'Failed to load this form’s responses.');
    } finally {
      this.Loading.set(false);
    }
  }

  private fail(err: unknown, fallback: string): void {
    this.Error.set(err instanceof Error ? err.message : fallback);
  }
}
