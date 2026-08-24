import { ChangeDetectionStrategy, Component, Input, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { EntityFieldInfo, EntityInfo } from '@memberjunction/core';
import {
  CanonicalAnswers,
  LEGACY_ON_SUBMIT_AUTOMATIONS,
  parseFieldMappings,
  parseIdentityRule,
  resolveMappedValues,
  type FieldMappings,
  type MergeRule,
  type StoredAnswerRow,
} from '@mj-biz-apps/forms-entities';
import type {
  JSONValue,
  mjBizAppsFormsFormAutomationEntity,
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormEntityBindingEntity,
} from '@mj-biz-apps/forms-entities';

import { FORMS_UI_CSS } from '../shared';
import { AUTOMATION_STYLES } from './automation-tab.styles';
import {
  LEGACY_STEP_DESCRIPTIONS,
  STEP_CHOICES,
  isLegacyStepName,
  stepDisplayName,
  submitSummary,
  toSubmitSteps,
  type AutomationFacts,
  type StepKind,
  type SubmitStep,
} from './automation-steps';
import { settingsUpdateToMarkAuthoritative } from './on-submit-mode';
import { FORMS_ENTITY } from '../shared/entity-names';
import {
  pickEntities,
  pickTargets,
  type EntityChoice,
  type NamedTarget,
} from './entity-suggestions';

/** A question the author can map from, in display order. */
export interface MappableQuestion {
  id: string;
  prompt: string;
  type: string;
}

/** One row of the mapping editor: a target field and the answer feeding it. */
interface MappingRow {
  targetField: string;
  questionId: string;
  rule: MergeRule;
}

/** Which part of the "add a step" flow is on screen. Null means we are not adding anything. */
type AddStage = 'choose' | 'record' | 'action' | 'agent';

/** One past execution, reduced to what the activity list shows. */
interface RunRow {
  id: string;
  automationId: string;
  status: string;
  when: Date | null;
  message: string;
}

/** What a configured binding writes, for the read-only summary on a saved step. */
interface MappingSummary {
  rows: { field: string; answer: string }[];
  identity: string;
}

/** How many past runs to show per step. Enough to see a pattern, few enough to stay a sidebar note. */
const RUNS_PER_STEP = 5;

/**
 * The builder's Automate tab: what happens to a submission after the answers are saved.
 *
 * WHAT THIS REPLACES. The old tab rendered our schema at the author. A step appeared as
 * `EntityBinding · OnComplete · Sync · order 3` — four column values, three of which mean nothing
 * outside this codebase — and the only thing you could actually create was a binding, despite the
 * header advertising Actions and AI Agents. Choosing the target entity meant scrolling a native
 * `<select>` holding every writable entity in the installation, most of which are core plumbing.
 *
 * Now the tab answers one question, in the order a person asks it: what happens when someone
 * submits, in what order, and is it working. {@link toSubmitSteps} turns the rows into that
 * sentence; {@link pickEntities} makes the target a search rather than a scroll; Actions and
 * Agents are creatable, so the tab no longer promises what it cannot do.
 *
 * THREE THINGS IT FIXES THAT ARE NOT COSMETIC.
 *
 * 1. The empty state used to read "Nothing runs on submit yet". That was false. Four built-in
 *    hooks fire on every form that configures nothing — including one that emails the respondent
 *    — so the tab told authors their form was inert while it was sending mail.
 * 2. The list was ordered by `DisplayOrder`, but the server runs every Sync step before any Async
 *    one and only then honours `DisplayOrder`. The displayed sequence could not happen.
 * 3. "Recent runs" queried `Form Automation Runs` with no filter at all, so it showed the last ten
 *    runs in the database — other forms' automations included. Runs are now scoped to this form's
 *    steps, and shown against the step they belong to.
 *
 * Mapping is still driven from entity METADATA rather than free text: `BaseEntity.Set` ignores a
 * field that does not exist, so a mistyped column name loses data silently on every submission.
 * Fields the entity will not accept are filtered with the same `ReadOnly` rule the executor
 * applies, so what the builder offers and what the server accepts cannot drift apart.
 */
@Component({
  selector: 'mjf-automation-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './automation-tab.component.html',
  styles: [FORMS_UI_CSS, AUTOMATION_STYLES],
})
export class AutomationTabComponent implements OnInit {
  @Input({ required: true }) FormID!: string;
  /** The form's questions, in display order, supplied by the builder shell. */
  @Input({ required: true }) Questions: MappableQuestion[] = [];

  private readonly md = new Metadata();

  protected readonly choices = STEP_CHOICES;

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly busy = signal(false);
  protected readonly actionError = signal('');

  private readonly automations = signal<mjBizAppsFormsFormAutomationEntity[]>([]);
  /** Per automation: the entity a binding writes to, and the sentence describing it. */
  private readonly resolved = signal<Map<string, { entity?: string | null; description?: string | null }>>(new Map());
  private readonly mappingSummaries = signal<Map<string, MappingSummary>>(new Map());
  private readonly runs = signal<RunRow[]>([]);

  /** The built-in hooks this deployment actually has, in plain words. */
  protected readonly builtIns = signal<string[]>([]);

  protected readonly selectedId = signal('');
  protected readonly confirmingRemove = signal(false);

  // ---- the add flow -------------------------------------------------------------------------
  protected readonly adding = signal<AddStage | null>(null);
  protected readonly entityQuery = signal('');
  private readonly entityCatalogue = signal<EntityChoice[]>([]);
  protected readonly chosenEntity = signal<EntityChoice | null>(null);
  protected readonly targetFields = signal<EntityFieldInfo[]>([]);
  protected readonly showAllFields = signal(false);
  protected readonly autoMatched = signal(0);
  private readonly mappings = signal<MappingRow[]>([]);
  protected readonly identityField = signal('');
  protected readonly preview = signal<{ field: string; value: string }[]>([]);
  protected readonly previewNote = signal('');
  protected readonly targetQuery = signal('');
  protected readonly targetsLoading = signal(false);
  private readonly targets = signal<NamedTarget[]>([]);

  // ---- derived ------------------------------------------------------------------------------

  /** Every configured step, in the order the server will run them. */
  protected readonly steps = computed<SubmitStep[]>(() => toSubmitSteps(this.facts()));

  protected readonly summary = computed(() => submitSummary(this.steps()));

  /**
   * The step being shown. Falls back to the first rather than showing an empty pane: a selection
   * can be invalidated by a delete, and a blank right-hand side reads as a broken screen.
   */
  protected readonly selected = computed<SubmitStep | null>(() => {
    const all = this.steps();
    return all.find((s) => s.id === this.selectedId()) ?? all[0] ?? null;
  });

  protected readonly entityPicks = computed(() => pickEntities(this.entityCatalogue(), this.entityQuery()));

  private readonly targetPicks = computed(() => pickTargets(this.targets(), this.targetQuery()));
  protected readonly visibleTargets = computed(() => this.targetPicks().visible);
  protected readonly hiddenTargets = computed(() => this.targetPicks().hidden);

  /**
   * The fields worth showing before the author asks for the rest.
   *
   * An entity like People has dozens of writable columns; putting all of them on screen turns the
   * one decision that matters — which answers go where — into a scroll through mostly-blank rows.
   * What survives the filter is what the author must deal with: fields that cannot be left empty,
   * and fields already mapped.
   */
  protected readonly visibleFields = computed<EntityFieldInfo[]>(() => {
    const all = this.targetFields();
    if (this.showAllFields()) {
      return all;
    }
    const mapped = new Set(this.mappings().map((m) => m.targetField));
    return all.filter((f) => !f.AllowsNull || mapped.has(f.Name));
  });

  private readonly facts = computed<AutomationFacts[]>(() =>
    this.automations().map((a) => {
      const extra = this.resolved().get(a.ID);
      return {
        id: a.ID,
        name: stepDisplayName(a.Name),
        targetType: a.TargetType,
        executionMode: a.ExecutionMode,
        trigger: a.Trigger,
        continueOnError: a.ContinueOnError,
        isActive: a.IsActive,
        displayOrder: a.DisplayOrder,
        targetEntity: extra?.entity ?? null,
        description: extra?.description ?? null,
      };
    }),
  );

  public async ngOnInit(): Promise<void> {
    this.entityCatalogue.set(writableEntityChoices(this.md.Entities));
    await this.reload();
  }

  // ---- loading ------------------------------------------------------------------------------

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      await this.loadConfigured();
    } catch (err) {
      // Never swallowed: a tab that silently shows nothing is indistinguishable from a form with
      // nothing configured, which is exactly the confusion this whole redesign is about.
      LogError(err);
      this.loadError.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadConfigured(): Promise<void> {
    const [autos, legacy] = await new RunView().RunViews([
      {
        EntityName: 'MJ_BizApps_Forms: Form Automations',
        ExtraFilter: `FormID='${escapeSql(this.FormID)}'`,
        OrderBy: 'DisplayOrder ASC',
        ResultType: 'entity_object',
      },
      {
        EntityName: 'MJ: Actions',
        ExtraFilter: legacyActionFilter(),
        Fields: ['ID', 'Name'],
        ResultType: 'simple',
      },
    ]);
    if (!autos.Success) {
      throw new Error(autos.ErrorMessage || 'The automations for this form could not be read.');
    }

    const rows = autos.Results as mjBizAppsFormsFormAutomationEntity[];
    this.automations.set(rows);
    this.builtIns.set(
      legacy.Success
        ? (legacy.Results as { Name: string }[])
            .map((r) => LEGACY_STEP_DESCRIPTIONS[r.Name as keyof typeof LEGACY_STEP_DESCRIPTIONS])
            .filter((d): d is string => Boolean(d))
        : [],
    );

    if (rows.length === 0) {
      this.resolved.set(new Map());
      this.mappingSummaries.set(new Map());
      this.runs.set([]);
      return;
    }
    await this.resolveTargets(rows);
  }

  /**
   * Fill in the human-readable half of each step: the entity a binding writes to, an Action's or
   * Agent's own description, and what each step has been doing lately.
   *
   * One batched `RunViews` rather than four awaited calls — these are independent reads and the
   * tab should not pay four round trips for them.
   */
  private async resolveTargets(rows: readonly mjBizAppsFormsFormAutomationEntity[]): Promise<void> {
    const bindingIds = idsOf(rows, (a) => a.BindingID);
    const actionIds = idsOf(rows, (a) => a.ActionID);
    const agentIds = idsOf(rows, (a) => a.AgentID);

    const [bindings, actions, agents, runs] = await new RunView().RunViews([
      {
        EntityName: 'MJ_BizApps_Forms: Form Entity Bindings',
        ExtraFilter: inClause('ID', bindingIds),
        Fields: ['ID', 'TargetEntityName', 'FieldMappings', 'IdentityRule'],
        ResultType: 'simple',
      },
      {
        EntityName: 'MJ: Actions',
        ExtraFilter: inClause('ID', actionIds),
        Fields: ['ID', 'Description'],
        ResultType: 'simple',
      },
      {
        EntityName: 'MJ: AI Agents',
        ExtraFilter: inClause('ID', agentIds),
        Fields: ['ID', 'Description'],
        ResultType: 'simple',
      },
      {
        // Scoped to THIS form's steps. The old query had no filter and showed the database's last
        // ten runs, so a form that had never run anything displayed another form's activity.
        EntityName: 'MJ_BizApps_Forms: Form Automation Runs',
        ExtraFilter: inClause('FormAutomationID', rows.map((r) => r.ID)),
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: RUNS_PER_STEP * rows.length,
        Fields: ['ID', 'FormAutomationID', 'Status', 'StartedAt', 'ErrorMessage', 'OutputSummary'],
        ResultType: 'simple',
      },
    ]);

    // A failed read is NOT an empty result. Rendering it as one tells the author this step has no
    // mapping and no history — the two things the redesign exists to show them — and the reason
    // (a permission gap, a bad filter) reaches nobody.
    if (!bindings.Success) {
      LogError(`Forms Automate tab: could not read entity bindings: ${bindings.ErrorMessage}`);
      this.actionError.set(
        'The record-mapping details for these steps could not be loaded, so any step that saves a record is shown without its mapping.',
      );
    }
    const bindingRows = bindings.Success ? (bindings.Results as BindingRow[]) : [];
    const byBinding = new Map(bindingRows.map((b) => [b.ID, b]));
    const actionDescriptions = describedById(actions);
    const agentDescriptions = describedById(agents);

    const resolved = new Map<string, { entity?: string | null; description?: string | null }>();
    const summaries = new Map<string, MappingSummary>();
    for (const automation of rows) {
      const binding = automation.BindingID ? byBinding.get(automation.BindingID) : undefined;
      resolved.set(automation.ID, {
        entity: binding ? this.entityLabel(binding.TargetEntityName) : null,
        description: this.describeAutomation(automation, actionDescriptions, agentDescriptions),
      });
      if (binding) {
        const summary = this.summarizeBinding(binding);
        if (summary) {
          summaries.set(automation.ID, summary);
        }
      }
    }
    this.resolved.set(resolved);
    this.mappingSummaries.set(summaries);
    if (!runs.Success) {
      LogError(`Forms Automate tab: could not read automation runs: ${runs.ErrorMessage}`);
      this.actionError.set(
        'Recent activity could not be loaded, so this list is not a record of what has run.',
      );
    }
    this.runs.set(runs.Success ? toRunRows(runs.Results as RawRunRow[]) : []);
  }

  /** A built-in hook is described in our words; anything else uses its own description. */
  private describeAutomation(
    automation: mjBizAppsFormsFormAutomationEntity,
    actions: Map<string, string>,
    agents: Map<string, string>,
  ): string | null {
    if (isLegacyStepName(automation.Name)) {
      return LEGACY_STEP_DESCRIPTIONS[automation.Name];
    }
    if (automation.ActionID) {
      return actions.get(automation.ActionID) ?? null;
    }
    if (automation.AgentID) {
      return agents.get(automation.AgentID) ?? null;
    }
    return null;
  }

  /**
   * What a saved binding writes, in the author's terms.
   *
   * Returns null when the stored configuration cannot be parsed rather than throwing: a broken
   * binding is worth a missing summary, not a tab that will not load. `parseFieldMappings` is the
   * same reader the executor uses, so what is shown here is what will actually be written.
   */
  private summarizeBinding(binding: BindingRow): MappingSummary | null {
    try {
      // The columns hold JSON TEXT, so they must be parsed before the contract readers see them —
      // those take an already-decoded value and reject a string outright. The server does exactly
      // this in `parseBindingConfig`; skipping it here threw BindingConfigError on every saved
      // binding and cost the step its summary.
      const mappings = parseFieldMappings(decodeJsonColumn(binding.FieldMappings));
      const identity = parseIdentityRule(decodeJsonColumn(binding.IdentityRule));
      const prompts = new Map(this.Questions.map((q) => [q.id, q.prompt]));
      const entity = this.md.EntityByName(binding.TargetEntityName);
      // Stored names are the database's vocabulary — `FirstName`, `MJ_BizApps_Common: People`.
      // Everything the author reads goes through metadata, so this summary says the same words
      // the mapping editor said when they built it.
      const label = (field: string): string =>
        entity?.Fields.find((f) => f.Name === field)?.DisplayNameOrName ?? field;
      const entityLabel = entity?.DisplayNameOrName ?? binding.TargetEntityName;
      return {
        rows: mappings.fields.map((f) => ({
          field: label(f.targetField),
          answer:
            f.source.kind === 'question'
              ? prompts.get(f.source.questionId) ?? 'an answer that is no longer on this form'
              : 'a fixed value',
        })),
        identity:
          identity.mode === 'AlwaysCreate' || !identity.match?.length
            ? `Adds a new ${entityLabel} record every time.`
            : `Updates the ${entityLabel} record with a matching ${identity.match
                .map((m) => label(m.targetField))
                .join(' and ')}, or adds a new one if there is none.`,
      };
    } catch (err) {
      LogError(err);
      return null;
    }
  }

  // ---- reading the selected step ------------------------------------------------------------

  /** An entity's name as the author knows it, falling back to the stored name if it is unknown. */
  private entityLabel(entityName: string): string {
    return this.md.EntityByName(entityName)?.DisplayNameOrName ?? entityName;
  }

  protected mappingSummary(automationId: string): MappingSummary | undefined {
    return this.mappingSummaries().get(automationId);
  }

  protected runsFor(automationId: string): RunRow[] {
    return this.runs()
      .filter((r) => r.automationId === automationId)
      .slice(0, RUNS_PER_STEP);
  }

  protected runBadgeClass(status: string): string {
    switch (status) {
      case 'Succeeded':
        return 'mjf-badge--success';
      case 'Failed':
        return 'mjf-badge--danger';
      case 'Skipped':
        return 'mjf-badge--warning';
      default:
        return 'mjf-badge--info';
    }
  }

  protected isSequential(automationId: string): boolean {
    return this.rowFor(automationId)?.ExecutionMode === 'Sync';
  }

  protected continuesOnError(automationId: string): boolean {
    return this.rowFor(automationId)?.ContinueOnError ?? false;
  }

  private rowFor(automationId: string): mjBizAppsFormsFormAutomationEntity | undefined {
    return this.automations().find((a) => a.ID === automationId);
  }

  // ---- editing a step -----------------------------------------------------------------------

  protected async toggleActive(automationId: string): Promise<void> {
    await this.update(automationId, (row) => {
      row.IsActive = !row.IsActive;
    });
  }

  protected async toggleSequential(automationId: string): Promise<void> {
    await this.update(automationId, (row) => {
      row.ExecutionMode = row.ExecutionMode === 'Sync' ? 'Async' : 'Sync';
    });
  }

  protected async toggleContinue(automationId: string): Promise<void> {
    await this.update(automationId, (row) => {
      row.ContinueOnError = !row.ContinueOnError;
    });
  }

  /**
   * Whether this step can move one place in that direction.
   *
   * Only among steps that run the same way. Sync always precedes Async no matter what
   * `DisplayOrder` says, so a button that appeared to move a background step above a sequential
   * one would save a number the runner then ignores — the author would watch the list snap back
   * and conclude the tab was broken.
   */
  protected canMove(automationId: string, delta: number): boolean {
    return this.neighbourOf(automationId, delta) !== undefined;
  }

  protected async move(automationId: string, delta: number): Promise<void> {
    const mine = this.rowFor(automationId);
    const theirs = this.neighbourOf(automationId, delta);
    if (!mine || !theirs) {
      return;
    }
    const myOrder = mine.DisplayOrder;
    const theirOrder = theirs.DisplayOrder;
    mine.DisplayOrder = theirOrder;
    theirs.DisplayOrder = myOrder;
    await this.run(async () => {
      // A reorder is ONE change expressed as two rows, and the obvious `a.Save() || b.Save()`
      // gets it wrong twice: `||` short-circuits, so a failure on the first leaves the second
      // holding the first one's old order in memory — dirty, unreverted, and flushed to the
      // database minutes later by an unrelated edit — and a failure on the SECOND leaves the
      // first one's swap committed, so two steps share a DisplayOrder and the runner's tie-break
      // decides the order instead of the author.
      const mineSaved = await mine.Save();
      const theirsSaved = await theirs.Save();
      if (mineSaved && theirsSaved) {
        return;
      }
      const failed = mineSaved ? theirs : mine;
      const reason = failed.LatestResult?.CompleteMessage ?? 'Those steps could not be reordered.';
      const stranded = await this.undoHalfDoneSwap(
        { entity: mine, saved: mineSaved, order: myOrder },
        { entity: theirs, saved: theirsSaved, order: theirOrder },
      );
      throw new Error(
        stranded
          ? `${reason} The saved half of that move could not be undone either, so the order shown here may not match what runs — reload the tab.`
          : reason,
      );
    });
  }

  /**
   * Put back whichever half of a failed swap actually committed.
   *
   * `Revert()` cannot do this job and it is worth being explicit about why, because reaching for
   * it here is the obvious move and it silently does nothing: it copies `OldValue` back over
   * `Value` in MEMORY and returns early when the entity is not dirty — and a successful `Save()`
   * has already advanced `OldValue` and cleared the dirty flag. So after a commit, `Revert()` is
   * a no-op against a row that is already changed in the database. Undoing a committed write
   * takes another write.
   *
   * Returns true when a compensating write was needed and itself failed, which is the one case
   * the author has to be told about explicitly: the database is then genuinely inconsistent with
   * the list, and no amount of re-rendering will fix it.
   */
  private async undoHalfDoneSwap(
    ...halves: Array<{ entity: mjBizAppsFormsFormAutomationEntity; saved: boolean; order: number }>
  ): Promise<boolean> {
    let stranded = false;
    for (const half of halves) {
      if (!half.saved) {
        // Never reached the database, so memory is the only thing to clean up — and here Revert
        // is exactly right, because the entity IS still dirty.
        half.entity.Revert();
        continue;
      }
      half.entity.DisplayOrder = half.order;
      if (!(await half.entity.Save())) {
        stranded = true;
      }
    }
    return stranded;
  }

  private neighbourOf(
    automationId: string,
    delta: number,
  ): mjBizAppsFormsFormAutomationEntity | undefined {
    const ordered = this.steps();
    const index = ordered.findIndex((s) => s.id === automationId);
    const neighbour = index < 0 ? undefined : ordered[index + delta];
    if (!neighbour) {
      return undefined;
    }
    const mine = this.rowFor(automationId);
    const theirs = this.rowFor(neighbour.id);
    return mine && theirs && mine.ExecutionMode === theirs.ExecutionMode ? theirs : undefined;
  }

  /**
   * Remove a step.
   *
   * Deletes only the automation, never the binding it points at: the binding may be referenced by
   * a ledger row recording what a past submission produced, and deleting it would leave that
   * lineage pointing at nothing. An orphaned binding is inert and re-attachable; a broken ledger
   * is not repairable.
   */
  protected async remove(automationId: string): Promise<void> {
    const row = this.rowFor(automationId);
    if (!row) {
      return;
    }
    await this.run(async () => {
      // BEFORE the delete, and on every removal rather than only the last one.
      //
      // Marking on add alone covers forms whose steps this builder created, and misses every form
      // that already had them — `V202608081400__Backfill_Legacy_Automations` gave every pre-0.8.0
      // form four automation rows and no mode. Such an author could delete all four, republish,
      // and get an empty snapshot with the mode still absent, which infers `legacy` and restores
      // the four built-ins: the exact regression this was meant to end.
      //
      // Before rather than after, because the failure directions are not symmetric: marking then
      // failing to delete leaves the rows and the mode, which is what the author sees anyway;
      // deleting then failing to mark can leave zero rows and no mode, which is indistinguishable
      // from a form that configured nothing.
      await this.markAutomationsAuthoritative();
      if (!(await row.Delete())) {
        throw new Error(row.LatestResult?.CompleteMessage ?? 'That step could not be removed.');
      }
      this.confirmingRemove.set(false);
      this.selectedId.set('');
    });
  }

  private async update(
    automationId: string,
    change: (row: mjBizAppsFormsFormAutomationEntity) => void,
  ): Promise<void> {
    const row = this.rowFor(automationId);
    if (!row) {
      return;
    }
    change(row);
    await this.run(async () => {
      if (!(await row.Save())) {
        // Revert, or the screen keeps showing a setting the database rejected.
        row.Revert();
        throw new Error(row.LatestResult?.CompleteMessage ?? 'That change could not be saved.');
      }
    });
  }

  // ---- adding a step ------------------------------------------------------------------------

  protected startAdd(): void {
    this.actionError.set('');
    this.adding.set('choose');
  }

  protected cancelAdd(): void {
    // Back out one level rather than all the way: someone who opened the wrong picker wants the
    // three choices again, not to start over from the list.
    this.actionError.set('');
    if (this.adding() !== 'choose' && this.chosenEntity()) {
      this.clearEntity();
      return;
    }
    this.adding.set(this.adding() === 'choose' ? null : 'choose');
    this.resetAddState();
  }

  protected async chooseKind(kind: StepKind): Promise<void> {
    this.resetAddState();
    this.adding.set(kind === 'record' ? 'record' : kind);
    if (kind !== 'record') {
      await this.loadTargets(kind);
    }
  }

  private resetAddState(): void {
    this.entityQuery.set('');
    this.chosenEntity.set(null);
    this.targetFields.set([]);
    this.mappings.set([]);
    this.identityField.set('');
    this.preview.set([]);
    this.previewNote.set('');
    this.showAllFields.set(false);
    this.autoMatched.set(0);
    this.targetQuery.set('');
    this.targets.set([]);
  }

  private async loadTargets(kind: 'action' | 'agent'): Promise<void> {
    this.targetsLoading.set(true);
    try {
      const result = await new RunView().RunView<{ ID: string; Name: string; Description: string | null }>({
        EntityName: kind === 'action' ? 'MJ: Actions' : 'MJ: AI Agents',
        ExtraFilter: kind === 'action' ? "Status='Active'" : '',
        OrderBy: 'Name ASC',
        Fields: ['ID', 'Name', 'Description'],
        ResultType: 'simple',
      });
      if (!result.Success) {
        this.actionError.set(result.ErrorMessage || `The list of ${kind}s could not be read.`);
        return;
      }
      this.targets.set(
        result.Results.map((r) => ({ id: r.ID, name: r.Name, description: r.Description })),
      );
    } finally {
      this.targetsLoading.set(false);
    }
  }

  protected selectEntity(entityName: string): void {
    const entity = this.md.EntityByName(entityName);
    if (!entity) {
      this.actionError.set('That entity could not be resolved.');
      return;
    }
    this.chosenEntity.set({
      name: entity.Name,
      label: entity.DisplayNameOrName,
      schema: entity.SchemaName,
    });
    // `ReadOnly` is the same gate the executor applies, so the builder cannot offer a field the
    // server would then refuse.
    this.targetFields.set(entity.Fields.filter((f) => !f.ReadOnly));
    this.mappings.set([]);
    this.identityField.set('');
    this.autoMap();
  }

  protected clearEntity(): void {
    this.chosenEntity.set(null);
    this.targetFields.set([]);
    this.mappings.set([]);
    this.identityField.set('');
    this.preview.set([]);
    this.previewNote.set('');
    this.autoMatched.set(0);
  }

  protected toggleAllFields(): void {
    this.showAllFields.update((v) => !v);
  }

  /**
   * Match answers to fields by name, the way an author would by eye.
   *
   * Run automatically on choosing an entity rather than sitting behind a button. It only fills an
   * exact name match with punctuation and case removed — `First Name`, `firstName` and
   * `first_name` are the same intent spelled three ways — so it is high-precision, and the count
   * is reported on screen so the author knows to check it rather than discovering it later.
   */
  private autoMap(): void {
    const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
    const filled: MappingRow[] = [];
    for (const field of this.targetFields()) {
      const target = normalize(field.Name);
      const display = normalize(field.DisplayNameOrName);
      const match = this.Questions.find((q) => {
        const prompt = normalize(q.prompt);
        return prompt === target || prompt === display;
      });
      if (match) {
        filled.push({ targetField: field.Name, questionId: match.id, rule: 'neverBlank' });
      }
    }
    this.mappings.set(filled);
    this.autoMatched.set(filled.length);
  }

  /**
   * Questions worth offering for a field.
   *
   * A soft compatibility hint, not a restriction: a FileUpload answer is only meaningful in a
   * uniqueidentifier column, and offering it for a text field invites a mapping that stores a GUID
   * where someone expected a name. Everything else stays available, because coercion handles the
   * ordinary cases and an author knows their data better than a type check does.
   */
  protected compatibleQuestions(field: EntityFieldInfo): MappableQuestion[] {
    return this.Questions.filter((q) =>
      q.type === 'FileUpload' ? field.TSType === 'string' && field.IsUniqueIdentifier : true,
    );
  }

  protected mappingFor(fieldName: string): string {
    return this.mappings().find((m) => m.targetField === fieldName)?.questionId ?? '';
  }

  protected ruleFor(fieldName: string): MergeRule {
    return this.mappings().find((m) => m.targetField === fieldName)?.rule ?? 'neverBlank';
  }

  protected setRule(fieldName: string, rule: MergeRule): void {
    this.mappings.update((rows) =>
      rows.map((m) => (m.targetField === fieldName ? { ...m, rule } : m)),
    );
  }

  protected setMapping(fieldName: string, questionId: string): void {
    this.mappings.update((rows) => {
      const without = rows.filter((m) => m.targetField !== fieldName);
      return questionId ? [...without, { targetField: fieldName, questionId, rule: 'neverBlank' as MergeRule }] : without;
    });
    if (this.identityField() && !this.mappedFieldNames().includes(this.identityField())) {
      // Un-mapping the identity field has to clear the choice: the executor refuses a binding
      // whose identity value no mapping can supply, and leaving it selected would save a config
      // that can never match anything.
      this.identityField.set('');
    }
  }

  protected mappedFieldNames(): string[] {
    return this.mappings().map((m) => m.targetField);
  }

  /** A field's display name, so the identity sentence reads in the author's words. */
  protected fieldLabel(fieldName: string): string {
    return this.targetFields().find((f) => f.Name === fieldName)?.DisplayNameOrName ?? fieldName;
  }

  protected canSave(): boolean {
    return this.chosenEntity() !== null && this.mappings().length > 0;
  }

  /**
   * Show what this binding would write, using the form's most recent response.
   *
   * The interesting outcomes of a binding are invisible until data is already wrong, so being able
   * to look before saving is worth more than it sounds. Read-only — it resolves the mapping and
   * reports it; it never touches the target entity.
   */
  protected async dryRun(): Promise<void> {
    this.preview.set([]);
    this.previewNote.set('');
    const latest = await new RunView().RunView<{ ID: string }>({
      EntityName: 'MJ_BizApps_Forms: Form Responses',
      ExtraFilter: `FormID='${escapeSql(this.FormID)}' AND Status='Complete'`,
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: 1,
      Fields: ['ID'],
      ResultType: 'simple',
    });
    if (!latest.Success || latest.Results.length === 0) {
      this.previewNote.set('Nobody has finished this form yet, so there is nothing to try it on.');
      return;
    }

    const answers = await new RunView().RunView<StoredAnswerRow>({
      EntityName: 'MJ_BizApps_Forms: Form Response Answers',
      ExtraFilter: `ResponseID='${escapeSql(latest.Results[0].ID)}'`,
      ResultType: 'simple',
    });
    if (!answers.Success) {
      this.previewNote.set('That response could not be read.');
      return;
    }

    const resolvedValues = resolveMappedValues(this.buildFieldMappings(), new CanonicalAnswers(answers.Results));
    if (resolvedValues.values.size === 0) {
      this.previewNote.set('That response left every mapped question blank, so nothing would be written.');
      return;
    }
    this.preview.set(
      [...resolvedValues.values].map(([field, value]) => ({
        field: this.fieldLabel(field),
        value: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
      })),
    );
  }

  /** The mapping as the contract expects it — one shape, used for both preview and save. */
  private buildFieldMappings(): FieldMappings {
    return {
      version: 1,
      fields: this.mappings().map((m) => ({
        targetField: m.targetField,
        source: { kind: 'question' as const, questionId: m.questionId },
      })),
    };
  }

  /** Create the binding and the step that runs it. */
  protected async saveBinding(): Promise<void> {
    const chosen = this.chosenEntity();
    const entity = chosen ? this.md.EntityByName(chosen.name) : undefined;
    if (!entity) {
      this.actionError.set('That entity could not be resolved.');
      return;
    }
    await this.run(async () => {
      const binding = await this.md.GetEntityObject<mjBizAppsFormsFormEntityBindingEntity>(
        'MJ_BizApps_Forms: Form Entity Bindings',
      );
      if (!binding) {
        throw new Error('The binding record could not be created.');
      }
      binding.NewRecord();
      binding.FormID = this.FormID;
      binding.Name = `Send responses to ${entity.DisplayNameOrName}`;
      binding.TargetEntityID = entity.ID;
      binding.TargetEntityName = entity.Name;
      binding.FieldMappings = JSON.stringify(this.buildFieldMappings());
      binding.IdentityRule = JSON.stringify(
        this.identityField()
          ? { mode: 'MatchThenCreate', match: [{ targetField: this.identityField(), normalize: 'LowerCaseTrim' }] }
          : { mode: 'AlwaysCreate' },
      );
      binding.MergePolicy = JSON.stringify({
        default: 'neverBlank',
        fields: Object.fromEntries(
          this.mappings().filter((m) => m.rule !== 'neverBlank').map((m) => [m.targetField, m.rule]),
        ),
      });
      binding.Status = 'Active';
      if (!(await binding.Save())) {
        throw new Error(binding.LatestResult?.CompleteMessage ?? 'Saving the binding failed.');
      }

      await this.addAutomation((row) => {
        row.Name = binding.Name;
        row.TargetType = 'EntityBinding';
        row.BindingID = binding.ID;
      });
    });
  }

  /** Attach an Action or an AI Agent as a step. */
  protected async saveTarget(target: NamedTarget): Promise<void> {
    const kind = this.adding();
    if (kind !== 'action' && kind !== 'agent') {
      return;
    }
    await this.run(async () => {
      await this.addAutomation((row) => {
        row.Name = target.name;
        row.TargetType = kind === 'action' ? 'Action' : 'Agent';
        if (kind === 'action') {
          row.ActionID = target.id;
        } else {
          row.AgentID = target.id;
        }
      });
    });
  }

  /**
   * Write one automation row, seeding the built-in defaults first if this is the form's first.
   *
   * Dispatch is all-or-nothing: a form whose snapshot carries any automations runs those and
   * nothing else. Without seeding, adding one step would silently switch off the confirmation
   * email, the follow-up task, the respondent-Person upsert and the answer scoring — a regression
   * triggered by using the feature. Seeding makes the cutover visible: the four appear as ordinary
   * steps the author can reorder or switch off deliberately.
   */
  private async addAutomation(
    configure: (row: mjBizAppsFormsFormAutomationEntity) => void,
  ): Promise<void> {
    const seeded = await this.seedLegacyDefaultsIfFirst();
    const automation = await this.md.GetEntityObject<mjBizAppsFormsFormAutomationEntity>(
      'MJ_BizApps_Forms: Form Automations',
    );
    if (!automation) {
      throw new Error('That step could not be created.');
    }
    automation.NewRecord();
    automation.FormID = this.FormID;
    automation.Trigger = 'OnComplete';
    // Sequential by default so a later step can rely on what this one produced — the confirmation
    // email that reports a created record, or a follow-up task that links to it.
    automation.ExecutionMode = 'Sync';
    // One past the highest order in use, NOT a count, and taking the rows just seeded into
    // account — `automations()` is not reloaded between the seed and here, so on the seeding path
    // it is still empty and cannot answer this on its own.
    //
    // Count-derived orders collide two different ways. After a deletion: seed four built-ins
    // (1-4), add two steps (5, 6), delete the one at 3, and `length + 1` hands the next step 6,
    // on top of the step already there. And on the seeding path, a built-in whose action is not
    // registered here is skipped while the rest keep their own displayOrder, so the rows can
    // occupy 1, 3, 4 while the count says 3. Either way two steps end up sharing a DisplayOrder,
    // this tab and the server then fall back to different tie-breaks (the DisplayOrder-sorted
    // read here, the published snapshot's order there), and the sequence the author sees stops
    // being the sequence that runs — while the arrows silently do nothing between the tied pair,
    // since swapping two equal numbers writes nothing.
    automation.DisplayOrder = Math.max(this.highestDisplayOrder(), seeded) + 1;
    automation.ContinueOnError = true;
    automation.IsActive = true;
    configure(automation);
    if (!(await automation.Save())) {
      throw new Error(automation.LatestResult?.CompleteMessage ?? 'Saving that step failed.');
    }
    // AFTER the row, not before. Marking first and then failing to write the row leaves a form
    // marked authoritative with zero automations, which runs NOTHING on submit — neither
    // configured steps nor the built-ins. This order fails the other way: rows exist, mode unset,
    // which still infers `configured` and is corrected by the next edit.
    await this.markAutomationsAuthoritative();
    this.selectedId.set(automation.ID);
    this.adding.set(null);
    this.resetAddState();
  }

  /**
   * Record on the form that its own automations are what run on submit.
   *
   * Idempotent and cheap: {@link settingsUpdateToMarkAuthoritative} returns null once the form
   * already says so, which is every call after the first.
   *
   * Failing here THROWS rather than warning, and that is deliberate. The caller wraps this in
   * `run()`, which surfaces the message and abandons the operation. The alternative — carry on
   * anyway — produces exactly the state this whole change exists to remove: a form whose
   * automation list the server cannot tell apart from a form that configured nothing.
   *
   * Called from BOTH the add and the remove paths, so its messages must not name either one.
   */
  private async markAutomationsAuthoritative(): Promise<void> {
    const form = await this.md.GetEntityObject<mjBizAppsFormsFormEntity>(FORMS_ENTITY.Form);
    if (!form || !(await form.Load(this.FormID))) {
      throw new Error('This form could not be read, so nothing was changed.');
    }
    const updated = settingsUpdateToMarkAuthoritative(form.Settings);
    if (updated === null) {
      return;
    }
    form.Settings = updated;
    if (!(await form.Save())) {
      throw new Error(
        form.LatestResult?.CompleteMessage ??
          'This form could not be updated to run its own steps, so nothing was changed.',
      );
    }
  }

  /** The highest DisplayOrder among the steps currently loaded, or 0 when there are none. */
  private highestDisplayOrder(): number {
    const orders = this.automations().map((a) => a.DisplayOrder ?? 0);
    return orders.length === 0 ? 0 : Math.max(...orders);
  }

  /**
   * Write the built-in defaults as steps, if this form has none yet.
   *
   * Returns the highest DisplayOrder it actually WROTE, not how many rows it wrote. The two
   * differ, and the difference is a bug: a default whose Action is not registered here is skipped
   * while the rest keep their own displayOrder, so three seeded rows can occupy 1, 3 and 4 while
   * the count says 3 — and a caller deriving the next order from a count lands on 4, on top of a
   * row that is already there. Returns 0 when nothing was seeded.
   *
   * A default whose Action is not registered in this deployment is skipped rather than failing the
   * save — it was not running before either, since the legacy runner also resolves by name and
   * skips what it cannot find, so skipping preserves the behaviour instead of inventing a failure.
   */
  private async seedLegacyDefaultsIfFirst(): Promise<number> {
    if (this.automations().length > 0) {
      return 0;
    }
    const actions = await new RunView().RunView<{ ID: string; Name: string }>({
      EntityName: 'MJ: Actions',
      ExtraFilter: legacyActionFilter(),
      Fields: ['ID', 'Name'],
      ResultType: 'simple',
    });
    if (!actions.Success) {
      throw new Error('The built-in steps could not be read, so adding this one was stopped rather than silently replacing them.');
    }
    const idByName = new Map(actions.Results.map((a) => [a.Name, a.ID]));

    let seeded = 0;
    for (const legacy of LEGACY_ON_SUBMIT_AUTOMATIONS) {
      const actionId = idByName.get(legacy.actionName);
      if (!actionId) {
        continue;
      }
      const row = await this.md.GetEntityObject<mjBizAppsFormsFormAutomationEntity>(
        'MJ_BizApps_Forms: Form Automations',
      );
      if (!row) {
        continue;
      }
      row.NewRecord();
      row.FormID = this.FormID;
      row.Name = legacy.actionName;
      row.TargetType = 'Action';
      row.ActionID = actionId;
      row.Trigger = 'OnComplete';
      // Sequential and tolerant, matching how the legacy runner fired them: one after another,
      // with a failure logged and the rest continuing.
      row.ExecutionMode = 'Sync';
      row.DisplayOrder = legacy.displayOrder;
      row.ContinueOnError = true;
      row.IsActive = true;
      if (!(await row.Save())) {
        // Not skippable. Dispatch is all-or-nothing: a form carrying ANY automations runs those
        // and nothing else, so a built-in that fails to seed here is not "one row missing" — it
        // is that hook switched off for this form permanently, silently, at the moment the author
        // added something unrelated. `Forms: Send Confirmation Email` is one of the four.
        //
        // Throwing also keeps `seeded` honest: the caller derives the new step's DisplayOrder
        // from it, so an under-count collides with an existing row's order.
        throw new Error(
          row.LatestResult?.CompleteMessage ??
            `The built-in step "${legacy.actionName}" could not be saved, so adding this one was stopped rather than silently switching that step off.`,
        );
      }
      // The highest order actually written, NOT a count. The two diverge whenever a built-in
      // is skipped because its action is not registered on this deployment: the remaining rows
      // keep their own `legacy.displayOrder`, so three seeded rows can occupy 1, 3 and 4 while
      // the count says 3 — and a caller deriving the next order from the count lands on 4, on top
      // of a row that is already there.
      seeded = Math.max(seeded, legacy.displayOrder);
    }
    return seeded;
  }

  /**
   * Run one mutation: busy while it works, its message on screen if it fails, a reload after.
   *
   * Every write on this tab goes through here so none of them can forget the reload — a saved
   * change that leaves the list showing the old value is the bug this screen is least able to
   * afford, since the list IS the explanation of what the form does.
   */
  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.actionError.set('');
    try {
      await work();
      await this.loadConfigured();
    } catch (err) {
      LogError(err);
      this.actionError.set(err instanceof Error ? err.message : String(err));
      // Reload after a FAILURE too, not just after a success.
      //
      // A failed mutation is rarely a mutation that did nothing: seeding the built-in hooks
      // writes four rows one at a time and can stop on the third, and a failed reorder can leave
      // a compensating write behind. Leaving the signals holding pre-failure state meant the list
      // disagreed with the database, and worse, `seedLegacyDefaultsIfFirst` decides whether to
      // seed by asking whether `automations()` is empty — so after a partial seed the stale empty
      // signal told it to seed again from scratch and DUPLICATE the rows that had succeeded.
      try {
        await this.loadConfigured();
      } catch (reloadErr) {
        // Reported, never allowed to replace the original message: the author needs to know what
        // failed, not what failed while we were tidying up after it.
        LogError(reloadErr);
      }
    } finally {
      this.busy.set(false);
    }
  }
}

