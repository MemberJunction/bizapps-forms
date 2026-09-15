/**
 * BEHAVIOURAL tests for the credential lifecycle hook — the class runs, over a fake base.
 *
 * This file replaced a sibling that read the source. A round-four review ran mutation testing
 * against that one and found the guards it existed for could be deleted outright with the suite
 * green: `refuseClientCredentialWrites` as a total no-op, the delete/revoke order reversed, the
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
import type { BaseEntityResult, EntityTransactionScope, UserInfo } from '@memberjunction/core';
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
 * each `super.Save()` and read back by the hook's `RunView`. Two instances of the SAME row share
 * it, which is what lets a test stage a stale copy and a concurrent writer. Reset per test.
 */
const store = new Map<string, RecordedSave>();
/** What the hook's read of the store answers with; `'fail'` makes it report a failed RunView. */
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
  CloseAt: Date | null;
  IsSaved: boolean;
  ContextCurrentUser: UserInfo | undefined;
  LatestResult: { CompleteMessage: string } | null;
  ProviderToUse: FakeProvider;
  RegisterResultHistoryEntry(result: BaseEntityResult): void;
  fields: Map<string, FakeField>;
  saves: RecordedSave[];
  events: string[];
  saveResult: boolean;
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
  class FakeRunView {
    async RunView(params: { ExtraFilter?: string }) {
      if (storeRead === 'fail') {
        return { Success: false, ErrorMessage: 'read refused', Results: [] };
      }
      const id = /ID='([^']+)'/.exec(params.ExtraFilter ?? '')?.[1] ?? '';
      const row = store.get(id);
      return { Success: true, Results: row ? [{ ...row }] : [] };
    }
  }
  return { ...actual, BaseEntity: class {}, LogError: vi.fn(), LogStatus: vi.fn(), RunView: FakeRunView };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  // Only the generated base is faked; the SQL-literal helper the hook's store read uses is real.
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  class FakeDistributionBase implements FakeBaseShape {
    ID = 'dist-1';
    ChannelType: FakeBaseShape['ChannelType'] = 'PublicLink';
    Status: FakeBaseShape['Status'] = 'Active';
    IsActive = true;
    MagicLinkInviteID: string | null = null;
    PublicLinkToken: string | null = null;
    CloseAt: Date | null = null;
    IsSaved = true;
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
    };
    RegisterResultHistoryEntry(result: BaseEntityResult): void {
      this.LatestResult = { CompleteMessage: result.Message };
    }
    fields = new Map<string, FakeField>();
    saves: RecordedSave[] = [];
    events: string[] = [];
    saveResult = true;
    deleteResult = true;
    GetFieldByName(name: string): FakeField | undefined {
      return this.fields.get(name);
    }
    async Save(): Promise<boolean> {
      this.events.push('save');
      const written = { MagicLinkInviteID: this.MagicLinkInviteID, PublicLinkToken: this.PublicLinkToken };
      this.saves.push(written);
      if (this.saveResult) {
        store.set(this.ID, written);
      }
      return this.saveResult;
    }
    async Delete(): Promise<boolean> {
      this.events.push('delete');
      return this.deleteResult;
    }
  }
  return { quoteSqlString: actual.quoteSqlString, mjBizAppsFormsFormDistributionEntity: FakeDistributionBase };
});

const { FormDistributionEntityServer } = await import('../FormDistributionEntityServer.js');
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
}

function minterLoggingTo(
  events: string[],
  revoke: InviteWriteResult = { success: true, changed: true },
): RecordingMinter {
  const mint: MintAnonymousInviteResult = { success: true, inviteId: 'invite-new', rawToken: 'mj_ml_new' };
  const mints: MintAnonymousInviteParams[] = [];
  const revokes: AnonymousCredentialRef[] = [];
  const revokeHosts: (InviteWriteHost | undefined)[] = [];
  return {
    mints,
    revokes,
    revokeHosts,
    MintAnonymousInvite: async (params) => {
      events.push('mint');
      mints.push(params);
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
    expect(s.events).toEqual(['save', 'revoke', 'mint', 'save']);
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
    expect(store.get('dist-1')).toEqual({ MagicLinkInviteID: 'invite-new', PublicLinkToken: 'mj_ml_new' });
  });

  it('when the store cannot be read, saves on the loaded values and says so rather than refusing the save', async () => {
    storeRead = 'fail';
    const s = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));

    expect(await s.Save()).toBe(true);
    expect(s.saves[0]).toEqual({ MagicLinkInviteID: 'invite-live', PublicLinkToken: 'mj_ml_live' });
    const { LogError } = await import('@memberjunction/core');
    expect(vi.mocked(LogError).mock.calls.flat().join('\n')).toMatch(/read refused/);
  });
});

