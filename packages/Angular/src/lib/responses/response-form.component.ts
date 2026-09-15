import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CompositeKey, LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type {
  mjBizAppsFormsFormResponseEntity,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { FORMS_UI_CSS } from '../shared';
import { ResponsesDataService } from './responses-data.service';
import type { ResponseDetail, ResponseRecordLink } from './response-models';
import { FormsResponseDetailComponent } from './response-detail.component';

/**
 * The entity form for `MJ_BizApps_Forms: Form Responses` — registered at priority 10 so it
 * outranks the CodeGen-generated property grid, exactly as the visual builder outranks the
 * generated Form component.
 *
 * Without this, the rich detail view was reachable ONLY from the reporting dashboard (and,
 * since S2, the builder). A Form Response opened from a generic list, a search result, a
 * related-entity grid or a deep link fell back to the generated grid, which shows raw
 * columns — a FileID with no filename, a FormVersionID with no meaning — and none of the
 * answers, automation runs or bound records that make a submission legible.
 *
 * Note for reviewers: the generated `mjBizAppsFormsFormResponseFormComponent` stays
 * declared in `generated-forms.module.ts`. It is not deleted, it is outranked.
 *
 * Answers are labelled from the version THIS RESPONSE pinned (`record.FormVersionID`), not
 * the form's latest published one: the response was given against that definition, and
 * relabelling it with a later version's prompts would misreport what the person was asked.
 */
@RegisterClass(BaseFormComponent, FORMS_ENTITY.FormResponse, 10)
@Component({
  selector: 'mjf-response-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ResponsesDataService],
  imports: [FormsResponseDetailComponent],
  template: `
    <div class="mjf-page rf">
      <header class="mjf-page-head">
        <div class="mjf-page-headings">
          <h2 class="mjf-page-title rf-title">{{ record.Form }}</h2>
          <p class="mjf-page-sub">Response from {{ respondent }}</p>
        </div>
      </header>

      @if (error; as e) {
        <p class="mjf-alert" role="alert">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <span>{{ e }}</span>
        </p>
      }
      @if (labelWarning; as w) {
        <p class="rf-warn" role="status">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i> <span>{{ w }}</span>
        </p>
      }

      @if (busy) {
        <p class="mjf-state"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading…</p>
      } @else if (detail; as d) {
        <mj-forms-response-detail
          [Detail]="d"
          [ShowBack]="false"
          (OpenRecord)="openLinkedRecord($event)"></mj-forms-response-detail>
      }

      <!--
        The audit fields the detail view deliberately does not editorialize. Admins
        debugging a dedupe or a session issue need the raw values, and losing them was the
        real cost of replacing the generated grid.
      -->
      <details class="rf-raw">
        <summary>Raw record</summary>
        <dl class="rf-raw-grid">
          <dt>Response ID</dt>
          <dd>{{ record.ID }}</dd>
          <dt>Form version ID</dt>
          <dd>{{ record.FormVersionID }}</dd>
          <dt>Anonymous session ID</dt>
          <dd>{{ record.AnonymousSessionID || '—' }}</dd>
          <dt>Respondent person ID</dt>
          <dd>{{ record.RespondentPersonID || '—' }}</dd>
          <dt>Started at</dt>
          <dd>{{ record.StartedAt || '—' }}</dd>
          <dt>Submitted at</dt>
          <dd>{{ record.SubmittedAt || '—' }}</dd>
          <dt>Created at</dt>
          <dd>{{ record.__mj_CreatedAt }}</dd>
          <dt>Updated at</dt>
          <dd>{{ record.__mj_UpdatedAt }}</dd>
          <dt>Source metadata</dt>
          <dd class="rf-raw-json">{{ record.SourceMetadata || '—' }}</dd>
        </dl>
      </details>
    </div>
  `,
  styles: [
    FORMS_UI_CSS,
    `
      :host { display: block; height: 100%; overflow: auto; background: var(--mj-bg-page); }

      /* Opened as an entity record rather than as a page of its own, so the form's name
         is a heading, not the app title. */
      .rf-title { font-size: 1.5rem; }

      .rf-warn {
        display: flex;
        align-items: flex-start;
        gap: var(--mjf-gap-sm);
        margin: 0;
        padding: 12px 16px;
        font-size: var(--mjf-meta);
        line-height: 1.5;
        border: 1px solid var(--mj-status-warning-border);
        border-radius: var(--mjf-radius-sm);
        background: var(--mj-status-warning-bg);
        color: var(--mj-status-warning-text);
      }

      /* Collapsed by default: the audit fields matter to whoever is debugging a dedupe
         or a session, and to nobody else reading the response. */
      .rf-raw {
        padding-top: var(--mjf-gap);
        border-top: 1px solid var(--mjf-rule);
        font-size: var(--mjf-meta);
        color: var(--mj-text-secondary);
      }
      .rf-raw summary {
        display: flex;
        align-items: center;
        min-height: var(--mjf-tap);
        font-weight: 600;
        cursor: pointer;
        color: var(--mj-text-secondary);
      }
      .rf-raw summary:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; border-radius: var(--mjf-radius-sm); }
      .rf-raw-grid {
        display: grid;
        grid-template-columns: minmax(150px, max-content) 1fr;
        gap: 6px var(--mjf-stack);
        margin: var(--mjf-gap-sm) 0 0;
      }
      .rf-raw-grid dt { font-weight: 600; color: var(--mj-text-muted); }
      .rf-raw-grid dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
      .rf-raw-json { white-space: pre-wrap; font-family: var(--mj-font-family-mono, monospace); }

      @media (max-width: 600px) {
        .rf-raw-grid { grid-template-columns: 1fr; }
        .rf-raw-grid dd { margin-bottom: var(--mjf-gap-sm); }
      }
    `,
  ],
})
export class ResponseFormComponent extends BaseFormComponent {
  declare public record: mjBizAppsFormsFormResponseEntity;

  private readonly data = inject(ResponsesDataService);

  protected busy = true;
  protected detail: ResponseDetail | null = null;
  protected error: string | null = null;

  /** Set when answers could not be labelled, so a bare answer list is not read as complete. */
  protected labelWarning: string | null = null;

  protected get respondent(): string {
    return this.record.RespondentPerson || 'an anonymous respondent';
  }

  override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    await this.loadDetail();
  }

  private async loadDetail(): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      this.detail = await this.data.loadResponseDetail(
        this.record.ID,
        await this.loadQuestions(),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load this response.';
      this.error = message;
      LogError(`ResponseFormComponent: loading response ${this.record.ID} failed — ${message}`);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * The pinned version's questions.
   *
   * A version with no `DefinitionSnapshot` is a real (if rare) state — a response written
   * against a version whose snapshot was never populated. Rather than failing the whole
   * page, we continue with no labels and SAY SO: unlabelled answers are dropped by the
   * builder, and an answer list silently shortened to nothing is worse than an explained
   * one. The underlying error is logged, not swallowed.
   */
  private async loadQuestions(): Promise<PublishedFormQuestion[]> {
    try {
      return await this.data.loadQuestionsForVersion(this.record.FormVersionID);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      // Says only what is true. The raw section below carries audit fields — ids,
      // timestamps, SourceMetadata — and NOT the answers, so promising otherwise sent
      // people looking for data that was never there.
      this.labelWarning =
        'This response’s form version has no published definition, so its answers cannot be ' +
        'labelled and are not shown. The answers are still stored; re-publishing a version ' +
        'of this form restores the labels.';
      LogError(
        `ResponseFormComponent: no published definition for version ` +
          `${this.record.FormVersionID} of response ${this.record.ID} — ${message}`,
      );
      return [];
    }
  }

  /** Relays a deep link from the detail view to the Explorer host. */
  protected openLinkedRecord(link: ResponseRecordLink): void {
    this.Navigate.emit({
      Kind: 'record',
      EntityName: link.entityName,
      PrimaryKey: CompositeKey.FromID(link.recordId),
    });
  }
}
