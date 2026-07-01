import { afterEach, describe, expect, it } from 'vitest';
import { renderRespondentHostPage, renderRespondentHostErrorPage, escapeHtml, escapeAttr } from '../host-page';
import { getRespondentHostConfig, resetRespondentHostConfigForTests } from '../config';

afterEach(() => {
  delete process.env.FORMS_RESPONDENT_HOST_ENABLED;
  delete process.env.FORMS_GRAPHQL_URL;
  delete process.env.FORMS_WIDGET_BUNDLE_URL;
  delete process.env.MJAPI_PUBLIC_URL;
  delete process.env.GRAPHQL_ROOT_PATH;
  delete process.env.FORMS_MAGICLINK_REDEEM_URL;
  resetRespondentHostConfigForTests();
});

describe('renderRespondentHostPage', () => {
  const html = () =>
    renderRespondentHostPage({
      graphqlUrl: 'http://localhost:4121/',
      widgetBundleUrl: '/forms/widget/mj-form.js',
    });

  it('is shell-free, self-contained HTML (no Explorer markup)', () => {
    const out = html();
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('<mj-form');
    expect(out).not.toMatch(/app-root|explorer/i);
  });

  it('is mobile-first (responsive viewport meta)', () => {
    expect(html()).toContain('width=device-width, initial-scale=1');
  });

  it('keeps the page out of search indexes', () => {
    expect(html()).toContain('name="robots" content="noindex"');
  });

  it('reads both the query string and the fragment for slug + token', () => {
    const out = html();
    expect(out).toContain('window.location.search');
    expect(out).toContain('window.location.hash');
    expect(out).toContain("readParam('slug')");
    expect(out).toContain("readParam('token')");
  });

  it('passes the path-supplied slug via an escaped data-* attribute (not the script)', () => {
    const out = renderRespondentHostPage({
      graphqlUrl: 'http://localhost:4121/',
      widgetBundleUrl: '/forms/widget/mj-form.js',
      defaultSlug: 'customer-survey',
    });
    expect(out).toContain('data-default-slug="customer-survey"');
    // The boot script reads config from the host element, never via interpolation.
    expect(out).toContain("getAttribute('data-default-slug')");
    expect(out).toContain("getAttribute('data-graphql-url')");
  });

  it('neutralizes a </script> breakout in the slug (XSS regression)', () => {
    const out = renderRespondentHostPage({
      graphqlUrl: 'http://localhost:4121/',
      widgetBundleUrl: '/forms/widget/mj-form.js',
      defaultSlug: '</script><script>alert(document.cookie)</script>',
    });
    expect(out).not.toContain('</script><script>alert');
    expect(out).toContain('&lt;/script&gt;&lt;script&gt;alert');
  });

  it('neutralizes a </script> breakout in the graphql url (XSS regression)', () => {
    const out = renderRespondentHostPage({
      graphqlUrl: '</script><script>alert(1)</script>',
      widgetBundleUrl: '/forms/widget/mj-form.js',
    });
    expect(out).not.toContain('</script><script>alert(1)');
    expect(out).toContain('&lt;/script&gt;&lt;script&gt;alert(1)');
  });

  it('uses only --mj-* design tokens for color (no hardcoded color outside fallbacks)', () => {
    const out = html();
    // Every color value must come through a var(--mj-*, fallback) — assert the tokens are present.
    expect(out).toContain('var(--mj-bg');
    expect(out).toContain('var(--mj-text');
    expect(out).toContain('var(--mj-error');
  });

  it('bakes in the GraphQL endpoint and the widget bundle url', () => {
    const out = renderRespondentHostPage({
      graphqlUrl: 'https://api.example.com/graphql',
      widgetBundleUrl: 'https://cdn.example.com/mj-form.js',
    });
    expect(out).toContain('https://api.example.com/graphql');
    expect(out).toContain('src="https://cdn.example.com/mj-form.js"');
  });

  it('escapes the bundle url to prevent attribute breakout', () => {
    const out = renderRespondentHostPage({
      graphqlUrl: 'http://x/',
      widgetBundleUrl: '"><script>alert(1)</script>',
    });
    expect(out).not.toContain('"><script>alert(1)');
    expect(out).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('bakes a server-redeemed token into an escaped data-token attribute', () => {
    const out = renderRespondentHostPage({
      graphqlUrl: 'http://localhost:4121/',
      widgetBundleUrl: '/forms/widget/mj-form.js',
      defaultSlug: 'customer-survey',
      token: 'header.payload.sig',
    });
    expect(out).toContain('data-token="header.payload.sig"');
    // The boot script reads it from the host element and prefers it over the URL token.
    expect(out).toContain("getAttribute('data-token')");
    expect(out).toContain("SERVER_TOKEN || readParam('token')");
  });

  it('omits the data-token attribute entirely when no token is supplied', () => {
    expect(html()).not.toContain('data-token=');
  });

  it('forwards the Turnstile site key to <mj-form> via an escaped data-* attribute', () => {
    const out = renderRespondentHostPage({
      graphqlUrl: 'http://localhost:4121/',
      widgetBundleUrl: '/forms/widget/mj-form.js',
      defaultSlug: 'customer-survey',
      turnstileSiteKey: '0x4AAAAAADuC2gEeDWckbQ5O',
    });
    expect(out).toContain('data-turnstile-site-key="0x4AAAAAADuC2gEeDWckbQ5O"');
    expect(out).toContain("getAttribute('data-turnstile-site-key')");
    expect(out).toContain("el.setAttribute('turnstile-site-key', TURNSTILE_SITE_KEY)");
  });

  it('omits the site-key attribute entirely when Turnstile is not configured', () => {
    expect(html()).not.toContain('data-turnstile-site-key=');
  });

  it('escapes a server-injected token to prevent attribute breakout (XSS regression)', () => {
    const out = renderRespondentHostPage({
      graphqlUrl: 'http://localhost:4121/',
      widgetBundleUrl: '/forms/widget/mj-form.js',
      token: '"><script>alert(1)</script>',
    });
    expect(out).not.toContain('"><script>alert(1)');
    expect(out).toContain('data-token="&quot;&gt;&lt;script&gt;');
  });
});

describe('renderRespondentHostErrorPage', () => {
  it('renders a shell-free, self-contained error page with the message', () => {
    const out = renderRespondentHostErrorPage({ message: 'This form was not found.' });
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('This form was not found.');
    expect(out).toContain('class="mjf-host__error"');
    expect(out).toContain('role="alert"');
    expect(out).not.toContain('<mj-form');
    expect(out).not.toContain('<script');
  });

  it('keeps the error page out of search indexes and uses --mj-* tokens', () => {
    const out = renderRespondentHostErrorPage({ message: 'closed' });
    expect(out).toContain('name="robots" content="noindex"');
    expect(out).toContain('var(--mj-error');
  });

  it('escapes an HTML-bearing error message (XSS regression)', () => {
    const out = renderRespondentHostErrorPage({ message: '<img src=x onerror=alert(1)>' });
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('escape helpers', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;');
  });
  it('escapes quotes for attributes', () => {
    expect(escapeAttr('a"b')).toBe('a&quot;b');
  });
});

describe('getRespondentHostConfig', () => {
  it('is enabled by default', () => {
    expect(getRespondentHostConfig().enabled).toBe(true);
  });

  it('can be disabled via env', () => {
    process.env.FORMS_RESPONDENT_HOST_ENABLED = 'false';
    resetRespondentHostConfigForTests();
    expect(getRespondentHostConfig().enabled).toBe(false);
  });

  it('derives the graphql url from MJAPI_PUBLIC_URL when not explicit', () => {
    process.env.MJAPI_PUBLIC_URL = 'http://localhost:4121';
    resetRespondentHostConfigForTests();
    expect(getRespondentHostConfig().graphqlUrl).toBe('http://localhost:4121');
  });

  it('honors an explicit FORMS_GRAPHQL_URL', () => {
    process.env.FORMS_GRAPHQL_URL = 'https://api.example.com/graphql';
    resetRespondentHostConfigForTests();
    expect(getRespondentHostConfig().graphqlUrl).toBe('https://api.example.com/graphql');
  });

  it('composes a non-root graphql path', () => {
    process.env.MJAPI_PUBLIC_URL = 'http://localhost:4121';
    process.env.GRAPHQL_ROOT_PATH = '/graphql';
    resetRespondentHostConfigForTests();
    expect(getRespondentHostConfig().graphqlUrl).toBe('http://localhost:4121/graphql');
  });

  it('defaults the widget bundle url', () => {
    expect(getRespondentHostConfig().widgetBundleUrl).toBe('/forms/widget/mj-form.js');
  });

  it('derives the magic-link redeem url from MJAPI_PUBLIC_URL with the fixed mount path', () => {
    process.env.MJAPI_PUBLIC_URL = 'https://forms.example.com';
    resetRespondentHostConfigForTests();
    expect(getRespondentHostConfig().magicLinkRedeemUrl).toBe('https://forms.example.com/magic-link/redeem');
  });

  it('defaults the redeem url to the local MJAPI origin', () => {
    expect(getRespondentHostConfig().magicLinkRedeemUrl).toBe('http://localhost:4121/magic-link/redeem');
  });

  it('honors an explicit FORMS_MAGICLINK_REDEEM_URL', () => {
    process.env.FORMS_MAGICLINK_REDEEM_URL = 'https://api.example.com/ml/redeem';
    resetRespondentHostConfigForTests();
    expect(getRespondentHostConfig().magicLinkRedeemUrl).toBe('https://api.example.com/ml/redeem');
  });
});
