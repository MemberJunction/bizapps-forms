import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
} from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseDashboard } from '@memberjunction/ng-shared';
import type { ResourceData } from '@memberjunction/core-entities';
import { CompositeKey, LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { ActionParam } from '@memberjunction/actions-base';

import { FORMS_UI_CSS, failureMessage } from '../shared';
import { onFormsWrite, type FormsWriteSubscription } from '../shared/forms-writes';
import { CoalescedLoad } from '../shared/coalesced-load';
import { FormsHomeService } from './forms-home.service';
import { FORMS_HOME_CSS } from './forms-home-dashboard.styles';
import { totalResponses } from './home-aggregations';
import { isFormsHomeUrl } from './home-route';
import {
  HOME_ACTION,
  HOME_ENTITY,
  type FormStatus,
  type FormSummaryRow,
} from './home-models';
import { TemplatesGalleryComponent, type TemplateChoice } from '../templates/templates-gallery.component';

/**
 * Status -> badge tone. Total over `FormStatus`, so widening the CHECK constraint
 * (and therefore the CodeGen union) fails the build here rather than quietly
 * rendering the new state as neutral grey.
 */
const STATUS_TONE: Record<FormStatus, string> = {
  Published: 'mjf-badge--success',
  Draft: 'mjf-badge--info',
  Closed: 'mjf-badge--warning',
};

/**
 * The status an archived form sits in.
 *
 * `Closed` is an existing lifecycle state meaning "no longer accepting responses", which
 * is the closest thing the schema has to archived — there is no soft-delete column, and
 * no FK to a form cascades, so a real delete is not on offer. Named so the list's
 * archive semantics are one constant rather than a string repeated in four predicates.
 */
const ARCHIVED_STATUS: FormStatus = 'Closed';

/**
 * How long a burst of Form writes elsewhere settles before the grid re-reads once. An open builder
 * writes the Form row on every structural edit (it is the graph's root), so an undebounced grid
 * behind it re-read itself per reorder.
 */
const FORM_WRITE_DEBOUNCE_MS = 750;

/** Headline for an authoring failure, whether the action threw or reported `success: false`. */
const AUTHORING_FAILED = 'The authoring action failed.';


/** "1 form" / "12 forms" — the list page says both numbers out loud a lot. */
function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Which authoring panel (if any) is open. */
type AuthoringPanel = 'none' | 'ai' | 'template';

/**
 * Forms home / studio — the first-class MJExplorer "Forms" surface
 * (FORMS_BUILD_PLAN §3.2). A `BaseDashboard` subclass registered with the MJ
 * ClassFactory under 'FormsHomeDashboard'; the matching `MJ: Dashboards`
 * metadata record (DriverClass) and the Forms app nav item are authored
 * alongside this component.
 *
 * It lists every form (read-only; `../shared/form-catalog`) and offers four ways to create one:
 *  - "New form" — opens a blank Form record; the WP-D entity-form override
 *    (@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Forms')) renders the
 *    visual builder for the new record.
 *  - "Author with AI" — runs `Forms: Generate Form From Brief` with a Brief.
 *  - "From template", a starter — runs `Forms: Create Form From Template` with a TemplateKey.
 *  - "From template", a saved one — `Forms.CreateFormFromTemplate` copies it on the server.
 *
 * Clicking a row, or finishing an authoring action, opens that Form record via
 * the container-handled `OpenEntityRecord` event — which renders the builder.
 *
 * Standalone + OnPush so the Explorer can instantiate it directly.
 */
@RegisterClass(BaseDashboard, 'FormsHomeDashboard')
@Component({
  selector: 'mj-forms-home-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FormsHomeService],
  imports: [FormsModule, DatePipe, TemplatesGalleryComponent],
  templateUrl: './forms-home-dashboard.component.html',
  styles: [FORMS_UI_CSS, FORMS_HOME_CSS],
})
export class FormsHomeDashboardComponent extends BaseDashboard {
  private readonly data = inject(FormsHomeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly location = inject(Location);

  public loading = false;
  public busy = false;
  public errorMessage: string | null = null;

  public forms: FormSummaryRow[] = [];
  /** `forms` narrowed by `query`. Maintained by `applyFilter`, not recomputed in the template. */
  public visibleForms: FormSummaryRow[] = [];
  public query = '';
  /** Archived forms are hidden by default; the toolbar toggles them back in. */
  public showArchived = false;
  public panel: AuthoringPanel = 'none';
  public brief = '';

  /** MJGlobal subscription behind {@link watchForFormChanges}; released on destroy. */
  private formChanges?: FormsWriteSubscription;
  /** Unregisters the {@link watchForReturn} listener; released on destroy. */
  private stopWatchingUrl?: () => void;

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Forms';
  }

  public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-clipboard-list';
  }

  protected initDashboard(): void {
    this.watchForReturn();
  }

  /**
   * Re-read when the user navigates back to this page.
   *
   * The Explorer wrapper calls `Refresh()` once, at mount, and a respondent's `FormResponse` is
   * written server-side, so nothing in this browser hears it: the response counts shown after a
   * trip to another tab were the ones read at mount (F10). `Location.onUrlChange` fires on every
   * pushState the Explorer router makes; when the new URL is this dashboard's own route
   * ({@link isFormsHomeUrl}: `/app/forms`, `/app/forms/Forms`) the list is read again.
   * `@angular/router` is not a dependency of this package, hence `Location`. `loadForms` is
   * coalesced, so a navigation during a read queues one follow-up, never a second read.
   *
   * Deliberately not done: polling or a push channel. A count that changes while this page is on
   * screen still waits for the next visit or a host Refresh.
   */
  private watchForReturn(): void {
    if (this.stopWatchingUrl) {
      return;
    }
    this.stopWatchingUrl = this.location.onUrlChange((url) => {
      if (!isFormsHomeUrl(url)) {
        return;
      }
      // Not floating: the coalescer never rejects, and `readForms` shows its own failure.
      void this.loadForms();
    });
  }

  /**
   * The one list read: the mount-time load joins it; a host Refresh, the reload after this page's
   * own writes and a write heard elsewhere all re-request it through {@link loadForms}, so no two
   * reads ever overlap and settle out of order.
   */
  private readonly openLoad = new CoalescedLoad((signal) => this.readForms(signal), { label: 'Forms home list' });

  /**
   * The mount-time load (`BaseDashboard.ngOnInit`), joining one already in flight: MJ's dashboard
   * host calls `Refresh()` on the instance it creates, so without the join opening the dashboard
   * read the list twice.
   *
   * Returns the load, so `BaseDashboard` (which awaits `loadData` and then calls
   * `NotifyLoadComplete`) signals load-complete when the list is in. The base declares `void`; a
   * promise-returning override is what it awaits.
   */
  protected loadData(): Promise<void> {
    this.watchForFormChanges();
    return this.openLoad.join();
  }

  /**
   * A host Refresh reads again. One that arrives during a load is not dropped into it (it asked for
   * data read after it asked): it queues one follow-up that starts when that load settles. The base
   * then reaches {@link loadData}, whose join returns that follow-up, so load-complete waits for it.
   */
  public override Refresh(): Promise<void> {
    // Not floating: the coalescer never rejects, and the base's `loadData` below joins this same load.
    void this.loadForms();
    return super.Refresh();
  }

  public ngOnDestroy(): void {
    this.formChanges?.unsubscribe();
    this.formChanges = undefined;
    this.stopWatchingUrl?.();
    this.stopWatchingUrl = undefined;
  }

  /**
   * Keep the list honest while it is sitting behind a builder tab.
   *
   * The list used to load once. Rename a form in the builder, come back, and the old name was
   * still there — the row had not changed, the page had simply never asked again. Polling would
   * have papered over it; `onFormsWrite` hears every Forms row written elsewhere — a record's own
   * save or delete, or an announced operation (a publish, a clone) — and the list re-reads.
   *
   * Deliberately narrow. It reacts to the Forms entity only — a save anywhere else in the
   * Explorer must not trigger a reload here — and it skips reloads while this surface is itself
   * mid-write, because `loadForms` already runs at the end of those. A write heard while a read
   * is in flight is not skipped: that read may have started before the write, so `loadForms`
   * queues one more behind it.
   */
  private watchForFormChanges(): void {
    if (this.formChanges) {
      return;
    }
    this.formChanges = onFormsWrite(HOME_ENTITY.forms, ['save', 'delete'], () => {
      if (this.busy) {
        return;
      }
      // Not floating: the coalescer never rejects, and `readForms` shows its own failure.
      void this.loadForms();
    }, { debounceMs: FORM_WRITE_DEBOUNCE_MS, shouldHandle: () => !this.busy });
  }

  /**
   * Re-reads the list after the current read, if one is in flight: one follow-up shared by every
   * caller who asks meanwhile, never a second read alongside it. Resolves once the list on screen
   * reflects a read that started after this call.
   */
  public loadForms(): Promise<void> {
    return this.openLoad.again();
  }

  /**
   * The read itself; only {@link openLoad} runs it. `signal` aborts when the coalescer abandons the
   * read at its timeout: the page then says so and ends the loading state at once, and the late
   * rows, if they come, are not applied (a newer read owns the list by then).
   */
  private async readForms(signal: AbortSignal): Promise<void> {
    signal.addEventListener(
      'abort',
      () => {
        this.fail(signal.reason, 'Failed to load forms.');
        this.endLoad();
      },
      { once: true },
    );
    this.beginLoad();
    try {
      const rows = await this.data.loadForms();
      if (signal.aborted) return;
      this.forms = rows;
      this.applyFilter();
    } catch (err) {
      // Abandoned: the coalescer logs this late failure; the page already says the read failed.
      if (signal.aborted) throw err;
      this.fail(err, 'Failed to load forms.');
    } finally {
      if (!signal.aborted) this.endLoad();
    }
  }

  // --- Listing ---------------------------------------------------------------

  /** "12 forms · 340 responses" — the page subtitle. */
  public get summaryLine(): string {
    const forms = plural(this.forms.length, 'form');
    const responses = totalResponses(this.forms);
    return responses === null ? forms : `${forms} · ${plural(responses, 'response')}`;
  }

  /** Shown beside the search box; only interesting once a search is narrowing the list. */
  public get countLine(): string {
    return this.query.trim()
      ? `${this.visibleForms.length} of ${this.forms.length}`
      : plural(this.forms.length, 'form');
  }

  public badgeToneFor(status: FormStatus): string {
    // The map is total over the compile-time union; the fallback covers a stored row
    // whose value predates a CHECK-constraint change and so isn't in it yet.
    return STATUS_TONE[status] ?? '';
  }

  /** Narrows the list to `query`, and hides archived forms unless asked for. */
  public applyFilter(): void {
    const needle = this.query.trim().toLowerCase();
    this.visibleForms = this.forms.filter((f) => {
      if (!this.showArchived && f.status === ARCHIVED_STATUS) return false;
      if (!needle) return true;
      return (
        f.name.toLowerCase().includes(needle) ||
        (f.categoryName?.toLowerCase().includes(needle) ?? false)
      );
    });
    this.cdr.markForCheck();
  }

  public get archivedCount(): number {
    return this.forms.filter((f) => f.status === ARCHIVED_STATUS).length;
  }

  public toggleArchived(): void {
    this.showArchived = !this.showArchived;
    this.applyFilter();
  }

  public isArchived(row: FormSummaryRow): boolean {
    return row.status === ARCHIVED_STATUS;
  }

  /**
   * Archives a form, or restores an archived one.
   *
   * Not a delete, and not labelled as one: every child table holds a plain FK to the form, and
   * a form that collected responses must keep them, so `Forms.ArchiveForm` moves it to `Closed`
   * and closes its share links in the same transaction. `Forms.RestoreForm` brings it back to
   * `Published` when it has a published version (else `Draft`) — but its links stay closed, so
   * restoring never silently reopens a public link.
   */
  public async toggleArchive(row: FormSummaryRow): Promise<void> {
    const restoring = this.isArchived(row);
    const action = `Could not ${restoring ? 'restore' : 'archive'} this form.`;
    this.busy = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      // An operation reports a refusal as a result rather than a throw, so this is the usual
      // failure path, not the catch below — it needs the same "what failed" prefix.
      const outcome = restoring ? await this.data.restore(row.id) : await this.data.archive(row.id);
      if (!outcome.ok) {
        this.fail(new Error(outcome.error), action);
        return;
      }
      await this.loadForms();
    } catch (err) {
      this.fail(err, action);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  // --- Row interaction -------------------------------------------------------

  /** Opens an existing form record (renders the WP-D builder). */
  public openForm(row: FormSummaryRow): void {
    this.OpenEntityRecord.emit({
      EntityName: HOME_ENTITY.forms,
      RecordPKey: CompositeKey.FromID(row.id),
    });
  }

  /** Opens a blank Form record so the builder creates a new form. */
  public newForm(): void {
    this.OpenEntityRecord.emit({
      EntityName: HOME_ENTITY.forms,
      RecordPKey: new CompositeKey(),
    });
  }

  // --- Authoring panels ------------------------------------------------------

  public openPanel(panel: AuthoringPanel): void {
    this.panel = panel;
    this.errorMessage = null;
    this.cdr.markForCheck();
  }

  public closePanel(): void {
    this.panel = 'none';
    this.cdr.markForCheck();
  }

  /** Runs the AI authoring action from the entered brief. */
  public async authorWithAI(): Promise<void> {
    const brief = this.brief.trim();
    if (!brief) {
      this.errorMessage = 'Enter a brief describing the form you want.';
      this.cdr.markForCheck();
      return;
    }
    await this.runAuthoring(HOME_ACTION.generateFromBrief, [
      { Name: 'Brief', Value: brief, Type: 'Input' },
    ]);
  }

  /**
   * Start a form from whichever kind of template the gallery offered.
   *
   * The two kinds take different roads and the author must not be able to tell: a starter is a
   * blueprint that lives in code, so the server action expands it; a saved template is a Form
   * row, so the server deep-copies it (`Forms.CreateFormFromTemplate`). Both end with the same
   * thing on screen — the new draft open in the builder.
   */
  public async useTemplate(choice: TemplateChoice): Promise<void> {
    if (choice.kind === 'starter') {
      await this.runAuthoring(HOME_ACTION.createFromTemplate, [
        { Name: 'TemplateKey', Value: choice.key, Type: 'Input' },
      ]);
      return;
    }
    await this.createFromSavedTemplate(choice);
  }

  private async createFromSavedTemplate(choice: TemplateChoice & { kind: 'saved' }): Promise<void> {
    this.busy = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      const outcome = await this.data.createFromTemplate(choice.templateId, choice.name);
      if (!outcome.ok) {
        this.fail(new Error(outcome.error), `Could not create a form from "${choice.name}".`);
        return;
      }
      this.closePanel();
      this.OpenEntityRecord.emit({
        EntityName: HOME_ENTITY.forms,
        RecordPKey: CompositeKey.FromID(outcome.output.FormID),
      });
      await this.loadForms();
      // Warnings describe references the copy could not carry over. They are shown rather than
      // logged and forgotten, because the author is the only person who can fix a dropped rule —
      // and AFTER the reload, whose start clears the alert: set before it, they were wiped unseen.
      if (outcome.output.Warnings.length > 0) {
        this.errorMessage = outcome.output.Warnings.join(' ');
      }
    } catch (err) {
      this.fail(err, `Could not create a form from "${choice.name}".`);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /** The gallery deleted a template; nothing in the forms list changes, but say so cleanly. */
  public onTemplateDeleted(): void {
    this.errorMessage = null;
    this.cdr.markForCheck();
  }

  /** The gallery hit a problem; the host owns the one alert bar on this page. */
  public onTemplateFailure(message: string): void {
    this.errorMessage = message;
    this.cdr.markForCheck();
  }

  /** Shared authoring runner: run, open the new form, refresh the grid. */
  private async runAuthoring(actionName: string, inputs: ActionParam[]): Promise<void> {
    this.busy = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      // MJ's action client reports a transport failure as { success: false } rather than
      // throwing, so this branch, not the catch, is where most authoring failures land.
      const result = await this.data.runAuthoringAction(actionName, inputs);
      if (!result.success) {
        this.fail(new Error(result.message), AUTHORING_FAILED);
        return;
      }
      this.closePanel();
      this.brief = '';
      if (result.formId) {
        this.OpenEntityRecord.emit({
          EntityName: HOME_ENTITY.forms,
          RecordPKey: CompositeKey.FromID(result.formId),
        });
      }
      await this.loadForms();
    } catch (err) {
      this.fail(err, AUTHORING_FAILED);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  // --- Loading helpers (mirror the reporting dashboard) ----------------------

  private beginLoad(): void {
    this.loading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
  }

  private endLoad(): void {
    this.loading = false;
    this.cdr.markForCheck();
  }

  /** Alert, log and emitted Error all say what failed; the original failure rides along as `cause`. */
  private fail(err: unknown, action: string): void {
    const message = failureMessage(err, action);
    this.errorMessage = message;
    LogError(message);
    this.Error.emit(new Error(message, { cause: err }));
  }
}