/** The binding columns this tab reads. */
interface BindingRow {
  ID: string;
  TargetEntityName: string;
  FieldMappings: string;
  IdentityRule: string;
}

/** The run columns this tab reads. */
interface RawRunRow {
  ID: string;
  FormAutomationID: string;
  Status: string;
  StartedAt: string | Date | null;
  ErrorMessage: string | null;
  OutputSummary: string | null;
}

function toRunRows(rows: readonly RawRunRow[]): RunRow[] {
  return rows.map((r) => ({
    id: r.ID,
    automationId: r.FormAutomationID,
    status: r.Status,
    when: r.StartedAt ? new Date(r.StartedAt) : null,
    // The error wins over the summary: a run that failed has one thing worth reading.
    message: r.ErrorMessage || r.OutputSummary || '',
  }));
}

/** `ID -> Description`, for the rows that have one worth showing. */
function describedById(result: { Success: boolean; Results: unknown[] }): Map<string, string> {
  if (!result.Success) {
    return new Map();
  }
  const rows = result.Results as { ID: string; Description: string | null }[];
  return new Map(
    rows.filter((r) => r.Description?.trim()).map((r) => [r.ID, r.Description!.trim()]),
  );
}

/** The distinct non-null ids one column of the automation rows points at. */
function idsOf(
  rows: readonly mjBizAppsFormsFormAutomationEntity[],
  read: (row: mjBizAppsFormsFormAutomationEntity) => string | null,
): string[] {
  return [...new Set(rows.map(read).filter((id): id is string => Boolean(id)))];
}

