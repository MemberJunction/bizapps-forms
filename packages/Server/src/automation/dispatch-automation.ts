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
import { LogError, Metadata } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam } from '@memberjunction/actions-base';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { everyFileIsAttributable, loadUploadLedger } from '../upload/upload-provenance.service';
import {
  isFileAnswer,
  parseFieldMappings,
  parseIdentityRule,
  parseMergePolicy,
  type CanonicalAnswers,
  type FormQuestionType,
  type PublishedFormAutomation,
} from '@mj-biz-apps/forms-entities';
import type {
  mjBizAppsFormsFormAutomationRunEntity,
  mjBizAppsFormsFormEntityBindingEntity,
} from '@mj-biz-apps/forms-entities';
import {
  bindingFailed,
  executeBinding,
  parseBindingConfig,
  readPriorBindingOutcome,
  recordBindingLedgerRow,
  MJBindingGateway,
  type BindingOutcome,
} from '@mj-biz-apps/forms-actions';
import { syncFileLinks, type FileLinkTarget } from '../file-links/file-links.service';
import { globalFileLinkProvider, MJFileLinkGateway } from '../file-links/mj-file-link-gateway';

const ENTITY = {
  AutomationRun: 'MJ_BizApps_Forms: Form Automation Runs',
  Binding: 'MJ_BizApps_Forms: Form Entity Bindings',
} as const;

export interface DispatchContext {
  responseId: string;
  formId: string;
  formVersionId: string;
  distributionId: string;
  answers: CanonicalAnswers;
  /**
   * The type of every question in the published definition, keyed by id.
   *
   * `CanonicalAnswers` deliberately carries values without types, so anything that must write an
   * answer ONWARD in a type-aware shape needs this beside it — entity binding writes a `Time` as a
   * clock or as an instant depending on the target column, and cannot tell which without it.
   */
  questionTypes: ReadonlyMap<string, FormQuestionType>;
  principal: UserInfo;
  /** Entities this deployment permits bindings to write; null disables the check. */
  allowedEntities: ReadonlySet<string> | null;
}

/**
 * What running a target produced: a human summary, plus the MJ record that holds the detail.
 *
 * The provenance ids are the point. `FormAutomationRun` has carried `ActionExecutionLogID` and
 * `AIAgentRunID` since `V202608072330` and the responses dashboard reads both, but nothing ever
 * wrote them — so every run in every deployment pointed at nothing, and Forms' ledger could not be
 * joined to MJ's. That was invisible while the runner also lacked permission to write an
 * `MJ: Action Execution Logs` row at all (#60): with no log rows to point AT, a null FK looked
 * like the same defect rather than a second one underneath it.
 */
interface DispatchOutcome {
  summary?: string;
  actionExecutionLogId?: string;
  aiAgentRunId?: string;
}

/**
 * A target failure that still knows which MJ record recorded the attempt.
 *
 * A failed run is the case where provenance is worth most — it is where the reason lives — so the
 * failure path must not be the one that drops it. Targets that have no provenance to report throw
 * a plain Error and the run is stamped with nothing, exactly as before.
 */
class AutomationTargetError extends Error {
  constructor(
    message: string,
    readonly outcome: DispatchOutcome,
  ) {
    super(message);
    this.name = 'AutomationTargetError';
  }
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
    const outcome = await dispatchByTarget(automation, ctx);
    await finishRun(run, 'Succeeded', undefined, outcome);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const outcome = error instanceof AutomationTargetError ? error.outcome : {};
    await finishRun(run, 'Failed', message, outcome);
    throw error;
  }
}

async function dispatchByTarget(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
): Promise<DispatchOutcome> {
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
): Promise<DispatchOutcome> {
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
  // `LogEntry` is the `MJ: Action Execution Logs` row the engine wrote for this execution. It is
  // absent when the action is configured to skip logging, and it was absent on every host until
  // V202608242110 granted the runner permission to write one at all.
  const outcome: DispatchOutcome = { actionExecutionLogId: result.LogEntry?.ID ?? undefined };
  if (!result.Success) {
    throw new AutomationTargetError(result.Message ?? `Action "${action.Name}" reported failure.`, outcome);
  }
  return { ...outcome, summary: result.Message ?? undefined };
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
): Promise<DispatchOutcome> {
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
  const outcome: DispatchOutcome = { aiAgentRunId: result.agentRun?.ID ?? undefined };
  if (!result.success) {
    // The run entity carries the detail; the result itself only reports success. Naming the run id
    // is what makes the failure findable, since the agent's own log is where the reason lives —
    // in the message for a human reading the error, and on the run row for anything querying it.
    throw new AutomationTargetError(
      `Agent "${agent.Name}" reported failure${result.agentRun?.ID ? ` (AIAgentRun ${result.agentRun.ID})` : ''}.`,
      outcome,
    );
  }
  return { ...outcome, summary: result.agentRun?.ID ? `AgentRun ${result.agentRun.ID}` : undefined };
}

