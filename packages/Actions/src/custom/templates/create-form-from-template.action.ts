/**
 * No-AI authoring action: **Forms: Create Form From Template**.
 *
 * Instantiates one of the {@link STARTER_TEMPLATES} into a live Draft form via the
 * same deterministic Builder the AI path uses. This is the "easy setup" path for
 * users who don't want to write a brief.
 *
 * Input params:
 *   - `TemplateKey` (string, required) — one of the starter gallery keys
 *      (e.g. `contact`, `rsvp`, `nps`, `lead-capture`, `application`).
 *   - `Name` (string, optional) — overrides the template's default form name.
 *   - `OwnerUserID` (string, optional) — stamped on the created Form.
 * Output params: `FormID`, `FormVersionID`, `PageCount`, `QuestionCount`, `OptionCount`.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { buildFormFromBlueprint, FormPersistError } from '../authoring/form-blueprint-builder';
import type { FormBlueprint } from '../authoring/form-blueprint';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { STARTER_TEMPLATES, getStarterTemplate } from './starter-templates';

@RegisterClass(BaseAction, 'Forms: Create Form From Template')
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

    const blueprint = withName(template.blueprint, getStringParam(params, 'Name'));
    try {
      const built = await buildFormFromBlueprint(blueprint, params.ContextUser, getStringParam(params, 'OwnerUserID'));
      setOutputParam(params, 'FormID', built.formId);
      setOutputParam(params, 'FormVersionID', built.formVersionId);
      setOutputParam(params, 'PageCount', built.pageCount);
      setOutputParam(params, 'QuestionCount', built.questionCount);
      setOutputParam(params, 'OptionCount', built.optionCount);
      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Created draft form "${blueprint.name}" from template "${template.key}".`,
      };
    } catch (error) {
      const code = error instanceof FormPersistError ? 'PERSIST_FAILED' : 'FAILED';
      return fail(`Failed to create form from template: ${asText(error)}`, code);
    }
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
