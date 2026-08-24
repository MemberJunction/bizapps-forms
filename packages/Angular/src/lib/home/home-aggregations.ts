/**
 * Pure transforms for the Forms home grid — no I/O, fully unit-testable.
 */
import { readActionOutputString, type ClientActionResult } from '../shared/action-output';
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
 * The id of the form an authoring action just created.
 *
 * THE BUG THIS FIXED, kept because it is the kind that shipped once and would ship again.
 * The original helper looked for `FormID` in `result.Params`, which can never contain it:
 * `GraphQLActionClient.processActionResult` returns `Params: originalParams` — the inputs the
 * caller sent — and puts the action's output params in `Result`. So the lookup always came back
 * null, the "open the form I just made for you" step was skipped, and both "From template" and
 * "Author with AI" silently dumped the author back on the list with no idea whether anything
 * happened. The form was there; nothing took them to it.
 *
 * The shape-handling now lives in `shared/action-output.ts`, because the builder reads the same
 * result for the same reason and one copy of a trap this shaped is already one too many.
 */
export function readFormIdFromResult(result: ClientActionResult | undefined): string | null {
  return readActionOutputString(result, 'FormID');
}
