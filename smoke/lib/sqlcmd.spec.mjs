#!/usr/bin/env node
/**
 * Proves every batch these scripts send sets `QUOTED_IDENTIFIER ON`.
 *
 * `sqlcmd` is the one client in this workspace that defaults the option OFF — every driver the
 * shipped code uses (tedious, and therefore MJ's `RunView`/`Save`) defaults it ON. That difference
 * was invisible until `V202608272250` added `UQ_FormVersion_OnePublishedPerForm`, a FILTERED index:
 * SQL Server refuses INSERT/UPDATE/DELETE against a table carrying one unless the session has
 * `QUOTED_IDENTIFIER ON`, with `Msg 1934`. So the migration landed, the product kept working, and
 * three smoke scripts that patch `FormVersion.DefinitionSnapshot` through sqlcmd started failing —
 * `seed-binding-smoke` among them, which silently took `smoke:file-links`' binding leg down with it
 * because its fixture was never seeded.
 *
 * The regression this guards is therefore not "someone deletes a SET statement". It is a NEW
 * filtered index, on any Forms table, arriving months from now and breaking writes in a harness
 * nobody was thinking about — so the option belongs on every batch unconditionally rather than on
 * the statements known to need it today.
 *
 * The decision is a pure function so it can be tested without a database, matching
 * `fixture.spec.mjs` and `scripts/check-migration-order.spec.mjs`: stdlib-only, no install needed.
 */
import { withSessionOptions } from './sqlcmd.mjs';

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

console.log('withSessionOptions');

{
  const batch = withSessionOptions('SELECT 1');
  check(
    'sets QUOTED_IDENTIFIER ON before the caller\'s statement',
    /^\s*SET QUOTED_IDENTIFIER ON;/.test(batch),
    `got: ${batch}`,
  );
}

{
  // The option has to be SET, not merely mentioned — a batch that ends up with the statement after
  // the DML it is supposed to enable would still contain the string and still fail with Msg 1934.
  const batch = withSessionOptions('UPDATE __mj_BizAppsForms.FormVersion SET DefinitionSnapshot=@S WHERE ID=@V');
  check(
    'the option precedes the statement it enables',
    batch.indexOf('SET QUOTED_IDENTIFIER ON') < batch.indexOf('UPDATE'),
    `got: ${batch}`,
  );
}

{
  const query = "SELECT Slug FROM __mj_BizAppsForms.FormDistribution WHERE Status='Active'";
  check(
    'passes the caller\'s query through verbatim',
    withSessionOptions(query).includes(query),
    `got: ${withSessionOptions(query)}`,
  );
}

{
  // `sql()` prefixes `SET NOCOUNT ON` itself; wrapping must not disturb a batch that already
  // carries session options of its own.
  const batch = withSessionOptions('SET NOCOUNT ON; SELECT 1');
  check(
    'composes with a batch that already sets its own options',
    /^\s*SET QUOTED_IDENTIFIER ON;/.test(batch) && batch.includes('SET NOCOUNT ON; SELECT 1'),
    `got: ${batch}`,
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
