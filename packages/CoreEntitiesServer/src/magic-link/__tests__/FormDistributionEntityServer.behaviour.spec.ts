/**
 * BEHAVIOURAL tests for the credential lifecycle hook — the class runs, over a fake base.
 *
 * This file replaced a sibling that read the source. A round-four review ran mutation testing
 * against that one and found the guards it existed for could be deleted outright with the suite
 * green: `refuseClientCredentialWrites` (now `refuseClientServerColumnWrites`) as a total no-op, the delete/revoke order reversed, the
 * re-entrancy check removed. Source-text assertions test presence and position; they cannot test a
 * condition or a sequence. Once every assertion it held had a behavioural twin here — the context
 * mapping and the one-value pair write were the last two — it was deleted rather than kept as a
 * "cheap structural smoke", because a second spec that cannot go red on its own is surface, not
 * safety. `scripts/check-guard-mutants.mjs` is what now proves these tests bite.
 *
 * The technique is the one `MagicLinkInviteMinter.spec.ts` already uses: mock the modules that
 * need MJ metadata, and let the real subclass run over a controllable base. `@RegisterClass`
 * becomes a no-op decorator; the generated `mjBizAppsFormsFormDistributionEntity` becomes a
 * class with plain fields, a recorded `Save`/`Delete`, and a `GetFieldByName` the test drives.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BaseEntityResult, EntitySaveOptions, EntityTransactionScope, UserInfo } from '@memberjunction/core';
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';
import type {
  AnonymousCredentialRef,
  IAnonymousMagicLinkMinter,
  InviteWriteHost,
  InviteWriteResult,
  MintAnonymousInviteParams,
  MintAnonymousInviteResult,
} from '../minter.js';

/** One recorded save: the credential pair as it stood when `super.Save()` ran. */
interface RecordedSave {
  MagicLinkInviteID: string | null;
  PublicLinkToken: string | null;
}

/**
 * The "database" behind every fake instance: the credential pair per distribution id, written by
 * each `super.Save()` and read back by the hook's locked `ExecuteSQL` read. Two instances of the
 * SAME row share it, which is what lets a test stage a stale copy. Reset per test.
 */
const store = new Map<string, RecordedSave & { ResponseCount?: number }>();
/** What the hook's read of the store answers with; `'fail'` makes the statement throw. */
let storeRead: 'ok' | 'fail' = 'ok';

/** A dirty-tracking field as `BaseEntity.GetFieldByName` returns it. */
interface FakeField {
  Dirty: boolean;
  OldValue: string | null;
  Value: string | null;
}

/**
 * The provider a server-side entity writes through, as the hook sees it: able to open a
 * transaction scope, and to create other entities that write inside it. Logs onto the base's
 * `events` so a test can read the transaction boundaries beside the writes they enclose.
 */
interface FakeProvider extends InviteWriteHost {
  SupportsEntityTransactions: boolean;
  BeginEntityTransaction(): Promise<EntityTransactionScope>;
  PlatformKey: 'sqlserver' | 'postgresql';
  QuoteIdentifier(name: string): string;
  QuoteSchemaAndView(schema: string, object: string): string;
  ExecuteSQL<T>(sql: string): Promise<T[]>;
  RunView(): Promise<{ Success: boolean; Results: { ID: string; Status: string }[]; ErrorMessage: string }>;
}

/**
 * What every test drives on the fake base. Declared once so the mock and the tests agree.
 *
 * The column unions are DERIVED from the generated entity type — the same rule `config.ts` and
 * `provisioning-decision.ts` follow — because a hand-copied one here carried a `'Paused'` status
 * the CHECK constraint does not allow, and a fake that admits an impossible state lets a test be
 * written against it. `import type` is erased, so the mock of the same module below is unaffected.
 */
