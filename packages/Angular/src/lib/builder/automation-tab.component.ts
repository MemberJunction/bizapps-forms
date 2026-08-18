import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Metadata, RunView } from '@memberjunction/core';
import type { EntityFieldInfo, EntityInfo } from '@memberjunction/core';
import {
  CanonicalAnswers,
  LEGACY_ON_SUBMIT_AUTOMATIONS,
  resolveMappedValues,
  type FieldMappings,
  type MergeRule,
  type StoredAnswerRow,
} from '@mj-biz-apps/forms-entities';
import type {
  mjBizAppsFormsFormAutomationEntity,
  mjBizAppsFormsFormEntityBindingEntity,
  mjBizAppsFormsFormAutomationRunEntity,
} from '@mj-biz-apps/forms-entities';

/** A question the author can map from, in display order. */
export interface MappableQuestion {
  id: string;
  prompt: string;
  type: string;
}

/** One row of the mapping editor: a target field and the question feeding it. */
interface MappingRow {
  targetField: string;
  questionId: string;
  required: boolean;
  rule: MergeRule;
}

/**
 * The builder's "On Submit" tab: what happens after a respondent presses submit.
 *
 * The mapping editor is driven from entity METADATA rather than free text — you pick an entity and
 * it shows you its writable fields. That is not a convenience: `BaseEntity.Set` ignores a field
 * that does not exist, so a mistyped column name in a hand-written mapping loses data silently on
 * every submission, and the executor's pre-flight check would only surface it once a respondent had
 * already hit it. Choosing from the real field list makes the mistake unavailable.
 *
 * Fields the entity will not accept are filtered out with the same rule the executor applies —
 * `EntityFieldInfo.ReadOnly`, which already folds in primary keys, the special date columns and
 * AllowUpdateAPI — so what the builder offers and what the server accepts cannot drift apart.
 */
