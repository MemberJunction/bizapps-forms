/**
 * Pure transforms for the Forms home grid — no I/O, fully unit-testable.
 */
import type { ActionParam } from '@memberjunction/actions-base';
import { toDate } from '../shared/runview-dates';
import type {
  FormCategorySimpleRecord,
  FormResponseSimpleRecord,
  FormSimpleRecord,
  FormSummaryRow,
} from './home-models';

/** Builds a fast id→name map from the categories result. */
export function categoryNameMap(
  categories: readonly FormCategorySimpleRecord[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of categories) {
    map.set(c.ID, c.Name);
  }
  return map;
}

/** Counts responses per form id. */
export function responseCountMap(
  responses: readonly FormResponseSimpleRecord[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of responses) {
    map.set(r.FormID, (map.get(r.FormID) ?? 0) + 1);
  }
  return map;
}

/**
 * Folds the three simple result sets into display rows, newest first.
 */
export function buildFormRows(
  forms: readonly FormSimpleRecord[],
  categories: readonly FormCategorySimpleRecord[],
  responses: readonly FormResponseSimpleRecord[],
): FormSummaryRow[] {
  const catName = categoryNameMap(categories);
  const counts = responseCountMap(responses);

  const rows: FormSummaryRow[] = forms.map((f) => ({
    id: f.ID,
    name: f.Name,
    status: f.Status,
    categoryName: f.CategoryID ? (catName.get(f.CategoryID) ?? null) : null,
    updatedAt: toDate(f.__mj_UpdatedAt),
    responseCount: counts.get(f.ID) ?? 0,
  }));

  return sortByUpdatedDesc(rows);
}

/** Newest-updated first; rows without a date sort last, then by name. */
export function sortByUpdatedDesc(rows: FormSummaryRow[]): FormSummaryRow[] {
  return [...rows].sort((a, b) => {
    const at = a.updatedAt?.getTime() ?? 0;
    const bt = b.updatedAt?.getTime() ?? 0;
    if (bt !== at) {
      return bt - at;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Extracts the `FormID` output parameter produced by the authoring/template
 * actions. Both actions set an output param named `FormID`.
 */
export function readFormIdFromParams(
  params: readonly ActionParam[] | undefined,
): string | null {
  if (!params) {
    return null;
  }
  const hit = params.find(
    (p) => p.Name === 'FormID' && (p.Type === 'Output' || p.Type === 'Both'),
  );
  const value = hit?.Value;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The shape an action result has once `GraphQLActionClient` is done with it.
 *
 * `Result` is the parsed `ResultData` — the OUTPUT params, as an object keyed by array index
 * (`{"0": {...}, "1": {...}}`) because the server JSON-stringifies the array. `Params` is set to
 * the caller's ORIGINAL INPUTS and never carries outputs.
 */
interface AuthoringActionResult {
  Params?: readonly ActionParam[];
  Result?: unknown;
}

/**
 * The id of the form an authoring action just created.
 *
 * THE BUG THIS FIXES. `readFormIdFromParams` looked for `FormID` in `result.Params`, which can
 * never contain it: `GraphQLActionClient.processActionResult` builds its return value with
 * `Params: originalParams` — the inputs the caller sent — and puts the action's output params in
 * `Result`, parsed from the `ResultData` string. So the lookup always came back null, the
 * "open the form I just made for you" step was skipped, and both "From template" and "Author
 * with AI" silently dumped the author back on the list with no idea whether anything happened.
 * The form was there; nothing took them to it.
 *
 * `Params` is still consulted as a fallback so a caller that hands us a genuinely
 * output-bearing param list (a direct server-side run, a future client that returns them) keeps
 * working.
 */
export function readFormIdFromResult(result: AuthoringActionResult | undefined): string | null {
  if (!result) {
    return null;
  }
  const fromOutputs = readFormIdFromOutputCollection(result.Result);
  return fromOutputs ?? readFormIdFromParams(result.Params);
}

/** Pull `FormID` out of the index-keyed output-param object (or a plain array). */
function readFormIdFromOutputCollection(collection: unknown): string | null {
  if (typeof collection !== 'object' || collection === null) {
    return null;
  }
  const entries = Array.isArray(collection) ? collection : Object.values(collection);
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const param = entry as { Name?: unknown; Value?: unknown };
    if (param.Name === 'FormID' && typeof param.Value === 'string' && param.Value.length > 0) {
      return param.Value;
    }
  }
  return null;
}
