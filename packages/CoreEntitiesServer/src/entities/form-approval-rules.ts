/**
 * Who may change a form's publish-approval settings (`RequiresPublishApproval`,
 * `PublishApproverRoleID`) — decided here as a pure function, enforced by `FormEntityServer` for
 * every writer.
 *
 * The gate is only a gate if the author it gates cannot switch it off. Turning approval on, or
 * choosing the role on a form that does not yet require approval, is opting in, so any writer of the
 * form may do it. Once approval is on, changing either setting — turning it off, or pointing it at a
 * different role — is open only to a member of the role that currently approves, or an owner
 * (`UserInfo.Type === 'Owner'`). Otherwise an author could turn approval off and publish, or name a
 * role they belong to and approve their own work.
 *
 * Neither setting changes while a version is waiting for approval, by anyone: the reviewer is
 * deciding against the form as it was configured when the version was submitted. Settle the review
 * first.
 *
 * A form that requires approval names its approver role, always.
 */
import type { mjBizAppsFormsFormEntityType } from '@mj-biz-apps/forms-entities';
import { UUIDsEqual } from '@memberjunction/global';
import type { RuleViolation } from './entity-refusal.js';

type FormRow = mjBizAppsFormsFormEntityType;

/** A save of one `Form`, reduced to what the approval-settings rules read. */
export interface ApprovalSettingsWrite {
  /** True when the row does not exist yet. */
  isNew: boolean;
  /** The settings the row holds in the database; `null` when it is new. */
  stored: { requires: FormRow['RequiresPublishApproval']; roleId: FormRow['PublishApproverRoleID'] } | null;
  /** The settings this save writes. */
  requires: FormRow['RequiresPublishApproval'];
  roleId: FormRow['PublishApproverRoleID'];
  /** Whether the publishing engine is the writer. */
  authorizedByEngine: boolean;
  /** The writer: the roles they hold and whether they own the install. `null` when there is none. */
  writer: { roleIds: readonly string[]; isOwner: boolean } | null;
  /**
   * Whether the form has a version waiting for approval — read only when
   * {@link needsInReviewCheck} says the decision depends on it. `undefined` there means the read
   * failed, and the save is refused rather than guessed at.
   */
  versionInReview?: boolean;
}

/** Whether this save changes either approval setting of a form that already exists. */
export function changesApprovalSettings(write: Pick<ApprovalSettingsWrite, 'isNew' | 'stored' | 'requires' | 'roleId'>): boolean {
  if (write.isNew || !write.stored) {
    return false;
  }
  return Boolean(write.stored.requires) !== Boolean(write.requires) || !sameRole(write.stored.roleId, write.roleId);
}

/** Whether deciding this save needs to know if the form has a version waiting for approval. */
export function needsInReviewCheck(write: Pick<ApprovalSettingsWrite, 'isNew' | 'stored' | 'requires' | 'roleId'>): boolean {
  return changesApprovalSettings(write);
}

/** Every approval-settings rule a `Form` save breaks; empty when it may proceed. */
export function approvalSettingsViolations(write: ApprovalSettingsWrite): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (write.requires && !write.roleId) {
    violations.push({
      field: 'PublishApproverRoleID',
      message: 'A form that requires publish approval must name the role whose members approve it.',
    });
  }
  if (!changesApprovalSettings(write) || write.authorizedByEngine) {
    return violations;
  }
  const inReview = inReviewViolation(write.versionInReview);
  if (inReview) {
    violations.push(inReview);
  }
  const writer = writerViolation(write);
  if (writer) {
    violations.push(writer);
  }
  return violations;
}

function inReviewViolation(versionInReview: boolean | undefined): RuleViolation | null {
  if (versionInReview === false) {
    return null;
  }
  return {
    field: 'RequiresPublishApproval',
    message:
      versionInReview === true
        ? 'A version of this form is waiting for approval, so its approval settings cannot change until that review is settled.'
        : "Whether a version of this form is waiting for approval could not be read, so its approval settings were not changed.",
  };
}

/** Once approval is on, only a member of the approving role, or an owner, may change the settings. */
function writerViolation(write: ApprovalSettingsWrite): RuleViolation | null {
  const stored = write.stored;
  if (!stored?.requires) {
    return null;
  }
  const writer = write.writer;
  if (writer?.isOwner) {
    return null;
  }
  if (writer && stored.roleId && writer.roleIds.some((roleId) => UUIDsEqual(roleId, stored.roleId))) {
    return null;
  }
  return {
    field: 'RequiresPublishApproval',
    message:
      "This form requires publish approval. Only a member of its approver role, or an owner, can turn approval off or change the approver role.",
  };
}

function sameRole(a: string | null, b: string | null): boolean {
  if (!a || !b) {
    return !a && !b;
  }
  return UUIDsEqual(a, b);
}
