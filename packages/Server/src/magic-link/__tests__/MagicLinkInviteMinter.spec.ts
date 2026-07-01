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
} = {
  magicLinkEnabled: true,
  applications: [{ ID: 'app-forms', Name: 'Forms' }],
  roles: [{ ID: 'role-respondent', Name: 'Form Respondent' }],
  resourceTypeRows: [],
  entityByName: {},
  saveSucceeds: true,
  lastSavedInvite: undefined,
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
    async RunView() {
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
