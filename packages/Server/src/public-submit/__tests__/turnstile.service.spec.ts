import { afterEach, describe, expect, it, vi } from 'vitest';
import { captchaRequired, verifyTurnstile } from '../turnstile.service';
import { resetPublicSubmitConfigForTests } from '../config';

afterEach(() => {
  delete process.env.FORMS_TURNSTILE_SECRET;
  resetPublicSubmitConfigForTests();
});

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
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as unknown as typeof fetch;
    const result = await verifyTurnstile(true, 'tok', fetchImpl);
    expect(result.success).toBe(true);
  });

  it('reports the first error code on verification failure', async () => {
    process.env.FORMS_TURNSTILE_SECRET = 's';
    resetPublicSubmitConfigForTests();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const result = await verifyTurnstile(true, 'tok', fetchImpl);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('timeout-or-duplicate');
  });

  it('treats a network error as failure (fail closed)', async () => {
    process.env.FORMS_TURNSTILE_SECRET = 's';
    resetPublicSubmitConfigForTests();
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await verifyTurnstile(true, 'tok', fetchImpl);
    expect(result.errorCode).toBe('turnstile-unreachable');
  });
});
