/**
 * Forms home data service.
 *
 * Read path: pure `RunViews` (`ResultType: 'simple'`) — the grid of forms with
 * their category and response counts (FORMS_BUILD_PLAN §8.1: no new infra).
 *
 * Authoring path: resolves a Forms authoring/template Action by name and runs it
 * server-side via `GraphQLActionClient`, returning the new `FormID` so the
 * dashboard can open the created form in the WP-D builder. No Forms entity is
 * mutated client-side, so this stays independent of generated Forms types.
 */
import { Injectable } from '@angular/core';
import { RunView, type RunViewResult } from '@memberjunction/core';
import type { MJActionEntityType } from '@memberjunction/core-entities';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

import {
  HOME_ENTITY,
  type FormCategorySimpleRecord,
  type FormResponseSimpleRecord,
  type FormSimpleRecord,
  type FormSummaryRow,
} from './home-models';
import { buildFormRows, readFormIdFromParams } from './home-aggregations';

/** Outcome of running an authoring/template action. */
export interface AuthoringResult {
  success: boolean;
  formId: string | null;
  message: string;
}

@Injectable()
export class FormsHomeService {
  private readonly rv = new RunView();

  /** Loads the full Forms grid in one batched round-trip. */
  public async loadForms(): Promise<FormSummaryRow[]> {
    const [formsRes, catsRes, responsesRes] = (await this.rv.RunViews([
      {
        EntityName: HOME_ENTITY.forms,
        ResultType: 'simple',
        Fields: ['ID', 'Name', 'Status', 'CategoryID', '__mj_UpdatedAt'],
        OrderBy: 'Name',
      },
      {
        EntityName: HOME_ENTITY.categories,
        ResultType: 'simple',
        Fields: ['ID', 'Name'],
      },
      {
        EntityName: HOME_ENTITY.responses,
        ResultType: 'simple',
        Fields: ['FormID'],
      },
    ])) as [
      RunViewResult<FormSimpleRecord>,
      RunViewResult<FormCategorySimpleRecord>,
      RunViewResult<FormResponseSimpleRecord>,
    ];

    if (!formsRes.Success) {
      throw new Error(formsRes.ErrorMessage || 'Failed to load forms.');
    }
    // Categories / responses are enrichment-only; degrade gracefully if absent.
    const cats = catsRes.Success ? catsRes.Results : [];
    const responses = responsesRes.Success ? responsesRes.Results : [];
    return buildFormRows(formsRes.Results, cats, responses);
  }

  /**
   * Runs an authoring/template Action by name with the given input params and
   * returns the created form id from the action's output params.
   */
  public async runAuthoringAction(
    actionName: string,
    inputs: ActionParam[],
  ): Promise<AuthoringResult> {
    const actionId = await this.resolveActionId(actionName);
    if (!actionId) {
      return { success: false, formId: null, message: `Action '${actionName}' is not installed.` };
    }
    const client = new GraphQLActionClient(GraphQLDataProvider.Instance);
    const result: ActionResult = await client.RunAction(actionId, inputs);
    if (!result.Success) {
      return {
        success: false,
        formId: null,
        message: result.Message || 'The action did not complete successfully.',
      };
    }
    return {
      success: true,
      formId: readFormIdFromParams(result.Params),
      message: result.Message || 'Form created.',
    };
  }

  /** Looks up the Action record id by its registered name. */
  private async resolveActionId(actionName: string): Promise<string | null> {
    const res = (await this.rv.RunView({
      EntityName: HOME_ENTITY.actions,
      ResultType: 'simple',
      Fields: ['ID', 'Name'],
      ExtraFilter: `Name='${actionName.replace(/'/g, "''")}'`,
      MaxRows: 1,
    })) as RunViewResult<MJActionEntityType>;
    if (!res.Success || res.Results.length === 0) {
      return null;
    }
    return res.Results[0].ID ?? null;
  }
}
