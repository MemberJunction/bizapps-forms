import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogError, type UserInfo } from '@memberjunction/core';
import { DISTRIBUTION_CLAIM_PROVIDERS_KEY, MAX_CLAIMS_PER_PROVIDER, MAX_FAILURES_PER_PROVIDER, type DistributionClaimProvider } from '../claim-contract';
import { findDistributionClaims, readClaimProviders } from '../find-claims';

vi.mock('@memberjunction/core', async (orig) => ({ ...(await orig<typeof import('@memberjunction/core')>()), LogError: vi.fn() }));

beforeEach(() => vi.mocked(LogError).mockClear());

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
    const p = provider({ AppName: '  Caliber  ' });
    const out = readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: [p] });
    expect(out.failures).toEqual([]);
    expect(out.providers.map((x) => x.AppName)).toEqual(['Caliber']); // a trimmed snapshot, not the live entry
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
    const hung = provider({ AppName: '  Hung  ', FindClaims: () => new Promise(() => undefined) });
    const timedOut = await findDistributionClaims(['intake'], user, [hung], 20);
    expect(timedOut.failures[0].appName).toBe('Hung');
  });
  it('keeps the first claim per app and slug and reports each further duplicate against that app', async () => {
    const twice = provider({
      FindClaims: async () => [
        { slug: 'intake', ownerLabel: 'First', respondentUrl: null },
        { slug: 'intake', ownerLabel: 'Second', respondentUrl: null },
      ],
    });
    const out = await findDistributionClaims(['intake'], user, [twice]);
    expect(out.claims.map((c) => c.ownerLabel)).toEqual(['First']);
    expect(out.failures).toEqual([{ appName: 'Caliber', message: 'claimed slug "intake" more than once' }]);
  });
  it('dedupes across two providers sharing an AppName', async () => {
    const out = await findDistributionClaims(['intake'], user, [provider(), provider()]);
    expect(out.claims).toHaveLength(1);
    expect(out.failures).toEqual([{ appName: 'Caliber', message: 'claimed slug "intake" more than once' }]);
  });
  it('does not treat the same slug from two different apps as a duplicate', async () => {
    const out = await findDistributionClaims(['intake'], user, [provider(), provider({ AppName: 'Other' })]);
    expect(out.claims.map((c) => c.appName)).toEqual(['Caliber', 'Other']);
    expect(out.failures).toEqual([]);
  });
  it('caps an echoed unasked slug at 100 characters in the failure and the log', async () => {
    const long = 'z'.repeat(300);
    const greedy = provider({ FindClaims: async () => [{ slug: long, ownerLabel: 'x', respondentUrl: null }] });
    const out = await findDistributionClaims(['intake'], user, [greedy]);
    const capped = `${'z'.repeat(100)}…`;
    expect(out.failures[0].message).toContain(capped);
    expect(out.failures[0].message).not.toContain('z'.repeat(101));
    expect(LogError).toHaveBeenCalledWith(expect.stringContaining(capped));
    expect(vi.mocked(LogError).mock.calls[0][0]).not.toContain('z'.repeat(101));
  });
  it('rejects a provider whose AppName is blank', () => {
    expect(readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: [provider({ AppName: '  ' })] }).failures).toEqual([{ appName: 'unknown', message: expect.stringContaining('AppName') }]);
  });

  describe('a provider whose members throw', () => {
    const throwingName = (): DistributionClaimProvider => ({
      get AppName(): string { throw new Error('getter boom'); },
      FindClaims: async () => [],
    });
    it('is reported as unreadable by readClaimProviders while the other providers are still read', () => {
      const out = readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: [throwingName(), provider()] });
      expect(out.providers.map((p) => p.AppName)).toEqual(['Caliber']);
      expect(out.failures).toEqual([{ appName: 'unknown', message: 'registered a claim provider that could not be read' }]);
      expect(LogError).toHaveBeenCalledWith(expect.stringContaining('getter boom'));
    });
    it('cannot reject the lookup when AppName only throws after the first read', async () => {
      let reads = 0;
      const flaky: DistributionClaimProvider = {
        get AppName(): string { if (++reads > 1) throw new Error('second read'); return 'Flaky'; },
        FindClaims: async () => [],
      };
      const { providers } = readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: [flaky, provider()] });
      const out = await findDistributionClaims(['intake'], user, providers);
      expect(out.claims.map((c) => c.appName)).toEqual(['Caliber']);
    });
    it('still runs FindClaims with the original entry as this', async () => {
      const owner = { slug: 'intake', AppName: 'Self', FindClaims(this: { slug: string }) { return Promise.resolve([{ slug: this.slug, ownerLabel: 'Mine', respondentUrl: null }]); } };
      const { providers } = readClaimProviders({ [DISTRIBUTION_CLAIM_PROVIDERS_KEY]: [owner] });
      const out = await findDistributionClaims(['intake'], user, providers);
      expect(out.claims).toEqual([{ appName: 'Self', slug: 'intake', ownerLabel: 'Mine', respondentUrl: null }]);
    });
  });

  describe('unbounded answers', () => {
    it('checks only the first MAX_CLAIMS_PER_PROVIDER elements and says so once', async () => {
      const seen = vi.fn();
      const huge = Array.from({ length: 1000 }, (_, i) => ({ get slug(): string { seen(i); return 'intake'; }, ownerLabel: 'S', respondentUrl: null }));
      const out = await findDistributionClaims(['intake'], user, [provider({ FindClaims: async () => huge })]);
      expect(MAX_CLAIMS_PER_PROVIDER).toBe(500);
      expect(Math.max(...seen.mock.calls.map((c) => c[0] as number))).toBeLessThan(500);
      expect(out.claims).toHaveLength(1); // dedupe still applies
      expect(out.failures.filter((f) => f.message === 'returned 1000 claims; only the first 500 were checked')).toHaveLength(1);
    });
    it('reports at most MAX_FAILURES_PER_PROVIDER details then exactly one suppression summary', async () => {
      const slugs = Array.from({ length: 50 }, (_, i) => `s${i}`);
      const bad = provider({ FindClaims: async () => slugs.map((slug) => ({ slug, ownerLabel: 'S', respondentUrl: 'nope' })) });
      const out = await findDistributionClaims(slugs, user, [bad]);
      expect(MAX_FAILURES_PER_PROVIDER).toBe(20);
      expect(out.failures).toHaveLength(21);
      expect(out.failures[20]).toEqual({ appName: 'Caliber', message: 'and 30 more problems (suppressed)' });
      expect(out.failures.filter((f) => f.message.includes('more problems'))).toHaveLength(1);
      expect(vi.mocked(LogError).mock.calls.length).toBeLessThanOrEqual(21);
      expect(out.claims).toHaveLength(50);
    });
    it('counts the cap per app, so a noisy app does not silence another', async () => {
      const slugs = Array.from({ length: 30 }, (_, i) => `s${i}`);
      const noisy = provider({ FindClaims: async () => slugs.map((slug) => ({ slug, ownerLabel: 'S', respondentUrl: 'nope' })) });
      const other = provider({ AppName: 'Other', FindClaims: async () => [{ slug: 's0', ownerLabel: 'S', respondentUrl: 'nope' }] });
      const out = await findDistributionClaims(slugs, user, [noisy, other]);
      expect(out.failures.filter((f) => f.appName === 'Other')).toHaveLength(1);
      expect(out.failures.filter((f) => f.appName === 'Caliber')).toHaveLength(21);
    });
  });

  describe('round 2', () => {
    it('still logs the cause of a thrown error whose failure line is suppressed by the cap', async () => {
      const noisy = provider({ FindClaims: async () => Array.from({ length: 50 }, () => ({ slug: 'intake', ownerLabel: '', respondentUrl: null })) });
      const late = provider({ FindClaims: async () => { await new Promise((r) => setTimeout(r, 10)); throw new Error('late secret cause'); } });
      const out = await findDistributionClaims(['intake'], user, [noisy, late]);
      expect(out.failures.filter((f) => f.message === 'did not answer (details in the server log)')).toHaveLength(0);
      expect(LogError).toHaveBeenCalledWith(expect.stringContaining('late secret cause'));
    });
    it('survives a raw provider whose AppName getter throws, keeping the others', async () => {
      const raw = { get AppName(): string { throw new Error('raw boom'); }, FindClaims: async () => [] } as DistributionClaimProvider;
      const out = await findDistributionClaims(['intake'], user, [raw, provider()]);
      expect(out.claims.map((c) => c.appName)).toEqual(['Caliber']);
      expect(out.failures).toEqual([{ appName: 'unknown', message: 'did not answer (details in the server log)' }]);
    });
    it('reads each claim field once, so a getter cannot change its slug after validation', async () => {
      let reads = 0;
      const shifty = { get slug(): string { return ++reads === 1 ? 'intake' : 'unasked'; }, ownerLabel: 'S', respondentUrl: null };
      const out = await findDistributionClaims(['intake'], user, [provider({ FindClaims: async () => [shifty] })]);
      expect(out.claims).toEqual([{ appName: 'Caliber', slug: 'intake', ownerLabel: 'S', respondentUrl: null }]);
      expect(reads).toBe(1);
    });
  });
});
