#!/usr/bin/env node
/**
 * `redeemHostPage` must say WHY a smoke suite got no session (F8).
 *
 * Back-to-back smoke runs share one network address, so the host page's redeem limiter answers the
 * second run with a 429 — and every suite used to report that as "no anonymous session token",
 * which sends the reader hunting for a broken fixture. The three outcomes are pinned here, with a
 * fake fetch and no server:
 *
 *   - 429 names the rate limit and the `Retry-After` seconds;
 *   - any other non-200 carries its status and the page's first <p>, which is where the host
 *     explains a 409 (no published version) or a 503 (link not open yet);
 *   - a 200 with no `data-token` says the page carried no token.
 *
 * Stdlib-only, like everything under smoke/lib.
 */
import { redeemHostPage } from './host-page.mjs';

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

/** Run `redeemHostPage` against a canned response; resolve to the value or the thrown message. */
async function outcome(status, body, headers = {}) {
  let seenUrl;
  const fakeFetch = async (url) => {
    seenUrl = url;
    return new Response(body, { status, headers });
  };
  try {
    return { value: await redeemHostPage('http://smoke.test', 'my-slug', { fetch: fakeFetch }), seenUrl };
  } catch (err) {
    return { error: err.message, seenUrl };
  }
}

const limited = await outcome(429, '<p>Too many attempts from this network.</p>', { 'Retry-After': '42' });
check('a 429 names the rate limit', limited.error?.includes('redeem was rate-limited (HTTP 429)'), limited.error);
check('and the Retry-After seconds', limited.error?.includes('retry after 42 s'), limited.error);

const unlimited = await outcome(429, '<p>x</p>');
check(
  'a 429 without Retry-After still says so',
  unlimited.error?.includes('rate-limited (HTTP 429)') && unlimited.error.includes('unknown'),
  unlimited.error,
);

const conflict = await outcome(409, '<html><body><h1>Oops</h1><p>This form has no published version.</p></body></html>');
check('another non-200 carries its status', conflict.error?.includes('409'), conflict.error);
check('and the first <p> of the page', conflict.error?.includes('This form has no published version.'), conflict.error);

const bare = await outcome(503, 'no markup');
check('a non-200 with no <p> still throws with its status', bare.error?.includes('503'), bare.error);

const ok = await outcome(200, '<div id="f" data-token="abc.def.ghi"></div>');
check('a 200 with a token returns it', ok.value?.token === 'abc.def.ghi', JSON.stringify(ok));
check('and the page html', ok.value?.html.includes('data-token'), JSON.stringify(ok));
check('from /f/<slug> on the given base', ok.seenUrl === 'http://smoke.test/f/my-slug', ok.seenUrl);

const tokenless = await outcome(200, '<div id="f"></div>');
check(
  'a 200 without a token says the page carried none',
  tokenless.error === 'the host page carried no anonymous session token',
  tokenless.error,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nhost-page ok');
