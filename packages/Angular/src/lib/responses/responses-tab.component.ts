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
    <section class="rt">
      <header class="rt-head">
        <div>
          <h2 class="rt-title">Responses</h2>
          @if (View() === 'list' || View() === 'detail' || View() === 'no-responses') {
            <p class="rt-hint">
              {{ Rows().length }} {{ Rows().length === 1 ? 'response' : 'responses' }} across every
              published version of this form.
            </p>
          }
        </div>
        <button type="button" class="rt-refresh" [disabled]="Loading()" (click)="Refresh()">
          <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Refresh
        </button>
      </header>

      @if (Error(); as e) {
        <p class="rt-error" role="alert">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ e }}
        </p>
      }

      @switch (View()) {
      @case ('loading') {
        <p class="rt-hint"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading…</p>
      }
      @case ('failed') {
        <!-- The error banner above already says what went wrong; adding an empty state here
             would guess at a cause we do not have. -->
      }
      @case ('never-published') {
        <div class="rt-empty">
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          <p class="rt-empty-title">No responses yet — this form has never been published.</p>
          <p class="rt-hint">
            Publish and distribute this form to start collecting responses. The Distribute tab
            creates the link people fill in.
          </p>
        </div>
      }
      @case ('no-responses') {
        <div class="rt-empty">
          <i class="fa-solid fa-inbox" aria-hidden="true"></i>
          <p class="rt-empty-title">No responses yet.</p>
          <p class="rt-hint">
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
    `
      :host {
        display: block;
      }
      .rt {
        padding: 16px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }
      .rt-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .rt-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
      }
      .rt-hint {
        margin: 4px 0 0;
        font-size: 0.8125rem;
        color: var(--mj-text-secondary);
      }
      .rt-error {
        margin: 0 0 12px;
        font-size: 0.8125rem;
        color: var(--mj-status-error-text, var(--mj-status-error));
      }
      .rt-refresh {
        font: inherit;
        font-size: 0.8125rem;
        min-height: 44px;
        padding: 0 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md, 8px);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        cursor: pointer;
      }
      .rt-refresh:hover:not(:disabled) {
        background: var(--mj-bg-surface-hover);
      }
      .rt-refresh:disabled {
        color: var(--mj-text-disabled);
        cursor: default;
      }
      .rt-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 40px 16px;
        text-align: center;
        color: var(--mj-text-muted);
      }
      .rt-empty i {
        font-size: 1.75rem;
      }
      .rt-empty-title {
        margin: 0;
        font-weight: 600;
        color: var(--mj-text-secondary);
      }
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
      this.Rows.set(buildResponseRows(responses, answers));
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
