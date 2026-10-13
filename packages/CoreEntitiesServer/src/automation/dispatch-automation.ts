/**
 * Dispatch one configured automation to whatever it targets, and record what happened.
 *
 * This is the layer that knows about MemberJunction: resolving Actions and Agents, reading a
 * binding's kill switch, and writing the two bookkeeping rows (a run record always, an
 * identity-ledger row for a binding). Everything above it — which automations run, in what order,
 * whether a value may overwrite another — is decided elsewhere and tested without a database.
 *
 * Every dispatch runs under the automation service principal. The anonymous respondent never
 * reaches here.
 *
 * A failure is thrown as an {@link AutomationFailure} carrying `retryable`, which is what decides
 * whether the work-queue message that ran it is delivered again: a missing action or a broken
 * binding fails the same way every time, while a dropped connection may not. A target that RAN and
 * reported failure is not retryable either — its side effects may already exist.
 */
import { LogError } from '@memberjunction/core';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam } from '@memberjunction/actions-base';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { everyFileIsAttributable, loadUploadLedger } from '../uploads/upload-provenance.js';
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
  type BindingConfig,
  type BindingOutcome,
} from '../binding/binding-executor.js';
import { readPriorBindingOutcome, recordBindingLedgerRow } from '../binding/binding-ledger.js';
import { MJBindingGateway } from '../binding/mj-binding-gateway.js';
import { syncFileLinks, type FileLinkTarget } from '../file-links/file-links.js';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { fileLinkProviderFor, MJFileLinkGateway } from '../file-links/mj-file-link-gateway.js';

const ENTITY = {
  AutomationRun: FORMS_ENTITY.FormAutomationRun,
  Binding: FORMS_ENTITY.FormEntityBinding,
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
  /** The on-submit chain's isolated provider instance (bizapps-forms#260) — every read and write here runs on it, never the global provider. */
  provider: DatabaseProviderBase;
  /** Which delivery of the work-queue message this is (1-based); stamped on the run row's `AttemptCount`. */
  attempt: number;
  /**
   * Whether the respondent's identity is proven. Always `false` today (spec #303 §6): no verified
   * recipient session exists until #137, so a binding may match a record but never update it.
   */
  respondentVerified: boolean;
  /**
   * The Work Queue `MessageID` whose delivery runs this step — stamped on a NEW run row, the exact
   * identity a redelivery matches on. `null` on the inline submit path, which is never redelivered.
   */
  workQueueMessageId: string | null;
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
export class AutomationFailure extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly outcome: DispatchOutcome = {},
  ) {
    super(message);
    this.name = 'AutomationFailure';
  }
}

/** A failure that will repeat on every attempt: configuration, not circumstance. */
function configFailure(message: string): AutomationFailure {
  return new AutomationFailure(message, false);
}

/**
 * How many times closing a SUCCEEDED step's run row is attempted before giving up. The row is the
 * step's idempotency record for its event: a success left unrecorded is re-run on a redelivery, so
 * a dropped connection on that one write is worth a couple more tries.
 */
export const MAX_SUCCESS_RECORD_ATTEMPTS = 3;

/**
 * Run one automation and record it on its run row — the step's idempotency record for the delivery's
 * event (spec #303 §12). Throws on failure so the runner records it — the runner is the single place
 * that decides what a failure means for the rest of the plan.
 *
 * The row moves `Running` → `Succeeded`, or → `Failed` (a permanent failure: terminal for the event),
 * or → `Pending` (a transient one: a redelivery runs the step again, on this same row). `openRunId`
 * is the event's open row for this step, which a redelivery reuses instead of inserting a second.
 *
 * Recording success sits OUTSIDE the failure handling: a step whose work succeeded is never relabelled
 * `Failed` because writing its row failed. If that write keeps failing, the step is reported as a
 * transient failure — the delivery is retried, and since the row is still open the step WILL run
 * again. That duplicate side effect is ACCEPTED AS DESIGNED (controller ruling, Task 7 fix round 2):
 * it cannot be told apart from a crash in the middle of the step, and repeating a step is the price
 * of never losing one. It is logged as such.
 */
