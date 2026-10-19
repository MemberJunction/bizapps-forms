/**
 * The three Approved reporting queries `Forms.GetResponseSummary` runs (`metadata/queries/`), their
 * row shapes, and the one way they are run.
 *
 * RUN AS THE SYSTEM USER, after the operation's `Authorize()`. The queries carry run permissions for
 * Developer, Integration and UI only, because `RunQuery` bypasses row-level security: open to every
 * role, the value-counts query would hand any role the raw answer values of any form. The engine
 * decides who may see a form's report (the reading rule, and no row filter on responses or answers —
 * `responseRowFilterRefusal`), then runs the SQL as the principal that holds all three roles — so an
 * author whose roles are none of those three still gets a report, and nothing that is not an
 * aggregate leaves the engine.
 *
 * Every row is parsed into its declared shape here (`RunQuery` returns untyped rows): a column that
 * is missing or the wrong type is a fault, thrown with the query's name, never a NaN on a chart.
 */
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { FormReportingError } from './reporting-errors.js';

/** The `MJ: Queries` names, as the metadata ships them. */
export const REPORT_QUERY = {
  CompletionStats: 'Forms: Response Completion Stats',
  ValueCounts: 'Forms: Question Answer Value Counts',
  FunnelReach: 'Forms: Page Funnel Reach',
} as const;

export type ReportQueryName = (typeof REPORT_QUERY)[keyof typeof REPORT_QUERY];

/** What every reporting query is scoped by: the form, and optionally one of its versions. */
export interface ReportScope {
  formId: string;
  formVersionId?: string;
}

/** `Forms: Response Completion Stats` — exactly one row. */
export interface CompletionStatsRow {
  CompleteCount: number;
  PartialCount: number;
  DisqualifiedCount: number;
  StartedCount: number;
  MedianCompletionSeconds: number | null;
  LastSubmittedAt: Date | null;
}

/** The kind of stored value a value-count row counts. */
export type AnswerValueKind = 'Text' | 'Numeric' | 'Boolean' | 'Date';

/** `Forms: Question Answer Value Counts` — one row per (question, kind, value) over Complete responses. */
export interface ValueCountRow {
  QuestionID: string;
  /** Distinct Complete responses with this value kind for the question (same on each kind's rows). */
  AnsweredResponses: number;
  ValueKind: AnswerValueKind;
  Value: string;
  /** Set on `Numeric` rows only. */
  NumericValue: number | null;
  ValueCount: number;
}

/** `Forms: Page Funnel Reach` — one row per page of the labelling version's snapshot. */
export interface FunnelReachRow {
  PageID: string;
  Title: string | null;
  DisplayOrder: number;
  ReachedCount: number;
  /** Comma-separated snapshot types of the page's questions; `null` for a page with none. */
  QuestionTypes: string | null;
}

/** The provider surface a reporting query needs. */
export type QueryRunner = Pick<DatabaseProviderBase, 'RunQuery'>;

/** The Nunjucks parameters every query takes; `FormVersionID` is left out, not sent empty, when absent. */
function queryParameters(scope: ReportScope): Record<string, string> {
  return scope.formVersionId ? { FormID: scope.formId, FormVersionID: scope.formVersionId } : { FormID: scope.formId };
}

/** Run one reporting query as `system` and return its raw rows, or throw a fault naming it. */
async function runReportQuery(provider: QueryRunner, name: ReportQueryName, scope: ReportScope, system: UserInfo): Promise<Record<string, unknown>[]> {
  const result = await provider.RunQuery({ QueryName: name, Parameters: queryParameters(scope) }, system);
  if (!result?.Success) {
    // The error can carry the rendered SQL; it goes to the log, never to the caller.
    throw new FormReportingError(`The '${name}' query failed for form ${scope.formId}.`, {
      fault: true,
      logDetail: result?.ErrorMessage || 'no detail reported by the provider',
    });
  }
  return (result.Results ?? []) as Record<string, unknown>[];
}

