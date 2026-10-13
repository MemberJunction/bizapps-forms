/**
 * How `FormAuthoringEngine` and the form copier it drives say "no" — one error type and one save
 * helper, in a module of their own so the copier (`form-clone.ts`) and the engine can share them
 * without importing each other.
 */
import type { BaseEntity } from '@memberjunction/core';
import { saveFailure } from './engine-guards.js';

/**
 * An authoring verb that did not happen: a blueprint the schema rejects, an Action that cannot be
 * resolved, a template name already taken, a form that does not exist, a failed read or save. None
 * of them left anything written — the unit of work rolled back.
 */
export class FormAuthoringError extends Error {
  /**
   * True when the failure is the system's (a read or a save failed) rather than the request's —
   * logged as an error, where a refusal over what was asked is only a status
   * (`runEngineUnitOfWork`, the same convention as `FormPublishError`).
   */
  public readonly fault: boolean;

  constructor(message: string, options: { fault?: boolean } = {}) {
    super(message);
    this.name = 'FormAuthoringError';
    this.fault = options.fault === true;
  }
}

/** Save, or throw naming the row and MJ's reason — which rolls the unit of work back. */
export async function saveOrThrow(entity: Pick<BaseEntity, 'Save' | 'LatestResult'>, label: string): Promise<void> {
  if (!(await entity.Save())) {
    throw new FormAuthoringError(`Failed to save ${label}: ${saveFailure(entity)}`, { fault: true });
  }
}
