import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseDashboard } from '@memberjunction/ng-shared';
import type { ResourceData } from '@memberjunction/core-entities';
import { CompositeKey, LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { ExportFormat } from '@memberjunction/export-engine';

import { FORMS_UI_CSS, FORMS_VIZ_CSS, failureMessage } from '../shared';
import { FORMS_REPORTING_CSS } from './forms-reporting-dashboard.styles';
import { reportingViewFromParams, reportingViewToParams, type ReportingMode, type ReportingView } from '../shared/view-urls';
import { FormsReportingService } from './services/forms-reporting.service';
import { FormsReportingExportService } from './services/forms-reporting-export.service';
import type { FormReportData, ReportableForm } from './models/reporting.model';
import type { ResponseRecordLink } from '../responses/response-models';
import {
  filterForms,
  percent,
  plural,
  portfolioLine,
  railState,
  relativeTime,
  reportState,
  type RailState,
  type ReportState,
  sortFormsForRail,
} from './reporting-view-model';
import { CoalescedLoad } from '../shared/coalesced-load';

import { FormsSummaryStatsComponent } from './components/summary-stats.component';
import { FormsRespondentProfileComponent } from './components/respondent-profile.component';
import { FormsOpenTextPanelComponent } from './components/open-text-panel.component';
import { FormsQuestionBreakdownComponent } from './components/question-breakdown.component';
import { FormsFunnelChartComponent } from './components/funnel-chart.component';
import { ResponsesTabComponent } from '../responses/responses-tab.component';

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
type DashboardMode = ReportingMode;

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
 * Standalone so the Explorer can instantiate it directly via `createComponent`. The report is
 * one Remote Operation (`Forms.GetResponseSummary`, computed on the server); the Responses view is
 * the same paged list and detail the builder's Responses tab is (`ResponsesTabComponent`); the
 * export pages through `Forms.ListResponses`.
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
    FormsRespondentProfileComponent,
    FormsOpenTextPanelComponent,
    FormsQuestionBreakdownComponent,
    FormsFunnelChartComponent,
    ResponsesTabComponent,
  ],
  templateUrl: './forms-reporting-dashboard.component.html',
  styles: [FORMS_UI_CSS, FORMS_VIZ_CSS, FORMS_REPORTING_CSS],
})
export class FormsReportingDashboardComponent extends BaseDashboard {
  private readonly data = inject(FormsReportingService);
  private readonly exporter = inject(FormsReportingExportService);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Three flags, not one, because they blank three different things.
   *
   * `loadingForms` is the only one that may take the whole surface: until the rail exists
   * there is nothing to navigate. `loadingReport` blanks the report but KEEPS the rail —
   * the rail is the navigation, and unmounting it mid-switch throws away the reader's
   * place and makes the click feel like a page load. The rail also stays clickable: a
   * newer selection supersedes the one loading (`selectionStamp`), so nothing needs
   * locking. `busy` blanks nothing at all; it disables controls while an export runs.
   */
  public loadingForms = false;
  public loadingReport = false;
  public busy = false;
  /**
   * While the Responses view is opening a response: the refresh and export controls are held, as
   * they were when this dashboard opened responses itself (`busy`).
   */
  public responsesBusy = false;
  /**
   * Whether the Responses view has been visited for the selected form. It is mounted on the first
   * visit and kept (hidden under Insights) until another form is selected, so going back and forth
   * keeps its list instead of re-reading the first page each time.
   */
  public responsesMounted = false;
  public errorMessage: string | null = null;
  /**
   * The selected form's report could not be read. Kept apart from `errorMessage`, which the
   * reader can dismiss: the pane keeps its failed state and its Retry until the next read.
   */
  public reportFailed = false;
  /**
   * Why the form list itself failed to load, kept apart from `errorMessage` (which any later
   * action overwrites or dismisses). With no list on screen it means the list is unknown, not
   * empty; with one (a failed reload) the list stays usable. `railState` decides which.
   */
  public formsLoadError: string | null = null;

  public forms: ReportableForm[] = [];
  /** `forms` narrowed by `railQuery`; maintained by `applyRailFilter`, not by the template. */
  public visibleForms: ReportableForm[] = [];
  public railQuery = '';
  public selectedForm: ReportableForm | null = null;
  public report: FormReportData | null = null;
  /**
   * Set instead of `report` when the server will not compute this form's summary for this reader
   * (row-restricted or no read access). Shown as "not available to you", not as an error; the
   * Responses view still lists whatever responses the reader may read.
   */
  public summaryUnavailable: string | null = null;
  /** What the last export needs the reader to know (it holds only part of the form), or null. */
  public exportNotice: string | null = null;

