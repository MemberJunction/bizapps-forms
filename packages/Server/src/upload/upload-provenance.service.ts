/**
 * Prove that a submitted file id came from this respondent's own upload.
 *
 * `__mj.File` has no owner column and no row-level security, so the foreign key on a submitted
 * `fileId` establishes only that the file exists. Without this check a respondent can name any
 * file in the instance — another tenant's resume, a private document — and it becomes their
 * answer. That is survivable while a file id only reaches `FormResponseAnswer`; it is disclosure
 * the moment a binding copies one onto a record other users can read.
 *
 * The evidence is the `FormUpload` row the upload endpoint writes under an elevated principal. The
 * anonymous role can never write it, which is the whole point: a ledger the caller can forge
 * proves nothing, and granting the anonymous role `CanCreate` on this entity would let a session
 * mint its own row through the generated GraphQL mutation.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';

/** Why a file id was rejected. */
export type ProvenanceFailure =
  /** No ledger row at all — the file did not come through the Forms upload endpoint. */
  | 'unknown-file'
  /** The upload was withdrawn or garbage-collected. */
  | 'revoked'
  /** Uploaded through a different distribution. */
  | 'wrong-distribution'
  /** Nothing ties the upload to this submission. */
  | 'unattributable';

export interface ProvenanceCheck {
  ok: boolean;
  failure?: ProvenanceFailure;
}

export interface ProvenanceInputs {
  fileId: string;
  distributionId: string;
  /** The client-minted response id — the primary correlation key. */
  clientResponseId?: string;
  /** The anonymous session id, which is legitimately blank in some flows. */
  sessionId?: string;
}

/** One ledger row, as the verifier reads it. */
export interface UploadLedgerRow {
  FileID: string;
  DistributionID: string;
  ResponseDraftID: string | null;
  AnonymousSessionID: string | null;
  Status: string;
}

/**
 * Decide whether a ledger row vouches for this submission. Pure, so the policy is testable.
 *
 * `strict` governs only the unattributable case — a row that is scoped to the right distribution
 * but carries neither a draft id nor a session to match against, which is what an older widget
 * produces. Rejecting that outright would break in-flight clients during a rollout; accepting it
 * forever would leave the check scoped to a distribution rather than to a respondent, which is
 * weaker than it looks on a public form anyone can open.
 */
export function evaluateProvenance(
  row: UploadLedgerRow | undefined,
  inputs: ProvenanceInputs,
  strict: boolean,
): ProvenanceCheck {
  if (!row) {
    return { ok: false, failure: 'unknown-file' };
  }
  if (row.Status === 'Revoked') {
    return { ok: false, failure: 'revoked' };
  }
  if (!equalsFolded(row.DistributionID, inputs.distributionId)) {
    return { ok: false, failure: 'wrong-distribution' };
  }

  const draftMatches =
    Boolean(row.ResponseDraftID) && equalsFolded(row.ResponseDraftID, inputs.clientResponseId);
  const sessionMatches =
    Boolean(row.AnonymousSessionID?.trim()) && equalsFolded(row.AnonymousSessionID, inputs.sessionId);

  if (draftMatches || sessionMatches) {
    return { ok: true };
  }
  return strict ? { ok: false, failure: 'unattributable' } : { ok: true };
}

/**
 * GUIDs are compared case-folded because they cross the same boundary every other identifier in
 * this codebase does: minted lowercase on the client, returned uppercase by SQL Server.
 */
function equalsFolded(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) {
    return false;
  }
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Read the ledger rows for a set of file ids, keyed by folded file id. */
export async function loadUploadLedger(
  fileIds: readonly string[],
  contextUser: UserInfo,
): Promise<Map<string, UploadLedgerRow>> {
  const unique = [...new Set(fileIds.filter(Boolean))];
  const byFileId = new Map<string, UploadLedgerRow>();
  if (unique.length === 0) {
    return byFileId;
  }

  const inList = unique.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
  const result = await new RunView().RunView<UploadLedgerRow>(
    {
      EntityName: 'MJ_BizApps_Forms: Form Uploads',
      ExtraFilter: `FileID IN (${inList})`,
      Fields: ['FileID', 'DistributionID', 'ResponseDraftID', 'AnonymousSessionID', 'Status'],
      ResultType: 'simple',
    },
    contextUser,
  );
  if (!result.Success) {
    // A failed read is NOT "no provenance". Treating it as absence would reject every legitimate
    // file answer during a database blip, so the caller is told the lookup failed and decides —
    // and every caller here fails the operation rather than waving the file through.
    throw new Error(result.ErrorMessage ?? 'upload provenance lookup failed');
  }
  for (const row of result.Results) {
    byFileId.set(row.FileID.trim().toLowerCase(), row);
  }
  return byFileId;
}

/** Whether strict mode is on. Strict is the default; lenient exists only for a rollout window. */
export function provenanceIsStrict(raw: string | undefined = process.env.FORMS_UPLOAD_PROVENANCE): boolean {
  return raw !== 'lenient';
}