interface FakeBaseShape {
  ID: string;
  ChannelType: mjBizAppsFormsFormDistributionEntityType['ChannelType'];
  Status: mjBizAppsFormsFormDistributionEntityType['Status'];
  IsActive: boolean;
  MagicLinkInviteID: string | null;
  PublicLinkToken: string | null;
  ResponseCount: number;
  AllowedOrigins: string | null;
  CloseAt: Date | null;
  IsSaved: boolean;
  EntityInfo: { SchemaName: string; BaseTable: string; TrackRecordChanges: boolean };
  ContextCurrentUser: UserInfo | undefined;
  LatestResult: { CompleteMessage: string } | null;
  ProviderToUse: FakeProvider;
  RegisterResultHistoryEntry(result: BaseEntityResult): void;
  fields: Map<string, FakeField>;
  saves: RecordedSave[];
  /** `ResponseCount` as it stood at each `super.Save()` — kept apart so the pair assertions stay exact. */
  savedCounts: number[];
  events: string[];
  /** Every statement the hook sent through `ExecuteSQL`. */
  statements: string[];
  saveResult: boolean;
  /** Make `super.Save()` throw, as a dropped connection would, to drive the rollback path. */
  saveThrows: boolean;
  deleteResult: boolean;
}

vi.mock('@memberjunction/global', async () => {
  // Only the decorator is neutralised. BaseSingleton stays real so MagicLinkMinterRegistry — which
  // the hook reads and these tests register a fake into — is the same instance on both sides.
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  // RunInEntityTransaction stays REAL: it is what decides begin / commit / rollback around a save,
  // and the tests below read those boundaries off the fake provider's log.
  return { ...actual, BaseEntity: class {}, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  // Only the generated base is faked; the SQL-literal helper and the origin grammar are real.
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  class FakeDistributionBase implements FakeBaseShape {
    ID = 'dist-1';
    ChannelType: FakeBaseShape['ChannelType'] = 'PublicLink';
    Status: FakeBaseShape['Status'] = 'Active';
    IsActive = true;
    MagicLinkInviteID: string | null = null;
    PublicLinkToken: string | null = null;
    ResponseCount = 0;
    AllowedOrigins: string | null = null;
    CloseAt: Date | null = null;
    IsSaved = true;
    EntityInfo = { SchemaName: '__mj_BizAppsForms', BaseTable: 'FormDistribution', TrackRecordChanges: true };
    ContextCurrentUser: UserInfo | undefined = { ID: 'staff-1', Name: 'Staff' } as unknown as UserInfo;
    LatestResult: { CompleteMessage: string } | null = null;
    ProviderToUse: FakeProvider = {
      SupportsEntityTransactions: true,
      BeginEntityTransaction: async () => {
        this.events.push('begin');
        return {
          IsNested: false,
          Commit: async () => {
            this.events.push('commit');
          },
          Rollback: async () => {
            this.events.push('rollback');
          },
        };
      },
      GetEntityObject: async () => {
        throw new Error('the fake host creates no entities; the minter fake records that it was asked');
      },
      PlatformKey: 'sqlserver',
      QuoteIdentifier: (name: string) => `[${name}]`,
      QuoteSchemaAndView: (schema: string, object: string) => `[${schema}].[${object}]`,
      // The archived-form rule's read of the link's form: a Draft form, so that rule never refuses
      // here — it has its own spec (`FormDistributionEntityServer.closed-form.spec.ts`).
      RunView: async () => ({ Success: true, Results: [{ ID: 'form-1', Status: 'Draft' }], ErrorMessage: '' }),
      // The hook's one statement: the locked re-read of the credential pair. Answered from `store`.
      ExecuteSQL: async <T,>(sql: string): Promise<T[]> => {
        this.events.push('lock');
        this.statements.push(sql);
        if (storeRead === 'fail') {
          throw new Error('read refused');
        }
        // `@ID = '…'` in the SQL Server procedure call, `[ID] = '…'` in a raw statement.
        const id = /(?:@ID|\[ID\]) = '([^']+)'/.exec(sql)?.[1] ?? '';
        const row = store.get(id);
        return (row ? [{ ResponseCount: 0, ...row }] : []) as T[];
      },
    };
    RegisterResultHistoryEntry(result: BaseEntityResult): void {
      this.LatestResult = { CompleteMessage: result.Message };
    }
    fields = new Map<string, FakeField>();
    saves: RecordedSave[] = [];
    savedCounts: number[] = [];
    events: string[] = [];
    statements: string[] = [];
    saveResult = true;
    saveThrows = false;
    deleteResult = true;
    GetFieldByName(name: string): FakeField | undefined {
      return this.fields.get(name);
    }
    /** The base's own async validation: nothing to say, as on the generated class. */
    async ValidateAsync(): Promise<{ Success: boolean; Errors: { Source: string; Message: string }[] }> {
      return { Success: true, Errors: [] };
    }
    async Save(): Promise<boolean> {
      this.events.push('save');
      if (this.saveThrows) {
        throw new Error('connection reset');
      }
      const written = { MagicLinkInviteID: this.MagicLinkInviteID, PublicLinkToken: this.PublicLinkToken };
      this.saves.push(written);
      this.savedCounts.push(this.ResponseCount);
      if (this.saveResult) {
        store.set(this.ID, { ...written, ResponseCount: this.ResponseCount });
      }
      return this.saveResult;
    }
    async Delete(): Promise<boolean> {
      this.events.push('delete');
      return this.deleteResult;
    }
  }
  return {
    quoteSqlString: actual.quoteSqlString,
    allowedOriginsRefusal: actual.allowedOriginsRefusal,
    mjBizAppsFormsFormDistributionEntity: FakeDistributionBase,
  };
});

