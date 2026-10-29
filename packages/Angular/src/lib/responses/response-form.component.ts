import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CompositeKey, LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent, BaseFormsModule } from '@memberjunction/ng-base-forms';
import type { mjBizAppsFormsFormResponseEntity } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { FORMS_UI_CSS, failureMessage } from '../shared';
import { FormsRecordLinkBridgeDirective } from '../shared/record-link-bridge.directive';
import { readResponseDetail } from './response-reads';
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
 * Answers are labelled from the version THIS RESPONSE pinned (`Forms.GetResponseDetail` with no
 * label version), not the form's latest published one: the response was given against that
 * definition, and relabelling it with a later version's prompts would misreport what the person
 * was asked. A pinned version with no readable definition is said so by the detail view itself.
 */
@RegisterClass(BaseFormComponent, FORMS_ENTITY.FormResponse, 10)
@Component({
  selector: 'mjf-response-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsResponseDetailComponent, BaseFormsModule, FormsRecordLinkBridgeDirective],
  template: `
    <div class="mjf-page rf">
      <header class="mjf-page-head">
        <div class="mjf-page-headings">
          <h2
            class="mjf-page-title rf-title"
            [mjRecordLink]="record"
            FieldName="FormID"
            [EntityName]="FormsEntity.Form"
            [RecordID]="record.FormID"
            [DisplayName]="record.Form">{{ record.Form }}</h2>
          <p class="mjf-page-sub">
            Response from
            @if (record.RespondentPersonID) {
              <span
                [mjRecordLink]="record"
                FieldName="RespondentPersonID"
                [EntityName]="'MJ_BizApps_Common: People'"
                [RecordID]="record.RespondentPersonID"
                [DisplayName]="respondent">{{ respondent }}</span>
            } @else {
              {{ respondent }}
            }
          </p>
        </div>
      </header>

      @if (error; as e) {
        <p class="mjf-alert" role="alert">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <span>{{ e }}</span>
        </p>
      }

      @if (busy) {
        <p class="mjf-state"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading…</p>
      } @else if (detail; as d) {
        <mj-forms-response-detail
          [Detail]="d"
          [ShowBack]="false"
          (Reload)="reloadDetail()"
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
          <dd
            [mjRecordLink]="record"
            FieldName="FormVersionID"
            [EntityName]="FormsEntity.FormVersion"
            [RecordID]="record.FormVersionID">{{ record.FormVersionID }}</dd>
          <dt>Anonymous session ID</dt>
          <dd>{{ record.AnonymousSessionID || '—' }}</dd>
          <dt>Respondent person ID</dt>
          <dd
            [mjRecordLink]="record"
            FieldName="RespondentPersonID"
            [EntityName]="'MJ_BizApps_Common: People'"
            [RecordID]="record.RespondentPersonID">{{ record.RespondentPersonID || '—' }}</dd>
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
      .rf-title { font-size: var(--mjf-heading); }

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
        gap: 4px var(--mjf-stack);
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

  protected readonly FormsEntity = FORMS_ENTITY;
  protected busy = true;
  protected detail: ResponseDetail | null = null;
  protected error: string | null = null;

  protected get respondent(): string {
    return this.record.RespondentPerson || 'an anonymous respondent';
  }

  /** Bumped by every read, so only the latest one lands when two overlap. */
  private readGeneration = 0;

  override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    // `busy` starts true, so the first open shows "Loading…" until this lands.
    await this.readDetail('load');
  }

  /**
   * The re-read the detail asks for after a replay changed the response. `busy` is left alone: the
   * template draws "Loading…" instead of the detail while it is set, which would destroy the open
   * detail (its inline state, its scroll). The old detail stays until the new one lands, and stays
   * under the error banner if the read fails — as the Responses tab's `ReloadDetail` does.
   */
  protected async reloadDetail(): Promise<void> {
    await this.readDetail('reload');
  }

  private async readDetail(verb: 'load' | 'reload'): Promise<void> {
    const generation = ++this.readGeneration;
    this.error = null;
    try {
      const detail = await readResponseDetail(this.record.ID);
      if (generation === this.readGeneration) {
        this.detail = detail;
      }
    } catch (err) {
      const message = failureMessage(err, `Failed to ${verb} this response.`);
      LogError(`ResponseFormComponent: ${verb === 'load' ? 'loading' : 'reloading'} response ${this.record.ID} failed — ${message}`);
      if (generation === this.readGeneration) {
        this.error = message;
      }
    } finally {
      if (generation === this.readGeneration) {
        this.busy = false;
        this.cdr.markForCheck();
      }
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
