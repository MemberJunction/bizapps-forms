import { describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { DistributionClaimProvider } from '../claim-contract';
import { loadFormDistributionClaims, toClaimsResultType, type ClaimsServiceDeps } from '../claims.service';

vi.mock('@memberjunction/core', async (orig) => ({ ...(await orig<typeof import('@memberjunction/core')>()), LogError: vi.fn() }));

const user = { ID: 'u1' } as UserInfo;

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
    await expect(loadFormDistributionClaims(deps, 'f1', user)).rejects.toThrow(/not allowed.*f1/i);
    expect(readSlugs).not.toHaveBeenCalled();
  });

  it('rejects a blank form id before the permission check', async () => {
    const canUpdateDistributions = vi.fn<ClaimsServiceDeps['canUpdateDistributions']>(() => true);
    await expect(loadFormDistributionClaims(makeDeps(makeCaliber(), { canUpdateDistributions }), '  ', user)).rejects.toThrow(/formId/);
    expect(canUpdateDistributions).not.toHaveBeenCalled();
  });

  it("asks providers only about this form's own slugs", async () => {
    const caliber = makeCaliber();
    const out = await loadFormDistributionClaims(makeDeps(caliber), 'f1', user);
    expect(caliber.FindClaims).toHaveBeenCalledWith(['intake'], user);
    expect(out.claims).toEqual([{ appName: 'Caliber', slug: 'intake', ownerLabel: 'Step', respondentUrl: null }]);
  });

  it('throws with context when the slug read fails, rather than answering "no claims"', async () => {
    const deps = makeDeps(makeCaliber(), { readSlugs: async () => ({ ok: false, error: 'timeout' }) });
    await expect(loadFormDistributionClaims(deps, 'f1', user)).rejects.toThrow(/f1.*timeout/);
  });

  it('carries registry failures through to the answer', async () => {
    const deps = makeDeps(makeCaliber(), { providers: () => ({ providers: [], failures: [{ appName: 'X', message: 'bad' }] }) });
    const out = await loadFormDistributionClaims(deps, 'f1', user);
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