@Component({
  selector: 'mjf-automation-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="fb-panel">
      <header class="fb-panel-head">
        <h2>On Submit</h2>
        <p class="fb-hint">
          What happens after someone presses submit. Two kinds of thing can run:
        </p>
        <ul class="at-explainer">
          <li>
            <strong>Save the answers into a real record</strong> — map questions onto the fields
            of an MJ entity (a Person, say) so a submission creates or updates that record, not
            just a response row. Mapped records are query-able and Skip-accessible like any
            other data.
          </li>
          <li>
            <strong>Run an Action or an AI Agent</strong> — score the submission, notify someone,
            kick off a workflow.
          </li>
        </ul>
        <p class="fb-hint">
          Changes take effect when you republish: automations run from the published snapshot, so
          a response always runs the configuration its own version was published with. Every run
          is recorded and shows up under “What this submission did” on the response.
        </p>
      </header>

      @if (loading()) {
        <p class="fb-hint">Loading…</p>
      } @else {
        <!-- Configured automations -->
        @if (automations().length === 0) {
          <p class="fb-empty">
            Nothing runs on submit yet — responses are still saved and readable on the Responses
            tab. Add a mapping or an automation below to do more with them.
          </p>
        } @else {
          <ul class="fb-list">
            @for (a of automations(); track a.ID) {
              <li class="fb-list-row">
                <span class="fb-badge">{{ a.TargetType }}</span>
                <span class="fb-list-name">{{ a.Name }}</span>
                <span class="fb-hint">{{ a.Trigger }} · {{ a.ExecutionMode }} · order {{ a.DisplayOrder }}</span>
                <span class="fb-hint" [class.is-off]="!a.IsActive">{{ a.IsActive ? 'Active' : 'Disabled' }}</span>
                <button type="button" class="fb-link" (click)="toggleActive(a)">
                  {{ a.IsActive ? 'Disable' : 'Enable' }}
                </button>
                <button type="button" class="fb-link" (click)="move(a, -1)" [disabled]="$first">Up</button>
                <button type="button" class="fb-link" (click)="move(a, 1)" [disabled]="$last">Down</button>
                <button type="button" class="fb-link is-danger" (click)="remove(a)">Remove</button>
              </li>
            }
          </ul>
        }

        <!-- Recent activity: what actually happened, including the skips. -->
        @if (runs().length > 0) {
          <h3>Recent runs</h3>
          <ul class="fb-list">
            @for (r of runs(); track r.ID) {
              <li class="fb-list-row">
                <span class="fb-badge">{{ r.Status }}</span>
                <span class="fb-hint">{{ r.ErrorMessage || r.OutputSummary || '—' }}</span>
              </li>
            }
          </ul>
        }

        <!-- Add a binding -->
        <h3>Send responses to an entity</h3>
        <label class="fb-field">
          <span>Entity</span>
          <select [(ngModel)]="selectedEntityName" (ngModelChange)="onEntityChange($event)">
            <option value="">Choose an entity…</option>
            @for (e of writableEntities(); track e.Name) {
              <option [value]="e.Name">{{ e.DisplayNameOrName }}</option>
            }
          </select>
        </label>

        @if (targetFields().length > 0) {
          <p class="fb-hint">
            Map each answer to a field. Unmapped fields are left alone.
            <button type="button" class="fb-link" (click)="autoMap()">Match by name</button>
          </p>
          <table class="fb-map">
            <thead>
              <tr><th>Field</th><th>Answer</th><th>Required</th><th>When it already has a value</th></tr>
            </thead>
            <tbody>
              @for (f of targetFields(); track f.Name) {
                <tr>
                  <td>
                    {{ f.DisplayNameOrName }}
                    @if (!f.AllowsNull) { <span class="fb-req" title="This field cannot be empty">*</span> }
                    <span class="fb-hint">{{ f.TSType }}</span>
                  </td>
                  <td>
                    <select [ngModel]="mappingFor(f.Name)" (ngModelChange)="setMapping(f.Name, $event)">
                      <option value="">—</option>
                      @for (q of compatibleQuestions(f); track q.id) {
                        <option [value]="q.id">{{ q.prompt }}</option>
                      }
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" [ngModel]="isRequired(f.Name)" (ngModelChange)="setRequired(f.Name, $event)" />
                  </td>
                  <td>
                    <select [ngModel]="ruleFor(f.Name)" (ngModelChange)="setRule(f.Name, $event)" [disabled]="!mappingFor(f.Name)">
                      <option value="neverBlank">Keep the existing value if blank</option>
                      <option value="latestWins">Always use the new answer</option>
                      <option value="writeOnce">Only fill it if empty</option>
                    </select>
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <label class="fb-field">
            <span>Match existing records on</span>
            <select [(ngModel)]="identityField">
              <option value="">Always create a new record</option>
              @for (m of mappedFieldNames(); track m) {
                <option [value]="m">{{ m }}</option>
              }
            </select>
          </label>
          <p class="fb-hint">
            Matching updates the record that already exists instead of creating a second one. Only a
            field you have mapped can be matched on — the value has to come from somewhere.
          </p>

          @if (preview().length > 0) {
            <h4>Preview against the most recent response</h4>
            <ul class="fb-list">
              @for (p of preview(); track p.field) {
                <li class="fb-list-row">
                  <span class="fb-list-name">{{ p.field }}</span>
                  <span class="fb-hint">{{ p.value }}</span>
                </li>
              }
            </ul>
          }
          @if (previewNote()) { <p class="fb-hint">{{ previewNote() }}</p> }
          @if (error()) { <p class="fb-error">{{ error() }}</p> }

          <div class="fb-actions">
            <button type="button" class="fb-btn" [disabled]="!canSave()" (click)="save()">Add binding</button>
            <button type="button" class="fb-link" [disabled]="!canSave()" (click)="dryRun()">Preview</button>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    .at-explainer { margin: 8px 0 12px; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
    .at-explainer li { font-size: 0.8125rem; line-height: 1.55; color: var(--mj-text-secondary); }
    .at-explainer strong { color: var(--mj-text-primary); }

    .fb-panel { padding: var(--mj-space-4, 1rem); color: var(--mj-text, inherit); }
    .fb-hint { color: var(--mj-text-muted, #666); font-size: 0.875rem; }
    .fb-empty { color: var(--mj-text-muted, #666); font-style: italic; }
    .fb-error { color: var(--mj-danger, #b00020); }
    .fb-list { list-style: none; padding: 0; margin: 0 0 var(--mj-space-4, 1rem); }
    .fb-list-row { display: flex; gap: var(--mj-space-2, .5rem); align-items: center; padding: var(--mj-space-2, .5rem) 0; border-bottom: 1px solid var(--mj-border, #e0e0e0); }
    .fb-list-name { font-weight: 600; }
    .fb-badge { background: var(--mj-surface-alt, #f2f2f2); border-radius: var(--mj-radius-sm, 4px); padding: 0 .5rem; font-size: .75rem; }
    .fb-map { width: 100%; border-collapse: collapse; }
    .fb-map th, .fb-map td { text-align: left; padding: var(--mj-space-2, .5rem); border-bottom: 1px solid var(--mj-border, #e0e0e0); }
    .fb-field { display: flex; flex-direction: column; gap: .25rem; margin: var(--mj-space-3, .75rem) 0; max-width: 28rem; }
    .fb-req { color: var(--mj-danger, #b00020); }
    .is-off { opacity: .6; }
    .fb-actions { margin-top: var(--mj-space-4, 1rem); display: flex; gap: var(--mj-space-3, .75rem); align-items: center; }
    .fb-link { background: none; border: 0; color: var(--mj-primary, #0b57d0); cursor: pointer; padding: 0 .25rem; font: inherit; }
    .fb-link:disabled { color: var(--mj-text-muted, #999); cursor: default; }
    .fb-link.is-danger { color: var(--mj-danger, #b00020); }
  `],
})
export class AutomationTabComponent implements OnInit {
  @Input({ required: true }) FormID!: string;
  /** The form's questions, in display order, supplied by the builder shell. */
  @Input({ required: true }) Questions: MappableQuestion[] = [];

  private readonly md = new Metadata();

  protected readonly loading = signal(true);
  protected readonly automations = signal<mjBizAppsFormsFormAutomationEntity[]>([]);
  protected readonly runs = signal<mjBizAppsFormsFormAutomationRunEntity[]>([]);
  protected readonly writableEntities = signal<EntityInfo[]>([]);
  protected readonly targetFields = signal<EntityFieldInfo[]>([]);
  protected readonly error = signal<string>('');
  protected readonly preview = signal<{ field: string; value: string }[]>([]);
  protected readonly previewNote = signal<string>('');

  protected selectedEntityName = '';
  protected identityField = '';
  private mappings: MappingRow[] = [];

  public async ngOnInit(): Promise<void> {
    // Only entities that can actually take a write are offered. An entity with creates disabled
    // would pass authoring and then fail on every submission, which is a slow way to learn.
    this.writableEntities.set(
      this.md.Entities.filter((e) => e.IncludeInAPI && !e.VirtualEntity && (e.AllowCreateAPI || e.AllowUpdateAPI))
        .slice()
        .sort((a, b) => a.DisplayNameOrName.localeCompare(b.DisplayNameOrName)),
    );
    await this.loadConfigured();
    this.loading.set(false);
  }

  private async loadConfigured(): Promise<void> {
    const rv = new RunView();
    const [autos, runs] = await rv.RunViews([
      {
        EntityName: 'MJ_BizApps_Forms: Form Automations',
        ExtraFilter: `FormID='${this.FormID}'`,
        OrderBy: 'DisplayOrder ASC',
        ResultType: 'entity_object',
      },
      {
        EntityName: 'MJ_BizApps_Forms: Form Automation Runs',
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: 10,
        ResultType: 'entity_object',
      },
    ]);
    if (autos.Success) {
      this.automations.set(autos.Results as mjBizAppsFormsFormAutomationEntity[]);
    }
    if (runs.Success) {
      this.runs.set(runs.Results as mjBizAppsFormsFormAutomationRunEntity[]);
    }
  }

  protected onEntityChange(entityName: string): void {
    this.mappings = [];
    this.identityField = '';
    const entity = entityName ? this.md.EntityByName(entityName) : undefined;
    // `ReadOnly` is the same gate the executor applies, so the builder cannot offer a field the
    // server would then refuse.
    this.targetFields.set(entity ? entity.Fields.filter((f) => !f.ReadOnly) : []);
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
    return this.mappings.find((m) => m.targetField === fieldName)?.questionId ?? '';
  }

  protected isRequired(fieldName: string): boolean {
    return this.mappings.find((m) => m.targetField === fieldName)?.required ?? false;
  }

  protected ruleFor(fieldName: string): MergeRule {
    return this.mappings.find((m) => m.targetField === fieldName)?.rule ?? 'neverBlank';
  }

  protected setRule(fieldName: string, rule: MergeRule): void {
    const row = this.mappings.find((m) => m.targetField === fieldName);
    if (row) {
      row.rule = rule;
    }
  }

  /**
   * Match answers to fields by name, the way an author would by eye.
   *
   * Compared with punctuation and case removed, because `First Name`, `firstName` and `first_name`
   * are the same intent spelled three ways. Only fills fields that are still unmapped, so pressing
   * it never undoes a deliberate choice.
   */
  protected autoMap(): void {
    const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const field of this.targetFields()) {
      if (this.mappingFor(field.Name)) {
        continue;
      }
      const target = normalize(field.Name);
      const display = normalize(field.DisplayNameOrName);
      const match = this.Questions.find((q) => {
        const prompt = normalize(q.prompt);
        return prompt === target || prompt === display;
      });
      if (match) {
        this.setMapping(field.Name, match.id);
      }
    }
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
      ExtraFilter: `FormID='${this.FormID}' AND Status='Complete'`,
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: 1,
      Fields: ['ID'],
      ResultType: 'simple',
    });
    if (!latest.Success || latest.Results.length === 0) {
      this.previewNote.set('No completed response yet to preview against.');
      return;
    }

    const answers = await new RunView().RunView<StoredAnswerRow>({
      EntityName: 'MJ_BizApps_Forms: Form Response Answers',
      ExtraFilter: `ResponseID='${latest.Results[0].ID}'`,
      ResultType: 'simple',
    });
    if (!answers.Success) {
      this.previewNote.set('That response could not be read.');
      return;
    }

    const canonical = new CanonicalAnswers(answers.Results);
    const resolved = resolveMappedValues(this.buildFieldMappings(), canonical);
    if (resolved.values.size === 0) {
      this.previewNote.set('That response supplied nothing this binding maps.');
      return;
    }
    this.preview.set(
      [...resolved.values].map(([field, value]) => ({
        field,
        value: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
      })),
    );
  }

  /** Toggle an automation on or off without deleting what the author configured. */
  protected async toggleActive(automation: mjBizAppsFormsFormAutomationEntity): Promise<void> {
    automation.IsActive = !automation.IsActive;
    if (!(await automation.Save())) {
      this.error.set(automation.LatestResult?.CompleteMessage ?? 'Could not update that automation.');
      return;
    }
    await this.loadConfigured();
  }

  /** Move an automation one position in the run order. */
  protected async move(automation: mjBizAppsFormsFormAutomationEntity, delta: number): Promise<void> {
    const ordered = this.automations();
    const index = ordered.findIndex((a) => a.ID === automation.ID);
    const swapWith = ordered[index + delta];
    if (!swapWith) {
      return;
    }
    const mine = automation.DisplayOrder;
    automation.DisplayOrder = swapWith.DisplayOrder;
    swapWith.DisplayOrder = mine;
    if (!(await automation.Save()) || !(await swapWith.Save())) {
      this.error.set('Could not reorder those automations.');
    }
    await this.loadConfigured();
  }

  /**
   * Remove an automation.
   *
   * Deletes only the automation, never the binding it points at: the binding may be referenced by
   * a ledger row recording what a past submission produced, and deleting it would leave that
   * lineage pointing at nothing. An orphaned binding is inert and re-attachable; a broken ledger
   * is not repairable.
   */
  protected async remove(automation: mjBizAppsFormsFormAutomationEntity): Promise<void> {
    if (!(await automation.Delete())) {
      this.error.set(automation.LatestResult?.CompleteMessage ?? 'Could not remove that automation.');
      return;
    }
    await this.loadConfigured();
  }

  protected setMapping(fieldName: string, questionId: string): void {
    this.mappings = this.mappings.filter((m) => m.targetField !== fieldName);
    if (questionId) {
      this.mappings.push({ targetField: fieldName, questionId, required: false, rule: 'neverBlank' });
    }
    if (this.identityField && !this.mappedFieldNames().includes(this.identityField)) {
      // Un-mapping the identity field has to clear the choice: the executor refuses a binding whose
      // identity value no mapping can supply, and leaving it selected would save a config that can
      // never match anything.
      this.identityField = '';
    }
  }

  protected setRequired(fieldName: string, required: boolean): void {
    const row = this.mappings.find((m) => m.targetField === fieldName);
    if (row) {
      row.required = required;
    }
  }

  protected mappedFieldNames(): string[] {
    return this.mappings.map((m) => m.targetField);
  }

  /** The mapping as the contract expects it — one shape, used for both preview and save. */
  private buildFieldMappings(): FieldMappings {
    return {
      version: 1,
      fields: this.mappings.map((m) => ({
        targetField: m.targetField,
        source: { kind: 'question' as const, questionId: m.questionId },
        ...(m.required ? { required: true } : {}),
      })),
    };
  }

  protected canSave(): boolean {
    return Boolean(this.selectedEntityName) && this.mappings.length > 0;
  }

  /**
   * Write the legacy on-submit defaults as automations, if this form has none yet.
   *
   * Returns how many were seeded so the caller can order itself after them. A default whose Action
   * is not registered in this deployment is skipped rather than failing the save — it was not
   * running before either, since the legacy runner also resolves by name and skips what it cannot
   * find, so skipping preserves the behaviour instead of inventing a new failure.
   */
  private async seedLegacyDefaultsIfFirst(): Promise<number> {
    if (this.automations().length > 0) {
      return 0;
    }
    const actions = await new RunView().RunView<{ ID: string; Name: string }>({
      EntityName: 'MJ: Actions',
      ExtraFilter: LEGACY_ON_SUBMIT_AUTOMATIONS.map((d) => `Name='${d.actionName.replace(/'/g, "''")}'`).join(' OR '),
      Fields: ['ID', 'Name'],
      ResultType: 'simple',
    });
    if (!actions.Success) {
      return 0;
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
      // Sync and best-effort, matching how the legacy runner fired them: sequentially, with a
      // failure logged and the rest continuing.
      row.ExecutionMode = 'Sync';
      row.DisplayOrder = legacy.displayOrder;
      row.ContinueOnError = true;
      row.IsActive = true;
      if (await row.Save()) {
        seeded += 1;
      }
    }
    return seeded;
  }

  /** Create the binding and the automation that runs it. */
  protected async save(): Promise<void> {
    this.error.set('');
    const entity = this.md.EntityByName(this.selectedEntityName);
    if (!entity) {
      this.error.set('That entity could not be resolved.');
      return;
    }

    const binding = await this.md.GetEntityObject<mjBizAppsFormsFormEntityBindingEntity>(
      'MJ_BizApps_Forms: Form Entity Bindings',
    );
    if (!binding) {
      this.error.set('Could not create the binding record.');
      return;
    }
    binding.NewRecord();
    binding.FormID = this.FormID;
    binding.Name = `Send responses to ${entity.DisplayNameOrName}`;
    binding.TargetEntityID = entity.ID;
    binding.TargetEntityName = entity.Name;
    binding.FieldMappings = JSON.stringify(this.buildFieldMappings());
    binding.IdentityRule = JSON.stringify(
      this.identityField
        ? { mode: 'MatchThenCreate', match: [{ targetField: this.identityField, normalize: 'LowerCaseTrim' }] }
        : { mode: 'AlwaysCreate' },
    );
    binding.MergePolicy = JSON.stringify({
      default: 'neverBlank',
      fields: Object.fromEntries(
        this.mappings.filter((m) => m.rule !== 'neverBlank').map((m) => [m.targetField, m.rule]),
      ),
    });
    binding.Status = 'Active';
    if (!(await binding.Save())) {
      this.error.set(binding.LatestResult?.CompleteMessage ?? 'Saving the binding failed.');
      return;
    }

    // Adding the first automation switches this form off the legacy hard-coded hook list — dispatch
    // is all-or-nothing — so the four defaults are written first. Without this, adding a binding
    // would silently stop the confirmation email and the follow-up task. Seeded as ordinary rows,
    // so the author can see them and turn any of them off deliberately.
    const seeded = await this.seedLegacyDefaultsIfFirst();

    const automation = await this.md.GetEntityObject<mjBizAppsFormsFormAutomationEntity>(
      'MJ_BizApps_Forms: Form Automations',
    );
    if (!automation) {
      this.error.set('The binding was saved but its automation could not be created.');
      return;
    }
    automation.NewRecord();
    automation.FormID = this.FormID;
    automation.Name = binding.Name;
    automation.TargetType = 'EntityBinding';
    automation.BindingID = binding.ID;
    automation.Trigger = 'OnComplete';
    // Sync so anything configured after it can rely on the record existing — the confirmation email
    // that reports it, or a follow-up task that links to it.
    automation.ExecutionMode = 'Sync';
    automation.DisplayOrder = this.automations().length + seeded + 1;
    automation.ContinueOnError = true;
    automation.IsActive = true;
    if (!(await automation.Save())) {
      this.error.set(automation.LatestResult?.CompleteMessage ?? 'Saving the automation failed.');
      return;
    }

    this.selectedEntityName = '';
    this.targetFields.set([]);
    this.mappings = [];
    this.identityField = '';
    await this.loadConfigured();
  }
}
