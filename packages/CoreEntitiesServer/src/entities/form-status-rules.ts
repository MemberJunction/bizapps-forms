/**
 * The `Form.Status` state machine — decided here as a pure function, enforced by `FormEntityServer`
 * for every writer.
 *
 *     Draft ──(engine only)──▶ Published ──▶ Closed ──▶ Published   when a Published version exists
 *       │                                      │
 *       └────────────────────▶ Closed          └──────▶ Draft       when none does
 *
 * `Published` means "a respondent can open this": the respondent path serves a form only in that
 * status, so the one way in from `Draft` is the publishing engine, which writes the version the
 * respondent will see in the same unit of work. A browser that flipped the column alone would
 * advertise a form with nothing behind it.
 *
 * `Closed` is archive. Leaving it, the form goes back to whatever its versions say it is: to
 * `Published` when it has a live version (archiving closed every distribution, so nothing reopens
 * by itself), and to `Draft` only when it has none — a Draft form holding a Published version
 * would hide a live definition behind a status that says there is none.
 *
 * A template is never published (`CK_Form_TemplateNotPublished` holds the same rule in the database;
 * this reports it as a named refusal instead of a constraint error, and does not depend on the
 * generated `ValidateTemplateNotPublished`, which exists only while a GeneratedCode row does).
 */
import type { mjBizAppsFormsFormEntityType } from '@mj-biz-apps/forms-entities';
import type { RuleViolation } from './entity-refusal.js';

export type FormStatus = mjBizAppsFormsFormEntityType['Status'];

/** A save of one `Form`, reduced to what the rules read. */
export interface FormStatusWrite {
  /** True when the row does not exist yet. */
  isNew: boolean;
  /** The status the row holds in the database; `null` when it is new. */
  storedStatus: FormStatus | null;
  /** The status this save writes. */
  status: FormStatus;
  isTemplate: boolean;
  /** Whether the publishing engine is the writer. */
  authorizedByEngine: boolean;
  /**
   * Whether the form has a Published version — read only when {@link needsPublishedVersionCheck}
   * says the decision depends on it. `undefined` there means the read failed, and the save is
   * refused rather than guessed at.
   */
  publishedVersionExists?: boolean;
}

/** Whether deciding this save needs to know if the form has a Published version. */
export function needsPublishedVersionCheck(write: Pick<FormStatusWrite, 'isNew' | 'storedStatus' | 'status'>): boolean {
  return !write.isNew && write.storedStatus === 'Closed' && write.status !== 'Closed';
}

/** Whether this save moves the form INTO `Closed` — the transition that closes its distributions. */
export function closesForm(write: Pick<FormStatusWrite, 'isNew' | 'storedStatus' | 'status'>): boolean {
  return !write.isNew && write.status === 'Closed' && write.storedStatus !== 'Closed';
}

/** Every rule a `Form` save breaks; empty when it may proceed. */
export function formStatusViolations(write: FormStatusWrite): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (write.isTemplate && write.status === 'Published') {
    violations.push({
      field: 'Status',
      message: 'A template cannot be published. Create a form from the template and publish that instead.',
    });
  }
  const refusal =
    write.isNew || write.storedStatus === null
      ? insertRefusal(write)
      : transitionRefusal(write, write.storedStatus);
  if (refusal) {
    violations.push({ field: 'Status', message: refusal });
  }
  return violations;
}

function insertRefusal(write: FormStatusWrite): string | null {
  if (write.status !== 'Published' || write.authorizedByEngine) {
    return null;
  }
  return 'A form is created as Draft. Only the publishing engine may create one as Published — publish it instead.';
}

function transitionRefusal(write: FormStatusWrite, from: FormStatus): string | null {
  const to = write.status;
  if (from === to || to === 'Closed') {
    return null; // archiving is allowed from anywhere; no change is no transition
  }
  if (from === 'Draft') {
    return write.authorizedByEngine
      ? null
      : 'Only the publishing engine may move a form from Draft to Published — publish the form instead.';
  }
  if (from === 'Published') {
    return 'A published form cannot return to Draft. Archive it instead; restoring it later brings back its published version.';
  }
  return restoreRefusal(to, write.publishedVersionExists);
}

/** Leaving `Closed`: the destination is decided by whether a live version exists. */
function restoreRefusal(to: FormStatus, publishedVersionExists: boolean | undefined): string | null {
  if (publishedVersionExists === undefined) {
    return 'Could not read whether this form has a published version, so it was not restored. Try again.';
  }
  if (to === 'Published' && !publishedVersionExists) {
    return 'This form has no published version, so restoring it returns it to Draft, not Published.';
  }
  if (to === 'Draft' && publishedVersionExists) {
    return 'This form has a published version, so restoring it returns it to Published, not Draft.';
  }
  return null;
}
