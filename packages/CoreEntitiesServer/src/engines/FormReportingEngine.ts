/**
 * `FormReportingEngine` — response reporting on the server (spec #303 §4, Task 9): the dashboard's
 * summary, a paged response list (which the export pages through with answers), and one response's
 * detail. `Forms.GetResponseSummary`, `Forms.ListResponses` and `Forms.GetResponseDetail` are thin
 * wrappers over these; their `Authorize` (the reading rule in `form-authoring-authorization.ts`)
 * has run before anything here does. Read-only: no method opens a transaction or writes a row.
 *
 * WHO EACH READ RUNS AS, and why it differs:
 *  - The SUMMARY returns aggregates, so it reads as the SYSTEM user: its three Approved queries
 *    carry run permissions the authoring roles need not hold (`reporting/report-queries.ts`), and its
 *    raw-value read for the profile, written-answer and Matrix sections is the same population
 *    (`reporting/insight-answers.ts`). Only the form and its labelling version are read as the
 *    caller — so a form the caller cannot see cannot be summarised. Before elevating, the engine
 *    refuses a caller the reading rule refuses, and one whose reads of responses or answers are
 *    row-filtered (role RLS or an API key's row filter): the system user would aggregate rows that
 *    caller cannot read, so such a caller gets no summary rather than a wrong one.
 *  - The LIST and the DETAIL return rows, so they read as the CALLER: row-level security decides which
 *    responses and answers come back, exactly as it did when the browser read them.
 *
 * Replaces forms-ng's `FormsReportingService.loadReport` (every response and answer of a form
 * fetched with `IgnoreMaxRows` and aggregated in the browser) and `ResponsesDataService`'s list and
 * detail reads. Those stay in forms-ng until Task 10 switches the dashboard over and deletes them.
 *
 * Caller-facing messages are fixed sentences; provider, SQL and exception text travels on
 * `logDetail` to the one log line `runEngineCall` writes.
 */
