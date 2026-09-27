/**
 * The MERGE that gives a role its fixture-minimum EntityPermission grants, without ever lowering
 * a grant the database already holds wider.
 *
 * `seed-binding-smoke.mjs` upserts `Forms Automation Runner`'s grants so the binding it seeds has
 * everything it needs to run, even against a database where the shipping migrations have not
 * (yet) applied. The MATCHED branch used to overwrite every flag with the fixture's value
 * unconditionally, which is backwards: the fixture knows its OWN minimum, not what a host has
 * chosen to grant beyond it. `V202608201200` ships CanUpdate=1 on `Form Response Answers` for
 * this exact role (`Forms: Analyze Written Responses` saves each free-text answer's Score back
 * onto the row it scored) -- but this fixture's list carried CanUpdate 0 for that same row, so
 * running the seed on ANY database silently revoked the shipped grant and broke every submit's
 * Analyze automation from that point on (#260 smoke finding S2, observed live on the throwaway
 * `MJ_I260_Repro` and on the shared `MJ_ATS_Dev`).
 *
 * So the MERGE now only RAISES a flag that is currently 0 where the fixture wants 1 -- it never
 * sets a flag to the fixture's value outright, and it never fires at all when the row already
 * grants everything the fixture asks for. The fixture establishes its own preconditions; the
 * migrations remain the authority on what a host grants beyond them.
 *
 * A pure string builder (no database, no `docker exec`) so the SQL shape is unit-testable --
 * see `grants.spec.mjs`, matching `sqlcmd.spec.mjs`'s `withSessionOptions` and `fixture.mjs`'s
 * `describeSeedWiringMismatch`.
 */

/** @typedef {{ entity: string, canCreate: 0|1, canRead: 0|1, canUpdate: 0|1 }} GrantRow */

