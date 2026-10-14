/**
 * No-AI authoring action: **Forms: Create Form From Template**.
 *
 * Instantiates a starter gallery template into a live Draft form via the same deterministic
 * Builder the AI path uses (`FormAuthoringEngine.BuildFromBlueprint`, one transaction). The key is
 * expanded by `FormAuthoringEngine.GetStarterBlueprint` — the lookup the `Forms.CreateFormFromTemplate`
 * operation uses too, so an unknown key is refused in the same words whichever is called. This is the
 * "easy setup" path for users who don't want to write a brief.
 *
 * Input params:
 *   - `TemplateKey` (string, required) — one of the starter gallery keys
 *      (e.g. `contact`, `rsvp`, `nps`, `lead-capture`, `application`).
 *   - `Name` (string, optional) — overrides the template's default form name.
 *   - `OwnerUserID` (string, optional) — stamped on the created Form. Omitted: the caller, as the
 *      operation does.
 *   - `OnSubmitMode` ('Legacy' | 'Configured', optional) — whether this form's own automations
 *      are what run on submit. `Configured` with no `Automations` is the supported way to run
 *      NOTHING, which is how a consumer that owns its own subject identity declines
 *      `Forms: Upsert Respondent Person` (bizapps-forms#47). Omitted keeps the historical
 *      inference, so an existing caller's forms are unaffected.
 *   - `Automations` (JSON array, optional) — the on-submit steps this form runs, in order, each
 *      naming an MJ Action. Supplying it implies `Configured`.
 *   - `PublishImmediately` (boolean, optional, default false) — publish the form in the same
 *      transaction, so the caller gets a published form or nothing (#303).
 * Output params: `FormID`, `PageCount`, `QuestionCount`, `OptionCount`, `AutomationCount`.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import type { FormBlueprint } from '@mj-biz-apps/forms-entities';
import { FormAuthoringEngine, FormAuthoringError } from '@mj-biz-apps/forms-core-entities-server';
import { buildForm, describeBuilt, onActionProvider, prepareAuthoring } from '../authoring/persist-blueprint';
import { getStringParam } from '../shared/action-params';
import { OnSubmitConfigError, withOnSubmitConfig } from '../authoring/on-submit-config';

const ACTION_NAME = 'Forms: Create Form From Template';

@RegisterClass(BaseAction, ACTION_NAME)
export class CreateFormFromTemplateAction extends BaseAction {
  /**
   * Runs from the browser (Forms home) through MJ's `RunAction`, which refuses a non-Owner any
   * action that neither has an `MJ: Action Authorizations` link nor declares this. It is safe here:
   * `prepareAuthoring` refuses a caller who may not author forms (`refuseFormAuthoring`) before any
   * work, and the form is written with the caller's own permissions — that check is the one
   * authoring decision.
   */
  public static readonly AuthorizesCaller = true;

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const key = getStringParam(params, 'TemplateKey');
    if (!key) {
      return fail('TemplateKey parameter is required', 'MISSING_PARAMETERS');
    }

    let starter: FormBlueprint;
    try {
      starter = FormAuthoringEngine.Instance.GetStarterBlueprint(key, getStringParam(params, 'Name'));
    } catch (error) {
      if (error instanceof FormAuthoringError) {
        return fail(error.message, 'UNKNOWN_TEMPLATE');
      }
      throw error;
    }

    const prepared = prepareAuthoring(params, ACTION_NAME);
    if (!prepared.ok) {
      return prepared.result;
    }
    let blueprint: FormBlueprint;
    try {
      blueprint = withOnSubmitConfig(starter, prepared.value.onSubmit);
    } catch (error) {
      const code = error instanceof OnSubmitConfigError ? 'INVALID_ON_SUBMIT_CONFIG' : 'FAILED';
      return fail(asText(error), code);
    }

    return onActionProvider(params, ACTION_NAME, async (provider) => {
      // The caller owns what it creates unless it names an owner — the operation's rule too.
      const request = { ...prepared.value, ownerUserId: prepared.value.ownerUserId ?? params.ContextUser?.ID };
      const built = await buildForm(params, provider, blueprint, request, ACTION_NAME);
      if (!built.ok) {
        return built.result;
      }
      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Created form "${blueprint.name}" from template "${key}", ${describeBuilt(built.value)}.`,
      };
    });
  }
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string, resultCode: string): ActionResultSimple {
  return { Success: false, Message: message, ResultCode: resultCode };
}
