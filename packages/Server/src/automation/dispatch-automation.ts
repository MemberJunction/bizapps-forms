/**
 * Dispatch one configured automation to whatever it targets, and record what happened.
 *
 * This is the layer that knows about MemberJunction: resolving Actions and Agents, loading a
 * binding's authored configuration, and writing the two bookkeeping rows (a run record always, an
 * identity-ledger row for a binding). Everything above it — which automations run, in what order,
 * whether a value may overwrite another — is decided elsewhere and tested without a database.
 *
 * Every dispatch runs under the automation service principal. The anonymous respondent never
 * reaches here.
 */
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam } from '@memberjunction/actions-base';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { loadUploadLedger } from '../upload/upload-provenance.service';
import {
  isFileAnswer,
  parseFieldMappings,
  parseIdentityRule,
  parseMergePolicy,
  type CanonicalAnswers,
  type PublishedFormAutomation,
} from '@mj-biz-apps/forms-entities';
import type {
  mjBizAppsFormsFormAutomationRunEntity,
  mjBizAppsFormsFormEntityBindingEntity,
  mjBizAppsFormsFormEntityBindingRecordEntity,
} from '@mj-biz-apps/forms-entities';
import {
  bindingFailed,
  executeBinding,
  parseBindingConfig,
  sqlLiteral,
  MJBindingGateway,
  type BindingOutcome,
} from '@mj-biz-apps/forms-actions';

const ENTITY = {
  AutomationRun: 'MJ_BizApps_Forms: Form Automation Runs',
  Binding: 'MJ_BizApps_Forms: Form Entity Bindings',
  BindingRecord: 'MJ_BizApps_Forms: Form Entity Binding Records',
} as const;

export interface DispatchContext {
  responseId: string;
  formId: string;
  formVersionId: string;
  distributionId: string;
  answers: CanonicalAnswers;
  principal: UserInfo;
  /** Entities this deployment permits bindings to write; null disables the check. */
  allowedEntities: ReadonlySet<string> | null;
}

/**
 * Run one automation. Throws on failure so the runner records it — the runner is the single place
 * that decides what a failure means for the rest of the plan.
 */
