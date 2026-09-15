/**
 * Which server a smoke script is testing.
 *
 * `FORMS_SMOKE_URL`, else the harness convention `http://localhost:4121`, with any trailing slash
 * removed so callers can append a path. One helper rather than a line in each script: eight scripts
 * carried the same expression and one had drifted to a hardcoded default, so with the variable
 * pointing at a branch harness it silently tested a different checkout's server and would have
 * reported that code's behaviour as this branch's. Stdlib-only, like everything under smoke/lib.
 */
export const DEFAULT_SMOKE_URL = 'http://localhost:4121';

export function smokeBaseUrl(env = process.env) {
  const configured = env.FORMS_SMOKE_URL?.trim();
  return (configured || DEFAULT_SMOKE_URL).replace(/\/$/, '');
}

/**
 * Where an IN-PROCESS smoke boots its own MJAPI: `FORMS_SMOKE_PORT`, else `fallbackPort`.
 *
 * Deliberately NOT `GRAPHQL_PORT`. These scripts `import 'dotenv/config'`, which loads `.env`'s
 * `GRAPHQL_PORT=4121` — the developer's own harness — into `process.env` before any of their code
 * runs, so `GRAPHQL_PORT || 4141` resolved to 4121 and the smoke either failed to bind or, given a
 * stopped harness, quietly booted on the port everything else expects. The public URL follows the
 * same port: the `/f/:slug` page the smoke serves redeems through `MJAPI_PUBLIC_URL`, and with the
 * `.env` value that leg silently ran against 4121 while every direct assertion ran against the
 * smoke's own server. Callers assign both onto `process.env` before `createMJServer`.
 */
export function inProcessHarness(fallbackPort, env = process.env) {
  const port = env.FORMS_SMOKE_PORT?.trim() || String(fallbackPort);
  return { port, base: `http://localhost:${port}` };
}