const { FormDistributionEntityServer } = await import('../FormDistributionEntityServer.js');
const { makeFakeProvider } = await import('../../testing/index.js');
const { MagicLinkMinterRegistry } = await import('../minter.js');

/** The subclass under test, seen through the fake base's controls. */
type Subject = InstanceType<typeof FormDistributionEntityServer> & FakeBaseShape;

/**
 * Under the mock above the base constructs with no arguments; the TYPE still carries the real
 * generated constructor, `(Entity: EntityInfo, Provider?)`. This is the one place the two are
 * reconciled, and it says exactly what the mock does rather than inventing an EntityInfo.
 */
const ConstructSubject = FormDistributionEntityServer as unknown as new () => Subject;

function subject(): Subject {
  return new ConstructSubject();
}

/** A minter that records what it was asked, and the order it was asked in, on the base's `events` log. */
interface RecordingMinter extends IAnonymousMagicLinkMinter {
  mints: MintAnonymousInviteParams[];
  revokes: AnonymousCredentialRef[];
  /** The host each revoke was told to write through — `undefined` when it was left to its own. */
  revokeHosts: (InviteWriteHost | undefined)[];
  /** The same, for each mint. */
  mintHosts: (InviteWriteHost | undefined)[];
}

function minterLoggingTo(
  events: string[],
  revoke: InviteWriteResult = { success: true, changed: true },
): RecordingMinter {
  const mint: MintAnonymousInviteResult = { success: true, inviteId: 'invite-new', rawToken: 'mj_ml_new' };
  const mints: MintAnonymousInviteParams[] = [];
  const revokes: AnonymousCredentialRef[] = [];
  const revokeHosts: (InviteWriteHost | undefined)[] = [];
  const mintHosts: (InviteWriteHost | undefined)[] = [];
  return {
    mints,
    revokes,
    revokeHosts,
    mintHosts,
    MintAnonymousInvite: async (params, _user, host) => {
      events.push('mint');
      mints.push(params);
      mintHosts.push(host);
      return mint;
    },
    RevokeAnonymousInvite: async (credential, _user, host) => {
      events.push('revoke');
      revokes.push(credential);
      revokeHosts.push(host);
      return revoke;
    },
    SetAnonymousInviteExpiry: async () => ({ success: true, changed: false }),
  };
}

beforeEach(() => {
  delete process.env.FORMS_MAGICLINK_CHANNELS;
  store.clear();
  storeRead = 'ok';
});
afterEach(() => {
  MagicLinkMinterRegistry.Instance.ClearForTests();
});

/** A live link already holding a working credential, so the decision is `current` and no write follows. */
function withLiveCredential(s: Subject): Subject {
  s.MagicLinkInviteID = 'invite-live';
  s.PublicLinkToken = 'mj_ml_live';
  return s;
}

