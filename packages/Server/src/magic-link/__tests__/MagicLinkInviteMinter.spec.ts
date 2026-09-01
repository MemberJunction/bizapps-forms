/**
 * Tests for the concrete minter. `@memberjunction/server` and `@memberjunction/core`
 * are mocked so the minter can be exercised without a DB or a live MJ config
 * (importing the real server module validates DB env at load time).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';

/** The distribution every invite in these tests is scoped to. */
const RESOURCE = 'dist-1';
/** How the credential is addressed now: the invite, and the resource it must belong to. */
const CRED = { inviteId: 'invite-7', resourceId: RESOURCE };

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
  /**
   * The Status a loaded invite starts at (revoke / re-bound paths).
   *
   * Derived from the entity, not re-typed: this drives the "leave a terminal invite exactly as it
   * ended" loop below, so a core status this union does not know about must red the build rather
   * than quietly go untested.
   */
  loadedStatus: MJMagicLinkInviteEntity['Status'];
  /** The ExpiresAt a loaded invite starts at (re-bound path). */
  loadedExpiresAt: Date;
  /** The instant a loaded invite was issued — the anchor a host lifetime ceiling is measured from. */
  loadedCreatedAt: Date;
  /** The resource a loaded invite is scoped to — what the ownership check compares against. */
  loadedResourceID: string;
  /** Ids passed to `Load` (revoke / re-bound paths). */
  loadedIds: string[];
  /** How the existence probe behind a failed `Load` answers. */
  existenceProbe: { Success: boolean; TotalRowCount: number; ErrorMessage?: string };
  /** `magicLink.contextUserForProvisioning`, the host's chosen writer of core's invite rows. */
  contextUserForProvisioning: string | undefined;
  /** `userHandling.contextUserForNewUserCreation`, core's own second choice for the same job. */
  contextUserForNewUserCreation: string | undefined;
  /** What `UserCache` holds. Empty means no provisioning identity resolves at all. */
  cachedUsers: UserInfo[];
  /** Context users handed to `GetEntityObject`, in call order — the subject of bizapps-forms#114. */
  entityUsers: (UserInfo | undefined)[];
  /** Context users handed to `RunView`, in call order. The reads need the same rights as the writes. */
  readUsers: (UserInfo | undefined)[];
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
  loadedCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
  loadedResourceID: 'dist-1',
  loadedIds: [],
  existenceProbe: { Success: true, TotalRowCount: 0 },
  contextUserForProvisioning: undefined,
  contextUserForNewUserCreation: undefined,
  cachedUsers: [],
  entityUsers: [],
  readUsers: [],
};

vi.mock('@memberjunction/server', () => ({
  get configInfo() {
    return {
      magicLink: {
        enabled: mockState.magicLinkEnabled,
        contextUserForProvisioning: mockState.contextUserForProvisioning,
      },
      userHandling: { contextUserForNewUserCreation: mockState.contextUserForNewUserCreation },
    };
  },
}));

/**
 * `UserCache` shaped the way MJ core's own `MagicLinkService.resolveProvisioningContextUser`
 * reaches it — `Instance.UserByName` for the configured name, the static `Users` for the Owner
 * fallback. Both spellings are core's, and the minter follows core deliberately, so the fake
 * offers both rather than the one that happens to be convenient here.
 */