import { EntityPermissionType, LogError, type DatabaseProviderBase, type EntityInfo, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
  answerHoldsValue,
  deriveRespondentLabel,
  MAX_RESPONSE_PAGE_SIZE,
  MAX_RESPONSE_SEARCH_LENGTH,
  quoteSqlString,
  sqlLiteral,
  type FormsGetResponseDetailOutput,
  type FormsGetResponseSummaryOutput,
  type FormsListResponsesOutput,
  type FormsResponseAutomationEvent,
  type FormsResponseAutomationRun,
  type FormsResponseBindingRecord,
  type FormsResponseListRow,
  type FormsResponseUpload,
  type FormsStoredAnswer,
  type mjBizAppsFormsFormAutomationEventEntityType,
  type mjBizAppsFormsFormAutomationRunEntityType,
  type mjBizAppsFormsFormEntityBindingRecordEntityType,
  type mjBizAppsFormsFormResponseAnswerEntityType,
  type mjBizAppsFormsFormResponseEntityType,
  type mjBizAppsFormsFormUploadEntityType,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { parsePublishedDefinition } from '../shared/snapshot-parser.js';
import { buildQuestionBreakdowns } from '../reporting/breakdowns.js';
import { buildFunnel } from '../reporting/funnel.js';
import { buildSummaryStats } from '../reporting/headline.js';
import { readInsightAnswers } from '../reporting/insight-answers.js';
import { insightRoleFor } from '../reporting/insight-roles.js';
import { buildOpenTextInsights } from '../reporting/open-text.js';
import { buildRespondentProfile } from '../reporting/profile.js';
import { readCompletionStats, readFunnelReach, readValueCounts, type ReportScope } from '../reporting/report-queries.js';
import { FormReportingError } from '../reporting/reporting-errors.js';
import { responseReadingRefusal, responseRowFilterRefusal } from '../operations/form-authoring-authorization.js';
import { isGuid } from '../shared/guid.js';
import { runEngineCall } from './engine-guards.js';

/** What a caller the summary may not be computed for is told — the same for every reason; the reason is logged. */
export const SUMMARY_NOT_AVAILABLE_MESSAGE = 'The response summary is not available to this user.';

/**
 * What a caller whose access to responses is row-filtered is told (see `responseRowFilterRefusal`).
 * Through the operation such a caller never gets this far — `Authorize` refuses it as `FORBIDDEN` —
 * so this reaches only an in-process caller of the engine.
 */
export const ROW_RESTRICTED_SUMMARY_MESSAGE = 'The response summary is not available to a user whose access to responses is row-restricted.';

/** A response's status (the `FormResponse.Status` CHECK values). */
export type ResponseStatus = mjBizAppsFormsFormResponseEntityType['Status'];

export const RESPONSE_STATUSES: readonly ResponseStatus[] = ['Complete', 'Disqualified', 'Partial'];

/**
 * The list orders a caller may ask for, each with the `ORDER BY` it runs. A fixed set, so no caller
 * text reaches the view; each ends on `ID` so rows tied on the instant (every Partial has no
 * SubmittedAt) keep one order from page to page, and an export neither repeats nor skips a row.
 */
const RESPONSE_ORDER = {
  'SubmittedAt DESC': 'SubmittedAt DESC, ID',
  'SubmittedAt ASC': 'SubmittedAt ASC, ID',
  'StartedAt DESC': 'StartedAt DESC, ID',
  'StartedAt ASC': 'StartedAt ASC, ID',
} as const;

export type ResponseListOrder = keyof typeof RESPONSE_ORDER;

export const RESPONSE_LIST_ORDERS = Object.keys(RESPONSE_ORDER) as ResponseListOrder[];

/** What `GetResponseSummary` is asked for. */
export interface ResponseSummaryRequest {
  formId: string;
  /** Narrow to one version's responses and label from it. Absent: every version, labelled by the Published one. */
  formVersionId?: string;
}

/** What `ListResponses` is asked for. */
export interface ResponseListRequest {
  formId: string;
  formVersionId?: string;
  status?: ResponseStatus;
  /** Zero-based index of the first row. */
  startRow: number;
  /** Rows wanted; lowered to {@link MAX_RESPONSE_PAGE_SIZE}. */
  maxRows: number;
  /** Default `SubmittedAt DESC`. */
  orderBy?: ResponseListOrder;
  /** Attach each row's stored answers and the labelling definition (the export). */
  includeAnswers: boolean;
  /**
   * Narrow to responses whose linked person's name, or any text answer, contains this — matched
   * literally, case as the column's collation decides. Blank or absent: no narrowing.
   */
  search?: string;
}

/** What `GetResponseDetail` is asked for. */
export interface ResponseDetailRequest {
  responseId: string;
  /** The version whose questions label the answers. Absent: the version the response was submitted against. */
  labelFormVersionId?: string;
}

/** Test seams. Production passes none. */
export interface ReportingSeams {
  /** The principal the summary's queries run as; defaults to MJ's system user. */
  readonly systemUser?: UserInfo;
}

/** A form's labelling version, as read. */
interface LabelVersion {
  id: string;
  formId: string;
  snapshot: string | null;
}

/** The answer columns every read here selects. */
const ANSWER_FIELDS = ['ID', 'ResponseID', 'QuestionID', 'TextValue', 'NumericValue', 'DateValue', 'BooleanValue', 'JSONValue', 'FileID'];

type ResponseRow = mjBizAppsFormsFormResponseEntityType;
type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

export class FormReportingEngine extends BaseSingleton<FormReportingEngine> {
  public static get Instance(): FormReportingEngine {
    return super.getInstance<FormReportingEngine>();
  }

  /**
   * Every section of the reporting dashboard for a form, as aggregates: the headline, who responded,
   * the per-question charts, the written-answer insights and the page funnel. No email, phone, name or
   * written answer is returned; `FormsGetResponseSummaryOutput`'s header lists exactly what does come
   * from answers (numeric min/max, grouping labels).
   */
  public async GetResponseSummary(
    request: ResponseSummaryRequest,
    provider: DatabaseProviderBase,
    user: UserInfo,
    seams: ReportingSeams = {},
  ): Promise<FormsGetResponseSummaryOutput> {
    const scope: ReportScope = { formId: requireGuid(request?.formId, 'form'), formVersionId: optionalGuid(request?.formVersionId, 'form version') };
    requireUser(user, `Summarising the responses of form ${scope.formId}`);
    return runEngineCall(provider, `[FormReportingEngine] the response summary of form ${scope.formId} was not built (user ${user.ID})`, () =>
      callerSafe('Building the response summary', async () => {
        // The elevation's own gate, ahead of it: an Action or agent calling the engine in-process never
        // passes through the operation's Authorize, and the row-filter check is one Authorize lacks.
        refuseElevationFor(user, provider);
        const system = systemUserFor(seams);
        const label = await readLabelVersion(provider, scope.formId, scope.formVersionId, user);
        const questions = label ? labelQuestions(label) : [];
        const answerQuestionIds = questions.filter(needsAnswerRows).map((question) => question.id);
        const [stats, values, funnel, insight] = await Promise.all([
          readCompletionStats(provider, scope, system),
          readValueCounts(provider, scope, system),
          readFunnelReach(provider, scope, system),
          readInsightAnswers(provider, scope, answerQuestionIds, system),
        ]);
        const summary = buildSummaryStats(stats);
        // Every rate in the profile and written-answer sections divides by the Complete RESPONSE count,
        // so a skipped question counts against its own coverage instead of reading 100%.
        const total = summary.TotalResponses;
        return {
          FormID: scope.formId,
          LabelVersionID: label?.id ?? null,
          Summary: summary,
          Profile: buildRespondentProfile(questions, insight.rows, total),
          Questions: buildQuestionBreakdowns(questions, values, insight.rows),
          OpenText: buildOpenTextInsights(questions, insight.rows, total),
          Funnel: buildFunnel(funnel),
          InsightAnswersCapped: insight.capped,
        };
      }),
    );
  }

  /**
   * One page of a form's responses, read as the caller, with the total across pages; with
   * `includeAnswers`, each row's stored answers and the definition the export pivots onto — the named
   * version's when the list is narrowed to one, else the Published version's.
   */
  public async ListResponses(request: ResponseListRequest, provider: DatabaseProviderBase, user: UserInfo): Promise<FormsListResponsesOutput> {
    const listing = validateListRequest(request);
    requireUser(user, `Listing the responses of form ${listing.formId}`);
    return runEngineCall(provider, `[FormReportingEngine] the responses of form ${listing.formId} were not listed (user ${user.ID})`, () =>
      callerSafe('Listing responses', async () => {
        requireAnswerRead(provider, user, listing.formId);
        const filter = responseListFilter(listing, provider, user);
        const [counted, page] = await provider.RunViews(
          [
            { EntityName: FORMS_ENTITY.FormResponse, ExtraFilter: filter, ResultType: 'count_only' },
            {
              EntityName: FORMS_ENTITY.FormResponse,
              ExtraFilter: filter,
              Fields: ['ID', 'Status', 'FormVersionID', 'StartedAt', 'SubmittedAt', 'RespondentPersonID', 'RespondentPerson'],
              OrderBy: RESPONSE_ORDER[listing.orderBy],
              StartRow: listing.startRow,
              MaxRows: listing.maxRows,
              ResultType: 'simple',
            },
          ],
          user,
        );
        const responses = rowsOrFault<ResponseRow>(page, `The responses of form ${listing.formId} could not be read.`);
        rowsOrFault(counted, `The responses of form ${listing.formId} could not be counted.`);
        const [answers, label] = await Promise.all([
          readAnswersOf(provider, responses.map((response) => response.ID), user, listing.formId),
          // The version the list is narrowed to labels it, as the summary does; else the Published one.
          readLabelVersion(provider, listing.formId, listing.formVersionId, user),
        ]);
        const questions = label ? labelQuestions(label) : [];
        const answersByResponse = groupByFolded(answers, (answer) => answer.ResponseID);
        const output: FormsListResponsesOutput = {
          Rows: responses.map((response) => listRow(response, answersByResponse.get(response.ID.toLowerCase()) ?? [], questions, listing.includeAnswers)),
          TotalRowCount: counted.TotalRowCount ?? 0,
          LabelVersionID: label?.id ?? null,
        };
        if (listing.includeAnswers && label?.snapshot) {
          output.DefinitionJSON = label.snapshot;
        }
        return output;
      }),
    );
  }

  /**
   * One response with everything its detail view shows, read as the caller: the response, its stored
   * answers, the files behind them, the automation runs it triggered, the automation events its saves
   * queued (a dead-lettered one is what the panel offers to replay) and the records the runs wrote, and
   * the definition that labels the answers. A satellite section the caller may not read is reported
   * in `UnavailableSections`, never as empty — and so is the response's own version when it labels
   * the answers and cannot be read (`question labels`, `DefinitionJSON: null`). A label version the
   * caller names is refused instead.
   */
  public async GetResponseDetail(request: ResponseDetailRequest, provider: DatabaseProviderBase, user: UserInfo): Promise<FormsGetResponseDetailOutput> {
    const responseId = requireGuid(request?.responseId, 'response');
    const labelVersionId = optionalGuid(request?.labelFormVersionId, 'form version');
    requireUser(user, `Reading response ${responseId}`);
    return runEngineCall(provider, `[FormReportingEngine] response ${responseId} was not read (user ${user.ID})`, () =>
      callerSafe('Reading the response', async () => {
        const [responseResult, answersResult, runsResult, eventsResult, bindingsResult] = await provider.RunViews(responseDetailReads(responseId), user);
        const [response] = rowsOrFault<ResponseRow>(responseResult, `Response ${responseId} could not be read.`);
        if (!response) {
          throw new FormReportingError(`Response ${responseId} was not found.`);
        }
        const answers = rowsOrFault<AnswerRow>(answersResult, `The answers of response ${responseId} could not be read.`);
        const unavailable: string[] = [];
        const runs = rowsOrDegrade<mjBizAppsFormsFormAutomationRunEntityType>(runsResult, 'automation runs', responseId, unavailable);
        const events = rowsOrDegrade<mjBizAppsFormsFormAutomationEventEntityType>(eventsResult, 'automation events', responseId, unavailable);
        const bindings = rowsOrDegrade<mjBizAppsFormsFormEntityBindingRecordEntityType>(bindingsResult, 'created records', responseId, unavailable);
        const [uploads, label] = await Promise.all([
          readUploadsOf(provider, answers, user, responseId, unavailable),
          labelVersionId ? readResponseLabel(provider, response, labelVersionId, user) : readPinnedLabel(provider, response, user, unavailable),
        ]);
        return {
          Response: {
            ID: response.ID,
            FormID: response.FormID,
            FormVersionID: response.FormVersionID,
            Status: response.Status,
            StartedAt: isoOrNull(response.StartedAt),
            SubmittedAt: isoOrNull(response.SubmittedAt),
            RespondentPersonID: response.RespondentPersonID ?? null,
            RespondentPerson: response.RespondentPerson ?? null,
          },
          Answers: answers.map(storedAnswer),
          Uploads: uploads.map(uploadOf),
          AutomationRuns: runs.map(automationRunOf),
          AutomationEvents: events.map(automationEventOf),
          BindingRecords: bindings.map((record) => bindingRecordOf(record, provider)),
          LabelFormVersionID: label.id,
          DefinitionJSON: label.snapshot,
          UnavailableSections: unavailable,
        };
      }),
    );
  }
}

/** The five reads keyed on the response id, batched into one round trip. */
function responseDetailReads(responseId: string): RunViewParams[] {
  const byResponse = `FormResponseID=${quoteSqlString(responseId)}`;
  return [
    {
      EntityName: FORMS_ENTITY.FormResponse,
      ExtraFilter: `ID=${quoteSqlString(responseId)}`,
      Fields: ['ID', 'FormID', 'FormVersionID', 'Status', 'StartedAt', 'SubmittedAt', 'RespondentPersonID', 'RespondentPerson'],
      ResultType: 'simple',
    },
    { EntityName: FORMS_ENTITY.FormResponseAnswer, ExtraFilter: `ResponseID=${quoteSqlString(responseId)}`, Fields: ANSWER_FIELDS, ResultType: 'simple', IgnoreMaxRows: true },
    {
      EntityName: FORMS_ENTITY.FormAutomationRun,
      ExtraFilter: byResponse,
      // FormAutomation is the base view's denormalised automation name: no second read.
      Fields: ['ID', 'FormAutomationID', 'FormAutomation', 'Status', 'AttemptCount', 'FormAutomationEventID', 'StartedAt', 'CompletedAt', 'ErrorMessage', 'OutputSummary', 'ActionExecutionLogID', 'AIAgentRunID'],
      OrderBy: '__mj_CreatedAt',
      ResultType: 'simple',
      IgnoreMaxRows: true,
    },
    {
      EntityName: FORMS_ENTITY.FormAutomationEvent,
      ExtraFilter: byResponse,
      Fields: ['ID', 'Trigger', 'Status', 'AttemptCount', 'LastError', 'CompletedAt'],
      OrderBy: '__mj_CreatedAt',
      ResultType: 'simple',
      IgnoreMaxRows: true,
      // The drain writes events with raw SQL, so a cached copy would hide a fresh dead letter.
      BypassCache: true,
    },
    {
      EntityName: FORMS_ENTITY.FormEntityBindingRecord,
      ExtraFilter: byResponse,
      Fields: ['ID', 'BindingID', 'Binding', 'TargetEntityID', 'TargetRecordID', 'Outcome', 'WrittenFields'],
      OrderBy: '__mj_CreatedAt',
      ResultType: 'simple',
      IgnoreMaxRows: true,
    },
  ];
}

/** A list request with every field checked, defaulted and bounded. */
type ValidListRequest = Required<Pick<ResponseListRequest, 'formId' | 'startRow' | 'maxRows' | 'orderBy' | 'includeAnswers'>> &
  Pick<ResponseListRequest, 'formVersionId' | 'status' | 'search'>;

/**
 * Refuse what an in-process caller (an Action, an agent) could hand in that the wire check would
 * have caught: the operation validates the JSON, this validates the call.
 */
function validateListRequest(request: ResponseListRequest): ValidListRequest {
  const formId = requireGuid(request?.formId, 'form');
  const formVersionId = optionalGuid(request?.formVersionId, 'form version');
  if (request.status !== undefined && !RESPONSE_STATUSES.includes(request.status)) {
    throw new FormReportingError(`The status must be one of ${RESPONSE_STATUSES.join(', ')}.`);
  }
  if (request.orderBy !== undefined && !RESPONSE_LIST_ORDERS.includes(request.orderBy)) {
    throw new FormReportingError(`The order must be one of ${RESPONSE_LIST_ORDERS.join(', ')}.`);
  }
  if (!Number.isInteger(request.startRow) || request.startRow < 0) {
    throw new FormReportingError('The first row must be a whole number of at least 0.');
  }
  if (!Number.isInteger(request.maxRows) || request.maxRows < 1) {
    throw new FormReportingError('The page size must be a whole number of at least 1.');
  }
  if (typeof request.includeAnswers !== 'boolean') {
    throw new FormReportingError('Whether to include answers must be true or false.');
  }
  if (request.search !== undefined && typeof request.search !== 'string') {
    throw new FormReportingError('The search must be text.');
  }
  const search = request.search?.trim() || undefined;
  if (search && search.length > MAX_RESPONSE_SEARCH_LENGTH) {
    throw new FormReportingError(`The search can be at most ${MAX_RESPONSE_SEARCH_LENGTH} characters.`);
  }
  return {
    formId,
    formVersionId,
    status: request.status,
    startRow: request.startRow,
    maxRows: Math.min(request.maxRows, MAX_RESPONSE_PAGE_SIZE),
    orderBy: request.orderBy ?? 'SubmittedAt DESC',
    includeAnswers: request.includeAnswers,
    search,
  };
}

function responseListFilter(listing: ValidListRequest, provider: DatabaseProviderBase, user: UserInfo): string {
  const clauses = [`FormID=${quoteSqlString(listing.formId)}`];
  if (listing.formVersionId) {
    clauses.push(`FormVersionID=${quoteSqlString(listing.formVersionId)}`);
  }
  if (listing.status) {
    clauses.push(`Status=${quoteSqlString(listing.status)}`);
  }
  if (listing.search) {
    clauses.push(responseSearchClause(listing.search, provider, user));
  }
  return clauses.join(' AND ');
}

/**
 * The search predicate: the linked person's name, OR any text answer, contains the term.
 *
 * WHY ANSWERS TOO. The list's respondent label is not stored — it is worked out from the linked
 * Person or from the response's own name and email answers (`deriveRespondentLabel`) — so a search on
 * the person alone would miss every anonymous respondent the table names by their email. Any text
 * answer covers every label the table can show, and finds a response by what it said as well.
 *
 * WHO MAY SEARCH ANSWERS. The answer half is a subquery inside the response read, so the RunView
 * applies the caller's permissions and row filter to RESPONSES only. It therefore carries the
 * caller's own row filter on ANSWERS inside it, so nobody finds a response by answer text they are
 * not allowed to see. A caller who may not read answers at all never gets here:
 * {@link requireAnswerRead} refuses the whole list first.
 */
function responseSearchClause(term: string, provider: DatabaseProviderBase, user: UserInfo): string {
  const contains = `LIKE ${sqlLiteral(`%${escapeLikePattern(term)}%`)} ESCAPE '\\'`;
  const byPerson = `RespondentPerson ${contains}`;
  const answers = answerEntityOf(provider);
  const view = provider.QuoteSchemaAndView(answers.SchemaName, answers.BaseView);
  const rowFilter = answers.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '').trim();
  const scoped = rowFilter ? ` AND (${rowFilter})` : '';
  return `(${byPerson} OR ID IN (SELECT ResponseID FROM ${view} WHERE TextValue ${contains}${scoped}))`;
}