describe('the credential columns are server-owned (behaviour, not source text)', () => {
  it('restores a client-written MagicLinkInviteID to its old value before the row is saved', async () => {
    const s = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    s.fields.set('MagicLinkInviteID', { Dirty: true, OldValue: 'invite-live', Value: 'invite-evil' });
    s.MagicLinkInviteID = 'invite-evil';

    expect(await s.Save()).toBe(true);
    expect(s.saves[0]).toEqual({ MagicLinkInviteID: 'invite-live', PublicLinkToken: 'mj_ml_live' });
  });

  it('restores a client-SET PublicLinkToken, but keeps a client-CLEARED one — clearing is the reissue request', async () => {
    const set = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(set.events));
    set.fields.set('PublicLinkToken', { Dirty: true, OldValue: 'mj_ml_live', Value: 'mj_ml_forged' });
    set.PublicLinkToken = 'mj_ml_forged';
    await set.Save();
    expect(set.saves[0].PublicLinkToken).toBe('mj_ml_live');

    const cleared = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(cleared.events));
    cleared.fields.set('PublicLinkToken', { Dirty: true, OldValue: 'mj_ml_live', Value: null });
    cleared.PublicLinkToken = null;
    await cleared.Save();
    expect(cleared.saves[0].PublicLinkToken).toBeNull();
  });

  it('strips a credential supplied on CREATE — a new row starts with none and is then issued its own', async () => {
    const s = subject();
    s.IsSaved = false;
    s.MagicLinkInviteID = 'invite-smuggled';
    s.PublicLinkToken = 'mj_ml_smuggled';
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));

    await s.Save();
    expect(s.saves[0]).toEqual({ MagicLinkInviteID: null, PublicLinkToken: null });
  });
});

describe('the credential pair is one value (behaviour)', () => {
  it('a reissue writes the OLD invite beside a cleared token first, then the NEW pair in one save', async () => {
    // Writing only the invite id would store the new invite beside the OLD token and serve a raw
    // token the new invite cannot redeem; writing only the token orphans the invite. And the
    // intermediate (null, null) save was the concurrency window — see provision-runner.ts.
    const s = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    s.fields.set('PublicLinkToken', { Dirty: true, OldValue: 'mj_ml_live', Value: null });
    s.PublicLinkToken = null;

    expect(await s.Save()).toBe(true);
    // One transaction around the whole rotation; the hook's own second save neither opens another
    // nor locks again — it runs inside the turn already held.
    expect(s.events).toEqual(['begin', 'lock', 'save', 'revoke', 'mint', 'save', 'commit']);
    expect(s.saves).toEqual([
      { MagicLinkInviteID: 'invite-live', PublicLinkToken: null },
      { MagicLinkInviteID: 'invite-new', PublicLinkToken: 'mj_ml_new' },
    ]);
  });
});

