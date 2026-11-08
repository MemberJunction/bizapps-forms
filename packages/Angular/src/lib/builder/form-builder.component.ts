import { Component, ElementRef, Injector, ViewChild, afterNextRender, computed, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { NavigationService } from '@memberjunction/ng-shared';
import { FormsModule } from '@angular/forms';
import {
  CdkDropList,
  CdkDropListGroup,
  CdkDrag,
  CdkDragHandle,
  CdkDragPreview,
  moveItemInArray,
  transferArrayItem,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { CompositeKey, LogError, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {
  FormsCloneFormOperation,
  FormsPublishFormOperation,
  quoteSqlString,
} from '@mj-biz-apps/forms-entities';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  mjBizAppsFormsFormScreenEntity,
  mjBizAppsFormsFormStyleEntity,
  FormQuestionType,
  FormRenderMode,
  FormStyleTokens,
  PublishedFormDefinition,
  PublishedFormAutomation,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { BuilderStateService } from './builder-state.service';
import { UndoToastComponent } from './undo-toast.component';
import type { HeldDelete } from './pending-delete';
import { answeredRefusal } from './delete-refusal';
import { DesignStateService } from './design-state.service';
import { readDraftAutomations, readLiveSnapshot } from './publish-baseline';
import { runOperation } from '../shared/remote-operation';
import { onFormsWrite, type FormsWriteSubscription } from '../shared/forms-writes';
import { findTemplateSavedFrom, loadFormRecord } from '../shared/form-catalog';
import { RowActivateDirective } from '../shared/row-activate.directive';
import { QuestionEditorComponent } from './question-editor.component';
import { ScreenEditorComponent } from './screen-editor.component';
import { PageEditorComponent } from './page-editor.component';
import { DistributionManagerComponent } from './distribution-manager.component';
import { DistributionService } from './distribution.service';
import { formReach, type FormReach, type ShareLinkFacts } from './share-state';
import { AutomationTabComponent, type MappableQuestion } from './automation-tab.component';
import { SaveAsTemplateDialogComponent, type SaveAsTemplateRequest } from '../templates/save-as-template-dialog.component';
import {
  templateFingerprint,
  templateControlState,
  type TemplateControlState,
} from '../templates/template-fingerprint';
import { ResponsesTabComponent, type ResponsesTabState } from '../responses/responses-tab.component';
import { DEFAULT_RESPONSE_QUERY } from '../responses/responses-query';
import type { BuilderTab, BuilderView } from '../shared/view-urls';
import { BuilderUrlSync } from './builder-url-sync';
import { BUILDER_TAB_ITEMS, tabAfterKey, tabElementId, tabPanelId } from './builder-tabs';
import { InspectorSheet, SHEET_MEDIA_QUERY } from './inspector-sheet';
import type { ResponseRecordLink } from '../responses/response-models';
import { DesignPanelComponent } from './design-panel.component';
import { FormPreviewModalComponent } from './form-preview-modal.component';
import {
  allQuestions,
  brokenRuleLines,
  brokenRuleRefusal,
  collectRuleEntries,
  conditionSourcesOf,
  endingReachFor,
  endScreensOf,
  jumpReach,
  nextOptionLabel,
  reachNote,
  readHorizon,
  ruleBadgesFor,
  ruleInventoryFormOf,
  SCORE_SOURCE,
  tryBuildPublishedDefinition,
  welcomeScreenOf,
  type ConditionalSourceQuestion,
  type EndingReach,
  type ReachPage,
  type ReachSource,
  type RuleBadge,
  type RuleEntry,
  type RuleInventoryForm,
  unreadableDraftMessage,
} from '@mj-biz-apps/forms-entities/contracts';
import type { FormTree, PageNode, QuestionNode } from './builder-models';
import { defaultEndingId } from './default-ending';
import { resolveInlineEdit } from './inline-edit';
import { QuestionTypePickerComponent } from './question-type-picker.component';
import type { FormSection } from './section-groups';
import {
  QUESTION_PALETTE_GROUPS,
  questionTypeMeta,
  questionTypeColorClass,
  questionTypesInGroup,
  searchQuestionTypes,
  type QuestionPaletteGroup,
  type QuestionTypeMeta,
} from './question-type-catalog';
import { jumpTargetOptions, targetValue, type JumpTargetOption } from './jump-target-options';
import { RuleBadgeComponent } from './rule-badge.component';
import { FORM_BUILDER_STYLES } from './form-builder.styles';
import {
  draftComparand,
  draftDiffers,
  storedSnapshotFingerprint,
  publishControlState,
  type DraftComparand,
  type PublishControlState,
} from './publish-fingerprint';
import {
  damageKeys,
  isValidCrossPageMove,
  isValidReorder,
  newlyBrokenRules,
  noticeStillTrue,
  reorderNoticeText,
  undoReorderMove,
  type ReorderNotice,
  type UndoMove,
} from './reorder';
import {
  NOTHING_SELECTED,
  clearIfPage,
  clearIfQuestion,
  clearIfScreen,
  pageId,
  questionId,
  screenId,
  selectPage as pageSelection,
  selectQuestion as questionSelection,
  selectScreen as screenSelection,
  type BuilderSelection,
} from './builder-selection';
import { targetPageFor, type NewQuestionTarget } from './new-question-target';

/**
 * Which workspace tab is showing.
 *
 * `responses` sits last, after `automate`: the tabs read left to right as the life of a
 * form — build it, style it, distribute it, decide what happens on submit, then read what
 * came back. Collection follows configuration.
 */


/**
 * Stand-in version id used only while fingerprinting.
 *
 * `formVersionId` is excluded from the comparison anyway (it is a fresh GUID per publish),
 * but `buildPublishedDefinition` requires one — a constant keeps the built snapshot itself
 * deterministic rather than relying on the exclusion to hide a value that changes.
 */
const FINGERPRINT_VERSION_ID = 'draft-fingerprint';

/**
 * The draft as a published definition, or `null` when one of its stored rule columns cannot be
 * read (`UnreadableColumnError`).
 *
 * For the builder's PASSIVE readers — the Design tab's sample and the template comparison — which
 * rebuild the snapshot on every change-detection pass. A form carrying a malformed rule (authored
 * outside the builder) must not take the builder down with it, and these readers have no one to
 * tell: `draftProblem` names the column beside the publish control, which `dirty` keeps on screen
 * (the change check carries the reason — see `draftComparand` — rather than reading this null).
 * `null` is what both readers treat as "nothing to show or compare".
 */
function draftDefinition(
  ...args: Parameters<typeof tryBuildPublishedDefinition>
): PublishedFormDefinition | null {
  const built = tryBuildPublishedDefinition(...args);
  return built.ok ? built.definition : null;
}

/** Numbers each builder instance, so its tab and panel ids are unique in the document. */
let builderInstanceSeq = 0;

/**
 * The visual form builder — registered as the override for the
 * `MJ_BizApps_Forms: Forms` entity form so that opening a Form record in Explorer
 * renders the builder instead of the generated property grid (FORMS_BUILD_PLAN §9).
 *
 * Layout (desktop): a left palette of question types, a center canvas listing the
 * questions, and a right properties panel for the selected question. A second tab
 * manages distributions. Publishing is `Forms.PublishForm`: the server snapshots the stored
 * rows into a new FormVersion, so the builder only saves, then asks.
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
    CdkDropListGroup,
    CdkDrag,
    CdkDragHandle,
    CdkDragPreview,
    RowActivateDirective,
    QuestionEditorComponent,
    ScreenEditorComponent,
    PageEditorComponent,
    DistributionManagerComponent,
    DesignPanelComponent,
    FormPreviewModalComponent,
    AutomationTabComponent,
    ResponsesTabComponent,
    SaveAsTemplateDialogComponent,
    RuleBadgeComponent,
    QuestionTypePickerComponent,
    UndoToastComponent,
  ],
  providers: [
    BuilderStateService,
    DesignStateService,
    DistributionService,
  ],
  templateUrl: './form-builder.component.html',
  styles: [FORM_BUILDER_STYLES],
})
export class FormBuilderComponent extends BaseFormComponent {
  declare public record: mjBizAppsFormsFormEntity;

  protected readonly state = inject(BuilderStateService);
  private readonly design = inject(DesignStateService);
  private readonly distributions = inject(DistributionService);

  /** The canvas's own root, so a focus lookup cannot reach outside this builder instance. */
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** afterNextRender is called from an async handler, i.e. outside the injection context. */
  private readonly injector = inject(Injector);

  constructor() {
    super();
    // One save queue for every write the builder makes, the Design tab's included (see
    // `BuilderStateService.save`): flushed before a publish, never running over a structural save.
    this.design.UseSaveQueue((entity) => this.state.save(entity));
  }

  protected readonly paletteGroups = QUESTION_PALETTE_GROUPS;
  protected tree: FormTree | null = null;
  /**
   * What the right-hand pane is showing. ONE value, not a question id beside a screen id: the
   * pane shows a single editor, and two independent fields let it show a screen's properties
   * while a freshly-added question sat highlighted and unreachable on the canvas.
   *
   * Every write goes through the setter because, below 900px, selecting is what opens the
   * Properties sheet and clearing is what closes it (F14). The sheet has to hear about every
   * change — a delete clears the selection too — or it would think it is still open.
   */
  private _selection: BuilderSelection = NOTHING_SELECTED;
  protected get selection(): BuilderSelection {
    return this._selection;
  }
  protected set selection(next: BuilderSelection) {
    const opening = this._selection.kind === 'none' && next.kind !== 'none';
    const closing = this._selection.kind !== 'none' && next.kind === 'none';
    this._selection = next;
    if (opening) this.moveFocusIntoSheet();
    if (closing) this.sheet.Closed();
  }

  private readonly isNarrow = (): boolean =>
    typeof matchMedia === 'function' && matchMedia(SHEET_MEDIA_QUERY).matches;
  private readonly sheet = new InspectorSheet(this.isNarrow);

  /** Escape closes the sheet. At desktop width the pane is a column, and Escape there is not ours. */
  protected onPropertiesEscape(): void {
    if (this.isNarrow() && this.selection.kind !== 'none') this.closeSheet();
  }

  private moveFocusIntoSheet(): void {
    // Width first: it is false wherever there is no window, so `document` is only read in a browser.
    if (!this.isNarrow()) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!this.sheet.Opened(active)) return;
    // The sheet becomes visible on this render; focus can only land on it after.
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('.fb-sheet-done')?.focus(),
      { injector: this.injector },
    );
  }

  /** Done or Escape on the Properties sheet: deselect, and return focus to the card that opened it. */
  protected closeSheet(): void {
    const returnTo = this.sheet.Closed();
    this.selection = NOTHING_SELECTED;
    this.cdr.markForCheck();
    returnTo?.focus();
  }

  /** The sheet's heading: what is being edited. */
  protected get inspectorTitle(): string {
    if (this.selectedScreen) return this.selectedScreen.Title || 'Screen';
    if (this.selectedPage) return this.selectedPage.entity.Title || `Section ${this.selectedPageIndex + 1}`;
    return this.selectedNode?.entity.Prompt || 'Question';
  }

  protected get selectedQuestionId(): string | null {
    return questionId(this.selection);
  }

  protected get selectedScreenId(): string | null {
    return screenId(this.selection);
  }

  protected get selectedPageId(): string | null {
    return pageId(this.selection);
  }

  /** Live palette filter. At 25 types, scanning seven groups is slower than typing. */
  protected paletteQuery = '';
  protected activeTab: BuilderTab = 'build';

  protected readonly tabItems = BUILDER_TAB_ITEMS;
  /** Prefix for the tab and panel ids: Explorer can hold several builders open at once. */
  private readonly tabScope = `fb${++builderInstanceSeq}`;
  protected tabId(tab: BuilderTab): string {
    return tabElementId(this.tabScope, tab);
  }
  protected panelId(tab: BuilderTab): string {
    return tabPanelId(this.tabScope, tab);
  }

  /**
   * The Responses tab's table and open response: what it starts on when it mounts, and the last
   * state it reported, so switching tabs and back — or a reload — lands where the author was.
   */
  protected responsesState: ResponsesTabState = { query: DEFAULT_RESPONSE_QUERY, responseId: null };
  @ViewChild(ResponsesTabComponent) private responsesTab?: ResponsesTabComponent;

  private readonly location = inject(Location);
  private readonly navigation = inject(NavigationService);
  /** Keeps the tab and the Responses view in the URL (UI audit F09); see `builder-url-sync.ts`. */
  private urlSync: BuilderUrlSync | null = null;
  protected busy = false;
  protected statusMessage = '';

  /**
   * The rules the last publish was refused over, or null when no refusal is standing.
   *
   * `statusMessage` alone cannot answer this. Most of what lands there is a fact that stays true
   * — "Published version 4." is history — but a broken-rule refusal is a claim about the form as
   * it is right now, and the author's next act is usually to falsify it. Keeping the rules it
   * named is what lets the retraction fire for THAT message and leave the others alone.
   */
  private refusedRules: readonly string[] | null = null;

  /** Whether the "Save as template" dialog is up. */
  protected templateDialogOpen = false;
  /** The template saved from this form, if one still exists. */
  protected savedTemplateId: string | null = null;
  /** Its name, for the tooltip that explains what the form has drifted away from. */
  protected savedTemplateName: string | null = null;
  /** Content fingerprint of that template; null when there is none to compare against. */
  private savedTemplateFingerprint: string | null = null;
  /** Any problem with the save the dialog needs to show (a name already in use). */
  protected templateDialogError: string | null = null;
  /** MJGlobal subscription behind {@link watchForTemplateChanges}; released on destroy. */
  private templateChanges?: FormsWriteSubscription;

  /**
   * Whether to offer saving, confirm one exists, or offer again because the form has changed.
   *
   * Derived on every read from the two fingerprints, never latched — see
   * `template-fingerprint.ts` for why the latch version was wrong in both directions.
   */
  protected get templateState(): TemplateControlState {
    return templateControlState({
      savedFingerprint: this.savedTemplateFingerprint,
      draftFingerprint: this.templateDraftFingerprint,
    });
  }

  /** This form's own content fingerprint, in the same terms the template was measured in. */
  private get templateDraftFingerprint(): string | null {
    const draft = this.tree
      ? draftDefinition(this.tree, this.appliedStyle, FINGERPRINT_VERSION_ID, [])
      : null;
    return draft ? templateFingerprint(draft) : null;
  }

  /**
   * Fingerprint of the snapshot currently on the public link; null when never published.
   * Refreshed on load and after a successful publish.
   */
  private publishedFingerprint: string | null = null;

  /**
   * The draft as it stands — its fingerprint, or the stored column that stops it building.
   * Recomputed after every edit; null only while no tree is loaded.
   */
  private draft: DraftComparand | null = null;

  /**
   * The form's authored automations, as the published snapshot would carry them.
   *
   * Cached so {@link markDirty} stays synchronous, and refreshed from the announced writes of the
   * Automate tab's operations (`shared/forms-writes.ts`) rather than from a callback the tab has
   * to remember to fire: every step verb goes through `runOperation`, which announces it, so a new
   * verb cannot forget to.
   */
  private draftAutomations: readonly PublishedFormAutomation[] = [];

  /**
   * The automation read failed, so we cannot say whether the draft matches what is published.
   *
   * Deliberately NOT the same as "no automations". Treating a failed read as an empty list would
   * make a form with automations report identical to its published snapshot and hide the publish
   * control — the exact failure `publishControlState` documents for a failed baseline read. This
   * routes through the same safe direction: no provable baseline, so offer Publish.
   */
  private automationsUnknown = false;

  /** MJGlobal subscription behind {@link watchForAutomationChanges}; released on destroy. */
  private automationChanges?: FormsWriteSubscription;

  /**
   * Operations this builder is running itself, which it follows up on itself — counted so
   * {@link watchForFormOperations} does not re-read for them as well (the announcement is raised
   * synchronously inside the operation's call, while this count is up).
   */
  private ownOperations = 0;
  /** Subscription behind {@link watchForFormOperations}; released on destroy. */
  private formOperations?: FormsWriteSubscription;
  /** MJGlobal subscription behind {@link watchForDistributionChanges}; released on destroy. */
  private distributionChanges?: FormsWriteSubscription;

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
    return draftDiffers(this.publishedFingerprint, this.draft);
  }

  /**
   * Why the draft cannot be published as it stands, or null when it can be.
   *
   * Shown beside the publish control for as long as it is true, because nothing else may say it: a
   * `ValidationRule` or `Settings` column the schema rejects has no canvas badge, and the passive
   * readers (Design sample, template state) just stand down. `dirty` keeps Update on screen for the
   * same draft, so pressing it produces the refusal this sentence previews.
   */
  protected get draftProblem(): string | null {
    return this.draft?.kind === 'unreadable' ? unreadableDraftMessage('publish', this.draft) : null;
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

  /**
   * True while the builder holds a new, never-saved Form record and is waiting for the author to
   * create it (the start step in the template). Nothing is written before that: Explorer restores
   * a pinned "New Forms Record" tab on its own, and a builder that saved on load created an
   * "Untitled form" row nobody asked for.
   */
  protected awaitingCreate = false;
  /** Why the start step's create was refused, in the author's words; null when it was not. */
  protected createError: string | null = null;

  /**
   * This form's share links, or `null` while unread or unreadable.
   *
   * Null is the honest starting value AND the honest failure value, and it has to be both:
   * seeding `[]` would have the header announce "not shared" for the moment before the read
   * lands, and go on announcing it forever if the read failed.
   */
  private shareLinks: ShareLinkFacts[] | null = null;

  /**
   * What the Published chip is entitled to say about this form being reachable.
   *
   * Publishing writes a `FormVersion`. It does not write a `FormDistribution`, and without
   * one of those there is no URL — so the chip used to congratulate an author on a public
   * link that did not exist, with the Distribute tab one click away still offering to create
   * the first one (issue #83). Derived on read, from `now`, so a link that reaches its
   * closing date or its response cap while the builder sits open stops counting.
   */
  protected get publishReach(): FormReach {
    return formReach(this.shareLinks, new Date());
  }

  protected get publishState(): PublishControlState {
    return publishControlState({
      dirty: this.dirty,
      // An unreadable automation list is an unusable baseline: we cannot prove the draft matches
      // what is live, so the control must stay available rather than claim "Published".
      hasPublishedBaseline: this.publishedFingerprint !== null && !this.automationsUnknown,
      status: this.record.Status,
    });
  }

  /**
   * Recompute the draft fingerprint and refresh the view.
   *
   * Called wherever the old `markDirty()` was — same frequency, but it re-derives the answer
   * instead of latching it, so an edit that restores the published state reports clean.
   */
  private markDirty(): void {
    this.retireStaleNotice();
    this.retireStaleRefusal();
    this.draft = this.tree
      ? draftComparand(
          tryBuildPublishedDefinition(
            this.tree,
            this.appliedStyle,
            FINGERPRINT_VERSION_ID,
            this.draftAutomations,
          ),
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
      ? draftDefinition(this.tree, this.appliedStyle, FINGERPRINT_VERSION_ID, [])
      : null;
  }

  /** Read the live snapshot and the current draft, so `dirty` has both sides to compare. */
  private async refreshPublishState(): Promise<void> {
    this.appliedStyle = this.record.StyleID
      ? ((await this.design.loadStyleById(this.record.StyleID)) ?? undefined)
      : undefined;
    this.publishedFingerprint = storedSnapshotFingerprint(
      await readLiveSnapshot(new RunView(), this.record.ID),
      this.record.ID,
    );
    await this.refreshDraftAutomations();
    this.publishStateReady = true;
    this.markDirty();
  }

  override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    await this.loadBuilder();
  }

  private async loadBuilder(): Promise<void> {
    // A Form opened via the "new record" flow is not persisted yet, and the builder is
    // immediate-persist: every page and question it writes needs the Form row (FK_FormPage_Form).
    // So a new record waits on the start step until the author creates it — see `createForm`.
    if (!this.record.IsSaved) {
      this.awaitingCreate = true;
      this.cdr.markForCheck();
      return;
    }
    this.busy = true;
    try {
      // A held delete is not in the database yet; re-reading first would bring the item back.
      await this.state.releaseHeldDelete();
      this.tree = await this.state.loadTree(this.record);
    } catch (err) {
      // Stop HERE. An empty tree is what tells the builder to create "Page 1", so carrying on over
      // a failed read would write a page into a form that already has them.
      const reason = err instanceof Error ? err.message : String(err);
      LogError(`Forms builder could not load form ${this.record.ID}: ${reason}`);
      this.statusMessage = `This form could not be loaded. ${reason}`;
      this.busy = false;
      this.cdr.markForCheck();
      return;
    }
    if (this.tree.pages.length === 0) {
      const page = await this.state.addPage(this.tree, 'Page 1');
      if (page) {
        this.tree.pages.push(page);
      }
    }
    await this.refreshPublishState();
    await this.refreshShareLinks();
    await this.refreshSavedTemplate(this.record.ID);
    this.watchForTemplateChanges();
    this.watchForAutomationChanges();
    this.watchForDistributionChanges();
    this.watchForFormOperations();
    this.followUrl();
    this.busy = false;
    this.announceReady();
  }

  /** Open on the view the URL names, and follow back / forward from here on. */
  private followUrl(): void {
    this.urlSync?.Stop();
    this.urlSync = new BuilderUrlSync(this.record.ID, {
      path: () => this.location.path(),
      onUrlChange: (fn) => this.location.onUrlChange((url) => fn(url)),
      writeActiveTab: (params) => this.navigation.UpdateActiveTabQueryParams(params),
    });
    const view = this.urlSync.Read();
    if (view) {
      this.showView(view);
    }
    this.urlSync.Watch((next) => this.showView(next));
  }

  /** Show a view the URL named; nothing is written back. */
  private showView(view: BuilderView): void {
    this.activeTab = view.view;
    this.responsesState = view.responses;
    // A Responses tab already on screen moves in place; one not yet mounted starts from the state.
    void this.responsesTab?.ApplyState(view.responses);
    this.cdr.markForCheck();
    this.revealActiveTab();
  }

  /**
   * On a phone the strip scrolls, so a link straight to Responses would select a tab that sits
   * past the edge. A click or an arrow key already brings its tab into view; a URL does not.
   */
  private revealActiveTab(): void {
    afterNextRender(
      () => this.host.nativeElement
        .querySelector<HTMLElement>(`#${this.tabId(this.activeTab)}`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
      { injector: this.injector },
    );
  }

  /** The Responses tab moved to another page, sort, search or response. */
  protected onResponsesState(state: ResponsesTabState): void {
    this.responsesState = state;
    this.writeUrl();
  }

  private writeUrl(): void {
    this.urlSync?.Write({ view: this.activeTab, responses: this.responsesState });
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
   * The start step's one action: write the new Form row with the name the author typed, then load
   * the builder over it. A blank name becomes "Untitled form" (`Name` is the only required column
   * without a database default). A refused save keeps the author on the start step with the reason.
   */
  protected async createForm(name: string): Promise<void> {
    if (!this.awaitingCreate || this.busy) {
      return;
    }
    this.busy = true;
    this.createError = null;
    this.record.Name = name.trim() || 'Untitled form';
    const saved = await this.state.save(this.record);
    this.busy = false;
    const failure = this.state.lastFailure();
    // The start step says why itself; left in the service, the reason would reappear as the
    // builder's banner once a retried create succeeds.
    this.state.dismissFailure();
    if (!saved) {
      LogError(`Forms builder could not create the new form "${this.record.Name}": ${failure ?? 'no reason given'}`);
      this.createError = `This form could not be created: ${createRefusalReason(failure)}`;
      this.cdr.markForCheck();
      return;
    }
    this.awaitingCreate = false;
    await this.loadBuilder();
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
    const target = targetPageFor(this.selection, this.pages);
    if (!target) {
      return;
    }
    this.busy = true;
    const node = await this.state.addQuestion(this.tree, target.page, type, this.defaultPrompt(type));
    if (node) {
      // Selecting the new question is what clears any screen selection. The author asked for a
      // question; the pane has to show them the question they just got.
      this.selection = questionSelection(node.entity.ID);
      this.markDirty();
    }
    this.busy = false;
    this.cdr.markForCheck();
  }

  // -- inserting between two questions (the gutter +) -----------------------

  /**
   * The seam whose popover is open — a page and the index the new question would take — or null.
   *
   * An INDEX and not a neighbouring question id, because the seam at the end of a section has no
   * question below it and every scheme that keyed on a neighbour needed a special case for it.
   * The window between opening the popover and picking a type is a single click with nothing
   * else clickable in it, so the index cannot go stale underneath itself.
   */
  protected pickerSeam: { pageId: string; index: number } | null = null;

  protected isPickerOpen(page: PageNode, index: number): boolean {
    return this.pickerSeam?.pageId === page.entity.ID && this.pickerSeam.index === index;
  }

  /**
   * True when the canvas should offer "add content above" on this question: it is selected and it
   * is the first in its section. Seam 0 of a non-empty section is the one seam no "after this
   * question" bar can reach. Above any other question is the seam the bar under its predecessor
   * already opens, and offering it twice would render one seam's picker in two places.
   */
  protected offersInsertAbove(page: PageNode, node: QuestionNode): boolean {
    return node.entity.ID === this.selectedQuestionId && page.questions[0] === node;
  }

  protected openTypePicker(page: PageNode, index: number): void {
    this.pickerSeam = { pageId: page.entity.ID, index };
    this.cdr.markForCheck();
  }

  protected closeTypePicker(): void {
    this.pickerSeam = null;
    this.cdr.markForCheck();
  }

  /**
   * Put a new question at the seam the author clicked.
   *
   * `state.addQuestion` creates it AT the seam — the new row and the renumbering of every question
   * below it are one save, so an insert cannot leave two questions sharing a `DisplayOrder` — and
   * puts the saved node into the page itself, at the seam as it stands when the save runs. Nothing
   * here writes `DisplayOrder` or splices the page.
   *
   * WHY THE DAMAGE DIFF IS HERE. `reorderQuestion` says it is the only path that can invert a
   * pair of surviving questions, and that if insert-at-index ever shipped "that proof lapses and
   * the diff has to wrap the new write too". The proof does not actually lapse — an insert
   * preserves every existing pair's relative order, and the new question is born with no rule and
   * referenced by none — but the same file also learned that reasoning about rule damage in prose
   * is how two surfaces come to disagree about one rule. So the insert runs the diff, and
   * `insert-question.spec.ts` asserts it comes back empty. If some future change makes it
   * non-empty, the author is told in the same band a costly drag uses, rather than not at all.
   */
  protected async insertQuestionAt(type: FormQuestionType): Promise<void> {
    const seam = this.pickerSeam;
    const page = seam ? this.pages.find((p) => p.entity.ID === seam.pageId) : undefined;
    this.closeTypePicker();
    if (!this.tree || !page || !seam || this.busy) {
      return;
    }

    this.busy = true;
    try {
      const before = this.ruleEntries;
      // Clamped, not trusted: the seam index was read when the popover opened.
      const at = Math.min(seam.index, page.questions.length);
      // One save creates the question at the seam AND renumbers everything below it; the service
      // puts the node into the page itself once it is saved.
      const node = await this.state.addQuestion(this.tree, page, type, this.defaultPrompt(type), at);
      if (!node) {
        return;
      }
      this.noteAnyDamage(before, node.entity.ID, node.entity.Prompt, page);
      this.selection = questionSelection(node.entity.ID);
      this.markDirty();
      this.focusQuestionCard(node.entity.ID);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Put focus on the question the insert just created.
   *
   * WHY THE CANVAS AND NOT THE PICKER. `QuestionTypePickerComponent` captures whatever had focus
   * when it opened and restores it in `ngOnDestroy`, which is right for a DISMISSAL — Escape, the
   * backdrop and the close button all land back on the opener, because an empty section stays
   * empty and the button survives. It cannot be right for an INSERT: every insert path removes its
   * own opener. The empty state unmounts once `page.questions.length === 0` stops holding, and a
   * per-question bar unmounts once selection moves to the new question. `focus()` on a detached
   * node is a silent no-op, so focus fell to `<body>` and a keyboard author restarted from the top
   * of the page. Measured on BOTH openers before this was called a defect, so it is not something
   * the empty-state control introduced; the picker stays opener-independent and is not touched.
   *
   * The card's title button is the right destination rather than a re-created opener: the insert
   * has already selected the card, and it is what the author came here to edit. The button, not
   * the card: since UI audit F05 the card is not a tab stop, and `focus()` on it did nothing.
   *
   * Keyed on the question id rather than on `.is-selected`, so the focus target does not depend on
   * a class that exists to paint something — and `afterNextRender` because the card does not exist
   * yet when this is called; querying for it synchronously would find nothing and fail exactly as
   * silently as the bug it replaces.
   */
  private focusQuestionCard(questionId: string): void {
    afterNextRender(
      () => {
        this.host.nativeElement
          .querySelector<HTMLElement>(`.fb-q[data-question-id="${questionId}"] button.fb-q-label`)
          ?.focus();
      },
      { injector: this.injector },
    );
  }

  /**
   * Raise the same band a costly drag raises, if this write cost anything.
   *
   * `wasBefore` is null because an insert's Undo is a delete, not a move, and offering "Undo" on
   * a band that would delete a question the author just created is a worse affordance than the
   * trash button already on the card.
   */
  private noteAnyDamage(before: readonly RuleEntry[], id: string, label: string, page: PageNode): void {
    const broken = newlyBrokenRules(before, this.ruleEntries);
    if (broken.length === 0) {
      return;
    }
    const labels = this.itemLabels;
    this.reorderNotice = {
      text: reorderNoticeText({ id, label }, broken, (other) => labels.get(other) ?? 'another question'),
      // An insert lands on the page the author clicked; it has not come from anywhere else.
      fromPageId: page.entity.ID,
      questionId: id,
      wasBefore: null,
      damage: damageKeys(broken),
    };
  }

  private defaultPrompt(type: FormQuestionType): string {
    return type === 'Statement' ? 'Add your statement text here' : `Untitled ${questionTypeMeta(type).label} question`;
  }

  // -- canvas / selection ---------------------------------------------------

  protected get pages(): PageNode[] {
    return this.tree?.pages ?? [];
  }

  /**
   * The section a palette click would write to, and what its header should say about it.
   *
   * Read ONCE per change-detection pass through the template's `@let`, not once per header: the
   * answer is the same for every section, and the header that matches is the one that announces
   * it. Null on a form with no sections, where a palette click does nothing.
   */
  protected get addingHere(): NewQuestionTarget | null {
    return targetPageFor(this.selection, this.pages);
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
   * rendering a title and description per section — with no way for an author to CREATE one, so
   * this button is the only thing that brings a second page into existence. The gap hid itself:
   * the page header does not render below two pages, so an author who never got a second page
   * never saw the page controls at all and had no way to discover they existed.
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
   * It used to ask through the browser's OK/Cancel box, because the header gives no hint of how
   * many questions go down with it. It is held for Undo like every other delete instead (UI audit
   * F07), and the toast says how many questions went with it. The last page is never deletable —
   * a form with no page has nowhere to put a question, and the builder would immediately recreate
   * one underneath the author.
   */
  protected async deletePage(page: PageNode): Promise<void> {
    const tree = this.tree;
    if (!tree || this.busy || tree.pages.length <= 1 || this.checkingDelete) {
      return;
    }
    const sectionName = `Section ${tree.pages.indexOf(page) + 1}`;
    if (!(await this.deletable({ kind: 'section', name: sectionName }, page.questions.map((q) => q.entity.ID)))) {
      return;
    }
    const count = page.questions.length;
    const with_ = count === 0 ? '' : count === 1 ? ' and its question' : ` and its ${count} questions`;
    await this.holdDelete(`${sectionName.toLowerCase()}${with_}`, () => {
      const index = tree.pages.indexOf(page);
      if (index < 0 || tree.pages.length <= 1) {
        return null;
      }
      tree.pages = tree.pages.filter((p) => p !== page);
      this.selection = clearIfPage(this.selection, page.entity.ID);
      for (const q of page.questions) {
        this.selection = clearIfQuestion(this.selection, q.entity.ID);
      }
      return {
        restore: () => {
          tree.pages = reinsert(tree.pages, index, page);
        },
        commit: () => this.state.deletePage(tree, page),
      };
    });
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

  // -- page selection (RULES_AND_BRANCHING_PLAN B2) ---------------------------

  protected get selectedPage(): PageNode | null {
    if (!this.tree || !this.selectedPageId) {
      return null;
    }
    return this.tree.pages.find((p) => p.entity.ID === this.selectedPageId) ?? null;
  }

  /** 0-based position of the selected page, or -1. */
  protected get selectedPageIndex(): number {
    if (!this.tree || !this.selectedPageId) {
      return -1;
    }
    return this.tree.pages.findIndex((p) => p.entity.ID === this.selectedPageId);
  }

  protected selectPage(page: PageNode): void {
    this.selection = pageSelection(page.entity.ID);
    this.cdr.markForCheck();
  }

  /**
   * The sources a rule whose read horizon is `horizon` may reference.
   *
   * Slices the FULL question list and filters afterwards, never the other way round.
   * `conditionSourcesOf` drops a question that collects no answer, so slicing an already-filtered
   * list would shift every horizon on any form carrying a `Statement` — silently, and in the
   * direction that makes a legal rule look broken.
   */
  private sourcesUpTo(horizon: number): ConditionalSourceQuestion[] {
    return conditionSourcesOf(this.questionsInFlowOrder.slice(0, horizon + 1));
  }

  /**
   * The form's sections, as the rule pickers need them: what to call each one, and what it owns.
   *
   * Derived HERE and handed down, because the builder is the only thing that has the form. Each
   * editor deriving its own would be three chances to disagree about a section's name or its
   * contents, and the pickers are read side by side.
   *
   * The label falls back the same way the canvas does, so a section with no title is called the
   * same thing in the menu as it is on screen.
   *
   * NOT named `sections`: `BaseFormComponent` already declares a property by that name, and an
   * accessor may not override a property (TS2611). Only the Angular compile catches that.
   */
  protected get formSections(): FormSection[] {
    if (!this.tree) {
      return [];
    }
    return this.tree.pages.map((page, index) => ({
      id: page.entity.ID,
      label: page.entity.Title || `Page ${index + 1}`,
      questionIds: page.questions.map((q) => q.entity.ID),
    }));
  }

  /** Every question on the form, in page-then-display order — what both source lists read. */
  private get questionsInFlowOrder(): QuestionNode[] {
    return this.tree ? allQuestions(this.tree) : [];
  }

  /**
   * Conditional sources for a PAGE: questions on pages strictly BEFORE it.
   *
   * Not "questions before this one" (a question's rule) and not "everything" (an ending's):
   * a page rule referencing its own questions would hide the page out from under a respondent
   * mid-fill — the widget re-evaluates visibility on every answer — so the page's own
   * questions are never offered.
   */
  protected get pageConditionalSources(): ConditionalSourceQuestion[] {
    const page = this.selectedPage;
    if (!page) {
      return [];
    }
    return this.sourcesUpTo(readHorizon(this.reachPages, { kind: 'page', id: page.entity.ID }, 'show'));
  }

  protected onPageChanged(page: PageNode): void {
    this.state.saveDebounced(page.entity);
    this.markDirty();
    this.cdr.markForCheck();
  }

  /**
   * Sources for the selected page's JUMP conditions: earlier pages AND the page's own
   * questions — leaving a page is decided by what was just answered on it, which is exactly
   * what the show rule must NOT read (see {@link pageConditionalSources}).
   */
  protected get pageJumpConditionSources(): ConditionalSourceQuestion[] {
    const page = this.selectedPage;
    if (!page) {
      return [];
    }
    return this.sourcesUpTo(readHorizon(this.reachPages, { kind: 'page', id: page.entity.ID }, 'jump'));
  }

  /**
   * Every destination a jump could name, ANYWHERE on the form — not filtered by where the rule
   * sits, which is what makes it useful.
   *
   * The pickers above are forward-only, mirroring the resolver. That is right for AUTHORING and
   * wrong for NAMING: a reorder can put a target behind its rule, and it then drops out of the
   * offered list while sitting one row up the canvas, so the rail read "(a question that no
   * longer exists)" about something plainly there. The difference between this list and the
   * offered one is exactly "exists, but not from here" — see `storedTargetLabel`.
   *
   * Same shape as {@link formSources}, which answers the identical question about a rule's
   * SOURCES, and for the same reason.
   */
  protected get formTargets(): JumpTargetOption[] {
    const tree = this.tree;
    if (!tree) {
      return [];
    }
    return jumpTargetOptions(
      tree.pages.flatMap((page) =>
        page.questions.map((q) => ({ id: q.entity.ID, label: q.entity.Prompt })),
      ),
      tree.pages.map((page, index) => ({
        id: page.entity.ID,
        label: page.entity.Title || `Page ${index + 1}`,
      })),
      this.endingDestinations,
    );
  }

  /**
   * Where the SELECTED PAGE's rules may send a respondent — forward only.
   *
   * Forward-only mirrors the resolver, which treats a backward or self target as inert. Offering
   * one would let an author write a rule that silently never fires, which is worse than not
   * offering it: the rule reads correctly and does nothing.
   */
  protected get pageJumpTargets(): JumpTargetOption[] {
    const index = this.selectedPageIndex;
    if (!this.tree || index < 0) {
      return [];
    }
    const later = this.tree.pages.slice(index + 1);
    return jumpTargetOptions(
      // Questions on later pages. A page's own questions are NOT offered: "after this page, go
      // to a question on this page" is backward or sideways, and the resolver ignores it.
      later.flatMap((page) => page.questions.map((q) => ({ id: q.entity.ID, label: q.entity.Prompt }))),
      later.map((page, offset) => ({
        id: page.entity.ID,
        label: page.entity.Title || `Page ${index + 2 + offset}`,
      })),
      this.endingDestinations,
    );
  }

  /**
   * Where the SELECTED QUESTION's rules may send a respondent — everything after it, in flow
   * order, plus every ending screen and Submit.
   */
  protected get questionJumpTargets(): JumpTargetOption[] {
    if (!this.tree || !this.selectedQuestionId) {
      return [];
    }
    const laterQuestions: Array<{ id: string; label: string }> = [];
    const laterPages: Array<{ id: string; label: string }> = [];
    let seen = false;
    this.tree.pages.forEach((page, index) => {
      if (seen) {
        laterPages.push({ id: page.entity.ID, label: page.entity.Title || `Page ${index + 1}` });
      }
      for (const q of page.questions) {
        if (q.entity.ID === this.selectedQuestionId) {
          seen = true;
          continue;
        }
        if (seen) {
          laterQuestions.push({ id: q.entity.ID, label: q.entity.Prompt });
        }
      }
    });
    return jumpTargetOptions(laterQuestions, laterPages, this.endingDestinations);
  }

  /** What each destination the SELECTED PAGE may jump to would skip. */
  protected get pageReachNotes(): ReadonlyMap<string, string> {
    const page = this.selectedPage;
    return page ? this.reachNotesFor({ kind: 'page', id: page.entity.ID }, this.pageJumpTargets) : new Map();
  }

  /** What each destination the SELECTED QUESTION may jump to would skip. */
  protected get questionReachNotes(): ReadonlyMap<string, string> {
    const id = this.selectedQuestionId;
    return id ? this.reachNotesFor({ kind: 'question', id }, this.questionJumpTargets) : new Map();
  }

  /**
   * One note per offered destination, keyed by its `<option>` value.
   *
   * Computed here because reach is a fact about the whole FORM — which questions lie between two
   * items — and the dialog is handed one item's rules. Keyed by option value rather than by
   * target object so the dialog can look one up from the select it already renders, with no
   * second opinion about how a target is encoded.
   */
  private reachNotesFor(
    source: ReachSource,
    targets: readonly JumpTargetOption[],
  ): ReadonlyMap<string, string> {
    const notes = new Map<string, string>();
    for (const target of targets) {
      const note = reachNote(jumpReach(this.reachPages, source, target.target));
      if (note.length > 0) {
        notes.set(targetValue(target.target), note);
      }
    }
    return notes;
  }

  /**
   * The form as `jump-reach.ts` reads it: ids and required flags, in flow order.
   *
   * Both reach notes and every source list read it now, so the projection is written once. It is
   * also the ONE place the ordering rule enters the builder — `readHorizon` and `jumpReach` are
   * the only two things that interpret it, and they agree because they share this walk.
   */
  private get reachPages(): ReachPage[] {
    return (this.tree?.pages ?? []).map((page) => ({
      id: page.entity.ID,
      questions: page.questions.map((q) => ({ id: q.entity.ID, isRequired: q.entity.IsRequired === true })),
    }));
  }

  /**
   * Every answerable question on the form, in flow order — the WHOLE list, not one rule's legal
   * prefix.
   *
   * Two readers, and they need the same list for related reasons. The rule inventory resolves
   * prompts against it, because a rule pointing at a question it should not have been able to
   * reach is still a rule that reads. The condition editor differences it against the offered
   * sources to tell "this question was deleted" from "this question is answered after your rule
   * runs" — see `staleSourceLabel`.
   *
   * Literally the list `ruleInventoryFormOf` puts in `sources`, from the same function. Two
   * walks would be two answers to "which questions can a rule read", and the editor differences
   * one against a list the badges resolve through the other.
   */
  protected get formSources(): ConditionalSourceQuestion[] {
    return conditionSourcesOf(this.questionsInFlowOrder);
  }

  /** Every ending screen, as a jump destination. */
  private get endingDestinations(): Array<{ id: string; label: string }> {
    return this.endScreens.map((screen) => ({ id: screen.ID, label: screen.Title || 'Ending screen' }));
  }

  /**
   * Sources the SELECTED QUESTION's jump conditions may read — every question up to and
   * INCLUDING itself.
   *
   * Its own answer is the whole point: "if this answer is X, go to Y". That is exactly what its
   * SHOW rule must not read, which is why {@link conditionalSources} stops one question earlier.
   */
  protected get questionJumpSources(): ConditionalSourceQuestion[] {
    const id = this.selectedQuestionId;
    if (!this.tree || !id) {
      return [];
    }
    return this.sourcesUpTo(readHorizon(this.reachPages, { kind: 'question', id }, 'jump'));
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
    const tree = this.tree;
    if (!tree || this.busy) {
      return;
    }
    // Off screen, held for Undo (F07). The service still promotes a survivor to default ending
    // when the delete is written — an invariant no caller should be able to forget.
    const label = screen.ScreenType === 'Welcome' ? 'the welcome screen' : `ending “${screen.Title || 'Untitled'}”`;
    await this.holdDelete(label, () => {
      const index = tree.screens.indexOf(screen);
      if (index < 0) {
        return null;
      }
      tree.screens = tree.screens.filter((s) => s !== screen);
      this.selection = clearIfScreen(this.selection, screen.ID);
      return {
        restore: () => {
          tree.screens = reinsert(tree.screens, index, screen);
        },
        commit: () => this.state.deleteScreen(tree, screen),
      };
    });
  }

  /**
   * Move the form's default ending to the screen the editor named.
   *
   * Awaited and NOT debounced, unlike every other screen edit here: this is two writes to two
   * records whose order the database enforces, so `setDefaultEnding` owns the sequencing. See
   * its own header for what goes wrong when the two land the other way round.
   */
  protected async onMakeDefaultEnding(screen: mjBizAppsFormsFormScreenEntity): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    this.busy = true;
    // try/finally, unlike its neighbours: `setDefaultEnding` is the one call here that can
    // THROW rather than return false — it refuses an id naming no eligible ending. Without
    // this, that refusal would leave `busy` true forever and every guarded handler in the
    // builder would stop responding, with nothing on screen to connect it to this.
    try {
      if (await this.state.setDefaultEnding(this.tree, screen.ID)) {
        this.markDirty();
      }
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * The ending everyone who finishes lands on, by name — what the logic dialog states.
   *
   * Resolved through `defaultEndingId`, which excludes screened-out endings for the same reason
   * `resolveEndingScreen` does: nobody reaches a disqualification screen by finishing. So null
   * here means "nothing catches finishers", whether that is because the form has no endings or
   * because every ending is screened out — one answer for two states the dialog must not
   * describe differently.
   */
  protected get defaultEndingLabel(): string | null {
    const id = this.tree ? defaultEndingId(this.tree.screens) : null;
    if (id === null) {
      return null;
    }
    const screen = this.endScreens.find((s) => s.ID === id);
    return screen ? screen.Title || 'Ending screen' : null;
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
    return [
      ...this.formSources,
      // Endings may also band on the running score (C4) — "score > 70 → pass screen". Only
      // endings get this: mid-form rules reading a mid-form score would be circular.
      SCORE_SOURCE,
    ];
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
    const id = this.selectedQuestionId;
    if (!this.tree || !id) {
      return [];
    }
    return this.sourcesUpTo(readHorizon(this.reachPages, { kind: 'question', id }, 'show'));
  }

  // -- rule badges on the canvas (RULES_SIMPLIFICATION_PLAN Phase 3) ---------

  /**
   * The badges each item on the canvas wears, keyed by item id — see `rules-inventory.ts`.
   *
   * Read ONCE per render, through `@let` at the top of the canvas, and indexed per item from
   * there. A getter called per question would walk the whole form once per question, which on a
   * form long enough to need a rule hub is exactly the form that can least afford it.
   *
   * Recomputed per read rather than cached: rules change from the panel beside the canvas, from
   * the item's own delete, and from a question being dragged to another page, so a cache would
   * need invalidating from every one of those write paths. The form's rules number in the tens.
   */
  protected get ruleBadges(): Map<string, RuleBadge[]> {
    return ruleBadgesFor(this.ruleEntries);
  }

  /**
   * How each ending screen is reached, keyed by id — see `endingReachFor`.
   *
   * Read once per render through `@let`, for the same reason {@link ruleBadges} is: it walks
   * every rule on the form to find out which endings they point at.
   */
  protected get endingReach(): Map<string, EndingReach> {
    return this.tree ? endingReachFor(this.ruleInventoryForm) : new Map<string, EndingReach>();
  }

  /** Every rule on the form as a sentence — see `rules-inventory.ts` for why this exists. */
  private get ruleEntries(): RuleEntry[] {
    return this.tree ? collectRuleEntries(this.ruleInventoryForm) : [];
  }

  /**
   * The whole form as the inventory reads it.
   *
   * One shape, several readers — the sentences on the canvas, the reach line on each ending, the
   * reorder notice, and the publish gate. They have to be built from the same walk: the badges
   * say a rule is broken and the reach line says whether anyone arrives, and a row showing two
   * answers assembled from two different views of the form is a row that can contradict itself.
   *
   * The projection itself is `ruleInventoryFormOf` in `rules-inventory.ts` rather than code here,
   * because publish reads it too and it must be the same one — see issue #79. This getter is only
   * the component's null-tree guard.
   */
  private get ruleInventoryForm(): RuleInventoryForm {
    return this.tree ? ruleInventoryFormOf(this.tree) : { sources: [], pages: [], endings: [] };
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

  /** The `mjf-viz-*` class carrying this type's group colour. */
  protected colorClassFor(type: FormQuestionType): string {
    return questionTypeColorClass(type);
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

  /**
   * Persist an option's own edit.
   *
   * `FormQuestionOption` is already a `SaveableEntity`, so this gets the same coalescing, checked
   * save and failure banner every other builder write goes through — the option simply never
   * reached it before.
   */
  protected onOptionChanged(option: mjBizAppsFormsFormQuestionOptionEntity): void {
    this.state.saveDebounced(option);
    this.markDirty();
  }

  /**
   * The option verbs and the question delete hold `busy` like every other structural handler, so a
   * second click cannot queue an edit computed from a page the first is about to change. (The
   * service also reads the page when each save RUNS, so even a queued pair stays consistent.)
   */
  protected async onAddOption(event: { node: QuestionNode; matrixAxis?: 'Row' | 'Column' }): Promise<void> {
    if (this.busy || !this.tree) {
      return;
    }
    const { node, matrixAxis } = event;
    // Number within the AXIS, not within the whole option list: a matrix whose second column
    // was labelled "Option 4" because two rows came first is just confusing.
    // Named from the labels that EXIST, not from how many there are: a list that had lost
    // "Option 1" used to mint a second "Option 2", and two options with one name are one answer.
    const peers = matrixAxis
      ? node.options.filter((o) => (o.MatrixAxis ?? 'Row') === matrixAxis)
      : node.options;
    const label = nextOptionLabel(peers.map((o) => o.Label), matrixAxis ?? 'Option');
    await this.whileBusy(async () => {
      // The service puts the saved option into `node.options` itself.
      if (this.tree && (await this.state.addOption(this.tree, node, label, matrixAxis))) {
        this.markDirty();
      }
    });
  }

  protected async onRemoveOption(event: { node: QuestionNode; optionIndex: number }): Promise<void> {
    const { node, optionIndex } = event;
    const option = node.options[optionIndex];
    const tree = this.tree;
    if (this.busy || !tree || !option) {
      return;
    }
    // Off the question, held for Undo (F07); the written delete closes the order gap.
    await this.holdDelete(`option “${option.Label?.trim() || 'Untitled'}”`, () => {
      const index = node.options.indexOf(option);
      if (index < 0) {
        return null;
      }
      node.options = node.options.filter((o) => o !== option);
      return {
        restore: () => {
          node.options = reinsert(node.options, index, option);
        },
        commit: () => this.state.deleteOption(tree, node, option),
      };
    });
  }

  protected async deleteQuestion(page: PageNode, node: QuestionNode): Promise<void> {
    const tree = this.tree;
    if (this.busy || !tree || !page.questions.includes(node) || this.checkingDelete) {
      return;
    }
    const name = node.entity.Prompt?.trim() || 'Untitled';
    if (!(await this.deletable({ kind: 'question', name }, [node.entity.ID]))) {
      return;
    }
    // Off the canvas, held for Undo (F07). The written delete takes its options with it and
    // closes the gap in the page's order, in one save.
    let neighbour: QuestionNode | undefined;
    await this.holdDelete(`question “${name}”`, () => {
      // Read when the item is taken: the page may have changed while the check and the earlier
      // delete's write ran.
      const index = page.questions.indexOf(node);
      if (index < 0) {
        return null;
      }
      page.questions = page.questions.filter((q) => q !== node);
      this.selection = clearIfQuestion(this.selection, node.entity.ID);
      neighbour = page.questions[index] ?? page.questions[index - 1];
      return {
        restore: () => {
          page.questions = reinsert(page.questions, index, node);
        },
        commit: () => this.state.deleteQuestion(tree, page, node),
      };
    });
    // Focus would otherwise fall to <body> with the button that held it.
    if (neighbour) {
      this.focusQuestionCard(neighbour.entity.ID);
    }
  }

  /** While a delete is asking whether its questions were answered; a second click waits for it. */
  private checkingDelete = false;

  /**
   * Whether respondents left the questions unanswered, so the delete can be held for Undo. An
   * answered question cannot be deleted — every answer points at it — and the author is told so
   * now, in words, rather than ten seconds later by a refused save (see `delete-refusal.ts`). A
   * count that could not be read lets the delete go ahead; the save's own refusal still explains.
   */
  private async deletable(subject: Parameters<typeof answeredRefusal>[0], questionIds: string[]): Promise<boolean> {
    this.checkingDelete = true;
    try {
      const answers = await this.state.answerCount(questionIds);
      const refusal = answeredRefusal(subject, answers ?? 0);
      if (refusal) {
        this.state.showRefusal(refusal);
        this.cdr.markForCheck();
        return false;
      }
      return true;
    } finally {
      this.checkingDelete = false;
    }
  }

  /** The held delete, as a one-item list so the toast is re-created — and its countdown restarted — per delete. */
  protected readonly heldToasts = computed(() => {
    const held = this.state.heldDelete();
    return held ? [held] : [];
  });

  /**
   * Hand a delete to the undo hold (see `BuilderStateService.holdDelete` for why `take` runs late).
   *
   * The form is marked changed when the item leaves the canvas and again when it comes back, not
   * when the write lands ten seconds later: the draft fingerprint, the Publish changes button and
   * the stale-notice banners all read the tree, which is what the author sees.
   */
  private async holdDelete(label: string, take: () => Omit<HeldDelete, 'label'> | null): Promise<void> {
    const held = await this.state.holdDelete(label, () => {
      const taken = take();
      return taken && {
        restore: () => {
          taken.restore();
          this.markDirty();
        },
        commit: async () => {
          const ok = await taken.commit();
          this.cdr.markForCheck();
          return ok;
        },
      };
    });
    if (held) {
      this.markDirty();
    }
  }

  protected undoDelete(): void {
    this.state.undoDelete();
  }

  /** Hold `busy` across `work`, released on every path — a stuck flag freezes every guarded handler. */
  private async whileBusy(work: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.cdr.markForCheck();
    try {
      await work();
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Whether the arrow offering `delta` on this card would move anything (issue #84).
   *
   * The read half of {@link moveQuestion}, and deliberately the SAME predicate: each arrow's
   * `[disabled]` is this, and `reorderQuestion` refuses on this, so the affordance and the guard
   * cannot disagree. Re-deriving "where the ends of the list are" in the template would be a
   * second copy of that decision, free to drift from the one that actually decides — and the
   * symptom of the drift is either a dead control or a question that cannot be moved at all.
   *
   * The boundary is the PAGE's — every path through this method indexes `page.questions`, and
   * the arrows deliberately stop there even though the DRAG no longer does (#149). A drag is a
   * gesture with a visible target; an arrow that silently teleported a question into the next
   * section would be a control whose result the author cannot predict before pressing it.
   *
   * KNOWN CONSEQUENCE, and it is a real gap: keyboard and touch users have no way to move a
   * question between sections at all. Tracked as a follow-up rather than solved here, because
   * the answer is a different control (a "move to section" menu), not a wider arrow.
   */
  protected canMoveQuestion(page: PageNode, node: QuestionNode, delta: number): boolean {
    const index = page.questions.indexOf(node);
    return isValidReorder(index, index + delta, page.questions.length);
  }

  protected async moveQuestion(page: PageNode, node: QuestionNode, delta: number): Promise<void> {
    const index = page.questions.indexOf(node);
    await this.reorderQuestion(page, index, index + delta);
  }

  /**
   * Pointer/touch drag-drop. Within a section this mirrors {@link moveQuestion}; across two
   * sections it is {@link moveQuestionAcrossPages} (#149).
   *
   * Branching on container IDENTITY rather than on page ids: CDK is the thing that knows which
   * list the drag started in, and `event.previousContainer.data` is that list's own `PageNode`.
   * Re-deriving the source page by searching the tree for the array the drag came out of would
   * be a second answer to a question CDK has already answered.
   */
  protected async dropQuestion(page: PageNode, event: CdkDragDrop<PageNode>): Promise<void> {
    if (event.previousContainer === event.container) {
      await this.reorderQuestion(page, event.previousIndex, event.currentIndex);
      return;
    }
    await this.moveQuestionAcrossPages(
      event.previousContainer.data,
      page,
      event.previousIndex,
      event.currentIndex,
    );
  }

  /**
   * Shared reorder: move a question to a new index in its page, persist, and say what the move
   * cost (issue #73).
   *
   * A drag writes `DisplayOrder` and nothing else — it never rewrites rule JSON, and it must not
   * start: the tool cannot tell "everyone should answer this first" from "I was tidying", and a
   * guessed repair to a jump silently drops an answer the respondent already typed. So the move
   * stands and the CONSEQUENCE is reported.
   *
   * The consequence is a set difference over `collectRuleEntries`, not a rule check of its own.
   * This path knows nothing about rules beyond "the broken set grew", which is why every
   * breakage class the inventory learns later is warned about here without touching this method.
   *
   * The only write path that hooks this, because it is the only one that can INVERT a pair: every
   * other path appends or removes (plan §1.5), and neither reverses the order of two surviving
   * questions. If insert-at-index, duplicate-below or move-to-another-section ever ships, that
   * proof lapses and the diff has to wrap the new write too.
   */
  private async reorderQuestion(page: PageNode, from: number, to: number): Promise<void> {
    const tree = this.tree;
    if (!tree || this.busy || !isValidReorder(from, to, page.questions.length)) {
      return;
    }
    const moved = page.questions[from];
    // Read BEFORE the array moves — it is the question this one used to sit in front of, which is
    // what Undo puts it back before. `null` when it was last on the page.
    const wasBefore = page.questions[from + 1]?.entity.ID ?? null;
    const before = this.ruleEntries;
    const noticeBefore = this.reorderNotice;
    moveItemInArray(page.questions, from, to);

    const labels = this.itemLabels;
    const broken = newlyBrokenRules(before, this.ruleEntries);
    const text = reorderNoticeText(
      { id: moved.entity.ID, label: moved.entity.Prompt },
      broken,
      (id) => labels.get(id) ?? 'another question',
    );
    // Keyed on IDS, never on `from`/`to`. A stored index pair is only correct while nothing else
    // has shifted the page, and resolving by id when Undo is clicked makes moving the wrong
    // question unrepresentable.
    //
    // A move that breaks nothing LEAVES A STANDING BAND ALONE. Overwriting with null here was
    // how an unrelated nudge on another section silently took away the Undo for a breakage that
    // was still on screen — reproduced. What retires a band is `retireStaleNotice`, which asks
    // whether it is still TRUE rather than whether anything has happened since.
    if (text.length > 0) {
      this.reorderNotice = {
        text,
        fromPageId: page.entity.ID,
        questionId: moved.entity.ID,
        wasBefore,
        damage: damageKeys(broken),
      };
    }

    // `busy` for the write, like every other handler that awaits one. The guard at the top of
    // this method was reading a flag nothing here ever set, so the Undo button's `[disabled]`
    // was decorative and a second click could start a reorder while the first was still writing
    // — two `Save()` sequences interleaving over the same `DisplayOrder` column, which is the
    // lost update `builder-state.service.ts` warns about. try/finally because the state service
    // can throw, and a stuck `busy` freezes every guarded handler on the screen at once.
    this.busy = true;
    try {
      // One save renumbers the page, so a refusal changed nothing in the database — and the screen
      // is put back to match, with whatever notice stood before, instead of showing a move that
      // did not happen. `state.lastFailure()` tells the author why.
      if (!(await this.state.persistQuestionOrder(tree, page))) {
        moveItemInArray(page.questions, to, from);
        this.reorderNotice = noticeBefore;
        LogError(`Reorder of "${moved.entity.Prompt}" on page ${page.entity.ID} was refused; nothing moved.`);
      }
    } finally {
      this.busy = false;
    }
    this.markDirty();
  }

  /**
   * Move a question into another section, persist both sections, and say what the move cost
   * (issue #149).
   *
   * THE SAME SHAPE AS {@link reorderQuestion} AND THE SAME BAND, deliberately: one gesture keeps
   * one behaviour. The drop is never refused because of rules — every position in every section
   * is a legal target — and if the move breaks one, the author reads it in the band the in-page
   * drag already raises. Publish is what refuses a broken form (`Forms.PublishForm`), and it
   * still does.
   *
   * It DISCHARGES the obligation {@link reorderQuestion} records. That method claims to be the
   * only write path that can invert a pair of surviving questions, and says that if a move to
   * another section ever ships, "the diff has to wrap the new write too". This is that write,
   * and this is the diff wrapping it. `newlyBrokenRules` is a set difference over
   * `collectRuleEntries` across the WHOLE tree, so it already reports breakage on the source
   * section, the destination section and every rule downstream of either — nothing here has to
   * know that.
   *
   * `wasBefore` is read out of the SOURCE page before the transfer, and the notice records both
   * page ids, because Undo has to put the question back in its section and not merely at its
   * index. `transferArrayItem` accepts `to === length`, which is how a drop below the last
   * question is expressed.
   */
  private async moveQuestionAcrossPages(
    source: PageNode,
    destination: PageNode,
    from: number,
    to: number,
  ): Promise<void> {
    const tree = this.tree;
    if (
      !tree ||
      this.busy ||
      !isValidCrossPageMove(from, source.questions.length, to, destination.questions.length)
    ) {
      return;
    }
    const moved = source.questions[from];
    // Read BEFORE the transfer, out of the page it is LEAVING — that is the page Undo returns it
    // to, so the anchor has to be one of that page's questions. `null` when it was last there.
    const wasBefore = source.questions[from + 1]?.entity.ID ?? null;
    const before = this.ruleEntries;
    const noticeBefore = this.reorderNotice;
    transferArrayItem(source.questions, destination.questions, from, to);

    const labels = this.itemLabels;
    const broken = newlyBrokenRules(before, this.ruleEntries);
    const text = reorderNoticeText(
      { id: moved.entity.ID, label: moved.entity.Prompt },
      broken,
      (id) => labels.get(id) ?? 'another question',
    );
    // A move that breaks nothing LEAVES A STANDING BAND ALONE — see the note in
    // `reorderQuestion` about the unrelated nudge that used to take away a live Undo.
    if (text.length > 0) {
      this.reorderNotice = {
        text,
        fromPageId: source.entity.ID,
        questionId: moved.entity.ID,
        wasBefore,
        damage: damageKeys(broken),
      };
    }

    this.busy = true;
    try {
      // One save moves the question and renumbers both sections, so a refusal changed nothing in
      // the database; the screen is put back to match, exactly as the in-page reorder does.
      if (!(await this.state.persistCrossPageMove(tree, moved, source, destination))) {
        transferArrayItem(destination.questions, source.questions, to, from);
        this.reorderNotice = noticeBefore;
        LogError(
          `Move of "${moved.entity.Prompt}" from page ${source.entity.ID} to page ${destination.entity.ID} was refused; nothing moved.`,
        );
      }
    } finally {
      this.busy = false;
    }
    this.markDirty();
  }

  // -- the reorder notice (issue #73) ---------------------------------------

  /**
   * The last reorder that broke a rule, and enough to put it back. `null` when the last move
   * cost nothing, which is the ordinary case.
   *
   * NO TIMER. It stands until it is undone, dismissed, or replaced by another costly move: an
   * auto-hiding warning about something otherwise silent is the failure this issue is about.
   */
  protected reorderNotice: ReorderNotice | null = null;

  /**
   * Put the moved question back where it came from.
   *
   * A move is inverted by making the opposite move, so this re-enters the same write path the
   * move used — {@link reorderQuestion} in-page, {@link moveQuestionAcrossPages} across sections
   * — which re-runs the diff and lets `retireStaleNotice` drop the band once the rules it named
   * are sound again. No command stack, and no second definition of what "undone" means.
   *
   * THE SECTION THE QUESTION IS IN IS FOUND, NOT REMEMBERED. The band records where it came
   * from; where it is now is read off the tree here, by question id, at click time — the same
   * way the question and its anchor are resolved. A band stands until it is undone, dismissed or
   * replaced, and since #149 a move that breaks nothing new can carry its question into another
   * section without replacing it, so a remembered page can name a section the question has left.
   * Resolving it here means that state is unrepresentable rather than handled, and it is what
   * makes the refusal below honest: reaching it now really does mean something was deleted.
   */
  protected async undoReorder(): Promise<void> {
    const notice = this.reorderNotice;
    if (!notice) {
      return;
    }
    const current = this.tree?.pages.find((p) =>
      p.questions.some((q) => q.entity.ID === notice.questionId),
    );
    const home = this.tree?.pages.find((p) => p.entity.ID === notice.fromPageId);
    const move: UndoMove | null =
      current && home
        ? undoReorderMove(
            notice,
            current.entity.ID,
            this.questionIds(current),
            this.questionIds(home),
          )
        : null;
    if (!current || !home || !move) {
      // Nothing to put back. `current` is missing only when no section holds the question at
      // all, so it means the question itself is gone; `home` when the section it came from was
      // deleted; `move` when the anchor it sat in front of was deleted, or when it is already
      // back where it started. A band offering a move that cannot happen is worse than no band.
      this.dismissReorderNotice();
      return;
    }
    if (move.toPageId === current.entity.ID) {
      await this.reorderQuestion(current, move.from, move.to);
      return;
    }
    await this.moveQuestionAcrossPages(current, home, move.from, move.to);
  }

  private questionIds(page: PageNode): string[] {
    return page.questions.map((q) => q.entity.ID);
  }

  protected dismissReorderNotice(): void {
    this.reorderNotice = null;
    this.cdr.markForCheck();
  }

  /**
   * Drop the reorder band once the rules it named are no longer broken — HOWEVER they were fixed.
   *
   * Clicking Undo is only one of the ways. The author can drag the question back by hand, open
   * the rule and repair it in the dialog, or delete it outright, and a band still announcing that
   * breakage is a warning that outlived what it warned about.
   *
   * Called from {@link markDirty}, and that is not a contradiction of the comment in
   * `reorderQuestion` that rejects it. `markDirty()` is the wrong clock for IDENTITY — which
   * question Undo moves, and to where — because a keystroke in a prompt or a background
   * automation event would answer that wrongly. It is the right clock for TRUTH, because a
   * spurious call can only ever re-confirm a still-broken rule; it can never retire a real one.
   */
  private retireStaleNotice(): void {
    const notice = this.reorderNotice;
    if (notice && !noticeStillTrue(notice, this.ruleEntries)) {
      this.reorderNotice = null;
    }
  }

  /**
   * Drop the publish refusal once no rule is broken any more — HOWEVER they were fixed.
   *
   * Exactly the reasoning of {@link retireStaleNotice}, on the same clock, for the same reason:
   * a refusal names rules, and repairing them by any route — reordering the question back,
   * repairing the rule in the dialog, deleting the item outright — leaves a warning that has
   * outlived what it warned about. It is worse than merely stale. `publishState` re-derives on
   * the same edit, so the toolbar ends up showing the "Published" pill beside a line insisting
   * four broken rules would ship: two answers about one form, one of them false. That is the
   * failure issue #79 exists to remove, and the message enforcing it must not re-introduce it.
   *
   * Asked of `brokenRuleLines` — the very function the refusal was assembled from, not a second
   * walk that could answer differently. Only a refusal that was ABOUT rules is retractable this
   * way, which is what `refusedRules` records: an unreadable settings row is not something
   * fixing a rule repairs, so that message stays until the author publishes again.
   *
   * Cheap by construction: the guard short-circuits unless a refusal is actually standing, so
   * the inventory walk happens on the edits after a refusal and nowhere else.
   */
  private retireStaleRefusal(): void {
    if (this.refusedRules !== null && this.tree && brokenRuleLines(this.tree).length === 0) {
      this.refusedRules = null;
      this.statusMessage = '';
    }
  }

  /**
   * Every item that can carry a rule, by id, named the way the canvas names it.
   *
   * Read from the same projection the badges are built from, so the band and the badge it points
   * at cannot call one question two different things.
   */
  private get itemLabels(): ReadonlyMap<string, string> {
    const labels = new Map<string, string>();
    const form = this.ruleInventoryForm;
    for (const page of form.pages) {
      labels.set(page.id, page.label);
      for (const question of page.questions) {
        labels.set(question.id, question.label);
      }
    }
    for (const ending of form.endings) {
      labels.set(ending.id, ending.label);
    }
    return labels;
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

  /** Escape abandons the edit: the box goes back to the saved name and gives up focus. */
  protected cancelNameEdit(input: HTMLInputElement): void {
    input.value = this.record.Name;
    input.blur();
  }

  /**
   * Commit — or refuse — one edit of the form's name.
   *
   * The decision is `resolveInlineEdit`, and it is the ONLY guard: a second emptiness check here
   * would be free to disagree with it, and then Escape and blur would mean different things.
   *
   * The box is assigned unconditionally because `[value]="record.Name"` only rewrites the DOM
   * when the bound expression CHANGES. A refused edit leaves `record.Name` exactly as it was, so
   * Angular writes nothing, and without this line an emptied box would sit there empty over a
   * form that still has a name — which is how the original defect looked from the author's side.
   */
  protected async setName(input: HTMLInputElement, typed: string): Promise<void> {
    const outcome = resolveInlineEdit(typed, this.record.Name);
    input.value = outcome.value;
    if (outcome.kind !== 'commit') {
      return;
    }
    this.record.Name = outcome.value;
    await this.state.save(this.record);
    this.markDirty();
  }

  // -- publish --------------------------------------------------------------

  // --- Templates -------------------------------------------------------------

  /**
   * Notice when the template saved from this form is deleted somewhere else.
   *
   * The builder stays mounted while its tab is open, so without this, deleting a template in the
   * gallery left the form still announcing "Saved as template" — the inconsistency that prompted
   * this whole control being derived rather than latched. Same `onFormsWrite` mechanism the forms
   * list and the gallery use.
   */
  /**
   * Release the template listener. Overrides rather than shadows: `BaseFormComponent` does real
   * teardown of its own, and a subscription that outlives its component keeps reloading trees for
   * a form nobody is looking at.
   */
  public override ngOnDestroy(): void {
    this.templateChanges?.unsubscribe();
    this.templateChanges = undefined;
    this.automationChanges?.unsubscribe();
    this.automationChanges = undefined;
    this.distributionChanges?.unsubscribe();
    this.distributionChanges = undefined;
    this.formOperations?.unsubscribe();
    this.formOperations = undefined;
    // Leaving the builder ends the undo window: write the held delete now rather than lose it.
    void this.state.releaseHeldDelete();
    this.urlSync?.Stop();
    this.urlSync = null;
    super.ngOnDestroy();
  }

  /**
   * Re-read the authored automations into the draft, then re-fingerprint.
   *
   * A failed read sets {@link automationsUnknown} rather than emptying the list, because an empty
   * list is a real and publishable state that would otherwise be indistinguishable from "we could
   * not ask".
   */
  private async refreshDraftAutomations(): Promise<void> {
    const automations = await readDraftAutomations(new RunView(), this.record.ID);
    this.automationsUnknown = automations === null;
    this.draftAutomations = automations ?? [];
  }

  /**
   * Keep the publish state honest about automation edits made in the Automate tab.
   *
   * Both save AND delete, unlike {@link watchForTemplateChanges}: this builder never writes
   * `FormAutomation` rows itself, so — unlike the `Form` rows it autosaves constantly — an
   * automation write can only have come from the Automate tab, whose operations announce it
   * (`shared/forms-writes.ts`), and is always worth re-reading.
   */
  private watchForAutomationChanges(): void {
    if (this.automationChanges) {
      return;
    }
    this.automationChanges = onFormsWrite(
      FORMS_ENTITY.FormAutomation,
      ['save', 'delete'],
      () => void this.refreshDraftAutomations().then(() => this.markDirty()),
    );
  }

  /**
   * Re-read the share links this form is reachable through.
   *
   * A failed read leaves {@link shareLinks} null, which the header renders as "we could not
   * check" — never as "there are none", which would send the author off to create a second
   * link beside one they already have.
   */
  private async refreshShareLinks(): Promise<void> {
    this.shareLinks = await this.distributions.shareLinkFacts(this.record.ID);
    this.cdr.markForCheck();
  }

  /**
   * Keep the header honest about links created, paused, scheduled or deleted elsewhere.
   *
   * The builder stays mounted while its tabs change, so without this the Distribute tab
   * minting the very first share link would leave the header still insisting the form is not
   * shared — the inverse of #83 and no more true. Both save AND delete, and unfiltered by
   * form: this component never writes `FormDistribution` rows itself, so any event for that
   * entity came from somewhere else and is worth one cheap seven-column read.
   */
  private watchForDistributionChanges(): void {
    if (this.distributionChanges) {
      return;
    }
    this.distributionChanges = onFormsWrite(
      FORMS_ENTITY.FormDistribution,
      ['save', 'delete'],
      () => void this.refreshShareLinks(),
    );
  }

  private watchForTemplateChanges(): void {
    if (this.templateChanges) {
      return;
    }
    // Only a DELETE — a record's own, or `Forms.DeleteTemplate`'s announced one from the gallery:
    // a save fires constantly while this very builder autosaves its own rows, and re-reading the
    // template on each one would load a tree per keystroke.
    this.templateChanges = onFormsWrite(FORMS_ENTITY.Form, ['delete'], () => {
      if (this.tree) {
        void this.refreshSavedTemplate(this.tree.form.ID);
      }
    });
  }

  protected openTemplateDialog(): void {
    this.templateDialogOpen = true;
    this.templateDialogError = null;
    this.cdr.markForCheck();
  }

  protected closeTemplateDialog(): void {
    this.templateDialogOpen = false;
    this.cdr.markForCheck();
  }

  /**
   * Re-read the template saved from this form and fingerprint its content.
   *
   * Both halves matter: the id answers "does one exist" (a deleted template must stop the form
   * claiming to be saved), and the fingerprint answers "is it still the same form", which is the
   * question an author actually has once they have kept editing.
   */
  private async refreshSavedTemplate(formId: string): Promise<void> {
    this.savedTemplateId = await findTemplateSavedFrom(formId);
    this.savedTemplateName = null;
    this.savedTemplateFingerprint = null;
    if (this.savedTemplateId) {
      const templateForm = await loadFormRecord(this.savedTemplateId);
      if (templateForm) {
        this.savedTemplateName = templateForm.Name;
        const templateTree = await this.state.loadTree(templateForm).catch((err: unknown) => {
          // Not fatal to the builder: without the template's tree the indicator cannot say whether
          // the form has drifted from it, and says "saved" without the comparison instead.
          LogError(`Forms builder could not read template ${templateForm.ID}: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        });
        if (!templateTree) {
          this.cdr.markForCheck();
          return;
        }
        const style = templateForm.StyleID
          ? await this.design.loadStyleById(templateForm.StyleID)
          : undefined;
        const templateDraft = draftDefinition(
          templateTree,
          style ?? undefined,
          FINGERPRINT_VERSION_ID,
          [],
        );
        this.savedTemplateFingerprint = templateDraft ? templateFingerprint(templateDraft) : null;
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Copy this form into the template gallery — `Forms.CloneForm` with `AsTemplate`.
   *
   * Pending edits are flushed first for the same reason publish flushes them: the server copies the
   * stored rows, so an edit still sitting in the debounce would be missing from a template that
   * looks like it was taken from what is on screen. A refusal (a template name already taken, most
   * often) stays in the dialog, where the name can be changed.
   */
  protected async saveAsTemplate(request: SaveAsTemplateRequest): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    const formId = this.tree.form.ID;
    this.busy = true;
    this.statusMessage = '';
    this.templateDialogError = null;
    this.cdr.markForCheck();
    try {
      await this.state.flushPendingSaves();
      const outcome = await runOperation(
        new FormsCloneFormOperation(),
        { SourceFormID: formId, Name: request.name, Description: request.description, AsTemplate: true },
        `saving form ${formId} as a template`,
        [FORMS_ENTITY.Form],
      );
      if (!outcome.ok) {
        this.templateDialogError = outcome.error;
        return;
      }
      this.templateDialogOpen = false;
      await this.refreshSavedTemplate(formId);
      this.statusMessage =
        outcome.output.Warnings.length > 0
          ? `Saved as a template, with notes: ${outcome.output.Warnings.join(' ')}`
          : `Saved "${request.name}" to your templates.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save this form as a template.';
      LogError(message);
      this.statusMessage = message;
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Publish the form — `Forms.PublishForm`, which snapshots the STORED rows on the server.
   *
   * Every coalesced edit is landed first, because the server publishes what the database holds
   * and an edit still on its debounce timer would be missing from the live form.
   */
  protected async publish(): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    const tree = this.tree;
    this.busy = true;
    this.statusMessage = '';
    this.refusedRules = null;
    await this.state.flushPendingSaves();
    this.publishStateReady = false;
    const formId = tree.form.ID;
    this.ownOperations += 1;
    const outcome = await runOperation(
      new FormsPublishFormOperation(),
      { FormID: formId },
      `publishing form ${formId}`,
      [FORMS_ENTITY.Form, FORMS_ENTITY.FormVersion],
    ).finally(() => {
      this.ownOperations -= 1;
    });
    this.busy = false;
    if (outcome.ok) {
      this.statusMessage = `Published version ${outcome.output.VersionNumber}.`;
      // The server moved `Form.Status` to Published. The record must learn it: every save sends
      // the whole row, so the next autosave would otherwise send `Draft` back and be refused.
      if (!(await this.refreshFormRecord())) {
        this.statusMessage = `${this.statusMessage} Reload the builder before editing the form's settings.`;
      }
      // The draft IS the published snapshot now; re-read rather than assume.
      await this.refreshPublishState();
    } else {
      this.statusMessage = outcome.error;
      // The server's reason is shown as it came. It counts as a refusal OVER RULES — the one kind
      // `retireStaleRefusal` retracts once they are fixed — only when it IS the broken-rule refusal
      // for the rules on screen, word for word (`brokenRuleRefusal` over the same walk the server
      // runs). Any other refusal — the settings, a permission, an archived form — stands until the
      // next publish, even on a form that also has a broken rule.
      const broken = brokenRuleLines(tree);
      this.refusedRules = broken.length > 0 && outcome.error === brokenRuleRefusal(broken) ? broken : null;
      // A failed publish changed nothing, so the state we already had still holds. Without this
      // the control would sit on "Checking…" forever and the author would have no way to retry.
      this.publishStateReady = true;
    }
    this.cdr.markForCheck();
  }

  /**
   * Re-read the open form's row and adopt what the server wrote, keeping any field the author has
   * changed since. Answers whether it could; a failure is logged, not thrown — the write it follows
   * did happen.
   */
  private refreshFormRecord(): Promise<boolean> {
    // Inside the record's save chain (see `BuilderStateService.adoptStored`): a read racing a
    // save of the same row could otherwise put the pre-save value back.
    return this.state.adoptStored(this.record, async () => {
      const read = await new RunView().RunView<Record<string, unknown>>({
        EntityName: FORMS_ENTITY.Form,
        ExtraFilter: `ID=${quoteSqlString(this.record.ID)}`,
        ResultType: 'simple',
        MaxRows: 1,
      });
      const row = read.Success ? read.Results[0] : undefined;
      if (!row) {
        LogError(`Forms builder could not re-read form ${this.record.ID} after the server wrote it: ${read.ErrorMessage || 'no row'}`);
        return null;
      }
      return row;
    });
  }

  /**
   * Catch the record up whenever an OPERATION writes a form row — the Automate tab's steps (which
   * mark `Form.Settings`), an archive or restore from Forms home. Every field save sends the whole
   * row, so without this the next rename would put back the settings, or the status, the builder
   * read when it opened. Records' own saves are not heard: the builder makes those itself.
   *
   * The builder's OWN operations are skipped ({@link ownOperations}): publish re-reads the record
   * itself, so it can tell the author when the re-read fails, and re-reading twice is a second
   * answer to one question.
   */
  private watchForFormOperations(): void {
    if (this.formOperations) {
      return;
    }
    this.formOperations = onFormsWrite(
      FORMS_ENTITY.Form,
      ['save'],
      () => {
        if (this.ownOperations === 0) {
          void this.refreshFormRecord();
        }
      },
      { operationsOnly: true },
    );
  }

  protected setTab(tab: BuilderTab): void {
    this.activeTab = tab;
    this.writeUrl();
    this.cdr.markForCheck();
  }

  /** Arrow keys, Home and End on the tab strip: open the tab and move focus with it. */
  protected onTabKey(event: KeyboardEvent): void {
    const next = tabAfterKey(this.activeTab, event.key);
    if (!next) return;
    event.preventDefault();
    this.setTab(next);
    // Every tab button is always rendered, so the target exists now; only its tabindex waits
    // for change detection, and focus() does not need it.
    this.host.nativeElement.querySelector<HTMLButtonElement>(`#${this.tabId(next)}`)?.focus();
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
    // A held delete is written first, so the preview shows the form its save leaves — a default
    // ending deleted a moment ago has been replaced by then, as it will be when the window passes.
    await this.state.releaseHeldDelete();
    const style = this.record.StyleID
      ? (await this.design.loadStyleById(this.record.StyleID)) ?? undefined
      : undefined;
    // No automations: Preview renders the form, it never runs a submission's side effects.
    const built = tryBuildPublishedDefinition(this.tree, style, 'draft-preview', []);
    if (built.ok) {
      this.previewDef = built.definition;
    } else {
      // The author asked to see the form, so say why they cannot, naming the column.
      this.statusMessage = unreadableDraftMessage('preview', built.error);
    }
    this.cdr.markForCheck();
  }

  protected closePreview(): void {
    this.previewDef = null;
    this.cdr.markForCheck();
  }
}

/**
 * The reason a new form's save was refused, as one readable sentence: without the save queue's own
 * "Could not save." prefix (the start step supplies its own), on one line, and without the
 * unmatched closing brace MJ's permission message ends with.
 */
function createRefusalReason(failure: string | null): string {
  if (!failure) {
    return 'The server did not say why.';
  }
  const text = failure
    .replace(/^Could not save\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const opens = (text.match(/\{/g) ?? []).length;
  const closes = (text.match(/\}/g) ?? []).length;
  return closes > opens && text.endsWith('}') ? text.slice(0, -1).trimEnd() : text;
}

/** `items` with `item` put back at `index` (clamped), for Undo. */
function reinsert<T>(items: readonly T[], index: number, item: T): T[] {
  const at = Math.min(Math.max(index, 0), items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
}