/**
 * An `IN` clause, or a filter that matches nothing when there are no ids.
 *
 * `IN ()` is a syntax error, and the tempting alternative — omitting the filter — is how the old
 * "recent runs" list ended up showing the whole database. A view that should return nothing must
 * be asked for nothing.
 */
function inClause(column: string, ids: readonly string[]): string {
  if (ids.length === 0) {
    return '1=0';
  }
  return `${column} IN (${ids.map((id) => `'${escapeSql(id)}'`).join(',')})`;
}

/** The four built-in hooks, as a name filter. */
function legacyActionFilter(): string {
  return LEGACY_ON_SUBMIT_AUTOMATIONS.map((d) => `Name='${escapeSql(d.actionName)}'`).join(' OR ');
}

/**
 * Decode a JSON column into the value the contract parsers expect.
 *
 * Blank is null rather than a parse error: an optional configuration column that was never filled
 * in is a normal state, and `JSON.parse('')` throws a SyntaxError that says nothing useful about
 * which column it came from.
 */
function decodeJsonColumn(raw: string | null): JSONValue | null {
  if (raw === null || raw.trim() === '') {
    return null;
  }
  return JSON.parse(raw) as JSONValue;
}

/** Single quotes doubled, the only escape a T-SQL string literal needs. */
function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Every entity a form could write into, as picker choices.
 *
 * An entity with creates and updates both disabled would pass authoring and then fail on every
 * submission, which is a slow way to learn. Virtual entities and anything outside the API are
 * excluded for the same reason.
 */
function writableEntityChoices(entities: readonly EntityInfo[]): EntityChoice[] {
  return entities
    .filter((e) => e.IncludeInAPI && !e.VirtualEntity && (e.AllowCreateAPI || e.AllowUpdateAPI))
    .map((e) => ({ name: e.Name, label: e.DisplayNameOrName, schema: e.SchemaName }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
