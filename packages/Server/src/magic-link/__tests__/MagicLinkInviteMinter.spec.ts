/**
 * Tests for the concrete minter. `@memberjunction/server` and `@memberjunction/core`
 * are mocked so the minter can be exercised without a DB or a live MJ config
 * (importing the real server module validates DB env at load time).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

/** Mutable mock state the tests drive. */
const mockState: {
  magicLinkEnabled: boolean;
  applications: { ID: string; Name: string }[];
  roles: { ID: string; Name: string }[];
  resourceTypeRows: { ID: string; EntityID: string }[];
  entityByName: Record<string, { ID: string } | null>;
  saveSucceeds: boolean;
  lastSavedInvite?: Record<string, unknown>;
  /** Whether `Load(id)` finds the invite row (revoke / re-bound paths). */
  loadSucceeds: boolean;
  /** The Status a loaded invite starts at (revoke / re-bound paths). */
  loadedStatus: string;
  /** The ExpiresAt a loaded invite starts at (re-bound path). */
  loadedExpiresAt: Date;
  /** Ids passed to `Load` (revoke / re-bound paths). */
  loadedIds: string[];
  /** How the existence probe behind a failed `Load` answers. */
  existenceProbe: { Success: boolean; TotalRowCount: number; ErrorMessage?: string };
} = {
  magicLinkEnabled: true,
  applications: [{ ID: 'app-forms', Name: 'Forms' }],
  roles: [{ ID: 'role-respondent', Name: 'Form Respondent' }],
  resourceTypeRows: [],
  entityByName: {},
  saveSucceeds: true,
  lastSavedInvite: undefined,
  loadSucceeds: true,
  loadedStatus: 'Active',
  loadedExpiresAt: new Date('9999-12-31T00:00:00.000Z'),
  loadedIds: [],
  existenceProbe: { Success: true, TotalRowCount: 0 },
};

vi.mock('@memberjunction/server', () => ({
  get configInfo() {
    return { magicLink: { enabled: mockState.magicLinkEnabled } };
  },
}));

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class FakeMetadata {
    get Applications() {
      return mockState.applications;
    }
    get Roles() {
      return mockState.roles;
    }
    EntityByName(name: string) {
      return mockState.entityByName[name] ?? null;
    }
    async GetEntityObject() {
      const values: Record<string, unknown> = {};
      return new Proxy(
        {
          ID: 'invite-new',
          LatestResult: { CompleteMessage: 'forced failure' },
          NewRecord: () => true,
          Load: async (id: string) => {
            mockState.loadedIds.push(id);
            if (!mockState.loadSucceeds) return false;
            values.Status = mockState.loadedStatus;
            values.ExpiresAt = mockState.loadedExpiresAt;
            return true;
          },
          Save: async () => {
            if (!mockState.saveSucceeds) return false;
            mockState.lastSavedInvite = { ...values };
            return true;
          },
        },
        {
          set(target, prop: string, value) {
            if (prop in target) Reflect.set(target, prop, value);
            values[prop] = value;
            return true;
          },
          get(target, prop: string) {
            return prop in target ? Reflect.get(target, prop) : values[prop];
          },
        },
      );
    }
  }
  class FakeRunView {
    async RunView(params: { EntityName: string }) {
      // Two different reads share this fake: the resource-type lookup on the mint path,
      // and the "does this invite row still exist?" probe behind a failed Load.
      if (params.EntityName === 'MJ: Magic Link Invites') {
        return mockState.existenceProbe;
      }
      return { Success: true, Results: mockState.resourceTypeRows, RowCount: mockState.resourceTypeRows.length };
    }
  }
  return { ...actual, Metadata: FakeMetadata, RunView: FakeRunView };
});

// Import AFTER mocks are registered.
const { MagicLinkInviteMinter } = await import('../MagicLinkInviteMinter.js');

const contextUser = { ID: 'staff-1', Name: 'Staff' } as unknown as UserInfo;

function params() {
  return {
    applicationName: 'Forms',
    roleName: 'Form Respondent',
    resourceTypeName: 'MJ_BizApps_Forms: Form Distributions',
    resourceId: 'dist-42',
    maxUses: 1_000_000,
    expiresAt: null,
  };
}

