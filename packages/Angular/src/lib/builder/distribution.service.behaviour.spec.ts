/**
 * `DistributionService` exercised as a class. It has no constructor injection, so under the
 * `@angular/compiler` side-effect import the repo already uses it constructs in this node env —
 * which the sibling source-text spec claimed it could not. The entity is a recording fake: the
 * methods under test touch only the record they are handed and `Save(options)`.
 */
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import type { EntitySaveOptions } from '@memberjunction/core';
import type { mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';
import { DistributionService } from './distribution.service';

interface FakeDistribution {
  ID: string;
  Status: string;
  IsActive: boolean;
  PublicLinkToken: string | null;
  MagicLinkInviteID: string | null;
  MaxResponses: number | null;
  LatestResult: { CompleteMessage: string } | null;
  writes: Record<string, unknown>;
  savedWith: EntitySaveOptions | undefined;
  reverted: boolean;
  Save(options?: EntitySaveOptions): Promise<boolean>;
  Revert(): boolean;
}

function fakeDistribution(overrides: Partial<FakeDistribution> = {}): FakeDistribution {
  const target: FakeDistribution = {
    ID: 'dist-1',
    Status: 'Draft',
    IsActive: false,
    PublicLinkToken: 'mj_ml_old',
    MagicLinkInviteID: 'invite-old',
    MaxResponses: null,
    LatestResult: null,
    writes: {},
    savedWith: undefined,
    reverted: false,
    async Save(options) {
      target.savedWith = options;
      return true;
    },
    Revert() {
      target.reverted = true;
      return true;
    },
    ...overrides,
  };
  return new Proxy(target, {
    set(t, prop: string, value) {
      if (prop !== 'writes' && prop !== 'savedWith' && prop !== 'reverted') t.writes[prop] = value;
      Reflect.set(t, prop, value);
      return true;
    },
  });
}

const asEntity = (d: FakeDistribution): mjBizAppsFormsFormDistributionEntity =>
  d as unknown as mjBizAppsFormsFormDistributionEntity;

describe('DistributionService — opening a link', () => {
  it('writes BOTH halves of "open to responses", and forces the save', async () => {
    // Writing only Status left a row at Status='Active', IsActive=false unchanged, Save() skipped
    // the clean record, and the control reported success having done nothing — permanently.
    const d = fakeDistribution({ Status: 'Active', IsActive: false });
    const out = await new DistributionService().open(asEntity(d));
    expect(out.ok).toBe(true);
    expect(d.writes).toMatchObject({ Status: 'Active', IsActive: true });
    expect(d.savedWith?.IgnoreDirtyState).toBe(true);
  });

  it('issueLink is the same operation as open', async () => {
    const d = fakeDistribution();
    await new DistributionService().issueLink(asEntity(d));
    expect(d.writes).toMatchObject({ Status: 'Active', IsActive: true });
    expect(d.savedWith?.IgnoreDirtyState).toBe(true);
  });
});

describe('DistributionService — reissuing', () => {
  it('clears ONLY the token; the invite id is what tells the server which credential to revoke', async () => {
    const d = fakeDistribution({ Status: 'Active', IsActive: true });
    await new DistributionService().reissueLink(asEntity(d));
    expect(d.writes).toEqual({ PublicLinkToken: null });
    expect(d.MagicLinkInviteID).toBe('invite-old');
  });
});

describe('DistributionService — a refused save', () => {
  it('reverts the record so the screen stops showing the value the database bounced', async () => {
    const d = fakeDistribution({
      Save: async () => false,
      LatestResult: { CompleteMessage: 'too big' },
    });
    const out = await new DistributionService().setMaxResponses(asEntity(d), 99_999_999);
    expect(out).toEqual({ ok: false, error: expect.stringContaining('too big') });
    expect(d.reverted).toBe(true);
  });
});