export async function dispatchAutomation(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
): Promise<void> {
  const run = await startRun(automation, ctx);
  try {
    const summary = await dispatchByTarget(automation, ctx);
    await finishRun(run, 'Succeeded', undefined, summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(run, 'Failed', message);
    throw error;
  }
}

async function dispatchByTarget(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
): Promise<string | undefined> {
  switch (automation.targetType) {
    case 'Action':
      return runActionTarget(automation, ctx);
    case 'Agent':
      return runAgentTarget(automation, ctx);
    case 'EntityBinding':
      return runBindingTarget(automation, ctx);
    default:
      throw new Error(`Unknown automation target type for "${automation.name}".`);
  }
}

/** Run an MJ Action with the four standard response-context ids. */
async function runActionTarget(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
): Promise<string | undefined> {
  if (!automation.actionId) {
    throw new Error(`Automation "${automation.name}" is an Action target with no action.`);
  }
  const engine = ActionEngineServer.Instance;
  await engine.Config(false, ctx.principal);
  const action = engine.Actions.find((a) => a.ID === automation.actionId);
  if (!action) {
    throw new Error(`Action ${automation.actionId} for "${automation.name}" is not registered.`);
  }

  // IDs only, never answers: at MJ 5.51 the action execution log records its parameters
  // unredacted, so a respondent's answers passed here would be persisted in a log that is not
  // scoped to the form.
  const params = [
    { Name: 'FormResponseID', Value: ctx.responseId },
    { Name: 'FormID', Value: ctx.formId },
    { Name: 'FormVersionID', Value: ctx.formVersionId },
    { Name: 'DistributionID', Value: ctx.distributionId },
  ].map((p) => Object.assign(new ActionParam(), { ...p, Type: 'Input' as const }));

  const result = await engine.RunAction({ Action: action, ContextUser: ctx.principal, Params: params, Filters: [] });
  if (!result.Success) {
    throw new Error(result.Message ?? `Action "${action.Name}" reported failure.`);
  }
  return result.Message ?? undefined;
}

/**
 * Run an MJ AI Agent for this response.
 *
 * The agent is given the response's identifiers as a message, not the answers themselves. An agent
 * that needs the answers reads them back under its own context — which keeps a respondent's
 * personal data out of the conversation record that agent runs persist, and means the agent sees
 * the same answers as everything else rather than a copy taken at dispatch time.
 *
 * Which agent runs comes from the published snapshot, never from anything the client sent: an
 * anonymous submission must not be able to choose what runs under the service principal.
 */
async function runAgentTarget(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
): Promise<string | undefined> {
  if (!automation.agentId) {
    throw new Error(`Automation "${automation.name}" is an Agent target with no agent.`);
  }
  const agent = await new Metadata().GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', ctx.principal);
  if (!agent || !(await agent.Load(automation.agentId))) {
    throw new Error(`Agent ${automation.agentId} for "${automation.name}" could not be loaded.`);
  }

  const result = await new AgentRunner().RunAgent({
    agent,
    contextUser: ctx.principal,
    conversationMessages: [
      {
        role: 'user',
        content:
          `A form response was submitted. FormResponseID=${ctx.responseId}, FormID=${ctx.formId}, ` +
          `FormVersionID=${ctx.formVersionId}, DistributionID=${ctx.distributionId}.`,
      },
    ],
  });
  if (!result.success) {
    // The run entity carries the detail; the result itself only reports success. Naming the run id
    // is what makes the failure findable, since the agent's own log is where the reason lives.
    throw new Error(
      `Agent "${agent.Name}" reported failure${result.agentRun?.ID ? ` (AIAgentRun ${result.agentRun.ID})` : ''}.`,
    );
  }
  return result.agentRun?.ID ? `AgentRun ${result.agentRun.ID}` : undefined;
}

/** Execute an entity binding and record the identity-ledger row. */
async function runBindingTarget(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
): Promise<string | undefined> {
  if (!automation.bindingId) {
    throw new Error(`Automation "${automation.name}" is an EntityBinding target with no binding.`);
  }
  const md = new Metadata();
  const binding = await md.GetEntityObject<mjBizAppsFormsFormEntityBindingEntity>(ENTITY.Binding, ctx.principal);
  if (!binding || !(await binding.Load(automation.bindingId))) {
    throw new Error(`Binding ${automation.bindingId} for "${automation.name}" could not be loaded.`);
  }
  if (binding.Status !== 'Active') {
    return 'Binding is disabled.';
  }

  const config = parseBindingConfig(
    binding.TargetEntityName,
    { fieldMappings: binding.FieldMappings, identityRule: binding.IdentityRule, mergePolicy: binding.MergePolicy },
    { fieldMappings: parseFieldMappings, identityRule: parseIdentityRule, mergePolicy: parseMergePolicy },
  );

  const result = await executeBinding({
    config,
    answers: ctx.answers,
    gateway: new MJBindingGateway(ctx.principal),
    allowedEntities: ctx.allowedEntities,
    // File answers reach a target field only because the submit path refused to persist any file
    // id it could not attribute to this respondent's own upload. Defence in depth rather than
    // trust: a response persisted under an older, more lenient configuration must not become
    // writable to a business record just because the setting changed afterwards.
    allowFileAnswers: await filesAreVerified(ctx),
  });
  if (bindingFailed(result)) {
    throw new Error(`${result.failure.scope}: ${result.failure.message}`);
  }

  await recordLedgerRow(automation.bindingId, binding, result.outcome, ctx);
  return `${result.outcome.kind}${result.outcome.targetRecordId ? ` ${result.outcome.targetRecordId}` : ''}`;
}

/**
 * Re-check that every file answer on this response has provenance, at bind time.
 *
 * The submit path already refused unverifiable files, so in the normal case this confirms what is
 * already true. It exists for the abnormal case: a response persisted while the check was lenient,
 * or before the check existed at all, must not become writable onto a business record simply
 * because a binding was added later. Returns false on any doubt — including a failed lookup —
 * because the cost of being wrong here is disclosing someone else's file.
 */
async function filesAreVerified(ctx: DispatchContext): Promise<boolean> {
  const fileIds = [...ctx.answers.Entries()]
    .map(([, value]) => (isFileAnswer(value) ? value.fileId : undefined))
    .filter((id): id is string => Boolean(id));
  if (fileIds.length === 0) {
    return true;
  }
  try {
    const ledger = await loadUploadLedger(fileIds, ctx.principal);
    return fileIds.every((id) => {
      const row = ledger.get(id.trim().toLowerCase());
      return Boolean(row) && row?.Status !== 'Revoked' && equalsFolded(row?.DistributionID, ctx.distributionId);
    });
  } catch {
    return false;
  }
}

function equalsFolded(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left) && Boolean(right) && left!.trim().toLowerCase() === right!.trim().toLowerCase();
}

