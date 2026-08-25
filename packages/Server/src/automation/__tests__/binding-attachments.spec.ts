/**
 * The binding half of file attachments: after a binding writes a business record, the response's
 * uploads are attached to THAT record too.
 *
 * This is the half that carries the disclosure risk. A link on the form response is visible to
 * people who can already read the response; a link on an applicant, a member, an account is
 * visible to whoever can read that record — so the same provenance verdict that decides whether a
 * file id may be WRITTEN into a column has to decide whether the file may be ATTACHED to the
 * record. These tests pin that the two answers come from one computation, and that every outcome
 * with nothing to attach to attaches nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalAnswers } from '@mj-biz-apps/forms-entities';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import type { UserInfo } from '@memberjunction/core';
import type { BindingOutcome } from '@mj-biz-apps/forms-actions';
import type { SyncFileLinksInput } from '../../file-links/file-links.service';
import type { UploadLedgerRow } from '../../upload/upload-provenance.service';

const BINDING_ENTITY = 'MJ_BizApps_Forms: Form Entity Bindings';
const TARGET_ENTITY_ID = 'aaaaaaaa-0000-4000-8000-00000000ffff';
const RESPONSE_ID = 'cccccccc-0000-4000-8000-000000000001';
const DISTRIBUTION_ID = 'dddddddd-1111-4000-8000-000000000001';
const FILE_A = 'dddddddd-0000-4000-8000-00000000000a';

/** The `FormAutomationRun` row the dispatcher opens and closes around every target. */
class FakeRunRow {
  ID = 'run-1';
  Status: string | null = null;
  ErrorMessage: string | null = null;
  NewRecord(): void {
    /* no-op for the fake */
  }
  async Save(): Promise<boolean> {
    return true;
  }
}

/** The authored binding the dispatcher loads. */
class FakeBindingRow {
  ID = 'bind-1';
  Status = 'Active';
  TargetEntityID = TARGET_ENTITY_ID;
  TargetEntityName = 'ATS: Applicants';
  FieldMappings: string | null = null;
  IdentityRule: string | null = null;
  MergePolicy: string | null = null;
  async Load(): Promise<boolean> {
    return true;
  }
}

const state: {
  binding: FakeBindingRow;
  outcome: BindingOutcome;
  ledger: Map<string, UploadLedgerRow>;
  allowFileAnswers?: boolean;
  syncCalls: SyncFileLinksInput[];
  syncFailures: string[];
  logged: string[];
} = {
  binding: new FakeBindingRow(),
  outcome: { kind: 'Created', targetRecordId: 'rec-1', writtenFields: ['Email'] },
  ledger: new Map(),
  syncCalls: [],
  syncFailures: [],
  logged: [],
};

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    async GetEntityObject<T>(entityName: string): Promise<T> {
      return (entityName === BINDING_ENTITY ? state.binding : new FakeRunRow()) as unknown as T;
    }
  }
  return {
    ...actual,
    Metadata,
    LogError: (message: string) => {
      state.logged.push(message);
    },
  };
});

vi.mock('@mj-biz-apps/forms-actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mj-biz-apps/forms-actions')>();
  return {
    ...actual,
    parseBindingConfig: () => ({}),
    executeBinding: async (input: { allowFileAnswers?: boolean }) => {
      state.allowFileAnswers = input.allowFileAnswers;
      return { ok: true, outcome: state.outcome };
    },
    recordBindingLedgerRow: async () => undefined,
  };
});

vi.mock('../../upload/upload-provenance.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../upload/upload-provenance.service')>();
  return { ...actual, loadUploadLedger: async () => state.ledger };
});

vi.mock('../../file-links/file-links.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../file-links/file-links.service')>();
  return {
    ...actual,
    syncFileLinks: async (_gateway: unknown, input: SyncFileLinksInput) => {
      state.syncCalls.push(input);
      return { created: input.fileIds.length, deleted: 0, failures: state.syncFailures };
    },
  };
});

const { dispatchAutomation } = await import('../dispatch-automation');

const automation: PublishedFormAutomation = {
  id: 'auto-1',
  name: 'Bind to applicant',
  targetType: 'EntityBinding',
  bindingId: 'bind-1',
  trigger: 'OnComplete',
  executionMode: 'Sync',
  displayOrder: 1,
  continueOnError: true,
  isActive: true,
};

