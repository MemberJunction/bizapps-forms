/**
 * The template gallery — where a form is started from something that already exists.
 *
 * TWO SECTIONS, AND THE ORDER IS THE DESIGN. "Your templates" comes first the moment any
 * exist, because a thing you made yourself carries far more recognition value than a stranger's
 * starter; burying your own saves under five built-ins teaches you they went nowhere. With none
 * saved yet the section still renders, empty, saying where saved templates will appear — the
 * gallery is the only place that can teach the feature exists.
 *
 * Cards rather than a dropdown of keys: recognition beats recall, and a card can show what a
 * dropdown cannot — the icon, the description, and how big the form actually is.
 *
 * Deletion lives HERE and nowhere else, on your own templates only. Built-ins carry a
 * "Built-in" label instead of a disabled delete button, because a greyed-out control invites the
 * click and then refuses it while a label simply answers the question.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { LogError } from '@memberjunction/core';
import {
  FormsDeleteTemplateOperation,
  STARTER_TEMPLATE_CATALOG,
  type StarterTemplateInfo,
} from '@mj-biz-apps/forms-entities';

import { FORMS_UI_CSS } from '../shared';
import { FORMS_ENTITY } from '../shared/entity-names';
import { FORMS_VIZ_CSS, vizSeriesClass } from '../shared/forms-viz';
import { TEMPLATES_GALLERY_CSS } from './templates-gallery.styles';
import { readSavedTemplates, type SavedTemplateRow } from '../shared/form-catalog';
import { runOperation } from '../shared/remote-operation';
import { onFormsWrite, type FormsWriteSubscription } from '../shared/forms-writes';
import { templateMark, type TemplateMark } from './template-marks';


/**
 * How long a burst of Form writes elsewhere settles before the gallery re-reads once — an open
 * builder writes the Form row on every structural edit (see `shared/forms-writes.ts`).
 */
const FORM_WRITE_DEBOUNCE_MS = 750;

/** Which template the author picked, and which of the two kinds it is. */
export type TemplateChoice =
  | { kind: 'starter'; key: string; name: string }
  | { kind: 'saved'; templateId: string; name: string };

@Component({
  selector: 'mjf-templates-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [FORMS_UI_CSS, FORMS_VIZ_CSS, TEMPLATES_GALLERY_CSS],
  templateUrl: './templates-gallery.component.html',
})
export class TemplatesGalleryComponent {
  private readonly cdr = inject(ChangeDetectorRef);

  /** Disables every card while the parent is creating a form from one. */
  @Input() public Busy = false;

  /** The author picked a template to start from. */
  @Output() public readonly Chosen = new EventEmitter<TemplateChoice>();

  /** A template was deleted, so anything caching a form list should refresh. */
  @Output() public readonly Deleted = new EventEmitter<void>();

  /** Something went wrong; the host owns the alert bar. */
  @Output() public readonly Failed = new EventEmitter<string>();

  public readonly starters: readonly StarterTemplateInfo[] = STARTER_TEMPLATE_CATALOG;
  public saved: SavedTemplateRow[] = [];
  public loading = false;

  /** The template the confirm dialog is currently asking about, if any. */
  public pendingDelete: SavedTemplateRow | null = null;
  public deleting = false;

  /** MJGlobal subscription behind {@link watchForTemplateChanges}; released on destroy. */
  private templateChanges?: FormsWriteSubscription;

  public async ngOnInit(): Promise<void> {
    this.watchForTemplateChanges();
    await this.reload();
  }

  public ngOnDestroy(): void {
    this.templateChanges?.unsubscribe();
    this.templateChanges = undefined;
  }

  /**
   * Re-read the gallery when a Forms row is saved or deleted anywhere in the app.
   *
   * Templates are saved from the BUILDER, which is a different component on a different tab, so
   * a gallery that loaded once showed a stale list until the whole page was refreshed — you saved
   * two templates and neither appeared. `onFormsWrite` hears every Forms row written elsewhere — a
   * record's own save or delete, or an announced operation such as `Forms.CloneForm` — and this
   * re-reads, which is the same mechanism the forms list uses.
   *
   * It cannot filter to templates only — the event carries the row, and a row's `IsTemplate` may
   * be what changed — so it reloads on any Forms save. The read is two small queries and the
   * gallery is only mounted while the panel is open, so that is the cheap side of the trade.
   */
  private watchForTemplateChanges(): void {
    if (this.templateChanges) {
      return;
    }
    this.templateChanges = onFormsWrite(FORMS_ENTITY.Form, ['save', 'delete'], () => {
      // `deleting` guards the gallery's own delete, which reloads when it finishes.
      if (this.loading || this.deleting) {
        return;
      }
      void this.reload();
    }, { debounceMs: FORM_WRITE_DEBOUNCE_MS, shouldHandle: () => !this.deleting });
  }

  /** Reload the saved half. The starters are code, so they never need reloading. */
  public async reload(): Promise<void> {
    this.loading = true;
    this.cdr.markForCheck();
    try {
      this.saved = await readSavedTemplates();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load your saved templates.';
      LogError(message);
      this.Failed.emit(message);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Colour per starter, from the shared viz rotation rather than a per-template literal —
   * so the row of cards reads as a set instead of five unrelated marks.
   */
  public colorFor(index: number): string {
    return vizSeriesClass(index);
  }

  public chooseStarter(starter: StarterTemplateInfo): void {
    this.Chosen.emit({ kind: 'starter', key: starter.key, name: starter.name });
  }

  public chooseSaved(row: SavedTemplateRow): void {
    this.Chosen.emit({ kind: 'saved', templateId: row.id, name: row.name });
  }

  /** Icon + colour for a saved template, derived from its id so it never changes under the user. */
  public markFor(row: SavedTemplateRow): TemplateMark {
    return templateMark(row.id);
  }

  public summaryFor(row: SavedTemplateRow): string {
    const questions = `${row.questionCount} question${row.questionCount === 1 ? '' : 's'}`;
    return row.pageCount > 1 ? `${questions} · ${row.pageCount} pages` : questions;
  }

  // --- Deletion --------------------------------------------------------------

  public askDelete(row: SavedTemplateRow): void {
    this.pendingDelete = row;
    this.cdr.markForCheck();
  }

  public cancelDelete(): void {
    this.pendingDelete = null;
    this.cdr.markForCheck();
  }

  public async confirmDelete(): Promise<void> {
    const target = this.pendingDelete;
    if (!target) {
      return;
    }
    this.deleting = true;
    this.cdr.markForCheck();
    try {
      // `Forms.DeleteTemplate`: the template and everything under it in one transaction, refused
      // for a working form or a template anything is attached to.
      const outcome = await runOperation(
        new FormsDeleteTemplateOperation(),
        { TemplateFormID: target.id },
        `deleting template ${target.id}`,
        [FORMS_ENTITY.Form],
        // Announced as a DELETE: an open builder showing "Saved as template" for this template
        // listens for Form deletes, and must stop claiming it.
        'delete',
      );
      if (!outcome.ok) {
        this.Failed.emit(`Could not delete "${target.name}": ${outcome.error}`);
        return;
      }
      this.pendingDelete = null;
      await this.reload();
      this.Deleted.emit();
    } catch (err) {
      const message = err instanceof Error ? err.message : `Could not delete "${target.name}".`;
      LogError(message);
      this.Failed.emit(message);
    } finally {
      this.deleting = false;
      this.cdr.markForCheck();
    }
  }
}
