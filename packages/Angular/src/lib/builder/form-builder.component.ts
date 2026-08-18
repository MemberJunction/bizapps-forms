import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CdkDropList,
  CdkDrag,
  CdkDragHandle,
  CdkDragPreview,
  moveItemInArray,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { CompositeKey } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormStyleEntity,
  FormQuestionType,
  FormRenderMode,
  FormStyleTokens,
  PublishedFormDefinition,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { BuilderStateService } from './builder-state.service';
import { DesignStateService } from './design-state.service';
import { PublishService, type PublishResult } from './publish.service';
import { QuestionEditorComponent } from './question-editor.component';
import { DistributionManagerComponent } from './distribution-manager.component';
import { AutomationTabComponent, type MappableQuestion } from './automation-tab.component';
import { ResponsesTabComponent } from '../responses/responses-tab.component';
import type { ResponseRecordLink } from '../responses/response-models';
import { DesignPanelComponent } from './design-panel.component';
import { FormPreviewModalComponent } from './form-preview-modal.component';
import { buildPublishedDefinition } from './snapshot-builder';
import type { FormTree, PageNode, QuestionNode } from './builder-models';
import {
  QUESTION_PALETTE_GROUPS,
  questionTypeMeta,
  questionTypesInGroup,
  type QuestionPaletteGroup,
  type QuestionTypeMeta,
} from './question-type-catalog';
import type { ConditionalSourceQuestion } from './conditional-rule-editor.component';
import { FORM_BUILDER_STYLES } from './form-builder.styles';
import { definitionFingerprint, storedSnapshotFingerprint } from './publish-fingerprint';
import { isValidReorder } from './reorder';

/**
 * Which workspace tab is showing.
 *
 * `responses` sits last, after `onsubmit`: the tabs read left to right as the life of a
 * form — build it, style it, distribute it, decide what happens on submit, then read what
 * came back. Collection follows configuration.
 */
type BuilderTab = 'build' | 'design' | 'distribute' | 'onsubmit' | 'responses';

/**
 * Stand-in version id used only while fingerprinting.
 *
 * `formVersionId` is excluded from the comparison anyway (it is a fresh GUID per publish),
 * but `buildPublishedDefinition` requires one — a constant keeps the built snapshot itself
 * deterministic rather than relying on the exclusion to hide a value that changes.
 */
const FINGERPRINT_VERSION_ID = 'draft-fingerprint';

/**
 * The visual form builder — registered as the override for the
 * `MJ_BizApps_Forms: Forms` entity form so that opening a Form record in Explorer
 * renders the builder instead of the generated property grid (FORMS_BUILD_PLAN §9).
 *
 * Layout (desktop): a left palette of question types, a center canvas listing the
 * questions, and a right properties panel for the selected question. A second tab
 * manages distributions. Publishing snapshots the definition into a new FormVersion
 * via {@link PublishService}.
 *
 * The component extends {@link BaseFormComponent} so the Explorer host wires `record`
 * (the loaded Form entity) and the save/navigation plumbing. We render our own UI
 * rather than the generated template.
 */
@RegisterClass(BaseFormComponent, FORMS_ENTITY.Form, 10)
@Component({
  selector: 'mjf-form-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPreview,
    QuestionEditorComponent,
    DistributionManagerComponent,
    DesignPanelComponent,
    FormPreviewModalComponent,
    AutomationTabComponent,
    ResponsesTabComponent,
  ],
  providers: [BuilderStateService, DesignStateService, PublishService],
  templateUrl: './form-builder.component.html',
  styles: [FORM_BUILDER_STYLES],
})
export class FormBuilderComponent extends BaseFormComponent {
  declare public record: mjBizAppsFormsFormEntity;

  private readonly state = inject(BuilderStateService);
  private readonly design = inject(DesignStateService);
  private readonly publisher = inject(PublishService);

  protected readonly paletteGroups = QUESTION_PALETTE_GROUPS;
  protected tree: FormTree | null = null;
  protected selectedQuestionId: string | null = null;
  protected activeTab: BuilderTab = 'build';
  protected busy = false;
  protected statusMessage = '';

