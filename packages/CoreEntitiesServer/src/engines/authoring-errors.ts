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

  /** Provider diagnostics for the server log, never the caller-facing message. */
  public readonly logDetail?: string;

  constructor(message: string, options: { fault?: boolean; logDetail?: string } = {}) {
    super(message);
    this.name = 'FormAuthoringError';
    this.fault = options.fault === true;
    this.logDetail = options.logDetail;
  }
}

/** Save, or throw a caller-safe failure with MJ diagnostics retained for the server log. */
export async function saveOrThrow(entity: Pick<BaseEntity, 'Save' | 'LatestResult'>, label: string): Promise<void> {
  if (!(await entity.Save())) {
    throw new FormAuthoringError(`Failed to save ${label}.`, { fault: true, logDetail: saveFailure(entity) });
  }
}