/**
 * Refuse a caller who may not read answers, before any read. Every list row's respondent label and
 * answered count are worked out from its answers, read as the caller, so without that right the list
 * cannot be built: MJ would refuse the answer read after the response read had already run. Saying so
 * here names the reason instead of reporting a failed read.
 */
function requireAnswerRead(provider: DatabaseProviderBase, user: UserInfo, formId: string): void {
  if (!answerEntityOf(provider).GetUserPermisions(user).CanRead) {
    throw new FormReportingError(`You may not read the answers of form ${formId}, and the response list is built from them.`);
  }
}

/** The answer entity's metadata. Missing means the app is not installed, which is a fault. */
function answerEntityOf(provider: DatabaseProviderBase): EntityInfo {
  const answers = provider.EntityByName(FORMS_ENTITY.FormResponseAnswer);
  if (!answers) {
    throw new FormReportingError(`The ${FORMS_ENTITY.FormResponseAnswer} entity is not in this host's metadata.`, { fault: true });
  }
  return answers;
}

/** Escape LIKE's own metacharacters (and the escape character itself) so the term matches literally. */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_[]/g, (ch) => `\\${ch}`);
}

/** One list row: who responded, how much they answered, and — for the export — what. */
function listRow(response: ResponseRow, answers: AnswerRow[], questions: readonly PublishedFormQuestion[], includeAnswers: boolean): FormsResponseListRow {
  const row: FormsResponseListRow = {
    ResponseID: response.ID,
    Status: response.Status,
    FormVersionID: response.FormVersionID,
    StartedAt: isoOrNull(response.StartedAt),
    SubmittedAt: isoOrNull(response.SubmittedAt),
    RespondentPersonID: response.RespondentPersonID ?? null,
    Respondent: deriveRespondentLabel(response.RespondentPerson, answers, questions),
    AnsweredCount: answers.filter(answerHoldsValue).length,
  };
  if (includeAnswers) {
    row.Answers = answers.map(storedAnswer);
  }
  return row;
}