  public mode: DashboardMode = 'insights';

  /**
   * The form and view a link (or back / forward) asked for, kept until the form list can satisfy
   * it — a deep link arrives before the list does (UI audit F09).
   */
  private urlView: ReportingView | null = null;
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

  /** Stamp of the latest selection; a load holding an older stamp was superseded and applies nothing. */
  private selectionStamp = 0;

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

  /**
   * The rail-and-report load: the mount-time load joins it; a host Refresh and the failed state's
   * retry re-request it, so no two of them overlap.
   */
  private readonly formsLoad = new CoalescedLoad((signal) => this.loadForms(signal), { label: 'Forms reporting rail and report' });

  /**
   * The mount-time load (`BaseDashboard.ngOnInit`), joining one already in flight: MJ's dashboard
   * host calls `Refresh()` on the instance it creates, so without the join opening the dashboard
   * sent `Forms.GetResponseSummary` twice.
   *
   * Returns the load, so `BaseDashboard` (which awaits `loadData` and then calls
   * `NotifyLoadComplete`) signals load-complete when the data is in. The base declares `void`; a
   * promise-returning override is what it awaits.
   */
  protected loadData(): Promise<void> {
    return this.formsLoad.join();
  }

  /**
   * A host Refresh reads again. One that arrives during a load is not dropped into it (it asked for
   * data read after it asked): it queues one follow-up that starts when that load settles. The base
   * then reaches {@link loadData}, whose join returns that follow-up, so load-complete waits for it.
   */
  public override Refresh(): Promise<void> {
    // Not floating: the coalescer never rejects, and the base's `loadData` below joins this same load.
    void this.formsLoad.again();
    return super.Refresh();
  }

  /**
   * One rail-and-report load; only {@link formsLoad} runs it. `signal` aborts when the coalescer
   * abandons the load at its timeout ({@link abandonLoad} then owns the page state), so after each
   * await an aborted load applies nothing — a newer load, or the reader, owns the page by then.
   */
  private async loadForms(signal: AbortSignal): Promise<void> {
    /** The stamp of this load's own report, once it starts one; see {@link abandonLoad}. */
    const own: { reportStamp: number | null } = { reportStamp: null };
    signal.addEventListener('abort', () => this.abandonLoad(signal.reason, own.reportStamp), { once: true });
    this.loadingForms = true;
    this.errorMessage = null;
    this.formsLoadError = null;
    this.cdr.markForCheck();
    try {
      const loaded = await this.data.loadReportableForms();
      if (signal.aborted) return;
      this.forms = sortFormsForRail(loaded);
      this.applyRailFilter();
      // The rail exists now, so the page-wide state ends here rather than when the first report
      // does. The rail is clickable from this point, and a reader who picks another form would
      // otherwise wait behind "Loading forms…" for a report they no longer want; the report
      // pane's own `loadingReport` covers this first load like any other.
      this.loadingForms = false;
      if (this.forms.length > 0) {
        // `loadReportFor` takes its stamp synchronously, before its first await.
        const showing = this.showSelectionAfterLoad();
        own.reportStamp = this.selectionStamp;
        await showing;
      }
    } catch (err) {
      // Abandoned: the coalescer logs this late failure; the page already says the load failed.
      if (signal.aborted) throw err;
      this.fail(err, 'Failed to load forms.');
      this.formsLoadError = this.errorMessage;
    } finally {
      if (!signal.aborted) {
        this.loadingForms = false;
        this.cdr.markForCheck();
      }
    }
  }

  /**
   * The load was abandoned at the coalescer's timeout. Still on the list: the rail failed. On its
   * own report (nobody picked another form since): end that spinner, and move the stamp so the
   * late report applies nothing. A report the reader picked meanwhile is theirs and is left alone.
   */
  private abandonLoad(reason: unknown, ownReportStamp: number | null): void {
    this.loadingForms = false;
    if (ownReportStamp === null) {
      this.fail(reason, 'Failed to load forms.');
      this.formsLoadError = this.errorMessage;
    } else if (ownReportStamp === this.selectionStamp) {
      this.selectionStamp++;
      this.loadingReport = false;
      this.reportFailed = true;
      this.fail(reason, 'Failed to load the report.');
    }
    this.cdr.markForCheck();
  }

