/**
 * What "terminal" means for a `FormResponse`, in one place.
 *
 * Three call sites need this and they sit at different depths — the dedupe LOOKUP (is there
 * already a sealed row for this caller?), the PIPELINE (is the row I just found sealed?), and
 * PERSISTENCE (may I overwrite the row I am about to save onto?). While each answered it for
 * itself, they disagreed: persistence learned about `Disqualified` when the status was added and
 * the two dedupe paths did not, so a knockout could be written twice for one session.
 *
 * The union is DERIVED from the generated entity rather than restated, per
 * `.claude/rules/typescript-style.md`: the value list comes from a CHECK constraint, and the next
 * migration that widens it should widen this too — loudly, at compile time, not by being quietly
 * absent from a hand-typed literal.
 */
import type { mjBizAppsFormsFormResponseEntity } from '@mj-biz-apps/forms-entities';

export type FormResponseStatus = mjBizAppsFormsFormResponseEntity['Status'];

/**
 * Statuses nothing further will come from: the respondent finished, or was screened out. Both
 * seal the row — never downgrade one, never write a second for the same caller — and they differ
 * only in what they mean for quotas, automations and reporting.
 */
export const TERMINAL_RESPONSE_STATUSES: ReadonlyArray<FormResponseStatus> = ['Complete', 'Disqualified'];

/** Whether `status` seals the row. */
export function isTerminalResponseStatus(status: FormResponseStatus): boolean {
  return TERMINAL_RESPONSE_STATUSES.includes(status);
}
