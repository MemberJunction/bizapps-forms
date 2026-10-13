/**
 * AI authoring action: **Forms: Generate Form From Brief** (FORMS_BUILD_PLAN §7).
 *
 * From a natural-language brief — e.g. "a 5-question event RSVP with dietary
 * restrictions and a +1 count" — this drafts a complete Form / FormPage /
 * FormQuestion / FormQuestionOption set in one transaction, and publishes it too when
 * `PublishImmediately` is set.
 *
 * It reuses the deterministic Designer→Builder split proven by MJ's Form Builder
 * agent: the LLM (Designer) emits a structured JSON {@link FormBlueprint}; the Builder —
 * `FormAuthoringEngine.BuildFromBlueprint` in forms-core-entities-server — validates it
 * against the §5.3 taxonomy and persists it in one transaction. The model is chosen by
 * MemberJunction from the 'Forms: Form Designer' AI Prompt's metadata — there is no model
 * or vendor name in code (see {@link AIPromptFormDesignerModel}).
 *
 * Input params:
 *   - `Brief` (string, required) — the natural-language description.
 *   - `OwnerUserID` (string, optional) — stamped on the created Form.
 *   - `OnSubmitMode` ('Legacy' | 'Configured', optional) — whether this form's own automations
 *      are what run on submit. `Configured` with no `Automations` is the supported way to run
 *      NOTHING, which is how a consumer that owns its own subject identity declines
 *      `Forms: Upsert Respondent Person` (bizapps-forms#47). Omitted keeps the historical
 *      inference, so an existing caller's forms are unaffected.
 *   - `Automations` (JSON array, optional) — the on-submit steps this form runs, in order, each
 *      naming an MJ Action. Supplying it implies `Configured`. These are the CALLER's, not the
 *      Designer's: the LLM authors questions, never side effects.
 *   - `PublishImmediately` (boolean, optional, default false) — publish the form in the same
 *      transaction, so the caller gets a published form or nothing (#303).
 * Output params:
 *   - `FormID` (created id)
 *   - `PageCount`, `QuestionCount`, `OptionCount`, `AutomationCount`
 *   - `Blueprint` (the validated blueprint object, for inspection/preview — set even when the
 *     build fails, so the Designer's work is not lost with it)
 *
 * Refused BEFORE the Designer runs: the `PublishImmediately` flag, the on-submit params, the
 * caller (never an anonymous or magic-link session; Update on Forms required) and the provider
 * are all checked first, so no model call is spent on a request that was always going to fail.
 *
 * The brief→persist path is testable with a stubbed {@link FormDesignerModel}
 * (no network/API key) — see `__tests__/authoring-actions.spec.ts` and
 * `__tests__/publish-three-ways.spec.ts`.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { DatabaseProviderBase } from '@memberjunction/core';
import type { FormBlueprint } from '@mj-biz-apps/forms-entities';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { OnSubmitConfigError, withOnSubmitConfig } from './on-submit-config';
import { buildForm, describeBuilt, onActionProvider, prepareAuthoring, type AuthoringRequest } from './persist-blueprint';
import {
  AIPromptFormDesignerModel,
  designFormFromBrief,
  type FormDesignerModel,
} from './llm-form-designer';

const ACTION_NAME = 'Forms: Generate Form From Brief';

let activeDesignerModel: FormDesignerModel = new AIPromptFormDesignerModel();

/** Override the Designer model (e.g. a deterministic stub in tests). */
export function setFormDesignerModel(model: FormDesignerModel): void {
  activeDesignerModel = model;
}

@RegisterClass(BaseAction, ACTION_NAME)
export class GenerateFormFromBriefAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const brief = getStringParam(params, 'Brief');
    if (!brief) {
      return fail('Brief parameter is required', 'MISSING_PARAMETERS');
    }
    // Everything that can refuse, before the Designer's LLM call — see `prepareAuthoring`.
    const prepared = prepareAuthoring(params, ACTION_NAME);
    if (!prepared.ok) {
      return prepared.result;
    }
    return onActionProvider(params, ACTION_NAME, (provider) =>
      runAuthoring(brief, params, params.ContextUser, provider, prepared.value),
    );
  }
}

/**
 * The authoring pipeline once the request is accepted (also usable directly from tests):
 * Designer → validated blueprint with the caller's on-submit config → `FormAuthoringEngine` → output
 * params.
 */
export async function runAuthoring(
  brief: string,
  params: RunActionParams,
  contextUser: UserInfo,
  provider: DatabaseProviderBase,
  request: AuthoringRequest,
): Promise<ActionResultSimple> {
  let blueprint: FormBlueprint;
  try {
    blueprint = await designFormFromBrief(brief, activeDesignerModel, contextUser);
  } catch (error) {
    return fail(`AI form design failed: ${asText(error)}`, 'DESIGN_FAILED');
  }

  try {
    // The params were validated up front; what can still fail here is the PAIR, when the Designer's
    // own blueprint says `Legacy` and the caller supplied steps.
    blueprint = withOnSubmitConfig(blueprint, request.onSubmit);
  } catch (error) {
    const code = error instanceof OnSubmitConfigError ? 'INVALID_ON_SUBMIT_CONFIG' : 'FAILED';
    return fail(asText(error), code);
  }

  // Set before the build, so the Designer's work is not lost with a failed build.
  setOutputParam(params, 'Blueprint', blueprint);
  const built = await buildForm(params, provider, blueprint, request, ACTION_NAME);
  if (!built.ok) {
    return built.result;
  }
  return {
    Success: true,
    ResultCode: 'SUCCESS',
    Message:
      `Generated form "${blueprint.name}" (${built.value.questionCount} questions across ${built.value.pageCount} page(s)), ` +
      `${describeBuilt(built.value)}.`,
  };
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string, resultCode: string): ActionResultSimple {
  return { Success: false, Message: message, ResultCode: resultCode };
}