  /**
   * Fingerprint of the snapshot currently on the public link; null when never published.
   * Refreshed on load and after a successful publish.
   */
  private publishedFingerprint: string | null = null;

  /** Fingerprint of the draft as it stands. Recomputed after every edit. */
  private draftFingerprint: string | null = null;

  /**
   * The style the draft currently resolves to, cached so the fingerprint stays synchronous.
   * A style change is publishable, so this is refreshed whenever one is applied.
   */
  private appliedStyle: mjBizAppsFormsFormStyleEntity | undefined;

  /**
   * True when the draft differs from what the public link is serving.
   *
   * A comparison, not a flag. The previous boolean latch could only ever be set by an edit
   * and cleared by a publish, so adding a question and deleting it again left the form
   * claiming unpublished changes it did not have.
   */
  protected get dirty(): boolean {
    return (
      this.publishedFingerprint !== null &&
      this.draftFingerprint !== null &&
      this.publishedFingerprint !== this.draftFingerprint
    );
  }

  /** Non-null while the full-screen WYSIWYG Preview is open (holds the draft definition). */
  protected previewDef: PublishedFormDefinition | null = null;

  /**
   * What the Publish control should currently offer.
   *
   * The button used to be a solid primary CTA at all times, which made a fully-published
   * form look like it still owed the author an action — press it and nothing meaningful
   * happens. State now lives in the control itself:
   *
   *  - `publish`  — a Draft that has never gone live. There IS something to do.
   *  - `update`   — live, with edits the public link has not seen yet. The urgent case.
   *  - `current`  — live and in sync. Nothing to do, and the button says so instead of
   *                 pretending otherwise.
   */
  protected get publishState(): 'publish' | 'update' | 'current' {
    if (this.dirty) return 'update';
    return this.record.Status === 'Published' ? 'current' : 'publish';
  }

  /**
   * Recompute the draft fingerprint and refresh the view.
   *
   * Called wherever the old `markDirty()` was — same frequency, but it re-derives the answer
   * instead of latching it, so an edit that restores the published state reports clean.
   */
  private markDirty(): void {
    this.draftFingerprint = this.tree
      ? definitionFingerprint(
          buildPublishedDefinition(this.tree, this.appliedStyle, FINGERPRINT_VERSION_ID, []),
        )
      : null;
    this.cdr.markForCheck();
  }

  /**
   * The draft as a published definition, for the Design tab's live sample.
   *
   * Same builder as publish and as Preview, so the Design tab shows the actual form rather
   * than a stand-in — the whole point of styling it is seeing your own questions.
   */
  protected get designPreviewDefinition(): PublishedFormDefinition | null {
    return this.tree
      ? buildPublishedDefinition(this.tree, this.appliedStyle, FINGERPRINT_VERSION_ID, [])
      : null;
  }

  /** Read the live snapshot and the current draft, so `dirty` has both sides to compare. */
  private async refreshPublishState(): Promise<void> {
    this.appliedStyle = this.record.StyleID
      ? ((await this.design.loadStyleById(this.record.StyleID)) ?? undefined)
      : undefined;
    this.publishedFingerprint = storedSnapshotFingerprint(
      await this.publisher.latestPublishedSnapshot(this.record.ID),
    );
    this.markDirty();
  }