  /**
   * After the list (re)loads: the form the reader is on, in the view they are on, re-read; the
   * first form, on Insights, when there is no selection yet or theirs is no longer listed. A host
   * Refresh used to jump back to the first form's Insights.
   */
  private async showSelectionAfterLoad(): Promise<void> {
    const wanted = this.urlView;
    this.urlView = null;
    const selectedId = this.selectedForm?.formId ?? wanted?.formId;
    const kept = selectedId ? this.forms.find((f) => f.formId.toLowerCase() === selectedId.toLowerCase()) : undefined;
    if (kept && kept.formId === this.selectedForm?.formId) {
      await this.loadReportFor(kept);
      return;
    }
    // The view is set as the load starts, not after it: the reader should land on Responses at once.
    const showing = this.selectForm(kept ?? this.forms[0]);
    if (kept && wanted?.view === 'responses') {
      this.setMode('responses', false);
    }
    await showing;
  }

  /**
   * A link, a reload or back / forward named a form and view. Before the list is in, it waits for
   * {@link showSelectionAfterLoad}; after, it is applied at once. MJ delivers these with its own
   * write-back suppressed, and this applies them without writing, so the URL is never rewritten
   * with what it just supplied.
   */
  protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
    const view = reportingViewFromParams(params);
    if (this.forms.length === 0) {
      this.urlView = view;
      return;
    }
    const form = view.formId ? this.forms.find((f) => f.formId.toLowerCase() === view.formId?.toLowerCase()) : undefined;
    void this.followUrl(form ?? this.forms[0], view.view);
  }

  private async followUrl(form: ReportableForm, view: DashboardMode): Promise<void> {
    const showing = form.formId !== this.selectedForm?.formId ? this.selectForm(form) : null;
    this.setMode(view, false);
    await showing;
  }

  /** The rail: the reader picked a form — shown, and kept in the URL. */
  public async pickForm(form: ReportableForm): Promise<void> {
    const showing = this.selectForm(form);
    this.writeUrl();
    await showing;
  }

  private writeUrl(): void {
    this.UpdateQueryParams(reportingViewToParams({ formId: this.selectedForm?.formId ?? null, view: this.mode }));
  }

  // --- The rail --------------------------------------------------------------

  public applyRailFilter(): void {
    this.visibleForms = filterForms(this.forms, this.railQuery);
    this.cdr.markForCheck();
  }

  /** "12 forms · 1,204 responses" — what this dashboard covers, before you pick one. */
  public get portfolioLine(): string {
    return portfolioLine(this.forms, this.formsLoadError);
  }

  /** Which state the selected form's pane shows; `failed` carries the Retry. */
  public get reportState(): ReportState {
    return reportState({
      loading: this.loadingReport,
      failed: this.reportFailed,
      unavailable: this.summaryUnavailable,
      hasReport: this.report !== null,
      hasResponses: this.hasResponses,
    });
  }

  /** Which of loading / failed / empty / ready the report pane shows. */
  public get railState(): RailState {
    return railState(this.loadingForms, this.formsLoadError, this.forms.length);
  }

  /** The failed state's retry: queued behind a load in flight (a host Refresh), never alongside it. */
  public retryLoadForms(): void {
    // Not floating: the coalescer never rejects, and `loadForms` shows its own failure.
    void this.formsLoad.again();
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

  /** Shows another form: back to its Insights, with the previous form's Responses view dropped. */
  public async selectForm(form: ReportableForm): Promise<void> {
    this.mode = 'insights';
    this.responsesMounted = false;
    this.responsesBusy = false;
    await this.loadReportFor(form);
  }

  /**
   * Re-reads the selected form's report; a form owner may be watching submissions arrive. The
   * reader stays in the view they are on: a Refresh from Responses re-reads and stays there.
   */
  public async refresh(): Promise<void> {
    if (!this.selectedForm) return;
    await this.loadReportFor(this.selectedForm);
  }

  private async loadReportFor(form: ReportableForm): Promise<void> {
    // The rail stays clickable during a load, so two loads can be in flight and they settle
    // in network order, not click order. Only the load holding the latest stamp may touch
    // the report, the error or the loading flag (#252).
    const stamp = ++this.selectionStamp;
    this.selectedForm = form;
    this.loadingReport = true;
    this.reportFailed = false;
    this.errorMessage = null;
    this.exportNotice = null;
    // The previous form's report must not sit under the new form's name while this one
    // loads: the header line and the Export buttons both read it.
    this.report = null;
    this.summaryUnavailable = null;
    this.cdr.markForCheck();
    try {
      const load = await this.data.loadReport(form);
      if (stamp !== this.selectionStamp) return;
      if (load.status === 'ready') {
        this.report = load.report;
      } else {
        this.summaryUnavailable = load.message;
      }
      this.loadedAt = new Date();
    } catch (err) {
      if (stamp !== this.selectionStamp) {
        // Nobody is looking at this form any more, so it is not shown — but it still failed.
        LogError(
          `Superseded report load for form ${form.formId} ("${form.name}"): ${failureMessage(err, 'Failed to load the report.')}`,
        );
        return;
      }
      // A failed report must not leave the previous form's numbers on screen under the new
      // form's name — every figure would be a lie about the form the header claims.
      this.report = null;
      this.reportFailed = true;
      this.fail(err, 'Failed to load the report.');
    } finally {
      // The latest request owns the flag; a superseded one clearing it would end the
      // spinner while the report the reader asked for is still loading.
      if (stamp === this.selectionStamp) {
        this.loadingReport = false;
        this.cdr.markForCheck();
      }
    }
  }

  // --- The report ------------------------------------------------------------

  /** Switch Insights / Responses; `remember` keeps it in the URL (a reader's switch, not a link's). */
  public setMode(mode: DashboardMode, remember = true): void {
    this.mode = mode;
    if (mode === 'responses') {
      this.responsesMounted = true;
    }
    if (remember) {
      this.writeUrl();
    }
    this.cdr.markForCheck();
  }

  /** The Responses view says when it is opening a response (its `BusyChange`). */
  public setResponsesBusy(busy: boolean): void {
    this.responsesBusy = busy;
    this.cdr.markForCheck();
  }

  /** Whether the (kept-mounted) Responses view belongs on the page for the selected form. */
  public get showResponsesView(): boolean {
    if (!this.responsesMounted || this.loadingReport) return false;
    return this.summaryUnavailable !== null || (this.report !== null && this.hasResponses);
  }

  /** Whether the selected form has anything to show under the mode switch: a report, or a refusal. */
  public get hasSelection(): boolean {
    return this.report !== null || this.summaryUnavailable !== null;
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
    return !!summary && summary.completeResponses + summary.partialResponses + summary.disqualifiedResponses > 0;
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

  /**
   * Whether the form asks anything that profiles a respondent.
   *
   * Absent for an anonymous survey, and the section is then omitted entirely rather than
   * rendered empty — "0 contactable" on a form that never asked for contact details is a
   * finding about nothing.
   */
  public get hasProfile(): boolean {
    const profile = this.report?.profile;
    return !!profile && !profile.isEmpty && profile.metrics.length > 0;
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
    // Read here so the failure below can be told apart from one belonging to a form the reader
    // has since left.
    if (!this.hasSelection || !this.selectedForm) return;
    const exportedForm = this.selectedForm;
    this.busy = true;
    this.errorMessage = null;
    this.exportNotice = null;
    this.cdr.markForCheck();
    try {
      const outcome = await this.exporter.exportResponses(exportedForm, format);
      // The notice belongs to the form it describes; a reader who moved on does not get it.
      if (this.selectedForm?.formId === exportedForm.formId) {
        this.exportNotice = outcome.notice;
      }
    } catch (err) {
      // The rail is not locked by `busy`, so the reader can move to another form mid-export.
      // Ask whether the export's form is still the one on screen, not whether a selection
      // happened: leaving and coming back is two selections, but the failure is theirs again.
      if (this.selectedForm?.formId !== exportedForm.formId) {
        LogError(
          `Superseded export for form ${exportedForm.formId} ("${exportedForm.name}"): ${failureMessage(err, 'Export failed.')}`,
        );
        return;
      }
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

  public dismissExportNotice(): void {
    this.exportNotice = null;
    this.cdr.markForCheck();
  }

  /**
   * Show and log a failure. It is never emitted as `BaseDashboard.Error`: MJ's host answers that,
   * during the first load, by replacing the whole dashboard with "Unable to Load Dashboard" (UI
   * audit F01) — and every failure here already has a state on the page with a way out (the
   * rail's Retry, the pane's Retry, the dismissible banner). A throw from `initDashboard` or
   * `loadData` itself still reaches the host through `BaseDashboard.runGuardedLoad`.
   */
  private fail(err: unknown, action: string): void {
    const message = failureMessage(err, action);
    this.errorMessage = message;
    LogError(message, undefined, err);
  }
}
