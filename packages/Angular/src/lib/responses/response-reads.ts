/**
 * Every read of the individual-response surface, through the reporting operations (#303).
 *
 * Three reads, each one operation call (or, for the export, a bounded series of them):
 *  - a page of the response list — `Forms.ListResponses`;
 *  - one response's detail — `Forms.GetResponseDetail`;
 *  - every response with its answers, for the CSV/Excel export — `Forms.ListResponses` page by page.
 *
 * They replaced `ResponsesDataService`, which read every response and every answer of a form into the
 * browser with the view row cap switched off (DW16): the list now pages, and the server reads only
 * what one page needs, as the caller, so row-level security decides what comes back.
 *
 * Two rules from the old reads still hold, now on the server: responses are scoped by FORM across
 * every version (each response pins the version live when it was submitted), and the list shows
 * COMPLETE responses — a Partial is an in-progress autosave, not a submission.
 *
 * A refused read THROWS an Error carrying the server's fixed message; the hosts show it.
 */
import {
  FormsGetResponseDetailOperation,
  FormsListResponsesOperation,
  MAX_RESPONSE_PAGE_SIZE,
  type FormsListResponsesInput,
  type FormsListResponsesOutput,
  type FormsResponseListRow,
} from '@mj-biz-apps/forms-entities';
import { runOperation } from '../shared/remote-operation';
import { buildResponseDetail, toResponseListRow } from './response-aggregations';
import { toListInput, type ResponseQuery } from './responses-query';
import type { ResponseDetail, ResponseListRow } from './response-models';

/** One page of the response list, and where it sits in the whole. */
export interface ResponsePage {
  rows: ResponseListRow[];
  /** Complete responses across every page. */
  total: number;
  /**
   * The form's Published version — the one its answers are labelled from — or `null` when the form
   * has never been published (and so cannot have responses).
   */
  labelVersionId: string | null;
}

/** The page of a form's Complete responses that `query` describes — searched, sorted and paged by the server. */
export async function readResponsePage(formId: string, query: ResponseQuery): Promise<ResponsePage> {
  const input = toListInput(formId, query);
  const output = await listResponses(input, `listing the responses of form ${formId} from row ${input.StartRow}`);
  return { rows: output.Rows.map(toResponseListRow), total: output.TotalRowCount, labelVersionId: output.LabelVersionID };
}

/**
 * One response's detail.
 *
 * @param labelVersionId - The version whose questions label the answers. The list surfaces pass the
 *   form's Published version so every response reads against one set of labels; the Form Response
 *   record view passes nothing, which labels from the version the response was submitted against.
 */
export async function readResponseDetail(responseId: string, labelVersionId: string | null = null): Promise<ResponseDetail> {
  const outcome = await runOperation(
    new FormsGetResponseDetailOperation(),
    { ResponseID: responseId, LabelFormVersionID: labelVersionId },
    `reading the detail of response ${responseId}`,
  );
  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
  return buildResponseDetail(outcome.output);
}

/**
 * The most pages one export reads: {@link MAX_RESPONSE_PAGE_SIZE} × this many responses. Past it the
 * export stops and says so rather than reading without end — the browser holds every row to build
 * the file, and a form that large is better exported in parts than not at all.
 */
export const MAX_EXPORT_PAGES = 250;

/** Every Complete response of a form with its stored answers, or as many as one export reads. */
export interface ResponsesForExport {
  /** Newest first, each carrying `Answers`. */
  rows: FormsResponseListRow[];
  /** JSON text of the Published definition the columns come from; `null` if the form has none. */
  definitionJSON: string | null;
  /** Complete responses the form holds (every page reported the same count). */
  total: number;
  /** True when {@link MAX_EXPORT_PAGES} was reached with responses left unread. */
  capped: boolean;
}

/** Why an export stopped because the form's responses changed under it. Nothing is written. */
export const RESPONSES_CHANGED_MESSAGE = 'Responses changed while exporting — try again.';

/**
 * Read every Complete response of a form, with answers, page by page.
 *
 * Paging is by offset, so the list must hold still while it is read: a response DELETED before the
 * offset moves every later row up one and the next page starts one row late (a row is silently
 * skipped); one ADDED before it moves them down and a row comes back twice. Neither is allowed into
 * a file the reader believes is complete. The export refuses instead ({@link RESPONSES_CHANGED_MESSAGE})
 * when the count any page reports differs from the first page's, when a page hands back a row
 * already read, or when the pages end short of the count. Paging oldest first keeps the common
 * case — a submission arriving mid-export — from shifting earlier pages, though the count check
 * still refuses it rather than export a list it did not see whole.
 *
 * Every page must label from the same version as well: a form published again mid-export would give
 * later pages answers to questions the columns, taken from the first page, do not have.
 */
export async function readResponsesForExport(formId: string): Promise<ResponsesForExport> {
  const seen = new Set<string>();
  const rows: FormsResponseListRow[] = [];
  let first: FormsListResponsesOutput | null = null;
  for (let page = 0; page < MAX_EXPORT_PAGES; page++) {
    const output = await listResponses(
      { FormID: formId, Status: 'Complete', StartRow: rows.length, MaxRows: MAX_RESPONSE_PAGE_SIZE, OrderBy: 'SubmittedAt ASC', IncludeAnswers: true },
      `exporting the responses of form ${formId} from row ${rows.length}`,
    );
    first ??= output;
    if (output.LabelVersionID !== first.LabelVersionID) {
      throw new Error('The form was published again while it was being exported. Export it again to get one consistent file.');
    }
    if (output.TotalRowCount !== first.TotalRowCount || output.Rows.some((row) => seen.has(row.ResponseID))) {
      throw new Error(RESPONSES_CHANGED_MESSAGE);
    }
    for (const row of output.Rows) {
      seen.add(row.ResponseID);
      rows.push(row);
    }
    if (output.Rows.length < MAX_RESPONSE_PAGE_SIZE) {
      if (rows.length !== first.TotalRowCount) {
        throw new Error(RESPONSES_CHANGED_MESSAGE);
      }
      return { rows: rows.reverse(), definitionJSON: first.DefinitionJSON ?? null, total: first.TotalRowCount, capped: false };
    }
  }
  // Every page was full: the cap, not the end of the list, stopped the loop — unless the last full
  // page happened to be the last one.
  const total = first?.TotalRowCount ?? 0;
  return { rows: rows.reverse(), definitionJSON: first?.DefinitionJSON ?? null, total, capped: rows.length < total };
}

async function listResponses(input: FormsListResponsesInput, doing: string): Promise<FormsListResponsesOutput> {
  const outcome = await runOperation(new FormsListResponsesOperation(), input, doing);
  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
  return outcome.output;
}
