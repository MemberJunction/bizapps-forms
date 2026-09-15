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
  CaptchaRequired: boolean;
  AllowedOrigins: string | null;
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
    CaptchaRequired: false,
    AllowedOrigins: null,
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

/**
 * The captcha switch writes the column the SUBMIT gate reads.
 *
 * `submit-pipeline` stage 4 ORs this column with the form's own `settings.captchaRequired`, and
 * until #151 nothing in the builder could see or set it — the only surfaces that could were a raw
 * entity form and a direct write.
 */
describe('DistributionService — the captcha switch', () => {
  it('writes the column, and nothing else', async () => {
    const d = fakeDistribution({ CaptchaRequired: false });

    const out = await new DistributionService().setCaptchaRequired(asEntity(d), true);

    expect(out.ok).toBe(true);
    expect(d.writes).toEqual({ CaptchaRequired: true });
  });

  it('turns it back off', async () => {
    const d = fakeDistribution({ CaptchaRequired: true });

    await new DistributionService().setCaptchaRequired(asEntity(d), false);

    expect(d.writes).toEqual({ CaptchaRequired: false });
  });

  it('reports a refused save rather than claiming success', async () => {
    // Turning a captcha on is exactly the write an author must not be told succeeded when it did
    // not: they would go on believing the link is protected.
    const d = fakeDistribution({ CaptchaRequired: false });
    d.LatestResult = { CompleteMessage: 'nope' };
    d.Save = async () => false;

    const out = await new DistributionService().setCaptchaRequired(asEntity(d), true);

    expect(out.ok).toBe(false);
  });
});

/**
 * The list of sites a link may be shown on.
 *
 * The last two cases are the point of the whole feature. An author who writes `*.acme.com`, sees
 * the panel settle, and is told nothing believes they restricted something — they did not, and
 * they will not look again. So a bad entry refuses the WHOLE edit and writes nothing, rather than
 * quietly keeping the entries that happened to parse.
 */
describe('DistributionService — the sites allowed to show a link', () => {
  it('writes the normalised JSON array', async () => {
    const d = fakeDistribution({ AllowedOrigins: null });

    const out = await new DistributionService().setAllowedOrigins(
      asEntity(d),
      'HTTPS://Careers.ACME.com\nhttps://acme.com:8443',
    );

    expect(out.ok).toBe(true);
    expect(out.rejected).toEqual([]);
    expect(d.writes).toEqual({
      AllowedOrigins: '["https://careers.acme.com","https://acme.com:8443"]',
    });
  });

  it('clears the column back to NULL when the author empties the box', async () => {
    // NULL is the unrestricted state every link starts in, and the only way back to it.
    const d = fakeDistribution({ AllowedOrigins: '["https://careers.acme.com"]' });

    await new DistributionService().setAllowedOrigins(asEntity(d), '   \n  ');

    expect(d.writes).toEqual({ AllowedOrigins: null });
  });

  it('refuses a wildcard and saves NOTHING, rather than silently dropping it', async () => {
    const d = fakeDistribution({ AllowedOrigins: null });

    const out = await new DistributionService().setAllowedOrigins(asEntity(d), '*.acme.com');

    expect(out.ok).toBe(false);
    expect(out.rejected).toEqual(['*.acme.com']);
    expect(out.error).toContain('*.acme.com');
    expect(d.writes).toEqual({});
  });

  it('refuses the whole edit when only SOME entries are bad, so nothing is half-applied', async () => {
    const d = fakeDistribution({ AllowedOrigins: null });

    const out = await new DistributionService().setAllowedOrigins(
      asEntity(d),
      'https://good.example\n*.acme.com',
    );

    expect(out.rejected).toEqual(['*.acme.com']);
    expect(d.writes).toEqual({});
  });
});
