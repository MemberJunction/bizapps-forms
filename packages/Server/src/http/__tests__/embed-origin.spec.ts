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

  it('resolves a plain-http deployment to itself, because this value is not an authored one', () => {
    // The authoring grammar refuses `http` on a non-loopback host so that nobody LISTS a plaintext
    // embed host they cannot authenticate. MJAPI_PUBLIC_URL is a deployment fact, and self-hosted
    // / docker-compose / LAN installs are routinely reached at exactly this shape. Holding it to
    // the authoring rule made `apiOwnOrigin()` undefined there, which refused the API's OWN
    // embedded widget on every distribution with an allowlist — and the remedy the log line named
    // (list that origin) was itself refused by the builder, so nothing could repair it.
    process.env.MJAPI_PUBLIC_URL = 'http://10.0.0.5:4000';
    resetEmbedOriginConfigForTests();
    expect(apiOwnOrigin()).toBe('http://10.0.0.5:4000');

    process.env.MJAPI_PUBLIC_URL = 'http://mjapi.internal:4000/forms/';
    resetEmbedOriginConfigForTests();
    expect(apiOwnOrigin()).toBe('http://mjapi.internal:4000');
  });

  it('is still undefined for a value no browser could report', () => {
    // Relaxing the SCHEME rule is not relaxing the character screen: whatever is admitted here is
    // compared against an inbound `Origin` header, so it has to be a thing a browser can send.
    for (const raw of ['ftp://forms.ourhost.test', 'https://forms.ourhost.test;sandbox', 'forms.ourhost.test']) {
      process.env.MJAPI_PUBLIC_URL = raw;
      resetEmbedOriginConfigForTests();
      expect(apiOwnOrigin()).toBeUndefined();
    }
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

  it('admits our own widget on a plain-http deployment, which is the point of the above', () => {
    // Resolving the value is only half of it: the inbound `Origin` header is compared against it,
    // and running THAT through the authoring grammar would refuse `http://10.0.0.5:4000` again on
    // the way in. Both sides of this one comparison are reported origins, not authored ones.
    process.env.MJAPI_PUBLIC_URL = 'http://10.0.0.5:4000';
    resetEmbedOriginConfigForTests();
    expect(checkEmbedOrigin(LIST, 'http://10.0.0.5:4000').allowed).toBe(true);
    expect(checkEmbedOrigin(LIST, 'http://10.0.0.6:4000').allowed).toBe(false);
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
