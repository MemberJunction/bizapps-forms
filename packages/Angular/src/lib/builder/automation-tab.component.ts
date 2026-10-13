import { ChangeDetectionStrategy, Component, Input, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { EntityFieldInfo, EntityInfo } from '@memberjunction/core';
import {
  CanonicalAnswers,
  FormsRemoveAutomationOperation,
  FormsReorderAutomationsOperation,
  FormsSaveAutomationOperation,
  LEGACY_ON_SUBMIT_AUTOMATIONS,
  parseFieldMappings,
  escapeSqlString,
  parseIdentityRule,
  resolveMappedValues,
  type FieldMappings,
  type FormsAutomationFields,
  type FormsSaveAutomationInput,
  type MergeRule,
  type StoredAnswerRow,
} from '@mj-biz-apps/forms-entities';
import type { JSONValue, mjBizAppsFormsFormAutomationEntityType } from '@mj-biz-apps/forms-entities';
import { runOperation, type OperationOutcome } from '../shared/remote-operation';
import { FORMS_ENTITY } from '../shared/entity-names';


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
import {
  pickEntities,
  pickTargets,
  type EntityChoice,
  type NamedTarget,
} from './entity-suggestions';

/**
 * What the step verbs write: the steps, the binding a step runs, and the form's settings (marked as
 * owning its own step list). Announced so the builder's publish state notices (`forms-writes.ts`).
 */
const STEP_WRITES = [FORMS_ENTITY.FormAutomation, FORMS_ENTITY.FormEntityBinding, FORMS_ENTITY.Form];

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

/**
 * One step as this tab reads it. A plain row, not an entity: the tab never saves a step itself —
 * every write is a `Forms.*Automation*` operation — so it has no use for a savable record.
 */
type AutomationRow = mjBizAppsFormsFormAutomationEntityType;

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
  /** Why steps the author did not add just appeared (the server seeded the built-ins), or ''. */
  protected readonly seededNote = signal('');

  private readonly automations = signal<AutomationRow[]>([]);
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
        ExtraFilter: `FormID='${escapeSqlString(this.FormID)}'`,
        OrderBy: 'DisplayOrder ASC',
        ResultType: 'simple',
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

    const rows = autos.Results as AutomationRow[];
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
  private async resolveTargets(rows: readonly AutomationRow[]): Promise<void> {
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
    automation: AutomationRow,
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

  private rowFor(automationId: string): AutomationRow | undefined {
    return this.automations().find((a) => a.ID === automationId);
  }

  // ---- editing a step -----------------------------------------------------------------------
  //
  // Every write on this tab is a Remote Operation (spec #303 §3): `Forms.SaveAutomation`,
  // `Forms.ReorderAutomations`, `Forms.RemoveAutomation`. The rules that used to live here — the
  // built-in steps seeded on a form's first configured step, the form marked as owning its own step
  // list, the next free `DisplayOrder`, a reorder written as one change — run on the server, each in
  // one transaction, so an Action or an agent editing a form's steps gets the same result.

  protected async toggleActive(automationId: string): Promise<void> {
    await this.updateStep(automationId, (row) => ({ IsActive: !row.IsActive }));
  }

  protected async toggleSequential(automationId: string): Promise<void> {
    await this.updateStep(automationId, (row) => ({ ExecutionMode: row.ExecutionMode === 'Sync' ? 'Async' : 'Sync' }));
  }

  protected async toggleContinue(automationId: string): Promise<void> {
    await this.updateStep(automationId, (row) => ({ ContinueOnError: !row.ContinueOnError }));
  }

  /**
   * Whether this step can move one place in that direction.
   *
   * Only among steps that run the same way. Sync always precedes Async no matter what
   * `DisplayOrder` says, so a button that appeared to move a background step above a sequential
   * one would ask for an order the server refuses — the author would read an error for a button
   * the tab should not have offered.
   */
  protected canMove(automationId: string, delta: number): boolean {
    return this.neighbourOf(automationId, delta) !== undefined;
  }

  /**
   * Swap a step with its neighbour: the COMPLETE new order in one `Forms.ReorderAutomations`, so
   * the swap is one write and there is no half-done move to compensate for.
   */
  protected async move(automationId: string, delta: number): Promise<void> {
    const theirs = this.neighbourOf(automationId, delta);
    if (!theirs) {
      return;
    }
    const order = this.steps().map((s) => s.id);
    const mine = order.indexOf(automationId);
    const other = order.indexOf(theirs.ID);
    [order[mine], order[other]] = [order[other], order[mine]];
    await this.run(() =>
      runOperation(
        new FormsReorderAutomationsOperation(),
        { FormID: this.FormID, OrderedAutomationIDs: order },
        `reordering the steps of form ${this.FormID}`,
        STEP_WRITES,
      ),
    );
  }

  private neighbourOf(automationId: string, delta: number): AutomationRow | undefined {
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
   * Remove a step (`Forms.RemoveAutomation`).
   *
   * Never deletes the binding the step ran: a binding's ledger of what past submissions produced
   * outlives the step. The server marks the form as owning its step list in the same transaction —
   * so removing the last step cannot bring the legacy built-ins back — and on a form that was still
   * running the built-ins, seeds them as visible steps, which the note says.
   */
  protected async remove(automationId: string): Promise<void> {
    if (!this.rowFor(automationId)) {
      return;
    }
    await this.run(async () => {
      const outcome = await runOperation(
        new FormsRemoveAutomationOperation(),
        { FormAutomationID: automationId },
        `removing step ${automationId} of form ${this.FormID}`,
        STEP_WRITES,
      );
      if (outcome.ok) {
        this.confirmingRemove.set(false);
        this.selectedId.set('');
        this.noteSeeded(outcome.output.SeededAutomationIDs);
      }
      return outcome;
    });
  }

  /** Change one setting of a saved step (`Forms.SaveAutomation`, update shape). */
  private async updateStep(
    automationId: string,
    change: (row: AutomationRow) => FormsAutomationFields,
  ): Promise<void> {
    const row = this.rowFor(automationId);
    if (!row) {
      return;
    }
    await this.run(() => this.saveAutomation({ FormID: this.FormID, Automation: { ID: row.ID, ...change(row) } }));
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
      ExtraFilter: `FormID='${escapeSqlString(this.FormID)}' AND Status='Complete'`,
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
      ExtraFilter: `ResponseID='${escapeSqlString(latest.Results[0].ID)}'`,
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

  /** Create the binding and the step that runs it — one `Forms.SaveAutomation`, one transaction. */
  protected async saveBinding(): Promise<void> {
    const chosen = this.chosenEntity();
    const entity = chosen ? this.md.EntityByName(chosen.name) : undefined;
    if (!entity) {
      this.actionError.set('That entity could not be resolved.');
      return;
    }
    const name = `Send responses to ${entity.DisplayNameOrName}`;
    await this.addStep({
      FormID: this.FormID,
      Automation: { Name: name, TargetType: 'EntityBinding' },
      Binding: {
        Name: name,
        TargetEntityName: entity.Name,
        FieldMappings: JSON.stringify(this.buildFieldMappings()),
        IdentityRule: JSON.stringify(
          this.identityField()
            ? { mode: 'MatchThenCreate', match: [{ targetField: this.identityField(), normalize: 'LowerCaseTrim' }] }
            : { mode: 'AlwaysCreate' },
        ),
        MergePolicy: JSON.stringify({
          default: 'neverBlank',
          fields: Object.fromEntries(
            this.mappings().filter((m) => m.rule !== 'neverBlank').map((m) => [m.targetField, m.rule]),
          ),
        }),
        Status: 'Active',
      },
    });
  }

  /** Attach an Action or an AI Agent as a step. */
  protected async saveTarget(target: NamedTarget): Promise<void> {
    const kind = this.adding();
    if (kind !== 'action' && kind !== 'agent') {
      return;
    }
    await this.addStep({
      FormID: this.FormID,
      Automation:
        kind === 'action'
          ? { Name: target.name, TargetType: 'Action', ActionID: target.id }
          : { Name: target.name, TargetType: 'Agent', AgentID: target.id },
    });
  }

  /**
   * Add one step. The server orders it one past the highest step, runs it on complete,
   * sequentially and tolerant of failure (its create defaults) — and, when it is the form's FIRST
   * configured step, seeds the four built-in hooks as steps in the same transaction. Dispatch is
   * all-or-nothing, so without them adding one step would silently switch off the confirmation
   * email, the follow-up task, the respondent-Person upsert and the answer scoring.
   */
  private async addStep(input: FormsSaveAutomationInput): Promise<void> {
    await this.run(async () => {
      const outcome = await this.saveAutomation(input);
      if (outcome.ok) {
        this.selectedId.set(outcome.output.FormAutomationID);
        this.adding.set(null);
        this.resetAddState();
        this.noteSeeded(outcome.output.SeededAutomationIDs);
      }
      return outcome;
    });
  }

  private saveAutomation(input: FormsSaveAutomationInput) {
    const which = input.Automation.ID ? `step ${input.Automation.ID}` : 'a new step';
    return runOperation(new FormsSaveAutomationOperation(), input, `saving ${which} of form ${input.FormID}`, STEP_WRITES);
  }

  /**
   * Say why steps the author did not add just appeared. The server seeds the built-in hooks as
   * visible steps when a form starts running its own list; unexplained, four new rows read as a bug.
   */
  private noteSeeded(seededIds: readonly string[]): void {
    this.seededNote.set(
      seededIds.length > 0
        ? `This form now runs its own list of steps, so the ${seededIds.length} built-in steps it was ` +
            'already running were added to it — switch off or remove any you do not want.'
        : '',
    );
  }

  /**
   * Run one write: busy while it works, the server's refusal on screen if it fails, a reload after.
   *
   * Every write on this tab goes through here so none of them can forget the reload — a saved
   * change that leaves the list showing the old value is the bug this screen is least able to
   * afford, since the list IS the explanation of what the form does. A refusal reloads too: the
   * operations write in one transaction, so a refusal changed nothing, but the list may still have
   * been stale before it.
   */
  private async run<T>(work: () => Promise<OperationOutcome<T>>): Promise<void> {
    this.busy.set(true);
    this.actionError.set('');
    this.seededNote.set('');
    try {
      const outcome = await work();
      if (!outcome.ok) {
        this.actionError.set(outcome.error);
      }
    } catch (err) {
      LogError(err);
      this.actionError.set(err instanceof Error ? err.message : String(err));
    } finally {
      try {
        await this.loadConfigured();
      } catch (reloadErr) {
        // Reported, never allowed to replace the message the author needs: what failed, not what
        // failed while we were tidying up after it.
        LogError(reloadErr);
        if (!this.actionError()) {
          this.actionError.set(reloadErr instanceof Error ? reloadErr.message : String(reloadErr));
        }
      }
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
  rows: readonly AutomationRow[],
  read: (row: AutomationRow) => string | null,
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
  return `${column} IN (${ids.map((id) => `'${escapeSqlString(id)}'`).join(',')})`;
}

/** The four built-in hooks, as a name filter. */
function legacyActionFilter(): string {
  return LEGACY_ON_SUBMIT_AUTOMATIONS.map((d) => `Name='${escapeSqlString(d.actionName)}'`).join(' OR ');
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