export async function dispatchAutomation(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
  openRunId?: string,
): Promise<void> {
  const run = await openRun(automation, ctx, openRunId);
  let outcome: DispatchOutcome;
  try {
    outcome = await dispatchByTarget(automation, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = !(error instanceof AutomationFailure) || error.retryable;
    await closeRun(run, retryable ? 'Pending' : 'Failed', message, error instanceof AutomationFailure ? error.outcome : {});
    throw error;
  }
  await recordSuccess(run, automation, ctx, outcome);
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
      throw configFailure(`Unknown automation target type for "${automation.name}".`);
  }
}

/** Run an MJ Action with the four standard response-context ids. */
async function runActionTarget(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
): Promise<DispatchOutcome> {
  if (!automation.actionId) {
    throw configFailure(`Automation "${automation.name}" is an Action target with no action.`);
  }
  const engine = ActionEngineServer.Instance;
  await engine.Config(false, ctx.principal);
  const action = engine.Actions.find((a) => a.ID === automation.actionId);
  if (!action) {
    throw configFailure(`Action ${automation.actionId} for "${automation.name}" is not registered.`);
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

  const result = await engine.RunAction({
    Action: action,
    ContextUser: ctx.principal,
    Params: params,
    Filters: [],
    Provider: ctx.provider,
  });
  // `LogEntry` is the `MJ: Action Execution Logs` row the engine wrote for this execution. It is
  // absent when the action is configured to skip logging, and it was absent on every host until
  // V202608242110 granted the runner permission to write one at all.
  const outcome: DispatchOutcome = { actionExecutionLogId: result.LogEntry?.ID ?? undefined };
  if (!result.Success) {
    throw new AutomationFailure(result.Message ?? `Action "${action.Name}" reported failure.`, false, outcome);
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
    throw configFailure(`Automation "${automation.name}" is an Agent target with no agent.`);
  }
  const agent = await ctx.provider.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', ctx.principal);
  if (!agent || !(await agent.Load(automation.agentId))) {
    throw new Error(`Agent ${automation.agentId} for "${automation.name}" could not be loaded.`);
  }

  const result = await new AgentRunner().RunAgent({
    agent,
    contextUser: ctx.principal,
    provider: ctx.provider,
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
    throw new AutomationFailure(
      `Agent "${agent.Name}" reported failure${result.agentRun?.ID ? ` (AIAgentRun ${result.agentRun.ID})` : ''}.`,
      false,
      outcome,
    );
  }
  return { ...outcome, summary: result.agentRun?.ID ? `AgentRun ${result.agentRun.ID}` : undefined };
}

/**
 * Execute an entity binding and record the identity-ledger row.
 *
 * The settings are the published version's (`automation.binding`), not the live row's: the response
 * is pinned to the version it answered. The live row is read for its kill switch — `Disabled` stops
 * the write whatever the snapshot says — and for the entity id the ledger records; and, for a
 * snapshot published before bindings were frozen into it, for the settings themselves.
 */
async function runBindingTarget(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
): Promise<DispatchOutcome> {
  if (!automation.bindingId) {
    throw configFailure(`Automation "${automation.name}" is an EntityBinding target with no binding.`);
  }
  const binding = await ctx.provider.GetEntityObject<mjBizAppsFormsFormEntityBindingEntity>(ENTITY.Binding, ctx.principal);
  if (!binding || !(await binding.Load(automation.bindingId))) {
    // Removing a step never deletes its binding, so a missing row was deleted on purpose and will
    // not come back on a retry.
    throw configFailure(`Binding ${automation.bindingId} for "${automation.name}" could not be loaded.`);
  }
  if (binding.Status !== 'Active' || automation.binding?.status === 'Disabled') {
    return { summary: 'Binding is disabled.' };
  }

  const config = bindingConfigOf(automation, binding);

  // Computed once and used twice: it decides both whether a file id may be WRITTEN onto the
  // target record and whether the file may be ATTACHED to it. Asking twice would let the two
  // answers disagree about the same response.
  const filesVerified = await filesAreVerified(ctx);

  const result = await executeBinding({
    config,
    answers: ctx.answers,
    questionTypes: ctx.questionTypes,
    gateway: Object.assign(new MJBindingGateway(ctx.principal, ctx.provider), {
      findPriorOutcome: (responseId: string) =>
        readPriorBindingOutcome(automation.bindingId as string, responseId, ctx.principal, ctx.provider),
    }),
    responseId: ctx.responseId,
    allowedEntities: ctx.allowedEntities,
    // File answers reach a target field only because the submit path refused to persist any file
    // id it could not attribute to this respondent's own upload. Defence in depth rather than
    // trust: a response persisted under an older, more lenient configuration must not become
    // writable to a business record just because the setting changed afterwards.
    allowFileAnswers: filesVerified,
    respondentVerified: ctx.respondentVerified,
  });
  if (bindingFailed(result)) {
    throw new AutomationFailure(`${result.failure.scope}: ${result.failure.message}`, result.failure.retryable);
  }

  // A match that was deliberately not written is recorded too — as `Skipped` with the matched id —
  // so "this response matched that record" is on the ledger, not lost.
  await recordBindingLedgerRow(
    automation.bindingId,
    binding.TargetEntityID,
    ctx.responseId,
    result.outcome,
    ctx.principal,
    ctx.provider,
  );
  await attachBoundRecordFiles(ctx, binding.TargetEntityID, result.outcome, filesVerified);
  return {
    // A binding writes a business record directly rather than through an Action or an Agent, so
    // there is no MJ-side run to point at; the identity-ledger row above is its provenance.
    summary: `${result.outcome.kind}${result.outcome.targetRecordId ? ` ${result.outcome.targetRecordId}` : ''}`,
  };
}

/**
 * The settings this run writes with: the snapshot's, or — for a version published before #303 froze
 * them into it — the live row's, parsed with the strict parsers. An unreadable live row is the
 * author's to fix, so it is not retried.
 */
function bindingConfigOf(
  automation: PublishedFormAutomation,
  live: Pick<mjBizAppsFormsFormEntityBindingEntity, 'TargetEntityName' | 'FieldMappings' | 'IdentityRule' | 'MergePolicy'>,
): BindingConfig {
  const frozen = automation.binding;
  if (frozen) {
    return {
      targetEntityName: frozen.targetEntityName,
      fieldMappings: frozen.fieldMappings,
      identityRule: frozen.identityRule,
      mergePolicy: frozen.mergePolicy,
    };
  }
  try {
    return parseBindingConfig(
      live.TargetEntityName,
      { fieldMappings: live.FieldMappings, identityRule: live.IdentityRule, mergePolicy: live.MergePolicy },
      { fieldMappings: parseFieldMappings, identityRule: parseIdentityRule, mergePolicy: parseMergePolicy },
    );
  } catch (error) {
    throw configFailure(`config: the binding of "${automation.name}" cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
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
  const result = await syncFileLinks(new MJFileLinkGateway(fileLinkProviderFor(ctx.provider), ctx.principal), {
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
    const ledger = await loadUploadLedger(fileIds, ctx.principal, ctx.provider);
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

/**
 * Open the step's run row — the event's open row when there is one, else a new one — and mark it
 * `Running` for this attempt. A row that cannot be opened stops the step BEFORE its side effects: the
 * row is what keeps a redelivery from running the step twice, so the step does not run without it,
 * and the failure is transient (the next delivery tries again).
 */
async function openRun(
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
  openRunId: string | undefined,
): Promise<mjBizAppsFormsFormAutomationRunEntity> {
  const row = await ctx.provider.GetEntityObject<mjBizAppsFormsFormAutomationRunEntity>(ENTITY.AutomationRun, ctx.principal);
  const opened = row ? (openRunId ? await row.Load(openRunId) : row.NewRecord()) : false;
  if (!row || !opened) {
    throw new AutomationFailure(`The run record of "${automation.name}" could not be ${openRunId ? 'reopened' : 'created'}; the step was not run.`, true);
  }
  if (!openRunId) {
    row.FormAutomationID = automation.id;
    row.FormResponseID = ctx.responseId;
    // A reused row already carries its message: it was found BY it.
    row.WorkQueueMessageID = ctx.workQueueMessageId;
  }
  row.Status = 'Running';
  row.AttemptCount = ctx.attempt;
  row.StartedAt = new Date();
  row.CompletedAt = null;
  row.ErrorMessage = null;
  if (!(await row.Save())) {
    throw new AutomationFailure(
      `The run record of "${automation.name}" could not be saved (${row.LatestResult?.CompleteMessage ?? 'no detail'}); the step was not run.`,
      true,
    );
  }
  return row;
}

/** Close the row `Failed` or `Pending`. A failure to write it is logged; the step's own error is what the caller rethrows. */
async function closeRun(
  row: mjBizAppsFormsFormAutomationRunEntity,
  status: 'Failed' | 'Pending',
  errorMessage: string,
  outcome: DispatchOutcome,
): Promise<void> {
  try {
    if (!(await saveClosed(row, status, errorMessage, outcome))) {
      LogError(`Forms automation: could not close run record ${row.ID} as ${status}: ${row.LatestResult?.CompleteMessage ?? 'no detail'}`);
    }
  } catch (err) {
    LogError(`Forms automation: could not close run record ${row.ID} as ${status}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Record a success, trying up to {@link MAX_SUCCESS_RECORD_ATTEMPTS} times. Giving up leaves the row
 * open — never `Failed` — and throws a transient failure, so the delivery is retried.
 */
async function recordSuccess(
  row: mjBizAppsFormsFormAutomationRunEntity,
  automation: PublishedFormAutomation,
  ctx: DispatchContext,
  outcome: DispatchOutcome,
): Promise<void> {
  let lastProblem = 'no detail';
  for (let attempt = 1; attempt <= MAX_SUCCESS_RECORD_ATTEMPTS; attempt++) {
    try {
      if (await saveClosed(row, 'Succeeded', null, outcome)) {
        return;
      }
      lastProblem = row.LatestResult?.CompleteMessage || 'the save was refused';
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : String(err);
    }
  }
  const message =
    `"${automation.name}" (${automation.id}) succeeded, but its run row could not be closed after ` +
    `${MAX_SUCCESS_RECORD_ATTEMPTS} attempts (${lastProblem}); the row stays open, so a redelivery of response ` +
    `${ctx.responseId} will run the step again.`;
  LogError(`Forms automation: ${message}`);
  throw new AutomationFailure(message, true, outcome);
}

/** Write the row's closing state; the save's own result. */
async function saveClosed(
  row: mjBizAppsFormsFormAutomationRunEntity,
  status: 'Succeeded' | 'Failed' | 'Pending',
  errorMessage: string | null,
  outcome: DispatchOutcome,
): Promise<boolean> {
  row.Status = status;
  row.CompletedAt = new Date();
  row.ErrorMessage = errorMessage;
  row.OutputSummary = outcome.summary ? JSON.stringify({ summary: outcome.summary }) : null;
  // Provenance: which MJ record holds the detail behind this run. Null for a binding, which has no
  // MJ-side run, and for a target that failed before producing one.
  row.ActionExecutionLogID = outcome.actionExecutionLogId ?? null;
  row.AIAgentRunID = outcome.aiAgentRunId ?? null;
  return row.Save();
}