describe('the provisioning context is built from the columns of the same meaning (behaviour)', () => {
  // A mis-map here — `isActive: this.CaptchaRequired`, say — is invisible to every other test in
  // the repo, because the runner is tested against a context it is handed. Each case below drives
  // ONE column and asserts the outcome only that column can produce.

  it('channelType: an Email link holding no credential is not issued one', async () => {
    const s = subject();
    s.ChannelType = 'Email';
    const minter = minterLoggingTo(s.events);
    MagicLinkMinterRegistry.Instance.Register(minter);
    await s.Save();
    expect(minter.mints).toEqual([]);
  });

  it('status: a Closed link holding a credential has it revoked and the pair cleared', async () => {
    const s = withLiveCredential(subject());
    s.Status = 'Closed';
    const minter = minterLoggingTo(s.events);
    MagicLinkMinterRegistry.Instance.Register(minter);
    await s.Save();
    expect(minter.revokes).toEqual([{ inviteId: 'invite-live', resourceId: 'dist-1' }]);
    expect(s.saves.at(-1)).toEqual({ MagicLinkInviteID: null, PublicLinkToken: null });
  });

  it('isActive: a switched-off link holding a credential has it revoked', async () => {
    const s = withLiveCredential(subject());
    s.IsActive = false;
    const minter = minterLoggingTo(s.events);
    MagicLinkMinterRegistry.Instance.Register(minter);
    await s.Save();
    expect(minter.revokes.map((r) => r.inviteId)).toEqual(['invite-live']);
  });

  it('distributionId and closeAt: the mint is scoped to THIS row and bounded by ITS closing date', async () => {
    const s = subject();
    s.ID = 'dist-42';
    s.CloseAt = new Date('2026-10-01T00:00:00.000Z');
    const minter = minterLoggingTo(s.events);
    MagicLinkMinterRegistry.Instance.Register(minter);
    await s.Save();
    expect(minter.mints).toHaveLength(1);
    expect(minter.mints[0].resourceId).toBe('dist-42');
    expect(minter.mints[0].expiresAt).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it('provisions AFTER the save, so the decision is about the state that landed', async () => {
    const s = subject();
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    await s.Save();
    expect(s.events.indexOf('save')).toBeLessThan(s.events.indexOf('mint'));
  });
});

describe('the credential pair on a save is what the STORE holds, not what this instance loaded (behaviour)', () => {
  // MJ writes every column on an update, dirty or not. So an instance loaded before a rotation and
  // saved after it — a server-side writer holding the row across other work — would put the OLD
  // pair back: a revoked invite beside its dead token, which reads as `current` and is never
  // re-minted. A dead link badged Live, permanently, produced by a rename.

  it('a stale instance saved after a rotation carries the rotated pair through, and mints nothing', async () => {
    store.set('dist-1', { MagicLinkInviteID: 'invite-new', PublicLinkToken: 'mj_ml_new' });
    const stale = withLiveCredential(subject()); // loaded when the row still held invite-live
    const minter = minterLoggingTo(stale.events);
    MagicLinkMinterRegistry.Instance.Register(minter);

    expect(await stale.Save()).toBe(true);
    expect(stale.saves).toEqual([{ MagicLinkInviteID: 'invite-new', PublicLinkToken: 'mj_ml_new' }]);
    expect(minter.mints).toEqual([]);
    expect(minter.revokes).toEqual([]);
  });

  it('a client that cleared the token keeps it cleared — the reissue request survives the adoption', async () => {
    store.set('dist-1', { MagicLinkInviteID: 'invite-live', PublicLinkToken: 'mj_ml_live' });
    const s = withLiveCredential(subject());
    s.fields.set('PublicLinkToken', { Dirty: true, OldValue: 'mj_ml_live', Value: null });
    s.PublicLinkToken = null;
    const minter = minterLoggingTo(s.events);
    MagicLinkMinterRegistry.Instance.Register(minter);

    await s.Save();
    expect(s.saves[0]).toEqual({ MagicLinkInviteID: 'invite-live', PublicLinkToken: null });
    expect(minter.revokes.map((r) => r.inviteId)).toEqual(['invite-live']);
    expect(store.get('dist-1')).toEqual({ MagicLinkInviteID: 'invite-new', PublicLinkToken: 'mj_ml_new', ResponseCount: 0 });
  });

  it('when the store cannot be read, saves on the loaded values and says so rather than refusing the save', async () => {
    storeRead = 'fail';
    const s = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));

    expect(await s.Save()).toBe(true);
    expect(s.saves[0]).toEqual({ MagicLinkInviteID: 'invite-live', PublicLinkToken: 'mj_ml_live' });
    const { LogError } = await import('@memberjunction/core');
    expect(vi.mocked(LogError).mock.calls.flat().join('\n')).toMatch(/read refused[\s\S]*without a row lock/);
  });
});

describe('ResponseCount is server-owned: a save carries what the STORE holds (final review I2)', () => {
  // Submit takes a slot with one conditional raw UPDATE (`submission/quota.ts`), never through this
  // entity. But MJ writes every column on an update, and the GraphQL update path `SetMany`s every
  // field the client sent — so the builder's settings save, on a row loaded when the builder opened,
  // wrote the count back to its old value and reopened slots `MaxResponses` had closed.

  it('a stale instance saved after submissions counted carries the stored count, not the loaded one', async () => {
    store.set('dist-1', { MagicLinkInviteID: 'invite-live', PublicLinkToken: 'mj_ml_live', ResponseCount: 7 });
    const stale = withLiveCredential(subject());
    stale.ResponseCount = 3; // loaded before four submissions landed
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(stale.events));

    expect(await stale.Save()).toBe(true);
    expect(stale.savedCounts).toEqual([7]);
    expect(store.get('dist-1')?.ResponseCount).toBe(7);
  });

  it('a client CHANGE to the count is refused: the stored value is kept and the attempt is logged', async () => {
    store.set('dist-1', { MagicLinkInviteID: 'invite-live', PublicLinkToken: 'mj_ml_live', ResponseCount: 7 });
    const s = withLiveCredential(subject());
    s.fields.set('ResponseCount', { Dirty: true, OldValue: '7', Value: '0' });
    s.ResponseCount = 0; // "reset the counter" from a client
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    const { LogError } = await import('@memberjunction/core');
    vi.mocked(LogError).mockClear();

    expect(await s.Save()).toBe(true);
    expect(s.savedCounts).toEqual([7]);
    expect(vi.mocked(LogError).mock.calls.flat().join('\n')).toMatch(/Ignoring a client write of ResponseCount on distribution dist-1/);
  });

  it('a client CHANGE is put back even when the locked re-read fails — the stored value is not the only defence', async () => {
    storeRead = 'fail';
    const s = withLiveCredential(subject());
    s.fields.set('ResponseCount', { Dirty: true, OldValue: '7', Value: '0' });
    s.ResponseCount = 0;
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));

    expect(await s.Save()).toBe(true);
    expect(s.savedCounts[0]).toBe(7);
  });

  it('a CREATE starts at zero whatever the client sent, and says so', async () => {
    const s = subject();
    s.IsSaved = false;
    s.ResponseCount = 5;
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    const { LogError } = await import('@memberjunction/core');
    vi.mocked(LogError).mockClear();

    await s.Save();
    // The create, then the hook's own credential write once the mint landed: both at zero.
    expect(s.savedCounts.length).toBeGreaterThan(0);
    expect(s.savedCounts.every((count) => count === 0)).toBe(true);
    expect(vi.mocked(LogError).mock.calls.flat().join('\n')).toMatch(/ResponseCount of 5/);
  });

  it('a stored row whose count is not a number is a failed read: logged, and saved on the loaded values', async () => {
    store.set('dist-1', { MagicLinkInviteID: 'invite-live', PublicLinkToken: 'mj_ml_live', ResponseCount: Number.NaN });
    const s = withLiveCredential(subject());
    s.ResponseCount = 3;
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    const { LogError } = await import('@memberjunction/core');
    vi.mocked(LogError).mockClear();

    expect(await s.Save()).toBe(true);
    expect(s.savedCounts).toEqual([3]);
    expect(vi.mocked(LogError).mock.calls.flat().join('\n')).toMatch(/without a row lock/);
  });
});