describe('two writers of one row take turns (behaviour)', () => {
  it('a save that arrives mid-rotation waits for it, then adopts the new pair: ONE mint, not two', async () => {
    // The persisted reissue request — invite linked, token cleared — is "work owed" to anyone who
    // reads it. Without serialisation a concurrent save read it too, revoked the (already revoked)
    // invite, minted a second replacement, and whichever persist landed last left the other invite
    // Active with nothing referencing it: the orphan bizapps-forms#104 exists to remove.
    store.set('dist-1', { MagicLinkInviteID: 'invite-live', PublicLinkToken: 'mj_ml_live' });
    let releaseMint!: () => void;
    const mintGate = new Promise<void>((resolve) => {
      releaseMint = resolve;
    });
    const events: string[] = [];
    const minter = minterLoggingTo(events);
    const gated: RecordingMinter = {
      ...minter,
      MintAnonymousInvite: async (params, user) => {
        await mintGate;
        return minter.MintAnonymousInvite(params, user);
      },
    };
    MagicLinkMinterRegistry.Instance.Register(gated);

    const rotating = withLiveCredential(subject());
    rotating.events = events;
    rotating.fields.set('PublicLinkToken', { Dirty: true, OldValue: 'mj_ml_live', Value: null });
    rotating.PublicLinkToken = null;

    // A public submission bumping ResponseCount, say, whose load fell between the rotation's first
    // save and its persist — so it holds exactly the "work owed" state the first writer is servicing.
    const concurrent = subject();
    concurrent.MagicLinkInviteID = 'invite-live';
    concurrent.PublicLinkToken = null;
    concurrent.events = events;

    const first = rotating.Save();
    await new Promise((resolve) => setImmediate(resolve)); // let it reach the mint and block there
    const second = concurrent.Save();
    await new Promise((resolve) => setImmediate(resolve));
    releaseMint();
    expect(await Promise.all([first, second])).toEqual([true, true]);

    expect(minter.mints).toHaveLength(1);
    expect(store.get('dist-1')).toEqual({ MagicLinkInviteID: 'invite-new', PublicLinkToken: 'mj_ml_new' });
    expect(concurrent.saves).toEqual([{ MagicLinkInviteID: 'invite-new', PublicLinkToken: 'mj_ml_new' }]);
  });

  it('a save on a DIFFERENT row does not wait', async () => {
    let releaseMint!: () => void;
    const mintGate = new Promise<void>((resolve) => {
      releaseMint = resolve;
    });
    const events: string[] = [];
    const minter = minterLoggingTo(events);
    MagicLinkMinterRegistry.Instance.Register({
      ...minter,
      MintAnonymousInvite: async (params, user) => {
        await mintGate;
        return minter.MintAnonymousInvite(params, user);
      },
    });
    const blocked = subject(); // no credential: mints, and blocks at the gate
    const other = subject();
    other.ID = 'dist-2';
    other.ChannelType = 'Email'; // nothing to mint, so its save should complete outright

    const first = blocked.Save();
    await new Promise((resolve) => setImmediate(resolve));
    let otherDone = false;
    const second = other.Save().then(() => {
      otherDone = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(otherDone).toBe(true);
    releaseMint();
    await Promise.all([first, second]);
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
    expect(s.events).toEqual(['save', 'mint']);
    // A second save must reach provisioning again; with the guard wedged it would return early
    // after super.Save and never call the minter.
    s.events.length = 0;
    await s.Save();
    expect(s.events).toEqual(['save', 'mint']);
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
