/**
 * Map authored `FormAutomation` rows to the published form they execute from.
 *
 * This lives beside the {@link PublishedFormAutomation} contract rather than in the builder,
 * because the builder is not the only thing that needs it. Publishing calls it; the live smoke
 * test calls it to construct the snapshot it exercises. When the smoke test hand-wrote that JSON
 * instead, it asserted the snapshot's CONTENTS while stepping around the code meant to produce
 * them — so it passed green against a publish path that emitted an empty array and a feature that
 * could not work. One implementation, used by both, is what makes that failure impossible to
 * repeat.
 *
 * Framework-free on purpose: a node script must be able to import it without pulling in Angular.
 */
import type {
  mjBizAppsFormsFormAutomationEntity,
  mjBizAppsFormsFormEntityBindingEntity,
} from '../generated/entity_subclasses';
import type { PublishedAutomationBinding, PublishedFormAutomation } from './form-definition';
import type { JSONValue } from './json-value';
import { BindingConfigError, parseFieldMappings, parseIdentityRule, parseMergePolicy } from './entity-binding';
import { readStoredConditionalRule } from './stored-columns';
import { UnreadableColumnError } from './snapshot-builder';

/**
 * The authored automation columns publish reads, as a `simple` RunView row.
 *
 * Every field type is derived from the generated entity rather than restated, so the value-list
 * unions (`TargetType`, `Trigger`, `ExecutionMode`) keep tracking their CHECK constraints. A
 * hand-copied union here would silently stop matching the day a migration adds a value, and the
 * symptom would be a published snapshot the parser rejects.
 */
export interface AuthoredAutomationRow {
  ID: mjBizAppsFormsFormAutomationEntity['ID'];
  Name: mjBizAppsFormsFormAutomationEntity['Name'];
  TargetType: mjBizAppsFormsFormAutomationEntity['TargetType'];
  ActionID: mjBizAppsFormsFormAutomationEntity['ActionID'];
  AgentID: mjBizAppsFormsFormAutomationEntity['AgentID'];
  BindingID: mjBizAppsFormsFormAutomationEntity['BindingID'];
  Trigger: mjBizAppsFormsFormAutomationEntity['Trigger'];
  ExecutionMode: mjBizAppsFormsFormAutomationEntity['ExecutionMode'];
  DisplayOrder: mjBizAppsFormsFormAutomationEntity['DisplayOrder'];
  ConditionalRule: mjBizAppsFormsFormAutomationEntity['ConditionalRule'];
  ContinueOnError: mjBizAppsFormsFormAutomationEntity['ContinueOnError'];
  IsActive: mjBizAppsFormsFormAutomationEntity['IsActive'];
}

/**
 * The columns {@link buildPublishedAutomations} needs — the `Fields` list publish must ask for.
 *
 * Exported so the query and the mapper cannot disagree: a `simple` RunView returns only the fields
 * it was asked for, so a column missing here arrives as `undefined` and is published as a silently
 * wrong value rather than as an error.
 */
export const AUTHORED_AUTOMATION_FIELDS: readonly (keyof AuthoredAutomationRow)[] = [
  'ID', 'Name', 'TargetType', 'ActionID', 'AgentID', 'BindingID',
  'Trigger', 'ExecutionMode', 'DisplayOrder', 'ConditionalRule', 'ContinueOnError', 'IsActive',
];

/**
 * The `FormEntityBinding` columns publish freezes into an `EntityBinding` automation.
 *
 * `Pick`ed from the generated entity for the reason {@link AuthoredAutomationRow} derives its types:
 * `Status` keeps tracking its CHECK constraint, and a renamed column fails the build here.
 */
export type AuthoredBindingRow = Pick<
  mjBizAppsFormsFormEntityBindingEntity,
  'ID' | 'Name' | 'TargetEntityName' | 'FieldMappings' | 'IdentityRule' | 'MergePolicy' | 'Status'
>;

