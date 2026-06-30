/**
 * Pure transforms for the Forms home grid — no I/O, fully unit-testable.
 */
import type { ActionParam } from '@memberjunction/actions-base';
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

/** Coerces a RunView date cell (string or Date) into a Date, or null. */
export function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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