vi.mock('@memberjunction/generic-database-provider', () => {
  const byName = (name: string) =>
    mockState.cachedUsers.find((u) => (u.Name ?? '').trim().toLowerCase() === name.trim().toLowerCase());
  return {
    UserCache: {
      get Instance() {
        return { UserByName: byName, Users: mockState.cachedUsers };
      },
      get Users() {
        return mockState.cachedUsers;
      },
    },
  };
});

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
    async GetEntityObject(_entityName: string, user?: UserInfo) {
      mockState.entityUsers.push(user);
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
            values.__mj_CreatedAt = mockState.loadedCreatedAt;
            values.ResourceID = mockState.loadedResourceID;
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
    async RunView(params: { EntityName: string }, user?: UserInfo) {
      mockState.readUsers.push(user);
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

/**
 * The provisioning-principal state, reset for EVERY test in this file rather than in each of the
 * four `describe` blocks' own hooks. Which user writes the invite row is a property of all three
 * operations, so a per-block copy would be four chances for one to drift out of step.
 */
beforeEach(() => {
  mockState.contextUserForProvisioning = undefined;
  mockState.contextUserForNewUserCreation = undefined;
  mockState.cachedUsers = [];
  mockState.entityUsers = [];
  mockState.readUsers = [];
});

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
    mockState.loadedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    mockState.loadedResourceID = RESOURCE;
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
    mockState.loadedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    mockState.loadedResourceID = RESOURCE;
    mockState.existenceProbe = { Success: true, TotalRowCount: 0 };
  });

  it("writes core's own revocation status onto the invite", async () => {
    // `Status='Revoked'` is MJ's shipped revocation mechanism, not an invention here:
    // `evaluateInvite` rejects it with errorCode `revoked` before any other check, and
    // the atomic consume UPDATE matches only `Status='Active'`.
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
    expect(result.success).toBe(true);
    expect(mockState.loadedIds).toEqual(['invite-7']);
    expect(mockState.lastSavedInvite!.Status).toBe('Revoked');
  });

  it('revokes even when the host has magic links switched off', async () => {
    // Deliberately asymmetric with minting. "Magic links were turned off" is exactly a
    // moment when live credentials should stop being live, so the gate that skips a
    // mint must not skip a revocation.
    mockState.magicLinkEnabled = false;
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
    expect(result.success).toBe(true);
    expect(mockState.lastSavedInvite!.Status).toBe('Revoked');
  });

  it.each(['Consumed', 'Expired'] as const)(
    'leaves a %s invite exactly as it ended — a terminal status is already unredeemable',
    async (status) => {
      // The migration refuses to overwrite these ("would claim an operator action that never
      // happened") and `SetAnonymousInviteExpiry` refuses too. This method was the odd one out.
      mockState.loadedStatus = status;
      const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
      expect(result).toMatchObject({ success: true, changed: false });
      expect(mockState.lastSavedInvite).toBeUndefined();
    },
  );

  it('is idempotent on an already-revoked invite, and writes nothing', async () => {
    mockState.loadedStatus = 'Revoked';
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
    expect(result.success).toBe(true);
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('treats a genuinely missing invite row as already unredeemable', async () => {
    // The caller refuses to unlink a credential it could not kill, so reporting failure
    // for a row that no longer exists would wedge the distribution permanently.
    mockState.loadSucceeds = false;
    mockState.existenceProbe = { Success: true, TotalRowCount: 0 };
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite({ inviteId: 'invite-gone', resourceId: RESOURCE }, contextUser);
    expect(result).toMatchObject({ success: true, changed: false });
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('does NOT report success when the row is still there and simply would not load', async () => {
    // `Load()` returns false for a deleted row AND for a read that failed, and the two
    // want opposite answers: calling a failed read "gone" unlinks a credential that is
    // still live — the orphaned invite this whole design exists to prevent.
    mockState.loadSucceeds = false;
    mockState.existenceProbe = { Success: true, TotalRowCount: 1 };
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
    expect(result.success).toBe(false);
  });

  it('does NOT report success when it cannot even tell whether the row is there', async () => {
    mockState.loadSucceeds = false;
    mockState.existenceProbe = { Success: false, TotalRowCount: 0, ErrorMessage: 'connection reset' };
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/connection reset/);
  });

  it('reports a save failure with the entity message, and does NOT claim success', async () => {
    mockState.saveSucceeds = false;
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/forced failure/);
  });

  it('refuses a blank invite id rather than silently succeeding', async () => {
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(
      { inviteId: '   ', resourceId: RESOURCE },
      contextUser,
    );
    expect(result.success).toBe(false);
    expect(mockState.loadedIds).toEqual([]);
  });
});

