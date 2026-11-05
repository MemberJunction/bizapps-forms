/**
 * The pure half of the Distribute-tab claim warning (#292): reading `Forms.GetDistributionClaims`'
 * answer and producing the copy. `DistributionService.claims` is covered at the bottom through the
 * real operation class, with the provider it routes through faked, because its only logic is
 * "read, or log and report the failure".
 */
import '@angular/compiler';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import type { FormsGetDistributionClaimsOutput } from '@mj-biz-apps/forms-entities';
import { installFakeOperations, refused, succeeded, type FakeOperations } from '../shared/testing/fake-operations';

const logged: string[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: (message: string) => logged.push(message) };
});

const { toClaimsResult, claimsBySlug, claimNotice, failureNotice } = await import('./distribution-claims');
const { DistributionService } = await import('./distribution.service');

const claim = (appName: string, ownerLabel: string, slug = 's', respondentUrl: string | null = null) => ({
  appName,
  slug,
  ownerLabel,
  respondentUrl,
});

const serverOutput: FormsGetDistributionClaimsOutput = {
  Claims: [{ AppName: 'Smoke Consumer', Slug: 'doodle-scroll', OwnerLabel: 'Smoke intake step', RespondentURL: 'http://localhost:4131/x?step=1' }],
  Failures: [{ AppName: 'Smoke Broken', Message: 'did not answer (details in the server log)' }],
};

let operations: FakeOperations | null = null;

beforeEach(() => {
  logged.length = 0;
});

afterEach(() => {
  operations?.restore();
  operations = null;
});

describe('toClaimsResult', () => {
  it('reads the operation output into the builder shape', () => {
    expect(toClaimsResult(serverOutput)).toEqual({
      ok: true,
      claims: [claim('Smoke Consumer', 'Smoke intake step', 'doodle-scroll', 'http://localhost:4131/x?step=1')],
      failures: [{ appName: 'Smoke Broken', message: 'did not answer (details in the server log)' }],
    });
  });

  it('accepts a null RespondentURL', () => {
    const result = toClaimsResult({ Claims: [{ AppName: 'A', Slug: 's', OwnerLabel: 'x', RespondentURL: null }], Failures: [] });
    expect(result).toMatchObject({ ok: true, claims: [{ respondentUrl: null }] });
  });

  it.each([
    ['claims not an array', { Claims: 'x', Failures: [] }],
    ['failures missing', { Claims: [] }],
    ['a claim without a slug', { Claims: [{ AppName: 'A', OwnerLabel: 'o', RespondentURL: null }], Failures: [] }],
    ['a failure without a message', { Claims: [], Failures: [{ AppName: 'A' }] }],
    ['nothing at all', null],
  ])('turns %s into a failure with a message, never an empty success', (_label, output) => {
    // The output crossed the network as JSON, so its type is a promise, not a proof.
    const result = toClaimsResult(output as unknown as FormsGetDistributionClaimsOutput);
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

  it('leads neutrally and names the app and the reason', () => {
    expect(failureNotice({ ok: true, claims: [], failures: [{ appName: 'Caliber', message: 'db down' }] })).toBe(
      "Some apps' answers about these links had problems: Caliber: db down",
    );
  });

  it('lists one entry per app, so a partial refusal is not called a failed check', () => {
    const notice = failureNotice({
      ok: true,
      claims: [],
      failures: [
        { appName: 'A', message: 'm1' },
        { appName: 'B', message: 'm2' },
      ],
    });
    expect(notice).toBe("Some apps' answers about these links had problems: A: m1; B: m2");
  });

  it("renders the placeholder app name 'unknown' as 'an unnamed app'", () => {
    expect(failureNotice({ ok: true, claims: [], failures: [{ appName: 'unknown', message: 'no AppName' }] })).toBe(
      "Some apps' answers about these links had problems: an unnamed app: no AppName",
    );
  });

  it('reports a failed check as another app possibly using the links', () => {
    expect(failureNotice({ ok: false, error: 'boom' })).toBe("Couldn't check whether another app uses these links: boom");
  });
});

describe('DistributionService.claims', () => {
  it('asks Forms.GetDistributionClaims about the form and reads the answer', async () => {
    operations = installFakeOperations(() => succeeded(serverOutput));
    const result = await new DistributionService().claims('form-9');
    expect(operations.calls).toEqual([{ key: 'Forms.GetDistributionClaims', input: { FormID: 'form-9' } }]);
    expect(result.ok).toBe(true);
  });

  it('logs the form id and returns the server\'s refusal', async () => {
    operations = installFakeOperations(() => refused('Not authorized'));
    const result = await new DistributionService().claims('form-9');
    expect(result).toEqual({ ok: false, error: 'Not authorized' });
    expect(logged.join('\n')).toContain('form-9');
    expect(logged.join('\n')).toContain('Not authorized');
  });

  it('returns a failure — never "no claims" — when the request never reaches the server', async () => {
    operations = installFakeOperations(() => Promise.reject(new Error('network down')));
    const result = await new DistributionService().claims('form-9');
    expect(result.ok).toBe(false);
    expect(logged.join('\n')).toContain('network down');
  });

  it('logs the form id when the server sends an answer the builder cannot read', async () => {
    operations = installFakeOperations(() => succeeded({ Claims: 'nope' }));
    const result = await new DistributionService().claims('form-9');
    expect(result.ok).toBe(false);
    expect(logged.join('\n')).toContain('form-9');
  });
});
