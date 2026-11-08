/**
 * Redeem a share link's public host page the way a browser does, and hand back its session token.
 *
 * One helper because ten suites each carried their own `html.match(/data-token=…/)` and their own
 * wording for "there was none" — and none of them looked at the status first. The host page's redeem
 * limiter is keyed on the caller's network address, so back-to-back smoke runs answer the second one
 * with a 429, and every suite reported that as "no anonymous session token": a rate limit that read
 * like a broken fixture. Reading the status before the token is what lets the failure name its cause.
 *
 * Stdlib-only, like everything under smoke/lib. `options.fetch` exists so the spec needs no server;
 * `options.headers` lets the device-resume suite present its cookie.
 */

/** The text of the first `<p>`, where the host page explains a 409 or a 503. */
function firstParagraph(html) {
  const text = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  return text ? text.replace(/<[^>]+>/g, '').trim() : '(no <p> in the page)';
}

/**
 * Fetch `/f/<slug>` and return `{ token, html }`. Throws, with the cause named, on a rate limit,
 * on any other non-200, and on a 200 that carries no `data-token`.
 */
export async function redeemHostPage(base, slug, { headers = {}, fetch: fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`${base}/f/${slug}`, { headers });
  const html = await res.text();
  if (res.status === 429) {
    const wait = res.headers.get('retry-after') ?? 'unknown';
    throw new Error(`redeem was rate-limited (HTTP 429), retry after ${wait} s`);
  }
  if (res.status !== 200) {
    throw new Error(`GET /f/${slug} returned ${res.status}: ${firstParagraph(html)}`);
  }
  const token = html.match(/data-token="([^"]+)"/)?.[1];
  if (!token) {
    throw new Error('the host page carried no anonymous session token');
  }
  return { token, html };
}
