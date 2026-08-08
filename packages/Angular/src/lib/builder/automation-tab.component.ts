import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Metadata, RunView } from '@memberjunction/core';
import type { EntityFieldInfo, EntityInfo } from '@memberjunction/core';
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
          What runs when someone completes this form. Changes take effect when you republish —
          automations run from the published snapshot, so a response always runs the configuration
          its own version was published with.
        </p>
      </header>

      @if (loading()) {
        <p class="fb-hint">Loading…</p>
      } @else {
        <!-- Configured automations -->
        @if (automations().length === 0) {
          <p class="fb-empty">Nothing runs on submit yet.</p>
        } @else {
          <ul class="fb-list">
            @for (a of automations(); track a.ID) {
              <li class="fb-list-row">
                <span class="fb-badge">{{ a.TargetType }}</span>
                <span class="fb-list-name">{{ a.Name }}</span>
                <span class="fb-hint">{{ a.Trigger }} · {{ a.ExecutionMode }} · order {{ a.DisplayOrder }}</span>
                <span class="fb-hint" [class.is-off]="!a.IsActive">{{ a.IsActive ? 'Active' : 'Disabled' }}</span>
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
          <p class="fb-hint">Map each answer to a field. Unmapped fields are left alone.</p>
          <table class="fb-map">
            <thead>
              <tr><th>Field</th><th>Answer</th><th>Required</th></tr>
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

          @if (error()) { <p class="fb-error">{{ error() }}</p> }

          <div class="fb-actions">
            <button type="button" class="fb-btn" [disabled]="!canSave()" (click)="save()">Add binding</button>
          </div>
        }
      }
    </section>
  `,
  styles: [`
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
    .fb-actions { margin-top: var(--mj-space-4, 1rem); }
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

  protected setMapping(fieldName: string, questionId: string): void {
    this.mappings = this.mappings.filter((m) => m.targetField !== fieldName);
    if (questionId) {
      this.mappings.push({ targetField: fieldName, questionId, required: false });
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

  protected canSave(): boolean {
    return Boolean(this.selectedEntityName) && this.mappings.length > 0;
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
    binding.FieldMappings = JSON.stringify({
      version: 1,
      fields: this.mappings.map((m) => ({
        targetField: m.targetField,
        source: { kind: 'question', questionId: m.questionId },
        ...(m.required ? { required: true } : {}),
      })),
    });
    binding.IdentityRule = JSON.stringify(
      this.identityField
        ? { mode: 'MatchThenCreate', match: [{ targetField: this.identityField, normalize: 'LowerCaseTrim' }] }
        : { mode: 'AlwaysCreate' },
    );
    binding.MergePolicy = JSON.stringify({ default: 'neverBlank' });
    binding.Status = 'Active';
    if (!(await binding.Save())) {
      this.error.set(binding.LatestResult?.CompleteMessage ?? 'Saving the binding failed.');
      return;
    }

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
    automation.DisplayOrder = this.automations().length + 1;
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
