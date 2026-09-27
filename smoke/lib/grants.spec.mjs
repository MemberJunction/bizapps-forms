#!/usr/bin/env node
/**
 * Proves the binding seed's grant MERGE only ever RAISES a flag, never lowers one.
 *
 * `seed-binding-smoke.mjs` upserts `Forms Automation Runner`'s EntityPermission rows so its
 * binding has everything it needs. The MATCHED branch used to overwrite CanCreate/CanRead/
 * CanUpdate with the fixture's own value unconditionally -- and the fixture's list carried
 * CanUpdate 0 for `Form Response Answers`, while `V202608201200` ships CanUpdate 1 for that exact
 * role/entity so `Forms: Analyze Written Responses` can save scores back onto answers. Running the
 * seed on ANY database silently revoked the shipped grant and broke every submit's Analyze
 * automation from that point on (#260 smoke finding S2, observed live on `MJ_I260_Repro` and on
 * the shared `MJ_ATS_Dev`).
 *
 * `principalGrantMergeSql` is a pure string builder (no database), so its SQL shape is testable
 * without one -- matching `sqlcmd.spec.mjs`'s `withSessionOptions` and `fixture.mjs`'s
 * `describeSeedWiringMismatch`. This spec is plain Node, run directly:
 *   node smoke/lib/grants.spec.mjs
 */
import { principalGrantMergeSql, AUTOMATION_RUNNER_GRANTS } from './grants.mjs';

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

console.log('principalGrantMergeSql');

const oneRowSql = principalGrantMergeSql('Some Role', [
  { entity: 'Some Entity', canCreate: 1, canRead: 1, canUpdate: 1 },
]);

// --- (a) never sets a flag to the source value unconditionally -- it OR-merges each flag --------

check(
  'OR-merges CanCreate with the existing value rather than overwriting it',
  oneRowSql.includes('CanCreate = tgt.CanCreate | src.C'),
  oneRowSql,
);
check(
  'OR-merges CanRead with the existing value rather than overwriting it',
  oneRowSql.includes('CanRead = tgt.CanRead | src.R'),
  oneRowSql,
);
check(
  'OR-merges CanUpdate with the existing value rather than overwriting it',
  oneRowSql.includes('CanUpdate = tgt.CanUpdate | src.U'),
  oneRowSql,
);
check(
  'never contains the old unconditional overwrite shape',
  !/SET\s+CanCreate\s*=\s*src\.C\s*,\s*CanRead\s*=\s*src\.R\s*,\s*CanUpdate\s*=\s*src\.U/.test(oneRowSql),
  'the MATCHED SET clause must read from tgt as well as src, or a wider shipped grant gets ' +
    `overwritten again: ${oneRowSql}`,
);

// --- (b) only matches when a source flag would raise a target flag -------------------------------

check(
  'the MATCHED guard only fires when CanCreate would rise',
  oneRowSql.includes('(src.C = 1 AND tgt.CanCreate = 0)'),
  oneRowSql,
);
check(
  'the MATCHED guard only fires when CanRead would rise',
  oneRowSql.includes('(src.R = 1 AND tgt.CanRead = 0)'),
  oneRowSql,
);
check(
  'the MATCHED guard only fires when CanUpdate would rise',
  oneRowSql.includes('(src.U = 1 AND tgt.CanUpdate = 0)'),
  oneRowSql,
);
check(
  'the WHEN MATCHED clause carries the raise-only guard, not an unconditional one',
  /WHEN MATCHED AND \(/.test(oneRowSql),
  oneRowSql,
);

// --- (c) inserts missing rows with CanDelete 0 ----------------------------------------------------

check(
  'the NOT MATCHED branch inserts CanDelete 0',
  /WHEN NOT MATCHED BY TARGET\s*\n\s*THEN INSERT \(ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete\)\s*\n\s*VALUES \(NEWID\(\), src\.EntityID, @RoleID, src\.C, src\.R, src\.U, 0\)/.test(
    oneRowSql,
  ),
  oneRowSql,
);

// --- (d) quotes/escapes the role name -------------------------------------------------------------

const escapedRoleSql = principalGrantMergeSql("O'Brien's Role", [
  { entity: 'Some Entity', canCreate: 1, canRead: 0, canUpdate: 0 },
]);
check(
  'escapes a single quote in the role name',
  escapedRoleSql.includes("Name='O''Brien''s Role'"),
  escapedRoleSql,
);
check(
  'escapes a single quote in an entity name',
  principalGrantMergeSql('Some Role', [{ entity: "Trader's Desk", canCreate: 0, canRead: 1, canUpdate: 0 }]).includes(
    "('Trader''s Desk'",
  ),
);

// --- guard clauses: fail fast on bad input --------------------------------------------------------

check(
  'throws on a missing role name',
  (() => {
    try {
      principalGrantMergeSql('', [{ entity: 'X', canCreate: 0, canRead: 1, canUpdate: 0 }]);
      return false;
    } catch (err) {
      return /role name/.test(err.message);
    }
  })(),
);
check(
  'throws on an empty row list',
  (() => {
    try {
      principalGrantMergeSql('Some Role', []);
      return false;
    } catch (err) {
      return /grant row/.test(err.message);
    }
  })(),
);
check(
  'throws on a non-bit flag value',
  (() => {
    try {
      principalGrantMergeSql('Some Role', [{ entity: 'X', canCreate: 2, canRead: 1, canUpdate: 0 }]);
      return false;
    } catch (err) {
      return /canCreate/.test(err.message) && /"X"/.test(err.message);
    }
  })(),
);
check(
  'throws on a row with no entity name',
  (() => {
    try {
      principalGrantMergeSql('Some Role', [{ entity: '', canCreate: 0, canRead: 1, canUpdate: 0 }]);
      return false;
    } catch (err) {
      return /entity name/.test(err.message);
    }
  })(),
);

// --- the seed's own grant list must carry the shipped V202608201200 grant ------------------------

console.log('\nAUTOMATION_RUNNER_GRANTS');

const answers = AUTOMATION_RUNNER_GRANTS.find((r) => r.entity === 'MJ_BizApps_Forms: Form Response Answers');
check(
  'grants CanUpdate on Form Response Answers, matching V202608201200',
  answers?.canUpdate === 1,
  `found ${JSON.stringify(answers)} — Forms: Analyze Written Responses saves scores back onto ` +
    'answers and needs this grant; a 0 here silently revokes the shipped migration (#260 S2)',
);
check('and still grants CanRead there (the row must be read before it can be scored)', answers?.canRead === 1);
check('and does NOT grant CanCreate there (the runner scores answers, it never creates them)', answers?.canCreate === 0);

console.log(
  failures === 0
    ? '\nPASS — the MERGE only raises flags, quotes what it interpolates, and the seed asks for the shipped grant.'
    : `\nFAIL — ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
