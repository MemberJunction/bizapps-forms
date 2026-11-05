/**
 * What may happen to a `FormVersion` row — decided here, once, as a pure function, and enforced by
 * `FormVersionEntityServer` for every writer (builder, AI action, import, `MJ.SaveEntityGraph`,
 * direct API).
 *
 * A published version is the record of what respondents answered. Every `FormResponse` points at
 * one, and the response viewer, the export and the automations all read a response's answers back
 * through that version's `DefinitionSnapshot`. So once a version has been published:
 *
 *  - its definition, number and form can never change — an edit would silently re-label every
 *    answer already collected against it;
 *  - it can only be retired, and only by the publishing engine, because retiring the live version
 *    without publishing its successor in the same unit of work takes the form's public link down;
 *  - it can never be deleted — responses reference it.
 *
 * And a version becomes published only through the engine (`FormPublishingEngine`), which builds
 * the snapshot from the authored rows and validates it before it lands. A browser that writes
 * `Status = 'Published'` with a snapshot of its own choosing is exactly what this refuses: the
 * engine signals itself with `FormVersionEntityServer.AuthorizedByEngine`, a transient field no
 * wire format carries.
 */
import type { mjBizAppsFormsFormVersionEntityType } from '@mj-biz-apps/forms-entities';
import type { RuleViolation } from './entity-refusal.js';

export type FormVersionStatus = mjBizAppsFormsFormVersionEntityType['Status'];

/** The columns that identify what a published version IS. */
export const FROZEN_VERSION_FIELDS = ['DefinitionSnapshot', 'VersionNumber', 'FormID'] as const;

/** The statuses after which a version's identity is fixed for good. */
const FROZEN_STATUSES: readonly FormVersionStatus[] = ['Published', 'Retired'];

/** A save of one `FormVersion`, reduced to what the rules read. */
export interface FormVersionWrite {
  /** True when the row does not exist yet. */
  isNew: boolean;
  /** The status the row holds in the database; `null` when it is new. */
  storedStatus: FormVersionStatus | null;
  /** The status this save writes. */
  status: FormVersionStatus;
  /** Which of {@link FROZEN_VERSION_FIELDS} this save changes. */
  changedFields: readonly string[];
  /** Whether the publishing engine is the writer. */
  authorizedByEngine: boolean;
}

/** Every rule a `FormVersion` save breaks; empty when it may proceed. */
export function formVersionWriteViolations(write: FormVersionWrite): RuleViolation[] {
  if (write.isNew || write.storedStatus === null) {
    return insertViolations(write);
  }
  const stored = write.storedStatus;
  const violations: RuleViolation[] = [];
  if (FROZEN_STATUSES.includes(stored)) {
    for (const field of write.changedFields) {
      violations.push({
        field,
        message:
          `${field} cannot change on a ${stored.toLowerCase()} form version: responses were collected against ` +
          `this exact definition. Publish a new version instead.`,
      });
    }
  }
  if (write.status !== stored) {
    const refusal = statusChangeRefusal(stored, write.status, write.authorizedByEngine);
    if (refusal) {
      violations.push({ field: 'Status', message: refusal });
    }
  }
  return violations;
}

/** Why a version in `stored` may not be deleted, or `null` when it may. */
export function formVersionDeleteRefusal(stored: FormVersionStatus): string | null {
  if (!FROZEN_STATUSES.includes(stored)) {
    return null;
  }
  return (
    `A ${stored.toLowerCase()} form version cannot be deleted: responses reference it, and it is the record ` +
    `of what those respondents answered.`
  );
}

function insertViolations(write: FormVersionWrite): RuleViolation[] {
  if (write.status === 'Draft' || write.authorizedByEngine) {
    return [];
  }
  return [
    {
      field: 'Status',
      message:
        `A form version is created as Draft. Creating one as ${write.status} publishes it, and only the ` +
        `publishing engine may do that — publish the form instead.`,
    },
  ];
}

function statusChangeRefusal(stored: FormVersionStatus, next: FormVersionStatus, engine: boolean): string | null {
  if (stored === 'Retired') {
    return `A retired form version cannot change status (Retired → ${next}). Publish a new version instead.`;
  }
  if (stored === 'Published' && next === 'Draft') {
    return 'A published form version cannot return to Draft. Publish a new version instead.';
  }
  if (!engine) {
    return (
      `Changing a form version from ${stored} to ${next} publishes or retires it, and only the publishing ` +
      `engine may do that — publish the form instead.`
    );
  }
  return null;
}