/** The `Fields` list a `simple` RunView must ask for to build {@link AuthoredBindingRow}s. */
export const AUTHORED_BINDING_FIELDS = [
  'ID', 'Name', 'TargetEntityName', 'FieldMappings', 'IdentityRule', 'MergePolicy', 'Status',
] as const satisfies readonly (keyof AuthoredBindingRow)[];

/**
 * Map authored rows to their published form.
 *
 * Sorted by DisplayOrder so the snapshot's order is canonical — the runner sorts again by its own
 * rules (Sync before Async), but a snapshot whose order depends on however the rows came back from
 * a query is not a snapshot.
 *
 * Inactive rows are carried, not dropped: `isActive` is a state the runner honours, and dropping
 * it here would make "disabled" indistinguishable from "never configured" to anyone reading the
 * snapshot, including the author who later re-enables it.
 *
 * `bindings` is REQUIRED, like the snapshot builder's `automations`: an `EntityBinding` automation
 * publishes with its binding's settings frozen beside it (#303), and a caller that defaulted the
 * list would publish every binding automation as a refusal. Pass `[]` when the rows hold none.
 *
 * REFUSES WHAT AN ACTIVE STEP CANNOT USE: an unreadable automation rule or binding settings the
 * executor's parsers reject throw {@link UnreadableColumnError} (naming the step, the binding and
 * the column); a binding step whose binding row is missing throws {@link MissingBindingError}. Each
 * used to publish and then fail (or, for the rule, fire on every response) at submit time, in front
 * of a respondent. An INACTIVE step is carried with those parts omitted instead — see the body.
 */
export function buildPublishedAutomations(
  rows: readonly AuthoredAutomationRow[],
  bindings: readonly AuthoredBindingRow[],
): PublishedFormAutomation[] {
  const bindingById = new Map(bindings.map((binding) => [binding.ID.toLowerCase(), binding]));
  return [...rows]
    .sort((a, b) => a.DisplayOrder - b.DisplayOrder)
    .map((row) => {
      const automation: PublishedFormAutomation = {
        id: row.ID,
        name: row.Name,
        targetType: row.TargetType,
        trigger: row.Trigger,
        executionMode: row.ExecutionMode,
        displayOrder: row.DisplayOrder,
        continueOnError: row.ContinueOnError,
        isActive: row.IsActive,
      };
      // Only the id matching the target type is emitted. The parser reads all three as optional,
      // so writing a null one through would serialize a field the contract says is absent.
      if (row.ActionID) {
        automation.actionId = row.ActionID;
      }
      if (row.AgentID) {
        automation.agentId = row.AgentID;
      }
      if (row.BindingID) {
        automation.bindingId = row.BindingID;
      }
      // An INACTIVE step is frozen inactive in this version, so nothing about how it would run can
      // reach a respondent; it is carried with any unreadable rule or binding omitted rather than
      // blocking the publish. Re-enabling it takes another publish, which is strict again.
      const strict = row.IsActive;
      const conditional = readStoredConditionalRule(row.ConditionalRule);
      if (!conditional.ok && strict) {
        throw new UnreadableColumnError(`${automationLabel(row)} ConditionalRule`, conditional.reason);
      }
      if (conditional.ok && conditional.value) {
        automation.conditionalRule = conditional.value;
      }
      if (row.TargetType === 'EntityBinding') {
        const binding = frozenBinding(row, bindingById, strict);
        if (binding) {
          automation.binding = binding;
        }
      }
      return automation;
    });
}

/** The outcome of {@link tryBuildPublishedAutomations}. */
export type PublishedAutomationsBuild =
  | { readonly ok: true; readonly automations: PublishedFormAutomation[] }
  | { readonly ok: false; readonly error: UnreadableColumnError | MissingBindingError };

/**
 * {@link buildPublishedAutomations}, with an unreadable column returned as a result — for a caller
 * that must go on working when the automations cannot publish (the builder's draft fingerprint).
 * Catches ONLY {@link UnreadableColumnError} and {@link MissingBindingError}; anything else is a bug
 * and propagates.
 */