describe('two writers of one row take turns on a DATABASE row lock (behaviour)', () => {
  // The persisted reissue request — invite linked, token cleared — is "work owed" to anyone who
  // reads it. Without serialisation a concurrent save read it too, revoked the (already revoked)
  // invite, minted a second replacement, and whichever persist landed last left the other invite
  // Active with nothing referencing it: the orphan bizapps-forms#104 exists to remove. The turn used
  // to be an in-process queue, which a second API instance never joined; it is now the database's
  // own row lock, so these tests pin the statement and where it runs rather than an in-memory wait.

  it('an update runs in one transaction whose FIRST statement locks the row, and commits after the save', async () => {
    const s = withLiveCredential(subject());
    store.set('dist-1', { MagicLinkInviteID: 'invite-live', PublicLinkToken: 'mj_ml_live' });
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));

    expect(await s.Save()).toBe(true);
    expect(s.events).toEqual(['begin', 'lock', 'save', 'commit']);
  });

  it('locks the row by its id through the locked-read procedure (SQL Server)', async () => {
    // The procedure holds the UPDLOCK, HOLDLOCK to commit (#338: a roles-only login may EXECUTE it
    // but not read the base table); its body is pinned by guarded-write-sprocs.migration.spec.ts.
    const s = subject();
    s.ID = "dist-o'brien";
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    await s.Save();
    expect(s.statements).toEqual(["EXEC [__mj_BizAppsForms].[spFormDistributionReadServerColumnsLocked] @ID = 'dist-o''brien'"]);
  });

  it('spells the lock FOR UPDATE on PostgreSQL, with PostgreSQL quoting', async () => {
    // On the shared fake, so the provider's own quoting is the dialect's — the hook must use it.
    const db = makeFakeProvider({ platform: 'postgresql' });
    const s = subject();
    s.ProviderToUse = db.provider as unknown as Subject['ProviderToUse'];
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    await s.Save();
    expect(db.statements[0].sql).toBe(
      'SELECT "MagicLinkInviteID", "PublicLinkToken", "ResponseCount" FROM "__mj_BizAppsForms"."FormDistribution" ' +
        'WHERE "ID" = \'dist-1\' FOR UPDATE',
    );
    expect(db.statements[0].inTransaction).toBe(true);
  });

  it('a CREATE takes no lock and opens no transaction — there is no row for another writer to hold', async () => {
    const s = subject();
    s.IsSaved = false;
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    await s.Save();
    expect(s.events).not.toContain('begin');
    expect(s.events).not.toContain('lock');
  });

  it('a save that throws inside the turn is rolled back and REFUSED with the reason, not thrown', async () => {
    const s = withLiveCredential(subject());
    s.saveThrows = true;
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));

    expect(await s.Save()).toBe(false);
    expect(s.events).toEqual(['begin', 'lock', 'save', 'rollback']);
    expect(s.LatestResult?.CompleteMessage).toMatch(/dist-1[\s\S]*connection reset[\s\S]*rolled back/);
  });

  it('on a provider that cannot transact, still saves — without a transaction', async () => {
    const s = withLiveCredential(subject());
    s.ProviderToUse.SupportsEntityTransactions = false;
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    expect(await s.Save()).toBe(true);
    expect(s.events).toEqual(['lock', 'save']);
  });
});