/** Single-quote escaping for values interpolated into this module's SQL, matching fixture.mjs. */
function escape(value) {
  return String(value).replace(/'/g, "''");
}

/** A grant flag must be exactly 0 or 1 -- fail fast, naming which row and which column. */
function bit(value, entity, column) {
  if (value !== 0 && value !== 1) {
    throw new Error(
      `principalGrantMergeSql: ${column} for "${entity}" must be 0 or 1, got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * The self-contained SQL batch that raises `roleName`'s EntityPermission grants to at least
 * `rows`' values, for a role that already exists (the caller ships the role itself -- see
 * `seed-binding-smoke.mjs`'s service-principal block).
 *
 * Never lowers a flag: the MATCHED branch fires, and updates, only when some row's flag is 1
 * where the existing grant's is 0, and the SET clause OR-merges each flag with what is already
 * there rather than replacing it. A row naming an entity the database does not have is silently
 * skipped by the join, exactly as the previous upsert was -- a fixture pointed at an entity name
 * a database lacks has a different bug to report, not this one.
 *
 * @param {string} roleName
 * @param {GrantRow[]} rows
 * @returns {string}
 */
export function principalGrantMergeSql(roleName, rows) {
  if (!roleName || typeof roleName !== 'string') {
    throw new Error('principalGrantMergeSql requires a non-empty role name');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('principalGrantMergeSql requires at least one grant row');
  }

  const values = rows
    .map(({ entity, canCreate, canRead, canUpdate }) => {
      if (!entity || typeof entity !== 'string') {
        throw new Error(`principalGrantMergeSql: every row needs an entity name, got ${JSON.stringify(entity)}`);
      }
      return `  ('${escape(entity)}', ${bit(canCreate, entity, 'canCreate')}, ${bit(canRead, entity, 'canRead')}, ${bit(canUpdate, entity, 'canUpdate')})`;
    })
    .join(',\n');

  return `
DECLARE @RoleID UNIQUEIDENTIFIER = (SELECT ID FROM __mj.Role WHERE Name='${escape(roleName)}');
DECLARE @Entities TABLE (Name NVARCHAR(255), C BIT, R BIT, U BIT);
INSERT INTO @Entities VALUES
${values};

-- RAISES missing flags, never LOWERS an existing one: MATCHED fires only when some source flag
-- is 1 where the target's is 0, and the SET clause OR-merges each flag with what is already
-- there rather than overwriting it with the fixture's value. A fixture establishes ITS minimum
-- preconditions; it is not the authority on what a host grants beyond them, and the previous
-- unconditional overwrite silently revoked a shipped grant (#260 smoke finding S2).
MERGE __mj.EntityPermission AS tgt
USING (SELECT e.ID AS EntityID, x.C, x.R, x.U FROM @Entities x JOIN __mj.Entity e ON e.Name = x.Name) AS src
   ON tgt.EntityID = src.EntityID AND tgt.RoleID = @RoleID
WHEN MATCHED AND ((src.C = 1 AND tgt.CanCreate = 0) OR (src.R = 1 AND tgt.CanRead = 0) OR (src.U = 1 AND tgt.CanUpdate = 0))
  THEN UPDATE SET CanCreate = tgt.CanCreate | src.C, CanRead = tgt.CanRead | src.R, CanUpdate = tgt.CanUpdate | src.U
WHEN NOT MATCHED BY TARGET
  THEN INSERT (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
       VALUES (NEWID(), src.EntityID, @RoleID, src.C, src.R, src.U, 0);
`;
}

/**
 * The `Forms Automation Runner` role's fixture-minimum grants -- what `seed-binding-smoke.mjs`'s
 * binding needs to run, and nothing else. Exported so `grants.spec.mjs` can assert directly on
 * the list a real seed run sends, rather than on a copy that could drift from it.
 *
 * @type {GrantRow[]}
 */
export const AUTOMATION_RUNNER_GRANTS = [
  { entity: 'MJ_BizApps_Common: People', canCreate: 1, canRead: 1, canUpdate: 1 },
  { entity: 'MJ_BizApps_Forms: Form Responses', canCreate: 0, canRead: 1, canUpdate: 1 },
  // CanUpdate 1: shipped by V202608201200 so `Forms: Analyze Written Responses` can save each
  // free-text answer's Score/ScoreRationale back onto the row it scored. This carried 0 here,
  // which is the defect this module fixes (#260 smoke finding S2) -- kept at 1, and pinned by
  // `grants.spec.mjs`, so a regression to 0 fails the spec instead of silently shipping again.
  { entity: 'MJ_BizApps_Forms: Form Response Answers', canCreate: 0, canRead: 1, canUpdate: 1 },
  { entity: 'MJ_BizApps_Forms: Form Questions', canCreate: 0, canRead: 1, canUpdate: 0 },
  { entity: 'MJ_BizApps_Forms: Forms', canCreate: 0, canRead: 1, canUpdate: 0 },
  { entity: 'MJ_BizApps_Forms: Form Automations', canCreate: 0, canRead: 1, canUpdate: 0 },
  { entity: 'MJ_BizApps_Forms: Form Entity Bindings', canCreate: 0, canRead: 1, canUpdate: 0 },
  { entity: 'MJ_BizApps_Forms: Form Automation Runs', canCreate: 1, canRead: 1, canUpdate: 1 },
  { entity: 'MJ_BizApps_Forms: Form Entity Binding Records', canCreate: 1, canRead: 1, canUpdate: 1 },
  // Read-only: bind-time provenance verification (filesAreVerified -> loadUploadLedger) runs a
  // RunView over the upload ledger under this principal. Without it the lookup throws, the check
  // fails closed, and every file-answer binding reports "provenance cannot be verified" (#49).
  // Never grant create here: a runner that can mint ledger rows can vouch for arbitrary files.
  //
  // THIS ROW MASKS THE MIGRATION THAT SHIPS IT (V202608181030). Because the MERGE upserts it, no
  // smoke run can detect the shipped grant being absent or regressed -- the fixture supplies what
  // is under test. It stays because this file's stated job is to establish its own preconditions
  // rather than hope they hold, and a fixture that depends on migration order fails for the wrong
  // reason on a dev database. The consequence is worth naming: the evidence that the SHIPPED
  // grant works is the migration's own postconditions, not this smoke.
  { entity: 'MJ_BizApps_Forms: Form Uploads', canCreate: 0, canRead: 1, canUpdate: 0 },
];
