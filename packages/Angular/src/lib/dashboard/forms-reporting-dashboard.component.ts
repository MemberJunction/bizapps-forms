import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseDashboard } from '@memberjunction/ng-shared';
import type { ResourceData } from '@memberjunction/core-entities';
import { CompositeKey, LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { ExportFormat } from '@memberjunction/export-engine';
import type { mjBizAppsFormsFormResponseAnswerEntityType } from '@mj-biz-apps/forms-entities';

import { FORMS_UI_CSS, FORMS_VIZ_CSS } from '../shared';
import { FORMS_REPORTING_CSS } from './forms-reporting-dashboard.styles';
import { FormsReportingService } from './services/forms-reporting.service';
import { FormsReportingExportService } from './services/forms-reporting-export.service';
import {
  mockAnswerRows,
  mockReport,
  mockReportableForms,
  mockResponseDetail,
} from './services/forms-reporting-mock';
import type { FormReportData, ReportableForm } from './models/reporting.model';
import type { ResponseDetail, ResponseRecordLink } from '../responses/response-models';
import { ResponsesDataService } from '../responses/responses-data.service';
import {
  filterForms,
  percent,
  plural,
  portfolioSummary,
  relativeTime,
  sortFormsForRail,
} from './reporting-view-model';

import { FormsSummaryStatsComponent } from './components/summary-stats.component';
import { FormsQuestionBreakdownComponent } from './components/question-breakdown.component';
import { FormsFunnelChartComponent } from './components/funnel-chart.component';
import { FormsResponseListComponent } from '../responses/response-list.component';
import { FormsResponseDetailComponent } from '../responses/response-detail.component';

/**
 * The two things a reader comes here to do. Not four tabs.
 *
 * Summary, Questions and Funnel were three tabs answering ONE question — "how is this form
 * doing" — so reading the answer meant switching twice and holding the first two panels in
 * your head while looking at the third. They are now one scroll, ordered the way the
 * question is actually asked: how many, where they stopped, what they said. Individual
 * responses stay separate because reading one person's submission is a genuinely different
 * task from reading the aggregate.
 */
type DashboardMode = 'insights' | 'responses';

/**
 * Responses & Analytics — the Forms app's cross-form home for everything that has been
 * submitted (`FormsReportingDashboard`, FORMS_BUILD_PLAN WP-F). A `BaseDashboard` subclass
 * registered with the MJ ClassFactory; the matching Dashboard metadata record names this
 * DriverClass.
 *
 * SHAPE. A rail of every reportable form on the left, the selected form's report filling
 * the rest — the same two-pane shape as Build, Design, Distribute and Automate, so the
 * fifth surface in the product is not the one that works differently. It replaces a
 * `<select>`, which is the wrong control for this: this dashboard's subject is ALL forms'
 * responses, and a dropdown hides the population it is selecting from. The rail makes the
 * portfolio visible (recognition, not recall), lets forms be compared by volume without
 * choosing between them, and gives the reader an obvious place to go next.
 *
 * Standalone so the Explorer can instantiate it directly via `createComponent`. All data
 * comes through RunView/RunViews (FormsReportingService); a seeded mock mode renders the
 * UI before any real responses exist (toggle is a one-flag swap).
 */
@RegisterClass(BaseDashboard, 'FormsReportingDashboard')
@Component({
  selector: 'mj-forms-reporting-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ResponsesDataService, FormsReportingService, FormsReportingExportService],
  imports: [
    FormsModule,
    FormsSummaryStatsComponent,
    FormsQuestionBreakdownComponent,
    FormsFunnelChartComponent,
    FormsResponseListComponent,
    FormsResponseDetailComponent,
  ],
  templateUrl: './forms-reporting-dashboard.component.html',
  styles: [FORMS_UI_CSS, FORMS_VIZ_CSS, FORMS_REPORTING_CSS],
})
export class FormsReportingDashboardComponent extends BaseDashboard {
  private readonly data = inject(FormsReportingService);
  private readonly responses = inject(ResponsesDataService);
  private readonly exporter = inject(FormsReportingExportService);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Live RunView/RunQuery data path is the default. Set to `true` only as an explicit
   * dev aid (e.g. to preview the dashboard UI before any real responses exist) — the
   * seeded mock renders the identical UI with fabricated data. Never ship `true`.
   */
  public useMock = false;

  /**
   * Three flags, not one, because they blank three different things.
   *
   * `loadingForms` is the only one that may take the whole surface: until the rail exists
   * there is nothing to navigate. `loadingReport` blanks the report but KEEPS the rail —
   * the rail is the navigation, and unmounting it mid-switch throws away the reader's
   * place and makes the click feel like a page load. `busy` blanks nothing at all; it
   * disables controls while a response opens or an export runs, so the list the reader
   * clicked stays under their cursor.
   */
  public loadingForms = false;
  public loadingReport = false;
  public busy = false;
  public errorMessage: string | null = null;

  public forms: ReportableForm[] = [];
  /** `forms` narrowed by `railQuery`; maintained by `applyRailFilter`, not by the template. */
  public visibleForms: ReportableForm[] = [];
  public railQuery = '';
  public selectedForm: ReportableForm | null = null;
  public report: FormReportData | null = null;

  public mode: DashboardMode = 'insights';
  public readonly modes: { key: DashboardMode; label: string; icon: string }[] = [
    { key: 'insights', label: 'Insights', icon: 'fa-solid fa-chart-simple' },
    { key: 'responses', label: 'Responses', icon: 'fa-solid fa-table-list' },
  ];

  /**
   * When the loaded report was read, and the clock every relative label is measured
   * against. Held rather than recomputed so "2 hours ago" describes the numbers on screen
   * instead of drifting away from them between change-detection passes.
   */
  public loadedAt = new Date();

  /** Selected response for the detail view; null shows the list. */
  public responseDetail: ResponseDetail | null = null;

  /** Raw answer rows for the current report, kept for export pivoting. */
  private rawAnswers: mjBizAppsFormsFormResponseAnswerEntityType[] = [];

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    // Matches the Forms app's nav label. The two used to disagree ("Forms Reporting"),
    // which costs the reader a beat working out whether they are where they meant to go.
    return 'Responses & Analytics';
  }

  public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-column';
  }

  protected initDashboard(): void {
    // Nothing to set up beyond the injected services.
  }

  protected loadData(): void {
    void this.loadForms();
  }

  private async loadForms(): Promise<void> {
    this.loadingForms = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      const loaded = this.useMock ? mockReportableForms() : await this.data.loadReportableForms();
      this.forms = sortFormsForRail(loaded);
      this.applyRailFilter();
      if (this.forms.length > 0) {
        await this.selectForm(this.forms[0]);
      }
    } catch (err) {
      this.fail(err, 'Failed to load forms.');
    } finally {
      this.loadingForms = false;
      this.cdr.markForCheck();
    }
  }

  // --- The rail --------------------------------------------------------------

  public applyRailFilter(): void {
    this.visibleForms = filterForms(this.forms, this.railQuery);
    this.cdr.markForCheck();
  }

  /** "12 forms · 1,204 responses" — what this dashboard covers, before you pick one. */
  public get portfolioLine(): string {
    const { formCount, responseCount } = portfolioSummary(this.forms);
    return `${plural(formCount, 'form')} · ${plural(responseCount, 'response')}`;
  }

  /** Shown beside the rail's search; only interesting while a search is narrowing it. */
  public get railCountLine(): string {
    return this.railQuery.trim()
      ? `${this.visibleForms.length} of ${this.forms.length}`
      : plural(this.forms.length, 'form');
  }

  public isSelected(form: ReportableForm): boolean {
    return this.selectedForm?.formId === form.formId;
  }

  public async selectForm(form: ReportableForm): Promise<void> {
    this.selectedForm = form;
    this.responseDetail = null;
    this.mode = 'insights';
    this.loadingReport = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      if (this.useMock) {
        this.report = mockReport();
        this.rawAnswers = mockAnswerRows();
      } else {
        this.report = await this.data.loadReport(form);
        this.rawAnswers = await this.responses.loadAnswersForForm(form.formId);
      }
      this.loadedAt = new Date();
    } catch (err) {
      // A failed report must not leave the previous form's numbers on screen under the new
      // form's name — every figure would be a lie about the form the header claims.
      this.report = null;
      this.rawAnswers = [];
      this.fail(err, 'Failed to load the report.');
    } finally {
      this.loadingReport = false;
      this.cdr.markForCheck();
    }
  }

  /** Re-reads the selected form's report; a form owner may be watching submissions arrive. */
  public async refresh(): Promise<void> {
    if (!this.selectedForm) return;
    await this.selectForm(this.selectedForm);
  }

  // --- The report ------------------------------------------------------------

  public setMode(mode: DashboardMode): void {
    this.mode = mode;
    this.responseDetail = null;
    this.cdr.markForCheck();
  }

  /** "48 responses · last 2 hours ago" — the header line under the form's name. */
  public get reportLine(): string {
    const summary = this.report?.summary;
    if (!summary) return '';
    const last = summary.lastSubmittedAt
      ? ` · last ${relativeTime(summary.lastSubmittedAt, this.loadedAt)}`
      : '';
    return `${plural(summary.totalResponses, 'response')}${last}`;
  }

  /** Whether the selected form has collected anything at all. */
  public get hasResponses(): boolean {
    const summary = this.report?.summary;
    return !!summary && summary.completeResponses + summary.partialResponses > 0;
  }

  /**
   * Whether the drop-off funnel is worth drawing. A single-page form has one step, which
   * is not a funnel — it is a bar at 100% that says nothing.
   */
  public get hasFunnel(): boolean {
    return (this.report?.funnel.length ?? 0) > 1;
  }

  public get completionLabel(): string {
    return percent(this.report?.summary.completionRate ?? 0);
  }

  public async openResponse(responseId: string): Promise<void> {
    // Ignore a click while a detail load is already in flight. The list stays mounted
    // during the load, and the read is now two round trips whose count depends on whether
    // the response has file answers — so without this, two fast clicks resolve in
    // data-dependent order and the user can land on the response they did not pick.
    if (!this.report || this.busy) return;
    this.busy = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      this.responseDetail = this.useMock
        ? this.mockDetail(responseId)
        : await this.responses.loadResponseDetail(responseId, this.report.questions);
    } catch (err) {
      this.fail(err, 'Failed to load the response.');
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  public closeResponse(): void {
    this.responseDetail = null;
    this.cdr.markForCheck();
  }

  /**
   * Relays a deep link from the response detail (a stored file, an action log, an agent
   * run, a bound business record) to the container, which owns tab/routing behaviour.
   */
  public openLinkedRecord(link: ResponseRecordLink): void {
    this.OpenEntityRecord.emit({
      EntityName: link.entityName,
      RecordPKey: CompositeKey.FromID(link.recordId),
    });
  }

  public async export(format: ExportFormat): Promise<void> {
    if (!this.report) return;
    this.busy = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      await this.exporter.exportResponses(this.report, this.rawAnswers, format);
    } catch (err) {
      this.fail(err, 'Export failed.');
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  public dismissError(): void {
    this.errorMessage = null;
    this.cdr.markForCheck();
  }

  /** Builds a detail view from the mock report (no extra fetch). */
  private mockDetail(responseId: string): ResponseDetail {
    const row = this.report?.responses.find((r) => r.responseId === responseId);
    return mockResponseDetail(responseId, this.report?.questions ?? [], row);
  }

  private fail(err: unknown, fallback: string): void {
    const message = err instanceof Error ? err.message : fallback;
    this.errorMessage = message;
    LogError(message);
    this.Error.emit(err instanceof Error ? err : new Error(message));
  }
}
