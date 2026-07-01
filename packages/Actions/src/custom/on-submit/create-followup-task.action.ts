/**
 * On-submit action: **Forms: Create Followup Task**.
 *
 * Creates a `MJ_BizApps_Tasks: Tasks` row and links it to the form response via a
 * `MJ_BizApps_Tasks: Task Links` row (EntityID = Form Responses entity, RecordID =
 * the response id). Idempotent/safe: skips when the response can't be found.
 *
 * Contract: invoked BY NAME by WP-B's submit endpoint (seam S3). Do not rename.
 *
 * Input params:
 *   - `FormResponseID` (string, required)
 *   - `TaskName` (string, optional — defaults to "Follow up: <form name>")
 *   - `TaskTypeName` (string, optional — resolves the required Task.TypeID; falls
 *      back to the first active TaskType when omitted)
 *   - `Priority` ('Critical'|'High'|'Medium'|'Low', optional — default 'Medium')
 * Output params: `TaskID`, `TaskLinkID`.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  mjBizAppsTasksTaskEntity,
  mjBizAppsTasksTaskLinkEntity,
  mjBizAppsTasksTaskTypeEntity,
} from '@mj-biz-apps/forms-entities';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { loadFormResponseContext, type FormResponseContext } from '../shared/form-response-context';

const ENTITY = {
  Task: 'MJ_BizApps_Tasks: Tasks',
  TaskLink: 'MJ_BizApps_Tasks: Task Links',
  TaskType: 'MJ_BizApps_Tasks: Task Types',
  FormResponse: 'MJ_BizApps_Forms: Form Responses',
} as const;

type TaskPriority = 'Critical' | 'High' | 'Medium' | 'Low';
const VALID_PRIORITIES: readonly TaskPriority[] = ['Critical', 'High', 'Medium', 'Low'];

function isTaskPriority(value: string | undefined): value is TaskPriority {
  return value !== undefined && VALID_PRIORITIES.some((p) => p === value);
}

@RegisterClass(BaseAction, 'Forms: Create Followup Task')
export class CreateFollowupTaskAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const responseId = getStringParam(params, 'FormResponseID');
    if (!responseId) {
      return fail('FormResponseID parameter is required', 'MISSING_PARAMETERS');
    }

    const ctx = await loadFormResponseContext(responseId, params.ContextUser);
    if (!ctx) {
      return skip(`FormResponse '${responseId}' not found; no task created.`);
    }

    const typeId = await resolveTaskTypeId(getStringParam(params, 'TaskTypeName'), params.ContextUser);
    if (!typeId) {
      return fail('No TaskType available to assign to the task.', 'NO_TASK_TYPE');
    }

    return this.createTaskAndLink(ctx, typeId, params);
  }

  private async createTaskAndLink(
    ctx: FormResponseContext,
    typeId: string,
    params: RunActionParams,
  ): Promise<ActionResultSimple> {
    const contextUser = params.ContextUser;
    const task = await createTask(ctx, typeId, params, contextUser);
    if (!task) {
      return fail('Failed to create followup Task.', 'TASK_SAVE_FAILED');
    }

    const link = await createTaskLink(task.ID, ctx.response.ID, contextUser);
    if (!link) {
      return fail('Task created but failed to link it to the response.', 'TASK_LINK_FAILED');
    }

    setOutputParam(params, 'TaskID', task.ID);
    setOutputParam(params, 'TaskLinkID', link.ID);
    return {
      Success: true,
      ResultCode: 'SUCCESS',
      Message: `Created followup task ${task.ID} linked to response ${ctx.response.ID}.`,
    };
  }
}

async function createTask(
  ctx: FormResponseContext,
  typeId: string,
  params: RunActionParams,
  contextUser: UserInfo,
): Promise<mjBizAppsTasksTaskEntity | null> {
  const md = new Metadata();
  const task = await md.GetEntityObject<mjBizAppsTasksTaskEntity>(ENTITY.Task, contextUser);
  task.NewRecord();
  task.Name = getStringParam(params, 'TaskName') ?? `Follow up: ${ctx.form.Name}`;
  task.Description = `Auto-created from form response ${ctx.response.ID} (form "${ctx.form.Name}").`;
  task.TypeID = typeId;
  task.Status = 'Open';
  task.Priority = resolvePriority(getStringParam(params, 'Priority'));
  const ok = await task.Save();
  return ok ? task : null;
}

async function createTaskLink(
  taskId: string,
  responseId: string,
  contextUser: UserInfo,
): Promise<mjBizAppsTasksTaskLinkEntity | null> {
  const md = new Metadata();
  const responseEntityId = md.EntityByName(ENTITY.FormResponse)?.ID;
  if (!responseEntityId) {
    return null;
  }
  const link = await md.GetEntityObject<mjBizAppsTasksTaskLinkEntity>(ENTITY.TaskLink, contextUser);
  link.NewRecord();
  link.TaskID = taskId;
  link.EntityID = responseEntityId;
  link.RecordID = responseId;
  link.Description = 'Form response that triggered this followup task.';
  const ok = await link.Save();
  return ok ? link : null;
}

/** Resolve the required Task.TypeID — by name when supplied, else the first active type. */
async function resolveTaskTypeId(typeName: string | undefined, contextUser: UserInfo): Promise<string | null> {
  const rv = new RunView();
  const filter = typeName ? `Name='${typeName.replace(/'/g, "''")}'` : 'IsActive=1';
  const result = await rv.RunView<mjBizAppsTasksTaskTypeEntity>(
    {
      EntityName: ENTITY.TaskType,
      ExtraFilter: filter,
      ResultType: 'entity_object',
      MaxRows: 1,
    },
    contextUser,
  );
  if (result.Success && result.Results.length > 0) {
    return result.Results[0].ID;
  }
  return null;
}

function resolvePriority(value: string | undefined): TaskPriority {
  return isTaskPriority(value) ? value : 'Medium';
}

function fail(message: string, resultCode: string): ActionResultSimple {
  return { Success: false, Message: message, ResultCode: resultCode };
}

function skip(message: string): ActionResultSimple {
  return { Success: true, Message: message, ResultCode: 'SKIPPED' };
}
