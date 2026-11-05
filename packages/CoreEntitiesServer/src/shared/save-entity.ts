import type { BaseEntity } from '@memberjunction/core';

/**
 * Saves an entity and returns it, or returns the reason it could not be saved.
 *
 * Exists because the on-submit hooks' `Promise<T | null>` helpers discarded
 * `LatestResult` on failure: a null told the caller *that* the save failed but
 * never *why*, so a real defect surfaced to operators as the bare string
 * "Failed to create Person record." with nothing to act on. The failure that
 * message was hiding — the entity's generated subclass not being registered, so
 * every field assignment silently went to a plain object — is invisible without
 * the underlying validation errors, which name the fields that came through null.
 *
 * `CompleteMessage` is the field carrying MJ's per-field validation failures;
 * `Message` is frequently null on a validation failure, so it is only a fallback.
 */
export type SaveOutcome<T extends BaseEntity> =
  | { ok: true; entity: T }
  | { ok: false; error: string };

/** Save `entity`, capturing MJ's failure detail rather than collapsing it to null. */
export async function saveOrExplain<T extends BaseEntity>(entity: T): Promise<SaveOutcome<T>> {
  if (await entity.Save()) {
    return { ok: true, entity };
  }
  const result = entity.LatestResult;
  const detail = result?.CompleteMessage ?? result?.Message ?? 'no detail reported by the provider';
  return { ok: false, error: detail };
}