describe('an update save hands the minter its own provider, so invite writes join its transaction (behaviour)', () => {
  // Without this the revoke and mint wrote through the minter's own provider — another connection —
  // and committed even when this save, or a form archive enclosing it, rolled back. The archive
  // case is driven end to end in FormEntityServer.behaviour.spec.ts.
  it('a reissue on an update revokes and mints through the row\'s provider', async () => {
    const s = withLiveCredential(subject());
    const minter = minterLoggingTo(s.events);
    MagicLinkMinterRegistry.Instance.Register(minter);
    s.fields.set('PublicLinkToken', { Dirty: true, OldValue: 'mj_ml_live', Value: null });
    s.PublicLinkToken = null;

    await s.Save();
    expect(minter.revokeHosts).toEqual([s.ProviderToUse]);
    expect(minter.mintHosts).toEqual([s.ProviderToUse]);
  });

  it('a CREATE holds no transaction, so its mint is left to the minter, as before', async () => {
    const s = subject();
    s.IsSaved = false;
    const minter = minterLoggingTo(s.events);
    MagicLinkMinterRegistry.Instance.Register(minter);
    await s.Save();
    expect(minter.mintHosts).toEqual([undefined]);
  });
});

describe('AllowedOrigins follows the embed-origin grammar, whoever writes it (behaviour)', () => {
  it('with TrackRecordChanges OFF, "unchanged" is the client\'s word, so the list is checked anyway (fix round 1)', async () => {
    const s = subject();
    s.EntityInfo.TrackRecordChanges = false;
    s.AllowedOrigins = '["*.acme.com"]'; // the client claims this was already stored
    expect((await s.ValidateAsync()).Errors.map((e) => e.Source)).toEqual(['AllowedOrigins']);
  });

  it('SkipAsyncValidation cannot switch the grammar off — refused before any write (fix round 1)', async () => {
    const s = subject();
    s.AllowedOrigins = '["*.acme.com"]';
    s.fields.set('AllowedOrigins', { Dirty: true, OldValue: null, Value: s.AllowedOrigins });
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));

    expect(await s.Save({ SkipAsyncValidation: true } as EntitySaveOptions)).toBe(false);
    expect(s.events).toEqual([]);
    expect(s.LatestResult?.CompleteMessage).toContain('*.acme.com');
  });

  it('opts in to async validation, so MJ runs it on every save', () => {
    expect(subject().DefaultSkipAsyncValidation).toBe(false);
  });

  it('refuses a changed list holding an entry that is not an origin, naming it', async () => {
    const s = subject();
    s.AllowedOrigins = '["https://ok.example", "*.acme.com"]';
    s.fields.set('AllowedOrigins', { Dirty: true, OldValue: null, Value: s.AllowedOrigins });
    const result = await s.ValidateAsync();
    expect(result.Success).toBe(false);
    expect(result.Errors.map((e) => [e.Source, e.Message])).toEqual([
      ['AllowedOrigins', expect.stringContaining('*.acme.com')],
    ]);
  });

  it('refuses a bad list on CREATE', async () => {
    const s = subject();
    s.IsSaved = false;
    s.AllowedOrigins = '["https://acme.com/careers"]';
    expect((await s.ValidateAsync()).Success).toBe(false);
  });

  it('accepts a good list, and NULL', async () => {
    const s = subject();
    s.AllowedOrigins = '["https://careers.acme.com"]';
    s.fields.set('AllowedOrigins', { Dirty: true, OldValue: null, Value: s.AllowedOrigins });
    expect((await s.ValidateAsync()).Success).toBe(true);
    s.AllowedOrigins = null;
    expect((await s.ValidateAsync()).Success).toBe(true);
  });

  it('does NOT refuse a save that leaves a stale bad list untouched — a submission must still count', async () => {
    const s = subject();
    s.AllowedOrigins = '["*.acme.com"]'; // stored before the rule existed; this save does not touch it
    expect((await s.ValidateAsync()).Success).toBe(true);
  });

  it('a ReplayOnly save — which MJ never validates — is validated here and refused before any write', async () => {
    const s = subject();
    s.AllowedOrigins = '["*.acme.com"]';
    s.fields.set('AllowedOrigins', { Dirty: true, OldValue: null, Value: s.AllowedOrigins });
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));

    expect(await s.Save({ ReplayOnly: true } as EntitySaveOptions)).toBe(false);
    expect(s.events).toEqual([]);
    expect(s.LatestResult?.CompleteMessage).toContain('*.acme.com');
  });
});