/** The headline figures. Throws when the query returns anything but the one row it always returns. */
export async function readCompletionStats(provider: QueryRunner, scope: ReportScope, system: UserInfo): Promise<CompletionStatsRow> {
  const rows = await runReportQuery(provider, REPORT_QUERY.CompletionStats, scope, system);
  if (rows.length !== 1) {
    throw shapeFault(REPORT_QUERY.CompletionStats, `expected exactly one row, got ${rows.length}`);
  }
  const [row] = rows;
  const name = REPORT_QUERY.CompletionStats;
  return {
    CompleteCount: count(row, 'CompleteCount', name),
    PartialCount: count(row, 'PartialCount', name),
    DisqualifiedCount: count(row, 'DisqualifiedCount', name),
    StartedCount: count(row, 'StartedCount', name),
    MedianCompletionSeconds: nullableNumber(row, 'MedianCompletionSeconds', name),
    LastSubmittedAt: nullableInstant(row, 'LastSubmittedAt', name),
  };
}

/** Per-question value counts over Complete responses. */
export async function readValueCounts(provider: QueryRunner, scope: ReportScope, system: UserInfo): Promise<ValueCountRow[]> {
  const name = REPORT_QUERY.ValueCounts;
  const rows = await runReportQuery(provider, name, scope, system);
  return rows.map((row) => ({
    QuestionID: text(row, 'QuestionID', name),
    AnsweredResponses: count(row, 'AnsweredResponses', name),
    ValueKind: valueKind(row, name),
    Value: text(row, 'Value', name),
    NumericValue: nullableNumber(row, 'NumericValue', name),
    ValueCount: count(row, 'ValueCount', name),
  }));
}

/** Per-page reach over every response status. */
export async function readFunnelReach(provider: QueryRunner, scope: ReportScope, system: UserInfo): Promise<FunnelReachRow[]> {
  const name = REPORT_QUERY.FunnelReach;
  const rows = await runReportQuery(provider, name, scope, system);
  return rows.map((row) => ({
    PageID: text(row, 'PageID', name),
    Title: nullableText(row, 'Title', name),
    DisplayOrder: number(row, 'DisplayOrder', name),
    ReachedCount: count(row, 'ReachedCount', name),
    QuestionTypes: nullableText(row, 'QuestionTypes', name),
  }));
}

const VALUE_KINDS: readonly AnswerValueKind[] = ['Text', 'Numeric', 'Boolean', 'Date'];

function valueKind(row: Record<string, unknown>, query: string): AnswerValueKind {
  const kind = VALUE_KINDS.find((candidate) => candidate === row.ValueKind);
  if (!kind) {
    throw shapeFault(query, `ValueKind ${JSON.stringify(row.ValueKind)} is not one of ${VALUE_KINDS.join(', ')}`);
  }
  return kind;
}

function shapeFault(query: string, detail: string): FormReportingError {
  return new FormReportingError(`The '${query}' query returned a row the report cannot read.`, { fault: true, logDetail: detail });
}

function number(row: Record<string, unknown>, column: string, query: string): number {
  const value = row[column];
  // SQL Server's BIGINT and DECIMAL can arrive as strings from the driver; anything else is a fault.
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw shapeFault(query, `${column} is ${JSON.stringify(value)}, not a number`);
  }
  return parsed;
}

function count(row: Record<string, unknown>, column: string, query: string): number {
  const value = number(row, column, query);
  if (!Number.isInteger(value) || value < 0) {
    throw shapeFault(query, `${column} is ${value}, not a count`);
  }
  return value;
}

function nullableNumber(row: Record<string, unknown>, column: string, query: string): number | null {
  return row[column] === null || row[column] === undefined ? null : number(row, column, query);
}

function text(row: Record<string, unknown>, column: string, query: string): string {
  const value = row[column];
  if (typeof value !== 'string') {
    throw shapeFault(query, `${column} is ${JSON.stringify(value)}, not text`);
  }
  return value;
}

function nullableText(row: Record<string, unknown>, column: string, query: string): string | null {
  return row[column] === null || row[column] === undefined ? null : text(row, column, query);
}

function nullableInstant(row: Record<string, unknown>, column: string, query: string): Date | null {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  const instant = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : undefined;
  if (!instant || Number.isNaN(instant.getTime())) {
    throw shapeFault(query, `${column} is ${JSON.stringify(value)}, not an instant`);
  }
  return instant;
}
