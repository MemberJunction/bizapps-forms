/**
 * The public respondent host page (TASK 2).
 *
 * A self-contained, shell-free HTML page that hosts the `<mj-form>` custom element for
 * an ANONYMOUS internet respondent — explicitly NOT the Explorer shell (no login, no MJ
 * global provider). It reads the distribution `slug` and the anonymous bearer `token`
 * from the URL (query string OR `#fragment`), then mounts `<mj-form>` with those plus the
 * GraphQL endpoint, so the widget loads the published form and submits via seam S1.
 *
 * WHY the token may arrive in the fragment: MJ core's magic-link redeem 302s to its
 * landing target with the session JWT in the URL `#fragment` (so the token never reaches
 * a server / proxy log). This page therefore reads `#token=` first, falling back to the
 * `?token=` query for manual testing and embeds.
 *
 * The page is intentionally a string template (no build step, no framework) so it can be
 * served by a tiny Express route. All colors are `--mj-*` design tokens with safe
 * fallbacks, and it is mobile-first per FORMS_BUILD_PLAN §2.
 */

/** Inputs the host page needs baked in at serve time (everything else is read client-side). */
export interface RespondentHostPageOptions {
  /** Absolute URL of the MJAPI GraphQL endpoint the widget submits to. */
  graphqlUrl: string;
  /**
   * URL of the built `<mj-form>` custom-element bundle (the IIFE that calls
   * `registerMjFormElement()`). The element is registered by this script tag.
   */
  widgetBundleUrl: string;
  /** Optional page title shown in the browser tab before the form name loads. */
  pageTitle?: string;
  /**
   * Distribution slug from the route path (`/f/:slug`), baked in as the default. The page
   * still also reads a `?slug=` query param, so this may be empty for direct `?slug=` use.
   */
  defaultSlug?: string;
  /**
   * The anonymous session JWT, redeemed SERVER-SIDE by the route (see {@link redeemSlugToToken}).
   * Baked into a `data-token` attribute so `<mj-form>` receives it without the token ever being
   * in the URL or interpolated into an inline script. When present it takes precedence over any
   * `#fragment` / `?token=` value (which remain for manual testing / embeds).
   */
  token?: string;
  /**
   * Public Cloudflare Turnstile site key. Baked into a `data-turnstile-site-key` attribute and
   * forwarded to `<mj-form turnstile-site-key=…>` so captcha-required forms render the challenge.
   * Omitted when unconfigured (the widget then shows its config-gap message on a captcha-on form).
   */
  turnstileSiteKey?: string;
}

/**
 * Render the respondent host page HTML. Pure: given the same options it returns the same
 * string, so it is trivially unit-testable.
 */
export function renderRespondentHostPage(options: RespondentHostPageOptions): string {
  const title = escapeHtml(options.pageTitle ?? 'Form');
  // The slug (and graphql url) reach the boot script via HTML-escaped data-* attributes,
  // NOT by interpolation into the inline <script>. The slug comes from the URL path
  // (attacker-controlled); routing it through escapeAttr — and reading it with
  // dataset.* at runtime — removes the inline-script-injection (`</script>`) surface
  // entirely. The bundle src is likewise attribute-escaped.
  const graphqlUrl = escapeAttr(options.graphqlUrl);
  const bundleUrl = escapeAttr(options.widgetBundleUrl);
  const defaultSlug = escapeAttr(options.defaultSlug ?? '');
  // The server-redeemed JWT reaches the boot script the same XSS-safe way as everything else:
  // an HTML-escaped data-* attribute read with dataset.* at runtime — never spliced into the
  // inline <script>. Emit the attribute only when a token was redeemed.
  const tokenAttr = options.token ? ` data-token="${escapeAttr(options.token)}"` : '';
  // Public site key (safe to expose); routed through an escaped data-* attr like everything else.
  const siteKeyAttr = options.turnstileSiteKey
    ? ` data-turnstile-site-key="${escapeAttr(options.turnstileSiteKey)}"`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
  <main
    class="mjf-host"
    id="mjf-host"
    data-graphql-url="${graphqlUrl}"
    data-default-slug="${defaultSlug}"${tokenAttr}${siteKeyAttr}
  >
    <div class="mjf-host__loading" role="status" aria-live="polite">Loading…</div>
  </main>
  <script>${BOOT_SCRIPT}</script>
  <script src="${bundleUrl}" defer onerror="window.__mjFormBundleError && window.__mjFormBundleError()"></script>
</body>
</html>`;
}

/** A respondent-facing error to render in place of the form (server-side redeem failed, etc.). */
export interface RespondentHostErrorOptions {
  /** Human-readable message shown to the respondent. Plain text — HTML-escaped at render time. */
  message: string;
  /** Optional page title shown in the browser tab. */
  pageTitle?: string;
}

/**
 * Render a friendly, shell-free error page reusing the host page's styling. Static (no boot
 * script, no bundle) so it cannot itself fail to load. Pure: same options → same string.
 */
export function renderRespondentHostErrorPage(options: RespondentHostErrorOptions): string {
  const title = escapeHtml(options.pageTitle ?? 'Form unavailable');
  const message = escapeHtml(options.message);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
  <main class="mjf-host">
    <p class="mjf-host__error" role="alert">${message}</p>
  </main>
</body>
</html>`;
}