/** Execute an entity binding and record the identity-ledger row. */
async function runBindingTarget(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
): Promise<DispatchOutcome> {
  if (!automation.bindingId) {
    throw new Error(`Automation "${automation.name}" is an EntityBinding target with no binding.`);
  }
  const md = new Metadata();
  const binding = await md.GetEntityObject<mjBizAppsFormsFormEntityBindingEntity>(ENTITY.Binding, ctx.principal);
  if (!binding || !(await binding.Load(automation.bindingId))) {
    throw new Error(`Binding ${automation.bindingId} for "${automation.name}" could not be loaded.`);
  }
  if (binding.Status !== 'Active') {
    return { summary: 'Binding is disabled.' };
  }

  const config = parseBindingConfig(
    binding.TargetEntityName,
    { fieldMappings: binding.FieldMappings, identityRule: binding.IdentityRule, mergePolicy: binding.MergePolicy },
    { fieldMappings: parseFieldMappings, identityRule: parseIdentityRule, mergePolicy: parseMergePolicy },
  );

  // Computed once and used twice: it decides both whether a file id may be WRITTEN onto the
  // target record and whether the file may be ATTACHED to it. Asking twice would let the two
  // answers disagree about the same response.
  const filesVerified = await filesAreVerified(ctx);

  const result = await executeBinding({
    config,
    answers: ctx.answers,
    questionTypes: ctx.questionTypes,
    gateway: Object.assign(new MJBindingGateway(ctx.principal), {
      findPriorOutcome: (responseId: string) =>
        readPriorBindingOutcome(automation.bindingId as string, responseId, ctx.principal),
    }),
    responseId: ctx.responseId,
    allowedEntities: ctx.allowedEntities,
    // File answers reach a target field only because the submit path refused to persist any file
    // id it could not attribute to this respondent's own upload. Defence in depth rather than
    // trust: a response persisted under an older, more lenient configuration must not become
    // writable to a business record just because the setting changed afterwards.
    allowFileAnswers: filesVerified,
  });
  if (bindingFailed(result)) {
    throw new Error(`${result.failure.scope}: ${result.failure.message}`);
  }

  await recordBindingLedgerRow(
    automation.bindingId,
    binding.TargetEntityID,
    ctx.responseId,
    result.outcome,
    ctx.principal,
  );
  await attachBoundRecordFiles(ctx, binding.TargetEntityID, result.outcome, filesVerified);
  return {
    // A binding writes a business record directly rather than through an Action or an Agent, so
    // there is no MJ-side run to point at; the identity-ledger row above is its provenance.
    summary: `${result.outcome.kind}${result.outcome.targetRecordId ? ` ${result.outcome.targetRecordId}` : ''}`,
  };
}

/**
 * Which record this outcome's files belong on, or null when none do.
 *
 * Three refusals, each for its own reason. An UNVERIFIED file is refused for the same reason it
 * is refused as a field value: attaching it would publish someone else's upload onto a record
 * other users can read, which is the disclosure the provenance check exists to prevent — and an
 * attachment is every bit as readable as a column. A `Skipped` outcome wrote nothing, so there is
 * no record to attach to. A null `targetRecordId` means the same thing more bluntly.
 *
 * `Unchanged` is deliberately NOT refused: the binding found its record and had nothing new to
 * write to it, which says nothing about whether the attachments are current. Records bound before
 * this feature existed reach us that way, and they are exactly the ones missing their files.
 *
 * NOTE WHAT AN UNVERIFIED VERDICT ALSO COSTS, because it is not obvious: refusing here skips
 * RECONCILIATION, not merely attachment — so a file attached by an earlier, verified run stays on
 * the record even if this response no longer answers with it. That is the intended direction.
 * `filesAreVerified` returns false on any doubt, INCLUDING a provenance lookup that failed, and at
 * this point "the upload was revoked" and "we could not find out" are the same value. Removing on
 * doubt would strip legitimate attachments off business records during a database blip; leaving
 * them costs a stale attachment until the next verified run reconciles it.
 */
