import { describe, expect, it } from 'vitest';
import {
  evaluateProvenance,
  everyFileIsAttributable,
  provenanceIsStrict,
  type UploadLedgerRow,
} from '../upload-provenance.service';

function row(overrides: Partial<UploadLedgerRow> = {}): UploadLedgerRow {
  return {
    FileID: 'FILE-1',
    DistributionID: 'DIST-1',
    ResponseDraftID: 'resp-1',
    AnonymousSessionID: null,
    Status: 'Active',
    ...overrides,
  };
}

const inputs = { fileId: 'file-1', distributionId: 'dist-1', clientResponseId: 'RESP-1', sessionId: '' };

describe('evaluateProvenance', () => {
  it('accepts a file whose draft id matches, in either casing', () => {
    // The ledger returns SQL Server's uppercase GUIDs while the widget mints lowercase — comparing
    // them directly is the defect class that has shipped twice in this codebase.
    expect(evaluateProvenance(row(), inputs, true)).toEqual({ ok: true });
  });

  it('rejects a file with no ledger row — it never came through the upload endpoint', () => {
    expect(evaluateProvenance(undefined, inputs, true)).toEqual({ ok: false, failure: 'unknown-file' });
  });

  it('rejects a revoked upload', () => {
    expect(evaluateProvenance(row({ Status: 'Revoked' }), inputs, true).failure).toBe('revoked');
  });

  it('rejects a file uploaded through a different distribution', () => {
    expect(evaluateProvenance(row({ DistributionID: 'other' }), inputs, true).failure).toBe('wrong-distribution');
  });

  it('THE EXFILTRATION CASE: another session’s upload is rejected', () => {
    // Session A uploads, session B names the same file id in its own submission. Same
    // distribution, so distribution scope alone would let it through.
    const theirUpload = row({ ResponseDraftID: 'someone-elses-response', AnonymousSessionID: 'their-session' });

    expect(evaluateProvenance(theirUpload, inputs, true).failure).toBe('unattributable');
  });

  it('falls back to the session id when no draft id was recorded', () => {
    const older = row({ ResponseDraftID: null, AnonymousSessionID: 'sess-9' });

    expect(evaluateProvenance(older, { ...inputs, sessionId: 'sess-9' }, true)).toEqual({ ok: true });
  });

  it('treats a blank session id as no evidence, rather than as a match', () => {
    // The anonymous session id is legitimately blank in ordinary public-link flows. Matching
    // blank-to-blank would make every such upload vouch for every other one.
    const noEvidence = row({ ResponseDraftID: null, AnonymousSessionID: '' });

    expect(evaluateProvenance(noEvidence, { ...inputs, sessionId: '' }, true).failure).toBe('unattributable');
  });

  it('lenient mode admits an unattributable upload but nothing else', () => {
    const noEvidence = row({ ResponseDraftID: null, AnonymousSessionID: null });

    expect(evaluateProvenance(noEvidence, inputs, false)).toEqual({ ok: true });
    // Lenient is a rollout window for older widgets, not an off switch: a foreign or revoked file
    // is still refused.
    expect(evaluateProvenance(row({ DistributionID: 'other' }), inputs, false).ok).toBe(false);
    expect(evaluateProvenance(row({ Status: 'Revoked' }), inputs, false).ok).toBe(false);
    expect(evaluateProvenance(undefined, inputs, false).ok).toBe(false);
  });
});

describe('provenanceIsStrict', () => {
  it('is strict unless explicitly set to lenient', () => {
    expect(provenanceIsStrict(undefined)).toBe(true);
    expect(provenanceIsStrict('strict')).toBe(true);
    expect(provenanceIsStrict('lenient')).toBe(false);
  });
});

/**
 * The bind-time re-check runs over a whole response rather than one answer at a time, and it has
 * no error message to produce — only a yes/no that decides whether file answers may reach a
 * business record. It has to apply the SAME rule as the submit-time check: a check that verifies
 * only the distribution would accept any file uploaded to the same public form by anyone.
 */
describe('everyFileIsAttributable', () => {
  const scope = { distributionId: 'dist-1', clientResponseId: 'RESP-1', sessionId: '' };

  function ledgerOf(...rows: UploadLedgerRow[]): Map<string, UploadLedgerRow> {
    return new Map(rows.map((r) => [r.FileID.trim().toLowerCase(), r]));
  }

  it('accepts files attributed to this response', () => {
    expect(
      everyFileIsAttributable(['file-1'], ledgerOf(row()), scope, true),
    ).toBe(true);
  });

  it('is vacuously true when the response has no file answers', () => {
    expect(everyFileIsAttributable([], new Map(), scope, true)).toBe(true);
  });

  it('THE DISCLOSURE CASE: rejects a file uploaded to this distribution by someone else', () => {
    // Same public form, same distribution, different respondent. A distribution-only check would
    // wave this through and copy a stranger's file id onto a business record.
    const theirs = row({ FileID: 'FILE-2', ResponseDraftID: 'someone-elses-response' });

    expect(everyFileIsAttributable(['file-2'], ledgerOf(theirs), scope, true)).toBe(false);
  });

  it('rejects when any one file of several fails', () => {
    const mine = row();
    const theirs = row({ FileID: 'FILE-2', ResponseDraftID: 'someone-elses-response' });

    expect(everyFileIsAttributable(['file-1', 'file-2'], ledgerOf(mine, theirs), scope, true)).toBe(false);
  });

  it('rejects a file with no ledger row at all', () => {
    expect(everyFileIsAttributable(['file-9'], new Map(), scope, true)).toBe(false);
  });

  it('rejects a revoked upload even when it is this response’s own', () => {
    expect(
      everyFileIsAttributable(['file-1'], ledgerOf(row({ Status: 'Revoked' })), scope, true),
    ).toBe(false);
  });

  it('still refuses a wrong-distribution file in lenient mode', () => {
    // Lenient only ever forgives the unattributable case; it never forgives evidence of the file
    // belonging to a different form.
    const elsewhere = row({ DistributionID: 'other-dist' });

    expect(everyFileIsAttributable(['file-1'], ledgerOf(elsewhere), scope, false)).toBe(false);
  });
});