/**
 * The answers of one page of responses, read as the caller. `IgnoreMaxRows` because the entity's
 * default row limit would silently cut a page short; the read is bounded by the page instead (at most
 * {@link MAX_RESPONSE_PAGE_SIZE} responses, one row per question each).
 */
async function readAnswersOf(provider: DatabaseProviderBase, responseIds: readonly string[], user: UserInfo, formId: string): Promise<AnswerRow[]> {
  if (responseIds.length === 0) {
    return [];
  }
  const result = await provider.RunView<AnswerRow>(
    {
      EntityName: FORMS_ENTITY.FormResponseAnswer,
      ExtraFilter: `ResponseID IN (${responseIds.map(quoteSqlString).join(',')})`,
      Fields: ANSWER_FIELDS,
      ResultType: 'simple',
      IgnoreMaxRows: true,
    },
    user,
  );
  return rowsOrFault(result, `The answers of form ${formId} could not be read.`);
}

/**
 * The provenance rows of the files these answers reference, or none without a query when no answer
 * holds a file (the common case). Degrades like the other satellite sections.
 */
async function readUploadsOf(
  provider: DatabaseProviderBase,
  answers: readonly AnswerRow[],
  user: UserInfo,
  responseId: string,
  unavailable: string[],
): Promise<mjBizAppsFormsFormUploadEntityType[]> {
  const fileIds = [...new Set(answers.map((answer) => answer.FileID).filter((id): id is string => !!id && isGuid(id)))];
  if (fileIds.length === 0) {
    return [];
  }
  const result = await provider.RunView<mjBizAppsFormsFormUploadEntityType>(
    {
      EntityName: FORMS_ENTITY.FormUpload,
      ExtraFilter: `FileID IN (${fileIds.map(quoteSqlString).join(',')})`,
      Fields: ['ID', 'FileID', 'FileName', 'ContentType', 'SizeBytes', 'Status'],
      ResultType: 'simple',
    },
    user,
  );
  return rowsOrDegrade(result, 'file details', responseId, unavailable);
}