describe('MagicLinkInviteMinter', () => {
  beforeEach(() => {
    mockState.magicLinkEnabled = true;
    mockState.applications = [{ ID: 'app-forms', Name: 'Forms' }];
    mockState.roles = [{ ID: 'role-respondent', Name: 'Form Respondent' }];
    mockState.resourceTypeRows = [];
    mockState.entityByName = {};
    mockState.saveSucceeds = true;
    mockState.lastSavedInvite = undefined;
    mockState.loadSucceeds = true;
    mockState.loadedStatus = 'Active';
    mockState.loadedExpiresAt = new Date('9999-12-31T00:00:00.000Z');
    mockState.loadedIds = [];
    mockState.existenceProbe = { Success: true, TotalRowCount: 0 };
  });

  it('gracefully skips (no throw) when core magicLink is not enabled', async () => {
    mockState.magicLinkEnabled = false;
    const result = await new MagicLinkInviteMinter().MintAnonymousInvite(params(), contextUser);
    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.message).toMatch(/magicLink/i);
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('mints an anonymous resource-share invite with the expected fields', async () => {
    mockState.entityByName['MJ_BizApps_Forms: Form Distributions'] = { ID: 'entity-dist' };
    const result = await new MagicLinkInviteMinter().MintAnonymousInvite(params(), contextUser);

    expect(result.success).toBe(true);
    expect(result.inviteId).toBe('invite-new');
    // The RAW token travels back in the result (for FormDistribution.PublicLinkToken)...
    expect(typeof result.rawToken).toBe('string');
    expect(result.rawToken).toMatch(/^mj_ml_/);
    const saved = mockState.lastSavedInvite!;
    // ...but the invite row persists ONLY the hash, never the raw token.
    expect(saved.rawToken).toBeUndefined();
    expect(result.rawToken).not.toBe(saved.TokenHash);
    expect(saved.IdentityMode).toBe('anonymous');
    expect(saved.Kind).toBe('resource-share');
    expect(saved.ApplicationID).toBe('app-forms');
    expect(saved.RoleID).toBe('role-respondent');
    expect(saved.ResourceID).toBe('dist-42');
    expect(saved.MaxUses).toBe(1_000_000);
    expect(saved.UseCount).toBe(0);
    expect(saved.Status).toBe('Active');
    expect(saved.CreatedByUserID).toBe('staff-1');
    expect(typeof saved.TokenHash).toBe('string');
    expect((saved.TokenHash as string).length).toBeGreaterThan(0);
    // No resource-type row configured => ResourceTypeID left unset.
    expect(saved.ResourceTypeID).toBeUndefined();
  });

  it('sets ResourceTypeID when a matching resource type exists', async () => {
    mockState.entityByName['MJ_BizApps_Forms: Form Distributions'] = { ID: 'entity-dist' };
    mockState.resourceTypeRows = [{ ID: 'rt-1', EntityID: 'entity-dist' }];
    await new MagicLinkInviteMinter().MintAnonymousInvite(params(), contextUser);
    expect(mockState.lastSavedInvite!.ResourceTypeID).toBe('rt-1');
  });

  it('skips when the restricted role is not seeded/grantable', async () => {
    mockState.roles = [];
    const result = await new MagicLinkInviteMinter().MintAnonymousInvite(params(), contextUser);
    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.message).toMatch(/role/i);
  });

  it('fails (not skip) when the Application is not found', async () => {
    mockState.applications = [];
    const result = await new MagicLinkInviteMinter().MintAnonymousInvite(params(), contextUser);
    expect(result.success).toBe(false);
    expect(result.skipped).toBeUndefined();
    expect(result.message).toMatch(/Application/i);
  });

  it('reports a save failure with the entity message', async () => {
    mockState.entityByName['MJ_BizApps_Forms: Form Distributions'] = { ID: 'entity-dist' };
    mockState.saveSucceeds = false;
    const result = await new MagicLinkInviteMinter().MintAnonymousInvite(params(), contextUser);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/forced failure/);
  });

  it('uses a supplied expiry verbatim', async () => {
    mockState.entityByName['MJ_BizApps_Forms: Form Distributions'] = { ID: 'entity-dist' };
    const closeAt = new Date('2027-01-01T00:00:00.000Z');
    await new MagicLinkInviteMinter().MintAnonymousInvite({ ...params(), expiresAt: closeAt }, contextUser);
    expect(mockState.lastSavedInvite!.ExpiresAt).toBe(closeAt);
  });
});