export function tryBuildPublishedAutomations(
  ...args: Parameters<typeof buildPublishedAutomations>
): PublishedAutomationsBuild {
  try {
    return { ok: true, automations: buildPublishedAutomations(...args) };
  } catch (err) {
    if (err instanceof UnreadableColumnError || err instanceof MissingBindingError) {
      return { ok: false, error: err };
    }
    throw err;
  }
}

function automationLabel(row: Pick<AuthoredAutomationRow, 'ID' | 'Name'>): string {
  return `automation "${row.Name}" (${row.ID})`;
}

/**
 * An `EntityBinding` step whose binding row does not exist — not a column that "cannot be read", so
 * it says what is actually wrong and what to do. Caught alongside {@link UnreadableColumnError} by
 * {@link tryBuildPublishedAutomations} and by publish.
 */
export class MissingBindingError extends Error {
  public readonly automationId: string;
  public readonly bindingId: string | null;

  constructor(row: Pick<AuthoredAutomationRow, 'ID' | 'Name' | 'BindingID'>) {
    super(
      row.BindingID
        ? `Cannot publish: ${automationLabel(row)} runs binding ${row.BindingID}, which no longer exists. ` +
            'Remove the step or link it to an existing binding.'
        : `Cannot publish: ${automationLabel(row)} is an entity-binding step with no binding. ` +
            'Link it to a binding or remove the step.',
    );
    this.name = 'MissingBindingError';
    this.automationId = row.ID;
    this.bindingId = row.BindingID;
  }
}

/**
 * The binding an `EntityBinding` step runs, frozen. When `strict` (an active step), a missing or
 * unreadable binding throws, naming the step and the binding; otherwise it is left out.
 */
function frozenBinding(
  row: AuthoredAutomationRow,
  bindingById: ReadonlyMap<string, AuthoredBindingRow>,
  strict: boolean,
): PublishedAutomationBinding | undefined {
  const binding = row.BindingID ? bindingById.get(row.BindingID.toLowerCase()) : undefined;
  if (!binding) {
    if (strict) {
      throw new MissingBindingError(row);
    }
    return undefined;
  }
  try {
    return publishedBinding(binding, `of ${automationLabel(row)}`);
  } catch (err) {
    if (!strict && err instanceof UnreadableColumnError) {
      return undefined;
    }
    throw err;
  }
}

/** One binding row's settings, read through the executor's parsers; `step` names who runs it. */
function publishedBinding(binding: AuthoredBindingRow, step: string): PublishedAutomationBinding {
  const column = (name: string): string => `binding "${binding.Name}" (${binding.ID}) ${name} ${step}`;
  return {
    targetEntityName: binding.TargetEntityName,
    fieldMappings: readBindingColumn(binding.FieldMappings, parseFieldMappings, column('FieldMappings')),
    identityRule: readBindingColumn(binding.IdentityRule, parseIdentityRule, column('IdentityRule')),
    mergePolicy: readBindingColumn(binding.MergePolicy, parseMergePolicy, column('MergePolicy')),
    status: binding.Status,
  };
}

/**
 * One binding settings column through the executor's own parser, or a throw naming the column.
 *
 * The same parsers the binding executor runs at submit time — so a column that would fail there is
 * refused here, while an author is still looking, rather than failing for a respondent later.
 * Catches only the two failures a stored column can produce (bad JSON, a shape the parser
 * rejects); anything else is a bug and propagates.
 */
function readBindingColumn<T>(
  raw: string | null,
  parse: (value: JSONValue | null) => T,
  column: string,
): T {
  let value: JSONValue | null = null;
  if (raw !== null && raw.trim() !== '') {
    try {
      value = JSON.parse(raw) as JSONValue;
    } catch (err) {
      throw new UnreadableColumnError(column, `not valid JSON (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  try {
    return parse(value);
  } catch (err) {
    if (err instanceof BindingConfigError) {
      throw new UnreadableColumnError(column, err.message);
    }
    throw err;
  }
}
