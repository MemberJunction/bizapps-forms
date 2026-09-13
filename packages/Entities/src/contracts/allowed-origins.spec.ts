/**
 * `FormDistribution.AllowedOrigins` — the grammar one entry is held to, and what an authored
 * list means on the request path (#203).
 *
 * The grammar half mirrors `bizapps-caliber`'s `allowed-origins.spec.ts` deliberately: the two
 * apps must refuse the same strings, or an operator who learns one learns the other wrong.
 */
import { describe, expect, it } from 'vitest';
import {
  authorAllowedOrigins,
  frameAncestorsDirective,
  isOriginAdmitted,
  normalizeOrigin,
  normalizeReportedOrigin,
  parseAllowedOrigins,
  serializeAllowedOrigins,
} from './allowed-origins';

describe('normalizeOrigin — canonicalises to the browser\'s own spelling', () => {
  it('lowercases scheme and host and drops a default port', () => {
    expect(normalizeOrigin('HTTPS://Careers.ACME.com')).toBe('https://careers.acme.com');
    expect(normalizeOrigin('https://careers.acme.com:443')).toBe('https://careers.acme.com');
  });

  it('keeps a non-default port', () => {
    expect(normalizeOrigin('https://careers.acme.com:8443')).toBe('https://careers.acme.com:8443');
  });

  it('accepts the bare-origin trailing slash a browser never sends', () => {
    expect(normalizeOrigin('https://acme.com/')).toBe('https://acme.com');
  });

  it('refuses anything carrying a path, query or fragment', () => {
    for (const v of ['https://acme.com/careers', 'https://acme.com/?x=1', 'https://acme.com/#a']) {
      expect(normalizeOrigin(v)).toBeNull();
    }
  });

  it('refuses wildcards in every position', () => {
    for (const v of ['*', '*.acme.com', 'https://*.acme.com', 'https://acme.*']) {
      expect(normalizeOrigin(v)).toBeNull();
    }
  });

  it('accepts http only for loopback', () => {
    expect(normalizeOrigin('http://acme.com')).toBeNull();
    expect(normalizeOrigin('http://localhost:4200')).toBe('http://localhost:4200');
    expect(normalizeOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it('refuses credentials, empty strings and non-URLs', () => {
    for (const v of ['https://u:p@acme.com', '', '   ', 'acme.com', 'not a url']) {
      expect(normalizeOrigin(v)).toBeNull();
    }
  });

  it('refuses a host carrying a character no browser could send', () => {
    // None of these is a forbidden host code point, so the WHATWG parser passes them straight
    // through and reports them verbatim as the host. `;` is the one that matters most: a
    // serialized CSP is a semicolon-delimited list of DIRECTIVES, so a stored `;` appends a
    // second directive of the author's choosing to the header this value ends up in.
    for (const v of [
      'https://acme.com;sandbox',
      'https://ac;me.com',
      'https://acme.com;form-action',
      "https://acme.com'",
      'https://acme.com"',
      'https://ac me.com',
      'https://acme.com(',
    ]) {
      expect(normalizeOrigin(v)).toBeNull();
    }
  });

  it('still accepts every host a browser really does send — the screen is a shape, not a blocklist', () => {
    // Punycode is plain ASCII letters, digits and hyphens, so it needs no special case; an IPv6
    // literal arrives bracketed and is only ever emitted for an address the parser validated.
    expect(normalizeOrigin('https://xn--cme-5cd.com')).toBe('https://xn--cme-5cd.com');
    expect(normalizeOrigin('https://[::1]:8443')).toBe('https://[::1]:8443');
    expect(normalizeOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    expect(normalizeOrigin('http://localhost:4200')).toBe('http://localhost:4200');
    expect(normalizeOrigin('https://careers.acme.com:8443')).toBe('https://careers.acme.com:8443');
  });
});

describe('normalizeReportedOrigin — what a browser or a deployment says, not what an author typed', () => {
  it('accepts plain http on any host, because a deployment is a fact and not a choice', () => {
    // The authoring rule (http only for loopback) exists to stop an AUTHOR naming a plaintext
    // embed host. MJAPI_PUBLIC_URL and an inbound `Origin` header are not authored values.
    expect(normalizeReportedOrigin('http://10.0.0.5:4000')).toBe('http://10.0.0.5:4000');
    expect(normalizeReportedOrigin('http://mjapi.internal:4000')).toBe('http://mjapi.internal:4000');
  });

  it('reduces a path away rather than refusing it — an API mounted under a base path is normal', () => {
    expect(normalizeReportedOrigin('https://forms.ourhost.test/some/base/')).toBe('https://forms.ourhost.test');
  });

  it('applies the same character screen, so neither side can carry a CSP delimiter', () => {
    for (const v of ['https://acme.com;sandbox', "https://acme.com'", 'https://acme.com(', 'ftp://acme.com', 'null', '']) {
      expect(normalizeReportedOrigin(v)).toBeNull();
    }
  });
});

describe('parseAllowedOrigins — NULL is unrestricted, authored-but-unusable is closed', () => {
  it('treats NULL, undefined, blank and an empty array as unrestricted', () => {
    for (const v of [null, undefined, '', '   ', '[]']) {
      expect(parseAllowedOrigins(v)).toEqual({ kind: 'unrestricted' });
    }
  });

  it('normalises every usable entry and de-duplicates', () => {
    const policy = parseAllowedOrigins('["HTTPS://Acme.com", "https://acme.com:443", "https://b.example"]');
    expect(policy).toEqual({ kind: 'allowlist', origins: ['https://acme.com', 'https://b.example'] });
  });

  it('drops an unusable entry but keeps the usable ones — dropping only ever narrows', () => {
    const policy = parseAllowedOrigins('["https://acme.com", "*.acme.com"]');
    expect(policy).toEqual({ kind: 'allowlist', origins: ['https://acme.com'] });
  });

  it('is CLOSED, never unrestricted, when an authored value yields nothing usable', () => {
    expect(parseAllowedOrigins('["*.acme.com"]').kind).toBe('closed');
    expect(parseAllowedOrigins('not json').kind).toBe('closed');
    expect(parseAllowedOrigins('{"https://acme.com":{}}').kind).toBe('closed');
    expect(parseAllowedOrigins('"https://acme.com"').kind).toBe('closed');
  });

  it('names what was wrong, so the log line can be acted on', () => {
    const policy = parseAllowedOrigins('["*.acme.com"]');
    expect(policy.kind === 'closed' && policy.reason).toContain('*.acme.com');
  });
});

describe('isOriginAdmitted — unrestricted admits all, allowlist is exact, closed admits none', () => {
  it('admits anything under an unrestricted policy, including no Origin at all', () => {
    const policy = parseAllowedOrigins(null);
    expect(isOriginAdmitted('https://anywhere.example', policy)).toBe(true);
    expect(isOriginAdmitted(undefined, policy)).toBe(true);
  });

  it('matches an allowlist entry regardless of the caller\'s spelling', () => {
    const policy = parseAllowedOrigins('["https://careers.acme.com"]');
    expect(isOriginAdmitted('HTTPS://Careers.ACME.com', policy)).toBe(true);
  });

  it('refuses a subdomain, a different port and a different scheme', () => {
    const policy = parseAllowedOrigins('["https://acme.com"]');
    expect(isOriginAdmitted('https://evil.acme.com', policy)).toBe(false);
    expect(isOriginAdmitted('https://acme.com:8443', policy)).toBe(false);
    expect(isOriginAdmitted('http://acme.com', policy)).toBe(false);
  });

  it('refuses a caller that will not say where it came from', () => {
    const policy = parseAllowedOrigins('["https://acme.com"]');
    expect(isOriginAdmitted(undefined, policy)).toBe(false);
    expect(isOriginAdmitted(null, policy)).toBe(false);
    expect(isOriginAdmitted('null', policy)).toBe(false);
    expect(isOriginAdmitted('not-an-origin', policy)).toBe(false);
  });

  it('admits nobody under a closed policy', () => {
    const policy = parseAllowedOrigins('["*.acme.com"]');
    expect(isOriginAdmitted('https://acme.com', policy)).toBe(false);
    expect(isOriginAdmitted(undefined, policy)).toBe(false);
  });
});

describe('frameAncestorsDirective — what the host page sends', () => {
  it('sends nothing when unrestricted, so today\'s embeds are untouched', () => {
    expect(frameAncestorsDirective(parseAllowedOrigins(null))).toBeUndefined();
  });

  it('names self plus every authored origin', () => {
    const policy = parseAllowedOrigins('["https://a.example", "https://b.example"]');
    expect(frameAncestorsDirective(policy)).toBe(
      "frame-ancestors 'self' https://a.example https://b.example",
    );
  });

  it('refuses all framing when the policy is closed', () => {
    expect(frameAncestorsDirective(parseAllowedOrigins('["*.acme.com"]'))).toBe("frame-ancestors 'none'");
  });

  it('can never emit a `;`, whatever the column holds', () => {
    // The header this returns is a semicolon-delimited list of directives, so one `;` surviving
    // from the column would append a second directive nobody authored — `;sandbox` with no
    // `allow-scripts` blanks the form on every site, including the authorised one. The guarantee
    // has to hold for the value as STORED, because the column is also writable outside the
    // builder; a `;` entry is dropped on the way in, and a list of nothing else goes closed.
    for (const column of [
      '["https://acme.com;sandbox"]',
      '["https://acme.com;sandbox", "https://ok.example"]',
      '["https://ac;me.com"]',
      '["https://ok.example", "https://acme.com;upgrade-insecure-requests"]',
    ]) {
      expect(frameAncestorsDirective(parseAllowedOrigins(column)) ?? '').not.toContain(';');
    }
    expect(frameAncestorsDirective(parseAllowedOrigins('["https://acme.com;sandbox", "https://ok.example"]')))
      .toBe("frame-ancestors 'self' https://ok.example");
  });
});

describe('authoring round-trip', () => {
  it('splits an authored block on newlines and commas, reporting refusals', () => {
    const result = authorAllowedOrigins('https://a.example\n*.acme.com,  https://b.example:8443 \n\n');
    expect(result.origins).toEqual(['https://a.example', 'https://b.example:8443']);
    expect(result.rejected).toEqual(['*.acme.com']);
  });

  it('serializes to the column, and an empty list clears it back to unrestricted', () => {
    expect(serializeAllowedOrigins(['https://a.example'])).toBe('["https://a.example"]');
    expect(serializeAllowedOrigins([])).toBeNull();
  });

  it('round-trips through the column', () => {
    const authored = authorAllowedOrigins('https://a.example, https://b.example');
    const column = serializeAllowedOrigins(authored.origins);
    expect(parseAllowedOrigins(column)).toEqual({
      kind: 'allowlist',
      origins: ['https://a.example', 'https://b.example'],
    });
  });
});