/**
 * Upsert the (binding, response) ledger row.
 *
 * Written on every outcome including a skip, so "this submission was considered and produced
 * nothing" is a recorded fact rather than an absence indistinguishable from "never ran". The
 * unique index on (BindingID, FormResponseID) is the real guard against a double execution; this
 * read-then-write is the cooperative half, and a failure here must not undo a record that was
 * already written — the target row exists either way, so the ledger is repaired by re-running.
 */
async function recordLedgerRow(
  bindingId: string,
  binding: mjBizAppsFormsFormEntityBindingEntity,
  outcome: BindingOutcome,
  ctx: DispatchContext,
): Promise<void> {
  const md = new Metadata();
  const existing = await new RunView().RunView<{ ID: string }>(
    {
      EntityName: ENTITY.BindingRecord,
      // Both are GUIDs minted by this system — the binding id from the published snapshot, the
      // response id validated as a UUID before it became a primary key — but escaped anyway, so
      // the safety of this query does not rest on a fact established three modules away.
      ExtraFilter: `BindingID=${sqlLiteral(bindingId)} AND FormResponseID=${sqlLiteral(ctx.responseId)}`,
      Fields: ['ID'],
      ResultType: 'simple',
      MaxRows: 1,
    },
    ctx.principal,
  );

  const row = await md.GetEntityObject<mjBizAppsFormsFormEntityBindingRecordEntity>(
    ENTITY.BindingRecord,
    ctx.principal,
  );
  if (!row) {
    LogError('Forms binding: could not create a ledger row object; the bound record was still written.');
    return;
  }
  if (existing.Success && existing.Results.length > 0) {
    if (!(await row.Load(existing.Results[0].ID))) {
      return;
    }
  } else {
    row.NewRecord();
    row.BindingID = bindingId;
    row.FormResponseID = ctx.responseId;
  }
  row.TargetEntityID = binding.TargetEntityID;
  row.TargetRecordID = outcome.targetRecordId;
  row.Outcome = outcome.kind;
  row.WrittenFields = JSON.stringify(outcome.writtenFields);
  if (!(await row.Save())) {
    // Logged, not thrown: the business record is already written, and failing the automation here
    // would report a write that actually succeeded as a failure and invite a retry that duplicates.
    LogError(`Forms binding: ledger row save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
  }
}

/** Open a run record so an in-flight or crashed automation is visible rather than inferred. */
async function startRun(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
): Promise<mjBizAppsFormsFormAutomationRunEntity | null> {
  const row = await new Metadata().GetEntityObject<mjBizAppsFormsFormAutomationRunEntity>(
    ENTITY.AutomationRun,
    ctx.principal,
  );
  if (!row) {
    return null;
  }
  row.NewRecord();
  row.FormAutomationID = automation.id;
  row.FormResponseID = ctx.responseId;
  row.Status = 'Running';
  row.AttemptCount = 1;
  row.StartedAt = new Date();
  if (!(await row.Save())) {
    // Observability must never be the reason a submission's side effects do not happen.
    LogError(`Forms automation: could not open a run record: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
    return null;
  }
  return row;
}

async function finishRun(
  row: mjBizAppsFormsFormAutomationRunEntity | null,
  status: 'Succeeded' | 'Failed',
  errorMessage?: string,
  summary?: string,
): Promise<void> {
  if (!row) {
    return;
  }
  row.Status = status;
  row.CompletedAt = new Date();
  row.ErrorMessage = errorMessage ?? null;
  row.OutputSummary = summary ? JSON.stringify({ summary }) : null;
  if (!(await row.Save())) {
    LogError(`Forms automation: could not close run record ${row.ID}.`);
  }
}
