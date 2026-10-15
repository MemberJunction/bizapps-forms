/**
 * Run an MJ Action by its registered name from the browser.
 *
 * Forms home starts a form two ways that stay Actions (spec #303 §9): `Forms: Generate Form From
 * Brief` and, for a STARTER template, `Forms: Create Form From Template`. Both are Actions so an
 * agent or a workflow can run them too; the browser reaches them through `GraphQLActionClient`,
 * which takes an action ID — so the name is resolved first. Interpreting the result (which form
 * was created) is the caller's business.
 */
import { LogError, RunView } from '@memberjunction/core';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';

const ACTIONS_ENTITY = 'MJ: Actions';

/** The action ran (and here is what it said), or why it could not be run. */
export type ActionRunOutcome = { ok: true; result: ActionResult } | { ok: false; message: string };

/**
 * Resolve `actionName` and run it with `inputs`. A failed run comes back as the action's own
 * `Success: false` result — MJ's client reports a transport failure that way too — and only a
 * name that resolves to nothing comes back as `ok: false`.
 */
export async function runActionByName(
  actionName: string,
  inputs: ActionParam[],
  rv: Pick<RunView, 'RunView'> = new RunView(),
): Promise<ActionRunOutcome> {
  const lookup = await rv.RunView<{ ID: string }>({
    EntityName: ACTIONS_ENTITY,
    ResultType: 'simple',
    Fields: ['ID'],
    ExtraFilter: `Name=${quoteSqlString(actionName)}`,
    MaxRows: 1,
  });
  if (!lookup.Success) {
    LogError(`Could not look up the action '${actionName}': ${lookup.ErrorMessage}`);
    return { ok: false, message: `Action '${actionName}' could not be looked up.` };
  }
  const actionId = lookup.Results[0]?.ID;
  if (!actionId) {
    return { ok: false, message: `Action '${actionName}' is not installed.` };
  }
  const result = await new GraphQLActionClient(GraphQLDataProvider.Instance).RunAction(actionId, inputs);
  return { ok: true, result };
}