describe('MagicLinkInviteMinter.RevokeAnonymousInvite', () => {
  beforeEach(() => {
    mockState.magicLinkEnabled = true;
    mockState.saveSucceeds = true;
    mockState.lastSavedInvite = undefined;
    mockState.loadSucceeds = true;
    mockState.loadedStatus = 'Active';
    mockState.loadedExpiresAt = new Date('9999-12-31T00:00:00.000Z');
    mockState.loadedIds = [];
    mockState.existenceProbe = { Success: true, TotalRowCount: 0 };
  });

  it("writes core's own revocation status onto the invite", async () => {
    // `Status='Revoked'` is MJ's shipped revocation mechanism, not an invention here:
    // `evaluateInvite` rejects it with errorCode `revoked` before any other check, and
    // the atomic consume UPDATE matches only `Status='Active'`.
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite('invite-7', contextUser);
    expect(result.success).toBe(true);
    expect(mockState.loadedIds).toEqual(['invite-7']);
    expect(mockState.lastSavedInvite!.Status).toBe('Revoked');
  });

  it('revokes even when the host has magic links switched off', async () => {
    // Deliberately asymmetric with minting. "Magic links were turned off" is exactly a
    // moment when live credentials should stop being live, so the gate that skips a
    // mint must not skip a revocation.
    mockState.magicLinkEnabled = false;
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite('invite-7', contextUser);
    expect(result.success).toBe(true);
    expect(mockState.lastSavedInvite!.Status).toBe('Revoked');
  });

  it('is idempotent on an already-revoked invite, and writes nothing', async () => {
    mockState.loadedStatus = 'Revoked';
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite('invite-7', contextUser);
    expect(result.success).toBe(true);
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('treats a genuinely missing invite row as already unredeemable', async () => {
    // The caller refuses to unlink a credential it could not kill, so reporting failure
    // for a row that no longer exists would wedge the distribution permanently.
    mockState.loadSucceeds = false;
    mockState.existenceProbe = { Success: true, TotalRowCount: 0 };
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite('invite-gone', contextUser);
    expect(result).toMatchObject({ success: true, changed: false });
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('does NOT report success when the row is still there and simply would not load', async () => {
    // `Load()` returns false for a deleted row AND for a read that failed, and the two
    // want opposite answers: calling a failed read "gone" unlinks a credential that is
    // still live — the orphaned invite this whole design exists to prevent.
    mockState.loadSucceeds = false;
    mockState.existenceProbe = { Success: true, TotalRowCount: 1 };
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite('invite-7', contextUser);
    expect(result.success).toBe(false);
  });

  it('does NOT report success when it cannot even tell whether the row is there', async () => {
    mockState.loadSucceeds = false;
    mockState.existenceProbe = { Success: false, TotalRowCount: 0, ErrorMessage: 'connection reset' };
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite('invite-7', contextUser);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/connection reset/);
  });

  it('reports a save failure with the entity message, and does NOT claim success', async () => {
    mockState.saveSucceeds = false;
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite('invite-7', contextUser);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/forced failure/);
  });

  it('refuses a blank invite id rather than silently succeeding', async () => {
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite('   ', contextUser);
    expect(result.success).toBe(false);
    expect(mockState.loadedIds).toEqual([]);
  });
});

describe('MagicLinkInviteMinter.SetAnonymousInviteExpiry', () => {
  const CLOSE_AT = new Date('2026-10-01T00:00:00.000Z');
  const NO_EXPIRY = new Date('9999-12-31T00:00:00.000Z');

  beforeEach(() => {
    mockState.magicLinkEnabled = true;
    mockState.saveSucceeds = true;
    mockState.lastSavedInvite = undefined;
    mockState.loadSucceeds = true;
    mockState.loadedStatus = 'Active';
    mockState.loadedExpiresAt = NO_EXPIRY;
    mockState.loadedIds = [];
    mockState.existenceProbe = { Success: true, TotalRowCount: 0 };
  });

  it('moves a live invite onto the link closing date', async () => {
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry('invite-7', CLOSE_AT, contextUser);
    expect(result).toMatchObject({ success: true, changed: true });
    expect(mockState.lastSavedInvite!.ExpiresAt).toBe(CLOSE_AT);
  });

  it('restores the no-expiry sentinel when the closing date is cleared', async () => {
    // "Remove the expiry" in the builder produces exactly this call. Without it the
    // invite keeps expiring on the date that was just deleted.
    mockState.loadedExpiresAt = CLOSE_AT;
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry('invite-7', null, contextUser);
    expect(result.changed).toBe(true);
    expect((mockState.lastSavedInvite!.ExpiresAt as Date).toISOString()).toBe(NO_EXPIRY.toISOString());
  });

  it('writes nothing when the expiry already matches', async () => {
    // This runs after EVERY save of a live credentialled link, so the common case must
    // not touch a row. It is also why the sentinel is a fixed instant rather than
    // now-plus-a-century: a relative one never compares equal, so every save would
    // rewrite it and walk the expiry forward forever.
    mockState.loadedExpiresAt = CLOSE_AT;
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry('invite-7', CLOSE_AT, contextUser);
    expect(result).toMatchObject({ success: true, changed: false });
    expect(mockState.lastSavedInvite).toBeUndefined();

    mockState.loadedExpiresAt = NO_EXPIRY;
    const unbounded = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry('invite-7', null, contextUser);
    expect(unbounded.changed).toBe(false);
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('leaves an invite that is no longer Active exactly as it ended', async () => {
    // Revoked / Consumed / Expired each record how that credential finished, and none
    // of them is redeemable whatever ExpiresAt says, so moving it rewrites history for
    // nothing.
    for (const status of ['Revoked', 'Consumed', 'Expired']) {
      mockState.loadedStatus = status;
      mockState.lastSavedInvite = undefined;
      const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry('invite-7', CLOSE_AT, contextUser);
      expect(result, status).toMatchObject({ success: true, changed: false });
      expect(mockState.lastSavedInvite, status).toBeUndefined();
    }
  });

  it('refuses a blank invite id, and reports a save failure honestly', async () => {
    expect((await new MagicLinkInviteMinter().SetAnonymousInviteExpiry('  ', CLOSE_AT, contextUser)).success).toBe(false);
    mockState.saveSucceeds = false;
    const failed = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry('invite-7', CLOSE_AT, contextUser);
    expect(failed.success).toBe(false);
    expect(failed.message).toMatch(/forced failure/);
  });
});
