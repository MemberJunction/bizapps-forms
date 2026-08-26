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
 * `.claude/rules/typescript-style.md`: the value list comes from a CHECK constraint. And the
 * classification below is a MAPPED TYPE over that union, so widening the constraint genuinely does
 * fail the build until the new status is classified — see {@link STATUS_FACTS} for why the arrays
 * this replaced could not keep that promise.
 */
import type { mjBizAppsFormsFormResponseEntity } from '@mj-biz-apps/forms-entities';

export type FormResponseStatus = mjBizAppsFormsFormResponseEntity['Status'];

/** What each status means to the two gates that care. */
interface StatusFacts {
  /**
   * Nothing further will come for this respondent — they finished, or were screened out. A sealed
   * row is never downgraded, never rewritten, and never written twice for one caller.
   */
  readonly sealed: boolean;
  /** Whether some quota bounded how many of these may exist. */
  readonly quotaBounded: boolean;
}

/**
 * Every status, classified — and the reason this is a MAPPED TYPE rather than two arrays.
 *
 * The two sets below used to be hand-written arrays, under a comment promising that the next
 * migration to widen the CHECK constraint would be caught "loudly, at compile time". It would not
 * have been: an array is not required to mention every member of a union, so `['Complete',
 * 'Disqualified']` keeps compiling when a third terminal status appears, and the new status
 * silently becomes non-terminal AND quota-bounded — a partial save would overwrite a sealed row
 * and a quota would count it. A mapped type over the union IS exhaustive, so adding a status now
 * fails the build until somebody states both facts about it, which is what the comment claimed.
 */
const STATUS_FACTS: { readonly [K in FormResponseStatus]: StatusFacts } = {
  Partial: { sealed: false, quotaBounded: false },
  Complete: { sealed: true, quotaBounded: true },
  Disqualified: { sealed: true, quotaBounded: false },
};

const STATUSES = Object.keys(STATUS_FACTS) as FormResponseStatus[];

/**
 * Statuses nothing further will come from: the respondent finished, or was screened out. Both
 * seal the row — never downgrade one, never write a second for the same caller — and they differ
 * only in what they mean for quotas, automations and reporting.
 */
export const TERMINAL_RESPONSE_STATUSES: ReadonlyArray<FormResponseStatus> = STATUSES.filter(
  (s) => STATUS_FACTS[s].sealed,
);

/**
 * The statuses no quota bounds — every row an ungated write can leave behind.
 *
 * Deliberately NOT the complement of "terminal": `Disqualified` is both sealed AND uncounted,
 * which is exactly the pairing that hid a hole. Sealed answers "may I write over this row?"; this
 * answers "did anything limit how many exist?", and for a knockout the answer is no — the quota
 * counts completions, and a knockout is not one.
 */
export const UNCOUNTED_BY_QUOTA: ReadonlyArray<FormResponseStatus> = STATUSES.filter(
  (s) => !STATUS_FACTS[s].quotaBounded,
);

/** Whether `status` seals the row. */
export function isTerminalResponseStatus(status: FormResponseStatus): boolean {
  return STATUS_FACTS[status].sealed;
}
