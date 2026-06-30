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
 * the highest-power **Anthropic Claude** via AIEngine (never a pinned legacy id).
 *
 * Input params:
 *   - `Brief` (string, required) — the natural-language description.
 *   - `OwnerUserID` (string, optional) — stamped on the created Form.
 * Output params:
 *   - `FormID`, `FormVersionID` (created ids)
 *   - `PageCount`, `QuestionCount`, `OptionCount`
 *   - `Blueprint` (the validated blueprint object, for inspection/preview)
 *
 * The blueprint→persist path is unit-testable with a stubbed {@link FormDesignerModel}
 * (no network/API key) — see `generate-form.action.spec.ts`.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { buildFormFromBlueprint, FormPersistError } from './form-blueprint-builder';
import {
  AIEngineFormDesignerModel,
  designFormFromBrief,
  type FormDesignerModel,
} from './llm-form-designer';

let activeDesignerModel: FormDesignerModel = new AIEngineFormDesignerModel();

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
    const built = await buildFormFromBlueprint(blueprint, contextUser, ownerUserId);
    setOutputParam(params, 'FormID', built.formId);
    setOutputParam(params, 'FormVersionID', built.formVersionId);
    setOutputParam(params, 'PageCount', built.pageCount);
    setOutputParam(params, 'QuestionCount', built.questionCount);
    setOutputParam(params, 'OptionCount', built.optionCount);
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
