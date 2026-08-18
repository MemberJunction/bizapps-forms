import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseDashboard } from '@memberjunction/ng-shared';
import type { ResourceData } from '@memberjunction/core-entities';
import { CompositeKey, LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { ActionParam } from '@memberjunction/actions-base';

import { FORMS_UI_CSS } from '../shared';
import { FormsHomeService } from './forms-home.service';
import { FORMS_HOME_CSS } from './forms-home-dashboard.styles';
import {
  HOME_ACTION,
  HOME_ENTITY,
  STARTER_TEMPLATES,
  type FormStatus,
  type FormSummaryRow,
  type StarterTemplateChoice,
} from './home-models';

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
 * It lists every form (RunView, read-only) and offers three ways to create one:
 *  - "New form" — opens a blank Form record; the WP-D entity-form override
 *    (@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Forms')) renders the
 *    visual builder for the new record.
 *  - "Author with AI" — runs `Forms: Generate Form From Brief` with a Brief.
 *  - "From template" — runs `Forms: Create Form From Template` with a TemplateKey.
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
  imports: [FormsModule, DatePipe],
  templateUrl: './forms-home-dashboard.component.html',
  styles: [FORMS_UI_CSS, FORMS_HOME_CSS],
})
export class FormsHomeDashboardComponent extends BaseDashboard {
  private readonly data = inject(FormsHomeService);
  private readonly cdr = inject(ChangeDetectorRef);

  public loading = false;
  public busy = false;
  public errorMessage: string | null = null;

  public forms: FormSummaryRow[] = [];
  /** `forms` narrowed by `query`. Maintained by `applyFilter`, not recomputed in the template. */
  public visibleForms: FormSummaryRow[] = [];
  public query = '';
  /** Archived forms are hidden by default; the toolbar toggles them back in. */
  public showArchived = false;
  public readonly templates: readonly StarterTemplateChoice[] = STARTER_TEMPLATES;

  public panel: AuthoringPanel = 'none';
  public brief = '';
  public selectedTemplateKey: string = STARTER_TEMPLATES[0]?.key ?? '';

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Forms';
  }

  public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-clipboard-list';
  }

  protected initDashboard(): void {
    // Nothing to set up beyond the injected service.
  }

  protected loadData(): void {
    void this.loadForms();
  }

  public async loadForms(): Promise<void> {
    this.beginLoad();
    try {
      this.forms = await this.data.loadForms();
      this.applyFilter();
    } catch (err) {
      this.fail(err, 'Failed to load forms.');
    } finally {
      this.endLoad();
    }
  }

  // --- Listing ---------------------------------------------------------------

  /** "12 forms · 340 responses" — the page subtitle. */
  public get summaryLine(): string {
    const responses = this.forms.reduce((sum, f) => sum + f.responseCount, 0);
    return `${plural(this.forms.length, 'form')} · ${plural(responses, 'response')}`;
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
   * Archives a form, or restores an archived one to Draft.
   *
   * Not a delete, and not labelled as one: see `FormsHomeService.setStatus` for why the
   * schema cannot support removing a form without destroying the responses it collected.
   * Restore returns it to Draft rather than Published, so bringing a form back never
   * silently reopens a public link.
   */
  public async toggleArchive(row: FormSummaryRow): Promise<void> {
    const next: FormStatus = this.isArchived(row) ? 'Draft' : ARCHIVED_STATUS;
    this.busy = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      const failure = await this.data.setStatus(row.id, next);
      if (failure) {
        this.errorMessage = failure;
        return;
      }
      await this.loadForms();
    } catch (err) {
      this.fail(err, `Could not ${next === ARCHIVED_STATUS ? 'archive' : 'restore'} this form.`);
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

  /** Runs the template action for the selected starter key. */
  public async createFromTemplate(): Promise<void> {
    if (!this.selectedTemplateKey) {
      this.errorMessage = 'Pick a template to start from.';
      this.cdr.markForCheck();
      return;
    }
    await this.runAuthoring(HOME_ACTION.createFromTemplate, [
      { Name: 'TemplateKey', Value: this.selectedTemplateKey, Type: 'Input' },
    ]);
  }

  /** Shared authoring runner: run, open the new form, refresh the grid. */
  private async runAuthoring(actionName: string, inputs: ActionParam[]): Promise<void> {
    this.busy = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      const result = await this.data.runAuthoringAction(actionName, inputs);
      if (!result.success) {
        this.errorMessage = result.message;
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
      this.fail(err, 'The authoring action failed.');
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

  private fail(err: unknown, fallback: string): void {
    const message = err instanceof Error ? err.message : fallback;
    this.errorMessage = message;
    LogError(message);
    this.Error.emit(err instanceof Error ? err : new Error(message));
  }
}
