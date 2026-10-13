/**
 * `DistributionService` exercised as a class. It has no constructor injection, so under the
 * `@angular/compiler` side-effect import the repo already uses it constructs in this node env. The
 * entity is a recording fake: the settings writes touch only the record they are handed and
 * `Save(options)`; the lifecycle verbs go through the real operation classes, with the provider
 * they route through faked.
 */
import '@angular/compiler';
import { afterEach, describe, it, expect } from 'vitest';
import type { EntitySaveOptions } from '@memberjunction/core';
import type { FormsDistributionLinkOutput, mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';
import { installFakeOperations, refused, succeeded, type FakeOperations } from '../shared/testing/fake-operations';
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

/**
 * The lifecycle verbs are Remote Operations (#303). What the builder must do is ask for the right
 * one, for the right link, and never write the credential columns or the status itself — the server
 * writes "open" as both halves, forces the save, and clears only the token on a reissue
 * (`FormDistributionEngine.spec.ts`). The record this client holds is stale afterwards by design;
 * the Distribute tab re-reads it.
 */
describe('DistributionService — the lifecycle verbs are operations', () => {
  let operations: FakeOperations | null = null;
  afterEach(() => {
    operations?.restore();
    operations = null;
  });

  const link = (status: string): FormsDistributionLinkOutput => ({
    FormDistributionID: 'dist-1',
    Slug: 'summer',
    Status: status as FormsDistributionLinkOutput['Status'],
    RespondentURL: 'https://forms.example/f/summer',
  });

  it.each([
    ['open', 'Forms.OpenDistribution', 'Active'],
    ['issueLink', 'Forms.OpenDistribution', 'Active'],
    ['close', 'Forms.CloseDistribution', 'Closed'],
    ['reissueLink', 'Forms.ReissueDistributionLink', 'Active'],
  ] as const)('%s asks %s for this link, and writes nothing to the record itself', async (verb, key, status) => {
    operations = installFakeOperations(() => succeeded(link(status)));
    const d = fakeDistribution({ Status: 'Active', IsActive: true });

    const out = await new DistributionService()[verb](asEntity(d));

    expect(out).toEqual({ ok: true });
    expect(operations.calls).toEqual([{ key, input: { FormDistributionID: 'dist-1' } }]);
    expect(d.writes).toEqual({});
    expect(d.savedWith).toBeUndefined();
    expect(d.MagicLinkInviteID).toBe('invite-old');
  });

  it('reports the server\'s refusal, naming what could not be done', async () => {
    operations = installFakeOperations(() => refused('Form f-1 is archived; restore it before opening a share link to it.'));

    const out = await new DistributionService().open(asEntity(fakeDistribution()));

    expect(out).toEqual({
      ok: false,
      error: 'Could not reopen this share link. Form f-1 is archived; restore it before opening a share link to it.',
    });
  });

  it('creates a link through Forms.IssueDistributionLink — the server picks the slug', async () => {
    operations = installFakeOperations(() => succeeded(link('Active')));

    const out = await new DistributionService().create({ formId: 'f-1', name: 'Share link 2' });

    expect(out).toEqual({ ok: true, distributionId: 'dist-1', respondentUrl: 'https://forms.example/f/summer' });
    expect(operations.calls[0]).toEqual({
      key: 'Forms.IssueDistributionLink',
      input: expect.objectContaining({ FormID: 'f-1', Name: 'Share link 2', Slug: undefined }),
    });
  });

  it('says why a link was not created', async () => {
    operations = installFakeOperations(() => refused('Form f-1 is a template; templates are never shared.'));

    const out = await new DistributionService().create({ formId: 'f-1' });

    expect(out).toEqual({ ok: false, error: 'Could not create a share link. Form f-1 is a template; templates are never shared.' });
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
