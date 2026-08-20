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
  mjBizAppsFormsFormScreenEntity,
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
import { ScreenEditorComponent } from './screen-editor.component';
import { ImportQuestionsComponent } from './import-questions.component';
import type { ImportedQuestion, ImportResult } from './question-import';
import { DistributionManagerComponent } from './distribution-manager.component';
import { AutomationTabComponent, type MappableQuestion } from './automation-tab.component';
import { ResponsesTabComponent } from '../responses/responses-tab.component';
import type { ResponseRecordLink } from '../responses/response-models';
import { DesignPanelComponent } from './design-panel.component';
import { FormPreviewModalComponent } from './form-preview-modal.component';
import { buildPublishedDefinition } from './snapshot-builder';
import type { FormTree, PageNode, QuestionNode } from './builder-models';
import { endScreensOf, welcomeScreenOf } from './builder-models';
import {
  QUESTION_PALETTE_GROUPS,
  questionTypeMeta,
  questionTypesInGroup,
  searchQuestionTypes,
  type QuestionPaletteGroup,
  type QuestionTypeMeta,
} from './question-type-catalog';
import type { ConditionalSourceQuestion } from './conditional-rule-editor.component';
import { FORM_BUILDER_STYLES } from './form-builder.styles';
import { definitionFingerprint, storedSnapshotFingerprint } from './publish-fingerprint';
import { isValidReorder } from './reorder';
import { nextOptionLabel } from './option-labels';
import {
  NOTHING_SELECTED,
  clearIfQuestion,
  clearIfScreen,
  questionId,
  screenId,
  selectQuestion as questionSelection,
  selectScreen as screenSelection,
  type BuilderSelection,
} from './builder-selection';

/**
 * Which workspace tab is showing.
 *
 * `responses` sits last, after `automate`: the tabs read left to right as the life of a
 * form — build it, style it, distribute it, decide what happens on submit, then read what
 * came back. Collection follows configuration.
 */
