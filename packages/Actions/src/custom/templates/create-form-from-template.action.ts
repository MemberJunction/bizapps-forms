/**
 * No-AI authoring action: **Forms: Create Form From Template**.
 *
 * Instantiates one of the {@link STARTER_TEMPLATES} into a live Draft form via the
 * same deterministic Builder the AI path uses (`FormAuthoringEngine.BuildFromBlueprint`, one
 * transaction). This is the "easy setup" path for users who don't want to write a brief.
 *
 * Input params:
 *   - `TemplateKey` (string, required) — one of the starter gallery keys
 *      (e.g. `contact`, `rsvp`, `nps`, `lead-capture`, `application`).
 *   - `Name` (string, optional) — overrides the template's default form name.
 *   - `OwnerUserID` (string, optional) — stamped on the created Form.
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
import { buildForm, describeBuilt, onActionProvider, prepareAuthoring } from '../authoring/persist-blueprint';
import { getStringParam } from '../shared/action-params';
import { STARTER_TEMPLATES, getStarterTemplate } from './starter-templates';
import { OnSubmitConfigError, withOnSubmitConfig } from '../authoring/on-submit-config';

const ACTION_NAME = 'Forms: Create Form From Template';

@RegisterClass(BaseAction, ACTION_NAME)
export class CreateFormFromTemplateAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const key = getStringParam(params, 'TemplateKey');
    if (!key) {
      return fail('TemplateKey parameter is required', 'MISSING_PARAMETERS');
    }

    const template = getStarterTemplate(key);
    if (!template) {
      const known = STARTER_TEMPLATES.map((t) => t.key).join(', ');
      return fail(`Unknown TemplateKey '${key}'. Known templates: ${known}.`, 'UNKNOWN_TEMPLATE');
    }

    const prepared = prepareAuthoring(params, ACTION_NAME);
    if (!prepared.ok) {
      return prepared.result;
    }
    let blueprint: FormBlueprint;
    try {
      blueprint = withOnSubmitConfig(withName(template.blueprint, getStringParam(params, 'Name')), prepared.value.onSubmit);
    } catch (error) {
      const code = error instanceof OnSubmitConfigError ? 'INVALID_ON_SUBMIT_CONFIG' : 'FAILED';
      return fail(asText(error), code);
    }

    return onActionProvider(params, ACTION_NAME, async (provider) => {
      const built = await buildForm(params, provider, blueprint, prepared.value, ACTION_NAME);
      if (!built.ok) {
        return built.result;
      }
      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Created form "${blueprint.name}" from template "${template.key}", ${describeBuilt(built.value)}.`,
      };
    });
  }
}

/** Return a copy of the blueprint with an overridden name (or the original if none). */
function withName(blueprint: FormBlueprint, name: string | undefined): FormBlueprint {
  if (!name) {
    return blueprint;
  }
  return { ...blueprint, name };
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string, resultCode: string): ActionResultSimple {
  return { Success: false, Message: message, ResultCode: resultCode };
}
