/**
 * The one read of raw answer VALUES a response summary makes: the Complete responses' answers to
 * identity, attachment, written and Matrix questions. The reporting queries cannot give those
 * sections exactly — contactable people are a union across two questions by response, themes are
 * de-duplicated per response, and Matrix answers are JSON objects — so the engine reads the rows and
 * returns aggregates (`profile.ts`, `open-text.ts`, `breakdowns.ts`). No row read here is returned;
 * only the grouping labels those modules document (domains, countries, organisations, theme terms).
 *
 * Run as the SYSTEM user, after `Authorize()`, for the reason the queries are (`report-queries.ts`):
 * an aggregate is the same whoever asks; the engine decides who may (the reading rule, and no row
 * filter on responses or answers).
 *
 * BOUNDED: a form with a million answers must not load a million rows to draw a panel. The read
 * counts the rows first, then pages through at most {@link MAX_INSIGHT_ANSWER_ROWS} of them, ordered
 * by ID so pages neither overlap nor skip; past the cap the result says so (`capped`) and the summary
 * reports it (`InsightAnswersCapped`) rather than presenting a sample as the whole.
 */
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import type { ReportScope } from './report-queries.js';
import { FormReportingError } from './reporting-errors.js';
import { isGuid } from '../shared/guid.js';

/** The most answer rows one summary reads for its profile, written-answer and Matrix sections. */
export const MAX_INSIGHT_ANSWER_ROWS = 50_000;

/** Rows per page of that read. */
export const INSIGHT_ANSWER_PAGE_SIZE = 5_000;

/** The pages the cap allows — the loop's bound, so it cannot run on whatever the database says. */
const MAX_INSIGHT_ANSWER_PAGES = Math.ceil(MAX_INSIGHT_ANSWER_ROWS / INSIGHT_ANSWER_PAGE_SIZE);

/** One stored answer, with only the columns the three sections read. */
export interface InsightAnswerRow {
  ID: string;
  ResponseID: string;
  QuestionID: string;
  TextValue: string | null;
  JSONValue: string | null;
  FileID: string | null;
}

/** What the read returns: the rows, and whether the cap cut it short. */
export interface InsightAnswers {
  rows: InsightAnswerRow[];
  capped: boolean;
}

/** The provider surface the read needs. */
export type InsightAnswerSource = Pick<DatabaseProviderBase, 'RunView' | 'EntityByName' | 'QuoteSchemaAndView'>;

/**
 * The Complete responses' answers to `questionIds` in `scope`, read as `system`. A question id that
 * is not a GUID cannot be an answer's `QuestionID` (the column is one) and is left out of the SQL.
 */
export async function readInsightAnswers(
  provider: InsightAnswerSource,
  scope: ReportScope,
  questionIds: readonly string[],
  system: UserInfo,
): Promise<InsightAnswers> {
  const ids = [...new Set(questionIds.filter((id) => isGuid(id)))];
  if (ids.length === 0) {
    return { rows: [], capped: false };
  }
  const filter = `QuestionID IN (${ids.map(quoteSqlString).join(',')}) AND ResponseID IN (${completeResponsesSubquery(provider, scope)})`;
  const total = await countRows(provider, filter, scope, system);
  const wanted = Math.min(total, MAX_INSIGHT_ANSWER_ROWS);
  const rows: InsightAnswerRow[] = [];
  for (let page = 0; page < MAX_INSIGHT_ANSWER_PAGES && rows.length < wanted; page++) {
    // Started where the rows read so far end, not at page x size: a provider that returns a short
    // page (an entity-level row limit) must not make the next page skip what it left out.
    const batch = await readPage(provider, filter, rows.length, Math.min(INSIGHT_ANSWER_PAGE_SIZE, wanted - rows.length), scope, system);
    rows.push(...batch);
    if (batch.length === 0) {
      // Rows were deleted between the count and this page; what was read is all there is.
      break;
    }
  }
  // Short of the count for any reason — the cap, or pages a provider returned short until the page
  // bound ran out — the sections describe only what was read, and the result says so.
  return { rows, capped: rows.length < total };
}

/** `SELECT ID FROM <responses view> WHERE …` for the scope's Complete responses. */
function completeResponsesSubquery(provider: InsightAnswerSource, scope: ReportScope): string {
  const responses = provider.EntityByName(FORMS_ENTITY.FormResponse);
  if (!responses) {
    throw new FormReportingError(`The answers of form ${scope.formId} could not be read.`, {
      fault: true,
      logDetail: `${FORMS_ENTITY.FormResponse} is not in this host's metadata`,
    });
  }
  const view = provider.QuoteSchemaAndView(responses.SchemaName, responses.BaseView);
  const version = scope.formVersionId ? ` AND FormVersionID=${quoteSqlString(scope.formVersionId)}` : '';
  return `SELECT ID FROM ${view} WHERE FormID=${quoteSqlString(scope.formId)} AND Status='Complete'${version}`;
}

async function countRows(provider: InsightAnswerSource, filter: string, scope: ReportScope, system: UserInfo): Promise<number> {
  const result = await provider.RunView({ EntityName: FORMS_ENTITY.FormResponseAnswer, ExtraFilter: filter, ResultType: 'count_only' }, system);
  if (!result?.Success) {
    throw readFault(scope, result?.ErrorMessage);
  }
  return result.TotalRowCount ?? 0;
}

async function readPage(
  provider: InsightAnswerSource,
  filter: string,
  startRow: number,
  maxRows: number,
  scope: ReportScope,
  system: UserInfo,
): Promise<InsightAnswerRow[]> {
  const result = await provider.RunView<InsightAnswerRow>(
    {
      EntityName: FORMS_ENTITY.FormResponseAnswer,
      ExtraFilter: filter,
      Fields: ['ID', 'ResponseID', 'QuestionID', 'TextValue', 'JSONValue', 'FileID'],
      OrderBy: 'ID',
      StartRow: startRow,
      MaxRows: maxRows,
      ResultType: 'simple',
    },
    system,
  );
  if (!result?.Success) {
    throw readFault(scope, result?.ErrorMessage);
  }
  return result.Results ?? [];
}

function readFault(scope: ReportScope, detail: string | undefined): FormReportingError {
  // The view error can carry the SQL statement; it goes to the log, never to the caller.
  return new FormReportingError(`The answers of form ${scope.formId} could not be read.`, { fault: true, logDetail: detail || 'no detail reported by the provider' });
}
