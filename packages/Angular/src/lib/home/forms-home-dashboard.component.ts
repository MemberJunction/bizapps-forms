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
import { BaseEntity, CompositeKey, LogError } from '@memberjunction/core';
import { MJGlobal, MJEventType, RegisterClass } from '@memberjunction/global';
import type { ActionParam } from '@memberjunction/actions-base';

import { FORMS_UI_CSS } from '../shared';
import { FormsHomeService } from './forms-home.service';
import { FORMS_HOME_CSS } from './forms-home-dashboard.styles';
import {
  HOME_ACTION,
  HOME_ENTITY,
  type FormStatus,
  type FormSummaryRow,
} from './home-models';
import { TemplatesGalleryComponent, type TemplateChoice } from '../templates/templates-gallery.component';
import { FormCloneService } from '../templates/form-clone.service';
import { FormGenerationService } from '../builder/form-generation.service';
import { FormChatComponent, FormChatService } from '../chat';
import type { GenerationProgress } from '@mj-biz-apps/forms-entities';

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
 * The handle returned by subscribing to MJGlobal's event stream.
 *
 * Derived from the API rather than imported as `rxjs`'s `Subscription`: rxjs is not a dependency
 * of this package (it arrives through Angular in the host), so naming the type directly fails the
 * package's own typecheck. Deriving it keeps the shape correct without inventing a dependency.
 */
type EventSubscription = ReturnType<ReturnType<MJGlobal['GetEventListener']>['subscribe']>;

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
  providers: [FormsHomeService, FormCloneService, FormGenerationService, FormChatService],
  imports: [FormsModule, DatePipe, TemplatesGalleryComponent, FormChatComponent],
  templateUrl: './forms-home-dashboard.component.html',
  styles: [FORMS_UI_CSS, FORMS_HOME_CSS],
})
export class FormsHomeDashboardComponent extends BaseDashboard {
  private readonly data = inject(FormsHomeService);
  private readonly clone = inject(FormCloneService);
  private readonly generation = inject(FormGenerationService);
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
  public panel: AuthoringPanel = 'none';
  public brief = '';

  /** MJGlobal subscription behind {@link watchForFormChanges}; released on destroy. */
  private formChanges?: EventSubscription;

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
    this.watchForFormChanges();
  }

  public ngOnDestroy(): void {
    this.formChanges?.unsubscribe();
    this.formChanges = undefined;
  }

  /**
   * Keep the list honest while it is sitting behind a builder tab.
   *
   * The list used to load once. Rename a form in the builder, come back, and the old name was
   * still there — the row had not changed, the page had simply never asked again. Polling would
   * have papered over it; MJ already broadcasts the fact. Every `BaseEntity.Save()` and
   * `.Delete()` raises an MJGlobal `ComponentEvent` tagged `BaseEntity.BaseEventCode`, so the
   * list listens for the ones that concern Forms rows and re-reads.
   *
   * Deliberately narrow. It reacts to the Forms entity only — a save anywhere else in the
   * Explorer must not trigger a reload here — and it skips reloads while this surface is itself
   * mid-write, because `loadForms` already runs at the end of those.
   */
  private watchForFormChanges(): void {
    if (this.formChanges) {
      return;
    }
    this.formChanges = MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
      if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode) {
        return;
      }
      const args = event.args as { type?: string; baseEntity?: BaseEntity | null } | undefined;
      if (args?.type !== 'save' && args?.type !== 'delete') {
        return;
      }
      if (args.baseEntity?.EntityInfo?.Name !== HOME_ENTITY.forms) {
        return;
      }
      if (this.busy || this.loading) {
        return;
      }
      void this.loadForms();
    });
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
    this.busy = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      const outcome = await this.generation.generate(brief, 'brief', (name) =>
        this.data.resolveActionId(name),
      );
      // A PARTIAL build failed AND left a reviewable draft. Opening it is right — the author can
      // see what did get made and finish it — but the message has to say so, because a form that
      // opens looks finished and this one is not.
      if (!outcome.formId) {
        this.errorMessage = outcome.message;
        return;
      }
      if (outcome.partial || outcome.degraded.length > 0) {
        this.errorMessage = outcome.message;
      }
      this.closePanel();
      this.brief = '';
      this.OpenEntityRecord.emit({
        EntityName: HOME_ENTITY.forms,
        RecordPKey: CompositeKey.FromID(outcome.formId),
      });
      await this.loadForms();
    } catch (err) {
      this.fail(err, 'The form could not be generated.');
    } finally {
      this.generation.reset();
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * A chat turn created a form — open it, exactly as the old Generate button did.
   *
   * The list is refreshed too: the author is leaving it, but they come back to it, and a list that
   * is missing the form they just made is the same bug the old path shipped with.
   */
  protected async onChatCreatedForm(formId: string): Promise<void> {
    this.OpenEntityRecord.emit({
      EntityName: HOME_ENTITY.forms,
      RecordPKey: CompositeKey.FromID(formId),
    });
    await this.loadForms();
  }

  /** Live build progress for the panel's bar, or null when nothing is generating. */
  protected get generationProgress(): GenerationProgress | null {
    return this.generation.progress();
  }

  /**
   * Start a form from whichever kind of template the gallery offered.
   *
   * The two kinds take different roads and the author must not be able to tell: a starter is a
   * blueprint that lives in code, so the server action expands it; a saved template is a Form
   * row, so it is deep-copied here. Both end with the same thing on screen — the new draft open
   * in the builder.
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
      const result = await this.clone.cloneForm(choice.templateId, {
        name: choice.name,
        isTemplate: false,
      });
      // Warnings describe references the copy could not carry over. They are shown rather than
      // logged and forgotten, because the author is the only person who can fix a dropped rule.
      if (result.warnings.length > 0) {
        this.errorMessage = result.warnings.join(' ');
      }
      this.closePanel();
      this.OpenEntityRecord.emit({
        EntityName: HOME_ENTITY.forms,
        RecordPKey: CompositeKey.FromID(result.formId),
      });
      await this.loadForms();
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
