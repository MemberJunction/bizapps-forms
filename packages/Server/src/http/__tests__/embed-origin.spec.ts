/**
 * The verdict that composes a distribution's authored policy with the API's OWN origin (#203).
 *
 * The own-origin half is the whole reason this module exists rather than the pure contract being
 * called directly: a browser inside a legitimate `<iframe>` embed reports the API's origin, never
 * the customer's, so a gate that only consulted the author's list would refuse every real embed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the two log functions are replaced, so an expected boot warning does not spray the run.
// It has to be a PARTIAL mock: this module imports `@mj-biz-apps/forms-entities`, whose barrel
// pulls in the generated entity subclasses, and those need the real `BaseEntity` from core.
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

import { apiOwnOrigin, checkEmbedOrigin, resetEmbedOriginConfigForTests } from '../embed-origin';

const LIST = '["https://careers.acme.com"]';

beforeEach(() => {
  process.env.MJAPI_PUBLIC_URL = 'https://forms.ourhost.test';
  resetEmbedOriginConfigForTests();
});

afterEach(() => {
  delete process.env.MJAPI_PUBLIC_URL;
  resetEmbedOriginConfigForTests();
});

describe('apiOwnOrigin', () => {
  it('reduces MJAPI_PUBLIC_URL to a bare origin', () => {
    process.env.MJAPI_PUBLIC_URL = 'https://forms.ourhost.test/some/base/';
    resetEmbedOriginConfigForTests();
    expect(apiOwnOrigin()).toBe('https://forms.ourhost.test');
  });

  it('is undefined when the variable is unusable, rather than guessing', () => {
    process.env.MJAPI_PUBLIC_URL = 'not a url';
    resetEmbedOriginConfigForTests();
    expect(apiOwnOrigin()).toBeUndefined();
  });
});

describe('checkEmbedOrigin', () => {
  it('admits everything when the distribution authored nothing', () => {
    expect(checkEmbedOrigin(null, 'https://anywhere.example').allowed).toBe(true);
    expect(checkEmbedOrigin(null, undefined).allowed).toBe(true);
  });

  it('admits a declared origin', () => {
    expect(checkEmbedOrigin(LIST, 'https://careers.acme.com').allowed).toBe(true);
  });

  it('admits our OWN origin, which is what a real iframe embed reports', () => {
    expect(checkEmbedOrigin(LIST, 'https://forms.ourhost.test').allowed).toBe(true);
  });

  it('refuses an origin that is neither ours nor declared', () => {
    const verdict = checkEmbedOrigin(LIST, 'https://evil.example');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('https://evil.example');
  });

  it('refuses a caller that sent no Origin at all once a list exists', () => {
    expect(checkEmbedOrigin(LIST, undefined).allowed).toBe(false);
  });

  it('refuses everything, including our own origin, when the authored value is unusable', () => {
    expect(checkEmbedOrigin('["*.acme.com"]', 'https://forms.ourhost.test').allowed).toBe(false);
  });

  it('does not admit our own origin when MJAPI_PUBLIC_URL is unset — the fallback is refusal', () => {
    delete process.env.MJAPI_PUBLIC_URL;
    resetEmbedOriginConfigForTests();
    expect(checkEmbedOrigin(LIST, 'https://forms.ourhost.test').allowed).toBe(false);
    expect(checkEmbedOrigin(LIST, 'https://careers.acme.com').allowed).toBe(true);
  });
});
