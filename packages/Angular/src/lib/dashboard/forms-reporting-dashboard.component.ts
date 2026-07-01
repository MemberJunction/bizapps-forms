import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseDashboard } from '@memberjunction/ng-shared';
import type { ResourceData } from '@memberjunction/core-entities';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { ExportFormat } from '@memberjunction/export-engine';
import type {
  mjBizAppsFormsFormResponseAnswerEntityType,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';

import { FormsReportingService } from './services/forms-reporting.service';
import { FormsReportingExportService } from './services/forms-reporting-export.service';
import { mockReport, mockReportableForms } from './services/forms-reporting-mock';
import type {
  FormReportData,
  ReportableForm,
  ResponseDetail,
} from './models/reporting.model';

import { FormsSummaryStatsComponent } from './components/summary-stats.component';
import { FormsQuestionBreakdownComponent } from './components/question-breakdown.component';
import { FormsFunnelChartComponent } from './components/funnel-chart.component';
import { FormsResponseListComponent } from './components/response-list.component';
import { FormsResponseDetailComponent } from './components/response-detail.component';

type DashboardTab = 'summary' | 'questions' | 'funnel' | 'responses';

/**
 * Forms reporting dashboard (WP-F). A `BaseDashboard` subclass registered with
 * the MJ ClassFactory under 'FormsReportingDashboard' — the matching Dashboard
 * metadata record (DriverClass) is authored by WP-A.
 *
 * Standalone so the Explorer can instantiate it directly via `createComponent`.
 * All data comes through RunView/RunViews (FormsReportingService); a seeded mock
 * mode renders the UI before any real responses exist (toggle is a one-flag swap).
 */
@RegisterClass(BaseDashboard, 'FormsReportingDashboard')
@Component({
  selector: 'mj-forms-reporting-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FormsReportingService, FormsReportingExportService],
  imports: [
    FormsModule,
    FormsSummaryStatsComponent,
    FormsQuestionBreakdownComponent,
    FormsFunnelChartComponent,
    FormsResponseListComponent,
    FormsResponseDetailComponent,
  ],
  templateUrl: './forms-reporting-dashboard.component.html',
  styleUrls: ['./forms-reporting-dashboard.component.css'],
})
export class FormsReportingDashboardComponent extends BaseDashboard {
  private readonly data = inject(FormsReportingService);
  private readonly exporter = inject(FormsReportingExportService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Flip to false once live responses exist; everything else is identical. */
  public useMock = true;

  public loading = false;
  public errorMessage: string | null = null;

  public forms: ReportableForm[] = [];
  public selectedForm: ReportableForm | null = null;
  public report: FormReportData | null = null;

  public activeTab: DashboardTab = 'summary';
  public readonly tabs: { key: DashboardTab; label: string; icon: string }[] = [
    { key: 'summary', label: 'Summary', icon: 'fa-solid fa-gauge' },
    { key: 'questions', label: 'Questions', icon: 'fa-solid fa-list-ul' },
    { key: 'funnel', label: 'Funnel', icon: 'fa-solid fa-filter' },
    { key: 'responses', label: 'Responses', icon: 'fa-solid fa-table-list' },
  ];

  /** Selected response for the detail view; null shows the list. */
  public responseDetail: ResponseDetail | null = null;

  /** Raw answer rows for the current report, kept for export pivoting. */
  private rawAnswers: mjBizAppsFormsFormResponseAnswerEntityType[] = [];

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Forms Reporting';
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
    this.beginLoad();
    try {
      this.forms = this.useMock ? mockReportableForms() : await this.data.loadReportableForms();
      if (this.forms.length > 0) {
        await this.selectForm(this.forms[0]);
      }
    } catch (err) {
      this.fail(err, 'Failed to load forms.');
    } finally {
      this.endLoad();
    }
  }

  public async selectForm(form: ReportableForm): Promise<void> {
    this.selectedForm = form;
    this.responseDetail = null;
    this.activeTab = 'summary';
    this.beginLoad();
    try {
      if (this.useMock) {
        this.report = mockReport();
        this.rawAnswers = [];
      } else {
        this.report = await this.data.loadReport(form);
        this.rawAnswers = await this.loadRawAnswers(form.formId);
      }
    } catch (err) {
      this.fail(err, 'Failed to load the report.');
    } finally {
      this.endLoad();
    }
  }

  public async onFormChange(formId: string): Promise<void> {
    const form = this.forms.find((f) => f.formId === formId);
    if (form) {
      await this.selectForm(form);
    }
  }

  public setTab(tab: DashboardTab): void {
    this.activeTab = tab;
    this.responseDetail = null;
  }

  public async openResponse(responseId: string): Promise<void> {
    if (!this.report) return;
    this.beginLoad();
    try {
      this.responseDetail = this.useMock
        ? this.mockResponseDetail(responseId)
        : await this.data.loadResponseDetail(responseId, this.report.questions);
    } catch (err) {
      this.fail(err, 'Failed to load the response.');
    } finally {
      this.endLoad();
    }
  }

  public closeResponse(): void {
    this.responseDetail = null;
  }

  public async export(format: ExportFormat): Promise<void> {
    if (!this.report) return;
    this.beginLoad();
    try {
      await this.exporter.exportResponses(this.report, this.rawAnswers, format);
    } catch (err) {
      this.fail(err, 'Export failed.');
    } finally {
      this.endLoad();
    }
  }

  /** Loads the raw answers separately so export can pivot to a wide matrix. */
  private async loadRawAnswers(
    formId: string,
  ): Promise<mjBizAppsFormsFormResponseAnswerEntityType[]> {
    return this.data.loadAnswersForForm(formId);
  }

  /** Builds a detail view from the mock report (no extra fetch). */
  private mockResponseDetail(responseId: string): ResponseDetail {
    const row = this.report?.responses.find((r) => r.responseId === responseId);
    return {
      responseId,
      status: row?.status ?? 'Complete',
      startedAt: row?.startedAt ?? null,
      submittedAt: row?.submittedAt ?? null,
      respondent: row?.respondent ?? 'Anonymous',
      answers: this.mockDetailAnswers(),
    };
  }

  private mockDetailAnswers(): ResponseDetail['answers'] {
    const qs: PublishedFormQuestion[] = this.report?.questions ?? [];
    return qs
      .filter((q) => q.type !== 'Statement')
      .slice(0, 4)
      .map((q) => ({
        questionId: q.id,
        prompt: q.prompt,
        type: q.type,
        displayValue: 'Sample answer',
      }));
  }

  private beginLoad(): void {
    this.loading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
  }

  private endLoad(): void {
    this.loading = false;
    this.cdr.markForCheck();
  }

  private fail(err: unknown, fallback: string): void {
    const message = err instanceof Error ? err.message : fallback;
    this.errorMessage = message;
    LogError(message);
    this.Error.emit(err instanceof Error ? err : new Error(message));
  }
}
