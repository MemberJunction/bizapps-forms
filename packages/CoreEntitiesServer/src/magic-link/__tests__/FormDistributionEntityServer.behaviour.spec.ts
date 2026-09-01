/**
 * BEHAVIOURAL tests for the credential lifecycle hook — the class runs, over a fake base.
 *
 * The sibling `FormDistributionEntityServer.spec.ts` reads the source. A round-four review ran
 * mutation testing against that file and found the guards it exists for can be deleted outright
 * with the suite green: `refuseClientCredentialWrites` as a total no-op, the delete/revoke
 * order reversed, the re-entrancy check removed. Source-text assertions test presence and
 * position; they cannot test a condition or a sequence. These can.
 *
 * The technique is the one `MagicLinkInviteMinter.spec.ts` already uses: mock the modules that
 * need MJ metadata, and let the real subclass run over a controllable base. `@RegisterClass`
 * becomes a no-op decorator; the generated `mjBizAppsFormsFormDistributionEntity` becomes a
 * class with plain fields, a recorded `Save`/`Delete`, and a `GetFieldByName` the test drives.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
  IAnonymousMagicLinkMinter,
  InviteWriteResult,
  MintAnonymousInviteResult,
} from '../minter.js';

/** One recorded save: the credential pair as it stood when `super.Save()` ran. */
interface RecordedSave {
  MagicLinkInviteID: string | null;
  PublicLinkToken: string | null;
}

/** A dirty-tracking field as `BaseEntity.GetFieldByName` returns it. */
interface FakeField {
  Dirty: boolean;
  OldValue: string | null;
  Value: string | null;
}

/** What every test drives on the fake base. Declared once so the mock and the tests agree. */
interface FakeBaseShape {
  ID: string;
  ChannelType: 'Email' | 'Embed' | 'PublicLink' | 'QR';
  Status: 'Draft' | 'Active' | 'Paused' | 'Closed';
  IsActive: boolean;
  MagicLinkInviteID: string | null;
  PublicLinkToken: string | null;
  CloseAt: Date | null;
  IsSaved: boolean;
  ContextCurrentUser: UserInfo | undefined;
  LatestResult: { CompleteMessage: string } | null;
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
  return { ...actual, BaseEntity: class {}, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@mj-biz-apps/forms-entities', () => {
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
      this.saves.push({ MagicLinkInviteID: this.MagicLinkInviteID, PublicLinkToken: this.PublicLinkToken });
      return this.saveResult;
    }
    async Delete(): Promise<boolean> {
      this.events.push('delete');
      return this.deleteResult;
    }
  }
  return { mjBizAppsFormsFormDistributionEntity: FakeDistributionBase };
});

const { FormDistributionEntityServer } = await import('../FormDistributionEntityServer.js');
const { MagicLinkMinterRegistry } = await import('../minter.js');

/** The subclass under test, seen through the fake base's controls. */
type Subject = InstanceType<typeof FormDistributionEntityServer> & FakeBaseShape;

function subject(): Subject {
  return new FormDistributionEntityServer() as unknown as Subject;
}

/** A minter that records the order it is called in on the same `events` log as the base. */
function minterLoggingTo(
  events: string[],
  revoke: InviteWriteResult = { success: true, changed: true },
): IAnonymousMagicLinkMinter {
  const mint: MintAnonymousInviteResult = { success: true, inviteId: 'invite-new', rawToken: 'mj_ml_new' };
  return {
    MintAnonymousInvite: async () => {
      events.push('mint');
      return mint;
    },
    RevokeAnonymousInvite: async () => {
      events.push('revoke');
      return revoke;
    },
    SetAnonymousInviteExpiry: async () => ({ success: true, changed: false }),
  };
}

beforeEach(() => {
  delete process.env.FORMS_MAGICLINK_CHANNELS;
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
  it('deletes FIRST and revokes only after the delete succeeded', async () => {
    const s = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    expect(await s.Delete()).toBe(true);
    expect(s.events).toEqual(['delete', 'revoke']);
  });

  it('does not revoke when the delete was refused — a bounced delete must not kill a live credential', async () => {
    const s = withLiveCredential(subject());
    s.deleteResult = false;
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    expect(await s.Delete()).toBe(false);
    expect(s.events).toEqual(['delete']);
  });
});