function bindingAttachmentTarget(
  targetEntityId: string,
  outcome: BindingOutcome,
  filesVerified: boolean,
): FileLinkTarget | null {
  if (!filesVerified || outcome.kind === 'Skipped' || !outcome.targetRecordId) {
    return null;
  }
  return { entityId: targetEntityId, recordId: outcome.targetRecordId };
}

/**
 * Attach this response's files to the business record the binding just wrote.
 *
 * The point of the whole feature: a reviewer opening the applicant sees the résumé on the
 * applicant, not only on the form response it arrived with. Best-effort and logged — the business
 * record is already written by the time this runs, so failing the dispatch here would report a
 * write that succeeded as a failure and invite a re-drive that duplicates it.
 */
async function attachBoundRecordFiles(
  ctx: DispatchContext,
  targetEntityId: string,
  outcome: BindingOutcome,
  filesVerified: boolean,
): Promise<void> {
  const target = bindingAttachmentTarget(targetEntityId, outcome, filesVerified);
  if (!target) {
    return;
  }
  const result = await syncFileLinks(new MJFileLinkGateway(globalFileLinkProvider(), ctx.principal), {
    target,
    fileIds: fileAnswerIds(ctx.answers),
    responseId: ctx.responseId,
  });
  for (const failure of result.failures) {
    LogError(`Forms binding: response ${ctx.responseId}: ${failure}`);
  }
}

/** The file ids among a response's answers. */
function fileAnswerIds(answers: CanonicalAnswers): string[] {
  return [...answers.Entries()]
    .map(([, value]) => (isFileAnswer(value) ? value.fileId : undefined))
    .filter((id): id is string => Boolean(id));
}

/**
 * Re-check that every file answer on this response has provenance, at bind time.
 *
 * The submit path already refused unverifiable files, so in the normal case this confirms what is
 * already true. It exists for the abnormal case: a response persisted while the check was lenient,
 * or before the check existed at all, must not become writable onto a business record simply
 * because a binding was added later. Returns false on any doubt — including a failed lookup —
 * because the cost of being wrong here is disclosing someone else's file.
 *
 * Attribution is checked, not just scope. The response id IS the draft id the upload endpoint
 * recorded (the widget mints it before uploading and submits under the same id), so a bind-time
 * check can hold files to the same standard the submit-time one did.
 *
 * Deliberately STRICT regardless of `FORMS_UPLOAD_PROVENANCE`. Lenient exists so a rollout does
 * not reject in-flight respondents mid-submission; it is not a reason to copy an unattributable
 * file onto a business record later, when nobody is waiting and the refusal costs nothing.
 */
async function filesAreVerified(ctx: DispatchContext): Promise<boolean> {
  const fileIds = fileAnswerIds(ctx.answers);
  if (fileIds.length === 0) {
    return true;
  }
  try {
    const ledger = await loadUploadLedger(fileIds, ctx.principal);
    return everyFileIsAttributable(
      fileIds,
      ledger,
      { distributionId: ctx.distributionId, clientResponseId: ctx.responseId },
      true,
    );
  } catch (error) {
    LogError(
      `Forms binding: upload provenance lookup failed for response ${ctx.responseId}; ` +
        `refusing file answers: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
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
  outcome: DispatchOutcome = {},
): Promise<void> {
  if (!row) {
    return;
  }
  row.Status = status;
  row.CompletedAt = new Date();
  row.ErrorMessage = errorMessage ?? null;
  row.OutputSummary = outcome.summary ? JSON.stringify({ summary: outcome.summary }) : null;
  // Provenance: which MJ record holds the detail behind this run. Null for a binding, which has no
  // MJ-side run, and for a target that failed before producing one.
  row.ActionExecutionLogID = outcome.actionExecutionLogId ?? null;
  row.AIAgentRunID = outcome.aiAgentRunId ?? null;
  if (!(await row.Save())) {
    LogError(`Forms automation: could not close run record ${row.ID}.`);
  }
}