type BuilderTab = 'build' | 'design' | 'distribute' | 'automate' | 'responses';

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
    ScreenEditorComponent,
    ImportQuestionsComponent,
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

  protected readonly state = inject(BuilderStateService);
  private readonly design = inject(DesignStateService);
  private readonly publisher = inject(PublishService);

  protected readonly paletteGroups = QUESTION_PALETTE_GROUPS;
  protected tree: FormTree | null = null;
  /**
   * What the right-hand pane is showing. ONE value, not a question id beside a screen id: the
   * pane shows a single editor, and two independent fields let it show a screen's properties
   * while a freshly-added question sat highlighted and unreachable on the canvas.
   */
  protected selection: BuilderSelection = NOTHING_SELECTED;
  protected get selectedQuestionId(): string | null {
    return questionId(this.selection);
  }

  protected get selectedScreenId(): string | null {
    return screenId(this.selection);
  }

  /** Live palette filter. At 25 types, scanning seven groups is slower than typing. */
  protected paletteQuery = '';
  /** Whether the paste-to-import dialog is open. */
  protected importOpen = false;
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
  /**
   * Whether {@link publishState} has been resolved against the published snapshot yet.
   *
   * Both fingerprints start null, which reads as "not dirty" — so before the async read lands, a
   * Published form claims to be in sync and then corrects itself. Gating the control on this is
   * what stops the header changing its mind in front of the author (and what silenced NG0100).
   */
  protected publishStateReady = false;

  /**
   * Whether the loaded tree is safe for the view to read — see {@link announceReady}.
   *
   * Distinct from `!busy`: `busy` toggles for every edit, and hiding the canvas while a question
   * saves would make the builder flicker on every keystroke.
   */
  protected builderReady = false;

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
    this.publishStateReady = true;
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
    this.announceReady();
  }

  /**
   * Publish "the builder is loaded" to the view as a single transition, in its own task.
   *
   * `loadBuilder` awaits four different things, and Angular runs a change-detection pass at each
   * await boundary. Any template expression reading `tree` therefore flipped mid-check and Angular
   * reported NG0100 — first on the welcome-screen conditional, then, once that was gated, on the
   * gate itself. Gating cannot fix it, because the gate is the thing that changes.
   *
   * So the view reads ONE flag that flips exactly once, from a `setTimeout` — a macrotask, which
   * is the only scheduling primitive here guaranteed to run after the current cycle has finished
   * checking rather than inside it.
   */
  private announceReady(): void {
    setTimeout(() => {
      this.builderReady = true;
      this.cdr.markForCheck();
    }, 0);
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
    const inGroup = questionTypesInGroup(group);
    if (this.paletteQuery.trim() === '') {
      return inGroup;
    }
    const matches = new Set(searchQuestionTypes(this.paletteQuery).map((m) => m.type));
    return inGroup.filter((m) => matches.has(m.type));
  }

  /** True when a filter is active and this group has nothing left, so the heading can hide. */
  protected groupHasMatches(group: QuestionPaletteGroup): boolean {
    return this.typesInGroup(group).length > 0;
  }

  protected setPaletteQuery(value: string): void {
    this.paletteQuery = value;
    this.cdr.markForCheck();
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
      // Selecting the new question is what clears any screen selection. The author asked for a
      // question; the pane has to show them the question they just got.
      this.selection = questionSelection(node.entity.ID);
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

  protected async setPageTitle(page: PageNode, title: string): Promise<void> {
    page.entity.Title = title.trim() === '' ? null : title;
    await this.state.save(page.entity);
    this.markDirty();
    this.cdr.markForCheck();
  }

  protected async setPageDescription(page: PageNode, description: string): Promise<void> {
    page.entity.Description = description.trim() === '' ? null : description;
    await this.state.save(page.entity);
    this.markDirty();
    this.cdr.markForCheck();
  }

  /**
   * Start a new section.
   *
   * Pages shipped end to end — entity, published contract, page header on the canvas, the widget
   * rendering a title and description per section — with no way for an author to CREATE one.
   * `addPage` had exactly two callers: the implicit first page, and the import/paste path when a
   * pasted block named a section. So a multi-page form was reachable only by pasting one, and
   * the page header hides itself below two pages, which meant an author who had never pasted
   * never saw page controls at all and had no way to discover they existed.
   */
  protected async addPage(): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    this.busy = true;
    // Untitled, not "Page N": the title is a heading respondents READ, and a real one ("Contact
    // details") is the whole reason to split a form. A default that looks deliberate is a
    // default that ships.
    const page = await this.state.addPage(this.tree, '');
    if (page) {
      this.tree.pages.push(page);
      this.markDirty();
    }
    this.busy = false;
    this.cdr.markForCheck();
  }

  /**
   * Delete a page AND every question on it.
   *
   * Hover-revealed like every other delete on the canvas, but unlike them it asks first, because
   * the blast radius is not what the button is attached to: the page header shows a title and a
   * toggle, with no hint of how many questions go down with it. The last page is never deletable
   * — a form with no page has nowhere to put a question, and the builder would immediately
   * recreate one underneath the author.
   */
  protected async deletePage(page: PageNode): Promise<void> {
    if (!this.tree || this.busy || this.tree.pages.length <= 1) {
      return;
    }
    const count = page.questions.length;
    const what = count === 1 ? '1 question' : `${count} questions`;
    if (count > 0 && !confirm(`Delete this section and its ${what}? This cannot be undone.`)) {
      return;
    }
    this.busy = true;
    if (await this.state.deletePage(page)) {
      this.tree.pages = this.tree.pages.filter((p) => p.entity.ID !== page.entity.ID);
      for (const q of page.questions) {
        this.selection = clearIfQuestion(this.selection, q.entity.ID);
      }
      this.markDirty();
    }
    this.busy = false;
    this.cdr.markForCheck();
  }

  /** Toggle whether leaving this page banks a Partial response immediately. */
  protected async togglePartialSubmitPoint(page: PageNode): Promise<void> {
    page.entity.IsPartialSubmitPoint = !page.entity.IsPartialSubmitPoint;
    await this.state.save(page.entity);
    this.markDirty();
    this.cdr.markForCheck();
  }

  protected selectQuestion(node: QuestionNode): void {
    this.selection = questionSelection(node.entity.ID);
    this.cdr.markForCheck();
  }

  // -- screens --------------------------------------------------------------
  //
  // Screens live beside the pages on the canvas rather than among the questions, because that is
  // what they are: the welcome sits above the whole form and the endings below it. An author who
  // can see the shape of the flow does not have to be told that a welcome screen is not question
  // zero.

  protected get welcomeScreen(): mjBizAppsFormsFormScreenEntity | undefined {
    return this.tree ? welcomeScreenOf(this.tree) : undefined;
  }

  protected get endScreens(): mjBizAppsFormsFormScreenEntity[] {
    return this.tree ? endScreensOf(this.tree) : [];
  }

  protected get selectedScreen(): mjBizAppsFormsFormScreenEntity | null {
    if (!this.tree || !this.selectedScreenId) {
      return null;
    }
    return this.tree.screens.find((s) => s.ID === this.selectedScreenId) ?? null;
  }

  protected selectScreen(screen: mjBizAppsFormsFormScreenEntity): void {
    this.selection = screenSelection(screen.ID);
    this.cdr.markForCheck();
  }

  protected async addScreen(screenType: 'Welcome' | 'Ending'): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    this.busy = true;
    const title = screenType === 'Welcome' ? this.record.Name || 'Welcome' : 'Thanks for your response';
    const screen = await this.state.addScreen(this.tree, screenType, title);
    if (screen) {
      // `addScreen` returns the EXISTING welcome screen when one is already there, so guard
      // against pushing a duplicate into the tree the database correctly refused to duplicate.
      if (!this.tree.screens.some((s) => s.ID === screen.ID)) {
        this.tree.screens.push(screen);
      }
      this.selectScreen(screen);
      this.markDirty();
    }
    this.busy = false;
    this.cdr.markForCheck();
  }

  protected async deleteScreen(screen: mjBizAppsFormsFormScreenEntity): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    this.busy = true;
    if (await this.state.deleteScreen(screen)) {
      this.tree.screens = this.tree.screens.filter((s) => s.ID !== screen.ID);
      this.selection = clearIfScreen(this.selection, screen.ID);
      this.markDirty();
    }
    this.busy = false;
    this.cdr.markForCheck();
  }

  protected onScreenChanged(screen: mjBizAppsFormsFormScreenEntity): void {
    // Same coalescing as a question edit — the screen editor has five sibling inputs, and it
    // writes on every keystroke, so this is the busiest surface in the builder.
    this.state.saveDebounced(screen);
    this.markDirty();
    this.cdr.markForCheck();
  }

  /**
   * Conditional sources for an ENDING: every question on the form.
   *
   * Deliberately not the "questions before this one" rule that governs a question's own
   * condition. An ending is evaluated after the whole form is answered, so every answer is
   * available to it — restricting it to a prefix would hide the last page from the branch that
   * most wants to read it.
   */
  protected get endingConditionalSources(): ConditionalSourceQuestion[] {
    if (!this.tree) {
      return [];
    }
    return this.tree.pages.flatMap((page) =>
      page.questions.map((q) => ({ id: q.entity.ID, prompt: q.entity.Prompt })),
    );
  }

  // -- import ---------------------------------------------------------------

  protected openImport(): void {
    this.importOpen = true;
    this.cdr.markForCheck();
  }

  protected closeImport(): void {
    this.importOpen = false;
    this.cdr.markForCheck();
  }

  /**
   * Create the pages and questions a paste described.
   *
   * Appends rather than replaces. Import is used to ADD a section far more often than to start
   * over, and an import that silently wiped an existing form would be unrecoverable — there is
   * no undo here.
   */
  protected async onImported(result: ImportResult): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    this.importOpen = false;
    this.busy = true;
    try {
      for (const importedPage of result.pages) {
        const page = await this.pageForImport(importedPage.title);
        if (!page) {
          continue;
        }
        for (const q of importedPage.questions) {
          await this.createImportedQuestion(page, q);
        }
      }
      this.markDirty();
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * The page an imported block goes on: a new one when the paste named it, else the last
   * existing page so an untitled paste extends the form the author is already looking at.
   */
  private async pageForImport(title: string | undefined): Promise<PageNode | undefined> {
    if (!this.tree) {
      return undefined;
    }
    if (title) {
      const created = await this.state.addPage(this.tree, title);
      if (created) {
        this.tree.pages.push(created);
      }
      return created;
    }
    return this.tree.pages[this.tree.pages.length - 1];
  }

  private async createImportedQuestion(page: PageNode, imported: ImportedQuestion): Promise<void> {
    if (!this.tree) {
      return;
    }
    const node = await this.state.addQuestion(this.tree, page, imported.type, imported.prompt);
    if (!node) {
      return;
    }
    if (imported.isRequired) {
      node.entity.IsRequired = true;
      await this.state.save(node.entity);
    }
    if (imported.options.length > 0) {
      // The seeded "Option 1 / Option 2" pair is a placeholder for an author who will edit it;
      // a paste that named its options has already done that, so the placeholders go.
      for (const seeded of [...node.options]) {
        await this.state.deleteOption(seeded);
      }
      node.options = [];
      for (const label of imported.options) {
        const option = await this.state.addOption(node, label);
        if (option) {
          node.options.push(option);
        }
      }
    }
    page.questions.push(node);
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

  /** Every question on the form, in page/display order — what the Automate tab maps from. */
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

  /**
   * A field on the selected question changed.
   *
   * Coalesced rather than saved immediately: the properties panel has several sibling inputs, and
   * two committing in the same tick used to race and lose the second edit outright — see
   * `saveDebounced`. The in-memory tree is updated synchronously by the editor either way, so
   * Preview and Publish always see the current state; only the write is deferred.
   */
  protected onQuestionChanged(node: QuestionNode): void {
    this.state.saveDebounced(node.entity);
    this.markDirty();
  }

  protected async onAddOption(event: { node: QuestionNode; matrixAxis?: 'Row' | 'Column' }): Promise<void> {
    const { node, matrixAxis } = event;
    // Number within the AXIS, not within the whole option list: a matrix whose second column
    // was labelled "Option 4" because two rows came first is just confusing.
    // Named from the labels that EXIST, not from how many there are: a list that had lost
    // "Option 1" used to mint a second "Option 2", and two options with one name are one answer.
    const peers = matrixAxis
      ? node.options.filter((o) => (o.MatrixAxis ?? 'Row') === matrixAxis)
      : node.options;
    const label = nextOptionLabel(peers.map((o) => o.Label), matrixAxis ?? 'Option');
    const option = await this.state.addOption(node, label, matrixAxis);
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
    this.selection = clearIfQuestion(this.selection, node.entity.ID);
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
    // Land every coalesced edit before publishing. The snapshot is built from the in-memory tree
    // so it would be correct either way, but a form whose published version contains an edit its
    // own draft rows do not is a genuinely confusing thing to debug later.
    await this.state.flushPendingSaves();
    this.publishStateReady = false;
    const result: PublishResult = await this.publisher.publish(this.tree);
    this.busy = false;
    if (result.success) {
      this.statusMessage = `Published version ${result.versionNumber}.`;
      // The draft IS the published snapshot now; re-read rather than assume, so a publish
      // that transformed anything server-side still leaves the two sides comparable.
      await this.refreshPublishState();
    } else {
      this.statusMessage = result.error ?? 'Publish failed.';
      // A failed publish changed nothing, so the state we already had still holds. Without this
      // the control would sit on "Checking…" forever and the author would have no way to retry.
      this.publishStateReady = true;
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
