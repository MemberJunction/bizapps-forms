/**
 * `Forms: Bind Response To Entity` — run one entity binding for one response, as an MJ Action.
 *
 * The submit pipeline dispatches bindings directly; this exists so a binding is reachable from
 * everywhere else Actions are: an approval hook in bizapps-tasks that binds only once a human has
 * approved the response, a manual re-drive from an admin surface, or another Open App that wants
 * to trigger the same write without knowing anything about how Forms works.
 *
 * Both routes call the same executor, so there is exactly one definition of what binding a response
 * means. A second implementation here is how the two would quietly diverge on the rules that matter
 * most — which record gets matched, and which values may overwrite.
 */
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import {
  parseFieldMappings,
  parseIdentityRule,
  parseMergePolicy,
  type mjBizAppsFormsFormEntityBindingEntity,
} from '@mj-biz-apps/forms-entities';
import { loadFormResponseContext } from '../shared/form-response-context';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { bindingFailed, executeBinding, parseBindingConfig } from './binding-executor';
import { readPriorBindingOutcome, recordBindingLedgerRow } from './binding-ledger';
import { MJBindingGateway } from './mj-binding-gateway';

const BINDING_ENTITY = 'MJ_BizApps_Forms: Form Entity Bindings';

@RegisterClass(BaseAction, 'Forms: Bind Response To Entity')
export class BindResponseToEntityAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const bindingId = getStringParam(params, 'BindingID');
    const responseId = getStringParam(params, 'FormResponseID');
    if (!bindingId || !responseId) {
      return { Success: false, ResultCode: 'MISSING_PARAMS', Message: 'BindingID and FormResponseID are both required.' };
    }

    const contextUser = params.ContextUser;
    const md = new Metadata();
    const binding = await md.GetEntityObject<mjBizAppsFormsFormEntityBindingEntity>(BINDING_ENTITY, contextUser);
    if (!binding || !(await binding.Load(bindingId))) {
      return { Success: false, ResultCode: 'BINDING_NOT_FOUND', Message: `Binding ${bindingId} could not be loaded.` };
    }
    if (binding.Status !== 'Active') {
      // A clean skip, not a failure: a disabled binding is a deliberate state, and reporting it as
      // an error would make every caller treat an intended no-op as something to investigate.
      return { Success: true, ResultCode: 'SKIPPED', Message: 'Binding is disabled.' };
    }

    const context = await loadFormResponseContext(responseId, contextUser);
    if (!context) {
      return { Success: false, ResultCode: 'RESPONSE_NOT_FOUND', Message: `Response ${responseId} could not be read.` };
    }

    try {
      const config = parseBindingConfig(
        binding.TargetEntityName,
        { fieldMappings: binding.FieldMappings, identityRule: binding.IdentityRule, mergePolicy: binding.MergePolicy },
        { fieldMappings: parseFieldMappings, identityRule: parseIdentityRule, mergePolicy: parseMergePolicy },
      );

      const result = await executeBinding({
        config,
        answers: context.canonicalAnswers,
        // The same identity ledger the submit path uses. This entry point is the re-drivable one
        // — an approval hook, an admin re-run — so without it a second invocation would create a
        // second record under an AlwaysCreate rule and leave no trace that either had happened.
        gateway: Object.assign(new MJBindingGateway(contextUser), {
          findPriorOutcome: (id: string) => readPriorBindingOutcome(bindingId, id, contextUser),
        }),
        responseId,
        // The caller decides the ceiling. Invoked from the submit path the deployment allow-list
        // applies; invoked deliberately by a privileged caller — an approval hook that has already
        // decided this response should be written — the caller's own grants are the constraint.
        allowedEntities: null,
      });

      if (bindingFailed(result)) {
        return {
          Success: false,
          ResultCode: result.failure.scope === 'config' ? 'CONFIG_ERROR' : 'BIND_FAILED',
          Message: result.failure.message,
        };
      }

      await recordBindingLedgerRow(bindingId, binding.TargetEntityID, responseId, result.outcome, contextUser);

      setOutputParam(params, 'TargetRecordID', result.outcome.targetRecordId);
      setOutputParam(params, 'Outcome', result.outcome.kind);
      setOutputParam(params, 'WrittenFields', result.outcome.writtenFields.join(','));
      return {
        Success: true,
        ResultCode: result.outcome.kind === 'Skipped' ? 'SKIPPED' : 'SUCCESS',
        Message: `${result.outcome.kind}${result.outcome.targetRecordId ? ` ${result.outcome.targetRecordId}` : ''}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`Forms: Bind Response To Entity failed for binding ${bindingId}: ${message}`);
      return { Success: false, ResultCode: 'CONFIG_ERROR', Message: message };
    }
  }
}

/** Anti-tree-shake anchor — the decorator only runs if something references the class. */
export function LoadBindResponseToEntityAction(): number {
  return BindResponseToEntityAction ? 1 : 0;
}
