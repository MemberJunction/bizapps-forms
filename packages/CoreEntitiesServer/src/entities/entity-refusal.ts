/**
 * The two pieces every Forms entity server subclass needs to say "no" the way MJ callers expect.
 *
 * `Save()` and `Delete()` report a refusal by returning `false` with the reason on
 * `LatestResult` — they never throw — so a refusal made in an override has to land on the same
 * surface MJ's own validation failures do, or callers that read `LatestResult.CompleteMessage`
 * (every Forms caller, per CLAUDE.md) show an empty error.
 */
import {
  BaseEntityResult,
  ValidationErrorInfo,
  ValidationErrorType,
  type BaseEntity,
  type EntitySaveOptions,
  type ValidationResult,
} from '@memberjunction/core';

/** One broken rule: the field it is about, and a sentence that tells the writer what to do instead. */
export interface RuleViolation {
  field: string;
  message: string;
}

/**
 * Put a refusal on the entity's result history and return `false`, so an override can
 * `return refuse(this, 'delete', why)` from `Save()` / `Delete()`.
 */
export function refuse(entity: BaseEntity, type: 'create' | 'update' | 'delete', message: string): false {
  const result = new BaseEntityResult(false, message, type);
  result.EndedAt = new Date();
  entity.RegisterResultHistoryEntry(result);
  return false;
}

/** Append each violation to a validation result as a failure, and settle its `Success` flag. */
export function addViolations(result: ValidationResult, violations: readonly RuleViolation[], valueOf: (field: string) => unknown): ValidationResult {
  for (const violation of violations) {
    result.Errors.push(
      new ValidationErrorInfo(violation.field, violation.message, valueOf(violation.field), ValidationErrorType.Failure),
    );
  }
  result.Success = result.Success && result.Errors.length === 0;
  return result;
}

/**
 * Run the entity's own invariants on a save MJ was told not to validate, and refuse it when they
 * fail. Returns `true` when it refused (and recorded why on the entity's result history).
 *
 * Two save options switch `ValidateAsync` — where every Forms invariant lives — off inside
 * `BaseEntity.Save()`, and neither suppresses the write:
 *  - `ReplayOnly` force-passes validation without calling `Validate()` or `ValidateAsync()` at all
 *    (MJ's own `MJUserEntityServer` closes the same hole);
 *  - `SkipAsyncValidation: true` outranks `DefaultSkipAsyncValidation` (MJ `baseEntity.ts`, the
 *    `skipAsyncValidation` decision in `_innerSave`), so any server writer could pass it.
 * Either would leave an invariant that "holds for every writer" one option away from off. So for
 * those saves this runs the entity's own `ValidateAsync` — the SAME method, not a copy of its rules
 * — and refuses when it fails. Any other save returns `false` untouched: MJ runs `ValidateAsync`
 * itself on that path, and running it twice would double every read the rules make.
 */
export async function refuseIfUnvalidated(entity: BaseEntity, options: EntitySaveOptions | undefined): Promise<boolean> {
  const skipped = options?.ReplayOnly ? 'ReplayOnly' : options?.SkipAsyncValidation === true ? 'SkipAsyncValidation' : null;
  if (!skipped) {
    return false;
  }
  const validation = await entity.ValidateAsync();
  if (validation.Success) {
    return false;
  }
  const reasons = validation.Errors.map((error) => error.Message).join(' ');
  refuse(
    entity,
    entity.IsSaved ? 'update' : 'create',
    `A ${skipped} save skips validation, so this record was validated before saving it, and refused: ${reasons}`,
  );
  return true;
}

/**
 * Whether this entity's `OldValue` / `Dirty` describe what the DATABASE holds.
 *
 * Every rule here that reads "the stored status" or "this field changed" trusts `OldValue`. That is
 * sound only because all four guarded entities (Forms, Form Versions, Form Distributions, Form
 * Questions) have `TrackRecordChanges = 1` — verified in `MJ_Forms303_Edge` — which makes MJ's
 * GraphQL update path load the row from the database before applying the client's values (MJ
 * `ResolverBase.UpdateRecord`). With the flag off, that path hydrates the "old" values from the
 * client's own `OldValues___` instead, and a client could claim a Published version was a Draft.
 * `MJ.SaveEntityGraph` and the engines load from the database either way.
 */
export function tracksStoredValues(entity: BaseEntity): boolean {
  return entity.EntityInfo?.TrackRecordChanges === true;
}

/**
 * The refusal for an update whose stored values cannot be trusted (see {@link tracksStoredValues}),
 * or `null`. Fails closed and loudly: an operator who turns `TrackRecordChanges` off for one of
 * these entities gets refused updates naming the flag, not invariants that silently stop holding.
 */
export function untrackedUpdateViolation(entity: BaseEntity): RuleViolation | null {
  if (!entity.IsSaved || tracksStoredValues(entity)) {
    return null;
  }
  return {
    field: 'ID',
    message:
      `${entity.EntityInfo?.Name ?? 'This entity'} has TrackRecordChanges turned off, so the values this ` +
      `update claims were stored come from the client and cannot be checked. Turn TrackRecordChanges back ` +
      `on for this entity; Forms ships it on.`,
  };
}

/**
 * The field's value as it was loaded, or `null` on a record that has never been saved. Trusted as
 * the database's value only while {@link tracksStoredValues} holds — callers check that first.
 */
export function storedValue<T>(entity: BaseEntity, field: string): T | null {
  if (!entity.IsSaved) {
    return null;
  }
  return (entity.GetFieldByName(field)?.OldValue ?? null) as T | null;
}

/** The names of the listed fields that this save changes. */
export function changedFields(entity: BaseEntity, fields: readonly string[]): string[] {
  return fields.filter((field) => entity.GetFieldByName(field)?.Dirty === true);
}
