#!/usr/bin/env node
/**
 * The one place a smoke script learns which server it is testing.
 *
 * Eight scripts each spelled `process.env.FORMS_SMOKE_URL || 'http://localhost:4121'` and one of
 * them did not: `resume-arc-path.mjs` hardcoded the default, so with FORMS_SMOKE_URL pointing at a
 * branch harness on :4131 it silently drove the server on :4121 — a different checkout — and would
 * have reported that code's behaviour as this branch's. Eight copies of a decision is eight chances
 * for one to drift; a helper is one. Stdlib-only, like its callers.
 */
import { smokeBaseUrl, inProcessHarness } from './target.mjs';

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

check('honours FORMS_SMOKE_URL', smokeBaseUrl({ FORMS_SMOKE_URL: 'http://localhost:4131' }) === 'http://localhost:4131');
check('strips a trailing slash so paths can be appended', smokeBaseUrl({ FORMS_SMOKE_URL: 'http://h:1/' }) === 'http://h:1');
check('defaults to the harness convention when unset', smokeBaseUrl({}) === 'http://localhost:4121');
check('treats a blank value as unset', smokeBaseUrl({ FORMS_SMOKE_URL: '   ' }) === 'http://localhost:4121');
check('reads process.env when given nothing', smokeBaseUrl() === (process.env.FORMS_SMOKE_URL?.trim() || 'http://localhost:4121').replace(/\/$/, ''));


// An IN-PROCESS smoke boots its own MJAPI. It must never take the port from GRAPHQL_PORT, because
// `dotenv/config` has already loaded .env's 4121 into process.env — the developer's own harness —
// so `GRAPHQL_PORT || 4141` resolves to 4121 and the smoke either collides with that server or,
// worse, quietly tests it. The public URL must follow the same port, or the /f/:slug page it
// serves redeems through whatever MJAPI_PUBLIC_URL names — which was, again, 4121.
const own = inProcessHarness(4141, { GRAPHQL_PORT: '4121', MJAPI_PUBLIC_URL: 'http://localhost:4121' });
check('an in-process smoke ignores GRAPHQL_PORT and uses its own default', own.port === '4141');
check('and its public URL follows its own port', own.base === 'http://localhost:4141');
check('FORMS_SMOKE_PORT overrides the default', inProcessHarness(4141, { FORMS_SMOKE_PORT: '4199' }).port === '4199');
check('a blank FORMS_SMOKE_PORT is unset', inProcessHarness(4151, { FORMS_SMOKE_PORT: ' ' }).port === '4151');

console.log(failures === 0 ? '\nPASS — every smoke script asks the same question and gets the same answer.' : `\nFAIL — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
