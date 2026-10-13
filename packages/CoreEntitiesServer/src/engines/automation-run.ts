/**
 * Run one response's on-submit automations — the body of `FormAutomationEngine.RunForResponse`, which
 * the `Forms.RunAutomations` work-queue handler calls for every `forms.response-submitted` message
 * (spec #303 §5, §12).
 *
 * The plan is rebuilt from the published version's `DefinitionSnapshot`, never from the live
 * `FormAutomation` / `FormEntityBinding` rows: a response is pinned to the version it answered, so
 * an author editing the form tomorrow cannot change what today's submission does. (The live binding
 * row is still read, by dispatch, for one thing: `Disabled`, the author's kill switch.)
 *
 * Delivery is at-least-once, so this must be safe to run twice for one message. Idempotency is
 * EVENT-scoped by EXACT IDENTITY (spec #303 §12): a run row belongs to the delivered message's event
 * iff its `WorkQueueMessageID` is that message's `MessageID` (GUID case folded) — the dispatcher
 * stamps it on every row it opens. A row with none (written before the column existed, or by the
 * inline submit path) belongs to no event. A step whose run is terminal for the event (`Succeeded`,
 * `Failed` = permanent, `Skipped`) is not run again; one whose run is still open (`Running`, or
 * `Pending` after a transient failure) runs again on that row. The same rule holds for a final
 * submit and a partial save, so either may be retried, and no save's runs are ever mistaken for
 * another's: a final never skips a step because a partial save's run of it succeeded, and partial
 * save P2 runs its OnPartial steps even when P1 was delivered after P2 was published. (The time
 * window this replaced misattributed exactly those two; the column closed both.) A unique index
 * could not do this: an OnPartial step legitimately has one run per partial save.
 *
 * Still in force from earlier rounds: the `forms.run-automations` subscription is `Ordered` on the
 * response id, so one response's deliveries are handled in publish order; and a partial-save
 * delivery that finds its response already Complete is stale and runs nothing.
 *
 * A replay of a dead letter (`isReplay`) reopens the rows that dead letter closed — `Failed` with
 * {@link DEAD_LETTERED_RUN_PREFIX} and carrying this message's id — so it runs those steps again.
 *
 * Sync steps run one at a time on the provider handed in; each Async step on an isolated instance of
 * its own, because they run concurrently and a transaction one opens would otherwise capture the
 * others' writes (bizapps-forms#260). Everything is awaited.
 */
