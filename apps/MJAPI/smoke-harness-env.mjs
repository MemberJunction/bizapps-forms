/**
 * Claim this process's port and public URL BEFORE `@memberjunction/server` reads them.
 *
 * Import this first — before `@memberjunction/server-bootstrap` — in any smoke that boots its own
 * MJAPI. Core reads `GRAPHQL_PORT` and `MJAPI_PUBLIC_URL` while its modules are being imported, so
 * a `process.env.X = …` written as an ordinary statement in the script body runs too late: with
 * nothing exported in the shell the server fell back to `mj.config.cjs`'s 4000 (MJ's host API,
 * already listening) and died with EADDRINUSE; with `.env` sourced it booted on the developer's own
 * 4121. ESM evaluates imports in source order, so a module whose top level assigns the environment
 * is the one place this can be done without a dynamic import.
 *
 * `FORMS_SMOKE_PORT` overrides the default for anyone running two of these at once.
 */
import { inProcessHarness } from '../../smoke/lib/target.mjs';

const harness = inProcessHarness(4141);
process.env.GRAPHQL_PORT = harness.port;
process.env.MJAPI_PUBLIC_URL = harness.base;

export const PORT = harness.port;
export const BASE = harness.base;