/**
 * The form (which must exist for the caller) and its labelling version: `formVersionId` when named
 * (which must be one of the form's), else the form's Published version, else `null` — a form never
 * published has no labels, which is an answer, not an error.
 */
async function readLabelVersion(provider: DatabaseProviderBase, formId: string, formVersionId: string | undefined, user: UserInfo): Promise<LabelVersion | null> {
  const [formResult, versionResult] = await provider.RunViews(
    [
      { EntityName: FORMS_ENTITY.Form, ExtraFilter: `ID=${quoteSqlString(formId)}`, Fields: ['ID'], ResultType: 'simple' },
      {
        EntityName: FORMS_ENTITY.FormVersion,
        ExtraFilter: formVersionId
          ? `ID=${quoteSqlString(formVersionId)} AND FormID=${quoteSqlString(formId)}`
          : `FormID=${quoteSqlString(formId)} AND Status='Published'`,
        Fields: ['ID', 'FormID', 'DefinitionSnapshot'],
        // One Published version per form is an index's promise; the order makes the pick deterministic anyway.
        OrderBy: 'VersionNumber DESC',
        MaxRows: 1,
        ResultType: 'simple',
      },
    ],
    user,
  );
  const forms = rowsOrFault<{ ID: string }>(formResult, `Form ${formId} could not be read.`);
  if (forms.length === 0) {
    throw new FormReportingError(`Form ${formId} was not found.`);
  }
  const [version] = rowsOrFault<{ ID: string; FormID: string; DefinitionSnapshot: string | null }>(versionResult, `The versions of form ${formId} could not be read.`);
  if (!version) {
    if (formVersionId) {
      throw new FormReportingError(`Form version ${formVersionId} is not a version of form ${formId}.`);
    }
    return null;
  }
  return { id: version.ID, formId: version.FormID, snapshot: version.DefinitionSnapshot ?? null };
}

