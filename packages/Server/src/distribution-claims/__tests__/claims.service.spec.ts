import { describe, expect, it, vi } from 'vitest';
import type { EntityInfo, UserInfo } from '@memberjunction/core';
import type { DistributionClaimProvider } from '../claim-contract';
import { LogError } from '@memberjunction/core';
import { defaultClaimsServiceDeps, loadFormDistributionClaims, toClaimsResultType, type ClaimsProvider, type ClaimsServiceDeps } from '../claims.service';

vi.mock('@memberjunction/core', async (orig) => ({ ...(await orig<typeof import('@memberjunction/core')>()), LogError: vi.fn() }));

const user = { ID: 'u1' } as UserInfo;
const F1 = '11111111-1111-4111-8111-111111111111';

function makeCaliber() {
  const FindClaims = vi.fn<DistributionClaimProvider['FindClaims']>(async (slugs) =>
    slugs.map((slug) => ({ slug, ownerLabel: 'Step', respondentUrl: null })),
  );
  return { AppName: 'Caliber', FindClaims } satisfies DistributionClaimProvider;
}

function makeDeps(caliber: DistributionClaimProvider, over: Partial<ClaimsServiceDeps> = {}): ClaimsServiceDeps {
  return {
    canUpdateDistributions: () => true,
    readSlugs: async () => ({ ok: true, slugs: ['intake'] }),
    providers: () => ({ providers: [caliber], failures: [] }),
    ...over,
  };
}

describe('loadFormDistributionClaims', () => {
  it('refuses a caller who cannot update share links, before reading anything', async () => {
    const readSlugs = vi.fn<ClaimsServiceDeps['readSlugs']>();
    const deps = makeDeps(makeCaliber(), { canUpdateDistributions: () => false, readSlugs });
    await expect(loadFormDistributionClaims(deps, F1, user)).rejects.toThrow(/not allowed/i);
    expect(readSlugs).not.toHaveBeenCalled();
    expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining(F1));
  });

  it('rejects a non-GUID form id before the permission check or any read', async () => {
    const canUpdateDistributions = vi.fn<ClaimsServiceDeps['canUpdateDistributions']>(() => true);
    const readSlugs = vi.fn<ClaimsServiceDeps['readSlugs']>();
    const deps = makeDeps(makeCaliber(), { canUpdateDistributions, readSlugs });
    await expect(loadFormDistributionClaims(deps, "x' OR 1=1 --", user)).rejects.toThrow('formId must be a form ID.');
    expect(canUpdateDistributions).not.toHaveBeenCalled();
    expect(readSlugs).not.toHaveBeenCalled();
  });

  it('passes the caller and form id to the permission check and the slug read', async () => {
    const canUpdateDistributions = vi.fn<ClaimsServiceDeps['canUpdateDistributions']>(() => true);
    const readSlugs = vi.fn<ClaimsServiceDeps['readSlugs']>(async () => ({ ok: true, slugs: [] }));
    await loadFormDistributionClaims(makeDeps(makeCaliber(), { canUpdateDistributions, readSlugs }), F1, user);
    expect(canUpdateDistributions).toHaveBeenCalledWith(user);
    expect(readSlugs).toHaveBeenCalledWith(F1, user);
  });

  it('rejects a blank form id before the permission check', async () => {
    const canUpdateDistributions = vi.fn<ClaimsServiceDeps['canUpdateDistributions']>(() => true);
    await expect(loadFormDistributionClaims(makeDeps(makeCaliber(), { canUpdateDistributions }), '  ', user)).rejects.toThrow(/formId/);
    expect(canUpdateDistributions).not.toHaveBeenCalled();
  });

  it("asks providers only about this form's own slugs", async () => {
    const caliber = makeCaliber();
    const out = await loadFormDistributionClaims(makeDeps(caliber), F1, user);
    expect(caliber.FindClaims).toHaveBeenCalledWith(['intake'], user);
    expect(out.claims).toEqual([{ appName: 'Caliber', slug: 'intake', ownerLabel: 'Step', respondentUrl: null }]);
  });

  it('throws with context when the slug read fails, rather than answering "no claims"', async () => {
    const deps = makeDeps(makeCaliber(), { readSlugs: async () => ({ ok: false, error: 'timeout' }) });
    const error = await loadFormDistributionClaims(deps, F1, user).catch((e: Error) => e);
    expect((error as Error).message).toBe(`Could not read share links for form ${F1}.`);
    expect((error as Error).message).not.toContain('timeout');
    expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  });

  it('carries registry failures through to the answer', async () => {
    const deps = makeDeps(makeCaliber(), { providers: () => ({ providers: [], failures: [{ appName: 'X', message: 'bad' }] }) });
    const out = await loadFormDistributionClaims(deps, F1, user);
    expect(out.failures).toEqual([{ appName: 'X', message: 'bad' }]);
  });
});

describe('toClaimsResultType', () => {
  it('keeps a null respondentUrl as null and copies failures', () => {
    const out = toClaimsResultType({
      claims: [{ appName: 'Caliber', slug: 's', ownerLabel: 'L', respondentUrl: null }],
      failures: [{ appName: 'X', message: 'm' }],
    });
    expect(out.claims[0].respondentUrl).toBeNull();
    expect(out.claims[0]).toMatchObject({ appName: 'Caliber', slug: 's', ownerLabel: 'L' });
    expect(out.failures[0]).toMatchObject({ appName: 'X', message: 'm' });
  });
});

describe('defaultClaimsServiceDeps permission wiring', () => {
  const providerWith = (canUpdate: boolean | null): ClaimsProvider => ({
    RunView: vi.fn(),
    EntityByName: () => (canUpdate === null ? undefined : ({ GetUserPermisions: () => ({ CanUpdate: canUpdate }) } as unknown as EntityInfo)),
  });

  it('allows a caller with Update on Form Distributions', () => {
    expect(defaultClaimsServiceDeps(providerWith(true)).canUpdateDistributions(user)).toBe(true);
  });
  it('refuses a caller without it', () => {
    expect(defaultClaimsServiceDeps(providerWith(false)).canUpdateDistributions(user)).toBe(false);
  });
  it('fails closed when the entity is missing from metadata', () => {
    expect(defaultClaimsServiceDeps(providerWith(null)).canUpdateDistributions(user)).toBe(false);
  });
});
