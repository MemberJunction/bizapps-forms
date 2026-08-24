/**
 * AI authoring action: **Forms: Generate Form From Brief** (FORMS_BUILD_PLAN §7).
 *
 * From a natural-language brief — e.g. "a 5-question event RSVP with dietary
 * restrictions and a +1 count" — this drafts a complete Form / FormPage /
 * FormQuestion / FormQuestionOption set (plus a Draft FormVersion) via entity Save().
 *
 * It reuses the deterministic Designer→Builder split proven by MJ's Form Builder
 * agent: the LLM (Designer) emits a structured JSON {@link FormBlueprint}; deterministic
 * code (Builder) validates it against the §5.3 taxonomy and persists it. The model is
 * chosen by MemberJunction from the 'Forms: Form Designer' AI Prompt's metadata — there
 * is no model or vendor name in code (see {@link AIPromptFormDesignerModel}).
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
 * Output params:
 *   - `FormID`, `FormVersionID` (created ids)
 *   - `PageCount`, `QuestionCount`, `OptionCount`, `AutomationCount`
 *   - `Blueprint` (the validated blueprint object, for inspection/preview)
 *
 * The blueprint→persist path is unit-testable with a stubbed {@link FormDesignerModel}
 * (no network/API key) — see `generate-form.action.spec.ts`.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import { findParam, getStringParam, setOutputParam } from '../shared/action-params';
import { applyOnSubmitConfig, OnSubmitConfigError } from './on-submit-config';
import { buildFormFromBlueprint, FormPersistError } from './form-blueprint-builder';
import {
  AIPromptFormDesignerModel,
  designFormFromBrief,
  type FormDesignerModel,
} from './llm-form-designer';

let activeDesignerModel: FormDesignerModel = new AIPromptFormDesignerModel();

/** Override the Designer model (e.g. a deterministic stub in tests). */
export function setFormDesignerModel(model: FormDesignerModel): void {
  activeDesignerModel = model;
}

@RegisterClass(BaseAction, 'Forms: Generate Form From Brief')
export class GenerateFormFromBriefAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const brief = getStringParam(params, 'Brief');
    if (!brief) {
      return fail('Brief parameter is required', 'MISSING_PARAMETERS');
    }
    return runAuthoring(brief, getStringParam(params, 'OwnerUserID'), params, params.ContextUser);
  }
}

/**
 * Shared authoring pipeline (also usable directly from tests): Designer → validated
 * blueprint → deterministic Builder → output params.
 */
export async function runAuthoring(
  brief: string,
  ownerUserId: string | undefined,
  params: RunActionParams,
  contextUser: UserInfo,
): Promise<ActionResultSimple> {
  let blueprint;
  try {
    blueprint = await designFormFromBrief(brief, activeDesignerModel, contextUser);
  } catch (error) {
    return fail(`AI form design failed: ${asText(error)}`, 'DESIGN_FAILED');
  }

  try {
    // The caller's on-submit configuration, applied to what the Designer produced. Done before any
    // row is written, so a mis-specified step is an error rather than a form that silently runs
    // the four built-ins the caller was trying to replace.
    blueprint = applyOnSubmitConfig(
      blueprint,
      getStringParam(params, 'OnSubmitMode'),
      findParam(params, 'Automations')?.Value,
    );
  } catch (error) {
    const code = error instanceof OnSubmitConfigError ? 'INVALID_ON_SUBMIT_CONFIG' : 'FAILED';
    return fail(asText(error), code);
  }

  try {
    const built = await buildFormFromBlueprint(blueprint, contextUser, ownerUserId);
    setOutputParam(params, 'FormID', built.formId);
    setOutputParam(params, 'FormVersionID', built.formVersionId);
    setOutputParam(params, 'PageCount', built.pageCount);
    setOutputParam(params, 'QuestionCount', built.questionCount);
    setOutputParam(params, 'OptionCount', built.optionCount);
    setOutputParam(params, 'AutomationCount', built.automationCount);
    setOutputParam(params, 'Blueprint', blueprint);
    return {
      Success: true,
      ResultCode: 'SUCCESS',
      Message: `Generated draft form "${blueprint.name}" (${built.questionCount} questions across ${built.pageCount} page(s)).`,
    };
  } catch (error) {
    const code = error instanceof FormPersistError ? 'PERSIST_FAILED' : 'FAILED';
    return fail(`Failed to persist generated form: ${asText(error)}`, code);
  }
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string, resultCode: string): ActionResultSimple {
  return { Success: false, Message: message, ResultCode: resultCode };
}
