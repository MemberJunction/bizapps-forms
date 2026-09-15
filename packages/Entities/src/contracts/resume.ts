/**
 * What a resumed session is handed back for a draft it owns — the ONE shape both ends parse.
 *
 * The answers are the STORED rows ({@link StoredAnswerRow}, PascalCase columns) rather than the
 * transport's `FormAnswerInput` spelling, deliberately: this is a read of the database, the contract
 * already carries `collapseAnswer` for exactly that shape, and inventing a third spelling of an
 * answer would be a third place for the six typed columns to drift apart.
 *
 * It travels as a JSON STRING on `PublishedFormType.resumeJSON`, the same way the definition
 * travels, so the GraphQL schema does not duplicate — and then drift from — this tree.
 */
import type { mjBizAppsFormsFormResponseEntity } from '../generated/entity_subclasses';
import type { StoredAnswerRow } from './answer-canonical';

/**
 * The persisted status of the draft being resumed.
 *
 * DERIVED from the entity rather than restated: the value list comes from a CHECK constraint, so the
 * next migration that widens it widens this too.
 */
export type ResumeStatus = mjBizAppsFormsFormResponseEntity['Status'];

/** A half-finished response, as the respondent who owns it is allowed to see it. */
export interface ResumeSnapshot {
  /**
   * The row's own id.
   *
   * The widget ADOPTS this as its `clientResponseId`, which is what makes every later save land on
   * this row — and what keeps the upload ledger's provenance proof matching, since the first
   * sitting's uploads were tagged with this same id.
   */
  responseId: string;
  /**
   * `Partial` resumes. Anything terminal is a SEALED screen, and the widget must decide that at
   * MOUNT rather than learn it from a save: `savePartial` ignores the result's status and the
   * pipeline answers a partial against a sealed row with `success: true`.
   */
  status: ResumeStatus;
  /**
   * The version the row was created on. May be RETIRED — an author can republish under an open
   * draft — and the first save after a resume re-stamps the current version rather than stranding
   * the draft.
   */
  formVersionId: string;
  /** The FIRST sitting's start instant, preserved across resumes. */
  startedAt?: string;
  /** Every stored answer of this response, unfiltered — the widget drops what its version lost. */
  answers: StoredAnswerRow[];
}

/**
 * The exact top-level field set of {@link ResumeSnapshot}, pinned by its spec.
 *
 * A wire shape two packages parse earns a lock, for the same reason `SUBMISSION_INPUT_FIELDS` has
 * one: a field added on the server and never read by the widget looks like it works.
 */
export const RESUME_SNAPSHOT_FIELDS: readonly (keyof ResumeSnapshot)[] = [
  'responseId',
  'status',
  'formVersionId',
  'startedAt',
  'answers',
] as const;
