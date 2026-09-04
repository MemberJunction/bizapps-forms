/**
 * The one read that hands a respondent their own half-finished answers back (#138).
 *
 * IT RUNS UNDER THE ANONYMOUS `contextUser`, and that is the design rather than an oversight.
 * Everywhere else in this pipeline a response is read under the ELEVATED principal, because the
 * anonymous role could not read responses at all. It can now — filtered, by
 * `MJ Forms: Respondent Own Response`, to the single row this session's invite names — so the
 * DATABASE is the gate here. Reading under the elevated user instead would move the gate up into
 * application code, where it could disagree with the row filter that governs every other reader;
 * running it under the anonymous user is what makes "the read filter and the write rule test the
 * same fact" true rather than merely intended.
 *
 * The consequence worth stating: if the migration's grants are missing, this returns nothing and
 * the respondent sees a fresh form. That is the correct failure — a resume that cannot prove
 * ownership must not happen — and it is why the migration asserts its own grants rather than
 * trusting them.
 */
import { LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import type {
  ResumeSnapshot,
  StoredAnswerRow,
  mjBizAppsFormsFormResponseEntityType,
} from '@mj-biz-apps/forms-entities';

import type { DefinitionRunViewProvider } from './definition-loader.service';
import { FORM_RESPONSE_ANSWER_ENTITY, FORM_RESPONSE_ENTITY } from './entity-names';

/** The response columns the snapshot is built from. Narrow on purpose — see `Fields` below. */
type ResumeResponseRow = Pick<
  mjBizAppsFormsFormResponseEntityType,
  'ID' | 'Status' | 'FormVersionID' | 'StartedAt'
>;

/**
 * Load the draft a session is scoped to, or `undefined`.
 *
 * `undefined` covers three different situations on purpose, because the caller must treat them
 * identically: there is no such row, the row filter refused it, or the read failed. Distinguishing
 * them in the answer would tell a caller holding a guessed id whether it names a real draft.
 *
 * Never throws — `PublishedForm` answers `null` for "no form to show", and a resume that cannot be
 * loaded must degrade to an ordinary blank form rather than to an error page.
 */
export async function loadResumeSnapshot(
  provider: DefinitionRunViewProvider,
  scopeResourceId: string,
  contextUser: UserInfo,
): Promise<ResumeSnapshot | undefined> {
  const id = (scopeResourceId ?? '').trim();
  if (id === '') {
    return undefined;
  }
  const response = await loadScopedResponseRow(provider, id, contextUser);
  if (!response) {
    return undefined;
  }
  const answers = await loadAnswerRows(provider, response.ID, contextUser);
  if (!answers) {
    // The row is readable but its answers are not — a partial snapshot would silently present a
    // half-empty draft as the whole thing, and the respondent would re-answer over the top of
    // answers that are still stored. Better no resume than a lossy one.
    return undefined;
  }
  return {
    responseId: response.ID,
    status: response.Status,
    formVersionId: response.FormVersionID,
    startedAt: toIsoString(response.StartedAt),
    answers,
  };
}

/**
 * The one response row the caller's scope names.
 *
 * The `ID` predicate is belt to the row filter's braces: the filter alone already narrows this to
 * the scoped row, and asking for the id as well means a misconfigured grant produces NO rows rather
 * than somebody else's. `MaxRows: 1` for the same reason.
 */
async function loadScopedResponseRow(
  provider: DefinitionRunViewProvider,
  responseId: string,
  contextUser: UserInfo,
): Promise<ResumeResponseRow | undefined> {
  const result = await provider.RunView<ResumeResponseRow>(
    {
      EntityName: FORM_RESPONSE_ENTITY,
      ExtraFilter: `ID=${quoteSqlString(responseId)}`,
      Fields: ['ID', 'Status', 'FormVersionID', 'StartedAt'],
      ResultType: 'simple',
      MaxRows: 1,
    },
    contextUser,
  );
  if (!result.Success) {
    // Logged with the response id and never the token or the session: an operator needs to know
    // WHICH draft could not be read.
    LogError(`[Forms] resume read failed for response ${responseId}: ${result.ErrorMessage}`);
    return undefined;
  }
  return result.Results[0];
}

/**
 * Every stored answer of the response, in the STORED column spelling.
 *
 * Unfiltered by question: the widget drops what its current version no longer has, because only the
 * widget knows the definition it is about to render. Returning them all is also what lets a
 * re-published form recover answers to questions that came BACK.
 *
 * `undefined` means the read failed; an empty array means the draft genuinely has no answers yet,
 * which is a real state (a respondent who advanced a page without answering).
 */
async function loadAnswerRows(
  provider: DefinitionRunViewProvider,
  responseId: string,
  contextUser: UserInfo,
): Promise<StoredAnswerRow[] | undefined> {
  const result = await provider.RunView<StoredAnswerRow>(
    {
      EntityName: FORM_RESPONSE_ANSWER_ENTITY,
      ExtraFilter: `ResponseID=${quoteSqlString(responseId)}`,
      Fields: ['QuestionID', 'TextValue', 'NumericValue', 'DateValue', 'BooleanValue', 'JSONValue', 'FileID'],
      ResultType: 'simple',
    },
    contextUser,
  );
  if (!result.Success) {
    LogError(`[Forms] resume answers read failed for response ${responseId}: ${result.ErrorMessage}`);
    return undefined;
  }
  return result.Results;
}

/**
 * A stored instant as the ISO string the contract carries.
 *
 * The provider hands `StartedAt` back as a `Date` under `entity_object` and as a STRING under
 * `'simple'`, which is the shape used above — so both are accepted rather than assuming one. An
 * unparseable value becomes `undefined`: the start time is a nicety, and no resume should fail for
 * it.
 */
function toIsoString(value: Date | string | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
