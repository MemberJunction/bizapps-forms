/**
 * The default provenance writer's failure log keeps the respondent's file name out (#290's rule).
 *
 * When the ledger insert fails at the SQL layer, MJ's SQL Server provider builds its diagnostic as the
 * driver's error followed by `Query:` and the whole batch it ran — and that batch assigns the uploaded
 * file's name to `@FileName`. The submit path already strips that echo (`withoutQueryEcho`, #119); this
 * pins the same decision on the upload ledger, on both channels a failure can arrive by: `Save()`
 * returning false with `LatestResult.CompleteMessage`, and a thrown error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ledger = vi.hoisted(() => ({ failure: 'returns-false' as 'returns-false' | 'throws', message: '' }));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const real = await importOriginal<typeof import('@memberjunction/core')>();
  class LedgerOnlyMetadata {
    async GetEntityObject(): Promise<object> {
      return {
        NewRecord(): void {},
        LatestResult: { CompleteMessage: ledger.message },
        async Save(): Promise<boolean> {
          if (ledger.failure === 'throws') {
            throw new Error(ledger.message);
          }
          return false;
        },
      };
    }
  }
  return { ...real, Metadata: LedgerOnlyMetadata };
});

import { writeProvenanceRow, type ProvenanceRecordInput } from '../upload.service';
import { makeContextUser } from '../../public-submit/__tests__/fakes';

/** MJ's shape for a failed statement: the driver's error line, then the echoed batch with its values. */
const DRIVER_ERROR = 'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_FormUpload_Question".';
const SQL_FAILURE = [
  'Error executing SQL',
  ` Error: ${DRIVER_ERROR}`,
  ' Query: DECLARE @FileName_1a2b NVARCHAR(500)',
  "SET @FileName_1a2b = N'Jane Doe passport.pdf'",
  'EXEC [__mj_BizAppsForms].spCreateFormUpload @FileName = @FileName_1a2b',
].join('\n');

const INPUT: ProvenanceRecordInput = {
  writer: makeContextUser(),
  fileId: '0a1b2c3d-0000-4000-8000-0000000000f1',
  providerKey: 'forms-uploads/2026-10-06/0a1b2c3d-0000-4000-8000-0000000000aa/Jane Doe passport.pdf',
  distributionId: 'dist-1',
  formId: 'form-1',
  questionId: 'q-file',
  responseId: '0a1b2c3d-0000-4000-8000-000000000142',
  sessionId: 'session-1',
  uploadedByUserId: 'user-1',
  fileName: 'Jane Doe passport.pdf',
  contentType: 'application/pdf',
  sizeBytes: 5,
};

describe('writeProvenanceRow — a failed ledger insert logs the driver error, not the batch', () => {
  let logged: string[];
  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    ledger.message = SQL_FAILURE;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['returns-false', 'throws'] as const)('keeps the file name out of the log when the save %s', async (failure) => {
    ledger.failure = failure;

    await expect(writeProvenanceRow(INPUT)).resolves.toBe(false);

    const line = logged.find((l) => l.includes('Forms upload: provenance row'));
    expect(line, 'the failure must still be logged').toBeDefined();
    expect(line).toContain(DRIVER_ERROR);
    expect(line).not.toContain('Jane Doe');
    expect(line).not.toContain('Query:');
  });
});
