/**
 * Saving one MJ row on behalf of the Builder: bounded, self-healing where it deterministically
 * can be, and loud where it cannot.
 *
 * Split out of the Builder because "persist this row, repairing what is repairable" is a genuinely
 * separate idea from "turn a blueprint into a form". Nothing here knows what a blueprint is.
 *
 * TWO MECHANISMS, and the difference between them is the point:
 *
 *  - {@link clampText} is PREVENTION. Every bounded column's width is known statically, so
 *    "String or binary data would be truncated" is a failure the Builder can decline to cause.
 *    A brief that yields a 700-character option label is ordinary, not exotic.
 *  - {@link saveRow} is REPAIR, for the one failure a caller genuinely cannot predict: a unique
 *    constraint it has no way to test without trying. `UQ_FormStyle_Name` is the live case —
 *    a second AI-generated form named like the first wants the same "<name> theme" style row.
 *
 * There is deliberately NO repair for foreign keys or display ordering, which an earlier draft of
 * this design called for. The Builder writes parents before children and assigns DisplayOrder from
 * its own loop counter, and no DisplayOrder column is unique — so neither failure is reachable, and
 * a repair that cannot fire is worse than none: it reads as coverage.
 */
import { LogStatus } from '@memberjunction/core';
import type { BaseEntity } from '@memberjunction/core';
import { MAX_PERSIST_ATTEMPTS } from './limits';
import { errorText } from '../shared/error-text';

/** Raised with a clear message when a row could not be saved. */
export class FormPersistError extends Error {
  /**
   * The Form row this failure belongs to, when one had already been created.
   *
   * Set so the caller can report a PARTIAL result naming a draft the author can actually open,
   * rather than an id-less failure and an orphan row nobody knows exists.
   */
  public readonly formId?: string;

  constructor(message: string, options?: { formId?: string; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'FormPersistError';
    this.formId = options?.formId;
  }
}

/**
 * A deterministic repair attempt, run between two saves of the same row.
 *
 * Returns `true` when it changed something worth retrying, `false` when it does not recognise the
 * failure — at which point {@link saveRow} throws immediately rather than burning attempts on a
 * row that will fail identically three times.
 */
export type PersistRepair<T extends BaseEntity> = (
  entity: T,
  failureDetail: string,
  /** 1 for the repair after the first failed save. */
  attempt: number,
) => boolean;

/**
 * Save `entity`, applying `repair` between attempts, up to {@link MAX_PERSIST_ATTEMPTS}.
 *
 * `label` names the row in the thrown message — an operator reading "Failed to save FormScreen"
 * knows where to look, and "Failed to save entity" does not help anyone.
 */
export async function saveRow<T extends BaseEntity>(
  entity: T,
  label: string,
  options: { formId?: string; repair?: PersistRepair<T> } = {},
): Promise<void> {
  let lastDetail = 'unknown error';
  let lastCause: unknown;

  for (let attempt = 1; attempt <= MAX_PERSIST_ATTEMPTS; attempt++) {
    const outcome = await attemptSave(entity);
    if (outcome.ok) {
      return;
    }
    lastDetail = outcome.detail;
    lastCause = outcome.cause;

    const repaired = attempt < MAX_PERSIST_ATTEMPTS && options.repair?.(entity, outcome.detail, attempt);
    if (!repaired) {
      break;
    }
    LogStatus(`[Forms authoring] Retrying ${label} after a repairable save failure: ${outcome.detail}`);
  }

  throw new FormPersistError(`Failed to save ${label}: ${lastDetail}`, {
    formId: options.formId,
    cause: lastCause,
  });
}

/** One save, normalising the two ways MJ reports failure into one shape. */
async function attemptSave(
  entity: BaseEntity,
): Promise<{ ok: true } | { ok: false; detail: string; cause?: unknown }> {
  // Save() returns false for logical failures but can still THROW for infrastructure ones, and a
  // unique-constraint violation surfaced by a stored procedure has been seen both ways. Handling
  // only one of them would make the repair below fire on some hosts and not others.
  try {
    if (await entity.Save()) {
      return { ok: true };
    }
  } catch (error) {
    return { ok: false, detail: errorText(error), cause: error };
  }
  const result = entity.LatestResult;
  return { ok: false, detail: result?.CompleteMessage ?? result?.Message ?? 'no detail reported by the provider' };
}

/**
 * Whether a save failure was a unique-constraint violation.
 *
 * Matches the provider's own wording rather than a code, because MJ hands the message through as
 * text. All three phrases are SQL Server's; `UQ_` is this schema's constraint-naming convention and
 * catches the case where a provider wraps the message in something we do not recognise.
 *
 * A miss here is safe: the row simply fails the way it does today, with the provider's full detail
 * in the thrown message. Only a false POSITIVE would be harmful, and none of these phrases appears
 * in an unrelated failure.
 */
export function isDuplicateKeyFailure(detail: string): boolean {
  const text = detail.toLowerCase();
  return (
    text.includes('duplicate key') ||
    text.includes('unique key constraint') ||
    text.includes('unique index') ||
    text.includes('uq_')
  );
}

/**
 * Fit `value` to `max` characters, keeping an ellipsis so a reader can see it was cut.
 *
 * Logged when it fires, never silent: an author whose 300-character form name became 255 should be
 * able to find out why from the server log rather than by counting characters. Returns the input
 * untouched in the overwhelmingly common case, so this is free to call on every bounded column.
 */
export function clampText(value: string, max: number, what: string): string {
  if (value.length <= max) {
    return value;
  }
  LogStatus(
    `[Forms authoring] ${what} was ${value.length} characters and the column holds ${max}; truncating.`,
  );
  return `${value.slice(0, max - 1)}…`;
}

