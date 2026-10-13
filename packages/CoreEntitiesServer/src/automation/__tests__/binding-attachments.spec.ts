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
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { BindingOutcome } from '../../binding/binding-executor.js';
import type { SyncFileLinksInput } from '../../file-links/file-links.js';
import type { UploadLedgerRow } from '../../uploads/upload-provenance.js';

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
  /** True, as BaseEntity's does. */
  NewRecord(): boolean {
    return true;
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
  /** What each `executeBinding` call was handed: its config and the respondent's verification. */
  executed: { config: unknown; respondentVerified: boolean }[];
  /** What `parseBindingConfig` was asked to read — the LIVE row's columns. */
  parsedLive: { targetEntityName: string; raw: unknown }[];
  /** Every ledger row recorded, with its outcome. */
  ledgerRows: { bindingId: string; targetEntityId: string; outcome: BindingOutcome }[];
  syncCalls: SyncFileLinksInput[];
  syncFailures: string[];
  logged: string[];
} = {
  binding: new FakeBindingRow(),
  outcome: { kind: 'Created', targetRecordId: 'rec-1', writtenFields: ['Email'] },
  ledger: new Map(),
  executed: [],
  parsedLive: [],
  ledgerRows: [],
  syncCalls: [],
  syncFailures: [],
  logged: [],
};

// The global provider must never be reached by this dispatcher — every read/write is supposed to
// run on `ctx.provider` (bizapps-forms#260). Throwing here makes a stray `new Metadata()` call
// fail LOUDLY instead of happening to still work because the fake behind it was too permissive.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    async GetEntityObject<T>(): Promise<T> {
      throw new Error('global provider used');
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

/** Stands in for the isolated provider `withIsolatedProvider` hands the dispatcher in production. */
function fakeProvider(): DatabaseProviderBase {
  return {
    GetEntityObject: async <T,>(entityName: string): Promise<T> =>
      (entityName === BINDING_ENTITY ? state.binding : new FakeRunRow()) as unknown as T,
  } as unknown as DatabaseProviderBase;
}

vi.mock('../../binding/binding-executor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../binding/binding-executor.js')>();
  return {
    ...actual,
    parseBindingConfig: (targetEntityName: string, raw: unknown) => {
      state.parsedLive.push({ targetEntityName, raw });
      return { targetEntityName, live: true };
    },
    executeBinding: async (input: { allowFileAnswers?: boolean; config: unknown; respondentVerified: boolean }) => {
      state.allowFileAnswers = input.allowFileAnswers;
      state.executed.push({ config: input.config, respondentVerified: input.respondentVerified });
      return { ok: true, outcome: state.outcome };
    },
  };
});

vi.mock('../../binding/binding-ledger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../binding/binding-ledger.js')>();
  return {
    ...actual,
    recordBindingLedgerRow: async (bindingId: string, targetEntityId: string, _responseId: string, outcome: BindingOutcome) => {
      state.ledgerRows.push({ bindingId, targetEntityId, outcome });
    },
  };
});

vi.mock('../../uploads/upload-provenance.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../uploads/upload-provenance.js')>();
  return { ...actual, loadUploadLedger: async () => state.ledger };
});

vi.mock('../../file-links/file-links.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../file-links/file-links.js')>();
  return {
    ...actual,
    syncFileLinks: async (_gateway: unknown, input: SyncFileLinksInput) => {
      state.syncCalls.push(input);
      return { created: input.fileIds.length, deleted: 0, failures: state.syncFailures };
    },
  };
});

const { dispatchAutomation } = await import('../dispatch-automation.js');

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
    // Empty rather than absent: these fixtures assert attachment behaviour, not answer shaping,
    // and an empty map is the "caller cannot say" case the executor is explicitly safe for.
    questionTypes: new Map(),
    provider: fakeProvider(),
    attempt: 1,
    respondentVerified: false,
    workQueueMessageId: null,
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
  state.executed = [];
  state.parsedLive = [];
  state.ledgerRows = [];
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

/**
 * What a binding step runs is the PUBLISHED version's binding (spec #303 §5): a response is pinned
 * to the version it answered, so the mappings and merge rules that write it into a business record
 * are that version's too. The live row is read for one thing only — `Disabled`, the author's kill
 * switch — and, for a snapshot published before bindings were frozen into it, its settings.
 */
describe('binding dispatch — the published binding, the live kill switch, the unverified respondent', () => {
  const frozen: NonNullable<PublishedFormAutomation['binding']> = {
    targetEntityName: 'ATS: Applicants',
    fieldMappings: { version: 1, fields: [{ targetField: 'Email', source: { kind: 'question', questionId: 'q-email' } }] },
    identityRule: { mode: 'MatchThenCreate', match: [{ targetField: 'Email' }] },
    mergePolicy: { default: 'neverBlank', fields: {} },
    status: 'Active',
  } as NonNullable<PublishedFormAutomation['binding']>;
  const published: PublishedFormAutomation = { ...automation, binding: frozen };

  it("runs the snapshot's settings, never the live row's", async () => {
    state.binding.FieldMappings = '{"version":1,"fields":[{"targetField":"Phone","source":{"kind":"question","questionId":"q-x"}}]}';

    await dispatchAutomation(published, context());

    expect(state.parsedLive).toEqual([]);
    expect(state.executed[0].config).toEqual({
      targetEntityName: 'ATS: Applicants',
      fieldMappings: frozen.fieldMappings,
      identityRule: frozen.identityRule,
      mergePolicy: frozen.mergePolicy,
    });
  });

  it('falls back to the live settings for a snapshot published before bindings were frozen into it', async () => {
    await dispatchAutomation(automation, context());

    expect(state.parsedLive).toHaveLength(1);
    expect(state.executed[0].config).toEqual({ targetEntityName: 'ATS: Applicants', live: true });
  });

  it('writes nothing when the live row is Disabled, whatever the snapshot says — the kill switch', async () => {
    state.binding.Status = 'Disabled';

    await dispatchAutomation(published, context());

    expect(state.executed).toEqual([]);
    expect(state.ledgerRows).toEqual([]);
  });

  it('writes nothing when the binding was Disabled at publish, even if the live row is Active again', async () => {
    await dispatchAutomation({ ...published, binding: { ...frozen, status: 'Disabled' } }, context());

    expect(state.executed).toEqual([]);
  });

  it('tells the executor the respondent is NOT verified (#303 §6)', async () => {
    await dispatchAutomation(published, context());

    expect(state.executed[0].respondentVerified).toBe(false);
  });

  it('records a matched-but-not-written outcome on the ledger, and attaches nothing to that record (DW12)', async () => {
    state.outcome = {
      kind: 'Skipped',
      targetRecordId: 'someone-else',
      writtenFields: [],
      skipReason: "Matched record someone-else, but the respondent's identity is not verified, so nothing was written to it.",
    };

    await dispatchAutomation(published, context());

    expect(state.ledgerRows).toEqual([
      { bindingId: 'bind-1', targetEntityId: TARGET_ENTITY_ID, outcome: state.outcome },
    ]);
    expect(state.syncCalls).toEqual([]);
  });
});
