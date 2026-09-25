/**
 * Pure transforms for the Forms home grid — no I/O, fully unit-testable.
 */
import type { ActionParam } from '@memberjunction/actions-base';
import { toDate } from '../shared/runview-dates';
import type {
  FormCategorySimpleRecord,
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

/**
 * Folds forms, categories and per-form response counts into display rows, newest first.
 */
export function buildFormRows(
  forms: readonly FormSimpleRecord[],
  categories: readonly FormCategorySimpleRecord[],
  /** `null` when the counts could not be loaded — every row's count is then unknown, not zero. */
  counts: ReadonlyMap<string, number> | null,
): FormSummaryRow[] {
  const catName = categoryNameMap(categories);

  const rows: FormSummaryRow[] = forms.map((f) => ({
    id: f.ID,
    name: f.Name,
    status: f.Status,
    categoryName: f.CategoryID ? (catName.get(f.CategoryID) ?? null) : null,
    updatedAt: toDate(f.__mj_UpdatedAt),
    responseCount: counts ? (counts.get(f.ID) ?? 0) : null,
  }));

  return sortByUpdatedDesc(rows);
}

/** Sum of the rows' response counts, or `null` if any is unknown (a partial sum would under-report). */
export function totalResponses(rows: readonly FormSummaryRow[]): number | null {
  let total = 0;
  for (const r of rows) {
    if (r.responseCount === null) {
      return null;
    }
    total += r.responseCount;
  }
  return total;
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