/** The version that labels a response's answers, refused unless it is a version of the response's own form. */
async function readResponseLabel(provider: DatabaseProviderBase, response: ResponseRow, versionId: string, user: UserInfo): Promise<LabelVersion> {
  const result = await provider.RunView<{ ID: string; FormID: string; DefinitionSnapshot: string | null }>(
    { EntityName: FORMS_ENTITY.FormVersion, ExtraFilter: `ID=${quoteSqlString(versionId)}`, Fields: ['ID', 'FormID', 'DefinitionSnapshot'], ResultType: 'simple' },
    user,
  );
  const [version] = rowsOrFault(result, `Form version ${versionId} could not be read.`);
  if (!version || !UUIDsEqual(version.FormID, response.FormID)) {
    throw new FormReportingError(`Form version ${versionId} is not a version of the form response ${response.ID} was submitted to.`);
  }
  return { id: version.ID, formId: version.FormID, snapshot: version.DefinitionSnapshot ?? null };
}

/**
 * The version a response was submitted against, as its labels — degraded rather than refused.
 *
 * Nobody ASKED for this version (the record view passes none), so a version the caller cannot read,
 * or whose row is gone, is a missing section like the runs or the ledger: the answers, runs and
 * records are still the caller's to see, and the view says the labels are unavailable. A version
 * the caller NAMES goes through {@link readResponseLabel} and is refused instead.
 */