describe('re-entrancy is bounded (behaviour)', () => {
  it('a throw from provisioning leaves the in-flight guard false, so the next save is not skipped', async () => {
    const s = subject();
    MagicLinkMinterRegistry.Instance.Register({
      ...minterLoggingTo(s.events),
      MintAnonymousInvite: async () => {
        s.events.push('mint');
        throw new Error('boom');
      },
    });
    expect(await s.Save()).toBe(true);
    expect(s.events).toEqual(['begin', 'lock', 'save', 'mint', 'commit']);
    // A second save must reach provisioning again; with the guard wedged it would return early
    // after super.Save and never call the minter.
    s.events.length = 0;
    await s.Save();
    expect(s.events).toEqual(['begin', 'lock', 'save', 'mint', 'commit']);
  });
});

describe('deleting a distribution (behaviour)', () => {
  it('deletes and revokes inside ONE transaction, committed only after both landed', async () => {
    const s = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    expect(await s.Delete()).toBe(true);
    expect(s.events).toEqual(['begin', 'delete', 'revoke', 'commit']);
  });

  it("hands the minter the row's own provider, so the revoke joins that transaction rather than writing beside it", async () => {
    const s = withLiveCredential(subject());
    const minter = minterLoggingTo(s.events);
    MagicLinkMinterRegistry.Instance.Register(minter);
    await s.Delete();
    expect(minter.revokes).toEqual([{ inviteId: 'invite-live', resourceId: 'dist-1' }]);
    expect(minter.revokeHosts).toEqual([s.ProviderToUse]);
  });

  it('a revoke that fails rolls the delete back and REFUSES it, naming the invite and the reason', async () => {
    // The old contract deleted first and, on a failed revoke, logged an orphan whose only handle
    // was that log line. With the two in one transaction the row survives, still pointing at its
    // invite, so the next attempt — or a pause — retries from a consistent state.
    const s = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(
      minterLoggingTo(s.events, { success: false, changed: false, message: 'connection reset' }),
    );
    expect(await s.Delete()).toBe(false);
    expect(s.events).toEqual(['begin', 'delete', 'revoke', 'rollback']);
    expect(s.LatestResult?.CompleteMessage).toContain('invite-live');
    expect(s.LatestResult?.CompleteMessage).toContain('connection reset');
  });

  it('does not revoke when the delete was refused — a bounced delete must not kill a live credential', async () => {
    const s = withLiveCredential(subject());
    s.deleteResult = false;
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    expect(await s.Delete()).toBe(false);
    expect(s.events).not.toContain('revoke');
  });

  it('with no credential to withdraw, deletes without opening a transaction', async () => {
    const s = subject();
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    expect(await s.Delete()).toBe(true);
    expect(s.events).toEqual(['delete']);
  });

  it('on a provider that cannot transact, falls back to delete-then-revoke and names the orphan when the revoke fails', async () => {
    const s = withLiveCredential(subject());
    s.ProviderToUse.SupportsEntityTransactions = false;
    MagicLinkMinterRegistry.Instance.Register(
      minterLoggingTo(s.events, { success: false, changed: false, message: 'connection reset' }),
    );
    // The row is gone and cannot be brought back, so this is the one place a failed revoke is
    // reported as a successful delete — with the invite id in the log as the only handle left.
    expect(await s.Delete()).toBe(true);
    expect(s.events).toEqual(['delete', 'revoke']);
    const { LogError } = await import('@memberjunction/core');
    expect(vi.mocked(LogError).mock.calls.flat().join('\n')).toMatch(/invite-live[\s\S]*orphaned/);
  });
});