import { LogError, LogStatus, type DatabaseProviderBase, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import {
  CanonicalAnswers,
  computeScore,
  hasUnreachableAutomations,
  quoteSqlString,
  resolveOnSubmitDispatch,
  resolveVisibleQuestions,
  type FormQuestionType,
  type PublishedFormAutomation,
  type PublishedFormDefinition,
  type StoredAnswerRow,
  type mjBizAppsFormsFormAutomationRunEntity,
  type mjBizAppsFormsFormResponseEntityType,
} from '@mj-biz-apps/forms-entities';
import { allowedBindingEntities } from '../automation/allowed-entities.js';
import { planAutomations, type AutomationRunState, type PriorRun } from '../automation/automation-plan.js';
import { runAutomations, type AutomationRunResult } from '../automation/automation-runner.js';
import { buildConditionAnswers } from '../automation/condition-answers.js';
import { dispatchAutomation, type DispatchContext } from '../automation/dispatch-automation.js';
import { runLegacyOnSubmitHooks, type LegacyHookResult } from '../automation/legacy-hooks.js';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { withIsolatedProvider } from '../shared/isolated-provider.js';
import { parsePublishedDefinition } from '../shared/snapshot-parser.js';
import type { ResponseSubmittedTrigger } from '../work-queue/response-submitted.js';
import { FormAutomationError } from './automation-errors.js';

/** Which response, for which save, run as whom. */
export interface ResponseAutomationRequest {
  responseId: string;
  /** `OnComplete` for a final submit, `OnPartial` for a partial save. */
  trigger: ResponseSubmittedTrigger;
  /**
   * Who the steps RUN as: the automation service principal (`resolveAutomationPrincipal`), never
   * the respondent and never the system user — its grants are the ceiling on what a form's steps can
   * do. The reads that plan them (the response, its answers, its version's snapshot) are made as the
   * calling user instead: the principal holds no grant on Form Versions, by design.
   */
  principal: UserInfo;
  /** Which delivery of the message this is (1-based); stamped on each run row. Default 1. */
  attempt?: number;
  /**
   * The delivered message's Work Queue `MessageID` — its EVENT's identity. Stamped on every run row
   * opened; the rows carrying it are the ones a redelivery must not repeat. Absent on the inline
   * submit path, which is never redelivered: then no earlier run counts, and new rows carry none.
   */
  eventMessageId?: string;
  /**
   * The delivery is an operator's REPLAY of a dead letter: the rows that dead letter closed (see
   * {@link DEAD_LETTERED_RUN_PREFIX}) are open again, so the replay runs the steps it exists to run.
   */
  isReplay?: boolean;
  /** A delivery told to stop (cancelled, lease lost, shutting down) starts no further step. */
  signal?: AbortSignal;
}

/** What running a response's automations did. */
export interface ResponseAutomationReport {
  /** How the form's on-submit work is defined: its own steps, or the four legacy hooks. */
  dispatch: 'configured' | 'legacy';
  /** One entry per planned step (configured dispatch). */
  results: AutomationRunResult[];
  /** One entry per legacy hook (legacy dispatch). */
  legacy: LegacyHookResult[];
  /**
   * Whether delivering the message again could help: some step failed transiently, or was never
   * started because the run was stopped. Safe for a partial save and a final submit alike — the
   * redelivery re-runs only the steps with no terminal run for the event.
   */
  retry: boolean;
  /** Some step was not started because the run was told to stop (read off the results). */
  stopped: boolean;
  /**
   * A partial-save message delivered after its response was completed: nothing ran and nothing
   * was written (see {@link runResponseAutomations}).
   */
  stale: boolean;
}

type ResponseRow = Pick<mjBizAppsFormsFormResponseEntityType, 'ID' | 'FormID' | 'FormVersionID' | 'FormDistributionID' | 'Status'>;

/** A run row as the event scope reads it. */
interface RunRow {
  ID: string;
  FormAutomationID: string;
  Status: AutomationRunState;
  ErrorMessage: string | null;
  WorkQueueMessageID: string | null;
}

/**
 * The `ErrorMessage` a dead-lettered delivery writes on each row it closes — fixed text, so a replay
 * of THAT message can tell the rows its dead letter closed (carrying its id) from a
 * step that failed permanently, and reopen only those.
 */
export const DEAD_LETTERED_RUN_PREFIX = 'Dead-lettered: ';

/**
 * The `ErrorMessage` an abandoned partial save writes (a partial never dead-letters; see the
 * handler). Deliberately NOT the dead-letter prefix: nothing replays an abandoned partial.
 */
export const ABANDONED_RUN_PREFIX = 'Abandoned after the retry limit (partial save): ';

const TRIGGERS: readonly ResponseSubmittedTrigger[] = ['OnComplete', 'OnPartial'];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What one response's automations need, read in two round trips. */
interface LoadedResponse {
  response: ResponseRow;
  answers: CanonicalAnswers;
  /** Every run row of the response; {@link eventRuns} scopes them to an event. */
  runs: RunRow[];
  definition: PublishedFormDefinition;
}

/**
 * Run `request`'s automations as `request.principal`, reading what plans them as `reader`. See the
 * module header. Throws {@link FormAutomationError}.
 */
export async function runResponseAutomations(
  request: ResponseAutomationRequest,
  provider: DatabaseProviderBase,
  reader: UserInfo,
): Promise<ResponseAutomationReport> {
  if (!TRIGGERS.some((t) => t === request.trigger)) {
    throw new FormAutomationError(`"${String(request.trigger)}" is not a trigger; it must be one of ${TRIGGERS.join(', ')}.`);
  }
  const principal = request.principal;
  const loaded = await loadResponse(request.responseId, provider, reader);
  if (request.trigger === 'OnPartial' && loaded.response.Status === 'Complete') {
    // Stale (controller ruling, Task 7 fix round 2): the completion has its own message. Running the
    // partial's steps now would at best repeat work, and at worst write run rows the final event
    // counts as its own — making the final skip an OnCompleteOrPartial step. So: nothing.
    LogStatus(`[FormAutomationEngine] partial-save automations for response ${loaded.response.ID} not run: the response is already Complete.`);
    return { dispatch: 'configured', results: [], legacy: [], retry: false, stopped: false, stale: true };
  }
  if (request.trigger === 'OnComplete' && loaded.response.Status !== 'Complete') {
    // A final-submit message is published only for a real completion. Anything else — above all a
    // Disqualified row — must never fire completion side effects (an email to a screened-out
    // respondent, a record for them), whatever put the message on the queue.
    throw new FormAutomationError(
      `Response ${request.responseId} is ${loaded.response.Status}, not Complete, so its completion automations do not run.`,
    );
  }
  const dispatch = resolveOnSubmitDispatch(loaded.definition);
  if (dispatch.kind === 'legacy') {
    return runLegacy(request, loaded, provider, principal);
  }
  if (hasUnreachableAutomations(loaded.definition)) {
    LogStatus(`[FormAutomationEngine] version ${loaded.response.FormVersionID} carries automations its Legacy mode does not run.`);
  }

  const complete = request.trigger === 'OnComplete';
  const conditionAnswers = buildConditionAnswers(loaded.definition, loaded.answers);
  const plan = planAutomations(dispatch.automations, {
    complete,
    answers: conditionAnswers,
    score: computeScore(resolveVisibleQuestions(loaded.definition.pages, conditionAnswers), conditionAnswers),
    priorRuns: eventRuns(loaded.runs, request.eventMessageId, request.isReplay === true),
  });
  const context = dispatchContextFor(request, loaded, principal);
  const results = await runAutomations({
    plan,
    signal: request.signal,
    dispatch: (automation, openRunId) => dispatchOn(automation, openRunId, context, provider, request.responseId),
  });
  const stopped = results.some((r) => r.stopped === true);
  return {
    dispatch: 'configured',
    results,
    legacy: [],
    retry: stopped || results.some((r) => r.status === 'Failed' && r.retryable === true),
    stopped,
    stale: false,
  };
}

/**
 * Each step's run for the event `messageId` names: the rows stamped with that id (GUID case folded).
 * `undefined` (no event) is no runs at all, and a row with no id belongs to none. One row per step
 * per message is the norm (a redelivery reuses its row); were there two, the last read wins. On a
 * replay, a row this message's dead letter closed (`Failed` with {@link DEAD_LETTERED_RUN_PREFIX})
 * reads as open.
 */
function eventRuns(runs: readonly RunRow[], messageId: string | undefined, isReplay: boolean): Map<string, PriorRun> {
  const event = messageId?.trim().toLowerCase();
  const prior = new Map<string, PriorRun>();
  if (!event) {
    return prior;
  }
  for (const row of runs) {
    if (!belongsTo(row.WorkQueueMessageID, event)) {
      continue;
    }
    const reopened = isReplay && row.Status === 'Failed' && (row.ErrorMessage ?? '').startsWith(DEAD_LETTERED_RUN_PREFIX);
    prior.set(String(row.FormAutomationID).toLowerCase(), { runId: row.ID, status: reopened ? 'Pending' : row.Status });
  }
  return prior;
}

/** Whether a run's stamped message id is `event` (already folded); a row with none belongs to no event. */
function belongsTo(stamped: string | null | undefined, event: string): boolean {
  return typeof stamped === 'string' && stamped.trim().toLowerCase() === event;
}

/** What `closeOpenRuns` is asked to close. */
export interface CloseOpenRunsRequest {
  responseId: string;
  /** The message's `MessageID`: only rows stamped with it are closed. */
  eventMessageId: string;
  /**
   * Why the delivery gave up: `DeadLettered` (a final submit — a replay may reopen these rows) or
   * `Abandoned` (a partial save, which never dead-letters). Decides the row's message prefix.
   */
  closedAs: 'DeadLettered' | 'Abandoned';
  /** Recorded, after the prefix, as each row's `ErrorMessage`. */
  reason: string;
}

/**
 * Close the event's open (`Running`/`Pending`) rows `Failed` — what a dead-lettered or abandoned
 * delivery leaves behind, so no step stays `Running` forever. Returns the steps (automation ids)
 * whose rows were closed. A row that cannot be closed is logged and left out.
 */
export async function closeOpenRuns(request: CloseOpenRunsRequest, provider: DatabaseProviderBase, user: UserInfo): Promise<string[]> {
  const id = requireResponseId(request.responseId);
  const read = await provider.RunView<mjBizAppsFormsFormAutomationRunEntity>(
    {
      EntityName: FORMS_ENTITY.FormAutomationRun,
      ExtraFilter: `FormResponseID=${quoteSqlString(id)} AND Status IN ('Running','Pending')`,
      ResultType: 'entity_object',
      BypassCache: true,
    },
    user,
  );
  if (!read.Success) {
    throw readFailure(id, read.ErrorMessage);
  }
  const event = request.eventMessageId?.trim().toLowerCase() ?? '';
  if (!event) {
    throw new FormAutomationError(`Closing the open runs of response ${id} needs the message they belong to; none was given.`);
  }
  const prefix = request.closedAs === 'DeadLettered' ? DEAD_LETTERED_RUN_PREFIX : ABANDONED_RUN_PREFIX;
  const closed: string[] = [];
  for (const row of read.Results) {
    if (!belongsTo(row.WorkQueueMessageID, event)) {
      continue;
    }
    row.Status = 'Failed';
    row.CompletedAt = new Date();
    row.ErrorMessage = `${prefix}${request.reason}`;
    if (await row.Save()) {
      closed.push(row.FormAutomationID);
    } else {
      LogError(`[FormAutomationEngine] could not close run ${row.ID} of response ${id}: ${row.LatestResult?.CompleteMessage ?? 'no detail'}`);
    }
  }
  return closed;
}

/**
 * Run one step: a Sync step on the delivery's own provider, an Async one on an isolated instance of
 * it, created for that step and released when it settles. The instance is created from `provider`,
 * never the process-global one.
 */
function dispatchOn(
  automation: PublishedFormAutomation,
  openRunId: string | undefined,
  context: Omit<DispatchContext, 'provider'>,
  provider: DatabaseProviderBase,
  responseId: string,
): Promise<void> {
  if (automation.executionMode !== 'Async') {
    return dispatchAutomation(automation, { ...context, provider }, openRunId);
  }
  return withIsolatedProvider(
    // Named by automation AND response: several Async steps of one response run at once.
    `on-submit automation ${automation.id} for response ${responseId}`,
    (own) => dispatchAutomation(automation, { ...context, provider: own }, openRunId),
    provider,
  );
}

function dispatchContextFor(
  request: ResponseAutomationRequest,
  loaded: LoadedResponse,
  principal: UserInfo,
): Omit<DispatchContext, 'provider'> {
  return {
    responseId: loaded.response.ID,
    formId: loaded.response.FormID,
    formVersionId: loaded.response.FormVersionID,
    distributionId: loaded.response.FormDistributionID ?? '',
    answers: loaded.answers,
    questionTypes: questionTypesOf(loaded.definition),
    principal,
    allowedEntities: allowedBindingEntities(),
    attempt: request.attempt ?? 1,
    // The event's identity, stamped on every row this run opens; none on the inline path.
    workQueueMessageId: request.eventMessageId?.trim().toLowerCase() || null,
    // No verified recipient session exists until #137 (spec #303 §6): a binding may find a
    // respondent's record, never update it.
    respondentVerified: false,
  };
}

/** The four legacy hooks, for a completed response of a form that configures nothing. */
async function runLegacy(
  request: ResponseAutomationRequest,
  loaded: LoadedResponse,
  provider: DatabaseProviderBase,
  principal: UserInfo,
): Promise<ResponseAutomationReport> {
  const report: ResponseAutomationReport = { dispatch: 'legacy', results: [], legacy: [], retry: false, stopped: false, stale: false };
  // The legacy hooks never ran for a partial save.
  if (request.trigger !== 'OnComplete') {
    return report;
  }
  if (request.signal?.aborted) {
    return { ...report, stopped: true };
  }
  await ActionEngineServer.Instance.Config(false, principal);
  const legacy = await runLegacyOnSubmitHooks(
    {
      responseId: loaded.response.ID,
      formId: loaded.response.FormID,
      formVersionId: loaded.response.FormVersionID,
      distributionId: loaded.response.FormDistributionID ?? '',
    },
    principal,
    provider,
  );
  // Never retried: they write no run rows, so a redelivery would fire every one of them again.
  return { ...report, legacy };
}

/**
 * The response, its answers, the steps already succeeded for it, and its version's definition.
 * A failed read is retryable and says so — it is never "no response" or "nothing succeeded", which
 * would skip or repeat side effects. Its words go to the log only.
 */
function requireResponseId(responseId: string): string {
  const id = responseId?.trim() ?? '';
  if (!GUID.test(id)) {
    throw new FormAutomationError(`"${id}" is not a response id, so no automation can run for it.`);
  }
  return id;
}

async function loadResponse(responseId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<LoadedResponse> {
  const id = requireResponseId(responseId);
  const reads: RunViewParams[] = [
    {
      EntityName: FORMS_ENTITY.FormResponse,
      ExtraFilter: `ID=${quoteSqlString(id)}`,
      Fields: ['ID', 'FormID', 'FormVersionID', 'FormDistributionID', 'Status'],
      ResultType: 'simple',
      BypassCache: true,
    },
    {
      EntityName: FORMS_ENTITY.FormResponseAnswer,
      ExtraFilter: `ResponseID=${quoteSqlString(id)}`,
      Fields: ['QuestionID', 'TextValue', 'NumericValue', 'DateValue', 'BooleanValue', 'JSONValue', 'FileID'],
      ResultType: 'simple',
      BypassCache: true,
    },
    {
      EntityName: FORMS_ENTITY.FormAutomationRun,
      ExtraFilter: `FormResponseID=${quoteSqlString(id)}`,
      Fields: ['ID', 'FormAutomationID', 'Status', 'ErrorMessage', 'WorkQueueMessageID'],
      OrderBy: '__mj_CreatedAt',
      ResultType: 'simple',
      BypassCache: true,
    },
  ];
  const [responses, answers, runs] = await provider.RunViews<Record<string, unknown>>(reads, user);
  const failed = [responses, answers, runs].find((r) => !r?.Success);
  if (failed || !responses || !answers || !runs) {
    throw readFailure(id, failed?.ErrorMessage);
  }
  const response = responses.Results[0] as unknown as ResponseRow | undefined;
  if (!response) {
    throw new FormAutomationError(`Response ${id} does not exist, so it has no automations to run.`);
  }
  return {
    response,
    answers: new CanonicalAnswers(answers.Results as unknown as StoredAnswerRow[]),
    runs: runs.Results as unknown as RunRow[],
    definition: await loadDefinition(response, provider, user),
  };
}

/** The published definition the response answered. Unreadable is final: a retry reads the same text. */
async function loadDefinition(response: ResponseRow, provider: DatabaseProviderBase, user: UserInfo): Promise<PublishedFormDefinition> {
  const read = await provider.RunView<{ DefinitionSnapshot: string | null }>(
    {
      EntityName: FORMS_ENTITY.FormVersion,
      ExtraFilter: `ID=${quoteSqlString(response.FormVersionID)}`,
      Fields: ['ID', 'DefinitionSnapshot'],
      ResultType: 'simple',
      BypassCache: true,
    },
    user,
  );
  if (!read.Success) {
    throw readFailure(response.ID, read.ErrorMessage);
  }
  const definition = parsePublishedDefinition(read.Results[0]?.DefinitionSnapshot ?? null);
  if (!definition) {
    throw new FormAutomationError(
      `The published definition of version ${response.FormVersionID} (response ${response.ID}) cannot be read, so its automations cannot be planned.`,
      { fault: true },
    );
  }
  return definition;
}

function readFailure(responseId: string, detail: string | undefined): FormAutomationError {
  return new FormAutomationError(`Response ${responseId} could not be read for its automations.`, {
    fault: true,
    retryable: true,
    logDetail: detail || 'no detail',
  });
}

/**
 * Every question's type, keyed by id. `CanonicalAnswers` carries values without types by design;
 * entity binding needs both to decide whether a `Time` is an instant or a clock at its target column.
 */
function questionTypesOf(definition: PublishedFormDefinition): ReadonlyMap<string, FormQuestionType> {
  const types = new Map<string, FormQuestionType>();
  for (const page of definition.pages) {
    for (const question of page.questions) {
      types.set(question.id, question.type);
    }
  }
  return types;
}