describe('MagicLinkInviteMinter.SetAnonymousInviteExpiry', () => {
  const CLOSE_AT = new Date('2026-10-01T00:00:00.000Z');
  const NO_EXPIRY = new Date('9999-12-31T00:00:00.000Z');
  /** When the credential under test was issued — what a host lifetime ceiling is measured from. */
  const ISSUED_AT = new Date('2026-01-01T00:00:00.000Z');

  beforeEach(() => {
    mockState.magicLinkEnabled = true;
    mockState.saveSucceeds = true;
    mockState.lastSavedInvite = undefined;
    mockState.loadSucceeds = true;
    mockState.loadedStatus = 'Active';
    mockState.loadedExpiresAt = NO_EXPIRY;
    mockState.loadedCreatedAt = ISSUED_AT;
    mockState.loadedIds = [];
    mockState.loadedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    mockState.loadedResourceID = RESOURCE;
    mockState.existenceProbe = { Success: true, TotalRowCount: 0 };
  });

  it('moves a live invite onto the link closing date', async () => {
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(CRED, { closeAt: CLOSE_AT, maxLifetimeHours: undefined }, contextUser);
    expect(result).toMatchObject({ success: true, changed: true });
    expect(mockState.lastSavedInvite!.ExpiresAt).toBe(CLOSE_AT);
  });

  it('restores the no-expiry sentinel when the closing date is cleared', async () => {
    // "Remove the expiry" in the builder produces exactly this call. Without it the
    // invite keeps expiring on the date that was just deleted.
    mockState.loadedExpiresAt = CLOSE_AT;
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(CRED, { closeAt: null, maxLifetimeHours: undefined }, contextUser);
    expect(result.changed).toBe(true);
    expect((mockState.lastSavedInvite!.ExpiresAt as Date).toISOString()).toBe(NO_EXPIRY.toISOString());
  });

  it('treats a stored expiry that arrives as an ISO string as the same instant, not as "different"', async () => {
    // `asInstant` two functions up handles "a value the store may hand back as a Date or as a
    // string". `sameInstant` did not, so a string would never compare equal, the row would be
    // rewritten on every save, and the expiry would "walk forward forever" in a new guise. The
    // cast models the store's behaviour the production code documents: the type lies here.
    mockState.loadedExpiresAt = '2026-10-01T00:00:00.000Z' as unknown as Date;
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(
      CRED,
      { closeAt: new Date('2026-10-01T00:00:00.000Z'), maxLifetimeHours: undefined },
      contextUser,
    );
    expect(result).toMatchObject({ success: true, changed: false });
  });

  it('writes nothing when the expiry already matches', async () => {
    // This runs after EVERY save of a live credentialled link, so the common case must
    // not touch a row. It is also why the sentinel is a fixed instant rather than
    // now-plus-a-century: a relative one never compares equal, so every save would
    // rewrite it and walk the expiry forward forever.
    mockState.loadedExpiresAt = CLOSE_AT;
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(CRED, { closeAt: CLOSE_AT, maxLifetimeHours: undefined }, contextUser);
    expect(result).toMatchObject({ success: true, changed: false });
    expect(mockState.lastSavedInvite).toBeUndefined();

    mockState.loadedExpiresAt = NO_EXPIRY;
    const unbounded = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(CRED, { closeAt: null, maxLifetimeHours: undefined }, contextUser);
    expect(unbounded.changed).toBe(false);
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('leaves an invite that is no longer Active exactly as it ended', async () => {
    // Revoked / Consumed / Expired each record how that credential finished, and none
    // of them is redeemable whatever ExpiresAt says, so moving it rewrites history for
    // nothing.
    for (const status of ['Revoked', 'Consumed', 'Expired'] as const) {
      mockState.loadedStatus = status;
      mockState.lastSavedInvite = undefined;
      const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(CRED, { closeAt: CLOSE_AT, maxLifetimeHours: undefined }, contextUser);
      expect(result, status).toMatchObject({ success: true, changed: false });
      expect(mockState.lastSavedInvite, status).toBeUndefined();
    }
  });

  it('measures a host lifetime ceiling from the invite\'s ISSUE time, not from now', async () => {
    // The same lesson as the sentinel two tests up, applied to the other bound.
    // `FORMS_MAGICLINK_EXPIRY_HOURS` bounds how long a CREDENTIAL may live, so its anchor is
    // the instant that credential was issued — a fact about this row. Anchored to `now` it is
    // a different instant on every call, so this pass (which runs after EVERY save of a live
    // link, including every completed public submission) rewrites the row every time and walks
    // the expiry forward forever. A ceiling a host set in order to bound the credential would
    // then never bound anything — the very "credential outlives what it authorises" shape this
    // work exists to remove.
    mockState.loadedExpiresAt = new Date('2026-01-02T00:00:00.000Z'); // ISSUED_AT + 24h
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(
      CRED,
      { closeAt: null, maxLifetimeHours: 24 },
      contextUser,
    );
    expect(result).toMatchObject({ success: true, changed: false });
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('takes the EARLIER of the closing date and the issue-anchored ceiling', async () => {
    // Both are upper bounds, so the earlier wins — the combination `resolveExpiry` already
    // owns. Proving it here is what keeps the resolution in one place now that the anchor
    // (and therefore the resolution) has to happen where the invite row is.
    mockState.loadedExpiresAt = NO_EXPIRY;
    await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(
      CRED,
      { closeAt: CLOSE_AT, maxLifetimeHours: 24 }, // ceiling lands 2026-01-02, well before CLOSE_AT
      contextUser,
    );
    expect((mockState.lastSavedInvite!.ExpiresAt as Date).toISOString()).toBe('2026-01-02T00:00:00.000Z');

    mockState.lastSavedInvite = undefined;
    mockState.loadedExpiresAt = NO_EXPIRY;
    await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(
      CRED,
      { closeAt: new Date('2026-01-01T12:00:00.000Z'), maxLifetimeHours: 24 },
      contextUser,
    );
    expect((mockState.lastSavedInvite!.ExpiresAt as Date).toISOString()).toBe('2026-01-01T12:00:00.000Z');
  });

  it('refuses to guess a ceiling it has no issue time to anchor, rather than anchoring it to now', async () => {
    // `__mj_CreatedAt` is NOT NULL, so this is a "cannot happen" — guarded anyway because the
    // fallback that suggests itself (anchor to `now`) is precisely the defect above, and it
    // would reappear silently. Reported as a failure so the next save retries it.
    mockState.loadedCreatedAt = new Date('nonsense');
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(
      CRED,
      { closeAt: null, maxLifetimeHours: 24 },
      contextUser,
    );
    expect(result.success).toBe(false);
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('refuses a blank invite id, and reports a save failure honestly', async () => {
    expect((await new MagicLinkInviteMinter().SetAnonymousInviteExpiry({ inviteId: '  ', resourceId: RESOURCE }, { closeAt: CLOSE_AT, maxLifetimeHours: undefined }, contextUser)).success).toBe(false);
    mockState.saveSucceeds = false;
    const failed = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(CRED, { closeAt: CLOSE_AT, maxLifetimeHours: undefined }, contextUser);
    expect(failed.success).toBe(false);
    expect(failed.message).toMatch(/forced failure/);
  });
});

describe('MagicLinkInviteMinter — the credential must belong to the link acting on it', () => {
  beforeEach(() => {
    mockState.magicLinkEnabled = true;
    mockState.saveSucceeds = true;
    mockState.lastSavedInvite = undefined;
    mockState.loadSucceeds = true;
    mockState.loadedStatus = 'Active';
    mockState.loadedExpiresAt = new Date('9999-12-31T00:00:00.000Z');
    mockState.loadedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    mockState.loadedResourceID = RESOURCE;
    mockState.loadedIds = [];
    mockState.existenceProbe = { Success: true, TotalRowCount: 0 };
  });

  it('refuses to revoke an invite scoped to another distribution, and says so', async () => {
    // `FormDistribution.MagicLinkInviteID` has no foreign key and rides the generated GraphQL
    // update input, and these writes run under the elevated system user on the public submit
    // path — so without this an id pointing at somebody else's invite revokes THEIR live
    // credential on the next save of yours. The mint already recorded the scope; this reads it.
    mockState.loadedResourceID = 'someone-elses-distribution';
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
    expect(result.success).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/scoped to resource/);
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('refuses to re-bound the expiry of an invite scoped to another distribution', async () => {
    mockState.loadedResourceID = 'someone-elses-distribution';
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(
      CRED,
      { closeAt: new Date('2026-10-01T00:00:00.000Z'), maxLifetimeHours: undefined },
      contextUser,
    );
    expect(result.success).toBe(false);
    expect(mockState.lastSavedInvite).toBeUndefined();
  });

  it('marks an ownership refusal as REFUSED, so the caller can tell it from a failure a retry will fix', async () => {
    // `success: false` alone reads as "try again on the next save". A foreign or NULL ResourceID
    // is refused on EVERY save, and a caller that cannot tell the two apart logs a permanent
    // condition as a transient one.
    mockState.loadedResourceID = 'someone-elses-distribution';
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
    expect(result).toMatchObject({ success: false, changed: false, refused: true });
  });

  it('reports the refusal as a FAILURE, never as a postcondition that holds', async () => {
    // The caller unlinks a credential it believes is dead. A refusal dressed as success would
    // therefore orphan a live invite belonging to another link — worse than doing nothing.
    mockState.loadedResourceID = 'someone-elses-distribution';
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
    expect(result).toMatchObject({ success: false, changed: false });
  });
});

/**
 * WHOSE rights the invite row is written with — bizapps-forms#114.
 *
 * `MJ: Magic Link Invites` is a CORE entity, and no Forms seed touches its permissions: on a stock
 * database only Developer and Integration hold Create/Read/Update on it. Every write here is
 * driven by an ordinary save of a Form Distribution, so until this existed they ran as whoever
 * saved it — a form author, whose role the HOST chooses and Forms cannot see. On the ordinary
 * least-privilege shape (full rights on the links they own, nothing on core's magic-link table)
 * `BaseEntity.Load` threw on Read before a revoke was even attempted; provisioning is fail-soft by
 * design, so the pause returned green and the token went on redeeming. Reproduced end to end in
 * `apps/MJAPI/least-privilege-credential-smoke.mjs`.
 *
 * The fix is not a wider grant. The invite is the APPLICATION's row: not one field on it comes
 * from the caller, and the caller's authority was already spent — and checked by MJ — proving they
 * may write the distribution. Requiring a second permission on an unrelated core entity is an
 * implementation detail leaking into the operator's access model, where it corresponds to no
 * decision they actually make. So the row is written under the same provisioning identity MJ
 * core's own `MagicLinkService` uses for the same table, resolved the same way and in the same
 * order.
 */
describe('MagicLinkInviteMinter — which principal writes core’s invite rows', () => {
  /** The form author: they may write the distribution, and nothing on the invite entity. */
  const author = { ID: 'staff-1', Name: 'Staff' } as unknown as UserInfo;
  /** The host's configured provisioning identity. */
  const provisioner = { ID: 'prov-1', Name: 'forms.provisioner@example.com', Type: 'User' } as unknown as UserInfo;
  /** Core's last resort, and the one this database actually has. */
  const owner = { ID: 'owner-1', Name: 'System', Type: 'Owner' } as unknown as UserInfo;

  beforeEach(() => {
    mockState.magicLinkEnabled = true;
    mockState.saveSucceeds = true;
    mockState.lastSavedInvite = undefined;
    mockState.loadSucceeds = true;
    mockState.loadedStatus = 'Active';
    mockState.loadedExpiresAt = new Date('9999-12-31T00:00:00.000Z');
    mockState.loadedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    mockState.loadedResourceID = RESOURCE;
    mockState.loadedIds = [];
    mockState.existenceProbe = { Success: true, TotalRowCount: 0 };
    mockState.cachedUsers = [provisioner, owner];
    mockState.contextUserForProvisioning = provisioner.Name;
  });

  it('mints as the configured provisioning user, never as the author', async () => {
    const result = await new MagicLinkInviteMinter().MintAnonymousInvite(params(), author);
    expect(result.success).toBe(true);
    expect(mockState.entityUsers).toEqual([provisioner]);
  });

  it('reads on the mint path as the provisioning user too', async () => {
    // The resource-type lookup needs Read on `MJ: Resource Types`, which a least-privilege author
    // also lacks. Elevating the write and leaving the read behind fixes half a code path.
    mockState.entityByName['MJ_BizApps_Forms: Form Distributions'] = { ID: 'entity-dist' };
    await new MagicLinkInviteMinter().MintAnonymousInvite(params(), author);
    expect(mockState.readUsers).toEqual([provisioner]);
  });

  it('records the AUTHOR on the row, not the principal that wrote it', async () => {
    // `CreatedByUserID` is not an authorization field, and two things depend on it staying the
    // person: it is the audit trail for who published the link, and core's redeem path fails
    // CLOSED on it — `isInviterActive` refuses every outstanding invite of a deactivated inviter.
    // Stamping the provisioning identity there would quietly retire that protection.
    await new MagicLinkInviteMinter().MintAnonymousInvite(params(), author);
    expect(mockState.lastSavedInvite!.CreatedByUserID).toBe('staff-1');
  });

  it('revokes as the provisioning user', async () => {
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, author);
    expect(result).toMatchObject({ success: true, changed: true });
    expect(mockState.entityUsers).toEqual([provisioner]);
  });

  it('re-bounds an expiry as the provisioning user', async () => {
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(
      CRED,
      { closeAt: new Date('2026-10-01T00:00:00.000Z'), maxLifetimeHours: undefined },
      author,
    );
    expect(result).toMatchObject({ success: true, changed: true });
    expect(mockState.entityUsers).toEqual([provisioner]);
  });

  it('probes a row it could not load as the provisioning user', async () => {
    // The probe decides "gone" versus "unreadable", and the whole point of that distinction is to
    // avoid unlinking a live credential. Run as an author with no Read, it can only ever answer
    // "unreadable" — which is the safe direction, but it is safe by accident and never succeeds.
    mockState.loadSucceeds = false;
    await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, author);
    expect(mockState.readUsers).toEqual([provisioner]);
  });

  it("falls back to core's new-user-creation context user when magicLink names none", async () => {
    mockState.contextUserForProvisioning = undefined;
    mockState.contextUserForNewUserCreation = provisioner.Name;
    await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, author);
    expect(mockState.entityUsers).toEqual([provisioner]);
  });

  it('falls back to an Owner when the configured name does not resolve', async () => {
    // Core logs and continues here rather than failing, because a typo in one config key must not
    // take magic links out of service. Same choice, same order — the alternative is Forms and core
    // disagreeing about who owns the table they share.
    mockState.contextUserForProvisioning = 'nobody@example.invalid';
    await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, author);
    expect(mockState.entityUsers).toEqual([owner]);
  });

  it('falls back to the CALLER when no provisioning identity resolves at all', async () => {
    // The fail-safe direction is toward LESS privilege, so the last resort is the caller's own
    // rights: on a host whose authors are Developers that is exactly today's behaviour, and on a
    // least-privilege host it fails softly as it did before. Never worse than not having this.
    //
    // Deliberately the opposite conclusion from `automation/service-principal.ts`, which refuses
    // to fall back at all — and for the same reason. There the fallback would be the SYSTEM user,
    // so falling back widens; here it is the caller, so falling back narrows.
    mockState.cachedUsers = [];
    mockState.contextUserForProvisioning = 'nobody@example.invalid';
    await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, author);
    expect(mockState.entityUsers).toEqual([author]);
  });
});
