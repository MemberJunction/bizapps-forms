import { afterEach, describe, expect, it, vi } from 'vitest';

// `LogError` is captured with `vi.mock` + `vi.hoisted`, NOT `vi.spyOn(core, 'LogError')`, for the
// reason default-salt-warning.spec.ts documents: on a clean install the published core package is
// externalised as real (frozen) ESM, where a spy throws `Cannot redefine property`.
const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: logError,
}));

import { captchaRequired, expectedTurnstileHostnames, verifyTurnstile } from '../turnstile.js';
import { resetPublicSubmitConfigForTests } from '../config.js';

afterEach(() => {
  delete process.env.FORMS_TURNSTILE_SECRET;
  resetPublicSubmitConfigForTests();
  logError.mockClear();
});

/** A fetch double that records the siteverify request and answers with `json`. */
function fetchAnswering(json: unknown): { fetchImpl: typeof fetch; lastBody: () => URLSearchParams } {
  let captured: URLSearchParams | undefined;
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    captured = init?.body as URLSearchParams;
    return new Response(JSON.stringify(json), { status: 200 });
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    lastBody: () => {
      if (!captured) {
        throw new Error('siteverify was never called');
      }
      return captured;
    },
  };
}

describe('captchaRequired', () => {
  it('is true when either the form or the distribution requires it', () => {
    expect(captchaRequired(false, false)).toBe(false);
    expect(captchaRequired(true, false)).toBe(true);
    expect(captchaRequired(false, true)).toBe(true);
  });
});

describe('verifyTurnstile', () => {
  it('passes immediately when captcha is not required', async () => {
    const result = await verifyTurnstile(false, undefined);
    expect(result.success).toBe(true);
  });

  it('fails closed when required but no secret is configured', async () => {
    const result = await verifyTurnstile(true, 'token');
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('turnstile-not-configured');
  });

  it('fails when required and the token is missing', async () => {
    process.env.FORMS_TURNSTILE_SECRET = 's';
    resetPublicSubmitConfigForTests();
    const result = await verifyTurnstile(true, undefined);
    expect(result.errorCode).toBe('missing-token');
  });

  it('succeeds when Cloudflare returns success', async () => {
    process.env.FORMS_TURNSTILE_SECRET = 's';
    resetPublicSubmitConfigForTests();
    const { fetchImpl } = fetchAnswering({ success: true });
    const result = await verifyTurnstile(true, 'tok', { fetchImpl });
    expect(result.success).toBe(true);
  });

  it('forwards the resolved peer address as remoteip, and omits it when there is none', async () => {
    process.env.FORMS_TURNSTILE_SECRET = 's';
    resetPublicSubmitConfigForTests();

    const withIp = fetchAnswering({ success: true });
    await verifyTurnstile(true, 'tok', { fetchImpl: withIp.fetchImpl, remoteIp: '203.0.113.9' });
    expect(withIp.lastBody().get('remoteip')).toBe('203.0.113.9');
    expect(withIp.lastBody().get('secret')).toBe('s');
    expect(withIp.lastBody().get('response')).toBe('tok');

    const withoutIp = fetchAnswering({ success: true });
    await verifyTurnstile(true, 'tok', { fetchImpl: withoutIp.fetchImpl });
    expect(withoutIp.lastBody().has('remoteip')).toBe(false);
  });

  it('reports the first error code on verification failure', async () => {
    process.env.FORMS_TURNSTILE_SECRET = 's';
    resetPublicSubmitConfigForTests();
    const { fetchImpl } = fetchAnswering({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    const result = await verifyTurnstile(true, 'tok', { fetchImpl });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('timeout-or-duplicate');
  });

  it('treats a network error as failure (fail closed)', async () => {
    process.env.FORMS_TURNSTILE_SECRET = 's';
    resetPublicSubmitConfigForTests();
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await verifyTurnstile(true, 'tok', { fetchImpl });
    expect(result.errorCode).toBe('turnstile-unreachable');
  });

  describe('hostname check (warn-only by design — see the module header)', () => {
    it('logs, but does NOT refuse, a token solved on an unexpected hostname', async () => {
      process.env.FORMS_TURNSTILE_SECRET = 's';
      resetPublicSubmitConfigForTests();
      const { fetchImpl } = fetchAnswering({ success: true, hostname: 'evil.example' });
      const result = await verifyTurnstile(true, 'tok', {
        fetchImpl,
        expectedHostnames: ['forms.acme.com'],
      });
      expect(result.success).toBe(true);
      const lines = logError.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('evil.example') && l.includes('forms.acme.com'))).toBe(true);
    });

    it('stays silent on a matching hostname, case-insensitively', async () => {
      process.env.FORMS_TURNSTILE_SECRET = 's';
      resetPublicSubmitConfigForTests();
      const { fetchImpl } = fetchAnswering({ success: true, hostname: 'Forms.Acme.Com' });
      const result = await verifyTurnstile(true, 'tok', {
        fetchImpl,
        expectedHostnames: ['forms.acme.com'],
      });
      expect(result.success).toBe(true);
      expect(logError).not.toHaveBeenCalled();
    });

    it('does not compare when there is nothing to compare against', async () => {
      process.env.FORMS_TURNSTILE_SECRET = 's';
      resetPublicSubmitConfigForTests();
      const { fetchImpl } = fetchAnswering({ success: true, hostname: 'anything.example' });
      const result = await verifyTurnstile(true, 'tok', { fetchImpl, expectedHostnames: [] });
      expect(result.success).toBe(true);
      expect(logError).not.toHaveBeenCalled();
    });
  });
});

describe('expectedTurnstileHostnames', () => {
  it('reduces origins to deduped lowercase hostnames, skipping absent and unparseable entries', () => {
    expect(
      expectedTurnstileHostnames([
        'https://Forms.Acme.com',
        'https://forms.acme.com:8443',
        undefined,
        'not a url',
        'http://embed.example',
      ]),
    ).toEqual(['forms.acme.com', 'embed.example']);
  });
});
