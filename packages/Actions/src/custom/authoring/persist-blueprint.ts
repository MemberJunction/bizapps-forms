/**
 * What the two authoring Actions (`Forms: Generate Form From Brief`, `Forms: Create Form From
 * Template`) share: refuse a request up front, then hand the blueprint to
 * `FormAuthoringEngine.BuildFromBlueprint` on a provider of its own, and report the outcome as
 * output params.
 *
 * The order is the point. {@link prepareAuthoring} decides everything that can refuse — the
 * `PublishImmediately` flag, the on-submit params, who is asking — before the action does anything
 * expensive, and {@link onActionProvider} resolves the provider before the work starts; for
 * `Forms: Generate Form From Brief` that work begins with a highest-tier LLM call, which must never
 * run for a request that was always going to be refused.
 *
 * The domain work — the transaction, the schema check, the Action-name resolution, the publish — is
 * the engine's; this file only translates between Action params and the engine call.
 */
import { Metadata, type DatabaseProviderBase } from '@memberjunction/core';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import {
  FormAuthoringEngine,
  FormAuthoringError,
  FormPublishError,
  refuseFormAuthoring,
  withActionDatabaseProvider,
  type BuiltForm,
  type FormPermissionSource,
} from '@mj-biz-apps/forms-core-entities-server';
import type { FormBlueprint } from '@mj-biz-apps/forms-entities';
import { findParam, getBooleanParam, getStringParam, setOutputParam } from '../shared/action-params';
import { OnSubmitConfigError, readOnSubmitConfig, type OnSubmitConfig } from './on-submit-config';

/** The Action param that asks for the built form to be published in the same transaction. */
export const PUBLISH_IMMEDIATELY_PARAM = 'PublishImmediately';

/** A request that passed every up-front check. */
export interface AuthoringRequest {
  publishImmediately: boolean;
  ownerUserId?: string;
  /** The caller's `OnSubmitMode` / `Automations`, already validated. */
  onSubmit: OnSubmitConfig;
}

/** An outcome: the value, or the failed Action result to return as-is. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; result: ActionResultSimple };

/**
 * Every check that can refuse the request, in order, before any expensive work:
 *  1. `PublishImmediately` — absent, null or blank is `false` (the documented default); a value
 *     that is present but not a boolean is refused, since a caller that wrote `"yes"` believed it
 *     asked for a publish;
 *  2. `OnSubmitMode` / `Automations`;
 *  3. who is asking — the same rule the authoring Remote Operations apply
 *     (`authorizeFormAuthoring`): never an anonymous or magic-link session, and Update on Forms.
 *     Permissions are read from the request's provider when it has one (they are process-global
 *     metadata either way).
 */
export function prepareAuthoring(params: RunActionParams, actionName: string): Outcome<AuthoringRequest> {
  const publishImmediately = readPublishImmediately(params);
  if (publishImmediately === 'invalid') {
    const raw = JSON.stringify(findParam(params, PUBLISH_IMMEDIATELY_PARAM)?.Value);
    return failed(`${actionName}: ${PUBLISH_IMMEDIATELY_PARAM} must be true or false; got ${raw}.`, 'INVALID_PARAMETER');
  }
  let onSubmit: OnSubmitConfig;
  try {
    onSubmit = readOnSubmitConfig(getStringParam(params, 'OnSubmitMode'), findParam(params, 'Automations')?.Value);
  } catch (error) {
    // Before anything is written. A caller that mis-specified its on-submit steps must get an
    // error, not a form that silently runs the four built-ins it was trying to replace.
    return failed(`${actionName}: ${asText(error)}`, error instanceof OnSubmitConfigError ? 'INVALID_ON_SUBMIT_CONFIG' : 'FAILED');
  }
  const refusal = refuseFormAuthoring(actionName, params.ContextUser, permissionSource(params));
  if (refusal) {
    return failed(`${actionName}: not allowed — ${refusal}.`, 'FORBIDDEN');
  }
  return {
    ok: true,
    value: { publishImmediately, ownerUserId: getStringParam(params, 'OwnerUserID'), onSubmit },
  };
}

/**
 * Run `work` on the action's provider — the caller's, or an isolated instance released afterwards
 * (`withActionDatabaseProvider`) — so the build's transaction never runs on the process-global
 * provider. A provider that cannot be resolved is refused here, before `work` starts.
 */
export async function onActionProvider(
  params: RunActionParams,
  actionName: string,
  work: (provider: DatabaseProviderBase) => Promise<ActionResultSimple>,
): Promise<ActionResultSimple> {
  let started = false;
  try {
    return await withActionDatabaseProvider(params, actionName, (provider) => {
      started = true;
      return work(provider);
    });
  } catch (error) {
    if (started) {
      throw error; // `work` reports its own outcomes; anything it throws is a defect, not a refusal.
    }
    return { Success: false, Message: asText(error), ResultCode: 'FAILED' };
  }
}

/**
 * Build (and maybe publish) `blueprint` through the engine, setting the shared output params on
 * success: `FormID`, `PageCount`, `QuestionCount`, `OptionCount`, `AutomationCount`.
 */
export async function buildForm(
  params: RunActionParams,
  provider: DatabaseProviderBase,
  blueprint: FormBlueprint,
  request: AuthoringRequest,
  actionName: string,
): Promise<Outcome<BuiltForm>> {
  let built: BuiltForm;
  try {
    built = await FormAuthoringEngine.Instance.BuildFromBlueprint(blueprint, provider, params.ContextUser, {
      ownerUserId: request.ownerUserId,
      publishImmediately: request.publishImmediately,
    });
  } catch (error) {
    return failed(`${actionName}: ${asText(error)}`, resultCodeFor(error));
  }
  setOutputParam(params, 'FormID', built.formId);
  setOutputParam(params, 'PageCount', built.pageCount);
  setOutputParam(params, 'QuestionCount', built.questionCount);
  setOutputParam(params, 'OptionCount', built.optionCount);
  setOutputParam(params, 'AutomationCount', built.automationCount);
  return { ok: true, value: built };
}

/** "left as a draft" or "published as version N", for the success message. */
export function describeBuilt(built: BuiltForm): string {
  return built.published ? `published as version ${built.published.versionNumber}` : 'left as a draft';
}

function readPublishImmediately(params: RunActionParams): boolean | 'invalid' {
  const raw: unknown = findParam(params, PUBLISH_IMMEDIATELY_PARAM)?.Value;
  if (raw === undefined || raw === null || raw === '') {
    return false;
  }
  return getBooleanParam(params, PUBLISH_IMMEDIATELY_PARAM) ?? 'invalid';
}

/**
 * Where the caller's permissions are read: the request's provider when supplied, else the process
 * metadata — the same entity permissions either way. A missing global provider is not swallowed:
 * the authorization rule fails closed on a lookup that throws, and says why.
 */
function permissionSource(params: RunActionParams): FormPermissionSource {
  if (params.Provider) {
    return params.Provider;
  }
  return { EntityByName: (name: string) => Metadata.Provider.EntityByName(name) };
}

function resultCodeFor(error: unknown): string {
  if (error instanceof FormPublishError) {
    return 'PUBLISH_REFUSED';
  }
  if (error instanceof FormAuthoringError) {
    return 'PERSIST_FAILED';
  }
  return 'FAILED';
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failed<T>(message: string, resultCode: string): Outcome<T> {
  return { ok: false, result: { Success: false, Message: message, ResultCode: resultCode } };
}