/** Page-level CSS. Semantic `--mj-*` tokens with fallbacks so it works with or without a theme. */
const PAGE_CSS = `
:root {
  color-scheme: light dark;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
}
body {
  background: var(--mj-bg, #f6f7f9);
  color: var(--mj-text, #1a1a1a);
  font-family: var(--mj-font-body, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  -webkit-text-size-adjust: 100%;
}
/* The host is full-bleed: the mounted form element paints the FormStyle page background
   (--mjf-page-bg via its :host) across the whole viewport and centers its own content
   internally (.mjf-shell max-width), so there's no unthemed white gutter around a themed
   (e.g. dark) form. The narrow-column loading/error states get their own centered padding. */
.mjf-host {
  display: block;
  width: 100%;
  min-height: 100vh;
}
.mjf-host__loading,
.mjf-host__error {
  max-width: 44rem;
  margin: 0 auto;
  padding: clamp(1.5rem, 5vw, 3rem) clamp(1rem, 4vw, 2rem);
  font-size: 1.0625rem;
  line-height: 1.5;
}
.mjf-host__error {
  color: var(--mj-error, #b3261e);
}
mj-form {
  display: block;
  width: 100%;
  min-height: 100vh;
}
`;

/**
 * The boot script: read config from `#mjf-host` data-* attributes, parse slug + token,
 * surface clear errors, and create `<mj-form>` once the bundle has registered the element.
 *
 * It is a STATIC string with no interpolation — all per-request values arrive via HTML
 * data-* attributes (escaped by {@link escapeAttr} at render time), so nothing
 * attacker-controlled is ever spliced into this `<script>` block. Inlined so the page is
 * fully self-contained.
 */
const BOOT_SCRIPT = `
(function () {
  var host = document.getElementById('mjf-host');
  var GRAPHQL_URL = host.getAttribute('data-graphql-url') || '';
  var DEFAULT_SLUG = host.getAttribute('data-default-slug') || '';
  // Server-redeemed anonymous session JWT (see redeem.service). When present it WINS over any
  // URL-supplied token, so the respondent never has to carry a raw token in the link.
  var SERVER_TOKEN = host.getAttribute('data-token') || '';
  var TURNSTILE_SITE_KEY = host.getAttribute('data-turnstile-site-key') || '';

  function showError(msg) {
    host.innerHTML = '';
    var p = document.createElement('p');
    p.className = 'mjf-host__error';
    p.setAttribute('role', 'alert');
    p.textContent = msg;
    host.appendChild(p);
  }

  // Read a param from BOTH the query string and the URL fragment. The magic-link redeem
  // puts the session JWT in the fragment (#token=...); manual/embed use puts it in ?query.
  function readParam(name) {
    var q = new URLSearchParams(window.location.search);
    if (q.get(name)) { return q.get(name); }
    var hash = window.location.hash.replace(/^#/, '');
    var f = new URLSearchParams(hash);
    return f.get(name);
  }

  // Slug: the path-supplied default (/f/:slug) wins; ?slug= is a direct-test fallback.
  var slug = DEFAULT_SLUG || readParam('slug');
  // Token: the server-redeemed JWT wins; #fragment / ?token= remain a manual-testing fallback.
  var token = SERVER_TOKEN || readParam('token');

  if (!slug) {
    showError('This form link is missing its form reference. Please check the link and try again.');
    return;
  }

  window.__mjFormBundleError = function () {
    showError('Could not load the form. Please refresh the page or try again later.');
  };

  function mount() {
    host.innerHTML = '';
    var el = document.createElement('mj-form');
    el.setAttribute('slug', slug);
    el.setAttribute('api-url', GRAPHQL_URL);
    if (token) { el.setAttribute('token', token); }
    if (TURNSTILE_SITE_KEY) { el.setAttribute('turnstile-site-key', TURNSTILE_SITE_KEY); }
    host.appendChild(el);
  }

  // The bundle registers <mj-form>. Wait for the custom element to be defined, then mount.
  if (window.customElements && customElements.whenDefined) {
    customElements.whenDefined('mj-form').then(mount);
    // Safety timeout: if the element never registers (bundle missing/old), show an error.
    setTimeout(function () {
      if (!customElements.get('mj-form')) { window.__mjFormBundleError(); }
    }, 10000);
  } else {
    showError('Your browser does not support this form. Please use a modern browser.');
  }
})();
`;

/** Escape a string for safe insertion into HTML text content. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape a string for safe insertion into a double-quoted HTML attribute. */
export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