async function readPinnedLabel(provider: DatabaseProviderBase, response: ResponseRow, user: UserInfo, unavailable: string[]): Promise<LabelVersion> {
  const result = await provider.RunView<{ ID: string; FormID: string; DefinitionSnapshot: string | null }>(
    { EntityName: FORMS_ENTITY.FormVersion, ExtraFilter: `ID=${quoteSqlString(response.FormVersionID)}`, Fields: ['ID', 'FormID', 'DefinitionSnapshot'], ResultType: 'simple' },
    user,
  );
  const [version] = rowsOrDegrade(result, 'question labels', response.ID, unavailable);
  if (version && UUIDsEqual(version.FormID, response.FormID)) {
    return { id: version.ID, formId: version.FormID, snapshot: version.DefinitionSnapshot ?? null };
  }
  if (result?.Success) {
    // Read, but no row of the response's own form: deleted, or pointing elsewhere. Same degrade.
    unavailable.push('question labels');
    LogError(`[FormReportingEngine] could not read question labels for response ${response.ID}: its version ${response.FormVersionID} is not a version of form ${response.FormID}. Returning the response without them.`);
  }
  return { id: response.FormVersionID, formId: response.FormID, snapshot: null };
}

/**
 * The labelling version's questions in page, then question, order. A snapshot that will not parse
 * is a fault — a Published version's snapshot is what every respondent was served — never a report
 * silently built with no questions.
 */
function labelQuestions(label: LabelVersion): PublishedFormQuestion[] {
  if (!label.snapshot) {
    return [];
  }
  const definition = parsePublishedDefinition(label.snapshot);
  if (!definition) {
    throw new FormReportingError(`The published definition of form version ${label.id} could not be read.`, {
      fault: true,
      logDetail: `FormVersion ${label.id} DefinitionSnapshot failed parsePublishedDefinition`,
    });
  }
  const byOrder = <T extends { displayOrder: number }>(items: readonly T[]): T[] => [...items].sort((a, b) => a.displayOrder - b.displayOrder);
  return byOrder(definition.pages).flatMap((page) => byOrder(page.questions));
}

/** Whether a question's summary needs its raw answer rows: identity, attachment, written and Matrix. */
function needsAnswerRows(question: PublishedFormQuestion): boolean {
  const role = insightRoleFor(question.type);
  return role === 'identity' || role === 'attachment' || role === 'openText' || role === 'composite';
}

function storedAnswer(answer: AnswerRow): FormsStoredAnswer {
  return {
    ID: answer.ID,
    QuestionID: answer.QuestionID,
    TextValue: answer.TextValue ?? null,
    NumericValue: answer.NumericValue ?? null,
    DateValue: isoOrNull(answer.DateValue),
    BooleanValue: answer.BooleanValue ?? null,
    JSONValue: answer.JSONValue ?? null,
    FileID: answer.FileID ?? null,
  };
}

function uploadOf(upload: mjBizAppsFormsFormUploadEntityType): FormsResponseUpload {
  return {
    ID: upload.ID,
    FileID: upload.FileID,
    FileName: upload.FileName ?? null,
    ContentType: upload.ContentType ?? null,
    SizeBytes: upload.SizeBytes ?? null,
    Status: upload.Status,
  };
}