/** A response whose only answer is an uploaded file. */
function context(withFile = true) {
  return {
    responseId: RESPONSE_ID,
    formId: 'form-1',
    formVersionId: 'ver-1',
    distributionId: DISTRIBUTION_ID,
    answers: new CanonicalAnswers(withFile ? [{ QuestionID: 'q-file', FileID: FILE_A }] : []),
    principal: { Name: 'Forms Automation Service' } as unknown as UserInfo,
    allowedEntities: null,
  };
}

/** A ledger that vouches for this respondent's own upload. */
function attributableLedger(): Map<string, UploadLedgerRow> {
  return new Map([
    [
      FILE_A,
      {
        FileID: FILE_A,
        DistributionID: DISTRIBUTION_ID,
        ResponseDraftID: RESPONSE_ID,
        AnonymousSessionID: null,
        Status: 'Active',
      },
    ],
  ]);
}

beforeEach(() => {
  state.binding = new FakeBindingRow();
  state.outcome = { kind: 'Created', targetRecordId: 'rec-1', writtenFields: ['Email'] };
  state.ledger = attributableLedger();
  state.allowFileAnswers = undefined;
  state.syncCalls = [];
  state.syncFailures = [];
  state.logged = [];
});

describe('binding dispatch — attaching files to the bound record', () => {
  it('attaches the response files to the record it created', async () => {
    await dispatchAutomation(automation, context());

    expect(state.syncCalls).toEqual([
      {
        target: { entityId: TARGET_ENTITY_ID, recordId: 'rec-1' },
        fileIds: [FILE_A],
        responseId: RESPONSE_ID,
      },
    ]);
  });

  it('attaches to a record it merged into as well', async () => {
    state.outcome = { kind: 'Merged', targetRecordId: 'rec-9', writtenFields: ['Phone'] };

    await dispatchAutomation(automation, context());

    expect(state.syncCalls[0].target.recordId).toBe('rec-9');
  });

  it('still reconciles on an Unchanged outcome', async () => {
    // The binding found its record and had nothing new to write. That says nothing about whether
    // the attachments are current — records bound before this feature existed arrive exactly
    // this way, and they are the ones missing their files.
    state.outcome = { kind: 'Unchanged', targetRecordId: 'rec-1', writtenFields: [] };

    await dispatchAutomation(automation, context());

    expect(state.syncCalls).toHaveLength(1);
  });

  it('attaches nothing when the binding skipped this response', async () => {
    state.outcome = { kind: 'Skipped', targetRecordId: null, writtenFields: [], skipReason: 'no identity' };

    await dispatchAutomation(automation, context());

    expect(state.syncCalls).toEqual([]);
  });

  it('attaches nothing when the outcome names no record', async () => {
    state.outcome = { kind: 'Created', targetRecordId: null, writtenFields: [] };

    await dispatchAutomation(automation, context());

    expect(state.syncCalls).toEqual([]);
  });

  it('attaches nothing when the files cannot be attributed to this respondent', async () => {
    // The same verdict that refuses the file as a COLUMN value refuses it as an attachment. An
    // attachment on someone else's record is every bit as readable as a column on it.
    state.ledger = new Map();

    await dispatchAutomation(automation, context());

    expect(state.allowFileAnswers).toBe(false);
    expect(state.syncCalls).toEqual([]);
  });

  it('uses one provenance verdict for both the field write and the attachment', async () => {
    await dispatchAutomation(automation, context());

    expect(state.allowFileAnswers).toBe(true);
    expect(state.syncCalls).toHaveLength(1);
  });

  it('reconciles even when the response carries no files', async () => {
    // An upload removed on a later submission has to stop being attached to the bound record too.
    await dispatchAutomation(automation, context(false));

    expect(state.syncCalls).toEqual([
      { target: { entityId: TARGET_ENTITY_ID, recordId: 'rec-1' }, fileIds: [], responseId: RESPONSE_ID },
    ]);
  });

  it('does not fail the dispatch when an attachment could not be written', async () => {
    // The business record is already written. Reporting a failure would invite a re-drive that
    // duplicates it, to fix a link.
    state.syncFailures = ['could not attach file: FK violation'];

    await expect(dispatchAutomation(automation, context())).resolves.toBeUndefined();

    expect(state.logged.some((line) => line.includes('FK violation'))).toBe(true);
  });

  it('attaches nothing when the binding is disabled', async () => {
    state.binding.Status = 'Disabled';

    await dispatchAutomation(automation, context());

    expect(state.syncCalls).toEqual([]);
  });
});
