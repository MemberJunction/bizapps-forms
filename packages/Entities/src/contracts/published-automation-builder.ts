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
import type { ConditionalRule } from './conditional-rule';
import type { mjBizAppsFormsFormAutomationEntity } from '../generated/entity_subclasses';
import type { PublishedFormAutomation } from './form-definition';

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
 * Map authored rows to their published form.
 *
 * Sorted by DisplayOrder so the snapshot's order is canonical — the runner sorts again by its own
 * rules (Sync before Async), but a snapshot whose order depends on however the rows came back from
 * a query is not a snapshot.
 *
 * Inactive rows are carried, not dropped: `isActive` is a state the runner honours, and dropping
 * it here would make "disabled" indistinguishable from "never configured" to anyone reading the
 * snapshot, including the author who later re-enables it.
 */
export function buildPublishedAutomations(
  rows: readonly AuthoredAutomationRow[],
): PublishedFormAutomation[] {
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
      const conditional = parseConditionalRuleJson(row.ConditionalRule);
      if (conditional) {
        automation.conditionalRule = conditional;
      }
      return automation;
    });
}

/**
 * Read a stored conditional rule, treating anything unreadable as absent.
 *
 * Absent means "always fires", which matches the contract. The alternative — publishing a
 * half-understood rule — would gate a side effect on a condition nobody authored.
 */
function parseConditionalRuleJson(raw: string | null): ConditionalRule | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ConditionalRule)
      : undefined;
  } catch {
    return undefined;
  }
}