  override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    await this.loadBuilder();
  }

  private async loadBuilder(): Promise<void> {
    this.busy = true;
    // A Form opened via the "new record" flow isn't persisted yet, so its child
    // Pages/Questions would violate FK_FormPage_Form / FK_FormQuestion_Form. Persist
    // the Form shell first (the builder is immediate-persist by design).
    if (!(await this.ensureFormSaved())) {
      this.busy = false;
      this.cdr.markForCheck();
      return;
    }
    this.tree = await this.state.loadTree(this.record);
    if (this.tree.pages.length === 0) {
      const page = await this.state.addPage(this.tree, 'Page 1');
      if (page) {
        this.tree.pages.push(page);
      }
    }
    await this.refreshPublishState();
    this.busy = false;
    this.cdr.markForCheck();
  }

  /**
   * Guarantee the Form record exists in the DB before any child insert. New records
   * (Explorer "create") arrive unsaved with a client-generated ID; `Name` is the only
   * required column without a DB default, so we seed a placeholder the author renames.
   */
  private async ensureFormSaved(): Promise<boolean> {
    if (this.record.IsSaved) {
      return true;
    }
    if (!this.record.Name) {
      this.record.Name = 'Untitled form';
    }
    return this.state.save(this.record);
  }

  // -- palette --------------------------------------------------------------

  protected typesInGroup(group: QuestionPaletteGroup): QuestionTypeMeta[] {
    return questionTypesInGroup(group);
  }

  protected async addQuestion(type: FormQuestionType): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    const page = this.targetPageForNewQuestion();
    if (!page) {
      return;
    }
    this.busy = true;
    const node = await this.state.addQuestion(this.tree, page, type, this.defaultPrompt(type));
    if (node) {
      page.questions.push(node);
      this.selectedQuestionId = node.entity.ID;
      this.markDirty();
    }
    this.busy = false;
    this.cdr.markForCheck();
  }

  /** Add to the page holding the selected question, else the last page. */
  private targetPageForNewQuestion(): PageNode | undefined {
    if (!this.tree || this.tree.pages.length === 0) {
      return undefined;
    }
    if (this.selectedQuestionId) {
      const owner = this.tree.pages.find((p) =>
        p.questions.some((q) => q.entity.ID === this.selectedQuestionId),
      );
      if (owner) {
        return owner;
      }
    }
    return this.tree.pages[this.tree.pages.length - 1];
  }

  private defaultPrompt(type: FormQuestionType): string {
    return type === 'Statement' ? 'Add your statement text here' : `Untitled ${questionTypeMeta(type).label} question`;
  }

  // -- canvas / selection ---------------------------------------------------

  protected get pages(): PageNode[] {
    return this.tree?.pages ?? [];
  }

  protected selectQuestion(node: QuestionNode): void {
    this.selectedQuestionId = node.entity.ID;
    this.cdr.markForCheck();
  }

  protected get selectedNode(): QuestionNode | null {
    if (!this.tree || !this.selectedQuestionId) {
      return null;
    }
    for (const page of this.tree.pages) {
      const found = page.questions.find((q) => q.entity.ID === this.selectedQuestionId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /** Questions preceding the selected one (valid conditional-rule sources). */
  protected get conditionalSources(): ConditionalSourceQuestion[] {
    if (!this.tree || !this.selectedQuestionId) {
      return [];
    }
    const sources: ConditionalSourceQuestion[] = [];
    for (const page of this.tree.pages) {
      for (const q of page.questions) {
        if (q.entity.ID === this.selectedQuestionId) {
          return sources;
        }
        sources.push({ id: q.entity.ID, prompt: q.entity.Prompt });
      }
    }
    return sources;
  }

  /** Every question on the form, in page/display order — what the On Submit tab maps from. */
  protected get mappableQuestions(): MappableQuestion[] {
    if (!this.tree) {
      return [];
    }
    return this.tree.pages.flatMap((page) =>
      page.questions.map((q) => ({ id: q.entity.ID, prompt: q.entity.Prompt, type: q.entity.QuestionType })),
    );
  }

  protected metaFor(node: QuestionNode): QuestionTypeMeta {
    return questionTypeMeta(node.entity.QuestionType);
  }

  protected displayIndex(page: PageNode, node: QuestionNode): string {
    const idx = page.questions.indexOf(node) + 1;
    return idx.toString().padStart(2, '0');
  }

  // -- editing handlers (persist on change) ---------------------------------

  protected async onQuestionChanged(node: QuestionNode): Promise<void> {
    await this.state.save(node.entity);
    this.markDirty();
  }

  protected async onAddOption(node: QuestionNode): Promise<void> {
    const option = await this.state.addOption(node, `Option ${node.options.length + 1}`);
    if (option) {
      node.options.push(option);
      this.markDirty();
    }
  }

  protected async onRemoveOption(event: { node: QuestionNode; optionIndex: number }): Promise<void> {
    const { node, optionIndex } = event;
    const option = node.options[optionIndex];
    if (option && (await this.state.deleteOption(option))) {
      node.options.splice(optionIndex, 1);
      await this.state.persistOptionOrder(node);
      this.markDirty();
    }
  }

  protected async deleteQuestion(page: PageNode, node: QuestionNode): Promise<void> {
    if (this.busy || !(await this.state.deleteQuestion(node))) {
      return;
    }
    page.questions = page.questions.filter((q) => q !== node);
    await this.state.persistQuestionOrder(page);
    if (this.selectedQuestionId === node.entity.ID) {
      this.selectedQuestionId = null;
    }
    this.markDirty();
  }

  protected async moveQuestion(page: PageNode, node: QuestionNode, delta: number): Promise<void> {
    const index = page.questions.indexOf(node);
    await this.reorderQuestion(page, index, index + delta);
  }

  /** Pointer/touch drag-drop reorder within a page (mirrors {@link moveQuestion}). */
  protected async dropQuestion(page: PageNode, event: CdkDragDrop<QuestionNode[]>): Promise<void> {
    await this.reorderQuestion(page, event.previousIndex, event.currentIndex);
  }

  /** Shared reorder: move a question to a new index in its page, then persist. */
  private async reorderQuestion(page: PageNode, from: number, to: number): Promise<void> {
    if (this.busy || !isValidReorder(from, to, page.questions.length)) {
      return;
    }
    moveItemInArray(page.questions, from, to);
    await this.state.persistQuestionOrder(page);
    this.markDirty();
  }

  // -- form-level settings --------------------------------------------------

  protected async setRenderMode(mode: FormRenderMode): Promise<void> {
    if (!this.tree || this.record.RenderMode === mode) {
      return;
    }
    this.record.RenderMode = mode;
    await this.state.save(this.record);
    this.markDirty();
  }

  protected async setName(name: string): Promise<void> {
    this.record.Name = name;
    await this.state.save(this.record);
    this.markDirty();
  }

  // -- publish --------------------------------------------------------------

  protected async publish(): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    this.busy = true;
    this.statusMessage = '';
    const result: PublishResult = await this.publisher.publish(this.tree);
    this.busy = false;
    if (result.success) {
      this.statusMessage = `Published version ${result.versionNumber}.`;
      // The draft IS the published snapshot now; re-read rather than assume, so a publish
      // that transformed anything server-side still leaves the two sides comparable.
      await this.refreshPublishState();
    } else {
      this.statusMessage = result.error ?? 'Publish failed.';
    }
    this.cdr.markForCheck();
  }

  protected setTab(tab: BuilderTab): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  /**
   * Relays a deep link from the Responses tab (a stored file, an action log, an agent run,
   * a bound business record) to the Explorer host via `BaseFormComponent.Navigate` — the
   * same seam the generated forms use for foreign-key links.
   */
  protected openLinkedRecord(link: ResponseRecordLink): void {
    this.Navigate.emit({
      Kind: 'record',
      EntityName: link.entityName,
      PrimaryKey: CompositeKey.FromID(link.recordId),
    });
  }

  /** The Design panel persisted `Form.StyleID`; the theme reaches the live link only on Publish. */
  protected onStyleApplied(): void {
    // The applied style is part of the published snapshot, so the cache backing the
    // fingerprint has to be re-read before the comparison means anything.
    void this.refreshPublishState();
  }

  // -- WYSIWYG preview ------------------------------------------------------

  /** Toolbar "Preview": render the draft with the form's currently-assigned style. */
  protected async openPreview(): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    const style = this.record.StyleID
      ? (await this.design.loadStyleById(this.record.StyleID)) ?? undefined
      : undefined;
    // No automations: Preview renders the form, it never runs a submission's side effects.
    this.previewDef = buildPublishedDefinition(this.tree, style, 'draft-preview', []);
    this.cdr.markForCheck();
  }

  protected closePreview(): void {
    this.previewDef = null;
    this.cdr.markForCheck();
  }
}
