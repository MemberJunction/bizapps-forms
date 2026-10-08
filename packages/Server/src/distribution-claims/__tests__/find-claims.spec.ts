import { describe, expect, it, vi } from 'vitest';
import { LogError, type UserInfo } from '@memberjunction/core';
import { DISTRIBUTION_CLAIM_PROVIDERS_KEY, type DistributionClaimProvider } from '../claim-contract';
import { findDistributionClaims, readClaimProviders } from '../find-claims';

vi.mock('@memberjunction/core', async (orig) => ({ ...(await orig<typeof import('@memberjunction/core')>()), LogError: vi.fn() }));

const user = { ID: 'u1' } as UserInfo;
const provider = (over: Partial<DistributionClaimProvider> = {}): DistributionClaimProvider => ({
  AppName: 'Caliber',
  FindClaims: async (slugs) => slugs.filter((s) => s === 'intake').map((slug) => ({ slug, ownerLabel: 'Screen step', respondentUrl: 'https://host.example/interview?blueprint=1' })),
  ...over,
});

describe('readClaimProviders', () => {
  it('returns no providers and no failures when nothing is registered', () => {
    expect(readClaimProviders({})).toEqual({ providers: [], failures: [] });
    expect(readClaimProviders(null)).toEqual({ providers: [], failures: [] });
  });
  it('returns well-formed providers from the slot', () => {
    const p = provider();
    expect(readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: [p] }).providers).toEqual([p]);
  });
  it('reports a malformed entry instead of skipping it silently', () => {
    const out = readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: [{ AppName: 'X' }, 42] });
    expect(out.providers).toEqual([]);
    expect(out.failures).toHaveLength(2);
    expect(out.failures[0]).toEqual({ appName: 'X', message: expect.stringContaining('FindClaims') });
  });
  it('reports a slot that is not an array', () => {
    expect(readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: { AppName: 'X' } }).failures).toHaveLength(1);
  });
});

describe('findDistributionClaims', () => {
  it('attributes each claim to the app that made it', async () => {
    const out = await findDistributionClaims(['intake', 'survey'], user, [provider()]);
    expect(out).toEqual({ claims: [{ appName: 'Caliber', slug: 'intake', ownerLabel: 'Screen step', respondentUrl: 'https://host.example/interview?blueprint=1' }], failures: [] });
  });
  it('asks nobody when there are no slugs', async () => {
    const FindClaims = vi.fn<DistributionClaimProvider['FindClaims']>();
    expect(await findDistributionClaims([], user, [provider({ FindClaims })])).toEqual({ claims: [], failures: [] });
    expect(FindClaims).not.toHaveBeenCalled();
  });
  it('turns a throwing provider into a failure without echoing its internals, and keeps the other answers', async () => {
    const bad = provider({ AppName: 'Broken', FindClaims: async () => { throw new Error('select from secret_table failed'); } });
    const out = await findDistributionClaims(['intake'], user, [bad, provider()]);
    expect(out.claims).toHaveLength(1);
    expect(out.failures).toEqual([{ appName: 'Broken', message: 'did not answer (details in the server log)' }]);
  });
  it('treats a synchronous throw like a rejection', async () => {
    const sync = provider({ AppName: 'Sync', FindClaims: () => { throw new Error('boom'); } });
    expect((await findDistributionClaims(['intake'], user, [sync])).failures).toEqual([{ appName: 'Sync', message: 'did not answer (details in the server log)' }]);
  });
  it('gives each provider its own copy of the slugs, so one cannot widen what the next is asked', async () => {
    const mutator = provider({ AppName: 'Mutator', FindClaims: (slugs) => { (slugs as string[]).push('other-form'); return Promise.resolve([]); } });
    const seen = vi.fn<DistributionClaimProvider['FindClaims']>(async () => []);
    await findDistributionClaims(['intake'], user, [mutator, provider({ FindClaims: seen })]);
    expect(seen).toHaveBeenCalledWith(['intake'], user);
  });
  it('passes a deliberate null respondentUrl through without reporting it', async () => {
    const p = provider({ FindClaims: async () => [{ slug: 'intake', ownerLabel: 'S', respondentUrl: null }] });
    expect(await findDistributionClaims(['intake'], user, [p])).toEqual({ claims: [{ appName: 'Caliber', slug: 'intake', ownerLabel: 'S', respondentUrl: null }], failures: [] });
  });
  it('trims labels and rejects one over 200 characters', async () => {
    const p = provider({ FindClaims: async () => [{ slug: 'intake', ownerLabel: '  Step  ', respondentUrl: null }, { slug: 'intake', ownerLabel: 'x'.repeat(201), respondentUrl: null }] });
    const out = await findDistributionClaims(['intake'], user, [p]);
    expect(out.claims.map((c) => c.ownerLabel)).toEqual(['Step']);
    expect(out.failures).toHaveLength(1);
  });
  it('times out a provider that never answers', async () => {
    const hung = provider({ AppName: 'Hung', FindClaims: () => new Promise(() => undefined) });
    const out = await findDistributionClaims(['intake'], user, [hung], 20);
    expect(out.failures).toEqual([{ appName: 'Hung', message: expect.stringContaining('did not answer within') }]);
  });
  it('drops a claim for a slug that was not asked', async () => {
    const greedy = provider({ FindClaims: async () => [{ slug: 'someone-elses', ownerLabel: 'x', respondentUrl: null }] });
    const out = await findDistributionClaims(['intake'], user, [greedy]);
    expect(out.claims).toEqual([]);
    expect(out.failures[0].message).toContain('someone-elses');
  });
  it('nulls a respondentUrl that is not absolute http(s)', async () => {
    for (const bad of ['javascript:alert(1)', '/interview?blueprint=1', 'ftp://x/y', '']) {
      const p = provider({ FindClaims: async () => [{ slug: 'intake', ownerLabel: 'S', respondentUrl: bad }] });
      const out = await findDistributionClaims(['intake'], user, [p]);
      expect(out.claims[0].respondentUrl).toBeNull();
      expect(out.failures).toHaveLength(1);
    }
  });
  it('reports a provider that returns something other than an array', async () => {
    const odd = provider({ FindClaims: async () => 'yes' as never });
    expect((await findDistributionClaims(['intake'], user, [odd])).failures).toHaveLength(1);
  });
  it('logs the full cause with the app and slugs while showing the author only the generic line', async () => {
    const bad = provider({ AppName: 'Broken', FindClaims: async () => { throw new Error('select from secret_table failed'); } });
    await findDistributionClaims(['intake', 'survey'], user, [bad]);
    expect(LogError).toHaveBeenCalledWith(expect.stringMatching(/Broken for slugs intake, survey: threw: .*secret_table/s));
  });
  it('trims the app name on the claim and on a failure', async () => {
    const out = await findDistributionClaims(['intake'], user, [provider({ AppName: '  Caliber  ' })]);
    expect(out.claims[0].appName).toBe('Caliber');
  });
  it('rejects a provider whose AppName is blank', () => {
    expect(readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: [provider({ AppName: '  ' })] }).failures).toEqual([{ appName: 'unknown', message: expect.stringContaining('AppName') }]);
  });
});
