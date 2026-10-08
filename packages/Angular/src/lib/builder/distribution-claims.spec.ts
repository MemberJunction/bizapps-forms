/**
 * The pure half of the Distribute-tab claim warning (#292): parsing the network payload and
 * producing the copy. `DistributionService.claims` is covered at the bottom with the GraphQL
 * provider mocked, because its only logic is "parse, or log and report the failure".
 */
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const logged: string[] = [];
let executeGQL: (query: string, variables: Record<string, unknown>) => Promise<unknown>;

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: (message: string) => logged.push(message) };
});
vi.mock('@memberjunction/graphql-dataprovider', () => ({
  GraphQLDataProvider: { Instance: { ExecuteGQL: (q: string, v: Record<string, unknown>) => executeGQL(q, v) } },
}));

const { parseClaimsPayload, claimsBySlug, claimNotice, failureNotice, FORM_DISTRIBUTION_CLAIMS_QUERY } =
  await import('./distribution-claims');
const { DistributionService } = await import('./distribution.service');

const claim = (appName: string, ownerLabel: string, slug = 's', respondentUrl: string | null = null) => ({
  appName,
  slug,
  ownerLabel,
  respondentUrl,
});

const serverPayload = {
  FormDistributionClaims: {
    claims: [claim('Smoke Consumer', 'Smoke intake step', 'doodle-scroll', 'http://localhost:4131/x?step=1')],
    failures: [{ appName: 'Smoke Broken', message: 'did not answer (details in the server log)' }],
  },
};

beforeEach(() => {
  logged.length = 0;
});

describe('parseClaimsPayload', () => {
  it('accepts the server shape', () => {
    expect(parseClaimsPayload(serverPayload)).toEqual({
      ok: true,
      claims: serverPayload.FormDistributionClaims.claims,
      failures: serverPayload.FormDistributionClaims.failures,
    });
  });

  it('accepts a null respondentUrl', () => {
    const result = parseClaimsPayload({ FormDistributionClaims: { claims: [claim('A', 'x')], failures: [] } });
    expect(result).toMatchObject({ ok: true, claims: [{ respondentUrl: null }] });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['an empty object', {}],
    ['a null result', { FormDistributionClaims: null }],
    ['claims not an array', { FormDistributionClaims: { claims: 'x', failures: [] } }],
    ['failures missing', { FormDistributionClaims: { claims: [] } }],
    [
      'a claim without a slug',
      { FormDistributionClaims: { claims: [{ appName: 'A', ownerLabel: 'o', respondentUrl: null }], failures: [] } },
    ],
    ['a failure without a message', { FormDistributionClaims: { claims: [], failures: [{ appName: 'A' }] } }],
  ])('turns %s into a failure with a message, never an empty success', (_label, payload) => {
    const result = parseClaimsPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});

describe('claimsBySlug', () => {
  it('groups two apps on one slug', () => {
    const grouped = claimsBySlug([claim('A', 'a', 'one'), claim('B', 'b', 'one'), claim('C', 'c', 'two')]);
    expect(grouped.get('one')?.map((c) => c.appName)).toEqual(['A', 'B']);
    expect(grouped.get('two')?.map((c) => c.appName)).toEqual(['C']);
  });
});

describe('claimNotice', () => {
  it('names the app and the owner for one claim', () => {
    const notice = claimNotice([claim('Caliber', 'the hiring page', 's', 'https://x')]);
    expect(notice.headline).toBe(
      'Caliber uses this link for the hiring page. Responses sent here are saved as form responses only. Caliber never sees them.',
    );
    expect(notice.lines).toEqual([{ appName: 'Caliber', ownerLabel: 'the hiring page', respondentUrl: 'https://x' }]);
  });

  it('gives one line per claim and a headline naming no single app for two', () => {
    const notice = claimNotice([claim('A', 'a'), claim('B', 'b')]);
    expect(notice.headline).toBe(
      'Other apps use this link. Responses sent here are saved as form responses only; those apps never see them.',
    );
    expect(notice.lines.map((l) => l.appName)).toEqual(['A', 'B']);
  });
});

describe('failureNotice', () => {
  it('is null when nothing failed', () => {
    expect(failureNotice({ ok: true, claims: [], failures: [] })).toBeNull();
  });

  it('names the app and the reason', () => {
    expect(failureNotice({ ok: true, claims: [], failures: [{ appName: 'Caliber', message: 'db down' }] })).toBe(
      "Couldn't check whether Caliber uses these links: db down",
    );
  });

  it('joins several failures', () => {
    const notice = failureNotice({
      ok: true,
      claims: [],
      failures: [
        { appName: 'A', message: 'm1' },
        { appName: 'B', message: 'm2' },
      ],
    });
    expect(notice).toBe("Couldn't check whether A or B uses these links: m1; m2");
  });

  it('reports a failed check as another app possibly using the links', () => {
    expect(failureNotice({ ok: false, error: 'boom' })).toBe("Couldn't check whether another app uses these links: boom");
  });
});

describe('DistributionService.claims', () => {
  it('sends the query with the form id and parses the answer', async () => {
    let seen: { query: string; variables: Record<string, unknown> } | null = null;
    executeGQL = async (query, variables) => {
      seen = { query, variables };
      return serverPayload;
    };
    const result = await new DistributionService().claims('form-9');
    expect(seen).toEqual({ query: FORM_DISTRIBUTION_CLAIMS_QUERY, variables: { formId: 'form-9' } });
    expect(result.ok).toBe(true);
  });

  it('logs the form id and returns a failure when the request throws', async () => {
    executeGQL = async () => {
      throw new Error('network down');
    };
    const result = await new DistributionService().claims('form-9');
    expect(result).toEqual({ ok: false, error: 'network down' });
    expect(logged.join('\n')).toContain('form-9');
    expect(logged.join('\n')).toContain('network down');
  });

  it('logs the form id when the server sends an answer the builder cannot read', async () => {
    executeGQL = async () => ({ FormDistributionClaims: { claims: 'nope' } });
    const result = await new DistributionService().claims('form-9');
    expect(result.ok).toBe(false);
    expect(logged.join('\n')).toContain('form-9');
  });
});
