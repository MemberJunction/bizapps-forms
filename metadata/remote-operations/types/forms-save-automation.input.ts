/**
 * Input for `Forms.SaveAutomation`: create or update one on-submit step, together with the entity
 * binding it runs when it is a "send responses to a record" step.
 *
 * One transaction covers everything the builder used to do in separate saves: the binding, the four
 * built-in steps seeded when this is the form's first configured step, the step itself, and the
 * form-settings mark that makes the form's own automations authoritative.
 *
 * CREATE versus UPDATE is the presence of `ID`, and each has its own shape so the fields a create
 * needs cannot be forgotten. On create an omitted optional field takes the default named on it; on
 * update an omitted field keeps its stored value. JSON-bearing fields are JSON TEXT, parsed and
 * validated server-side with the contracts' strict parsers, so this contract does not depend on the
 * contracts types.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** Step fields that may be set on create or changed on update. */
export interface FormsAutomationFields {
    /** Author's note. `null` clears it. */
    Description?: string | null;
    /** The `MJ: Actions` row to run. Required when TargetType is Action. */
    ActionID?: string | null;
    /** The `MJ: AI Agents` row to run. Required when TargetType is Agent. */
    AgentID?: string | null;
    /** Which submissions fire it (the `FormAutomation.Trigger` CHECK values). Default on create: OnComplete. */
    Trigger?: 'OnComplete' | 'OnCompleteOrPartial' | 'OnPartial';
    /** Sequential (Sync) steps always run before background (Async) ones. Default on create: Sync. */
    ExecutionMode?: 'Sync' | 'Async';
    /** JSON text of a ConditionalRule gating the step. `null` clears it (always runs). */
    ConditionalRule?: string | null;
    /** JSON text mapping answers to the target's parameters. `null` clears it. */
    ParameterMapping?: string | null;
    /** Whether a failure lets later steps run. Default on create: true. */
    ContinueOnError?: boolean;
    /** Per-step timeout in milliseconds. `null`: the runner's default. */
    TimeoutMS?: number | null;
    /** Whether the step runs at all. Default on create: true. */
    IsActive?: boolean;
}

/** A new step, ordered one past the form's highest DisplayOrder. */
export interface FormsNewAutomation extends FormsAutomationFields {
    /** Absent: this is a create. */
    ID?: never;
    /** Display name. */
    Name: string;
    /** What the step runs (the `FormAutomation.TargetType` CHECK values). Fixed once created. */
    TargetType: 'Action' | 'Agent' | 'EntityBinding';
}

/** A change to an existing step of the same form. */
export interface FormsAutomationUpdate extends FormsAutomationFields {
    /** The step to update. */
    ID: string;
    /** New display name. Omitted: unchanged. */
    Name?: string;
    /** Not changeable: remove the step and add another instead. */
    TargetType?: never;
}

/** The automation step to write (a `MJ_BizApps_Forms: Form Automations` row). */
export type FormsAutomationDraft = FormsNewAutomation | FormsAutomationUpdate;

/** Binding fields that may be set on create or changed on update. */
export interface FormsEntityBindingFields {
    /** Author's note. `null` clears it. */
    Description?: string | null;
    /** JSON text of the per-field merge policy. `null` clears it. */
    MergePolicy?: string | null;
    /** Kill switch read at run time (the `FormEntityBinding.Status` CHECK values). Default on create: Active. */
    Status?: 'Active' | 'Disabled';
}

/** A new binding for this form. */
export interface FormsNewEntityBinding extends FormsEntityBindingFields {
    /** Absent: this is a create. */
    ID?: never;
    /** Display name. Omitted: derived from the target entity. */
    Name?: string;
    /** The MJ entity name records are written to; the server resolves and stores its id. */
    TargetEntityName: string;
    /** JSON text of the answer-to-field mappings. */
    FieldMappings: string;
    /** JSON text of the identity rule (AlwaysCreate, or MatchThenCreate on named fields). */
    IdentityRule: string;
}

/** A change to the binding the step already runs. */
export interface FormsEntityBindingUpdate extends FormsEntityBindingFields {
    /** The binding to update; must be the one the step runs. */
    ID: string;
    /** New display name. Omitted: unchanged. */
    Name?: string;
    /** Not changeable: a binding writes to one entity for life. */
    TargetEntityName?: never;
    /** New JSON text of the answer-to-field mappings. Omitted: unchanged. */
    FieldMappings?: string;
    /** New JSON text of the identity rule. Omitted: unchanged. */
    IdentityRule?: string;
}

/** The entity binding an EntityBinding step runs (a `MJ_BizApps_Forms: Form Entity Bindings` row). */
export type FormsEntityBindingDraft = FormsNewEntityBinding | FormsEntityBindingUpdate;

export interface FormsSaveAutomationInput {
    /** The form that owns the step. An update to a step of a different form is refused. */
    FormID: string;
    /** The step to create or update. */
    Automation: FormsAutomationDraft;
    /** Required to create an EntityBinding step; refused for Action and Agent steps. Omitted on update: the step keeps its binding. */
    Binding?: FormsEntityBindingDraft;
}