function automationRunOf(run: mjBizAppsFormsFormAutomationRunEntityType): FormsResponseAutomationRun {
  return {
    ID: run.ID,
    FormAutomationID: run.FormAutomationID,
    FormAutomation: run.FormAutomation,
    Status: run.Status,
    AttemptCount: run.AttemptCount,
    FormAutomationEventID: run.FormAutomationEventID ?? null,
    StartedAt: isoOrNull(run.StartedAt),
    CompletedAt: isoOrNull(run.CompletedAt),
    ErrorMessage: run.ErrorMessage ?? null,
    OutputSummary: run.OutputSummary ?? null,
    ActionExecutionLogID: run.ActionExecutionLogID ?? null,
    AIAgentRunID: run.AIAgentRunID ?? null,
  };
}

function automationEventOf(event: mjBizAppsFormsFormAutomationEventEntityType): FormsResponseAutomationEvent {
  return {
    ID: event.ID,
    Trigger: event.Trigger,
    Status: event.Status,
    AttemptCount: event.AttemptCount,
    LastError: event.LastError ?? null,
    CompletedAt: isoOrNull(event.CompletedAt),
  };
}

/**
 * A binding ledger row with its target entity's canonical name resolved here, for deep links. The
 * column is deliberately not a foreign key (a binding can write to any entity), so there is no view
 * column to read; an id metadata cannot name is `null`, and the row renders without a link.
 */
function bindingRecordOf(record: mjBizAppsFormsFormEntityBindingRecordEntityType, provider: DatabaseProviderBase): FormsResponseBindingRecord {
  return {
    ID: record.ID,
    BindingID: record.BindingID,
    Binding: record.Binding,
    TargetEntityID: record.TargetEntityID,
    TargetEntityName: provider.EntityByID(record.TargetEntityID)?.Name ?? null,
    TargetRecordID: record.TargetRecordID ?? null,
    Outcome: record.Outcome,
    WrittenFields: record.WrittenFields ?? null,
  };
}

/** A read's rows, or a fault whose detail is the provider's error (which can carry SQL) for the log only. */
function rowsOrFault<T>(result: RunViewResult<T> | undefined, message: string): T[] {
  if (!result?.Success) {
    throw new FormReportingError(message, { fault: true, logDetail: result?.ErrorMessage || 'no detail reported by the provider' });
  }
  return result.Results ?? [];
}

/**
 * A satellite section's rows, or none with the section named as unavailable. Logged, never silent:
 * a failure here is nearly always a missing Read grant, and whoever debugs "why is this empty" needs
 * the response and the reason.
 */
function rowsOrDegrade<T>(result: RunViewResult<T> | undefined, section: string, responseId: string, unavailable: string[]): T[] {
  if (result?.Success) {
    return result.Results ?? [];
  }
  unavailable.push(section);
  LogError(`[FormReportingEngine] could not read ${section} for response ${responseId}: ${result?.ErrorMessage || 'no detail'}. Returning the response without them.`);
  return [];
}

function groupByFolded<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item).toLowerCase();
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const instant = value instanceof Date ? value : new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

function requireGuid(value: unknown, what: string): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!isGuid(id)) {
    throw new FormReportingError(id ? `The ${what} id must be a ${what} ID.` : `A ${what} id is required.`);
  }
  return id;
}

function optionalGuid(value: unknown, what: string): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : requireGuid(value, what);
}

function requireUser(user: UserInfo | undefined, what: string): asserts user is UserInfo {
  if (!user) {
    throw new FormReportingError(`${what} needs the acting user; none was given.`);
  }
}

/**
 * Refuse, before any read as the system user, a caller the summary may not be computed for: one the
 * reading rule refuses, or one whose reads of responses or answers are row-filtered (the summary would
 * otherwise aggregate rows that caller cannot read). The reason goes to the log only.
 */
function refuseElevationFor(user: UserInfo, provider: DatabaseProviderBase): void {
  const reading = responseReadingRefusal(user, provider);
  if (reading) {
    throw new FormReportingError(SUMMARY_NOT_AVAILABLE_MESSAGE, { logDetail: reading });
  }
  const rowFilter = responseRowFilterRefusal(user, provider);
  if (rowFilter) {
    throw new FormReportingError(ROW_RESTRICTED_SUMMARY_MESSAGE, { logDetail: rowFilter });
  }
}

/** MJ's system user, or a fault: without it the summary's queries have no principal to run as. */
function systemUserFor(seams: ReportingSeams): UserInfo {
  const system = seams.systemUser ?? UserCache.Instance.GetSystemUser();
  if (!system) {
    throw new FormReportingError('The response summary could not be built on this server; the server log has the detail.', {
      fault: true,
      logDetail: 'MJ has no system user on this host, so the reporting queries have no principal to run as',
    });
  }
  return system;
}

/** Run `work`, turning anything but a {@link FormReportingError} into a fixed fault (detail to the log). */
async function callerSafe<T>(what: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof FormReportingError) {
      throw err;
    }
    throw new FormReportingError(`${what} failed on the server; the server log has the detail.`, {
      fault: true,
      logDetail: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
  }
}
