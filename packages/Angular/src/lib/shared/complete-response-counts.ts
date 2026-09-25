/**
 * Per-form counts of COMPLETE responses, computed by the database.
 *
 * Why COMPLETE only: a Partial row is an in-progress autosave, not a submitted response. The
 * Forms home list and the Responses & Analytics rail once disagreed on this ("43 responses" vs
 * "32" for one form), so both now count through this module.
 *
 * Why server-side (#247): both surfaces used to download one row per Complete response across
 * every form and tally them in the browser. That grew with total responses, and the entity's
 * `UserViewMaxRows` (1000) silently truncated the download, so a form with 712 responses read
 * 536. Here each form is one `COUNT(CASE ...)` aggregate in a single `count_only` SELECT, which
 * returns no rows and is not subject to the row cap.
 */
import type { RunView, RunViewParams, RunViewResult } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from './entity-names';

/**
 * Each form is one SELECT column, and SQL Server caps a SELECT at 4096 columns. Chunks well below
 * that keep each statement modest; they all still travel in one RunViews batch.
 */
export const MAX_FORMS_PER_COUNT_QUERY = 500;

/** The distinct ids, split into the groups each count query covers. */
function chunkFormIds(formIds: readonly string[]): string[][] {
  const unique = [...new Set(formIds)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += MAX_FORMS_PER_COUNT_QUERY) {
    chunks.push(unique.slice(i, i + MAX_FORMS_PER_COUNT_QUERY));
  }
  return chunks;
}

/** The RunViews batch that counts Complete responses for the given forms. Empty ids → `[]`. */
export function completeResponseCountQueries(formIds: readonly string[]): RunViewParams[] {
  return chunkFormIds(formIds).map((ids) => ({
    EntityName: FORMS_ENTITY.FormResponse,
    ExtraFilter: `Status='Complete'`,
    ResultType: 'count_only',
    Aggregates: ids.map((id) => ({
      expression: `COUNT(CASE WHEN FormID=${quoteSqlString(id)} THEN 1 END)`,
      alias: id,
    })),
  }));
}

/**
 * Reads the batch built by {@link completeResponseCountQueries} back into id → count. Every
 * requested id gets an entry; anything short of a whole, well-formed answer throws, because a
 * defaulted count is indistinguishable from a real zero.
 */
export function readCompleteResponseCounts(
  formIds: readonly string[],
  results: readonly RunViewResult[],
): Map<string, number> {
  const counts = new Map<string, number>();
  chunkFormIds(formIds).forEach((ids, chunk) => {
    const aggregates = checkedAggregates(results[chunk], ids.length, chunk + 1);
    ids.forEach((id, i) => counts.set(id, readCount(id, aggregates[i])));
  });
  return counts;
}

type AggregateResults = NonNullable<RunViewResult['AggregateResults']>;

function checkedAggregates(
  result: RunViewResult | undefined,
  expected: number,
  chunkNumber: number,
): AggregateResults {
  const where = `Counting Complete responses (chunk ${chunkNumber}, ${expected} forms)`;
  if (!result) {
    throw new Error(`${where}: no result came back for this chunk.`);
  }
  if (!result.Success) {
    throw new Error(`${where} failed: ${result.ErrorMessage || 'no error message'}`);
  }
  const aggregates = result.AggregateResults;
  if (!aggregates || aggregates.length !== expected) {
    throw new Error(
      `${where}: expected ${expected} aggregate results, got ${aggregates?.length ?? 'none'}.`,
    );
  }
  return aggregates;
}

function readCount(formId: string, aggregate: AggregateResults[number]): number {
  if (aggregate.error) {
    throw new Error(`Counting Complete responses for form ${formId} failed: ${aggregate.error}`);
  }
  // Over GraphQL the value arrives as a string ("19"); `null` is not a count, so reject it
  // before Number() turns it into 0.
  const count = aggregate.value === null ? NaN : Number(aggregate.value);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(
      `Counting Complete responses for form ${formId} returned ${JSON.stringify(aggregate.value)}, not a count.`,
    );
  }
  return count;
}

/** Counts Complete responses for the given forms in one round trip; no forms → no request. */
export async function loadCompleteResponseCounts(
  rv: Pick<RunView, 'RunViews'>,
  formIds: readonly string[],
): Promise<Map<string, number>> {
  if (formIds.length === 0) {
    return new Map();
  }
  const results = await rv.RunViews(completeResponseCountQueries(formIds));
  return readCompleteResponseCounts(formIds, results);
}
